/**
 * Auth Realm Plugin - one auth runtime shared across the realm
 *
 * Framework Layer: L2
 *
 * The `auth()` plugin owns the auth runtime of the app that builds it: the
 * provider wrapper, the session tracker and the transport binding all live in
 * its closure, and it emits `AuthEvents` on the eventBus of its own package
 * copy. A microfrontend bundles its own copy of the framework, so it can
 * reach neither the shell's runtime nor the shell's transport plugin, and its
 * own REST requests go out without credentials.
 *
 * This module closes that gap the way the shared `QueryClient` does
 * (`queryCache()` / `queryCacheShared()`): the shell side (`authRealm()`)
 * publishes `app.auth` into a `Symbol.for` slot on `globalThis` with a
 * retainer count and a teardown token, and the joining side
 * (`authRealmShared()`) reads the same slot, provides the shared runtime as
 * its own `app.auth`, and binds a REST transport to the shared runtime's
 * provider, so the REST requests of the joining app's own apiRegistry carry
 * the session. Its 401 refreshes go through the shared runtime's `refresh`,
 * which reports to the host's session tracker. The slot lives in one
 * JavaScript realm: the document the shell and its microfrontends share.
 *
 * The shared `AuthRuntime` carries the provider only, so the host also
 * publishes the `frontxApi` transport config its `auth()` plugin was built
 * with (`authRealm({ frontxApi })`) into a second slot, and its custom
 * transport binder, when it has one (`authRealm({ transport })`), into a
 * third. A join binds the host's binder (`frontxApiTransport()` when there is
 * none) with the host's published config whole, spread into the binder args
 * as it is, so a field of `Hai3ApiAuthTransportConfig` a joining copy of the
 * framework does not know yet still reaches the binder; without the config,
 * every request of a joining app would go out without the session the host's
 * carry.
 *
 * A second host is refused in `onRegister`, before the `auth()` plugin of its
 * build starts its transport, session tracker and provider subscription.
 *
 * The host release runs before the host `auth()` release (destroy goes in
 * reverse order), and that one destroys the provider. When joins still hold
 * the runtime, the slot therefore keeps a destroyed marker instead of the
 * runtime: a join that arrives later is rejected instead of reaching a
 * destroyed provider, and a new host can publish at once. The joins keep the
 * runtime they already hold and give their own retainer back on destroy.
 *
 * `authRealmShared()` throws when no host runtime exists instead of silently
 * building a second one, exactly like `queryCacheShared()` does: one realm
 * owns one session, and a second provider would sign in itself alone. It
 * throws on an `auth()` plugin of the joining app too: it replaces `auth()`
 * rather than overwriting it, so an app.auth kept beside the join would put
 * two auth transports on the same requests.
 *
 * Zero React imports - these plugins are headless.
 */

import { RestProtocol } from '@gears-frontx/api';
import type { AuthContext, AuthProvider } from '@gears-frontx/auth';
import type { FrontXAppBuilder, FrontXPlugin } from '../types';
import {
  frontxApiTransport,
  type AuthRuntime,
  type AuthTransportBinder,
  type AuthTransportBinding,
  type Hai3ApiAuthTransportConfig,
} from './auth';

/**
 * The slot the shell publishes the realm's auth runtime into and every
 * microfrontend of the same realm reads it from. `Symbol.for` returns the
 * same symbol from every package copy, so the name is one key per realm, not
 * one key per bundle. After the host released while joins still held the
 * runtime, the slot holds the destroyed marker instead of a runtime.
 */
const SHARED_AUTH_RUNTIME_SYMBOL = Symbol.for('frontx:auth:runtime');
/**
 * The slot the shell publishes its `frontxApi` transport config into. The
 * shared `AuthRuntime` carries the provider only, so a join would bind its
 * REST transport without the host's transport config; this slot carries the
 * whole `frontxApi` config the host `auth()` plugin was built with, and a
 * join forwards it into its binder args whole, so a field the joining copy
 * of the type does not declare yet rides along untouched.
 */
const SHARED_AUTH_TRANSPORT_CONFIG_SYMBOL = Symbol.for('frontx:auth:transport-config');
/**
 * The slot the shell publishes its transport binder into, when its `auth()`
 * plugin was built with a custom one (`AuthPluginConfig.transport`). A join
 * binds the same binder, so its requests carry the session the same way the
 * host's do; without it, a join would fall back to `frontxApiTransport()`,
 * which decorates no `kind: 'custom'` session.
 */
