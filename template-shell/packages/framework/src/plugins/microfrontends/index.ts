/**
 * Microfrontends Plugin
 *
 * Enables MFE capabilities in FrontX applications.
 * The plugin takes a configuration object: `typeSystem` (required) and
 * `mfeHandlers` (optional). Domains, extensions and entries are registered
 * dynamically at runtime.
 *
 * @packageDocumentation
 */

// @cpt-flow:cpt-frontx-flow-framework-composition-mfe-lifecycle:p1
// @cpt-flow:cpt-frontx-flow-framework-composition-shared-property-broadcast:p1
// @cpt-algo:cpt-frontx-algo-framework-composition-gts-validation:p1
// @cpt-state:cpt-frontx-state-framework-composition-mfe-mount:p1
// @cpt-dod:cpt-frontx-dod-framework-composition-mfe-plugin:p1
// @cpt-dod:cpt-frontx-dod-framework-composition-shared-property:p1

import {
  type MfeHandler,
  type MfeRegistry,
  type TypeSystemPlugin,
} from '@gears-frontx/mfes';
import { router } from '@gears-frontx/routing';
import { mfeRegistryFactory } from '../../mfe/registry';
import { eventBus } from '@gears-frontx/state';
import type { ChangeThemePayload, FrontXApp, FrontXPlugin } from '../../types';
// The theme event this plugin forwards is declared on the event map by the
// plugin that owns it; this type-only import brings that declaration into
// scope wherever this module is compiled on its own.
import type {} from '../themes';
import { mfeSlice } from './slice';
import { initMfeEffects } from './effects';
import {
  loadExtension,
  mountExtension,
  unmountExtension,
  registerExtension,
  unregisterExtension,
  setMfeRegistry,
  bindMfeRegistryInitializer,
} from './actions';

/**
 * Configuration for the microfrontends plugin.
 */
export interface MicrofrontendsConfig {
  /**
   * Type system plugin for entity validation.
   * The registry uses this for domain, extension, and handler type validation.
   */
  typeSystem: TypeSystemPlugin;

  /**
   * Optional MFE handlers to register with the MFE registry.
   * Handlers enable loading of specific MFE entry types (e.g., MfeEntryMF).
   *
   * If not provided, no handlers are registered. Applications must register
   * handlers manually via mfeRegistry API.
   */
  mfeHandlers?: MfeHandler[];
}

/**
 * Microfrontends plugin factory.
 *
 * Enables MFE capabilities in FrontX applications. Requires a TypeSystemPlugin and
 * optionally accepts MFE handlers for registration with the registry.
 *
 * **Key Principles:**
 * - Optional mfeHandlers config for handler registration
 * - NO static domain registration - domains are registered at runtime
 * - Builds mfeRegistry lazily, on first read of `app.mfeRegistry`, with the provided TypeSystemPlugin
 * - Same TypeSystemPlugin instance is propagated throughout
 * - Integrates MFE lifecycle with Flux data flow (actions, effects, slice)
 * - Type-system agnostic: it names no shared property. It pushes only the
 *   current theme's CSS variables to the registry (`registry.setTheme`);
 *   which shared properties a host publishes to its MFEs, and under which
 *   type IDs, is the host's own wiring (`registry.updateSharedProperty`).
 *
 * @param config - Configuration: `typeSystem` (required) and `mfeHandlers` (optional array)
 *
 * @example
 * ```typescript
 * import { createFrontX } from '@gears-frontx/framework';
 * import { microfrontends, MfeHandlerMF } from '@gears-frontx/framework/mfe';
 *
 * // `myTypeSystem` implements the TypeSystemPlugin contract; `MY_ENTRY_TYPE`
 * // and `sidebarDomain` are the host's own entry type ID and domain declaration.
 * const app = createFrontX()
 *   .use(microfrontends({
 *     typeSystem: myTypeSystem,
 *     mfeHandlers: [new MfeHandlerMF(MY_ENTRY_TYPE)],
 *   }))
 *   .build();
 *
 * // Register domains dynamically at runtime:
 * app.mfeRegistry.registerDomain(sidebarDomain, new SidebarDomainFactory());
 *
 * // Use MFE actions:
 * app.actions.loadExtension('my.extension.v1');
 * app.actions.mountExtension('my.extension.v1');
 * ```
 */
