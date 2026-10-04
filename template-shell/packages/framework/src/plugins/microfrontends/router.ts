/**
 * Framework Router — the concrete implementation of the `mfes` runtime's
 * `RouterPort` (`cpt-frontx-adr-extension-routing-port`). Template territory:
 * no `@cpt-` marker in this file binds anything upstream.
 *
 * Owns, per routed domain registered on the `MfeRegistry` it is injected
 * into: admission (route validity and page-wide route uniqueness among the
 * routed domains live in the page, shared across independently loaded
 * framework copies through a realm-global rendezvous — ADR 0036's own
 * "realm-private mechanism ONLY if needed"), the opaque occupant value
 * (an `EntryAddress`) handed to an extension at mount, observing the URL for
 * that domain (`@gears-frontx/routing`'s route-ownership signal) and
 * translating URL changes into `mount_ext`/`unmount_ext` chains carrying
 * history intent `none`, and reflecting each settled action back into the
 * URL (history intent honoured; nested domains of a departing host cleared
 * in the same write).
 *
 * Decisions this router resolves where the ADR/FEATURE chain leaves the
 * mechanism open:
 *
 * 1. The registry is this router's own consumer-side wiring, not something
 *    it can take at construction (it is itself `MfeRegistryConfig.router`).
 *    `attachRegistry` is the simplest resolution: the host calls it once,
 *    immediately after `mfeRegistryFactory.build({ ..., router })` returns,
 *    before any domain or extension registers.
 * 2. A domain's cardinality (how many occupants its own URL entry admits at
 *    once) is never modelled separately — `reportSettled` reads
 *    `registry.getMountedExtensions(domainId)` as ground truth after the
 *    settled action and diffs it against the URL's current entries for that
 *    domain key. This needs no cardinality flag at all: an Exclusive or
 *    Optional domain's strategy has already evicted the prior occupant by
 *    the time this runs, so the mounted set itself carries exactly what the
 *    URL should show.
 * 3. A domain's mount action is `resolveMountExtActionId()` and its unmount
 *    action is `resolveUnmountExtActionId()` when the domain declares it in
 *    `actions`, via the injected `TypeSystemPlugin` — rather than a second,
 *    host-supplied action-type field.
 * 4. The nested-domain-keys a departing host's teardown must clear from the
 *    URL in the same write (O7) are tracked in a second realm-global
 *    rendezvous, keyed by the owning occupant's own `EntryAddress`
 *    (`domainKey` + extension token): a nested router records its own
 *    routed domain keys there once its own occupant value is known
 *    (`supplyNavigation`), and the enclosing router's `reportSettled` reads
 *    it for a departing token. This is the one place two independently
 *    loaded framework copies must agree without importing each other.
 * 5. Observing a domain's URL (creating its route-ownership-signal observer)
 *    is NOT started automatically from `registerDomain`: a domain usually
 *    registers before its own DOM slot has attached a root, and dispatching
 *    a mount before that would only fail and log noise. `startDomain`/
 *    `stopDomain` are the template-only lifecycle driven from a slot's own
 *    attach/detach — `ExtensionDomainSlot` (`@gears-frontx/react`) calls
 *    `startRoutedDomain`/`stopRoutedDomain` (below) itself, through
 *    `@gears-frontx/framework`'s `./internal` subpath, so neither function
 *    is MFE-reachable; `teardownRoutedDomain` (below) is the ordering a host
 *    whose own teardown needs the observer stopped strictly before it
 *    releases that domain's occupants would use instead — kept
 *    framework-internal, since every shipped host relies on
 *    `ExtensionDomainSlot`'s own attach/detach ordering rather than managing
 *    this itself.
 *
 * @packageDocumentation
 */
import {
  createRouteSignal,
  resolveNavigationHistory,
  validateName,
  deriveExtensionToken,
  type DomainKey,
  type EntryAddress,
  type ExtensionToken,
  type NavigationHistory,
  type ReleaseFunction,
  type RouteSignal,
  type RegisteredExtensionsSource,
  type Transition,
} from '@gears-frontx/routing';
import type {
  RouterPort,
  OccupantValue,
  OccupantValueAssignment,
  SettledActionReport,
  ExtensionDomain,
  Extension,
  MfeRegistry,
  TypeSystemPlugin,
} from '@gears-frontx/mfes';
import { adaptProviderHistory, type RouterHistory } from '@gears-frontx/routing-tanstack';

export interface FrameworkRouterOptions {
  readonly typeSystem: TypeSystemPlugin;
}

export interface RouteObservationStatus {
  readonly entries: number;
  readonly unresolved: number;
}

const NO_DOMAIN_STATUS: RouteObservationStatus = { entries: 0, unresolved: 0 };

/**
 * The narrow, app-facing router surface (`app.mfeRouter`, ADR 0036). A host
 * or MFE reaches only the extension-local navigation facade — never the
 * occupant value, never raw history, never a router instance. Every other
 * concern this router owns (building/rendering an extension's own router
 * tree, starting/stopping a routed domain's URL observer, that domain's own
 * status) is reached through framework-internal paths instead: the
 * `<ExtensionRouter>` component `@gears-frontx/react` exports (which calls
 * `buildExtensionHistory` below) builds and renders that router for an MFE;
 * `ExtensionDomainSlot` drives `startRoutedDomain`/`stopRoutedDomain`
 * itself from its own attach/detach. Deliberately excludes every
 * `RouterPort` member (`registerDomain`, `assignOccupantValue`,
 * `reportSettled`, ...) and `attachRegistry` — those are `mfes`' own
 * consumer-side wiring, reached only by the registry this router is
 * injected into, never by app or extension code. `FrameworkRouter` itself
 * is never exported past this package's own plugin wiring; `microfrontends()`
 * hands out `FrameworkRouter.prototype.asHandle()`'s return value instead.
 */
