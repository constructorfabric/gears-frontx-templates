import { useEffect, useMemo, useState } from 'react';
import { MailIcon } from 'lucide-react';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@gears-frontx/ui-kit';
import { MAILBOX_SENT } from '../../api/constants';
import type { Mail, MailboxId } from '../../api/mailTypes';
import { useApiQuery } from '../../api/queries';
import { getMailApi } from '../../api/registry';
import type { Translate } from '../../shared/i18n';
import { cx } from '../../shared/cx';
import { firstPaintOf, LoadErrorPane, LoadingPane } from '../../shared/QueryStates';
import { useAutoSelect } from '../../shared/useAutoSelect';
import { SINGLE_PANE_QUERY, useMediaQuery } from '../../shared/useMediaQuery';
import { useSidebarToggle } from '../../shared/useSidebarToggle';
import { MailboxSidebar, type ComposedMail } from './MailboxSidebar';
import { MailList } from './MailList';
import { MailReadingPane } from './MailReadingPane';
import { selectMails } from './mailSelectors';
import { mailActions, mailStore, useMail } from './mailStore';
import sharedStyles from '../../shared/shared.module.css';

export type MailScreenProps = {
  t: Translate;
};

/**
 * The mail section's top-level orchestration - the same shape as
 * `InboxScreen`: three panes side by side, what is selected and typed kept in
 * `mailStore` so it survives leaving the section, and the API's own
 * collections filtered client-side for everything the panes show. Nothing
 * here is fetched per mailbox or per mail; the mock API answers with the
 * whole collection, same as the chat domain, and `mailSelectors.ts` is what
 * narrows it.
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
  const sentMails = useMail((state) => state.sentMails);

  const mailboxesSidebar = useSidebarToggle();
  const isSinglePane = useMediaQuery(SINGLE_PANE_QUERY);

  const mailboxes = mailboxesQuery.data?.mailboxes ?? [];
  const mails = useMemo(
    () => [...(mailsQuery.data?.mails ?? []), ...sentMails],
    [mailsQuery.data, sentMails]
  );
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
   * A reply is filed the way a composed mail is: kept in the store under
   * Sent, addressed to the correspondent and titled after the mail it
   * answers, and the draft is cleared. The mail service has no write
   * endpoint, so the reply lasts until the page reloads.
   */
  const sendReply = () => {
    if (!selected) return;
    const body = (drafts[selected.id] ?? '').trim();
    if (body === '') return;
    const reply: Mail = {
      id: `ml-sent-${crypto.randomUUID()}`,
      mailboxId: MAILBOX_SENT,
      correspondentName: selected.correspondentName,
      correspondentEmail: selected.correspondentEmail,
      subject: t('reply_subject', { subject: selected.subject }),
      snippet: body,
      body,
      receivedAt: new Date().toISOString(),
      read: true,
      starred: false,
      pinned: false,
    };
    mailActions.fileSent(reply, selected.id);
  };

  /**
   * A demo-grade sent mail: kept in the store with `mailboxId: MAILBOX_SENT`,
   * so switching to Sent shows it exactly like any other row - no separate
   * "just sent" list to keep in step. Mailbox selection is left alone; the
   * compose dialog itself already closed on submit (`MailboxSidebar`'s own
   * `onOpenChange`).
   */
  const composeMail = ({ to, subject, body }: ComposedMail) => {
    const newMail: Mail = {
      id: `ml-sent-${crypto.randomUUID()}`,
      mailboxId: MAILBOX_SENT,
      correspondentName: to,
      correspondentEmail: to,
      subject,
      snippet: body || subject,
      body,
      receivedAt: new Date().toISOString(),
      read: true,
      starred: false,
      pinned: false,
    };
    mailActions.fileSent(newMail);
  };

  return (
    <>
      <MailboxSidebar
        mailboxes={mailboxes}
        mails={mails}
        selectedMailboxId={mailboxId}
        onSelectMailbox={selectMailbox}
        onComposeMail={composeMail}
        collapsed={mailboxesSidebar.collapsed}
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
