/**
 * A page loaded with a session and the sign-in extension still named in the
 * address - a deep link, or an address an earlier sign-in left behind - end to
 * end through the real runtime: the framework's `microfrontends()` plugin
 * builds the registry with the router of `@gears-frontx/routing`, the
 * container registers the popup domain the shell presents as a modal extension
 * domain together with the extensions of the manifest aggregate - whose one
 * modal extension is the sign-in one, under the id `app/auth/signIn.ts` names -
 * and the dialog layer presents what the domain mounts. The triggers are the
 * real `wireSignInTriggers`, wired before the first render the way `main.tsx`
 * does. Nothing routing or mounting related is stubbed. Only the loading of a
 * remote is: the handler is the real `MfeHandlerMF` with `load` answering an
 * inline lifecycle instead of fetching a Module Federation bundle, and the
 * reload seam is replaced, since jsdom implements no navigation and the case
 * wants to watch that no reload happens.
 *
 * One case per file, like `modalDomainDeepLink.test.tsx`: the page-load record
 * is a realm slot the module reset cannot clear, so this file simulates one
 * page load, and the address it starts from is set before the app is built.
 * The host-driven sign-in cases share `modalSignIn.test.tsx`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import { FRONTX_ACTION_MOUNT_EXT, FRONTX_ACTION_UNMOUNT_EXT } from '@gears-frontx/gts-plugin';
import { SIGN_IN_EXTENSION_ID } from '@/app/auth/signIn';
import { CHROME_SIGN_IN } from './chrome-actions';
import {
  buildApp,
  makeSignInAggregate,
  renderContainer,
  stubAuthProvider,
  teardownModalSuite,
} from './__test-utils__/modalHarness';

const reloadPage = vi.hoisted(() => vi.fn());
vi.mock('./pageReload', () => ({ reloadPage }));

describe('a start with a session and the sign-in extension in the address', () => {
  let registry: Awaited<ReturnType<typeof buildApp>>['registry'] | undefined;

  beforeEach(() => {
    registry = undefined;
    vi.resetModules();
    reloadPage.mockReset();
    sessionStorage.clear();
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(makeSignInAggregate(SIGN_IN_EXTENSION_ID)))),
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    await teardownModalSuite(registry);
  });

  it('unmounts the sign-in extension instead of keeping a modal open, and leaves no popup entry', async () => {
    // The address the page loads with. The triggers are wired before the
    // render, so the entry is read here - the router's page-load step clears
    // every entry from the address once the first routed domain starts, a step
    // of the render that follows.
    window.history.replaceState(null, '', '/?popup=sign-in');
    const { provider, state } = stubAuthProvider();
    state.session = { kind: 'bearer', token: 'already-in' };
    const built = await buildApp({ provider });
    registry = built.registry;
    // Every module that carries page-lifetime state is imported afresh, after
    // the reset: the triggers must await the same slot-attachment signal the
    // rendered container resolves, not the stale one of a previous module
    // graph (modalSignIn.test.tsx).
    const { wireSignInTriggers } = await import('@/app/auth/signInTriggers');
    const { modalState } = await import('./modalDomain');
    // Every chain the page dispatches, in order: the router's own page-load
    // mount for the address's entry, then the start-up unmount behind it. The
    // mount and the unmount of an inline lifecycle are both faster than a
    // poll, so the dispatch order is what shows the entry was mounted and
    // removed rather than never mounted.
    const dispatches: Array<{ type: string; payload?: { subject?: string; history?: string } }> = [];
    const sendChain = built.registry.executeActionsChain.bind(built.registry);
    vi.spyOn(built.registry, 'executeActionsChain').mockImplementation((chain) => {
      dispatches.push({ type: chain.action.type, payload: chain.action.payload });
      sendChain(chain);
    });
    wireSignInTriggers(built.app, provider);
    await renderContainer(built.react, built.app);

    // The entry the address carried mounts through the router's page-load
    // step, and the start-up unmount removes it again, with the replace
    // history intent - no sign-in chain is sent for a session that exists.
    await waitFor(() =>
      expect(dispatches).toContainEqual({
        type: FRONTX_ACTION_MOUNT_EXT,
        payload: { subject: SIGN_IN_EXTENSION_ID, history: 'none' },
      }),
    );
    await waitFor(() =>
      expect(dispatches).toContainEqual({
        type: FRONTX_ACTION_UNMOUNT_EXT,
        payload: { subject: SIGN_IN_EXTENSION_ID, history: 'replace' },
      }),
    );
    expect(modalState.getSnapshot()).toBeUndefined();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(new URLSearchParams(window.location.search).get('popup')).toBeNull();
    // No sign-in chain went out with it: a session exists, so the flow the
    // chain serves - sign in, then reload - is not the page's business.
    expect(dispatches.some((chain) => chain.type === CHROME_SIGN_IN)).toBe(false);

    // Nothing reloads: the page's own requests ran with the session, so there
    // is nothing for the chain's tail to repeat.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
    expect(reloadPage).not.toHaveBeenCalled();
  });
});
