/**
 * demo-mfe widgets-host lifecycle.
 *
 * Constructs a nested FrontX app that owns the widgets ExtensionDomain (per
 * Phase 1.5 audit Q5 single-owner rule). The widgets domain GTS instance is
 * authored inside `demo-mfe/mfe.json`'s `domains[]` array — content-addressed
 * by its GTS instance ID and registered into the nested type system from the
 * global runtime-fetched manifest. TypeScript transports the entity, never
 * defines it.
 *
 * Discovery follows the Phase 5.6 runtime-fetch contract: this nested app
 * fetches the same `generated-mfe-manifests.json` the host bootstrap fetches.
 * For each MFE package in the global manifest, schemas / manifest / domains /
 * entries are registered opaquely on the nested type system (Phase 6.7 order:
 * schemas → manifest → domains → entries → extensions). The widgets domain
 * instance is located in the registered domains by its GTS instance ID, then
 * the nested app takes ownership via `registry.registerDomain(domain, factory)`.
 * Extensions whose `domain` matches the widgets domain are registered opaquely
 * on the nested registry. No build-time imports of foreign-package mfe.json
 * files, no hardcoded URLs, no GTS-entity decomposition in L4 code.
 *
 * The widgets domain is itself routed (its own `route: "widgets"` composes a
 * nested domain key under whatever address the shell broadcast Widgets Host
 * under — D5/D6): its own `DomainRouting` is constructed once this screen's
 * bootstrap has resolved and the shell-broadcast entry address for THIS
 * mount is known, and back-projects each widget's mount/unmount exactly like
 * the shell's own four domains, plus the auto-mount-on-attach coalescing and
 * deferred-write rules a nested, self-mounting domain needs (D6).
 */
import React, { useEffect, useState } from 'react';
import {
  createFrontX,
  effects,
  microfrontends,
  queryCacheShared,
  mock,
  gtsPlugin,
  ConcurrentMountStrategy,
  ExtensionDomainImplementation,
  ExtensionDomainImplementationFactory,
  ActionHandler,
  FRONTX_ACTION_MOUNT_EXT,
  FRONTX_ACTION_UNMOUNT_EXT,
  FRONTX_MFE_ENTRY_MF,
  MfeHandlerMF,
  ExtensionDomainSlot,
  ThemeAwareReactLifecycle,
  screenDomain,
  type ContainerHooks,
  type DomainContext,
  type ActionPayload,
  type MountStrategy,
  type ExtensionDomain,
  type Extension,
  type ChildMfeBridge,
  type MfeMountContext,
  type MfManifest,
  type MfeEntryMF,
  type JSONSchema,
  type MfeRegistry,
} from '@gears-frontx/react';
import {
  resolveNavigationHistory,
  createRouteSignal,
  composeDomainKey,
  type EntryAddress,
  type NavigationHistory,
  type RouteSignal,
} from '@gears-frontx/routing';
import {
  themeSchema,
  languageSchema,
  extensionScreenSchema,
} from '@gears-frontx/frontx-template-shell';
import {
  FRONTX_SHARED_PROPERTY_ENTRY_ADDRESSES,
  DomainRouting,
  dispatchChain,
  buildEntryAddresses,
  readEntryAddress,
} from '@gears-frontx/react';
import { routedScreen } from './shared/routedScreen';

const WIDGETS_DOMAIN_ID =
  'gts.frontx.mfes.ext.domain.v1~frontx.widgets.area.main.v1';

const WIDGET_PING_ACTION_TYPE =
  'gts.frontx.mfes.comm.action.v1~frontx.widgets.test.widget_ping.v1~';

interface MfeManifestConfig {
  manifest: MfManifest;
  domains?: ExtensionDomain[];
  entries: MfeEntryMF[];
  extensions?: Extension[];
  schemas?: JSONSchema[];
}

class WidgetsContainerHooks implements ContainerHooks {
  private readonly elements = new Map<string, HTMLElement>();

  create(extensionId: string): Element {
    const el = document.createElement('div');
    el.dataset.widgetExtensionId = extensionId;
    el.style.minHeight = '4rem';
    this.elements.set(extensionId, el);
    return el;
  }

  destroy(extensionId: string, container?: Element): void {
    if (!container || this.elements.get(extensionId) === container) {
      this.elements.delete(extensionId);
    }
  }
}

/**
 * Per-mount routing and this implementation, read at call time: the nested
 * registry may outlive one mount. Exported only so `bootstrapWidgetsRuntime`
 * (also exported test-only, below) is callable from a test without a full
 * `mount()` cycle — see `lifecycle-widgets-host.gts-order.test.ts`.
 */
export interface WidgetsRoutingHolder {
  routing: DomainRouting | undefined;
  impl: WidgetsDomainImpl | undefined;
}

class WidgetsDomainImpl extends ExtensionDomainImplementation {
  private readonly strategy: ConcurrentMountStrategy;
  private readonly inFlight = new Map<string, Promise<void>>();
  private readonly waiters = new Map<string, Array<() => void>>();

