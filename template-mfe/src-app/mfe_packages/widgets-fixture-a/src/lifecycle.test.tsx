import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { ChildMfeBridge } from '@gears-frontx/react';

/** Records `createRoot(container)` calls: each container gets its own Root. */
const createRootSpy = vi.fn();
const rootRenderSpy = vi.fn();
const rootUnmountSpy = vi.fn();
/** Whether the host has adopted this runtime's link: `navigation()` refuses until it has (the real router has no occupant value before then). */
let linkAdopted = false;
/** Counts `navigation()` calls. */
const navigationResolveSpy = vi.fn();
/** Counts `ThemeAwareReactLifecycle` constructions: one per mounted container. */
const themeAwareConstructSpy = vi.fn();
/** Counts `createFrontX()` and `build()` calls: a runtime builds exactly one app. */
const createFrontXSpy = vi.fn();
const buildSpy = vi.fn();

/** The `navigation().replace()` spy `PingHandler` writes through. */
const navigationReplaceSpy = vi.fn();
/** Set by a test to make the next `navigation().replace()` call throw, exercising `PingHandler`'s own catch/log/rethrow path. */
let navigationReplaceThrows: Error | null = null;
/** What `navigation().location()` returns for the NEXT ping — this extension's own private subroute; a test overrides it to assert the ping handler merges into existing params instead of overwriting them. */
let navigationLocation = { pathname: '/', search: '' };

/**
 * `<ExtensionRouter>` (this lifecycle renders it from
 * `@gears-frontx/routing-tanstack`) and the React render tree are both faked here: this
 * suite is a plumbing smoke test for the ping handler's own
 * registration/write/rejection contract, not a render test (a real
 * `<ExtensionRouter>` mount belongs in an integration suite driven through
 * the real `mfes` runtime, mirroring `lifecycle-widgets-host.remount.test.tsx`).
 * `navigation().replace()` is the one surface this file DOES assert against
 * in detail: it is `PingHandler`'s own write path (`lifecycle.tsx`'s
 * `navigation().replace(...)`), and it is real, user-facing behaviour
 * this suite's render-fidelity trade-off must not also hide.
 */
vi.mock('@gears-frontx/react', () => {
  // Opaque — the faked lifecycle only reads it, so nothing ever reads this
  // registry's own shape.
  const fakeMfeRegistry = {};
  const fakeAppBuilder = {
    use: () => fakeAppBuilder,
    build: () => {
      buildSpy();
      return {
        get mfeRegistry() {
          return fakeMfeRegistry;
        },
      };
    },
  };
  return {
    ActionHandler: class ActionHandler {
      static {
        void 0;
      }
    },
    ThemeAwareReactLifecycle: class ThemeAwareReactLifecycle {
      constructor(private readonly app: { mfeRegistry: unknown }) {
        themeAwareConstructSpy();
      }
      mount(container: Element | ShadowRoot): void {
        void this.app.mfeRegistry;
        createRootSpy(container);
        rootRenderSpy();
      }
      async unmount(): Promise<void> {
        rootUnmountSpy();
      }
    },
    createFrontX: () => {
      createFrontXSpy();
      return fakeAppBuilder;
    },
    microfrontends: () => ({}),
    effects: () => ({}),
    queryCacheShared: () => ({}),
    mock: () => ({}),
    gtsPlugin: {},
    FRONTX_ACTION_MOUNT_EXT: 'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.mount_ext.v1~',
    FRONTX_SCREEN_DOMAIN: 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.screen.v1',
  };
});

vi.mock('@gears-frontx/routing-tanstack', () => {
  const ownSubroute = {
    navigate: vi.fn(),
    replace: (path: string) => {
      if (navigationReplaceThrows) {
        const err = navigationReplaceThrows;
        navigationReplaceThrows = null;
        throw err;
      }
      navigationReplaceSpy(path);
    },
    location: () => navigationLocation,
  };
  return {
    ExtensionRouter: () => null,
    navigation: () => {
      navigationResolveSpy();
      if (!linkAdopted) {
        const refuse = (): never => {
          throw new Error('navigation refused: no occupant value');
        };
        return { navigate: refuse, replace: refuse, location: refuse };
      }
      return ownSubroute;
    },
    createRootRoute: (opts: unknown) => ({ ...(opts as object), addChildren: (children: unknown) => ({ ...(opts as object), children }) }),
    createRoute: (opts: unknown) => opts,
    Outlet: () => null,
    useSearch: () => ({}),
  };
});

const PING = 'gts.frontx.mfes.comm.action.v1~frontx.widgets.test.widget_ping.v1~';
const ALPHA = 'gts.frontx.mfes.ext.extension.v1~frontx.widgets.fixture_a.widget_alpha.v1';
const BETA = 'gts.frontx.mfes.ext.extension.v1~frontx.widgets.fixture_a.widget_beta.v1';

