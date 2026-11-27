/**
 * A scaling check for the "linear time" tests of the frontx-design-proposal
 * scripts: the work on an input eight times larger takes less than 24 times
 * as long, plus 40 ms for timer noise. Linear work takes eight times as long,
 * quadratic work sixty-four times, so the bound leaves a margin of three on
 * the linear side and more than two on the quadratic side.
 *
 * The check holds on a busy machine. A run is timed in CPU time of this
 * process (user plus system, process.cpuUsage), not wall-clock time, so the
 * time other processes take from the processor is not counted; the system
 * time keeps the file reads of the survey rows in the measure. Vitest runs
 * each test file in a process of its own (the forks pool, its default), so no
 * other test counts either. Load can still slow a run (caches, garbage
 * collection), so the two sizes are timed in turn, five pairs, and the
 * fastest run of each size counts. A measurement over the bound is taken once
 * more, and only a second failure fails the test; its message gives every
 * sample of both measurements. Every row prints its first measurement (the
 * fastest CPU time at each size and the bound), passing or not, so the test
 * log records how close each row came to its bound. No bound is an absolute time: only the ratio
 * of the two sizes counts.
 */
import { expect } from 'vitest';

const PAIRS = 5;
const cpu = () => {
  const { user, system } = process.cpuUsage();
  return (user + system) / 1000;
};
const time = (run) => {
  const start = cpu();
  run();
  return cpu() - start;
};
const bound = (small) => 24 * small + 40;

function measure(run, n) {
  const small = [];
  const big = [];
  for (let i = 0; i < PAIRS; i += 1) {
    small.push(time(() => run(n)));
    big.push(time(() => run(8 * n)));
  }
  return { small, big, fast: Math.min(...small), slow: Math.min(...big) };
}

const ms = (list) => list.map((x) => x.toFixed(1)).join(', ');
const samples = (m, n) => `at ${n}: ${ms(m.small)} ms; at ${8 * n}: ${ms(m.big)} ms`;

/** Expects run(n) to grow about linearly from n to 8 * n. */
export function expectLinear(run, n, what = '') {
  run(n); // warm up
  const first = measure(run, n);
  // On record for every row, passing or not: a reader can see how far a row is from its bound.
  console.log(`linear-time ${what}: fastest ${first.fast.toFixed(1)} ms of CPU time at ${n}, ${first.slow.toFixed(1)} ms at ${8 * n}, bound ${bound(first.fast).toFixed(1)}`);
  if (first.slow < bound(first.fast)) return;
  const second = measure(run, n);
  expect(second.slow, `${what}: fastest ${second.fast.toFixed(1)} ms of CPU time at ${n}, ${second.slow.toFixed(1)} ms at ${8 * n}, bound ${bound(second.fast).toFixed(1)}; `
    + `first measurement ${samples(first, n)}; second ${samples(second, n)}`).toBeLessThan(bound(second.fast));
}
