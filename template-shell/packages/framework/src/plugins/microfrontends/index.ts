/**
 * Microfrontends Plugin
 *
 * Enables MFE capabilities in FrontX applications.
 * This plugin accepts NO configuration parameters.
 * All MFE registration happens dynamically at runtime.
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
import { mfeRegistryFactory } from '../../mfe/registry';
import { eventBus } from '@gears-frontx/state';
import type { ChangeThemePayload, FrontXApp, FrontXPlugin, SetLanguagePayload } from '../../types';
import { FRONTX_SHARED_PROPERTY_LANGUAGE, FRONTX_SHARED_PROPERTY_THEME } from '../../mfe/constants';
import { mfeSlice } from './slice';
import { initMfeEffects } from './effects';
import { FrameworkRouter } from './router';
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
   * Optional MFE handlers to register with the screensets registry.
   * Handlers enable loading of specific MFE entry types (e.g., MfeEntryMF).
   *
   * If not provided, no handlers are registered. Applications must register
   * handlers manually via mfeRegistry API.
   */
  mfeHandlers?: MfeHandler[];
}

/**
 * Module-scoped singleton, mirroring `mfeRegistryFactory`'s own cache
 * (`src/mfe/registry.ts`): one `FrameworkRouter` per loaded copy of this
 * module, so every `microfrontends()` call in this copy presents the
 * identical router object the factory's own config-identity check requires.
 */
let sharedRouter: FrameworkRouter | undefined;
function sharedFrameworkRouter(typeSystem: TypeSystemPlugin): FrameworkRouter {
  if (!sharedRouter) sharedRouter = new FrameworkRouter({ typeSystem });
  return sharedRouter;
}

