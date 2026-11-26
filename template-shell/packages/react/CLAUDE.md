# @gears-frontx/react

React bindings and hooks for FrontX applications. Provides the React integration layer with MFE (Microfrontend) support.

## React Layer

This package is part of the **React Layer (L3)** - it depends only on @gears-frontx/framework (not directly on SDK packages) and provides React-specific components and hooks.

## Core Concepts

### FrontXProvider

Wrap your app with FrontXProvider to enable all hooks. A runtime builds exactly one app, once at module level; the provider never creates one. The three compositions below are alternatives: choose one per runtime.

```tsx
import { createFrontX, FrontXProvider, presets } from '@gears-frontx/react';

// Alternative 1: the full preset
const app = createFrontX({ devMode: true }).useAll(presets.full()).build();

function App() {
  return (
    <FrontXProvider app={app}>
      <YourApp />
    </FrontXProvider>
  );
}

```

Alternative 2: a host shell with a custom plugin set (a host typically uses `queryCache()`):

```tsx
const app = createFrontX().use(effects()).use(queryCache()).build();
```

Alternative 3: a child MFE app. The canonical bootstrap matches `src/mfe_packages/*/init.ts`: `apiRegistry.register` / `initialize` before `.build()`, `registerSlice` after `.build()` when slices exist:

```tsx
const app = createFrontX().use(effects()).use(queryCacheShared()).use(mock()).build();
```

The shared `QueryClient` is created and owned by the `queryCache()` framework plugin at L2.
`FrontXProvider` resolves that client from the app instance — it does not create its own `QueryClient`.

When the host uses `queryCache()` and the child MFE app uses `queryCacheShared()` (with `effects()` and `mock()` on the same chain as in repo MFE inits), both roots join the same shared `QueryClient` while keeping separate React trees. `ThemeAwareReactLifecycle` relies on that shared plugin-owned client through the app instance. If the shared client is missing for a mounted MFE, the lifecycle fails explicitly instead of silently falling back.

For separate roots, build each app with the appropriate query-cache plugin (`queryCache()` for the host, `queryCacheShared()` for child MFE shells) so every tree joins the same cache through plugin composition. Host apps should register domains/extensions during bootstrap; **`ExtensionDomainSlot`** is the preferred host-side renderer for screen slots while the framework wires `mount_ext`.

### Data Fetching with Endpoint Descriptors

Services define endpoints as descriptors. Components consume them via `useApiQuery` and `useApiMutation`. No manual query keys, no `queryOptions()` calls.

```tsx
import { useApiQuery, useApiMutation, apiRegistry } from '@gears-frontx/react';
import { AccountsApiService } from '../api/AccountsApiService';

function ProfileScreen({ teamId }: { teamId?: string }) {
  const service = apiRegistry.getService(AccountsApiService);

  // Read — pass descriptor directly
  const { data, isLoading, error } = useApiQuery(service.getCurrentUser);

  // Read with params
  const { data: user } = useApiQuery(service.getUser({ id: '123' }));

  // Write with optimistic update
  const { mutateAsync, isPending } = useApiMutation({
    endpoint: service.updateProfile,
    onMutate: async (variables, { queryCache }) => {
      await queryCache.cancel(service.getCurrentUser);
      const snapshot = queryCache.get(service.getCurrentUser);
      queryCache.set(service.getCurrentUser, (old) => ({
        ...old, user: { ...old.user, ...variables }
      }));
      return { snapshot };
    },
    onError: (_err, _vars, context, { queryCache }) => {
      if (context?.snapshot) {
        queryCache.set(service.getCurrentUser, context.snapshot);
      }
    },
    onSettled: async (_data, _err, _vars, _ctx, { queryCache }) => {
      await queryCache.invalidate(service.getCurrentUser);
    },
  });

  // Per-endpoint cache override (rare)
  const { data: config } = useApiQuery(service.getConfig, { staleTime: 0 });

  // Conditional query: stays idle until enabled (not on the suspense hooks).
  // The hook still needs a descriptor on every render, so one is built with a
  // stand-in id; while enabled is false it is not fetched automatically, and
  // refetch would still fetch it, so do not call refetch before teamId is set.
  const { data: team } = useApiQuery(service.getTeam({ id: teamId ?? '' }), { enabled: Boolean(teamId) });
}
```

Cache keys are derived automatically by the service — `QueryCache` methods accept
endpoint descriptors directly (e.g., `queryCache.get(service.getCurrentUser)`).