type HandlerMap = Map<string, { handleAction(t: string): Promise<void> }>;

function fakeBridge(extensionId: string): { bridge: ChildMfeBridge; handlers: HandlerMap } {
  const handlers: HandlerMap = new Map();
  return {
    handlers,
    bridge: {
      extensionId,
      extDomainId: 'd',
      registerActionHandler: (t: string, h: never) => handlers.set(t, h),
      executeActionsChain: vi.fn(),
      subscribeToProperty: () => () => {},
      getProperty: () => undefined,
    } as never,
  };
}

beforeEach(() => {
  vi.resetModules();
  navigationReplaceSpy.mockClear();
  createRootSpy.mockClear();
  rootRenderSpy.mockClear();
  rootUnmountSpy.mockClear();
  navigationResolveSpy.mockClear();
  linkAdopted = true;
  themeAwareConstructSpy.mockClear();
  createFrontXSpy.mockClear();
  buildSpy.mockClear();
  navigationReplaceThrows = null;
  navigationLocation = { pathname: '/', search: '' };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('widgets-fixture-a lifecycle', () => {
  it('builds one app at module evaluation and reuses it across mount, unmount and remount', async () => {
    const { default: lifecycle } = await import('./lifecycle');
    const { bridge } = fakeBridge(ALPHA);
    const first = document.createElement('div');
    const second = document.createElement('div');

    expect(createFrontXSpy).toHaveBeenCalledTimes(1);
    expect(buildSpy).toHaveBeenCalledTimes(1);

    lifecycle.mount(first, bridge);
    await lifecycle.unmount(first);
    lifecycle.mount(second, bridge);
    await lifecycle.unmount(second);

    expect(createFrontXSpy).toHaveBeenCalledTimes(1);
    expect(buildSpy).toHaveBeenCalledTimes(1);
  });

  it('registers a ping handler on mount, and rejects a ping once its own container has unmounted', async () => {
    const { default: lifecycle } = await import('./lifecycle');
    const { bridge, handlers } = fakeBridge(ALPHA);
    const container = document.createElement('div');

    lifecycle.mount(container, bridge);

    expect(createRootSpy).toHaveBeenCalledWith(container);
    expect(rootRenderSpy).toHaveBeenCalledTimes(1);
    expect(handlers.get(PING)).toBeDefined();

    await lifecycle.unmount(container);
    expect(rootUnmountSpy).toHaveBeenCalledTimes(1);

    await expect(handlers.get(PING)!.handleAction(PING)).rejects.toThrow('ping while not mounted');
  });

  it('writes last-ping through the navigation facade, both right after mount and again later (before and after ExtensionRouter attaches)', async () => {
    const { default: lifecycle } = await import('./lifecycle');
    const { bridge, handlers } = fakeBridge(ALPHA);
    const container = document.createElement('div');

    // The ping handler is registered synchronously inside `mount()` (so a
    // chained ping can reach it before `DefaultMountManager` lets `next`
    // continue — see `lifecycle.tsx`'s own doc comment on `PingHandler`
    // registration) — calling it here, with no `act()`/no awaited render
    // effect in between, is this suite's render-free proxy for "before
    // ExtensionRouter's own mount effect has attached anything at all": the
    // ping writes through `navigation()` regardless of whether
    // anything has rendered yet.
    lifecycle.mount(container, bridge);
    await handlers.get(PING)!.handleAction(PING);

    expect(navigationReplaceSpy).toHaveBeenCalledTimes(1);
    const firstWrite = navigationReplaceSpy.mock.calls[0]![0] as string;
    expect(firstWrite).toMatch(/^\/\?last-ping=\d{4}-\d{2}-\d{2}T\d{2}%3A\d{2}%3A\d{2}\.\d{3}Z$/);

    // A second ping — the `navigation()` write path is identical regardless of how
    // many renders separate it from `mount()` ("after ExtensionRouter attaches").
    await handlers.get(PING)!.handleAction(PING);

    expect(navigationReplaceSpy).toHaveBeenCalledTimes(2);
    const secondWrite = navigationReplaceSpy.mock.calls[1]![0] as string;
    expect(secondWrite).toMatch(/^\/\?last-ping=\d{4}-\d{2}-\d{2}T\d{2}%3A\d{2}%3A\d{2}\.\d{3}Z$/);

    await lifecycle.unmount(container);
  });

  it("preserves another already-present search param on its own entry when writing last-ping (reads AND writes only its own private subroute)", async () => {
    const { default: lifecycle } = await import('./lifecycle');
    const { bridge, handlers } = fakeBridge(ALPHA);
    const container = document.createElement('div');

    // Some OTHER caller already set a param on this extension's own subroute
    // (e.g. a deep link) before the ping handler ever reads it.
    navigationLocation = { pathname: '/', search: '?other=kept' };

    lifecycle.mount(container, bridge);
    await handlers.get(PING)!.handleAction(PING);

    expect(navigationReplaceSpy).toHaveBeenCalledTimes(1);
    const write = navigationReplaceSpy.mock.calls[0]![0] as string;
    expect(write).toContain('other=kept');
    expect(write).toMatch(/last-ping=\d{4}-\d{2}-\d{2}T\d{2}%3A\d{2}%3A\d{2}\.\d{3}Z/);

    await lifecycle.unmount(container);
  });

  it('keeps the newer session when an older container of the same extension unmounts late', async () => {
    const { default: lifecycle } = await import('./lifecycle');
    const { bridge, handlers: oldHandlers } = fakeBridge(ALPHA);
    const oldContainer = document.createElement('div');
    const newContainer = document.createElement('div');

    lifecycle.mount(oldContainer, bridge);
    // Same extension id remounted into a new container (a real remount: the
    // bridge pair is minted once and reactivated, not recreated, per mount —
    // `lifecycle.tsx`'s own doc comment on `mounts`) — reuse the SAME
    // bridge object so both mounts register under the SAME `extensionId` key.
    lifecycle.mount(newContainer, bridge);

    // The late unmount of the OLDER container must not drop the session the
    // newer mount owns: a ping dispatched through either container's own
    // handler reference still finds a live session and resolves.
    await lifecycle.unmount(oldContainer);
    await expect(oldHandlers.get(PING)!.handleAction(PING)).resolves.toBeUndefined();
    expect(navigationReplaceSpy).toHaveBeenCalledTimes(1);

    await lifecycle.unmount(newContainer);
  });

  it('rejects a ping for an id with no live session, even while a different extension is mounted', async () => {
    const { default: lifecycle } = await import('./lifecycle');
    const { bridge: orphanBridge, handlers: orphanHandlers } = fakeBridge(ALPHA);
    const { bridge: otherBridge } = fakeBridge(BETA);
    const orphanContainer = document.createElement('div');
    const otherContainer = document.createElement('div');

    lifecycle.mount(orphanContainer, orphanBridge);
    await lifecycle.unmount(orphanContainer);
    lifecycle.mount(otherContainer, otherBridge);

    // A foreign session (BETA) is live at the time of this ping; the lookup
    // must stay keyed to the orphan's own id (ALPHA) and not fall through to it.
    await expect(orphanHandlers.get(PING)!.handleAction(PING)).rejects.toThrow('ping while not mounted');

    await lifecycle.unmount(otherContainer);
  });

  it('logs and rethrows when the navigation facade rejects the write', async () => {
    const { default: lifecycle } = await import('./lifecycle');
    const { bridge, handlers } = fakeBridge(ALPHA);
    const container = document.createElement('div');
    lifecycle.mount(container, bridge);

    navigationReplaceThrows = new Error('navigation boom');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(handlers.get(PING)!.handleAction(PING)).rejects.toThrow('navigation boom');

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]?.[0]).toContain('widget-a');

    await lifecycle.unmount(container);
  });

  it('gives each container its own Root', async () => {
    const { default: lifecycle } = await import('./lifecycle');
    const { bridge } = fakeBridge(ALPHA);
    const first = document.createElement('div');
    const second = document.createElement('div');

    lifecycle.mount(first, bridge);
    lifecycle.mount(second, bridge);

    expect(createRootSpy).toHaveBeenCalledTimes(2);
    expect(createRootSpy.mock.calls.map((call) => call[0])).toEqual([first, second]);
    expect(themeAwareConstructSpy).toHaveBeenCalledTimes(2);

    await lifecycle.unmount(first);
    await lifecycle.unmount(second);
  });

  it('resolves the navigation facade at ping time: a ping before the host adopts the link is refused without a write, a ping after adoption writes', async () => {
    const { default: lifecycle } = await import('./lifecycle');
    const { bridge, handlers } = fakeBridge(ALPHA);
    const container = document.createElement('div');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Module evaluation called nothing: `navigation()` is called at ping time only.
    expect(navigationResolveSpy).not.toHaveBeenCalled();

    linkAdopted = false;
    lifecycle.mount(container, bridge);
    await expect(handlers.get(PING)!.handleAction(PING)).rejects.toThrow('navigation refused');
    expect(navigationReplaceSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);

    linkAdopted = true;
    await handlers.get(PING)!.handleAction(PING);
    expect(navigationReplaceSpy).toHaveBeenCalledTimes(1);
    expect(navigationResolveSpy).toHaveBeenCalledTimes(2);

    await lifecycle.unmount(container);
  });
});
