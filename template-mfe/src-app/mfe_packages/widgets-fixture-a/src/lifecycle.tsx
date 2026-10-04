/**
 * widgets-fixture-a — leaf widget MFE lifecycle.
 *
 * Each extension instance is its own loaded copy of this bundle under the
 * per-load blob URL chain (ADR-0004): when this entry is registered as two
 * distinct extension instances (alpha and beta) sharing the same `entry.path`,
 * the parent runtime loads the bundle twice and evaluates this module twice.
 * Module-level state — the random hex and the one FrontX app below — is
 * therefore per extension instance, not shared between alpha and beta.
 *
 * Each mounted instance runs its own tiny router (`route: "/widget-alpha"` /
 * `"/widget-beta"` on the two extensions in `mfe.json`), scoped to the entry
 * address the widgets-host shell broadcast for it. The `last-ping` value the
 * widget shows is not module or React state at all — it lives only in that
 * router's own URL search param (`useSearch`), so a page reload restores it
 * without this module ever "sending" a ping, and two widgets never share or
 * clobber each other's value the way a single shared map would.
 */
import React from 'react';
import {
  createFrontX,
  effects,
  queryCacheShared,
  mock,
  microfrontends,
  gtsPlugin,
  ActionHandler,
  ThemeAwareReactLifecycle,
  ExtensionRouter,
  FRONTX_ACTION_MOUNT_EXT,
  FRONTX_SCREEN_DOMAIN,
  type ChildMfeBridge,
  type MfeEntryLifecycle,
} from '@gears-frontx/react';
import {
  createRootRoute,
  createRoute,
  Outlet,
  useSearch,
  type AnyRoute,
} from '@gears-frontx/routing-tanstack';

const PING_ACTION_TYPE =
  'gts.frontx.mfes.comm.action.v1~frontx.widgets.test.widget_ping.v1~';

const LAST_PING_PARAM = 'last-ping';

// Hello World's extension ID (demo-mfe), targeted via the shell's screen
// domain — mounting it from here exercises the upward-escalation tier: this
// widget's own registry doesn't know the screen domain locally, so the
// escalation must travel through Widgets Host's inbound bridge to the shell.
const HELLOWORLD_EXTENSION_ID =
  'gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~frontx.demo.screens.helloworld.v1';

// The one app of this runtime. Each extension instance (alpha, beta) is loaded
// as its own copy of this bundle, so each copy builds exactly one app, here at
// module level. `microfrontends()` builds its registry lazily; the first mount
// reads `app.mfeRegistry` (first statement of `ThemeAwareReactLifecycle.mount`),
// which places the registry's construction inside the mount window so the host
// links it.
const app = createFrontX()
  .use(effects())
  .use(queryCacheShared())
  .use(mock())
  .use(microfrontends({ typeSystem: gtsPlugin }))
  .build();

