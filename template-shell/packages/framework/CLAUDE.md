# @gears-frontx/framework

Plugin-based application framework for FrontX applications. Orchestrates SDK packages into cohesive applications with MFE (Microfrontend) support.

## Framework Layer

This package is part of the **Framework Layer (L2)** - it depends on SDK packages (@gears-frontx/state, @gears-frontx/mfes, @gears-frontx/api, @gears-frontx/i18n). It is type-system agnostic: it depends only on the abstract `TypeSystemPlugin` contract of @gears-frontx/mfes and names no concrete type system, type ID, schema or domain instance - the application owns those and connects its type system itself. It provides the plugin architecture. It implements no layout business: the header, footer, menu, sidebar, popup and overlay state, its plugin and its actions belong to the application, which adds its own layout plugin.

## Core Concepts

### Plugin Architecture

Build the application by composing plugins. A runtime builds exactly one app, so the compositions below are alternatives: choose one per runtime.

```typescript
// Alternative: an explicit plugin list.
import { createFrontX, effects, themes, i18n } from '@gears-frontx/framework';

const app = createFrontX()
  .use(effects())
  .use(themes())
  .use(i18n())
  .build();
```

### Presets

Pre-configured plugin arrays, passed to `.useAll(...)`. `full()` contains effects, themes, i18n, the query cache, and mock; it adds `auth()` only when `config.auth` is supplied. It never contains the MFE host plugin: `microfrontends()` lives on `@gears-frontx/framework/mfe`, and a host (the shell, a nested-host MFE) adds it itself. It contains no layout plugin either: the application adds its own. `minimal()` contains themes only. There is no other preset. Each example below is an alternative: choose one per runtime.

