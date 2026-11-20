/**
 * A shell that only joins the session: a microfrontend app passes the
 * provider with `auth({ provider })`, and the shell is built with `auth()`
 * alone. The template composes it the other way round (the shell passes the
 * provider, `app/auth/devAuth.ts`); this file holds the shell to the same
 * behaviour when it does not.
 *
 * The microfrontend app is built in its own module graph with its own
 * eventBus, as a separately bundled microfrontend has on a page: the state
 * package is not inlined in this lane, so a module reset alone would hand
 * both graphs one bus, and the graph is given a fresh instance of the same
 * bus class instead. The cases assert the two buses differ, so what reaches
 * the shell's bus came through the realm's relay.
 *
 * What the shell must keep doing as a joiner, with its real plugins:
 * - its query cache (the `queryCache()` plugin of the full preset) is cleared
 *   by a sign-out made from either app;
 * - its modal domain's sign-in wait (`modalDomain.ts`,
 *   `waitForSessionThenCloseSignIn`) sees the `LoggedIn` of a sign-in made in
 *   the microfrontend app, closes the modal and lets the chain reload.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import type { QueryClient } from '@tanstack/react-query';
import type { AuthProvider, FrontXApp } from '@gears-frontx/react';
import { SIGN_IN_EXTENSION_ID } from '@/app/auth/signIn';
import { clearAutomaticReload } from './automaticReload';
import {
  buildApp,
  makeSignInAggregate,
  renderContainer,
  stubAuthProvider,
  teardownModalSuite,
} from './__test-utils__/modalHarness';

const reloadPage = vi.hoisted(() => vi.fn());
vi.mock('./pageReload', () => ({ reloadPage }));

type ReactModule = typeof import('@gears-frontx/react');

/**
 * Builds the microfrontend app that passes the provider, in a module graph of
 * its own whose eventBus is a fresh instance, then puts the module graph back
 * for the shell the case builds next.
 */
async function buildProviderMfe(provider: AuthProvider): Promise<{ app: FrontXApp; react: ReactModule }> {
  vi.resetModules();
  vi.doMock('@gears-frontx/state', async () => {
    const actual = await vi.importActual<typeof import('@gears-frontx/state')>('@gears-frontx/state');
    const EventBus = actual.eventBus.constructor as new () => typeof actual.eventBus;
    return { ...actual, eventBus: new EventBus() };
  });
  try {
    const react = await import('@gears-frontx/react');
    const app = react.createFrontX().use(react.auth({ provider })).build();
    return { app, react };
  } finally {
    vi.doUnmock('@gears-frontx/state');
    vi.resetModules();
  }
}

describe('a shell that joins the session a microfrontend app passed', () => {
  let registry: Awaited<ReturnType<typeof buildApp>>['registry'] | undefined;
  let mfeApp: FrontXApp | undefined;

  beforeEach(() => {
    registry = undefined;
    mfeApp = undefined;
    reloadPage.mockReset();
    clearAutomaticReload();
    sessionStorage.clear();
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(makeSignInAggregate(SIGN_IN_EXTENSION_ID)))),
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    try {
      await teardownModalSuite(registry);
    } finally {
      mfeApp?.destroy();
    }
  });

  it.each(['the microfrontend app', 'the shell'] as const)(
    'clears the shell query cache on a sign-out made from %s',
    async (signsOut) => {
      const { provider, state } = stubAuthProvider();
      state.session = { kind: 'bearer', token: 'signed-in' };
      const mfe = await buildProviderMfe(provider);
      mfeApp = mfe.app;
      const shell = await buildApp({ joinAuth: true });
      registry = shell.registry;
      expect(shell.react.eventBus).not.toBe(mfe.react.eventBus);
      expect(shell.app.auth).toBe(mfeApp.auth);
      // Let the init baseline land, so the sign-out is a change from signed in.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      // The queryCache() plugin of the full preset keeps the app's client under this realm key.
      const queryClient = (shell.app as unknown as Record<symbol, QueryClient | undefined>)[
        Symbol.for('frontx:query-cache:app-client')
      ];
      if (!queryClient) throw new Error('the full preset built no query client');
      queryClient.setQueryData(['accounts', 'me'], { name: 'Ada' });
      const shellHeard = vi.fn();
      const mfeHeard = vi.fn();
      shell.react.eventBus.on(shell.react.AuthEvents.LoggedOut, shellHeard);
      mfe.react.eventBus.on(mfe.react.AuthEvents.LoggedOut, mfeHeard);

      const from = signsOut === 'the shell' ? shell.app : mfeApp;
      await act(async () => {
        await from.auth?.logout();
      });

      expect(queryClient.getQueryData(['accounts', 'me'])).toBeUndefined();
      expect(shellHeard).toHaveBeenCalledTimes(1);
      expect(mfeHeard).toHaveBeenCalledTimes(1);
    },
  );

  it('ends the shell modal wait on the LoggedIn of a sign-in made in the microfrontend app', async () => {
    const { provider } = stubAuthProvider();
    const mfe = await buildProviderMfe(provider);
    mfeApp = mfe.app;
    const shell = await buildApp({ joinAuth: true });
    registry = shell.registry;
    expect(shell.react.eventBus).not.toBe(mfe.react.eventBus);
    const { modalState } = await import('./modalDomain');
    const { buildSignInChain } = await import('@/app/auth/signIn');
    await renderContainer(shell.react, shell.app);
    await act(async () => {});

    act(() => {
      registry?.executeActionsChain(buildSignInChain());
    });
    await screen.findByRole('dialog', { name: 'Sign in' });
    expect(modalState.getSnapshot()).toBe(SIGN_IN_EXTENSION_ID);

    await act(async () => {
      await mfeApp?.auth?.login?.({ type: 'password', payload: { username: 'dev', password: 'secret' } });
    });

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(modalState.getSnapshot()).toBeUndefined();
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });
});