  constructor(ctx: DomainContext, hooks: ContainerHooks, private readonly registry: MfeRegistry, private readonly holder: WidgetsRoutingHolder) {
    super();
    holder.impl = this;
    this.strategy = new ConcurrentMountStrategy(ctx.mounter, hooks);
    ctx.registerHandler(FRONTX_ACTION_MOUNT_EXT, ActionHandler.fromFunction((_t, p) => this.mount(p as ActionPayload)));
    ctx.registerHandler(
      FRONTX_ACTION_UNMOUNT_EXT,
      ActionHandler.fromFunction(async (_t, p) => {
        const payload = p as ActionPayload;
        await this.strategy.unmount!(payload);
        this.holder.routing?.afterUnmount(payload.subject);
      }),
    );
  }

  /**
   * Dispatch a mount through the actions chain and learn when it settled. Settles on the first of:
   * this domain's handler settling for `subject`; a synchronous refusal; the promise
   * executeActionsChain returned (today it resolves even when the chain failed before any
   * handler); the domain's own action timeout. After #648 there is no promise — the other three remain.
   */
  mountThroughChain(subject: string, timeoutMs: number): Promise<void> {
    const settled = new Promise<void>((resolve) => this.waiters.set(subject, [...(this.waiters.get(subject) ?? []), resolve]));
    const timer = setTimeout(() => {
      // Only this wait gives up: the handler keeps running. If it still settles later, its
      // afterMount runs after endOpening() and makes a separate push of its own (a second history
      // entry) — the warning is what marks that case in the live run.
      console.warn(`[demo-mfe widgets-host] mount of ${subject} did not settle within ${timeoutMs}ms`);
      this.settle(subject);
    }, timeoutMs);
    void settled.then(() => clearTimeout(timer));
    const result = dispatchChain(this.registry, { action: { type: FRONTX_ACTION_MOUNT_EXT, target: WIDGETS_DOMAIN_ID, payload: { subject } } }, `mount ${subject}`);
    if (!result.accepted) this.settle(subject);
    else void result.settled?.then(() => this.settle(subject));
    return settled;
  }

  private settle(subject: string): void {
    for (const resolve of this.waiters.get(subject) ?? []) resolve();
    this.waiters.delete(subject);
  }

  /**
   * Release every admitted widget through the strategy before React destroys
   * the domain slot. Waiting for in-flight strategy mounts first makes the
   * mounter's later fire-and-forget `detach()` observe an empty mount-set;
   * the core mounter remains the fallback that clears DOM, mount-state and
   * the container teardown callback if this lifecycle path is interrupted.
   */
  async releaseAll(): Promise<void> {
    // A chain can still be inside `strategy.mount()` when its host starts
    // teardown. Snapshotting the mounted set first misses that subject, then
    // lets it become mounted after this method returns. Wait for every
    // already-admitted mount before taking the teardown snapshot.
    await Promise.allSettled([...this.inFlight.values()]);
    const mounted = Array.from(this.registry.getMountedExtensions(WIDGETS_DOMAIN_ID));
    const results = await Promise.allSettled(mounted.map((subject) => this.strategy.unmount!({ subject })));
    for (const result of results) {
      if (result.status === 'rejected') {
        // One broken widget must not keep other widgets mounted or prevent
        // the host lifecycle from reaching React-root cleanup.
        console.error('[demo-mfe widgets-host] failed to release widget', result.reason);
      }
    }
  }

  /** ConcurrentMountStrategy is not idempotent: a URL restore, the auto-mount pass and a chain may ask at once. */
  private mount(payload: ActionPayload): Promise<void> {
    const subject = payload.subject;
    const pending = this.inFlight.get(subject);
    if (pending) return pending;
    if (this.registry.getMountedExtensions(WIDGETS_DOMAIN_ID).includes(subject)) {
      this.holder.routing?.afterMount(subject);
      this.settle(subject);
      return Promise.resolve();
    }
    const work = (async () => {
      try {
        await this.strategy.mount(payload);
        // Before this handler settles: the chain's next step (the ping) needs the widget's entry in the URL.
        this.holder.routing?.afterMount(subject);
      } finally {
        this.inFlight.delete(subject);
        this.settle(subject);
      }
    })();
    this.inFlight.set(subject, work);
    return work;
  }

  protected getMountStrategies(): MountStrategy[] {
    return [this.strategy];
  }
}

class WidgetsDomainFactory extends ExtensionDomainImplementationFactory {
  constructor(private readonly registry: MfeRegistry, private readonly holder: WidgetsRoutingHolder) {
    super();
  }
  build(ctx: DomainContext): WidgetsDomainImpl {
    return new WidgetsDomainImpl(ctx, new WidgetsContainerHooks(), this.registry, this.holder);
  }
}

function createWidgetsHostApp(): ReturnType<ReturnType<typeof createFrontX>['build']> {
  return createFrontX()
    .use(effects())
    .use(microfrontends({
      typeSystem: gtsPlugin,
      mfeHandlers: [new MfeHandlerMF(FRONTX_MFE_ENTRY_MF)],
    }))
    .use(queryCacheShared())
    .use(mock())
    .build();
}