export interface MfeRouterHandle {
  navigation(): {
    navigate(path: string): void;
    replace(path: string): void;
    location(): { pathname: string; search: string };
  };
}

interface RoutedDomainState {
  readonly domainId: string;
  readonly domainKey: DomainKey;
  /** Derived from the domain's declared actions; refreshed when the same router re-presents the domain (see `registerDomain`). */
  mountActionType: string;
  unmountActionType: string | undefined;
  readonly tokens: Set<ExtensionToken>;
  readonly statusListeners: Set<() => void>;
  release: ReleaseFunction | undefined;
  status: RouteObservationStatus;
  /**
   * At most ONE deferred write armed per domain: while this domain's own
   * enclosing entry has not yet landed, a settle re-arms this single
   * subscription instead of stacking a new one alongside whatever is
   * already pending — `writeFromMountedSet` cancels and replaces it, never
   * stacks. The release is what `stopDomain`/`releaseDomain` call to drop a
   * still-pending write for a domain that is itself going away.
   */
  pendingWrite: ReleaseFunction | undefined;
  /** The history intent the next collapsed write runs with — 'replace' wins over 'push' once something is pending (see `writeFromMountedSet`'s own doc comment). */
  pendingVerb: 'push' | 'replace' | undefined;
}

interface ExtensionBookkeeping {
  readonly domainId: string;
  readonly token: ExtensionToken | undefined;
}

// ---------------------------------------------------------------------------
// Realm-global rendezvous #1: page-wide routed-domain route uniqueness (O1).
// ---------------------------------------------------------------------------

const ROUTED_ROUTES_SLOT = Symbol.for('@gears-frontx/framework:routed-domain-routes:3');

/**
 * Route string -> the domain id and the OWNING router instance currently
 * holding it. A domain re-presenting its own already-held route through the
 * SAME router instance (the registry's own re-registration of an unchanged
 * declaration) is a no-op rather than a collision against itself. A
 * different domain id claiming an already-held route is always rejected
 * (O1); the same domain id claiming it from a DIFFERENT router instance is
 * rejected too — two distinct live router instances (e.g. two independently
 * loaded framework copies) never share ownership of one route merely
 * because they happen to declare the same domain id, and only the
 * instance that holds a route may ever release it.
 */
interface RoutedRouteHolder {
  readonly domainId: string;
  readonly ownerId: symbol;
}

interface RoutedRoutesEntry {
  readonly v: 2;
  readonly routes: Map<string, RoutedRouteHolder>;
}

function isRoutedRouteHolder(value: unknown): value is RoutedRouteHolder {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { domainId?: unknown }).domainId === 'string' &&
    typeof (value as { ownerId?: unknown }).ownerId === 'symbol'
  );
}

function isRoutedRoutesEntry(value: unknown): value is RoutedRoutesEntry {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { v?: unknown }).v === 2 &&
    (value as { routes?: unknown }).routes instanceof Map
  );
}

function sharedRoutedRoutes(): Map<string, RoutedRouteHolder> {
  const realm = globalThis as unknown as Record<symbol, unknown>;
  const existing = realm[ROUTED_ROUTES_SLOT];
  if (isRoutedRoutesEntry(existing)) return existing.routes;
  if (existing !== undefined) {
    console.error('[router] routed-domain-routes rendezvous slot is malformed; treating it as absent');
  }
  const routes = new Map<string, RoutedRouteHolder>();
  realm[ROUTED_ROUTES_SLOT] = { v: 2, routes } satisfies RoutedRoutesEntry;
  return routes;
}

// ---------------------------------------------------------------------------
// Realm-global rendezvous #2: nested routed-domain keys, keyed by the owning
// occupant's own entry address (O7 structural reset).
// ---------------------------------------------------------------------------

const NESTED_DOMAIN_KEYS_SLOT = Symbol.for('@gears-frontx/framework:nested-domain-keys:1');

interface NestedDomainKeysEntry {
  readonly v: 1;
  readonly byOwner: Map<string, Set<DomainKey>>;
}

function isNestedDomainKeysEntry(value: unknown): value is NestedDomainKeysEntry {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { v?: unknown }).v === 1 &&
    (value as { byOwner?: unknown }).byOwner instanceof Map
  );
}

function sharedNestedDomainKeys(): Map<string, Set<DomainKey>> {
  const realm = globalThis as unknown as Record<symbol, unknown>;
  const existing = realm[NESTED_DOMAIN_KEYS_SLOT];
  if (isNestedDomainKeysEntry(existing)) return existing.byOwner;
  if (existing !== undefined) {
    console.error('[router] nested-domain-keys rendezvous slot is malformed; treating it as absent');
  }
  const byOwner = new Map<string, Set<DomainKey>>();
  realm[NESTED_DOMAIN_KEYS_SLOT] = { v: 1, byOwner } satisfies NestedDomainKeysEntry;
  return byOwner;
}

function ownerKey(address: EntryAddress): string {
  return `${address.domainKey}\u0000${address.extension}`;
}

