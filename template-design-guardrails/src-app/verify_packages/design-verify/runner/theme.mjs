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
 * Checking. The theme registry stamps the applied theme's appearance as
 * `data-theme` on the document element on every apply
 * (packages/framework/src/registries/themeRegistry.ts), and the kit's token
 * blocks key on that attribute, so it is what the page renders by. The
 * applied id is not in the DOM, but after boot the shell's key always holds
 * the id of the applied theme: the boot theme (the fallback in place of an
 * unregistered id) and every theme applied later. So every requested id must
 * be the stored one: a different stored id names the theme that won, and an
 * id the app has not registered (`--themes drakula`) reads back as the
 * fallback. A requested `light` or `dark` must also show that `data-theme`.
 * Either mismatch is an environment failure for the state.
 */

/** The key the shell restores its theme from: a raw registry id. */
export const SHELL_THEME_KEY = 'frontx:theme';

/** The key FrontX Studio restores its theme from: a JSON-encoded registry id. */
export const STUDIO_THEME_KEY = 'frontx:studio:theme';

/** Theme ids that are also `data-theme` appearances. */
const APPEARANCES = new Set(['light', 'dark']);

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
 * The page expression that reads what theme the page is in: the `data-theme`
 * attribute and the id stored under the shell's key.
 *
 * @param {string} themeKey
 */
export function appliedThemeExpression(themeKey) {
  return (
    `({ attribute: document.documentElement.getAttribute('data-theme'), ` +
    `stored: localStorage.getItem(${JSON.stringify(themeKey)}) })`
  );
}

/**
 * Why the page is not in the requested theme, or undefined when it is.
 *
 * @param {string} theme the requested theme id
 * @param {{value?: {attribute?: string | null, stored?: string | null}, error?: string}} read
 *   the result of evaluating appliedThemeExpression
 * @param {string} themeKey
 * @returns {string | undefined}
 */
export function themeMismatch(theme, read, themeKey) {
  if (read.error !== undefined || !read.value) {
    return `could not read the applied theme (requested "${theme}"): ${read.error ?? 'no value'}`;
  }
  const attribute = read.value.attribute ?? null;
  const stored = read.value.stored ?? null;
  if ((!APPEARANCES.has(theme) || attribute === theme) && stored === theme) return undefined;
  return (
    `theme not applied: requested "${theme}", the page shows data-theme=${JSON.stringify(attribute)} ` +
    `and localStorage "${themeKey}" holds ${JSON.stringify(stored)}; ` +
    `is "${themeKey}" the key the app restores its theme from, and "${theme}" a registered theme id?`
  );
}
