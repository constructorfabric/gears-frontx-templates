/**
 * useBridgeProperty Hook
 *
 * Subscribes a screen to one of the host's shared bridge properties
 * (e.g. theme or language) and keeps the returned value in sync:
 *
 * 1. Reads the current value during render, so the first paint already
 *    reflects the host's current property (no extra render from a mount
 *    effect).
 * 2. Subscribes to subsequent property changes and unsubscribes on unmount.
 *    `useSyncExternalStore` reads the value once more after subscribing, so
 *    a change published between the first render and the subscription is
 *    not lost either.
 *
 * The bridge instance is stable for the component's whole lifetime: the
 * runtime retains one bridge per extension across every mount/unmount cycle
 * (see `MfeBridge` in @gears-frontx/mfes handler types), and the React
 * lifecycle renders a fresh root per mount. The hook therefore does not
 * guard against a bridge swap.
 *
 * The value is passed through untouched. Validating it against the
 * property's schema is the type-system plugin's responsibility, so the hook
 * does no runtime type filtering; the caller names the expected type via the
 * fallback.
 *
 * Related: useSharedProperty in @gears-frontx/react is the same concept,
 * but it pulls the bridge from MfeContext (which an inbox frame never mounts)
 * and has no fallback; this hook takes the bridge as an argument instead.
 *
 * Usage in screen component:
 * ```tsx
 * const theme = useBridgeProperty(bridge, FRONTX_SHARED_PROPERTY_THEME, 'default');
 * const language = useBridgeProperty(bridge, FRONTX_SHARED_PROPERTY_LANGUAGE, 'en');
 * ```
 */

import { useCallback, useSyncExternalStore } from 'react';
import type { ChildMfeBridge } from '@gears-frontx/react';

/**
 * Hook returning the live value of a shared bridge property.
 *
 * @param bridge - ChildMfeBridge instance
 * @param propertyId - Shared property id (e.g. FRONTX_SHARED_PROPERTY_THEME)
 * @param fallback - Value used while the property is not yet published
 * @returns The current value of the property
 */
export function useBridgeProperty<T>(bridge: ChildMfeBridge, propertyId: string, fallback: T): T {
  const subscribe = useCallback(
    (onChange: () => void) => bridge.subscribeToProperty(propertyId, onChange),
    [bridge, propertyId]
  );
  // The value, not the property object, is the snapshot: the value is what
  // the host published, and it stays the same reference until it changes.
  const read = () => bridge.getProperty(propertyId)?.value;
  const value = useSyncExternalStore(subscribe, read, read);
  // SharedProperty.value is `unknown`; the schema check already happened in
  // the type-system plugin, so the caller's T is the only narrowing left.
  return value === undefined ? fallback : (value as T);
}
