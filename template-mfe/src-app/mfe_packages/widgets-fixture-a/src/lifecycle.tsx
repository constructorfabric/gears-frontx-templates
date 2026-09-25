/**
 * widgets-fixture-a — leaf widget MFE lifecycle.
 *
 * Each mount produces an isolated module instance under the per-load blob URL
 * chain (ADR-0004), so when this entry is registered as two distinct extension
 * instances (alpha and beta) sharing the same `entry.path`, the parent runtime
 * loads the bundle twice and evaluates this module twice — module-level state
 * (the random hex generated below) is therefore per-mount.
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
  ActionHandler,
  ThemeAwareReactLifecycle,
  FRONTX_ACTION_MOUNT_EXT,
  FRONTX_SCREEN_DOMAIN,
  type ChildMfeBridge,
  type MfeEntryLifecycle,
} from '@gears-frontx/react';
import { resolveNavigationHistory } from '@gears-frontx/routing';
import {
  adaptProviderHistory,
  createProviderRouter,
  createRootRoute,
  createRoute,
  EngineProvider,
  Outlet,
  useSearch,
  type AnyRouter,
} from '@gears-frontx/routing-tanstack';
import { readEntryAddress } from '@gears-frontx/frontx-template-shell';

const PING_ACTION_TYPE =
  'gts.frontx.mfes.comm.action.v1~frontx.widgets.test.widget_ping.v1~';

const LAST_PING_PARAM = 'last-ping';

// Hello World's extension ID (demo-mfe), targeted via the shell's screen
// domain — mounting it from here exercises the upward-escalation tier: this
// widget's own registry doesn't know the screen domain locally, so the
// escalation must travel through Widgets Host's inbound bridge to the shell.
const HELLOWORLD_EXTENSION_ID =
  'gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~frontx.demo.screens.helloworld.v1';

const fixtureApp = createFrontX()
  .use(effects())
  .use(queryCacheShared())
  .use(mock())
  .build();

function generateRandomHex(): string {
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Per-mount random hex. Each blob-URL-isolated load of this module produces a
// fresh value, which is the empirical witness that distinct extension
// instances backed by the same entry path get distinct module evaluations.
const randomHex = generateRandomHex();

/** One mount of one extension: its router, and a latch the provider opens once it has attached its history. */
interface MountSession {
  readonly router: AnyRouter;
  readonly providerMounted: Promise<void>;
  readonly markProviderMounted: () => void;
}

// Keyed by `bridge.extensionId` (stable across a remount of the same
// extension — the bridge pair is minted once and reactivated, not recreated,
// per mount): a ping dispatched right after a remount must reach the NEW
// session, not a leftover one an older container's late unmount could
// otherwise clear out from under it (see `unmount()` below).
const sessions = new Map<string, MountSession>();

const SessionContext = React.createContext<{ session: MountSession; bridge: ChildMfeBridge } | null>(null);

function useWidget(): { session: MountSession; bridge: ChildMfeBridge } {
  const value = React.useContext(SessionContext);
  if (!value) throw new Error('widget-a: rendered outside its mount session');
  return value;
}

