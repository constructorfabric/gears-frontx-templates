/**
 * The microfrontends plugin injects the FrontX router into every registry it
 * builds, and does nothing else for routing: the router is the ready `router`
 * export of `@gears-frontx/routing`, passed to
 * `mfeRegistryFactory.build({ typeSystem, mfeHandlers, router })` and touched
 * in no other way. Everything the router does from then on is between the
 * registry and the router.
 *
 * The router export is replaced by a sentinel that records every operation
 * performed on it, so the only thing the plugin may do with it is pass it on.
 * `build` is replaced too, so no registry code ever sees the sentinel and every
 * recorded operation is the plugin's own.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MfeHandler, MfeRegistry, TypeSystemPlugin } from '@gears-frontx/mfes';
import type { FrontXApp } from '../../../src/types';

const { routerSentinel, routerOperations } = vi.hoisted(() => {
  const operations: string[] = [];
  const record = (trap: string, key?: PropertyKey): void => {
    operations.push(key === undefined ? trap : `${trap} ${String(key)}`);
  };
  const sentinel = new Proxy(
    {},
    {
      get: (_target, key) => {
        record('get', key);
        return undefined;
      },
      has: (_target, key) => {
        record('has', key);
        return false;
      },
      set: (_target, key) => {
        record('set', key);
        return true;
      },
      deleteProperty: (_target, key) => {
        record('deleteProperty', key);
        return true;
      },
      defineProperty: (_target, key) => {
        record('defineProperty', key);
        return true;
      },
      ownKeys: () => {
        record('ownKeys');
        return [];
      },
      getOwnPropertyDescriptor: (_target, key) => {
        record('getOwnPropertyDescriptor', key);
        return undefined;
      },
      getPrototypeOf: () => {
        record('getPrototypeOf');
        return null;
      },
      setPrototypeOf: () => {
        record('setPrototypeOf');
        return true;
      },
      isExtensible: () => {
        record('isExtensible');
        return true;
      },
      preventExtensions: () => {
        record('preventExtensions');
        return false;
      },
    },
  );
  return { routerSentinel: sentinel, routerOperations: operations };
});

vi.mock('@gears-frontx/routing', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  router: routerSentinel,
}));

let createFrontX: typeof import('../../../src/createFrontX').createFrontX;
let microfrontends: typeof import('../../../src/plugins/microfrontends').microfrontends;
let mfeRegistryFactory: typeof import('../../../src/mfe/registry').mfeRegistryFactory;
let eventBus: typeof import('@gears-frontx/state').eventBus;
let resetStore: typeof import('@gears-frontx/state').resetStore;
let typeSystem: TypeSystemPlugin;
let buildSpy: ReturnType<typeof vi.spyOn>;
let app: FrontXApp | undefined;

/** What `build` returns: a registry nothing under test reaches into beyond the plugin's own state pushes. */
function fakeRegistry(): MfeRegistry {
  return {
    setTheme: vi.fn(),
    updateSharedProperty: vi.fn(),
  } as unknown as MfeRegistry;
}

type BuildConfig = Record<string, unknown>;

function buildConfigs(): BuildConfig[] {
  return buildSpy.mock.calls.map((call: unknown[]) => call[0] as BuildConfig);
}

/** Identity, compared without handing the sentinel to a matcher that would inspect it. */
function isRoutingRouter(value: unknown): boolean {
  return value === routerSentinel;
}

beforeEach(async () => {
  vi.resetModules();
  ({ createFrontX } = await import('../../../src/createFrontX'));
  ({ microfrontends } = await import('../../../src/plugins/microfrontends'));
  ({ mfeRegistryFactory } = await import('../../../src/mfe/registry'));
  ({ eventBus, resetStore } = await import('@gears-frontx/state'));
  ({ gtsPlugin: typeSystem } = await import('@gears-frontx/gts-plugin'));
  buildSpy = vi.spyOn(mfeRegistryFactory, 'build').mockImplementation(() => fakeRegistry());
  routerOperations.length = 0;
});

afterEach(() => {
  app?.destroy();
  app = undefined;
  vi.restoreAllMocks();
  eventBus.clearAll();
  resetStore();
});

describe('microfrontends plugin — router injection', () => {
  it('builds the registry with exactly the type system, the handlers and the router of @gears-frontx/routing', () => {
    const mfeHandlers: MfeHandler[] = [];
    app = createFrontX().use(microfrontends({ typeSystem, mfeHandlers })).build();

    void app.mfeRegistry;

    const configs = buildConfigs();
    expect(configs).toHaveLength(1);
    const config = configs[0]!;
    expect(Object.keys(config).sort()).toEqual(['mfeHandlers', 'router', 'typeSystem']);
    expect(config.typeSystem).toBe(typeSystem);
    expect(config.mfeHandlers).toBe(mfeHandlers);
    expect(isRoutingRouter(config.router), 'build received the `router` export of @gears-frontx/routing').toBe(true);
  });

  it('passes the router of @gears-frontx/routing to every registry it builds', () => {
    const first = microfrontends({ typeSystem });
    const second = microfrontends({ typeSystem, mfeHandlers: [] });

    void first.provides?.registries?.mfeRegistry;
    void second.provides?.registries?.mfeRegistry;

    const configs = buildConfigs();
    expect(configs).toHaveLength(2);
    expect(
      configs.map((config) => isRoutingRouter(config.router)),
      'each build received the `router` export of @gears-frontx/routing',
    ).toEqual([true, true]);
    expect(configs.map((config) => Object.keys(config).sort())).toEqual([
      ['mfeHandlers', 'router', 'typeSystem'],
      ['mfeHandlers', 'router', 'typeSystem'],
    ]);
  });

  it('only passes the router on: no operation on it across build, registry use, state propagation and destroy', () => {
    app = createFrontX().use(microfrontends({ typeSystem })).build();
    void app.mfeRegistry;
    eventBus.emit('theme/changed', { themeId: 'light' });
    eventBus.emit('i18n/language/changed', { language: 'en' });
    app.destroy();
    app = undefined;

    // Snapshot before any matcher runs: a matcher inspecting the sentinel would record operations of its own.
    const operations = [...routerOperations];
    const routerReachedBuild = buildConfigs().some((config) => isRoutingRouter(config.router));

    expect(routerReachedBuild, 'build received the `router` export of @gears-frontx/routing').toBe(true);
    expect(operations).toEqual([]);
  });

  it('publishes nothing routing-related on the app', () => {
    const plugin = microfrontends({ typeSystem });
    app = createFrontX().use(plugin).build();

    expect(Object.keys(plugin.provides?.app ?? {})).toEqual([]);
    expect('mfeRouter' in app).toBe(false);
  });
});
