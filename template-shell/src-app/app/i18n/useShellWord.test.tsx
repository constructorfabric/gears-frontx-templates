import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  createFrontX,
  FrontXProvider,
  i18n,
  i18nRegistry,
  Language,
  type TranslationDictionary,
} from '@gears-frontx/react';
import '@/app/i18n/shellTranslations'; // Register the shell namespace's loader (side effect)
import { useShellWord } from './useShellWord';

/** Renders one shell word through the hook, the way the chrome reads its own words. */
const Probe = ({ keyPath, fallback }: { keyPath: string; fallback: string }) => (
  <span>{useShellWord(keyPath, fallback)}</span>
);

// One app for this file, built once the way a runtime builds its app. The
// i18n plugin is what reading the shell words needs: it provides the registry
// `useTranslation` reads through, and its init starts the initial language
// load the way a real boot does.
const app = createFrontX().use(i18n()).build();

const renderProbe = (keyPath: string, fallback: string) => {
  render(
    <FrontXProvider app={app}>
      <Probe keyPath={keyPath} fallback={fallback} />
    </FrontXProvider>,
  );
};

describe('useShellWord', () => {
  it('answers a dictionary miss with the English fallback, then serves the word once the dictionary lands', async () => {
    // A namespace with a loader this test holds back: registered like the
    // shell's own loader is, but the load resolves only when the test
    // releases it, so the window before the dictionary arrives is
    // deterministic rather than a race against the plugin's initial load.
    let release!: (dictionary: TranslationDictionary) => void;
    const held = new Promise<TranslationDictionary>((resolve) => {
      release = resolve;
    });
    i18nRegistry.registerLoader('shell-word-probe', () => held);

    renderProbe('shell-word-probe:greeting', 'Hello there');

    // The loader has not resolved, so the registry has no word and echoes the
    // key back; the page shows the English fallback, never the key.
    expect(screen.getByText('Hello there')).toBeTruthy();
    expect(screen.queryByText('shell-word-probe:greeting')).toBeNull();

    // The load lands the way `loadLanguage` delivers a dictionary: the
    // registry notifies and the hook re-renders with the translated word.
    await act(async () => {
      release({ greeting: 'Guten Tag' });
      await i18nRegistry.setLanguage(Language.English);
    });
    expect(screen.getByText('Guten Tag')).toBeTruthy();
    expect(screen.queryByText('Hello there')).toBeNull();
  });

  it('serves the shell word for a shell key once the shell dictionary has loaded', async () => {
    renderProbe('shell:menu.expand', 'Expand menu');

    // Before the German dictionary lands, the page shows the English word:
    // the fallback while the load is pending, the English dictionary's own
    // word once the initial load has landed. Both are the word; the key is
    // what must never appear.
    expect(screen.queryByText('shell:menu.expand')).toBeNull();
    expect(screen.getByText('Expand menu')).toBeTruthy();

    await act(async () => {
      await i18nRegistry.setLanguage(Language.German);
    });
    expect(screen.getByText('Menü ausklappen')).toBeTruthy();
    expect(screen.queryByText('Expand menu')).toBeNull();
  });
});
