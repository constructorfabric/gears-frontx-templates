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
 * 2. A second provider replaces the one in use: every app follows, the swap
 *    events, the old provider's end, in-flight calls and the session tracker.
 *    Inside one app, a second auth() with a provider throws from use().
 * 3. A join with no provider in the realm is an error, raised before any side
 *    effect.
 * 4. AuthEvents reach the eventBus of every app that holds the runtime.
 * 5. The provider lives while any app holds it: the last release destroys it;
 *    the departed app's code keeps running for the holders; a late join works.
 * 6. A realm record of another contract version is refused.
 * 7. A joined app's REST transport: the session, the published frontxApi
 *    config and binder, the origin lists, the 401 refresh through the session
 *    tracker.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { RestPluginHooks, RestRequestContext } from '@gears-frontx/api';
import type { AuthProvider, AuthSession, AuthTransition } from '@gears-frontx/auth';
import type {
  AuthTransportBinder,
  FrameworkTransportErrorEvent,
  Hai3ApiAuthTransportConfig,
} from '../src/plugins/auth';

// One apiRegistry singleton serves every module graph of this file: the api
// package is external, so vi.resetModules() keeps its module state. Reset it
// around every test so transport plugins cannot bleed between tests.
let apiRegistry: typeof import('@gears-frontx/api').apiRegistry;
let RestProtocol: typeof import('@gears-frontx/api').RestProtocol;

const AUTH_REALM_SYMBOL = Symbol.for('frontx:auth:realm');

type RealmRecordView = {
  version: number;
  runtime: unknown;
  current: { provider: AuthProvider; transportConfig?: Hai3ApiAuthTransportConfig };
  holders: Set<unknown>;
  replacing?: boolean;
};

/** The auth transport plugins registered now; each app's binding changes at a replacement. */
function registered(): Array<AuthTransportPlugin & Pick<RestPluginHooks, 'onError'>> {
  return apiRegistry.plugins.getAll(RestProtocol) as Array<AuthTransportPlugin & Pick<RestPluginHooks, 'onError'>>;
}

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
  graph.eventBus.on('auth/sessionCheck', () => heard.push('sessionCheck'));
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

/** A 401 error context for the transport's onError. */
function make401(url: string) {
  return {
    error: new Error('HTTP 401'),
    request: makeReqCtx(url),
    response: { status: 401, headers: {}, data: null },
    retryCount: 0,
    retry: vi.fn(async () => ({ status: 200, headers: {}, data: {} })),
  };
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
    expect(peekRealm()?.holders.size).toBe(1);
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
    expect(peekRealm()?.holders.size).toBe(2);
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
    expect(peekRealm()?.holders.size).toBe(3);
  });

  it('throws on a config without a provider instead of joining silently', async () => {
    const { auth } = await loadGraph();
    expect(() => auth({ provider: undefined as unknown as AuthProvider })).toThrow(/config without a provider/);
  });
});

