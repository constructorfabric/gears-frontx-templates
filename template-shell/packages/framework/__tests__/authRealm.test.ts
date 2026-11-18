/**
 * Unit tests for the authRealm / authRealmShared plugins
 *
 * Covers:
 * 1. The host publishes app.auth into the realm slot and takes one retainer.
 * 2. authRealmShared() joins the same runtime: a login on the joined app.auth
 *    reaches the host provider.
 * 3. authRealmShared() throws when no host runtime exists.
 * 4. The joined runtime's REST requests carry the bearer token through the
 *    joining app's own apiRegistry.
 * 5. The join binds its transport with the frontxApi config the host realm
 *    publishes (cookie credentials and CSRF header).
 * 6. Teardown: releases are counted, the host release marks the runtime
 *    destroyed while a join still holds it (its auth() plugin destroys the
 *    provider right after), and the last release deletes the slot.
 * 7. The join removes its transport plugin on destroy.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { RestPluginHooks, RestRequestContext } from '@gears-frontx/api';
import type { AuthProvider, AuthSession, AuthTransition } from '@gears-frontx/auth';
import type { AuthRuntime, AuthTransportBinder, Hai3ApiAuthTransportConfig } from '../src/plugins/auth';

// One apiRegistry singleton serves every module graph of this file: the api
// package is external, so vi.resetModules() keeps its module state. Reset it
// around every test so transport plugins cannot bleed between tests.
let apiRegistry: typeof import('@gears-frontx/api').apiRegistry;
let RestProtocol: typeof import('@gears-frontx/api').RestProtocol;

const SHARED_AUTH_RUNTIME_SYMBOL = Symbol.for('frontx:auth:runtime');
const SHARED_AUTH_TRANSPORT_CONFIG_SYMBOL = Symbol.for('frontx:auth:transport-config');
const SHARED_AUTH_RUNTIME_RETAINERS_SYMBOL = Symbol.for('frontx:auth:runtime-retainers');
const SHARED_AUTH_RUNTIME_TEARDOWN_TOKEN_SYMBOL = Symbol.for('frontx:auth:runtime-teardown-token');

type RealmHost = typeof globalThis & {
  [SHARED_AUTH_RUNTIME_SYMBOL]?: AuthRuntime;
  [SHARED_AUTH_TRANSPORT_CONFIG_SYMBOL]?: Hai3ApiAuthTransportConfig;
  [SHARED_AUTH_RUNTIME_RETAINERS_SYMBOL]?: number;
  [SHARED_AUTH_RUNTIME_TEARDOWN_TOKEN_SYMBOL]?: number;
};

function peekPublishedRuntime(): AuthRuntime | undefined {
  return (globalThis as RealmHost)[SHARED_AUTH_RUNTIME_SYMBOL];
}

function peekPublishedTransportConfig(): Hai3ApiAuthTransportConfig | undefined {
  return (globalThis as RealmHost)[SHARED_AUTH_TRANSPORT_CONFIG_SYMBOL];
}

function peekRetainers(): number | undefined {
  return (globalThis as RealmHost)[SHARED_AUTH_RUNTIME_RETAINERS_SYMBOL];
}

function peekTeardownToken(): number | undefined {
  return (globalThis as RealmHost)[SHARED_AUTH_RUNTIME_TEARDOWN_TOKEN_SYMBOL];
}

function clearRealmSlots(): void {
  const host = globalThis as RealmHost;
  delete host[SHARED_AUTH_RUNTIME_SYMBOL];
  delete host[SHARED_AUTH_TRANSPORT_CONFIG_SYMBOL];
  delete host[SHARED_AUTH_RUNTIME_RETAINERS_SYMBOL];
  delete host[SHARED_AUTH_RUNTIME_TEARDOWN_TOKEN_SYMBOL];
}

/**
 * One app per runtime: every app under test loads its own module copy, and
 * every import below resolves inside one reset window, so one app's
 * createFrontX, plugins and apiRegistry always belong to the same graph.
 */
