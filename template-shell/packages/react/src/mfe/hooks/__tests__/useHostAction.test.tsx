/**
 * Unit tests for useHostAction.
 *
 * `bridge.executeActionsChain` is typed `Promise<void>`, but after #648 the
 * registry may (a) throw synchronously, (b) return `undefined`, or (c) return
 * a promise that rejects. None of the three may escape into React — the hook
 * must log each of them the same way it does today, through
 * `console.error('[useHostAction] Failed to send action ...')`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { useHostAction } from '../useHostAction';
import { MfeContext, type MfeContextValue } from '../../MfeContext';

function renderWithBridge(executeActionsChain: (...args: unknown[]) => unknown) {
  const bridge = {
    extDomainId: 'test.domain',
    executeActionsChain,
  } as unknown as MfeContextValue['bridge'];

  const value: MfeContextValue = {
    bridge,
    extensionId: 'test.extension',
    domainId: 'test.domain',
  };

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(MfeContext.Provider, { value }, children);

  return renderHook(() => useHostAction('gts.frontx.mfes.comm.action.v1~test.action.v1'), { wrapper });
}

describe('useHostAction', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not throw into React and does not log when executeActionsChain returns undefined (mirrors dispatchChain: a non-promise return is an accepted call, not a failure)', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { result } = renderWithBridge(() => undefined);

    act(() => result.current({}));

    // A generic `not.toThrow()` would not distinguish "handled cleanly" from
    // "React 19 caught the throw and reported it via console.error itself" —
    // asserting the spy saw no call is the stronger, unambiguous check.
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('logs and does not throw into React when executeActionsChain throws synchronously', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const syncError = new Error('registry refused synchronously');
    const { result } = renderWithBridge(() => {
      throw syncError;
    });

    expect(() => act(() => result.current({}))).not.toThrow();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[useHostAction] Failed to send action"),
      syncError
    );
  });

  it('logs when executeActionsChain returns a promise that rejects', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const rejection = new Error('handler failed');
    const { result } = renderWithBridge(() => Promise.reject(rejection));

    await act(async () => {
      result.current({});
      // Let the microtask queue flush the rejection handler.
      await Promise.resolve();
    });

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[useHostAction] Failed to send action"),
      rejection
    );
  });
});