describe('auth() - a second provider replaces the one in use', () => {
  it('puts the new provider in place for every app: the same runtime, the new provider behind it', async () => {
    const unsubscribeA = vi.fn();
    const destroyA = vi.fn();
    const providerA = makeBearerProvider('token-a', { subscribe: vi.fn(() => unsubscribeA), destroy: destroyA });
    const graphA = await loadGraph();
    const appA = graphA.createFrontX().use(graphA.auth({ provider: providerA })).build();
    const joinPlugin = await joinAndFindTransport();
    const record = peekRealm();

    const subscribeB = vi.fn(() => () => undefined);
    const providerB = makeBearerProvider('token-b', { subscribe: subscribeB });
    const graphB = await loadGraph();
    const appB = graphB.createFrontX().use(graphB.auth({ provider: providerB })).build();

    // One record, one runtime object, every app on it; the provider behind it is B.
    expect(peekRealm()).toBe(record);
    expect(appB.auth).toBe(appA.auth);
    expect(appA.auth?.provider).toBe(providerB);
    expect(peekRealm()?.current.provider).toBe(providerB);
    expect(peekRealm()?.holders.size).toBe(3);
    // A's tracking stopped and A is destroyed at the swap.
    expect(unsubscribeA).toHaveBeenCalledTimes(1);
    expect(destroyA).toHaveBeenCalledTimes(1);
    expect(subscribeB).toHaveBeenCalledTimes(1);
    // The join's old binding attaches nothing; every app is bound again for B.
    const old = (await joinPlugin.onRequest?.(makeReqCtx('/accounts/me'))) as RestRequestContext;
    expect(old.headers.Authorization).toBeUndefined();
    expect(registered()).toHaveLength(3);
    expect(registered()).not.toContain(joinPlugin);
    for (const plugin of registered()) {
      const ctx = (await plugin.onRequest?.(makeReqCtx('/accounts/me'))) as RestRequestContext;
      expect(ctx.headers.Authorization).toBe('Bearer token-b');
    }
    expect(providerA.getSession).not.toHaveBeenCalled();
  });

  it.each([
    ['a session', { authenticated: true }, ['sessionCheck', 'loggedIn']],
    ['no session', { authenticated: false }, ['sessionCheck', 'loggedOut']],
  ] as const)(
    'tells every app at the swap: SessionCheck at once, then the new baseline (%s)',
    async (_label, checkResult, expected) => {
      const graphA = await loadGraph();
      graphA.createFrontX().use(graphA.auth({ provider: makeBearerProvider('token-a') })).build();
      const joinGraph = await loadGraph();
      joinGraph.createFrontX().use(joinGraph.auth()).build();
      await settle();
      const heardA = listen(graphA);
      const heardJoin = listen(joinGraph);

      let answer!: (result: { authenticated: boolean }) => void;
      const checkAuth = vi.fn(() => new Promise<{ authenticated: boolean }>((resolve) => { answer = resolve; }));
      const graphB = await loadGraph();
      graphB.createFrontX().use(graphB.auth({ provider: makeBearerProvider('token-b', { checkAuth }) })).build();

      expect(heardA).toEqual(['sessionCheck']);
      expect(heardJoin).toEqual(['sessionCheck']);
      await vi.waitFor(() => expect(checkAuth).toHaveBeenCalledTimes(1));
      expect(heardA).toEqual(['sessionCheck']);
      answer(checkResult);
      await settle();
      expect(heardA).toEqual(expected);
      expect(heardJoin).toEqual(expected);
    },
  );

  it('clears with LoggedOut when the new provider cannot read its session', async () => {
    const graphA = await loadGraph();
    graphA.createFrontX().use(graphA.auth({ provider: makeBearerProvider('token-a') })).build();
    await settle();
    const heard = listen(graphA);

    const checkAuth = vi.fn().mockRejectedValue(new Error('session service down'));
    const graphB = await loadGraph();
    graphB.createFrontX().use(graphB.auth({ provider: makeBearerProvider('token-b', { checkAuth }) })).build();
    await settle();

    expect(heard).toEqual(['sessionCheck', 'loggedOut']);
  });

  it('destroys the old provider at the swap; a call still running on it rejects, an access check denies', async () => {
    const destroyA = vi.fn();
    const answersA: Array<(session: AuthSession) => void> = [];
    const providerA = makeBearerProvider('token-a', {
      destroy: destroyA,
      getSession: vi.fn(() => new Promise<AuthSession>((resolve) => { answersA.push(resolve); })),
      canAccess: vi.fn().mockResolvedValue('allow'),
    });
    const graphA = await loadGraph();
    const appA = graphA.createFrontX().use(graphA.auth({ provider: providerA })).build();
    const reading = appA.auth!.getSession();
    // The access check reads the session first, so it is still running at the swap.
    const checking = appA.auth!.canAccess({ action: 'read', resource: 'doc' });
    await vi.waitFor(() => expect(answersA).toHaveLength(2));

    const graphB = await loadGraph();
    graphB.createFrontX().use(graphB.auth({ provider: makeBearerProvider('token-b') })).build();
    expect(destroyA).toHaveBeenCalledTimes(1);

    // A's answers land after the swap: they belong to no current session.
    for (const answer of answersA) answer({ kind: 'bearer', token: 'token-a' });
    await expect(reading).rejects.toThrow(/was replaced before the call ended/);
    await expect(checking).resolves.toBe('deny');
    // A call started after the swap goes to the new provider.
    await expect(appA.auth!.getSession()).resolves.toEqual({ kind: 'bearer', token: 'token-b' });
  });

  it('rejects a refresh that ends after its provider was replaced, and its tracker emits nothing', async () => {
    let answerA!: (session: AuthSession) => void;
    const refreshA = vi.fn(() => new Promise<AuthSession>((resolve) => { answerA = resolve; }));
    const graphA = await loadGraph();
    const appA = graphA.createFrontX().use(graphA.auth({ provider: makeBearerProvider('token-a', { refresh: refreshA }) })).build();
    await settle();
    const heard = listen(graphA);
    const refreshing = appA.auth!.refresh!();

    const graphB = await loadGraph();
    graphB.createFrontX().use(graphB.auth({ provider: makeBearerProvider('token-b') })).build();
    answerA({ kind: 'bearer', token: 'token-a2' });

    await expect(refreshing).rejects.toThrow(/was replaced before the call ended/);
    await settle();
    // Only the swap speaks: A's session tracking stopped with the swap.
    expect(heard).toEqual(['sessionCheck', 'loggedOut']);
  });

  it('does not retry a 401 under the old origin list with a refresh that ended after the swap', async () => {
    // A lists the origin of the 401 for bearer tokens, B does not.
    const oldOnly = 'https://old-only.example.com';
    let answerA!: (session: AuthSession) => void;
    const refreshA = vi.fn(() => new Promise<AuthSession>((resolve) => { answerA = resolve; }));
    const refreshB = vi.fn(async () => ({ kind: 'bearer', token: 'token-b2' }) satisfies AuthSession);
    const graphA = await loadGraph();
    graphA.createFrontX().use(graphA.auth({
      provider: makeBearerProvider('token-a', { refresh: refreshA }),
      frontxApi: { allowedBearerOrigins: [oldOnly] },
    })).build();
    const joinPlugin = await joinAndFindTransport();
    const errCtx = make401(`${oldOnly}/x`);
    const failing = joinPlugin.onError?.(errCtx);
    await vi.waitFor(() => expect(refreshA).toHaveBeenCalledTimes(1));

    const graphB = await loadGraph();
    graphB.createFrontX().use(graphB.auth({
      provider: makeBearerProvider('token-b', { refresh: refreshB }),
      frontxApi: { allowedBearerOrigins: ['https://new-only.example.com'] },
    })).build();
    answerA({ kind: 'bearer', token: 'token-a2' });

    expect(await failing).toBe(errCtx.error);
    expect(errCtx.retry).not.toHaveBeenCalled();
    expect(refreshB).not.toHaveBeenCalled();
  });

  it('retries nothing on an old binding: a 401 after the swap for a request sent before it', async () => {
    const refreshA = vi.fn(async () => ({ kind: 'bearer', token: 'token-a2' }) satisfies AuthSession);
    const refreshB = vi.fn(async () => ({ kind: 'bearer', token: 'token-b2' }) satisfies AuthSession);
    const graphA = await loadGraph();
    graphA.createFrontX().use(graphA.auth({ provider: makeBearerProvider('token-a', { refresh: refreshA }) })).build();
    const joinPlugin = await joinAndFindTransport();
    // The request went out with A's credentials before the swap ...
    const sent = (await joinPlugin.onRequest?.(makeReqCtx('/accounts/me'))) as RestRequestContext;
    expect(sent.headers.Authorization).toBe('Bearer token-a');

    const graphB = await loadGraph();
    graphB.createFrontX().use(graphB.auth({ provider: makeBearerProvider('token-b', { refresh: refreshB }) })).build();

    // ... and its 401 lands after it on the binding A authorised: no refresh, no retry.
    const errCtx = make401('/accounts/me');
    expect(await joinPlugin.onError?.(errCtx)).toBe(errCtx.error);
    expect(refreshA).not.toHaveBeenCalled();
    expect(refreshB).not.toHaveBeenCalled();
    expect(errCtx.retry).not.toHaveBeenCalled();
  });

  it('cancels the old provider\'s running session check and stops listening to its reports', async () => {
    let report!: (event: { state: 'authenticated' | 'unauthenticated' }) => void;
    const getIdentity = vi.fn()
      .mockResolvedValueOnce({ sub: 'user-a' })
      .mockReturnValue(new Promise(() => undefined));
    const providerA = makeBearerProvider('token-a', {
      checkAuth: vi.fn().mockResolvedValue({ authenticated: true }),
      getIdentity,
      subscribe: vi.fn((listener) => {
        report = listener as typeof report;
        return () => undefined;
      }),
    });
    const graphA = await loadGraph();
    graphA.createFrontX().use(graphA.auth({ provider: providerA })).build();
    await settle();
    const heard = listen(graphA);
    // A session that goes on: A's tracker checks its identity, and the lookup hangs.
    report({ state: 'authenticated' });
    await vi.waitFor(() => expect(getIdentity).toHaveBeenCalledTimes(2));

    const graphB = await loadGraph();
    graphB.createFrontX().use(graphB.auth({ provider: makeBearerProvider('token-b') })).build();
    await settle();
    report({ state: 'unauthenticated' });
    await settle();

    // A's check was cancelled without a clear, and A's later report reached nobody.
    expect(heard).toEqual(['sessionCheck', 'sessionCheck', 'loggedOut']);
  });

  it('moves the listeners added with app.auth.subscribe to the new provider', async () => {
    const unsubscribeA = vi.fn();
    const unsubscribeB = vi.fn();
    const subscribeA = vi.fn(() => unsubscribeA);
    const subscribeB = vi.fn(() => unsubscribeB);
    const graphA = await loadGraph();
    const appA = graphA.createFrontX().use(graphA.auth({ provider: makeBearerProvider('a', { subscribe: subscribeA }) })).build();
    const listener = vi.fn();
    const stop = appA.auth!.subscribe!(listener);

    const graphB = await loadGraph();
    graphB.createFrontX().use(graphB.auth({ provider: makeBearerProvider('b', { subscribe: subscribeB }) })).build();

    // B gets a relay of the listener (its first subscription; the second is its tracker's),
    // which reaches the listener once the swap is committed.
    expect(subscribeB).toHaveBeenCalledTimes(2);
    const relay = (subscribeB.mock.calls[0] as unknown as [(event: { state: 'authenticated' }) => void])[0];
    relay({ state: 'authenticated' });
    expect(listener).toHaveBeenCalledWith({ state: 'authenticated' });
    stop();
    expect(unsubscribeB).toHaveBeenCalledTimes(1);
    // A's own tracker subscription and the moved listener were both taken off A.
    expect(unsubscribeA).toHaveBeenCalledTimes(2);
  });

  it('binds every app again with the transport settings the new provider came with', async () => {
    const destroyFirst = vi.fn();
    const first = vi.fn(() => ({ destroy: destroyFirst }));
    const graphA = await loadGraph();
    graphA.createFrontX().use(graphA.auth({ provider: makeBearerProvider('a'), transport: first })).build();
    const joinGraph = await loadGraph();
    joinGraph.createFrontX().use(joinGraph.auth()).build();
    expect(first).toHaveBeenCalledTimes(2);

    const second = vi.fn((_args: Parameters<AuthTransportBinder>[0]) => ({ destroy: () => undefined }));
    const graphB = await loadGraph();
    graphB.createFrontX().use(graphB.auth({
      provider: makeBearerProvider('b'),
      transport: second,
      frontxApi: { csrfHeaderName: 'X-B' },
    })).build();

    // Both earlier apps dropped the first binding and took the second, as did the new app.
    expect(destroyFirst).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenCalledTimes(3);
    expect(second.mock.calls.every(([args]) => args.csrfHeaderName === 'X-B')).toBe(true);
    expect(peekRealm()?.current.transportConfig).toEqual({ csrfHeaderName: 'X-B' });
  });

  it('joins when another app passes the provider already in use: no swap, no events, nothing destroyed', async () => {
    const destroy = vi.fn();
    const login = vi.fn().mockResolvedValue({ type: 'none' } satisfies AuthTransition);
    const provider = makeBearerProvider('t', { destroy, login });
    const graphA = await loadGraph();
    const appA = graphA.createFrontX().use(graphA.auth({ provider })).build();
    await settle();
    const heard = listen(graphA);
    const signingIn = appA.auth!.login!({ type: 'password', payload: {} });

    const graphB = await loadGraph();
    const appB = graphB.createFrontX().use(graphB.auth({ provider })).build();
    await settle();

    expect(appB.auth).toBe(appA.auth);
    expect(peekRealm()?.holders.size).toBe(2);
    expect(destroy).not.toHaveBeenCalled();
    // A call running across it is not cut off as a replaced one.
    await expect(signingIn).resolves.toEqual({ type: 'none' });
    expect(heard).toEqual(['loggedIn']);
  });

  it('rolls back a replacement whose provider throws on subscribe', async () => {
    const destroyA = vi.fn();
    const providerA = makeBearerProvider('a', { destroy: destroyA });
    const graphA = await loadGraph();
    const appA = graphA.createFrontX().use(graphA.auth({ provider: providerA })).build();
    const listener = vi.fn();
    appA.auth!.subscribe?.(listener);
    await settle();
    const heard = listen(graphA);
    const transports = apiRegistry.plugins.getAll(RestProtocol).length;

    const providerB = makeBearerProvider('b', {
      subscribe: vi.fn(() => {
        throw new Error('subscribe refused');
      }),
    });
    const graphB = await loadGraph();
    expect(() => graphB.createFrontX().use(graphB.auth({ provider: providerB })).build()).toThrow('subscribe refused');
    await settle();

    expect(appA.auth?.provider).toBe(providerA);
    expect(peekRealm()?.holders.size).toBe(1);
    expect(apiRegistry.plugins.getAll(RestProtocol)).toHaveLength(transports);
    expect(destroyA).not.toHaveBeenCalled();
    expect(heard).toEqual([]);
  });

  it('publishes nothing when the first provider throws on subscribe', async () => {
    const provider = makeBearerProvider('a', {
      subscribe: vi.fn(() => {
        throw new Error('subscribe refused');
      }),
    });
    const graph = await loadGraph();

    expect(() => graph.createFrontX().use(graph.auth({ provider })).build()).toThrow('subscribe refused');
    expect(peekRealm()).toBeUndefined();
    expect(apiRegistry.plugins.getAll(RestProtocol)).toHaveLength(0);
  });

  it('hands a binder the provider itself, so a copy of it has the provider\'s members', async () => {
    const copies: Record<string, unknown>[] = [];
    const transport = vi.fn((args: Parameters<AuthTransportBinder>[0]) => {
      copies.push({ ...args.provider });
      return { destroy: () => undefined };
    });
    const provider = makeBearerProvider('a');
    const graph = await loadGraph();
    graph.createFrontX().use(graph.auth({ provider, transport })).build();

    expect(Object.keys(copies[0] ?? {}).sort()).toEqual(['checkAuth', 'getSession', 'logout']);
    await (copies[0]?.getSession as () => Promise<unknown>)();
    expect(provider.getSession).toHaveBeenCalledTimes(1);
  });

  it('leaves the provider in use when a binder of the replacing app throws', async () => {
    const providerA = makeBearerProvider('a');
    const graphA = await loadGraph();
    const appA = graphA.createFrontX().use(graphA.auth({ provider: providerA })).build();
    const providerB = makeBearerProvider('b');
    const graphB = await loadGraph();
    const failing = () => {
      throw new Error('binder refused');
    };

    expect(() => graphB.createFrontX().use(graphB.auth({ provider: providerB, transport: failing })).build())
      .toThrow('binder refused');
    expect(appA.auth?.provider).toBe(providerA);
    expect(peekRealm()?.holders.size).toBe(1);
    expect(providerB.checkAuth).not.toHaveBeenCalled();
  });
});

