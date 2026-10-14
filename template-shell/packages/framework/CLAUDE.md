# @gears-frontx/framework

Plugin-based application framework for FrontX applications. Orchestrates SDK packages into cohesive applications with MFE (Microfrontend) support.

## Framework Layer

This package is part of the **Framework Layer (L2)** - it depends on SDK packages (@gears-frontx/state, @gears-frontx/mfes, @gears-frontx/gts-plugin, @gears-frontx/api, @gears-frontx/i18n). It provides the plugin architecture and **owns the layout slices** (header, footer, menu, sidebar, screen, popup, overlay).

> **NOTE:** @gears-frontx/uicore is deprecated. Layout slices are defined in @gears-frontx/framework.

## Core Concepts

### Plugin Architecture

Build the application by composing plugins. A runtime builds exactly one app, so the compositions below are alternatives: choose one per runtime.

```typescript
// Alternative: an explicit plugin list.
import { createFrontX, effects, themes, layout, i18n } from '@gears-frontx/framework';

const app = createFrontX()
  .use(effects())
  .use(themes())
  .use(layout())
  .use(i18n())
  .build();
```

### Presets

Pre-configured plugin arrays, passed to `.useAll(...)`. `full()` contains effects, themes, layout, i18n, the query cache, and mock; it adds `microfrontends()` only when `config.microfrontends` is supplied and `auth()` only when `config.auth` is supplied. `minimal()` contains themes only. There is no other preset. Each example below is an alternative: choose one per runtime.

```typescript
import { createFrontX, presets } from '@gears-frontx/framework';

// Alternative: the full preset, with microfrontends support
const fullApp = createFrontX()
  .useAll(presets.full({ microfrontends: config }))
  .build();

// Alternative: the minimal preset (themes only)
const minimalApp = createFrontX()
  .useAll(presets.minimal())
  .build();
```

### Available Plugins

| Plugin | Provides | Dependencies |
|--------|----------|--------------|
| `themes()` | themeRegistry, changeTheme action | - |
| `layout()` | header, footer, menu, sidebar, popup, overlay state | - |
| `microfrontends()` | `mfeRegistry` (MFE-enabled), MFE actions, selectors, domain constants | - |
| `i18n()` | i18nRegistry, setLanguage action | - |
| `effects()` | Core effect coordination | - |
| `queryCache()` | Host-owned shared `QueryClient` lifecycle, Flux `cache/*` events, clearing on mock mode, tenant or session change and on destroy, L1 `sharedFetchCache` retain/release and invalidation sync | - |
| `queryCacheShared()` | Joins the host `QueryClient` from `queryCache()` for MFE / child roots (no second client) | host `queryCache()` runtime must exist |
| `mock()` | mockSlice, toggleMockMode action | effects |
| `auth()` | `app.auth` (provider wrapper, fail-closed access checks), REST transport binding. `app.auth.logout()` emits `AuthEvents.LoggedOut` once the provider call settles, also when it rejects (the error is rethrown); `app.auth.handleCallback()` emits `AuthEvents.LoggedIn` once the provider call resolves, and `app.auth.login()` once it resolves to anything but a redirect (the callback emits for a redirect flow); neither emits when the call rejects; a call made on the provider directly emits nothing. The plugin also follows session changes the provider makes on its own and fails closed: an extra clear costs a refetch, a missed one shows one account's data to another, so it stays silent only when a report is positively the same signed-in state and identity (`getIdentity().sub`) as the last known one; the same `sub` means the same data owner, so new credentials or claims for the same account do not clear. It subscribes to `provider.subscribe` on init (unsubscribes on destroy); `app.auth.refresh()` and the 401 refresh retry report once the refresh settles (no session counts as `unauthenticated`), and the retry waits for the report. The 401 retry stops refreshing after 2 refreshes with no 2xx response in between: further 401s fail without a refresh for 30 seconds or until a request succeeds, so a server that rejects every refreshed session cannot drive a refresh loop. A report of `unauthenticated` emits `LoggedOut` unless the last known state was already signed out; a report of `authenticated` emits `LoggedIn` after a signed-out or unknown state, or when it lands on a `getIdentity().sub` other than the last known one. An unknown identity counts as a change: a `getIdentity()` that rejects, resolves without a `sub` or takes longer than 5 seconds during an authenticated session emits `LoggedIn`, and so does a refresh that rejects while signed in. It clears once per unknown identity: while the identity stays unknown, further failed lookups and rejected refreshes emit nothing, until a state transition, a login, callback or logout, or a lookup that finds a known identity, which emits once more. A report of a signed-in session that goes on emits `AuthEvents.SessionCheck` before its identity lookup starts, so the query cache moves its scope generation at once (nothing is cleared) and mutation callbacks started earlier cannot write while the lookup runs. A refresh that resolves while another session check (the init read or an identity lookup) is still running is not checked, since that check may itself wait on the refreshed request: it counts as an unknown identity. On init the plugin reads `checkAuth()` and `getIdentity()` (each bounded by the same 5 seconds) to set the baseline without emitting, a signed-out result included; provider reports wait for it, a failed read leaves the state unknown so the first report clears, and a login or logout made before the read completes wins over it. Reports are ordered by when their work started: one that resolves after a newer report was applied is ignored, except a report of no session while signed in, which always emits `LoggedOut`, and an identity lookup overtaken by a newer report is dropped; `loading` and `error` states are ignored. While `login()`, `handleCallback()` or `logout()` runs, provider reports emit nothing and the call's own event is the single clear (a login that rejects or redirects replays the last report it held back); the call then records the state it emitted for. After any clear for a session start (a login, a callback or a report), the identity lookup started with it sets the baseline silently, but a report that arrives after the clear and before that lookup lands counts as a change, since the account may have switched in between: its lookup emits `LoggedIn`. So a provider echo of a login that arrives after the call ended clears the cache once more; this is accepted by design. After destroy nothing is emitted, from any path (a report, or a login, callback or logout that settles later), and running session checks are cancelled with their timers. A provider without `getIdentity` gets state-transition signals only: an account switch without a state change is not detected until `AuthStateEvent` carries an identity. A custom transport binder that refreshes on its own calls the `trackRefresh` argument when the refresh starts and awaits the returned function with the outcome (`{ session }` or `{ rejected }`) before retrying | - |

