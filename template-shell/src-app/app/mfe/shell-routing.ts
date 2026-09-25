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
let currentRouting: ShellRouting | undefined;

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
  /**
   * Release all four domains' observers (`DomainRouting.stop()`). Paired
   * with `start()` — the screen slot's `onDetached` calls this so a
   * teardown of the container (not just of one mounted screen) does not
   * leave four stale history subscriptions behind it.
   */
  stop(): void;
}

/**
 * One `DomainRouting` per shell domain (O4), all `single`-cardinality: the
 * shell's own screen/sidebar/popup/overlay are exclusive-occupant domains
 * (a nested `multiple`-cardinality domain, like Widgets Host's own widgets
 * domain, is a different host's `ShellRouting`-shaped wiring, built in T7).
 * The screen domain declares no unmount action (`ScreenDomainImpl` never
 * registers one), so its `DomainRouting` gets no `unmountActionType`.
 *
 * `nav` is required, not defaulted to `shellNavigation()`: `bootstrapMFE` is
 * the only production caller, and it already resolves its own `nav` default
 * before calling this — defaulting it again here would just be a second,
 * unreachable copy of the same fallback.
 */
export function createShellRouting(registry: MfeRegistry, nav: ShellNavigation): ShellRouting {
  const keyOf = (domain: ExtensionDomain): DomainKey => {
    const key = rootDomainKeyOf(domain);
    if (!key) throw new Error(`[Shell routing] domain ${domain.id} declares no valid route`);
    return key;
  };
  const make = (domain: ExtensionDomain, unmountable: boolean) => {
    const domainKey = keyOf(domain);
    return {
      domainId: domain.id,
      domainKey,
      routing: new DomainRouting({
        history: nav.history,
        signal: nav.signal,
        registry,
        domainId: domain.id,
        domainKey,
        mountActionType: FRONTX_ACTION_MOUNT_EXT,
        unmountActionType: unmountable ? FRONTX_ACTION_UNMOUNT_EXT : undefined,
        cardinality: 'single',
      }),
    };
  };
  // Each domain's `keyOf` runs exactly once here — `domains` below is built
  // FROM these same entries rather than by walking the four domain
  // declarations a second time (C7).
  const entries = {
    screen: make(screenDomain, false),
    sidebar: make(sidebarDomain, true),
    popup: make(popupDomain, true),
    overlay: make(overlayDomain, true),
  };
  const byName = {
    screen: entries.screen.routing,
    sidebar: entries.sidebar.routing,
    popup: entries.popup.routing,
    overlay: entries.overlay.routing,
  };
  const domains = Object.values(entries).map(({ domainId, domainKey }) => ({ domainId, domainKey }));
  const routing: ShellRouting = {
    ...byName,
    domains,
    broadcastAddresses() {
      registry.updateSharedProperty(FRONTX_SHARED_PROPERTY_ENTRY_ADDRESSES, buildEntryAddresses(registry, domains));
    },
    start() {
      for (const domainRouting of Object.values(byName)) domainRouting.start();
    },
    stop() {
      for (const domainRouting of Object.values(byName)) domainRouting.stop();
    },
  };
  // HMR replaces this module's exports with a fresh copy, whose own
  // `navigation` module var starts `undefined` again — the NEXT
  // `shellNavigation()` call would then build a second history/signal pair
  // sharing the same DOM/browser history object, while this OLD module
  // instance's `DomainRouting`s stay subscribed to the first pair forever
  // (nothing else ever calls their `stop()`). Releasing them here, and
  // clearing the singleton, is what lets the replacement module start clean
  // instead of doubling up dispatches from two live observer sets.
  currentRouting = routing;
  return routing;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    currentRouting?.stop();
    currentRouting = undefined;
    navigation = undefined;
  });
}
