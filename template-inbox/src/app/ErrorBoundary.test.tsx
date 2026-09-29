import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderScreen } from '../__test-utils__/renderScreen';
import { AppErrorBoundary } from './ErrorBoundary';

const t = (key: string) => key;

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

    expect(screen.getByRole('alert').textContent).toContain('app_error_title');
    act(() => {
      screen.getByRole('button', { name: 'reload' }).click();
    });
    expect(onReload).toHaveBeenCalledTimes(1);
  });
});