// @cpt-begin:cpt-frontx-flow-framework-composition-mfe-lifecycle:p1:inst-1
// @cpt-begin:cpt-frontx-state-framework-composition-mfe-mount:p1:inst-1
// @cpt-begin:cpt-frontx-dod-framework-composition-mfe-plugin:p1:inst-1
export function microfrontends(config: MicrofrontendsConfig): FrontXPlugin {
  // The registry is built lazily, exactly once, by `initializeRegistry`. A
  // nested runtime (an MFE extension's own bundle copy) must build its
  // registry inside its first mount window so the host links it; building it
  // at `build()` time would happen outside any window and make it a root. Every
  // consumer — the `app.mfeRegistry` accessor, lifecycle actions, effects and
  // `ThemeAwareReactLifecycle.mount` — goes through this one initializer, so
  // reading the registry is what materializes it. The registry receives the
  // ready `router` of `@gears-frontx/routing`; the plugin passes it on and does
  // nothing else with it.
  let registry: MfeRegistry | undefined;
  let builtApp: FrontXApp | undefined;
  const subscriptions: Array<{ unsubscribe: () => void }> = [];

  // The registry starts from the current theme's CSS variables when it is
  // built; later changes are forwarded below, only once it exists.
  const applyCurrentState = (built: MfeRegistry, app: FrontXApp): void => {
    try {
      const theme = app.themeRegistry?.getCurrent();
      if (theme) {
        built.setTheme(theme.variables);
      }
    } catch (error) {
      console.error('[Gears FrontX] Failed to apply the current theme to the MFE registry', error);
    }
  };

  const initializeRegistry = (): MfeRegistry => {
    if (!registry) {
      const built = mfeRegistryFactory.build({ typeSystem: config.typeSystem, mfeHandlers: config.mfeHandlers, router });
      setMfeRegistry(built);
      registry = built;
      if (builtApp) {
        applyCurrentState(built, builtApp);
      }
    }
    return registry;
  };

  // Store cleanup functions in closure (encapsulated per plugin instance)
  let effectsCleanup: (() => void) | null = null;

  return {
    name: 'microfrontends',
    dependencies: [],

    provides: {
      registries: {
        // The MFE-enabled MfeRegistry (registerDomain(), registerExtension(), …)
        // as a getter: the first read builds it. Aggregation and app
        // construction copy it by property descriptor so it stays lazy.
        get mfeRegistry(): MfeRegistry {
          return initializeRegistry();
        },
      },
      slices: [mfeSlice],
      // NOTE: Effects are NOT initialized via provides.effects.
      // They are initialized in onInit to capture cleanup references.
      // The framework calls provides.effects at build step 5, then onInit at step 7.
      // We only initialize effects in onInit to avoid duplicate event listeners.
      actions: {
        loadExtension,
        mountExtension,
        unmountExtension,
        registerExtension,
        unregisterExtension,
      },
    },

    onInit(app): void {
      builtApp = app;
      // Lifecycle actions materialize the registry through the initializer.
      bindMfeRegistryInitializer(initializeRegistry);

      // Initialize effects and store cleanup references
      effectsCleanup = initMfeEffects(initializeRegistry);

      // Forward later theme changes' CSS variables to the registry, only if it
      // has been built (a registry built later starts from the current theme).
      subscriptions.push(
        eventBus.on('theme/changed', (payload: ChangeThemePayload) => {
          if (!registry) return;
          try {
            const themeConfig = app.themeRegistry?.get(payload.themeId);
            if (themeConfig) {
              registry.setTheme(themeConfig.variables);
            }
          } catch (error) {
            console.error('[Gears FrontX] Failed to propagate theme to MFE domains', error);
          }
        })
      );

      // Plugin is now initialized
      // TypeSystemPlugin: bound to mfeRegistry
      // MFE handlers: registered via config.mfeHandlers
      // Base domains: NOT pre-registered - registered dynamically at runtime
      // MFE actions: loadExtension, mountExtension, unmountExtension available

      // Plugin is now ready
      // Base domains are NOT registered here - they are registered dynamically
      // at runtime via app.mfeRegistry.registerDomain() or actions
    },

    onDestroy(): void {
      // Cleanup event subscriptions
      if (effectsCleanup) {
        effectsCleanup();
        effectsCleanup = null;
      }
      subscriptions.splice(0).forEach((subscription) => subscription.unsubscribe());
    },
  };
}
// @cpt-end:cpt-frontx-flow-framework-composition-mfe-lifecycle:p1:inst-1
// @cpt-end:cpt-frontx-state-framework-composition-mfe-mount:p1:inst-1
// @cpt-end:cpt-frontx-dod-framework-composition-mfe-plugin:p1:inst-1

// Re-export MFE actions for direct usage
export {
  loadExtension,
  mountExtension,
  unmountExtension,
  registerExtension,
  unregisterExtension,
  type RegisterExtensionPayload,
  type UnregisterExtensionPayload,
} from './actions';

// Re-export MFE slice and selectors
export {
  mfeSlice,
  mfeActions,
  selectExtensionState,
  selectRegisteredExtensions,
  selectExtensionError,
  type MfeState,
  type ExtensionRegistrationState,
} from './slice';

// Re-export MfeEvents
export { MfeEvents } from './constants';
