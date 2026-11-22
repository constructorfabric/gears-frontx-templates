/**
 * The header's user menu, in both renderings: the kit's dropdown menu the
 * shell ships with and the plain disclosure the no-UI-kit variants ask for.
 * The menu exists only for an app with an auth runtime, and its one item ends
 * the session through the runtime's `logout()` and reloads the page when it
 * resolves; what the runtime announces then (the header user cleared and asked
 * for again) is the effects' own, tested beside them; a failed sign-out and
 * the start-up check after the reload are tested through the real runtime in
 * `mfe/modalSignIn.test.tsx`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Header } from './Header';

// The reload seam, replaced: jsdom implements no navigation.
const reloadPage = vi.hoisted(() => vi.fn());
vi.mock('@/app/mfe/pageReload', () => ({ reloadPage }));

const frontx = vi.hoisted(() => ({ current: {} as { auth?: unknown } }));

vi.mock('@gears-frontx/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@gears-frontx/react')>()),
  useAppSelector: () => ({ user: { displayName: 'Alex Rivera' }, loading: false }),
  useFrontX: () => frontx.current,
  // The stub echoes every key, so the header reads the English words.
  useTranslation: () => ({
    t: (key: string) => key,
    language: 'en',
    setLanguage: () => {},
    isRTL: false,
  }),
}));

/** The runtime slice the menu calls: `logout`. */
function withAuth(logout: () => Promise<unknown>) {
  const auth = { logout: vi.fn(logout) };
  frontx.current = { auth };
  return auth;
}

/**
 * The menu's trigger: a button in the kit rendering; in the plain one the
 * disclosure's `summary`, which browsers expose as the disclosure's button and
 * jsdom gives no role, so it is found by the name it carries.
 */
const trigger = (languageControl: 'kit' | 'plain'): HTMLElement =>
  languageControl === 'kit'
    ? screen.getByRole('button', { name: 'Alex Rivera' })
    : screen.getByLabelText('Alex Rivera', { selector: 'summary' });

