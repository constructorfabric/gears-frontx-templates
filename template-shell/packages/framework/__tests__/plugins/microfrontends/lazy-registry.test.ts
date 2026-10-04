/**
 * The microfrontends plugin owns one lazy registry initializer. Building the
 * app never materializes the registry; the first consumer that needs it does.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FrontXApp } from '../../../src/types';

let createFrontX: typeof import('../../../src/createFrontX').createFrontX;
let microfrontends: typeof import('../../../src/plugins/microfrontends').microfrontends;
let MfeEvents: typeof import('../../../src/plugins/microfrontends').MfeEvents;
let mfeRegistryFactory: typeof import('../../../src/mfe/registry').mfeRegistryFactory;
let gtsPlugin: typeof import('@gears-frontx/gts-plugin').gtsPlugin;
let eventBus: typeof import('@gears-frontx/state').eventBus;
let resetStore: typeof import('@gears-frontx/state').resetStore;
let themes: typeof import('../../../src/plugins/themes').themes;
let originalBuild: typeof mfeRegistryFactory.build;
let buildSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  vi.resetModules();
  ({ createFrontX } = await import('../../../src/createFrontX'));
  ({ microfrontends, MfeEvents } = await import('../../../src/plugins/microfrontends'));
  ({ themes } = await import('../../../src/plugins/themes'));
  ({ mfeRegistryFactory } = await import('../../../src/mfe/registry'));
  ({ gtsPlugin } = await import('@gears-frontx/gts-plugin'));
  ({ eventBus, resetStore } = await import('@gears-frontx/state'));
  originalBuild = mfeRegistryFactory.build.bind(mfeRegistryFactory);
  buildSpy = vi.spyOn(mfeRegistryFactory, 'build');
});

let app: FrontXApp | undefined;

afterEach(() => {
  app?.destroy();
  app = undefined;
  vi.restoreAllMocks();
  eventBus.clearAll();
  resetStore();
});

function buildApp(): FrontXApp {
  app = createFrontX().use(microfrontends({ typeSystem: gtsPlugin })).build();
  return app;
}

describe('microfrontends lazy registry', () => {
  it('is not materialized by plugin aggregation, app construction or onInit', () => {
    const built = buildApp();

    expect(buildSpy).not.toHaveBeenCalled();
    expect(Object.getOwnPropertyDescriptor(built, 'mfeRegistry')?.get).toBeTypeOf('function');
  });

  it('materializes once on first read and keeps returning the same registry', () => {
    const built = buildApp();

    const first = built.mfeRegistry;
    const second = built.mfeRegistry;

    expect(first).toBeDefined();
    expect(second).toBe(first);
    expect(buildSpy).toHaveBeenCalledTimes(1);
  });

  it('is materialized by a registry-dependent action', () => {
    const built = buildApp();

    expect(() => built.actions.mountExtension('gts.frontx.mfes.ext.extension.v1~test.app.missing.v1')).toThrowError(
      /is not registered/
    );

    expect(buildSpy).toHaveBeenCalledTimes(1);
  });

  it('is materialized by the registration effect when its event fires, not when subscribing', () => {
    buildApp();
    expect(buildSpy).not.toHaveBeenCalled();

    eventBus.emit(MfeEvents.RegisterExtensionRequested, {
      extension: {
        id: 'gts.frontx.mfes.ext.extension.v1~test.app.eff.v1',
        domain: 'gts.frontx.mfes.ext.domain.v1~test.app.eff.domain.v1',
        entry: 'gts.frontx.mfes.mfe.entry.v1~test.app.eff.entry.v1',
      },
    });

    expect(buildSpy).toHaveBeenCalledTimes(1);
  });
});

describe('microfrontends with themes()', () => {
  const lightTheme = { id: 'light', name: 'Light', variables: { '--background': '#fff' } };
  const darkTheme = { id: 'dark', name: 'Dark', variables: { '--background': '#000' } };

  function buildWithThemes(): FrontXApp {
    app = createFrontX()
      .use(themes())
      .use(microfrontends({ typeSystem: gtsPlugin }))
      .build();
    return app;
  }

  it('does not materialize the registry at build, even with a registered theme', () => {
    const built = buildWithThemes();
    built.themeRegistry.register(lightTheme);

    expect(buildSpy).not.toHaveBeenCalled();
    expect(Object.getOwnPropertyDescriptor(built, 'mfeRegistry')?.get).toBeTypeOf('function');
  });

  it('does not materialize the registry on a theme change before first use', () => {
    const built = buildWithThemes();
    built.themeRegistry.register(lightTheme);
    built.themeRegistry.register(darkTheme);

    eventBus.emit('theme/changed', { themeId: 'dark' });

    expect(buildSpy).not.toHaveBeenCalled();
  });

  it('gives the first materialization the current theme', () => {
    const built = buildWithThemes();
    built.themeRegistry.register(lightTheme);
    built.themeRegistry.register(darkTheme);
    eventBus.emit('theme/changed', { themeId: 'dark' });
    let setTheme: ReturnType<typeof vi.spyOn> | undefined;
    buildSpy.mockImplementation((config: Parameters<typeof originalBuild>[0]) => {
      const registry = originalBuild(config);
      setTheme = vi.spyOn(registry, 'setTheme');
      return registry;
    });

    void built.mfeRegistry;

    expect(setTheme).toHaveBeenCalledWith(darkTheme.variables);
  });

  it('pushes a theme change to a registry that already exists', () => {
    const built = buildWithThemes();
    built.themeRegistry.register(lightTheme);
    built.themeRegistry.register(darkTheme);
    const registry = built.mfeRegistry!;
    const setTheme = vi.spyOn(registry, 'setTheme');

    eventBus.emit('theme/changed', { themeId: 'dark' });

    expect(setTheme).toHaveBeenCalledWith(darkTheme.variables);
  });
});