```typescript
import { createFrontX, presets } from '@gears-frontx/framework';
import { microfrontends } from '@gears-frontx/framework/mfe';

// Alternative: the full preset, plus the MFE host plugin for an app that hosts MFEs
const fullApp = createFrontX()
  .useAll(presets.full())
  .use(microfrontends(config))
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
| `microfrontends()` (from `@gears-frontx/framework/mfe`) | `mfeRegistry` (MFE-enabled), MFE actions, selectors | - |
| `i18n()` | i18nRegistry, setLanguage action | - |
| `effects()` | Core effect coordination | - |
| `queryCache()` | Host-owned shared `QueryClient` lifecycle, Flux `cache/*` events, clearing on mock mode or session change and on destroy, L1 `sharedFetchCache` retain/release and invalidation sync | - |
| `queryCacheShared()` | Joins the host `QueryClient` from `queryCache()` for MFE / child roots (no second client) | host `queryCache()` runtime must exist |
| `mock()` | mockSlice, toggleMockMode action | effects |
| `auth()` | `app.auth` (provider wrapper, fail-closed access checks), REST transport binding. `auth({ provider, ... })` passes the page's session provider: the first one publishes the session runtime, with the provider's `frontxApi` config and custom binder and a contract version, in the `Symbol.for('frontx:auth:realm')` slot; `auth()` with no provider joins it, so every app of the page (shell or microfrontend, the plugin does not tell them apart) gets the same `app.auth`, its own REST transport bound for the provider in use alone (that provider, its config and its binder), and the `AuthEvents` on its own eventBus. No app keeps a provider of its own: `app.auth` reads the provider in use at call time. A later `auth({ provider })` in another app with the provider already in use joins it; with another provider it replaces the provider in use (the steps that call the new provider run first, so a throw there leaves the realm as it was): every app's bus hears `SessionCheck` at once and `LoggedIn` (a session) or `LoggedOut` (none, or a failed read) once the new provider's baseline lands, every transport is bound again for the new provider with its config, `app.auth.subscribe` listeners move (what the new provider tells them before the swap commits is held back, and dropped on a rollback), and the old provider retires at once with its settings: its tracking stops (its running checks are cancelled), it is destroyed (a `destroy()` that throws is logged), an old binding attaches no credentials and retries nothing, a request already running included, and a call on it that ends after the swap rejects (an access check resolves to deny). A development build (`process.env.NODE_ENV` is `development`) warns at every replacement, naming both providers and their origin lists, never a session or a token. That an old binding attaches nothing and retries nothing is the default transport's rule; a custom binder must stop its own pending work in `destroy()`, since the framework cannot stop a binder's own hooks. A custom binder gets the provider object passed to `auth({ provider })`; its `destroy()` runs when that provider is replaced. A join with no provider in the page, a provider that another one replaced in this realm (refused while the realm record exists, that is while any app holds the runtime; after the last release the record and its list are gone), a new provider passed from a callback of a replacement still running, any provider or join built from a callback of the first provider's publish (its binder or `subscribe`), and a record of another contract version throw in `onRegister`, before any side effect; a failure in `onInit` (a binder that throws, or a new provider that throws on `subscribe`) leaves the realm state as it was (a hook a binder registered before it threw is not undone), but that framework copy cannot build another app, since the builder has already counted the app as built; a second `auth({ provider })` in one app throws from `use()`. The provider in use lives while any app holds the runtime: destroying the app that passed it removes only that app's transport, and the last release unsubscribes, stops the session tracking and calls `provider.destroy()`. The binding sends credentials only to the app's own origin and to the origins the provider in use lists in its `frontxApi`: a cookie session's `withCredentials` and CSRF header to `frontxApi.allowedCookieOrigins`, a bearer session's `Authorization` header to `frontxApi.allowedBearerOrigins`, the retry after a 401 refresh included. A URL counts as the app's own by the origin the browser resolves it to, not by its prefix, so `/\host/x` goes to `host`. An app whose API is on another origin must list that origin, or its requests go without credentials. A 401 from an origin in neither list, and not the app's own, fails without a refresh and does not count toward the refresh limit. The check reads the URL `@gears-frontx/api` gives plugins, the service's `baseURL` joined with the path, while axios skips the `baseURL` for an absolute or `//` path. A URL with `http:` or `https:` in its path (one slash is enough; the query is not read) gets no credentials, which covers an absolute path; other `word:/` segments such as `/kv/key:/v` keep theirs, since axios sends no other scheme to another host; a `//` path does not show in the join, so until [constructorfabric/gears-frontx#770](https://github.com/constructorfabric/gears-frontx/issues/770) is fixed, pass only relative paths to a service with a `baseURL`. `app.auth.logout()` emits `AuthEvents.LoggedOut` once the provider call settles, also when it rejects (the error is rethrown); `app.auth.handleCallback()` emits `AuthEvents.LoggedIn` once the provider call resolves, and `app.auth.login()` once it resolves to anything but a redirect (the callback emits for a redirect flow); neither emits when the call rejects; a call made on the provider directly emits nothing. The plugin also follows session changes the provider makes on its own and fails closed: an extra clear costs a refetch, a missed one shows one account's data to another, so it stays silent only when a report is positively the same signed-in state and identity (`getIdentity().sub`) as the last known one; the same `sub` means the same data owner, so new credentials or claims for the same account do not clear. It subscribes to `provider.subscribe` on init (unsubscribes on the last release); `app.auth.refresh()` and the 401 refresh retry report once the refresh settles (no session counts as `unauthenticated`), and the retry waits for the report. The 401 retry stops refreshing after 2 refreshes with no 2xx response in between: further 401s fail without a refresh for 30 seconds or until a request succeeds, so a server that rejects every refreshed session cannot drive a refresh loop. A report of `unauthenticated` emits `LoggedOut` unless the last known state was already signed out; a report of `authenticated` emits `LoggedIn` after a signed-out or unknown state, or when it lands on a `getIdentity().sub` other than the last known one. An unknown identity counts as a change: a `getIdentity()` that rejects, resolves without a `sub` or takes longer than 5 seconds during an authenticated session emits `LoggedIn`, and so does a refresh that rejects while signed in. It clears once per unknown identity: while the identity stays unknown, further failed lookups and rejected refreshes emit nothing, until a state transition, a login, callback or logout, or a lookup that finds a known identity, which emits once more. A report of a signed-in session that goes on emits `AuthEvents.SessionCheck` before its identity lookup starts, so the query cache moves its scope generation at once (nothing is cleared) and mutation callbacks started earlier cannot write while the lookup runs. A refresh that resolves while another session check (the init read or an identity lookup) is still running is not checked, since that check may itself wait on the refreshed request: it counts as an unknown identity. On init the plugin reads `checkAuth()` and `getIdentity()` (each bounded by the same 5 seconds) to set the baseline without emitting, a signed-out result included; provider reports wait for it, a failed read leaves the state unknown so the first report clears, and a login or logout made before the read completes wins over it. Reports are ordered by when their work started: one that resolves after a newer report was applied is ignored, except a report of no session while signed in, which always emits `LoggedOut`, and an identity lookup overtaken by a newer report is dropped; `loading` and `error` states are ignored. While `login()`, `handleCallback()` or `logout()` runs, provider reports emit nothing and the call's own event is the single clear (a login that rejects or redirects replays the last report it held back); the call then records the state it emitted for. After any clear for a session start (a login, a callback or a report), the identity lookup started with it sets the baseline silently, but a report that arrives after the clear and before that lookup lands counts as a change, since the account may have switched in between: its lookup emits `LoggedIn`. So a provider echo of a login that arrives after the call ended clears the cache once more; this is accepted by design. After the last release nothing is emitted, from any path (a report, or a login, callback or logout that settles later), and running session checks are cancelled with their timers. A provider without `getIdentity` gets state-transition signals only: an account switch without a state change is not detected until `AuthStateEvent` carries an identity. A custom transport binder that refreshes on its own calls the `trackRefresh` argument when the refresh starts and awaits the returned function with the outcome (`{ session }` or `{ rejected }`) before retrying | - |

### Query Cache Plugin

The `queryCache()` plugin owns the shared **headless TanStack Query `QueryClient`** (`@tanstack/query-core` peer) and bridges it to L1 transport dedup: it **retains** the global `sharedFetchCache` from `@gears-frontx/api` for the app lifetime and **keeps it aligned** with Flux-driven cache events. It's included in the `full()` preset by default:

```typescript
import { createFrontX, presets } from '@gears-frontx/framework';

// Alternative: the full preset includes the queryCache plugin automatically
const app = createFrontX().useAll(presets.full()).build();

// The plugin attaches the shared QueryClient to the app for React bindings
// and shared child roots via queryCacheShared().

// Cache is cleared when mock mode changes and on login and logout
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
- When the cache scope changes (host `queryCache()` only): synchronously cancels queries (in-flight results never land), resets every query so mounted screens drop the old data at once and refetch under the new scope, clears the shared `QueryClient`, then clears `peekSharedFetchCache()` when present; nothing waits for cancellation to settle, so data written after the change survives. The scope is mock mode (`MockEvents.Toggle`) and the session (`AuthEvents.LoggedIn`, `AuthEvents.LoggedOut`). `AuthEvents.SessionCheck` bumps the scope generation without clearing. Like the generation bump, which `queryCacheShared()` runs too, it also holds the mutations running at that moment: their callbacks can no longer roll back or refresh what they changed, so once all of them have settled, the cache refreshes if a write of work started under the checked scope was dropped meanwhile (`useApiMutation` records each one with `recordQueryCacheScopeWriteDropped()`; a drop from work that predates an earlier clear needs no repair); a mutation started after the check is not waited for, since its own callbacks still write. The refresh first cancels every read still running, since one may predate a held mutation; then it clears `peekSharedFetchCache()`, removes queries without observers and invalidates the rest, so active ones refetch. Known limits: invalidation refetches only active queries, so an optimistic value stays in an observed `staleTime: 'static'` query (TanStack never refetches one) and in a query whose observers are all disabled, until it is next fetched; the wait has no bound, so a held mutation that stays pending (paused offline, or a request that never settles) delays the refresh; a cancelled read of a query with no data yet rejects its `fetchQuery()` or `ensureQueryData()` caller with a `CancelledError`. It does not wait for the identity lookup: with a host `queryCache()`, a clear that lookup ends in drops what the refresh fetched by then and cancels what it still fetches; without one, the clear is deferred as for any scope change. A scope change lets held mutations go. A held mutation removed from the cache while it runs is still waited for. An event that repeats the scope already in force is ignored: a toggle to the mode already in force. Every login and logout clears. A change made while only `queryCacheShared()` runtimes hold the client is cleared by the next host `queryCache()` that joins. Each change also bumps the client's scope generation (`readQueryCacheScopeGeneration()`), whether it clears at once or is deferred; `useApiMutation` callbacks get a `queryCache` whose writes do nothing once it moved past the value at the mutation's start, so an old-scope response or snapshot never lands in the new cache. Nothing else is scope-bound: a `useQueryCache()` handle, the raw `QueryClient`, `cache/*` eventBus emits and per-call `mutate(vars, { onSuccess })` options write to whatever scope is current, so a write after an `await` or inside a mutation callback must go through the callback's `queryCache`
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

After calling `.build()`, access registries and actions through `app.*`. The MFE-enabled `mfeRegistry` is available when the build includes `microfrontends()` from `@gears-frontx/framework/mfe` (for example, `createFrontX().useAll(presets.full()).use(microfrontends(config))`):

```typescript
const app = createFrontX().useAll(presets.full()).use(microfrontends(config)).build();

// Access MFE-enabled registry
app.mfeRegistry.registerDomain(screenDomain, containerProvider);
await app.mfeRegistry.registerExtension(homeExtension);

// executeActionsChain is acceptance-only: it returns void, never throws,
// and never yields a promise to await for the chain's own execution.
app.mfeRegistry.executeActionsChain({
  action: { type: app.mfeRegistry.typeSystem.resolveMountExtActionId(), target: screenDomain.id, payload: { subject: 'home' } }
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

The `microfrontends()` plugin provides the MFE-enabled `mfeRegistry` plus the MFE action surface. The plugin, its actions, selectors and state types are exported from `@gears-frontx/framework/mfe` (they reach the MFE runtime). The lifecycle actions take their action type IDs from the type system passed as `microfrontends({ typeSystem })`, so the plugin works with any `TypeSystemPlugin` and depends on no concrete one.

```typescript
import { microfrontends } from '@gears-frontx/framework/mfe';

// `typeSystem` is the host's own TypeSystemPlugin implementation.
const app = createFrontX()
  .use(microfrontends({ typeSystem, mfeHandlers: [/* … */] }))
  .build();
