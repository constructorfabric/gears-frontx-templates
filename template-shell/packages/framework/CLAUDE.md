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
import { createGears FrontX, effects, themes, layout, i18n } from '@gears-frontx/framework';

const app = createGears FrontX()
  .use(effects())
  .use(themes())
  .use(layout())
  .use(i18n())
  .build();
```

### Presets

Pre-configured plugin arrays, passed to `.useAll(...)`. `full()` contains effects, themes, layout, i18n, the query cache, and mock; it adds `microfrontends()` only when `config.microfrontends` is supplied and `auth()` only when `config.auth` is supplied. `minimal()` contains themes only. There is no other preset. Each example below is an alternative: choose one per runtime.

```typescript
import { createGears FrontX, presets } from '@gears-frontx/framework';

// Alternative: the full preset, with microfrontends support
const fullApp = createGears FrontX()
  .useAll(presets.full({ microfrontends: config }))
  .build();

// Alternative: the minimal preset (themes only)
const minimalApp = createGears FrontX()
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
| `queryCache()` | Host-owned shared `QueryClient` lifecycle, Flux `cache/*` events, mock toggle + destroy cleanup, L1 `sharedFetchCache` retain/release and invalidation sync | - |
| `queryCacheShared()` | Joins the host `QueryClient` from `queryCache()` for MFE / child roots (no second client) | host `queryCache()` runtime must exist |
| `mock()` | mockSlice, toggleMockMode action | effects |

### Query Cache Plugin

The `queryCache()` plugin owns the shared **headless TanStack Query `QueryClient`** (`@tanstack/query-core` peer) and bridges it to L1 transport dedup: it **retains** the global `sharedFetchCache` from `@gears-frontx/api` for the app lifetime and **keeps it aligned** with Flux-driven cache events. It's included in the `full()` preset by default:

```typescript
import { createGears FrontX, presets } from '@gears-frontx/framework';

// Alternative: the full preset includes the queryCache plugin automatically
const app = createGears FrontX().useAll(presets.full()).build();

// The plugin attaches the shared QueryClient to the app for React bindings
// and shared child roots via queryCacheShared().

// Cache is cleared on mock mode toggle (query cache + shared fetch layer)
// Flux effects can drive cache via eventBus, e.g.:
//   eventBus.emit('cache/invalidate', { queryKey })
//   eventBus.emit('cache/set', { queryKey, dataOrUpdater })
//   eventBus.emit('cache/remove', { queryKey })
```

For custom plugin compositions (an alternative to the preset above; choose one per runtime):

```typescript
import { createGears FrontX, queryCache } from '@gears-frontx/framework';

const app = createGears FrontX()
  .use(queryCache({ staleTime: 60_000, gcTime: 600_000 }))
  .build();
```

The plugin:
- Creates or joins a shared `QueryClient` with configurable defaults (`staleTime`, `gcTime`, `retry: 0`, `refetchOnWindowFocus`)
- Calls `retainSharedFetchCache()` on init and `releaseSharedFetchCache()` after teardown on destroy (balances in-flight shared fetch retention)
- On mock toggle: cancels queries, clears the shared `QueryClient`, then clears `peekSharedFetchCache()` when present
- Subscribes to `cache/invalidate`, `cache/set`, and `cache/remove` — updates the shared `QueryClient` **and** mirrors invalidation to `sharedFetchCache` for matching keys (avoiding stale transport dedup vs React observers)
- Attaches the shared `QueryClient` to each app instance so `@gears-frontx/react` can resolve it internally
- On destroy: unsubscribes listeners, cancels and clears the client when the last retainer is released, then releases shared-fetch retention

`@tanstack/query-core` is a peer dependency of `@gears-frontx/framework` (React bindings remain in `@gears-frontx/react`).

### Mock Mode Control

The `mock()` plugin provides centralized mock mode control. It's included in the `full()` preset by default, so apps don't need manual setup:

