/**
 * `FrameworkRouter` — the concrete implementation of the `mfes` runtime's
 * `RouterPort` (`cpt-frontx-adr-extension-routing-port`). Verifies the
 * router's own obligations against ADR 0036 and the route-ownership-signal
 * FEATURE's Binding obligation (packages/routing/architecture/features/
 * route-ownership-signal/FEATURE.md §1.4): restore chains write nothing,
 * a programmatic mount pushes, an opening mount amends by `replace`, an
 * Exclusive switch is a single write, a departing host's teardown clears its
 * nested domains' entries in the SAME write, Back after leaving restores the
 * host and its nested entries, a duplicate domain route is rejected at
 * admission, and unregistration writes nothing.
 *
 * Uses the REAL `@gears-frontx/routing` navigation substrate (shared
 * history, grammar codec) rather than a fake one — the substrate's own
 * parse/serialize/fan-out correctness is Global Constraints here (covered by
 * that package's own suite); this file is about what `FrameworkRouter` does
 * with it. `MfeRegistry` is a minimal hand-rolled double: `FrameworkRouter`
 * only ever reads `getMountedExtensions`/`getExtension`/
 * `getExtensionsForDomain` and calls `executeActionsChain` on it — real
 * `mfes` dispatch/mounter machinery is Global Constraints too (`mfes` is not
 * under test here).
 *
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveNavigationHistory } from '@gears-frontx/routing';
import type { ExtensionDomain, Extension, MfeRegistry, TypeSystemPlugin } from '@gears-frontx/mfes';
import {
  FrameworkRouter,
  startRoutedDomain,
  stopRoutedDomain,
  teardownRoutedDomain,
  routedDomainStatus,
  subscribeRoutedDomainStatus,
} from '../router';

const MOUNT = 'mount_ext';
const UNMOUNT = 'unmount_ext';

/** `isTypeOf` does plain equality — this file never exercises GTS subtyping, only which of a domain's declared `actions` the router treats as its mount/unmount action type. */
const fakeTypeSystem: TypeSystemPlugin = {
  isTypeOf: (a: string, b: string) => a === b,
  resolveMountExtActionId: () => MOUNT,
  resolveUnmountExtActionId: () => UNMOUNT,
} as unknown as TypeSystemPlugin;

type Chain = { action: { type: string; target: string; payload?: { subject?: string; history?: string } } };

/** A minimal `MfeRegistry` double — see this file's own doc comment for why it is sufficient. */
class FakeRegistry {
  readonly extensions = new Map<string, Extension>();
  readonly mounted = new Set<string>();
  private dispatchWaiters: Array<() => void> = [];
  readonly executeActionsChain = vi.fn((chain: Chain) => {
    const subject = chain.action.payload?.subject;
    if (chain.action.type === MOUNT && subject) this.mounted.add(subject);
    if (chain.action.type === UNMOUNT && subject) this.mounted.delete(subject);
    const waiters = this.dispatchWaiters.splice(0);
    for (const resolve of waiters) resolve();
  });

  /**
   * Resolves on this registry's next `executeActionsChain` call — the gate a
   * test awaits for the router's observer-driven dispatch instead of an
   * `await Promise.resolve()` assuming a fixed scheduling depth. Armed
   * BEFORE the navigation that is expected to trigger the dispatch, since
   * the router may (and currently does) dispatch synchronously from within
   * that call.
   */
  nextDispatch(): Promise<void> {
    return new Promise((resolve) => {
      this.dispatchWaiters.push(resolve);
    });
  }

  getExtension(id: string): Extension | undefined {
    return this.extensions.get(id);
  }
  getExtensionsForDomain(domainId: string): Extension[] {
    return [...this.extensions.values()].filter((e) => e.domain === domainId);
  }
  getMountedExtensions(domainId: string): readonly string[] {
    return [...this.mounted].filter((id) => this.extensions.get(id)?.domain === domainId);
  }

  register(ext: Extension): void {
    this.extensions.set(ext.id, ext);
  }
}

function domain(id: string, route: string): ExtensionDomain {
  return { id, route, actions: [MOUNT, UNMOUNT] } as unknown as ExtensionDomain;
}

function extension(id: string, domainId: string, route: string): Extension {
  return { id, domain: domainId, route } as unknown as Extension;
}

let uniq = 0;
/** A fresh domain id/route pair per test — the router's route-admission map is a realm-global singleton, shared across every instance this suite constructs, so reusing a literal route string across tests would collide. */
function freshRoute(): string {
  uniq += 1;
  return `router-test-route-${uniq}`;
}

/** Released at the end of every test (see `afterEach`) so a route/domain never outlives the test that registered it. */
const routersToRelease: Array<{ router: FrameworkRouter; domainId: string }> = [];

function buildRouter(): FrameworkRouter {
  return new FrameworkRouter({ typeSystem: fakeTypeSystem });
}

afterEach(() => {
  for (const { router, domainId } of routersToRelease.splice(0)) {
    router.stopDomain(domainId);
    router.releaseDomain(domainId);
  }
  window.history.replaceState(null, '', '/');
});

