/**
 * Plugin exports
 */

export { themes } from './themes';
export { layout } from './layout';
export { i18n } from './i18n';
export { effects } from './effects';
export {
  auth,
  frontxApiTransport,
  type AuthPluginConfig,
  type AuthRuntime,
  type AuthTransportBinding,
  type AuthTransportBinder,
  type Hai3ApiAuthTransportConfig,
} from './auth';
export { mock, type MockPluginConfig } from './mock';
export {
  queryCache,
  queryCacheShared,
  subscribeQueryCacheRuntimeChanged,
  type QueryCacheConfig,
} from './queryCache';
export {
  microfrontends,
  // MFE actions
  loadExtension,
  mountExtension,
  unmountExtension,
  registerExtension,
  unregisterExtension,
  // MFE slice and selectors
  selectExtensionState,
  selectRegisteredExtensions,
  selectMountedExtensions,
  selectExtensionError,
  // Types
  type MfeState,
  type ExtensionRegistrationState,
  type RegisterExtensionPayload,
  type UnregisterExtensionPayload,
  type MicrofrontendsConfig,
  // FrontX layout domain constants
  FRONTX_POPUP_DOMAIN,
  FRONTX_SIDEBAR_DOMAIN,
  FRONTX_SCREEN_DOMAIN,
  FRONTX_OVERLAY_DOMAIN,
  // Base ExtensionDomain constants
  screenDomain,
  sidebarDomain,
  popupDomain,
  overlayDomain,
  // The app-facing router handle type (ADR 0036) — `FrameworkRouter` itself
  // stays internal to this plugin, never exported. The framework-internal
  // reach-through functions (`buildExtensionHistory`, `startRoutedDomain`,
  // `stopRoutedDomain`, `teardownRoutedDomain`, `routedDomainStatus`,
  // `subscribeRoutedDomainStatus`) are NOT re-exported here — only through
  // this package's `./internal` subpath (`src/internal.ts`); never part of
  // `app.mfeRouter`, never MFE-reachable.
  type MfeRouterHandle,
} from './microfrontends';
