// @cpt-FEATURE:route-ownership-signal:p1

import { createRouteSignal, resolveNavigationHistory, type DomainKey, type NavigationHistory, type RouteSignal } from '@gears-frontx/routing';
import { DomainRouting, buildEntryAddresses, rootDomainKeyOf, FRONTX_SHARED_PROPERTY_ENTRY_ADDRESSES } from '@gears-frontx/frontx-template-shell';
import {
  FRONTX_ACTION_MOUNT_EXT,
  FRONTX_ACTION_UNMOUNT_EXT,
  screenDomain,
  sidebarDomain,
  popupDomain,
  overlayDomain,
  type ExtensionDomain,
  type MfeRegistry,
} from '@gears-frontx/react';

export interface ShellNavigation {
  readonly history: NavigationHistory;
  readonly signal: RouteSignal;
}

let navigation: ShellNavigation | undefined;

/** The shell calls `resolveNavigationHistory()` and `createRouteSignal(history)` once each — the only call sites in this app. */
export function shellNavigation(): ShellNavigation {
  if (!navigation) {
    const history = resolveNavigationHistory();
    navigation = { history, signal: createRouteSignal(history) };
  }
  return navigation;
}

export interface ShellRouting {
  readonly screen: DomainRouting;
  readonly sidebar: DomainRouting;
  readonly popup: DomainRouting;
  readonly overlay: DomainRouting;
  readonly domains: ReadonlyArray<{ readonly domainId: string; readonly domainKey: DomainKey }>;
  /** Re-broadcast the entry addresses; call after each package's registrations, before anything can mount it. */
  broadcastAddresses(): void;
  /** Create the four observers once discovery has settled: bootstrap resolved and the screen slot attached. */
  start(): void;
}

/**
 * One `DomainRouting` per shell domain (O4), all `single`-cardinality: the
 * shell's own screen/sidebar/popup/overlay are exclusive-occupant domains
 * (a nested `multiple`-cardinality domain, like Widgets Host's own widgets
 * domain, is a different host's `ShellRouting`-shaped wiring, built in T7).
 * The screen domain declares no unmount action (`ScreenDomainImpl` never
 * registers one), so its `DomainRouting` gets no `unmountActionType`.
 */
export function createShellRouting(registry: MfeRegistry, nav: ShellNavigation = shellNavigation()): ShellRouting {
  const keyOf = (domain: ExtensionDomain): DomainKey => {
    const key = rootDomainKeyOf(domain);
    if (!key) throw new Error(`[Shell routing] domain ${domain.id} declares no valid route`);
    return key;
  };
  const make = (domain: ExtensionDomain, unmountable: boolean) =>
    new DomainRouting({
      history: nav.history,
      signal: nav.signal,
      registry,
      domainId: domain.id,
      domainKey: keyOf(domain),
      mountActionType: FRONTX_ACTION_MOUNT_EXT,
      unmountActionType: unmountable ? FRONTX_ACTION_UNMOUNT_EXT : undefined,
      cardinality: 'single',
    });
  const byName = { screen: make(screenDomain, false), sidebar: make(sidebarDomain, true), popup: make(popupDomain, true), overlay: make(overlayDomain, true) };
  const domains = [screenDomain, sidebarDomain, popupDomain, overlayDomain].map((d) => ({ domainId: d.id, domainKey: keyOf(d) }));
  return {
    ...byName,
    domains,
    broadcastAddresses() {
      registry.updateSharedProperty(FRONTX_SHARED_PROPERTY_ENTRY_ADDRESSES, buildEntryAddresses(registry, domains));
    },
    start() {
      for (const routing of Object.values(byName)) routing.start();
    },
  };
}