describe('FrameworkRouter — admission', () => {
  it('rejects a domain route that collides with another routed domain live in the page', () => {
    const route = freshRoute();
    const routerA = buildRouter();
    const registryA = new FakeRegistry();
    routerA.attachRegistry(registryA as unknown as MfeRegistry);
    routerA.registerDomain(domain('domA', route));
    routersToRelease.push({ router: routerA, domainId: 'domA' });

    const routerB = buildRouter();
    const registryB = new FakeRegistry();
    routerB.attachRegistry(registryB as unknown as MfeRegistry);
    expect(() => routerB.registerDomain(domain('domB', route))).toThrow(/already used/);
  });

  it('lets the SAME router instance re-present its own already-held route without throwing', () => {
    const route = freshRoute();
    const router = buildRouter();
    const registry = new FakeRegistry();
    router.attachRegistry(registry as unknown as MfeRegistry);
    router.registerDomain(domain('domA', route));
    routersToRelease.push({ router, domainId: 'domA' });

    expect(() => router.registerDomain(domain('domA', route))).not.toThrow();
  });

  it('rejects a DISTINCT router instance presenting the same domain id for the same route', () => {
    const route = freshRoute();
    const routerA = buildRouter();
    const registryA = new FakeRegistry();
    routerA.attachRegistry(registryA as unknown as MfeRegistry);
    routerA.registerDomain(domain('domA', route));
    routersToRelease.push({ router: routerA, domainId: 'domA' });

    // A second, independent router instance — e.g. a second independently
    // loaded framework copy — must never be accepted as an owner just
    // because it happens to present the identical domain id.
    const routerB = buildRouter();
    const registryB = new FakeRegistry();
    routerB.attachRegistry(registryB as unknown as MfeRegistry);
    expect(() => routerB.registerDomain(domain('domA', route))).toThrow(/distinct router instance/);
  });

  it('only the owning router instance may release a route it holds — a distinct instance releasing it is a no-op', () => {
    const route = freshRoute();
    const routerA = buildRouter();
    const registryA = new FakeRegistry();
    routerA.attachRegistry(registryA as unknown as MfeRegistry);
    routerA.registerDomain(domain('domA', route));

    const routerB = buildRouter();
    const registryB = new FakeRegistry();
    routerB.attachRegistry(registryB as unknown as MfeRegistry);

    // `routerB` never registered `domA` itself (the attempt above throws),
    // so it has no bookkeeping for it; releasing a domain id it never held
    // is already a no-op through `domainsById`, independent of route
    // ownership — this asserts the route stays held afterward regardless.
    routerB.releaseDomain('domA');

    // Proof the reservation itself survived routerB's no-op release, not
    // just that the owner can still re-present it (which would succeed even
    // if the reservation had been wrongly cleared, since re-presenting your
    // own held route is always a no-op — see the test above): a THIRD,
    // independent router instance presenting the same route must still
    // collide.
    const routerC = buildRouter();
    const registryC = new FakeRegistry();
    routerC.attachRegistry(registryC as unknown as MfeRegistry);
    expect(() => routerC.registerDomain(domain('domC', route))).toThrow(/already used/);

    expect(() => routerA.registerDomain(domain('domA', route))).not.toThrow();

    // Once the OWNER actually releases it, the route is free again.
    routerA.releaseDomain('domA');
    expect(() => routerC.registerDomain(domain('domC', route))).not.toThrow();
    routersToRelease.push({ router: routerC, domainId: 'domC' });
  });
});

