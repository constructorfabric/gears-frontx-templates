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
    const { provider, state } = stubAuthProvider();
    state.session = { kind: 'bearer', token: 'revoked' };
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

    // A request fails with 401: the chain goes out against the revoked session.
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
});
