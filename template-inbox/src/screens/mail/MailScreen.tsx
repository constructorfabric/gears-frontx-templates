import { useMemo, useState } from 'react';
import { MailIcon } from 'lucide-react';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@gears-frontx/ui-kit';
import { MAILBOX_SENT } from '../../api/constants';
import type { Mail, MailboxId } from '../../api/mailTypes';
import { useApiQuery } from '../../api/queries';
import { getMailApi } from '../../api/registry';
import type { Translate } from '../../shared/i18n';
import { cx } from '../../shared/cx';
import { firstPaintOf, LoadErrorPane, LoadingPane } from '../../shared/QueryStates';
import { SINGLE_PANE_QUERY, useMediaQuery } from '../../shared/useMediaQuery';
import { useSidebarToggle } from '../../shared/useSidebarToggle';
import { MailboxSidebar, type ComposedMail } from './MailboxSidebar';
import { MailList } from './MailList';
import { MailReadingPane } from './MailReadingPane';
import { selectMails, type MailTab } from './mailSelectors';
import styles from '../../styles/workspace.module.css';

export type MailScreenProps = {
  t: Translate;
};

/**
 * The mail section's top-level orchestration - the same shape as
 * `InboxScreen`: three panes side by side, screen-local state for what is
 * selected and typed, and the API's own collections filtered client-side for
 * everything the panes show. Nothing here is fetched per mailbox or per mail;
 * the mock API answers with the whole collection, same as the chat domain,
 * and `mailSelectors.ts` is what narrows it.
 */
export function MailScreen({ t }: MailScreenProps) {
  const service = getMailApi();

  const mailboxesQuery = useApiQuery(service.getMailboxes);
  const mailsQuery = useApiQuery(service.getMails);
  const mailMessagesQuery = useApiQuery(service.getMailMessages);

  const [mailboxId, setMailboxId] = useState<MailboxId>('inbox');
  const [selectedMailId, setSelectedMailId] = useState<string | null>(null);
  // The mailbox still owed an automatic first-mail pick: set on mount and on
  // every mailbox switch, cleared once that pick has happened. The same
  // shape as `InboxScreen`'s `autoSelectChannelId` guard, for the same
  // reason - a plain "selection is null" check would also fire after the
  // reading pane is intentionally cleared, which this must not do.
  const [autoSelectMailboxId, setAutoSelectMailboxId] = useState<MailboxId | null>('inbox');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<MailTab>('all');
  // Keyed by mail id rather than a single flag, so switching between two
  // mails with history does not collapse the one already left open.
  const [historyOpenById, setHistoryOpenById] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // Client-side only, never round-tripped through RestMockPlugin - a mail
  // the agent sends from the Compose dialog, appended alongside whatever
  // the mock API answered with.
  const [composedMails, setComposedMails] = useState<Mail[]>([]);

  const mailboxesSidebar = useSidebarToggle();
  const isSinglePane = useMediaQuery(SINGLE_PANE_QUERY);

  const mailboxes = mailboxesQuery.data?.mailboxes ?? [];
  const mails = useMemo(
    () => [...(mailsQuery.data?.mails ?? []), ...composedMails],
    [mailsQuery.data, composedMails]
  );
  const mailMessages = useMemo(
    () => mailMessagesQuery.data?.mailMessages ?? [],
    [mailMessagesQuery.data]
  );

  // Auto-opens the mailbox's first mail - on the initial mount and again on
  // every mailbox switch (`selectMailbox` re-arms this by setting
  // `autoSelectMailboxId` to the mailbox just entered). Reuses `selectMails`
  // so the pick honours whichever tab and search are already in effect,
  // matching the order `MailList` renders. Resolved here, synchronously
  // during render, rather than in a `useEffect`: this is derived state
  // (React's own "adjust state when something changes" pattern - see "You
  // Might Not Need an Effect"), not a synchronization with anything outside
  // React, so settling it a render early avoids both the lint rule against
  // setting state from an effect and the one-frame flash of the empty state
  // an effect-based version would show first. Guarded by the id match so a
  // click that picks a different mail, once consumed, never gets
  // second-guessed while the agent stays in that mailbox. Disarmed as soon
  // as the mails have arrived, whether or not the mailbox (under the current
  // tab and search) has anything to pick: left armed on an empty list, it
  // would later open a mail the agent never chose.
  if (autoSelectMailboxId === mailboxId && !mailsQuery.isLoading) {
    setAutoSelectMailboxId(null);
    const candidates = selectMails(mails, mailboxId, tab, search);
    if (candidates.length > 0 && selectedMailId !== candidates[0].id) {
      setSelectedMailId(candidates[0].id);
    }
  }

  const selected = mails.find((mail) => mail.id === selectedMailId) ?? null;

  const history = useMemo(() => {
    if (!selected) return [];
    return mailMessages.filter((message) => message.mailId === selected.id);
  }, [mailMessages, selected]);

  const selectMailbox = (nextMailboxId: MailboxId) => {
    setMailboxId(nextMailboxId);
    setSelectedMailId(null);
    setAutoSelectMailboxId(nextMailboxId);
  };

  const firstPaint = firstPaintOf([mailboxesQuery, mailsQuery, mailMessagesQuery]);
  if (firstPaint.failed) return <LoadErrorPane onRetry={firstPaint.retry} t={t} />;
  if (firstPaint.loading) return <LoadingPane />;

  const mailboxLabel = mailboxes.find((mailbox) => mailbox.id === mailboxId)?.label ?? '';
  const showReading = selected !== null;

  /**
   * A reply is filed the way a composed mail is: appended to `composedMails`
   * under Sent, addressed to the correspondent and titled after the mail it
   * answers, and the draft is cleared. The mail service has no write
   * endpoint, so the reply lasts as long as this screen does.
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
    setComposedMails((previous) => [...previous, reply]);
    setDrafts((previous) => ({ ...previous, [selected.id]: '' }));
  };

  /**
   * A demo-grade sent mail: appended to `composedMails` with
   * `mailboxId: MAILBOX_SENT`, so switching to Sent shows it exactly like
   * any other row - no separate "just sent" list to keep in step. Mailbox
   * selection is left alone; the compose dialog itself already closed on
   * submit (`MailboxSidebar`'s own `onOpenChange`).
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
    setComposedMails((previous) => [...previous, newMail]);
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
        onTabChange={setTab}
        selectedMailId={selectedMailId}
        onSelectMail={setSelectedMailId}
        search={search}
        onSearchChange={setSearch}
        hidden={isSinglePane && showReading}
        onToggleMailboxes={mailboxesSidebar.toggle}
        mailboxesOpen={!mailboxesSidebar.collapsed}
        t={t}
      />

      <div className={cx(styles.detailPane, isSinglePane && !showReading && styles.singlePaneHidden)}>
        {selected ? (
          <MailReadingPane
            mail={selected}
            history={history}
            historyOpen={historyOpenById[selected.id] ?? false}
            onToggleHistory={() =>
              setHistoryOpenById((previous) => ({
                ...previous,
                [selected.id]: !(previous[selected.id] ?? false),
              }))
            }
            draft={drafts[selected.id] ?? ''}
            onDraftChange={(draft) =>
              setDrafts((previous) => ({ ...previous, [selected.id]: draft }))
            }
            onSend={sendReply}
            onBack={isSinglePane ? () => setSelectedMailId(null) : null}
            t={t}
          />
        ) : (
          <div className={styles.emptyPane}>
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
