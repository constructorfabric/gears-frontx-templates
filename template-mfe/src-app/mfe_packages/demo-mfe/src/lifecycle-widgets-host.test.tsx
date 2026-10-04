import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChildMfeBridge } from '@gears-frontx/react';

const WIDGETS_DOMAIN_ID = 'gts.frontx.mfes.ext.domain.v1~frontx.widgets.area.main.v1';
const MOUNT = 'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.mount_ext.v1~';
const UNMOUNT = 'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.unmount_ext.v1~';
const WIDGET_PING_ACTION_TYPE = 'gts.frontx.mfes.comm.action.v1~frontx.widgets.test.widget_ping.v1~';

const ALPHA_ID = 'gts.frontx.mfes.ext.extension.v1~frontx.widgets.fixture_a.widget_alpha.v1';
const BETA_ID = 'gts.frontx.mfes.ext.extension.v1~frontx.widgets.fixture_a.widget_beta.v1';
const GAMMA_ID = 'gts.frontx.mfes.ext.extension.v1~frontx.widgets.fixture_b.widget.v1';
const WIDGET_IDS = [ALPHA_ID, BETA_ID, GAMMA_ID];
const ROUTE_OF: Record<string, string> = {
  [ALPHA_ID]: 'widget-alpha',
  [BETA_ID]: 'widget-beta',
  [GAMMA_ID]: 'widget-b',
};

type FakeExtension = { id: string; domain: string; entry: string; route: string };
type ActionHandlerLike = { handleAction: (actionTypeId: string, payload: unknown) => Promise<void> };
type Chain = { action: { type: string; target: string; payload?: { subject?: string; history?: string } } };

/**
 * A hand-rolled `MfeRegistry` + one-level actions-chain mediator: real enough
 * to construct `WidgetsDomainImpl` through its own factory (so its mount/
 * unmount handler wiring runs for real) without reaching into `mfes`'s own
 * tested dispatch/mounter machinery, OR into the real `FrameworkRouter`
 * (`lifecycle-widgets-host.remount.test.tsx` and `router.test.ts` cover the
 * real router's own route-admission and URL-back-projection behaviour —
 * Global Constraints, not re-tested here). `ExtensionDomainSlot` is faked below (the real one — starting/stopping
 * a routed domain's own observer, and mass-releasing every mounted
 * extension on detach — is a Global Constraint, covered by
 * `ExtensionDomainSlot`'s own suite and `mfes`'s own `DefaultExtensionMounter`
 * suite; `lifecycle-widgets-host.remount.test.tsx` exercises them for real
 * together): this file is about `WidgetsHostScreen`'s and `WidgetsDomainImpl`'s
 * OWN contract (registers the domain, renders the slot, dispatches each
 * opening mount with `history: 'replace'` without waiting) — not about
 * whether a real router admits a route or writes a URL, or how an unmount
 * is released.
 *
 * `overrides` is keyed by (subject, actionType), not by subject alone: a
 * real registry could see both a mount and an unmount chain for the same
 * subject in flight, and collapsing them onto one key would let an unmount
 * override answer a mount dispatch (or vice versa).
 */
class FakeRegistry {
  readonly extensions = new Map<string, FakeExtension>();
  readonly mounted = new Set<string>();
  readonly domains = new Map<string, unknown>();
  readonly handlers = new Map<string, ActionHandlerLike>();
  readonly overrides = new Map<string, (payload: { subject: string }) => Promise<void> | undefined>();
  readonly executeActionsChain = vi.fn((chain: Chain): Promise<void> | undefined => {
    const subject = chain.action.payload?.subject;
    const key = subject !== undefined ? `${subject}:${chain.action.type}` : undefined;
    const override = key !== undefined ? this.overrides.get(key) : undefined;
    if (override) return override({ subject: subject! });
    const handler = this.handlers.get(chain.action.type);
    if (!handler) return Promise.resolve();
    return handler.handleAction(chain.action.type, chain.action.payload);
  });

  setOverride(subject: string, actionType: string, fn: (payload: { subject: string }) => Promise<void> | undefined): void {
    this.overrides.set(`${subject}:${actionType}`, fn);
  }

