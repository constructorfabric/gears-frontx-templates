/**
 * Unit tests for the realm side of the auth() plugin
 *
 * `auth({ provider })` passes the realm's one provider and publishes the
 * session runtime; `auth()` with no provider joins it. Every app under test
 * loads its own module copy of the framework, as the shell and each
 * microfrontend of a page do.
 *
 * Covers:
 * 1. Symmetry: the app that passed the provider and the apps that joined hold
 *    the same runtime the same way, whichever of them is the shell.
 * 2. A second provider is refused before any side effect, across apps and
 *    inside one app.
 * 3. A join with no provider in the realm is an error, raised before any side
 *    effect.
 * 4. AuthEvents reach the eventBus of every app that holds the runtime.
 * 5. The provider lives while any app holds it: the last release destroys it.
 * 6. A realm record of another contract version is refused.
 * 7. A joined app's REST transport: the session, the published frontxApi
 *    config and binder, the origin lists, the 401 refresh through the session
 *    tracker.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { RestPluginHooks, RestRequestContext } from '@gears-frontx/api';
import type { AuthProvider, AuthSession, AuthTransition } from '@gears-frontx/auth';
import type { AuthTransportBinder, Hai3ApiAuthTransportConfig } from '../src/plugins/auth';

// One apiRegistry singleton serves every module graph of this file: the api
// package is external, so vi.resetModules() keeps its module state. Reset it
// around every test so transport plugins cannot bleed between tests.
let apiRegistry: typeof import('@gears-frontx/api').apiRegistry;
let RestProtocol: typeof import('@gears-frontx/api').RestProtocol;

const AUTH_REALM_SYMBOL = Symbol.for('frontx:auth:realm');

type RealmRecordView = {
  version: number;
  runtime: unknown;
  transportConfig?: Hai3ApiAuthTransportConfig;
  retainers: number;
  emitters: Set<unknown>;
};

type RealmHost = typeof globalThis & { [AUTH_REALM_SYMBOL]?: unknown };

function peekRealm(): RealmRecordView | undefined {
  return (globalThis as RealmHost)[AUTH_REALM_SYMBOL] as RealmRecordView | undefined;
}

function clearRealm(): void {
  delete (globalThis as RealmHost)[AUTH_REALM_SYMBOL];
}

/**
 * One app per runtime: every app under test loads its own module copy, and
 * every import below resolves inside one reset window, so one app's
 * createFrontX, auth plugin and eventBus always belong to the same graph.
 */
type FrameworkGraph = {
  createFrontX: typeof import('../src/createFrontX').createFrontX;
  auth: typeof import('../src/plugins/auth').auth;
  eventBus: typeof import('@gears-frontx/state').eventBus;
};

async function loadGraph(): Promise<FrameworkGraph> {
  vi.resetModules();
  const [createFrontXModule, authModule, stateModule] = await Promise.all([
    import('../src/createFrontX'),
    import('../src/plugins/auth'),
    import('@gears-frontx/state'),
  ]);
  return {
    createFrontX: createFrontXModule.createFrontX,
    auth: authModule.auth,
    eventBus: stateModule.eventBus,
  };
}

