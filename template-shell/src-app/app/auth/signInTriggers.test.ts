/**
 * The triggers that send the sign-in chain, against the smallest doubles that
 * show what each trigger decides: the start-up check runs once the bootstrap
 * has settled and only for a host with an auth runtime that says signed out;
 * the 401 trigger wraps the provider's own transport-error hook, and when the
 * provider carries a refresh it asks the session once the transport's refresh
 * flight has settled, one confirmation at a time; the chain goes out only once
 * the modal domain's slot has attached its root, whichever trigger fires
 * first; and one page gets one chain, whatever fires and however often.
 *
 * `bootstrapSettled` and the modal slot's attachment signal are replaced so
 * each case decides when the bootstrap has settled and when the slot has
 * attached - no real bootstrap runs in this file. Every case imports the module
 * afresh, since the once-guard is its module state.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as react from '@gears-frontx/react';
import type { AuthProvider, FrontXApp } from '@gears-frontx/react';
import { SIGN_IN_EXTENSION_ID } from './signIn';

/** The event shape of the provider hook the 401 trigger wraps; the package
 * does not export the event type itself, so it is read off the hook. */
type TransportErrorEvent = Parameters<NonNullable<AuthProvider['onTransportError']>>[0];

interface Deferred {
  promise: Promise<void>;
  settle: () => void;
  reject: (error: unknown) => void;
}

const bootstrap = vi.hoisted(() => {
  const state: { current: Deferred } = {
    current: {
      promise: Promise.resolve(),
      settle: () => undefined,
      reject: () => undefined,
    },
  };
  return state;
});

const modalSlot = vi.hoisted(() => {
  const state: { current: Deferred } = {
    current: {
      promise: Promise.resolve(),
      settle: () => undefined,
      reject: () => undefined,
    },
  };
  return state;
});

vi.mock('@/app/mfe/bootstrapOnce', () => ({
  bootstrapSettled: () => bootstrap.current.promise,
}));

vi.mock('@/app/mfe/modalSlotAttached', () => ({
  modalSlotAttached: () => modalSlot.current.promise,
}));

function makeDeferred(): Deferred {
  let settle!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    settle = res;
    reject = rej;
  });
  return { promise, settle, reject };
}

/** The smallest provider the `AuthProvider` contract requires. */
function stubProvider(): AuthProvider {
  return {
    getSession: vi.fn().mockResolvedValue(null),
    checkAuth: vi.fn().mockResolvedValue({ authenticated: false }),
    logout: vi.fn().mockResolvedValue({ type: 'none' }),
  };
}

/**
 * The auth runtime slice the triggers actually read: `checkAuth` to decide,
 * `getSession` for the snapshot reads (the hook-time one, and the send's final
 * one right before the chain), and `logout` to prove no provider logout runs
 * on the set-aside path. The rest of the runtime is the
 * framework plugin's tested behaviour and stays out of these doubles.
 */
type AuthRuntimeSlice = {
  checkAuth: () => Promise<{ authenticated: boolean }>;
  refresh?: () => Promise<unknown>;
  getSession?: () => Promise<unknown>;
};

function stubApp(auth?: AuthRuntimeSlice): {
  app: FrontXApp;
  executeActionsChain: ReturnType<typeof vi.fn>;
  logout: ReturnType<typeof vi.fn>;
} {
  const executeActionsChain = vi.fn();
  const logout = vi.fn();
  const runtime = auth && { getSession: async () => null, logout, ...auth };
  const app = { mfeRegistry: { executeActionsChain }, auth: runtime } as unknown as FrontXApp;
  return { app, executeActionsChain, logout };
}

function transportError(status: number): TransportErrorEvent {
  return {
    request: { url: '/api/accounts/me', method: 'GET' },
    error: new Error(`request failed with ${status}`),
    status,
  };
}

/** Lets the promises the trigger chains after the settles run to their end. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Settles both waits the chain needs: the bootstrap and the attached slot. */
function settleBootstrapAndSlot(): void {
  bootstrap.current.settle();
  modalSlot.current.settle();
}

beforeEach(() => {
  // The once-guard is module state; the module is imported per case below, so
  // the registry reset here is what makes each import fresh.
  vi.resetModules();
  bootstrap.current = makeDeferred();
  modalSlot.current = makeDeferred();
});

afterEach(() => {
  // One case reads the address as a page load would carry it; the rest must
  // not see its entry.
  window.history.replaceState(null, '', '/');
});