  getExtension(id: string): FakeExtension | undefined {
    return this.extensions.get(id);
  }

  getExtensionsForDomain(domainId: string): FakeExtension[] {
    return [...this.extensions.values()].filter((e) => e.domain === domainId);
  }

  getMountedExtensions(domainId: string): readonly string[] {
    return [...this.mounted].filter((id) => this.extensions.get(id)?.domain === domainId);
  }

  getDomain(domainId: string): unknown {
    return this.domains.get(domainId);
  }

  registerDomain(domain: { id: string; route?: string }, factory: { build: (ctx: unknown) => unknown }): void {
    this.domains.set(domain.id, domain);
    const ctx = {
      mounter: {
        mount: vi.fn(async (extensionId: string) => {
          this.mounted.add(extensionId);
        }),
        unmount: vi.fn(async (extensionId: string) => {
          this.mounted.delete(extensionId);
        }),
      },
      lifecycleTrigger: { fire: vi.fn() },
      typeSystem: { resolveMountExtActionId: () => MOUNT, resolveUnmountExtActionId: () => UNMOUNT },
      registerHandler: (actionType: string, handler: ActionHandlerLike) => {
        this.handlers.set(actionType, handler);
      },
    };
    factory.build(ctx);
  }

  async registerExtension(extension: FakeExtension): Promise<void> {
    this.extensions.set(extension.id, extension);
  }

  typeSystem = {
    register: vi.fn(),
    registerSchema: vi.fn(),
    // Widened beyond `undefined` so the ping tests below can give it a
    // per-test implementation returning a schema shape.
    getSchema: vi.fn((): { actions?: readonly string[] } | undefined => undefined),
  };
}

function fakeManifestResponse() {
  return {
    ok: true,
    json: async () => [
      {
        manifest: { id: 'manifest.demo', remoteEntry: 'http://localhost:3001/assets/remoteEntry.js' },
        domains: [
          {
            id: WIDGETS_DOMAIN_ID,
            route: 'widgets',
            sharedProperties: [],
            actions: [MOUNT, UNMOUNT],
            extensionsActions: [],
            defaultActionTimeout: 5000,
            lifecycleStages: [],
            extensionsLifecycleStages: [],
          },
        ],
        entries: [],
        extensions: WIDGET_IDS.map((id) => ({ id, domain: WIDGETS_DOMAIN_ID, entry: 'entry.fixture', route: ROUTE_OF[id] })),
        schemas: [],
      },
    ],
  };
}

let fakeRegistry: FakeRegistry | undefined;
let fetchMock: ReturnType<typeof vi.fn>;

/** `app.mfeRouter` in production — only the navigation facade (ADR 0036); nothing in this file reads it. */
let fakeRouter: { navigation: ReturnType<typeof vi.fn> };

/** Gates `FakeConcurrentMountStrategy.mount` — set by the "never waits" test to hold a mount open while it asserts against the surrounding call. */
let mountGate: Promise<void> | undefined;

/**
 * Every `FakeConcurrentMountStrategy.mount()` call currently in flight —
 * a test awaits these directly (`Promise.all(pendingMounts)`) to know
 * `fakeRegistry.mounted` reflects every opening widget, instead of an
 * `await Promise.resolve()` assuming a fixed microtask-flush depth for a
 * dispatch loop that deliberately never awaits them itself (the "never
 * waits" test below). Cleared in `beforeEach`.
 */
let pendingMounts: Promise<void>[] = [];

class FakeConcurrentMountStrategy {
  mount(payload: { subject: string }): Promise<void> {
    const settled = (async () => {
      await mountGate;
      await Promise.resolve();
      fakeRegistry!.mounted.add(payload.subject);
    })();
    pendingMounts.push(settled);
    return settled;
  }
  async unmount(payload: { subject: string }): Promise<void> {
    fakeRegistry!.mounted.delete(payload.subject);
  }
}

/**
 * `ThemeAwareReactLifecycle` is real, unmocked, production behaviour
 * belonging to `@gears-frontx/react` (Global Constraints — not under test
 * here): its own `mount()` wraps `renderContent()` in `FrontXProvider`,
 * which needs a fully wired query-cache/theme `FrontXApp` this fixture does
 * not build. Standing in for it — exactly as `lifecycle.test.tsx` already
 * does — keeps the render path real (a genuine `createRoot().render()` of
 * this file's own `renderContent()` output) while removing that dependency.
 */
