/**
 * `BootCheck` — starts `e2e/server.mjs` (its `startServers()` export), awaits
 * `ready`, loads the shell origin through a page loader, asserts `#root`
 * has ≥ 1 child and no page error, records console errors, then closes the
 * page loader's resources (the browser) AND the servers in a `finally` so a
 * failing probe never leaks either. Before this, the page loader opened a
 * browser inside itself and only closed it on the success path — a Playwright
 * timeout/error inside the loader threw past `browser.close()`, leaving a
 * headless Chromium running and the coordinator unable to exit.
 *
 * The page loader contract is `(url) => Promise<{ probe, close }>`: `probe`
 * is the {@link PageProbe} and `close` releases the browser (and any other
 * resources the loader owns). BootCheck always calls `loader.close()` in its
 * `finally`, even when the loader throws — a loader that throws before
 * returning a handle is responsible for its own cleanup, but a loader that
 * returns a handle hands the cleanup obligation to BootCheck.
 *
 * The class takes its collaborators as constructor args so a unit test
 * passes a fake `startServers` and a fake `pageLoader` (no real browser in
 * unit tests). The CLI entry in `scripts/verify-dev.mjs` wires the real
 * server and a Playwright-backed page loader.
 *
 * @typedef {{
 *   rootChildCount: number;
 *   pageErrors: string[];
 *   consoleErrors: string[];
 * }} PageProbe
 * @typedef {{ ready: Promise<unknown>; close: () => Promise<unknown> }} ServerHandle
 * @typedef {{ probe: PageProbe; close: () => Promise<unknown> }} PageLoaderResult
 */

import { SHELL_PORT } from '../../e2e/ports.mjs';

/** Default shell origin, served by `e2e/server.mjs` on the shell port (no CSP). */
export const DEFAULT_SHELL_ORIGIN = `http://localhost:${SHELL_PORT}`;

export class BootCheck {
  /**
   * @param {{
   *   startServers: () => (Promise<ServerHandle> | ServerHandle);
   *   pageLoader: (url: string) => Promise<PageLoaderResult>;
   *   shellOrigin?: string;
   *   log?: (line: string) => void;
   * }} opts
   */
  constructor({ startServers, pageLoader, shellOrigin = DEFAULT_SHELL_ORIGIN, log = (line) => console.log(line) } = {}) {
    if (!startServers) throw new Error('BootCheck: startServers is required');
    if (!pageLoader) throw new Error('BootCheck: pageLoader is required');
    this.startServers = startServers;
    this.pageLoader = pageLoader;
    this.shellOrigin = shellOrigin;
    this.log = log;
  }

  /**
   * @returns {Promise<{ ok: boolean; rootChildCount: number; pageErrors: string[]; consoleErrors: string[] }>}
   */
  async run() {
    const servers = await this.startServers();
    /** @type {PageLoaderResult | null} */
    let loader = null;
    try {
      await servers.ready;
      loader = await this.pageLoader(this.shellOrigin);
      const probe = loader.probe;
      const pageErrors = probe.pageErrors ?? [];
      const consoleErrors = probe.consoleErrors ?? [];
      const ok = probe.rootChildCount >= 1 && pageErrors.length === 0;
      this.log(`boot check: ok=${ok} rootChildren=${probe.rootChildCount} pageErrors=${pageErrors.length} consoleErrors=${consoleErrors.length}`);
      return { ok, rootChildCount: probe.rootChildCount, pageErrors, consoleErrors };
    } finally {
      // Always release the browser (page loader handle) and the servers, even
      // on timeout/error — the coordinator must be able to exit.
      if (loader) {
        try {
          await loader.close();
        } catch {
          /* best-effort: a loader cleanup failure must not mask the real error */
        }
      }
      await servers.close();
    }
  }
}
