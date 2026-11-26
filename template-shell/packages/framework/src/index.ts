/**
 * @gears-frontx/framework - FrontX Framework Package
 *
 * This is the MAIN barrel: the React/plugins surface. It provides:
 * - Plugin architecture for composable FrontX applications (`createFrontX`,
 *   presets, plugins)
 * - The theme registry
 * - Presets for common configurations
 * - Re-exports from @gears-frontx/state, @gears-frontx/api, @gears-frontx/i18n,
 *   @gears-frontx/auth for convenience
 *
 * Nothing it exports reaches @gears-frontx/mfes at runtime. The MFE runtime
 * lives on the `@gears-frontx/framework/mfe` subpath so a consumer of the main
 * barrel does not transitively reach the MFE registry/loader/mediator:
 * - `@gears-frontx/framework/mfe` — the MFE runtime (registry factory, mount
 *   strategies, bridge classes, MFE types, handler, utilities) and the MFE
 *   host plugin `microfrontends()` with its actions, selectors and state types.
 * The package is type-system agnostic: it depends only on the abstract
 * `TypeSystemPlugin` contract of `@gears-frontx/mfes`, and names no concrete
 * type system, type ID, schema or instance. The type system, its IDs and the
 * domain declarations belong to the application template.
 * Test utilities that reach the MFE runtime (`TestContainerProvider`) live on
 * `@gears-frontx/framework/testing`.
 *
 * Framework Layer: L2 (Depends on all SDK packages)
 */

// ============================================================================
// Core Exports
// ============================================================================

export { createFrontX } from './createFrontX';

// ============================================================================
// Plugin Exports
// ============================================================================

export {
  themes,
  i18n,
  effects,
  auth,
  AuthEvents,
  frontxApiTransport,
  type AuthLoggedInPayload,
  type AuthLoggedOutPayload,
  type AuthPluginConfig,
  type AuthRuntime,
  type AuthTransportBinding,
  type AuthTransportBinder,
  type FrameworkTransportErrorEvent,
  type Hai3ApiAuthTransportConfig,
  queryCache,
  queryCacheShared,
  subscribeQueryCacheRuntimeChanged,
  readQueryCacheScopeGeneration,
  recordQueryCacheScopeWriteDropped,
  mock,
  type MockPluginConfig,
  type QueryCacheConfig,
} from './plugins';

// Auth contract types (re-exported from @gears-frontx/auth)
export type {
  AuthProvider,
  AuthSession,
  AuthContext,
  AuthCheckResult,
  AuthLoginInput,
  AuthCallbackInput,
  AuthTransition,
  AuthPermissions,
  AuthIdentity,
  AccessRecord,
  AccessQuery,
  AccessDecision,
  AccessConstraint,
  AccessEvaluation,
  AccessReason,
  AuthCapabilities,
  AuthCapabilitiesResolved,
  AuthState,
  AuthStateEvent,
  AuthStateListener,
  AuthUnsubscribe,
} from '@gears-frontx/auth';

// ============================================================================
// Preset Exports
// ============================================================================

export { presets, full, minimal, type FullPresetConfig } from './presets';

// ============================================================================
// Registry Exports
// ============================================================================

export {
  createThemeRegistry,
  FRONTX_THEME_HOST_ATTRIBUTE,
} from './registries';

// ============================================================================
// Type Exports
// ============================================================================

export type {
  FrontXConfig,
  FrontXPlugin,
  FrontXActions,
  FrontXAppBuilder,
  FrontXApp,
  FrontXAppGuarantees,
  PluginFactory,
  PluginProvides,
  PluginLifecycle,
  ThemeRegistry,
  ThemeConfig,
  Preset,
  Presets,
  ThemesConfig,
  ChangeThemePayload,
  SetLanguagePayload,
} from './types';

// ============================================================================
// Re-exports from SDK packages for convenience
// ============================================================================

// From @gears-frontx/state (unified Flux dataflow pattern)
export { eventBus, createStore, getStore, registerSlice, hasSlice, createSlice } from '@gears-frontx/state';
export type {
  EventBus,
  ReducerPayload,
  EventPayloadMap,
  EventHandler,
  Subscription,
  RootState,
  AppDispatch,
  SliceObject,
  EffectInitializer,
} from '@gears-frontx/state';

