/**
 * useScreenTranslations Hook
 *
 * MFE-local i18n loading hook. Accepts a language map produced by
 * `import.meta.glob('./i18n/*.json')` (Vite-compatible glob).
 *
 * The hook:
 * 1. Reads the current language from bridge.getProperty(FRONTX_SHARED_PROPERTY_LANGUAGE)
 * 2. Builds the module key from the language (e.g., './i18n/en.json')
 * 3. Serves the language's dictionary from the module-level cache when it is
 *    loaded, and otherwise starts the one import shared by every mount of the
 *    screen
 * 4. Returns t(key) function that looks up key in loaded translations
 * 5. Subscribes to language property changes to swap dictionaries
 *
 * A mount whose language is already cached initialises its state from the
 * cache during the first render: the first committed frame shows real text
 * with `loading` false and no loading branch. `loading` is true only while no
 * dictionary has been shown yet, the cold first frame; a language switch keeps
 * the previous dictionary on screen, so it never turns `loading` back on, and
 * a failed import keeps whatever was on screen too. Render reads the cache
 * without touching it; every import starts from the mount effect.
 *
 * Usage in screen component:
 * ```tsx
 * const languageModules = import.meta.glob('./i18n/*.json');
 * const { t, loading } = useScreenTranslations(languageModules, bridge);
 * ```
 *
 * `_blank-mfe` carries a copy of this module at the same path, for the same
 * reason its copy of `kitThemeScope` exists: an MFE package never imports from
 * a sibling MFE package, and the only shared homes available,
 * `@gears-frontx/ui-kit` and `@gears-frontx/mfes`, are respectively a published
 * surface this template does not own and a package no MFE takes as a runtime
 * dependency. The two copies stay at the same path under `src/shared/` so that
 * a package scaffolded from `_blank-mfe` and this one read the same; folding
 * them into one is a decision for whoever moves the hook into a package both
 * can depend on.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ChildMfeBridge } from '@gears-frontx/react/mfe';
import { FRONTX_SHARED_PROPERTY_LANGUAGE } from '../shellContract';

interface TranslationJsonModule {
  default: Record<string, string>;
}
type LanguageModuleImporter = () => Promise<TranslationJsonModule>;
type LanguageModuleMap = Record<string, LanguageModuleImporter>;

const FALLBACK_LANGUAGE = 'en';
const EMPTY_DICTIONARY: Record<string, string> = {};

function moduleKeyFor(language: string): string {
  return `./i18n/${language}.json`;
}

/**
 * One cache slot for a (language map, language) pair.
 */
interface DictionaryEntry {
  /**
   * The shared import. Every mount that wants this pair awaits this one
   * promise, so two mounts never import the same language twice. It resolves
   * to null when the import fails, so a failure never reads as a dictionary.
   */
  promise: Promise<Record<string, string> | null>;
  /**
   * The dictionary, set only once the promise has resolved with one. A mount
   * that finds it here initialises synchronously and never renders a loading
   * frame; a failed import leaves it unset, so the next request retries.
   */
  dictionary?: Record<string, string>;
}

/**
 * The (language map, language) pair a hook instance last asked for. Written
 * only from the load paths, never during render: a dictionary that settles
 * after a newer request started belongs to an abandoned switch and is dropped
 * by comparing against this ref.
 */
interface TranslationRequest {
  modules: LanguageModuleMap;
  language: string;
}

/*
 * Module-level cache, keyed by the importer map object itself. The maps are
 * module-level constants in the screens, so one map is one screen's
 * dictionaries, and the entry survives unmount so a revisit of the screen
 * finds its language already loaded. A WeakMap lets a screen module be
 * collected with its dictionaries if it is ever unloaded.
 */
const dictionaryCache = new WeakMap<LanguageModuleMap, Map<string, DictionaryEntry>>();

/*
 * The unsupported languages each importer map has already warned about, so one
 * language costs one warning however many requests repeat it.
 */
const warnedUnsupportedLanguages = new WeakMap<LanguageModuleMap, Set<string>>();

/**
 * Reads the language the bridge currently carries, with en as the fallback
 * while the host has published nothing.
 */
