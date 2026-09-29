import { useCallback, type KeyboardEvent } from 'react';
import { Kbd, KbdGroup } from '@gears-frontx/ui-kit';
import type { Translate } from './i18n';

/**
 * Apple platforms send with Command+Enter, everything else with Ctrl+Enter.
 * `userAgent` rather than the deprecated `navigator.platform`; either key is
 * accepted everywhere, so a misread platform only mislabels the hint.
 */
export const isApplePlatform = (): boolean =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

/**
 * The composer's "Cmd+Enter to send" hint, with the keys drawn as the kit's
 * `Kbd`. The sentence comes from the catalogue (`send_shortcut`, where
 * `{keys}` marks the key group), so a language that puts the keys last only
 * changes the catalogue.
 */
export function SubmitShortcutHint({ t, className }: { t: Translate; className?: string }) {
  const [before, after = ''] = t('send_shortcut').split('{keys}');
  return (
    <span className={className}>
      {before}
      <KbdGroup>
        <Kbd>{isApplePlatform() ? t('key_command') : t('key_control')}</Kbd>
        <Kbd>{t('key_enter')}</Kbd>
      </KbdGroup>
      {after}
    </span>
  );
}

/**
 * The key handler both composers put on their textarea: Cmd+Enter or
 * Ctrl+Enter submits while `enabled`. A keystroke that is still composing
 * text in an input method (`isComposing`) is the IME's, not a submit.
 */
export function useSubmitShortcut(onSubmit: () => void, enabled: boolean) {
  return useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return;
      if (event.nativeEvent.isComposing || !enabled) return;
      event.preventDefault();
      onSubmit();
    },
    [onSubmit, enabled]
  );
}