/**
 * A `microfrontends()`-FREE placeholder app, used ONLY as the `app` argument
 * `ThemeAwareReactLifecycle`'s constructor requires (for the shared
 * query-cache / theme context `FrontXProvider` resolves).
 *
 * `@gears-frontx/framework`'s `microfrontends()` plugin builds its
 * `MfeRegistry` through a module-level singleton factory
 * (`mfeRegistryFactory` in `template-shell/packages/framework/src/mfe/registry.ts`):
 * the FIRST call to build a registry within this loaded copy of the module
 * wins permanently — every later `createWidgetsHostApp()` call (regardless
 * of new plugin config) returns THAT SAME cached `MfeRegistry` instance, not
 * a fresh one. `DemoMfeWidgetsHostLifecycle`'s own constructor runs at
 * module-evaluation time (when this file's default export is constructed),
 * always strictly BEFORE any `mount()` call and therefore always outside the
 * ambient mounting-bridge rendezvous window `DefaultMountManager` opens
 * around the synchronous portion of `lifecycle.mount(...)`. If the
 * constructor called the real, `microfrontends()`-bearing `createWidgetsHostApp()`,
 * it would permanently consume that one first-build slot with a registry
 * that adopts no inbound bridge — degrading every future mount of this
 * extension to root-registry behavior for good, regardless of any fix to
 * WHERE the nested registry construction happens relative to `mount()`.
 * This placeholder never touches `microfrontends()`, so it never calls
 * `mfeRegistryFactory.build()` — leaving that one slot free for
 * `DemoMfeWidgetsHostLifecycle.mount()`'s own, later, synchronous call to
 * the real `createWidgetsHostApp()` to win it from inside the rendezvous
 * window instead.
 */
function createWidgetsHostAppShell(): ReturnType<ReturnType<typeof createFrontX>['build']> {
  return createFrontX()
    .use(effects())
    .use(queryCacheShared())
    .use(mock())
    .build();
}

/**
 * Bootstrap demo-mfe's widgets-host child runtime:
 *   1. Fetch the global manifest at runtime from the public-asset URL the
 *      generation script writes (Phase 5.6 contract).
 *   2. First pass: register every package's schemas opaquely on the child
 *      type system so derived-schema chains resolve regardless of package
 *      iteration order.
 *   3. Second pass: for each package, register manifest, domains, then
 *      entries opaquely on the child type system (Phase 6.7 order:
 *      schemas → manifest → domains → entries → extensions). While iterating
 *      domains, locate the widgets domain by its GTS instance ID so the
 *      nested app can take ownership of it via `registry.registerDomain(...)`.
 *   4. Take ownership of the widgets domain (registerDomain on the nested
 *      registry, paired with the local `WidgetsDomainFactory`) — skipped when
 *      a cached registry (HMR, a remount) already owns it.
 *   5. Third pass: for each extension whose target domain is the widgets
 *      domain, register it opaquely on the child registry — skipped per
 *      extension already registered.
 *
 * GTS entities flow through unchanged — no spread, no override, no
 * decomposition, no L4 reconstruction. The generation script inlines the
 * resolved `MfManifest` object into each entry's `manifest` field so entries
 * are registered opaquely without any consumer-side spread. The widgets
 * domain instance is authored once in `demo-mfe/mfe.json` (`domains[]`) and
 * arrives here through the same fetched manifest pipeline as every other GTS
 * entity.
 *
 * Returns the located widgets domain declaration so the caller can read its
 * `route` and `defaultActionTimeout` without a second manifest walk.
 */
/**
 * Exported test-only (see `WidgetsRoutingHolder`'s doc comment): production
 * code only ever reaches this through `DemoMfeWidgetsHostLifecycle.mount()`.
 */
