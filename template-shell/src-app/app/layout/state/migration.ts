/**
 * Layout state accessors for code migrating from the deprecated
 * `@gears-frontx/uicore` package, where the layout domains were read from
 * `state.uicore.header`, `state.uicore.menu`, etc.
 */

import type { RootStateWithLayout } from './types';

/**
 * Get layout domain state from the new structure
 * Maps to what was previously `state.uicore.header`, `state.uicore.menu`, etc.
 */
export function getLayoutDomainState<K extends keyof RootStateWithLayout['layout']>(
  state: RootStateWithLayout,
  domain: K
): RootStateWithLayout['layout'][K] {
  return state.layout[domain];
}

/**
 * Check if a state object has the new layout structure
 */
export function hasNewLayoutState(state: unknown): state is RootStateWithLayout {
  return (
    typeof state === 'object' &&
    state !== null &&
    'layout' in state &&
    typeof (state as Record<string, unknown>).layout === 'object'
  );
}
