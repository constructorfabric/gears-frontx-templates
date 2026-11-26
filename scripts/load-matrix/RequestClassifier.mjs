/**
 * `RequestClassifier` — network request reconciliation.
 *
 * The harness's `Network.requestWillBeSent` watcher counted every
 * event as a "request", including `blob:` and `data:` URLs and
 * cache-served re-fires, which inflated the count. Every captured
 * request is classified into `network` / `blob` / `data` /
 * `cacheServed` and the classification is reported in the cell JSON.
 * The reconciled number a cell reports as its request count is the
 * `network` class (HTTP/HTTPS over the wire), with the other classes
 * shown separately so the reader can audit the total.
 *
 * One class per file (OOP) is overkill for two pure functions; this
 * is a pure helper module — no class state to keep consistent. A
 * unit test passes the request list directly (no CDP in unit tests).
 */

/** @typedef {'network' | 'blob' | 'data' | 'cacheServed'} RequestClass */

/**
 * @typedef {Object} CapturedRequest
 * @property {string} url
 * @property {boolean} fromCache
 */

/**
 * @typedef {Object} RequestSummary
 * @property {number} total
 * @property {number} network
 * @property {number} blob
 * @property {number} data
 * @property {number} cacheServed
 * @property {Record<RequestClass, number>} byClass
 */

/**
 * Classifies a single captured request. `blob:` and `data:` URLs are
 * not network requests (the browser synthesises them in-process);
 * a request marked `fromCache` was served from the local HTTP cache
 * and did not cross the wire again. Everything else is a network
 * request.
 *
 * @param {string} url
 * @param {boolean} fromCache
 * @returns {RequestClass}
 */
export function classifyRequest(url, fromCache) {
  if (typeof url === 'string' && url.startsWith('blob:')) return 'blob';
  if (typeof url === 'string' && url.startsWith('data:')) return 'data';
  if (fromCache) return 'cacheServed';
  return 'network';
}

/**
 * Summarises a list of captured requests into the four classes. The
 * reconciled network-request count is `summary.network`; `total` is
 * the raw event count (what the harness previously reported as
 * "requests").
 *
 * @param {CapturedRequest[]} requests
 * @returns {RequestSummary}
 */
export function summarizeRequests(requests) {
  /** @type {Record<RequestClass, number>} */
  const byClass = { network: 0, blob: 0, data: 0, cacheServed: 0 };
  let total = 0;
  for (const r of requests) {
    total += 1;
    byClass[classifyRequest(r.url, r.fromCache)] += 1;
  }
  return {
    total,
    network: byClass.network,
    blob: byClass.blob,
    data: byClass.data,
    cacheServed: byClass.cacheServed,
    byClass,
  };
}
