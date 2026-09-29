import { useEffect, useRef, type KeyboardEvent } from 'react';
import { PaperclipIcon, SendIcon, SmileIcon, ZapIcon } from 'lucide-react';
import { Button, Tabs, TabsContent, TabsList, TabsTrigger, Textarea } from '@gears-frontx/ui-kit';
import { cx } from '../../shared/cx';
import type { Translate } from '../../shared/i18n';
import { SubmitShortcutHint } from '../../shared/submitShortcut';
import styles from '../../styles/workspace.module.css';

export const COMPOSER_TABS = ['reply', 'note'] as const;

export type ComposerTab = (typeof COMPOSER_TABS)[number];

export const isComposerTab = (value: unknown): value is ComposerTab =>
  typeof value === 'string' && COMPOSER_TABS.some((tab) => tab === value);

export type ComposerProps = {
  tab: ComposerTab;
  onTabChange: (tab: ComposerTab) => void;
  draft: string;
  onDraftChange: (draft: string) => void;
  onSend: () => void;
  /** A post from this composer is in flight. */
  sending: boolean;
  /** The conversation takes no more replies or notes (it is closed). */
  disabled?: boolean;
  /**
   * Bumped by the parent (any changing value) right after opening a
   * freshly created conversation, so the reply box is ready to type into
   * without an extra click - "composer focused" for the new-chat flow.
   * Not tied to `tab`/`draft`, both of which change on every keystroke;
   * the effect below only reacts to THIS value changing.
   */
  focusSignal?: number;
  t: Translate;
};

export function Composer({
  tab,
  onTabChange,
  draft,
  onDraftChange,
  onSend,
  sending,
  disabled = false,
  focusSignal,
  t,
}: ComposerProps) {
  const isNote = tab === 'note';
  const canSend = draft.trim() !== '' && !sending && !disabled;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (focusSignal) textareaRef.current?.focus();
  }, [focusSignal]);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && canSend) {
      event.preventDefault();
      onSend();
    }
  };

  // One body for both tabs: the box stays the same and only the placeholder,
  // the submit label and the frame swap. Each tab still owns a panel so the
  // tablist has something to control; the kit's TabsContent unmounts an
  // inactive panel (Base UI's default), so only one textarea - and one
  // `textareaRef` target - exists at a time.
  const body = (
    <div className={cx(styles.composerBox, isNote && styles.composerBoxNote)}>
      <Textarea
        ref={textareaRef}
        rows={3}
        value={draft}
        disabled={disabled}
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={
          disabled
            ? t('conversation_closed_placeholder')
            : isNote
              ? t('note_placeholder')
              : t('reply_placeholder')
        }
        aria-label={isNote ? t('note') : t('reply')}
      />
      <div className={styles.composerToolbar}>
        {/*
          Attach, emoji and saved replies need a store this template does not
          ship - an upload target, a picker, a canned reply library - so they
          render disabled: the toolbar shows where they go without offering
          an action that does nothing. The app's convention for every such
          control (the rail's profile entries, the activity search, the
          thread header's ticket and unassign actions).
        */}
        <div className={styles.composerTools}>
          <Button variant="ghost" size="sm" icon={<PaperclipIcon />} aria-label={t('attach_file')} disabled />
          <Button variant="ghost" size="sm" icon={<SmileIcon />} aria-label={t('insert_emoji')} disabled />
          <Button variant="ghost" size="sm" icon={<ZapIcon />} aria-label={t('saved_replies')} disabled />
        </div>
        <span className={styles.spacer} />
        <SubmitShortcutHint t={t} className={styles.composerHint} />
        <Button icon={<SendIcon />} disabled={!canSend} loading={sending} onClick={onSend}>
          {isNote ? t('add_note') : t('send')}
        </Button>
      </div>
    </div>
  );

  return (
    <div className={styles.composer}>
      <Tabs
        value={tab}
        onValueChange={(value) => {
          if (isComposerTab(value)) onTabChange(value);
        }}
      >
        <TabsList variant="line">
          <TabsTrigger value="reply">{t('reply')}</TabsTrigger>
          <TabsTrigger value="note">{t('note')}</TabsTrigger>
        </TabsList>
        <TabsContent value="reply">{body}</TabsContent>
        <TabsContent value="note">{body}</TabsContent>
      </Tabs>
    </div>
  );
}
