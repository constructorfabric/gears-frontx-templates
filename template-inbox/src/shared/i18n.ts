/**
 * The app's UI strings, and the locale every formatter reads.
 *
 * One catalogue, `en`, shipped as JSON so it stays a file a translator can be
 * handed rather than strings scattered through JSX. A support-inbox vocabulary
 * in every language a project needs is that project's content, not something a
 * template should invent - adding `src/i18n/<lang>.json` and choosing between
 * them (with the matching `locale`) is the seam left open here.
 *
 * It lives in `shared/` rather than in the app chrome because the formatters
 * in `shared/format.ts` and the screens' own selectors read `locale` too, and
 * the layer rules keep `shared/` from reaching up into `app/`.
 *
 * The catalogue stays flat. A value can name parameters in braces
 * (`"Reply to {name}..."`), and a key that depends on a count comes in plural
 * forms suffixed with the `Intl.PluralRules` category (`people_count_one`,
 * `people_count_other`); `t('people_count', { count })` picks the form. A
 * number parameter is written with the locale's digit grouping.
 *
 * A missing key returns the key itself and says so once in the console: a
 * screen with a visible `reply_placeholder` in it is a bug that reports itself,
 * where a blank string would just look like a design choice.
 */

import en from '../i18n/en.json';

/** The locale of the shipped catalogue, and of every `Intl` formatter in the app. */
export const locale = 'en-US';

export type TranslateParams = Readonly<Record<string, string | number>>;

export type Translate = (key: string, params?: TranslateParams) => string;

const PARAMETER = /\{(\w+)\}/g;

/**
 * A translator over one catalogue. The app uses the single instance below;
 * a test builds its own to exercise the rules without depending on the
 * shipped wording.
 */
export function createTranslate(
  catalogue: Readonly<Record<string, string>>,
  catalogueLocale: string
): Translate {
  const pluralRules = new Intl.PluralRules(catalogueLocale);
  const numberFormat = new Intl.NumberFormat(catalogueLocale);
  const reported = new Set<string>();

  const templateFor = (key: string, params: TranslateParams | undefined): string | undefined => {
    const count = params?.count;
    if (typeof count === 'number') {
      const plural = catalogue[`${key}_${pluralRules.select(count)}`] ?? catalogue[`${key}_other`];
      if (plural !== undefined) return plural;
    }
    return catalogue[key];
  };

  return (key, params) => {
    const template = templateFor(key, params);
    if (template === undefined) {
      if (!reported.has(key)) {
        reported.add(key);
        console.warn(`[inbox] Missing translation key: ${key}`);
      }
      return key;
    }
    if (params === undefined) return template;
    // A parameter the call did not pass stays visible as `{name}`, for the
    // same reason a missing key does.
    return template.replace(PARAMETER, (placeholder, name: string) => {
      const value = params[name];
      if (value === undefined) return placeholder;
      return typeof value === 'number' ? numberFormat.format(value) : value;
    });
  };
}

export const t: Translate = createTranslate(en, locale);