// Re-export FrontXStore from types (wrapped version)
export type { FrontXStore } from './types';

// App-level slices
export {
  // Mock slice
  mockSlice,
  mockActions,
  setMockEnabled,
} from './slices';

// Mock state type
export type { MockState } from './slices/mockSlice';

// Mock effects and events
export {
  initMockEffects,
  toggleMockMode,
  MockEvents,
} from './effects/mockEffects';
export type { MockTogglePayload } from './effects/mockEffects';

// From @gears-frontx/api
export {
  apiRegistry,
  BaseApiService,
  RestProtocol,
  RestEndpointProtocol,
  SseProtocol,
  SseStreamProtocol,
  // Plugin base classes
  ApiPluginBase,
  ApiPlugin,
  ApiProtocol,
  RestPlugin,
  RestPluginWithConfig,
  SsePlugin,
  SsePluginWithConfig,
  resetSharedFetchCache,
  // Type guards
  isShortCircuit,
  isRestShortCircuit,
  isSseShortCircuit,
  // Mock plugin identification
  MOCK_PLUGIN,
  isMockPlugin,
} from '@gears-frontx/api';
export type {
  MockMap,
  ApiServiceConfig,
  JsonValue,
  JsonObject,
  JsonPrimitive,
  JsonCompatible,
  SseProtocolConfig,
  RestProtocolConfig,
  // Plugin context types (class-based plugin system)
  ApiRequestContext,
  ApiResponseContext,
  ShortCircuitResponse,
  PluginClass,
  ProtocolClass,
  ProtocolPluginType,
  BasePluginHooks,
  // Protocol-specific types
  RestPluginHooks,
  SsePluginHooks,
  RestRequestContext,
  RestResponseContext,
  ApiPluginErrorContext,
  SseConnectContext,
  EventSourceLike,
  RestShortCircuitResponse,
  SseShortCircuitResponse,
  // Endpoint descriptor types (consumed by useApiQuery / useApiMutation at L3)
  EndpointOptions,
  EndpointDescriptor,
  ParameterizedEndpointDescriptor,
  MutationDescriptor,
  // Stream descriptor types (consumed by useApiStream at L3)
  StreamDescriptor,
  StreamStatus,
} from '@gears-frontx/api';
// Protocol-specific mock plugins (RestMockPlugin, SseMockPlugin, MockEventSource)
// are not part of this package: they live in the shell's own `src/api/`.

// From @gears-frontx/i18n
export { i18nRegistry, I18nRegistryImpl, createI18nRegistry, Language, SUPPORTED_LANGUAGES, getLanguageMetadata, TextDirection, LanguageDisplayMode } from '@gears-frontx/i18n';
export type { I18nConfig, TranslationLoader, TranslationMap, TranslationDictionary, LanguageMetadata, I18nRegistry as I18nRegistryType } from '@gears-frontx/i18n';

// Formatters (locale from i18nRegistry.getLanguage())
export {
  formatDate,
  formatTime,
  formatDateTime,
  formatRelative,
  formatNumber,
  formatPercent,
  formatCompact,
  formatCurrency,
  compareStrings,
  createCollator,
  type DateFormatStyle,
  type TimeFormatStyle,
  type DateInput,
} from '@gears-frontx/i18n';
export type { Formatters } from '@gears-frontx/i18n';

// Backward compatibility aliases
// I18nRegistry type (capital I) - alias for consistency with old @gears-frontx/uicore API
export { I18nRegistryImpl as I18nRegistry } from '@gears-frontx/i18n';

// Backward compatibility constants
export {
  ACCOUNTS_DOMAIN,
} from './compat';

// ============================================================================
// Test utilities (subset re-export; full API: `@gears-frontx/framework/testing`)
// ============================================================================

export { resetSharedQueryClient } from './plugins/queryCache';

// ============================================================================
// Migration Helpers (for @gears-frontx/uicore backward compatibility)
// ============================================================================

export {
  createLegacySelector,
  setDeprecationWarnings,
  isDeprecationWarningsEnabled,
  hasLegacyUicoreState,
  STATE_PATH_MAPPING,
} from './migration';

export type {
  LegacyUicoreState,
  LegacyRootState,
  Selector,
} from './migration';
