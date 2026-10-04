/**
 * useDomainRouteStatus Hook - a routed domain's own URL-entry status
 *
 * Shell-scoped, not app-wide: a host that renders its own fallback UI for an
 * unresolved address (e.g. "no screen matches this address") reads a routed
 * domain's own status this way instead of through `app.mfeRouter` — ADR
 * 0036/D10 keep that handle to the navigation facade alone, so this status
 * is reached through the same framework-internal path `ExtensionDomainSlot`
 * itself uses to start/stop the domain's observer, not through the app
 * object every MFE builds.
 *
 * React Layer: L3
 */

import { useCallback, useSyncExternalStore } from 'react';
import type { MfeRegistry } from '@gears-frontx/framework';
// Framework-internal reach-through (never MFE-reachable) — the same path
// `ExtensionDomainSlot` itself uses to start/stop the domain's observer.
import { routedDomainStatus, subscribeRoutedDomainStatus } from '@gears-frontx/framework/internal';

export interface DomainRouteStatus {
  readonly entries: number;
  readonly unresolved: number;
}

const NO_STATUS: DomainRouteStatus = { entries: 0, unresolved: 0 };
const noSubscribe = () => () => {};

/**
 * @param registry - the domain's own `MfeRegistry`, or `undefined` before a
 *   host is ready to read this domain's status (e.g. before bootstrap).
 * @param domainId - the routed domain to observe.
 */
export function useDomainRouteStatus(
  registry: MfeRegistry | undefined,
  domainId: string,
): DomainRouteStatus {
  // Memoized on `registry`/`domainId` alone (C4): an inline arrow recreated
  // on every render would tear down and rebuild `useSyncExternalStore`'s
  // subscription every render for no reason.
  const subscribe = useCallback(
    (callback: () => void) =>
      registry ? subscribeRoutedDomainStatus(registry, domainId, callback) : noSubscribe(),
    [registry, domainId],
  );
  return useSyncExternalStore(
    subscribe,
    () => (registry ? routedDomainStatus(registry, domainId) : NO_STATUS),
  );
}