type FrameworkGraph = {
  createFrontX: typeof import('../src/createFrontX').createFrontX;
  auth: typeof import('../src/plugins/auth').auth;
  authRealm: typeof import('../src/plugins/authRealm').authRealm;
  authRealmShared: typeof import('../src/plugins/authRealm').authRealmShared;
  apiRegistry: typeof import('@gears-frontx/api').apiRegistry;
  RestProtocol: typeof import('@gears-frontx/api').RestProtocol;
};

async function loadGraph(): Promise<FrameworkGraph> {
  vi.resetModules();
  const [createFrontXModule, authModule, authRealmModule, apiModule] = await Promise.all([
    import('../src/createFrontX'),
    import('../src/plugins/auth'),
    import('../src/plugins/authRealm'),
    import('@gears-frontx/api'),
  ]);
  return {
    createFrontX: createFrontXModule.createFrontX,
    auth: authModule.auth,
    authRealm: authRealmModule.authRealm,
    authRealmShared: authRealmModule.authRealmShared,
    apiRegistry: apiModule.apiRegistry,
    RestProtocol: apiModule.RestProtocol,
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeBearerProvider(token: string, extra: Partial<AuthProvider> = {}): AuthProvider {
  return {
    getSession: vi.fn().mockResolvedValue({ kind: 'bearer', token } satisfies AuthSession),
    checkAuth: vi.fn().mockResolvedValue({ authenticated: true }),
    logout: vi.fn().mockResolvedValue({ type: 'none' }),
    ...extra,
  };
}

function makeLoginProvider(token: string, login: AuthProvider['login']): AuthProvider {
  return makeBearerProvider(token, { login });
}

/** The transport plugin `frontxApiTransport()` registered for a protocol. */
type AuthTransportPlugin = RestPluginHooks & { onRequest: RestPluginHooks['onRequest'] };

function makeReqCtx(url: string, headers: Record<string, string> = {}): RestRequestContext {
  return { method: 'GET', url, headers };
}

beforeEach(async () => {
  ({ apiRegistry, RestProtocol } = await import('@gears-frontx/api'));
  apiRegistry.reset();
  clearRealmSlots();
});

afterEach(() => {
  apiRegistry.reset();
  clearRealmSlots();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('authRealm() - host side', () => {
  it('declares the auth plugin as its dependency', async () => {
    const { authRealm } = await loadGraph();
    const plugin = authRealm();
    expect(plugin.name).toBe('authRealm');
    expect(plugin.dependencies).toEqual(['auth']);
  });

  it('publishes the app auth runtime into the realm slot with one retainer', async () => {
    const { createFrontX, auth, authRealm } = await loadGraph();
    const provider = makeBearerProvider('token-1');

    const app = createFrontX().use(auth({ provider })).use(authRealm()).build();

    expect(app.auth).toBeDefined();
    expect(peekPublishedRuntime()).toBe(app.auth);
    expect(peekRetainers()).toBe(1);
    expect(peekPublishedRuntime()?.provider).toBe(provider);
  });

  it('throws a clear error when the auth plugin did not run', async () => {
    const { createFrontX, authRealm } = await loadGraph();

    expect(() => createFrontX().use(authRealm()).build()).toThrow(
      /authRealm\(\) requires the auth plugin/,
    );
    expect(peekPublishedRuntime()).toBeUndefined();
  });

  it('refuses to publish a second, different auth runtime in the same realm', async () => {
    const first = await loadGraph();
    first.createFrontX().use(first.auth({ provider: makeBearerProvider('token-1') })).use(first.authRealm()).build();

    const second = await loadGraph();
    expect(() =>
      second
        .createFrontX()
        .use(second.auth({ provider: makeBearerProvider('token-2') }))
        .use(second.authRealm())
        .build(),
    ).toThrow(/found a different auth runtime already published/);
  });

  it('refuses a second host before its auth() plugin starts a transport, a tracker or a subscription', async () => {
    const first = await loadGraph();
    const firstApp = first
      .createFrontX()
      .use(first.auth({ provider: makeBearerProvider('token-1') }))
      .use(first.authRealm())
      .build();
    const transportsBefore = apiRegistry.plugins.getAll(RestProtocol).length;

    const second = await loadGraph();
    const subscribe = vi.fn(() => () => undefined);
    const secondProvider = makeBearerProvider('token-2', { subscribe });
    expect(() =>
      second.createFrontX().use(second.auth({ provider: secondProvider })).use(second.authRealm()).build(),
    ).toThrow(/found a different auth runtime already published/);

    // No transport in the shared registry, no session tracker baseline read,
    // no provider subscription: the refusal came before auth() onInit.
    expect(apiRegistry.plugins.getAll(RestProtocol)).toHaveLength(transportsBefore);
    expect(secondProvider.checkAuth).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
    expect(peekPublishedRuntime()).toBe(firstApp.auth);
    expect(peekRetainers()).toBe(1);
  });

  it('deletes the slot on destroy', async () => {
    const { createFrontX, auth, authRealm } = await loadGraph();
    const app = createFrontX().use(auth({ provider: makeBearerProvider('token-1') })).use(authRealm()).build();
    expect(peekPublishedRuntime()).toBe(app.auth);

    app.destroy();

    expect(peekPublishedRuntime()).toBeUndefined();
    expect(peekRetainers()).toBeUndefined();
    expect(peekTeardownToken()).toBeUndefined();
  });

  it('publishes the frontxApi transport config for joining apps and clears it on destroy', async () => {
    const { createFrontX, auth, authRealm } = await loadGraph();
    const frontxApi: Hai3ApiAuthTransportConfig = {
      allowedCookieOrigins: ['https://api.example.com'],
      csrfHeaderName: 'x-csrf-token',
    };
    const app = createFrontX()
      .use(auth({ provider: makeBearerProvider('token-1'), frontxApi }))
      .use(authRealm({ frontxApi }))
      .build();
    expect(peekPublishedTransportConfig()).toEqual(frontxApi);

    app.destroy();

    expect(peekPublishedTransportConfig()).toBeUndefined();
  });
});

describe('authRealmShared() - joining side', () => {
  it('has no auth dependency: it replaces auth() for the joining app', async () => {
    const { authRealmShared } = await loadGraph();
    const plugin = authRealmShared();
    expect(plugin.name).toBe('authRealmShared');
    expect(plugin.dependencies).toBeUndefined();
  });

  it('joins the host runtime, so a login on the joined app.auth reaches the host provider', async () => {
    const hostGraph = await loadGraph();
    const login = vi.fn().mockResolvedValue({ type: 'none' } satisfies AuthTransition);
    const provider = makeLoginProvider('token-1', login);
    const hostApp = hostGraph.createFrontX().use(hostGraph.auth({ provider })).use(hostGraph.authRealm()).build();

    const joinGraph = await loadGraph();
    const joinApp = joinGraph.createFrontX().use(joinGraph.authRealmShared()).build();

    expect(joinApp.auth).toBe(hostApp.auth);
    expect(joinApp.auth?.provider).toBe(provider);
    expect(peekRetainers()).toBe(2);

    const sharedAuth = joinApp.auth;
    if (!sharedAuth?.login) throw new Error('expected the shared runtime to expose login');
    await sharedAuth.login({ type: 'password', payload: { username: 'ada', password: 'secret' } });

    expect(login).toHaveBeenCalledTimes(1);
    expect(login).toHaveBeenCalledWith({ type: 'password', payload: { username: 'ada', password: 'secret' } }, undefined);
  });

  it('joins the same runtime for every app of the realm', async () => {
    const hostGraph = await loadGraph();
    const hostApp = hostGraph
      .createFrontX()
      .use(hostGraph.auth({ provider: makeBearerProvider('token-1') }))
      .use(hostGraph.authRealm())
      .build();

    const joinGraphA = await loadGraph();
    const joinAppA = joinGraphA.createFrontX().use(joinGraphA.authRealmShared()).build();

    const joinGraphB = await loadGraph();
    const joinAppB = joinGraphB.createFrontX().use(joinGraphB.authRealmShared()).build();

    expect(joinAppA.auth).toBe(hostApp.auth);
    expect(joinAppB.auth).toBe(hostApp.auth);
    expect(peekRetainers()).toBe(3);
  });

  it('throws a clear error when no host runtime exists', async () => {
    const { createFrontX, authRealmShared } = await loadGraph();

    expect(() => createFrontX().use(authRealmShared()).build()).toThrow(
      /authRealmShared\(\) requires an existing host authRealm\(\) runtime/,
    );
  });

  it('refuses a joining app that also registered auth() instead of overwriting it', async () => {
    const hostGraph = await loadGraph();
    const hostApp = hostGraph
      .createFrontX()
      .use(hostGraph.auth({ provider: makeBearerProvider('token-1') }))
      .use(hostGraph.authRealm())
      .build();
    expect(peekRetainers()).toBe(1);
    const transportsBeforeRefusal = apiRegistry.plugins.getAll(RestProtocol).length;

    const joinGraph = await loadGraph();
    expect(() =>
      joinGraph
        .createFrontX()
        .use(joinGraph.auth({ provider: makeBearerProvider('token-2') }))
        .use(joinGraph.authRealmShared())
        .build(),
    ).toThrow(/authRealmShared\(\) replaces auth\(\)/);

    // The refusal happens before the join: no retainer was taken, and the
    // host runtime is still the published one.
    expect(peekRetainers()).toBe(1);
    expect(peekPublishedRuntime()).toBe(hostApp.auth);

    // It also happens before any plugin's onInit runs. auth() registers its
    // REST transport in the shared apiRegistry when its onInit runs, and a
    // build that throws rolls no plugin back, so a refusal there would leave
    // that transport (and the session tracker beside it) in the shared
    // registry for the rest of the page's life.
    expect(apiRegistry.plugins.getAll(RestProtocol)).toHaveLength(transportsBeforeRefusal);
  });

  it('releases the retainer when the transport binding throws', async () => {
    const hostGraph = await loadGraph();
    const hostApp = hostGraph
      .createFrontX()
      .use(hostGraph.auth({ provider: makeBearerProvider('token-1') }))
      .use(hostGraph.authRealm())
      .build();
    expect(peekRetainers()).toBe(1);

    // A build whose onInit throws never returns an app nobody could destroy,
    // so the join has to give its retainer back on the failure itself.
    const add = vi.spyOn(apiRegistry.plugins, 'add').mockImplementation(() => {
      throw new Error('registry refused the auth transport plugin');
    });

    const joinGraph = await loadGraph();
    expect(() => joinGraph.createFrontX().use(joinGraph.authRealmShared()).build()).toThrow(
      'registry refused the auth transport plugin',
    );
    add.mockRestore();

    // The failed join left no retainer behind and the slot still publishes
    // the host runtime, so a later join works.
    expect(peekRetainers()).toBe(1);
    expect(peekPublishedRuntime()).toBe(hostApp.auth);

    const retryGraph = await loadGraph();
    const retryApp = retryGraph.createFrontX().use(retryGraph.authRealmShared()).build();
    expect(retryApp.auth).toBe(hostApp.auth);
    expect(peekRetainers()).toBe(2);
  });

  it('carries the bearer token through the joining app own apiRegistry', async () => {
    const hostGraph = await loadGraph();
    const provider = makeBearerProvider('token-1');
    hostGraph.createFrontX().use(hostGraph.auth({ provider })).use(hostGraph.authRealm()).build();

    // The api singleton is shared by every graph of this file, so the host
    // auth() transport is registered here too. Diff the list around the join
    // to pin down the plugin the join added.
    const beforeJoin = [...apiRegistry.plugins.getAll(RestProtocol)];

    const joinGraph = await loadGraph();
    const joinApp = joinGraph.createFrontX().use(joinGraph.authRealmShared()).build();

    expect(joinApp.apiRegistry).toBe(apiRegistry);
    const afterJoin = apiRegistry.plugins.getAll(RestProtocol);
    expect(afterJoin).toHaveLength(beforeJoin.length + 1);
    const joinPlugin = afterJoin.find((plugin) => !beforeJoin.includes(plugin));
    expect(joinPlugin).toBeDefined();

    const ctx = (await (joinPlugin as AuthTransportPlugin).onRequest?.(makeReqCtx('/accounts/me'))) as RestRequestContext;

    expect(ctx.headers.Authorization).toBe('Bearer token-1');
    // The session comes from the shared runtime's provider: the host's one.
    expect(provider.getSession).toHaveBeenCalledTimes(1);
  });

  it('binds the joining transport with the frontxApi config the host realm publishes', async () => {
    const hostGraph = await loadGraph();
    const frontxApi: Hai3ApiAuthTransportConfig = {
      allowedCookieOrigins: ['https://api.example.com'],
      csrfHeaderName: 'x-csrf-token',
    };
    const provider: AuthProvider = {
      getSession: vi.fn().mockResolvedValue({ kind: 'cookie', csrfToken: 'csrf-1' } satisfies AuthSession),
      checkAuth: vi.fn().mockResolvedValue({ authenticated: true }),
      logout: vi.fn().mockResolvedValue({ type: 'none' }),
    };
    hostGraph
      .createFrontX()
      .use(hostGraph.auth({ provider, frontxApi }))
      .use(hostGraph.authRealm({ frontxApi }))
      .build();

    // The api singleton is shared by every graph of this file. Diff the list
    // around the join to pin down the transport plugin the join added.
    const beforeJoin = [...apiRegistry.plugins.getAll(RestProtocol)];

    const joinGraph = await loadGraph();
    joinGraph.createFrontX().use(joinGraph.authRealmShared()).build();

    const afterJoin = apiRegistry.plugins.getAll(RestProtocol);
    const joinPlugin = afterJoin.find((plugin) => !beforeJoin.includes(plugin));
    expect(joinPlugin).toBeDefined();

    const ctx = (await (joinPlugin as AuthTransportPlugin).onRequest?.(
      makeReqCtx('https://api.example.com/accounts/me'),
    )) as RestRequestContext;

    expect(ctx.withCredentials).toBe(true);
    expect(ctx.headers['x-csrf-token']).toBe('csrf-1');
  });

  it('removes its transport plugin from the joining app registry on destroy', async () => {
    const hostGraph = await loadGraph();
    hostGraph.createFrontX().use(hostGraph.auth({ provider: makeBearerProvider('token-1') })).use(hostGraph.authRealm()).build();

    const joinGraph = await loadGraph();
    const joinApp = joinGraph.createFrontX().use(joinGraph.authRealmShared()).build();
    const joined = apiRegistry.plugins.getAll(RestProtocol).length;

    joinApp.destroy();

    expect(apiRegistry.plugins.getAll(RestProtocol)).toHaveLength(joined - 1);
  });

  it('detaches the shared runtime from the joining app on destroy', async () => {
    const hostGraph = await loadGraph();
    const hostApp = hostGraph
      .createFrontX()
      .use(hostGraph.auth({ provider: makeBearerProvider('token-1') }))
      .use(hostGraph.authRealm())
      .build();

    const joinGraph = await loadGraph();
    const joinApp = joinGraph.createFrontX().use(joinGraph.authRealmShared()).build();
    expect(joinApp.auth).toBe(hostApp.auth);

    joinApp.destroy();

    expect(joinApp.auth).toBeUndefined();
    // The host still holds the runtime: the slot survives.
    expect(peekPublishedRuntime()).toBe(hostApp.auth);
    expect(peekRetainers()).toBe(1);
  });

  it('reports a joined 401 refresh to the host tracker, which clears for the new identity before the retry', async () => {
    // No subscribe: the host tracker hears of a refresh only when it is told.
    let sub = 'user-a';
    let token = 'token-a';
    const getIdentity = vi.fn(async () => ({ sub }));
    const refresh = vi.fn(async () => {
      sub = 'user-b';
      token = 'token-b';
      return { kind: 'bearer', token } satisfies AuthSession;
    });
    const provider: AuthProvider = {
      getSession: vi.fn(async () => ({ kind: 'bearer', token }) satisfies AuthSession),
      checkAuth: vi.fn().mockResolvedValue({ authenticated: true }),
      logout: vi.fn().mockResolvedValue({ type: 'none' }),
      getIdentity,
      refresh,
    };
    const hostGraph = await loadGraph();
    // The host's eventBus: the module graph the host plugins were loaded in.
    const { eventBus } = await import('@gears-frontx/state');
    hostGraph.createFrontX().use(hostGraph.auth({ provider })).use(hostGraph.authRealm()).build();
    // The host's baseline (user A) lands before the 401.
    await vi.waitFor(() => expect(getIdentity).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const order: string[] = [];
    eventBus.on('auth/loggedIn', () => order.push('loggedIn'));

    const beforeJoin = [...apiRegistry.plugins.getAll(RestProtocol)];
    const joinGraph = await loadGraph();
    joinGraph.createFrontX().use(joinGraph.authRealmShared()).build();
    const joinPlugin = apiRegistry.plugins.getAll(RestProtocol).find((plugin) => !beforeJoin.includes(plugin)) as
      | (AuthTransportPlugin & Pick<RestPluginHooks, 'onError'>)
      | undefined;
    expect(joinPlugin).toBeDefined();

    const errCtx = {
      error: new Error('HTTP 401'),
      request: makeReqCtx('/accounts/me'),
      response: { status: 401, headers: {}, data: null },
      retryCount: 0,
      retry: vi.fn(async () => {
        order.push('retry');
        return { status: 200, headers: {}, data: {} };
      }),
    };
    await joinPlugin?.onError?.(errCtx);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(errCtx.retry).toHaveBeenCalledWith({ headers: { Authorization: 'Bearer token-b' } });
    // The host emitted the session change for user B, and before the retry.
    expect(order).toEqual(['loggedIn', 'retry']);
  });

  it('joins a host whose provider is frozen, for requests and for a 401 refresh', async () => {
    let token = 'token-a';
    const refresh = vi.fn(async () => {
      token = 'token-b';
      return { kind: 'bearer', token } satisfies AuthSession;
    });
    const provider: AuthProvider = Object.freeze({
      getSession: vi.fn(async () => ({ kind: 'bearer', token }) satisfies AuthSession),
      checkAuth: vi.fn().mockResolvedValue({ authenticated: true }),
      logout: vi.fn().mockResolvedValue({ type: 'none' }),
      refresh,
    });
    const hostGraph = await loadGraph();
    hostGraph.createFrontX().use(hostGraph.auth({ provider })).use(hostGraph.authRealm()).build();

    const beforeJoin = [...apiRegistry.plugins.getAll(RestProtocol)];
    const joinGraph = await loadGraph();
    joinGraph.createFrontX().use(joinGraph.authRealmShared()).build();
    const joinPlugin = apiRegistry.plugins.getAll(RestProtocol).find((plugin) => !beforeJoin.includes(plugin)) as
      | (AuthTransportPlugin & Pick<RestPluginHooks, 'onError'>)
      | undefined;
    expect(joinPlugin).toBeDefined();

    const ctx = (await joinPlugin?.onRequest?.(makeReqCtx('/accounts/me'))) as RestRequestContext;
    expect(ctx.headers.Authorization).toBe('Bearer token-a');

    const errCtx = {
      error: new Error('HTTP 401'),
      request: makeReqCtx('/accounts/me'),
      response: { status: 401, headers: {}, data: null },
      retryCount: 0,
      retry: vi.fn(async () => ({ status: 200, headers: {}, data: {} })),
    };
    await joinPlugin?.onError?.(errCtx);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(errCtx.retry).toHaveBeenCalledWith({ headers: { Authorization: 'Bearer token-b' } });
  });

  it('binds the joining requests with the transport binder the host published', async () => {
    const custom: AuthSession = { kind: 'custom', data: { apiKey: 'key-1' } } as unknown as AuthSession;
    const provider: AuthProvider = {
      getSession: vi.fn().mockResolvedValue(custom),
      checkAuth: vi.fn().mockResolvedValue({ authenticated: true }),
      logout: vi.fn().mockResolvedValue({ type: 'none' }),
    };
    const bound: AuthProvider[] = [];
    const transport = vi.fn((args: Parameters<AuthTransportBinder>[0]) => {
      bound.push(args.provider);
      return { destroy: () => undefined };
    });
    const hostGraph = await loadGraph();
    hostGraph
      .createFrontX()
      .use(hostGraph.auth({ provider, transport }))
      .use(hostGraph.authRealm({ transport }))
      .build();
    expect(transport).toHaveBeenCalledTimes(1);

    const joinGraph = await loadGraph();
    joinGraph.createFrontX().use(joinGraph.authRealmShared()).build();

    // The join bound the host's binder, not frontxApiTransport(), and its
    // provider answers with the host's session.
    expect(transport).toHaveBeenCalledTimes(2);
    expect(await bound[1]?.getSession()).toBe(custom);
  });
});

describe('authRealm() and authRealmShared() - teardown', () => {
  it('marks the runtime destroyed when the host releases while a join still holds it', async () => {
    const hostGraph = await loadGraph();
    const hostApp = hostGraph
      .createFrontX()
      .use(hostGraph.auth({ provider: makeBearerProvider('token-1') }))
      .use(hostGraph.authRealm())
      .build();

    const joinGraph = await loadGraph();
    const joinApp = joinGraph.createFrontX().use(joinGraph.authRealmShared()).build();
    expect(peekRetainers()).toBe(2);

    hostApp.destroy();

    // The join keeps the runtime it already holds, but nothing publishes it
    // any more: the host auth() plugin destroys the provider right after
    // authRealm() releases, so the slot holds the destroyed marker instead.
    expect(joinApp.auth).toBe(hostApp.auth);
    expect(peekPublishedRuntime()).not.toBe(hostApp.auth);
    expect(peekRetainers()).toBe(1);

    // A join that arrives now is rejected instead of reaching the destroyed provider.
    const lateJoinGraph = await loadGraph();
    expect(() => lateJoinGraph.createFrontX().use(lateJoinGraph.authRealmShared()).build()).toThrow(
      /the host authRealm\(\) runtime was already destroyed/,
    );
    expect(peekRetainers()).toBe(1);

    // A new host can publish without waiting for the stale join to release.
    const secondGraph = await loadGraph();
    const secondApp = secondGraph
      .createFrontX()
      .use(secondGraph.auth({ provider: makeBearerProvider('token-2') }))
      .use(secondGraph.authRealm())
      .build();
    expect(peekPublishedRuntime()).toBe(secondApp.auth);
    expect(peekRetainers()).toBe(2);

    // The stale join gives its own retainer back only.
    joinApp.destroy();
    expect(joinApp.auth).toBeUndefined();
    expect(peekPublishedRuntime()).toBe(secondApp.auth);
    expect(peekRetainers()).toBe(1);

    secondApp.destroy();

    expect(peekPublishedRuntime()).toBeUndefined();
    expect(peekRetainers()).toBeUndefined();
    expect(peekTeardownToken()).toBeUndefined();
  });

  it('deletes the slot only on the last release', async () => {
    const hostGraph = await loadGraph();
    const hostApp = hostGraph
      .createFrontX()
      .use(hostGraph.auth({ provider: makeBearerProvider('token-1') }))
      .use(hostGraph.authRealm())
      .build();

    const joinGraph = await loadGraph();
    const joinApp = joinGraph.createFrontX().use(joinGraph.authRealmShared()).build();
    expect(peekRetainers()).toBe(2);

    hostApp.destroy();

    // The join still holds its retainer, so the slot is not deleted yet; the
    // host release has already replaced the runtime with the destroyed marker.
    expect(joinApp.auth).toBe(hostApp.auth);
    expect(peekPublishedRuntime()).not.toBe(hostApp.auth);
    expect(peekRetainers()).toBe(1);

    joinApp.destroy();

    expect(peekPublishedRuntime()).toBeUndefined();
    expect(peekRetainers()).toBeUndefined();
    expect(peekTeardownToken()).toBeUndefined();
  });

  it('lets a new host publish after the previous host released', async () => {
    const hostGraph = await loadGraph();
    const hostApp = hostGraph
      .createFrontX()
      .use(hostGraph.auth({ provider: makeBearerProvider('token-1') }))
      .use(hostGraph.authRealm())
      .build();

    hostApp.destroy();
    expect(peekPublishedRuntime()).toBeUndefined();

    // A new host publishes again after the slot was deleted.
    const secondGraph = await loadGraph();
    const secondApp = secondGraph
      .createFrontX()
      .use(secondGraph.auth({ provider: makeBearerProvider('token-2') }))
      .use(secondGraph.authRealm())
      .build();

    expect(peekPublishedRuntime()).toBe(secondApp.auth);
    expect(peekRetainers()).toBe(1);
  });
});