/** Lets the promises a click started run to their end. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe.each([
  ['the kit dropdown menu', 'kit'],
  ['the plain disclosure', 'plain'],
] as const)('the header user menu as %s', (_name, languageControl) => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    frontx.current = {};
    reloadPage.mockReset();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  /** Opens the menu from its trigger and picks "Sign out". */
  const signOut = async () => {
    const user = userEvent.setup();
    await user.click(trigger(languageControl));
    if (languageControl === 'kit') {
      await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
    } else {
      await user.click(screen.getByRole('button', { name: 'Sign out' }));
    }
    await flush();
  };

  it('offers no sign-out to an app without an auth runtime', () => {
    render(<Header languageControl={languageControl} />);

    expect(screen.getByText('Alex Rivera')).toBeTruthy();
    expect(screen.queryByLabelText('Alex Rivera')).toBeNull();
    expect(screen.queryByText('Sign out')).toBeNull();
  });

  it('makes the user block a button named by the user, and its one item calls logout once and reloads the page', async () => {
    const auth = withAuth(async () => ({ type: 'none' }));
    render(<Header languageControl={languageControl} />);

    await signOut();

    expect(auth.logout).toHaveBeenCalledTimes(1);
    expect(reloadPage).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it('does not reload over a redirect transition: the provider navigates itself', async () => {
    const auth = withAuth(async () => ({ type: 'redirect', redirectUrl: 'https://id.example.com/logout' }));
    render(<Header languageControl={languageControl} />);

    await signOut();

    expect(auth.logout).toHaveBeenCalledTimes(1);
    expect(reloadPage).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns about a logout that rejects, reloads nothing, and the control works again', async () => {
    const auth = withAuth(async () => {
      throw new Error('the sign-in service is down');
    });
    render(<Header languageControl={languageControl} />);

    await signOut();
    await waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    expect(String(warn.mock.calls[0]?.[0])).toContain('sign-out failed');
    expect(reloadPage).not.toHaveBeenCalled();

    await signOut();
    expect(auth.logout).toHaveBeenCalledTimes(2);
    expect(reloadPage).not.toHaveBeenCalled();
  });

  it('warns about a logout that throws synchronously, reloads nothing, without an unhandled rejection', async () => {
    const auth = withAuth(() => {
      throw new Error('no provider bound');
    });
    render(<Header languageControl={languageControl} />);

    await signOut();

    expect(auth.logout).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('sign-out failed');
    expect(reloadPage).not.toHaveBeenCalled();
  });

  it('calls logout in the turn of the click, so a provider replaced right after it does not get the call', async () => {
    const providerB = { logout: vi.fn(async () => ({ type: 'none' })) };
    const providerA = { logout: vi.fn(async () => ({ type: 'none' })) };
    const runtime = { provider: providerA };
    const auth = withAuth(() => runtime.provider.logout());
    render(<Header languageControl={languageControl} />);
    const user = userEvent.setup();
    await user.click(trigger(languageControl));
    const item =
      languageControl === 'kit'
        ? await screen.findByRole('menuitem', { name: 'Sign out' })
        : screen.getByRole('button', { name: 'Sign out' });

    // The click and the replacement run in one synchronous turn.
    fireEvent.click(item);
    runtime.provider = providerB;
    await flush();

    expect(auth.logout).toHaveBeenCalledTimes(1);
    expect(providerA.logout).toHaveBeenCalledTimes(1);
    expect(providerB.logout).not.toHaveBeenCalled();
  });

  it('does not repeat a logout that rejects after a provider replacement on the provider in use', async () => {
    // Sign out is clicked under provider A; B replaces A and a session starts
    // on B; A's call then rejects as replaced. A read would be asked again of
    // B, but this is a mutation: B's new session must not be ended.
    const providerB = { logout: vi.fn(async () => ({ type: 'none' })) };
    const providerA = {
      logout: vi.fn(async () => {
        runtime.provider = providerB;
        throw new Error('the session provider was replaced');
      }),
    };
    const runtime: { provider: { logout: () => Promise<unknown> } } = { provider: providerA };
    const auth = withAuth(() => runtime.provider.logout());
    // The runtime's `provider` is the one in use, as the realm reports it.
    Object.defineProperty(auth, 'provider', { get: () => runtime.provider });
    render(<Header languageControl={languageControl} />);

    await signOut();
    await flush();

    expect(providerB.logout).not.toHaveBeenCalled();
    expect(providerA.logout).toHaveBeenCalledTimes(1);
    expect(auth.logout).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    expect(reloadPage).not.toHaveBeenCalled();
  });
});

