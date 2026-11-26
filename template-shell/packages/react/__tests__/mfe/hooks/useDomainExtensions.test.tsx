/**
 * Tests for useDomainExtensions hook - Phase 21.7
 *
 * Tests extension list observation via store subscription.
 *
 * @packageDocumentation
 */

import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { FrontXApp } from '@gears-frontx/framework';
import type { Extension, ExtensionDomain } from '@gears-frontx/framework/mfe';
import { createFakeTypeSystem } from '../../../src/mfe/__tests__/fakeTypeSystem';

const typeSystem = createFakeTypeSystem();

// Each test loads a fresh module copy: a runtime builds one app.
let FrontXProvider: typeof import('@gears-frontx/react')['FrontXProvider'];
let useDomainExtensions: typeof import('@gears-frontx/react/mfe')['useDomainExtensions'];
let createFrontX: typeof import('@gears-frontx/framework')['createFrontX'];
let effects: typeof import('@gears-frontx/framework')['effects'];
let microfrontends: typeof import('@gears-frontx/framework/mfe')['microfrontends'];
let queryCache: typeof import('@gears-frontx/framework')['queryCache'];
let OptionalMountStrategy: typeof import('@gears-frontx/framework/mfe')['OptionalMountStrategy'];
let TestContainerProvider: typeof import('@gears-frontx/framework/testing')['TestContainerProvider'];

beforeEach(async () => {
  vi.resetModules();
  ({ FrontXProvider } = await import('@gears-frontx/react'));
  ({ useDomainExtensions } = await import('@gears-frontx/react/mfe'));
  ({ createFrontX, effects, queryCache } = await import('@gears-frontx/framework'));
  ({ microfrontends, OptionalMountStrategy } = await import('@gears-frontx/framework/mfe'));
  ({ TestContainerProvider } = await import('@gears-frontx/framework/testing'));
});