const SHARED_AUTH_TRANSPORT_BINDER_SYMBOL = Symbol.for('frontx:auth:transport-binder');
/**
 * The marker the slot holds once the host released while joins still held
 * the runtime. `Symbol.for` again: the host and the joins may run different
 * package copies, so the marker must be one value per realm, not per bundle.
 */
const DESTROYED_SHARED_AUTH_RUNTIME: unique symbol = Symbol.for('frontx:auth:runtime-destroyed');
/** How many runtimes currently hold the shared auth runtime. */
const SHARED_AUTH_RUNTIME_RETAINERS_SYMBOL = Symbol.for('frontx:auth:runtime-retainers');
/**
 * Bumped every time the retainer count leaves zero or returns to it, so a
 * release that races a join cannot delete the slot the join just retained.
 */
const SHARED_AUTH_RUNTIME_TEARDOWN_TOKEN_SYMBOL = Symbol.for('frontx:auth:runtime-teardown-token');

const DUPLICATE_PLUGIN_CLEANUP_SYMBOL = Symbol.for('frontx:plugin:duplicate-cleanup');

type SharedAuthRuntimeHost = typeof globalThis & {
  [SHARED_AUTH_RUNTIME_SYMBOL]?: AuthRuntime | typeof DESTROYED_SHARED_AUTH_RUNTIME;
  [SHARED_AUTH_TRANSPORT_CONFIG_SYMBOL]?: Hai3ApiAuthTransportConfig;
  [SHARED_AUTH_TRANSPORT_BINDER_SYMBOL]?: AuthTransportBinder;
  [SHARED_AUTH_RUNTIME_RETAINERS_SYMBOL]?: number;
  [SHARED_AUTH_RUNTIME_TEARDOWN_TOKEN_SYMBOL]?: number;
};

type AuthRealmPlugin = FrontXPlugin & {
  [DUPLICATE_PLUGIN_CLEANUP_SYMBOL]?: () => void;
};

/** The result of one release attempt on the shared auth runtime. */
type ReleaseResult = {
  /** The caller held a retainer and gave it back. */
  released: boolean;
  /** The teardown token to finalize the release with; `0` when nothing was released. */
  teardownToken: number;
};

/** Takes one retainer on the published runtime; the first one mints the teardown token. */
function retainSharedAuthRuntime(): void {
  const host = globalThis as SharedAuthRuntimeHost;
  const retainers = resolveSharedAuthRuntimeRetainers(host);
  host[SHARED_AUTH_RUNTIME_RETAINERS_SYMBOL] = retainers + 1;
  if (retainers === 0) {
    host[SHARED_AUTH_RUNTIME_TEARDOWN_TOKEN_SYMBOL] = resolveSharedAuthRuntimeTeardownToken(host) + 1;
  }
}

function resolveSharedAuthRuntimeRetainers(host: SharedAuthRuntimeHost): number {
  const retainers = host[SHARED_AUTH_RUNTIME_RETAINERS_SYMBOL];
  if (typeof retainers !== 'number' || !Number.isFinite(retainers) || retainers < 0) {
    return 0;
  }

  return retainers;
}

function resolveSharedAuthRuntimeTeardownToken(host: SharedAuthRuntimeHost): number {
  const token = host[SHARED_AUTH_RUNTIME_TEARDOWN_TOKEN_SYMBOL];
  if (typeof token !== 'number' || !Number.isInteger(token) || token < 0) {
    return 0;
  }

  return token;
}

/**
 * Publishes `runtime` as the realm's auth runtime and takes one retainer on
 * it. Refuses a second, different runtime: two providers in one realm would
 * sign in two sessions, and the caches of the realm would follow the wrong
 * one. A host that joins its own runtime again (rebuild with the same
 * plugin instance) just takes one more retainer. A destroyed marker from a
 * previous host is overwritten: the previous host released, so its runtime
 * is gone even if stale joins have not given their retainer back yet.
 */
function publishSharedAuthRuntime(runtime: AuthRuntime): void {
  const host = globalThis as SharedAuthRuntimeHost;
  if (publishesAnotherRuntime(runtime)) {
    throw new Error(SECOND_HOST_ERROR);
  }

  host[SHARED_AUTH_RUNTIME_SYMBOL] = runtime;
  retainSharedAuthRuntime();
}

