import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderScreen } from '../__test-utils__/renderScreen';
import { AppErrorBoundary } from './ErrorBoundary';
import { t } from '../shared/i18n';

function Broken(): never {
  throw new Error('render failed');
}

describe('AppErrorBoundary', () => {
  it('renders its children while nothing throws', () => {
    const screen = renderScreen(
      <AppErrorBoundary t={t}>
        <p>screen</p>
      </AppErrorBoundary>
    );
    expect(screen.getByText('screen')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('replaces a screen that throws with an alert whose button reloads', () => {
    // React reports the caught error to the console on its own; silenced so
    // the suite's output stays about the suite.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onReload = vi.fn();
    const screen = renderScreen(
      <AppErrorBoundary t={t} onReload={onReload}>
        <Broken />
      </AppErrorBoundary>
    );

    expect(screen.getByRole('alert').textContent).toContain(t('app_error_title'));
    act(() => {
      screen.getByRole('button', { name: t('reload') }).click();
    });
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it('renders the subtree again on "try again", and clears the failure when the reset key changes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let broken = true;
    function Flaky() {
      if (broken) throw new Error('render failed');
      return <p>recovered</p>;
    }
    const screen = renderScreen(
      <AppErrorBoundary t={t} resetKey="#/mail">
        <Flaky />
      </AppErrorBoundary>
    );
    expect(screen.getByRole('alert')).toBeTruthy();

    broken = false;
    act(() => {
      screen.getByRole('button', { name: t('retry') }).click();
    });
    expect(screen.getByText('recovered')).toBeTruthy();

    broken = true;
    screen.rerender(
      <AppErrorBoundary t={t} resetKey="#/mail">
        <Flaky />
      </AppErrorBoundary>
    );
    expect(screen.getByRole('alert')).toBeTruthy();
    broken = false;
    screen.rerender(
      <AppErrorBoundary t={t} resetKey="#/contacts">
        <Flaky />
      </AppErrorBoundary>
    );
    expect(screen.getByText('recovered')).toBeTruthy();
  });
});
