/**
 * Unit tests for useHostAction.
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

  return renderHook(() => useHostAction('test.action~test.action.v1'), { wrapper });
}

describe('useHostAction', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hands the chain to the bridge, targeted at the bridge domain', () => {
    const executeActionsChain = vi.fn();
    const { result } = renderWithBridge(executeActionsChain);

    act(() => result.current({ a: 1 }));

    expect(executeActionsChain).toHaveBeenCalledWith({
      action: {
        type: 'test.action~test.action.v1',
        target: 'test.domain',
        payload: { a: 1 },
      },
    });
  });
});
