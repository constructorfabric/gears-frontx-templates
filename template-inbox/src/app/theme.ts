/**
 * Light/dark, as the kit's own tokens define it.
 *
 * `@gears-frontx/ui-kit/theme.css` repaints every token from `data-theme` on
 * the root element, and with no attribute at all it follows the operating
 * system's `prefers-color-scheme`. That fallback is what the first paint uses:
 * `index.html` carries no `data-theme`, so the page renders in the visitor's
 * system theme before any script runs, and there is no flash to correct.
 *
 * Only an explicit choice sets the attribute. `applyStoredTheme` restores a
 * choice made on an earlier visit, early in the entry module; the toggle writes
 * a new one. A visitor who never toggles keeps following the system theme,
 * including when it changes while the tab is open.
 */

import { useCallback, useState } from 'react';
import { useMediaQuery } from '../shared/useMediaQuery';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'frontx.inbox.theme';

export const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

const isTheme = (value: string | null): value is Theme => value === 'light' || value === 'dark';

/**
 * Reading web storage throws outright in a browser configured to block site
 * data, so a stored preference is a best-effort input, never a precondition.
 */
const readStoredTheme = (): Theme | null => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isTheme(stored) ? stored : null;
  } catch {
    return null;
  }
};

const writeStoredTheme = (theme: Theme): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // A preference that cannot be persisted still applies for this session.
  }
};

/** The system theme, which is what the kit paints while no choice is stored. */
const systemTheme = (): Theme =>
  typeof window.matchMedia === 'function' && window.matchMedia(DARK_SCHEME_QUERY).matches
    ? 'dark'
    : 'light';

/** The explicit `data-theme` on the root, or `null` while the system theme applies. */
const readExplicitTheme = (): Theme | null => {
  const applied = document.documentElement.getAttribute('data-theme');
  return isTheme(applied) ? applied : null;
};

/** The theme on screen: an explicit `data-theme`, or the system theme without one. */
export const readAppliedTheme = (): Theme => readExplicitTheme() ?? systemTheme();

const applyTheme = (theme: Theme): void => {
  document.documentElement.setAttribute('data-theme', theme);
};

/** Called from the entry module, before the first render. */
export const applyStoredTheme = (): Theme => {
  const stored = readStoredTheme();
  if (stored === null) {
    document.documentElement.removeAttribute('data-theme');
    return systemTheme();
  }
  applyTheme(stored);
  return stored;
};

/**
 * The theme on screen and the toggle. Without an explicit choice it is the
 * system scheme read through `useMediaQuery`, so an operating-system switch
 * while the tab is open moves the toggle's icon and label along with the
 * repaint the kit's CSS already does.
 */
export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  const systemDark = useMediaQuery(DARK_SCHEME_QUERY);
  const [explicit, setExplicit] = useState<Theme | null>(readExplicitTheme);
  const theme: Theme = explicit ?? (systemDark ? 'dark' : 'light');

  // The toggle is the only writer: mounting the hook applies and stores
  // nothing, so a visitor who never toggles keeps following the system.
  const toggleTheme = useCallback(() => {
    const next: Theme = readAppliedTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    writeStoredTheme(next);
    setExplicit(next);
  }, []);

  return { theme, toggleTheme };
}