/**
 * Takes one retainer on the auth runtime the realm already publishes.
 * Throws when there is no host runtime: a silently built second provider
 * would sign in a session the rest of the realm never sees. Throws on the
 * destroyed marker too: the host released and its auth() plugin destroyed
 * the provider right after, so the runtime it published is dead even though
 * stale joins still hold it.
 */
function joinSharedAuthRuntime(): AuthRuntime {
  const host = globalThis as SharedAuthRuntimeHost;
  const runtime = host[SHARED_AUTH_RUNTIME_SYMBOL];
  if (!runtime) {
    throw new Error(
      '[Gears FrontX] authRealmShared() requires an existing host authRealm() runtime. ' +
        'Build the shell app with auth() and authRealm() before the apps that call authRealmShared().'
    );
  }

  if (runtime === DESTROYED_SHARED_AUTH_RUNTIME) {
    throw new Error(
      '[Gears FrontX] authRealmShared() cannot join this realm: the host authRealm() runtime was ' +
        'already destroyed. Build the shell app again to publish a new one.'
    );
  }

  retainSharedAuthRuntime();
  return runtime;
}

function releaseSharedAuthRuntime(): ReleaseResult {
  const host = globalThis as SharedAuthRuntimeHost;
  const retainers = resolveSharedAuthRuntimeRetainers(host);

  if (retainers === 0) {
    return { released: false, teardownToken: 0 };
  }

  if (retainers === 1) {
    const teardownToken = resolveSharedAuthRuntimeTeardownToken(host) + 1;
    host[SHARED_AUTH_RUNTIME_RETAINERS_SYMBOL] = 0;
    host[SHARED_AUTH_RUNTIME_TEARDOWN_TOKEN_SYMBOL] = teardownToken;
    return { released: true, teardownToken };
  }

  host[SHARED_AUTH_RUNTIME_RETAINERS_SYMBOL] = retainers - 1;
  return { released: true, teardownToken: 0 };
}

/**
 * Deletes the published state on the last release. The teardown token guards
 * the delete: if a publish retained the slot again between the release and
 * this call, the token moved and what it publishes stays. Nothing else holds
 * a retainer once the count is zero, so whatever the slot holds (the last
 * runtime, or the destroyed marker of a host that released earlier) is the
 * state this release cleans up.
 */
function finalizeReleasedSharedAuthRuntime(teardownToken: number): boolean {
  const host = globalThis as SharedAuthRuntimeHost;
  if (resolveSharedAuthRuntimeRetainers(host) !== 0) {
    return false;
  }

  if (resolveSharedAuthRuntimeTeardownToken(host) !== teardownToken) {
    return false;
  }

  delete host[SHARED_AUTH_RUNTIME_SYMBOL];
  delete host[SHARED_AUTH_TRANSPORT_CONFIG_SYMBOL];
  delete host[SHARED_AUTH_TRANSPORT_BINDER_SYMBOL];
  delete host[SHARED_AUTH_RUNTIME_RETAINERS_SYMBOL];
  delete host[SHARED_AUTH_RUNTIME_TEARDOWN_TOKEN_SYMBOL];
  return true;
}

/**
 * Closes one plugin's hold on the shared runtime: runs the release once and
 * finalizes it on the last release. Every teardown path goes through here,
 * so duplicate cleanup and destroy cannot drift apart.
 */
function releaseAndFinalize(release: ReleaseResult): void {
  if (release.released) finalizeReleasedSharedAuthRuntime(release.teardownToken);
}

/**
 * The host release. When joins still hold the runtime, the slot stops
 * publishing it and holds the destroyed marker instead: the host `auth()`
 * plugin destroys the provider right after this release (destroy goes in
 * reverse order), so the slot may not keep handing the dead runtime out. The
 * joins keep the runtime they already hold and give their own retainer back
 * on destroy; the last release deletes the slot. A join that arrives before
 * that is rejected on the marker, and a new host can publish over it at once.
 */
function releaseHostSharedAuthRuntime(runtime: AuthRuntime): ReleaseResult {
  const host = globalThis as SharedAuthRuntimeHost;
  const release = releaseSharedAuthRuntime();
  if (!release.released) return release;

  if (host[SHARED_AUTH_RUNTIME_SYMBOL] === runtime) {
    if (resolveSharedAuthRuntimeRetainers(host) > 0) {
      host[SHARED_AUTH_RUNTIME_SYMBOL] = DESTROYED_SHARED_AUTH_RUNTIME;
    }
    delete host[SHARED_AUTH_TRANSPORT_CONFIG_SYMBOL];
    delete host[SHARED_AUTH_TRANSPORT_BINDER_SYMBOL];
  }
  return release;
}