export async function bootstrapWidgetsRuntime(
  app: ReturnType<typeof createWidgetsHostApp>,
  holder: WidgetsRoutingHolder,
): Promise<ExtensionDomain> {
  const registry = app.mfeRegistry;
  if (!registry) {
    throw new Error(
      'demo-mfe widgets-host: app.mfeRegistry is undefined.',
    );
  }

  console.info(
    '[demo-mfe widgets-host] Fetching MFE manifests from /generated-mfe-manifests.json',
  );
  const response = await fetch('/generated-mfe-manifests.json');
  if (!response.ok) {
    throw new Error(
      `[demo-mfe widgets-host] Failed to load MFE manifests from /generated-mfe-manifests.json: ${response.status} ${response.statusText}`,
    );
  }
  const manifests = (await response.json()) as MfeManifestConfig[];

  for (const config of manifests) {
    for (const schema of config.schemas ?? []) {
      registry.typeSystem.registerSchema(schema);
    }
  }

  // This nested type system's GtsStore is wholly independent of the shell's
  // (each GtsPlugin instance owns its own store — see plugin.ts), and this
  // runtime never ran the shell-only `main.tsx` registration that puts the
  // three application-layer derived schemas (theme, language, extension_screen)
  // onto the shell's own `gtsPlugin` singleton (see
  // `loader.ts`'s comment: "application-specific derived schemas ...
  // registered at the application layer"). They MUST be registered here
  // before ANY domain that references them by `x-gts-ref` in its own
  // `sharedProperties` — not only the well-known `screenDomain` registered
  // below, but also the manifest-declared widgets domain in the loop that
  // follows. The framework plugin has already registered the entry-addresses
  // schema required by its base domain contract before this runtime exists.
  // Registering these three ahead of the manifest-driven domain loop covers
  // the application-level schema ordering rule.
  registry.typeSystem.registerSchema(themeSchema);
  registry.typeSystem.registerSchema(languageSchema);
  registry.typeSystem.registerSchema(extensionScreenSchema);

  let widgetsDomain: ExtensionDomain | undefined;
  for (const config of manifests) {
    registry.typeSystem.register(config.manifest);
    for (const domain of config.domains ?? []) {
      registry.typeSystem.register(domain);
      if (domain.id === WIDGETS_DOMAIN_ID) {
        widgetsDomain = domain;
      }
    }
    for (const entry of config.entries) {
      registry.typeSystem.register(entry);
    }
  }

  if (!widgetsDomain) {
    throw new Error(
      `[demo-mfe widgets-host] Widgets domain ${WIDGETS_DOMAIN_ID} not found in any registered MFE manifest's domains[].`,
    );
  }

  // `screenDomain` is a well-known framework declaration (not authored in any
  // package's mfe.json), so it is registered directly here rather than
  // sourced from the fetched manifest — this registry never takes ownership
  // of it (no `registerDomain` call), it only needs the declaration present
  // for `x-gts-ref` resolution (e.g. widget-a's "mount Hello World in the
  // shell's screen domain" escalates through here on its way up, and
  // admission validation for that action checks referenced entities against
  // THIS store before the action ever reaches cross-hop routing). Its own
  // four referenced schemas were already registered above.
  registry.typeSystem.register(screenDomain);

  // Guarded against a cached registry (HMR, a remount on the same nested
  // `MfeRegistry` singleton): `registerDomain`/`registerExtension` on an
  // already-owned domain/extension would either throw or duplicate
  // registration depending on the registry's own idempotency guarantees,
  // neither of which this bootstrap can rely on across repeated calls.
  if (!registry.getDomain(WIDGETS_DOMAIN_ID)) {
    registry.registerDomain(widgetsDomain, new WidgetsDomainFactory(registry, holder));
  }

  for (const config of manifests) {
    for (const extension of config.extensions ?? []) {
      // Register every extension declared by any fetched manifest opaquely
      // on this nested type system — not just the widgets-domain ones this
      // registry owns and mounts below — so `x-gts-ref` validation for an
      // action referencing a foreign-domain extension instance (e.g. the
      // shell's Hello World screen extension) resolves against this
      // registry's own independent GtsStore. This registration is
      // type-system-only: it does not admit the extension for mounting in
      // this registry (that stays gated by the WIDGETS_DOMAIN_ID check
      // below, via `registerExtension`).
      registry.typeSystem.register(extension);
      if (extension.domain === WIDGETS_DOMAIN_ID && !registry.getExtension(extension.id)) {
        await registry.registerExtension(extension);
      }
    }
  }

  return widgetsDomain;
}

/** Module-level lazy singleton: one `resolveNavigationHistory()` and one `createRouteSignal` per module, mirroring the shell's own `shellNavigation()`. */
let navigation: { history: NavigationHistory; signal: RouteSignal } | undefined;

function widgetsNavigation(): { history: NavigationHistory; signal: RouteSignal } {
  if (!navigation) {
    const history = resolveNavigationHistory();
    navigation = { history, signal: createRouteSignal(history) };
  }
  return navigation;
}

/**
 * Module-level singleton, not a per-mount instance field: `bootstrapWidgetsRuntime`
 * guards `registerDomain` against a cached nested registry (HMR, a remount),
 * so on a remount the factory — and therefore `WidgetsDomainImpl`'s own
 * `holder.impl = this` assignment — never runs again. A fresh
 * `{ routing: undefined, impl: undefined }` object per `mount()` would leave
 * that remount's holder with no `impl` at all, and `mountThroughChain` would
 * throw reading `undefined`. Keeping the SAME object across every mount, and
 * only resetting its `routing` field (never `impl`, which belongs to the
 * domain implementation instance and outlives any one mount), is what lets a
 * remount still reach the original `WidgetsDomainImpl`.
 *
 * This same reasoning is why an HMR update of THIS module must not hand the
 * next `bootstrapWidgetsRuntime()` call a fresh holder either: HMR replaces
 * this module's own top-level bindings (a plain `const` here would start
 * `{ impl: undefined }` again on every edit), but it does NOT replace the
 * cached nested `MfeRegistry` (that singleton lives in `@gears-frontx/framework`'s
 * own module, untouched by this file's reload — see `createWidgetsHostApp`'s
 * doc comment) or the `WidgetsDomainImpl` instance already registered on it.
 * `bootstrapWidgetsRuntime`'s `!registry.getDomain(...)` guard then skips
 * `registerDomain` on the post-HMR pass (the domain is still there), so the
 * factory that performs `holder.impl = this` never runs again for the new
 * holder — reproducing the exact "fresh holder, cached registry" gap the
 * paragraph above already fixed for a plain remount, this time via HMR
 * instead of an unmount/remount cycle.
 *
 * Recovering the PREVIOUS module instance's holder is done through a
 * `globalThis`-keyed slot, the SAME mechanism `@gears-frontx/routing`'s own
 * `resolveNavigationHistory()` already uses to survive this exact class of
 * module-identity break (`src/history/singleton.ts`'s `NAVIGATION_HISTORY_KEY`)
 * — not `import.meta.hot.data`: that field is only ever populated by a real
 * Vite dev server walking its module graph on an actual file-save HMR event,
 * so it stays `undefined` in every other realm this module can load in
 * (a production build, a test runner's module loader, SSR) and would leave
 * this bug fixed only in the one environment hardest to write a regression
 * test against. A `globalThis` slot survives any module-identity reset for
 * the same reason `resolveNavigationHistory()`'s does — the realm object
 * itself is never torn down — which is what lets the test below reproduce
 * the fresh-module/cached-registry gap with a plain `vi.resetModules()`,
 * no real dev server required. This is symmetric with the existing
 * `import.meta.hot.dispose` below, which already reasons about `widgetsHolder`
 * surviving its own module's reload: it stops the OLD `routing` there and
 * leaves `impl` alone for the same reason this recovers it here.
 */
