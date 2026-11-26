import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TextDirection } from '@gears-frontx/react';
import { FRONTX_SHARED_PROPERTY_LANGUAGE } from '../../shellContract';
import type { AuthLoginInput, AuthRuntime } from '@gears-frontx/react';
import { createMfeBridgeFixture } from '@frontx-test-utils/createMfeBridgeFixture';
import { mockShadowHost } from '@frontx-test-utils/mockShadowHost';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SIGNIN_MODAL_EXTENSION_ID } from '../../shared/extension-ids';

const { useScreenTranslationsMock } = vi.hoisted(() => ({
  useScreenTranslationsMock: vi.fn(),
}));

vi.mock('../../shared/useScreenTranslations', () => ({
  useScreenTranslations: useScreenTranslationsMock,
}));

/**
 * The joined runtime the modal signs in through, faked at its own seam: the
 * modal's contract is "call login on the runtime it is handed", so the double
 * here answers only that.
 */
const login = vi.fn<(input: AuthLoginInput) => Promise<{ type: 'none' }>>();

/**
 * The `auth` prop one case configures: a runtime with `login`, a runtime
 * without one (`login` is optional on the contract), or none at all, the
 * state a failed join leaves.
 */
type RuntimeShape = 'login' | 'no-login' | 'join-failed';

function joinedRuntime(shape: RuntimeShape): AuthRuntime | undefined {
  if (shape === 'join-failed') return undefined;
  return (shape === 'login' ? { login } : {}) as unknown as AuthRuntime;
}

type SetupOptions = {
  runtime?: RuntimeShape;
  loginResult?: Promise<{ type: 'none' }>;
};

async function setupSignInModal({ runtime = 'login', loginResult }: SetupOptions = {}) {
  if (loginResult) {
    login.mockReturnValue(loginResult);
    // The refusal is the component's to catch once it submits; marking the
    // promise handled here keeps a click that never arrives from reporting
    // the same rejection a second time, as an unhandled one.
    loginResult.catch(() => undefined);
  }

  const { SignInModal } = await import('./SignInModal');
  const executeActionsChain = vi.fn().mockReturnValue(undefined);
  const bridgeFixture = createMfeBridgeFixture({
    extDomainId: 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.popup.v1',
    extensionId: SIGNIN_MODAL_EXTENSION_ID,
    executeActionsChain,
  });

  // Raised before the render, so the screen's mount effect has a host to write
  // its direction on. Attached afterwards, that first pass reaches no host at
  // all and the initial LTR direction would be asserted by nothing.
  const { host } = mockShadowHost(HTMLDivElement);
  render(<SignInModal bridge={bridgeFixture.bridge} auth={joinedRuntime(runtime)} />);

  await screen.findByRole('heading', { level: 1 });

  return { executeActionsChain, bridgeFixture, host };
}