### Query Cache Plugin

The `queryCache()` plugin owns the shared **headless TanStack Query `QueryClient`** (`@tanstack/query-core` peer) and bridges it to L1 transport dedup: it **retains** the global `sharedFetchCache` from `@gears-frontx/api` for the app lifetime and **keeps it aligned** with Flux-driven cache events. It's included in the `full()` preset by default:

```typescript
import { createFrontX, presets } from '@gears-frontx/framework';

// Alternative: the full preset includes the queryCache plugin automatically
const app = createFrontX().useAll(presets.full()).build();

// The plugin attaches the shared QueryClient to the app for React bindings
// and shared child roots via queryCacheShared().

// Cache is cleared when mock mode or the tenant changes and on login and logout
// (query cache + shared fetch layer)
// Flux effects can drive cache via eventBus, e.g.:
//   eventBus.emit('cache/invalidate', { queryKey })
//   eventBus.emit('cache/set', { queryKey, dataOrUpdater })
//   eventBus.emit('cache/remove', { queryKey })
```

For custom plugin compositions (an alternative to the preset above; choose one per runtime):

```typescript
import { createFrontX, queryCache } from '@gears-frontx/framework';

const app = createFrontX()
  .use(queryCache({ staleTime: 60_000, gcTime: 600_000 }))
  .build();
```

The plugin:
- Creates or joins a shared `QueryClient` with configurable defaults (`staleTime`, `gcTime`, `retry: 0`, `refetchOnWindowFocus`)
- Calls `retainSharedFetchCache()` on init and `releaseSharedFetchCache()` after teardown on destroy (balances in-flight shared fetch retention)
- When the cache scope changes (host `queryCache()` only): synchronously cancels queries (in-flight results never land), resets every query so mounted screens drop the old data at once and refetch under the new scope, clears the shared `QueryClient`, then clears `peekSharedFetchCache()` when present; nothing waits for cancellation to settle, so data written after the change survives. The scope is mock mode (`MockEvents.Toggle`), the tenant (`TenantEvents.Changed`, `TenantEvents.Cleared`) and the session (`AuthEvents.LoggedIn`, `AuthEvents.LoggedOut`). `AuthEvents.SessionCheck` only bumps the scope generation, without clearing. An event that repeats the scope already in force is ignored: a toggle to the mode already in force, a tenant change to the same tenant id, a tenant clear with no tenant set. Every login and logout clears. A change made while only `queryCacheShared()` runtimes hold the client is cleared by the next host `queryCache()` that joins. Each change also bumps the client's scope generation (`readQueryCacheScopeGeneration()`), whether it clears at once or is deferred; `useApiMutation` callbacks get a `queryCache` whose writes do nothing once it moved past the value at the mutation's start, so an old-scope response or snapshot never lands in the new cache. Nothing else is scope-bound: a `useQueryCache()` handle, the raw `QueryClient`, `cache/*` eventBus emits and per-call `mutate(vars, { onSuccess })` options write to whatever scope is current, so a write after an `await` or inside a mutation callback must go through the callback's `queryCache`
- Subscribes to `cache/invalidate`, `cache/set`, and `cache/remove` — updates the shared `QueryClient` **and** mirrors invalidation to `sharedFetchCache` for matching keys (avoiding stale transport dedup vs React observers)
- Attaches the shared `QueryClient` to each app instance so `@gears-frontx/react` can resolve it internally
- On destroy: unsubscribes listeners, cancels and clears the client when the last retainer is released, then releases shared-fetch retention

