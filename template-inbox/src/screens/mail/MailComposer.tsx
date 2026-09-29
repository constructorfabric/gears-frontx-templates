import type { KeyboardEvent } from 'react';
import { SendIcon } from 'lucide-react';
import { Button, Textarea } from '@gears-frontx/ui-kit';
import type { Translate } from '../../shared/i18n';
import { SubmitShortcutHint } from '../../shared/submitShortcut';
import styles from '../../styles/workspace.module.css';

export type MailComposerProps = {
  correspondentName: string;
  draft: string;
  onDraftChange: (draft: string) => void;
  onSend: () => void;
  t: Translate;
};

/**
 * The mail reading pane's reply box. Same composer chrome as the chat
 * `Composer` (`.composer` / `.composerBox` / `.composerToolbar`, reused
 * as-is), stripped to what a mail reply box needs: no
 * reply/note tabs, no attach/emoji/saved-reply row - a mail is a single
 * kind of message, and a real store for those three affordances is out of
 * scope here just as it is in the chat composer.
 *
 * Sending stays deliberately simple: it clears
 * the draft rather than posting anywhere or appending to the thread, since
 * this template ships no mail-send endpoint.
 */
export function MailComposer({ correspondentName, draft, onDraftChange, onSend, t }: MailComposerProps) {
  const canSend = draft.trim() !== '';
  const placeholder = t('reply_to_placeholder', { name: correspondentName });

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && canSend) {
      event.preventDefault();
      onSend();
    }
  };

  return (
    <div className={styles.composer}>
      <div className={styles.composerBox}>
        <Textarea
          rows={3}
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label={placeholder}
        />
        <div className={styles.composerToolbar}>
          <span className={styles.spacer} />
          <SubmitShortcutHint t={t} className={styles.composerHint} />
          <Button icon={<SendIcon />} disabled={!canSend} onClick={onSend}>
            {t('send')}
          </Button>
        </div>
      </div>
    </div>
  );
}