class FakeThemeAwareReactLifecycle {
  private root: Root | null = null;
  constructor(protected readonly app: unknown) {}
  mount(container: Element | ShadowRoot, bridge: ChildMfeBridge): void {
    this.root = createRoot(container as Element);
    const renderContent = (this as unknown as { renderContent: (b: ChildMfeBridge) => React.ReactNode }).renderContent;
    this.root.render(<>{renderContent.call(this, bridge)}</>);
  }
  unmount(_container: Element | ShadowRoot): Promise<void> {
    this.root?.unmount();
    this.root = null;
    return Promise.resolve();
  }
}

/**
 * Every `onAttached` callback `ExtensionDomainSlot`'s mock below has ever
 * fired, in order — declared through `vi.hoisted` so it exists before the
 * hoisted `vi.mock` factory closes over it.
 */
const { attachedCallbacks, createFrontXSpy, buildSpy } = vi.hoisted(() => ({
  attachedCallbacks: [] as Array<() => void>,
  /** Counts `createFrontX()` and `build()` calls per module copy: a runtime builds exactly one app. */
  createFrontXSpy: vi.fn(),
  buildSpy: vi.fn(),
}));

vi.mock('@gears-frontx/react', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  const builder = {
    use: () => builder,
    build: () => {
      buildSpy();
      return {
        // The app is built once at module evaluation, so the registry is read
        // when asked for, not captured.
        get mfeRegistry() {
          return fakeRegistry;
        },
        // `app.mfeRouter` in production narrows to the navigation facade
        // alone (ADR 0036, D10) — nothing under test here reads it; starting/
        // stopping this domain's own observer is `ExtensionDomainSlot`'s own
        // internal concern (its own suite, Global Constraints here).
        mfeRouter: fakeRouter,
        themeRegistry: { getCurrent: () => undefined },
        i18nRegistry: { getLanguage: () => null },
      };
    },
  };
  return {
    ...real,
    ConcurrentMountStrategy: FakeConcurrentMountStrategy,
    ThemeAwareReactLifecycle: FakeThemeAwareReactLifecycle,
    createFrontX: () => {
      createFrontXSpy();
      return builder;
    },
    ExtensionDomainSlot: ({ onAttached }: { onAttached?: (root: Element) => void }) => {
      const ref = React.useRef<HTMLDivElement | null>(null);
      React.useEffect(() => {
        if (ref.current) {
          attachedCallbacks.push(() => onAttached?.(ref.current!));
          onAttached?.(ref.current);
        }
      }, [onAttached]);
      return <div ref={ref} data-testid="widgets-domain-slot" />;
    },
  };
});

function fakeBridge(): ChildMfeBridge {
  return {
    extDomainId: 'screen',
    extensionId: 'widgets-host',
    executeActionsChain: vi.fn().mockResolvedValue(undefined),
    registerActionHandler: vi.fn(),
    getProperty: vi.fn(() => undefined),
    subscribeToProperty: vi.fn(() => vi.fn()),
  } as unknown as ChildMfeBridge;
}

async function mount(
  bridge: ChildMfeBridge,
  { keepModule = false }: { keepModule?: boolean } = {},
): Promise<{ lifecycle: { unmount: (c: Element) => unknown }; container: HTMLDivElement }> {
  if (!keepModule) vi.resetModules();
  fetchMock = vi.fn().mockResolvedValue(fakeManifestResponse());
  vi.stubGlobal('fetch', fetchMock);
  const module = await import('./lifecycle-widgets-host');
  const lifecycle = module.default as unknown as { mount: (c: Element, b: ChildMfeBridge) => Promise<void>; unmount: (c: Element) => unknown };
  const container = document.createElement('div');
  document.body.appendChild(container);
  // Not wrapped in `act()`: `mount()` itself awaits a promise that only
  // settles once a `useEffect` this render schedules has actually run, and
  // React defers passive effects to a real macrotask outside `act()`'s own
  // synchronous flush.
  await lifecycle.mount(container, bridge);
  mountedInstances.push({ lifecycle, container });
  return { lifecycle, container };
}