describe('wireSignInTriggers', () => {
  it('the start-up check sends the chain once when no session exists', async () => {
    const { wireSignInTriggers } = await import('./signInTriggers');
    const checkAuth = vi.fn().mockResolvedValue({ authenticated: false });
    const { app, executeActionsChain } = stubApp({ checkAuth });

    wireSignInTriggers(app, stubProvider());
    expect(executeActionsChain).not.toHaveBeenCalled();

    settleBootstrapAndSlot();
    await vi.waitFor(() => expect(executeActionsChain).toHaveBeenCalledTimes(1));
    expect(checkAuth).toHaveBeenCalledTimes(1);

    const chain = executeActionsChain.mock.calls[0][0] as {
      action: { payload: { subject: string } };
    };
    expect(chain.action.payload.subject).toBe(SIGN_IN_EXTENSION_ID);
  });

  it('the chain is not sent before the modal root is attached, and sent once after', async () => {
    const { wireSignInTriggers } = await import('./signInTriggers');
    const provider = stubProvider();
    const { app, executeActionsChain } = stubApp({
      checkAuth: vi.fn().mockResolvedValue({ authenticated: false }),
    });

    wireSignInTriggers(app, provider);
    // The bootstrap has settled, but the modal domain's slot has not attached
    // its root yet: the mount would land on no root, so nothing goes out.
    bootstrap.current.settle();
    await flush();
    expect(executeActionsChain).not.toHaveBeenCalled();

    // The slot attaches: the chain goes out, once.
    modalSlot.current.settle();
    await vi.waitFor(() => expect(executeActionsChain).toHaveBeenCalledTimes(1));

    // A 401 while the chain is out sends nothing: the page got its one chain.
    provider.onTransportError?.(transportError(401));
    await flush();
    expect(executeActionsChain).toHaveBeenCalledTimes(1);
  });

  it('a 401 waits for the bootstrap and the attached modal slot before the chain goes', async () => {
    const { wireSignInTriggers } = await import('./signInTriggers');
    const provider = stubProvider();
    const { app, executeActionsChain } = stubApp(undefined);

    wireSignInTriggers(app, provider);
    provider.onTransportError?.(transportError(401));
    await flush();
    expect(executeActionsChain).not.toHaveBeenCalled();

    // The bootstrap alone is not enough: the mount needs the attached root.
    bootstrap.current.settle();
    await flush();
    expect(executeActionsChain).not.toHaveBeenCalled();

    modalSlot.current.settle();
    await vi.waitFor(() => expect(executeActionsChain).toHaveBeenCalledTimes(1));
  });

  it('a failed bootstrap keeps the guard up: a later 401 sends nothing and each path warns once', async () => {
    // A real page cannot swap the bootstrap for a fresh one: `bootstrapOnce`
    // deliberately never resets a failed attempt, so a released guard could
    // only buy one more pass through the same rejection. The guard stays up,
    // and each path says the failure at most once: the start-up check here,
    // then the 401's own chain send against the same rejection.
    const { wireSignInTriggers } = await import('./signInTriggers');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const provider = stubProvider();
    const { app, executeActionsChain } = stubApp(undefined);

    wireSignInTriggers(app, provider);
    bootstrap.current.reject(new Error('manifest aggregate unreachable'));
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));

    // The 401 hits a page whose bootstrap failed: the send runs, meets the
    // same rejection, and nothing goes out.
    provider.onTransportError?.(transportError(401));
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(2));

    // The guard is up now: further 401s send nothing and say nothing more.
    provider.onTransportError?.(transportError(401));
    await flush();
    expect(executeActionsChain).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('a signed-in start sends nothing', async () => {
    const { wireSignInTriggers } = await import('./signInTriggers');
    const checkAuth = vi.fn().mockResolvedValue({
      authenticated: true,
      session: { kind: 'bearer', token: 'already-in' },
    });
    const { app, executeActionsChain } = stubApp({ checkAuth });

    wireSignInTriggers(app, stubProvider());
    settleBootstrapAndSlot();
    await vi.waitFor(() => expect(checkAuth).toHaveBeenCalledTimes(1));
    await flush();

    expect(executeActionsChain).not.toHaveBeenCalled();
  });

  it('a signed-in start whose address names the sign-in extension unmounts it instead', async () => {
    // A deep link, or an address an earlier sign-in left: with a session, the
    // entry is removed through the unmount chain instead of a modal opening
    // over the session - no sign-in chain, and no reload either.
    window.history.replaceState(null, '', '/?popup=sign-in');
    const { wireSignInTriggers } = await import('./signInTriggers');
    const checkAuth = vi.fn().mockResolvedValue({
      authenticated: true,
      session: { kind: 'bearer', token: 'already-in' },
    });
    const { app, executeActionsChain } = stubApp({ checkAuth });

    wireSignInTriggers(app, stubProvider());
    settleBootstrapAndSlot();
    await vi.waitFor(() => expect(executeActionsChain).toHaveBeenCalledTimes(1));

    const chain = executeActionsChain.mock.calls[0][0] as {
      action: { type: string; target: string; payload: { subject: string; history: string } };
    };
    expect(chain.action.type).toBe(react.FRONTX_ACTION_UNMOUNT_EXT);
    expect(chain.action.target).toBe(react.FRONTX_POPUP_DOMAIN);
    expect(chain.action.payload).toEqual({ subject: SIGN_IN_EXTENSION_ID, history: 'replace' });

    await flush();
    expect(executeActionsChain).toHaveBeenCalledTimes(1);
  });

  it('a start without an auth runtime sends nothing', async () => {
    const { wireSignInTriggers } = await import('./signInTriggers');
    const { app, executeActionsChain } = stubApp(undefined);

    wireSignInTriggers(app, stubProvider());
    settleBootstrapAndSlot();
    await flush();

    expect(executeActionsChain).not.toHaveBeenCalled();
  });

  it('a start-up check that rejects sends nothing and keeps the failure out of the page', async () => {
    const { wireSignInTriggers } = await import('./signInTriggers');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { app, executeActionsChain } = stubApp({
      checkAuth: vi.fn().mockRejectedValue(new Error('accounts service down')),
    });

    wireSignInTriggers(app, stubProvider());
    settleBootstrapAndSlot();
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());

    expect(executeActionsChain).not.toHaveBeenCalled();
  });

  it('one 401 among several failing requests sends one chain', async () => {
    const { wireSignInTriggers } = await import('./signInTriggers');
    const provider = stubProvider();
    const { app, executeActionsChain } = stubApp(undefined);

    wireSignInTriggers(app, provider);
    provider.onTransportError?.(transportError(401));
    provider.onTransportError?.(transportError(401));
    provider.onTransportError?.(transportError(500));
    provider.onTransportError?.(transportError(401));

    settleBootstrapAndSlot();
    await vi.waitFor(() => expect(executeActionsChain).toHaveBeenCalledTimes(1));
    const chain = executeActionsChain.mock.calls[0][0] as {
      action: { payload: { subject: string } };
    };
    expect(chain.action.payload.subject).toBe(SIGN_IN_EXTENSION_ID);
  });

  it('a transport error that is not a 401 sends nothing', async () => {
    const { wireSignInTriggers } = await import('./signInTriggers');
    const provider = stubProvider();
    const { app, executeActionsChain } = stubApp(undefined);

    wireSignInTriggers(app, provider);
    provider.onTransportError?.(transportError(500));
    provider.onTransportError?.(transportError(403));

    settleBootstrapAndSlot();
    await flush();

    expect(executeActionsChain).not.toHaveBeenCalled();
  });

  it('a 401 a refresh can recover is confirmed against the session first', async () => {
    // The hook runs before the transport's refresh-and-retry (auth.ts calls it
    // "before retry decisions"), so with a refresh available the trigger asks
    // the runtime whether the session is really gone before opening the
    // modal, once the transport's refresh flight has settled: a signed-out
    // answer sends the chain, a signed-in one does not. No flight runs here,
    // so the confirmation's one tick is all it waits.
    const { wireSignInTriggers } = await import('./signInTriggers');
    // The start-up check reports a session (its one call sends nothing), so
    // the 401 path's own calls decide the chain here.
    const checkAuth = vi.fn().mockResolvedValue({ authenticated: true });
    const provider: AuthProvider = {
      ...stubProvider(),
      refresh: vi.fn().mockResolvedValue({ kind: 'bearer', token: 'renewed' }),
    };
    const { app, executeActionsChain } = stubApp({ checkAuth });

    wireSignInTriggers(app, provider);
    settleBootstrapAndSlot();
    await vi.waitFor(() => expect(checkAuth).toHaveBeenCalledTimes(1));
    expect(executeActionsChain).not.toHaveBeenCalled();

    // The 401's own confirmation: a session still answers, so no chain.
    provider.onTransportError?.(transportError(401));
    await vi.waitFor(() => expect(checkAuth).toHaveBeenCalledTimes(2));
    expect(executeActionsChain).not.toHaveBeenCalled();

    // The refresh path gave out and the session is really gone: the next 401
    // opens the modal.
    checkAuth.mockResolvedValue({ authenticated: false });
    provider.onTransportError?.(transportError(401));
    await vi.waitFor(() => expect(executeActionsChain).toHaveBeenCalledTimes(1));
    const chain = executeActionsChain.mock.calls[0][0] as {
      action: { payload: { subject: string } };
    };
    expect(chain.action.payload.subject).toBe(SIGN_IN_EXTENSION_ID);
  });

  it('a 401 whose refresh recovers the session opens no modal', async () => {
    // The hook fires before the transport has refreshed: a read taken at hook
    // time would answer from the state the flight is about to replace and
    // open the modal for a session the flight recovers. The confirmation
    // waits for the flight, and the session the flight resolved is the
    // runtime's answer: signed in, so the provider is not asked again.
    const { wireSignInTriggers } = await import('./signInTriggers');
    let flightSettled = false;
    const refresh = vi.fn(async () => {
      await flush();
      flightSettled = true;
      return { kind: 'bearer', token: 'renewed' } as const;
    });
    const provider: AuthProvider = {
      ...stubProvider(),
      refresh,
    };
    const checkAuth = vi
      .fn()
      .mockResolvedValueOnce({ authenticated: true }) // the start-up read
      .mockImplementation(async () => ({ authenticated: flightSettled }));
    const { app, executeActionsChain } = stubApp({ checkAuth });

    wireSignInTriggers(app, provider);
    settleBootstrapAndSlot();
    await vi.waitFor(() => expect(checkAuth).toHaveBeenCalledTimes(1));
    expect(executeActionsChain).not.toHaveBeenCalled();

    // The 401 and the transport's flight for it land in the same tick, before
    // the confirmation's first tick; the flight's own result decides.
    provider.onTransportError?.(transportError(401));
    void provider.refresh?.();
    await vi.waitFor(() => expect(flightSettled).toBe(true));
    await flush();
    await flush();

    expect(flightSettled).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);
    // The flight answered, so the confirmation never asked the provider.
    expect(checkAuth).toHaveBeenCalledTimes(1);
    expect(executeActionsChain).not.toHaveBeenCalled();
  });

  it('a 401 in a joined microfrontend waits for the flight it started through the shared runtime', async () => {
    // A join refreshes through app.auth.refresh (the tracked path), not the
    // provider's own refresh, so the confirmation has to see that flight too.
    const { wireSignInTriggers } = await import('./signInTriggers');
    let flightSettled = false;
    const runtimeRefresh = vi.fn(async () => {
      await flush();
      flightSettled = true;
      return { kind: 'bearer', token: 'renewed' } as const;
    });
    const provider: AuthProvider = { ...stubProvider(), refresh: vi.fn() };
    const checkAuth = vi
      .fn()
      .mockResolvedValueOnce({ authenticated: true }) // the start-up read
      .mockImplementation(async () => ({ authenticated: flightSettled }));
    const { app, executeActionsChain } = stubApp({ checkAuth, refresh: runtimeRefresh });

    wireSignInTriggers(app, provider);
    settleBootstrapAndSlot();
    await vi.waitFor(() => expect(checkAuth).toHaveBeenCalledTimes(1));

    provider.onTransportError?.(transportError(401));
    void app.auth?.refresh?.();
    await vi.waitFor(() => expect(flightSettled).toBe(true));
    await flush();
    await flush();

    expect(flightSettled).toBe(true);
    expect(runtimeRefresh).toHaveBeenCalledTimes(1);
    // The flight the join started answered on the runtime's own path, so the
    // confirmation never asked the provider.
    expect(checkAuth).toHaveBeenCalledTimes(1);
    expect(executeActionsChain).not.toHaveBeenCalled();
  });

  it('a refresh that fails after the session looked alive still opens the modal', async () => {
    // The order the transport makes for one 401: the hook fires, the refresh
    // flight runs, and the session is asked only once the flight has settled.
    // A read that answered signed in before the flight failed must not hold
    // the modal back: the flight left the session gone, and the chain goes
    // out on the answer that follows the flight.
    const { wireSignInTriggers } = await import('./signInTriggers');
    const order: string[] = [];
    const provider: AuthProvider = {
      ...stubProvider(),
      checkAuth: vi.fn(async () => {
        order.push('check');
        return { authenticated: order.length === 1 };
      }),
      refresh: vi.fn(async () => {
        order.push('refresh');
        throw new Error('refresh endpoint down');
      }),
    };
    const { app, executeActionsChain } = stubApp({ checkAuth: provider.checkAuth });

    wireSignInTriggers(app, provider);
    settleBootstrapAndSlot();
    // The start-up read answers signed in; the 401 has not happened yet.
    await vi.waitFor(() => expect(order).toEqual(['check']));

    // The 401 and the transport's flight for it land in the same tick, before
    // the confirmation's first tick.
    provider.onTransportError?.(transportError(401));
    void provider.refresh?.();
    await vi.waitFor(() => expect(executeActionsChain).toHaveBeenCalledTimes(1));

    // The flight failed first, and the read that followed it sent the chain.
    expect(order).toEqual(['check', 'refresh', 'check']);
    const chain = executeActionsChain.mock.calls[0][0] as {
      action: { payload: { subject: string } };
    };
    expect(chain.action.payload.subject).toBe(SIGN_IN_EXTENSION_ID);
  });

  it('a burst of 401s on a host with a refresh starts one session check', async () => {
    // Each failing request fires the hook, and the check can travel the same
    // transport the 401s came from; the one confirmation already running
    // answers the whole burst instead of stacking one check per request.
    const { wireSignInTriggers } = await import('./signInTriggers');
    const provider: AuthProvider = {
      ...stubProvider(),
      refresh: vi.fn().mockResolvedValue({ kind: 'bearer', token: 'renewed' }),
    };
    const checkAuth = vi.fn().mockResolvedValue({ authenticated: true });
    const { app, executeActionsChain } = stubApp({ checkAuth });

    wireSignInTriggers(app, provider);
    settleBootstrapAndSlot();
    await vi.waitFor(() => expect(checkAuth).toHaveBeenCalledTimes(1));
    expect(executeActionsChain).not.toHaveBeenCalled();

    provider.onTransportError?.(transportError(401));
    provider.onTransportError?.(transportError(401));
    provider.onTransportError?.(transportError(401));
    await vi.waitFor(() => expect(checkAuth).toHaveBeenCalledTimes(2));
    await flush();

    // The start-up read plus one confirmation for the whole burst.
    expect(checkAuth).toHaveBeenCalledTimes(2);
    expect(executeActionsChain).not.toHaveBeenCalled();
  });

  it('a burst of 401s reads the baseline session once', async () => {
    // The baseline credentials only matter to the 401 that starts the
    // confirmation: the ones a confirmation already running drops at once
    // never compare anything, so they must not start a session read either.
    // A provider that reads the session over the network (a cookie /me
    // lookup) would otherwise pay for one read per failing request.
    const { wireSignInTriggers } = await import('./signInTriggers');
    const provider: AuthProvider = {
      ...stubProvider(),
      refresh: vi.fn().mockResolvedValue({ kind: 'bearer', token: 'renewed' }),
    };
    const checkAuth = vi.fn().mockResolvedValue({ authenticated: true });
    const getSession = vi.fn().mockResolvedValue({ kind: 'bearer', token: 'the-401-one' });
    const { app, executeActionsChain } = stubApp({ checkAuth, getSession });

    wireSignInTriggers(app, provider);
    settleBootstrapAndSlot();
    await vi.waitFor(() => expect(checkAuth).toHaveBeenCalledTimes(1));

    // Three 401s land in the same tick: the first starts the confirmation,
    // the other two are dropped before anything is read.
    provider.onTransportError?.(transportError(401));
    provider.onTransportError?.(transportError(401));
    provider.onTransportError?.(transportError(401));
    await vi.waitFor(() => expect(checkAuth).toHaveBeenCalledTimes(2));
    await flush();

    // One baseline read for the whole burst: the start-up check reads nothing
    // (the runtime slice here reads only when the triggers ask), and the
    // confirmation read no second baseline.
    expect(getSession).toHaveBeenCalledTimes(1);
    expect(executeActionsChain).not.toHaveBeenCalled();
  });

  it('a burst of 401s without a refresh reads the baseline session once and sends one chain', async () => {
    // The no-refresh branch runs the same newer-session comparison the
    // refresh branch runs, so it owes the same once-per-burst guard: without
    // it, every 401 of a burst suspends on its own baseline read before the
    // chain send sets the once-guard, and the burst pays two reads per
    // request (one baseline, one comparison) instead of two per burst.
    const { wireSignInTriggers } = await import('./signInTriggers');
    const provider = stubProvider(); // no refresh
    const checkAuth = vi.fn().mockResolvedValue({ authenticated: true });
    const getSession = vi.fn().mockResolvedValue({ kind: 'bearer', token: 'the-401-one' });
    const { app, executeActionsChain } = stubApp({ checkAuth, getSession });

    wireSignInTriggers(app, provider);
    settleBootstrapAndSlot();
    await vi.waitFor(() => expect(checkAuth).toHaveBeenCalledTimes(1));
    expect(executeActionsChain).not.toHaveBeenCalled();

    // Three 401s land in the same tick: the first starts the one open, the
    // other two are dropped before anything is read.
    provider.onTransportError?.(transportError(401));
    provider.onTransportError?.(transportError(401));
    provider.onTransportError?.(transportError(401));
    await vi.waitFor(() => expect(executeActionsChain).toHaveBeenCalledTimes(1));
    await flush();

    // One chain, and one baseline read for the whole burst: the baseline the
    // first 401 read at hook time, and the send's final read right before the
    // chain went out. The rejected credentials are the snapshot the first 401
    // took, so the send reads nothing beyond that.
    expect(getSession).toHaveBeenCalledTimes(2);
    expect(executeActionsChain).toHaveBeenCalledTimes(1);
    const chain = executeActionsChain.mock.calls[0][0] as {
      action: { payload: { subject: string } };
    };
    expect(chain.action.payload.subject).toBe(SIGN_IN_EXTENSION_ID);
  });

  it('a 401 session check that rejects warns like the start-up path and sends nothing', async () => {
    // A broken session check on a 401 says nothing about the session, so no
    // chain goes out - and the silence is not a silent one: the warning the
    // start-up path gives, the 401 path gives too.
    const { wireSignInTriggers } = await import('./signInTriggers');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const provider: AuthProvider = {
      ...stubProvider(),
      refresh: vi.fn().mockResolvedValue({ kind: 'bearer', token: 'renewed' }),
    };
    const checkAuth = vi
      .fn()
      .mockResolvedValueOnce({ authenticated: true }) // the start-up read
      .mockRejectedValue(new Error('accounts service down'));
    const { app, executeActionsChain } = stubApp({ checkAuth });

    wireSignInTriggers(app, provider);
    settleBootstrapAndSlot();
    await vi.waitFor(() => expect(checkAuth).toHaveBeenCalledTimes(1));

    provider.onTransportError?.(transportError(401));
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));

    expect(warn.mock.calls[0]?.[0]).toBe(
      '[signInTriggers] the 401 session check did not answer; no sign-in chain sent',
    );
    expect(executeActionsChain).not.toHaveBeenCalled();
  });

  it('a 401 after the chain was sent starts no session check', async () => {
    // Once the guard is up the chain cannot go out again, so a further 401
    // has nothing to confirm: on a host with a refresh, the session check is
    // skipped with the send.
    const { wireSignInTriggers } = await import('./signInTriggers');
    const provider: AuthProvider = {
      ...stubProvider(),
      refresh: vi.fn().mockResolvedValue({ kind: 'bearer', token: 'renewed' }),
    };
    const checkAuth = vi.fn().mockResolvedValue({ authenticated: false });
    const { app, executeActionsChain } = stubApp({ checkAuth });

    wireSignInTriggers(app, provider);
    settleBootstrapAndSlot();
    // The start-up check finds no session and sends the one chain of the page.
    await vi.waitFor(() => expect(executeActionsChain).toHaveBeenCalledTimes(1));
    expect(checkAuth).toHaveBeenCalledTimes(1);

    provider.onTransportError?.(transportError(401));
    await flush();

    expect(checkAuth).toHaveBeenCalledTimes(1);
    expect(executeActionsChain).toHaveBeenCalledTimes(1);
  });

  it('a 401 on a host without a refresh goes out without a confirmation', async () => {
    // Without a refresh nothing can recover the request, so the 401 is the
    // answer and the chain is not held back for a check the session tracker
    // would only echo.
    const { wireSignInTriggers } = await import('./signInTriggers');
    const provider = stubProvider(); // no refresh
    const checkAuth = vi.fn().mockResolvedValue({ authenticated: true });
    const { app, executeActionsChain } = stubApp({ checkAuth });

    wireSignInTriggers(app, provider);
    settleBootstrapAndSlot();
    await vi.waitFor(() => expect(checkAuth).toHaveBeenCalledTimes(1));
    expect(executeActionsChain).not.toHaveBeenCalled();

    provider.onTransportError?.(transportError(401));
    await vi.waitFor(() => expect(executeActionsChain).toHaveBeenCalledTimes(1));
    const chain = executeActionsChain.mock.calls[0][0] as {
      action: { payload: { subject: string } };
    };
    expect(chain.action.payload.subject).toBe(SIGN_IN_EXTENSION_ID);

    // The 401 went straight out: no second session check.
    expect(checkAuth).toHaveBeenCalledTimes(1);
  });

  it('the startup chain and a later 401 share the one chain a page gets', async () => {
    const { wireSignInTriggers } = await import('./signInTriggers');
    const provider = stubProvider();
    const { app, executeActionsChain } = stubApp({ checkAuth: vi.fn().mockResolvedValue({ authenticated: false }) });

    wireSignInTriggers(app, provider);
    settleBootstrapAndSlot();
    await vi.waitFor(() => expect(executeActionsChain).toHaveBeenCalledTimes(1));

    provider.onTransportError?.(transportError(401));
    await flush();

    expect(executeActionsChain).toHaveBeenCalledTimes(1);
  });

  it('a provider that reports transport errors itself is wrapped, not replaced', async () => {
    const { wireSignInTriggers } = await import('./signInTriggers');
    const ownReports: Array<number | undefined> = [];
    const provider: AuthProvider = {
      ...stubProvider(),
      onTransportError: (event) => {
        ownReports.push(event.status);
      },
    };
    const { app, executeActionsChain } = stubApp(undefined);

    wireSignInTriggers(app, provider);
    provider.onTransportError?.(transportError(401));

    expect(ownReports).toEqual([401]);
    settleBootstrapAndSlot();
    await vi.waitFor(() => expect(executeActionsChain).toHaveBeenCalledTimes(1));
  });

  it('a refresh that resolved no session opens sign-in even when checkAuth still sees one', async () => {
    // The provider the review ran against keeps the old token when the token
    // endpoint does not answer: `refresh()` resolves null (the runtime reports
    // that as signed out) while `checkAuth()` still answers from the token it
    // kept, so asking the provider after the flight holds the modal back for
    // a session that is gone. The flight's own result decides instead, and
    // `checkAuth()` is not asked at all when the flight answered.
    const { wireSignInTriggers } = await import('./signInTriggers');
    const provider: AuthProvider = {
      ...stubProvider(),
      checkAuth: vi.fn().mockResolvedValue({ authenticated: true }),
      refresh: vi.fn().mockResolvedValue(null),
    };
    const { app, executeActionsChain } = stubApp({ checkAuth: provider.checkAuth });

    wireSignInTriggers(app, provider);
    settleBootstrapAndSlot();
    // The start-up read sees the stale session and sends nothing.
    await vi.waitFor(() => expect(provider.checkAuth).toHaveBeenCalledTimes(1));
    expect(executeActionsChain).not.toHaveBeenCalled();

    // The 401 and the transport's flight for it land in the same tick, before
    // the confirmation's first tick. The flight resolves to no session.
    provider.onTransportError?.(transportError(401));
    void provider.refresh?.();
    await vi.waitFor(() => expect(executeActionsChain).toHaveBeenCalledTimes(1));

    // The flight's null result sent the chain; the provider was never asked
    // again, so its stale answer could not hold the modal back.
    expect(provider.checkAuth).toHaveBeenCalledTimes(1);
    const chain = executeActionsChain.mock.calls[0][0] as {
      action: { payload: { subject: string } };
    };
    expect(chain.action.payload.subject).toBe(SIGN_IN_EXTENSION_ID);
  });

  it('a session with other credentials since the 401 keeps the modal closed', async () => {
    // The window between the 401 and the chain send is real: a sign-in can
    // finish there (a callback the provider completed, a login from another
    // surface the runtime heard of). Before it opens the dialog the trigger
    // reads the runtime's session again and compares credentials with the
    // session the 401 was against: a session with other credentials is a
    // newer one, and the modal must not cover it.
    const { wireSignInTriggers } = await import('./signInTriggers');
    const provider: AuthProvider = {
      ...stubProvider(),
      checkAuth: vi
        .fn()
        .mockResolvedValueOnce({ authenticated: true }) // the start-up read
        .mockResolvedValue({ authenticated: false }),
      refresh: vi.fn(async () => {
        await flush();
        // The flight gives out while a newer session starts behind it.
        return null;
      }),
    };
    // The first read the trigger makes is the 401's own baseline; the second
    // one, right before the dialog would open, finds the newer session.
    const getSession = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'bearer', token: 'the-401-one' })
      .mockResolvedValue({ kind: 'bearer', token: 'newer-session' });
    const { app, executeActionsChain } = stubApp({ checkAuth: provider.checkAuth, getSession });

    wireSignInTriggers(app, provider);
    settleBootstrapAndSlot();
    await vi.waitFor(() => expect(provider.checkAuth).toHaveBeenCalledTimes(1));

    provider.onTransportError?.(transportError(401));
    void provider.refresh?.();
    await flush();
    await flush();

    expect(executeActionsChain).not.toHaveBeenCalled();
  });

  it('a login that finishes while the modal slot is still pending is not set aside', async () => {
    // The comparison of credentials used to run before the readiness waits:
    // with the modal slot still pending, a sign-in could finish in between,
    // and the send then read the NEW session and set its credentials aside as
    // the rejected ones - the modal mounted over a session whose `sign_in`
    // could never answer for it (its login event had already fired). The
    // comparison runs after the waits now, right before the chain is sent,
    // and what the chain sets aside is the session the 401 was against, taken
    // at hook time.
    const { wireSignInTriggers } = await import('./signInTriggers');
    // The same module instance the trigger uses, so the rejected session it
    // remembers is read here (the once-guard makes every case import afresh).
    const { isRejectedSession } = await import('./signIn');
    // The slot attaches on a later React commit; a sign-in that finishes
    // behind the pending slot leaves other credentials in the runtime.
    const slotAttached = { current: false };
    const getSession = vi.fn(async () => ({
      kind: 'bearer' as const,
      token: slotAttached.current ? 'newer-session' : 'the-401-one',
    }));
    const provider: AuthProvider = {
      ...stubProvider(),
      checkAuth: vi.fn().mockResolvedValueOnce({ authenticated: true }), // the start-up read
      refresh: vi.fn(async () => {
        await flush();
        return null; // the flight resolves no session: the chain send starts
      }),
    };
    const { app, executeActionsChain } = stubApp({ checkAuth: provider.checkAuth, getSession });

    wireSignInTriggers(app, provider);
    // The bootstrap has settled, the modal slot has not: the send waits.
    bootstrap.current.settle();

    provider.onTransportError?.(transportError(401));
    void provider.refresh?.();
    await flush();
    await flush();

    // The sign-in finishes while the slot is still pending; then it attaches.
    slotAttached.current = true;
    modalSlot.current.settle();
    await flush();
    await flush();

    // The newer session turned the comparison away: no modal opens over it,
    // the chain was not sent, and neither its credentials nor the 401's own
    // were set aside.
    expect(executeActionsChain).not.toHaveBeenCalled();
    expect(isRejectedSession({ kind: 'bearer', token: 'newer-session' })).toBe(false);
    expect(isRejectedSession({ kind: 'bearer', token: 'the-401-one' })).toBe(false);
  });

  it('a 401 that arrives while the start-up send waits is the session the chain judges', async () => {
    // A trigger that arrives while another send waits for the slot sends
    // nothing of its own, and it is not dropped either. The start-up send
    // (snapshot: no session) waits; a sign-in finishes; the 401 against that
    // new session comes in and its refresh resolves null - its send met the
    // latch and returned, and when the start-up send then saw the new session
    // beside its own null snapshot and backed out, the only rejection of the
    // session the page now held was lost: no modal opened until some later
    // request happened to fail. The latest confirmed trigger wins instead:
    // its snapshot is assigned while the send waits, the send reads it when
    // it compares, right before the chain, and the chain goes out with the
    // new session's credentials set aside.
    const { wireSignInTriggers } = await import('./signInTriggers');
    const { isRejectedSession } = await import('./signIn');
    const provider: AuthProvider = {
      ...stubProvider(),
      checkAuth: vi.fn().mockResolvedValue({ authenticated: false }), // the start-up check
      refresh: vi.fn().mockResolvedValue(null), // the flight resolves no session
    };
    // The runtime holds no session when the start-up check reads it; the
    // sign-in that finishes while the send waits leaves other credentials.
    const getSession = vi
      .fn()
      .mockResolvedValueOnce(null) // the start-up send's snapshot
      .mockResolvedValue({ kind: 'bearer', token: 'newer-session' });
    const { app, executeActionsChain } = stubApp({ checkAuth: provider.checkAuth, getSession });

    wireSignInTriggers(app, provider);
    // The bootstrap has settled, the modal slot has not: the start-up send
    // waits for the slot.
    bootstrap.current.settle();
    await flush();

    // The sign-in has finished by now, and the 401 against its session
    // arrives while the send still waits: its snapshot reaches the send.
    provider.onTransportError?.(transportError(401));
    void provider.refresh?.();
    await flush();
    await flush();
    expect(executeActionsChain).not.toHaveBeenCalled();

    // The slot attaches: the waiting send compares the newest trigger's
    // snapshot with the session the runtime holds, they are the same rejected
    // session, and the chain goes out for it.
    modalSlot.current.settle();
    await vi.waitFor(() => expect(executeActionsChain).toHaveBeenCalledTimes(1));

    const chain = executeActionsChain.mock.calls[0][0] as {
      action: { payload: { subject: string } };
    };
    expect(chain.action.payload.subject).toBe(SIGN_IN_EXTENSION_ID);
    // The credentials set aside are the new session's, the one the 401 was
    // against - not nothing, and not a read taken at chain time.
    expect(isRejectedSession({ kind: 'bearer', token: 'newer-session' })).toBe(true);
  });

  it('a 401 whose snapshot read rejects cannot jam the latch', async () => {
    // The read the hook takes can fail so hard the read itself rejects (the
    // runtime's `getSession` throwing, not resolving nothing).
    // `readSessionCredentials` is total: the failure resolves `undefined`,
    // which claims nothing, so neither the hook's snapshot nor the send's own
    // read can reject with the latch up - the dialog still opens, and the
    // session the send's final read returns is the one set aside, so the
    // stale session the runtime still hands out cannot satisfy `sign_in`.
    const { wireSignInTriggers } = await import('./signInTriggers');
    const { isRejectedSession } = await import('./signIn');
    const provider = stubProvider(); // no refresh: the 401 opens without a check
    // The start-up check says signed in (its one call sends nothing); the
    // 401's own read at hook time fails, and the final read finds the
    // runtime still holding the stale session.
    let reads = 0;
    const getSession = vi.fn(() => {
      reads += 1;
      // A synchronous throw inside the read is the hard case: `getSession()`
      // throws before any `catch` could attach, which used to reject the
      // snapshot promise instead of resolving `undefined`.
      if (reads === 1) throw new Error('session read failed');
      return Promise.resolve({ kind: 'bearer' as const, token: 'the-stale-one' });
    });
    const checkAuth = vi.fn().mockResolvedValue({ authenticated: true }); // the start-up check
    const { app, executeActionsChain } = stubApp({ checkAuth, getSession });

    wireSignInTriggers(app, provider);
    settleBootstrapAndSlot();
    await vi.waitFor(() => expect(checkAuth).toHaveBeenCalledTimes(1));
    expect(executeActionsChain).not.toHaveBeenCalled();
    // The signed-in start-up answer reads no session: the first read is the
    // 401's own.
    expect(getSession).not.toHaveBeenCalled();

    provider.onTransportError?.(transportError(401));
    await vi.waitFor(() => expect(executeActionsChain).toHaveBeenCalledTimes(1));

    const chain = executeActionsChain.mock.calls[0][0] as {
      action: { payload: { subject: string } };
    };
    expect(chain.action.payload.subject).toBe(SIGN_IN_EXTENSION_ID);
    // The rejected snapshot was normalized to `undefined`, which claims
    // nothing: no comparison runs against it, and the session the final read
    // returned is the one set aside - the stale session the runtime still
    // hands out is not left for `sign_in` to take.
    expect(isRejectedSession({ kind: 'bearer', token: 'the-stale-one' })).toBe(true);
  });

  it('a final read that throws sends the chain anyway and leaves nothing unhandled', async () => {
    // The send's own read, right before the chain, can fail as hard as the
    // hook-time one can (a synchronous `getSession` throw), and a snapshot
    // read can fail on a path that never reaches `confirmSignIn` - the
    // keep-closed paths, where no catch used to be attached. The helper is
    // total, so a failed read resolves `undefined` wherever it happens: the
    // keep-closed 401 stays closed with no unhandled rejection behind it, and
    // the send whose final read failed still completes - the failed read
    // claims nothing, the comparison is skipped, the chain goes out, and the
    // latch is released with the chain sent instead of jammed by a rejection
    // behind the fire-and-forget send.
    const { wireSignInTriggers } = await import('./signInTriggers');
    const { isRejectedSession } = await import('./signIn');
    // A refresh exists but none is started, so both 401s are decided by
    // `checkAuth` and both take a hook-time snapshot.
    const provider: AuthProvider = {
      ...stubProvider(),
      refresh: vi.fn().mockResolvedValue({ kind: 'bearer', token: 'renewed' }),
    };
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    let reads = 0;
    const getSession = vi.fn(() => {
      reads += 1;
      // Read 1: the keep-closed 401's hook-time snapshot, thrown hard.
      // Read 2: the opening 401's hook-time snapshot, a good read.
      // Read 3: that send's own final read, thrown hard as well.
      if (reads === 1 || reads === 3) throw new Error('session read failed');
      return Promise.resolve({ kind: 'bearer' as const, token: 'the-401-one' });
    });
    const checkAuth = vi
      .fn()
      .mockResolvedValueOnce({ authenticated: true }) // the start-up read
      .mockResolvedValueOnce({ authenticated: true }) // the keep-closed 401
      .mockResolvedValue({ authenticated: false }); // the 401 that opens
    const { app, executeActionsChain } = stubApp({ checkAuth, getSession });

    process.on('unhandledRejection', onUnhandled);
    try {
      wireSignInTriggers(app, provider);
      settleBootstrapAndSlot();
      await vi.waitFor(() => expect(checkAuth).toHaveBeenCalledTimes(1));
      expect(getSession).not.toHaveBeenCalled();

      // The keep-closed 401: its snapshot read fails, the check says signed
      // in, and nothing goes out - and the failed read leaves no unhandled
      // rejection behind on this path that never hands a snapshot over.
      provider.onTransportError?.(transportError(401));
      await vi.waitFor(() => expect(checkAuth).toHaveBeenCalledTimes(2));
      await flush();
      expect(executeActionsChain).not.toHaveBeenCalled();
      expect(unhandled).toEqual([]);

      // The opening 401: its hook-time snapshot reads fine, and the send's
      // final read is the one that throws. The failed read claims nothing, so
      // the chain goes out and the snapshot the hook took is the session set
      // aside; the send completed, so nothing rejected with the latch up.
      provider.onTransportError?.(transportError(401));
      await vi.waitFor(() => expect(executeActionsChain).toHaveBeenCalledTimes(1));
      await flush();
      expect(unhandled).toEqual([]);
      expect(isRejectedSession({ kind: 'bearer', token: 'the-401-one' })).toBe(true);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('a 401 confirmed while an earlier snapshot is still resolving sends the chain for the newer one', async () => {
    // The send used to await the snapshot promise it saw first: while that
    // read was still out, a second 401 could confirm and replace the
    // snapshot, and the send still judged against the stale one - B's
    // rejection read as a newer session and nothing went out. The send reads
    // the plain value instead, so the latest settled assignment wins: the
    // chain goes out for B, and B's credentials are the ones set aside.
    const { wireSignInTriggers } = await import('./signInTriggers');
    const { isRejectedSession } = await import('./signIn');
    const provider = stubProvider(); // no refresh: each 401 confirms at once
    // A's snapshot read is held out until after B's has settled and the chain
    // has gone, which is what makes the superseded-promise window real.
    let resolveA!: (session: { kind: 'bearer'; token: string }) => void;
    const snapshotA = new Promise<{ kind: 'bearer'; token: string }>((resolve) => {
      resolveA = resolve;
    });
    const sessionB = { kind: 'bearer' as const, token: 'session-b' };
    const getSession = vi
      .fn()
      .mockReturnValueOnce(snapshotA) // A's hook-time snapshot: still out
      .mockResolvedValue(sessionB); // B's snapshot, and the send's final read
    // The start-up check says signed in (its one call sends nothing); both
    // 401s of this page confirm without a check.
    const checkAuth = vi.fn().mockResolvedValue({ authenticated: true });
    const { app, executeActionsChain } = stubApp({ checkAuth, getSession });

    wireSignInTriggers(app, provider);
    settleBootstrapAndSlot();
    await vi.waitFor(() => expect(checkAuth).toHaveBeenCalledTimes(1));
    expect(getSession).not.toHaveBeenCalled();

    // A's 401 confirms; its snapshot read is still out.
    provider.onTransportError?.(transportError(401));
    await flush();
    expect(executeActionsChain).not.toHaveBeenCalled();

    // B's 401 confirms while A's snapshot is still resolving: B's own read
    // settles at once, lands in the one snapshot variable, and the send it
    // starts reads that latest settled value when it compares - the session
    // the runtime holds is the same rejected one, so the chain goes out with
    // B's credentials set aside.
    provider.onTransportError?.(transportError(401));
    await vi.waitFor(() => expect(executeActionsChain).toHaveBeenCalledTimes(1));
    expect(isRejectedSession(sessionB)).toBe(true);

    // A's snapshot settles late: its own send meets the guard that is already
    // up and sends nothing, and nothing of A was set aside.
    resolveA({ kind: 'bearer', token: 'session-a' });
    await flush();
    expect(executeActionsChain).toHaveBeenCalledTimes(1);
    expect(isRejectedSession({ kind: 'bearer', token: 'session-a' })).toBe(false);
  });

  it('a flight that rejects and a signed-out answer still send the chain', async () => {
    // The main case the `checkAuth()` fallback exists for: the flight rejects
    // and leaves no result to read, and the check that follows says signed
    // out. Nothing here announces a session start, so the guard has nothing
    // to hold the modal back with - and the credentials it compares are the
    // same on both reads, so the dialog opens.
    const { wireSignInTriggers } = await import('./signInTriggers');
    const provider: AuthProvider = {
      ...stubProvider(),
      checkAuth: vi
        .fn()
        .mockResolvedValueOnce({ authenticated: true }) // the start-up read
        .mockResolvedValue({ authenticated: false }),
      refresh: vi.fn(async () => {
        await flush();
        throw new Error('token endpoint down');
      }),
    };
    // The provider keeps the old token: the runtime holds the session the
    // 401 was against, whatever the flight did with it.
    const getSession = vi.fn().mockResolvedValue({ kind: 'bearer', token: 'the-rejected-one' });
    const { app, executeActionsChain } = stubApp({ checkAuth: provider.checkAuth, getSession });

    wireSignInTriggers(app, provider);
    settleBootstrapAndSlot();
    await vi.waitFor(() => expect(provider.checkAuth).toHaveBeenCalledTimes(1));

    provider.onTransportError?.(transportError(401));
    void provider.refresh?.();
    await vi.waitFor(() => expect(executeActionsChain).toHaveBeenCalledTimes(1));

    const chain = executeActionsChain.mock.calls[0][0] as {
      action: { payload: { subject: string } };
    };
    expect(chain.action.payload.subject).toBe(SIGN_IN_EXTENSION_ID);
  });

  it('a login announcement for an unknown identity does not hold the modal back', async () => {
    // `auth/loggedIn` does not only mean a session started: the session
    // tracker emits it for an unknown identity too, and `refreshFailed()`
    // clears for one on every refresh that rejects while signed in. On the
    // rejected flight the announcement is already in before `checkAuth()`
    // runs, so the guard may not read it as a newer session: the runtime
    // still holds the session the 401 was against, and the signed-out answer
    // sends the chain.
    const react = await import('@gears-frontx/react');
    const { wireSignInTriggers } = await import('./signInTriggers');
    const provider: AuthProvider = {
      ...stubProvider(),
      checkAuth: vi
        .fn()
        .mockResolvedValueOnce({ authenticated: true }) // the start-up read
        .mockResolvedValue({ authenticated: false }),
      refresh: vi.fn(async () => {
        await flush();
        // What `refreshFailed()` does on a rejected flight while signed in:
        // the tracker clears for an unknown identity and announces a start.
        react.eventBus.emit(react.AuthEvents.LoggedIn, {});
        throw new Error('token endpoint down');
      }),
    };
    const getSession = vi.fn().mockResolvedValue({ kind: 'bearer', token: 'the-rejected-one' });
    const { app, executeActionsChain } = stubApp({ checkAuth: provider.checkAuth, getSession });

    wireSignInTriggers(app, provider);
    settleBootstrapAndSlot();
    await vi.waitFor(() => expect(provider.checkAuth).toHaveBeenCalledTimes(1));

    provider.onTransportError?.(transportError(401));
    void provider.refresh?.();
    await vi.waitFor(() => expect(executeActionsChain).toHaveBeenCalledTimes(1));

    const chain = executeActionsChain.mock.calls[0][0] as {
      action: { payload: { subject: string } };
    };
    expect(chain.action.payload.subject).toBe(SIGN_IN_EXTENSION_ID);
  });

  it('any 401 after a flight that resolved a session is not signed out', async () => {
    // What the transport really does for one request (`auth.ts`, `onError`):
    // the hook fires before the retry decisions, the refresh flight for the
    // 401 runs, and the request is retried with what the flight resolved.
    // When the retry meets 401 again, the transport exits (`retryCount` is
    // not 0): the hook fires once more for the same request, with no flight
    // behind it and no second refresh. The earlier flight does not answer
    // the retry's 401 - `checkAuth()` is asked for it, and the provider is
    // the authority: one that holds a session (a step-up challenge, RFC
    // 9470) answers authenticated and no chain goes out, and a signed-out
    // answer sends the chain.
    const { wireSignInTriggers } = await import('./signInTriggers');
    const refresh = vi.fn().mockResolvedValue({ kind: 'bearer', token: 'same-user' });
    const provider: AuthProvider = {
      ...stubProvider(),
      checkAuth: vi
        .fn()
        .mockResolvedValueOnce({ authenticated: true }) // the start-up read
        .mockResolvedValueOnce({ authenticated: true }) // the retry's 401: a step-up challenge
        .mockResolvedValue({ authenticated: false }), // a later 401: signed out
      refresh,
    };
    const { app, executeActionsChain } = stubApp({ checkAuth: provider.checkAuth });

    wireSignInTriggers(app, provider);
    settleBootstrapAndSlot();
    await vi.waitFor(() => expect(provider.checkAuth).toHaveBeenCalledTimes(1));

    // The first 401: the transport starts one refresh flight for it, the
    // flight resolves a session, and the retried request goes out with what
    // the flight resolved. The flight's own result is the answer, so the
    // runtime is not asked.
    provider.onTransportError?.(transportError(401));
    void provider.refresh?.();
    await flush();
    await flush();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(provider.checkAuth).toHaveBeenCalledTimes(1);
    expect(executeActionsChain).not.toHaveBeenCalled();

    // The retry meets 401 again: the transport refreshes nothing for a retry
    // (`retryCount` is 1), so this 401 arrives with no flight behind it, and
    // `checkAuth()` is asked for it. The step-up answer is authenticated, so
    // no chain goes out and no second refresh runs either.
    provider.onTransportError?.(transportError(401));
    await vi.waitFor(() => expect(provider.checkAuth).toHaveBeenCalledTimes(2));

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(executeActionsChain).not.toHaveBeenCalled();

    // A later 401 that no flight ran for is still the provider's to decide,
    // and its signed-out answer sends the chain: the provider is the
    // authority once no flight answers.
    provider.onTransportError?.(transportError(401));
    await vi.waitFor(() => expect(executeActionsChain).toHaveBeenCalledTimes(1));
    expect(provider.checkAuth).toHaveBeenCalledTimes(3);

    const chain = executeActionsChain.mock.calls[0][0] as {
      action: { payload: { subject: string } };
    };
    expect(chain.action.payload.subject).toBe(SIGN_IN_EXTENSION_ID);
  });

  it('the 401 chain sets the rejected session aside without a provider logout', async () => {
    // The session the chain was sent against is remembered, not ended: a
    // redirect provider's `logout()` navigates to the sign-in service's
    // end-session endpoint, and the page would leave before the modal mounts.
    // `sign_in` waits for a session that is not the rejected one on its own
    // (`isRejectedSession`).
    const { wireSignInTriggers } = await import('./signInTriggers');
    const provider = stubProvider();
    const getSession = vi.fn().mockResolvedValue({ kind: 'bearer', token: 'revoked' });
    const { app, executeActionsChain, logout } = stubApp({
      checkAuth: vi.fn().mockResolvedValue({ authenticated: false }),
      getSession,
    });

    wireSignInTriggers(app, provider);
    settleBootstrapAndSlot();
    await vi.waitFor(() => expect(executeActionsChain).toHaveBeenCalledTimes(1));

    // The chain went out, the rejected credentials were read to be remembered,
    // and no provider logout ran on the way.
    expect(getSession).toHaveBeenCalled();
    expect(logout).not.toHaveBeenCalled();
  });

  it('a 401 no flight ran for still asks checkAuth to decide', async () => {
    // The transport did not refresh for this 401 (its budget is spent, or the
    // 401 rode a retried request), so there is no flight result to read and
    // the provider's own check decides, as it did before the flight result
    // was kept: a signed-out answer sends the chain, a signed-in one does not.
    const { wireSignInTriggers } = await import('./signInTriggers');
    const provider = stubProvider(); // a refresh exists, but none is started
    provider.refresh = vi.fn().mockResolvedValue({ kind: 'bearer', token: 'renewed' });
    const checkAuth = vi.fn().mockResolvedValue({ authenticated: true });
    const { app, executeActionsChain } = stubApp({ checkAuth });

    wireSignInTriggers(app, provider);
    settleBootstrapAndSlot();
    await vi.waitFor(() => expect(checkAuth).toHaveBeenCalledTimes(1));

    provider.onTransportError?.(transportError(401));
    await flush();

    expect(checkAuth).toHaveBeenCalledTimes(2);
    expect(executeActionsChain).not.toHaveBeenCalled();
  });
});
