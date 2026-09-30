import { useMemo } from 'react';
import { FRONTX_SHARED_PROPERTY_LANGUAGE, type ChildMfeBridge } from '@gears-frontx/react';
import { useBridgeProperty } from '../lifecycle/useBridgeProperty';
import sharedEn from './en.json';
import { createTranslate, locale, type Translate } from './translate';

/** A catalogue per language code (`en`, `de`, ...), as a package's own `src/i18n/*.json` provide them. */
export type InboxCatalogues = Readonly<Record<string, Readonly<Record<string, string>>>>;

/** The shared components' catalogues. Only `en` ships; a project adds a file beside `en.json` and names it here. */
const SHARED_CATALOGUES: InboxCatalogues = { en: sharedEn };

/** The language every catalogue is complete in, and the one an unknown language falls back to. */
export const FALLBACK_LANGUAGE = 'en';

/**
 * The shared catalogue with the package's own merged over it, for `language`,
 * or for `en` when either layer has no catalogue in that language. Falling
 * back as a whole rather than key by key keeps a screen in one language: a
 * half-translated screen reads as a bug, an English one as a missing
 * translation.
 */
export function catalogueFor(language: string, packageCatalogues: InboxCatalogues): Readonly<Record<string, string>> {
  const known = SHARED_CATALOGUES[language] !== undefined && packageCatalogues[language] !== undefined;
  const chosen = known ? language : FALLBACK_LANGUAGE;
  return { ...SHARED_CATALOGUES[chosen], ...packageCatalogues[chosen] };
}

/**
 * The translator for the language the shell publishes, rebuilt when the shell
 * switches language. `locale` stays the shipped catalogue's (`en-US`) while
 * `en` is the only catalogue: a formatter writing German dates beside English
 * words would read worse than either.
 *
 * @param bridge - The screen's bridge, read for the shared language property
 * @param packageCatalogues - The package's own catalogues, by language code
 */
export function useInboxTranslate(bridge: ChildMfeBridge, packageCatalogues: InboxCatalogues): Translate {
  const language = useBridgeProperty<unknown>(bridge, FRONTX_SHARED_PROPERTY_LANGUAGE, FALLBACK_LANGUAGE);
  const code = typeof language === 'string' ? language : FALLBACK_LANGUAGE;
  return useMemo(() => createTranslate(catalogueFor(code, packageCatalogues), locale), [code, packageCatalogues]);
}
