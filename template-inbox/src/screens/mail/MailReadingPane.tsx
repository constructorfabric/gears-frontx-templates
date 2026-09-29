import { ArchiveIcon, ArrowLeftIcon, ReplyIcon, StarIcon, Trash2Icon } from 'lucide-react';
import {
  Button,
  MessageScroller,
  MessageScrollerContent,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@gears-frontx/ui-kit';
import type { Mail, MailMessage } from '../../api/mailTypes';
import type { Translate } from '../../shared/i18n';
import { dateTime } from '../../shared/format';
import { IdentityAvatar } from '../../shared/IdentityAvatar';
import { MailComposer } from './MailComposer';
import styles from '../../styles/workspace.module.css';
import mailStyles from '../../styles/mail.module.css';

export type MailReadingPaneProps = {
  mail: Mail;
  /** Earlier messages, oldest first; empty when the mail has no history. */
  history: MailMessage[];
  historyOpen: boolean;
  onToggleHistory: () => void;
  draft: string;
  onDraftChange: (draft: string) => void;
  onSend: () => void;
  /** Back to the list, where the list and the reading pane take turns; `null` beside it. */
  onBack: (() => void) | null;
  t: Translate;
};

/**
 * The reading pane - the largest divergence from the chat thread it reuses
 * the chrome of. No bubbles, no per-sender alignment: a mail renders flat,
 * top to bottom. The scroll container and its provider are the same
 * `MessageScroller` family `ConversationThread` uses; what changes is what
 * goes inside it - a history toggle, muted bordered cards for anything
 * behind it, and the newest message flat and full width, never wrapped in a
 * card of its own.
 */
export function MailReadingPane({
  mail,
  history,
  historyOpen,
  onToggleHistory,
  draft,
  onDraftChange,
  onSend,
  onBack,
  t,
}: MailReadingPaneProps) {
  return (
    <div className={styles.thread}>
      {/*
        Archive, trash, star and reply render disabled: moving a mail between
        mailboxes and starring it are writes this template's mail service does
        not offer, and the reply composer below is always open, so the reply
        button would have nothing to open. The app's convention for a control
        with no action behind it.
      */}
      <div className={styles.paneHeader}>
        {onBack ? (
          <Button
            variant="ghost"
            size="sm"
            icon={<ArrowLeftIcon />}
            aria-label={t('back_to_mail_list')}
            onClick={onBack}
          />
        ) : null}
        <div className={styles.threadActions}>
          <Button variant="ghost" size="sm" icon={<ArchiveIcon />} aria-label={t('archive_mail')} disabled />
          <Button variant="ghost" size="sm" icon={<Trash2Icon />} aria-label={t('trash_mail')} disabled />
          <Button
            variant="ghost"
            size="sm"
            icon={<StarIcon />}
            aria-label={mail.starred ? t('unstar_mail') : t('star_mail')}
            disabled
          />
        </div>
        <span className={styles.spacer} />
        <div className={styles.threadActions}>
          <Button variant="ghost" size="sm" icon={<ReplyIcon />} aria-label={t('reply_to_mail')} disabled />
        </div>
      </div>

      <div className={styles.threadHeader}>
        <IdentityAvatar name={mail.correspondentName} size="default" />
        <div className={styles.threadTitles}>
          <span className={styles.threadSubject}>{mail.subject}</span>
          <span className={styles.threadSubtitle}>{mail.correspondentName}</span>
          <span className={mailStyles.replyToLine}>
            {t('reply_to_line', { email: mail.correspondentEmail })}
          </span>
        </div>
      </div>

      {/*
        Keyed by mail id - same reasoning as ConversationThread's
        MessageScrollerProvider: without a key, switching the open mail
        keeps the same provider instance mounted, and the scroller primitive
        reads the swapped content as an in-place edit to the CURRENT transcript
        rather than a fresh one, which can leave a stray
        [data-message-scroller-spacer] gap. The key forces a genuine
        remount per mail.
      */}
      <MessageScrollerProvider key={mail.id}>
        <MessageScroller className={styles.transcript}>
          <MessageScrollerViewport>
            <MessageScrollerContent>
              {history.length > 0 ? (
                <Button
                  variant="outline"
                  className={mailStyles.historyToggle}
                  onClick={onToggleHistory}
                  aria-expanded={historyOpen}
                >
                  {historyOpen
                    ? t('hide_earlier_messages')
                    : t('earlier_messages', { count: history.length })}
                </Button>
              ) : null}

              {historyOpen
                ? history.map((message) => (
                    <div key={message.id} className={mailStyles.historyCard}>
                      <div className={mailStyles.historyCardHeader}>
                        <IdentityAvatar name={message.correspondentName} size="default" />
                        <span className={mailStyles.historyCardSender}>{message.correspondentName}</span>
                        <span className={mailStyles.historyCardDate}>{dateTime(message.sentAt)}</span>
                      </div>
                      <div className={mailStyles.historyCardBody}>{message.body}</div>
                    </div>
                  ))
                : null}

              <div className={mailStyles.focusedMessage}>{mail.body}</div>
            </MessageScrollerContent>
          </MessageScrollerViewport>
        </MessageScroller>
      </MessageScrollerProvider>

      <MailComposer
        correspondentName={mail.correspondentName}
        draft={draft}
        onDraftChange={onDraftChange}
        onSend={onSend}
        t={t}
      />
    </div>
  );
}
