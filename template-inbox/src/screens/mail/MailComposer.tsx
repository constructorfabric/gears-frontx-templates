import { SendIcon } from 'lucide-react';
import { Button, Textarea } from '@gears-frontx/ui-kit';
import type { Translate } from '../../shared/i18n';
import { SubmitShortcutHint, useSubmitShortcut } from '../../shared/submitShortcut';
import sharedStyles from '../../shared/shared.module.css';

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
 * Sending hands the draft to the screen, which files it as a reply under
 * Sent (in `mailStore`) and clears the box; nothing is posted and the thread
 * is not appended to, since this template ships no mail-send endpoint.
 */
export function MailComposer({ correspondentName, draft, onDraftChange, onSend, t }: MailComposerProps) {
  const canSend = draft.trim() !== '';
  const placeholder = t('reply_to_placeholder', { name: correspondentName });

  const onKeyDown = useSubmitShortcut(onSend, canSend);

  return (
    <div className={sharedStyles.composer}>
      <div className={sharedStyles.composerBox}>
        <Textarea
          rows={3}
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label={placeholder}
        />
        <div className={sharedStyles.composerToolbar}>
          <span className={sharedStyles.spacer} />
          <SubmitShortcutHint t={t} className={sharedStyles.composerHint} />
          <Button icon={<SendIcon />} disabled={!canSend} onClick={onSend}>
            {t('send')}
          </Button>
        </div>
      </div>
    </div>
  );
}
