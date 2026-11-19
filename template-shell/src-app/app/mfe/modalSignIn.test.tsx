/**
 * The sign-in chain end to end through the real runtime: the framework's
 * `microfrontends()` plugin builds the registry with the router of
 * `@gears-frontx/routing`, the container registers the popup domain the shell
 * presents as a modal extension domain together with the extensions of the
 * manifest aggregate - whose one modal extension is the sign-in one, under the
 * id `app/auth/signIn.ts` names - and the dialog layer presents what the
 * domain mounts. Nothing routing or mounting related is stubbed. Only the
 * loading of a remote is: the handler is the real `MfeHandlerMF` with `load`
 * answering an inline lifecycle instead of fetching a Module Federation
 * bundle, and the reload seam is replaced, since jsdom implements no
 * navigation and the case wants to observe that the chain reached it.
 *
 * The host drives the domain with the real chain `buildSignInChain()` builds,
 * and the sign-in itself is a login on the shared auth runtime - the call the
 * sign-in extension's own form would make. No case needs a page-load address,
 * and they share one file; the module reset per case gives each one its own
 * modal state (modalDomain.test.tsx).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import { SIGN_IN_EXTENSION_ID } from '@/app/auth/signIn';
import { claimAutomaticReload, clearAutomaticReload } from './automaticReload';
import {
  POPUP_DOMAIN,
  SCREEN_DOMAIN,
  buildApp,
  makeSignInAggregate,
  renderContainer,
  stubAuthProvider,
  teardownModalSuite,
} from './__test-utils__/modalHarness';

const reloadPage = vi.hoisted(() => vi.fn());
vi.mock('./pageReload', () => ({ reloadPage }));

/**
 * A second modal extension in the same aggregate, for the case that displaces
 * the sign-in one: the zero-or-one strategy mounts one modal at a time, and
 * this one is what takes the sign-in modal's place. It rides along in every
 * case's aggregate and stays dormant there - nothing mounts it outside its
 * own case.
 */
const SECOND_MODAL_ENTRY =
  'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.demo.mfe.second.v1';
const SECOND_MODAL_EXTENSION_ID =
  'gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.popup.v1~frontx.demo.modal.second.v1';

/**
 * The sign-in aggregate the harness builds, plus the second modal: its entry
 * and extension clone the sign-in ones, so this file carries only what differs
 * (the ids, the route and the presentation) and the harness keeps the shape.
 */
function makeSignInAggregateWithSecondModal() {
  const [aggregate] = makeSignInAggregate(SIGN_IN_EXTENSION_ID);
  const [signInEntry] = aggregate.entries;
  const [signInExtension] = aggregate.extensions;
  return [
    {
      ...aggregate,
      entries: [
        ...aggregate.entries,
        { ...signInEntry, id: SECOND_MODAL_ENTRY, exposedModule: './second' },
      ],
      extensions: [
        ...aggregate.extensions,
        {
          ...signInExtension,
          id: SECOND_MODAL_EXTENSION_ID,
          entry: SECOND_MODAL_ENTRY,
          route: '/second',
          presentation: { label: 'Second', size: 'medium', cancelable: true },
        },
      ],
    },
  ];
}

/**
 * The auth provider the 401 cases drive: the session it holds at start is
 * signed in, and once `rejection.serverRejected` is set the same check says
 * signed out. The provider is the authority the trigger asks after a 401, and
 * there is no refresh to wait out unless the case adds one.
 */
function stubRevocableProvider() {
  const stub = stubAuthProvider();
  const rejection: { serverRejected: boolean } = { serverRejected: false };
  stub.provider.checkAuth = async () =>
    stub.state.session && !rejection.serverRejected
      ? { authenticated: true, session: stub.state.session }
      : { authenticated: false };
  return { ...stub, rejection };
}