function readBridgeLanguage(bridge: ChildMfeBridge): string {
  const property = bridge.getProperty(FRONTX_SHARED_PROPERTY_LANGUAGE);
  return property && typeof property.value === 'string' ? property.value : FALLBACK_LANGUAGE;
}

/**
 * Reads the cached dictionary for the pair without creating an entry or
 * starting an import: a pure peek a render may run and drop. Starting the
 * shared import belongs to the mount effect's request path, never to render.
 */
function peekDictionary(
  languageModules: LanguageModuleMap,
  language: string
): Record<string, string> | undefined {
  return dictionaryCache.get(languageModules)?.get(language)?.dictionary;
}

/**
 * Returns the cache entry for the pair, creating it - and starting the single
 * shared import - on the first request. A language with no module file
 * resolves to the en entry on every request and is never stored under its own
 * key, so one import serves every unsupported language, with one warning per
 * language; a pair with no module at all, not even en, starts nothing and
 * returns null. A failed import evicts its entry and resolves to null, so the
 * next request retries the import and the failure never reads as a loaded
 * dictionary.
 */
function requestDictionary(
  languageModules: LanguageModuleMap,
  language: string
): DictionaryEntry | null {
  let byLanguage = dictionaryCache.get(languageModules);
  if (!byLanguage) {
    byLanguage = new Map();
    dictionaryCache.set(languageModules, byLanguage);
  }
  const existing = byLanguage.get(language);
  if (existing) {
    return existing;
  }

  const importer = languageModules[moduleKeyFor(language)];
  if (!importer) {
    if (!languageModules[moduleKeyFor(FALLBACK_LANGUAGE)]) {
      return null;
    }
    // No entry is stored under the unsupported language: each request for it
    // resolves to the en entry afresh, so an en failure is evicted under en
    // alone and no key keeps serving a dead entry.
    let warned = warnedUnsupportedLanguages.get(languageModules);
    if (!warned) {
      warned = new Set();
      warnedUnsupportedLanguages.set(languageModules, warned);
    }
    if (!warned.has(language)) {
      warned.add(language);
      console.warn(
        `[useScreenTranslations] No translation module found for language: ${language}, falling back to en`
      );
    }
    return requestDictionary(languageModules, FALLBACK_LANGUAGE);
  }

  const entry: DictionaryEntry = {
    promise: importer()
      .then((module) => module.default ?? {})
      .catch((error) => {
        console.error(`[useScreenTranslations] Failed to load translations for ${language}:`, error);
        // Evict the failed pair so a later mount or switch retries the import
        // instead of being served this entry forever. No aliases point here,
        // so the language's own key is the whole eviction. The dictionary
        // stays unset: a failed import never reads as success.
        byLanguage.delete(language);
        return null;
      }),
  };
  void entry.promise.then((dictionary) => {
    if (dictionary !== null) {
      entry.dictionary = dictionary;
    }
  });
  byLanguage.set(language, entry);
  return entry;
}

interface UseScreenTranslationsReturn {
  t: (key: string) => string;
  loading: boolean;
}

/**
 * Hook for loading MFE-local translations based on the current language from the bridge.
 *
 * @param languageModules - Language module map from `import.meta.glob('./i18n/*.json')`,
 *   held at module level in the screen so every mount shares one cache entry
 * @param bridge - ChildMfeBridge instance
 * @returns Object with `t(key)` function and `loading` state
 */
