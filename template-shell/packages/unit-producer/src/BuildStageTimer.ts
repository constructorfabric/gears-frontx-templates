/**
 * `BuildStageTimer` — a side-channel wall-clock timer for the per-stage
 * build-time instrumentation.
 *
 * Records per-stage durations for the stages named in the build-time
 * reference: shared-set resolution, entry-set computation, Rollup,
 * Terser, cache read, cache write, and Vite's own build time. The
 * timer is a side channel — it writes nothing into the emitted chunk
 * bytes or fetch lists, so instrumenting a build with one cannot
 * change the chunk bytes (the chunk hashes stay identical to
 * an un-instrumented build; a conformance test asserts this).
 *
 * The producer and bundler accept an optional `stageTimer`; when
 * absent, no timing happens (zero overhead, no emitted-byte change).
 * When present, the relevant call sites wrap their work in
 * `measure`/`measureAsync`. The plugins construct a `BuildStageTimer`,
 * pass it to the producer, measure `vite-build` from `buildStart` to
 * `closeBundle`, and write the timings into the build report.
 */

/** A per-stage build-time name. */
export type BuildStage =
  /** `SharedSetResolver.resolve()` — the host's shared set. */
  | 'shared-set-resolution'
  /** `PackageEntrySet.compute()` — one package's entry set. */
  | 'entry-set-computation'
  /** The producer's pinned Rollup split build. */
  | 'rollup'
  /** The synchronous inline Terser `renderChunk` pass. */
  | 'terser'
  /** `PackageBuildCache.load()` — a per-`package@version` cache hit. */
  | 'cache-read'
  /** `PackageBuildCache.store()` — a per-`package@version` cache write. */
  | 'cache-write'
  /** Vite's own build time — `buildStart` to `closeBundle` in the plugins. */
  | 'vite-build';

/** Every stage, in the order the build-time reference lists them. */
export const BUILD_STAGES: readonly BuildStage[] = [
  'shared-set-resolution',
  'entry-set-computation',
  'rollup',
  'terser',
  'cache-read',
  'cache-write',
  'vite-build',
];

/** A build-stage timing record: stage name → milliseconds accumulated. */
export type BuildStageTimings = Record<BuildStage, number>;

export interface BuildStageTimerOptions {
  /**
   * Injectable clock for tests. Defaults to `Date.now`. The timer
   * stores absolute timestamps from this clock and subtracts them —
   * any monotonic-enough clock works for tests.
   */
  now?: () => number;
}

export class BuildStageTimer {
  private readonly now: () => number;
  /** Accumulated milliseconds per stage (zero until the stage stops). */
  private readonly accumulated = new Map<BuildStage, number>();
  /** Open `start()` timestamps per stage (undefined when not running). */
  private readonly active = new Map<BuildStage, number>();

  constructor(options: BuildStageTimerOptions = {}) {
    this.now = options.now ?? (() => Date.now());
  }

  /**
   * Begin timing `stage`. Idempotent: a second `start` before `stop`
   * resets the start timestamp (the previous open interval is
   * discarded — the producer never re-enters a stage while it is
   * still running, so this is purely defensive).
   */
  start(stage: BuildStage): void {
    this.active.set(stage, this.now());
  }

  /**
   * End timing `stage` and accumulate the elapsed milliseconds. A
   * `stop` without a matching `start` is a no-op (defensive — never
   * throws, never records a negative or NaN entry).
   */
  stop(stage: BuildStage): void {
    const startedAt = this.active.get(stage);
    if (startedAt === undefined) return;
    const elapsed = this.now() - startedAt;
    if (Number.isFinite(elapsed) && elapsed >= 0) {
      this.accumulated.set(stage, (this.accumulated.get(stage) ?? 0) + elapsed);
    }
    this.active.delete(stage);
  }

  /**
   * Run `fn` synchronously under `stage`, returning its value. The
   * stage is stopped in a `finally`, so a throw still records the
   * elapsed time and re-throws — instrumentation never swallows a
   * build error.
   */
  measure<T>(stage: BuildStage, fn: () => T): T {
    const startedAt = this.now();
    try {
      return fn();
    } finally {
      this.accumulate(stage, startedAt);
    }
  }

  /**
   * Run `fn` asynchronously under `stage`, awaiting its result. Same
   * stop-in-finally guarantee as {@link measure}.
   */
  async measureAsync<T>(stage: BuildStage, fn: () => Promise<T>): Promise<T> {
    // Each call keeps its own start, so overlapping calls of one
    // stage (parallel per-package work) each add their own interval.
    const startedAt = this.now();
    try {
      return await fn();
    } finally {
      this.accumulate(stage, startedAt);
    }
  }

  private accumulate(stage: BuildStage, startedAt: number): void {
    const elapsed = this.now() - startedAt;
    if (Number.isFinite(elapsed) && elapsed >= 0) {
      this.accumulated.set(stage, (this.accumulated.get(stage) ?? 0) + elapsed);
    }
  }

  /** Read the accumulated milliseconds for `stage` (0 when never run). */
  get(stage: BuildStage): number {
    return this.accumulated.get(stage) ?? 0;
  }

  /**
   * Snapshot every stage's accumulated milliseconds as a plain
   * record. Stages that never ran are present with 0, so the build
   * report always carries the full stage set (the report's reader
   * never has to distinguish "absent" from "zero").
   */
  toRecord(): BuildStageTimings {
    const record = {} as BuildStageTimings;
    for (const stage of BUILD_STAGES) {
      record[stage] = this.accumulated.get(stage) ?? 0;
    }
    return record;
  }
}
