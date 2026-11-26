/**
 * Scenario: parallel per-package work keeps a deterministic result
 * order and failure: results are indexed by input
 * position whatever order tasks finish in; the lowest-index failure
 * is rethrown; the concurrency limit holds.
 */

import { describe, expect, it } from 'vitest';

import { OrderedParallelMap } from '../OrderedParallelMap';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('OrderedParallelMap', () => {
  it('returns results in input order regardless of completion order', async () => {
    const delays = [30, 5, 20, 1, 10];
    const finished: number[] = [];
    const out = await OrderedParallelMap.map(delays, 5, async (d, i) => {
      await sleep(d);
      finished.push(i);
      return `r${i}`;
    });
    expect(out).toEqual(['r0', 'r1', 'r2', 'r3', 'r4']);
    expect(finished).not.toEqual([0, 1, 2, 3, 4]);
  });

  it('gives the same result serial (limit 1) and parallel', async () => {
    const items = [4, 1, 3, 2];
    const run = (limit: number) =>
      OrderedParallelMap.map(items, limit, async (n) => {
        await sleep(n);
        return n * 10;
      });
    expect(await run(1)).toEqual(await run(4));
  });

  it('rethrows the lowest-index failure, not the first to fail', async () => {
    await expect(
      OrderedParallelMap.map([40, 1], 2, async (d, i) => {
        await sleep(d);
        throw new Error(`fail-${i}`);
      })
    ).rejects.toThrow('fail-0');
  });

  it('never runs more than `limit` tasks at once', async () => {
    let active = 0;
    let peak = 0;
    await OrderedParallelMap.map([1, 2, 3, 4, 5, 6], 2, async () => {
      active++;
      peak = Math.max(peak, active);
      await sleep(5);
      active--;
    });
    expect(peak).toBe(2);
  });

  it('handles an empty input', async () => {
    expect(await OrderedParallelMap.map([], 3, async () => 1)).toEqual([]);
  });
});
