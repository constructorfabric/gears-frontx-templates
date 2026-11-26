/**
 * `FillRequestWatcher` - observes the shell's realm-cache fill on the
 * network. The fill re-requests the shell's own units through `fetch()`
 * (the native boot loads the same files as scripts), so its requests are the
 * `fetch`-type requests to the shell's own unit URLs. The fill is done when
 * it has issued requests and every one of them has finished or failed. A
 * fill that issues none, or does not finish, within the bound is a failure
 * the wait reports distinctly.
 *
 * Attach it before the navigation that boots the shell, so no request is
 * missed. It takes the page the spec already holds, so a unit test passes a
 * fake page that emits the same events.
 */

export class FillRequestWatcher {
  #inFlight = new Set();
  #seen = 0;
  #waiters = new Set();

  /**
   * @param {{ on: (event: string, handler: (request: any) => void) => unknown }} page
   * @param {string} unitsUrlPrefix the shell's own unit URL prefix, e.g. `http://localhost:4173/shared/`
   */
  constructor(page, unitsUrlPrefix) {
    this.unitsUrlPrefix = unitsUrlPrefix;
    page.on('request', (request) => {
      if (!this.#isFillRequest(request)) return;
      this.#seen += 1;
      this.#inFlight.add(request);
    });
    const done = (request) => {
      if (this.#inFlight.delete(request)) this.#notify();
    };
    page.on('requestfinished', done);
    page.on('requestfailed', done);
  }

  /** The fill's request count so far. */
  get requestCount() {
    return this.#seen;
  }

  /**
   * Resolves once the fill has issued requests and all of them have
   * finished; rejects after `timeoutMs` naming whether the fill issued no
   * request or did not finish.
   *
   * @param {number} timeoutMs
   * @returns {Promise<void>}
   */
  settled(timeoutMs) {
    if (this.#isSettled()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#waiters.delete(check);
        reject(
          new Error(
            this.#seen === 0
              ? `the shell's cache fill issued no request within ${timeoutMs}ms`
              : `the shell's cache fill did not finish within ${timeoutMs}ms`,
          ),
        );
      }, timeoutMs);
      const check = () => {
        if (!this.#isSettled()) return;
        clearTimeout(timer);
        this.#waiters.delete(check);
        resolve();
      };
      this.#waiters.add(check);
    });
  }

  #isFillRequest(request) {
    return request.resourceType() === 'fetch' && request.url().startsWith(this.unitsUrlPrefix);
  }

  #isSettled() {
    return this.#seen > 0 && this.#inFlight.size === 0;
  }

  #notify() {
    for (const check of [...this.#waiters]) check();
  }
}
