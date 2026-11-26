/**
 * `CacheFillWait` - variant-aware wait for the FrontX shell's realm-cache
 * fill, observed on the network through a `FillRequestWatcher`.
 *
 * Completion of a measured load is variant-independent: the shell boot is
 * its first render and an MFE load is its mounted screen. Only the FrontX
 * shell (`new`) fills a realm cache; the old-rule build issues no fill
 * requests, so waiting for them there would stall until the timeout. The
 * wait therefore applies to the FrontX variant only. For the FrontX variant
 * a fill that issues no request, or never completes, within the bound fails
 * the measurement: it is a broken shell, not a slow one.
 *
 * A pure helper module: no class state to keep consistent. The helper takes
 * the watcher the spec already holds, so a unit test passes a fake one.
 */

/** @typedef {'new' | 'old' | string} Variant */

/**
 * @typedef {Object} CacheFillWaitResult
 * @property {boolean} skipped   variant is not `new`; the wait was not attempted
 * @property {boolean} waited    the fill issued requests and all finished (variant=`new` only)
 * @property {number}  elapsedMs wall time spent in the wait
 */

/**
 * Waits for the shell's fill requests to finish, but only for the FrontX
 * variant. Rejects when the fill issues no request, or does not finish,
 * within `timeoutMs`.
 *
 * @param {{ settled: (timeoutMs: number) => Promise<void> }} watcher
 * @param {Object} opts
 * @param {Variant} opts.variant
 * @param {number} [opts.timeoutMs=60000]
 * @param {() => number} [opts.now=Date.now]
 * @returns {Promise<CacheFillWaitResult>}
 */
export async function awaitCacheFill(watcher, { variant, timeoutMs = 60_000, now = Date.now } = {}) {
  if (!watcher || typeof watcher.settled !== 'function') {
    throw new Error('awaitCacheFill: watcher.settled is required');
  }
  if (variant !== 'new') {
    return { skipped: true, waited: false, elapsedMs: 0 };
  }
  const t0 = now();
  await watcher.settled(timeoutMs);
  return { skipped: false, waited: true, elapsedMs: now() - t0 };
}