const WIDGETS_HOLDER_KEY = Symbol.for('@gears-frontx/demo-mfe/widgets-host-holder/v1');
const realm = globalThis as Record<symbol, WidgetsRoutingHolder | undefined>;
const widgetsHolder: WidgetsRoutingHolder = realm[WIDGETS_HOLDER_KEY] ?? { routing: undefined, impl: undefined };
realm[WIDGETS_HOLDER_KEY] = widgetsHolder;

interface WidgetsHostScreenProps {
  /**
   * The SAME in-flight `bootstrapWidgetsRuntime(...)` promise
   * `DemoMfeWidgetsHostLifecycle.mount()` started synchronously (before any
   * `await`) and is itself awaiting before its own returned promise
   * resolves. This component never re-invokes `bootstrapWidgetsRuntime` —
   * it only subscribes to this already-started promise to drive its own
   * loading/error UI. The registry-level `registerDomain` call this promise
   * guards completes independently of (and strictly no later than) whatever
   * turn React schedules this effect on, so an action chain's `next`
   * continuation targeting the widgets domain is always routable by the
   * time `mount()` resolves — regardless of this component's own render
   * timing.
   */
  readonly bootstrap: Promise<ExtensionDomain>;
  /**
   * The entry address the shell broadcast for THIS mount of Widgets Host —
   * `undefined` for a standalone mount (no host, or a host without routing).
   * Held by the lifecycle rather than re-read from the bridge here, since a
   * remount's second `readEntryAddress` call happens in `mount()`, before
   * this component is (re-)rendered.
   */
  readonly address: EntryAddress | undefined;
  readonly registry: MfeRegistry;
  /** Read-only here — `holder.impl` is set once by `WidgetsDomainImpl`'s own constructor and never reassigned by this component. */
  readonly holder: WidgetsRoutingHolder;
  /**
   * Writes `widgetsHolder.routing`, in the lifecycle's own module scope
   * rather than as a direct mutation of the `holder` prop object here: a
   * prop is treated as immutable by this project's lint rule (and by the
   * React Compiler this codebase targets), so the write goes through this
   * callback instead.
   */
  readonly setRouting: (routing: DomainRouting | undefined) => void;
  /**
   * Signals `DemoMfeWidgetsHostLifecycle.mount()` that `ExtensionDomainSlot`'s
   * own `mounter.attach(root)` has completed for the widgets domain — i.e.
   * that `DefaultExtensionMounter` now has a DOM root to mount into, so a
   * `mount_ext` dispatched into this domain will not throw "no root attached
   * for domain ...". `registerDomain` completing (the `bootstrap` promise
   * above) is necessary for a chain's `next` continuation targeting this
   * domain to be ROUTABLE at all, but it is not sufficient for that
   * continuation to actually MOUNT anything: `ExtensionDomainSlot` only
   * renders once this component's own `ready` state flips true (which
   * itself only happens after `bootstrap` resolves), and its root-attach
   * effect runs on a LATER React commit than the microtask that resolves
   * `mount()`'s own promise and immediately drives the chain's `next` node.
   * Awaiting this signal too — not just `bootstrap` — is what closes that
   * second race.
   *
   * This component deliberately delays calling it until AFTER its own
   * auto-mount-on-attach pass (below) has settled for every extension
   * currently registered on this domain — not the instant `attach()`
   * returns. `ExtensionDomainSlot` only renders once this component's own
   * `ready` state flips true, and its root-attach effect runs on a LATER
   * React commit than the microtask that resolves `mount()`'s own promise
   * and immediately drives a chain's `next` continuation. If that
   * continuation dispatched a `mount_ext` for this domain before
   * `DefaultExtensionMounter` had a root attached, it would throw "no root
   * attached for domain ...". Deferring this signal until after the
   * auto-mount pass settles means any later `mount_ext` for an extension
   * this pass already mounted lands on the cheap, safe
   * `mountState === 'mounted'` early-return in `mountExtension` instead of
   * racing the root-attach timing a second time.
   */
  readonly onDomainAttached: () => void;
}

