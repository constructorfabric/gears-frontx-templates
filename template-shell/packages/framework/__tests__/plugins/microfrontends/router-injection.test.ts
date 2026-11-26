/**
 * The microfrontends plugin injects the FrontX router into every registry it
 * builds: the ready `router` export of `@gears-frontx/routing`, passed to
 * `mfeRegistryFactory.build({ typeSystem, mfeHandlers, router })`. Everything
 * the router does from then on is between the registry and the router, which
 * the shell's deep-link test (`src-app/app/mfe/deepLink.test.tsx`) exercises
 * through the real registry and router.
 *
 * The router export is replaced by a sentinel and `build` by a fake, so this
 * checks only what the plugin hands to `build`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MfeHandler, MfeRegistry, TypeSystemPlugin } from '@gears-frontx/mfes';
import type { FrontXApp } from '../../../src/types';
import { createFakeTypeSystem } from '../../fakeTypeSystem';

const { routerSentinel } = vi.hoisted(() => ({ routerSentinel: Object.freeze({}) }));

vi.mock('@gears-frontx/routing', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  router: routerSentinel,
}));

let createFrontX: typeof import('../../../src/createFrontX').createFrontX;
let microfrontends: typeof import('../../../src/plugins/microfrontends').microfrontends;
let mfeRegistryFactory: typeof import('../../../src/mfe/registry').mfeRegistryFactory;
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

/** Identity with the sentinel standing in for the `router` export. */
function isRoutingRouter(value: unknown): boolean {
  return value === routerSentinel;
}

beforeEach(async () => {
  vi.resetModules();
  ({ createFrontX } = await import('../../../src/createFrontX'));
  ({ microfrontends } = await import('../../../src/plugins/microfrontends'));
  ({ mfeRegistryFactory } = await import('../../../src/mfe/registry'));
  ({ resetStore } = await import('@gears-frontx/state'));
  typeSystem = createFakeTypeSystem();
  buildSpy = vi.spyOn(mfeRegistryFactory, 'build').mockImplementation(() => fakeRegistry());
});

afterEach(() => {
  app?.destroy();
  app = undefined;
  vi.restoreAllMocks();
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
});