/**
 * Publishes the host's `frontxApi` transport config beside the runtime, so a
 * join can bind its own transport with the same transport config the host
 * uses, forwarded whole into its binder args. The config is published as a
 * copy one level deep: every field passes through as it is, and an array
 * field - the origin lists - is copied into its own array, so the slot
 * outlives the host's `onInit` and an edit the host makes to its own object
 * or lists afterwards must not reach a join that binds then. A host built
 * without the options clears the slot, so a config of a previous host never
 * serves the joins of the next one.
 */
function publishSharedAuthTransportConfig(
  config: Hai3ApiAuthTransportConfig | undefined,
  binder: AuthTransportBinder | undefined,
): void {
  const host = globalThis as SharedAuthRuntimeHost;
  if (config) {
    host[SHARED_AUTH_TRANSPORT_CONFIG_SYMBOL] = Object.fromEntries(
      Object.entries(config).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value]),
    ) as Hai3ApiAuthTransportConfig;
  } else delete host[SHARED_AUTH_TRANSPORT_CONFIG_SYMBOL];
  if (binder) host[SHARED_AUTH_TRANSPORT_BINDER_SYMBOL] = binder;
  else delete host[SHARED_AUTH_TRANSPORT_BINDER_SYMBOL];
}

/** Reads the transport config the host realm published, when it published one. */
function readSharedAuthTransportConfig(): Hai3ApiAuthTransportConfig | undefined {
  return (globalThis as SharedAuthRuntimeHost)[SHARED_AUTH_TRANSPORT_CONFIG_SYMBOL];
}

/** Reads the transport binder the host realm published, when its auth() plugin uses a custom one. */
function readSharedAuthTransportBinder(): AuthTransportBinder | undefined {
  return (globalThis as SharedAuthRuntimeHost)[SHARED_AUTH_TRANSPORT_BINDER_SYMBOL];
}

/** Options of the host side of the realm's auth runtime. */
export type AuthRealmOptions = {
  /**
   * The same `frontxApi` options the `auth()` plugin takes. Published beside
   * the shared runtime, so every `authRealmShared()` join binds its own
   * transport with the same config, forwarded whole into its binder args.
   * Pass what the host `auth()` plugin was built with.
   */
  frontxApi?: Hai3ApiAuthTransportConfig;
  /**
   * The same `transport` binder the `auth()` plugin takes. Published beside
   * the shared runtime, so every `authRealmShared()` join binds its requests
   * with the binder the host uses instead of `frontxApiTransport()`. Pass it
   * whenever the host `auth()` plugin was built with one: a join cannot read
   * it off that plugin.
   */
  transport?: AuthTransportBinder;
};

/**
 * The error a second host meets. One realm shares one auth runtime: two
 * providers would sign in two sessions, and the caches would follow one.
 */
const SECOND_HOST_ERROR =
  '[Gears FrontX] authRealm() found a different auth runtime already published in this realm. ' +
  'One realm shares one auth runtime: destroy the other authRealm() host, or join the published ' +
  'runtime with authRealmShared() instead of hosting a second one.';

/**
 * The plugin of the builder registered under `name`.
 *
 * `FrontXAppBuilder` does not publish its plugin list, so this reads the
 * builder's own field. A builder that stops exposing it answers `undefined`,
 * and the `onInit` checks still refuse the build, only later.
 */
function findRegisteredPlugin(builder: FrontXAppBuilder, name: string): FrontXPlugin | undefined {
  const { plugins } = builder as unknown as {
    plugins?: ReadonlyArray<FrontXPlugin | undefined>;
  };
  if (!Array.isArray(plugins)) return undefined;
  return plugins.find((plugin) => plugin?.name === name);
}

/** Whether the realm already publishes a live runtime other than `runtime`. */
function publishesAnotherRuntime(runtime: unknown): boolean {
  const existing = (globalThis as SharedAuthRuntimeHost)[SHARED_AUTH_RUNTIME_SYMBOL];
  return Boolean(existing) && existing !== DESTROYED_SHARED_AUTH_RUNTIME && existing !== runtime;
}

