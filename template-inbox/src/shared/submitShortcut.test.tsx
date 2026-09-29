import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { t } from './i18n';
import { isApplePlatform, SubmitShortcutHint } from './submitShortcut';

describe('SubmitShortcutHint', () => {
  it('spells the shortcut out as one piece of text, keys joined by the catalogue', () => {
    const view = render(<SubmitShortcutHint t={t} />);
    const modifier = isApplePlatform() ? t('key_command') : t('key_control');

    expect(view.container.textContent).toBe(
      t('send_shortcut', { keys: t('key_combination', { modifier, key: t('key_enter') }) })
    );
    expect(view.container.textContent).toContain(`${modifier}+${t('key_enter')}`);
  });
});