describe('auth() - a replaced provider retires at once, with the settings that authorised it', () => {
  const OLD_ONLY = 'https://old-only.example.com';
  const OLD_COOKIES = 'https://old-cookies.example.com';
  const NEW_ONLY = 'https://new-only.example.com';

  /** The transports registered since `before`, in the order the apps were bound. */
  function addedSince(before: unknown[]) {
    return registered().filter((plugin) => !before.includes(plugin));
  }

  it('sends no bearer token of either provider under the old origin list, for a request already running', async () => {
    // A lists OLD_ONLY for bearer tokens, B lists only NEW_ONLY.
    const answersA: Array<(session: AuthSession) => void> = [];
    const providerA = makeBearerProvider('token-a', {
      getSession: vi.fn(() => new Promise<AuthSession>((resolve) => { answersA.push(resolve); })),
    });
    const graphA = await loadGraph();
    graphA.createFrontX().use(graphA.auth({ provider: providerA, frontxApi: { allowedBearerOrigins: [OLD_ONLY] } })).build();
    const providerTransport = registered()[0]!;
    const joinTransport = await joinAndFindTransport();
    const running = [providerTransport, joinTransport].map((plugin) => plugin.onRequest?.(makeReqCtx(`${OLD_ONLY}/x`)));
    await vi.waitFor(() => expect(providerA.getSession).toHaveBeenCalledTimes(2));

    const graphB = await loadGraph();
    graphB.createFrontX().use(graphB.auth({
      provider: makeBearerProvider('token-b'),
      frontxApi: { allowedBearerOrigins: [NEW_ONLY] },
    })).build();
    for (const answer of answersA) answer({ kind: 'bearer', token: 'token-a' });

    for (const ctx of (await Promise.all(running)) as RestRequestContext[]) {
      expect(ctx.headers.Authorization).toBeUndefined();
    }
    // The apps' new bindings follow B's list alone, the app that passed A included.
    expect(registered()).toHaveLength(3);
    for (const plugin of registered()) {
      const old = (await plugin.onRequest?.(makeReqCtx(`${OLD_ONLY}/x`))) as RestRequestContext;
      expect(old.headers.Authorization).toBeUndefined();
      const listed = (await plugin.onRequest?.(makeReqCtx(`${NEW_ONLY}/x`))) as RestRequestContext;
      expect(listed.headers.Authorization).toBe('Bearer token-b');
    }
  });

  it('sends no cookie or CSRF header of either provider under the old cookie list, for a request already running', async () => {
    let answerA!: (session: AuthSession) => void;
    const providerA = makeBearerProvider('a', {
      getSession: vi.fn(() => new Promise<AuthSession>((resolve) => { answerA = resolve; })),
    });
    const graphA = await loadGraph();
    graphA.createFrontX().use(graphA.auth({
      provider: providerA,
      frontxApi: { allowedCookieOrigins: [OLD_COOKIES], csrfHeaderName: 'X-CSRF-A' },
    })).build();
    const joinTransport = await joinAndFindTransport();
    const running = joinTransport.onRequest?.(makeReqCtx(`${OLD_COOKIES}/x`));
    await vi.waitFor(() => expect(providerA.getSession).toHaveBeenCalledTimes(1));

    const graphB = await loadGraph();
    graphB.createFrontX().use(graphB.auth({
      provider: makeBearerProvider('b', {
        getSession: vi.fn().mockResolvedValue({ kind: 'cookie', csrfToken: 'csrf-b' } satisfies AuthSession),
      }),
      frontxApi: { csrfHeaderName: 'X-CSRF-B' },
    })).build();
    answerA({ kind: 'cookie', csrfToken: 'csrf-a' });

    const ctx = (await running) as RestRequestContext;
    expect(ctx.withCredentials).toBeUndefined();
    expect(ctx.headers).toEqual({});
    for (const plugin of registered()) {
      const now = (await plugin.onRequest?.(makeReqCtx(`${OLD_COOKIES}/x`))) as RestRequestContext;
      expect(now.withCredentials).toBeUndefined();
      expect(now.headers).toEqual({});
    }
  });

  it('retries nothing when the provider is replaced while the refresh report waits for the identity lookup', async () => {
    let lookups = 0;
    const getIdentity = vi.fn(() => {
      lookups += 1;
      // The baseline lookup lands; the one for the refresh hangs until the swap cancels it.
      return lookups === 1 ? Promise.resolve({ sub: 'user-a' }) : new Promise<never>(() => undefined);
    });
    const refresh = vi.fn(async () => ({ kind: 'bearer', token: 'token-a2' }) satisfies AuthSession);
    const graphA = await loadGraph();
    graphA.createFrontX().use(graphA.auth({
      provider: makeBearerProvider('token-a', {
        checkAuth: vi.fn().mockResolvedValue({ authenticated: true }),
        getIdentity,
        refresh,
      }),
    })).build();
    await settle();
    const joinTransport = await joinAndFindTransport();
    const errCtx = make401('/accounts/me');
    const failing = joinTransport.onError?.(errCtx);
    await vi.waitFor(() => expect(getIdentity).toHaveBeenCalledTimes(2));

    const graphB = await loadGraph();
    graphB.createFrontX().use(graphB.auth({ provider: makeBearerProvider('token-b') })).build();

    expect(await failing).toBe(errCtx.error);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(errCtx.retry).not.toHaveBeenCalled();
  });

  it('binds the replacing app for its own provider, so a binder that keeps provider members keeps the new ones', async () => {
    const graphA = await loadGraph();
    const providerA = makeBearerProvider('a');
    graphA.createFrontX().use(graphA.auth({ provider: providerA })).build();
    const joinGraph = await loadGraph();
    joinGraph.createFrontX().use(joinGraph.auth()).build();

    const kept: Array<Parameters<AuthTransportBinder>[0]['provider']['getSession']> = [];
    const bound: AuthProvider[] = [];
    const transport = vi.fn((args: Parameters<AuthTransportBinder>[0]) => {
      bound.push(args.provider);
      kept.push(args.provider.getSession);
      return { destroy: () => undefined };
    });
    const providerB = makeBearerProvider('b');
    const graphB = await loadGraph();
    graphB.createFrontX().use(graphB.auth({ provider: providerB, transport })).build();

    // The replacing app and both earlier apps, each with B itself.
    expect(bound).toEqual([providerB, providerB, providerB]);
    for (const getSession of kept) await getSession();
    expect(providerB.getSession).toHaveBeenCalledTimes(3);
    expect(providerA.getSession).not.toHaveBeenCalled();
  });

  it('refuses a replaced provider passed again, from another framework copy; the provider in use still joins', async () => {
    const destroyA = vi.fn();
    const providerA = makeBearerProvider('a', { destroy: destroyA });
    const graphA = await loadGraph();
    graphA.createFrontX().use(graphA.auth({ provider: providerA })).build();
    const providerB = makeBearerProvider('b');
    const graphB = await loadGraph();
    const appB = graphB.createFrontX().use(graphB.auth({ provider: providerB })).build();
    const before = registered().length;

    const graphA2 = await loadGraph();
    expect(() => graphA2.createFrontX().use(graphA2.auth({ provider: providerA })).build())
      .toThrow(/another provider replaced in this realm/);
    expect(peekRealm()?.current.provider).toBe(providerB);
    expect(registered()).toHaveLength(before);
    expect(destroyA).toHaveBeenCalledTimes(1);
    // Refused in onRegister, so that framework copy builds again, here as a join of B.
    const again = graphA2.createFrontX().use(graphA2.auth({ provider: providerB })).build();
    expect(again.auth).toBe(appB.auth);
    expect(peekRealm()?.holders.size).toBe(3);
  });

  it('refuses a replaced provider only while the realm record exists: after the last release it publishes a new one', async () => {
    const providerA = makeBearerProvider('a');
    const graphA = await loadGraph();
    const appA = graphA.createFrontX().use(graphA.auth({ provider: providerA })).build();
    const graphB = await loadGraph();
    const appB = graphB.createFrontX().use(graphB.auth({ provider: makeBearerProvider('b') })).build();
    appA.destroy();
    appB.destroy();
    expect(peekRealm()).toBeUndefined();

    // The documented outcome: the record and its list of replaced providers went with the last holder.
    const graphA2 = await loadGraph();
    const again = graphA2.createFrontX().use(graphA2.auth({ provider: providerA })).build();
    expect(again.auth?.provider).toBe(providerA);
    expect(peekRealm()?.holders.size).toBe(1);
  });

  it('holds back what the new provider tells a moved listener until the swap commits, and drops it on a rollback', async () => {
    type Report = (event: { state: 'authenticated' | 'unauthenticated' }) => void;
    const liveA = new Set<Report>();
    const unsubscribeA = vi.fn();
    const providerA = makeBearerProvider('a', {
      subscribe: vi.fn((listener) => {
        liveA.add(listener as Report);
        return () => {
          unsubscribeA();
          liveA.delete(listener as Report);
        };
      }),
    });
    // A reports to the subscriptions still live on it, as a real provider does.
    const reportA: Report = (event) => {
      for (const live of liveA) live(event);
    };
    const graphA = await loadGraph();
    const appA = graphA.createFrontX().use(graphA.auth({ provider: providerA })).build();
    const listener = vi.fn();
    appA.auth!.subscribe!(listener);
    await settle();

    // B tells the moved listener its state at once, then refuses the tracker's subscription.
    const unsubscribeMoved = vi.fn();
    let calls = 0;
    const failing = makeBearerProvider('b', {
      subscribe: vi.fn((relay) => {
        calls += 1;
        if (calls > 1) throw new Error('subscribe refused');
        (relay as (event: { state: 'authenticated' }) => void)({ state: 'authenticated' });
        return unsubscribeMoved;
      }),
    });
    const graphB = await loadGraph();
    expect(() => graphB.createFrontX().use(graphB.auth({ provider: failing })).build()).toThrow('subscribe refused');

    expect(listener).not.toHaveBeenCalled();
    expect(unsubscribeMoved).toHaveBeenCalledTimes(1);
    expect(unsubscribeA).not.toHaveBeenCalled();
    // A's subscription of the listener is still live.
    reportA({ state: 'unauthenticated' });
    expect(listener).toHaveBeenCalledWith({ state: 'unauthenticated' });

    // A B that succeeds: the listener hears B's synchronous report after the commit, once.
    listener.mockClear();
    const working = makeBearerProvider('c', {
      subscribe: vi.fn((relay) => {
        (relay as (event: { state: 'authenticated' }) => void)({ state: 'authenticated' });
        return () => undefined;
      }),
    });
    const graphC = await loadGraph();
    graphC.createFrontX().use(graphC.auth({ provider: working })).build();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ state: 'authenticated' });
    expect(peekRealm()?.current.provider).toBe(working);
  });

  it('completes a replacement whose moved listener throws on the held report, and keeps the replacing app\'s hold', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const graphA = await loadGraph();
    const appA = graphA.createFrontX().use(graphA.auth({
      provider: makeBearerProvider('a', { subscribe: vi.fn(() => () => undefined) }),
    })).build();
    appA.auth!.subscribe!(() => {
      throw new Error('listener failed');
    });
    const providerB = makeBearerProvider('b', {
      subscribe: vi.fn((relay) => {
        (relay as (event: { state: 'authenticated' }) => void)({ state: 'authenticated' });
        return () => undefined;
      }),
    });
    const graphB = await loadGraph();

    const appB = graphB.createFrontX().use(graphB.auth({ provider: providerB })).build();

    expect(appB.auth?.provider).toBe(providerB);
    expect(peekRealm()?.holders.size).toBe(2);
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/subscribe listener threw/), expect.any(Error));
  });

  it('completes a replacement whose old provider throws on destroy(), and keeps the replacing app\'s hold', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const providerA = makeBearerProvider('a', {
      destroy: vi.fn(() => {
        throw new Error('destroy failed');
      }),
    });
    const graphA = await loadGraph();
    graphA.createFrontX().use(graphA.auth({ provider: providerA })).build();
    const providerB = makeBearerProvider('b');
    const graphB = await loadGraph();

    const appB = graphB.createFrontX().use(graphB.auth({ provider: providerB })).build();

    expect(appB.auth?.provider).toBe(providerB);
    expect(peekRealm()?.holders.size).toBe(2);
    expect(registered()).toHaveLength(2);
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/destroy\(\) threw/), expect.any(Error));
  });

  /** A custom binder that registers nothing and whose binding throws on destroy(). */
  const throwingBinder: AuthTransportBinder = () => ({
    destroy: () => {
      throw new Error('binding destroy failed');
    },
  });

  it('binds every app for the new provider when an old binding throws on destroy()', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const graphA = await loadGraph();
    graphA.createFrontX().use(graphA.auth({ provider: makeBearerProvider('token-a'), transport: throwingBinder })).build();
    const joinGraph = await loadGraph();
    joinGraph.createFrontX().use(joinGraph.auth()).build();
    expect(registered()).toHaveLength(0);

    const graphB = await loadGraph();
    graphB.createFrontX().use(graphB.auth({ provider: makeBearerProvider('token-b') })).build();

    expect(registered()).toHaveLength(3);
    for (const plugin of registered()) {
      const ctx = (await plugin.onRequest?.(makeReqCtx('/accounts/me'))) as RestRequestContext;
      expect(ctx.headers.Authorization).toBe('Bearer token-b');
    }
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/transport binding destroy\(\) threw/), expect.any(Error));
  });

  it('gives the hold back when the binding of a leaving app throws on destroy()', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const providerA = makeBearerProvider('token-a', { destroy: vi.fn() });
    const graphA = await loadGraph();
    const appA = graphA.createFrontX().use(graphA.auth({ provider: providerA, transport: throwingBinder })).build();

    appA.destroy();

    expect(peekRealm()).toBeUndefined();
    expect(providerA.destroy).toHaveBeenCalledTimes(1);
  });

  it('warns in a development build at every replacement, naming both providers and their origin lists', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      class ShellProvider {
        getSession = vi.fn().mockResolvedValue({ kind: 'bearer', token: 'secret-a' } satisfies AuthSession);
        checkAuth = vi.fn().mockResolvedValue({ authenticated: false });
        logout = vi.fn().mockResolvedValue({ type: 'none' });
      }
      const graphA = await loadGraph();
      graphA.createFrontX().use(graphA.auth({
        provider: new ShellProvider(),
        frontxApi: { allowedBearerOrigins: [OLD_ONLY] },
      })).build();
      expect(warn).not.toHaveBeenCalled();
      const graphB = await loadGraph();
      graphB.createFrontX().use(graphB.auth({ provider: makeBearerProvider('secret-b') })).build();

      expect(warn).toHaveBeenCalledTimes(1);
      const message = String(warn.mock.calls[0]?.[0]);
      expect(message).toContain(`ShellProvider (bearer origins ["${OLD_ONLY}"], cookie origins [])`);
      expect(message).toContain('with a provider object (bearer origins [], cookie origins [])');
      expect(message).not.toMatch(/secret/);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('completes a replacement when the development warning cannot describe a provider', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const graphA = await loadGraph();
      const appA = graphA.createFrontX().use(graphA.auth({
        provider: new Proxy(makeBearerProvider('a'), {
          get: (target, key) => {
            if (key === 'constructor') throw new Error('no constructor');
            return Reflect.get(target, key);
          },
        }),
      })).build();
      const providerB = makeBearerProvider('b');
      const graphB = await loadGraph();

      graphB.createFrontX().use(graphB.auth({ provider: providerB })).build();

      expect(appA.auth?.provider).toBe(providerB);
      expect(peekRealm()?.holders.size).toBe(2);
      expect(registered()).toHaveLength(2);
      expect(error).toHaveBeenCalledWith(expect.stringMatching(/replacement warning threw/), expect.any(Error));
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('rejects a login and a callback that end after the swap; the old tracker emits nothing', async () => {
    let finishLogin!: (transition: AuthTransition) => void;
    let finishCallback!: (transition: AuthTransition) => void;
    const graphA = await loadGraph();
    const appA = graphA.createFrontX().use(graphA.auth({
      provider: makeBearerProvider('a', {
        login: vi.fn(() => new Promise<AuthTransition>((resolve) => { finishLogin = resolve; })),
        handleCallback: vi.fn(() => new Promise<AuthTransition>((resolve) => { finishCallback = resolve; })),
      }),
    })).build();
    await settle();
    const heard = listen(graphA);
    const signingIn = appA.auth!.login!({ type: 'password', payload: {} });
    const calledBack = appA.auth!.handleCallback!({ type: 'oauth', payload: {} } as never);

    const graphB = await loadGraph();
    graphB.createFrontX().use(graphB.auth({ provider: makeBearerProvider('b') })).build();
    finishLogin({ type: 'none' });
    finishCallback({ type: 'none' });

    await expect(signingIn).rejects.toThrow(/was replaced before the call ended/);
    await expect(calledBack).rejects.toThrow(/was replaced before the call ended/);
    await settle();
    expect(heard).toEqual(['sessionCheck', 'loggedOut']);
  });

  it('rejects a call that fails after the swap with the replaced-provider error, not the old provider\'s own', async () => {
    const failures: Array<(error: Error) => void> = [];
    const pending = () => new Promise<never>((_, reject) => { failures.push(reject); });
    const graphA = await loadGraph();
    const appA = graphA.createFrontX().use(graphA.auth({
      provider: makeBearerProvider('a', { login: vi.fn(pending), getSession: vi.fn(pending) }),
    })).build();
    const signingIn = appA.auth!.login!({ type: 'password', payload: {} });
    const reading = appA.auth!.getSession();
    const failedBefore = appA.auth!.getSession();
    failures[2](new Error('A failed on its own'));
    await expect(failedBefore).rejects.toThrow('A failed on its own');

    const graphB = await loadGraph();
    graphB.createFrontX().use(graphB.auth({ provider: makeBearerProvider('b') })).build();
    failures[0](new Error('A login failed'));
    failures[1](new Error('A read failed'));

    await expect(signingIn).rejects.toThrow(/was replaced before the call ended/);
    await expect(reading).rejects.toThrow(/was replaced before the call ended/);
  });

  it('releases only its own hold when the replaced app leaves: the new provider lives on', async () => {
    const destroyA = vi.fn();
    const destroyB = vi.fn();
    const graphA = await loadGraph();
    const appA = graphA.createFrontX().use(graphA.auth({ provider: makeBearerProvider('a', { destroy: destroyA }) })).build();
    const joinGraph = await loadGraph();
    const joinApp = joinGraph.createFrontX().use(joinGraph.auth()).build();
    const providerB = makeBearerProvider('token-b', { destroy: destroyB });
    const graphB = await loadGraph();
    graphB.createFrontX().use(graphB.auth({ provider: providerB })).build();
    const beforeLeave = registered().length;

    appA.destroy();

    expect(appA.auth).toBeUndefined();
    expect(destroyA).toHaveBeenCalledTimes(1);
    expect(destroyB).not.toHaveBeenCalled();
    expect(peekRealm()?.holders.size).toBe(2);
    expect(registered()).toHaveLength(beforeLeave - 1);
    expect(joinApp.auth?.provider).toBe(providerB);
    await expect(joinApp.auth!.getSession()).resolves.toEqual({ kind: 'bearer', token: 'token-b' });
  });

  it('binds a join that comes after the replacement for the new provider and its config', async () => {
    const graphA = await loadGraph();
    graphA.createFrontX().use(graphA.auth({
      provider: makeBearerProvider('token-a'),
      frontxApi: { allowedBearerOrigins: [OLD_ONLY] },
    })).build();
    const graphB = await loadGraph();
    graphB.createFrontX().use(graphB.auth({
      provider: makeBearerProvider('token-b'),
      frontxApi: { allowedBearerOrigins: [NEW_ONLY] },
    })).build();
    const before = [...registered()];

    const lateGraph = await loadGraph();
    lateGraph.createFrontX().use(lateGraph.auth()).build();
    const [late] = addedSince(before);

    const listed = (await late?.onRequest?.(makeReqCtx(`${NEW_ONLY}/x`))) as RestRequestContext;
    expect(listed.headers.Authorization).toBe('Bearer token-b');
    const old = (await late?.onRequest?.(makeReqCtx(`${OLD_ONLY}/x`))) as RestRequestContext;
    expect(old.headers.Authorization).toBeUndefined();
  });

  /** Builds A, then B; `onSwap` runs inside B's replacement, from a synchronous SessionCheck listener. */
  async function replaceFromSwapCallback(onSwap: () => void, listener: (event: unknown) => void = () => undefined) {
    const graphA = await loadGraph();
    const appA = graphA.createFrontX().use(graphA.auth({
      provider: makeBearerProvider('token-a', { subscribe: vi.fn(() => () => undefined) }),
    })).build();
    appA.auth!.subscribe!(listener);
    await joinAndFindTransport();
    graphA.eventBus.on('auth/sessionCheck', () => {
      if (peekRealm()?.current.provider === providerB) onSwap();
    });
    // B tells the moved listener its state at once, inside subscribe, so the report is held until the commit.
    const providerB = makeBearerProvider('token-b', {
      subscribe: vi.fn((relay) => {
        (relay as (event: { state: 'authenticated' }) => void)({ state: 'authenticated' });
        return () => undefined;
      }),
    });
    const graphB = await loadGraph();
    graphB.createFrontX().use(graphB.auth({ provider: providerB })).build();
    return providerB;
  }

  /** Every registered transport sends `token` to the app's own origin. */
  async function expectEveryTransportSends(token: string) {
    for (const plugin of registered()) {
      const ctx = (await plugin.onRequest?.(makeReqCtx('/accounts/me'))) as RestRequestContext;
      expect(ctx.headers.Authorization).toBe(`Bearer ${token}`);
    }
  }

  it('refuses a replacement started from a callback of a running one, and leaves the realm as the outer swap makes it', async () => {
    const graphC = await loadGraph();
    const providerC = makeBearerProvider('token-c');
    let nested: unknown;

    const providerB = await replaceFromSwapCallback(() => {
      try {
        graphC.createFrontX().use(graphC.auth({ provider: providerC })).build();
      } catch (error) {
        nested = error;
      }
    });

    expect((nested as Error).message).toMatch(/another provider replacement was still running/);
    expect(providerC.checkAuth).not.toHaveBeenCalled();
    expect(peekRealm()?.current.provider).toBe(providerB);
    expect(peekRealm()?.replacing).toBe(false);
    expect(peekRealm()?.holders.size).toBe(3);
    await expectEveryTransportSends('token-b');
    // Refused in onRegister, so that framework copy builds once the replacement has returned.
    graphC.createFrontX().use(graphC.auth({ provider: providerC })).build();
    expect(peekRealm()?.current.provider).toBe(providerC);
  });

  it('binds no holder back to a provider that a replacement started meanwhile has retired', async () => {
    // A copy that ignores the flag (a mismatched build) starts the nested swap anyway.
    const graphC = await loadGraph();
    const providerC = makeBearerProvider('token-c', { subscribe: vi.fn(() => () => undefined) });
    const listener = vi.fn();

    await replaceFromSwapCallback(() => {
      peekRealm()!.replacing = false;
      graphC.createFrontX().use(graphC.auth({ provider: providerC })).build();
    }, listener);

    expect(peekRealm()?.current.provider).toBe(providerC);
    // B's report, held until B's commit, is dropped: C retired B before that commit finished.
    expect(listener).not.toHaveBeenCalled();
    expect(registered()).toHaveLength(4);
    await expectEveryTransportSends('token-c');
  });
});

