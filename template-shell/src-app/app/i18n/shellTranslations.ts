/**
 * The shell's own translation namespace.
 *
 * The words the shell renders itself (the load-failed state, the menu
 * collapse toggle, the backdrop, the header's user fallback) live here under
 * the "shell" namespace, separate from the namespaces the screens and the
 * Studio carry. The loader maps a language to its JSON file the same way the
 * Studio registers its own namespace, with one difference: the shell carries
 * English and German only, so a language without a file falls back to the
 * English file instead of rejecting, which would only log a warning and leave
 * the shell words unloaded.
 */

import {
  i18nRegistry,
  Language,
  type TranslationDictionary,
  type TranslationLoader,
} from '@gears-frontx/react';
import { SHELL_LANGUAGES } from './shellLanguages';

/** The namespace every shell word is translated under (`shell:...`). */
export const SHELL_NAMESPACE = 'shell';

/** Loads one shell dictionary file. */
type ShellDictionaryLoader = () => Promise<{ default: TranslationDictionary }>;

const loadEnglish: ShellDictionaryLoader = () => import('./shell/en.json');
const loadGerman: ShellDictionaryLoader = () => import('./shell/de.json');

/**
 * The dictionary each language reads, keyed by the language code. This table
 * is where a language is added: one more entry here, pointing at its JSON
 * file, next to the code in `shellLanguages.ts`.
 */
const SHELL_DICTIONARIES: Partial<Record<Language, ShellDictionaryLoader>> = {
  [Language.English]: loadEnglish,
  [Language.German]: loadGerman,
};

/**
 * Whether every language `shellLanguages.ts` lists has an entry in the table
 * above. Fails loudly in tests when the two places a shell language lives
 * drift apart: the loader falls back to English for a language without a
 * file, so a missed entry would otherwise stay silent and leave that
 * language's shell chrome in English.
 */
export const everyShellLanguageHasDictionary = (): boolean =>
  SHELL_LANGUAGES.every(({ code }) => SHELL_DICTIONARIES[code] !== undefined);

/**
 * Load the shell words for a language. The shell carries English and German;
 * every other language reads the English file, so the words stay on the page
 * instead of the loader rejecting and leaving the namespace unloaded.
 */
export const loadShellDictionary: TranslationLoader = async (language) => {
  const load = SHELL_DICTIONARIES[language as Language] ?? loadEnglish;
  return (await load()).default;
};

// Registering at module execution. The entries import this module for its
// side effect, so the loader is in place before the first render and the
// i18n plugin's initial language load picks the shell words up with every
// other non-screen namespace (`I18nRegistry.loadLanguage`).
i18nRegistry.registerLoader(SHELL_NAMESPACE, loadShellDictionary);