/**
 * The provider a join binds its transport to: the shared provider, except
 * that `refresh` goes through the shared runtime's `refresh`. That one reports
 * the outcome to the host's session tracker and resolves only after it did,
 * so a 401 refresh in a joining app that lands on another identity clears the
 * realm's shared caches (`AuthEvents.LoggedIn` from the host) before the
 * transport retries the request. The raw provider `refresh` would reach no
 * tracker for a provider without `subscribe`. Every other member is read off
 * the provider at call time, bound to it, so hooks the host installs on the
 * provider after its build (`onTransportError`) keep working, and so is the
 * runtime's `refresh`.
 *
 * The Proxy wraps a separate, empty facade object, never the provider itself:
 * a Proxy must report a non-configurable, non-writable property of its target
 * unchanged, so wrapping a frozen provider would throw on every member this
 * handler replaces with a bound or tracked function. The facade has no own
 * properties, so the handler is free to answer every read.
 */
function trackedProvider(runtime: AuthRuntime): AuthProvider {
  const provider = runtime.provider;
  return new Proxy({} as AuthProvider, {
    get(_facade, key) {
      if (key === 'refresh') {
        return runtime.refresh ? (ctx?: AuthContext) => runtime.refresh!(ctx) : undefined;
      }
      const value: unknown = Reflect.get(provider, key, provider);
      return typeof value === 'function' ? value.bind(provider) : value;
    },
    has(_facade, key) {
      return key === 'refresh' ? Boolean(runtime.refresh) : Reflect.has(provider, key);
    },
  });
}

/**
 * The shell side of the realm's auth runtime. Depends on `auth()`, reads the
 * `app.auth` runtime it provides, and publishes it into the realm slot for
 * the `authRealmShared()` runtimes of the same page, together with the
 * `frontxApi` transport config the joins bind their own transport with.
 */
export function authRealm(options?: AuthRealmOptions): FrontXPlugin {
  let runtime: AuthRuntime | undefined;
  let released = false;

  function releaseOnce(): ReleaseResult {
    if (!runtime || released) {
      return { released: false, teardownToken: 0 };
    }

    released = true;
    return releaseHostSharedAuthRuntime(runtime);
  }

  const plugin: AuthRealmPlugin = {
    name: 'authRealm',
    dependencies: ['auth'],
    [DUPLICATE_PLUGIN_CLEANUP_SYMBOL]() {
      releaseAndFinalize(releaseOnce());
    },
    onRegister(builder) {
      // Refuse a second host before any plugin's onInit runs. `auth()` does
      // all of its work there: it registers its REST transport in the shared
      // apiRegistry, starts the session tracker and subscribes to the
      // provider, and a build that throws rolls none of that back. The
      // runtime this build will publish is the one its auth() plugin
      // provides, so a rebuild with the same auth() instance still passes.
      const authPlugin = findRegisteredPlugin(builder, 'auth');
      if (authPlugin && publishesAnotherRuntime(authPlugin.provides?.app?.auth)) {
        throw new Error(SECOND_HOST_ERROR);
      }
    },
    onInit(app) {
      const authRuntime = app.auth;
      if (!authRuntime) {
        throw new Error(
          '[Gears FrontX] authRealm() requires the auth plugin. Add auth({ provider }) to the app, ' +
            'which provides app.auth, then add authRealm().'
        );
      }

      runtime = authRuntime;
      released = false;
      publishSharedAuthRuntime(authRuntime);
      publishSharedAuthTransportConfig(options?.frontxApi, options?.transport);
    },
    onDestroy() {
      releaseAndFinalize(releaseOnce());
    },
  };

  return plugin;
}

/**
 * The error both refusal checks throw. A joining app that registered `auth()`
 * of its own must not keep an `app.auth` beside the join: the two auth
 * transports would decorate the same requests.
 */
const REPLACES_AUTH_ERROR =
  '[Gears FrontX] authRealmShared() replaces auth(): remove auth({ provider }) from the joining app.';

/**
 * The joining side of the realm's auth runtime, for a microfrontend or any
 * second app in the same page. Reads the slot the shell's `authRealm()`
 * publishes (and throws when there is none), provides the shared runtime as
 * this app's `app.auth`, and binds `frontxApiTransport()` to the shared
 * runtime's provider, so this app's own apiRegistry decorates its REST
 * requests with the realm's session. The transport is bound with the
 * `frontxApi` config the host published, forwarded whole into the binder
 * args (every field of it, one the joining copy of the type does not declare
 * yet included), when it published one. It replaces `auth()` for this app and
 * refuses to build when the app registered an `auth()` plugin of its own,
 * before any plugin's `onInit` runs, so the refused build leaves nothing of
 * that `auth()` behind (its REST transport, its session tracker, its provider
 * subscription). `build()` rolls no plugin back, so a refusal during `onInit`
 * would leak all three into the shared `apiRegistry` and the page.
 *
 * The session tracker and the `AuthEvents` emission belong to the host
 * `auth()` runtime, so a refresh a 401 starts in this app goes through the
 * shared runtime's `refresh` (`trackedProvider()`): the host tracker sees the
 * outcome, emits `AuthEvents.LoggedIn` when the refresh landed on another
 * identity, and the retry waits until it has. The transport is bound with the
 * binder the host published (`authRealm({ transport })`), or with
 * `frontxApiTransport()` when it published none. A refresh still dedups per
 * transport plugin instance, the same per-copy limit the shared fetch cache
 * and the shared `QueryClient` accept.
 */