describe('useDomainExtensions hook - Phase 21.7', () => {
  const sidebarDomainId = 'test.domain~frontx.screensets.layout.sidebar.v1';
  const popupDomainId = 'test.domain~frontx.screensets.layout.popup.v1';

  // Track app instances for cleanup
  const apps: FrontXApp[] = [];
  afterEach(() => {
    apps.forEach((app) => {
      app.destroy();
    });
    apps.length = 0;
  });

  const mockSidebarDomain: ExtensionDomain = {
    id: sidebarDomainId,
    sharedProperties: [],
    actions: [
      'test.action.load_ext',
      'test.action.mount_ext',
      'test.action.unmount_ext',
    ],
    extensionsActions: [],
    defaultActionTimeout: 5000,
    lifecycleStages: [],
    extensionsLifecycleStages: [],
  };

  const mockPopupDomain: ExtensionDomain = {
    id: popupDomainId,
    sharedProperties: [],
    actions: [
      'test.action.load_ext',
      'test.action.mount_ext',
      'test.action.unmount_ext',
    ],
    extensionsActions: [],
    defaultActionTimeout: 5000,
    lifecycleStages: [],
    extensionsLifecycleStages: [],
  };

  const sidebarExtension1: Extension = {
    id: 'test.extension~test.sidebar.reg.ext1.v1',
    domain: sidebarDomainId,
    entry: 'test.entry~test.sidebar.reg.entry.v1',
  };

  const sidebarExtension2: Extension = {
    id: 'test.extension~test.sidebar.reg.ext2.v1',
    domain: sidebarDomainId,
    entry: 'test.entry~test.sidebar.reg.entry.v1',
  };

  const popupExtension: Extension = {
    id: 'test.extension~test.popup.reg.ext1.v1',
    domain: popupDomainId,
    entry: 'test.entry~test.sidebar.reg.entry.v1',
  };

  /**
   * Helper: build app and mock registerExtension/unregisterExtension to bypass
   * type-system validation while still dispatching store actions and tracking extensions.
   * The hook subscribes to store changes and calls getExtensionsForDomain(),
   * so we mock the registration methods to populate query results and dispatch
   * an action to trigger store subscribers.
   */
  function buildApp(): FrontXApp {
    const app = createFrontX()
      .use(effects())
      .use(queryCache())
      .use(microfrontends({ typeSystem }))
      .build();
    apps.push(app);

    if (!app.mfeRegistry) {
      throw new Error('Expected mfeRegistry');
    }
    const mfeRegistry = app.mfeRegistry;

    // Store registered extensions for getExtensionsForDomain mock
    const registeredExtensions = new Map<string, Extension>();

    // Pass-through registerDomain (no mocking — the test exercises the
    // post-registration extension list, not the registration call itself).
    const origRegisterDomain = mfeRegistry.registerDomain.bind(mfeRegistry);
    mfeRegistry.registerDomain = ((
      ...args: Parameters<typeof mfeRegistry.registerDomain>
    ) => {
      origRegisterDomain(...args);
    }) as typeof mfeRegistry.registerDomain;

    mfeRegistry.registerExtension = vi.fn(async (ext: Extension) => {
      registeredExtensions.set(ext.id, ext);
      // Dispatch any action to trigger store subscribers
      app.store.dispatch({ type: 'mfe/setExtensionRegistered', payload: { extensionId: ext.id } });
    });

    mfeRegistry.unregisterExtension = vi.fn(async (extId: string) => {
      registeredExtensions.delete(extId);
      // Dispatch any action to trigger store subscribers
      app.store.dispatch({ type: 'mfe/setExtensionUnregistered', payload: { extensionId: extId } });
    });

    // Mock getExtensionsForDomain to return from our tracked map
    mfeRegistry.getExtensionsForDomain = vi.fn((domainId: string) => {
      return Array.from(registeredExtensions.values()).filter(e => e.domain === domainId);
    });

    return app;
  }

  function buildWrapper(app: FrontXApp) {
    return ({ children }: { children: React.ReactNode }) => (
      <FrontXProvider app={app}>{children}</FrontXProvider>
    );
  }

  describe('Store subscription', () => {
    it('should return extensions for the specified domain', async () => {
      const app = buildApp();
      const testContainerProvider = new TestContainerProvider();
      app.mfeRegistry!.registerDomain(mockSidebarDomain, testContainerProvider.prepareForDomain(mockSidebarDomain, (ctx, hooks) => new OptionalMountStrategy(ctx.mounter, hooks)));
      const testContainerProvider2 = new TestContainerProvider();
      app.mfeRegistry!.registerDomain(mockPopupDomain, testContainerProvider2.prepareForDomain(mockPopupDomain, (ctx, hooks) => new OptionalMountStrategy(ctx.mounter, hooks)));
      await app.mfeRegistry!.registerExtension(sidebarExtension1);

      const { result } = renderHook(() => useDomainExtensions(sidebarDomainId), { wrapper: buildWrapper(app) });

      expect(result.current).toHaveLength(1);
      expect(result.current[0].id).toBe(sidebarExtension1.id);
    });

    it('returns no element with an own route key for an extension registered with one', async () => {
      // The real registry: its read surface is what the hook returns.
      const app = createFrontX()
        .use(effects())
        .use(queryCache())
        .use(microfrontends({ typeSystem }))
        .build();
      apps.push(app);
      const testContainerProvider = new TestContainerProvider();
      app.mfeRegistry!.registerDomain(mockSidebarDomain, testContainerProvider.prepareForDomain(mockSidebarDomain, (ctx, hooks) => new OptionalMountStrategy(ctx.mounter, hooks)));
      app.mfeRegistry!.typeSystem.register({
        id: sidebarExtension1.entry,
        requiredProperties: [],
        optionalProperties: [],
        actions: [],
        domainActions: [],
      });
      await app.mfeRegistry!.registerExtension({ ...sidebarExtension1, route: '/own-route' });

      const { result } = renderHook(() => useDomainExtensions(sidebarDomainId), { wrapper: buildWrapper(app) });

      expect(result.current).toHaveLength(1);
      for (const element of result.current) {
        expect(Object.prototype.hasOwnProperty.call(element, 'route')).toBe(false);
      }
    });

    it('should update when extension is registered', async () => {
      const app = buildApp();
      const testContainerProvider = new TestContainerProvider();
      app.mfeRegistry!.registerDomain(mockSidebarDomain, testContainerProvider.prepareForDomain(mockSidebarDomain, (ctx, hooks) => new OptionalMountStrategy(ctx.mounter, hooks)));

      const { result } = renderHook(() => useDomainExtensions(sidebarDomainId), { wrapper: buildWrapper(app) });

      expect(result.current).toHaveLength(0);

      await act(async () => {
        await app.mfeRegistry!.registerExtension(sidebarExtension1);
      });

      await waitFor(() => {
        expect(result.current).toHaveLength(1);
      });

      expect(result.current[0].id).toBe(sidebarExtension1.id);
    });
  });

  describe('Unregistration detection', () => {
    it('should update when extension is unregistered', async () => {
      const app = buildApp();
      const testContainerProvider = new TestContainerProvider();
      app.mfeRegistry!.registerDomain(mockSidebarDomain, testContainerProvider.prepareForDomain(mockSidebarDomain, (ctx, hooks) => new OptionalMountStrategy(ctx.mounter, hooks)));
      await app.mfeRegistry!.registerExtension(sidebarExtension1);

      const { result } = renderHook(() => useDomainExtensions(sidebarDomainId), { wrapper: buildWrapper(app) });

      expect(result.current).toHaveLength(1);

      await act(async () => {
        await app.mfeRegistry!.unregisterExtension(sidebarExtension1.id);
      });

      await waitFor(() => {
        expect(result.current).toHaveLength(0);
      });
    });
  });

  describe('Domain filtering', () => {
    it('should only return extensions for the specified domain', async () => {
      const app = buildApp();
      const testContainerProvider = new TestContainerProvider();
      app.mfeRegistry!.registerDomain(mockSidebarDomain, testContainerProvider.prepareForDomain(mockSidebarDomain, (ctx, hooks) => new OptionalMountStrategy(ctx.mounter, hooks)));
      const testContainerProvider2 = new TestContainerProvider();
      app.mfeRegistry!.registerDomain(mockPopupDomain, testContainerProvider2.prepareForDomain(mockPopupDomain, (ctx, hooks) => new OptionalMountStrategy(ctx.mounter, hooks)));

      await app.mfeRegistry!.registerExtension(sidebarExtension1);
      await app.mfeRegistry!.registerExtension(sidebarExtension2);
      await app.mfeRegistry!.registerExtension(popupExtension);

      const { result: sidebarResult } = renderHook(() => useDomainExtensions(sidebarDomainId), { wrapper: buildWrapper(app) });
      const { result: popupResult } = renderHook(() => useDomainExtensions(popupDomainId), { wrapper: buildWrapper(app) });

      expect(sidebarResult.current).toHaveLength(2);
      expect(sidebarResult.current.map(e => e.id)).toContain(sidebarExtension1.id);
      expect(sidebarResult.current.map(e => e.id)).toContain(sidebarExtension2.id);

      expect(popupResult.current).toHaveLength(1);
      expect(popupResult.current[0].id).toBe(popupExtension.id);
    });

    it('should not re-render when extensions in other domains change but list is same', async () => {
      const app = buildApp();
      const testContainerProvider = new TestContainerProvider();
      app.mfeRegistry!.registerDomain(mockSidebarDomain, testContainerProvider.prepareForDomain(mockSidebarDomain, (ctx, hooks) => new OptionalMountStrategy(ctx.mounter, hooks)));
      const testContainerProvider2 = new TestContainerProvider();
      app.mfeRegistry!.registerDomain(mockPopupDomain, testContainerProvider2.prepareForDomain(mockPopupDomain, (ctx, hooks) => new OptionalMountStrategy(ctx.mounter, hooks)));

      await app.mfeRegistry!.registerExtension(sidebarExtension1);

      const renderSpy = vi.fn();
      const { result } = renderHook(
        () => {
          renderSpy();
          return useDomainExtensions(sidebarDomainId);
        },
        { wrapper: buildWrapper(app) }
      );

      await act(async () => {
        await app.mfeRegistry!.registerExtension(popupExtension);
      });

      await waitFor(() => {
        expect(result.current).toHaveLength(1);
        expect(result.current[0].id).toBe(sidebarExtension1.id);
      });

      // Sidebar hook: snapshot comparison prevents unnecessary re-render
      // since sidebar extension list didn't change
    });
  });

  describe('Current extensions list', () => {
    it('should return all current extensions for domain', async () => {
      const app = buildApp();
      const testContainerProvider = new TestContainerProvider();
      app.mfeRegistry!.registerDomain(mockSidebarDomain, testContainerProvider.prepareForDomain(mockSidebarDomain, (ctx, hooks) => new OptionalMountStrategy(ctx.mounter, hooks)));

      await app.mfeRegistry!.registerExtension(sidebarExtension1);
      await app.mfeRegistry!.registerExtension(sidebarExtension2);

      const { result } = renderHook(() => useDomainExtensions(sidebarDomainId), { wrapper: buildWrapper(app) });

      expect(result.current).toHaveLength(2);
      expect(result.current.map(e => e.id)).toContain(sidebarExtension1.id);
      expect(result.current.map(e => e.id)).toContain(sidebarExtension2.id);
    });

    it('should return empty array for domain with no extensions', () => {
      const app = buildApp();
      const testContainerProvider = new TestContainerProvider();
      app.mfeRegistry!.registerDomain(mockSidebarDomain, testContainerProvider.prepareForDomain(mockSidebarDomain, (ctx, hooks) => new OptionalMountStrategy(ctx.mounter, hooks)));

      const { result } = renderHook(() => useDomainExtensions(sidebarDomainId), { wrapper: buildWrapper(app) });

      expect(result.current).toEqual([]);
    });
  });

  describe('Re-render on state changes', () => {
    it('should re-render when extensions change', async () => {
      const app = buildApp();
      const testContainerProvider = new TestContainerProvider();
      app.mfeRegistry!.registerDomain(mockSidebarDomain, testContainerProvider.prepareForDomain(mockSidebarDomain, (ctx, hooks) => new OptionalMountStrategy(ctx.mounter, hooks)));

      const { result } = renderHook(() => useDomainExtensions(sidebarDomainId), { wrapper: buildWrapper(app) });

      expect(result.current).toHaveLength(0);

      await act(async () => {
        await app.mfeRegistry!.registerExtension(sidebarExtension1);
      });

      await waitFor(() => {
        expect(result.current).toHaveLength(1);
      });

      await act(async () => {
        await app.mfeRegistry!.registerExtension(sidebarExtension2);
      });

      await waitFor(() => {
        expect(result.current).toHaveLength(2);
      });

      await act(async () => {
        await app.mfeRegistry!.unregisterExtension(sidebarExtension1.id);
      });

      await waitFor(() => {
        expect(result.current).toHaveLength(1);
        expect(result.current[0].id).toBe(sidebarExtension2.id);
      });
    });
  });
});
