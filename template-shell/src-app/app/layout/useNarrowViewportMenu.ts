/**
 * Keeps the main menu out of the screen's way on narrow viewports.
 *
 * Below the `md` breakpoint (768 px) the expanded menu is laid over the screen
 * instead of beside it (see `Sidebar` in `components/ui/sidebar.tsx`), so the
 * screen keeps the full width. This hook supplies the behaviour that goes with
 * an overlay: the menu starts collapsed, collapses again once one of its items
 * is chosen (the open screen included) or the mounted screen changes by any
 * other route, closes on Escape, and offers `collapse` for the backdrop beside
 * it. On wider viewports it does nothing and the menu stays wherever the user
 * put it.
 */
import { useCallback, useEffect, useRef, useSyncExternalStore, type RefObject } from 'react';
import {
  eventBus,
  useAppSelector,
  useMountedExtensions,
  FRONTX_SCREEN_DOMAIN,
  type MenuState,
} from '@gears-frontx/react';

/** The viewports below Tailwind's `md` breakpoint, which `max-md:` classes target. */
export const NARROW_VIEWPORT_QUERY = '(max-width: 767.98px)';

function subscribeNarrow(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia(NARROW_VIEWPORT_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function isNarrowViewport(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(NARROW_VIEWPORT_QUERY).matches;
}

export interface NarrowViewportMenu {
  /** The viewport is narrow and the menu is expanded over the screen. */
  overlaid: boolean;
  /** Collapses the menu. */
  collapse: () => void;
}

/**
 * @param menuSlot the element holding the menu; a click on one of its items
 *   (`[data-sidebar="menu-item"]`, as `components/ui/sidebar.tsx` marks them)
 *   collapses the overlaid menu. The menu's own collapse toggle is not an item.
 */
export function useNarrowViewportMenu(menuSlot: RefObject<HTMLElement | null>): NarrowViewportMenu {
  const narrow = useSyncExternalStore(subscribeNarrow, isNarrowViewport, () => false);
  const menuState = useAppSelector((state) => state['layout/menu'] as MenuState | undefined);
  const collapsed = menuState?.collapsed ?? false;
  const mountedId = useMountedExtensions(FRONTX_SCREEN_DOMAIN)[0]?.id;

  // Read through a ref so that expanding the menu does not itself trigger the
  // collapse below; only a viewport or screen change does.
  // Effects run in order, so this one has updated the ref before the next reads it.
  const collapsedRef = useRef(collapsed);
  useEffect(() => {
    collapsedRef.current = collapsed;
  }, [collapsed]);

  const collapse = useCallback(() => {
    eventBus.emit('layout/menu/collapsed', { collapsed: true });
  }, []);

  useEffect(() => {
    if (narrow && !collapsedRef.current) collapse();
  }, [narrow, mountedId, collapse]);

  const overlaid = narrow && !collapsed;

  // Choosing an item closes the overlay even when the item is the open
  // screen, which mounts nothing new for the effect above to see.
  useEffect(() => {
    const slot = menuSlot.current;
    if (!overlaid || !slot) return;
    const onClick = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('[data-sidebar="menu-item"]')) collapse();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') collapse();
    };
    slot.addEventListener('click', onClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      slot.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [overlaid, menuSlot, collapse]);

  return { overlaid, collapse };
}