// ---------------------------------------------------------------------------
// Extension route extraction — the router's own: the runtime keeps no
// routing grammar itself, so this reads an extension's own declared `route`
// with one leading `/` stripped.
// ---------------------------------------------------------------------------

function extensionRouteOf(extension: Extension): string | undefined {
  return extension.route?.replace(/^\//, '');
}

function extensionTokenOf(extension: Extension): ExtensionToken | undefined {
  const raw = extensionRouteOf(extension);
  return raw === undefined ? undefined : deriveExtensionToken(raw);
}

export class FrameworkRouter implements RouterPort, MfeRouterHandle {
  private registry: MfeRegistry | undefined;
  // Resolved lazily, on first actual use (a domain's observer starting, or
  // an adapted history/navigation facade being built) rather than at
  // construction: `microfrontends()` constructs this router unconditionally
  // for every app, including one under test in a realm with no `window`,
  // where `resolveNavigationHistory()` throws by design absent an explicit
  // adapter. A build that never routes anything never needs a history at
  // all.
  private cachedHistory: NavigationHistory | undefined;
  private cachedSignal: RouteSignal | undefined;
  private readonly domainsById = new Map<string, RoutedDomainState>();
  private readonly extensionsById = new Map<string, ExtensionBookkeeping>();
  private readonly routedRoutes = sharedRoutedRoutes();
  private readonly nestedDomainKeys = sharedNestedDomainKeys();
  private ownEntryAddressReader: (() => OccupantValue | undefined) | undefined;
  private navFacade:
    | {
        navigate(path: string): void;
        replace(path: string): void;
        location(): { pathname: string; search: string };
      }
    | undefined;
  private cachedHandle: MfeRouterHandle | undefined;
  /** This instance's own identity in the realm-global routed-routes rendezvous (O1) — an opaque, unforgeable value compared only by reference, so ownership checks hold even across independently loaded copies of this class. */
  private readonly instanceId: symbol = Symbol('frontx-router-instance');

  constructor(private readonly options: FrameworkRouterOptions) {}

  private history(): NavigationHistory {
    if (!this.cachedHistory) this.cachedHistory = resolveNavigationHistory();
    return this.cachedHistory;
  }

  private signal(): RouteSignal {
    if (!this.cachedSignal) this.cachedSignal = createRouteSignal(this.history());
    return this.cachedSignal;
  }

  /**
   * Builds a fresh `RouterHistory` adapted over this copy's own occupant
   * value (or standalone, when this copy has none) — the input the
   * ecosystem's default engine-provider package's `createProviderRouter`/
   * `EngineProvider` consume to build and render this extension's own
   * router (ADR 0036, "An MFE ... supplies its route tree to its own
   * framework instance ... which builds and renders that extension's one
   * router"). Never exposes the occupant value itself — only the
   * already-scoped history object a conforming engine provider needs.
   */
  adaptHistory(): RouterHistory {
    return adaptProviderHistory(this.history(), this.ownEntryAddress());
  }

  /**
   * The extension-local navigation facade (ADR 0036, "The navigation
   * facade"): confined to this occupant's own pathname and search
   * parameters, usable outside React and before any `EngineProvider`
   * rendered over `adaptHistory()` has attached — built against its own,
   * separate adapted-history instance so it works independently of
   * whichever render uses `adaptHistory()` for its own router. Exposes
   * neither the router, the occupant value, nor raw history.
   *
   * `location()` (D21 — each runtime reads AND writes only its own entry's
   * parameters) reads this occupant's own current `{pathname, search}` —
   * never a sibling occupant's or the composed page's own — so a caller
   * outside React (an `ActionHandler`, not a rendered route) can merge its
   * own existing params into a write instead of overwriting them. Rebuilds
   * a FRESH `adaptProviderHistory` on every call rather than reading off the
   * one cached below: an adapted history's own `.location` only tracks
   * live changes once something calls routing-tanstack's own
   * `attachAdaptedHistory` on it (`EngineProvider`'s own mount effect does
   * that for the RENDERED router) — this facade deliberately never attaches
   * its own instance, so it would otherwise read back whatever was current
   * at its first construction forever, including never seeing its own
   * earlier `navigate`/`replace` calls. Construction itself, though, always
   * projects from the live, current params for this occupant's own entry —
   * so a throwaway instance read immediately after building it is exactly
   * as current as the write path that already ran through the SAME
   * underlying `NavigationHistory`.
   *
   * With no occupant value (`ownEntryAddress()` undefined — a registry never
   * supplied one, which is true of every root/shell runtime and of an MFE
   * previewed on its own with nothing mounting it), this runtime owns no
   * private subroute of its own (D21) to read or write through this facade.
   * `navigate`/`replace` therefore refuse rather than falling back to
   * `adaptProviderHistory`'s own page-address mode, which would otherwise
   * hand host code (or, for the shell, application code) an unscoped writer
   * onto the composed page's raw URL — exactly the write D21 reserves for
   * occupancy changes made only as a byproduct of `mount_ext`/`unmount_ext`.
   * An MFE rendered standalone still navigates: its own rendered route tree
   * (`EngineProvider` over `adaptHistory()`/`buildExtensionHistory`) already
   * runs in this same page-address mode — a framework-owned path, not this
   * imperative facade.
   */
  navigation(): {
    navigate(path: string): void;
    replace(path: string): void;
    location(): { pathname: string; search: string };
  } {
    const ownAddress = this.ownEntryAddress();
    if (ownAddress === undefined) {
      return this.unscopedNavigationFacade();
    }
    if (!this.navFacade) {
      const history = adaptProviderHistory(this.history(), ownAddress);
      this.navFacade = {
        navigate: (path: string) => history.push(path),
        replace: (path: string) => history.replace(path),
        location: () => {
          const fresh = adaptProviderHistory(this.history(), this.ownEntryAddress());
          return { pathname: fresh.location.pathname, search: fresh.location.search };
        },
      };
    }
    return this.navFacade;
  }

  /**
   * The facade `navigation()` returns for a runtime with no occupant value
   * (no private subroute of its own, D21) — `location()` still reads the
   * composed page's current pathname/search (a read exposes nothing
   * `navigation()`'s own SEC guarantee does not already accept, same ground
   * as the realm rendezvous slot and the raw URL being readable by any
   * same-realm script), but `navigate`/`replace` refuse: this runtime has no
   * entry of its own to confine a write to, and the composed page's entries
   * change only as a byproduct of `mount_ext`/`unmount_ext` (D21), never by
   * a direct call through this facade. Built fresh on every `navigation()`
   * call (never cached) — whether an occupant value is present can change
   * once `supplyNavigation` runs, and a cached refusal must not survive that.
   */
  private unscopedNavigationFacade(): {
    navigate(path: string): void;
    replace(path: string): void;
    location(): { pathname: string; search: string };
  } {
    const refuse = (): never => {
      throw new Error(
        '[router] navigation().navigate()/.replace() refused: this runtime has no occupant value of its own — ' +
          'a root/shell runtime, or an MFE previewed with nothing mounting it, owns no private subroute to write ' +
          'through this facade. A standalone MFE still navigates through its own rendered route tree ' +
          '(adaptHistory()/EngineProvider), never through app.mfeRouter.navigation().',
      );
    };
    return {
      navigate: refuse,
      replace: refuse,
      location: () => {
        const { path, search } = this.history().location;
        return { pathname: path, search };
      },
    };
  }

  /**
   * The narrow, app-facing handle `microfrontends()` publishes as
   * `app.mfeRouter` (ADR 0036) — a fresh plain object delegating to this
   * same instance, carrying none of `RouterPort`'s members or
   * `attachRegistry`, so this class itself is never reachable from an app
   * object. Memoized: every caller across one build receives referentially
   * the same handle.
   */
  asHandle(): MfeRouterHandle {
    if (!this.cachedHandle) {
      this.cachedHandle = {
        navigation: () => this.navigation(),
      };
    }
    return this.cachedHandle;
  }

  /**
   * Template-only wiring call. The registry is this router's own consumer
   * (it is `MfeRegistryConfig.router`), so it cannot be supplied at
   * construction — call once, immediately after
   * `mfeRegistryFactory.build({ ..., router: this })` returns, before any
   * domain or extension registers.
   */
  attachRegistry(registry: MfeRegistry): void {
    this.registry = registry;
    routersByRegistry.set(registry, this);
  }

  private requireRegistry(): MfeRegistry {
    if (!this.registry) {
      throw new Error('[router] attachRegistry() must be called before any domain or extension registers');
    }
    return this.registry;
  }

  /** This router's own occupant's entry address — set once `supplyNavigation` runs; `undefined` for a root (shell) registry, a standalone mount, or a copy that backed away from the occupant-value rendezvous. */
  private ownEntryAddress(): EntryAddress | undefined {
    const value = this.ownEntryAddressReader?.();
    return isEntryAddress(value) ? value : undefined;
  }

  // ------------------------------------------------------------------
  // RouterPort
  // ------------------------------------------------------------------

  registerDomain(domain: ExtensionDomain): void {
    const route = domain.route;
    if (route === undefined) return; // not a routed domain — nothing to admit
    if (!validateName(route)) {
      throw new Error(`[router] domain "${domain.id}" declares an invalid route "${route}"`);
    }
    const currentHolder = this.routedRoutes.get(route);
    if (currentHolder !== undefined) {
      if (currentHolder.domainId !== domain.id) {
        throw new Error(`[router] domain route "${route}" is already used by another routed domain live in the page`);
      }
      if (currentHolder.ownerId !== this.instanceId) {
        throw new Error(
          `[router] domain route "${route}" is already registered for domain "${domain.id}" by a distinct router instance`,
        );
      }
      // Same owner re-presenting a domain it already holds: its running
      // observer, extension tokens, status listeners and pending write belong
      // to the existing state, so that state stays and only the
      // declaration-derived fields below are refreshed.
    }
    const typeSystem = this.options.typeSystem;
    const mountActionType = typeSystem.resolveMountExtActionId();
    const unmountExtActionId = typeSystem.resolveUnmountExtActionId();
    const unmountActionType = domain.actions.includes(unmountExtActionId) ? unmountExtActionId : undefined;
    this.routedRoutes.set(route, { domainId: domain.id, ownerId: this.instanceId });
    let existing = this.domainsById.get(domain.id);
    if (existing && existing.domainKey !== route) {
      // The domain moved to a different route: nothing of the old state
      // applies to the new key, so it is released rather than reused.
      this.releaseDomain(domain.id);
      existing = undefined;
    }
    if (existing) {
      existing.mountActionType = mountActionType;
      existing.unmountActionType = unmountActionType;
    } else {
      this.domainsById.set(domain.id, {
        domainId: domain.id,
        domainKey: route as DomainKey,
        mountActionType,
        unmountActionType,
        tokens: new Set(),
        statusListeners: new Set(),
        release: undefined,
        status: NO_DOMAIN_STATUS,
        pendingWrite: undefined,
        pendingVerb: undefined,
      });
    }
    const enclosing = this.ownEntryAddress();
    if (enclosing) {
      const key = ownerKey(enclosing);
      const set = this.nestedDomainKeys.get(key) ?? new Set<DomainKey>();
      set.add(route as DomainKey);
      this.nestedDomainKeys.set(key, set);
    }
  }

  releaseDomain(domainId: string): void {
    const state = this.domainsById.get(domainId);
    if (!state) return;
    state.release?.();
    this.cancelPendingWrite(state);
    this.domainsById.delete(domainId);
    // Only the owning instance may release a route it holds (O1) — a
    // distinct router instance that merely shares this domain id never
    // registered it here, so it must never clear another instance's hold.
    const holder = this.routedRoutes.get(state.domainKey);
    if (holder !== undefined && isRoutedRouteHolder(holder) && holder.ownerId === this.instanceId) {
      this.routedRoutes.delete(state.domainKey);
    }
    const enclosing = this.ownEntryAddress();
    if (enclosing) {
      this.nestedDomainKeys.get(ownerKey(enclosing))?.delete(state.domainKey);
    }
  }

  registerExtension(extension: Extension): void {
    const state = this.domainsById.get(extension.domain);
    const token = state ? extensionTokenOf(extension) : undefined;
    if (state && token !== undefined) {
      if (state.tokens.has(token)) {
        throw new Error(`[router] extension token "${token}" is already registered in domain "${extension.domain}"`);
      }
      state.tokens.add(token);
    }
    this.extensionsById.set(extension.id, { domainId: extension.domain, token });
  }

  releaseExtension(extensionId: string): void {
    const bookkeeping = this.extensionsById.get(extensionId);
    if (!bookkeeping) return;
    this.extensionsById.delete(extensionId);
    if (bookkeeping.token === undefined) return;
    this.domainsById.get(bookkeeping.domainId)?.tokens.delete(bookkeeping.token);
  }

  assignOccupantValue(assignment: OccupantValueAssignment): OccupantValue {
    const state = this.domainsById.get(assignment.domain.id);
    const token = extensionTokenOf(assignment.extension);
    if (!state || token === undefined) return undefined;
    const address: EntryAddress = { domainKey: state.domainKey, extension: token };
    return address;
  }

  reportSettled(report: SettledActionReport): void {
    if (!report.succeeded) return;
    const history = report.payload.history ?? 'push';
    if (history === 'none') return; // O5: a restoring chain writes nothing
    const state = this.domainsById.get(report.domainId);
    if (!state) return;
    this.writeFromMountedSet(state, history === 'replace' ? 'replace' : 'push');
  }

  /** Called by `cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous`, `inst-ov-supply-navigation`, once this copy's registry adopts an inbound bridge. */
  supplyNavigation(readOccupantValue: () => OccupantValue | undefined): void {
    this.ownEntryAddressReader = readOccupantValue;
  }

  // ------------------------------------------------------------------
  // Template-only surface — not part of `RouterPort`.
  // ------------------------------------------------------------------

  /** Starts observing a routed domain's own URL entries. Call once that domain's own DOM slot has attached a root (D11 — dispatching before that would only fail). A second call while the domain is already observed reuses the running observer. */
  startDomain(domainId: string): void {
    const state = this.domainsById.get(domainId);
    if (!state || state.release) return;
    state.release = this.signal().createObserver<string>(state.domainKey, this.extensionsSource(domainId), (t) =>
      this.onTransition(state, t),
    );
  }

  /** Releases a routed domain's own observer. Call from the same slot's detach. Calling it for a domain that is not observed does nothing. */
  stopDomain(domainId: string): void {
    const state = this.domainsById.get(domainId);
    if (!state) return;
    state.release?.();
    state.release = undefined;
    // A domain going away must not leave a deferred write armed behind it —
    // it would otherwise fire later against a domain that is not observed
    // (or, worse, a different domain re-registered on the same id).
    this.cancelPendingWrite(state);
    state.status = NO_DOMAIN_STATUS;
    for (const listener of [...state.statusListeners]) {
      try {
        listener();
      } catch (error) {
        console.error(`[router] a status listener for ${domainId} threw`, error);
      }
    }
  }

  private extensionsSource(domainId: string): RegisteredExtensionsSource<string> {
    return {
      getRegistrations: () =>
        this.requireRegistry()
          .getExtensionsForDomain(domainId)
          .flatMap((extension) => {
            const token = extensionTokenOf(extension);
            return token === undefined ? [] : [{ extension: token, routeOwner: extension.id }];
          }),
    };
  }

  /** O6: translate every difference the signal reports between the domain's URL entries and what is mounted into `mount_ext`/`unmount_ext` chains carrying history intent `none`. Never mounts or unmounts directly. */
  private onTransition(state: RoutedDomainState, transition: Transition<string>): void {
    const registry = this.requireRegistry();
    const mounted = new Set(registry.getMountedExtensions(state.domainId));
    for (const token of [...transition.diff.added, ...transition.diff.resolutionChanged]) {
      const entry = transition.entries.find((e) => e.extension === token);
      if (!entry || !entry.resolution.resolved) continue;
      const owner = entry.resolution.routeOwner;
      if (mounted.has(owner)) continue; // echo of this router's own back-projection, or already mounted
      this.dispatch(state.domainId, state.mountActionType, owner, 'none');
    }
    for (const token of transition.diff.removed) {
      const owner = this.ownerOfToken(state, token);
      if (owner === undefined || !mounted.has(owner)) continue; // unregistered, or already unmounted (echo of our own write)
      if (state.unmountActionType === undefined) continue; // Exclusive domain: no public unmount_ext
      this.dispatch(state.domainId, state.unmountActionType, owner, 'none');
    }
    state.status = {
      entries: transition.entries.length,
      unresolved: transition.entries.filter((e) => !e.resolution.resolved).length,
    };
    for (const listener of [...state.statusListeners]) {
      try {
        listener();
      } catch (error) {
        console.error(`[router] a status listener for ${state.domainId} threw`, error);
      }
    }
  }

  /** The routed domain's own current URL-entry status (entry count, unresolved count) — `{entries: 0, unresolved: 0}` for a domain this router does not know or has not started observing. */
  domainStatus(domainId: string): RouteObservationStatus {
    return this.domainsById.get(domainId)?.status ?? NO_DOMAIN_STATUS;
  }

  /** Subscribes to changes in `domainStatus(domainId)`. Returns a no-op release for an unknown domain. */
  subscribeDomainStatus(domainId: string, listener: () => void): ReleaseFunction {
    const state = this.domainsById.get(domainId);
    if (!state) return () => {};
    state.statusListeners.add(listener);
    return () => state.statusListeners.delete(listener);
  }

  private ownerOfToken(state: RoutedDomainState, token: ExtensionToken): string | undefined {
    return this.requireRegistry()
      .getExtensionsForDomain(state.domainId)
      .find((e) => extensionTokenOf(e) === token)?.id;
  }

  private dispatch(domainId: string, actionType: string, subject: string, history: 'none' | 'replace' | 'push'): void {
    try {
      this.requireRegistry().executeActionsChain({
        action: { type: actionType, target: domainId, payload: { subject, history } },
      });
    } catch (error) {
      console.error(`[router] dispatch of ${actionType} for ${subject} in ${domainId} refused`, error);
    }
  }

  /**
   * O5/O7: rewrite this domain's own URL entries from its current mounted
   * set, clearing in the same write every nested domain key a departing
   * token is known to own.
   *
   * When this domain's own enclosing entry has not yet landed (D11 — e.g.
   * Widgets Host auto-mounts before its own screen entry lands), the write
   * is DEFERRED behind a single `history().subscribe()` armed once per
   * domain, not once per settle: several settles arriving before the
   * enclosing entry lands (e.g. three opening mounts, each its own
   * `reportSettled` call) re-arm the SAME pending write instead of stacking
   * one listener per settle. A diff closed over at arm time would go stale
   * by the time the enclosing entry actually lands, so each listener must
   * instead be dropped and replaced rather than left to fire alongside the
   * others — every settle before the enclosing entry lands contributes only
   * its own history-intent merge (below), and the diff itself is computed
   * fresh, against the LIVE mounted set and LIVE `ownEntries(domainKey)`,
   * only once the write actually runs (`writeNow`) — never from values
   * captured when the write was armed.
   *
   * Collapsed history intent: 'replace' wins over 'push'. The opening case
   * this collapses is auto-mount-on-attach, which always carries 'replace'
   * (amend the enclosing entry once it exists, not push a new history
   * entry per occupant) — a 'push' arriving while a 'replace' is already
   * pending must not downgrade the eventual write to 'push', so the merge
   * is a one-way ratchet toward 'replace'.
   */
  private writeFromMountedSet(state: RoutedDomainState, verb: 'push' | 'replace'): void {
    const enclosing = this.ownEntryAddress();
    if (enclosing && !this.enclosingPresent(enclosing)) {
      state.pendingVerb = state.pendingVerb === 'replace' || verb === 'replace' ? 'replace' : 'push';
      if (state.pendingWrite) return; // already armed — the merged verb above is all this settle contributes
      const release = this.history().subscribe(() => {
        if (!this.enclosingPresent(enclosing)) return;
        state.pendingWrite = undefined;
        const finalVerb = state.pendingVerb ?? verb;
        state.pendingVerb = undefined;
        release();
        this.writeNow(state, finalVerb);
      });
      state.pendingWrite = release;
      return;
    }
    this.writeNow(state, verb);
  }

  /** Computes the URL diff against the LIVE mounted set and LIVE `ownEntries(domainKey)` at the moment this runs, and performs the back-projection — the one place `writeFromMountedSet` actually writes, whether called directly or from a collapsed deferred write. */
  private writeNow(state: RoutedDomainState, verb: 'push' | 'replace'): void {
    const registry = this.requireRegistry();
    const mountedIds = registry.getMountedExtensions(state.domainId);
    const mountedTokens = new Map<ExtensionToken, string>();
    for (const extensionId of mountedIds) {
      const extension = registry.getExtension(extensionId);
      const token = extension ? extensionTokenOf(extension) : undefined;
      if (token !== undefined) mountedTokens.set(token, extensionId);
    }
    const ownTokens = this.ownEntries(state.domainKey);
    const added = [...mountedTokens.keys()].filter((t) => !ownTokens.includes(t));
    const removedTokens = ownTokens.filter((t) => {
      const owner = this.ownerOfToken(state, t);
      return owner === undefined || !mountedTokens.has(t);
    });
    if (added.length === 0 && removedTokens.length === 0) return; // nothing changed — no write

    const departingOwnerKeys: string[] = [];
    for (const token of removedTokens) {
      const owner = this.ownerOfToken(state, token);
      if (owner === undefined) continue;
      departingOwnerKeys.push(ownerKey({ domainKey: state.domainKey, extension: token }));
    }
    const clearedDomainKeys = this.collectNestedDomainKeysRecursive(departingOwnerKeys);

    try {
      if (added.length === 1 && removedTokens.length === 1) {
        this.signal().backProjectEntries(
          state.domainKey,
          {
            replaced: [{ oldExtension: removedTokens[0], entry: { extension: added[0], params: [] } }],
            clearedDomainKeys: [...clearedDomainKeys],
          },
          verb,
        );
      } else {
        this.signal().backProjectEntries(
          state.domainKey,
          {
            added: added.map((extension) => ({ extension, params: [] })),
            removed: removedTokens,
            clearedDomainKeys: [...clearedDomainKeys],
          },
          verb,
        );
      }
    } catch (error) {
      console.error(`[router] back-projection for ${state.domainKey} failed`, error);
    }
  }

  /**
   * O7: collects every domain key nested transitively beneath the given
   * departing owners — the domains they registered directly, the domains
   * THOSE domains' own occupants registered, and so on to any depth — so a
   * departing host's structural reset clears the complete set in the same
   * write, not just its own direct children. `nestedDomainKeys` is keyed by
   * owner (`domainKey` + extension token), so descending one level from an
   * already-cleared domain key means finding every owner key recorded
   * UNDER that domain key, whichever extension token occupies it; `ownerKey`
   * encodes the domain key as a `\0`-terminated prefix, so a prefix scan
   * over the whole rendezvous map is what resolves that without knowing in
   * advance which token(s) occupy a nested domain.
   *
   * Cycle/duplicate-safe: a domain key already collected is never re-queued,
   * so a cycle in the nesting graph (unreachable in practice, but not
   * excluded by the data shape) terminates instead of looping.
   */
  private collectNestedDomainKeysRecursive(departingOwnerKeys: readonly string[]): Set<DomainKey> {
    const collected = new Set<DomainKey>();
    const frontier: DomainKey[] = [];

    const enqueue = (domainKey: DomainKey): void => {
      if (collected.has(domainKey)) return;
      collected.add(domainKey);
      frontier.push(domainKey);
    };

    for (const owner of departingOwnerKeys) {
      this.nestedDomainKeys.get(owner)?.forEach(enqueue);
    }
    while (frontier.length > 0) {
      const domainKey = frontier.pop() as DomainKey;
      const prefix = `${domainKey}\u0000`;
      for (const [owner, nested] of this.nestedDomainKeys) {
        if (!owner.startsWith(prefix)) continue;
        nested.forEach(enqueue);
      }
    }
    return collected;
  }

  /** Drops a deferred write armed for this domain, if any — called from `stopDomain`/`releaseDomain` so a domain going away never fires a write later against a domain that is not observed. */
  private cancelPendingWrite(state: RoutedDomainState): void {
    state.pendingWrite?.();
    state.pendingWrite = undefined;
    state.pendingVerb = undefined;
  }

  private ownEntries(domainKey: DomainKey): ExtensionToken[] {
    const { path, search, hash } = this.history().location;
    // Re-parsed from the live location on every call — this router keeps no
    // cached copy of the URL's own entries. `parseGrammar` is re-exported by
    // `@gears-frontx/routing`.
    return parseEntries(path, search, hash)
      .filter((e) => e.domainKey === domainKey)
      .map((e) => e.extension);
  }

  private enclosingPresent(enclosing: EntryAddress): boolean {
    const { path, search, hash } = this.history().location;
    return parseEntries(path, search, hash).some(
      (e) => e.domainKey === enclosing.domainKey && e.extension === enclosing.extension,
    );
  }
}

function isEntryAddress(value: unknown): value is EntryAddress {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { domainKey?: unknown }).domainKey === 'string' &&
    typeof (value as { extension?: unknown }).extension === 'string'
  );
}