function generateRandomHex(): string {
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Per-instance random hex. Each blob-URL-isolated load of this module produces a
// fresh value, which is the empirical witness that distinct extension
// instances backed by the same entry path get distinct module evaluations.
const randomHex = generateRandomHex();

const BridgeContext = React.createContext<ChildMfeBridge | null>(null);

function useBridge(): ChildMfeBridge {
  const bridge = React.useContext(BridgeContext);
  if (!bridge) throw new Error('widget-a: rendered outside its mount');
  return bridge;
}

function WidgetARoot(): React.ReactElement {
  const bridge = useBridge();
  return (
    <div
      data-testid="widget-a-instance"
      data-instance-id={bridge.extensionId}
      data-instance-text={randomHex}
      className="m-2 rounded-lg border-2 border-blue-400 bg-blue-50 p-4 text-blue-900"
    >
      <Outlet />
    </div>
  );
}

function WidgetAHome(): React.ReactElement {
  const bridge = useBridge();
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const lastPing = typeof search[LAST_PING_PARAM] === 'string' ? (search[LAST_PING_PARAM] as string) : null;

  // Dispatch is acceptance-only: it returns void and never throws, so
  // there is nothing to await or catch here.
  const handleMountHelloWorld = React.useCallback(() => {
    bridge.executeActionsChain({
      action: {
        type: FRONTX_ACTION_MOUNT_EXT,
        target: FRONTX_SCREEN_DOMAIN,
        payload: { subject: HELLOWORLD_EXTENSION_ID },
      },
    });
  }, [bridge]);

  return (
    <>
      <strong>Widget A instance:</strong>{' '}
      <span data-testid="widget-a-random">{randomHex}</span>
      <p className="mt-1 text-xs opacity-75">instance-id: {bridge.extensionId}</p>
      <p
        className="mt-1 text-xs"
        data-testid="widget-a-last-ping"
        data-last-ping={lastPing ?? ''}
      >
        last ping: {lastPing ?? '—'}
      </p>
      <button
        type="button"
        data-testid="widget-a-mount-helloworld"
        className="mt-2 rounded border border-blue-400 bg-white px-3 py-1 text-sm font-medium text-blue-900 hover:bg-blue-100"
        onClick={handleMountHelloWorld}
      >
        Mount Hello World (shell, 2 hops up)
      </button>
    </>
  );
}

function WidgetANotFound(): React.ReactElement {
  return <p data-testid="widget-a-not-found">widget-a has no such page</p>;
}

const rootRoute = createRootRoute({ component: WidgetARoot, notFoundComponent: WidgetANotFound });
const routeTree: AnyRoute = rootRoute.addChildren([
  createRoute({ getParentRoute: () => rootRoute, path: '/', component: WidgetAHome }),
]);

class PingHandler extends ActionHandler {
  constructor(
    private readonly instanceId: string,
    private readonly isMounted: () => boolean,
  ) {
    super();
  }

  async handleAction(actionTypeId: string): Promise<void> {
    if (!this.isMounted()) throw new Error(`[widget-a ${this.instanceId}] ping while not mounted`);
    const lastPing = new Date().toISOString();
    console.info(`[widget-a ${this.instanceId}] ping ${actionTypeId} ${LAST_PING_PARAM}=${lastPing}`);
    // D21: each runtime reads AND writes only its own entry's parameters —
    // `location()` reads this occupant's OWN current pathname/search (never
    // a sibling's, never the composed page's), so merging `LAST_PING_PARAM`
    // into it preserves any other search param a caller outside this
    // widget's own render tree already set, instead of overwriting the
    // whole query string from scratch.
    try {
      // Resolved here, not at module level: the router's navigation facade
      // reads the occupant value the host supplies on link adoption, which
      // happens during mount. A facade taken at module evaluation would stay
      // the refusing one.
      const navigation = app.mfeRouter!.navigation();
      const { pathname, search } = navigation.location();
      const params = new URLSearchParams(search);
      params.set(LAST_PING_PARAM, lastPing);
      navigation.replace(`${pathname || '/'}?${params.toString()}`);
    } catch (err) {
      // A silent failure here would leave the host believing the ping landed: surface it.
      console.error(`[widget-a ${this.instanceId}] ping navigation failed:`, err);
      throw err;
    }
    return Promise.resolve();
  }
}

/** One container's React tree: its own `ThemeAwareReactLifecycle` instance, so its own Root (H3). */
class WidgetAMount extends ThemeAwareReactLifecycle {
  constructor() {
    super(app);
  }

  protected renderContent(bridge: ChildMfeBridge): React.ReactNode {
    return (
      <BridgeContext.Provider value={bridge}>
        <ExtensionRouter registry={app.mfeRegistry!} routeTree={routeTree} />
      </BridgeContext.Provider>
    );
  }
}

/**
 * This runtime can be mounted into a new container while an older container's
 * unmount is still settling, so each container gets its own `WidgetAMount` and
 * Root (H3). The app itself is the one module-level app above, never per mount.
 */
class WidgetsFixtureALifecycle implements MfeEntryLifecycle<ChildMfeBridge> {
  private readonly mounts = new Map<
    Element | ShadowRoot,
    { readonly tree: WidgetAMount; readonly extensionId: string }
  >();

  private isMounted(extensionId: string): boolean {
    return [...this.mounts.values()].some((mounted) => mounted.extensionId === extensionId);
  }

  mount(container: Element | ShadowRoot, bridge: ChildMfeBridge): void {
    console.info(`[widget-a ${bridge.extensionId}] mount randomHex=${randomHex}`);
    const tree = new WidgetAMount();
    this.mounts.set(container, { tree, extensionId: bridge.extensionId });
    tree.mount(container, bridge);
    // Registered synchronously, before `mount()` returns: `DefaultMountManager`
    // treats a lifecycle's `mount()` completion as the signal that the
    // extension is reachable, and lets a chain's `next` continuation dispatch
    // as soon as it does. A React `useEffect` runs strictly after that point
    // (`createRoot().render()` only schedules work), so registering there
    // would be reachable-too-late for a chained ping step.
    bridge.registerActionHandler(
      PING_ACTION_TYPE,
      new PingHandler(bridge.extensionId, () => this.isMounted(bridge.extensionId)),
    );
  }

  unmount(container: Element | ShadowRoot): void | Promise<void> {
    const mounted = this.mounts.get(container);
    if (!mounted) return;
    // Dropped before the teardown so a ping arriving mid-teardown is
    // rejected, not routed into a dying tree; a newer container of the same
    // extension keeps the extension mounted.
    this.mounts.delete(container);
    return mounted.tree.unmount(container);
  }

  /**
   * HMR dispose hook (Q4), mirroring `lifecycle-widgets-host.tsx`'s and
   * `shell-routing.ts`'s own HMR teardown: unmounts every container this OLD
   * module instance still holds, so the replacement module HMR swaps in does
   * not inherit subscriptions this old instance would otherwise leave behind.
   */
  disposeAll(): Promise<unknown> {
    return Promise.allSettled([...this.mounts.keys()].map((container) => Promise.resolve().then(() => this.unmount(container))));
  }
}

const lifecycle = new WidgetsFixtureALifecycle();
export default lifecycle;

if (import.meta.hot) {
  import.meta.hot.dispose(async () => {
    await lifecycle.disposeAll();
  });
}
