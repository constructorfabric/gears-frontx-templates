/**
 * Plugin exports (main-barrel plugins)
 *
 * The MFE host plugin (`microfrontends()`) is not exported here: it reaches the
 * MFE runtime, so it lives on `@gears-frontx/framework/mfe` (see `../mfe.ts`).
 */

export { themes } from './themes';
export { i18n } from './i18n';
export { effects } from './effects';
export {
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
} from './auth';
export { mock, type MockPluginConfig } from './mock';
export {
  queryCache,
  queryCacheShared,
  subscribeQueryCacheRuntimeChanged,
  readQueryCacheScopeGeneration,
  recordQueryCacheScopeWriteDropped,
  type QueryCacheConfig,
} from './queryCache';