```

### Theme and shared properties

The plugin forwards the current theme's CSS variables to the registry (`registry.setTheme`) when the registry is built and on every `theme/changed`; a failure is logged. It publishes no shared property: which shared properties a host publishes to its MFEs, under which type IDs, is the host's own wiring through `registry.updateSharedProperty`.

### MFE Actions

```typescript
import {
  loadExtension,
  mountExtension,
  unmountExtension,
  registerExtension,
  unregisterExtension,
} from '@gears-frontx/framework/mfe';

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
} from '@gears-frontx/framework/mfe';

// Get extension state
const extensionState = selectExtensionState(state, 'home');

// Get all registered extensions
const extensions = selectRegisteredExtensions(state);

// Get extension error
const error = selectExtensionError(state, 'home');
```

### Domains, type IDs and lifecycle-action IDs

The framework declares no domain, entry type, shared-property type or action ID: domain declarations and type IDs are vocabulary of the host's type system, owned by the application, and the lifecycle-action IDs belong to the type-system plugin. Framework code that needs a lifecycle-action ID resolves it through the registry's type system (`registry.typeSystem.resolveLoadExtActionId()`, `resolveMountExtActionId()`, `resolveUnmountExtActionId()`).

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

1. **Use presets for common cases** - `createFrontX().useAll(presets.full())` for full apps, plus `.use(microfrontends(config))` from `@gears-frontx/framework/mfe` for an app that hosts MFEs; build one app per runtime
2. **Compose plugins for customization** - Use `createFrontX().use()` pattern
3. **Dependencies are auto-resolved** - Plugin order doesn't matter
4. **Access via app instance** - All registries and actions on `app.*`
5. **NO React in this package** - Framework is headless, use @gears-frontx/react for React bindings
6. **MFE is the primary architecture** - Use `mfeRegistry` for domain/extension management when the app includes `microfrontends()` (from `@gears-frontx/framework/mfe`)

## Re-exports

For convenience, this package re-exports from SDK packages. The MFE runtime
re-exports live on the `@gears-frontx/framework/mfe` subpath. No entry
re-exports a concrete type system: there is no `/gts` subpath.

- `@gears-frontx/framework/mfe` — every `@gears-frontx/mfes` re-export:
  `Extension`, `ExtensionDomain`, `MfeHandler`, `MfeBridgeFactory`,
  `ParentMfeBridge`, `ChildMfeBridge`, `MfeHandlerMF`, `mfeRegistryFactory`, the
  mount strategies, MFE types/contracts, `createShadowRoot`, `injectCssVariables`
  — and the MFE host plugin: `microfrontends`,
  `MicrofrontendsConfig`, `loadExtension`, `mountExtension`, `unmountExtension`,
  `registerExtension`, `unregisterExtension`, `selectExtensionState`,
  `selectRegisteredExtensions`, `selectExtensionError`, `MfeState`,
  `ExtensionRegistrationState`, `RegisterExtensionPayload`,
  `UnregisterExtensionPayload`.

Nothing the main barrel (`@gears-frontx/framework`) exports reaches
`@gears-frontx/mfes` at runtime — it carries the React/plugins surface only
(`createFrontX`, presets, plugins other than `microfrontends()`, app-level
slices, state/api/i18n re-exports). An app that hosts no MFEs therefore never loads the
MFE runtime through it.

- From @gears-frontx/state: `eventBus`, `createStore`, `getStore`, `registerSlice`, `hasSlice`, `createSlice`
- From @gears-frontx/api: `apiRegistry`, `BaseApiService`, `RestProtocol`, `SseProtocol`, `MOCK_PLUGIN`, `isMockPlugin`, `StreamDescriptor`, `StreamStatus`
- From @gears-frontx/i18n: `i18nRegistry`, `Language`, `SUPPORTED_LANGUAGES`, `getLanguageMetadata`

**App-level slices:**
- Mock: `mockSlice`, `mockActions`, `setMockEnabled`

**Plugin actions:** `FrontXActions` is the interface of `app.actions`. A plugin defined outside this package (the application's layout plugin, for one) types the actions it contributes by augmenting it:
```typescript
declare module '@gears-frontx/framework' {
  interface FrontXActions {
    toggleMenuCollapsed: (payload: { collapsed: boolean }) => void;
  }
}
```

**MFE Exports (on the subpath, not the main barrel):**
- `@gears-frontx/framework/mfe`: `MfeHandlerMF` - Concrete MFE handler for Module Federation; `mfeRegistryFactory`, mount strategies, bridge classes, MFE types; `createShadowRoot`, `injectCssVariables` - Shadow DOM utilities; `microfrontends` - MFE host plugin, with its actions, selectors and state types

**NOTE:** `createAction` is NOT exported to consumers. Actions should be handwritten functions in extensions that contain business logic and emit events via `eventBus.emit()`.

**NOTE:** "Selector" is Redux terminology and is not used in FrontX. Access state via `useAppSelector` hook from @gears-frontx/react:
```typescript
const mockEnabled = useAppSelector((state) => (state.mock as MockState).enabled);
```

## Exports

### Core
- `createFrontX` - App builder factory
- `presets` - Available presets (full, minimal)

### Plugins
- `themes`, `i18n`, `effects`, `queryCache`, `queryCacheShared`, `mock`
- `microfrontends` - on `@gears-frontx/framework/mfe`

### Registries
- `createThemeRegistry` - Theme registry factory

### Types
- `FrontXConfig`, `FrontXPlugin`, `FrontXApp`, `FrontXAppBuilder`
- `PluginFactory`, `PluginProvides`, `PluginLifecycle`
- `Preset`, `Presets`
- All re-exported types from SDK packages

## Testing Subpath (`@gears-frontx/framework/testing`)

The `./testing` subpath exposes Vitest-based helpers — `TestContainerProvider` (factory adapter for MFE domain registration in tests; exported only here, since it reaches the MFE runtime), shared `QueryClient` peek hooks, and `resetSharedQueryClient` for inter-test teardown (also on the main barrel).

- `vitest` is an **optional** peer dependency. Production apps that never import `@gears-frontx/framework/testing` do **not** need to install or pin `vitest`.
- Projects that import from `@gears-frontx/framework/testing` **must** install `vitest` at a version compatible with the range declared in this package's `peerDependencies` (currently pinned to `4.1.4`).
- The `./testing` entry is runtime-isolated from the main entry; importing the default entry does not pull `vitest` into the production bundle.

## Navigation and Registration

FrontX uses the MFE architecture exclusively: screens are extensions mounted
into domains, registered on `app.mfeRegistry`.

### Mount an extension

```typescript
app.actions.mountExtension('home');
```

### Register a domain and its extensions

```typescript
import type { ExtensionDomain, Extension } from '@gears-frontx/framework/mfe';
// `screenDomain` is the application's own ExtensionDomain declaration

// Register domain
app.mfeRegistry.registerDomain(screenDomain, containerProvider);

// Register extensions
await app.mfeRegistry.registerExtension(homeExtension);
await app.mfeRegistry.registerExtension(profileExtension);
```

See the MFE guide in the project documentation for the full flow.
