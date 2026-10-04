/**
 * Tests for microfrontends plugin - Phase 13
 *
 * Tests Flux integration: actions, effects, slice, components, navigation.
 * Phase 7.9 tests (plugin propagation, JSON loading) are in microfrontends.test.ts.
 *
 * @packageDocumentation
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  type Extension,
  type MfeRegistry,
} from '@gears-frontx/mfes';
import type { FrontXApp } from '../../../src/types';

// One app per runtime: every test loads its own module copy.
let createFrontX: typeof import('../../../src/createFrontX')['createFrontX'];
let effects: typeof import('../../../src/plugins/effects')['effects'];
let microfrontends: typeof import('../../../src/plugins/microfrontends')['microfrontends'];
let loadExtension: typeof import('../../../src/plugins/microfrontends')['loadExtension'];
let mountExtension: typeof import('../../../src/plugins/microfrontends')['mountExtension'];
let unmountExtension: typeof import('../../../src/plugins/microfrontends')['unmountExtension'];
let MfeEvents: typeof import('../../../src/plugins/microfrontends')['MfeEvents'];
let selectExtensionState: typeof import('../../../src/plugins/microfrontends')['selectExtensionState'];
let selectExtensionError: typeof import('../../../src/plugins/microfrontends')['selectExtensionError'];
let eventBus: typeof import('@gears-frontx/state')['eventBus'];
let resetStore: typeof import('@gears-frontx/state')['resetStore'];
let FRONTX_ACTION_UNMOUNT_EXT: typeof import('@gears-frontx/gts-plugin')['FRONTX_ACTION_UNMOUNT_EXT'];
let gtsPlugin: typeof import('@gears-frontx/gts-plugin')['gtsPlugin'];

beforeEach(async () => {
  vi.resetModules();
  ({ createFrontX } = await import('../../../src/createFrontX'));
  ({ effects } = await import('../../../src/plugins/effects'));
  ({ microfrontends, loadExtension, mountExtension, unmountExtension, MfeEvents, selectExtensionState, selectExtensionError } = await import('../../../src/plugins/microfrontends'));
  ({ eventBus, resetStore } = await import('@gears-frontx/state'));
  ({ FRONTX_ACTION_UNMOUNT_EXT } = await import('@gears-frontx/gts-plugin'));
  ({ gtsPlugin } = await import('@gears-frontx/gts-plugin'));
});

describe('microfrontends plugin - Phase 13', () => {
  let apps: FrontXApp[] = [];

  afterEach(() => {
    apps.forEach((app) => {
      app.destroy();
    });
    apps = [];
    vi.restoreAllMocks();
    eventBus.clearAll();
    resetStore();
  });
  describe('13.8.1 - plugin registration', () => {
    it('should register plugin with Flux wiring', () => {
      const plugin = microfrontends({ typeSystem: gtsPlugin });

      expect(plugin.name).toBe('microfrontends');
      expect(plugin.provides).toBeDefined();
      expect(plugin.provides?.registries).toBeDefined();
      expect(plugin.provides?.slices).toBeDefined();
      expect(plugin.provides?.slices?.length).toBeGreaterThan(0);
      // NOTE: Effects are NOT in provides.effects - they are initialized in onInit
      // to avoid duplicate event listeners (framework calls provides.effects at step 5,
      // then onInit at step 7). We need cleanup references, so only init in onInit.
      expect(plugin.provides?.actions).toBeDefined();
    });

    it('should provide MFE actions', () => {
      const plugin = microfrontends({ typeSystem: gtsPlugin });

      expect(plugin.provides?.actions).toHaveProperty('loadExtension');
      expect(plugin.provides?.actions).toHaveProperty('mountExtension');
      expect(plugin.provides?.actions).toHaveProperty('unmountExtension');
      expect(plugin.provides?.actions).not.toHaveProperty('handleMfeHostAction');
    });

    it('should make MFE actions available on app.actions', () => {
      const app = createFrontX()
        .use(effects())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      expect(typeof app.actions.loadExtension).toBe('function');
      expect(typeof app.actions.mountExtension).toBe('function');
      expect(typeof app.actions.unmountExtension).toBe('function');
      expect(app.actions).not.toHaveProperty('handleMfeHostAction');
    });
  });

  describe('13.8.2 - MFE lifecycle actions call executeActionsChain', () => {
    it('should call executeActionsChain for loadExtension', async () => {
      const app = createFrontX()
        .use(effects())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      const testDomainId = 'gts.frontx.mfes.ext.domain.v1~test.app.test.domain.v1';
      const testExtensionId = 'gts.frontx.mfes.ext.extension.v1~test.app.test.ext.v1';
      const testExtension: Extension = {
        id: testExtensionId,
        domain: testDomainId,
        entry: 'gts.frontx.mfes.mfe.entry.v1~test.app.test.entry.v1',
      };

      const registry = app.mfeRegistry;
      if (!registry) throw new Error('expected mfeRegistry');
      vi.spyOn(registry, 'getExtension').mockReturnValue(testExtension);
      const spy = vi.spyOn(registry, 'executeActionsChain').mockResolvedValue(undefined);

      // loadExtension fires executeActionsChain fire-and-forget. Use vi.waitFor
      // so we deterministically observe the call even if the action scheduling
      // changes to a microtask boundary.
      loadExtension(testExtensionId);

      await vi.waitFor(() => {
        expect(spy).toHaveBeenCalledWith({
          action: {
            type: 'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.load_ext.v1~',
            target: testDomainId,
            payload: { subject: testExtensionId },
          },
        });
      });
    });

    it('should throw when unmountExtension resolves a domain that is not registered on the registry', () => {
      const app = createFrontX()
        .use(effects())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      const testDomainId = 'gts.frontx.mfes.ext.domain.v1~test.app.test.domain.v1';
      const testExtensionId = 'gts.frontx.mfes.ext.extension.v1~test.app.test.ext.v1';
      const testExtension: Extension = {
        id: testExtensionId,
        domain: testDomainId,
        entry: 'gts.frontx.mfes.mfe.entry.v1~test.app.test.entry.v1',
      };

      const registry = app.mfeRegistry;
      if (!registry) throw new Error('expected mfeRegistry');
      vi.spyOn(registry, 'getExtension').mockReturnValue(testExtension);
      vi.spyOn(registry, 'getDomain').mockReturnValue(undefined);
      const chainSpy = vi.spyOn(registry, 'executeActionsChain').mockResolvedValue(undefined);

      expect(() => {
        unmountExtension(testExtensionId);
      }).toThrow(
        /domain 'gts\.frontx\.mfes\.ext\.domain\.v1~test\.app\.test\.domain\.v1' is not registered.*extension 'gts\.frontx\.mfes\.ext\.extension\.v1~test\.app\.test\.ext\.v1'/
      );
      expect(chainSpy).not.toHaveBeenCalled();
    });

    it('should verify registration events still work', () => {
      const eventSpy = vi.fn();
      const unsub = eventBus.on(MfeEvents.RegisterExtensionRequested, eventSpy);

      const testExtension: Extension = {
        id: 'gts.frontx.mfes.ext.extension.v1~test.ext.v1',
        domain: 'gts.frontx.mfes.ext.domain.v1~test.domain.v1',
        entry: 'gts.frontx.mfes.mfe.entry.v1~test.entry.v1',
      };

      // Use event bus directly (not the action, which is async)
      eventBus.emit(MfeEvents.RegisterExtensionRequested, { extension: testExtension });

      expect(eventSpy).toHaveBeenCalledWith({ extension: testExtension });

      unsub.unsubscribe();
    });
  });

  describe('13.8.2b - lifecycle actions survive a non-promise executeActionsChain', () => {
    // After #648, executeActionsChain may throw synchronously, return
    // undefined, or return a rejecting promise, instead of always returning a
    // promise. loadExtension/mountExtension/unmountExtension called
    // `.catch()` unconditionally on the result, which throws into the caller
    // for the first two cases. Mirrors the guard added to useHostAction.
    function buildApp(): FrontXApp {
      const app = createFrontX()
        .use(effects())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);
      return app;
    }

    it('loadExtension does not throw when executeActionsChain returns undefined', () => {
      const app = buildApp();
      const testDomainId = 'gts.frontx.mfes.ext.domain.v1~test.app.test.domain.v1';
      const testExtensionId = 'gts.frontx.mfes.ext.extension.v1~test.app.test.ext.v1';
      const testExtension: Extension = {
        id: testExtensionId,
        domain: testDomainId,
        entry: 'gts.frontx.mfes.mfe.entry.v1~test.app.test.entry.v1',
      };

      const registry = app.mfeRegistry;
      if (!registry) throw new Error('expected mfeRegistry');
      vi.spyOn(registry, 'getExtension').mockReturnValue(testExtension);
      vi.spyOn(registry, 'executeActionsChain').mockImplementation(() => undefined as unknown as Promise<void>);
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        loadExtension(testExtensionId);
      }).not.toThrow();
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('loadExtension logs through console.error when executeActionsChain throws synchronously', () => {
      const app = buildApp();
      const testDomainId = 'gts.frontx.mfes.ext.domain.v1~test.app.test.domain.v1';
      const testExtensionId = 'gts.frontx.mfes.ext.extension.v1~test.app.test.ext.v1';
      const testExtension: Extension = {
        id: testExtensionId,
        domain: testDomainId,
        entry: 'gts.frontx.mfes.mfe.entry.v1~test.app.test.entry.v1',
      };
      const syncError = new Error('sync failure from executeActionsChain');

      const registry = app.mfeRegistry;
      if (!registry) throw new Error('expected mfeRegistry');
      vi.spyOn(registry, 'getExtension').mockReturnValue(testExtension);
      vi.spyOn(registry, 'executeActionsChain').mockImplementation(() => {
        throw syncError;
      });
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        loadExtension(testExtensionId);
      }).not.toThrow();
      expect(errorSpy).toHaveBeenCalledWith(
        `[MFE] Load failed for ${testExtensionId}:`,
        syncError
      );
    });

    it('mountExtension does not throw when executeActionsChain returns undefined', () => {
      const app = buildApp();
      const testDomainId = 'gts.frontx.mfes.ext.domain.v1~test.app.test.domain.v1';
      const testExtensionId = 'gts.frontx.mfes.ext.extension.v1~test.app.test.ext.v1';
      const testExtension: Extension = {
        id: testExtensionId,
        domain: testDomainId,
        entry: 'gts.frontx.mfes.mfe.entry.v1~test.app.test.entry.v1',
      };

      const registry = app.mfeRegistry;
      if (!registry) throw new Error('expected mfeRegistry');
      vi.spyOn(registry, 'getExtension').mockReturnValue(testExtension);
      vi.spyOn(registry, 'executeActionsChain').mockImplementation(() => undefined as unknown as Promise<void>);
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        mountExtension(testExtensionId);
      }).not.toThrow();
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('mountExtension logs through console.error when executeActionsChain throws synchronously', () => {
      const app = buildApp();
      const testDomainId = 'gts.frontx.mfes.ext.domain.v1~test.app.test.domain.v1';
      const testExtensionId = 'gts.frontx.mfes.ext.extension.v1~test.app.test.ext.v1';
      const testExtension: Extension = {
        id: testExtensionId,
        domain: testDomainId,
        entry: 'gts.frontx.mfes.mfe.entry.v1~test.app.test.entry.v1',
      };
      const syncError = new Error('sync failure from executeActionsChain');

      const registry = app.mfeRegistry;
      if (!registry) throw new Error('expected mfeRegistry');
      vi.spyOn(registry, 'getExtension').mockReturnValue(testExtension);
      vi.spyOn(registry, 'executeActionsChain').mockImplementation(() => {
        throw syncError;
      });
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        mountExtension(testExtensionId);
      }).not.toThrow();
      expect(errorSpy).toHaveBeenCalledWith(
        `[MFE] Mount failed for ${testExtensionId}:`,
        syncError
      );
    });

    it('unmountExtension does not throw when executeActionsChain returns undefined', () => {
      const app = buildApp();
      const testDomainId = 'gts.frontx.mfes.ext.domain.v1~test.app.test.domain.v1';
      const testExtensionId = 'gts.frontx.mfes.ext.extension.v1~test.app.test.ext.v1';
      const testExtension: Extension = {
        id: testExtensionId,
        domain: testDomainId,
        entry: 'gts.frontx.mfes.mfe.entry.v1~test.app.test.entry.v1',
      };

      const registry = app.mfeRegistry;
      if (!registry) throw new Error('expected mfeRegistry');
      vi.spyOn(registry, 'getExtension').mockReturnValue(testExtension);
      vi.spyOn(registry, 'getDomain').mockReturnValue({
        id: testDomainId,
        actions: [FRONTX_ACTION_UNMOUNT_EXT],
      } as ReturnType<MfeRegistry['getDomain']>);
      vi.spyOn(registry, 'executeActionsChain').mockImplementation(() => undefined as unknown as Promise<void>);
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        unmountExtension(testExtensionId);
      }).not.toThrow();
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('unmountExtension logs through console.error when executeActionsChain throws synchronously', () => {
      const app = buildApp();
      const testDomainId = 'gts.frontx.mfes.ext.domain.v1~test.app.test.domain.v1';
      const testExtensionId = 'gts.frontx.mfes.ext.extension.v1~test.app.test.ext.v1';
      const testExtension: Extension = {
        id: testExtensionId,
        domain: testDomainId,
        entry: 'gts.frontx.mfes.mfe.entry.v1~test.app.test.entry.v1',
      };
      const syncError = new Error('sync failure from executeActionsChain');

      const registry = app.mfeRegistry;
      if (!registry) throw new Error('expected mfeRegistry');
      vi.spyOn(registry, 'getExtension').mockReturnValue(testExtension);
      vi.spyOn(registry, 'getDomain').mockReturnValue({
        id: testDomainId,
        actions: [FRONTX_ACTION_UNMOUNT_EXT],
      } as ReturnType<MfeRegistry['getDomain']>);
      vi.spyOn(registry, 'executeActionsChain').mockImplementation(() => {
        throw syncError;
      });
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        unmountExtension(testExtensionId);
      }).not.toThrow();
      expect(errorSpy).toHaveBeenCalledWith(
        `[MFE] Unmount failed for ${testExtensionId}:`,
        syncError
      );
    });
  });

  describe('13.8.3 - MFE slice (registration only)', () => {
    it('should initialize MFE slice in store', () => {
      const app = createFrontX()
        .use(effects())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      const state = app.store.getState();
      expect(state).toHaveProperty('mfe');
      expect(state.mfe).toHaveProperty('registrationStates');
      expect(state.mfe).toHaveProperty('errors');
    });

    it('should track registration state via selectors', () => {
      const app = createFrontX()
        .use(effects())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      const state = app.store.getState();

      // Initial state should be 'unregistered' for extensions not registered yet
      const uniqueExtId = 'test.unique.extension.v1';
      const registrationState = selectExtensionState(state, uniqueExtId);
      expect(registrationState).toBe('unregistered');

      const error = selectExtensionError(state, uniqueExtId);
      expect(error).toBeUndefined();
    });
  });

  describe('13.8.8 - plugin lifecycle wiring', () => {
    it('initializes MFE effects on init so bus events invoke the registry', async () => {
      const app = createFrontX()
        .use(effects())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      const registry = app.mfeRegistry;
      if (!registry) throw new Error('expected mfeRegistry');
      const registerSpy = vi
        .spyOn(registry, 'registerExtension')
        .mockResolvedValue(undefined);

      const extension: Extension = {
        id: 'gts.frontx.mfes.ext.extension.v1~test.app.init.ext.v1',
        domain: 'gts.frontx.mfes.ext.domain.v1~test.app.init.domain.v1',
        entry: 'gts.frontx.mfes.mfe.entry.v1~test.app.init.entry.v1',
      };
      eventBus.emit(MfeEvents.RegisterExtensionRequested, { extension });

      await vi.waitFor(() => {
        expect(registerSpy).toHaveBeenCalledWith(extension);
      });
    });

    it('tears down MFE effects on destroy so the bus no longer drives the registry', async () => {
      // Fresh app so we control its destroy ordering independently of afterEach.
      const app = createFrontX()
        .use(effects())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();

      const registry = app.mfeRegistry;
      if (!registry) throw new Error('expected mfeRegistry');
      const registerSpy = vi
        .spyOn(registry, 'registerExtension')
        .mockResolvedValue(undefined);

      app.destroy();

      eventBus.emit(MfeEvents.RegisterExtensionRequested, {
        extension: {
          id: 'gts.frontx.mfes.ext.extension.v1~test.app.post-destroy.ext.v1',
          domain: 'gts.frontx.mfes.ext.domain.v1~test.app.post-destroy.domain.v1',
          entry: 'gts.frontx.mfes.mfe.entry.v1~test.app.post-destroy.entry.v1',
        },
      });

      // Give any potential lingering microtask a chance to run.
      await Promise.resolve();
      await Promise.resolve();

      expect(registerSpy).not.toHaveBeenCalled();
    });
  });
});
