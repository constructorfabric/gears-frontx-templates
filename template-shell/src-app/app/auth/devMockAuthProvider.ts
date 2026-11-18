/**
 * The development auth provider of the shell.
 *
 * Development only, like mock mode: `main.tsx` and `main.no-uikit.tsx` pass it
 * to `presets.full({ auth })` behind `import.meta.env.DEV`, and a production
 * build carries neither it nor the auth plugin. A project replaces it with its
 * own provider - the template only needs a session that exists, so the
 * sign-in flow can be walked without a backend.
 *
 * `login` accepts non-empty credentials - every field it is given, so an
 * empty password next to a user name is refused too - and keeps a bearer
 * session in `sessionStorage`, so the session survives a reload (the reload
 * the sign-in chain ends with) and dies with the tab. The plugin's own
 * wrappers report the state changes, and the provider reports them to its
 * `subscribe` listeners too, so a caller that signs in through the provider
 * directly is followed the same way.
 */

import type {
  AuthCheckResult,
  AuthContext,
  AuthLoginInput,
  AuthProvider,
  AuthSession,
  AuthStateEvent,
  AuthStateListener,
  AuthTransition,
  AuthUnsubscribe,
} from '@gears-frontx/react';

/** Where the dev session is kept. Named, so a test can seed or clear it. */
export const DEV_MOCK_AUTH_SESSION_STORAGE_KEY = 'frontx.dev-mock-auth.session';

/** The shape the provider stores: a bearer session, JSON encoded. */
interface StoredDevSession {
  kind: 'bearer';
  token: string;
}

function isStoredDevSession(value: unknown): value is AuthSession {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { kind?: unknown; token?: unknown };
  return (
    candidate.kind === 'bearer' &&
    typeof candidate.token === 'string' &&
    candidate.token !== ''
  );
}

function readStoredSession(): AuthSession | null {
  const raw = sessionStorage.getItem(DEV_MOCK_AUTH_SESSION_STORAGE_KEY);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isStoredDevSession(parsed) ? parsed : null;
  } catch {
    // A hand-edited or half-written value is no session at all.
    return null;
  }
}

/**
 * "Any non-empty credentials": every field the payload carries is a non-empty
 * string, and there is at least one. So a user name with an empty password -
 * or either field empty on its own - is refused: the decided rule is
 * non-empty credentials, meaning both. What the strings say is nobody's
 * business in development.
 */
function hasNonEmptyCredentials(input: AuthLoginInput): boolean {
  const values = Object.values(input.payload ?? {});
  return values.length > 0 && values.every((value) => typeof value === 'string' && value.length > 0);
}

/**
 * Builds one development auth provider. A factory rather than a module
 * singleton: each app gets its own listener set, and a test gets an instance
 * that shares nothing with the next one.
 */
export function createDevMockAuthProvider(): AuthProvider {
  const listeners = new Set<AuthStateListener>();
  let tokenCounter = 0;

  function report(state: AuthStateEvent['state']): void {
    const event: AuthStateEvent = { state };
    for (const listener of [...listeners]) listener(event);
  }

  return {
    async getSession(_ctx?: AuthContext): Promise<AuthSession | null> {
      return readStoredSession();
    },

    async checkAuth(_ctx?: AuthContext): Promise<AuthCheckResult> {
      const session = readStoredSession();
      return session ? { authenticated: true, session } : { authenticated: false };
    },

    async login(input: AuthLoginInput, _ctx?: AuthContext): Promise<AuthTransition> {
      if (!hasNonEmptyCredentials(input)) {
        throw new Error(
          '[devMockAuthProvider] login rejected: the credentials are empty. ' +
            'The development provider accepts any non-empty credentials.',
        );
      }
      tokenCounter += 1;
      const session: StoredDevSession = {
        kind: 'bearer',
        token: `dev-mock-token-${Date.now().toString(36)}-${tokenCounter}`,
      };
      sessionStorage.setItem(DEV_MOCK_AUTH_SESSION_STORAGE_KEY, JSON.stringify(session));
      report('authenticated');
      return { type: 'none' };
    },

    async logout(_ctx?: AuthContext): Promise<AuthTransition> {
      sessionStorage.removeItem(DEV_MOCK_AUTH_SESSION_STORAGE_KEY);
      report('unauthenticated');
      return { type: 'none' };
    },

    subscribe(listener: AuthStateListener): AuthUnsubscribe {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
