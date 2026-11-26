/**
 * Tests for theme and language propagation through the microfrontends() plugin.
 *
 * The plugin is type-system agnostic: it forwards the theme's CSS variables to
 * the mfeRegistry (`setTheme`) and publishes no shared property of its own -
 * which shared properties a host publishes, under which type IDs, is the
 * host's wiring.
 *
 * @packageDocumentation
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, afterEach, beforeEach, type MockInstance } from 'vitest';
import type { MfeRegistry } from '@gears-frontx/mfes';
import type { FrontXApp } from '../../../src/types';
import { createFakeTypeSystem } from '../../fakeTypeSystem';

const typeSystem = createFakeTypeSystem();

// One app per runtime: every test loads its own module copy.
let createFrontX: typeof import('../../../src/createFrontX')['createFrontX'];
let effects: typeof import('../../../src/plugins/effects')['effects'];
let themes: typeof import('../../../src/plugins/themes')['themes'];
let i18n: typeof import('../../../src/plugins/i18n')['i18n'];
let microfrontends: typeof import('../../../src/plugins/microfrontends')['microfrontends'];
let mfeRegistryFactory: typeof import('../../../src/mfe/registry')['mfeRegistryFactory'];
let eventBus: typeof import('@gears-frontx/state')['eventBus'];
let resetStore: typeof import('@gears-frontx/state')['resetStore'];

beforeEach(async () => {
  vi.resetModules();
  ({ createFrontX } = await import('../../../src/createFrontX'));
  ({ effects } = await import('../../../src/plugins/effects'));
  ({ themes } = await import('../../../src/plugins/themes'));
  ({ i18n } = await import('../../../src/plugins/i18n'));
  ({ microfrontends } = await import('../../../src/plugins/microfrontends'));
  ({ mfeRegistryFactory } = await import('../../../src/mfe/registry'));
  ({ eventBus, resetStore } = await import('@gears-frontx/state'));
});

/**
 * Spies on `setTheme` and `updateSharedProperty` of the registry the plugin
 * builds, from the moment it is built.
 */
function spyOnBuiltRegistry(): { setTheme?: MockInstance; updateSharedProperty?: MockInstance } {
  const spies: { setTheme?: MockInstance; updateSharedProperty?: MockInstance } = {};
  const realBuild = mfeRegistryFactory.build.bind(mfeRegistryFactory);
  vi.spyOn(mfeRegistryFactory, 'build').mockImplementation((config) => {
    const registry: MfeRegistry = realBuild(config);
    spies.setTheme = vi.spyOn(registry, 'setTheme');
    spies.updateSharedProperty = vi.spyOn(registry, 'updateSharedProperty');
    return registry;
  });
  return spies;
}

