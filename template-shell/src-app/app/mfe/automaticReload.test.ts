/**
 * The automatic reload guard behind `refresh_page`: one automatic reload in a
 * short window, a clear console error for the ones it blocks, and a dropped
 * stamp when the sign-in chain earns its reload with a session. The stamp
 * lives in `sessionStorage`, so it survives the reload the chain just asked
 * for - that is the whole point; these cases read the same store a reloaded
 * page would. An unavailable store falls back to the stamp the page keeps in
 * memory, so the guard cannot throw on the chain's own fallback path.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTOMATIC_RELOAD_WINDOW_MS, claimAutomaticReload, clearAutomaticReload } from './automaticReload';

describe('the automatic reload guard', () => {
  beforeEach(() => {
    // The in-memory half of the stamp outlives a plain `sessionStorage.clear()`
    // by design: a store that can be read but not written is exactly the case
    // the guard has to keep. Each case drops the stamp through the guard's own
    // reset instead.
    clearAutomaticReload();
    sessionStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    // The spies are restored by the shared setup file's own `afterEach`
    // (`template-shell/vitest.setup.ts` calls `vi.restoreAllMocks()`), so no
    // throwing store and no silenced console reaches the next case.
    vi.useRealTimers();
  });

  it('allows the first automatic reload and stamps it', () => {
    expect(claimAutomaticReload()).toBe(true);
  });

  it('blocks a second automatic reload inside the window and says the sign-in chain failed', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(claimAutomaticReload()).toBe(true);

    vi.advanceTimersByTime(AUTOMATIC_RELOAD_WINDOW_MS - 1);
    expect(claimAutomaticReload()).toBe(false);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('the sign-in chain failed'));
    expect(error).toHaveBeenCalledWith(expect.stringContaining('reloading once more would loop the page'));
  });

  it('allows an automatic reload again once the window has passed', () => {
    expect(claimAutomaticReload()).toBe(true);

    vi.advanceTimersByTime(AUTOMATIC_RELOAD_WINDOW_MS);
    expect(claimAutomaticReload()).toBe(true);
  });

  it('keeps guarding through the in-memory stamp when storage throws', async () => {
    // A fresh module starts with a zero in-memory stamp, so this case does not
    // depend on what the cases above left in it.
    vi.resetModules();
    const guard = await import('./automaticReload');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    // The spies go on `Storage.prototype`: a jsdom `sessionStorage` is a proxy
    // that swallows an own-property spy, so `vi.spyOn(sessionStorage, ...)`
    // would leave the real methods in place and the store would never throw.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage is blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage is blocked');
    });

    expect(guard.claimAutomaticReload()).toBe(true);
    expect(guard.claimAutomaticReload()).toBe(false);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('the sign-in chain failed'));
  });

  it('keeps guarding when the store can be read but not written', async () => {
    // A quota error or a read-only store leaves `getItem` working and every
    // `setItem` rejected, so the stored stamp stays 0 while the page's own
    // stamp sits in memory. The guard must still see the reload it allowed.
    vi.resetModules();
    const guard = await import('./automaticReload');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    expect(guard.claimAutomaticReload()).toBe(true);
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(guard.claimAutomaticReload()).toBe(false);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('the sign-in chain failed'));
  });

  it('treats a stamp from the future as stale instead of blocking every reload', () => {
    expect(claimAutomaticReload()).toBe(true);

    // A clock correction moved the system time backward, so the stored stamp
    // now sits in the future and the elapsed time would be negative.
    vi.setSystemTime(new Date('2025-12-31T23:59:00Z'));
    expect(claimAutomaticReload()).toBe(true);
  });

  it('lets the next reload through at once once the stamp is dropped', () => {
    expect(claimAutomaticReload()).toBe(true);

    clearAutomaticReload();
    expect(claimAutomaticReload()).toBe(true);
  });
});
