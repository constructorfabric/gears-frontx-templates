import { test, expect, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { FillRequestWatcher } from '../scripts/load-matrix/FillRequestWatcher.mjs';
import { BLANK_HOME_EXTENSION_ID, menuItemTestId } from './extensionIds.mjs';
import { SHELL_PORT } from './ports.mjs';
import { waitForMountedScreen } from './mountedScreen';

const scheme = process.env.E2E_PROTOCOL === 'h2' ? 'https' : 'http';

/**
 * Request-count measurement: the number of
 * HTTP requests a cold shell boot and one MFE load-to-mount put on the
 * wire, counted server-side per origin by `e2e/server.mjs`
 * (`/__e2e/requests` returns the snapshot AND resets the counters).
 * Runs under both protocols (`E2E_PROTOCOL`) and writes
 * `e2e/results/request-count-<protocol>.json` for the phase report. It is a
 * measurement, not a gate: the counts are reported, never asserted.
 */

const SHELL = `${scheme}://localhost:${SHELL_PORT}`;
const PROTOCOL = process.env.E2E_PROTOCOL === 'h2' ? 'h2' : 'http1';
const RESULTS_DIR = path.resolve('e2e', 'results');
const RESULTS_FILE = path.join(RESULTS_DIR, `request-count-${PROTOCOL}.json`);

/** Per-origin counts: every request, and the `fetch()`-issued shared-unit subset. */
interface Snapshot {
  total: Record<string, number>;
  unitFetches: Record<string, number>;
}

async function snapshotCounts(page: Page): Promise<Snapshot> {
  const res = await page.request.get(`${SHELL}/__e2e/requests`);
  return res.json();
}

const sum = (c: Record<string, number>) => Object.values(c).reduce((n, v) => n + v, 0);

/** Per-origin `a - b`, keeping only origins that remain positive. */
function minus(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(a)) {
    const n = v - (b[k] ?? 0);
    if (n > 0) out[k] = n;
  }
  return out;
}

test(`request count (${PROTOCOL}): requests per shell boot and per MFE load`, async ({ page }) => {
  // The snapshot resets all origin counters — bracket exactly the boot.
  await page.request.get(`${SHELL}/__e2e/requests`);
  const fill = new FillRequestWatcher(page, `${SHELL}/shared/`);
  await page.goto(`${SHELL}/`);
  await expect(page.locator('#root')).not.toBeEmpty({ timeout: 60_000 });

  // The realm-cache fill starts at shell entry; wait for its requests to
  // finish so every one of its re-fetches is inside this window, then split
  // them out by request kind: the native boot loads units as scripts, the
  // fill re-requests them through `fetch()`.
  await fill.settled(60_000);
  const bootWindow = await snapshotCounts(page);
  const bootPerOrigin = minus(bootWindow.total, bootWindow.unitFetches);

  await page.getByTestId(menuItemTestId(BLANK_HOME_EXTENSION_ID)).click();
  await waitForMountedScreen(page, BLANK_HOME_EXTENSION_ID, 60_000);
  const afterMfe = (await snapshotCounts(page)).total;

  const result = {
    protocol: PROTOCOL,
    boot: { perOrigin: bootPerOrigin, total: sum(bootPerOrigin) },
    fillRefetches: { perOrigin: bootWindow.unitFetches, total: sum(bootWindow.unitFetches) },
    mfeLoad: { perOrigin: afterMfe, total: sum(afterMfe) },
    measuredAt: new Date().toISOString(),
  };
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(result, null, 2));
  console.log(
    `[${PROTOCOL}] shell boot requests=${result.boot.total} ` +
      `fill re-fetch requests=${result.fillRefetches.total} ` +
      `mfe load requests=${result.mfeLoad.total}`,
  );
});