// ---------------------------------------------------------------------------
// Framework-internal reach-through, keyed by the `MfeRegistry` a caller
// already holds (every `FrameworkRouter` this plugin builds attaches to
// exactly one registry — see `attachRegistry` above). Not part of
// `app.mfeRouter` (D5/D10): the app-facing handle carries only the
// navigation facade; building/rendering an extension's own router tree,
// starting/stopping a routed domain's URL observer, and its own status are
// reached only through these functions — never re-exported from either
// package's PUBLIC entry, only through `@gears-frontx/framework`'s own
// `./internal` subpath, consumed by `@gears-frontx/react`'s own components
// (`ExtensionDomainSlot`, `ExtensionRouter`, `useDomainRouteStatus`).
// `teardownRoutedDomain` below is the one ordering a host releasing a routed
// domain's own occupants itself would need — kept framework-internal, with
// no public exception in either package: every shipped host (e.g. Widgets
// Host) relies on `ExtensionDomainSlot`'s own attach/detach ordering
// instead of managing this itself.
//
// Realm-global rendezvous #3, for the same reason as #1/#2 above, but
// forced here rather than chosen: the MFE build pipeline that mints
// `@gears-frontx/react` as its own standalone shared-dependency chunk
// (`StandaloneEsmBuilder` in `template-shell/src/build/mf-gts.ts`)
// externalizes a shared dep's sibling imports by EXACT specifier string
// only (`createExternalsPlugin`), by design, so that an incidental subpath
// import (e.g. `react/jsx-runtime`) gets inlined rather than treated as its
// own shared entity. `@gears-frontx/react`'s own components reach this
// file's exports through `@gears-frontx/framework`'s `./internal` subpath
// (design decision 5 above) — a DIFFERENT specifier string than
// `@gears-frontx/framework` itself — so that exact-match externalization
// does not recognize it as the same shared package and inlines this
// module's whole graph into react's chunk too. The result is two
// independently bundled copies of this file in the same realm: the one
// `@gears-frontx/framework`'s own chunk evaluates (which `attachRegistry`
// populates) and the one inlined into `@gears-frontx/react`'s chunk (which
// `buildExtensionHistory`/`startRoutedDomain`/etc. would otherwise read from)
// — a module-scoped `WeakMap` would silently diverge between them. This
// duplication is inherent to that build pipeline's narrow-by-design
// externalization, not a defect to route around at the call site, so the
// lookup itself is made realm-global instead, exactly like rendezvous #1/#2.
// `WeakMap` is a realm intrinsic (unlike a custom class such as
// `RealmSharedDepTextCacheProvider`'s `LruCache`), so `instanceof WeakMap`
// reliably recognizes one published by any loaded copy in this realm.
// ---------------------------------------------------------------------------

