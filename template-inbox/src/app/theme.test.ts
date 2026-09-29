import { act, createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderScreen } from '../__test-utils__/renderScreen';
import { applyStoredTheme, readAppliedTheme, useTheme, type Theme } from './theme';

const STORAGE_KEY = 'frontx.inbox.theme';

/** Answers the dark-scheme query the way a system set to `scheme` would. */
const stubSystemScheme = (scheme: Theme): void => {
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    matches: scheme === 'dark' && query === '(prefers-color-scheme: dark)',
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }));
};

describe('applyStoredTheme', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('follows a dark system theme when nobody has chosen, and leaves the attribute unset', () => {
    stubSystemScheme('dark');
    expect(applyStoredTheme()).toBe('dark');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('follows a light system theme when nobody has chosen', () => {
    stubSystemScheme('light');
    expect(applyStoredTheme()).toBe('light');
    expect(readAppliedTheme()).toBe('light');
  });

  it('honours a stored choice over the system theme, so a reload does not undo the toggle', () => {
    stubSystemScheme('dark');
    window.localStorage.setItem(STORAGE_KEY, 'light');
    expect(applyStoredTheme()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('falls back to the system theme rather than trusting a corrupted value', () => {
    stubSystemScheme('dark');
    window.localStorage.setItem(STORAGE_KEY, 'solarized');
    expect(applyStoredTheme()).toBe('dark');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});

describe('useTheme', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  function ThemeProbe() {
    const { theme, toggleTheme } = useTheme();
    return createElement('button', { type: 'button', onClick: toggleTheme }, theme);
  }

  it('stores nothing on mount, and stores and applies the choice on toggle', () => {
    stubSystemScheme('dark');
    const screen = renderScreen(createElement(ThemeProbe));

    expect(screen.getByRole('button').textContent).toBe('dark');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();

    act(() => {
      screen.getByRole('button').click();
    });

    expect(screen.getByRole('button').textContent).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('light');

    screen.unmount();
  });
});
