/**
 * @gears-frontx/react - React Bindings
 *
 * This package provides:
 * - FrontXProvider context provider
 * - Type-safe hooks for state and actions
 *
 * The MFE context, hooks and components, the MFE runtime re-exports and the
 * MFE host plugin `microfrontends()` (with its actions, selectors and state
 * types) live on the `@gears-frontx/react/mfe` subpath. Nothing this main
 * barrel exports reaches it at runtime, so a consumer of the React bindings
 * alone never reaches the MFE runtime.
 *
 * The package is type-system agnostic: it names no concrete type system, type
 * ID, schema or instance. The type system, its IDs and the domain
 * declarations belong to the application template.
 *
 * Layer: L3 (Depends on @gears-frontx/framework)
 */

// ============================================================================
// Provider
// ============================================================================

export { FrontXProvider } from './FrontXProvider';
export { FrontXContext, useFrontX } from './FrontXContext';
export { invalidateQueryCacheForApp } from './queryClient';
export { CanAccess } from './components/CanAccess';
export type { CanAccessProps } from './types';

// ============================================================================
// Hooks
// ============================================================================

export {
  useAppDispatch,
  useAppSelector,
  useTranslation,
  useScreenTranslations,
  useFormatters,
  useTheme,
  useApiQuery,
  useApiSuspenseQuery,
  useApiInfiniteQuery,
  useApiSuspenseInfiniteQuery,
  useApiMutation,
  useApiStream,
  useQueryCache,
} from './hooks';
export { useCanAccess } from './hooks/useCanAccess';

export type { ApiQueryOverrides, ApiSuspenseQueryOverrides } from './hooks/useApiQuery';
export type {
  ApiInfiniteQueryOptions,
  ApiSuspenseInfiniteQueryOptions,
  ApiInfiniteQueryPageContext,
} from './hooks/useApiInfiniteQuery';
export type { UseApiMutationOptions } from './hooks/useApiMutation';
export type { ApiStreamOptions, ApiStreamResult } from './hooks/useApiStream';
export type {
  QueryCache,
  QueryCacheInvalidateFilters,
  QueryCacheState,
  MutationCallbackContext,
} from './hooks/QueryCache';

// ============================================================================
// Type Exports
// ============================================================================

export type {
  FrontXProviderProps,
  UseFrontXReturn,
  UseAppSelector,
  UseAppDispatchReturn,
  UseTranslationReturn,
  UseScreenTranslationsReturn,
  UseFormattersReturn,
  UseThemeReturn,
  ApiQueryResult,
  ApiSuspenseQueryResult,
  ApiInfiniteQueryResult,
  ApiSuspenseInfiniteQueryResult,
  ApiMutationResult,
  UseCanAccessResult,
} from './types';

// ============================================================================
// Re-exports from @gears-frontx/framework for convenience
// ============================================================================

// These re-exports allow users to import everything from @gears-frontx/react
// without needing to import from @gears-frontx/framework directly

export {
  // Core
  createFrontX,
  presets,

  // Backward compatibility constants
  ACCOUNTS_DOMAIN,

  // I18nRegistry class (capital I for backward compat)
  I18nRegistry,

  // Plugins
  themes,
  i18n,
  effects,
  queryCache,
  queryCacheShared,
  subscribeQueryCacheRuntimeChanged,
  mock,

  // Registries
  createThemeRegistry,
  FRONTX_THEME_HOST_ATTRIBUTE,

  // Flux (Event bus + Store)
  // NOTE: eventBus is re-exported separately below with augmented EventPayloadMap type

  // Store
  createStore,
  getStore,
  registerSlice,
  hasSlice,
  createSlice,

  // Mock (app-level)
  mockSlice,
  mockActions,
  setMockEnabled,
  // Mock effects and events
  initMockEffects,
  toggleMockMode,
  MockEvents,

  // Auth
  auth,
  AuthEvents,
  frontxApiTransport,

  // API
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
  // Type guards
  isShortCircuit,
  isRestShortCircuit,
  isSseShortCircuit,
  // Mock plugin identification
  MOCK_PLUGIN,
  isMockPlugin,

  // I18n
  i18nRegistry,
  I18nRegistryImpl,
  createI18nRegistry,
  SUPPORTED_LANGUAGES,
  getLanguageMetadata,
} from '@gears-frontx/framework';