`@tanstack/query-core` is a peer dependency of `@gears-frontx/framework` (React bindings remain in `@gears-frontx/react`).

### Mock Mode Control

The `mock()` plugin provides centralized mock mode control. It's included in the `full()` preset by default, so apps don't need manual setup:

```typescript
import { createFrontX, presets } from '@gears-frontx/framework';

// Alternative: the full preset includes the mock plugin automatically
const app = createFrontX().useAll(presets.full()).build();

// Toggle mock mode via actions (used by FrontX Studio ApiModeToggle)
app.actions.toggleMockMode(true);  // Activates all registered mock plugins
app.actions.toggleMockMode(false); // Deactivates all registered mock plugins
```

For custom plugin compositions (an alternative; choose one per runtime):

```typescript
import { createFrontX, effects, mock } from '@gears-frontx/framework';

const app = createFrontX()
  .use(effects())  // Required dependency
  .use(mock())     // Automatic mock mode control
  .build();
```

Services register mock plugins using `registerPlugin()` in their constructor. The framework automatically manages plugin activation based on mock mode state.

### Built Application

After calling `.build()`, access registries and actions through `app.*`. The MFE-enabled `mfeRegistry` is available when the build includes `microfrontends()` (for example, `createFrontX().useAll(presets.full({ microfrontends: config }))`):

```typescript
const app = createFrontX().useAll(presets.full({ microfrontends: config })).build();

// Access MFE-enabled registry
app.mfeRegistry.registerDomain(screenDomain, containerProvider);
await app.mfeRegistry.registerExtension(homeExtension);

// executeActionsChain is acceptance-only: it returns void, never throws,
// and never yields a promise to await for the chain's own execution.
app.mfeRegistry.executeActionsChain({
  action: { type: FRONTX_ACTION_MOUNT_EXT, target: 'screen', payload: { subject: 'home' } }
});

// Access other registries
app.themeRegistry.getCurrent();
app.i18nRegistry.t('common:title');

// Access store
const state = app.store.getState();
app.store.dispatch(someAction);

// Access MFE actions
app.actions.loadExtension('home');
app.actions.mountExtension('home');
app.actions.unmountExtension('home');
app.actions.registerExtension(homeExtension);
app.actions.unregisterExtension('home');

// Access theme and i18n actions
app.actions.changeTheme({ themeId: 'dark' });
app.actions.setLanguage({ language: 'es' });

// Cleanup
app.destroy();
```

## MFE Plugin

The `microfrontends()` plugin provides the MFE-enabled `mfeRegistry` plus the MFE action surface:

### MFE Actions

```typescript
import {
  loadExtension,
  mountExtension,
  unmountExtension,
  registerExtension,
  unregisterExtension,
} from '@gears-frontx/framework';

// loadExtension/mountExtension/unmountExtension are fire-and-forget: each
// dispatches an actions chain through the registry and returns nothing to
// await (`executeActionsChain` returns void). The helpers themselves throw
// synchronously for an unregistered extension or domain, or a missing plugin.

// Load extension code
loadExtension('home');

// Mount extension into domain
mountExtension('home');

// Unmount extension from domain
unmountExtension('home');

// Register/unregister extensions dynamically
registerExtension(homeExtension);
unregisterExtension('home');
```

### MFE Selectors

