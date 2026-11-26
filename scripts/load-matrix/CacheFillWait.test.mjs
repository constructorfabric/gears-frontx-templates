import { describe, expect, it } from 'vitest';
import { awaitCacheFill } from './CacheFillWait.mjs';
import { FillRequestWatcher } from './FillRequestWatcher.mjs';

/**
 * The shell's cache-fill wait applies to the FrontX variant only; the
 * old-rule variant (and any non-`new` variant) skips it, so a page that
 * issues no fill requests does not stall the measurement.
 */

/** A watcher whose fill never finishes; it rejects after the timeout. */
function watcherThatNeverSettles() {
  return {
    settled: (timeoutMs) =>
      new Promise((_resolve, reject) => {
        setTimeout(() => reject(new Error(`Timeout ${timeoutMs}ms exceeded`)), timeoutMs);
      }),
  };
}

/** A watcher whose fill has already finished. */
function watcherThatSettlesImmediately() {
  return { settled: async () => undefined };
}

describe('awaitCacheFill - variant-aware wait for the shell fill requests', () => {
  it('variant=old skips the wait (no stall on a page that issues no fill requests)', async () => {
    const t0 = Date.now();
    const r = await awaitCacheFill(watcherThatNeverSettles(), { variant: 'old', timeoutMs: 60_000 });
    expect(Date.now() - t0).toBeLessThan(500);
    expect(r).toEqual({ skipped: true, waited: false, elapsedMs: 0 });
  });

  it('any non-"new" variant skips the wait', async () => {
    const r = await awaitCacheFill(watcherThatNeverSettles(), { variant: 'legacy', timeoutMs: 60_000 });
    expect(r.skipped).toBe(true);
  });

  it('variant=new waits for the fill requests to finish', async () => {
    const r = await awaitCacheFill(watcherThatSettlesImmediately(), { variant: 'new', timeoutMs: 60_000 });
    expect(r.skipped).toBe(false);
    expect(r.waited).toBe(true);
  });

  it('variant=new fails when the fill never settles within the bound', async () => {
    await expect(awaitCacheFill(watcherThatNeverSettles(), { variant: 'new', timeoutMs: 150 })).rejects.toThrow(
      /Timeout 150ms exceeded/,
    );
  });

  it('variant=new fails when the fill issues no request within the bound', async () => {
    const page = { on: () => undefined };
    const watcher = new FillRequestWatcher(page, 'http://localhost:4173/shared/');
    await expect(awaitCacheFill(watcher, { variant: 'new', timeoutMs: 50 })).rejects.toThrow(
      /issued no request within 50ms/,
    );
  });

  it('throws when the watcher is missing (contract guard, not a silent no-op)', async () => {
    await expect(awaitCacheFill({}, { variant: 'new' })).rejects.toThrow(/watcher\.settled is required/);
    await expect(awaitCacheFill(undefined, { variant: 'new' })).rejects.toThrow(/watcher\.settled is required/);
  });

  it('records elapsedMs for the new-variant wait', async () => {
    const r = await awaitCacheFill(watcherThatSettlesImmediately(), { variant: 'new', timeoutMs: 60_000 });
    expect(typeof r.elapsedMs).toBe('number');
    expect(r.elapsedMs).toBeGreaterThanOrEqual(0);
  });
});
