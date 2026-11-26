import isEqual from 'lodash/isEqual';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Language, type AuthRuntime } from '@gears-frontx/react';
import { clearUser, headerSlice, setHeaderLoading, setUser } from '@/app/layout/state';
import { UserRole } from '@/app/api/types';
import { LANGUAGE_STORAGE_KEY } from '@/app/i18n/languagePersistence';

type BootstrapUserSnapshot = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  language: Language;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
};

/** Payloads emitted on the bus in these tests (fetch has none; loaded carries user). */
type BootstrapTestBusPayload =
  | undefined
  | {
      user: BootstrapUserSnapshot;
    };

type BootstrapEventHandler = (
  payload?: BootstrapTestBusPayload,
) => void | Promise<void>;

const listeners = new Map<string, Array<BootstrapEventHandler>>();
const languageChanges: string[] = [];
const mockHas = vi.fn();
const mockGetService = vi.fn();
const spyCleanups: Array<() => void> = [];

function mockConsoleWarn() {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  spyCleanups.push(() => {
    warnSpy.mockReset();
    warnSpy.mockRestore();
  });
  return warnSpy;
}

vi.mock('@gears-frontx/react', async (importOriginal) => ({
  ...(await importOriginal()),
  eventBus: {
    on: vi.fn((eventName: string, handler: BootstrapEventHandler) => {
      const handlers = listeners.get(eventName) ?? [];
      handlers.push(handler);
      listeners.set(eventName, handlers);
      return () => {
        listeners.set(
          eventName,
          (listeners.get(eventName) ?? []).filter((candidate) => candidate !== handler),
        );
      };
    }),
    emit: async (eventName: string, payload?: BootstrapTestBusPayload) => {
      if (eventName === 'i18n/language/changed') {
        languageChanges.push((payload as unknown as { language: string }).language);
        return;
      }
      const handlers = listeners.get(eventName) ?? [];
      await Promise.all(handlers.map((handler) => handler(payload)));
    },
  },
  apiRegistry: {
    has: (svc: abstract new (...args: never[]) => Record<string, never>) =>
      mockHas(svc),
    getService: (svc: abstract new (...args: never[]) => Record<string, never>) =>
      mockGetService(svc),
  },
}));

vi.mock('@/app/api', () => ({
  AccountsApiService: class MockAccountsApiService {
    static {
      void 0;
    }
  },
}));

async function emitEvent(event: string, payload?: BootstrapTestBusPayload): Promise<void> {
  const handlers = listeners.get(event) ?? [];
  await Promise.all(handlers.map((handler) => handler(payload)));
}

function getDispatchedActions(dispatch: ReturnType<typeof vi.fn>) {
  return dispatch.mock.calls.map(([action]) => action);
}

/** The header state the dispatched actions leave, through the framework's own header slice. */
function headerStateAfter(dispatch: ReturnType<typeof vi.fn>) {
  return getDispatchedActions(dispatch).reduce(headerSlice.reducer, undefined);
}