export function useScreenTranslations(
  languageModules: LanguageModuleMap,
  bridge: ChildMfeBridge
): UseScreenTranslationsReturn {
  /*
   * The initial state only reads the cache: a language already loaded puts its
   * dictionary straight into state, so the first committed frame carries real
   * text with `loading` false. A miss leaves the loading frame up; the import
   * for it starts from the effect below.
   */
  const [state, setState] = useState<{ dictionary: Record<string, string>; loading: boolean }>(() => {
    const dictionary = peekDictionary(languageModules, readBridgeLanguage(bridge));
    return dictionary
      ? { dictionary, loading: false }
      : { dictionary: EMPTY_DICTIONARY, loading: true };
  });

  const latestRequestRef = useRef<TranslationRequest | null>(null);

  /**
   * Applies the dictionary a settled request brought to state, unless a newer
   * request has taken over. Every load path lands its result through this, so
   * the guard against an abandoned request lives in exactly one place. A
   * dictionary already on screen stays there until this language's is in, so
   * a switch never shows the loading frame: `loading` stays false, and the
   * swap lands as one state change when the import settles.
   */
  const applySettledDictionary = useCallback(
    (request: TranslationRequest, dictionary: Record<string, string> | null) => {
      if (latestRequestRef.current !== request) {
        // A newer request took over; this dictionary belongs to an
        // abandoned switch.
        return;
      }
      if (dictionary === null) {
        // The import failed and nothing better exists to show: a switch
        // keeps the dictionary already on screen, a cold mount ends with
        // the empty one it started with. Either way the load ends instead
        // of hanging on `loading`.
        setState((prev) =>
          prev.loading ? { dictionary: prev.dictionary, loading: false } : prev
        );
        return;
      }
      // The dictionary the cache holds may already be the one in state, on a
      // mount whose first render read exactly this entry; serving it again
      // would cost a commit for identical state.
      setState((prev) =>
        prev.dictionary === dictionary && !prev.loading
          ? prev
          : { dictionary, loading: false }
      );
    },
    []
  );

  /**
   * Loads the dictionary for `language` into state. Called from the language
   * subscription, so its state changes run in a callback, never in an effect
   * body; the mount request uses the promise path directly instead.
   */
  const startLoad = useCallback(
    (language: string) => {
      const request: TranslationRequest = { modules: languageModules, language };
      latestRequestRef.current = request;
      const entry = requestDictionary(languageModules, language);
      if (!entry) {
        // No module for this language and no en fallback either: nothing is in
        // flight that could end this load, so end it here with an empty
        // dictionary instead of leaving `loading` stuck on true.
        setState({ dictionary: EMPTY_DICTIONARY, loading: false });
        return;
      }
      if (entry.dictionary) {
        applySettledDictionary(request, entry.dictionary);
        return;
      }
      void entry.promise.then((dictionary) => {
        applySettledDictionary(request, dictionary);
      });
    },
    [applySettledDictionary, languageModules]
  );

  /*
   * The language is read again here rather than trusted from the first render
   * alone: the bridge can hand a new value (or a new instance can carry one)
   * between the first render and this subscription, and a value published in
   * that gap fires no callback.
   *
   * The mount request sets no state in this body: the state initializer
   * already peeked the cache, so on a hit the dictionary is on screen and the
   * settled callback is a no-op, and on a miss this body only starts the
   * shared import, its state landing in the promise callback guarded by
   * latestRequestRef. The request is still recorded, so the subscription
   * treats this language as the current one.
   */
  useEffect(() => {
    const language = readBridgeLanguage(bridge);
    const request: TranslationRequest = { modules: languageModules, language };
    latestRequestRef.current = request;
    const entry = requestDictionary(languageModules, language);
    if (entry) {
      void entry.promise.then((dictionary) => {
        applySettledDictionary(request, dictionary);
      });
    } else {
      // No module for this language and no en fallback either: nothing is in
      // flight that could end this load, so end it from the callback side of
      // the effect like every other path instead of setting state in its body.
      void Promise.resolve().then(() => {
        applySettledDictionary(request, null);
      });
    }
    const unsubscribe = bridge.subscribeToProperty(FRONTX_SHARED_PROPERTY_LANGUAGE, (property) => {
      if (typeof property.value !== 'string') {
        return;
      }
      const current = latestRequestRef.current;
      if (current && current.modules === languageModules && current.language === property.value) {
        return;
      }
      startLoad(property.value);
    });
    return () => {
      unsubscribe();
      // The request belongs to a mounted screen: dropping it here keeps a
      // promise still in flight from calling setState after unmount or after
      // the effect re-runs for a newer request.
      latestRequestRef.current = null;
    };
  }, [applySettledDictionary, bridge, languageModules, startLoad]);

  // Translation function
  const t = useCallback(
    (key: string): string => {
      const translation = state.dictionary[key];
      if (translation === undefined) {
        console.warn(`[useScreenTranslations] Missing translation key: ${key}`);
        return key; // Return key as fallback
      }
      return translation;
    },
    [state.dictionary]
  );

  return { t, loading: state.loading };
}