describe('auth() - one app takes one auth() plugin', () => {
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
    expect(peekRealm()?.holders.size).toBe(1);
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
    expect(peekRealm()?.holders.size).toBe(1);
    await joinApp.auth?.login?.({ type: 'password', payload: {} });
    expect(login).toHaveBeenCalledTimes(1);
    expect(joinHeard).toEqual(['loggedIn']);

    // A late join after the app that passed the provider left still finds it.
    const lateGraph = await loadGraph();
    const lateApp = lateGraph.createFrontX().use(lateGraph.auth()).build();
    expect(lateApp.auth).toBe(joinApp.auth);

    lateApp.destroy();
    expect(destroy).not.toHaveBeenCalled();
    joinApp.destroy();

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(peekRealm()).toBeUndefined();

    // With the slot free, a new provider publishes a new record.
    const nextGraph = await loadGraph();
    const nextApp = nextGraph.createFrontX().use(nextGraph.auth({ provider: makeBearerProvider('y') })).build();
    expect(peekRealm()?.runtime).toBe(nextApp.auth);
  });

  it('runs the code of the departed app for the apps that still hold the runtime', async () => {
    // The app that passed the provider is destroyed; the session tracker, the
    // runtime and the provider it built go on serving the join from that app's
    // own module copy (its bundle, on a page).
    const report: { listener?: (event: { state: 'authenticated' | 'unauthenticated' }) => void } = {};
    const provider = makeBearerProvider('t', {
      subscribe: vi.fn((listener) => {
        report.listener = listener as typeof report.listener;
        return () => undefined;
      }),
    });
    const ownerGraph = await loadGraph();
    const ownerApp = ownerGraph.createFrontX().use(ownerGraph.auth({ provider })).build();
    const joinGraph = await loadGraph();
    joinGraph.createFrontX().use(joinGraph.auth()).build();
    await settle();
    const ownerHeard = listen(ownerGraph);
    const joinHeard = listen(joinGraph);

    ownerApp.destroy();
    report.listener?.({ state: 'authenticated' });
    await settle();

    expect(joinHeard).toEqual(['loggedIn']);
    expect(ownerHeard).toEqual([]);
  });

  it('lets a new provider replace one that the apps of a departed owner still hold', async () => {
    const destroyA = vi.fn();
    const ownerGraph = await loadGraph();
    const ownerApp = ownerGraph.createFrontX().use(ownerGraph.auth({ provider: makeBearerProvider('a', { destroy: destroyA }) })).build();
    const joinGraph = await loadGraph();
    const joinApp = joinGraph.createFrontX().use(joinGraph.auth()).build();
    ownerApp.destroy();

    const providerB = makeBearerProvider('b');
    const graphB = await loadGraph();
    const appB = graphB.createFrontX().use(graphB.auth({ provider: providerB })).build();

    expect(destroyA).toHaveBeenCalledTimes(1);
    expect(joinApp.auth?.provider).toBe(providerB);
    expect(appB.auth).toBe(joinApp.auth);
    expect(peekRealm()?.holders.size).toBe(2);
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
    expect(peekRealm()?.holders.size).toBe(1);
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

    expect(peekRealm()?.holders.size).toBe(1);
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
    expect(peekRealm()?.current.transportConfig).toEqual(frontxApi);

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
    // The stray hook is kept out: the join reports its refreshes to the provider in use.
    expect(typeof joinArgs?.trackRefresh).toBe('function');
    expect(joinArgs?.trackRefresh).not.toBe((frontxApi as { trackRefresh?: unknown }).trackRefresh);
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

describe('auth() - the origin lists on the app that passed the provider and on a joined app', () => {
  const API_ORIGIN = 'https://api.example.com';
  const COOKIE_ONLY_ORIGIN = 'https://cookies.example.com';
  const FOREIGN_ORIGIN = 'https://foreign.example.com';

  type Transport = AuthTransportPlugin & Pick<RestPluginHooks, 'onError'>;

  /**
   * Builds the app that passes the provider with one `frontxApi` (the API
   * origin for bearer tokens, a second origin for cookies only) and an app
   * that joins with `auth()`, and returns the transport each registered. Both
   * transports reach the provider through the realm.
   */
  async function bearerApps(provider: AuthProvider): Promise<Array<[string, Transport]>> {
    const beforeProvider = [...apiRegistry.plugins.getAll(RestProtocol)];
    const providerGraph = await loadGraph();
    providerGraph
      .createFrontX()
      .use(providerGraph.auth({
        provider,
        frontxApi: { allowedBearerOrigins: [API_ORIGIN], allowedCookieOrigins: [COOKIE_ONLY_ORIGIN] },
      }))
      .build();
    const providerPlugin = apiRegistry.plugins.getAll(RestProtocol).find((plugin) => !beforeProvider.includes(plugin));
    expect(providerPlugin).toBeDefined();
    const joinPlugin = await joinAndFindTransport();
    return [
      ['auth({ provider })', providerPlugin as Transport],
      ['auth()', joinPlugin],
    ];
  }

  it('sends no bearer token to an origin outside allowedBearerOrigins, a cookie-only origin included', async () => {
    for (const [who, plugin] of await bearerApps(makeBearerProvider('token-1'))) {
      for (const url of [`${FOREIGN_ORIGIN}/accounts/me`, `${COOKIE_ONLY_ORIGIN}/accounts/me`]) {
        const ctx = (await plugin.onRequest?.(makeReqCtx(url))) as RestRequestContext;
        expect(ctx.headers.Authorization, `${who} ${url}`).toBeUndefined();
      }
    }
  });

  it('sends the bearer token to an origin listed in allowedBearerOrigins', async () => {
    for (const [who, plugin] of await bearerApps(makeBearerProvider('token-1'))) {
      const ctx = (await plugin.onRequest?.(makeReqCtx(`${API_ORIGIN}/accounts/me`))) as RestRequestContext;
      expect(ctx.headers.Authorization, who).toBe('Bearer token-1');
    }
  });

  it('starts no refresh for a 401 from an origin that gets no credentials, while a 401 from the listed origin does', async () => {
    const refresh = vi.fn(async () => ({ kind: 'bearer', token: 'token-2' }) satisfies AuthSession);
    for (const [who, plugin] of await bearerApps(makeBearerProvider('token-1', { refresh }))) {
      refresh.mockClear();
      const foreign = make401(`${FOREIGN_ORIGIN}/accounts/me`);
      expect(await plugin.onError?.(foreign)).toBe(foreign.error);
      expect(refresh, who).not.toHaveBeenCalled();
      expect(foreign.retry, who).not.toHaveBeenCalled();

      // The same 401 from the listed origin refreshes, so the error hook is
      // live and only the origin kept the foreign one out.
      const listed = make401(`${API_ORIGIN}/accounts/me`);
      await plugin.onError?.(listed);
      expect(refresh, who).toHaveBeenCalledTimes(1);
      expect(listed.retry, who).toHaveBeenCalledWith({ headers: { Authorization: 'Bearer token-2' } });
    }
  });

  it('hands the provider in use the credentialed flag of each 401, through a hook wrapped after the build', async () => {
    // The realm reads `onTransportError` off the provider when the transport
    // calls it, so a wrap set after the build (as the shell's sign-in
    // trigger does) gets the framework's event, `credentialed` included.
    const provider = makeBearerProvider('token-1');
    const apps = await bearerApps(provider);
    const flags: unknown[] = [];
    provider.onTransportError = (event) => {
      flags.push((event as FrameworkTransportErrorEvent).credentialed);
    };
    for (const [, plugin] of apps) {
      for (const url of [`${FOREIGN_ORIGIN}/x`, `${API_ORIGIN}/x`, `${COOKIE_ONLY_ORIGIN}/x`]) {
        await plugin.onError?.(make401(url));
      }
    }
    expect(flags).toEqual([false, true, true, false, true, true]);
  });
});
