import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionHandler } from '@gears-frontx/react';
import { createRouteSignal } from '@gears-frontx/routing';
import { fakeNavigation } from '../../../src/routing/__tests__/fake-navigation';

const registerDomain = vi.fn();
const updateSharedProperty = vi.fn();
const registerSchema = vi.fn();
const registerInstance = vi.fn();
const registerExtension = vi.fn().mockResolvedValue(undefined);
const getDomain = vi.fn();
const getExtension = vi.fn();
const getExtensionsForDomain = vi.fn((_domainId: string): unknown[] => []);
const getMountedExtensions = vi.fn(() => []);
const executeActionsChain = vi.fn(() => Promise.resolve());
// Real `ExclusiveMountStrategy`/`OptionalMountStrategy` need a fully wired
// `mfes` registry/mounter/bridge to mount anything — out of scope here (that
// machinery is `mfes`'s own tested behaviour, Global Constraints). These
// fakes stand in for them so the cases below can exercise only what this
// package owns: the order between a strategy settling and `routing.afterMount`
// / `routing.afterUnmount` being called.
const exclusiveMount = vi.fn().mockResolvedValue(undefined);
class FakeExclusiveMountStrategy {
  mount = exclusiveMount;
}
const optionalMount = vi.fn().mockResolvedValue(undefined);
const optionalUnmount = vi.fn().mockResolvedValue(undefined);
class FakeOptionalMountStrategy {
  mount = optionalMount;
  unmount = optionalUnmount;
}

const mockMfeRegistry = {
  registerDomain,
  updateSharedProperty,
  registerExtension,
  getDomain,
  getExtension,
  getExtensionsForDomain,
  getMountedExtensions,
  executeActionsChain,
  typeSystem: {
    register: registerInstance,
    registerSchema,
  },
};

const mockApp = {
  mfeRegistry: mockMfeRegistry,
  themeRegistry: { getCurrent: () => undefined },
  i18nRegistry: { getLanguage: () => null },
};

// Each domain needs a valid `route` — `createShellRouting`'s `rootDomainKeyOf`
// throws for a domain that declares none, and `bootstrapMFE` would then throw
// before ever reaching the manifest fetch these cases exercise.
vi.mock('@gears-frontx/react', async (importOriginal) => {
  const real = await importOriginal<Record<string, never>>();
  return {
    ...real,
    // `actions` is spread by the host bootstrap to append the chrome actions.
    screenDomain: { id: 'screen-domain', route: 'screen', actions: [] },
    sidebarDomain: { id: 'sidebar-domain', route: 'sidebar' },
    popupDomain: { id: 'popup-domain', route: 'popup' },
    overlayDomain: { id: 'overlay-domain', route: 'overlay' },
    ExclusiveMountStrategy: FakeExclusiveMountStrategy,
    OptionalMountStrategy: FakeOptionalMountStrategy,
  };
});

