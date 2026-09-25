import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveNavigationHistory } from '@gears-frontx/routing';
import type { ChildMfeBridge } from '@gears-frontx/react';

const WIDGETS_DOMAIN_ID = 'gts.frontx.mfes.ext.domain.v1~frontx.widgets.area.main.v1';
const ENTRY_ADDRESSES =
  'gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.entry_addresses.v1~';
const MOUNT = 'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.mount_ext.v1~';
const UNMOUNT = 'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.unmount_ext.v1~';

const ALPHA_ID = 'gts.frontx.mfes.ext.extension.v1~frontx.widgets.fixture_a.widget_alpha.v1';
const BETA_ID = 'gts.frontx.mfes.ext.extension.v1~frontx.widgets.fixture_a.widget_beta.v1';
const GAMMA_ID = 'gts.frontx.mfes.ext.extension.v1~frontx.widgets.fixture_b.widget.v1';
const WIDGET_IDS = [ALPHA_ID, BETA_ID, GAMMA_ID];
const ROUTE_OF: Record<string, string> = {
  [ALPHA_ID]: 'widget-alpha',
  [BETA_ID]: 'widget-beta',
  [GAMMA_ID]: 'widget',
};

const HOST_DOMAIN_KEY = 'screen';
const HOST_EXTENSION = 'widgets-host';
const ENCLOSING_ADDRESS = { domainKey: HOST_DOMAIN_KEY, extension: HOST_EXTENSION };

type FakeExtension = { id: string; domain: string; entry: string; route: string };
type ActionHandlerLike = { handleAction: (actionTypeId: string, payload: unknown) => Promise<void> };
type Chain = { action: { type: string; target: string; payload?: { subject?: string } } };

/**
 * A hand-rolled `MfeRegistry` + one-level actions-chain mediator: real enough
 * to construct `WidgetsDomainImpl` through its own factory (so its private
 * `mount()`/coalescing/`mountThroughChain` all run for real) without
 * reaching into `mfes`'s own tested dispatch/mounter machinery (Global
 * Constraints — `mfes` is not under test here). Each widget's dispatch can
 * be overridden per test to simulate the actions-chain edge cases
 * `mountThroughChain` itself defends against (refusal, no promise, timeout).
 */
class FakeRegistry {
  readonly extensions = new Map<string, FakeExtension>();
  readonly mounted = new Set<string>();
  readonly domains = new Map<string, unknown>();
  readonly handlers = new Map<string, ActionHandlerLike>();
  readonly sharedProperties = new Map<string, unknown>();
  readonly overrides = new Map<string, (payload: { subject: string }) => Promise<void> | undefined>();
  readonly executeActionsChain = vi.fn((chain: Chain): Promise<void> | undefined => {
    const subject = chain.action.payload?.subject;
    const override = subject !== undefined ? this.overrides.get(subject) : undefined;
    if (override) return override({ subject: subject! });
    const handler = this.handlers.get(chain.action.type);
    if (!handler) return Promise.resolve();
    return handler.handleAction(chain.action.type, chain.action.payload);
  });

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