export function authRealmShared(): FrontXPlugin {
  let runtime: AuthRuntime | undefined;
  let binding: AuthTransportBinding | null = null;
  let released = false;

  /**
   * Destroys the REST transport binding this join added, once. Both teardown
   * paths call it, so the binding teardown cannot drift apart the way the
   * release already cannot (`releaseAndFinalize()`).
   */
  function destroyBinding(): void {
    if (binding) {
      binding.destroy();
      binding = null;
    }
  }

  function releaseOnce(): ReleaseResult {
    if (!runtime || released) {
      return { released: false, teardownToken: 0 };
    }

    released = true;
    return releaseSharedAuthRuntime();
  }

  const plugin: AuthRealmPlugin = {
    name: 'authRealmShared',
    [DUPLICATE_PLUGIN_CLEANUP_SYMBOL]() {
      destroyBinding();

      releaseAndFinalize(releaseOnce());
    },
    onRegister(builder) {
      // Refuse before any plugin's onInit runs. `auth()` does all of its work
      // there: it registers its REST transport in the shared apiRegistry,
      // starts the session tracker and subscribes to the provider, and a build
      // that throws rolls none of that back.
      if (findRegisteredPlugin(builder, 'auth')) {
        throw new Error(REPLACES_AUTH_ERROR);
      }
    },
    onInit(app) {
      // The backstop for a builder whose plugin list this copy cannot read:
      // same refusal, after the other onInit hooks have run.
      if (app.auth) {
        throw new Error(REPLACES_AUTH_ERROR);
      }
      runtime = joinSharedAuthRuntime();
      released = false;
      // The shared runtime is only known here, after the slot read: provides
      // are merged before any onInit runs, so the join assigns app.auth now.
      app.auth = runtime;
      // The host publishes the transport config its auth() plugin was built
      // with: without it, a cookie session would go out with neither the
      // credentials nor the CSRF header the host's own requests carry. The
      // config is spread into the binder args whole, not picked field by
      // field, and as the first entry: a stray key in the published config
      // can never replace the provider or one of the plugin hooks, while a
      // field of
      // `Hai3ApiAuthTransportConfig` this copy of the framework does not know
      // yet rides along untouched and reaches the binder the day the host
      // sends it.
      // `trackRefresh` is set after the spread for the same reason: it is the
      // one hook of the binder args a stray key could land on, and a refresh
      // report it carried would reach the host binder unwired to this
      // runtime's session tracking. The provider and both plugin callbacks
      // are written after the spread unconditionally.
      // The spread needs no cast: spreading a typed value never triggers the
      // excess-property check, while a known field that drifts away from the
      // binder args type still fails type-check.
      // The binder is the host's own when it published one (a custom
      // `AuthPluginConfig.transport`), so a joining request carries the
      // session the same way a host request does.
      const transportConfig = readSharedAuthTransportConfig();
      const transport = readSharedAuthTransportBinder() ?? frontxApiTransport();
      try {
        binding = transport({
          ...transportConfig,
          provider: trackedProvider(runtime),
          trackRefresh: undefined,
          addRestPlugin: (plugin) => app.apiRegistry.plugins.add(RestProtocol, plugin),
          removeRestPlugin: (pluginClass) => app.apiRegistry.plugins.remove(RestProtocol, pluginClass),
        });
      } catch (error) {
        // The join already took its retainer, and a build that throws never
        // returns an app nobody can destroy: give the retainer back here, or
        // the realm would count a holder that no release ever balances out.
        delete app.auth;
        releaseAndFinalize(releaseOnce());
        throw error;
      }
    },
    onDestroy(app) {
      destroyBinding();
      if (runtime) {
        delete app.auth;
      }

      releaseAndFinalize(releaseOnce());
    },
  };

  return plugin;
}
