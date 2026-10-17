import { describe, expect, it, vi } from 'vitest';

describe('screenState (shell-owned current screen)', () => {
  it('reports no screen until one is set', async () => {
    vi.resetModules();
    const { screenState } = await import('./screenState');
    expect(screenState.getSnapshot()).toBeUndefined();
  });

  it('notifies subscribers when the screen changes and stops after release', async () => {
    vi.resetModules();
    const { screenState } = await import('./screenState');
    const listener = vi.fn();
    const release = screenState.subscribe(listener);

    screenState.set('ext.a');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(screenState.getSnapshot()).toBe('ext.a');

    release();
    screenState.set('ext.b');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(screenState.getSnapshot()).toBe('ext.b');
  });
});