// Re-export i18n types from @gears-frontx/framework (correct layer access)
export { Language, TextDirection, LanguageDisplayMode } from '@gears-frontx/framework';

// Re-export types from @gears-frontx/framework
export type {
  // Config
  FrontXConfig,
  FrontXPlugin,
  FrontXActions,
  FrontXAppBuilder,
  FrontXApp,
  // Endpoint descriptors — L3 components import from @gears-frontx/react
  EndpointOptions,
  EndpointDescriptor,
  ParameterizedEndpointDescriptor,
  MutationDescriptor,
  // Stream descriptors
  StreamDescriptor,
  StreamStatus,
  PluginFactory,
  PluginProvides,
  PluginLifecycle,
  ThemeRegistry,
  ThemeConfig,
  Preset,
  Presets,
  ChangeThemePayload,
  SetLanguagePayload,
  AuthPluginConfig,
  AuthRuntime,
  FrameworkTransportErrorEvent,
  AuthLoggedInPayload,
  AuthLoggedOutPayload,

  // Auth contract types
  AuthProvider,
  AuthSession,
  AuthContext,
  AuthCheckResult,
  AuthLoginInput,
  AuthCallbackInput,
  AuthTransition,
  AuthPermissions,
  AccessQuery,
  AccessDecision,
  AuthCapabilities,
  AuthState,
  AuthStateEvent,
  AuthStateListener,
  AuthUnsubscribe,

  // Flux (Events + Store)
  EventHandler,
  Subscription,

  // Store
  RootState,
  AppDispatch,
  SliceObject,
  FrontXStore,
  ReducerPayload,

  // Mock types
  MockState,
  MockTogglePayload,

  // API
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

  // I18n
  I18nConfig,
  TranslationLoader,
  TranslationMap,
  TranslationDictionary,
  LanguageMetadata,
  I18nRegistryType,
} from '@gears-frontx/framework';

// ============================================================================
// Module Augmentation Support - EventPayloadMap Re-declaration
// ============================================================================

/**
 * Re-declare EventPayloadMap to enable module augmentation on @gears-frontx/react
 *
 * This creates a new declaration site in @gears-frontx/react that TypeScript can augment.
 * App-layer code uses `declare module '@gears-frontx/react'` instead of importing
 * from L1 packages directly, maintaining proper layer architecture.
 *
 * ARCHITECTURE: This pattern allows L3+ code to augment event types without
 * violating layer boundaries by importing from L1 (@gears-frontx/state).
 *
 * IMPORTANT: We must also re-export eventBus with the augmented type to ensure
 * type safety. The eventBus instance uses this augmented EventPayloadMap.
 *
 * @example
 * ```typescript
 * // In app-layer code (e.g., src/app/events/bootstrapEvents.ts)
 * import '@gears-frontx/react';
 *
 * declare module '@gears-frontx/react' {
 *   interface EventPayloadMap {
 *     'app/user/fetch': void;
 *     'app/user/loaded': { user: ApiUser };
 *   }
 * }
 * ```
 */
import type { EventPayloadMap as FrameworkEventPayloadMap } from '@gears-frontx/framework';

export interface EventPayloadMap extends FrameworkEventPayloadMap { }

/**
 * Re-export eventBus with augmented EventPayloadMap type.
 * This ensures that code importing eventBus from @gears-frontx/react gets
 * type-safe access to both framework events and app-layer augmented events.
 * Defined in its own module so this barrel stays pure (re-exports only).
 */
export { eventBus } from './eventBus';