let mountedInstances: Array<{ lifecycle: { unmount: (c: Element) => unknown }; container: Element }> = [];

beforeEach(() => {
  fakeRegistry = new FakeRegistry();
  fakeRouter = { navigation: vi.fn(() => ({ navigate: vi.fn(), replace: vi.fn() })) };
  attachedCallbacks.length = 0;
  createFrontXSpy.mockClear();
  buildSpy.mockClear();
  mountGate = undefined;
  pendingMounts = [];
});

afterEach(() => {
  for (const { lifecycle, container } of mountedInstances) {
    try {
      lifecycle.unmount(container);
    } catch {
      // best-effort teardown of a test double; a throw here must not fail an unrelated test
    }
  }
  mountedInstances = [];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('demo-mfe widgets-host lifecycle', () => {
  it('renders its own widgets-domain slot (starting that domain\'s own observer is ExtensionDomainSlot\'s own concern — its own suite)', async () => {
    const { container } = await mount(fakeBridge());

    expect(container.querySelector('[data-testid="widgets-domain-slot"]')).not.toBeNull();
  });

  it('auto-mounts every registered widget with an opening mount_ext chain carrying history "replace" (auto-mount, D10)', async () => {
    await mount(fakeBridge());

    const mountCalls = fakeRegistry!.executeActionsChain.mock.calls
      .map(([chain]: [Chain]) => chain)
      .filter((chain) => chain.action.type === MOUNT);
    expect(mountCalls.map((c) => c.action.payload?.subject).sort()).toEqual([...WIDGET_IDS].sort());
    for (const chain of mountCalls) {
      expect(chain.action.payload?.history).toBe('replace');
    }
  });

  it('dispatches the opening mounts without waiting for any of them to settle (never waits)', async () => {
    let releaseMount!: () => void;
    mountGate = new Promise<void>((resolve) => {
      releaseMount = resolve;
    });

    // `mount()` resolves (this `await` returns) even though every opening
    // widget mount is still pending behind `mountGate` — proof that
    // `WidgetsHostScreen.handleAttached` fires its dispatch loop and calls
    // `onDomainAttached()` without awaiting any of them.
    await mount(fakeBridge());

    expect(fakeRegistry!.getMountedExtensions(WIDGETS_DOMAIN_ID)).toHaveLength(0);
    releaseMount();
    await act(async () => {
      await Promise.all(pendingMounts);
    });
    expect(new Set(fakeRegistry!.getMountedExtensions(WIDGETS_DOMAIN_ID))).toEqual(new Set(WIDGET_IDS));
  });

  // Releasing every mounted widget on unmount — and doing so through the
  // SAME shared releaser a strategy's own explicit unmount uses, so an
  // in-flight mount racing teardown rolls itself back instead of leaking a
  // "mounted" bookkeeping entry nothing ever clears — is `ExtensionDomainSlot`'s
  // own attach/detach ordering plus `mfes`'s own `DefaultExtensionMounter.detach()`
  // (Global Constraints here, this file's own doc comment): this host keeps
  // no release step of its own to test. `lifecycle-widgets-host.remount.test.tsx`
  // exercises the real combination end to end (mount, leave, re-enter).

  it('remounts on the same cached registry without registerDomain throwing, and auto-mounts again with history "replace" (remount)', async () => {
    await mount(fakeBridge());

    await expect(mount(fakeBridge(), { keepModule: true })).resolves.toBeDefined();

    const mountCalls = fakeRegistry!.executeActionsChain.mock.calls
      .map(([chain]: [Chain]) => chain)
      .filter((chain) => chain.action.type === MOUNT);
    expect(mountCalls.length).toBeGreaterThanOrEqual(WIDGET_IDS.length);
    for (const chain of mountCalls) {
      expect(chain.action.payload?.history).toBe('replace');
    }
  });

  it('builds one nested app per module copy and reuses it across mount, unmount and remount', async () => {
    for (let i = 0; i < 3; i += 1) {
      const { lifecycle, container } = await mount(fakeBridge(), { keepModule: i > 0 });
      mountedInstances.pop();
      await lifecycle.unmount(container);
    }

    expect(createFrontXSpy).toHaveBeenCalledTimes(1);
    expect(buildSpy).toHaveBeenCalledTimes(1);
  });

  it('mount() resolves even when a widget chain returns no promise (#648)', async () => {
    fakeRegistry = new FakeRegistry();
    for (const id of WIDGET_IDS) {
      fakeRegistry.setOverride(id, MOUNT, () => undefined);
    }

    await expect(mount(fakeBridge())).resolves.toBeDefined();
  });

  it('mount() resolves without waiting for any widget mount to settle, and starts no timer for one (no waiters)', async () => {
    fakeRegistry = new FakeRegistry();
    fakeRegistry.setOverride(ALPHA_ID, MOUNT, () => new Promise(() => {})); // never settles
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    await expect(mount(fakeBridge())).resolves.toBeDefined();

    expect(setTimeoutSpy).not.toHaveBeenCalled();
  });

  it('does not throw when a ping dispatch returns no promise, and the action still counts as dispatched (ping, #648)', async () => {
    fakeRegistry = new FakeRegistry();
    fakeRegistry.typeSystem.getSchema.mockReturnValue({ actions: [WIDGET_PING_ACTION_TYPE] });
    vi.spyOn(fakeRegistry, 'executeActionsChain').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { container } = await mount(fakeBridge());
    const button = container.querySelector('[data-testid="ping-alpha"]') as HTMLButtonElement | null;
    expect(button).toBeTruthy();

    act(() => {
      fireEvent.click(button!);
    });

    expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining(`ping ${ALPHA_ID}`), expect.anything());
    expect(fakeRegistry.executeActionsChain).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.objectContaining({ type: WIDGET_PING_ACTION_TYPE, target: ALPHA_ID }),
      }),
    );
  });

  it('does not throw when a ping dispatch refuses synchronously (ping, synchronous refusal)', async () => {
    fakeRegistry = new FakeRegistry();
    fakeRegistry.typeSystem.getSchema.mockReturnValue({ actions: [WIDGET_PING_ACTION_TYPE] });
    vi.spyOn(fakeRegistry, 'executeActionsChain').mockImplementation(() => {
      throw new Error('ping refused synchronously');
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { container } = await mount(fakeBridge());
    const button = container.querySelector('[data-testid="ping-alpha"]') as HTMLButtonElement | null;
    expect(button).toBeTruthy();

    expect(() => fireEvent.click(button!)).not.toThrow();

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(`ping ${ALPHA_ID}`), expect.any(Error));
  });

  it('rebinds impl to the already-registered domain on a remount, when the nested registry is cached (remount + cached registry)', async () => {
    const WIDGETS_HOLDER_KEY = Symbol.for('@gears-frontx/demo-mfe/widgets-host-holder/v1');

    const registry = new FakeRegistry();
    fakeRegistry = registry;

    // First mount: nothing registered on `registry` yet, so `registerDomain`
    // runs for real and constructs `WidgetsDomainImpl` (`holder.impl = this`).
    await mount(fakeBridge());
    await act(async () => {
      await Promise.all(pendingMounts);
    });
    expect(new Set(registry.getMountedExtensions(WIDGETS_DOMAIN_ID))).toEqual(new Set(WIDGET_IDS));

    // Remount against the SAME `registry`: `vi.resetModules()` (inside
    // `mount()`, `keepModule` defaults to false) clears vitest's module cache,
    // so the next `import('./lifecycle-widgets-host')` re-runs the module's
    // own top-level code with fresh bindings. `fakeRegistry` is deliberately
    // left pointing at the SAME instance (unlike every other test's `beforeEach`).
    await mount(fakeBridge());
    await act(async () => {
      await Promise.all(pendingMounts);
    });

    const holder = (globalThis as Record<symbol, { impl?: unknown } | undefined>)[WIDGETS_HOLDER_KEY];
    expect(holder?.impl).toBeDefined();
    expect(new Set(registry.getMountedExtensions(WIDGETS_DOMAIN_ID))).toEqual(new Set(WIDGET_IDS));
  });
});