The `queryCache` a mutation callback receives is bound to the cache scope (mock mode, session) the mutation started under: once that scope changes, its writes (`set`, `remove`, `invalidate`, `invalidateMany`, `cancel`) do nothing and reads still work, so a response or snapshot from the old scope never lands in the new cache. Nothing else is scope-bound: a `useQueryCache()` handle, the raw `QueryClient`, `cache/*` eventBus emits and per-call `mutate(vars, { onSuccess })` options write to whatever scope is current, so a write after an `await` or inside a mutation callback must go through the callback's `queryCache`.

### SSE Streaming with Stream Descriptors

Services declare SSE endpoints as stream descriptors. Components consume them via `useApiStream`, which manages the connection lifecycle automatically (connect on mount, disconnect on unmount).

```tsx
import { useApiStream, apiRegistry } from '@gears-frontx/react';
import { ChatApiService } from '../api/ChatApiService';

function ChatStream() {
  const service = apiRegistry.getService(ChatApiService);

  // Latest event only (default mode)
  const { data, status, error } = useApiStream(service.messageStream);

  // Accumulate all events
  const { events, status: streamStatus } = useApiStream(
    service.messageStream,
    { mode: 'accumulate' }
  );

  // Deferred connection (enabled: false)
  const [active, setActive] = useState(false);
  const { data: msg, disconnect } = useApiStream(
    service.messageStream,
    { enabled: active }
  );

  if (status === 'connecting') return <Loading />;
  if (status === 'error') return <Error error={error} />;

  return <div>{data?.text}</div>;
}
```

`useApiStream` returns `{ data, events, status, error, disconnect }`:
- `data` — latest event payload (set in both modes)
- `events` — all received events when `mode: 'accumulate'`; empty array in `'latest'` mode
- `status` — connection lifecycle state, `StreamStatus` (see below)
- `error` — the last connect attempt's error; retained until the next connect attempt resets it, so check `status` rather than `error` truthiness
- `disconnect()` — close the connection manually

#### Status lifecycle

`status` is a `StreamStatus`: `'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'`.

The TSDoc block on `useApiStream` in `src/hooks/useApiStream.ts` is the detailed and authoritative state-machine reference, including teardown edge cases. This guide summarizes consumer-facing usage and gating.

`disconnect()` closes the connection and does not reconnect. There is no reconnect function: to open a new connection, change the descriptor key, change `mode`, or toggle `enabled` back to true.

#### The `enabled` option

`enabled` (default `true`) gates whether the hook connects at all. While it is false the hook never calls the descriptor's `connect()` and ordinarily holds `status: 'idle'` (calling `disconnect()` while disabled is the one exception — see the TSDoc). Flipping it to true re-runs the connect effect and starts a fresh connection; flipping it back to false tears the connection down and returns `status` to `'idle'`.

Tearing down via `enabled` does not clear `data` or `events` — a descriptor-key or `mode` change, or re-enabling, does. A component reading `data` while the stream is disabled still sees the last event from the previous connection.

Gating advice, since `'idle'` covers both "not started yet" and "deferred by `enabled`":

- Gate the loading state on `'connecting'` alone. Treating `'idle'` as loading renders a permanent spinner for a stream deliberately held at `enabled: false`.
- Handle `'idle'` as "not started / deferred". A component that both defers and shows loading should key its spinner off its own active flag, not off `'idle'`.
- Check `status === 'error'` rather than the truthiness of `error` to render failures.

### Available Hooks

#### useFrontX

Access the FrontX app instance:

```tsx
import { useFrontX } from '@gears-frontx/react';

function MyComponent() {
  const app = useFrontX();

  // Access MFE-enabled registry
  const extensions = app.mfeRegistry.getExtensionsForDomain('screen');

  // Access MFE actions — fire-and-forget: each dispatches an actions chain
  // through the acceptance-only registry surface and returns nothing to
  // await.
  app.actions.loadExtension('home');
  app.actions.mountExtension('home');
}
```

#### useAppDispatch / useAppSelector

Type-safe Redux hooks:

```tsx
import { useAppDispatch, useAppSelector, type MockState } from '@gears-frontx/react';

function MyComponent() {
  const dispatch = useAppDispatch();
  const mockEnabled = useAppSelector((state) => (state.mock as MockState).enabled);
}
```

#### useTranslation

Access translation utilities:

```tsx
import { useTranslation } from '@gears-frontx/react';

function MyComponent() {
  const { t, language, setLanguage, isRTL } = useTranslation();

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'}>
      <h1>{t('common:title')}</h1>
      <p>{t('common:welcome', { name: 'John' })}</p>
    </div>
  );
}
```

#### useScreenTranslations

Load screen-level translations:

```tsx
import { useScreenTranslations } from '@gears-frontx/react';

const translations = {
  en: () => import('./i18n/en.json'),
  es: () => import('./i18n/es.json'),
};

function HomeScreen() {
  const { isLoaded, error } = useScreenTranslations('demo', 'home', translations);

  if (!isLoaded) return <Loading />;
  if (error) return <Error error={error} />;

  return <div>...</div>;
}
```

#### useTheme

Access theme utilities:

```tsx
import { useTheme } from '@gears-frontx/react';

function ThemeToggle() {
  const { currentTheme, themes, setTheme } = useTheme();

  return (
    <select value={currentTheme} onChange={(e) => setTheme(e.target.value)}>
      {themes.map((theme) => (
        <option key={theme.id} value={theme.id}>{theme.name}</option>
      ))}
    </select>
  );
}
```

### MFE Hooks

The MFE hooks and components live on the `@gears-frontx/react/mfe` subpath; the main
barrel exports none of them. The package is type-system agnostic: it declares no
action or shared-property type ID. The IDs in the examples below (`LOAD_EXT_ACTION_ID`,
`THEME_PROPERTY_ID`) stand for the ones the host's type system defines.

#### useMfeBridge

Access the MFE bridge for child MFEs:

```tsx
import { useMfeBridge } from '@gears-frontx/react/mfe';

function MyExtension() {
  const bridge = useMfeBridge();

  const handleLoad = () => {
    // executeActionsChain is acceptance-only: it returns void, never
    // throws, and never yields anything to await for the chain's own
    // execution.
    bridge.executeActionsChain({
      action: { type: LOAD_EXT_ACTION_ID, target: 'screen', payload: { subject: 'other' } }
    });
  };

  // Get shared property
  const theme = bridge.getProperty(THEME_PROPERTY_ID);
}
```

#### useSharedProperty

Subscribe to shared property changes. Two forms: the context form reads the bridge from `MfeContext`, and the options form accepts an explicit bridge and a fallback.

**Context form** — `useSharedProperty(propertyTypeId)`. Reads the bridge from `MfeContext` and throws if no `MfeProvider` is mounted. Returns the value (or `undefined` if the host has not published it), updating on every host publish.

```tsx
import { useSharedProperty } from '@gears-frontx/react/mfe';

function ThemedComponent() {
  const theme = useSharedProperty(THEME_PROPERTY_ID);

  return <div style={{ backgroundColor: theme?.primaryColor }}>...</div>;
}
```

**Options form** — `useSharedProperty(propertyTypeId, { bridge, fallback })`. Use it for components that never mount `MfeProvider`, or to show a value until the host publishes one.

```tsx
import { useSharedProperty, type ChildMfeBridge } from '@gears-frontx/react/mfe';

function StandaloneComponent({ bridge }: { bridge: ChildMfeBridge }) {
  const label = useSharedProperty<string>(LABEL_PROPERTY_ID, {
    bridge,
    fallback: 'Untitled',
  });

  return <span>{label}</span>;
}
```

`UseSharedPropertyOptions<T>` fields:

- `bridge` — bridge to read the property from, bypassing `MfeContext`. Pass it when the calling component never mounts `MfeProvider` (for example, a component that receives its bridge as a prop or from a non-React entry point). When omitted, the hook falls back to the bridge from `MfeContext` and throws if no `MfeProvider` is mounted. Changing `bridge` or `propertyTypeId` moves the subscription to the new source and the returned value follows on the same render.
- `fallback` — value returned while the host has not published the property yet. Only `undefined` is substituted; a published `null` is a real value and comes through as-is. With `fallback` set the hook returns `T` rather than `T | undefined`. It may be passed inline on every render without affecting the subscription.

There is no consumer-side validation option on purpose: the host validates every published value against the property's schema before it reaches any MFE (`TypeSystemPlugin.register()` throws on a mismatch and the update is never stored or delivered). `T` is the caller's declaration of that schema, as with `useState<T>`.

Both forms read through `useSyncExternalStore`, so the first render shows the host's current value and the result is tearing-protected under concurrent rendering. The TSDoc block on `useSharedProperty` in `src/mfe/hooks/useSharedProperty.ts` is the authoritative reference; this guide summarizes consumer-facing usage.

