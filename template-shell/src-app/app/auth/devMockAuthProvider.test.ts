/**
 * The development auth provider's own behaviour: what it accepts, where it
 * keeps the session, and what it reports. The plugin's wrappers around it are
 * the framework's own tested behaviour; these cases hold the provider to the
 * contract the sign-in flow leans on - a session that exists after a login
 * and survives the reload the chain ends with.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { AuthLoginInput } from '@gears-frontx/react';
import {
  createDevMockAuthProvider,
  DEV_MOCK_AUTH_SESSION_STORAGE_KEY,
} from './devMockAuthProvider';

const CREDENTIALS: AuthLoginInput = {
  type: 'password',
  payload: { username: 'dev', password: 'secret' },
};

describe('createDevMockAuthProvider', () => {
  let provider: ReturnType<typeof createDevMockAuthProvider>;

  /**
   * `login` is optional on the provider contract; the dev provider always
   * carries it and the sign-in flow leans on it, so the narrowing lives here
   * once instead of as an assertion at every call.
   */
  function login(input: AuthLoginInput) {
    return provider.login!(input);
  }

  beforeEach(() => {
    sessionStorage.clear();
    provider = createDevMockAuthProvider();
  });

  it('starts with no session', async () => {
    await expect(provider.getSession()).resolves.toBeNull();
    await expect(provider.checkAuth()).resolves.toEqual({ authenticated: false });
  });

  it('login accepts any non-empty credentials and keeps a bearer session in sessionStorage', async () => {
    await expect(login(CREDENTIALS)).resolves.toEqual({ type: 'none' });

    const stored = sessionStorage.getItem(DEV_MOCK_AUTH_SESSION_STORAGE_KEY);
    expect(stored).not.toBeNull();
    const parsed: unknown = JSON.parse(stored ?? 'null');
    expect(parsed).toMatchObject({ kind: 'bearer' });
    expect((parsed as { token?: string }).token).not.toBe('');

    await expect(provider.getSession()).resolves.toMatchObject({ kind: 'bearer' });
    await expect(provider.checkAuth()).resolves.toEqual({
      authenticated: true,
      session: expect.objectContaining({ kind: 'bearer' }),
    });
  });

  it('accepts credentials however they are named, and rejects an empty payload', async () => {
    await expect(
      login({ type: 'password', payload: { user: 'someone' } }),
    ).resolves.toEqual({ type: 'none' });

    sessionStorage.clear();
    await expect(
      login({ type: 'password', payload: { username: '', password: '' } }),
    ).rejects.toThrow(/empty/);
    await expect(provider.getSession()).resolves.toBeNull();
    await expect(provider.checkAuth()).resolves.toEqual({ authenticated: false });
  });

  it('rejects a user name with an empty password, and an empty user name with a password', async () => {
    // Non-empty credentials means both: the decided rule the live walk of the
    // sign-in modal sharpened (issue 112, round 3) - a user name with an empty
    // password signed in before. The same error the empty form shows, the one
    // the sign-in screen renders as its failure line, is what refuses them.
    await expect(
      login({ type: 'password', payload: { username: 'dev', password: '' } }),
    ).rejects.toThrow(/empty/);
    await expect(
      login({ type: 'password', payload: { username: '', password: 'secret' } }),
    ).rejects.toThrow(/empty/);
    await expect(provider.getSession()).resolves.toBeNull();
    await expect(provider.checkAuth()).resolves.toEqual({ authenticated: false });
  });

  it('logout clears the session', async () => {
    await login(CREDENTIALS);

    await expect(provider.logout()).resolves.toEqual({ type: 'none' });

    expect(sessionStorage.getItem(DEV_MOCK_AUTH_SESSION_STORAGE_KEY)).toBeNull();
    await expect(provider.getSession()).resolves.toBeNull();
    await expect(provider.checkAuth()).resolves.toEqual({ authenticated: false });
  });

  it('reports login and logout to subscribe listeners', async () => {
    const states: string[] = [];
    // `subscribe` is optional on the provider contract; the dev provider
    // always carries it, and the flow's sign_in wait leans on the plugin
    // hearing these reports, so a missing one must fail here rather than
    // silently report nothing.
    expect(provider.subscribe).toBeDefined();
    const unsubscribe = provider.subscribe!((event) => states.push(event.state));

    await login(CREDENTIALS);
    await provider.logout();
    unsubscribe();

    expect(states).toEqual(['authenticated', 'unauthenticated']);
  });
});