function WidgetsHostScreen({
  bootstrap,
  address,
  registry,
  holder,
  setRouting,
  onDomainAttached,
}: WidgetsHostScreenProps): React.ReactElement {
  const [widgetsDomain, setWidgetsDomain] = useState<ExtensionDomain | undefined>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    bootstrap
      .then((domain) => {
        if (!cancelled) setWidgetsDomain(domain);
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[demo-mfe widgets-host] runtime bootstrap failed:', err);
        if (!cancelled) setError(msg);
      });
    return () => {
      cancelled = true;
    };
  }, [bootstrap]);

  // `ExtensionDomainSlot` renders only once `widgetsDomain` is set (below), so
  // by the time this fires `widgetsDomain` is always defined — the non-null
  // assertion mirrors that render-gating rather than asserting past it.
  const handleAttached = (): void => {
    const domain = widgetsDomain!;
    if (holder.routing) {
      // Re-entry guard (Q2): `ExtensionDomainSlot`'s own `onAttached` can fire more
      // than once for the same domain mount without an intervening `unmount` (a
      // double-invoked effect in dev, or a slot re-attach) — this component's
      // `handleAttached` is re-created every render, so a second call would
      // otherwise construct a second `DomainRouting` while the first stays
      // subscribed, leaving two live observers racing writes to the same URL.
      // Stopping the previous one first keeps at most one subscription live.
      holder.routing.stop();
    }
    // Held locally: a remount may replace holder.routing while this pass awaits.
    let routing: DomainRouting | undefined;
    if (address && domain.route) {
      const domainKey = composeDomainKey(address.domainKey, address.extension, domain.route);
      routing = new DomainRouting({
        ...widgetsNavigation(),
        registry,
        domainId: WIDGETS_DOMAIN_ID,
        domainKey,
        mountActionType: FRONTX_ACTION_MOUNT_EXT,
        unmountActionType: FRONTX_ACTION_UNMOUNT_EXT,
        cardinality: 'multiple',
        enclosing: address,
      });
      setRouting(routing);
      registry.updateSharedProperty(
        FRONTX_SHARED_PROPERTY_ENTRY_ADDRESSES,
        buildEntryAddresses(registry, [{ domainId: WIDGETS_DOMAIN_ID, domainKey }]),
      );
      routing.start();
    }
    const ids = registry.getExtensionsForDomain(WIDGETS_DOMAIN_ID).map((e) => e.id);
    const autoMount = (): Promise<void> =>
      Promise.allSettled(ids.map((id) => holder.impl!.mountThroughChain(id, domain.defaultActionTimeout))).then(() => undefined);
    void (routing ? routing.withOpening(autoMount) : autoMount())
      .then(() => {
        onDomainAttached(); // mount() resolves only now — after the opening write is made or deferred
      })
      .catch((err: unknown) => {
        // Q4: without this catch, a rejection here (e.g. `withOpening` itself
        // throwing) would leave `onDomainAttached` uncalled forever — `mount()`
        // awaits the promise `onDomainAttached` resolves (`domainAttachedPromise`)
        // alongside `bootstrapPromise`, so a silently-hung gating pass would hang
        // the whole extension mount. Resolving anyway is the same "best effort,
        // do not block mounting" stance `bootstrapWidgetsRuntime`'s per-extension
        // registration loop already takes.
        console.error('[demo-mfe widgets-host] opening/auto-mount pass failed:', err);
        onDomainAttached();
      });
  };

  if (error) {
    return (
      <div
        className="p-4 text-red-700"
        data-demo-mfe-widgets-host="error"
      >
        Widgets host runtime failed: {error}
      </div>
    );
  }

  if (!widgetsDomain) {
    return (
      <div className="p-4" data-demo-mfe-widgets-host="loading">
        Loading widgets host runtime…
      </div>
    );
  }

  const pingTargets = registry
    .getExtensionsForDomain(WIDGETS_DOMAIN_ID)
    .filter((ext) => {
      const entry = registry.typeSystem.getSchema(ext.entry) as
        | { actions?: readonly string[] }
        | undefined;
      return entry?.actions?.includes(WIDGET_PING_ACTION_TYPE) ?? false;
    });

  // #648: `executeActionsChain` is no longer guaranteed to return a promise (it can refuse
  // synchronously and return nothing), so an unconditional `.catch()` on its result would
  // throw `undefined.catch` even though the chain ran. `dispatchChain` already normalizes all
  // three shapes (sync throw, `undefined`, a promise) — same helper `mountThroughChain` above
  // uses, rather than a second bespoke adapter for the same problem.
  const handlePing = (extensionId: string): void => {
    dispatchChain(
      registry,
      { action: { type: WIDGET_PING_ACTION_TYPE, target: extensionId, payload: {} } },
      `ping ${extensionId}`,
    );
  };

  return (
    <div
      data-demo-mfe-widgets-host="true"
      className="flex h-full flex-col gap-2 p-4"
    >
      <header>
        <h2 className="text-xl font-semibold">Widgets Host</h2>
        <p className="text-sm opacity-75">
          Multi-mount fixture: widgets-fixture-a's entry is wired here as
          two distinct extension instances (alpha and beta) sharing the same
          entry path; widgets-fixture-b's entry is wired as a third
          instance. All three render concurrently in the widgets domain
          slot below.
        </p>
      </header>
      <div className="flex flex-wrap gap-2">
        {pingTargets.map((ext) => {
          const role = ext.id.includes('widget_alpha') ? 'alpha' : 'beta';
          return (
            <button
              key={ext.id}
              type="button"
              data-testid={`ping-${role}`}
              data-target-extension-id={ext.id}
              onClick={() => handlePing(ext.id)}
              className="rounded border border-blue-400 bg-blue-100 px-3 py-1 text-sm text-blue-900 hover:bg-blue-200"
            >
              Ping {role}
            </button>
          );
        })}
      </div>
      <ExtensionDomainSlot
        registry={registry}
        domainId={WIDGETS_DOMAIN_ID}
        className="demo-mfe-widgets-host-slot"
        onAttached={handleAttached}
      />
    </div>
  );
}

