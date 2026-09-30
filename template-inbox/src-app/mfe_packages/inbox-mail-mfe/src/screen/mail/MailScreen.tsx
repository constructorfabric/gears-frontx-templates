import { useEffect, useMemo, useState } from 'react';
import { MailIcon } from 'lucide-react';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@gears-frontx/ui-kit';
import { useApiMutation, useApiQuery } from '@inbox-shared/api/queries';
import type { Translate } from '@inbox-shared/i18n/translate';
import { cx } from '@inbox-shared/ui/cx';
import { firstPaintOf, LoadErrorPane, LoadingPane } from '@inbox-shared/ui/QueryStates';
import { useAutoSelect } from '@inbox-shared/ui/useAutoSelect';
import { useScreenLayout } from '@inbox-shared/ui/screenLayout';
import { useSidebarToggle } from '@inbox-shared/ui/useSidebarToggle';
import sharedStyles from '@inbox-shared/ui/shared.module.css';
import type { Mail, MailboxId, SendMailRequest, SendMailResponse } from '../../api/mailTypes';
import { getMailApi } from '../../api/registerMailApi';
import { MailboxSidebar, type ComposedMail } from './MailboxSidebar';
import { MailList } from './MailList';
import { MailReadingPane } from './MailReadingPane';
import { selectMails } from './mailSelectors';
import { mailActions, mailStore, useMail } from './mailStore';

export type MailScreenProps = {
  t: Translate;
};

/**
 * The mail section's top-level orchestration - the same shape as
 * `ChatScreen`: three panes side by side, what is selected and typed kept in
 * `mailStore` so it survives leaving the section, and the API's own
 * collections filtered client-side for everything the panes show. Nothing
 * here is fetched per mailbox or per mail; the mock API answers with the
 * whole collection, same as the chat domain, and `mailSelectors.ts` is what
 * narrows it. A reply and a composed mail go out through the service's one
 * write, which files them under Sent.
 */
