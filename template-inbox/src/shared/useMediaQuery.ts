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

/*
 * The pane breakpoints, in one place. The widths they are made of: the icon
 * rail 4rem, the folder column 12rem, the list 22rem, and 24rem as the
 * narrowest thread or reading pane that stays usable (a few words per line
 * and the header's actions on a line under the title).
 *
 * - Up to 40rem (640px) the list and the thread take turns: the rail, a
 *   list of any useful width and a 24rem thread do not fit side by side.
 * - Up to 62rem (992px) the folder column starts folded: 4 + 12 + 22 + 24
 *   is 62rem, so below it the column would squeeze the list and the thread.
 *   Opened by hand there, it lays over the screen as a sheet
 *   (`SideColumn`) rather than taking the list's width. Between the two
 *   widths the list gives way (`.listPane` shrinks) while the thread keeps
 *   its 24rem (`.detailPane`), so the page never scrolls sideways.
 * - Wider, all three columns show at their full widths.
 *
 * CSS cannot read these constants: `.listPane` in `shared.module.css`
 * repeats the 40rem, and `.detailPane` the 24rem.
 */

/** Below this the folder column starts folded, so the list and the thread keep their room. */
export const COMPACT_QUERY = '(max-width: 62rem)';

/** Below this the list and the thread take turns filling the mount area. */
export const SINGLE_PANE_QUERY = '(max-width: 40rem)';
