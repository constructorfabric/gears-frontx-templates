/**
 * The chain the shell sends when it needs a sign-in: the shape is the decided
 * flow (issue 112) and nothing else may ride along with it, so it is pinned
 * here field by field - the mount first, the wait that carries no credentials,
 * and the reload in every branch.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  FRONTX_ACTION_MOUNT_EXT,
  FRONTX_POPUP_DOMAIN,
  FRONTX_SCREEN_DOMAIN,
} from '@gears-frontx/react';
import { CHROME_REFRESH_PAGE, CHROME_SIGN_IN } from '@/app/mfe/chrome-actions';
import type { AuthRuntime, AuthSession } from '@gears-frontx/react';
import {
  buildSignInChain,
  invalidateRejectedSession,
  isRejectedSession,
  readSessionCredentials,
  SIGN_IN_ACTION_TIMEOUT_MS,
  SIGN_IN_EXTENSION_ID,
} from './signIn';

describe('buildSignInChain', () => {
  const chain = buildSignInChain();

  it('mounts the sign-in extension on the popup domain first', () => {
    expect(chain.action).toEqual({
      type: FRONTX_ACTION_MOUNT_EXT,
      target: FRONTX_POPUP_DOMAIN,
      payload: { subject: SIGN_IN_EXTENSION_ID },
    });
  });

  it('holds the chain on sign_in with its own long timeout and no payload at all', () => {
    const signIn = chain.next?.action;
    expect(signIn?.type).toBe(CHROME_SIGN_IN);
    expect(signIn?.target).toBe(FRONTX_POPUP_DOMAIN);
    expect(signIn?.timeout).toBe(SIGN_IN_ACTION_TIMEOUT_MS);
    // Longer than the popup domain's own defaultActionTimeout (30 000 ms):
    // the action spans a user typing credentials, which the domain default
    // would abandon mid-typing.
    expect(signIn?.timeout).toBeGreaterThan(30_000);
    // The action carries nothing: no credentials, no subject, no overrides.
    expect(signIn).not.toHaveProperty('payload');
  });

  it('reloads the page on success, on a failed sign-in and on a failed mount', () => {
    const refresh = { action: { type: CHROME_REFRESH_PAGE, target: FRONTX_SCREEN_DOMAIN } };
    expect(chain.next?.next).toEqual(refresh);
    expect(chain.next?.fallback).toEqual(refresh);
    expect(chain.fallback).toEqual(refresh);
  });
});

describe('isRejectedSession', () => {
  /** Rejects `session` the way a 401 does: the runtime reads it, and its
   * credentials are set aside. The snapshot the trigger passes arrives in the
   * shape `readSessionCredentials` writes, so the matching below is the
   * matching the triggers rely on. */
  async function reject(session: AuthSession): Promise<void> {
    const auth = {
      getSession: vi.fn(async () => session),
      logout: vi.fn(async () => ({ type: 'none' as const })),
    } as unknown as AuthRuntime;
    invalidateRejectedSession(await readSessionCredentials(auth));
  }

  it('matches a bearer session read back with its properties in another order', async () => {
    await reject({ kind: 'bearer', token: 'revoked' });
    const reordered: AuthSession = { token: 'revoked', kind: 'bearer' };
    expect(isRejectedSession(reordered)).toBe(true);
    // A new expiry on the same access token is still the rejected credential.
    expect(isRejectedSession({ expiresAt: 1, token: 'revoked', kind: 'bearer' })).toBe(true);
    expect(isRejectedSession({ kind: 'bearer', token: 'fresh' })).toBe(false);
  });

  it('matches a custom session by every field, whatever their order', async () => {
    await reject({ kind: 'custom', user: 'a', ticket: 't1' });
    expect(isRejectedSession({ ticket: 't1', user: 'a', kind: 'custom' })).toBe(true);
    expect(isRejectedSession({ kind: 'custom', user: 'a', ticket: 't2' })).toBe(false);
  });

  it('treats a custom field the provider left undefined as absent', async () => {
    await reject({ kind: 'custom', token: 'revoked' });
    // The same credentials with an optional field left undefined are not a new
    // sign-in; serializing that field as null used to make them look new.
    expect(isRejectedSession({ kind: 'custom', token: 'revoked', optional: undefined })).toBe(true);
  });

  it('matches a cookie session by its CSRF token', async () => {
    await reject({ kind: 'cookie', csrfToken: 'c1', expiresAt: 1 });
    expect(isRejectedSession({ expiresAt: 2, csrfToken: 'c1', kind: 'cookie' })).toBe(true);
    expect(isRejectedSession({ kind: 'cookie', csrfToken: 'c2' })).toBe(false);
  });

  it('sets the rejected credentials aside without a provider logout', async () => {
    // The old credentials are remembered, so the next `sign_in` cannot take
    // them for a finished sign-in - and the session is not ended here: a
    // redirect provider's `logout()` navigates to the sign-in service's
    // end-session endpoint and the page leaves before the modal mounts. The
    // double's logout throws, so a call would fail this case outright.
    const auth = {
      getSession: vi.fn(async () => ({ kind: 'bearer' as const, token: 'revoked' })),
      logout: vi.fn(async () => {
        throw new Error('a redirect provider leaves the page from logout()');
      }),
    } as unknown as AuthRuntime;
    invalidateRejectedSession(await readSessionCredentials(auth));

    expect(auth.logout).not.toHaveBeenCalled();
    // The rejected credentials cannot be reused by the next sign-in; other
    // credentials still count as a new one.
    expect(isRejectedSession({ kind: 'bearer', token: 'revoked' })).toBe(true);
    expect(isRejectedSession({ token: 'revoked', kind: 'bearer', expiresAt: 9 })).toBe(true);
    expect(isRejectedSession({ kind: 'bearer', token: 'fresh' })).toBe(false);
  });
});