const ROUTERS_BY_REGISTRY_SLOT = Symbol.for('@gears-frontx/framework:routers-by-registry:1');

function sharedRoutersByRegistry(): WeakMap<MfeRegistry, FrameworkRouter> {
  const realm = globalThis as unknown as Record<symbol, unknown>;
  const existing = realm[ROUTERS_BY_REGISTRY_SLOT];
  if (existing instanceof WeakMap) {
    return existing as WeakMap<MfeRegistry, FrameworkRouter>;
  }
  if (existing !== undefined) {
    console.error('[router] routers-by-registry rendezvous slot is malformed; treating it as absent');
  }
  const map = new WeakMap<MfeRegistry, FrameworkRouter>();
  realm[ROUTERS_BY_REGISTRY_SLOT] = map;
  return map;
}

const routersByRegistry = sharedRoutersByRegistry();

/** The `RouterHistory` an extension's own `<ExtensionRouter>` render builds its route tree's provider router over (ADR 0036, D5) — `undefined` for a registry with no `FrameworkRouter` attached. */
export function buildExtensionHistory(registry: MfeRegistry): RouterHistory | undefined {
  return routersByRegistry.get(registry)?.adaptHistory();
}

/** Starts the given routed domain's own URL observer (D10/D11) — a no-op for a registry with no `FrameworkRouter` attached, or an unrouted/unknown domain. Safe to call more than once for the same domain (`FrameworkRouter.startDomain`'s own doc comment). */
export function startRoutedDomain(registry: MfeRegistry, domainId: string): void {
  routersByRegistry.get(registry)?.startDomain(domainId);
}

