/**
 * Tests for microfrontends plugin - Phase 7.9
 *
 * Tests plugin propagation and type-system wiring ONLY.
 * Flux integration tests (actions, effects, slice) are in Phase 13.8.
 *
 * See also: packages/framework/__tests__/plugins/microfrontends/plugin.test.ts
 * for Flux-integration coverage. The two suites are intentionally
 * separated: this one exercises registry wiring and schema availability;
 * the other exercises slice/effects/actions.
 *
 * The plugin is type-system agnostic, so it runs against the test-local
 * `TypeSystemPlugin` stand-in with neutral domain declarations.
 *
 * @packageDocumentation
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ContainerHooks,
  DomainContext,
  ExtensionDomain,
  TypeSystemPlugin,
} from '@gears-frontx/mfes';
import type { MfeRegistry } from '@gears-frontx/framework/mfe';
import type { FrontXApp } from '../../src/types';
import {
  createFakeTypeSystem,
  FAKE_LOAD_EXT,
  FAKE_MOUNT_EXT,
  FAKE_UNMOUNT_EXT,
} from '../fakeTypeSystem';

// One app per runtime: every test loads its own module copy.
// Strategy classes come from the same module copy as the app under test (every test loads its own).
let ExclusiveMountStrategy: typeof import('@gears-frontx/mfes').ExclusiveMountStrategy;
let OptionalMountStrategy: typeof import('@gears-frontx/mfes').OptionalMountStrategy;
let eventBus: typeof import('@gears-frontx/state').eventBus;
let resetStore: typeof import('@gears-frontx/state').resetStore;
let createFrontX: typeof import('../../src/createFrontX').createFrontX;
let microfrontends: typeof import('../../src/plugins/microfrontends').microfrontends;
let TestContainerProvider: typeof import('../../src/testing/TestContainerProvider').TestContainerProvider;
let resetSharedQueryClient: typeof import('../../src/testing').resetSharedQueryClient;

/** A schema the host registers into its type system before building the app. */
const HOST_SCHEMA_ID = 'test.schema~test.app.host.v1';
const HOST_SCHEMA = { $id: HOST_SCHEMA_ID, type: 'object' };

/** A neutral domain declaration offering the given lifecycle actions. */
function testDomain(name: string, actions: string[]): ExtensionDomain {
  return {
    id: `test.domain~test.app.${name}.v1`,
    sharedProperties: [],
    actions,
    extensionsActions: [],
    defaultActionTimeout: 5_000,
    lifecycleStages: [],
    extensionsLifecycleStages: [],
  };
}

// An Exclusive domain offers load_ext and mount_ext; an Optional one also offers unmount_ext.
const sidebarDomain = testDomain('sidebar', [FAKE_LOAD_EXT, FAKE_MOUNT_EXT, FAKE_UNMOUNT_EXT]);
const popupDomain = testDomain('popup', [FAKE_LOAD_EXT, FAKE_MOUNT_EXT, FAKE_UNMOUNT_EXT]);
const screenDomain = testDomain('screen', [FAKE_LOAD_EXT, FAKE_MOUNT_EXT]);
const overlayDomain = testDomain('overlay', [FAKE_LOAD_EXT, FAKE_MOUNT_EXT, FAKE_UNMOUNT_EXT]);

const exclusive = () => (ctx: DomainContext, hooks: ContainerHooks) =>
  new ExclusiveMountStrategy(ctx.mounter, hooks);
const optional = () => (ctx: DomainContext, hooks: ContainerHooks) =>
  new OptionalMountStrategy(ctx.mounter, hooks);

function getAppMfeRegistry(app: FrontXApp): MfeRegistry {
  const registry = app.mfeRegistry;
  if (!registry) {
    throw new Error('expected mfeRegistry on app');
  }
  return registry;
}

