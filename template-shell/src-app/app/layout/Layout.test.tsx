import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { eventBus } from '@gears-frontx/react';
import { Layout } from './Layout';

vi.mock('@/app/actions/bootstrapActions', () => ({ fetchCurrentUser: vi.fn() }));

// Every slot Layout composes is stubbed, so what the assertions see is Layout's
// own JSX and nothing the slots decide for themselves.
vi.mock('./Header', () => ({ Header: () => <div data-testid="header" /> }));
// The menu stub carries the two kinds of button the real one renders, marked
// the way `components/ui/sidebar.tsx` marks them: the collapse toggle in its
// header and an item that opens a screen.
vi.mock('./Menu', () => ({
  Menu: () => (
    <div data-testid="menu">
      <button type="button" data-sidebar="menu-button">
        Toggle menu
      </button>
      <ul>
        <li data-sidebar="menu-item">
          <button type="button" data-sidebar="menu-button">
            Profile
          </button>
        </li>
      </ul>
    </div>
  ),
}));
vi.mock('./Sidebar', () => ({ Sidebar: () => <div data-testid="sidebar" /> }));
vi.mock('./Popup', () => ({ Popup: () => <div data-testid="popup" /> }));
vi.mock('./Overlay', () => ({ Overlay: () => <div data-testid="overlay" /> }));
vi.mock('./Screen', () => ({
  Screen: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="screen">{children}</div>
  ),
}));

// `Footer` is deliberately NOT stubbed: a footer mounted here would render for
// real, so the case below fails on the empty band itself rather than on a stub
// standing in for it. The state the selector returns says visible, which is
// the default a shell that never touched `setFooterVisible` gets, and says
// nothing about the menu, which is the expanded default.
let mockLayoutState: { visible?: boolean; collapsed?: boolean } = { visible: true };
let mockMountedScreens: { id: string }[] = [];

vi.mock('@gears-frontx/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@gears-frontx/react')>()),
  useAppSelector: () => mockLayoutState,
  useMountedExtensions: () => mockMountedScreens,
}));

/** Makes every media query report `narrow`, the way a phone-width window would. */
const setViewport = (narrow: boolean) => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: narrow,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
};

const activeSubscriptions: Array<() => void> = [];
const collapseRequests = () => {
  const requests: boolean[] = [];
  const subscription = eventBus.on('layout/menu/collapsed', ({ collapsed }) => {
    requests.push(collapsed);
  });
  const stop = () => subscription.unsubscribe();
  activeSubscriptions.push(stop);
  return { requests, stop };
};

describe('Layout', () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    mockLayoutState = { visible: true };
    mockMountedScreens = [];
    setViewport(false);
  });

  afterEach(() => {
    activeSubscriptions.splice(0).forEach((stop) => stop());
    window.matchMedia = originalMatchMedia;
  });

  it('mounts no footer, having no content to frame in one', () => {
    render(<Layout>screen content</Layout>);

    expect(screen.queryByRole('contentinfo')).toBeNull();
  });

  it('renders the screen children it is given', () => {
    render(<Layout>screen content</Layout>);

    expect(screen.getByTestId('screen').textContent).toBe('screen content');
  });

  describe('on a narrow viewport', () => {
    it('starts with the menu collapsed so the screen gets the width', () => {
      setViewport(true);
      const { requests, stop } = collapseRequests();

      render(<Layout />);
      stop();

      expect(requests).toEqual([true]);
    });

    it('collapses the expanded menu once a screen is opened from it', () => {
      setViewport(true);
      const { rerender } = render(<Layout />);
      const { requests, stop } = collapseRequests();

      mockMountedScreens = [{ id: 'profile' }];
      rerender(<Layout />);
      stop();

      expect(requests).toEqual([true]);
    });

    it('closes the expanded menu from the backdrop beside it', async () => {
      setViewport(true);
      render(<Layout />);
      const { requests, stop } = collapseRequests();

      await userEvent.click(screen.getByRole('button', { name: 'Close menu' }));
      stop();

      expect(requests).toEqual([true]);
    });

    it('collapses the menu when one of its items is chosen, the open screen included', async () => {
      setViewport(true);
      mockMountedScreens = [{ id: 'profile' }];
      render(<Layout />);
      const { requests, stop } = collapseRequests();

      await userEvent.click(screen.getByRole('button', { name: 'Profile' }));
      stop();

      expect(requests).toEqual([true]);
    });

    it('leaves the collapsing to the menu toggle when the toggle is pressed', async () => {
      setViewport(true);
      render(<Layout />);
      const { requests, stop } = collapseRequests();

      await userEvent.click(screen.getByRole('button', { name: 'Toggle menu' }));
      stop();

      expect(requests).toEqual([]);
    });

    it('does not collapse when the user expands a previously collapsed menu', () => {
      setViewport(true);
      mockLayoutState = { visible: true, collapsed: true };
      const { rerender } = render(<Layout />);
      const { requests } = collapseRequests();

      mockLayoutState = { visible: true, collapsed: false };
      rerender(<Layout />);

      expect(requests).toEqual([]);
    });

    it('closes the expanded menu on Escape', async () => {
      setViewport(true);
      render(<Layout />);
      const { requests, stop } = collapseRequests();

      await userEvent.keyboard('{Escape}');
      stop();

      expect(requests).toEqual([true]);
    });

    it('leaves the menu expanded when Escape was already handled', () => {
      setViewport(true);
      render(<Layout />);
      const { requests } = collapseRequests();
      // Another layer handles Escape on its way down, as a dialog's own
      // capture listener would.
      const handled = (event: KeyboardEvent) => event.preventDefault();
      document.addEventListener('keydown', handled, { capture: true });

      try {
        fireEvent.keyDown(document.body, { key: 'Escape', cancelable: true });
      } finally {
        document.removeEventListener('keydown', handled, { capture: true });
      }

      expect(requests).toEqual([]);
    });

    it('takes the screen out of keyboard reach while the menu lies over it', () => {
      setViewport(true);

      render(<Layout>screen content</Layout>);

      expect(screen.getByTestId('screen').closest('[inert]')).not.toBeNull();
      expect(screen.getByTestId('menu').closest('[inert]')).toBeNull();
    });

    it('shows no backdrop while the menu is collapsed', () => {
      setViewport(true);
      mockLayoutState = { visible: true, collapsed: true };

      render(<Layout />);

      expect(screen.queryByRole('button', { name: 'Close menu' })).toBeNull();
    });
  });

  describe('on a wide viewport', () => {
    it('leaves the menu as the user set it, with no backdrop', () => {
      const { requests, stop } = collapseRequests();

      const { rerender } = render(<Layout />);
      mockMountedScreens = [{ id: 'profile' }];
      rerender(<Layout />);
      stop();

      expect(requests).toEqual([]);
      expect(screen.queryByRole('button', { name: 'Close menu' })).toBeNull();
    });

    it('ignores menu item clicks and Escape, and keeps the screen reachable', async () => {
      render(<Layout>screen content</Layout>);
      const { requests, stop } = collapseRequests();

      await userEvent.click(screen.getByRole('button', { name: 'Profile' }));
      await userEvent.keyboard('{Escape}');
      stop();

      expect(requests).toEqual([]);
      expect(screen.getByTestId('screen').closest('[inert]')).toBeNull();
    });
  });
});
