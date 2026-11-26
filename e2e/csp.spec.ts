import { test, expect } from '@playwright/test';

const scheme = process.env.E2E_PROTOCOL === 'h2' ? 'https' : 'http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { menuItemTestId, BLANK_HOME_EXTENSION_ID } from './extensionIds.mjs';
import { SHELL_PORT, SHELL_PORT_CSP_BLOB, SHELL_PORT_CSP_STRICT } from './ports.mjs';
import { waitForMountedScreen } from './mountedScreen';

declare global {
  interface Window {
    /** Set by the probe's nonce-less inline script, which the policy must block. */
    __noncelessInlineRan?: boolean;
  }
}

/**
 * CSP coverage. :4174 serves the shell under a CSP that allows blob:
 * script-src (blocking). :4175 serves a nonce-based CSP with
 * 'strict-dynamic' + blob: — the spec verifies the probe really ran
 * under that policy (CSP header present with the nonce, nonce-less
 * inline blocked, import(blobUrl) actually attempted) and records the
 * true verdict in e2e/results/strict-dynamic-result.json; when the verdict is
 * "blocked" the record carries the hosting-requirement note.
 */

const STRICT_DYNAMIC_RESULT_FILE = path.resolve('e2e', 'results', 'strict-dynamic-result.json');

test('the page works under a CSP permitting blob: script-src', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${scheme}://localhost:${SHELL_PORT_CSP_BLOB}/`);
  await expect(page.locator('#root')).not.toBeEmpty({ timeout: 60_000 });

  // Mounts are driven by the menu's mount_ext action chain.
  await page.getByTestId(menuItemTestId(BLANK_HOME_EXTENSION_ID)).click();
  // Poll for the mount to settle — blob minting and rendering complete —
  // instead of sleeping; a CSP failure surfaces as a page error before
  // the screen settles.
  await waitForMountedScreen(page, BLANK_HOME_EXTENSION_ID);
  expect(
    errors.filter((e) => /Content Security Policy|CSP|resolve module specifier/i.test(e)),
  ).toEqual([]);
});

test("records whether import(blobUrl) works under 'strict-dynamic' (informational)", async ({
  page,
}) => {
  const response = await page.goto(`${scheme}://localhost:${SHELL_PORT_CSP_STRICT}/probe.html`);
  // The probe is only meaningful if the strict-dynamic policy actually
  // applied: the response carries the CSP header, it names the nonce the
  // module script uses, and the nonce-less inline script probe.html
  // ships is really blocked.
  const csp = response?.headers()['content-security-policy'] ?? '';
  expect(csp).toContain("'nonce-e2e'");
  expect(csp).toContain("'strict-dynamic'");

  await expect
    .poll(async () => (await page.locator('#result').innerText()) !== 'pending', {
      timeout: 15_000,
    })
    .toBe(true);
  const result = await page.locator('#result').innerText();

  const noncelessInlineRan = await page.evaluate(
    () => window.__noncelessInlineRan === true,
  );
  expect(noncelessInlineRan).toBe(false);

  const record: Record<string, unknown> = {
    cspHeader: csp,
    nonceApplied: true,
    strictDynamicApplied: true,
    noncelessInlineBlocked: !noncelessInlineRan,
    importAttempted: result.startsWith('blob-import:'),
    verdict: result,
    measuredAt: new Date().toISOString(),
  };
  if (result !== 'blob-import:ok') {
    // True verdict: blocked. Hosting requirement for FrontX blob-unit
    // loading: a host CSP that carries 'strict-dynamic' makes browsers
    // ignore the blob: source for nonce-authorized dynamic imports, so
    // hosting must either drop 'strict-dynamic' or keep blob: effective
    // in script-src for the units the runtime mints.
    record.hostingRequirement =
      "Under script-src 'strict-dynamic', browsers ignore the blob: scheme " +
      'source for imports initiated by a trusted (nonced) script: import(blobUrl) ' +
      'is blocked. FrontX blob-unit loading therefore requires the host CSP to ' +
      "omit 'strict-dynamic' (or otherwise keep blob: effective) in script-src.";
  }
  fs.mkdirSync(path.dirname(STRICT_DYNAMIC_RESULT_FILE), { recursive: true });
  fs.writeFileSync(STRICT_DYNAMIC_RESULT_FILE, JSON.stringify(record, null, 2));
  console.log(`STRICT_DYNAMIC_BLOB_IMPORT_RESULT=${result}`);
  // Informational: assert only that the probe produced a verdict.
  expect(result).toMatch(/^blob-import:/);
});

test('records revoked-blob import behaviour (informational)', async ({ page }) => {
  await page.goto(`${scheme}://localhost:${SHELL_PORT}/probe.html?mode=revoked`);
  await expect
    .poll(async () => (await page.locator('#result').innerText()) !== 'pending', {
      timeout: 15_000,
    })
    .toBe(true);
  const result = await page.locator('#result').innerText();
  console.log(`REVOKED_BLOB_IMPORT_RESULT=${result}`);
  expect(result).toMatch(/^revoked-import:/);
});