describe('Theme and Language Propagation', () => {
  let apps: FrontXApp[] = [];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    apps.forEach((app) => {
      app.destroy();
    });
    apps = [];
    // Clear test-local listeners registered inside assertions.
    eventBus.clearAll();
    resetStore();
  });

  describe('theme propagation via themes() plugin', () => {
    it('should call setTheme and publish no shared property when theme/changed event fires', () => {
      const app = createFrontX()
        .use(effects())
        .use(themes())
        .use(microfrontends({ typeSystem }))
        .build();
      apps.push(app);

      app.themeRegistry.register({
        id: 'dark',
        name: 'Dark',
        variables: { '--color-bg': 'color-mix(in oklab, var(--primary) 90%, transparent)' },
      });

      const setThemeSpy = vi.spyOn(app.mfeRegistry!, 'setTheme');
      const updateSpy = vi.spyOn(app.mfeRegistry!, 'updateSharedProperty');

      eventBus.emit('theme/changed', { themeId: 'dark' });

      expect(setThemeSpy).toHaveBeenCalledWith({ '--color-bg': 'color-mix(in oklab, var(--primary) 90%, transparent)' });
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('should start a registry built after the app from the current theme variables only', () => {
      const app = createFrontX()
        .use(effects())
        .use(themes())
        .use(i18n())
        .use(microfrontends({ typeSystem }))
        .build();
      apps.push(app);
      app.themeRegistry.register({ id: 'dark', name: 'Dark', variables: { '--color-bg': 'black' } });
      app.themeRegistry.apply('dark');
      const spies = spyOnBuiltRegistry();

      void app.mfeRegistry;

      expect(spies.setTheme).toHaveBeenCalledWith({ '--color-bg': 'black' });
      expect(spies.updateSharedProperty).not.toHaveBeenCalled();
    });

    it('only logs when setTheme throws', () => {
      const app = createFrontX()
        .use(effects())
        .use(themes())
        .use(microfrontends({ typeSystem }))
        .build();
      apps.push(app);

      app.themeRegistry.register({ id: 'dark', name: 'Dark', variables: {} });
      const propagationError = new Error('theme variables rejected');
      vi.spyOn(app.mfeRegistry!, 'setTheme').mockImplementation(() => {
        throw propagationError;
      });
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const emitSpy = vi.spyOn(eventBus, 'emit');

      eventBus.emit('theme/changed', { themeId: 'dark' });

      expect(consoleError).toHaveBeenCalledWith(
        '[Gears FrontX] Failed to propagate theme to MFE domains',
        propagationError,
      );
      // The failure is reported through the log alone: no further event follows the trigger.
      expect(emitSpy.mock.calls.map(([event]) => event)).toEqual(['theme/changed']);
    });

    it('should still apply the theme when setTheme throws', () => {
      // microfrontends() first, so its failing subscriber runs before the one that applies the theme.
      const app = createFrontX()
        .use(effects())
        .use(microfrontends({ typeSystem }))
        .use(themes())
        .build();
      apps.push(app);

      app.themeRegistry.register({ id: 'dark', name: 'Dark', variables: {} });
      const setThemeSpy = vi.spyOn(app.mfeRegistry!, 'setTheme').mockImplementation(() => {
        throw new Error('theme variables rejected');
      });
      const applySpy = vi.spyOn(app.themeRegistry, 'apply');
      vi.spyOn(console, 'error').mockImplementation(() => undefined);

      eventBus.emit('theme/changed', { themeId: 'dark' });

      expect(setThemeSpy).toHaveBeenCalled();
      expect(applySpy).toHaveBeenCalledWith('dark');
    });

    it('should unsubscribe theme propagation when the plugin app is destroyed', () => {
      const app = createFrontX()
        .use(effects())
        .use(themes())
        .use(microfrontends({ typeSystem }))
        .build();
      apps.push(app);
      app.themeRegistry.register({ id: 'dark', name: 'Dark', variables: {} });
      const applySpy = vi.spyOn(app.themeRegistry, 'apply');
      const setThemeSpy = vi.spyOn(app.mfeRegistry!, 'setTheme');

      app.destroy();
      apps = apps.filter((built) => built !== app);

      eventBus.emit('theme/changed', { themeId: 'dark' });

      expect(applySpy).not.toHaveBeenCalled();
      expect(setThemeSpy).not.toHaveBeenCalled();
    });
  });

  describe('language changes via i18n() plugin', () => {
    it('should publish no shared property when i18n/language/changed event fires', async () => {
      const app = createFrontX()
        .use(effects())
        .use(i18n())
        .use(microfrontends({ typeSystem }))
        .build();
      apps.push(app);

      const updateSpy = vi.spyOn(app.mfeRegistry!, 'updateSharedProperty');
      const setLanguageSpy = vi.spyOn(app.i18nRegistry, 'setLanguage');

      eventBus.emit('i18n/language/changed', { language: 'de' });

      await vi.waitFor(() => {
        expect(setLanguageSpy).toHaveBeenCalledWith('de');
      });
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('should unsubscribe language handling when the plugin app is destroyed', () => {
      const app = createFrontX()
        .use(effects())
        .use(i18n())
        .use(microfrontends({ typeSystem }))
        .build();
      apps.push(app);
      const setLanguageSpy = vi.spyOn(app.i18nRegistry, 'setLanguage');

      app.destroy();
      apps = apps.filter((built) => built !== app);

      eventBus.emit('i18n/language/changed', { language: 'de' });

      expect(setLanguageSpy).not.toHaveBeenCalled();
    });
  });

  describe('soft dependency: mfeRegistry undefined (no microfrontends plugin)', () => {
    it('themes() plugin works correctly and applies theme when mfeRegistry is absent', () => {
      // Build without microfrontends plugin — mfeRegistry will be undefined
      const app = createFrontX()
        .use(effects())
        .use(themes())
        .build();
      apps.push(app);

      expect(app.mfeRegistry).toBeUndefined();

      // Register a theme so apply() has something to work with
      app.themeRegistry.register({ id: 'dark', name: 'Dark', variables: {} });
      const applySpy = vi.spyOn(app.themeRegistry, 'apply');

      // No registry, so no subscriber forwards anything and none fails.
      const consoleError = vi.spyOn(console, 'error');
      eventBus.emit('theme/changed', { themeId: 'dark' });
      expect(consoleError).not.toHaveBeenCalled();

      // Theme registry must still apply the theme
      expect(applySpy).toHaveBeenCalledWith('dark');
    });

    it('i18n() plugin works correctly and sets language when mfeRegistry is absent', async () => {
      // Build without microfrontends plugin — mfeRegistry will be undefined
      const app = createFrontX()
        .use(effects())
        .use(i18n())
        .build();
      apps.push(app);

      expect(app.mfeRegistry).toBeUndefined();

      const setLanguageSpy = vi.spyOn(app.i18nRegistry, 'setLanguage');

      const unhandled: unknown[] = [];
      function onUnhandled(reason: unknown): void {
        unhandled.push(reason);
      }
      process.on('unhandledRejection', onUnhandled);

      try {
        await expect(
          (async () => {
            eventBus.emit('i18n/language/changed', { language: 'es' });
            await vi.waitFor(() => {
              expect(setLanguageSpy).toHaveBeenCalledWith('es');
            });
          })()
        ).resolves.not.toThrow();

        expect(unhandled).toEqual([]);
      } finally {
        process.off('unhandledRejection', onUnhandled);
      }
    });
  });
});
