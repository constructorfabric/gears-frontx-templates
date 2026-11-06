/**
 * useScreenTranslations Hook
 *
 * MFE-local i18n loading hook. Accepts a language map produced by
 * `import.meta.glob('./i18n/*.json')` (Vite-compatible glob).
 *
 * The hook:
 * 1. Reads the current language through useSharedProperty(FRONTX_SHARED_PROPERTY_LANGUAGE, { bridge })
 * 2. Builds module key from language (e.g., './i18n/en.json')
 * 3. Dynamically imports the module
 * 4. Returns t(key) function that looks up key in loaded translations
 * 5. Reloads translations when the language changes
 *
 * Usage in screen component:
 * ```tsx
 * const languageModules = import.meta.glob('./i18n/*.json');
 * const { t, loading } = useScreenTranslations(languageModules, bridge);
 * ```
 */

import { useState, useEffect, useCallback } from 'react';
import type { ChildMfeBridge } from '@gears-frontx/react';
import { FRONTX_SHARED_PROPERTY_LANGUAGE, useSharedProperty } from '@gears-frontx/react';

interface TranslationJsonModule {
  default: Record<string, string>;
}
type LanguageModuleImporter = () => Promise<TranslationJsonModule>;
type LanguageModuleMap = Record<string, LanguageModuleImporter>;

interface UseScreenTranslationsReturn {
  t: (key: string) => string;
  loading: boolean;
}

/** Loaded translations, with the language and module map they belong to. */
interface LoadedTranslations {
  language: string;
  languageModules: LanguageModuleMap;
  translations: Record<string, string>;
}

const NO_TRANSLATIONS: Record<string, string> = {};

/**
 * Loads the translations for a language, falling back to English when the
 * language has no module. Resolves to an empty map when nothing loads.
 */
async function loadTranslations(
  languageModules: LanguageModuleMap,
  language: string
): Promise<Record<string, string>> {
  try {
    // Build module key from language (e.g., './i18n/en.json')
    const moduleKey = `./i18n/${language}.json`;
    const importer = languageModules[moduleKey];

    if (!importer) {
      console.warn(`[useScreenTranslations] No translation module found for language: ${language}, falling back to en`);
      // Fall back to English
      const fallbackKey = './i18n/en.json';
      const fallbackImporter = languageModules[fallbackKey];
      if (!fallbackImporter) {
        console.error('[useScreenTranslations] English fallback not found');
        return {};
      }
      const module = await fallbackImporter();
      return module.default;
    }

    // Dynamically import the module
    const module = await importer();
    return module.default;
  } catch (error) {
    console.error(`[useScreenTranslations] Failed to load translations for ${language}:`, error);
    return {};
  }
}

/**
 * Hook for loading MFE-local translations based on the current language from the bridge.
 *
 * @param languageModules - Language module map from `import.meta.glob('./i18n/*.json')`
 * @param bridge - ChildMfeBridge instance
 * @returns Object with `t(key)` function and `loading` state
 */
export function useScreenTranslations(
  languageModules: LanguageModuleMap,
  bridge: ChildMfeBridge
): UseScreenTranslationsReturn {
  const language = useSharedProperty(FRONTX_SHARED_PROPERTY_LANGUAGE, { bridge, fallback: 'en' });
  const [loaded, setLoaded] = useState<LoadedTranslations | null>(null);
  // Loading lasts until the current language's translations arrive; the
  // previous language's strings stay on screen meanwhile. Deriving it here
  // keeps the effect below from setting state synchronously.
  const loading =
    loaded === null || loaded.language !== language || loaded.languageModules !== languageModules;
  const translations = loaded?.translations ?? NO_TRANSLATIONS;

  // Load translations for the current language, and again whenever it changes.
  // A load that a newer one has replaced, or that outlives the screen, sets
  // nothing: otherwise a slow `fr.json` that resolves after `de.json` would put
  // French strings back on screen.
  useEffect(() => {
    let current = true;
    loadTranslations(languageModules, language).then((loadedTranslations) => {
      if (current) setLoaded({ language, languageModules, translations: loadedTranslations });
    });
    return () => {
      current = false;
    };
  }, [language, languageModules]);

  // Translation function
  const t = useCallback(
    (key: string): string => {
      const translation = translations[key];
      if (translation === undefined) {
        console.warn(`[useScreenTranslations] Missing translation key: ${key}`);
        return key; // Return key as fallback
      }
      return translation;
    },
    [translations]
  );

  return { t, loading };
}
