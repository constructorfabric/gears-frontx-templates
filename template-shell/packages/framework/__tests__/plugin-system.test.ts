import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FrontXActions, FrontXApp, FrontXPlugin } from '../src/types';

// One app per runtime: every test loads its own module copy.
type Eventing = typeof import('@gears-frontx/state');
let eventBus: Eventing['eventBus'];
let resetStore: Eventing['resetStore'];
let createFrontX: typeof import('../src/createFrontX').createFrontX;
let presets: typeof import('../src/presets').presets;
let effects: typeof import('../src/plugins/effects').effects;
let i18n: typeof import('../src/plugins/i18n').i18n;
let layout: typeof import('../src/plugins/layout').layout;
let mock: typeof import('../src/plugins/mock').mock;
let queryCache: typeof import('../src/plugins/queryCache').queryCache;
let themes: typeof import('../src/plugins/themes').themes;
let resetSharedQueryClient: typeof import('../src/testing').resetSharedQueryClient;

beforeEach(async () => {
  vi.resetModules();
  ({ eventBus, resetStore } = await import('@gears-frontx/state'));
  ({ createFrontX } = await import('../src/createFrontX'));
  ({ presets } = await import('../src/presets'));
  ({ effects } = await import('../src/plugins/effects'));
  ({ i18n } = await import('../src/plugins/i18n'));
  ({ layout } = await import('../src/plugins/layout'));
  ({ mock } = await import('../src/plugins/mock'));
  ({ queryCache } = await import('../src/plugins/queryCache'));
  ({ themes } = await import('../src/plugins/themes'));
  ({ resetSharedQueryClient } = await import('../src/testing'));
});

type ActionName = keyof FrontXActions;

type ActionsView = Partial<FrontXActions>;

function getActionsView(app: FrontXApp): ActionsView {
  return app.actions as ActionsView;
}

function assertHasAction(actions: ActionsView, name: ActionName): void {
  expect(typeof actions[name]).toBe('function');
}

function assertMissingAction(actions: ActionsView, name: ActionName): void {
  // Runtime shape is a sparse map even though the TS interface is total; we
  // validate both absence of the key and the callable.
  expect(Object.hasOwn(actions, name)).toBe(false);
  expect(actions[name]).toBeUndefined();
}

describe('plugin system contract', () => {
  let apps: FrontXApp[] = [];

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

  function track(app: FrontXApp): FrontXApp {
    apps.push(app);
    return app;
  }

  describe('preset surfaces', () => {
    it('minimal preset exposes themes only', () => {
      const app = track(
        createFrontX()
          .use(presets.minimal())
          .build()
      );
      const actions = getActionsView(app);

      expect(app.themeRegistry).toBeDefined();
      assertHasAction(actions, 'changeTheme');
      assertMissingAction(actions, 'showPopup');
      assertMissingAction(actions, 'setLanguage');
    });

    it('the full preset exposes the full action surface', () => {
      const app = track(createFrontX().useAll(presets.full()).build());
      const actions = getActionsView(app);

      expect(app.themeRegistry).toBeDefined();
      expect(app.i18nRegistry).toBeDefined();
      assertHasAction(actions, 'changeTheme');
      assertHasAction(actions, 'setLanguage');
      assertHasAction(actions, 'showPopup');
      assertHasAction(actions, 'toggleMockMode');
      assertMissingAction(actions, 'loadExtension');
    });
  });

  describe('plugin factories', () => {
    it('expose stable names for supported composition pieces', () => {
      expect(themes().name).toBe('themes');
      expect(layout().name).toBe('layout');
      expect(i18n().name).toBe('i18n');
      expect(effects().name).toBe('effects');
      expect(mock({ enabledByDefault: false }).name).toBe('mock');
      expect(queryCache().name).toBe('queryCache');
    });
  });

  describe('dependency resolution', () => {
    it('succeeds when dependencies are registered in order', () => {
      const providerPlugin: FrontXPlugin = { name: 'provider', dependencies: [], provides: {} };
      const consumerPlugin: FrontXPlugin = { name: 'consumer', dependencies: ['provider'], provides: {} };

      expect(() => track(createFrontX().use(providerPlugin).use(consumerPlugin).build())).not.toThrow();
    });

    it('succeeds when plugins are registered out of dependency order', () => {
      const providerPlugin: FrontXPlugin = { name: 'provider', dependencies: [], provides: {} };
      const consumerPlugin: FrontXPlugin = { name: 'consumer', dependencies: ['provider'], provides: {} };

      expect(() => track(createFrontX().use(consumerPlugin).use(providerPlugin).build())).not.toThrow();
    });
  });

  describe('negative paths', () => {
    it('strictMode throws when a plugin dependency is missing', () => {
      const plugin: FrontXPlugin = { name: 'test', dependencies: ['missing'], provides: {} };

      expect(() => {
        createFrontX({ strictMode: true }).use(plugin).build();
      }).toThrowError(/requires "missing"/);
    });

    it('non-strict mode warns and still builds when a dependency is missing', () => {
      const plugin: FrontXPlugin = { name: 'test', dependencies: ['missing'], provides: {} };
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        track(createFrontX().use(plugin).build());

        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringMatching(/requires "missing"/)
        );
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('detects circular dependencies between plugins', () => {
      const providerPlugin: FrontXPlugin = { name: 'provider', dependencies: ['consumer'], provides: {} };
      const consumerPlugin: FrontXPlugin = { name: 'consumer', dependencies: ['provider'], provides: {} };

      expect(() => {
        createFrontX()
          .use(providerPlugin)
          .use(consumerPlugin)
          .build();
      }).toThrowError(/Circular dependency/);
    });

    it('skips duplicate plugin registrations silently', () => {
      const plugin: FrontXPlugin = { name: 'test', dependencies: [], provides: {} };
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        track(createFrontX().use(plugin).use(plugin).build());
        expect(warnSpy).not.toHaveBeenCalled();
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('emits a duplicate-registration warning in devMode', () => {
      const plugin: FrontXPlugin = { name: 'test', dependencies: [], provides: {} };
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        track(createFrontX({ devMode: true }).use(plugin).use(plugin).build());
        expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/already registered/));
      } finally {
        warnSpy.mockRestore();
      }
    });
  });
});
