/**
 * `LoadGuards` — the two guards and the noise-margin sessions.
 * No absolute budgets; budgets are
 * expressed relative to a measured reference (the old rule) or as a
 * reported number with the timing gate as the pass/fail.
 *
 * Two guards (HTTP/2 + gzip, Fast 4G + 4x CPU, cold):
 *   (1) shell boot (first render = `#root` ≥ 1 child via `measureBoot`)
 *       ≤ old-rule median × 1.25
 *   (2) shell + startup extensions (visual = `waitForMountedScreen`) ≤
 *       old-rule median × 1.25
 *
 * Sessions shell+1 and shell+5: ≤ old-rule median × (1 + noiseMargin)
 * (1.15 at the 15% noise margin).
 *
 * HTTP/1.1 boot (office-LAN and Fast 4G): not gated against the old rule.
 * Reported every run, and must not regress from the stored baseline
 * (`HTTP1_BOOT_BASELINE`) beyond the noise margin.
 *
 * Failing guards are returned as findings (the runner records them in
 * the out file, not fixed here).
 *
 * One class per file (OOP). Pure — no I/O.
 */

/** @typedef {'h2' | 'http1'} Protocol */
/** @typedef {'fast-4g' | 'office-lan'} Profile */
/** @typedef {'none' | 'gzip' | 'brotli'} Compression */
/** @typedef {'shell+1' | 'shell+5-sequential' | 'shell+5-parallel-startup'} SessionKind */

/**
 * @typedef {Object} GuardCell
 * @property {Protocol} protocol
 * @property {Profile} profile
 * @property {Compression} compression
 * @property {'cold' | 'warm' | 'upgrade'} cacheState
 */

/**
 * @typedef {Object} GuardResult
 * @property {boolean} pass
 * @property {number} newMs
 * @property {number} oldMs
 * @property {number} allowed
 * @property {number} ratio
 * @property {string} [finding]
 * @property {GuardCell} cell
 * @property {string} guard
 */

/**
 * @typedef {Object} Http1BootResult
 * @property {boolean} pass
 * @property {string} kind
 * @property {Profile} profile
 * @property {number} newMs
 * @property {number} baselineMs
 * @property {number} allowed
 * @property {string} finding
 */

export class LoadGuards {
  /** @type {number} */
  #noiseMargin;
  /** @type {number} */
  #bootGuardRatio;
  /** @type {number} */
  #sessionGuardRatio;

  /**
   * @param {Object} opts
   * @param {number} opts.noiseMargin
   * @param {number} opts.bootGuardRatio
   * @param {number} opts.sessionGuardRatio
   */
  constructor({ noiseMargin, bootGuardRatio, sessionGuardRatio }) {
    this.#noiseMargin = noiseMargin;
    this.#bootGuardRatio = bootGuardRatio;
    this.#sessionGuardRatio = sessionGuardRatio;
  }

  /**
   * @param {Object} p
   * @returns {GuardResult}
   * @private
   */
  #judge(p) {
    const { newMs, oldMs, ratio, guard, cell, label } = p;
    const allowed = Math.ceil(oldMs * ratio);
    const pass = newMs <= allowed;
    /** @type {GuardResult} */
    const result = {
      pass,
      newMs,
      oldMs,
      allowed,
      ratio: oldMs > 0 ? newMs / oldMs : 0,
      cell,
      guard,
    };
    if (!pass) {
      result.finding =
        `${label}: ${newMs}ms vs old-rule ${oldMs}ms (allowed ${allowed}ms, ` +
        `ratio ${ratio}) — ${guard} regressed beyond ${ratio}× in cell ${JSON.stringify(cell)}`;
    }
    return result;
  }

  /**
   * Shell boot guard. First render = `#root` ≥ 1 child via
   * `measureBoot`. ≤ old-rule median × 1.25.
   *
   * @param {Object} opts
   * @param {number} opts.newMs
   * @param {number} opts.oldMs
   * @param {Profile} opts.profile
   * @param {Protocol} opts.protocol
   * @param {Compression} opts.compression
   * @returns {GuardResult}
   */
  judgeBoot({ newMs, oldMs, profile, protocol, compression }) {
    return this.#judge({
      newMs,
      oldMs,
      ratio: this.#bootGuardRatio,
      guard: 'shell boot',
      label: 'shell boot',
      cell: { protocol, profile, compression, cacheState: 'cold' },
    });
  }

  /**
   * Shell + startup extensions guard. Visual completion =
   * `waitForMountedScreen` (startup extensions in the shell's existing
   * domains are visual). ≤ old-rule median × 1.25.
   *
   * @param {Object} opts
   * @param {number} opts.newMs
   * @param {number} opts.oldMs
   * @param {Profile} opts.profile
   * @param {Protocol} opts.protocol
   * @param {Compression} opts.compression
   * @returns {GuardResult}
   */
  judgeStartupExtensions({ newMs, oldMs, profile, protocol, compression }) {
    return this.#judge({
      newMs,
      oldMs,
      ratio: this.#bootGuardRatio,
      guard: 'shell + startup extensions',
      label: 'shell + startup extensions',
      cell: { protocol, profile, compression, cacheState: 'cold' },
    });
  }

  /**
   * Session guard (shell+1, shell+5 sequential, shell+5 parallel
   * startup). ≤ old-rule median × (1 + noiseMargin) = 1.15 at 15%.
   *
   * @param {Object} opts
   * @param {number} opts.newMs
   * @param {number} opts.oldMs
   * @param {SessionKind} opts.sessionKind
   * @param {Profile} opts.profile
   * @param {Protocol} opts.protocol
   * @param {Compression} opts.compression
   * @returns {GuardResult}
   */
  judgeSession({ newMs, oldMs, sessionKind, profile, protocol, compression }) {
    return this.#judge({
      newMs,
      oldMs,
      ratio: this.#sessionGuardRatio,
      guard: `session ${sessionKind}`,
      label: `session ${sessionKind}`,
      cell: { protocol, profile, compression, cacheState: 'cold' },
    });
  }

  /**
   * HTTP/1.1 shell boot (office-LAN or Fast 4G): reported every run and
   * must not regress from the stored baseline — `newMs` ≤ baseline ×
   * (1 + noiseMargin). Not a gate against the old rule.
   *
   * @param {Object} opts
   * @param {Profile} opts.profile
   * @param {number} opts.newMs
   * @param {number} opts.baselineMs the stored HTTP/1.1 boot baseline for the profile
   * @returns {Http1BootResult}
   */
  judgeHttp1Boot({ profile, newMs, baselineMs }) {
    const allowed = Math.ceil(baselineMs * (1 + this.#noiseMargin));
    const pass = newMs <= allowed;
    return {
      pass,
      kind: 'http1-boot-reported',
      profile,
      newMs,
      baselineMs,
      allowed,
      finding:
        `HTTP/1.1 ${profile} shell boot (reported, not gated against the old rule): ${newMs}ms ` +
        `vs stored baseline ${baselineMs}ms (allowed ${allowed}ms at the noise margin) — ` +
        `${pass ? 'no regression' : 'regressed from the baseline'}`,
    };
  }
}