```typescript
import {
  selectExtensionState,
  selectRegisteredExtensions,
  selectExtensionError,
} from '@gears-frontx/framework';

// Get extension state
const extensionState = selectExtensionState(state, 'home');

// Get all registered extensions
const extensions = selectRegisteredExtensions(state);

// Get extension error
const error = selectExtensionError(state, 'home');
```

### Domain Constants

```typescript
import {
  FRONTX_SCREEN_DOMAIN,
  FRONTX_SIDEBAR_DOMAIN,
  FRONTX_POPUP_DOMAIN,
  FRONTX_OVERLAY_DOMAIN,
  screenDomain,
  sidebarDomain,
  popupDomain,
  overlayDomain,
} from '@gears-frontx/framework';

// String constants (GTS instance IDs)
FRONTX_SCREEN_DOMAIN   // 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.screen.v1'
FRONTX_SIDEBAR_DOMAIN  // 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.sidebar.v1'
FRONTX_POPUP_DOMAIN    // 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.popup.v1'
FRONTX_OVERLAY_DOMAIN  // 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.overlay.v1'

// Domain objects (ExtensionDomain interface: id, actions, extensionsActions,
// sharedProperties, defaultActionTimeout, lifecycleStages, extensionsLifecycleStages,
// extensionsTypeId, lifecycle)
screenDomain   // screen: swap semantics (load_ext, mount_ext only, NO unmount_ext)
sidebarDomain  // sidebar: toggle semantics (load_ext, mount_ext, unmount_ext)
popupDomain    // popup: toggle semantics (load_ext, mount_ext, unmount_ext)
overlayDomain  // overlay: toggle semantics (load_ext, mount_ext, unmount_ext)
```

### Action and Property Constants

```typescript
import {
  FRONTX_ACTION_LOAD_EXT,
  FRONTX_ACTION_MOUNT_EXT,
  FRONTX_ACTION_UNMOUNT_EXT,
  FRONTX_SHARED_PROPERTY_THEME,
  FRONTX_SHARED_PROPERTY_LANGUAGE,
} from '@gears-frontx/framework';

// Action IDs
FRONTX_ACTION_LOAD_EXT     // 'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.load_ext.v1~'
FRONTX_ACTION_MOUNT_EXT    // 'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.mount_ext.v1~'
FRONTX_ACTION_UNMOUNT_EXT  // 'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.unmount_ext.v1~'

// Shared property IDs
FRONTX_SHARED_PROPERTY_THEME    // 'gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.theme.v1~'
FRONTX_SHARED_PROPERTY_LANGUAGE // 'gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.language.v1~'
```

## Creating Custom Plugins

Extend FrontX with custom functionality:

```typescript
import type { FrontXPlugin } from '@gears-frontx/framework';

export function myPlugin(): FrontXPlugin {
  return {
    name: 'my-plugin',
    dependencies: ['effects'], // Optional dependencies
    provides: {
      registries: { myRegistry: createMyRegistry() },
      slices: [mySlice],
      effects: [initMyEffects],
      actions: { myAction: myActionHandler },
    },
    onInit(app) {
      // Initialize after app is built
    },
    onDestroy(app) {
      // Cleanup when app is destroyed
    },
  };
}
```

## Key Rules

1. **Use presets for common cases** - `createFrontX().useAll(presets.full({ microfrontends: config }))` for full apps with MFE support; build one app per runtime
2. **Compose plugins for customization** - Use `createFrontX().use()` pattern
3. **Dependencies are auto-resolved** - Plugin order doesn't matter
4. **Access via app instance** - All registries and actions on `app.*`
5. **NO React in this package** - Framework is headless, use @gears-frontx/react for React bindings
6. **MFE is the primary architecture** - Use `mfeRegistry` for domain/extension management when the app includes `microfrontends()`

## Re-exports

For convenience, this package re-exports from SDK packages:

- From @gears-frontx/state: `eventBus`, `createStore`, `getStore`, `registerSlice`, `hasSlice`, `createSlice`
- From @gears-frontx/mfes: `Extension`, `ScreenExtension`, `ExtensionDomain`, `MfeHandler`, `MfeBridgeFactory`, `ParentMfeBridge`, `ChildMfeBridge`, action constants, contracts/types
- From @gears-frontx/gts-plugin: `gtsPlugin`, `JSONSchema`
- From @gears-frontx/api: `apiRegistry`, `BaseApiService`, `RestProtocol`, `SseProtocol`, `MOCK_PLUGIN`, `isMockPlugin`, `StreamDescriptor`, `StreamStatus`
- From @gears-frontx/i18n: `i18nRegistry`, `Language`, `SUPPORTED_LANGUAGES`, `getLanguageMetadata`

