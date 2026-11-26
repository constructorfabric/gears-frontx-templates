/**
 * `CacheStateDriver` — the three cache states per session
 * (`warm_session`).
 *
 *   cold   — empty cache, first visit
 *   warm   — repeat visit, same build
 *   upgrade — repeat visit after a release upgrading one shared
 *             package and changing one MFE
 *
 * Gates stay on cold. Warm and upgrade are reported against the old
 * rule in the same states, with a guard: neither may be slower than
 * the old rule beyond the noise margin. The upgrade case reports
 * re-downloaded bytes for FrontX and the old rule (per-package
 * caching benefit).
 *
 * The upgrade fixture (this phase chooses one and records its name in
 * the out file): bump the version and change one exported function body
 * of one template-owned shared workspace package, plus one source
 * change in `_blank-mfe`; rebuild; measure with the first build's HTTP
 * cache warm.
 *
 * One class per file (OOP). Pure — no I/O. The runner applies the plan
 * (clears the browser cache, rebuilds the fixture for upgrade).
 */

/** @typedef {'cold' | 'warm' | 'upgrade'} CacheState */

/**
 * @typedef {Object} UpgradeFixture
 * @property {string} packageName
 * @property {string} mfe
 */

/**
 * @typedef {Object} CacheStatePlan
 * @property {CacheState} state
 * @property {boolean} clearCache
 * @property {boolean} rebuild
 * @property {string} description
 * @property {{ packageName: string; mfe: string; change: string } | undefined} upgrade
 */

/**
 * @typedef {Object} PerRunPolicy
 * @property {boolean} clearBrowserCacheBeforeRun  cold clears the browser cache before every run (first visit)
 * @property {boolean} keepHttpCacheAcrossRuns       warm/upgrade keep the HTTP cache across runs (repeat visit)
 * @property {boolean} rebuildBeforeRuns             upgrade rebuilds once with a content-only change before the runs
 * @property {boolean} warmCacheFromFirstBuild       upgrade warms the HTTP cache from the first build before rebuilding
 * @property {boolean} revertRebuildAfterRuns        upgrade reverts the rebuild after the runs (a content-only change)
 * @property {boolean} recordReDownloadedBytes       upgrade reports re-downloaded bytes for FrontX and the old rule
 */

export class CacheStateDriver {
  /** @type {UpgradeFixture} */
  #upgradeFixture;

  /**
   * @param {Object} opts
   * @param {UpgradeFixture} opts.upgradeFixture
   */
  constructor({ upgradeFixture }) {
    this.#upgradeFixture = upgradeFixture;
  }

  /**
   * @param {CacheState} state
   * @returns {CacheStatePlan}
   */
  plan(state) {
    if (state === 'cold') {
      return {
        state: 'cold',
        clearCache: true,
        rebuild: false,
        description: 'empty cache, first visit',
        upgrade: undefined,
      };
    }
    if (state === 'warm') {
      return {
        state: 'warm',
        clearCache: false,
        rebuild: false,
        description: 'repeat visit, same build',
        upgrade: undefined,
      };
    }
    if (state === 'upgrade') {
      return {
        state: 'upgrade',
        clearCache: false,
        rebuild: true,
        description: 'repeat visit after a release upgrading one shared package and changing one MFE',
        upgrade: {
          packageName: this.#upgradeFixture.packageName,
          mfe: this.#upgradeFixture.mfe,
          change: 'bump version + change one exported function body',
        },
      };
    }
    throw new Error(`unknown cache state: ${state}`);
  }

  /**
   * Returns the upgrade fixture changes the runner applies: bump the
   * version and change one exported function body of the recorded
   * shared workspace package, plus one source change in `_blank-mfe`.
   * Reports re-downloaded bytes for FrontX and the old rule (per-package
   * caching benefit).
   *
   * @returns {{ upgradedPackage: string; mfeSourceChange: string; kind: string }}
   */
  applyUpgrade() {
    return {
      upgradedPackage: this.#upgradeFixture.packageName,
      mfeSourceChange: this.#upgradeFixture.mfe,
      kind: 'version-bump-and-function-body-change',
    };
  }

  /** @returns {string} */
  upgradeFixturePackageName() {
    return this.#upgradeFixture.packageName;
  }

  /**
   * Gates stay on cold.
   *
   * @param {CacheState} state
   * @returns {boolean}
   */
  isGateState(state) {
    return state === 'cold';
  }

  /**
   * Returns the per-run cache policy for a cache state. The
   * spec/driver applies this so warm and upgrade are no longer
   * measured as cold:
   *
   *   cold   — clear the browser cache before every run (first visit;
   *            each run sees an empty HTTP cache)
   *   warm   — keep the HTTP cache across runs (repeat visit, same
   *            build); no rebuild
   *   upgrade — keep the HTTP cache from the first build (warm cache
   *            from the first build), rebuild once with a content-
   *            only change before the runs, revert the
   *            rebuild after the runs; report re-downloaded bytes
   *            for FrontX and the old rule (per-package caching
   *            benefit)
   *
   * Gate cells stay cold (per `isGateState`); the runner's gate-cell
   * set never selects warm or upgrade.
   *
   * @param {CacheState} state
   * @returns {PerRunPolicy}
   */
  perRunPolicy(state) {
    const plan = this.plan(state);
    return {
      clearBrowserCacheBeforeRun: plan.clearCache,
      keepHttpCacheAcrossRuns: !plan.clearCache,
      rebuildBeforeRuns: plan.rebuild,
      warmCacheFromFirstBuild: state === 'upgrade',
      revertRebuildAfterRuns: plan.rebuild,
      recordReDownloadedBytes: state === 'upgrade',
    };
  }
}