describe('bootstrapMFE (host-app)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    registerDomain.mockReset();
    updateSharedProperty.mockReset();
    registerSchema.mockReset();
    registerInstance.mockReset();
    registerExtension.mockReset();
    registerExtension.mockResolvedValue(undefined);
    getDomain.mockReset();
    getExtension.mockReset();
    getExtensionsForDomain.mockReset();
    getExtensionsForDomain.mockReturnValue([]);
    getMountedExtensions.mockReset();
    getMountedExtensions.mockReturnValue([]);
    executeActionsChain.mockClear();
    exclusiveMount.mockClear();
    exclusiveMount.mockResolvedValue(undefined);
    optionalMount.mockClear();
    optionalMount.mockResolvedValue(undefined);
    optionalUnmount.mockClear();
    optionalUnmount.mockResolvedValue(undefined);

    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('registers the four base domains before fetching manifests', async () => {
    fetchSpy.mockResolvedValue(new Response('[]', { status: 200 }));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { bootstrapMFE } = await import('./bootstrap');
    await bootstrapMFE(mockApp as never);

    expect(registerDomain).toHaveBeenCalledTimes(4);
    expect(updateSharedProperty.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('opts the screen domain into the host chrome actions', async () => {
    fetchSpy.mockResolvedValue(new Response('[]', { status: 200 }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { bootstrapMFE } = await import('./bootstrap');
    const { CHROME_SET_MENU_COLLAPSED, CHROME_SET_THEME } = await import('./chrome-actions');
    await bootstrapMFE(mockApp as never);

    const [screenDeclaration] = registerDomain.mock.calls[0];
    expect(screenDeclaration.actions).toEqual([CHROME_SET_THEME, CHROME_SET_MENU_COLLAPSED]);
    // Making them domain actions must not make them mandatory for the
    // extensions that mount into the domain.
    expect(screenDeclaration.extensionsActions).toBeUndefined();
    // The two chrome action schemas plus `entryAddressesSchema` (N2 below).
    expect(registerSchema).toHaveBeenCalledTimes(3);
  });

  it('registers entryAddressesSchema before the first registerDomain call', async () => {
    fetchSpy.mockResolvedValue(new Response('[]', { status: 200 }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { entryAddressesSchema } = await import('@gears-frontx/frontx-template-shell');

    const { bootstrapMFE } = await import('./bootstrap');
    await bootstrapMFE(mockApp as never);

    const entryAddressesCallIndex = registerSchema.mock.calls.findIndex((call) => call[0] === entryAddressesSchema);
    expect(entryAddressesCallIndex).toBeGreaterThanOrEqual(0);
    const entryAddressesOrder = registerSchema.mock.invocationCallOrder[entryAddressesCallIndex];
    expect(entryAddressesOrder).toBeLessThan(registerDomain.mock.invocationCallOrder[0]);
  });

  it('broadcasts the entry-addresses shared property once per registration resolved so far, never ahead of it (M1)', async () => {
    // `registered` is only pushed to once `registerExtension`'s OWN promise
    // settles (on the next microtask, not synchronously inside the call) —
    // mirroring how the real registry's state only reflects a registration
    // once it has actually completed. Correct code awaits
    // `registerExtension` before re-broadcasting, so each broadcast's value
    // reflects exactly the registrations that have resolved by then. A
    // mutation that broadcasts BEFORE awaiting `registerExtension` (M1) would
    // see this array one step behind — the previous, weaker version of this
    // test (checking only the final broadcast's value) could not tell the
    // two apart, since a delayed broadcast still eventually reaches the same
    // end state.
    const registered: Array<{ id: string; domain: string }> = [];
    const extA = { id: 'ext.a', domain: 'screen-domain', presentation: { route: '/a' } };
    const extB = { id: 'ext.b', domain: 'screen-domain', presentation: { route: '/b' } };
    getDomain.mockImplementation((id: string) => (id === 'screen-domain' ? { id } : undefined));
    getExtensionsForDomain.mockImplementation((domainId: string) =>
      domainId === 'screen-domain' ? [...registered] : [],
    );
    registerExtension.mockImplementation(
      (ext: { id: string; domain: string }) =>
        new Promise<void>((resolve) => {
          queueMicrotask(() => {
            registered.push(ext);
            resolve();
          });
        }),
    );
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify([
          { manifest: { $id: 'manifest.demo', id: 'manifest.demo' }, entries: [], extensions: [extA, extB] },
        ]),
        { status: 200 },
      ),
    );

    const { bootstrapMFE } = await import('./bootstrap');
    const { FRONTX_SHARED_PROPERTY_ENTRY_ADDRESSES } = await import('@gears-frontx/frontx-template-shell');
    await bootstrapMFE(mockApp as never);

    const addressValues = updateSharedProperty.mock.calls
      .filter(([id]) => id === FRONTX_SHARED_PROPERTY_ENTRY_ADDRESSES)
      .map(([, value]) => value);

    // One broadcast after the 4 (extension-less) domains, one after `ext.a`
    // resolves, one after `ext.b` resolves, and a final one after the whole
    // package loop (C2) — each strictly containing more than the last.
    expect(addressValues).toEqual([
      {},
      { 'ext.a': { domainKey: 'screen', extension: 'a' } },
      { 'ext.a': { domainKey: 'screen', extension: 'a' }, 'ext.b': { domainKey: 'screen', extension: 'b' } },
      { 'ext.a': { domainKey: 'screen', extension: 'a' }, 'ext.b': { domainKey: 'screen', extension: 'b' } },
    ]);
  });

  it("the screen mount handler calls routing.afterMount only after the strategy's own mount settles, and before the handler itself settles", async () => {
    fetchSpy.mockResolvedValue(new Response('[]', { status: 200 }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { bootstrapMFE } = await import('./bootstrap');
    const routing = await bootstrapMFE(mockApp as never);

    // Records the three events in order — proves the handler awaits the
    // strategy before it back-projects (not racing the two, D3), AND that
    // `afterMount` runs before the handler's own returned promise settles
    // (not merely somewhere before it, which a version of this handler that
    // called `afterMount` from a `.then()` chained onto the settled handler
    // promise — running afterMount AFTER the handler had already settled —
    // would still satisfy: 'handler settled' catches that, F1/M3).
    const order: string[] = [];
    const afterMountSpy = vi.spyOn(routing.screen, 'afterMount').mockImplementation(() => order.push('afterMount'));
    let resolveMount: (() => void) | undefined;
    exclusiveMount.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveMount = () => {
            order.push('strategy.mount settled');
            resolve();
          };
        }),
    );

    const [, screenFactory] = registerDomain.mock.calls[0];
    const handlers = new Map<string, { handleAction: (t: string, p: unknown) => unknown }>();
    screenFactory.build({
      mounter: {},
      registerHandler: (actionTypeId: string, handler: { handleAction: (t: string, p: unknown) => unknown }) => {
        handlers.set(actionTypeId, handler);
      },
    });

    const mountHandler = handlers.get('gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.mount_ext.v1~');
    expect(mountHandler).toBeDefined();
    // Cast (not `Promise.resolve(...)`, which would itself insert an extra
    // microtask hop between the handler settling and `.then()` below seeing
    // it, quietly forgiving a mutation that defers `afterMount` by exactly
    // that one hop) — `handleAction` returns the handler's own promise
    // unwrapped (`FunctionActionHandler.handleAction` in `@gears-frontx/mfes`
    // is a direct passthrough), so `.then()` directly on it observes the
    // real settlement with no hop of its own.
    const settled = mountHandler!.handleAction('gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.mount_ext.v1~', {
      subject: 'ext.hello-world',
    }) as Promise<void>;
    // Attached before the `await settled` below, so this callback's push
    // lands in `order` before that await's own continuation runs.
    settled.then(() => order.push('handler settled'));
    expect(order).toEqual([]); // neither has run yet — strategy.mount is still pending
    resolveMount?.();
    await settled;

    expect(order).toEqual(['strategy.mount settled', 'afterMount', 'handler settled']);
    expect(afterMountSpy).toHaveBeenCalledWith('ext.hello-world');
  });

  it('dispatches exactly one push to /?screen=hello-world for a mount, with real routing and no afterMount spy', async () => {
    // Unlike the ordering test above (which fakes `afterMount` to observe
    // sequencing), this exercises the real `DomainRouting` end to end against
    // a real `fakeNavigation`, proving the handler's back-projection actually
    // reaches the URL — a spy-only test could pass even if `afterMount` wrote
    // the wrong path or wrote more than once (F1).
    const history = fakeNavigation('/');
    const nav = { history, signal: createRouteSignal(history) };
    getExtension.mockImplementation((id: string) =>
      id === 'ext.hello-world' ? { id, domain: 'screen-domain', presentation: { route: '/hello-world' } } : undefined,
    );
    fetchSpy.mockResolvedValue(new Response('[]', { status: 200 }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { bootstrapMFE } = await import('./bootstrap');
    await bootstrapMFE(mockApp as never, nav);

    exclusiveMount.mockResolvedValue(undefined);
    const [, screenFactory] = registerDomain.mock.calls[0];
    const handlers = new Map<string, { handleAction: (t: string, p: unknown) => unknown }>();
    screenFactory.build({
      mounter: {},
      registerHandler: (actionTypeId: string, handler: { handleAction: (t: string, p: unknown) => unknown }) => {
        handlers.set(actionTypeId, handler);
      },
    });
    const mountHandler = handlers.get('gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.mount_ext.v1~')!;

    await mountHandler.handleAction('gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.mount_ext.v1~', {
      subject: 'ext.hello-world',
    });

    expect(history.writes).toEqual([{ kind: 'push', path: '/?screen=hello-world' }]);
  });

  it("an optional domain's mount and unmount handlers call routing.afterMount/afterUnmount only after their own strategy settles (F3)", async () => {
    fetchSpy.mockResolvedValue(new Response('[]', { status: 200 }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { bootstrapMFE } = await import('./bootstrap');
    const routing = await bootstrapMFE(mockApp as never);

    const order: string[] = [];
    const afterMountSpy = vi.spyOn(routing.sidebar, 'afterMount').mockImplementation(() => order.push('afterMount'));
    const afterUnmountSpy = vi
      .spyOn(routing.sidebar, 'afterUnmount')
      .mockImplementation(() => order.push('afterUnmount'));

    let resolveMount: (() => void) | undefined;
    optionalMount.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveMount = () => {
            order.push('strategy.mount settled');
            resolve();
          };
        }),
    );
    let resolveUnmount: (() => void) | undefined;
    optionalUnmount.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveUnmount = () => {
            order.push('strategy.unmount settled');
            resolve();
          };
        }),
    );

    // Sidebar is the second `registerDomain` call (screen, sidebar, popup, overlay).
    const [, sidebarFactory] = registerDomain.mock.calls[1];
    const handlers = new Map<string, { handleAction: (t: string, p: unknown) => unknown }>();
    sidebarFactory.build({
      mounter: {},
      registerHandler: (actionTypeId: string, handler: { handleAction: (t: string, p: unknown) => unknown }) => {
        handlers.set(actionTypeId, handler);
      },
    });
    const mountHandler = handlers.get('gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.mount_ext.v1~');
    const unmountHandler = handlers.get('gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.unmount_ext.v1~');
    expect(mountHandler).toBeDefined();
    expect(unmountHandler).toBeDefined();

    const mountSettled = mountHandler!.handleAction('mount', { subject: 'ext.sidebar-thing' });
    resolveMount?.();
    await mountSettled;

    const unmountSettled = unmountHandler!.handleAction('unmount', { subject: 'ext.sidebar-thing' });
    expect(order).toEqual(['strategy.mount settled', 'afterMount']); // unmount's strategy is still pending
    resolveUnmount?.();
    await unmountSettled;

    // A mutation that removes the `afterUnmount` call entirely (M4) leaves
    // `order` one entry short and this spy never called — either assertion
    // below catches it.
    expect(order).toEqual(['strategy.mount settled', 'afterMount', 'strategy.unmount settled', 'afterUnmount']);
    expect(afterMountSpy).toHaveBeenCalledWith('ext.sidebar-thing');
    expect(afterUnmountSpy).toHaveBeenCalledWith('ext.sidebar-thing');
  });

  it('throws when the manifest fetch fails', async () => {
    fetchSpy.mockResolvedValue(new Response('not found', { status: 404, statusText: 'Not Found' }));

    const { bootstrapMFE } = await import('./bootstrap');
    await expect(bootstrapMFE(mockApp as never)).rejects.toThrow(/Failed to load MFE manifests/);
  });

  it('registers schemas, manifest, entries, and extensions for each package', async () => {
    const screenDomainId = 'screen-domain';
    getDomain.mockImplementation((id: string) => (id === screenDomainId ? { id } : undefined));

    const manifestEntity = { $id: 'manifest.demo', id: 'manifest.demo' };
    const entry = { id: 'entry.demo', actions: ['act.a'], domainActions: ['act.b'] };
    const ext = { id: 'ext.demo', domain: screenDomainId };
    const schemaActionA = { $id: 'schema.act.a' };
    const schemaActionB = { $id: 'schema.act.b' };
    const schemaUnrelated = { $id: 'schema.other' };

    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            manifest: manifestEntity,
            entries: [entry],
            extensions: [ext],
            schemas: [schemaActionA, schemaActionB, schemaUnrelated],
          },
        ]),
        { status: 200 },
      ),
    );

    const { bootstrapMFE } = await import('./bootstrap');
    await bootstrapMFE(mockApp as never);

    // Action schemas registered by scoped pass (act.a/act.b match entry actions/domainActions).
    expect(registerSchema).toHaveBeenCalledWith(schemaActionA);
    expect(registerSchema).toHaveBeenCalledWith(schemaActionB);
    // Non-action schemas are registered up-front via the first pass too.
    expect(registerSchema).toHaveBeenCalledWith(schemaUnrelated);
    expect(registerInstance).toHaveBeenCalledWith(manifestEntity);
    expect(registerInstance).toHaveBeenCalledWith(entry);
    expect(registerExtension).toHaveBeenCalledWith(ext);
  });

  it('a throwing broadcast does not reject bootstrapMFE, and registration continues for later extensions (C2)', async () => {
    const extA = { id: 'ext.a', domain: 'screen-domain' };
    const extB = { id: 'ext.b', domain: 'screen-domain' };
    getDomain.mockImplementation((id: string) => (id === 'screen-domain' ? { id } : undefined));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { FRONTX_SHARED_PROPERTY_ENTRY_ADDRESSES } = await import('@gears-frontx/frontx-template-shell');
    // Throws on exactly the SECOND entry-addresses broadcast (the one right
    // after `ext.a` registers) — the first is the domains-only broadcast, the
    // theme/language broadcasts use a different property id and are
    // untouched. Registration itself must stay all-or-nothing (still
    // unguarded), so `ext.b` still registers afterwards; only the broadcast
    // around it is isolated.
    let addressBroadcastCount = 0;
    updateSharedProperty.mockImplementation((id: string) => {
      if (id !== FRONTX_SHARED_PROPERTY_ENTRY_ADDRESSES) return;
      addressBroadcastCount += 1;
      if (addressBroadcastCount === 2) throw new Error('broadcast boom');
    });
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify([
          { manifest: { $id: 'manifest.demo', id: 'manifest.demo' }, entries: [], extensions: [extA, extB] },
        ]),
        { status: 200 },
      ),
    );

    const { bootstrapMFE } = await import('./bootstrap');
    await expect(bootstrapMFE(mockApp as never)).resolves.toBeDefined();

    expect(registerExtension).toHaveBeenCalledWith(extA);
    expect(registerExtension).toHaveBeenCalledWith(extB);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('skips extension registration when host does not own the target domain', async () => {
    getDomain.mockReturnValue(undefined);
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            manifest: { $id: 'manifest.foreign', id: 'manifest.foreign' },
            entries: [],
            extensions: [{ id: 'ext.foreign', domain: 'foreign-domain' }],
          },
        ]),
        { status: 200 },
      ),
    );

    const { bootstrapMFE } = await import('./bootstrap');
    await bootstrapMFE(mockApp as never);

    expect(registerExtension).not.toHaveBeenCalled();
  });

  describe('screen-domain chrome handlers', () => {
    /**
     * Bootstraps with the given `app.actions` surface and returns the handlers
     * the screen domain's implementation registered. The factory is taken from
     * the `registerDomain` call rather than reconstructed, so the handlers
     * under test are the ones the real bootstrap would have installed.
     */
    async function chromeHandlersFor(
      actions: Record<string, unknown>,
    ): Promise<Map<string, ActionHandler>> {
      fetchSpy.mockResolvedValue(new Response('[]', { status: 200 }));

      const { bootstrapMFE } = await import('./bootstrap');
      await bootstrapMFE({ ...mockApp, actions } as never);

      const handlers = new Map<string, ActionHandler>();
      const [, screenFactory] = registerDomain.mock.calls[0];
      screenFactory.build({
        mounter: {},
        registerHandler: (actionTypeId: string, handler: ActionHandler) => {
          handlers.set(actionTypeId, handler);
        },
      });
      return handlers;
    }

    /**
     * The handler registered for `actionTypeId`, or a failure naming what was
     * not registered. `Map.get` returns `ActionHandler | undefined`, and calling
     * it optionally would hand every case below an `undefined` in place of the
     * call it meant to make: a screen domain that registered no handler at all
     * then fails as whatever shape each assertion happens to reject, or does not
     * fail, instead of as the missing registration it is.
     */
    function handlerFor(handlers: Map<string, ActionHandler>, actionTypeId: string): ActionHandler {
      const handler = handlers.get(actionTypeId);
      if (!handler) {
        throw new Error(`the screen domain registered no handler for '${actionTypeId}'`);
      }
      return handler;
    }

    beforeEach(() => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    it('applies the theme a set_theme action names through the host themes plugin', async () => {
      const changeTheme = vi.fn();
      const { CHROME_SET_THEME } = await import('./chrome-actions');

      const handlers = await chromeHandlersFor({ changeTheme });
      await handlerFor(handlers, CHROME_SET_THEME).handleAction(CHROME_SET_THEME, {
        themeId: 'dark',
      });

      expect(changeTheme).toHaveBeenCalledWith({ themeId: 'dark' });
    });

    it('collapses the menu a set_menu_collapsed action names through the host layout plugin', async () => {
      const toggleMenuCollapsed = vi.fn();
      const { CHROME_SET_MENU_COLLAPSED } = await import('./chrome-actions');

      const handlers = await chromeHandlersFor({ toggleMenuCollapsed });
      await handlerFor(handlers, CHROME_SET_MENU_COLLAPSED).handleAction(
        CHROME_SET_MENU_COLLAPSED,
        { collapsed: true },
      );

      expect(toggleMenuCollapsed).toHaveBeenCalledWith({ collapsed: true });
    });

    it.each([
      ['set_theme', 'CHROME_SET_THEME', { themeId: 'dark' }],
      ['set_menu_collapsed', 'CHROME_SET_MENU_COLLAPSED', { collapsed: true }],
    ] as const)(
      'resolves %s on a host that runs no plugin for it, leaving the chain to continue',
      async (_name, constantName, payload) => {
        const chromeActions = await import('./chrome-actions');
        const actionTypeId = chromeActions[constantName];

        // An empty `actions` surface is the shell that opted into neither the
        // themes nor the layout plugin — the only case these handlers still
        // guard against.
        const handlers = await chromeHandlersFor({});

        await expect(
          handlerFor(handlers, actionTypeId).handleAction(actionTypeId, payload),
        ).resolves.toBeUndefined();
      },
    );

    it('refuses a set_theme payload carrying no theme id rather than driving the plugin with it', async () => {
      const changeTheme = vi.fn();
      const { CHROME_SET_THEME } = await import('./chrome-actions');

      const handlers = await chromeHandlersFor({ changeTheme });

      // The action schema marks `themeId` required, so the mediator refuses
      // this action before any handler sees it; reaching the throw means schema
      // and handler have drifted apart.
      expect(() =>
        handlerFor(handlers, CHROME_SET_THEME).handleAction(CHROME_SET_THEME, {}),
      ).toThrow(/no string themeId/);
      expect(changeTheme).not.toHaveBeenCalled();
    });
  });
});