describe('SignInModal', () => {
  beforeEach(() => {
    // The screen tests of this package assert the translation keys, not any
    // locale's wording, so the hook is a double like theirs; the locale files
    // themselves are data, not this file's subject.
    useScreenTranslationsMock.mockReturnValue({ t: (key: string) => key, loading: false });
    login.mockResolvedValue({ type: 'none' });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('signs in through the joined realm runtime with exactly the typed credentials', async () => {
    const { executeActionsChain, host } = await setupSignInModal();

    // The direction lands on the shadow host, not on the screen root, and the
    // modal opens before any language property says otherwise.
    expect(host.dir).toBe(TextDirection.LeftToRight);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('username_label'), 'dev');
    await user.type(screen.getByLabelText('password_label'), 'secret');
    await user.click(screen.getByRole('button', { name: 'submit' }));

    await waitFor(() => {
      expect(login).toHaveBeenCalledTimes(1);
    });
    // The payload is the typed values and nothing else: no bridge metadata
    // rides along, and the type names the one scheme this form offers.
    expect(login).toHaveBeenCalledWith({
      type: 'password',
      payload: { username: 'dev', password: 'secret' },
    });
    // The sign-in stays off the bridge: the shell's own sign_in action ends
    // the flow once this login starts a session.
    expect(executeActionsChain).not.toHaveBeenCalled();
  });

  it('shows the error line and keeps the form when the login is refused', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const refusal = new Error('the credentials are empty');
    const { executeActionsChain } = await setupSignInModal({ loginResult: Promise.reject(refusal) });

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('username_label'), 'dev');
    await user.type(screen.getByLabelText('password_label'), 'nope');
    await user.click(screen.getByRole('button', { name: 'submit' }));

    // The line appears, the form stays filled for a corrected second attempt,
    // and no chain leaves the modal: a refused login is this modal's own
    // failure to show, not a message for the shell.
    const errorLine = await screen.findByRole('alert');
    expect(errorLine.textContent).toBe('error');
    expect((screen.getByLabelText('username_label') as HTMLInputElement).value).toBe('dev');
    expect((screen.getByLabelText('password_label') as HTMLInputElement).value).toBe('nope');
    expect(executeActionsChain).not.toHaveBeenCalled();

    // The refusal turns the submit back on, so the corrected attempt can go
    // out, and the provider's own reason lands on the console, like the join
    // warning `init-signin.ts` logs.
    expect(screen.getByRole('button', { name: 'submit' })).toHaveProperty('disabled', false);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toBe('[SignInModal] login failed');
    expect(warnSpy.mock.calls[0]?.[1]).toBe(refusal);
  });

  it.each<RuntimeShape>(['join-failed', 'no-login'])(
    'renders the unavailable error line instead of a form when the runtime is %s',
    async (runtime) => {
      const { executeActionsChain } = await setupSignInModal({ runtime });

      // Nothing to sign in through: the error line carries the one message
      // this state can honestly offer, and no login could have been called.
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('title');
      expect(screen.getByRole('alert').textContent).toBe('unavailable');
      expect(screen.queryByRole('button')).toBeNull();
      expect(login).not.toHaveBeenCalled();
      expect(executeActionsChain).not.toHaveBeenCalled();
    },
  );

  it('keeps the busy submit while the login is in flight and sends no chain meanwhile', async () => {
    let settleLogin: ((value: { type: 'none' }) => void) | undefined;
    const { executeActionsChain } = await setupSignInModal({
      loginResult: new Promise((resolve) => {
        settleLogin = resolve;
      }),
    });

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('username_label'), 'dev');
    await user.type(screen.getByLabelText('password_label'), 'secret');
    await user.click(screen.getByRole('button', { name: 'submit' }));

    // The request is outstanding: the submit shows its busy label and is
    // disabled, and the chain the shell waits on is still the only one in the
    // flow (none from here).
    const busyButton = await screen.findByRole('button', { name: 'submitting' });
    expect(busyButton).toHaveProperty('disabled', true);
    expect(login).toHaveBeenCalledTimes(1);

    // A second submit is refused while the first is in flight: the guard
    // holds before any re-render, so the login count does not move.
    fireEvent.submit(busyButton.closest('form') as HTMLFormElement);
    expect(login).toHaveBeenCalledTimes(1);
    expect(executeActionsChain).not.toHaveBeenCalled();

    // The login resolves: the session has started and the shell unmounts this
    // modal with its reload, so the submit stays busy and disabled here, and
    // a submit that still arrives then starts no second login.
    await act(async () => {
      settleLogin?.({ type: 'none' });
    });
    expect(screen.getByRole('button', { name: 'submitting' })).toHaveProperty('disabled', true);
    // The resolved login took the typed password out of state and the DOM
    // instead of holding it until the shell takes the modal down.
    expect((screen.getByLabelText('password_label') as HTMLInputElement).value).toBe('');
    fireEvent.submit(busyButton.closest('form') as HTMLFormElement);
    expect(login).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(executeActionsChain).not.toHaveBeenCalled();
  });

  it('refuses a submit with a blank field without calling the provider', async () => {
    const { executeActionsChain } = await setupSignInModal();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('username_label'), 'dev');
    await user.click(screen.getByRole('button', { name: 'submit' }));

    // The password is blank, so nothing goes out: the error line is the answer
    // the provider would have given, decided before any request is made.
    expect((await screen.findByRole('alert')).textContent).toBe('error');
    expect(login).not.toHaveBeenCalled();
    expect(executeActionsChain).not.toHaveBeenCalled();
    // The filled field stays and the submit stays usable, so the blank one is
    // the only thing left to correct.
    expect((screen.getByLabelText('username_label') as HTMLInputElement).value).toBe('dev');
    expect(screen.getByRole('button', { name: 'submit' })).toHaveProperty('disabled', false);
  });

  it('keeps the form in the document with the focus kept when a later load begins', async () => {
    const { bridgeFixture } = await setupSignInModal();

    // A keyboard user has just reached the password field, so it holds the focus.
    const password = screen.getByLabelText('password_label');
    password.focus();
    expect(document.activeElement).toBe(password);

    // The language property comes back changed while the dictionary for it is
    // still loading. That is a later load, not the first one: the form stays
    // mounted and keeps the focus instead of giving way to the placeholder,
    // and the busy mark on the screen announces the load.
    useScreenTranslationsMock.mockReturnValue({ t: (key: string) => key, loading: true });
    await act(async () => {
      bridgeFixture.setProperty(FRONTX_SHARED_PROPERTY_LANGUAGE, 'de');
    });

    expect(screen.getByLabelText('password_label')).toBe(password);
    expect(password.isConnected).toBe(true);
    expect(document.activeElement).toBe(password);
    expect(password.closest('[aria-busy="true"]')).toBeTruthy();
  });
});