describe('microfrontends plugin - Phase 7.9', () => {
  let apps: FrontXApp[] = [];
  let typeSystem: TypeSystemPlugin;

  beforeEach(async () => {
    vi.resetModules();
    ({ eventBus, resetStore } = await import('@gears-frontx/state'));
    ({ ExclusiveMountStrategy, OptionalMountStrategy } = await import('@gears-frontx/mfes'));
    ({ createFrontX } = await import('../../src/createFrontX'));
    ({ microfrontends } = await import('../../src/plugins/microfrontends'));
    ({ TestContainerProvider } = await import('../../src/testing/TestContainerProvider'));
    ({ resetSharedQueryClient } = await import('../../src/testing'));
    typeSystem = createFakeTypeSystem();
    typeSystem.registerSchema(HOST_SCHEMA);
  });

  afterEach(() => {
    apps.forEach((app) => {
      app.destroy();
    });
    apps = [];
    vi.restoreAllMocks();
    eventBus.clearAll();
    resetStore();
    resetSharedQueryClient();
  });

  function buildApp(): FrontXApp {
    const app = createFrontX()
      .use(microfrontends({ typeSystem }))
      .build();
    apps.push(app);
    return app;
  }

  describe('plugin factory', () => {
    it('accepts required typeSystem parameter and returns a valid plugin object', () => {
      const plugin = microfrontends({ typeSystem });

      expect(plugin).toHaveProperty('name', 'microfrontends');
      expect(plugin).toHaveProperty('dependencies');
      expect(plugin).toHaveProperty('onInit');
      expect(plugin).toHaveProperty('provides');
      expect(plugin.provides).toHaveProperty('registries');
    });

    it('accepts optional mfeHandlers config', () => {
      const plugin = microfrontends({ typeSystem, mfeHandlers: [] });

      expect(plugin.name).toBe('microfrontends');
    });
  });

  describe('7.9.1 - plugin obtains mfeRegistry from framework', () => {
    it('provides mfeRegistry via provides.registries', () => {
      const plugin = microfrontends({ typeSystem });

      expect(plugin.provides).toBeDefined();
      expect(plugin.provides?.registries).toBeDefined();
      expect(plugin.provides?.registries?.mfeRegistry).toBeDefined();
    });

    it('makes mfeRegistry available on the app object', () => {
      const app = buildApp();

      expect(app.mfeRegistry).toBeDefined();
      expect(typeof app.mfeRegistry).toBe('object');
    });

    it('exposes mfeRegistry with MFE methods', () => {
      const app = buildApp();
      const registry = getAppMfeRegistry(app);

      expect(typeof registry.registerDomain).toBe('function');
      expect(typeof registry.typeSystem).toBe('object');
      expect(registry.typeSystem.name).toBe('fake');
    });
  });

  describe('7.9.2 - same TypeSystemPlugin instance is propagated through layers', () => {
    it('uses the same TypeSystemPlugin instance throughout', () => {
      const app = buildApp();
      const registry = getAppMfeRegistry(app);

      expect(registry.typeSystem).toBe(typeSystem);
      expect(registry.typeSystem.version).toBe('0.0.0');

      expect(typeof registry.typeSystem.registerSchema).toBe('function');
      expect(typeof registry.typeSystem.getSchema).toBe('function');
      expect(typeof registry.typeSystem.register).toBe('function');
      expect(typeof registry.typeSystem.isTypeOf).toBe('function');
    });

    it('has a consistent plugin reference across multiple calls', () => {
      const app = buildApp();
      const registry = getAppMfeRegistry(app);

      expect(registry.typeSystem).toBe(registry.typeSystem);
    });
  });

  describe('7.9.3 - runtime.registerDomain() works for domains at runtime', () => {
    it('registers an Optional sidebar domain and exposes it via getDomain', () => {
      const app = buildApp();
      const registry = getAppMfeRegistry(app);
      const provider = new TestContainerProvider();

      registry.registerDomain(sidebarDomain, provider.prepareForDomain(sidebarDomain, optional()));

      expect(registry.getDomain(sidebarDomain.id)).toBeDefined();
      expect(registry.getDomain(sidebarDomain.id)?.id).toBe(sidebarDomain.id);
    });

    it('registers an Optional popup domain and exposes it via getDomain', () => {
      const app = buildApp();
      const registry = getAppMfeRegistry(app);
      const provider = new TestContainerProvider();

      registry.registerDomain(popupDomain, provider.prepareForDomain(popupDomain, optional()));

      expect(registry.getDomain(popupDomain.id)).toBeDefined();
    });

    it('registers an Exclusive screen domain and exposes it via getDomain', () => {
      const app = buildApp();
      const registry = getAppMfeRegistry(app);
      const provider = new TestContainerProvider();

      registry.registerDomain(screenDomain, provider.prepareForDomain(screenDomain, exclusive()));

      expect(registry.getDomain(screenDomain.id)).toBeDefined();
    });

    it('registers an Optional overlay domain and exposes it via getDomain', () => {
      const app = buildApp();
      const registry = getAppMfeRegistry(app);
      const provider = new TestContainerProvider();

      registry.registerDomain(overlayDomain, provider.prepareForDomain(overlayDomain, optional()));

      expect(registry.getDomain(overlayDomain.id)).toBeDefined();
    });

    it('returns undefined for unregistered domains', () => {
      const app = buildApp();
      const registry = getAppMfeRegistry(app);

      expect(registry.getDomain('test.domain~test.app.unknown.v1')).toBeUndefined();
    });
  });

  describe('7.9.4 - schemas are served by the provided type system', () => {
    it('answers a schema the host registered before the app was built', () => {
      const app = buildApp();
      const registry = getAppMfeRegistry(app);

      const schema = registry.typeSystem.getSchema(HOST_SCHEMA_ID);
      expect(schema).toBe(HOST_SCHEMA);
      expect(schema).toHaveProperty('$id', HOST_SCHEMA_ID);
    });

    it('answers a schema registered through the registry after the app was built', () => {
      const app = buildApp();
      const registry = getAppMfeRegistry(app);
      const lateSchema = { $id: 'test.schema~test.app.late.v1', type: 'object' };

      registry.typeSystem.registerSchema(lateSchema);

      expect(typeSystem.getSchema('test.schema~test.app.late.v1')).toBe(lateSchema);
    });

    it('returns undefined for non-existent schemas', () => {
      const app = buildApp();
      const registry = getAppMfeRegistry(app);

      expect(registry.typeSystem.getSchema('test.schema~test.app.nonexistent.v1')).toBeUndefined();
    });
  });
});
