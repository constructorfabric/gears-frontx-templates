import { useCallback, useSyncExternalStore } from 'react';

/** No window (a server render, a Node test) and no media-query engine both read as "no match". */
const hasMatchMedia = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function';

/**
 * Viewport state the panes need in JavaScript rather than in CSS.
 *
 * Which single pane a phone shows depends on whether a conversation is open,
 * and whether the folder column's own toggle is meaningful depends on the
 * width - neither is something a media query can decide on its own, so the
 * breakpoints that drive state live here and the ones that only hide a box
 * stay in the stylesheet.
 *
 * `useSyncExternalStore` rather than state plus an effect: it reads the match
 * during render, so a new query answers immediately, and it re-reads right
 * after subscribing, so a breakpoint crossed between that render and the
 * subscription is not missed (`change` never replays what it missed).
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!hasMatchMedia()) return () => undefined;
      const mediaQuery = window.matchMedia(query);
      mediaQuery.addEventListener('change', onChange);
      return () => mediaQuery.removeEventListener('change', onChange);
    },
    [query]
  );

  return useSyncExternalStore(
    subscribe,
    () => hasMatchMedia() && window.matchMedia(query).matches,
    () => false
  );
}

/** Below this the folder column has no room and stays collapsed. */
export const COMPACT_QUERY = '(max-width: 48rem)';

/** Below this the list and the thread take turns filling the mount area. */
export const SINGLE_PANE_QUERY = '(max-width: 40rem)';