#### useHostAction

Invoke actions on the host application:

```tsx
import { useHostAction } from '@gears-frontx/react/mfe';

function MyExtension() {
  const loadExtension = useHostAction(LOAD_EXT_ACTION_ID);

  const handleClick = () => {
    loadExtension({ subject: 'other' });
  };

  return <button onClick={handleClick}>Load Extension</button>;
}
```

#### useDomainExtensions

Subscribe to extensions in a domain:

```tsx
import { useDomainExtensions } from '@gears-frontx/react/mfe';

function ScreenList() {
  const screenExtensions = useDomainExtensions('screen');

  return (
    <ul>
      {screenExtensions.map((ext) => (
        <li key={ext.id}>{ext.title}</li>
      ))}
    </ul>
  );
}
```

### MFE Components

#### MfeProvider

Provide MFE context for child extensions:

```tsx
import { MfeProvider } from '@gears-frontx/react/mfe';

function MfeHost() {
  return (
    <MfeProvider value={{ bridge: parentBridge, extensionId: 'home', domainId: 'screen' }}>
      <ExtensionContainer />
    </MfeProvider>
  );
}
```

#### ExtensionDomainSlot

Render extensions into a domain slot:

```tsx
import { ExtensionDomainSlot } from '@gears-frontx/react/mfe';

function LayoutScreen() {
  return (
    <ExtensionDomainSlot
      registry={registry}
      // the host type system's screen domain id
      domainId={SCREEN_DOMAIN_ID}
      loadingComponent={<Loading />}
    />
  );
}
```

`ExtensionDomainSlot` is the preferred host-side renderer for a domain. It
renders one root element, attaches the domain's mounter to it
(`registry.getMounter(domainId).attach(element)`) and detaches it on cleanup,
which unmounts every extension mounted in the domain; the host bootstrap
registers the domain and publishes its shared properties before any
`mount_ext`. `SCREEN_DOMAIN_ID` stands for the domain id the host's own type
system declares.
The host `QueryClient` is reused by MFE React trees through
`queryCacheShared()`, not by embedding a `QueryClient` on `MfeMountContext`
or expecting host React context inside Shadow DOM.

`onAttached(root)` and `onDetached()` report the attach and the detach.

### Components

## Key Rules

