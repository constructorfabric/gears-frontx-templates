/**
 * How the render runner puts the app in a theme and checks that it took.
 *
 * Seeding. The shell owns theme persistence
 * (template-shell src-app/app/themes/themePersistence.ts): at boot it applies
 * the registry id stored as a raw string under `frontx:theme` (the `default`
 * theme when nothing or an unregistered id is stored), stores the id that
 * took, and stores every theme applied after that. FrontX Studio, in dev
 * builds that include it, restores
 * its own `frontx:studio:theme` (a JSON string, utils/persistence.ts) after
 * mount and applies it over the shell's choice, and it stores every theme
 * change there; a value left by an earlier session or in an attached browser
 * would win. So the runner writes the shell's key (`--theme-key`) and
 * Studio's key, each in its own format; without Studio the second key is
 * never read.
 *
 * Checking. Storage is the runner's own input, so it never proves anything:
 * a key the app does not read (`--theme-key unused:key`) still holds what the
 * runner wrote. The proof is the app's: the shell stamps the registry id of
 * the applied theme as `data-theme-id` on the document element, right after
 * the boot apply and on every later apply
 * (template-shell src-app/app/themes/themeIdAttribute.ts), next to the
 * `data-theme` appearance the theme registry stamps. A state is measured only
 * when `data-theme-id` equals the requested id. Another id (the fallback in
 * place of an unregistered `--themes drakula`, or a theme Studio applied over
 * the seed) is an environment failure for the state, and so is a page with no
 * `data-theme-id`: the app cannot confirm its theme. `data-theme` and the
 * stored id appear in the message as context only.
 */

/** The key the shell restores its theme from: a raw registry id. */
export const SHELL_THEME_KEY = 'frontx:theme';

/** The key FrontX Studio restores its theme from: a JSON-encoded registry id. */
export const STUDIO_THEME_KEY = 'frontx:studio:theme';

/** The attribute on the document element naming the applied theme's registry id. */
export const THEME_ID_ATTRIBUTE = 'data-theme-id';

/**
 * The page expression that stores `theme` where the app restores it from.
 * Takes effect on the next load.
 *
 * @param {string} themeKey the shell's key (`--theme-key`)
 * @param {string} theme a theme registry id
 */
export function themeSeedExpression(themeKey, theme) {
  const entries = [
    [themeKey, theme],
    [STUDIO_THEME_KEY, JSON.stringify(theme)],
  ];
  return `(() => { for (const [key, value] of ${JSON.stringify(entries)}) localStorage.setItem(key, value); })()`;
}

/**
 * The page expression that reads what theme the page is in: the
 * `data-theme-id` and `data-theme` attributes and, as context, the id stored
 * under the shell's key.
 *
 * @param {string} themeKey
 */
export function appliedThemeExpression(themeKey) {
  return (
    `({ id: document.documentElement.getAttribute(${JSON.stringify(THEME_ID_ATTRIBUTE)}), ` +
    `attribute: document.documentElement.getAttribute('data-theme'), ` +
    `stored: localStorage.getItem(${JSON.stringify(themeKey)}) })`
  );
}

/**
 * Why the page is not confirmed in the requested theme, or undefined when it
 * is. Only `data-theme-id` decides.
 *
 * @param {string} theme the requested theme id
 * @param {{value?: {id?: string | null, attribute?: string | null, stored?: string | null}, error?: string}} read
 *   the result of evaluating appliedThemeExpression
 * @param {string} themeKey
 * @returns {string | undefined}
 */
export function themeMismatch(theme, read, themeKey) {
  if (read.error !== undefined || !read.value) {
    return `could not read the applied theme (requested "${theme}"): ${read.error ?? 'no value'}`;
  }
  const id = read.value.id ?? null;
  if (id === theme) return undefined;
  const context =
    `data-theme=${JSON.stringify(read.value.attribute ?? null)}; ` +
    `localStorage "${themeKey}" holds ${JSON.stringify(read.value.stored ?? null)}`;
  if (id === null) {
    return (
      `theme not confirmed: requested "${theme}", the page has no ${THEME_ID_ATTRIBUTE} on <html> (${context}); ` +
      `the app must stamp the applied theme's registry id there on every apply ` +
      `(the template shell does it in src-app/app/themes/themeIdAttribute.ts)`
    );
  }
  return (
    `theme not applied: requested "${theme}", the page shows ${THEME_ID_ATTRIBUTE}=${JSON.stringify(id)} (${context}); ` +
    `is "${themeKey}" the key the app restores its theme from, and "${theme}" a registered theme id?`
  );
}