describe('FrameworkRouter — reportSettled, history intent', () => {
  it('writes nothing to the URL for a settled action carrying history intent "none" (restore chains)', () => {
    const route = freshRoute();
    const router = buildRouter();
    const registry = new FakeRegistry();
    router.attachRegistry(registry as unknown as MfeRegistry);
    router.registerDomain(domain('domA', route));
    routersToRelease.push({ router, domainId: 'domA' });
    registry.register(extension('extA', 'domA', 'alpha'));
    registry.mounted.add('extA');

    const pushSpy = vi.spyOn(window.history, 'pushState');
    const replaceSpy = vi.spyOn(window.history, 'replaceState');

    router.reportSettled({ actionTypeId: MOUNT, domainId: 'domA', payload: { subject: 'extA', history: 'none' }, succeeded: true });

    expect(pushSpy).not.toHaveBeenCalled();
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it('pushes a new history entry for a programmatic mount (no history intent given, defaults to push)', () => {
    const route = freshRoute();
    const router = buildRouter();
    const registry = new FakeRegistry();
    router.attachRegistry(registry as unknown as MfeRegistry);
    router.registerDomain(domain('domA', route));
    routersToRelease.push({ router, domainId: 'domA' });
    registry.register(extension('extA', 'domA', 'alpha'));
    registry.mounted.add('extA');

    const pushSpy = vi.spyOn(window.history, 'pushState');
    const replaceSpy = vi.spyOn(window.history, 'replaceState');

    router.reportSettled({ actionTypeId: MOUNT, domainId: 'domA', payload: { subject: 'extA' }, succeeded: true });

    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(replaceSpy).not.toHaveBeenCalled();
    expect(window.location.search).toContain(`${route}=alpha`);
  });

  it('amends an already-present enclosing entry with a single replace for an opening mount carrying history "replace"', () => {
    window.history.replaceState(null, '', '/?screen=host-entry');
    const route = freshRoute();
    const router = buildRouter();
    const registry = new FakeRegistry();
    router.attachRegistry(registry as unknown as MfeRegistry);
    router.registerDomain(domain('domA', route));
    routersToRelease.push({ router, domainId: 'domA' });
    registry.register(extension('extA', 'domA', 'alpha'));
    registry.mounted.add('extA');

    const pushSpy = vi.spyOn(window.history, 'pushState');
    const replaceSpy = vi.spyOn(window.history, 'replaceState');

    router.reportSettled({ actionTypeId: MOUNT, domainId: 'domA', payload: { subject: 'extA', history: 'replace' }, succeeded: true });

    expect(pushSpy).not.toHaveBeenCalled();
    expect(replaceSpy).toHaveBeenCalledTimes(1);
    expect(window.location.search).toContain('screen=host-entry');
    expect(window.location.search).toContain(`${route}=alpha`);
  });

  it('switches an Exclusive domain from one occupant to another in exactly one write (replaced, single write)', () => {
    const route = freshRoute();
    const router = buildRouter();
    const registry = new FakeRegistry();
    router.attachRegistry(registry as unknown as MfeRegistry);
    router.registerDomain(domain('domA', route));
    routersToRelease.push({ router, domainId: 'domA' });
    registry.register(extension('extA', 'domA', 'alpha'));
    registry.register(extension('extB', 'domA', 'beta'));

    // Opening mount of A, settled, so the URL already carries A before the switch.
    registry.mounted.add('extA');
    router.reportSettled({ actionTypeId: MOUNT, domainId: 'domA', payload: { subject: 'extA' }, succeeded: true });

    const pushSpy = vi.spyOn(window.history, 'pushState');
    const replaceSpy = vi.spyOn(window.history, 'replaceState');

    // An Exclusive domain's own mount strategy has already evicted A and
    // admitted B by the time this single settled-action report runs (ADR
    // 0036: "an Exclusive domain's strategy has already evicted the prior
    // occupant by the time this runs" — router.ts's own design note #2).
    registry.mounted.delete('extA');
    registry.mounted.add('extB');
    router.reportSettled({ actionTypeId: MOUNT, domainId: 'domA', payload: { subject: 'extB', history: 'push' }, succeeded: true });

    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(replaceSpy).not.toHaveBeenCalled();
    expect(window.location.search).toContain(`${route}=beta`);
    expect(window.location.search).not.toContain(`${route}=alpha`);
  });
});

describe('FrameworkRouter — nested teardown (O7, structural reset)', () => {
  it("clears a departing host's own nested domain entries in the host's own single settled-action write", () => {
    const hostRoute = freshRoute();
    const hostRouter = buildRouter();
    const hostRegistry = new FakeRegistry();
    hostRouter.attachRegistry(hostRegistry as unknown as MfeRegistry);
    hostRouter.registerDomain(domain('hostDom', hostRoute));
    routersToRelease.push({ router: hostRouter, domainId: 'hostDom' });
    hostRegistry.register(extension('hostExt', 'hostDom', 'host-widget'));
    hostRegistry.mounted.add('hostExt');
    hostRouter.reportSettled({ actionTypeId: MOUNT, domainId: 'hostDom', payload: { subject: 'hostExt' }, succeeded: true });

    // The host's own extension mounts its own nested app, whose own
    // `FrameworkRouter` copy supplies the occupant value it was assigned at
    // mount (ADR 0036, the occupant value) and registers its own nested
    // routed domain through it, exactly as production wiring does.
    const nestedRoute = freshRoute();
    const hostEntryAddress = { domainKey: hostRoute, extension: 'host-widget' };
    const nestedRouter = buildRouter();
    const nestedRegistry = new FakeRegistry();
    nestedRouter.supplyNavigation(() => hostEntryAddress);
    nestedRouter.attachRegistry(nestedRegistry as unknown as MfeRegistry);
    nestedRouter.registerDomain(domain('nestedDom', nestedRoute));
    routersToRelease.push({ router: nestedRouter, domainId: 'nestedDom' });
    nestedRegistry.register(extension('nestedExt', 'nestedDom', 'nested-widget'));
    nestedRegistry.mounted.add('nestedExt');
    nestedRouter.reportSettled({ actionTypeId: MOUNT, domainId: 'nestedDom', payload: { subject: 'nestedExt', history: 'replace' }, succeeded: true });

    expect(window.location.search).toContain(`${hostRoute}=host-widget`);
    expect(window.location.search).toContain(`${nestedRoute}=nested-widget`);

    // The host's own teardown: the enclosing router unmounts `hostExt`.
    // Nested-domain release (`releaseDomain`/`releaseExtension`) is
    // unregistration/disposal bookkeeping (ADR 0036, "Unregistration and
    // disposal"), separate from this ordinary chain teardown — a domain
    // registration outlives one mount/unmount cycle of its own host (it is
    // `MfeRegistry`-level, per `cpt-frontx-routing-route-ownership-signal`
    // FEATURE §1.4 point 8's own "teardown ... releases that nested domain's
    // observer" meaning the OBSERVER, not the registration). The enclosing
    // router's own `nestedDomainKeys` bookkeeping therefore still names the
    // nested domain at this point, and clears it in this one write.
    hostRegistry.mounted.delete('hostExt');
    const pushSpy = vi.spyOn(window.history, 'pushState');
    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    hostRouter.reportSettled({ actionTypeId: UNMOUNT, domainId: 'hostDom', payload: { subject: 'hostExt' }, succeeded: true });

    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(replaceSpy).not.toHaveBeenCalled();
    expect(window.location.search).not.toContain(`${hostRoute}=`);
    expect(window.location.search).not.toContain(`${nestedRoute}=`);
  });

  it("clears a THREE-level nesting chain (host -> mid -> leaf) in the host's own single settled-action write", () => {
    const hostRoute = freshRoute();
    const hostRouter = buildRouter();
    const hostRegistry = new FakeRegistry();
    hostRouter.attachRegistry(hostRegistry as unknown as MfeRegistry);
    hostRouter.registerDomain(domain('hostDom3', hostRoute));
    routersToRelease.push({ router: hostRouter, domainId: 'hostDom3' });
    hostRegistry.register(extension('hostExt3', 'hostDom3', 'host-widget-3'));
    hostRegistry.mounted.add('hostExt3');
    hostRouter.reportSettled({ actionTypeId: MOUNT, domainId: 'hostDom3', payload: { subject: 'hostExt3' }, succeeded: true });

    // Level 2 ("mid"): mounted inside the host, registers its own routed domain.
    const midRoute = freshRoute();
    const hostEntryAddress = { domainKey: hostRoute, extension: 'host-widget-3' };
    const midRouter = buildRouter();
    const midRegistry = new FakeRegistry();
    midRouter.supplyNavigation(() => hostEntryAddress);
    midRouter.attachRegistry(midRegistry as unknown as MfeRegistry);
    midRouter.registerDomain(domain('midDom3', midRoute));
    routersToRelease.push({ router: midRouter, domainId: 'midDom3' });
    midRegistry.register(extension('midExt3', 'midDom3', 'mid-widget-3'));
    midRegistry.mounted.add('midExt3');
    midRouter.reportSettled({ actionTypeId: MOUNT, domainId: 'midDom3', payload: { subject: 'midExt3', history: 'replace' }, succeeded: true });

    // Level 3 ("leaf"): mounted inside "mid", registers its own routed domain,
    // two levels beneath the host — the case direct-children-only collection missed.
    const leafRoute = freshRoute();
    const midEntryAddress = { domainKey: midRoute, extension: 'mid-widget-3' };
    const leafRouter = buildRouter();
    const leafRegistry = new FakeRegistry();
    leafRouter.supplyNavigation(() => midEntryAddress);
    leafRouter.attachRegistry(leafRegistry as unknown as MfeRegistry);
    leafRouter.registerDomain(domain('leafDom3', leafRoute));
    routersToRelease.push({ router: leafRouter, domainId: 'leafDom3' });
    leafRegistry.register(extension('leafExt3', 'leafDom3', 'leaf-widget-3'));
    leafRegistry.mounted.add('leafExt3');
    leafRouter.reportSettled({ actionTypeId: MOUNT, domainId: 'leafDom3', payload: { subject: 'leafExt3', history: 'replace' }, succeeded: true });

    expect(window.location.search).toContain(`${hostRoute}=host-widget-3`);
    expect(window.location.search).toContain(`${midRoute}=mid-widget-3`);
    expect(window.location.search).toContain(`${leafRoute}=leaf-widget-3`);

    // The host's own teardown must clear its own entry AND every descendant
    // nested two levels down — "mid" and "leaf" alike — in this ONE write.
    hostRegistry.mounted.delete('hostExt3');
    const pushSpy = vi.spyOn(window.history, 'pushState');
    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    hostRouter.reportSettled({ actionTypeId: UNMOUNT, domainId: 'hostDom3', payload: { subject: 'hostExt3' }, succeeded: true });

    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(replaceSpy).not.toHaveBeenCalled();
    expect(window.location.search).not.toContain(`${hostRoute}=`);
    expect(window.location.search).not.toContain(`${midRoute}=`);
    expect(window.location.search).not.toContain(`${leafRoute}=`);
  });
});

describe('FrameworkRouter — deferred write collapse (B1, D11 opening mounts before the enclosing entry lands)', () => {
  it('collapses 3 opening settles (history "replace") into exactly one write, with no duplicates, once the absent enclosing entry lands', () => {
    const hostRoute = freshRoute();
    const hostRouter = buildRouter();
    const hostRegistry = new FakeRegistry();
    hostRouter.attachRegistry(hostRegistry as unknown as MfeRegistry);
    hostRouter.registerDomain(domain('hostDomB1', hostRoute));
    routersToRelease.push({ router: hostRouter, domainId: 'hostDomB1' });
    hostRegistry.register(extension('hostExtB1', 'hostDomB1', 'host-widget-b1'));

    // The nested domain's own router supplies the host's occupant value as
    // its enclosing address — mirrors a real nested MFE (Widgets Host)
    // mounted inside a host extension whose own entry has not yet landed.
    const nestedRoute = freshRoute();
    const hostEntryAddress = { domainKey: hostRoute, extension: 'host-widget-b1' };
    const nestedRouter = buildRouter();
    const nestedRegistry = new FakeRegistry();
    nestedRouter.supplyNavigation(() => hostEntryAddress);
    nestedRouter.attachRegistry(nestedRegistry as unknown as MfeRegistry);
    nestedRouter.registerDomain(domain('nestedDomB1', nestedRoute));
    routersToRelease.push({ router: nestedRouter, domainId: 'nestedDomB1' });
    nestedRegistry.register(extension('alpha', 'nestedDomB1', 'alpha'));
    nestedRegistry.register(extension('beta', 'nestedDomB1', 'beta'));
    nestedRegistry.register(extension('gamma', 'nestedDomB1', 'gamma'));

    expect(window.location.search).not.toContain(hostRoute);

    const pushSpy = vi.spyOn(window.history, 'pushState');
    const replaceSpy = vi.spyOn(window.history, 'replaceState');

    // 3 opening mounts settle, in sequence, while the host's own entry is
    // still absent from the URL — a naive one-listener-per-settle
    // implementation would arm its OWN `history().subscribe()` for each,
    // each closing over a diff computed against the (still-empty) URL at
    // ITS OWN call time; `writeFromMountedSet` instead re-arms a single
    // pending write per domain (see its own doc comment), so only one write
    // ever runs, against the LIVE mounted set once the host entry lands.
    nestedRegistry.mounted.add('alpha');
    nestedRouter.reportSettled({ actionTypeId: MOUNT, domainId: 'nestedDomB1', payload: { subject: 'alpha', history: 'replace' }, succeeded: true });
    nestedRegistry.mounted.add('beta');
    nestedRouter.reportSettled({ actionTypeId: MOUNT, domainId: 'nestedDomB1', payload: { subject: 'beta', history: 'replace' }, succeeded: true });
    nestedRegistry.mounted.add('gamma');
    nestedRouter.reportSettled({ actionTypeId: MOUNT, domainId: 'nestedDomB1', payload: { subject: 'gamma', history: 'replace' }, succeeded: true });

    // Nothing written yet — every settle deferred behind the absent host entry.
    expect(pushSpy).not.toHaveBeenCalled();
    expect(replaceSpy).not.toHaveBeenCalled();

    // The host's own entry lands (its own settled-action report, a fresh
    // history push — history intent defaults to 'push' when unspecified).
    hostRegistry.mounted.add('hostExtB1');
    hostRouter.reportSettled({ actionTypeId: MOUNT, domainId: 'hostDomB1', payload: { subject: 'hostExtB1' }, succeeded: true });

    // One write for the host's own entry (push), and exactly ONE collapsed
    // write for the nested domain (replace — the merged, opening intent) —
    // not three.
    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(replaceSpy).toHaveBeenCalledTimes(1);

    const nestedSegments = window.location.search.split('&').filter((s) => s.includes(`${nestedRoute}=`));
    expect(nestedSegments.sort()).toEqual([`${nestedRoute}=alpha`, `${nestedRoute}=beta`, `${nestedRoute}=gamma`]);
  });

  it("cancels a pending deferred write on stopDomain, so it never fires after the domain's own observer has stopped", () => {
    const hostRoute = freshRoute();
    const hostRouter = buildRouter();
    const hostRegistry = new FakeRegistry();
    hostRouter.attachRegistry(hostRegistry as unknown as MfeRegistry);
    hostRouter.registerDomain(domain('hostDomB2', hostRoute));
    routersToRelease.push({ router: hostRouter, domainId: 'hostDomB2' });
    hostRegistry.register(extension('hostExtB2', 'hostDomB2', 'host-widget-b2'));

    const nestedRoute = freshRoute();
    const hostEntryAddress = { domainKey: hostRoute, extension: 'host-widget-b2' };
    const nestedRouter = buildRouter();
    const nestedRegistry = new FakeRegistry();
    nestedRouter.supplyNavigation(() => hostEntryAddress);
    nestedRouter.attachRegistry(nestedRegistry as unknown as MfeRegistry);
    nestedRouter.registerDomain(domain('nestedDomB2', nestedRoute));
    nestedRegistry.register(extension('alpha', 'nestedDomB2', 'alpha'));

    nestedRegistry.mounted.add('alpha');
    nestedRouter.reportSettled({ actionTypeId: MOUNT, domainId: 'nestedDomB2', payload: { subject: 'alpha', history: 'replace' }, succeeded: true });

    const pushSpy = vi.spyOn(window.history, 'pushState');
    const replaceSpy = vi.spyOn(window.history, 'replaceState');

    // The nested domain itself is torn down (e.g. the nested host unmounted)
    // before its own enclosing entry ever landed — `stopDomain` must drop
    // the still-pending write rather than leave it armed.
    nestedRouter.stopDomain('nestedDomB2');

    hostRegistry.mounted.add('hostExtB2');
    hostRouter.reportSettled({ actionTypeId: MOUNT, domainId: 'hostDomB2', payload: { subject: 'hostExtB2' }, succeeded: true });

    // The host's own entry still writes; the cancelled nested write does not.
    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(replaceSpy).not.toHaveBeenCalled();
    expect(window.location.search).not.toContain(`${nestedRoute}=`);

    nestedRouter.releaseDomain('nestedDomB2');
  });
});

describe('FrameworkRouter — observer-driven restoration (Back after leaving)', () => {
  it('restores a domain to the URL\'s state via a chain carrying history "none", on a Back step', async () => {
    const route = freshRoute();
    const router = buildRouter();
    const registry = new FakeRegistry();
    router.attachRegistry(registry as unknown as MfeRegistry);
    router.registerDomain(domain('domA', route));
    routersToRelease.push({ router, domainId: 'domA' });
    registry.register(extension('extA', 'domA', 'alpha'));

    router.startDomain('domA');

    // Opening mount of `alpha`, a real history entry (push).
    registry.mounted.add('extA');
    router.reportSettled({ actionTypeId: MOUNT, domainId: 'domA', payload: { subject: 'extA' }, succeeded: true });
    expect(window.location.search).toContain(`${route}=alpha`);

    // Leave: an unrelated navigation (push) away from this domain's entry —
    // the observer sees `alpha` removed and the router unmounts it.
    const history = resolveNavigationHistory();
    const leaveDispatched = registry.nextDispatch();
    history.push('/?unrelated=1');
    await leaveDispatched;
    expect(registry.mounted.has('extA')).toBe(false);

    // Back: the browser restores the PRIOR entry (carrying `alpha`) — the
    // observer reports it as `Added` again, and the router must mount it
    // through a chain carrying history intent `none` (it is already the
    // URL's own state, restoring it must write nothing).
    const dispatchCallsBefore = registry.executeActionsChain.mock.calls.length;
    const restoreDispatched = registry.nextDispatch();
    window.history.back();
    await new Promise((resolve) => window.addEventListener('popstate', () => resolve(undefined), { once: true }));
    await restoreDispatched;

    expect(window.location.search).toContain(`${route}=alpha`);
    const dispatched = registry.executeActionsChain.mock.calls.slice(dispatchCallsBefore).map(([chain]: [Chain]) => chain);
    const restoreMount = dispatched.find((c) => c.action.type === MOUNT && c.action.payload?.subject === 'extA');
    expect(restoreMount?.action.payload?.history).toBe('none');
  });
});

describe('FrameworkRouter — re-presenting a held domain', () => {
  it('keeps the running observer, status listeners and release path when the same router registers the domain again', async () => {
    const route = freshRoute();
    const router = buildRouter();
    const registry = new FakeRegistry();
    router.attachRegistry(registry as unknown as MfeRegistry);
    router.registerDomain(domain('domA', route));
    routersToRelease.push({ router, domainId: 'domA' });
    registry.register(extension('extA', 'domA', 'alpha'));

    router.startDomain('domA');
    const listener = vi.fn();
    router.subscribeDomainStatus('domA', listener);

    router.registerDomain(domain('domA', route));
    // A second observer would only appear here if the re-registration had
    // dropped the first one's state.
    router.startDomain('domA');

    const dispatched = registry.nextDispatch();
    const notificationsBefore = listener.mock.calls.length;
    resolveNavigationHistory().push(`/?${route}=alpha`);
    await dispatched;

    const mounts = registry.executeActionsChain.mock.calls.filter(([c]: [Chain]) => c.action.type === MOUNT);
    expect(mounts).toHaveLength(1);
    expect(listener.mock.calls.length).toBeGreaterThan(notificationsBefore);

    // `stopDomain` reaches the one observer the router holds: nothing is left observing.
    router.stopDomain('domA');
    const dispatchCallsAfterStop = registry.executeActionsChain.mock.calls.length;
    registry.mounted.delete('extA');
    resolveNavigationHistory().push('/?unrelated=1');
    resolveNavigationHistory().push(`/?${route}=alpha`);
    expect(registry.executeActionsChain.mock.calls.length).toBe(dispatchCallsAfterStop);
  });

  it('releases the prior state and frees the old route when the same router presents the domain on a different route', async () => {
    const oldRoute = freshRoute();
    const newRoute = freshRoute();
    const router = buildRouter();
    const registry = new FakeRegistry();
    router.attachRegistry(registry as unknown as MfeRegistry);
    router.registerDomain(domain('domA', oldRoute));
    routersToRelease.push({ router, domainId: 'domA' });
    registry.register(extension('extA', 'domA', 'alpha'));
    router.startDomain('domA');

    // Control: the observer on the old route is live and dispatches.
    const mountDispatched = registry.nextDispatch();
    resolveNavigationHistory().push(`/?${oldRoute}=alpha`);
    await mountDispatched;
    const unmountDispatched = registry.nextDispatch();
    resolveNavigationHistory().push('/?unrelated=1');
    await unmountDispatched;

    router.registerDomain(domain('domA', newRoute));

    // The old observer is released: the old route's entry dispatches nothing.
    const dispatchCallsAfterMove = registry.executeActionsChain.mock.calls.length;
    resolveNavigationHistory().push(`/?${oldRoute}=alpha`);
    expect(registry.executeActionsChain.mock.calls.length).toBe(dispatchCallsAfterMove);

    // The old route is free for another domain; the new route is held.
    const otherRouter = buildRouter();
    otherRouter.attachRegistry(new FakeRegistry() as unknown as MfeRegistry);
    expect(() => otherRouter.registerDomain(domain('domC', oldRoute))).not.toThrow();
    routersToRelease.push({ router: otherRouter, domainId: 'domC' });
    expect(() => otherRouter.registerDomain(domain('domD', newRoute))).toThrow(/already used/);
  });

  it('refreshes the mount and unmount action types from the re-presented declaration', async () => {
    const route = freshRoute();
    const router = buildRouter();
    const registry = new FakeRegistry();
    router.attachRegistry(registry as unknown as MfeRegistry);
    // First presentation declares no public unmount action (Exclusive domain).
    router.registerDomain({ id: 'domA', route, actions: [MOUNT] } as unknown as ExtensionDomain);
    routersToRelease.push({ router, domainId: 'domA' });
    registry.register(extension('extA', 'domA', 'alpha'));
    registry.mounted.add('extA');
    router.startDomain('domA');

    resolveNavigationHistory().push(`/?${route}=alpha`);
    resolveNavigationHistory().push('/?unrelated=1');
    expect(registry.executeActionsChain).not.toHaveBeenCalled();

    // Re-presented with an unmount action: leaving the entry unmounts.
    router.registerDomain(domain('domA', route));
    resolveNavigationHistory().push(`/?${route}=alpha`);
    const unmountDispatched = registry.nextDispatch();
    resolveNavigationHistory().push('/?unrelated=2');
    await unmountDispatched;

    const unmounts = registry.executeActionsChain.mock.calls.filter(([c]: [Chain]) => c.action.type === UNMOUNT);
    expect(unmounts).toHaveLength(1);
    expect(unmounts[0]![0].action.payload?.subject).toBe('extA');
  });
});

describe('FrameworkRouter — unregistration', () => {
  it('writes nothing to the URL when an extension or a domain is unregistered', () => {
    const route = freshRoute();
    const router = buildRouter();
    const registry = new FakeRegistry();
    router.attachRegistry(registry as unknown as MfeRegistry);
    router.registerDomain(domain('domA', route));
    registry.register(extension('extA', 'domA', 'alpha'));
    registry.mounted.add('extA');
    router.reportSettled({ actionTypeId: MOUNT, domainId: 'domA', payload: { subject: 'extA' }, succeeded: true });

    const pushSpy = vi.spyOn(window.history, 'pushState');
    const replaceSpy = vi.spyOn(window.history, 'replaceState');

    router.releaseExtension('extA');
    router.releaseDomain('domA');

    expect(pushSpy).not.toHaveBeenCalled();
    expect(replaceSpy).not.toHaveBeenCalled();
  });
});

describe('FrameworkRouter — navigation facade (ADR 0036)', () => {
  it('navigation() exposes exactly {location, navigate, replace} — no router, occupant value, or raw history', () => {
    const router = buildRouter();
    const facade = router.navigation();
    expect(Object.keys(facade).sort()).toEqual(['location', 'navigate', 'replace']);
    expect(typeof facade.location).toBe('function');
    expect(typeof facade.navigate).toBe('function');
    expect(typeof facade.replace).toBe('function');
  });

  it('exposes no URL writer for a runtime with no occupant value — the shell/root app object, or an MFE previewed with nothing mounting it', () => {
    // `app.mfeRouter` as published by `microfrontends()` for EVERY app,
    // including the root shell — no `supplyNavigation` call ever runs for a
    // runtime nothing ever mounts as an extension.
    const shellRouter = buildRouter();
    const shellAppObject = shellRouter.asHandle();

    const pushSpy = vi.spyOn(window.history, 'pushState');
    const replaceSpy = vi.spyOn(window.history, 'replaceState');

    expect(() => shellAppObject.navigation().navigate('/somewhere')).toThrow(/no occupant value/);
    expect(() => shellAppObject.navigation().replace('/somewhere')).toThrow(/no occupant value/);
    expect(pushSpy).not.toHaveBeenCalled();
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it("location() still reads the composed page's current pathname/search for a runtime with no occupant value (a read, not a write)", () => {
    window.history.replaceState(null, '', '/some-path?already=here');
    const router = buildRouter();

    const read = router.navigation().location();

    expect(read.pathname).toBe('/some-path');
    expect(read.search).toContain('already=here');
  });

  it("location() reads only this occupant's own pathname/search (D21), never a sibling's", () => {
    const route = freshRoute();
    const registry = new FakeRegistry();
    const router = buildRouter();
    router.attachRegistry(registry as unknown as MfeRegistry);
    router.registerDomain(domain('sharedDom', route));
    routersToRelease.push({ router, domainId: 'sharedDom' });
    registry.register(extension('mfeA', 'sharedDom', 'mfe-a'));
    registry.register(extension('mfeB', 'sharedDom', 'mfe-b'));
    registry.mounted.add('mfeA');
    router.reportSettled({ actionTypeId: MOUNT, domainId: 'sharedDom', payload: { subject: 'mfeA' }, succeeded: true });
    registry.mounted.add('mfeB');
    router.reportSettled({ actionTypeId: MOUNT, domainId: 'sharedDom', payload: { subject: 'mfeB' }, succeeded: true });

    const occupantA = buildRouter();
    occupantA.supplyNavigation(() => ({ domainKey: route, extension: 'mfe-a' }));
    const occupantB = buildRouter();
    occupantB.supplyNavigation(() => ({ domainKey: route, extension: 'mfe-b' }));

    occupantA.navigation().replace('/a-page?own=1');

    const aLocation = occupantA.navigation().location();
    expect(aLocation.pathname).toBe('/a-page');
    expect(aLocation.search).toContain('own=1');

    // `mfeB` never wrote, and reading through its OWN facade must not show
    // `mfeA`'s write — only its own entry, at its own default path.
    const bLocation = occupantB.navigation().location();
    expect(bLocation.search).not.toContain('own=1');
  });

  it("confines a navigation-facade write to its own occupant's entry, leaving a sibling occupant's own entry byte-for-byte untouched", () => {
    const route = freshRoute();
    const registry = new FakeRegistry();
    const router = buildRouter();
    router.attachRegistry(registry as unknown as MfeRegistry);
    router.registerDomain(domain('sharedDom', route));
    routersToRelease.push({ router, domainId: 'sharedDom' });
    registry.register(extension('mfeA', 'sharedDom', 'mfe-a'));
    registry.register(extension('mfeB', 'sharedDom', 'mfe-b'));

    // Both occupants mounted concurrently (a Concurrent-cardinality domain) —
    // one settled report carries both into the URL.
    registry.mounted.add('mfeA');
    registry.mounted.add('mfeB');
    router.reportSettled({ actionTypeId: MOUNT, domainId: 'sharedDom', payload: { subject: 'mfeA' }, succeeded: true });
    registry.mounted.add('mfeB');
    router.reportSettled({ actionTypeId: MOUNT, domainId: 'sharedDom', payload: { subject: 'mfeB' }, succeeded: true });

    const beforeSearch = window.location.search;
    expect(beforeSearch).toContain('mfe-a');
    expect(beforeSearch).toContain('mfe-b');
    const siblingEntrySegment = beforeSearch
      .split('&')
      .find((segment) => segment.includes('mfe-b'));
    expect(siblingEntrySegment).toBeDefined();

    // `mfeA`'s own occupant-local router, scoped to its own entry via the
    // occupant value (ADR 0036) — the SAME mechanism a real nested MFE's
    // own `FrameworkRouter` copy uses, obtained through `supplyNavigation`.
    const occupantRouter = buildRouter();
    occupantRouter.supplyNavigation(() => ({ domainKey: route, extension: 'mfe-a' }));

    occupantRouter.navigation().replace('/changed?q=1');

    const afterSearch = window.location.search;
    expect(afterSearch).not.toBe(beforeSearch);
    expect(afterSearch).toContain('mfe-a');
    // The sibling's own entry — under the SAME domain key — is untouched.
    const siblingEntryAfter = afterSearch.split('&').find((segment) => segment.includes('mfe-b'));
    expect(siblingEntryAfter).toBe(siblingEntrySegment);
  });
});

describe('FrameworkRouter — registry-keyed reach-through (D10)', () => {
  it('starts/stops/reads a routed domain\'s own status through the registry it is attached to, not through app.mfeRouter', () => {
    const route = freshRoute();
    const router = buildRouter();
    const registry = new FakeRegistry() as unknown as MfeRegistry;
    router.attachRegistry(registry);
    router.registerDomain(domain('domA', route));
    routersToRelease.push({ router, domainId: 'domA' });

    const listener = vi.fn();
    const release = subscribeRoutedDomainStatus(registry, 'domA', listener);
    expect(routedDomainStatus(registry, 'domA')).toEqual({ entries: 0, unresolved: 0 });

    startRoutedDomain(registry, 'domA');
    // A second call reuses the same observer rather than starting a new one
    // (`FrameworkRouter.startDomain`'s own doc comment: safe to call more
    // than once).
    startRoutedDomain(registry, 'domA');

    stopRoutedDomain(registry, 'domA');
    expect(listener).toHaveBeenCalled();
    release();
  });

  it('is a safe no-op for a registry with no FrameworkRouter attached', () => {
    const registry = new FakeRegistry() as unknown as MfeRegistry;
    expect(() => startRoutedDomain(registry, 'unknown')).not.toThrow();
    expect(() => stopRoutedDomain(registry, 'unknown')).not.toThrow();
    expect(routedDomainStatus(registry, 'unknown')).toEqual({ entries: 0, unresolved: 0 });
    expect(() => subscribeRoutedDomainStatus(registry, 'unknown', () => {})()).not.toThrow();
  });
});

describe('teardownRoutedDomain — a host releasing a routed domain\'s occupants itself', () => {
  it("stops the domain's own observer before `release` runs, so the release's own removals are never seen as URL transitions", async () => {
    const route = freshRoute();
    const router = buildRouter();
    const registry = new FakeRegistry();
    router.attachRegistry(registry as unknown as MfeRegistry);
    router.registerDomain(domain('domA', route));
    routersToRelease.push({ router, domainId: 'domA' });
    registry.register(extension('extA', 'domA', 'alpha'));
    registry.mounted.add('extA');
    router.reportSettled({ actionTypeId: MOUNT, domainId: 'domA', payload: { subject: 'extA' }, succeeded: true });
    startRoutedDomain(registry as unknown as MfeRegistry, 'domA');

    const order: string[] = [];
    const release = vi.fn(async () => {
      order.push('release');
      registry.mounted.delete('extA');
    });

    const originalStop = router.stopDomain.bind(router);
    vi.spyOn(router, 'stopDomain').mockImplementation((domainId: string) => {
      order.push('stop');
      originalStop(domainId);
    });

    await teardownRoutedDomain(registry as unknown as MfeRegistry, 'domA', release);

    expect(order).toEqual(['stop', 'release']);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('still runs `release` for a registry with no FrameworkRouter attached, or an unrouted/unknown domain', async () => {
    const registry = new FakeRegistry() as unknown as MfeRegistry;
    const release = vi.fn(async () => {});
    await teardownRoutedDomain(registry, 'unknown', release);
    expect(release).toHaveBeenCalledTimes(1);
  });
});

/**
 * `routersByRegistry` realm-global rendezvous — the MFE build pipeline that
 * mints `@gears-frontx/react` as its own standalone shared-dependency chunk
 * inlines this WHOLE module's graph a second time (its exact-specifier-only
 * externalization does not recognize `@gears-frontx/framework/internal`,
 * the subpath `@gears-frontx/react`'s own components import these
 * functions through, as the same shared package — see this file's "Realm-
 * global rendezvous #3" comment above `ROUTERS_BY_REGISTRY_SLOT`). A
 * module-scoped `WeakMap` would then diverge between the two independently
 * bundled copies: `attachRegistry` (called where `@gears-frontx/framework`
 * is loaded) would populate a DIFFERENT map than the one
 * `buildExtensionHistory`/`startRoutedDomain`/etc. (called from the copy
 * inlined into `@gears-frontx/react`) reads — reproducing the
 * `[ExtensionRouter] the given registry has no FrameworkRouter attached`
 * failure a real app hits. `vi.resetModules()` plus a fresh dynamic
 * `import('../router')` stands in for that second, independently bundled
 * copy: it is a genuinely separate module instance (fresh top-level state),
 * the same relationship two esbuild-minted chunks have to each other, while
 * `globalThis` — the realm — stays the one thing both copies share, exactly
 * as it does for two MF-minted chunks in the same page.
 */
describe('routersByRegistry — realm-global rendezvous across independently bundled copies', () => {
  it('a router attached via one loaded copy of this module is found by buildExtensionHistory() on another', async () => {
    vi.resetModules();
    const copyA = await import('../router');
    vi.resetModules();
    const copyB = await import('../router');

    const registry = new FakeRegistry() as unknown as MfeRegistry;
    const router = new copyA.FrameworkRouter({ typeSystem: fakeTypeSystem });
    router.attachRegistry(registry);

    // The registry has no `FrameworkRouter` attached from copy B's own
    // (independent) module-scope perspective — only the realm-global
    // rendezvous makes this resolve, proving the lookup is not
    // module-scoped.
    expect(copyB.buildExtensionHistory(registry)).toBeDefined();
    expect(copyB.routedDomainStatus(registry, 'unknown-domain')).toEqual({ entries: 0, unresolved: 0 });
  });
});
