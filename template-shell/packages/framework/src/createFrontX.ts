/**
 * createFrontX - App Builder Factory
 *
 * Creates a FrontX app builder for custom plugin composition.
 * This is the core of the plugin architecture.
 *
 * Framework Layer: L2 (Depends on SDK packages)
 */

// @cpt-flow:cpt-frontx-flow-framework-composition-app-bootstrap:p1
// @cpt-flow:cpt-frontx-flow-framework-composition-plugin-dependency:p1
// @cpt-algo:cpt-frontx-algo-framework-composition-dep-resolution:p1
// @cpt-algo:cpt-frontx-algo-framework-composition-provides-aggregation:p1
// @cpt-state:cpt-frontx-state-framework-composition-builder:p1
// @cpt-flow:cpt-frontx-flow-framework-composition-teardown:p2
// @cpt-dod:cpt-frontx-dod-framework-composition-builder:p1

import { getStore, registerSlice } from '@gears-frontx/state';
import type { EffectInitializer } from '@gears-frontx/state';
import type {
  FrontXConfig,
  FrontXPlugin,
  FrontXAppBuilder,
  FrontXApp,
  FrontXActions,
  FrontXStore,
  PluginFactory,
  RegisterableSlice,
  ThemeRegistry,
} from './types';
import { apiRegistry } from '@gears-frontx/api';

// ============================================================================
// Plugin Resolution
// ============================================================================

const DUPLICATE_PLUGIN_CLEANUP_SYMBOL = Symbol.for(
  'frontx:plugin:duplicate-cleanup'
);

type PluginWithDuplicateCleanup = FrontXPlugin & {
  [DUPLICATE_PLUGIN_CLEANUP_SYMBOL]?: () => void;
};

// @cpt-begin:cpt-frontx-flow-framework-composition-plugin-dependency:p1:inst-1
/**
 * Check if value is a plugin factory function
 */
function isPluginFactory(
  value: FrontXPlugin | PluginFactory
): value is PluginFactory {
  return typeof value === 'function';
}

/**
 * Resolve plugin - if it's a factory, call it; otherwise return as-is
 */
function resolvePlugin(plugin: FrontXPlugin | PluginFactory): FrontXPlugin {
  return isPluginFactory(plugin) ? plugin() : plugin;
}

function resolvePluginNameHint(
  plugin: FrontXPlugin | PluginFactory
): string | undefined {
  if (isPluginFactory(plugin)) {
    return plugin.name || undefined;
  }

  return plugin.name;
}

function cleanupSkippedDuplicatePlugin(plugin: FrontXPlugin): void {
  (plugin as PluginWithDuplicateCleanup)[DUPLICATE_PLUGIN_CLEANUP_SYMBOL]?.();
}
// @cpt-end:cpt-frontx-flow-framework-composition-plugin-dependency:p1:inst-1

// ============================================================================
// Build Guard
// ============================================================================

/**
 * One app per runtime: this module copy is one runtime's framework. The state
 * is module-level on purpose and has no reset — `destroy()` does not free it,
 * because a destroyed app's slot is still this runtime's app. Tests that need
 * a fresh guard load a fresh module copy (`vi.resetModules()` + dynamic import).
 */
type BuildState = 'idle' | 'building' | 'built';
let buildState: BuildState = 'idle';

function assertBuildable(): void {
  if (buildState === 'building') {
    throw new Error(
      'createFrontX().build() was called while another build is in progress. A runtime builds exactly one FrontX app.'
    );
  }
  if (buildState === 'built') {
    throw new Error(
      'A FrontX app has already been built in this runtime. A runtime builds exactly one app: create it once at module level and reuse it.'
    );
  }
}

// ============================================================================
// App Builder Implementation
// ============================================================================

/**
 * FrontX App Builder Implementation
 */
class FrontXAppBuilderImpl implements FrontXAppBuilder {
  private plugins: FrontXPlugin[] = [];
  private config: FrontXConfig;

  constructor(config: FrontXConfig = {}) {
    this.config = {
      name: 'Gears FrontX App',
      devMode: false,
      strictMode: false,
      ...config,
    };
  }