class DemoMfeWidgetsHostLifecycle extends ThemeAwareReactLifecycle {
  /**
   * The nested app/registry the currently-mounted `WidgetsHostScreen`
   * renders against, constructed synchronously in `mount()` below — see
   * `WidgetsHostScreenProps.app`'s doc comment for why this must not be
   * built lazily inside the React tree.
   */
  private widgetsApp: ReturnType<typeof createWidgetsHostApp> | undefined;

  /**
   * The `bootstrapWidgetsRuntime(...)` promise started synchronously (before
   * any `await`) inside `mount()`, and awaited by `mount()` itself before
   * `mount()`'s own returned promise settles. This is what closes the async
   * race: `registry.registerDomain(widgetsDomain, ...)` — the call that
   * makes the widgets domain routable/forward-able from the shell's
   * mediator — happens inside this promise's chain, and `mount()` does not
   * resolve until it has completed. `WidgetsHostScreen` also subscribes to
   * this SAME promise (passed down as a prop) purely to drive its own
   * loading/error UI; it never re-invokes `bootstrapWidgetsRuntime`.
   */
  private bootstrapPromise: Promise<ExtensionDomain> | undefined;

  /**
   * Resolves once `ExtensionDomainSlot`'s `onAttached` callback has fired for
   * the widgets domain and this screen's own auto-mount-on-attach pass has
   * settled for every extension currently registered on this domain — i.e.
   * `DefaultExtensionMounter.attach(root)` has actually run, so the domain
   * has a DOM root to mount into, AND the opening write (or its deferral) is
   * already made. `mount()` awaits this ALONGSIDE `bootstrapPromise` (see
   * that field's doc comment for why `registerDomain` completing is
   * necessary but not sufficient): `ExtensionDomainSlot` only renders — and
   * only then, on a LATER React commit, attaches — once `WidgetsHostScreen`'s
   * own `ready` state flips true, which itself only happens after
   * `bootstrapPromise` resolves. Without also awaiting this signal, a
   * chain's `next` continuation targeting this domain (routable as soon as
   * `bootstrapPromise` resolves) can reach `ConcurrentMountStrategy.mount()`
   * before the mounter has a root, and `DefaultExtensionMounter.mount()`
   * throws "no root attached for domain ...".
   */
  private domainAttachedPromise: Promise<void> | undefined;

  /**
   * Resolve function for `domainAttachedPromise`, wired to `WidgetsHostScreen`'s
   * `onDomainAttached` prop each `mount()`. Set synchronously inside `mount()`
   * before `WidgetsHostScreen` is rendered, so the prop is always defined by
   * the time the component's `handleAttached` callback could possibly fire.
   */
  private onDomainAttached: () => void = () => {};

  /** The entry address the shell broadcast for the current mount — read once in `mount()`, before any await. */
  private address: EntryAddress | undefined;

  constructor() {
    // A `microfrontends()`-free placeholder — see `createWidgetsHostAppShell`'s
    // doc comment for why the REAL app must not be built here.
    super(createWidgetsHostAppShell());
  }

