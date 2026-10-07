import { afterEach, describe, expect, it, vi } from 'vitest';

describe('seedClock', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  it('gives every package that bundles it the anchor of the first one to load', async () => {
    vi.useFakeTimers();
    const first = await import('@inbox-shared/api/seedClock');
    // A second package loads later and evaluates its own copy of the module.
    vi.advanceTimersByTime(60_000);
    vi.resetModules();
    const second = await import('@inbox-shared/api/seedClock');

    expect(second).not.toBe(first);
    expect(second.ANCHOR_MS).toBe(first.ANCHOR_MS);
    expect(second.hoursAgo(1)).toBe(first.hoursAgo(1));
  });
});