function WidgetARoot(): React.ReactElement {
  const { bridge } = useWidget();
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
  const { bridge } = useWidget();
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const lastPing = typeof search[LAST_PING_PARAM] === 'string' ? (search[LAST_PING_PARAM] as string) : null;

  const handleMountHelloWorld = React.useCallback(async () => {
    await bridge.executeActionsChain({
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

function createSession(bridge: ChildMfeBridge): MountSession {
  let markProviderMounted!: () => void;
  const providerMounted = new Promise<void>((resolve) => {
    markProviderMounted = resolve;
  });
  const rootRoute = createRootRoute({ component: WidgetARoot, notFoundComponent: WidgetANotFound });
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/', component: WidgetAHome }),
  ]);
  const history = adaptProviderHistory(resolveNavigationHistory(), readEntryAddress(bridge));
  return { router: createProviderRouter(routeTree, history), providerMounted, markProviderMounted };
}

class PingHandler extends ActionHandler {
  constructor(private readonly instanceId: string) {
    super();
  }

  async handleAction(actionTypeId: string): Promise<void> {
    const session = sessions.get(this.instanceId);
    if (!session) throw new Error(`[widget-a ${this.instanceId}] ping while not mounted`);
    const lastPing = new Date().toISOString();
    console.info(`[widget-a ${this.instanceId}] ping ${actionTypeId} ${LAST_PING_PARAM}=${lastPing}`);
    // A write made before the provider attached its history may not take effect: queue it until it has.
    await session.providerMounted;
    try {
      // The whole parameter list is replaced, not merged, so carry the other search params forward.
      await session.router.navigate({
        to: '.',
        search: (previous: Record<string, unknown>) => ({ ...previous, [LAST_PING_PARAM]: lastPing }),
        replace: true,
      });
    } catch (err) {
      // A silent failure here would leave the host believing the ping landed
      // (it already resolved past the `providerMounted` queue): surface it.
      console.error(`[widget-a ${this.instanceId}] ping navigate() failed:`, err);
      throw err;
    }
  }
}

/**
 * Opens the session's latch from its own effect. A parent's effect runs after
 * its children's, so this runs after `EngineProvider`'s own effect has
 * attached the adapted history; an effect placed inside the routed tree
 * itself would run before that attach.
 */
function ProviderMountedMark({
  session,
  children,
}: {
  session: MountSession;
  children: React.ReactNode;
}): React.ReactElement {
  React.useEffect(() => session.markProviderMounted(), [session]);
  return <>{children}</>;
}

/** One mount's React tree: its own `ThemeAwareReactLifecycle` instance, so its own Root (H3). */
class WidgetAMount extends ThemeAwareReactLifecycle {
  constructor() {
    super(fixtureApp);
  }

  protected renderContent(bridge: ChildMfeBridge): React.ReactNode {
    const session = sessions.get(bridge.extensionId)!;
    return (
      <SessionContext.Provider value={{ session, bridge }}>
        <ProviderMountedMark session={session}>
          <EngineProvider router={session.router} />
        </ProviderMountedMark>
      </SessionContext.Provider>
    );
  }
}

/**
 * `ThemeAwareReactLifecycle` keeps one Root per instance, but widget_alpha and
 * widget_beta share this module's default export: a second mount on a shared
 * instance would overwrite the first Root and one unmount would tear down the
 * other's tree. Each container therefore gets its own `WidgetAMount` instance
 * (H3; the general shared-root defect is tracked separately, U2).
 */
class WidgetsFixtureALifecycle implements MfeEntryLifecycle<ChildMfeBridge> {
  private readonly mounts = new Map<
    Element | ShadowRoot,
    { readonly tree: WidgetAMount; readonly extensionId: string; readonly session: MountSession }
  >();

  mount(container: Element | ShadowRoot, bridge: ChildMfeBridge): void {
    console.info(`[widget-a ${bridge.extensionId}] mount randomHex=${randomHex}`);
    const session = createSession(bridge);
    sessions.set(bridge.extensionId, session);
    const tree = new WidgetAMount();
    this.mounts.set(container, { tree, extensionId: bridge.extensionId, session });
    tree.mount(container, bridge);
    // Registered synchronously, before `mount()` returns: `DefaultMountManager`
    // treats a lifecycle's `mount()` completion as the signal that the
    // extension is reachable, and lets a chain's `next` continuation dispatch
    // as soon as it does. A React `useEffect` runs strictly after that point
    // (`createRoot().render()` only schedules work), so registering there
    // would be reachable-too-late for a chained ping step.
    bridge.registerActionHandler(PING_ACTION_TYPE, new PingHandler(bridge.extensionId));
  }

  unmount(container: Element | ShadowRoot): void {
    const mounted = this.mounts.get(container);
    if (!mounted) return;
    this.mounts.delete(container);
    mounted.tree.unmount(container);
    // A late unmount of an older container must not drop the session a newer mount of the same extension owns.
    if (sessions.get(mounted.extensionId) === mounted.session) sessions.delete(mounted.extensionId);
  }

  /**
   * HMR dispose hook (Q4), mirroring `lifecycle-widgets-host.tsx`'s and
   * `shell-routing.ts`'s own HMR teardown: unmounts every container this OLD
   * module instance still holds. Each `unmount()` above already runs the
   * React tree's own cleanup (detaching its adapted history) and evicts the
   * extension's entry from `sessions`, so the replacement module HMR swaps
   * in starts with an empty map instead of orphaned subscriptions this old
   * instance would otherwise leave nothing to release.
   */
  disposeAll(): void {
    for (const container of [...this.mounts.keys()]) this.unmount(container);
  }
}

const lifecycle = new WidgetsFixtureALifecycle();
export default lifecycle;

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    lifecycle.disposeAll();
    sessions.clear();
  });
}
