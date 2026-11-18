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
 * `getSession` with `logout` to end a rejected session before the chain goes
 * out (no session here, so no logout), and `refresh` when a case drives a
 * flight through the shared runtime. The rest of the runtime is the
 * framework plugin's tested behaviour and stays out of these doubles.
 */
type AuthRuntimeSlice = {
  checkAuth: () => Promise<{ authenticated: boolean }>;
  refresh?: () => Promise<unknown>;
};

function stubApp(auth?: AuthRuntimeSlice): {
  app: FrontXApp;
  executeActionsChain: ReturnType<typeof vi.fn>;
} {
  const executeActionsChain = vi.fn();
  const runtime = auth && { getSession: async () => null, logout: vi.fn(), ...auth };
  const app = { mfeRegistry: { executeActionsChain }, auth: runtime } as unknown as FrontXApp;
  return { app, executeActionsChain };
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
    // waits for the flight, and the session it left answers signed in.
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
    // the confirmation's first tick; the read follows the settled flight.
    provider.onTransportError?.(transportError(401));
    void provider.refresh?.();
    await vi.waitFor(() => expect(checkAuth).toHaveBeenCalledTimes(2));
    await flush();

    expect(flightSettled).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);
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
    await vi.waitFor(() => expect(checkAuth).toHaveBeenCalledTimes(2));
    await flush();

    expect(flightSettled).toBe(true);
    expect(runtimeRefresh).toHaveBeenCalledTimes(1);
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
});