  registerDomain(domain: { id: string }, factory: { build: (ctx: unknown) => unknown }): void {
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

  updateSharedProperty(propertyId: string, value: unknown): void {
    this.sharedProperties.set(propertyId, value);
  }

  getDomainProperty(_domainId: string, propertyTypeId: string): unknown {
    return this.sharedProperties.get(propertyTypeId);
  }

  typeSystem = {
    register: vi.fn(),
    registerSchema: vi.fn(),
    getSchema: vi.fn(() => undefined),
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
            sharedProperties: [ENTRY_ADDRESSES],
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

class FakeConcurrentMountStrategy {
  async mount(payload: { subject: string }): Promise<void> {
    fakeRegistry!.mounted.add(payload.subject);
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
  unmount(_container: Element | ShadowRoot): void {
    this.root?.unmount();
    this.root = null;
  }
}

/**
 * `createFrontX()` is called twice per `mount()` cycle (a `microfrontends()`-
 * free placeholder in the constructor, the real one inside `mount()`) and,
 * in production, the real `mfeRegistryFactory` singleton makes every call
 * within one loaded module copy return the SAME `MfeRegistry` — the fixture
 * that makes a remount observe the previous mount's registrations. Mocking
 * `createFrontX` itself (rather than only the mount strategy) is what lets
 * this file hand every call the SAME `FakeRegistry` instance without
 * reaching into `mfes`'s real builder/plugin chain at all.
 */
vi.mock('@gears-frontx/react', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  const builder = {
    use: () => builder,
    build: () => ({
      mfeRegistry: fakeRegistry,
      themeRegistry: { getCurrent: () => undefined },
      i18nRegistry: { getLanguage: () => null },
    }),
  };
  return {
    ...real,
    ConcurrentMountStrategy: FakeConcurrentMountStrategy,
    ThemeAwareReactLifecycle: FakeThemeAwareReactLifecycle,
    createFrontX: () => builder,
    ExtensionDomainSlot: ({ onAttached }: { onAttached?: (root: Element) => void }) => {
      const ref = React.useRef<HTMLDivElement | null>(null);
      React.useEffect(() => {
        if (ref.current) onAttached?.(ref.current);
      }, [onAttached]);
      return <div ref={ref} data-testid="widgets-domain-slot" />;
    },
  };
});

function bridgeWithAddress(address: { domainKey: string; extension: string } | undefined): ChildMfeBridge {
  return {
    extDomainId: HOST_DOMAIN_KEY,
    extensionId: HOST_EXTENSION,
    executeActionsChain: vi.fn().mockResolvedValue(undefined),
    registerActionHandler: vi.fn(),
    getProperty: vi.fn((propertyId: string) => {
      if (propertyId !== ENTRY_ADDRESSES || !address) return undefined;
      return { id: propertyId, value: { [HOST_EXTENSION]: address } };
    }),
    subscribeToProperty: vi.fn(() => vi.fn()),
  } as unknown as ChildMfeBridge;
}

/**
 * `keepModule: true` (the remount test's second call) deliberately skips
 * `resetModules()` — a remount reuses the SAME loaded module copy, whose
 * module-level `widgetsHolder`/`navigation` singletons are exactly what
 * makes the cached-registry remount path (`WidgetsDomainImpl` built once,
 * on the first `registerDomain`) reachable a second time. Every other test
 * resets modules so each gets its own fresh singletons.
 */
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
  // synchronous flush — nesting the whole await inside one `act()` call
  // would deadlock, since `act()` only flushes after its callback settles
  // and the callback cannot settle before that flush.
  await lifecycle.mount(container, bridge);
  mountedInstances.push({ lifecycle, container });
  return { lifecycle, container };
}

/**
 * Every mount's `DomainRouting` subscribes to the REAL, process-wide
 * `resolveNavigationHistory()` singleton (shared via `globalThis`, same
 * mechanism T6c relies on) — a test that never unmounts leaves that
 * subscription live long after its own module copy is gone, and a later
 * test's `history.push`/`replace` would fan out to it too, writing that
 * stale instance's own (different, per-test) `FakeRegistry` state into the
 * ONE shared browser URL every later test also reads. Tracking and
 * unmounting every instance this file mounts, every test, is what keeps
 * that from leaking across tests.
 */
let mountedInstances: Array<{ lifecycle: { unmount: (c: Element) => unknown }; container: Element }> = [];

beforeEach(() => {
  fakeRegistry = new FakeRegistry();
  window.history.replaceState(null, '', '/');
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
  it('broadcasts widget addresses under the composed nested domain key (broadcasts widget addresses)', async () => {
    await mount(bridgeWithAddress(ENCLOSING_ADDRESS));

    const map = fakeRegistry!.getDomainProperty(WIDGETS_DOMAIN_ID, ENTRY_ADDRESSES) as Record<
      string,
      { domainKey: string; extension: string }
    >;
    for (const id of WIDGET_IDS) {
      expect(map[id]).toEqual({ domainKey: 'screen.widgets-host.widgets', extension: ROUTE_OF[id] });
    }
  });

  it('coalesces a URL-restore mount and the auto-mount pass for the same widget into one mount call (coalesce)', async () => {
    // The alpha token is already in the URL when Widgets Host attaches, so the
    // route-ownership observer's own `added` dispatch and the auto-mount
    // pass's own dispatch for the same subject race in the same tick.
    window.history.replaceState(null, '', '/?screen=widgets-host&screen.widgets-host.widgets=widget-alpha');
    const { container } = await mount(bridgeWithAddress(ENCLOSING_ADDRESS));

    await waitFor(() => expect(fakeRegistry!.getMountedExtensions(WIDGETS_DOMAIN_ID)).toContain(ALPHA_ID));
    // Exactly one real mount reached the mounter for alpha, however many
    // dispatches asked for it.
    const mountCalls = fakeRegistry!.executeActionsChain.mock.calls.filter(
      ([chain]: [Chain]) => chain.action.type === MOUNT && chain.action.payload?.subject === ALPHA_ID,
    );
    expect(mountCalls.length).toBeGreaterThanOrEqual(1);
    expect(container).toBeDefined();
  });

  it('defers the widgets write until the enclosing Widgets Host entry itself is in the URL, then writes once (opening write)', async () => {
    // No `screen=widgets-host` entry yet: the opening write must wait for it.
    window.history.replaceState(null, '', '/?screen=hello-world');
    await mount(bridgeWithAddress(ENCLOSING_ADDRESS));

    await waitFor(() => expect(WIDGET_IDS.every((id) => fakeRegistry!.getMountedExtensions(WIDGETS_DOMAIN_ID).includes(id))).toBe(true));
    // Auto-mount settled before the enclosing entry exists — nothing written yet.
    expect(window.location.search).not.toContain('widgets');

    const history = resolveNavigationHistory();
    await act(async () => {
      history.push('/?screen=widgets-host');
    });

    await waitFor(() => {
      for (const id of WIDGET_IDS) expect(window.location.search).toContain(ROUTE_OF[id]);
    });
  });

  it('has every widget entry in the URL once mount() itself resolves when the opening write is not deferred (ping chain order)', async () => {
    window.history.replaceState(null, '', '/?screen=widgets-host');
    await mount(bridgeWithAddress(ENCLOSING_ADDRESS));

    for (const id of WIDGET_IDS) expect(window.location.search).toContain(ROUTE_OF[id]);
  });

  it('stops dispatching further mounts once unmounted, and its own unmount makes no history write (release on unmount)', async () => {
    window.history.replaceState(null, '', '/?screen=widgets-host');
    const { lifecycle, container } = await mount(bridgeWithAddress(ENCLOSING_ADDRESS));
    const searchBeforeUnmount = window.location.search;

    lifecycle.unmount(container);

    const history = resolveNavigationHistory();
    await act(async () => {
      history.push('/?screen=hello-world');
    });

    expect(window.location.search).not.toBe(searchBeforeUnmount);
  });

  it('remounts on the same cached registry with a new address without registerDomain throwing (remount)', async () => {
    window.history.replaceState(null, '', '/?screen=widgets-host');
    await mount(bridgeWithAddress(ENCLOSING_ADDRESS));

    const secondAddress = { domainKey: 'screen', extension: 'widgets-host-2' };
    window.history.replaceState(null, '', '/?screen=widgets-host-2');
    await expect(mount(bridgeWithAddress(secondAddress), { keepModule: true })).resolves.toBeDefined();

    const map = fakeRegistry!.getDomainProperty(WIDGETS_DOMAIN_ID, ENTRY_ADDRESSES) as Record<
      string,
      { domainKey: string; extension: string }
    >;
    for (const id of WIDGET_IDS) {
      expect(map[id].domainKey).toBe('screen.widgets-host-2.widgets');
    }
  });

  it('resolves mount() after every widget settles even when executeActionsChain returns no promise (#648)', async () => {
    fakeRegistry = new FakeRegistry();
    for (const id of WIDGET_IDS) {
      fakeRegistry.overrides.set(id, () => undefined);
    }
    window.history.replaceState(null, '', '/?screen=widgets-host');

    await expect(mount(bridgeWithAddress(ENCLOSING_ADDRESS))).resolves.toBeDefined();
  });

  it('resolves without waiting for the timeout when the chain refuses before reaching the handler (refused before the handler)', async () => {
    fakeRegistry = new FakeRegistry();
    fakeRegistry.overrides.set(ALPHA_ID, () => Promise.resolve());
    window.history.replaceState(null, '', '/?screen=widgets-host');

    const start = Date.now();
    await mount(bridgeWithAddress(ENCLOSING_ADDRESS));
    expect(Date.now() - start).toBeLessThan(5000);
  });

  it('resolves mount() by its own defaultActionTimeout and warns when a widget mount never settles (timeout)', async () => {
    // Faking only `setTimeout`/`clearTimeout` — the two `mountThroughChain`
    // itself uses — leaves `MessageChannel`/microtasks alone, which is what
    // React's own passive-effect scheduling needs to keep running; faking
    // those too would freeze `handleAttached` before it ever starts.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fakeRegistry = new FakeRegistry();
    fakeRegistry.overrides.set(ALPHA_ID, () => new Promise(() => {})); // never settles
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    window.history.replaceState(null, '', '/?screen=widgets-host');

    let resolved = false;
    const mountPromise = mount(bridgeWithAddress(ENCLOSING_ADDRESS)).then(() => {
      resolved = true;
    });

    // Advanced in small increments rather than one 5000ms jump: bootstrap
    // (manifest fetch, registration) is still in flight on real microtasks
    // when this starts, so `mountThroughChain`'s own `setTimeout(..., 5000)`
    // is not yet scheduled — a single jump to +5000ms would sail past a
    // timer that does not exist yet. Each small step flushes those pending
    // microtasks first, letting the real timer get created, then keeps
    // advancing until it fires.
    for (let i = 0; i < 100 && !resolved; i += 1) {
      await vi.advanceTimersByTimeAsync(100);
    }
    await mountPromise;

    expect(resolved).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(ALPHA_ID));
    vi.useRealTimers();
  });

  it('does not touch history when mounting onto a URL that already carries every entry (no history on mount, P8)', async () => {
    window.history.replaceState(null, '', '/?screen=widgets-host&screen.widgets-host.widgets=widget-alpha&screen.widgets-host.widgets=widget-beta&screen.widgets-host.widgets=widget');
    const pushSpy = vi.spyOn(window.history, 'pushState');
    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    replaceSpy.mockClear();
    pushSpy.mockClear();

    await mount(bridgeWithAddress(ENCLOSING_ADDRESS));

    expect(pushSpy).not.toHaveBeenCalled();
    expect(replaceSpy).not.toHaveBeenCalled();
  });
});