1. **Wrap with FrontXProvider** - Required for all hooks to work
2. **Use hooks for state access** - Don't import selectors directly from @gears-frontx/framework
3. **Use endpoint descriptors for data** - `useApiQuery(service.endpoint)` for REST, `useApiStream(service.stream)` for SSE — not `queryOptions()` or manual key factories
4. **Service is the cache contract** - The service IS the data layer; cache keys are derived automatically
5. **QueryCache uses descriptors** - `queryCache.get(service.endpoint)`, not raw key arrays
6. **Lazy load translations** - Use `useScreenTranslations` for screen-level i18n
7. **Use MFE hooks for extensions** - `useMfeBridge`, `useSharedProperty`, `useHostAction`, `useDomainExtensions` (from `@gears-frontx/react/mfe`)
8. **NO Layout components here** - Layout and UI components belong in L4 (user's project via CLI scaffolding)

## Re-exports

For convenience, this package re-exports the @gears-frontx/framework surface. The MFE
re-exports live on the `@gears-frontx/react/mfe` subpath, mirroring
`@gears-frontx/framework/mfe`. No entry re-exports a concrete type system: there is no
`/gts` subpath.

- `@gears-frontx/react/mfe` — the MFE context, hooks and components of this package
  (`MfeContext`, `useMfeContext`, `MfeProvider`, `useMfeBridge`, `useSharedProperty`,
  `useHostAction`, `useMfeRegistry`, `useDomainExtensions`,
  `ThemeAwareReactLifecycle`, `ExtensionDomainSlot`) plus every
  `@gears-frontx/framework/mfe` re-export: bridge classes (`ChildMfeBridge`,
  `ParentMfeBridge`), `MfeHandlerMF`, `mfeRegistryFactory`, `ActionHandler`, the mount
  strategies, MFE types/contracts, `createShadowRoot`, `injectCssVariables`, and the
  MFE host plugin `microfrontends` with its actions
  (`loadExtension`, `mountExtension`, `unmountExtension`, `registerExtension`,
  `unregisterExtension`), selectors (`selectExtensionState`,
  `selectRegisteredExtensions`, `selectExtensionError`) and types
  (`MfeState`, `ExtensionRegistrationState`, `RegisterExtensionPayload`,
  `UnregisterExtensionPayload`).

Nothing the main barrel (`@gears-frontx/react`) exports reaches the MFE runtime at
runtime, so a leaf MFE that only uses the React bindings never loads it. It carries the React bindings and the framework main-barrel surface:

- All SDK primitives (eventBus, createStore, etc.)
- The plugins other than the MFE host plugin (themes, i18n, effects, queryCache,
  queryCacheShared, mock, auth); a host adds `microfrontends()` from
  `@gears-frontx/react/mfe` itself. No layout plugin, slices or layout state
  types: the application owns its layout and types the actions its own
  plugins contribute by augmenting `FrontXActions`
- All registries and factory functions

This allows users to import everything from `@gears-frontx/react` and its subpaths without needing `@gears-frontx/framework` directly.

## Exports

### Components
- `FrontXProvider` - Main context provider
- `MfeProvider` - MFE context provider (`@gears-frontx/react/mfe`)
- `ExtensionDomainSlot` - Domain slot renderer (`@gears-frontx/react/mfe`)

### Hooks
- `useFrontX` - Access app instance
- `useAppDispatch` - Typed dispatch
- `useAppSelector` - Typed selector
- `useApiQuery` - Declarative data fetch from endpoint descriptor; returns `ApiQueryResult<TData>`
- `useApiMutation` - Declarative mutation with endpoint descriptor and optimistic update support; returns `ApiMutationResult<TData>`
- `useApiStream` - Declarative SSE streaming from stream descriptor; returns `ApiStreamResult<TEvent>`
- `useQueryCache` - Restricted query cache access (accepts descriptors or raw keys)
- `useTranslation` - Translation utilities
- `useScreenTranslations` - Screen translation loading
- `useTheme` - Theme utilities
- `useMfeBridge` - Access MFE bridge (`@gears-frontx/react/mfe`)
- `useSharedProperty` - Subscribe to shared property, via `MfeContext` or an explicit bridge (`@gears-frontx/react/mfe`)
- `useHostAction` - Invoke host action (`@gears-frontx/react/mfe`)
- `useDomainExtensions` - Subscribe to domain extensions (`@gears-frontx/react/mfe`)

### Context
- `FrontXContext` - React context (for advanced use)
- `MfeContext` - MFE context (for advanced use; `@gears-frontx/react/mfe`)

### Types
- `FrontXProviderProps`
- `ApiQueryResult<TData>` - Gears FrontX-owned query result type (data, error, isLoading, refetch, etc.)
- `ApiMutationResult<TData>` - Gears FrontX-owned mutation result type (mutateAsync, isPending, error, reset, etc.)
- `ApiStreamResult<TEvent>` - Gears FrontX-owned stream result type (data, events, status, error, disconnect)
- `ApiStreamOptions` - Stream hook options (mode, enabled)
- `QueryCache` - Restricted cache interface (accepts descriptors or raw keys)
- `MutationCallbackContext` - Context with queryCache injected into mutation callbacks
- `MfeProviderProps`, `ExtensionDomainSlotProps` (`@gears-frontx/react/mfe`)
- `UseSharedPropertyOptions<T>` - Options for `useSharedProperty` (bridge, fallback; `@gears-frontx/react/mfe`)
- `UseTranslationReturn`, `UseThemeReturn`
- All types from @gears-frontx/framework (including `EndpointDescriptor`, `MutationDescriptor`, `StreamDescriptor`, `StreamStatus`)

## Navigating Between Screens

A component asks for a screen through the app's actions. `mountExtension`
dispatches an actions chain through the acceptance-only registry surface and
returns nothing to await:

```tsx
import { useFrontX } from '@gears-frontx/react';

function MyComponent() {
  const app = useFrontX();

  return <button onClick={() => app.actions.mountExtension('home')}>Go Home</button>;
}
```

A host screen slot renders the domain's extensions with `ExtensionDomainSlot`:

```tsx
import { ExtensionDomainSlot } from '@gears-frontx/react/mfe';

function MyComponent() {
  return (
    <ExtensionDomainSlot
      registry={app.mfeRegistry}
      domainId={SCREEN_DOMAIN_ID}
      loadingComponent={<Loading />}
    />
  );
}
```

See the MFE guide in the project documentation for the full flow.
