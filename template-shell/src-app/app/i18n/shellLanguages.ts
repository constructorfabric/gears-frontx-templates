/**
 * The languages this project offers its end users.
 *
 * The i18n SDK carries 36 languages, but a project ships words for the ones
 * it actually speaks, so the shell offers a shorter list: this array is the
 * one place to edit it. The header's language control lists these entries in
 * this order, the language persistence applies only codes found here, and a
 * user language arriving from the API counts as a choice only when it is
 * listed.
 *
 * Names come from the SDK's own language metadata (the native name, so every
 * entry reads as its speakers write it), never from a copy here: editing the
 * list must not mean retyping words the SDK already knows.
 */

import { Language, getLanguageMetadata, type LanguageMetadata } from '@gears-frontx/react';

/** The codes the shell offers, in the order the header control lists them. */
const SHELL_LANGUAGE_CODES: readonly Language[] = [Language.English, Language.German];

/**
 * The listed languages with their SDK metadata, in the declared order. A code
 * the SDK does not know is dropped rather than crashing the shell, so a typo
 * in the list costs one missing entry instead of a broken boot.
 */
export const SHELL_LANGUAGES: LanguageMetadata[] = SHELL_LANGUAGE_CODES.map((code) =>
  getLanguageMetadata(code),
).filter((metadata): metadata is LanguageMetadata => metadata !== undefined);

/**
 * Whether a language code is one the shell offers. Accepts the wider shapes
 * the callers read from storage and from the API, so both can ask before they
 * apply anything.
 */
export function isShellLanguage(code: string | null | undefined): code is Language {
  return (
    typeof code === 'string' && SHELL_LANGUAGES.some((metadata) => metadata.code === code)
  );
}