**Layout Slices (owned by @gears-frontx/framework):**
- `layoutReducer`, `layoutDomainReducers`, `LAYOUT_SLICE_NAME`
- Domain slices: `headerSlice`, `footerSlice`, `menuSlice`, `sidebarSlice`, `screenSlice`, `popupSlice`, `overlaySlice`
- Domain actions: `headerActions`, `footerActions`, `menuActions`, `sidebarActions`, `screenActions`, `popupActions`, `overlayActions`
- Individual reducer functions: `setMenuCollapsed`, `toggleSidebar`, `setActiveScreen`, etc.

**MFE Exports:**
- `MfeHandlerMF` - Concrete MFE handler for Module Federation
- `gtsPlugin` - GTS (Global Type System) plugin for type validation
- `createShadowRoot`, `injectCssVariables` - Shadow DOM utilities

**NOTE:** `createAction` is NOT exported to consumers. Actions should be handwritten functions in extensions that contain business logic and emit events via `eventBus.emit()`.

**NOTE:** "Selector" is Redux terminology and is not used in FrontX. Access state via `useAppSelector` hook from @gears-frontx/react:
```typescript
const menu = useAppSelector((state: RootStateWithLayout) => state.layout.menu);
```

## Exports

### Core
- `createFrontX` - App builder factory
- `presets` - Available presets (full, minimal)

### Plugins
- `themes`, `layout`, `microfrontends`, `i18n`, `effects`, `queryCache`, `queryCacheShared`, `mock`

### Registries
- `createThemeRegistry` - Theme registry factory

### Types
- `FrontXConfig`, `FrontXPlugin`, `FrontXApp`, `FrontXAppBuilder`
- `PluginFactory`, `PluginProvides`, `PluginLifecycle`
- `Preset`, `Presets`
- All re-exported types from SDK packages

## Testing Subpath (`@gears-frontx/framework/testing`)

The `./testing` subpath exposes Vitest-based helpers — `TestContainerProvider` (factory adapter for MFE domain registration in tests), shared `QueryClient` peek hooks, and `resetSharedQueryClient` for inter-test teardown.

- `vitest` is an **optional** peer dependency. Production apps that never import `@gears-frontx/framework/testing` do **not** need to install or pin `vitest`.
- Projects that import from `@gears-frontx/framework/testing` **must** install `vitest` at a version compatible with the range declared in this package's `peerDependencies` (currently pinned to `4.1.4`).
- The `./testing` entry is runtime-isolated from the main entry; importing the default entry does not pull `vitest` into the production bundle.

## Migration from Legacy API

The legacy screenset navigation API has been removed. FrontX now uses the MFE architecture exclusively:

### Removed APIs
- `screensetRegistry` (replaced by `mfeRegistry`)
- `createScreensetRegistry()` (replaced by `MfeRegistry` class)
- `navigation()` plugin (replaced by MFE actions)
- `routing()` plugin (replaced by extension route presentation)
- `routeRegistry` (replaced by extension route management)
- `navigateToScreen()` / `navigateToScreenset()` actions (replaced by `mountExtension()`)

### Migration Examples

**OLD**: Navigate to screen
```typescript
app.actions.navigateToScreen({ screensetId: 'demo', screenId: 'home' });
```

**NEW**: Mount extension
```typescript
app.actions.mountExtension('home');
```

**OLD**: Register screenset
```typescript
import { screensetRegistry, ScreensetDefinition } from '@gears-frontx/framework';

const screenset: ScreensetDefinition = {
  id: 'demo',
  name: 'Demo',
  category: ScreensetCategory.Production,
  defaultScreen: 'home',
  menu: [/* ... */],
};

screensetRegistry.register(screenset);
```

**NEW**: Register domain and extensions
```typescript
import type { ExtensionDomain, Extension } from '@gears-frontx/framework';

// Register domain
app.mfeRegistry.registerDomain(screenDomain, containerProvider);

// Register extensions
await app.mfeRegistry.registerExtension(homeExtension);
await app.mfeRegistry.registerExtension(profileExtension);
```

See the MFE migration guide in the project documentation for detailed migration steps.