  /**
   * Add a plugin to the application.
   * Also accepts an array of plugins (for preset support).
   */
  // @cpt-begin:cpt-frontx-flow-framework-composition-app-bootstrap:p1:inst-1
  // @cpt-begin:cpt-frontx-state-framework-composition-builder:p1:inst-1
  use(plugin: FrontXPlugin | PluginFactory | FrontXPlugin[]): FrontXAppBuilder {
    // Handle arrays (presets return arrays)
    if (Array.isArray(plugin)) {
      plugin.forEach((p) => this.use(p));
      return this;
    }

    const pluginNameHint = resolvePluginNameHint(plugin);
    if (pluginNameHint && this.plugins.some((p) => p.name === pluginNameHint)) {
      if (!isPluginFactory(plugin)) {
        cleanupSkippedDuplicatePlugin(plugin);
      }
      if (this.config.devMode) {
        console.warn(
          `Plugin "${pluginNameHint}" is already registered. Skipping duplicate.`
        );
      }
      return this;
    }

    const resolved = resolvePlugin(plugin);

    // Check if plugin already registered
    if (this.plugins.some((p) => p.name === resolved.name)) {
      cleanupSkippedDuplicatePlugin(resolved);
      if (this.config.devMode) {
        console.warn(
          `Plugin "${resolved.name}" is already registered. Skipping duplicate.`
        );
      }
      return this;
    }

    this.plugins.push(resolved);
    return this;
  }
  // @cpt-end:cpt-frontx-flow-framework-composition-app-bootstrap:p1:inst-1
  // @cpt-end:cpt-frontx-state-framework-composition-builder:p1:inst-1

  /**
   * Add multiple plugins at once.
   */
  useAll(plugins: Array<FrontXPlugin | PluginFactory>): FrontXAppBuilder {
    plugins.forEach((plugin) => this.use(plugin));
    return this;
  }

  /**
   * Build the application.
   */
  // @cpt-begin:cpt-frontx-flow-framework-composition-app-bootstrap:p1:inst-2
  // @cpt-begin:cpt-frontx-state-framework-composition-builder:p1:inst-2
  build(): FrontXApp {
    assertBuildable();
    buildState = 'building';
    let created: { app: FrontXApp; orderedPlugins: FrontXPlugin[] };
    try {
      created = this.createApp();
    } catch (error) {
      // No app exists, so the runtime may build again.
      buildState = 'idle';
      throw error;
    }
    buildState = 'built';
    const { app, orderedPlugins } = created;

    // 7. Call onInit for each plugin
    orderedPlugins.forEach((plugin) => {
      if (plugin.onInit) {
        plugin.onInit(app);
      }
    });

    return app;
  }

  private createApp(): { app: FrontXApp; orderedPlugins: FrontXPlugin[] } {
    // 1. Resolve dependencies and order plugins
    const orderedPlugins = this.resolveDependencies();

    // 2. Call onRegister for each plugin
    orderedPlugins.forEach((plugin) => {
      if (plugin.onRegister) {
        plugin.onRegister(this, plugin._configType);
      }
    });

    // 3. Aggregate all provides
    const aggregated = this.aggregateProvides(orderedPlugins);

    // 4. Create store with aggregated slices
    const store = this.createStoreWithSlices(aggregated.slices);

    // 5. Initialize effects
    aggregated.effects.forEach((initEffect) => {
      initEffect(store.dispatch);
    });

    // 6. Build the app object
    // Cast actions to FrontXActions - all plugins have contributed their actions
    // via module augmentation, so the runtime object matches the declared type
    const app: FrontXApp = {
      config: this.config,
      store: store as FrontXStore,
      themeRegistry: aggregated.registries.themeRegistry as ThemeRegistry,
      apiRegistry: apiRegistry,
      i18nRegistry: aggregated.registries.i18nRegistry as FrontXApp['i18nRegistry'],
      mfeRegistry: undefined,
      actions: aggregated.actions as FrontXActions,
      destroy: () => this.destroyApp(orderedPlugins, app),
    };

    // `mfeRegistry` is a lazy getter on the registries; copy its descriptor
    // instead of reading it, so building the app never builds the registry.
    const mfeRegistryDescriptor = Object.getOwnPropertyDescriptor(
      aggregated.registries,
      'mfeRegistry'
    );
    if (mfeRegistryDescriptor) {
      Object.defineProperty(app, 'mfeRegistry', mfeRegistryDescriptor);
    }

    // Merge plugin-provided runtime app extensions onto the built app object.
    // Guard against plugins silently overwriting core app properties.
    for (const key of Object.keys(aggregated.app)) {
      if (key in app) {
        throw new Error(
          `Plugin app extension "${key}" conflicts with an existing app property.`
        );
      }
    }
    Object.assign(app as object, aggregated.app);

    return { app, orderedPlugins };
  }
  // @cpt-end:cpt-frontx-flow-framework-composition-app-bootstrap:p1:inst-2
  // @cpt-end:cpt-frontx-state-framework-composition-builder:p1:inst-2