describe('registerBootstrapEffects', () => {
  beforeEach(() => {
    listeners.clear();
    languageChanges.length = 0;
    mockHas.mockReset();
    mockGetService.mockReset();
    spyCleanups.length = 0;
    // Nothing remembered unless a test says otherwise: the profile is the
    // default in every other case.
    window.localStorage.clear();
  });

  afterEach(() => {
    while (spyCleanups.length > 0) {
      spyCleanups.pop()?.();
    }
  });

  it('does nothing when the accounts service is not registered', async () => {
    mockHas.mockReturnValue(false);
    const dispatch = vi.fn();
    const { registerBootstrapEffects } = await import('./bootstrapEffects');

    registerBootstrapEffects(dispatch);
    await emitEvent('app/user/fetch');

    expect(mockHas).toHaveBeenCalledTimes(1);
    expect(mockGetService).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('dispatches header slice actions when the bootstrap adapter loads the current user', async () => {
    mockHas.mockReturnValue(true);
    mockGetService.mockReturnValue({
      getCurrentUser: {
        fetch: vi.fn().mockResolvedValue({
          user: {
            id: 'user-ada',
            firstName: 'Ada',
            lastName: 'Lovelace',
            email: 'ada@example.com',
            role: UserRole.User,
            language: Language.English,
            avatarUrl: 'https://example.com/avatar.png',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        }),
      },
    });
    const dispatch = vi.fn();
    const { registerBootstrapEffects } = await import('./bootstrapEffects');

    registerBootstrapEffects(dispatch);
    await emitEvent('app/user/fetch');

    expect(dispatch).toHaveBeenCalledTimes(3);
    expect(getDispatchedActions(dispatch)).toEqual([
      setHeaderLoading(true),
      setUser({
        displayName: 'Ada Lovelace',
        email: 'ada@example.com',
        avatarUrl: 'https://example.com/avatar.png',
      }),
      setHeaderLoading(false),
    ]);
  });

  it('clears header loading when the fetch fails', async () => {
    const warnSpy = mockConsoleWarn();
    const error = new Error('boom');
    mockHas.mockReturnValue(true);
    mockGetService.mockReturnValue({
      getCurrentUser: {
        fetch: vi.fn().mockRejectedValue(error),
      },
    });
    const dispatch = vi.fn();
    const { registerBootstrapEffects } = await import('./bootstrapEffects');

    registerBootstrapEffects(dispatch);
    await emitEvent('app/user/fetch');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain('Failed to fetch user');
    expect(warnSpy.mock.calls[0]?.[1]).toBe(error);
    expect(getDispatchedActions(dispatch)).toEqual([
      setHeaderLoading(true),
      setHeaderLoading(false),
    ]);
  });

  it('warns instead of throwing when service availability lookup fails synchronously', async () => {
    const warnSpy = mockConsoleWarn();
    const error = new Error('registry has failed');
    mockHas.mockImplementation(() => {
      throw error;
    });
    const dispatch = vi.fn();
    const { registerBootstrapEffects } = await import('./bootstrapEffects');

    registerBootstrapEffects(dispatch);
    await emitEvent('app/user/fetch');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain('Failed to fetch user');
    expect(warnSpy.mock.calls[0]?.[1]).toBe(error);
    expect(mockGetService).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('clears header loading when service lookup throws synchronously', async () => {
    const warnSpy = mockConsoleWarn();
    const error = new Error('registry misconfigured');
    mockHas.mockReturnValue(true);
    mockGetService.mockImplementation(() => {
      throw error;
    });
    const dispatch = vi.fn();
    const { registerBootstrapEffects } = await import('./bootstrapEffects');

    registerBootstrapEffects(dispatch);
    await emitEvent('app/user/fetch');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain('Failed to fetch user');
    expect(warnSpy.mock.calls[0]?.[1]).toBe(error);
    expect(getDispatchedActions(dispatch)).toEqual([
      setHeaderLoading(true),
      setHeaderLoading(false),
    ]);
  });

  it('dispatches header slice actions when the bootstrap adapter receives app/user/loaded', async () => {
    const dispatch = vi.fn();
    const { registerBootstrapEffects } = await import('./bootstrapEffects');

    registerBootstrapEffects(dispatch);
    await emitEvent('app/user/loaded', {
      user: {
        id: 'user-grace',
        firstName: 'Grace',
        lastName: '  ',
        email: '',
        role: UserRole.User,
        language: Language.English,
        avatarUrl: undefined,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    });

    expect(getDispatchedActions(dispatch)).toContainEqual(setUser({
      displayName: 'Grace',
      email: undefined,
      avatarUrl: undefined,
    }));
  });

  it('applies the fetched user\'s language when nothing is stored', async () => {
    mockHas.mockReturnValue(true);
    mockGetService.mockReturnValue({
      getCurrentUser: {
        fetch: vi.fn().mockResolvedValue({
          user: {
            id: 'user-ada',
            firstName: 'Ada',
            lastName: 'Lovelace',
            email: 'ada@example.com',
            role: UserRole.User,
            language: Language.German,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        }),
      },
    });
    const dispatch = vi.fn();
    const { registerBootstrapEffects } = await import('./bootstrapEffects');

    registerBootstrapEffects(dispatch);
    await emitEvent('app/user/fetch');

    // Storage holds no usable choice, so the profile is the default: the
    // change goes out on the same event every other language change uses.
    expect(languageChanges).toEqual([Language.German]);
  });

  it('keeps the stored choice when the fetched user\'s language differs', async () => {
    // The shell applied what an earlier session stored, before the user came.
    // Stored English against a German profile: the registry is still on its
    // startup English here, so if the stored-choice guard went missing the
    // profile language would be emitted and this test would fail.
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, Language.English);
    mockHas.mockReturnValue(true);
    mockGetService.mockReturnValue({
      getCurrentUser: {
        fetch: vi.fn().mockResolvedValue({
          user: {
            id: 'user-ada',
            firstName: 'Ada',
            lastName: 'Lovelace',
            email: 'ada@example.com',
            role: UserRole.User,
            language: Language.German,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        }),
      },
    });
    const dispatch = vi.fn();
    const { registerBootstrapEffects } = await import('./bootstrapEffects');

    registerBootstrapEffects(dispatch);
    await emitEvent('app/user/fetch');

    // The stored choice wins: the profile language is no change to announce,
    // and nothing of it is stored either.
    expect(languageChanges).toEqual([]);
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe(Language.English);
  });

  it('does not apply the fetched user\'s language when it is outside the project list', async () => {
    mockHas.mockReturnValue(true);
    mockGetService.mockReturnValue({
      getCurrentUser: {
        fetch: vi.fn().mockResolvedValue({
          user: {
            id: 'user-ada',
            firstName: 'Ada',
            lastName: 'Lovelace',
            email: 'ada@example.com',
            role: UserRole.User,
            language: 'fr' as Language,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        }),
      },
    });
    const dispatch = vi.fn();
    const { registerBootstrapEffects } = await import('./bootstrapEffects');

    registerBootstrapEffects(dispatch);
    await emitEvent('app/user/fetch');

    expect(languageChanges).toEqual([]);
  });

  describe('the session end', () => {
    const ada = {
      id: 'user-ada',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      role: UserRole.User,
      language: Language.English,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const adaInHeader = setUser({ displayName: 'Ada Lovelace', email: 'ada@example.com', avatarUrl: undefined });

    /** The runtime slice the effect reads: the session check, and the provider `readOnProviderInUse` compares. */
    const runtime = (checkAuth: () => Promise<{ authenticated: boolean }>) =>
      ({ provider: {}, checkAuth: vi.fn(checkAuth) }) as unknown as AuthRuntime & {
        checkAuth: ReturnType<typeof vi.fn>;
      };

    const accountsAnswering = (fetch: ReturnType<typeof vi.fn>) => {
      mockHas.mockReturnValue(true);
      mockGetService.mockReturnValue({ getCurrentUser: { fetch } });
    };

    it('clears the header user on auth/loggedOut', async () => {
      const dispatch = vi.fn();
      const { registerBootstrapEffects } = await import('./bootstrapEffects');

      registerBootstrapEffects(dispatch);
      await emitEvent('auth/loggedOut');

      expect(getDispatchedActions(dispatch)).toEqual([clearUser()]);
    });

    it('a real sign-out asks for the user again and requests nothing', async () => {
      const fetch = vi.fn().mockResolvedValue({ user: ada });
      accountsAnswering(fetch);
      let authenticated = true;
      const auth = runtime(async () => ({ authenticated }));
      const dispatch = vi.fn();
      const { registerBootstrapEffects } = await import('./bootstrapEffects');
      registerBootstrapEffects(dispatch, auth);
      await emitEvent('app/user/fetch');
      expect(headerStateAfter(dispatch).user).toEqual(adaInHeader.payload);

      authenticated = false;
      await emitEvent('auth/loggedOut');
      await vi.waitFor(() => expect(auth.checkAuth).toHaveBeenCalledTimes(2));
      await vi.waitFor(() => expect(headerStateAfter(dispatch)).toEqual({ user: null, loading: false }));

      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('brings the user back when the session check contradicts auth/loggedOut', async () => {
      // A logout from code that rejected while the session lived on, or a
      // provider's spurious report: the announcement clears, the check says
      // signed in.
      const fetch = vi.fn().mockResolvedValue({ user: ada });
      accountsAnswering(fetch);
      const dispatch = vi.fn();
      const { registerBootstrapEffects } = await import('./bootstrapEffects');
      registerBootstrapEffects(dispatch, runtime(async () => ({ authenticated: true })));
      await emitEvent('app/user/fetch');

      await emitEvent('auth/loggedOut');
      expect(headerStateAfter(dispatch).user).toBeNull();
      await vi.waitFor(() => expect(headerStateAfter(dispatch)).toEqual({
        user: adaInHeader.payload,
        loading: false,
      }));
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    // A profile language other than the default, so a dropped answer that
    // still applied its language would show as a change.
    const adaInGerman = { ...ada, language: Language.German };

    it('drops a user fetch that was in flight when the session ended, its profile language included', async () => {
      let land!: (value: unknown) => void;
      const fetch = vi.fn(() => new Promise((resolve) => (land = resolve)));
      accountsAnswering(fetch);
      let authenticated = true;
      const dispatch = vi.fn();
      const { registerBootstrapEffects } = await import('./bootstrapEffects');
      registerBootstrapEffects(dispatch, runtime(async () => ({ authenticated })));

      const fetching = emitEvent('app/user/fetch');
      await vi.waitFor(() => expect(land).toBeTypeOf('function'));
      authenticated = false;
      await emitEvent('auth/loggedOut');
      land({ user: adaInGerman });
      await fetching;
      await vi.waitFor(() => expect(headerStateAfter(dispatch)).toEqual({ user: null, loading: false }));

      // The dropped fetch leaves the loading state to the sign-out, whose
      // clear ends it, and to the fetch the sign-out asks for, whose check
      // answers signed out: nothing stays loading with no fetch behind it.
      expect(getDispatchedActions(dispatch)).toEqual([
        setHeaderLoading(true),
        clearUser(),
        setHeaderLoading(true),
        clearUser(),
        setHeaderLoading(false),
      ]);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(languageChanges).toEqual([]);
    });

    const grace = { ...ada, id: 'user-grace', firstName: 'Grace', lastName: 'Hopper', email: 'grace@example.com' };
    const graceInHeader = setUser({ displayName: 'Grace Hopper', email: 'grace@example.com', avatarUrl: undefined });

    /** A current-user request per call, each answered when the case says. */
    const accountsAnsweringEachLater = () => {
      const answers: Array<(value: unknown) => void> = [];
      accountsAnswering(vi.fn(() => new Promise((resolve) => answers.push(resolve))));
      return answers;
    };

    it.each([
      ['the session ended and another one started', ['auth/loggedOut', 'auth/loggedIn']],
      ['another account signed in with no sign-out before it', ['auth/loggedIn']],
    ])('drops a user fetch that was in flight when %s, and names the new account', async (_name, events) => {
      const answers = accountsAnsweringEachLater();
      const dispatch = vi.fn();
      const { registerBootstrapEffects } = await import('./bootstrapEffects');
      registerBootstrapEffects(dispatch);

      // The header names the previous account, and asks for it again.
      const first = emitEvent('app/user/fetch');
      await vi.waitFor(() => expect(answers).toHaveLength(1));
      answers[0]({ user: ada });
      await first;
      expect(headerStateAfter(dispatch).user).toEqual(adaInHeader.payload);
      const fetching = emitEvent('app/user/fetch');
      await vi.waitFor(() => expect(answers).toHaveLength(2));

      for (const event of events) await emitEvent(event);
      // Each event dropped the previous account's user and asked again.
      await vi.waitFor(() => expect(answers).toHaveLength(2 + events.length));
      expect(headerStateAfter(dispatch).user).toBeNull();

      // Every answer but the one asked for under the last event is stale.
      for (const answer of answers.slice(1, -1)) answer({ user: adaInGerman });
      await fetching;
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(headerStateAfter(dispatch).user).toBeNull();
      expect(languageChanges).not.toContain(Language.German);

      answers[answers.length - 1]({ user: grace });
      await vi.waitFor(() => expect(headerStateAfter(dispatch)).toEqual({
        user: graceInHeader.payload,
        loading: false,
      }));
      // Ada was named once, by the fetch that finished in her session.
      expect(getDispatchedActions(dispatch).filter((action) => isEqual(action, adaInHeader))).toHaveLength(1);
    });

    it('a dropped fetch that lands while a newer one is out leaves the header loading', async () => {
      const answers = accountsAnsweringEachLater();
      const dispatch = vi.fn();
      const { registerBootstrapEffects } = await import('./bootstrapEffects');
      registerBootstrapEffects(dispatch);

      const fetching = emitEvent('app/user/fetch');
      await vi.waitFor(() => expect(answers).toHaveLength(1));
      await emitEvent('auth/loggedIn');
      await vi.waitFor(() => expect(answers).toHaveLength(2));

      answers[0]({ user: ada });
      await fetching;
      expect(headerStateAfter(dispatch)).toEqual({ user: null, loading: true });

      answers[1]({ user: grace });
      await vi.waitFor(() => expect(headerStateAfter(dispatch)).toEqual({
        user: graceInHeader.payload,
        loading: false,
      }));
    });

    it('ignores a screen\'s app/user/loaded while signed out, and takes it again after auth/loggedIn', async () => {
      const dispatch = vi.fn();
      const { registerBootstrapEffects } = await import('./bootstrapEffects');
      registerBootstrapEffects(dispatch);

      await emitEvent('auth/loggedOut');
      await emitEvent('app/user/loaded', { user: ada });
      expect(getDispatchedActions(dispatch)).toEqual([clearUser()]);

      // `auth/loggedIn` clears again and asks for the user, which this case's
      // registry has no service for.
      await emitEvent('auth/loggedIn');
      await emitEvent('app/user/loaded', { user: ada });
      expect(getDispatchedActions(dispatch)).toEqual([clearUser(), clearUser(), adaInHeader]);
    });

    it('fetches no user when the session check says signed out', async () => {
      const fetch = vi.fn().mockResolvedValue({ user: ada });
      accountsAnswering(fetch);
      const auth = runtime(async () => ({ authenticated: false }));
      const dispatch = vi.fn();
      const { registerBootstrapEffects } = await import('./bootstrapEffects');

      registerBootstrapEffects(dispatch, auth);
      await emitEvent('app/user/fetch');

      expect(auth.checkAuth).toHaveBeenCalledTimes(1);
      expect(fetch).not.toHaveBeenCalled();
      expect(getDispatchedActions(dispatch)).toEqual([setHeaderLoading(true), clearUser(), setHeaderLoading(false)]);
    });

    it('a page loaded signed out ignores a screen\'s app/user/loaded', async () => {
      // The start of a signed-out page announces nothing; the fetch's session
      // check is what tells the effect.
      accountsAnswering(vi.fn().mockResolvedValue({ user: ada }));
      const dispatch = vi.fn();
      const { registerBootstrapEffects } = await import('./bootstrapEffects');
      registerBootstrapEffects(dispatch, runtime(async () => ({ authenticated: false })));

      await emitEvent('app/user/fetch');
      await emitEvent('app/user/loaded', { user: ada });

      expect(getDispatchedActions(dispatch)).toEqual([setHeaderLoading(true), clearUser(), setHeaderLoading(false)]);
    });

    it.each([
      ['signed out, the header ends with no user', false, null],
      ['signed in, the screen\'s user stays until the fetch answers', true, adaInHeader.payload],
    ])('a screen\'s app/user/loaded during the page\'s first session check, which answers %s', async (_name, authenticated, user) => {
      let answerCheck!: (value: { authenticated: boolean }) => void;
      let land!: (value: unknown) => void;
      accountsAnswering(vi.fn(() => new Promise((resolve) => (land = resolve))));
      const dispatch = vi.fn();
      const { registerBootstrapEffects } = await import('./bootstrapEffects');
      registerBootstrapEffects(dispatch, runtime(() => new Promise((resolve) => (answerCheck = resolve))));

      const fetching = emitEvent('app/user/fetch');
      await vi.waitFor(() => expect(answerCheck).toBeTypeOf('function'));
      await emitEvent('app/user/loaded', { user: ada });
      expect(headerStateAfter(dispatch)).toEqual({ user: adaInHeader.payload, loading: false });

      answerCheck({ authenticated });
      if (authenticated) {
        await vi.waitFor(() => expect(land).toBeTypeOf('function'));
        expect(headerStateAfter(dispatch)).toEqual({ user, loading: false });
        land({ user: grace });
        await fetching;
        expect(headerStateAfter(dispatch)).toEqual({ user: graceInHeader.payload, loading: false });
      } else {
        await fetching;
        expect(headerStateAfter(dispatch)).toEqual({ user, loading: false });
      }
    });

    it('a session check that says signed in takes a screen\'s app/user/loaded again', async () => {
      // A failed sign-out announced `auth/loggedOut`, and the header asks
      // again: the session lived, so the page is not signed out.
      accountsAnswering(vi.fn().mockResolvedValue({ user: ada }));
      const dispatch = vi.fn();
      const { registerBootstrapEffects } = await import('./bootstrapEffects');
      registerBootstrapEffects(dispatch, runtime(async () => ({ authenticated: true })));

      await emitEvent('auth/loggedOut');
      await emitEvent('app/user/fetch');
      dispatch.mockClear();
      await emitEvent('app/user/loaded', { user: ada });

      expect(getDispatchedActions(dispatch)).toEqual([adaInHeader]);
    });

    it('a session check answered across a sign-out does not count as signed in', async () => {
      const answers: Array<(value: { authenticated: boolean }) => void> = [];
      accountsAnswering(vi.fn().mockResolvedValue({ user: ada }));
      const dispatch = vi.fn();
      const { registerBootstrapEffects } = await import('./bootstrapEffects');
      registerBootstrapEffects(dispatch, runtime(() => new Promise((resolve) => answers.push(resolve))));

      const fetching = emitEvent('app/user/fetch');
      await vi.waitFor(() => expect(answers).toHaveLength(1));
      await emitEvent('auth/loggedOut');
      // The sign-out asks again, and its own check answers signed out.
      await vi.waitFor(() => expect(answers).toHaveLength(2));
      answers[0]({ authenticated: true });
      answers[1]({ authenticated: false });
      await fetching;
      await new Promise((resolve) => setTimeout(resolve, 0));
      await emitEvent('app/user/loaded', { user: ada });

      expect(getDispatchedActions(dispatch)).not.toContainEqual(adaInHeader);
    });

    it.each([
      ['says signed in', () => Promise.resolve({ authenticated: true })],
      ['rejects', () => Promise.reject(new Error('down'))],
      [
        'throws synchronously',
        (): Promise<{ authenticated: boolean }> => {
          throw new Error('no provider');
        },
      ],
    ])('fetches the user when the session check %s', async (_name, checkAuth) => {
      const fetch = vi.fn().mockResolvedValue({ user: ada });
      accountsAnswering(fetch);
      const dispatch = vi.fn();
      const { registerBootstrapEffects } = await import('./bootstrapEffects');

      registerBootstrapEffects(dispatch, runtime(checkAuth));
      await emitEvent('app/user/fetch');

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(getDispatchedActions(dispatch)).toEqual([setHeaderLoading(true), adaInHeader, setHeaderLoading(false)]);
    });
  });
});