export function MailScreen({ t }: MailScreenProps) {
  const service = getMailApi();

  const mailboxesQuery = useApiQuery(service.getMailboxes);
  const mailsQuery = useApiQuery(service.getMails);
  const mailMessagesQuery = useApiQuery(service.getMailMessages);

  const mailboxId = useMail((state) => state.mailboxId);
  // The open mail is the screen's own state while it is mounted, written back
  // to the store with the pick still owed - the same arrangement as the chat.
  const [selectedMailId, setSelectedMailId] = useState(() => mailStore.get().selectedMailId);
  const search = useMail((state) => state.search);
  const tab = useMail((state) => state.tab);
  const historyOpenById = useMail((state) => state.historyOpenById);
  const drafts = useMail((state) => state.drafts);
  // Mail sent while this screen is mounted, folded over the fetched list the
  // way the chat folds a posted reply over its transcript: the write
  // invalidates the list, so the next mount reads it back from the service.
  const [sentMails, setSentMails] = useState<readonly Mail[]>([]);

  const sendMail = useApiMutation<SendMailResponse, SendMailRequest>({
    endpoint: service.sendMail,
    invalidates: [service.getMails],
    // The draft lives in the store, so it is cleared even when the user left
    // the screen before the send came back.
    afterSuccess: (_response, request) => {
      if (request.inReplyTo !== null) mailActions.clearDraftIfSent(request.inReplyTo, request.body);
    },
    onSuccess: (response) => setSentMails((previous) => [...previous, response.mail]),
  });

  const mailboxesSidebar = useSidebarToggle();
  const isSinglePane = useScreenLayout() === 'single';

  const mailboxes = mailboxesQuery.data?.mailboxes ?? [];
  const mails = useMemo(() => {
    const fetched = mailsQuery.data?.mails ?? [];
    const fetchedIds = new Set(fetched.map((mail) => mail.id));
    return [...fetched, ...sentMails.filter((mail) => !fetchedIds.has(mail.id))];
  }, [mailsQuery.data, sentMails]);
  const mailMessages = useMemo(
    () => mailMessagesQuery.data?.mailMessages ?? [],
    [mailMessagesQuery.data]
  );

  const autoSelect = useAutoSelect({
    scope: mailboxId,
    settled: !mailsQuery.isLoading,
    firstId: selectMails(mails, mailboxId, tab, search)[0]?.id,
    selectedId: selectedMailId,
    onSelect: setSelectedMailId,
    initialOwedTo: mailStore.get().autoSelectOwedTo,
  });
  useEffect(
    () => mailActions.rememberSelection(selectedMailId, autoSelect.owedTo),
    [selectedMailId, autoSelect.owedTo]
  );

  const selected = mails.find((mail) => mail.id === selectedMailId) ?? null;

  const history = useMemo(() => {
    if (!selected) return [];
    return mailMessages.filter((message) => message.mailId === selected.id);
  }, [mailMessages, selected]);

  const selectMailbox = (nextMailboxId: MailboxId) => {
    mailActions.selectMailbox(nextMailboxId);
    setSelectedMailId(null);
    autoSelect.arm(nextMailboxId);
  };

  const firstPaint = firstPaintOf([mailboxesQuery, mailsQuery, mailMessagesQuery]);
  if (firstPaint.failed) return <LoadErrorPane onRetry={firstPaint.retry} t={t} />;
  if (firstPaint.loading) return <LoadingPane />;

  const mailboxLabel = mailboxes.find((mailbox) => mailbox.id === mailboxId)?.label ?? '';
  const showReading = selected !== null;

  /**
   * A reply goes out addressed to the correspondent and titled after the mail
   * it answers; the service files it under Sent, and the draft is cleared once
   * it did. The draft stays until then, so while a send is in flight a second
   * Send (or the shortcut) would file the same reply twice: it waits instead.
   */
  const sendReply = () => {
    if (!selected || sendMail.isPending) return;
    const body = (drafts[selected.id] ?? '').trim();
    if (body === '') return;
    sendMail.mutate({
      correspondentName: selected.correspondentName,
      correspondentEmail: selected.correspondentEmail,
      subject: t('reply_subject', { subject: selected.subject }),
      body,
      inReplyTo: selected.id,
    });
  };

  /**
   * A composed mail goes out the same way, to the address typed. Mailbox
   * selection is left alone; the compose dialog itself already closed on
   * submit (`MailboxSidebar`'s own `onOpenChange`).
   */
  const composeMail = ({ to, subject, body }: ComposedMail) => {
    sendMail.mutate({ correspondentName: to, correspondentEmail: to, subject, body, inReplyTo: null });
  };

  return (
    <>
      <MailboxSidebar
        mailboxes={mailboxes}
        mails={mails}
        selectedMailboxId={mailboxId}
        onSelectMailbox={(nextMailboxId) => {
          selectMailbox(nextMailboxId);
          mailboxesSidebar.dismiss();
        }}
        onComposeMail={composeMail}
        column={mailboxesSidebar}
        t={t}
      />

      <MailList
        mails={mails}
        mailboxId={mailboxId}
        mailboxLabel={mailboxLabel}
        tab={tab}
        onTabChange={mailActions.setTab}
        selectedMailId={selectedMailId}
        onSelectMail={setSelectedMailId}
        search={search}
        onSearchChange={mailActions.setSearch}
        hidden={isSinglePane && showReading}
        onToggleMailboxes={mailboxesSidebar.toggle}
        mailboxesOpen={!mailboxesSidebar.collapsed}
        t={t}
      />

      <div className={cx(sharedStyles.detailPane, isSinglePane && !showReading && sharedStyles.singlePaneHidden)}>
        {selected ? (
          <MailReadingPane
            mail={selected}
            history={history}
            historyOpen={historyOpenById[selected.id] ?? false}
            onToggleHistory={() => mailActions.toggleHistory(selected.id)}
            draft={drafts[selected.id] ?? ''}
            onDraftChange={(draft) => mailActions.setDraft(selected.id, draft)}
            onSend={sendReply}
            sending={sendMail.isPending}
            onBack={isSinglePane ? () => setSelectedMailId(null) : null}
            t={t}
          />
        ) : (
          <div className={sharedStyles.emptyPane}>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MailIcon />
                </EmptyMedia>
                <EmptyTitle>{t('no_mail_selected_title')}</EmptyTitle>
                <EmptyDescription>{t('no_mail_selected_description')}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        )}
      </div>
    </>
  );
}
