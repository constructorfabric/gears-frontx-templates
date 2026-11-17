/**
 * The baseline diff and the exit-code tail both runners gate on, so the
 * render runner and the static check classify and gate findings the same way.
 */

/**
 * Multiset diff of findings against a baseline:
 *
 *   new         - absent from the baseline, or present more often now (the
 *                 entry's `count` is the number of additional instances);
 *   resolved    - fewer now, where the current run re-checked the place the
 *                 finding lived;
 *   unverified  - fewer now, where the current run did not re-check that
 *                 place, so the absence is not evidence;
 *   carriedOver - instances present in both.
 *
 * Two instances with one identity are two findings, so a second one that
 * arrives is reported rather than hidden behind the first.
 *
 * @template T, E
 * @param {T[]} before the baseline's findings
 * @param {T[]} after the current run's findings
 * @param {{key: (item: T) => string, entry: (item: T) => E,
 *   rechecked: (entry: E) => boolean}} identity
 *   `key` is the identity across runs, `entry` what a diff entry reports,
 *   `rechecked` whether the current run re-observed where an entry lives
 * @returns {{new: Array<E & {count: number}>, resolved: Array<E & {count: number}>,
 *   unverified: Array<E & {count: number}>, carriedOver: number}}
 */
export function diffFindings(before, after, { key, entry, rechecked }) {
  const count = (/** @type {T[]} */ items) => {
    const map = new Map();
    for (const item of items) {
      const id = key(item);
      const existing = map.get(id);
      if (existing) existing.count += 1;
      else map.set(id, { ...entry(item), count: 1 });
    }
    return map;
  };
  const was = count(before);
  const now = count(after);
  const added = [];
  const resolved = [];
  const unverified = [];
  let carriedOver = 0;
  for (const [id, current] of now) {
    const previous = was.get(id)?.count ?? 0;
    carriedOver += Math.min(previous, current.count);
    if (current.count > previous) added.push({ ...current, count: current.count - previous });
  }
  for (const [id, previous] of was) {
    const remaining = now.get(id)?.count ?? 0;
    if (remaining >= previous.count) continue;
    const gone = { ...previous, count: previous.count - remaining };
    (rechecked(previous) ? resolved : unverified).push(gone);
  }
  return { new: added, resolved, unverified, carriedOver };
}

/**
 * The exit code once a run has no input or environment failure: 0 unless
 * `--fail-on-findings`, then 1 on any finding, or with a baseline only on a
 * new one. Unverified findings do not gate: a deliberately narrower run is
 * the caller's choice, and the summary names what it left unconfirmed.
 *
 * @param {number} totalFindings
 * @param {{failOnFindings: boolean}} config
 * @param {{new: unknown[]}} [diff]
 */
export function findingsExitCode(totalFindings, config, diff) {
  if (!config.failOnFindings) return 0;
  if (diff) return diff.new.length > 0 ? 1 : 0;
  return totalFindings > 0 ? 1 : 0;
}