/** Records the AuthEvents one graph's eventBus hears. */
function listen(graph: FrameworkGraph): string[] {
  const heard: string[] = [];
  graph.eventBus.on('auth/loggedIn', () => heard.push('loggedIn'));
  graph.eventBus.on('auth/loggedOut', () => heard.push('loggedOut'));
  return heard;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeBearerProvider(token: string, extra: Partial<AuthProvider> = {}): AuthProvider {
  return {
    getSession: vi.fn().mockResolvedValue({ kind: 'bearer', token } satisfies AuthSession),
    checkAuth: vi.fn().mockResolvedValue({ authenticated: false }),
    logout: vi.fn().mockResolvedValue({ type: 'none' }),
    ...extra,
  };
}

/** The transport plugin `frontxApiTransport()` registered for a protocol. */
type AuthTransportPlugin = RestPluginHooks & { onRequest: RestPluginHooks['onRequest'] };

function makeReqCtx(url: string, headers: Record<string, string> = {}): RestRequestContext {
  return { method: 'GET', url, headers };
}

/** Builds a joining app in a fresh graph and returns the transport plugin it registered. */
async function joinAndFindTransport(): Promise<AuthTransportPlugin & Pick<RestPluginHooks, 'onError'>> {
  const beforeJoin = [...apiRegistry.plugins.getAll(RestProtocol)];
  const joinGraph = await loadGraph();
  joinGraph.createFrontX().use(joinGraph.auth()).build();
  const joinPlugin = apiRegistry.plugins.getAll(RestProtocol).find((plugin) => !beforeJoin.includes(plugin));
  expect(joinPlugin).toBeDefined();
  return joinPlugin as AuthTransportPlugin & Pick<RestPluginHooks, 'onError'>;
}

/** Lets the session tracker's init baseline land. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(async () => {
  ({ apiRegistry, RestProtocol } = await import('@gears-frontx/api'));
  apiRegistry.reset();
  clearRealm();
});

afterEach(() => {
  apiRegistry.reset();
  clearRealm();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('auth() - one runtime per realm, whichever app passes the provider', () => {
  it('publishes the runtime of auth({ provider }) with one holder', async () => {
    const { createFrontX, auth } = await loadGraph();
    const provider = makeBearerProvider('token-1');

    const app = createFrontX().use(auth({ provider })).build();

    expect(app.auth?.provider).toBe(provider);
    expect(peekRealm()?.runtime).toBe(app.auth);
    expect(peekRealm()?.retainers).toBe(1);
    expect(peekRealm()?.version).toBe(1);
  });

  it('gives a joining app the same runtime, so its login reaches the one provider', async () => {
    const ownerGraph = await loadGraph();
    const login = vi.fn().mockResolvedValue({ type: 'none' } satisfies AuthTransition);
    const provider = makeBearerProvider('token-1', { login });
    const ownerApp = ownerGraph.createFrontX().use(ownerGraph.auth({ provider })).build();

    const joinGraph = await loadGraph();
    const joinApp = joinGraph.createFrontX().use(joinGraph.auth()).build();

    expect(joinApp.auth).toBe(ownerApp.auth);
    expect(peekRealm()?.retainers).toBe(2);
    await joinApp.auth?.login?.({ type: 'password', payload: { username: 'ada', password: 'secret' } });
    expect(login).toHaveBeenCalledWith({ type: 'password', payload: { username: 'ada', password: 'secret' } }, undefined);
  });

  it('treats a microfrontend that passes the provider like a shell that does: the shell joins it', async () => {
    // The "microfrontend" builds first and passes the provider; the "shell"
    // joins. Nothing in the plugin depends on which app is which.
    const mfeGraph = await loadGraph();
    const provider = makeBearerProvider('token-1');
    const mfeApp = mfeGraph.createFrontX().use(mfeGraph.auth({ provider })).build();

    const shellGraph = await loadGraph();
    const shellApp = shellGraph.createFrontX().use(shellGraph.auth()).build();

    expect(shellApp.auth).toBe(mfeApp.auth);
    expect(shellApp.auth?.provider).toBe(provider);
  });

  it('joins the same runtime for every app of the realm', async () => {
    const ownerGraph = await loadGraph();
    const ownerApp = ownerGraph.createFrontX().use(ownerGraph.auth({ provider: makeBearerProvider('t') })).build();
    const graphA = await loadGraph();
    const appA = graphA.createFrontX().use(graphA.auth()).build();
    const graphB = await loadGraph();
    const appB = graphB.createFrontX().use(graphB.auth()).build();

    expect(appA.auth).toBe(ownerApp.auth);
    expect(appB.auth).toBe(ownerApp.auth);
    expect(peekRealm()?.retainers).toBe(3);
  });

  it('throws on a config without a provider instead of joining silently', async () => {
    const { auth } = await loadGraph();
    expect(() => auth({ provider: undefined as unknown as AuthProvider })).toThrow(/config without a provider/);
  });
});

describe('auth() - a second provider is refused before any side effect', () => {
  it('refuses a provider in another app while the realm holds one', async () => {
    const first = await loadGraph();
    const firstApp = first.createFrontX().use(first.auth({ provider: makeBearerProvider('token-1') })).build();
    const transportsBefore = apiRegistry.plugins.getAll(RestProtocol).length;

    const second = await loadGraph();
    const subscribe = vi.fn(() => () => undefined);
    const secondProvider = makeBearerProvider('token-2', { subscribe });
    expect(() => second.createFrontX().use(second.auth({ provider: secondProvider })).build()).toThrow(
      /found another provider already in this realm/,
    );

    // No transport, no baseline read, no subscription: refused in onRegister.
    expect(apiRegistry.plugins.getAll(RestProtocol)).toHaveLength(transportsBefore);
    expect(secondProvider.checkAuth).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
    expect(peekRealm()?.runtime).toBe(firstApp.auth);
    expect(peekRealm()?.retainers).toBe(1);

    // The refused build left the runtime buildable: the same graph joins.
    const joined = second.createFrontX().use(second.auth()).build();
    expect(joined.auth).toBe(firstApp.auth);
  });

  it('refuses a provider added to an app that already has auth(), from use()', async () => {
    const { createFrontX, auth } = await loadGraph();
    const provider = makeBearerProvider('token-1');

    // The builder skips a second plugin named `auth`; one with a provider is not skipped silently.
    expect(() => createFrontX().use(auth()).use(auth({ provider }))).toThrow(/already has an auth\(\) plugin/);
    expect(() => createFrontX().use(auth({ provider: makeBearerProvider('a') })).use(auth({ provider })))
      .toThrow(/already has an auth\(\) plugin/);
    expect(provider.checkAuth).not.toHaveBeenCalled();
    expect(peekRealm()).toBeUndefined();
  });

  it('skips a join added after the provider in the same app', async () => {
    const { createFrontX, auth } = await loadGraph();
    const provider = makeBearerProvider('token-1');

    const app = createFrontX().use(auth({ provider })).use(auth()).build();

    expect(app.auth?.provider).toBe(provider);
    expect(peekRealm()?.retainers).toBe(1);
  });
});

describe('auth() - a join with no provider in the realm', () => {
  it('throws before any side effect, and the runtime can build again', async () => {
    const graph = await loadGraph();

    expect(() => graph.createFrontX().use(graph.auth()).build()).toThrow(/no app of the realm has passed one yet/);
    expect(apiRegistry.plugins.getAll(RestProtocol)).toHaveLength(0);
    expect(peekRealm()).toBeUndefined();

    // Refused in onRegister, so the build state was reset: once a provider is
    // in the realm, the same runtime builds its app.
    const ownerGraph = await loadGraph();
    const ownerApp = ownerGraph.createFrontX().use(ownerGraph.auth({ provider: makeBearerProvider('t') })).build();
    const app = graph.createFrontX().use(graph.auth()).build();
    expect(app.auth).toBe(ownerApp.auth);
  });
});

describe('auth() - AuthEvents reach every app that holds the runtime', () => {
  it('emits a logout started in a joined app on the eventBus of every app', async () => {
    const ownerGraph = await loadGraph();
    const ownerApp = ownerGraph.createFrontX().use(ownerGraph.auth({ provider: makeBearerProvider('t') })).build();
    const joinGraph = await loadGraph();
    const joinApp = joinGraph.createFrontX().use(joinGraph.auth()).build();
    // Each graph has its own bus, so what follows proves the realm relays.
    expect(joinGraph.eventBus).not.toBe(ownerGraph.eventBus);
    const ownerHeard = listen(ownerGraph);
    const joinHeard = listen(joinGraph);

    await joinApp.auth?.logout();

    expect(ownerHeard).toEqual(['loggedOut']);
    expect(joinHeard).toEqual(['loggedOut']);
    expect(ownerApp.auth).toBe(joinApp.auth);
  });

  it('lets a shell that only joined hear the LoggedIn of a login made in the app that owns the provider', async () => {
    const login = vi.fn().mockResolvedValue({ type: 'none' } satisfies AuthTransition);
    const mfeGraph = await loadGraph();
    const mfeApp = mfeGraph.createFrontX().use(mfeGraph.auth({ provider: makeBearerProvider('t', { login }) })).build();
    const shellGraph = await loadGraph();
    shellGraph.createFrontX().use(shellGraph.auth()).build();
    const shellHeard = listen(shellGraph);

    await mfeApp.auth?.login?.({ type: 'password', payload: {} });

    expect(shellHeard).toEqual(['loggedIn']);
  });

  it('stops emitting on the eventBus of an app once it is destroyed', async () => {
    const ownerGraph = await loadGraph();
    const ownerApp = ownerGraph.createFrontX().use(ownerGraph.auth({ provider: makeBearerProvider('t') })).build();
    const joinGraph = await loadGraph();
    const joinApp = joinGraph.createFrontX().use(joinGraph.auth()).build();
    const ownerHeard = listen(ownerGraph);
    const joinHeard = listen(joinGraph);

    joinApp.destroy();
    await ownerApp.auth?.logout();

    expect(ownerHeard).toEqual(['loggedOut']);
    expect(joinHeard).toEqual([]);
  });
});

describe('auth() - the provider lives while any app holds it', () => {
  it('keeps the provider alive when the app that passed it is destroyed, and ends it on the last release', async () => {
    const unsubscribe = vi.fn();
    const destroy = vi.fn();
    const login = vi.fn().mockResolvedValue({ type: 'none' } satisfies AuthTransition);
    const provider = makeBearerProvider('token-1', { subscribe: vi.fn(() => unsubscribe), destroy, login });
    const ownerGraph = await loadGraph();
    const ownerApp = ownerGraph.createFrontX().use(ownerGraph.auth({ provider })).build();
    const ownerTransports = apiRegistry.plugins.getAll(RestProtocol).length;
    const joinGraph = await loadGraph();
    const joinApp = joinGraph.createFrontX().use(joinGraph.auth()).build();
    const joinHeard = listen(joinGraph);

    ownerApp.destroy();

    // The owner's own transport is gone; the provider, its subscription and
    // the session tracker are not.
    expect(apiRegistry.plugins.getAll(RestProtocol)).toHaveLength(ownerTransports);
    expect(destroy).not.toHaveBeenCalled();
    expect(unsubscribe).not.toHaveBeenCalled();
    expect(peekRealm()?.retainers).toBe(1);
    await joinApp.auth?.login?.({ type: 'password', payload: {} });
    expect(login).toHaveBeenCalledTimes(1);
    expect(joinHeard).toEqual(['loggedIn']);

    // A late join still finds the provider, and a second provider is still refused.
    const lateGraph = await loadGraph();
    const lateApp = lateGraph.createFrontX().use(lateGraph.auth()).build();
    expect(lateApp.auth).toBe(joinApp.auth);
    const rivalGraph = await loadGraph();
    expect(() => rivalGraph.createFrontX().use(rivalGraph.auth({ provider: makeBearerProvider('x') })).build())
      .toThrow(/found another provider already in this realm/);

    lateApp.destroy();
    expect(destroy).not.toHaveBeenCalled();
    joinApp.destroy();

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(peekRealm()).toBeUndefined();

    // With the slot free, a new provider can be passed.
    const nextGraph = await loadGraph();
    const nextApp = nextGraph.createFrontX().use(nextGraph.auth({ provider: makeBearerProvider('y') })).build();
    expect(peekRealm()?.runtime).toBe(nextApp.auth);
  });

  it('destroys the provider with its only holder', async () => {
    const destroy = vi.fn();
    const { createFrontX, auth } = await loadGraph();
    const app = createFrontX().use(auth({ provider: makeBearerProvider('t', { destroy }) })).build();

    app.destroy();

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(peekRealm()).toBeUndefined();
  });

  it('detaches the runtime and removes the transport of a joining app on destroy', async () => {
    const ownerGraph = await loadGraph();
    const ownerApp = ownerGraph.createFrontX().use(ownerGraph.auth({ provider: makeBearerProvider('t') })).build();
    const joinGraph = await loadGraph();
    const joinApp = joinGraph.createFrontX().use(joinGraph.auth()).build();
    const joined = apiRegistry.plugins.getAll(RestProtocol).length;

    joinApp.destroy();

    expect(joinApp.auth).toBeUndefined();
    expect(apiRegistry.plugins.getAll(RestProtocol)).toHaveLength(joined - 1);
    expect(peekRealm()?.runtime).toBe(ownerApp.auth);
    expect(peekRealm()?.retainers).toBe(1);
  });

  it('gives the hold back when the transport binding of a join throws', async () => {
    const ownerGraph = await loadGraph();
    const ownerApp = ownerGraph.createFrontX().use(ownerGraph.auth({ provider: makeBearerProvider('t') })).build();
    const add = vi.spyOn(apiRegistry.plugins, 'add').mockImplementation(() => {
      throw new Error('registry refused the auth transport plugin');
    });

    const joinGraph = await loadGraph();
    expect(() => joinGraph.createFrontX().use(joinGraph.auth()).build()).toThrow(
      'registry refused the auth transport plugin',
    );
    add.mockRestore();

    expect(peekRealm()?.retainers).toBe(1);
    expect(peekRealm()?.emitters.size).toBe(1);
    expect(peekRealm()?.runtime).toBe(ownerApp.auth);
  });
});

describe('auth() - the realm record contract version', () => {
  it('refuses a record of another version, for a join and for a provider, before any side effect', async () => {
    (globalThis as RealmHost)[AUTH_REALM_SYMBOL] = { version: 999, runtime: {} };
    const provider = makeBearerProvider('t');

    const joinGraph = await loadGraph();
    expect(() => joinGraph.createFrontX().use(joinGraph.auth()).build()).toThrow(/contract version 999/);
    const ownerGraph = await loadGraph();
    expect(() => ownerGraph.createFrontX().use(ownerGraph.auth({ provider })).build()).toThrow(
      /contract version 999/,
    );

    expect(apiRegistry.plugins.getAll(RestProtocol)).toHaveLength(0);
    expect(provider.checkAuth).not.toHaveBeenCalled();
  });
});

describe('auth() - the REST transport of a joining app', () => {
  it('carries the bearer token through the joining app own apiRegistry', async () => {
    const ownerGraph = await loadGraph();
    const provider = makeBearerProvider('token-1');
    ownerGraph.createFrontX().use(ownerGraph.auth({ provider })).build();

    const joinPlugin = await joinAndFindTransport();
    const ctx = (await joinPlugin.onRequest?.(makeReqCtx('/accounts/me'))) as RestRequestContext;

    expect(ctx.headers.Authorization).toBe('Bearer token-1');
    expect(provider.getSession).toHaveBeenCalledTimes(1);
  });

  it('binds the joining transport with the frontxApi config the provider app passed, once', async () => {
    const frontxApi: Hai3ApiAuthTransportConfig = {
      allowedCookieOrigins: ['https://api.example.com'],
      csrfHeaderName: 'x-csrf-token',
    };
    const provider = makeBearerProvider('t', {
      getSession: vi.fn().mockResolvedValue({ kind: 'cookie', csrfToken: 'csrf-1' } satisfies AuthSession),
    });
    const ownerGraph = await loadGraph();
    ownerGraph.createFrontX().use(ownerGraph.auth({ provider, frontxApi })).build();
    expect(peekRealm()?.transportConfig).toEqual(frontxApi);

    const joinPlugin = await joinAndFindTransport();
    const ctx = (await joinPlugin.onRequest?.(
      makeReqCtx('https://api.example.com/accounts/me'),
    )) as RestRequestContext;

    expect(ctx.withCredentials).toBe(true);
    expect(ctx.headers['x-csrf-token']).toBe('csrf-1');
  });

  it('binds the published binder with the whole config, unknown fields included and stray keys kept out', async () => {
    // `allowedExtraOrigins` stands in for a field the joining copy of the type
    // does not know; `provider` and `trackRefresh` are stray keys a config
    // field could one day collide with.
    const frontxApi = {
      allowedCookieOrigins: ['https://a.example'],
      csrfHeaderName: 'X-CSRF',
      allowedBearerOrigins: ['https://api.example'],
      allowedExtraOrigins: ['https://extra.example'],
      provider: 'stray-provider-key',
      trackRefresh: () => async () => undefined,
    } as Hai3ApiAuthTransportConfig;
    type CapturedBinderArgs = Parameters<AuthTransportBinder>[0] & { allowedExtraOrigins?: string[] };
    const binderArgs: CapturedBinderArgs[] = [];
    const transport = vi.fn((args: Parameters<AuthTransportBinder>[0]) => {
      binderArgs.push(args);
      return { destroy: () => undefined };
    });
    const ownerGraph = await loadGraph();
    ownerGraph.createFrontX().use(ownerGraph.auth({ provider: makeBearerProvider('token-1'), frontxApi, transport })).build();

    const joinGraph = await loadGraph();
    joinGraph.createFrontX().use(joinGraph.auth()).build();

    expect(transport).toHaveBeenCalledTimes(2);
    const joinArgs = binderArgs[1];
    expect(joinArgs?.allowedCookieOrigins).toEqual(['https://a.example']);
    expect(joinArgs?.csrfHeaderName).toBe('X-CSRF');
    expect(joinArgs?.allowedBearerOrigins).toEqual(['https://api.example']);
    expect(joinArgs?.allowedExtraOrigins).toEqual(['https://extra.example']);
    expect(joinArgs?.provider).not.toBe('stray-provider-key');
    expect(await joinArgs?.provider.getSession?.()).toEqual({ kind: 'bearer', token: 'token-1' });
    expect(joinArgs?.trackRefresh).toBeUndefined();
  });

  it('binds a copy of the config: an edit or a push the provider app makes afterwards reaches no join', async () => {
    const origins = ['https://api.example'];
    const frontxApi: Hai3ApiAuthTransportConfig = { allowedCookieOrigins: origins, csrfHeaderName: 'X-CSRF' };
    const provider = makeBearerProvider('t', {
      getSession: vi.fn().mockResolvedValue({ kind: 'cookie', csrfToken: 'csrf-1' } satisfies AuthSession),
    });
    const ownerGraph = await loadGraph();
    ownerGraph.createFrontX().use(ownerGraph.auth({ provider, frontxApi })).build();

    origins.push('https://late.example');
    frontxApi.csrfHeaderName = 'X-LATE';

    const joinPlugin = await joinAndFindTransport();
    const late = (await joinPlugin.onRequest?.(makeReqCtx('https://late.example/x'))) as RestRequestContext;
    expect(late.withCredentials).toBeUndefined();
    const published = (await joinPlugin.onRequest?.(makeReqCtx('https://api.example/x'))) as RestRequestContext;
    expect(published.withCredentials).toBe(true);
    expect(published.headers['X-CSRF']).toBe('csrf-1');
  });

  it('reports a joined 401 refresh to the session tracker, which clears every app before the retry', async () => {
    let sub = 'user-a';
    let token = 'token-a';
    const getIdentity = vi.fn(async () => ({ sub }));
    const refresh = vi.fn(async () => {
      sub = 'user-b';
      token = 'token-b';
      return { kind: 'bearer', token } satisfies AuthSession;
    });
    const provider = makeBearerProvider('unused', {
      getSession: vi.fn(async () => ({ kind: 'bearer', token }) satisfies AuthSession),
      checkAuth: vi.fn().mockResolvedValue({ authenticated: true }),
      getIdentity,
      refresh,
    });
    const ownerGraph = await loadGraph();
    ownerGraph.createFrontX().use(ownerGraph.auth({ provider })).build();
    await vi.waitFor(() => expect(getIdentity).toHaveBeenCalledTimes(1));
    await settle();

    const order: string[] = [];
    ownerGraph.eventBus.on('auth/loggedIn', () => order.push('owner:loggedIn'));
    const beforeJoin = [...apiRegistry.plugins.getAll(RestProtocol)];
    const joinGraph = await loadGraph();
    joinGraph.createFrontX().use(joinGraph.auth()).build();
    joinGraph.eventBus.on('auth/loggedIn', () => order.push('join:loggedIn'));
    const joinPlugin = apiRegistry.plugins.getAll(RestProtocol).find((plugin) => !beforeJoin.includes(plugin)) as
      AuthTransportPlugin & Pick<RestPluginHooks, 'onError'>;

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
    await joinPlugin.onError?.(errCtx);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(errCtx.retry).toHaveBeenCalledWith({ headers: { Authorization: 'Bearer token-b' } });
    expect(order).toEqual(['owner:loggedIn', 'join:loggedIn', 'retry']);
  });

  it('joins a provider that is frozen, for requests and for a 401 refresh', async () => {
    let token = 'token-a';
    const refresh = vi.fn(async () => {
      token = 'token-b';
      return { kind: 'bearer', token } satisfies AuthSession;
    });
    const provider: AuthProvider = Object.freeze(makeBearerProvider('unused', {
      getSession: vi.fn(async () => ({ kind: 'bearer', token }) satisfies AuthSession),
      refresh,
    }));
    const ownerGraph = await loadGraph();
    ownerGraph.createFrontX().use(ownerGraph.auth({ provider })).build();

    const joinPlugin = await joinAndFindTransport();
    const ctx = (await joinPlugin.onRequest?.(makeReqCtx('/accounts/me'))) as RestRequestContext;
    expect(ctx.headers.Authorization).toBe('Bearer token-a');

    const errCtx = {
      error: new Error('HTTP 401'),
      request: makeReqCtx('/accounts/me'),
      response: { status: 401, headers: {}, data: null },
      retryCount: 0,
      retry: vi.fn(async () => ({ status: 200, headers: {}, data: {} })),
    };
    await joinPlugin.onError?.(errCtx);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(errCtx.retry).toHaveBeenCalledWith({ headers: { Authorization: 'Bearer token-b' } });
  });
});

describe('auth() - the origin lists on a joined app', () => {
  const API_ORIGIN = 'https://api.example.com';
  const COOKIE_ONLY_ORIGIN = 'https://cookies.example.com';
  const FOREIGN_ORIGIN = 'https://foreign.example.com';

  async function joinBearerOwner(provider: AuthProvider) {
    const ownerGraph = await loadGraph();
    ownerGraph
      .createFrontX()
      .use(ownerGraph.auth({
        provider,
        frontxApi: { allowedBearerOrigins: [API_ORIGIN], allowedCookieOrigins: [COOKIE_ONLY_ORIGIN] },
      }))
      .build();
    return joinAndFindTransport();
  }

  it('sends the bearer token to a listed origin and to no other', async () => {
    const joinPlugin = await joinBearerOwner(makeBearerProvider('token-1'));

    for (const url of [`${FOREIGN_ORIGIN}/x`, `${COOKIE_ONLY_ORIGIN}/x`]) {
      const ctx = (await joinPlugin.onRequest?.(makeReqCtx(url))) as RestRequestContext;
      expect(ctx.headers.Authorization).toBeUndefined();
    }
    const listed = (await joinPlugin.onRequest?.(makeReqCtx(`${API_ORIGIN}/x`))) as RestRequestContext;
    expect(listed.headers.Authorization).toBe('Bearer token-1');
  });

  it('starts no refresh for a 401 from an origin that gets no credentials', async () => {
    const refresh = vi.fn(async () => ({ kind: 'bearer', token: 'token-2' }) satisfies AuthSession);
    const joinPlugin = await joinBearerOwner(makeBearerProvider('token-1', { refresh }));
    const make401 = (url: string) => ({
      error: new Error('HTTP 401'),
      request: makeReqCtx(url),
      response: { status: 401, headers: {}, data: null },
      retryCount: 0,
      retry: vi.fn(async () => ({ status: 200, headers: {}, data: {} })),
    });

    const foreign = make401(`${FOREIGN_ORIGIN}/x`);
    expect(await joinPlugin.onError?.(foreign)).toBe(foreign.error);
    expect(refresh).not.toHaveBeenCalled();

    const listed = make401(`${API_ORIGIN}/x`);
    await joinPlugin.onError?.(listed);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(listed.retry).toHaveBeenCalledWith({ headers: { Authorization: 'Bearer token-2' } });
  });
});
