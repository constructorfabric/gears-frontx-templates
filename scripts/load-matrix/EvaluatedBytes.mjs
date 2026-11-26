/**
 * `EvaluatedBytes` — measured evaluated bytes per load.
 *
 * The harness logged requests, bytes, boot and session only; no
 * evaluated-bytes metric. The fix measures evaluated bytes via CDP —
 * the script parse size of every script the browser parsed during
 * the load window (`Debugger.scriptParsed` carries `length`, the
 * script length in characters, which is the script parse size the
 * engine actually processed). This module is the pure summariser
 * the spec calls with the script list it captured; the spec owns the
 * CDP session.
 *
 * One class per file (OOP) is overkill for a pure function; this is
 * a pure helper module — no class state to keep consistent.
 */

/** @typedef {Object} ParsedScript */
/** @property {string} url */
/** @property {number} length */

/**
 * @typedef {Object} EvaluatedBytesSummary
 * @property {number} evaluatedBytes  sum of `length` over every parsed script
 * @property {number} evaluatedCount  number of parsed scripts
 * @property {number} totalBytes       sum of `length` over the reported list
 * @property {number} totalCount       number of reported scripts
 */

/**
 * Sums the script parse size of every parsed script. The spec
 * captures the scripts the browser parsed during the load window
 * and calls this helper to compute the evaluated-bytes total. An
 * `originPrefix` (e.g. `https://localhost:4173`) excludes test
 * harness scripts and chrome-extension scripts so the metric
 * reflects the page's own evaluated bytes.
 *
 * @param {ParsedScript[]} scripts
 * @param {Object} [opts]
 * @param {string} [opts.originPrefix]  only count scripts whose url starts with this prefix
 * @returns {EvaluatedBytesSummary}
 */
export function summarizeEvaluatedBytes(scripts, { originPrefix } = {}) {
  let evaluatedBytes = 0;
  let evaluatedCount = 0;
  let totalBytes = 0;
  let totalCount = 0;
  for (const s of scripts) {
    if (!s || typeof s !== 'object') continue;
    const len = typeof s.length === 'number' && Number.isFinite(s.length) ? s.length : 0;
    totalBytes += len;
    totalCount += 1;
    if (originPrefix !== undefined && typeof s.url === 'string' && !s.url.startsWith(originPrefix)) {
      continue;
    }
    evaluatedBytes += len;
    evaluatedCount += 1;
  }
  return { evaluatedBytes, evaluatedCount, totalBytes, totalCount };
}
