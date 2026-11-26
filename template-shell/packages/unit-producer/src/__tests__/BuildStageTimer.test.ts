/**
 * Scenario: BuildStageTimer — per-stage wall-clock timings written to a
 * side channel that the producer and both Vite plugins feed. The timer
 * MUST NOT change emitted bytes (asserted by
 * `byte-identity-with-stage-timer.test.ts`); this scenario covers the
 * timer's own contract: start/stop, sync and async measure, the
 * accumulated-record shape, and the injectable clock.
 */

import { describe, expect, it } from 'vitest';

import {
  BUILD_STAGES,
  BuildStageTimer,
  type BuildStage,
} from '../BuildStageTimer';

describe('BuildStageTimer', () => {
  it('BUILD_STAGES lists every build stage, in order', () => {
    expect(BUILD_STAGES).toEqual([
      'shared-set-resolution',
      'entry-set-computation',
      'rollup',
      'terser',
      'cache-read',
      'cache-write',
      'vite-build',
    ]);
  });

  it('start/stop accumulates elapsed milliseconds from the injected clock', () => {
    let t = 1000;
    const timer = new BuildStageTimer({ now: () => t });
    timer.start('rollup');
    t += 250;
    timer.stop('rollup');
    expect(timer.get('rollup')).toBe(250);
  });

  it('multiple start/stop cycles accumulate (not replace) the stage total', () => {
    let t = 0;
    const timer = new BuildStageTimer({ now: () => t });
    timer.start('cache-read');
    t += 10;
    timer.stop('cache-read');
    timer.start('cache-read');
    t += 7;
    timer.stop('cache-read');
    expect(timer.get('cache-read')).toBe(17);
  });

  it('stop without a matching start is a no-op (never records a value)', () => {
    const timer = new BuildStageTimer({ now: () => 0 });
    timer.stop('terser');
    expect(timer.get('terser')).toBe(0);
  });

  it('measure runs a sync fn, returns its value, and records the elapsed time', () => {
    let t = 50;
    const timer = new BuildStageTimer({ now: () => t });
    const value = timer.measure('entry-set-computation', () => {
      t += 33;
      return 'done';
    });
    expect(value).toBe('done');
    expect(timer.get('entry-set-computation')).toBe(33);
  });

  it('measure records the elapsed time even when the sync fn throws', () => {
    let t = 0;
    const timer = new BuildStageTimer({ now: () => t });
    expect(() =>
      timer.measure('rollup', () => {
        t += 99;
        throw new Error('boom');
      })
    ).toThrow('boom');
    expect(timer.get('rollup')).toBe(99);
  });

  it('measureAsync awaits its fn and records the elapsed time', async () => {
    let t = 100;
    const timer = new BuildStageTimer({ now: () => t });
    const value = await timer.measureAsync('shared-set-resolution', async () => {
      t += 41;
      return await Promise.resolve(7);
    });
    expect(value).toBe(7);
    expect(timer.get('shared-set-resolution')).toBe(41);
  });

  it('measureAsync records the elapsed time even when the async fn rejects', async () => {
    let t = 5;
    const timer = new BuildStageTimer({ now: () => t });
    await expect(
      timer.measureAsync('terser', async () => {
        t += 22;
        throw new Error('nope');
      })
    ).rejects.toThrow('nope');
    expect(timer.get('terser')).toBe(22);
  });

  it('toRecord returns every stage with 0 for the ones never run', () => {
    let t = 0;
    const timer = new BuildStageTimer({ now: () => t });
    timer.measure('vite-build', () => {
      t += 1500;
    });
    const record = timer.toRecord();
    const stages = Object.keys(record) as BuildStage[];
    expect(stages.sort()).toEqual([...BUILD_STAGES].sort());
    expect(record['vite-build']).toBe(1500);
    expect(record['rollup']).toBe(0);
    expect(record['terser']).toBe(0);
  });

  it('a second start before stop resets the open interval (defensive; the producer never re-enters a stage while running)', () => {
    let t = 0;
    const timer = new BuildStageTimer({ now: () => t });
    timer.start('cache-write');
    t += 5;
    timer.start('cache-write'); // resets — the first 5 ms are discarded
    t += 11;
    timer.stop('cache-write');
    expect(timer.get('cache-write')).toBe(11);
  });

  it('a non-finite or negative clock delta is dropped (defensive; never records garbage)', () => {
    const timer = new BuildStageTimer({
      now: (() => 0) as () => number,
    });
    // Force a stop without a start by mutating state through start/stop
    // with a clock that jumps backwards; the elapsed value is negative
    // and must be dropped.
    let t = 100;
    const negativeTimer = new BuildStageTimer({ now: () => t });
    negativeTimer.start('rollup');
    t = 50; // clock jumps backwards
    negativeTimer.stop('rollup');
    expect(negativeTimer.get('rollup')).toBe(0);
    void timer;
  });
});

describe('BuildStageTimer — overlapping measureAsync (parallel package work)', () => {
  it('accumulates every overlapping interval of one stage instead of resetting the start', async () => {
    let t = 0;
    const timer = new BuildStageTimer({ now: () => t });
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const first = timer.measureAsync('rollup', () => gate);
    t += 10;
    const second = timer.measureAsync('rollup', async () => undefined);
    await second;
    t += 20;
    release();
    await first;
    // first ran 30ms, second ran 10ms..10ms (0): total 30.
    expect(timer.get('rollup')).toBe(30);
  });
});
