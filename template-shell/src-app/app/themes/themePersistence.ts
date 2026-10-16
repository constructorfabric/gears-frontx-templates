/**
 * Theme persistence: the theme a user picks survives a reload.
 *
 * The shell owns this rather than FrontX Studio, because Studio is a dev tool
 * and a built app has to remember the choice as well. Storage is read and
 * written through try/catch: a private window, blocked site data or a full
 * quota makes `localStorage` throw, and none of that may stop the app from
 * booting or a theme from switching. Losing the choice is the worst case.
 */
import type { ThemeRegistry } from '@gears-frontx/react';

/** localStorage key holding the id of the last applied theme. */
export const THEME_STORAGE_KEY = 'frontx:theme';

function readStoredThemeId(): string | null {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeThemeId(themeId: string): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, themeId);
  } catch {
    // Not remembered this time; the theme itself is already applied.
  }
}

/**
 * Applies the theme stored by an earlier session, or `fallbackId` when none is
 * stored or the stored one is no longer registered, then stores every theme
 * the registry applies from here on. Call it once, after every theme is
 * registered. Whatever applies a theme later (Studio, a screen's set_theme
 * action, `app.actions.changeTheme`) goes through the registry, so each of
 * them is remembered without knowing about this module.
 */
export function applyPersistedTheme(registry: ThemeRegistry, fallbackId: string): void {
  const storedId = readStoredThemeId();
  registry.apply(storedId !== null && registry.get(storedId) ? storedId : fallbackId);

  registry.subscribe(() => {
    const current = registry.getCurrent();
    if (current) storeThemeId(current.id);
  });
}