/**
 * Microfrontends plugin factory.
 *
 * Enables MFE capabilities in FrontX applications. Optionally accepts MFE handlers
 * for registration with the registry.
 *
 * **Key Principles:**
 * - Optional mfeHandlers config for handler registration
 * - NO static domain registration - domains are registered at runtime
 * - Builds mfeRegistry lazily, on first read of `app.mfeRegistry`, with the provided TypeSystemPlugin
 * - Same TypeSystemPlugin instance is propagated throughout
 * - Integrates MFE lifecycle with Flux data flow (actions, effects, slice)
 *
 * @param config - Optional configuration with mfeHandlers array
 *
 * @example
 * ```typescript
 * import { createFrontX, microfrontends } from '@gears-frontx/framework';
 * import { MfeHandlerMF } from '@gears-frontx/mfes';
 * import { FrontX_MFE_ENTRY_MF } from '@gears-frontx/framework';
 * import { gtsPlugin } from '@gears-frontx/gts-plugin';
 *
 * const app = createFrontX()
 *   .use(microfrontends({
 *     typeSystem: gtsPlugin,
 *     mfeHandlers: [new MfeHandlerMF(FrontX_MFE_ENTRY_MF)],
 *   }))
 *   .build();
 *
 * // Register domains dynamically at runtime:
 * app.mfeRegistry.registerDomain(sidebarDomain, containerProvider);
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
  // The framework router implementing the runtime's router port
  // (`cpt-frontx-adr-extension-routing-port`) — injected into the registry
  // this plugin builds. `mfeRegistryFactory`'s own cache compares a repeated
  // build's router by identity (`cpt-frontx-dod-mfe-registry-router-configuration`),
  // so every `microfrontends()` call in this loaded copy shares one router.
  const router = sharedFrameworkRouter(config.typeSystem);

  // The registry is built lazily, exactly once, by `initializeRegistry`. A
  // nested runtime (an MFE extension's own bundle copy) must build its
  // registry inside its first mount window so the host links it; building it
  // at `build()` time would happen outside any window and make it a root. Every
  // consumer — the `app.mfeRegistry` accessor, lifecycle actions, effects and
  // `ThemeAwareReactLifecycle.mount` — goes through this one initializer, so
  // reading the registry is what materializes it.
  // The router is this registry's consumer-side wiring, attached right after
  // the build and before any domain or extension registers (see
  // `FrameworkRouter.attachRegistry`).
  let registry: MfeRegistry | undefined;
  let builtApp: FrontXApp | undefined;
  const subscriptions: Array<{ unsubscribe: () => void }> = [];

  // The registry starts from the current theme and language when it is built;
  // later changes are forwarded below, only once it exists.
  const applyCurrentState = (built: MfeRegistry, app: FrontXApp): void => {
    try {
      const theme = app.themeRegistry?.getCurrent();
      if (theme) {
        built.setTheme(theme.variables);
        built.updateSharedProperty(FRONTX_SHARED_PROPERTY_THEME, theme.id);
      }
      const language = app.i18nRegistry?.getLanguage();
      if (language) {
        built.updateSharedProperty(FRONTX_SHARED_PROPERTY_LANGUAGE, language);
      }
    } catch (error) {
      console.error('[Gears FrontX] Failed to apply current theme/language to the MFE registry', error);
    }
  };

  const initializeRegistry = (): MfeRegistry => {
    if (!registry) {
      const built = mfeRegistryFactory.build({
        typeSystem: config.typeSystem,
        mfeHandlers: config.mfeHandlers,
        router,
      });
      router.attachRegistry(built);
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
      // `app.mfeRouter` — the module-augmentation surface (see
      // `FrontXAppRuntimeExtensions`) exposing only `navigation()`, the
      // extension-local navigation facade an MFE reads/drives its own route
      // through (ADR 0036, D5; see `MfeRouterHandle`'s own doc comment for
      // the full contract). Starting/stopping a routed domain's URL observer
      // and building/rendering its route tree are React-owned internal
      // integration, never reached through this handle: `ExtensionDomainSlot`
      // drives attach/detach itself and `ExtensionRouter` builds the route
      // tree (both `@gears-frontx/react`), each backed by the reach-through
      // functions `@gears-frontx/framework/internal` exports. Published via
      // `asHandle()`, never the `router` instance itself, so no `RouterPort`
      // member (or `attachRegistry`) is reachable from an app object.
      app: { mfeRouter: router.asHandle() },
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

      // Forward later theme/language changes to the registry, only if it has
      // been built (a registry built later starts from the current values).
      subscriptions.push(
        eventBus.on('theme/changed', (payload: ChangeThemePayload) => {
          if (!registry) return;
          try {
            const themeConfig = app.themeRegistry?.get(payload.themeId);
            if (themeConfig) {
              registry.setTheme(themeConfig.variables);
            }
            registry.updateSharedProperty(FRONTX_SHARED_PROPERTY_THEME, payload.themeId);
          } catch (error) {
            console.error('[Gears FrontX] Failed to propagate theme to MFE domains', error);
            eventBus.emit('theme/propagation/failed', { themeId: payload.themeId, error });
          }
        }),
        eventBus.on('i18n/language/changed', (payload: SetLanguagePayload) => {
          if (!registry) return;
          try {
            registry.updateSharedProperty(FRONTX_SHARED_PROPERTY_LANGUAGE, payload.language);
          } catch (error) {
            console.error('[Gears FrontX] Failed to propagate language to MFE domains', error);
            eventBus.emit('i18n/propagation/failed', { language: payload.language, error });
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
  selectMountedExtensions,
  addExtensionMounted,
  removeExtensionMounted,
  type MfeState,
  type ExtensionRegistrationState,
} from './slice';

// Re-export FrontX layout domain constants and MfeEvents
export {
  FRONTX_POPUP_DOMAIN,
  FRONTX_SIDEBAR_DOMAIN,
  FRONTX_SCREEN_DOMAIN,
  FRONTX_OVERLAY_DOMAIN,
  MfeEvents,
} from './constants';

// `FrameworkRouter` itself stays internal to this plugin — only the narrow
// `app.mfeRouter` handle type is exported (ADR 0036; the class is never
// reachable from an app object, see `router.ts`'s own doc comment). The
// framework-internal reach-through functions below are NOT re-exported from
// this package's public entry (`src/index.ts`) — only from its `./internal`
// subpath (`src/internal.ts`), consumed by `@gears-frontx/react`'s own
// `ExtensionDomainSlot`/`ExtensionRouter`/`useDomainRouteStatus`.
// `teardownRoutedDomain` carries no public exception in either package — see
// its own doc comment in `router.ts`. Never part of `app.mfeRouter` itself.
export type { MfeRouterHandle } from './router';
export {
  buildExtensionHistory,
  startRoutedDomain,
  stopRoutedDomain,
  teardownRoutedDomain,
  routedDomainStatus,
  subscribeRoutedDomainStatus,
} from './router';

// Re-export base ExtensionDomain constants
export {
  screenDomain,
  sidebarDomain,
  popupDomain,
  overlayDomain,
} from './base-domains';