describe('the sign-in chain through the real runtime', () => {
  let registry: Awaited<ReturnType<typeof buildApp>>['registry'] | undefined;

  beforeEach(() => {
    registry = undefined;
    vi.resetModules();
    reloadPage.mockReset();
    // The reload guard's stamp survives the module reset in two places: the
    // sessionStorage item and the page's own in-memory copy. Dropping it
    // through the guard's reset clears both, so one case's reload does not
    // bound the next case's.
    clearAutomaticReload();
    sessionStorage.clear();
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(makeSignInAggregateWithSecondModal()))),
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    await teardownModalSuite(registry);
  });

  it('opens the sign-in modal, resolves sign_in once the shared runtime signs in, and reloads the page', async () => {
    const { provider } = stubAuthProvider();
    const built = await buildApp({ provider });
    registry = built.registry;
    const { modalState } = await import('./modalDomain');
    const { buildSignInChain } = await import('@/app/auth/signIn');
    await renderContainer(built.react, built.app);
    await act(async () => {});

    act(() => {
      registry?.executeActionsChain(buildSignInChain());
    });
    await screen.findByRole('dialog', { name: 'Sign in' });
    expect(modalState.getSnapshot()).toBe(SIGN_IN_EXTENSION_ID);

    // The sign-in extension signs in through the shared auth runtime: the
    // runtime wrapper is the call its own form would make, and the plugin
    // announces it with the auth/loggedIn event the handler waits on.
    const runtime = built.app.auth;
    expect(runtime?.login).toBeDefined();
    await act(async () => {
      await runtime?.login?.({ type: 'password', payload: { username: 'dev', password: 'secret' } });
    });

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(modalState.getSnapshot()).toBeUndefined();
    // sign_in resolved, so the chain went on to refresh_page.
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });

  it('resolves sign_in at once when a session already exists, and still reloads the page', async () => {
    const { provider, state } = stubAuthProvider();
    state.session = { kind: 'bearer', token: 'already-in' };
    const built = await buildApp({ provider });
    registry = built.registry;
    const { modalState } = await import('./modalDomain');
    const { buildSignInChain } = await import('@/app/auth/signIn');
    await renderContainer(built.react, built.app);
    await act(async () => {});

    act(() => {
      registry?.executeActionsChain(buildSignInChain());
    });

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(modalState.getSnapshot()).toBeUndefined();
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });

  it('a provider that keeps handing out a revoked token holds the modal until a new sign-in, without a reload loop', async () => {
    // No refresh, and a logout that leaves the token in place: the worst case
    // of a provider that keeps answering getSession() with the session the
    // server already rejected. It even rebuilds the session with its
    // properties in another order, so only the credentials say it is the same.
    const { provider, state, rejection } = stubRevocableProvider();
    state.session = { kind: 'bearer', token: 'live' };
    const logout = vi.fn(async () => {
      state.session = { token: 'revoked', kind: 'bearer' };
      return { type: 'none' as const };
    });
    provider.logout = logout;
    const built = await buildApp({ provider });
    registry = built.registry;
    const { wireSignInTriggers } = await import('@/app/auth/signInTriggers');
    const { modalState } = await import('./modalDomain');
    wireSignInTriggers(built.app, provider);
    await renderContainer(built.react, built.app);
    await act(async () => {});

    // The server revokes the token, and the provider keeps handing the
    // rejected one out: the request fails with 401 and the chain goes out
    // against the rejected session.
    state.session = { kind: 'bearer', token: 'revoked' };
    rejection.serverRejected = true;
    act(() => {
      provider.onTransportError?.({
        request: { url: '/api/data', method: 'GET', headers: {} },
        error: new Error('401'),
        status: 401,
      });
    });
    await screen.findByRole('dialog', { name: 'Sign in' });
    // No provider logout runs on this path: a redirect provider's logout
    // leaves the page before the modal mounts, so the rejected credentials
    // are only set aside (`isRejectedSession`) and `sign_in` waits on its own.
    expect(logout).not.toHaveBeenCalled();

    // The provider still hands out the revoked token: sign_in does not take it
    // for a sign-in, so the modal stays and nothing reloads.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
    expect(modalState.getSnapshot()).toBe(SIGN_IN_EXTENSION_ID);
    expect(reloadPage).not.toHaveBeenCalled();

    // A real sign-in ends the wait, and the chain reloads once.
    await act(async () => {
      await built.app.auth?.login?.({ type: 'password', payload: { username: 'dev', password: 'secret' } });
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });

  it('a 401 whose snapshot read fails still sets the stale session aside for the real sign_in', async () => {
    // The read the 401's hook takes can fail (the session store is unreachable
    // for a moment): the snapshot then claims nothing, and the send judges
    // nothing - but the session its final read returns is set aside, so the
    // real `sign_in` handler does not take the stale session the provider
    // still hands out for a finished sign-in. The modal holds until a real
    // sign-in, exactly as when the snapshot read succeeded.
    const { provider, state, rejection } = stubRevocableProvider();
    state.session = { kind: 'bearer', token: 'live' };
    // The read the 401's hook takes is the one that fails, exactly once.
    let failNextRead = false;
    provider.getSession = async () => {
      if (failNextRead) {
        failNextRead = false;
        throw new Error('session store unreachable');
      }
      return state.session;
    };
    const built = await buildApp({ provider });
    registry = built.registry;
    const { wireSignInTriggers } = await import('@/app/auth/signInTriggers');
    const { modalState } = await import('./modalDomain');
    wireSignInTriggers(built.app, provider);
    await renderContainer(built.react, built.app);
    await act(async () => {});

    // The start-up check saw a session and sent nothing. The server revokes
    // the token; the 401's own hook-time read is the one that fails, and the
    // signed-out answer of the check that follows sends the chain.
    state.session = { kind: 'bearer', token: 'revoked' };
    rejection.serverRejected = true;
    failNextRead = true;
    act(() => {
      provider.onTransportError?.({
        request: { url: '/api/data', method: 'GET', headers: {} },
        error: new Error('401'),
        status: 401,
      });
    });
    await screen.findByRole('dialog', { name: 'Sign in' });

    // The stale session the send's final read returned was set aside: the
    // real sign_in does not take it for a sign-in, so the modal stays and
    // nothing reloads.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
    expect(modalState.getSnapshot()).toBe(SIGN_IN_EXTENSION_ID);
    expect(reloadPage).not.toHaveBeenCalled();

    // A real sign-in ends the wait, and the chain reloads once.
    await act(async () => {
      await built.app.auth?.login?.({ type: 'password', payload: { username: 'dev', password: 'secret' } });
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });

  it('an auth-less host cannot wait for a session: the modal stays and nothing reloads', async () => {
    const built = await buildApp();
    registry = built.registry;
    const { modalState } = await import('./modalDomain');
    const { CHROME_SIGN_IN } = await import('./chrome-actions');
    await renderContainer(built.react, built.app);
    await act(async () => {});

    act(() => {
      registry?.executeActionsChain({
        action: {
          type: built.react.FRONTX_ACTION_MOUNT_EXT,
          target: POPUP_DOMAIN,
          payload: { subject: SIGN_IN_EXTENSION_ID },
        },
      });
    });
    await screen.findByRole('dialog', { name: 'Sign in' });

    // No auth runtime exists to report a session, so the handler fails the
    // action at once instead of burning the timeout; the mediator swallows the
    // failure (no fallback on this one-action chain) and the page carries on.
    act(() => {
      registry?.executeActionsChain({
        action: { type: CHROME_SIGN_IN, target: POPUP_DOMAIN, timeout: 5000 },
      });
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(screen.getByRole('dialog', { name: 'Sign in' })).not.toBeNull();
    expect(modalState.getSnapshot()).toBe(SIGN_IN_EXTENSION_ID);
    expect(reloadPage).not.toHaveBeenCalled();
  });

  it('a mount failure reloads once, and a second failure inside the window only logs', async () => {
    // The sign-in entry's load rejects every time: the mount_ext of every
    // chain fails, the way the live walk's mount failed on every load
    // (issue 112), and every chain falls back to refresh_page.
    const built = await buildApp({ failSignInLoad: () => true });
    registry = built.registry;
    const { buildSignInChain } = await import('@/app/auth/signIn');
    await renderContainer(built.react, built.app);
    await act(async () => {});

    act(() => {
      registry?.executeActionsChain(buildSignInChain());
    });
    // The failed mount's fallback reloads the page: the one automatic reload
    // the window allows.
    await waitFor(() => expect(reloadPage).toHaveBeenCalledTimes(1));
    // The reloaded page sends the chain again and fails the same way again:
    // the fallback's refresh_page is blocked, the page is left as it is, and
    // the console says the sign-in chain failed instead of looping silently.
    act(() => {
      registry?.executeActionsChain(buildSignInChain());
    });
    await waitFor(() =>
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('the sign-in chain failed'),
      ),
    );
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });

  it('a reload the chain earned with a session is not blocked by an earlier failure reload', async () => {
    // A failure reload moments ago left the guard's stamp behind (it survives
    // the reload it allowed, in sessionStorage). The chain that gets somewhere
    // - sign_in reaches a session - drops the stamp, so its tail still reloads.
    expect(claimAutomaticReload()).toBe(true);
    const { provider } = stubAuthProvider();
    const built = await buildApp({ provider });
    registry = built.registry;
    const { buildSignInChain } = await import('@/app/auth/signIn');
    await renderContainer(built.react, built.app);
    await act(async () => {});

    act(() => {
      registry?.executeActionsChain(buildSignInChain());
    });
    await screen.findByRole('dialog', { name: 'Sign in' });

    const runtime = built.app.auth;
    await act(async () => {
      await runtime?.login?.({ type: 'password', payload: { username: 'dev', password: 'secret' } });
    });

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });

  it('the reload the chain ends with sees an address without the popup entry', async () => {
    // sign_in closes the modal by dispatching `unmount_ext` through the
    // registry (modalDomain.ts), so the runtime's wrappers write the domain's
    // occupancy - the mount set without the sign-in extension - into the
    // address before the action resolves. The `refresh_page` the chain follows
    // with therefore reloads an address that names no modal; a reload that
    // kept `?popup=sign-in` would reopen it (the live walk of round 3,
    // issue 112).
    const { provider } = stubAuthProvider();
    const built = await buildApp({ provider });
    registry = built.registry;
    const { buildSignInChain } = await import('@/app/auth/signIn');
    await renderContainer(built.react, built.app);
    await act(async () => {});

    const addressAtReload: string[] = [];
    reloadPage.mockImplementation(() => {
      addressAtReload.push(window.location.search);
    });

    act(() => {
      registry?.executeActionsChain(buildSignInChain());
    });
    await screen.findByRole('dialog', { name: 'Sign in' });
    // The chain's own mount put the popup entry into the address, so what
    // follows is a removal, not an address that never had one.
    expect(new URLSearchParams(window.location.search).get('popup')).toBe('sign-in');

    const runtime = built.app.auth;
    await act(async () => {
      await runtime?.login?.({ type: 'password', payload: { username: 'dev', password: 'secret' } });
    });

    await waitFor(() => expect(reloadPage).toHaveBeenCalledTimes(1));
    expect(addressAtReload[0]).not.toContain('popup');
    expect(new URLSearchParams(window.location.search).get('popup')).toBeNull();
  });

  it('sign_in resolves once a session exists even when another modal has displaced the sign-in one', async () => {
    // The zero-or-one strategy holds one modal at a time: a modal that
    // displaced the sign-in one left the store naming itself, the sign-in
    // `unmount_ext` is a no-op for a subject that is no longer mounted, and
    // the action must still resolve on the session instead of holding the
    // chain until the sender's timeout over a modal that is not this one
    // (modalDomain.ts waits on the sign-in id leaving the store, not on the
    // store emptying).
    const { provider } = stubAuthProvider();
    const built = await buildApp({ provider });
    registry = built.registry;
    const { modalState } = await import('./modalDomain');
    const { CHROME_SIGN_IN, CHROME_REFRESH_PAGE } = await import('./chrome-actions');
    const { SIGN_IN_ACTION_TIMEOUT_MS } = await import('@/app/auth/signIn');
    await renderContainer(built.react, built.app);
    await act(async () => {});

    act(() => {
      registry?.executeActionsChain({
        action: {
          type: built.react.FRONTX_ACTION_MOUNT_EXT,
          target: POPUP_DOMAIN,
          payload: { subject: SIGN_IN_EXTENSION_ID },
        },
      });
    });
    await screen.findByRole('dialog', { name: 'Sign in' });

    // A second modal displaces the sign-in one: the strategy releases it and
    // mounts the newcomer, and the store names the newcomer.
    act(() => {
      registry?.executeActionsChain({
        action: {
          type: built.react.FRONTX_ACTION_MOUNT_EXT,
          target: POPUP_DOMAIN,
          payload: { subject: SECOND_MODAL_EXTENSION_ID },
        },
      });
    });
    await screen.findByRole('dialog', { name: 'Second' });
    expect(modalState.getSnapshot()).toBe(SECOND_MODAL_EXTENSION_ID);
    expect(screen.queryByRole('dialog', { name: 'Sign in' })).toBeNull();

    // The sign_in the displaced chain carries: a session ends it, and the
    // chain's tail reloads the page.
    act(() => {
      registry?.executeActionsChain({
        action: { type: CHROME_SIGN_IN, target: POPUP_DOMAIN, timeout: SIGN_IN_ACTION_TIMEOUT_MS },
        next: { action: { type: CHROME_REFRESH_PAGE, target: SCREEN_DOMAIN } },
      });
    });

    const runtime = built.app.auth;
    await act(async () => {
      await runtime?.login?.({ type: 'password', payload: { username: 'dev', password: 'secret' } });
    });

    await waitFor(() => expect(reloadPage).toHaveBeenCalledTimes(1));
    expect(modalState.getSnapshot()).toBe(SECOND_MODAL_EXTENSION_ID);
  });

  it('a sign_in the sender timed out does not answer a session that lands afterwards', async () => {
    // The accepted Back-button gap: no session arrives, the sender's timeout
    // expires and the chain falls back to refresh_page, which the reload guard
    // blocks (a failure reload just happened). The handler's wait ends with
    // the action, so a session that lands long after must not wake it into
    // closing the modal and dropping the guard's stamp - that stamp is the
    // record of the loop the guard exists to stop, and the chain no longer
    // runs through this handler.
    expect(claimAutomaticReload()).toBe(true);
    const { provider } = stubAuthProvider();
    const built = await buildApp({ provider });
    registry = built.registry;
    const { modalState } = await import('./modalDomain');
    const { CHROME_SIGN_IN, CHROME_REFRESH_PAGE } = await import('./chrome-actions');
    const { SIGN_IN_ACTION_TIMEOUT_MS } = await import('@/app/auth/signIn');
    await renderContainer(built.react, built.app);
    await act(async () => {});

    act(() => {
      registry?.executeActionsChain({
        action: {
          type: built.react.FRONTX_ACTION_MOUNT_EXT,
          target: POPUP_DOMAIN,
          payload: { subject: SIGN_IN_EXTENSION_ID },
        },
      });
    });
    await screen.findByRole('dialog', { name: 'Sign in' });

    // The sign_in action runs on the fake clock, so the sender's timeout and
    // the handler's own bound can be advanced instead of waited out. The chain
    // carries the same refresh_page fallback the real sign-in chain ends with.
    vi.useFakeTimers();
    try {
      act(() => {
        registry?.executeActionsChain({
          action: { type: CHROME_SIGN_IN, target: POPUP_DOMAIN, timeout: SIGN_IN_ACTION_TIMEOUT_MS },
          fallback: { action: { type: CHROME_REFRESH_PAGE, target: SCREEN_DOMAIN } },
        });
      });
      await vi.advanceTimersByTimeAsync(0);
      // Moments before the timeout: a failure reload stamps the guard, the
      // state the chain's fallback is about to meet.
      await vi.advanceTimersByTimeAsync(SIGN_IN_ACTION_TIMEOUT_MS - 5_000);
      expect(claimAutomaticReload()).toBe(true);
      // Past the timeout: the mediator rejects the action, the chain's
      // fallback hits the guard and the page is left as it is; the handler's
      // own bound runs out with it.
      await vi.advanceTimersByTimeAsync(6_000);

      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('the sign-in chain failed'));
      expect(reloadPage).not.toHaveBeenCalled();
      expect(modalState.getSnapshot()).toBe(SIGN_IN_EXTENSION_ID);

      // A session lands after the chain gave up: the mediator timed the action
      // out and the handler's own bound ran out with it. The session arrives on
      // the same fake clock, still inside the stamp's window - the guard reads
      // a stamp written in the future of the real clock as stale, so only a
      // claim inside the window tells an intact stamp from a dropped one.
      const runtime = built.app.auth;
      await act(async () => {
        await runtime?.login?.({ type: 'password', payload: { username: 'dev', password: 'secret' } });
      });
      await vi.advanceTimersByTimeAsync(0);

      // The abandoned handler did nothing: the modal is still open, and the
      // guard's stamp is still in place (a cleared stamp would read as a fresh
      // allowance here).
      expect(screen.getByRole('dialog', { name: 'Sign in' })).not.toBeNull();
      expect(modalState.getSnapshot()).toBe(SIGN_IN_EXTENSION_ID);
      expect(claimAutomaticReload()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a refresh that resolves the rejected session after signed out keeps the modal and the reload stamp; a refresh that lands a new session ends the wait', async () => {
    // The tracker emits `auth/loggedIn` for more than a finished sign-in: a
    // refresh that resolves a session after the session went signed out
    // emits it too, and the session it resolves counts (the rejected one
    // does). The wait must end only on a session that is not the rejected
    // one: an announcement beside a provider that still hands the rejected
    // session out closes the modal with no sign-in behind it and drops the
    // reload guard's stamp - exactly the loop the stamp exists to record.
    // The announcements are the tracker's own here: every refresh runs
    // through the runtime, so the signed-out report, the announcement beside
    // the rejected session and the one beside a new session all come from the
    // tracker's refresh paths - the last one with no login call anywhere.
    const { provider, state, rejection } = stubRevocableProvider();
    state.session = { kind: 'bearer', token: 'live' };
    // One refresh stub for the whole case, dispatching on the flight the case
    // wants next: the plugin and the trigger wrap captured it at build time,
    // so it reads the mutable plan instead of being replaced per step.
    let flight: 'session' | 'no-session' = 'session';
    provider.refresh = vi.fn(async () => (flight === 'no-session' ? null : state.session));
    const built = await buildApp({ provider });
    registry = built.registry;
    const { wireSignInTriggers } = await import('@/app/auth/signInTriggers');
    const { modalState } = await import('./modalDomain');
    wireSignInTriggers(built.app, provider);
    // A failure reload stamped the guard moments ago: the state a pass of the
    // loop leaves behind, which a bogus sign-in end would clear.
    expect(claimAutomaticReload()).toBe(true);
    await renderContainer(built.react, built.app);
    await act(async () => {});

    // The server revokes the token, and the provider keeps handing the
    // rejected one out: the request fails with 401 and the chain goes out
    // against the rejected session.
    state.session = { kind: 'bearer', token: 'revoked' };
    rejection.serverRejected = true;
    act(() => {
      provider.onTransportError?.({
        request: { url: '/api/data', method: 'GET', headers: {} },
        error: new Error('401'),
        status: 401,
      });
    });
    await screen.findByRole('dialog', { name: 'Sign in' });

    // The report that takes the tracker signed out: a refresh flight that
    // resolves no session. The modal holds either way.
    flight = 'no-session';
    await act(async () => {
      await built.app.auth?.refresh?.();
    });

    // What a refresh resolving the rejected session after signed out does:
    // the tracker announces a session start, and the provider still hands
    // the rejected one out.
    flight = 'session';
    await act(async () => {
      await built.app.auth?.refresh?.();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    expect(modalState.getSnapshot()).toBe(SIGN_IN_EXTENSION_ID);
    expect(screen.getByRole('dialog', { name: 'Sign in' })).not.toBeNull();
    // The stamp is still in place, so sign_in cleared nothing.
    expect(claimAutomaticReload()).toBe(false);
    expect(reloadPage).not.toHaveBeenCalled();

    // The server keeps rejecting for a while longer: the tracker is signed
    // out again. Then the sign-in lands - the provider hands out a new
    // session, the refresh the tracker announces it with involves no login -
    // and the wait ends: the modal closes and the chain reloads once.
    flight = 'no-session';
    await act(async () => {
      await built.app.auth?.refresh?.();
    });
    state.session = { kind: 'bearer', token: 'fresh-sign-in' };
    flight = 'session';
    await act(async () => {
      await built.app.auth?.refresh?.();
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(modalState.getSnapshot()).toBeUndefined();
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });

  it('a refresh that rejects while signed in announces without a session and keeps the modal', async () => {
    // A refresh that rejects while the tracker still says signed in clears
    // for an unknown identity and announces a session start: a cache-scope
    // signal, not a sign-in. The announcement here is the tracker's own
    // clear path, and the runtime answers no session beside it (the
    // refreshFailed case), so the wait must hold. A real sign-in ends the
    // wait as usual.
    const { provider, state, rejection } = stubRevocableProvider();
    state.session = { kind: 'bearer', token: 'live' };
    provider.refresh = vi.fn(async () => {
      throw new Error('refresh endpoint down');
    });
    const built = await buildApp({ provider });
    registry = built.registry;
    const { wireSignInTriggers } = await import('@/app/auth/signInTriggers');
    const { modalState } = await import('./modalDomain');
    wireSignInTriggers(built.app, provider);
    await renderContainer(built.react, built.app);
    await act(async () => {});

    // The start-up check saw a session and sent nothing. The server revokes
    // the token, and the provider keeps handing the rejected one out: the
    // request fails with 401 and the chain goes out against the rejected
    // session.
    state.session = { kind: 'bearer', token: 'revoked' };
    rejection.serverRejected = true;
    act(() => {
      provider.onTransportError?.({
        request: { url: '/api/data', method: 'GET', headers: {} },
        error: new Error('401'),
        status: 401,
      });
    });
    await screen.findByRole('dialog', { name: 'Sign in' });

    // The runtime is left holding no session: the provider's getSession
    // answers null from here on, so the announcement lands beside no session
    // at all - the branch a failed re-read maps to elsewhere, reached here
    // through the tracker's real clear path.
    state.session = null;

    // The refresh that rejects: the tracker still says signed in, so it
    // clears for an unknown identity and announces a session start with no
    // session behind it.
    await act(async () => {
      await built.app.auth?.refresh?.().catch(() => undefined);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    expect(modalState.getSnapshot()).toBe(SIGN_IN_EXTENSION_ID);
    expect(screen.getByRole('dialog', { name: 'Sign in' })).not.toBeNull();
    expect(reloadPage).not.toHaveBeenCalled();

    // A real sign-in ends the wait - the session it leaves is not the
    // rejected one - and the chain reloads once.
    await act(async () => {
      await built.app.auth?.login?.({ type: 'password', payload: { username: 'dev', password: 'secret' } });
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });

  it('a session read that is still out when the bound runs out closes nothing afterwards', async () => {
    // The bound is the wait's deadline: once it is out the mediator has moved
    // the chain on and the handler has given the flow up. The session reads
    // are raced against that bound the way the announcements are, so a read
    // that answers after it - even with a session - closes no modal on a
    // flow the handler has given up.
    const { provider, state } = stubAuthProvider();
    state.session = { kind: 'bearer', token: 'live' };
    const built = await buildApp({ provider });
    registry = built.registry;
    const { modalState } = await import('./modalDomain');
    const { CHROME_SIGN_IN } = await import('./chrome-actions');
    const { SIGN_IN_ACTION_TIMEOUT_MS } = await import('@/app/auth/signIn');
    await renderContainer(built.react, built.app);
    await act(async () => {});

    act(() => {
      registry?.executeActionsChain({
        action: {
          type: built.react.FRONTX_ACTION_MOUNT_EXT,
          target: POPUP_DOMAIN,
          payload: { subject: SIGN_IN_EXTENSION_ID },
        },
      });
    });
    await screen.findByRole('dialog', { name: 'Sign in' });

    // The session read never answers while the wait runs: the runtime cannot
    // say whether a sign-in landed.
    let releaseRead: (() => void) | undefined;
    provider.getSession = () =>
      new Promise((resolve) => {
        releaseRead = () => resolve(state.session);
      });
    // Whatever the handler still dispatches after the bound goes through the
    // registry; the mount itself is already done.
    const dispatch = vi.spyOn(registry, 'executeActionsChain');

    vi.useFakeTimers();
    try {
      act(() => {
        registry?.executeActionsChain({
          action: { type: CHROME_SIGN_IN, target: POPUP_DOMAIN, timeout: SIGN_IN_ACTION_TIMEOUT_MS },
        });
      });
      await vi.advanceTimersByTimeAsync(0);
      // The sign_in dispatch itself is accounted for; only what the handler
      // still sends after the bound matters here.
      dispatch.mockClear();
      // Past the bound: the wait gives up. This chain is the bare sign_in
      // action, so nothing follows it.
      await vi.advanceTimersByTimeAsync(SIGN_IN_ACTION_TIMEOUT_MS + 1_000);

      // The read answers afterwards, with a session: it closes nothing - the
      // handler has given the flow up, so no unmount goes out either.
      state.session = { kind: 'bearer', token: 'fresh-sign-in' };
      await act(async () => {
        releaseRead?.();
      });
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);

      expect(screen.getByRole('dialog', { name: 'Sign in' })).not.toBeNull();
      expect(modalState.getSnapshot()).toBe(SIGN_IN_EXTENSION_ID);
      expect(dispatch).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a session read that fails after an announcement keeps the wait alive', async () => {
    // An announcement is a wake-up, not an answer, and the read that follows
    // it can fail: the provider is mid-refresh, or cannot answer for a
    // moment. Such a failure is "no session, keep waiting", not a failed
    // action - failing the action would send the chain to its fallback reload
    // while the person is still in the form. A real sign-in ends the wait as
    // usual.
    const { provider, state } = stubAuthProvider();
    let failNextRead = false;
    const baseGetSession = provider.getSession.bind(provider);
    provider.getSession = async () => {
      if (failNextRead) {
        failNextRead = false;
        throw new Error('session store unreachable');
      }
      return baseGetSession();
    };
    const built = await buildApp({ provider });
    registry = built.registry;
    const { modalState } = await import('./modalDomain');
    const { buildSignInChain } = await import('@/app/auth/signIn');
    await renderContainer(built.react, built.app);
    await act(async () => {});

    act(() => {
      registry?.executeActionsChain(buildSignInChain());
    });
    await screen.findByRole('dialog', { name: 'Sign in' });

    // The announcement lands, and the read that follows it fails.
    failNextRead = true;
    act(() => {
      built.react.eventBus.emit(built.react.AuthEvents.LoggedIn, {});
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    // The failed read kept the wait alive: the modal is still up, and the
    // chain did not fall back to its reload.
    expect(modalState.getSnapshot()).toBe(SIGN_IN_EXTENSION_ID);
    expect(screen.getByRole('dialog', { name: 'Sign in' })).not.toBeNull();
    expect(reloadPage).not.toHaveBeenCalled();

    // A real sign-in ends the wait, and the chain reloads once.
    state.session = { kind: 'bearer', token: 'fresh-sign-in' };
    await act(async () => {
      await built.app.auth?.login?.({ type: 'password', payload: { username: 'dev', password: 'secret' } });
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });

  it('a session read that throws synchronously after an announcement keeps the wait alive', async () => {
    // `app.auth.getSession` passes through to the provider, and a provider
    // whose `getSession` throws synchronously must reach the same handler
    // the rejections reach: a read that fails after an announcement counts
    // as "no session", not as a failed action that sends the chain to its
    // fallback reload while the person is still in the form. A real sign-in
    // ends the wait as usual.
    const { provider, state } = stubAuthProvider();
    let throwNextRead = false;
    const baseGetSession = provider.getSession.bind(provider);
    provider.getSession = () => {
      if (throwNextRead) {
        throwNextRead = false;
        throw new Error('session store unreachable');
      }
      return baseGetSession();
    };
    const built = await buildApp({ provider });
    registry = built.registry;
    const { modalState } = await import('./modalDomain');
    const { buildSignInChain } = await import('@/app/auth/signIn');
    await renderContainer(built.react, built.app);
    await act(async () => {});

    act(() => {
      registry?.executeActionsChain(buildSignInChain());
    });
    await screen.findByRole('dialog', { name: 'Sign in' });

    // The announcement lands, and the read that follows it throws before any
    // promise exists.
    throwNextRead = true;
    act(() => {
      built.react.eventBus.emit(built.react.AuthEvents.LoggedIn, {});
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    // The synchronous throw took the failed-read path: the modal is still
    // up, and the chain did not fall back to its reload.
    expect(modalState.getSnapshot()).toBe(SIGN_IN_EXTENSION_ID);
    expect(screen.getByRole('dialog', { name: 'Sign in' })).not.toBeNull();
    expect(reloadPage).not.toHaveBeenCalled();

    // A real sign-in ends the wait, and the chain reloads once.
    state.session = { kind: 'bearer', token: 'fresh-sign-in' };
    await act(async () => {
      await built.app.auth?.login?.({ type: 'password', payload: { username: 'dev', password: 'secret' } });
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });

  it('a cookie session without a CSRF token ends the wait when the announcement is followed by an authenticated session check', async () => {
    // A cookie session that carries no CSRF token serializes to the same
    // credentials before and after a real sign-in: `credentialSnapshot` has
    // no field that could tell one such session from another, so the strict
    // comparison against the rejected session would hold the modal until the
    // timeout even though the person signed in. For that shape the
    // announcement alone still ends nothing - the tracker announces
    // refreshes that sign nobody in - so the announcement is followed by one
    // `app.auth.checkAuth()`, and only an authenticated answer ends the
    // wait; every session the snapshot can tell apart keeps the strict
    // comparison.
    const { provider, state, rejection } = stubRevocableProvider();
    state.session = { kind: 'cookie' };
    const built = await buildApp({ provider });
    registry = built.registry;
    const { wireSignInTriggers } = await import('@/app/auth/signInTriggers');
    const { modalState } = await import('./modalDomain');
    wireSignInTriggers(built.app, provider);
    await renderContainer(built.react, built.app);
    await act(async () => {});

    // The server rejects the cookie session, and the provider keeps handing
    // it out: the 401 opens the modal against the rejected session.
    rejection.serverRejected = true;
    act(() => {
      provider.onTransportError?.({
        request: { url: '/api/data', method: 'GET', headers: {} },
        error: new Error('401'),
        status: 401,
      });
    });
    await screen.findByRole('dialog', { name: 'Sign in' });

    // The modal holds before anything announces: the rejected session the
    // first read answers ends nothing, and the leniency below must not reach
    // back over that first read.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
    expect(modalState.getSnapshot()).toBe(SIGN_IN_EXTENSION_ID);
    expect(reloadPage).not.toHaveBeenCalled();

    // The sign-in lands, and the provider hands out the new cookie session -
    // whose snapshot no field could tell from the rejected one. The server
    // accepts the session now, so the check the announcement is followed
    // with answers authenticated: the wait ends, and the chain reloads once.
    rejection.serverRejected = false;
    act(() => {
      built.react.eventBus.emit(built.react.AuthEvents.LoggedIn, {});
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(modalState.getSnapshot()).toBeUndefined();
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });

  it('a cookie session with a CSRF token keeps the strict comparison: the rejected token holds the modal, a new one ends the wait', async () => {
    // The CSRF token is the field that tells one cookie session from
    // another, so the per-announcement comparison holds for it in full: an
    // announcement beside a session with the rejected CSRF token keeps the
    // modal, and a session with a new CSRF token ends it.
    const { provider, state, rejection } = stubRevocableProvider();
    state.session = { kind: 'cookie', csrfToken: 'csrf-1' };
    const built = await buildApp({ provider });
    registry = built.registry;
    const { wireSignInTriggers } = await import('@/app/auth/signInTriggers');
    const { modalState } = await import('./modalDomain');
    wireSignInTriggers(built.app, provider);
    await renderContainer(built.react, built.app);
    await act(async () => {});

    rejection.serverRejected = true;
    act(() => {
      provider.onTransportError?.({
        request: { url: '/api/data', method: 'GET', headers: {} },
        error: new Error('401'),
        status: 401,
      });
    });
    await screen.findByRole('dialog', { name: 'Sign in' });

    // An announcement beside a session with the rejected CSRF token: the
    // modal holds, nothing reloads.
    act(() => {
      built.react.eventBus.emit(built.react.AuthEvents.LoggedIn, {});
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
    expect(modalState.getSnapshot()).toBe(SIGN_IN_EXTENSION_ID);
    expect(reloadPage).not.toHaveBeenCalled();

    // A session the CSRF token tells apart from the rejected one, announced
    // the same way: the wait ends, the modal closes and the chain reloads.
    state.session = { kind: 'cookie', csrfToken: 'csrf-2' };
    act(() => {
      built.react.eventBus.emit(built.react.AuthEvents.LoggedIn, {});
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(modalState.getSnapshot()).toBeUndefined();
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });

  it('a refresh that rejects while signed in holds a cookie session the snapshot cannot discriminate, and a real sign-in ends the wait', async () => {
    // For a cookie session without a CSRF token the announcement alone is no
    // answer: the tracker also announces refreshes that sign nobody in, and
    // a refresh that rejects while the tracker still says signed in is one
    // of them (it clears for an unknown identity as a cache-scope signal).
    // The announcement is followed by the session check the 401 itself
    // asked, and that check still answers signed out here, so the modal and
    // the reload stamp hold on one check per announcement. A real sign-in -
    // the check answering authenticated - ends the wait with one reload.
    const { provider, state, rejection } = stubRevocableProvider();
    state.session = { kind: 'cookie' };
    provider.refresh = vi.fn(async () => {
      throw new Error('refresh endpoint down');
    });
    const built = await buildApp({ provider });
    registry = built.registry;
    const { wireSignInTriggers } = await import('@/app/auth/signInTriggers');
    const { modalState } = await import('./modalDomain');
    wireSignInTriggers(built.app, provider);
    // A failure reload stamped the guard moments ago: the state a pass of
    // the loop leaves behind, which a bogus sign-in end would clear.
    expect(claimAutomaticReload()).toBe(true);
    await renderContainer(built.react, built.app);
    await act(async () => {});

    // The server rejects the cookie session, and the provider keeps handing
    // it out: the 401 opens the modal against the rejected session.
    rejection.serverRejected = true;
    act(() => {
      provider.onTransportError?.({
        request: { url: '/api/data', method: 'GET', headers: {} },
        error: new Error('401'),
        status: 401,
      });
    });
    await screen.findByRole('dialog', { name: 'Sign in' });
    const checkAuth = vi.spyOn(provider, 'checkAuth');

    // The refresh that rejects: the tracker still says signed in, so it
    // clears for an unknown identity and announces a session start beside
    // the same cookie session. The check answers signed out, so the wait
    // holds.
    await act(async () => {
      await built.app.auth?.refresh?.().catch(() => undefined);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    expect(modalState.getSnapshot()).toBe(SIGN_IN_EXTENSION_ID);
    expect(screen.getByRole('dialog', { name: 'Sign in' })).not.toBeNull();
    // The stamp is still in place, so sign_in cleared nothing.
    expect(claimAutomaticReload()).toBe(false);
    expect(reloadPage).not.toHaveBeenCalled();
    // One check per announcement: no polling behind the wait.
    expect(checkAuth).toHaveBeenCalledTimes(1);

    // The sign-in lands: the provider hands the same shape out, and the
    // server accepts it now, so the check the announcement is followed with
    // answers authenticated. The wait ends, the modal closes and the chain
    // reloads once.
    rejection.serverRejected = false;
    provider.login = vi.fn(async () => {
      state.session = { kind: 'cookie' };
      return { type: 'none' as const };
    });
    await act(async () => {
      await built.app.auth?.login?.({ type: 'password', payload: { username: 'dev', password: 'secret' } });
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(modalState.getSnapshot()).toBeUndefined();
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });

  it('a refresh that hands back the same cookie session keeps the modal until the session check answers authenticated', async () => {
    // A refresh that resolves a session after the tracker went signed out
    // announces a session start. For a cookie session without a CSRF token
    // the session it resolves is the very one the chain was sent against -
    // no field could tell it apart - so the announcement is not taken for
    // the sign-in: the session check is asked once, it still answers signed
    // out, and the modal and the reload stamp hold. A real sign-in, with the
    // check answering authenticated, ends the wait with one reload.
    const { provider, state, rejection } = stubRevocableProvider();
    state.session = { kind: 'cookie' };
    // One refresh stub for the whole case, dispatching on the flight the
    // case wants next (the same shape the bearer case at the top of the
    // cookie cases uses).
    let flight: 'no-session' | 'same-session' = 'no-session';
    provider.refresh = vi.fn(async () => (flight === 'no-session' ? null : state.session));
    const built = await buildApp({ provider });
    registry = built.registry;
    const { wireSignInTriggers } = await import('@/app/auth/signInTriggers');
    const { modalState } = await import('./modalDomain');
    wireSignInTriggers(built.app, provider);
    // A failure reload stamped the guard moments ago: the state a pass of
    // the loop leaves behind, which a bogus sign-in end would clear.
    expect(claimAutomaticReload()).toBe(true);
    await renderContainer(built.react, built.app);
    await act(async () => {});

    // The server rejects the cookie session: the 401 opens the modal against
    // the rejected session, and the trigger's own flight resolves no
    // session, which is answer enough for it.
    rejection.serverRejected = true;
    act(() => {
      provider.onTransportError?.({
        request: { url: '/api/data', method: 'GET', headers: {} },
        error: new Error('401'),
        status: 401,
      });
    });
    await screen.findByRole('dialog', { name: 'Sign in' });

    // The flight that takes the tracker signed out: a refresh resolving no
    // session. The modal holds either way.
    await act(async () => {
      await built.app.auth?.refresh?.();
    });

    // The flight that hands the same cookie session back: the tracker
    // announces a session start beside it. The check still answers signed
    // out, so the wait holds and the stamp survives.
    flight = 'same-session';
    await act(async () => {
      await built.app.auth?.refresh?.();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    expect(modalState.getSnapshot()).toBe(SIGN_IN_EXTENSION_ID);
    expect(screen.getByRole('dialog', { name: 'Sign in' })).not.toBeNull();
    // The stamp is still in place, so sign_in cleared nothing.
    expect(claimAutomaticReload()).toBe(false);
    expect(reloadPage).not.toHaveBeenCalled();

    // The sign-in lands: the provider hands the same shape out, and the
    // server accepts it now, so the check answers authenticated. The wait
    // ends, the modal closes and the chain reloads once.
    rejection.serverRejected = false;
    provider.login = vi.fn(async () => {
      state.session = { kind: 'cookie' };
      return { type: 'none' as const };
    });
    await act(async () => {
      await built.app.auth?.login?.({ type: 'password', payload: { username: 'dev', password: 'secret' } });
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(modalState.getSnapshot()).toBeUndefined();
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });

  it('a custom session that is the same before and after a real sign-in holds while the session check answers signed out, and ends the wait once it answers authenticated', async () => {
    // A custom session is serialized whole: when the provider hands out the
    // very same fields before and after the sign-in (`{ kind, userId }`
    // here), no comparison of the snapshot could see that sign-in, the way
    // no comparison could see it for the cookie session without a CSRF
    // token. The announcement is therefore followed by one
    // `app.auth.checkAuth()`: while it answers signed out the modal holds,
    // and an authenticated answer ends the wait.
    const { provider, state, rejection } = stubRevocableProvider();
    state.session = { kind: 'custom', userId: 'u1' };
    const built = await buildApp({ provider });
    registry = built.registry;
    const { wireSignInTriggers } = await import('@/app/auth/signInTriggers');
    const { modalState } = await import('./modalDomain');
    wireSignInTriggers(built.app, provider);
    await renderContainer(built.react, built.app);
    await act(async () => {});

    // The server rejects the custom session, and the provider keeps handing
    // it out: the 401 opens the modal against the rejected session.
    rejection.serverRejected = true;
    act(() => {
      provider.onTransportError?.({
        request: { url: '/api/data', method: 'GET', headers: {} },
        error: new Error('401'),
        status: 401,
      });
    });
    await screen.findByRole('dialog', { name: 'Sign in' });
    const checkAuth = vi.spyOn(provider, 'checkAuth');

    // An announcement beside the same custom session is no sign-in while
    // the check still answers signed out: the modal holds.
    act(() => {
      built.react.eventBus.emit(built.react.AuthEvents.LoggedIn, {});
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
    expect(modalState.getSnapshot()).toBe(SIGN_IN_EXTENSION_ID);
    expect(reloadPage).not.toHaveBeenCalled();
    // One check per announcement: no polling behind the wait.
    expect(checkAuth).toHaveBeenCalledTimes(1);

    // The real sign-in leaves the same custom session shape: the provider
    // hands out exactly the credentials the chain was sent against, but the
    // server accepts the session now, so the check answers authenticated.
    // The wait ends, the modal closes and the chain reloads once.
    rejection.serverRejected = false;
    provider.login = vi.fn(async () => {
      state.session = { kind: 'custom', userId: 'u1' };
      return { type: 'none' as const };
    });
    await act(async () => {
      await built.app.auth?.login?.({ type: 'password', payload: { username: 'dev', password: 'secret' } });
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(modalState.getSnapshot()).toBeUndefined();
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });

  it('a cookie session whose expiry never changes and that carries no CSRF token holds while the session check answers signed out, and ends the wait once it answers authenticated', async () => {
    // A cookie session with a fixed expiry and no CSRF token serializes to
    // the same snapshot before and after a real sign-in: the expiry is the
    // only field, and it repeats. Like the custom session above, the
    // announcement is followed by one `app.auth.checkAuth()`, and the wait
    // ends only on an authenticated answer.
    const { provider, state, rejection } = stubRevocableProvider();
    state.session = { kind: 'cookie', expiresAt: 1_700_000_000_000 };
    const built = await buildApp({ provider });
    registry = built.registry;
    const { wireSignInTriggers } = await import('@/app/auth/signInTriggers');
    const { modalState } = await import('./modalDomain');
    wireSignInTriggers(built.app, provider);
    await renderContainer(built.react, built.app);
    await act(async () => {});

    // The server rejects the cookie session, and the provider keeps handing
    // it out: the 401 opens the modal against the rejected session.
    rejection.serverRejected = true;
    act(() => {
      provider.onTransportError?.({
        request: { url: '/api/data', method: 'GET', headers: {} },
        error: new Error('401'),
        status: 401,
      });
    });
    await screen.findByRole('dialog', { name: 'Sign in' });
    const checkAuth = vi.spyOn(provider, 'checkAuth');

    // An announcement beside the same cookie session is no sign-in while
    // the check still answers signed out: the modal holds.
    act(() => {
      built.react.eventBus.emit(built.react.AuthEvents.LoggedIn, {});
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
    expect(modalState.getSnapshot()).toBe(SIGN_IN_EXTENSION_ID);
    expect(reloadPage).not.toHaveBeenCalled();
    // One check per announcement: no polling behind the wait.
    expect(checkAuth).toHaveBeenCalledTimes(1);

    // The real sign-in leaves the same cookie session shape: the expiry
    // never changes, but the server accepts the session now, so the check
    // answers authenticated. The wait ends, the modal closes, one reload.
    rejection.serverRejected = false;
    provider.login = vi.fn(async () => {
      state.session = { kind: 'cookie', expiresAt: 1_700_000_000_000 };
      return { type: 'none' as const };
    });
    await act(async () => {
      await built.app.auth?.login?.({ type: 'password', payload: { username: 'dev', password: 'secret' } });
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(modalState.getSnapshot()).toBeUndefined();
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });
});