```typescript
import { createGears FrontX, presets } from '@gears-frontx/framework';

// Alternative: the full preset includes the mock plugin automatically
const app = createGears FrontX().useAll(presets.full()).build();

// Toggle mock mode via actions (used by FrontX Studio ApiModeToggle)
app.actions.toggleMockMode(true);  // Activates all registered mock plugins
app.actions.toggleMockMode(false); // Deactivates all registered mock plugins
```

For custom plugin compositions (an alternative; choose one per runtime):

```typescript
import { createGears FrontX, effects, mock } from '@gears-frontx/framework';

const app = createGears FrontX()
  .use(effects())  // Required dependency
  .use(mock())     // Automatic mock mode control
  .build();
```

Services register mock plugins using `registerPlugin()` in their constructor. The framework automatically manages plugin activation based on mock mode state.

### Built Application

After calling `.build()`, access registries and actions through `app.*`. The MFE-enabled `mfeRegistry` is available when the build includes `microfrontends()` (for example, `createGears FrontX().useAll(presets.full({ microfrontends: config }))`):

```typescript
const app = createGears FrontX().useAll(presets.full({ microfrontends: config })).build();

// Access MFE-enabled registry
app.mfeRegistry.registerDomain(screenDomain, containerProvider);
await app.mfeRegistry.registerExtension(homeExtension);

// executeActionsChain is acceptance-only: it returns void, never throws,
// and never yields a promise to await for the chain's own execution.
app.mfeRegistry.executeActionsChain({
  action: { type: Gears FrontX_ACTION_MOUNT_EXT, target: 'screen', payload: { subject: 'home' } }
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
// dispatches an actions chain through the acceptance-only registry surface
// and returns nothing to await. Dispatch never throws.

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
  Gears FrontX_SCREEN_DOMAIN,
  Gears FrontX_SIDEBAR_DOMAIN,
  Gears FrontX_POPUP_DOMAIN,
  Gears FrontX_OVERLAY_DOMAIN,
  screenDomain,
  sidebarDomain,
  popupDomain,
  overlayDomain,
} from '@gears-frontx/framework';

// String constants (GTS instance IDs)
Gears FrontX_SCREEN_DOMAIN   // 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.screen.v1'
Gears FrontX_SIDEBAR_DOMAIN  // 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.sidebar.v1'
Gears FrontX_POPUP_DOMAIN    // 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.popup.v1'
Gears FrontX_OVERLAY_DOMAIN  // 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.overlay.v1'

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
  Gears FrontX_ACTION_LOAD_EXT,
  Gears FrontX_ACTION_MOUNT_EXT,
  Gears FrontX_ACTION_UNMOUNT_EXT,
  Gears FrontX_SHARED_PROPERTY_THEME,
  Gears FrontX_SHARED_PROPERTY_LANGUAGE,
} from '@gears-frontx/framework';

// Action IDs
Gears FrontX_ACTION_LOAD_EXT     // 'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.load_ext.v1~'
Gears FrontX_ACTION_MOUNT_EXT    // 'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.mount_ext.v1~'
Gears FrontX_ACTION_UNMOUNT_EXT  // 'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.unmount_ext.v1~'

// Shared property IDs
Gears FrontX_SHARED_PROPERTY_THEME    // 'gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.theme.v1~'
Gears FrontX_SHARED_PROPERTY_LANGUAGE // 'gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.language.v1~'
```

## Creating Custom Plugins

Extend FrontX with custom functionality:

```typescript
import type { Gears FrontXPlugin } from '@gears-frontx/framework';

export function myPlugin(): Gears FrontXPlugin {
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

1. **Use presets for common cases** - `createGears FrontX().useAll(presets.full({ microfrontends: config }))` for full apps with MFE support; build one app per runtime
2. **Compose plugins for customization** - Use `createGears FrontX().use()` pattern
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
- `createGears FrontX` - App builder factory
- `presets` - Available presets (full, minimal)

### Plugins
- `themes`, `layout`, `microfrontends`, `i18n`, `effects`, `queryCache`, `queryCacheShared`, `mock`

### Registries
- `createThemeRegistry` - Theme registry factory

### Types
- `Gears FrontXConfig`, `Gears FrontXPlugin`, `Gears FrontXApp`, `Gears FrontXAppBuilder`
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
