import { useTranslation } from '@gears-frontx/react';

/**
 * One word of the shell's own chrome, in the current language.
 *
 * The shell namespace loads its dictionary asynchronously (the loader is
 * registered in `shellTranslations.ts`), and the registry answers a
 * dictionary miss by returning the raw key (`I18nRegistry.t`). A render that
 * outruns the load would draw that key, and a load that fails leaves it on
 * the page for good, so a miss is answered with the plain-English word
 * instead: the chrome may show the English word a moment too long, but never
 * a key.
 *
 * The registry is read through `useTranslation`, so a language change and a
 * dictionary load both re-render the caller and the word follows.
 */
export function useShellWord(key: string, englishFallback: string): string {
  const { t } = useTranslation();
  const translated = t(key);
  return translated === key ? englishFallback : translated;
}