/** Stops the given routed domain's own URL observer. A no-op for a registry with no `FrameworkRouter` attached, or an unrouted/unknown domain. Safe to call more than once for the same domain. */
export function stopRoutedDomain(registry: MfeRegistry, domainId: string): void {
  routersByRegistry.get(registry)?.stopDomain(domainId);
}

/**
 * Stops the given routed domain's own URL observer, THEN runs `release` —
 * the framework-owned ordering a host needs when IT releases a routed
 * domain's occupants itself, outside `ExtensionDomainSlot`'s own
 * attach/detach (which already stops its domain's observer before its own
 * `mounter.detach()` — see that component's doc comment). A still-live
 * observer would otherwise see the host's own releases as ordinary URL
 * transitions and try to dispatch mount/unmount for subjects the host is
 * already tearing down. `release` always runs, even for a registry with no
 * `FrameworkRouter` attached or an unrouted/unknown domain (the observer
 * stop is then a no-op, nothing more).
 */
export async function teardownRoutedDomain(
  registry: MfeRegistry,
  domainId: string,
  release: () => Promise<void>,
): Promise<void> {
  routersByRegistry.get(registry)?.stopDomain(domainId);
  await release();
}

/** The given routed domain's own current URL-entry status — `{entries: 0, unresolved: 0}` for a registry with no `FrameworkRouter` attached, or an unrouted/unknown/not-yet-started domain. */
export function routedDomainStatus(registry: MfeRegistry, domainId: string): RouteObservationStatus {
  return routersByRegistry.get(registry)?.domainStatus(domainId) ?? NO_DOMAIN_STATUS;
}

/** Subscribes to changes in `routedDomainStatus(registry, domainId)`. Returns a no-op release for a registry with no `FrameworkRouter` attached. */
export function subscribeRoutedDomainStatus(
  registry: MfeRegistry,
  domainId: string,
  listener: () => void,
): ReleaseFunction {
  return routersByRegistry.get(registry)?.subscribeDomainStatus(domainId, listener) ?? (() => {});
}

// Thin indirection so this file's own imports stay the grouped list above —
// `parseGrammar` is re-exported by `@gears-frontx/routing`'s grammar codec.
import { parseGrammar } from '@gears-frontx/routing';
function parseEntries(shellSubroute: string, search: string, hash: string) {
  return parseGrammar({ shellSubroute, search, hash }).entries;
}
