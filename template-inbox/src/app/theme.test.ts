import { act, createElement } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { stubMatchMedia } from '../__test-utils__/matchMedia';
import { applyStoredTheme, DARK_SCHEME_QUERY, readAppliedTheme, useTheme, type Theme } from './theme';

const STORAGE_KEY = 'frontx.inbox.theme';

/** Answers the dark-scheme query the way a system set to `scheme` would. */
const stubSystemScheme = (scheme: Theme) => stubMatchMedia(scheme === 'dark' ? [DARK_SCHEME_QUERY] : []);

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
    render(createElement(ThemeProbe));

    expect(screen.getByRole('button').textContent).toBe('dark');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();

    act(() => {
      screen.getByRole('button').click();
    });

    expect(screen.getByRole('button').textContent).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('light');
  });

  it('follows a system scheme change while nothing is stored', () => {
    const system = stubSystemScheme('light');
    render(createElement(ThemeProbe));
    expect(screen.getByRole('button').textContent).toBe('light');

    act(() => system.setMatching([DARK_SCHEME_QUERY]));
    expect(screen.getByRole('button').textContent).toBe('dark');
  });

  it('keeps an explicit choice when the system scheme changes', () => {
    const system = stubSystemScheme('light');
    render(createElement(ThemeProbe));
    act(() => {
      screen.getByRole('button').click();
    });
    expect(screen.getByRole('button').textContent).toBe('dark');

    act(() => system.setMatching([]));
    expect(screen.getByRole('button').textContent).toBe('dark');
  });
});