  /**
   * Resolve plugin dependencies using topological sort.
   */
  // @cpt-begin:cpt-frontx-algo-framework-composition-dep-resolution:p1:inst-1
  // @cpt-begin:cpt-frontx-flow-framework-composition-plugin-dependency:p1:inst-2
  private resolveDependencies(): FrontXPlugin[] {
    const resolved: FrontXPlugin[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (plugin: FrontXPlugin) => {
      if (visited.has(plugin.name)) return;

      if (visiting.has(plugin.name)) {
        throw new Error(
          `Circular dependency detected: ${plugin.name} depends on itself or creates a cycle.`
        );
      }

      visiting.add(plugin.name);

      // Process dependencies first
      if (plugin.dependencies) {
        for (const depName of plugin.dependencies) {
          const dep = this.plugins.find((p) => p.name === depName);

          if (!dep) {
            if (this.config.strictMode) {
              throw new Error(
                `Plugin "${plugin.name}" requires "${depName}" but it is not registered.\n` +
                  `Add the missing plugin: .use(${depName}())`
              );
            } else {
              console.warn(
                `Plugin "${plugin.name}" requires "${depName}" but it is not registered. ` +
                  `Some features may not work correctly.`
              );
              continue;
            }
          }

          visit(dep);
        }
      }

      visiting.delete(plugin.name);
      visited.add(plugin.name);
      resolved.push(plugin);
    };

    this.plugins.forEach(visit);
    return resolved;
  }
  // @cpt-end:cpt-frontx-algo-framework-composition-dep-resolution:p1:inst-1
  // @cpt-end:cpt-frontx-flow-framework-composition-plugin-dependency:p1:inst-2

  /**
   * Aggregate all provides from plugins.
   */
  // @cpt-begin:cpt-frontx-algo-framework-composition-provides-aggregation:p1:inst-1
  private aggregateProvides(plugins: FrontXPlugin[]) {
    const registries: Record<string, unknown> = {};
    const app: Record<string, unknown> = {};
    const slices: RegisterableSlice[] = [];
    const effects: EffectInitializer[] = [];
    // Actions are typed via module augmentation - each plugin declares its actions
    // in FrontXActions interface. At runtime we merge them all together.
    const actions: Partial<FrontXActions> = {};

    plugins.forEach((plugin) => {
      if (!plugin.provides) return;

      // Merge registries
      if (plugin.provides.registries) {
        // By descriptor: a registry may be a lazy accessor that must not be read here.
        Object.defineProperties(
          registries,
          Object.getOwnPropertyDescriptors(plugin.provides.registries)
        );
      }

      // Merge runtime app extensions (plugin-defined surface on built `app`)
      if (plugin.provides.app) {
        Object.assign(app, plugin.provides.app);
      }

      // Collect slices
      if (plugin.provides.slices) {
        slices.push(...plugin.provides.slices);
      }

      // Collect effects
      if (plugin.provides.effects) {
        effects.push(...plugin.provides.effects);
      }

      // Merge actions (type-safe via FrontXActions module augmentation)
      if (plugin.provides.actions) {
        Object.assign(actions, plugin.provides.actions);
      }
    });

    return { registries, app, slices, effects, actions };
  }
  // @cpt-end:cpt-frontx-algo-framework-composition-provides-aggregation:p1:inst-1

  /**
   * Create store with all aggregated slices.
   */
  private createStoreWithSlices(slices: RegisterableSlice[]): FrontXStore {
    // Get or create the store
    const store = getStore();

    // Register framework slices using registerSlice (merges with dynamic slices)
    slices.forEach((slice) => {
      registerSlice(slice);
    });

    return store;
  }

  /**
   * Destroy the app and cleanup resources.
   */
  // @cpt-begin:cpt-frontx-flow-framework-composition-teardown:p2:inst-1
  private destroyApp(plugins: FrontXPlugin[], app: FrontXApp): void {
    // Call onDestroy in reverse order
    [...plugins].reverse().forEach((plugin) => {
      if (plugin.onDestroy) {
        plugin.onDestroy(app);
      }
    });
  }
  // @cpt-end:cpt-frontx-flow-framework-composition-teardown:p2:inst-1
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a FrontX app builder for custom plugin composition.
 *
 * @param config - Optional application configuration
 * @returns App builder for plugin composition
 *
 * @example
 * ```typescript
 * const app = createFrontX()
 *   .use(themes())
 *   .build();
 * ```
 */
// @cpt-begin:cpt-frontx-dod-framework-composition-builder:p1:inst-1
export function createFrontX(config?: FrontXConfig): FrontXAppBuilder {
  return new FrontXAppBuilderImpl(config);
}
// @cpt-end:cpt-frontx-dod-framework-composition-builder:p1:inst-1