  async mount(container: Element | ShadowRoot, bridge: ChildMfeBridge, mountContext?: MfeMountContext): Promise<void> {
    // Constructed here — synchronously inside this override, before any
    // `await` and before delegating to `ThemeAwareReactLifecycle.mount()`
    // (which is what actually calls `createRoot(...).render(...)`) — so
    // this registry's construction happens strictly within the ambient
    // mounting-bridge rendezvous window `DefaultMountManager.mountExtension`
    // opens around the synchronous portion of this very call. Building it
    // lazily inside a React hook instead risks the rendezvous window having
    // already closed by the time React actually runs the component's
    // initial render. This is also the FIRST call anywhere in this module
    // to build a real `microfrontends()`-bearing app (the constructor above
    // deliberately avoided that), so it is the call that wins the
    // `mfeRegistryFactory` singleton's one-time build slot — see
    // `createWidgetsHostAppShell`.
    this.widgetsApp = createWidgetsHostApp();
    // Reset only `routing` (not `impl` — see `widgetsHolder`'s own doc comment).
    widgetsHolder.routing = undefined;
    // Read synchronously, before any await: a bridge's shared-property value
    // is available synchronously the moment the bridge exists (O1/O2).
    this.address = readEntryAddress(bridge);

    // Kick off the manifest fetch + domain-registration bootstrap
    // synchronously (still within the same synchronous prefix as the
    // registry construction above — invoking an async function runs its
    // body up to its first `await` synchronously). `super.mount()` then
    // renders `WidgetsHostScreen`, which receives this same promise to
    // drive its own loading/error UI without re-triggering bootstrap.
    this.bootstrapPromise = bootstrapWidgetsRuntime(this.widgetsApp, widgetsHolder);

    let resolveDomainAttached!: () => void;
    this.domainAttachedPromise = new Promise<void>((resolve) => {
      resolveDomainAttached = resolve;
    });
    this.onDomainAttached = resolveDomainAttached;

    super.mount(container, bridge, mountContext);

    // `DefaultMountManager` awaits whatever this override returns (its
    // `void | Promise<void>` mount() contract) and only marks the extension
    // `mounted` — and only lets a chain's `next` continuation dispatch —
    // after that await settles. Awaiting both promises here, rather than
    // leaving either to fire-and-forget inside a React effect, is what
    // closes BOTH races: `registerDomain` making the domain routable
    // (`bootstrapPromise`), and `DefaultExtensionMounter.attach(root)` giving
    // it somewhere to actually mount into (`domainAttachedPromise`) — see
    // each field's doc comment. If `bootstrapPromise` rejects,
    // `Promise.all` rejects immediately without waiting on
    // `domainAttachedPromise` (which would otherwise never resolve, since
    // `WidgetsHostScreen` never renders `ExtensionDomainSlot` on the error
    // path).
    await Promise.all([this.bootstrapPromise, this.domainAttachedPromise]);
  }

  async unmount(container: Element | ShadowRoot): Promise<void> {
    // Before releasing occupants below: the slot's own detach unmounts this
    // domain's occupants past the action-chain handlers (O7), so this
    // instance's observer must already be released — otherwise it would see
    // those removals as ordinary transitions and try to dispatch unmounts
    // for extensions the mounter is already tearing down (O4). Stopped
    // first, so `afterUnmount` inside `releaseAll`'s own unmount path
    // no-ops rather than writing a URL entry for a screen that is itself
    // leaving.
    widgetsHolder.routing?.stop();
    widgetsHolder.routing = undefined;
    // D2: release every occupant through the registry's own bookkeeping
    // (see `WidgetsDomainImpl.releaseAll`'s doc comment) BEFORE
    // `super.unmount(container)` triggers `ExtensionDomainSlot`'s cleanup
    // effect. That effect's own `mounter.detach()` mass-unmounts the DOM but
    // never clears `getMountedExtensions()` — and this domain's registry is
    // a module-singleton that outlives one mount of Widgets Host. Without
    // this, the NEXT mount's auto-mount pass would find every widget
    // already "mounted" and never call `strategy.mount()` again, leaving
    // Widgets Host permanently blank on re-entry (back/forward, or a fresh
    // Back after leaving).
    try {
      await widgetsHolder.impl?.releaseAll();
    } finally {
      // React's root must be released even when a widget's lifecycle rejects.
      await super.unmount(container);
    }
  }

  protected renderContent(bridge: ChildMfeBridge): React.ReactNode {
    if (!this.widgetsApp || !this.bootstrapPromise || !this.domainAttachedPromise) {
      throw new Error(
        'demo-mfe widgets-host: renderContent() called before mount() constructed the nested app.',
      );
    }
    const registry = this.widgetsApp.mfeRegistry;
    if (!registry) {
      throw new Error(
        'demo-mfe widgets-host: nested app has no mfeRegistry.',
      );
    }
    return routedScreen(
      <WidgetsHostScreen
        bootstrap={this.bootstrapPromise}
        address={this.address}
        registry={registry}
        holder={widgetsHolder}
        setRouting={(routing) => {
          widgetsHolder.routing = routing;
        }}
        onDomainAttached={this.onDomainAttached}
      />,
      bridge,
    );
  }
}

export default new DemoMfeWidgetsHostLifecycle();

// Q1: mirrors the shell's own `shellNavigation()` HMR teardown
// (`template-shell/src-app/app/mfe/shell-routing.ts`). HMR replaces this
// module's exports with a fresh copy, whose own `navigation` module var
// starts `undefined` again — the next `widgetsNavigation()` call would then
// build a second history/signal pair sharing the same DOM/browser history
// object, while this OLD module instance's `DomainRouting` (held in
// `widgetsHolder`, which itself is NOT replaced by HMR — see its own doc
// comment) stays subscribed to the first pair forever, since nothing else
// ever calls its `stop()`. Only `routing` is reset (not `holder.impl`, which
// belongs to the domain implementation instance rather than to this
// navigation cache and outlives any one mount, exactly as a plain remount
// leaves it alone).
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    widgetsHolder.routing?.stop();
    widgetsHolder.routing = undefined;
    navigation = undefined;
  });
}
