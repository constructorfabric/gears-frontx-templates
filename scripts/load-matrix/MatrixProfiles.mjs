/**
 * Shared constants for the load-measurement matrix.
 *
 * This module is the single source every later phase reads for the
 * shared constants this phase defines. Downstream phases fail closed
 * if a constant they need is absent — `readRequiredConstant` throws
 * naming the missing constant, and `readRequiredConstantOrNull` returns
 * `null` so a caller can record "MF context unavailable" and continue.
 *
 * Decisions encoded (verbatim from the phase's User Decisions):
 *   noise_margin       = 15%   (NOISE_RATIO from e2e/load-time.spec.ts)
 *   LOAD_GATE_RUNS     = 30    gate cells; 10 for full-matrix cells
 *   PROFILES           = fast-4g, office-lan  (exactly as in load-time.spec.ts)
 *   first-render       = navigation start → #root has ≥ 1 child element (measureBoot)
 *   startup completion = visual: waitForMountedScreen (mounted screen container)
 *   boot guards   = ≤ old-rule median × 1.25 (HTTP/2 + gzip, Fast 4G + 4x CPU, cold)
 *   session guards     = ≤ old-rule median × 1.15 (noise margin)
 *   HTTP/1.1 boot      = reported every run, no regression from the stored baseline
 *                        (`HTTP1_BOOT_BASELINE`) beyond the noise margin; not gated
 *                        against the old rule
 */

import http1BootBaseline from './http1-boot-baseline.json' with { type: 'json' };

/** Noise margin: a measured median "within the noise margin" means ≤ reference median × 1.15. */
export const NOISE_MARGIN = 0.15;

/** Default runs per gate cell (median over the runs). Full-matrix cells may use 10. */
export const LOAD_GATE_RUNS = 30;
export const LOAD_GATE_RUNS_FULL_MATRIX = 10;

/**
 * The two profiles, exactly as in `e2e/load-time.spec.ts`.
 *   fast-4g   — Chrome DevTools "Fast 4G": ~9 Mbps down, ~1.5 Mbps up, 150 ms RTT, CPU 4x
 *   office-lan — no network emulation, CPU 1x
 */
export const PROFILES = Object.freeze({
  'fast-4g': Object.freeze({
    name: 'chrome-devtools-fast-4g',
    cpuThrottlingRate: 4,
    latency: 150,
    downloadThroughput: Math.round(9_000_000 / 8),
    uploadThroughput: Math.round(1_500_000 / 8),
  }),
  'office-lan': Object.freeze({
    name: 'office-lan',
    cpuThrottlingRate: 1,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  }),
});

/**
 * HTTP/1.1 shell boot baseline: median boot ms per profile, stored as data
 * in `http1-boot-baseline.json` — the numbers HTTP/1.1 boot must not
 * regress from (within the noise margin).
 */
export const HTTP1_BOOT_BASELINE = Object.freeze({ ...http1BootBaseline.bootMs });

/** The two protocols. */
export const PROTOCOLS = Object.freeze(['http1', 'h2']);

/** The three compression dimensions. */
export const COMPRESSIONS = Object.freeze(['none', 'gzip', 'brotli']);

/** The three cache states. */
export const CACHE_STATES = Object.freeze(['cold', 'warm', 'upgrade']);

/** The three session forms. */
export const SESSION_KINDS = Object.freeze([
  'shell+1',
  'shell+5-sequential',
  'shell+5-parallel-startup',
]);

/** Boot-guard ratio: ≤ old-rule median × 1.25. */
export const BOOT_GUARD_RATIO = 1.25;

/** Session guard ratio (noise margin): ≤ old-rule median × 1.15. */
export const SESSION_GUARD_RATIO = 1 + NOISE_MARGIN;

/**
 * First-render metric (shell boot): navigation start → `#root` has
 * ≥ 1 child element (existing `measureBoot` in `e2e/load-time.spec.ts`).
 */
export const FIRST_RENDER_METRIC =
  'navigation start → #root has ≥ 1 child element (measureBoot)';

/**
 * Visual completion: existing `waitForMountedScreen` criterion — the
 * screen container has a mounted extension. Startup extensions in the
 * shell's existing domains are visual; the gate waits for every
 * startup extension to mount.
 */
export const VISUAL_COMPLETION_SIGNAL = 'waitForMountedScreen';

/** The two scripts this phase creates; later phases call them by name. */
export const GATE_CELLS_SCRIPT = 'scripts/load-gate-cells.mjs';
export const FULL_MATRIX_SCRIPT = 'scripts/load-full-matrix.mjs';

/**
 * Reads a required constant from a record, throwing a closed-fail
 * error naming the missing constant so downstream phases fail closed.
 *
 * @template T
 * @param {Record<string, unknown>} record
 * @param {string} key
 * @returns {T}
 */
export function readRequiredConstant(record, key) {
  if (!(key in record) || record[key] === undefined || record[key] === null) {
    throw new Error(
      `[load-matrix] required shared constant "${key}" is absent; downstream phases fail closed`,
    );
  }
  return /** @type {T} */ (record[key]);
}

/**
 * Reads a constant or returns `null` so a caller can record a one-line
 * "MF context unavailable" note and continue.
 *
 * @param {Record<string, unknown>} record
 * @param {string} key
 * @returns {unknown}
 */
export function readRequiredConstantOrNull(record, key) {
  if (!(key in record) || record[key] === undefined || record[key] === null) {
    return null;
  }
  return record[key];
}

/**
 * The full shared-constants record this phase defines and downstream
 * phases read. `Object.freeze`d so a caller cannot mutate the contract.
 */
export const SHARED_CONSTANTS = Object.freeze({
  NOISE_MARGIN,
  LOAD_GATE_RUNS,
  LOAD_GATE_RUNS_FULL_MATRIX,
  PROFILES,
  PROTOCOLS,
  COMPRESSIONS,
  CACHE_STATES,
  SESSION_KINDS,
  BOOT_GUARD_RATIO,
  SESSION_GUARD_RATIO,
  FIRST_RENDER_METRIC,
  VISUAL_COMPLETION_SIGNAL,
  GATE_CELLS_SCRIPT,
  FULL_MATRIX_SCRIPT,
});