describe('the header user menu as the kit dropdown menu', () => {
  it('opens from the keyboard and follows the menu roles', async () => {
    withAuth(async () => ({ type: 'none' }));
    render(<Header />);
    const trigger = screen.getByRole('button', { name: 'Alex Rivera' });
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');

    trigger.focus();
    await userEvent.keyboard('{Enter}');

    const menu = await screen.findByRole('menu');
    expect(menu.querySelectorAll('[role="menuitem"]')).toHaveLength(1);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('the header user menu as the plain disclosure', () => {
  it('closes the disclosure once "Sign out" is picked', async () => {
    withAuth(async () => ({ type: 'none' }));
    render(<Header languageControl="plain" />);
    const details = trigger('plain').closest('details')!;

    await userEvent.click(trigger('plain'));
    expect(details.open).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(details.open).toBe(false);
  });

  it('hands focus back to the user block after "Sign out" by keyboard', async () => {
    const auth = withAuth(async () => ({ type: 'none' }));
    render(<Header languageControl="plain" />);
    const summary = trigger('plain');
    const details = summary.closest('details')!;
    const user = userEvent.setup();

    await user.click(summary);
    screen.getByRole('button', { name: 'Sign out' }).focus();
    await user.keyboard('{Enter}');

    expect(auth.logout).toHaveBeenCalledTimes(1);
    expect(details.open).toBe(false);
    expect(document.activeElement).toBe(summary);
  });

  it('closes when focus moves out of it, and stays open while focus moves inside it', async () => {
    withAuth(async () => ({ type: 'none' }));
    render(
      <>
        <Header languageControl="plain" />
        <input aria-label="screen field" />
      </>,
    );
    const summary = trigger('plain');
    const details = summary.closest('details')!;
    const user = userEvent.setup();

    await user.click(summary);
    summary.focus();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Sign out' }));
    expect(details.open).toBe(true);

    await user.tab();
    expect(document.activeElement).toBe(screen.getByLabelText('screen field'));
    expect(details.open).toBe(false);
  });

  it('closes on Escape and hands focus back to the user block', async () => {
    withAuth(async () => ({ type: 'none' }));
    render(<Header languageControl="plain" />);
    const summary = trigger('plain');
    const details = summary.closest('details')!;

    await userEvent.click(summary);
    expect(details.open).toBe(true);
    screen.getByRole('button', { name: 'Sign out' }).focus();
    await userEvent.keyboard('{Escape}');

    expect(details.open).toBe(false);
    expect(document.activeElement).toBe(summary);
  });

  it('leaves focus where it is on an Escape while the disclosure is closed', async () => {
    withAuth(async () => ({ type: 'none' }));
    render(
      <>
        <Header languageControl="plain" />
        <input aria-label="screen field" />
      </>,
    );
    const field = screen.getByLabelText('screen field');

    field.focus();
    await userEvent.keyboard('{Escape}');

    expect(trigger('plain').closest('details')!.open).toBe(false);
    expect(document.activeElement).toBe(field);
  });

  it('stays open, and focus stays, on an Escape with focus outside it', async () => {
    withAuth(async () => ({ type: 'none' }));
    render(
      <>
        <Header languageControl="plain" />
        <input aria-label="screen field" />
      </>,
    );
    const summary = trigger('plain');
    const details = summary.closest('details')!;
    const field = screen.getByLabelText('screen field');

    await userEvent.click(summary);
    // Focus is outside an open disclosure it never left for an element (a
    // focus move to an element outside closes it): it went to no element, as
    // after a pointer open in Safari, and then reached the field from there.
    summary.blur();
    expect(details.open).toBe(true);
    field.focus();
    await userEvent.keyboard('{Escape}');

    expect(details.open).toBe(true);
    expect(document.activeElement).toBe(field);
  });

  it('stays open, and focus stays, on an Escape another layer has already handled', async () => {
    withAuth(async () => ({ type: 'none' }));
    render(<Header languageControl="plain" />);
    const summary = trigger('plain');
    const details = summary.closest('details')!;
    // A layer that answers Escape before the document does, as a modal or a
    // popup opened from the keyboard would.
    const handled = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') event.preventDefault();
    };
    document.addEventListener('keydown', handled, { capture: true });

    try {
      await userEvent.click(summary);
      const signOut = screen.getByRole('button', { name: 'Sign out' });
      signOut.focus();
      await userEvent.keyboard('{Escape}');

      expect(details.open).toBe(true);
      expect(document.activeElement).toBe(signOut);
    } finally {
      document.removeEventListener('keydown', handled, { capture: true });
    }
  });

  it('closes on a pointer down outside it, and leaves a pointer down inside to the disclosure', async () => {
    withAuth(async () => ({ type: 'none' }));
    render(
      <>
        <Header languageControl="plain" />
        <p>screen content</p>
      </>,
    );
    const summary = trigger('plain');
    const details = summary.closest('details')!;

    await userEvent.click(summary);
    expect(details.open).toBe(true);
    await userEvent.click(screen.getByText('screen content'));
    expect(details.open).toBe(false);

    // Inside, the disclosure's own toggle decides: a second click on the
    // block closes what the first one opened.
    await userEvent.click(summary);
    expect(details.open).toBe(true);
    await userEvent.click(summary);
    expect(details.open).toBe(false);
  });
});
