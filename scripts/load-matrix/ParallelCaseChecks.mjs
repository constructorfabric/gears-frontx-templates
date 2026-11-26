/**
 * `ParallelCaseChecks` — the parallel startup case checks:
 *   - duplicate downloads of the same shared file (must be 0)
 *   - main-thread evaluation time capture
 *   - the one-origin-failure run
 *
 * One class per file (OOP). The class is a namespace of static
 * methods — each is a pure check the runner composes; there is no
 * per-instance state to keep consistent across the parallel case.
 */

/** @typedef {string} Origin */

/**
 * @typedef {Object} RequestLike
 * @property {string} url
 * @property {number} bytes
 */

/**
 * @typedef {Object} EvalEntry
 * @property {string} name
 * @property {number} selfMs
 */

export class ParallelCaseChecks {
  /**
   * Counts duplicate downloads of the same shared file. A shared
   * file's identity is its path under `/shared/` (package@version/unit
   * .js), regardless of which origin fetched it — a unit the shell
   * fetched must never cross the network again from any origin (the
   * realm content-identity cache answers it). The parallel case must
   * report zero duplicates.
   *
   * @param {RequestLike[]} requests
   * @returns {{ duplicateCount: number; pass: boolean; paths: string[] }}
   */
  static duplicateDownloads(requests) {
    /** @type {Map<string, number>} */
    const counts = new Map();
    for (const r of requests) {
      const i = r.url.indexOf('/shared/');
      if (i === -1) continue;
      const key = r.url.slice(i);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    let duplicateCount = 0;
    /** @type {string[]} */
    const paths = [];
    for (const [k, c] of counts) {
      if (c > 1) {
        duplicateCount += c - 1;
        paths.push(k);
      }
    }
    return { duplicateCount, pass: duplicateCount === 0, paths };
  }

  /**
   * Sums the self-evaluation time (main-thread script evaluation) of
   * every script the parallel startup evaluated.
   *
   * @param {EvalEntry[]} entries
   * @returns {number}
   */
  static mainThreadEvaluationMs(entries) {
    let sum = 0;
    for (const e of entries) sum += e.selfMs;
    return Math.round(sum * 1000) / 1000;
  }

  /**
   * The one-origin-failure run: one origin fails, the others
   * succeed. Returns the protocol record the runner reports.
   *
   * @param {Object} opts
   * @param {Origin[]} opts.origins
   * @param {Origin} opts.failingOrigin
   * @param {string} opts.expectedOutcome
   * @returns {{ kind: string; failingOrigin: Origin; succeedingOrigins: Origin[]; protocol: string }}
   */
  static oneOriginFailureRun({ origins, failingOrigin, expectedOutcome }) {
    const succeedingOrigins = origins.filter((o) => o !== failingOrigin);
    return {
      kind: 'one-origin-failure',
      failingOrigin,
      succeedingOrigins,
      protocol: `one origin fails; the others succeed — ${expectedOutcome}`,
    };
  }
}
