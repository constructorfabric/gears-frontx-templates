import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  createFrontX,
  FrontXProvider,
  i18n,
  i18nRegistry,
  Language,
  useTranslation,
  type TranslationDictionary,
} from '@gears-frontx/react';
import { SidebarHeader } from '@/app/components/ui/sidebar';
import { ScreenLoadFailed } from '@/app/mfe/ScreenLoadFailed';
import { everyShellLanguageHasDictionary, loadShellDictionary, SHELL_NAMESPACE } from './shellTranslations';

/** Reads one word out of a dictionary by its dotted key, the way the registry resolves `shell:...` keys. */
const word = (dictionary: TranslationDictionary, path: string): string => {
  let current: string | TranslationDictionary | undefined = dictionary;
  for (const part of path.split('.')) {
    if (typeof current !== 'object' || current === null) {
      throw new Error(`the path '${path}' left the dictionary at '${part}'`);
    }
    current = current[part];
  }
  if (typeof current !== 'string') {
    throw new Error(`the path '${path}' does not end in a word`);
  }
  return current;
};

/** Every dotted key a dictionary carries, nested groups flattened into paths. */
const flattenKeys = (dictionary: TranslationDictionary, prefix = ''): string[] =>
  Object.entries(dictionary).flatMap(([key, value]) => {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    return typeof value === 'object' && value !== null
      ? flattenKeys(value as TranslationDictionary, path)
      : [path];
  });

describe('the shell translation loader', () => {
  it('registers the shell namespace, so loadLanguage loads it with the other namespaces', () => {
    expect(i18nRegistry.hasNamespace(SHELL_NAMESPACE)).toBe(true);
  });

  it('serves the English words', async () => {
    const en = await loadShellDictionary(Language.English);

    expect(word(en, 'loadFailed.title')).toBe('This screen could not be loaded');
    expect(word(en, 'loadFailed.description')).toBe('Check the connection and try again.');
    expect(word(en, 'loadFailed.retry')).toBe('Retry');
    expect(word(en, 'menu.expand')).toBe('Expand menu');
    expect(word(en, 'menu.collapse')).toBe('Collapse menu');
    expect(word(en, 'menu.close')).toBe('Close menu');
    expect(word(en, 'header.user')).toBe('User');
    expect(word(en, 'header.language')).toBe('Language');
    expect(word(en, 'modal.close')).toBe('Close');
  });

  it('serves the German words', async () => {
    const de = await loadShellDictionary(Language.German);

    expect(word(de, 'loadFailed.title')).toBe('Dieser Bildschirm konnte nicht geladen werden');
    expect(word(de, 'loadFailed.description')).toBe('Verbindung prüfen und erneut versuchen.');
    expect(word(de, 'loadFailed.retry')).toBe('Erneut versuchen');
    expect(word(de, 'menu.expand')).toBe('Menü ausklappen');
    expect(word(de, 'menu.collapse')).toBe('Menü einklappen');
    expect(word(de, 'menu.close')).toBe('Menü schließen');
    expect(word(de, 'header.user')).toBe('Nutzer');
    expect(word(de, 'header.language')).toBe('Sprache');
    expect(word(de, 'modal.close')).toBe('Schließen');
  });

  it('carries the same keys in the German dictionary as in the English one', async () => {
    // A key one dictionary misses falls back to the raw key on the page, which
    // no word check below would notice for a key it does not name. The parity
    // check covers every key, present and future.
    const en = await loadShellDictionary(Language.English);
    const de = await loadShellDictionary(Language.German);

    expect(flattenKeys(de).sort()).toEqual(flattenKeys(en).sort());
  });

  it('has a dictionary entry for every language the shell lists', () => {
    // A language is declared in `shellLanguages.ts` and given its file in the
    // dictionary table, and the loader answers a missing entry with the
    // English file instead of an error, so a missed second edit would leave
    // the header offering a language whose shell chrome stays English. This
    // turns that drift into the failure you are reading.
    expect(everyShellLanguageHasDictionary()).toBe(true);
  });

  it('falls back to the English words for a language the shell has no file for', async () => {
    const fr = await loadShellDictionary('fr');

    expect(word(fr, 'loadFailed.title')).toBe('This screen could not be loaded');
    expect(word(fr, 'menu.expand')).toBe('Expand menu');
  });
});

describe('the shell words on the page', () => {
  // The sidebar primitive takes its toggle labels as props and translates
  // nothing itself. This stand-in stands where `Menu.tsx` stands in the app
  // and reads the words through `useTranslation`, so the test still checks
  // that the loader puts the shell words on the page.
  const MenuCollapseToggle = ({ collapsed }: { collapsed: boolean }) => {
    const { t } = useTranslation();
    return (
      <SidebarHeader
        collapsed={collapsed}
        onClick={() => {}}
        expandLabel={t('shell:menu.expand')}
        collapseLabel={t('shell:menu.collapse')}
      />
    );
  };

  it('shows the German menu toggle label and load-failed words after the language switches to de', async () => {
    // A minimal app: the i18n plugin is what the shell words need, and its
    // init loads the current language through every registered loader.
    const app = createFrontX().use(i18n()).build();

    render(
      <FrontXProvider app={app}>
        <ScreenLoadFailed onRetry={() => {}} />
        <MenuCollapseToggle collapsed />
      </FrontXProvider>,
    );

    // English is the initial language; once its dictionary has landed, the
    // English words are on the page.
    await act(async () => {
      await i18nRegistry.setLanguage(Language.English);
    });
    expect(screen.getByTitle('Expand menu')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('This screen could not be loaded');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();

    // Switching the language re-renders the shell words in German.
    await act(async () => {
      await i18nRegistry.setLanguage(Language.German);
    });
    expect(screen.getByTitle('Menü ausklappen')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Dieser Bildschirm konnte nicht geladen werden');
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeTruthy();
  });
});
