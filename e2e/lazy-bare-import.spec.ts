import { test, expect, type CDPSession, type Page } from '@playwright/test';
import { menuItemTestId, LAZY_IMPORT_EXTENSION_ID } from './extensionIds.mjs';
import { SHELL_PORT } from './ports.mjs';
import { waitForMountedScreen } from './mountedScreen';
import { roundsOf, type Req } from './roundsOf';

/**
 * A bare lazy import of a shared package loads on its first call.
 *
 * The producer keys the lazy list of a bare `import('<pkg>')` under the bare
 * specifier, so the runtime must look that import up under the same key. Two
 * callers reach it, both on `lazy-import-fixture`:
 *
 *  - an MFE's own code imports `lazy-own-kit`, a shared package nothing else
 *    reaches;
 *  - the shared package `lazy-host-kit` (statically imported by the MFE)
 *    imports `lazy-leaf-kit/sub` from its own code; nothing else reaches the
 *    leaf package.
 *
 * Each runs against the built shell and the built fixture, in a real browser,
 * on a user click. The first click must render the imported module, with no
 * load error, no request for an own chunk named after the package and no 404,
 * in one unit-fetch round.
 */

/** The first `@gears-frontx/mfes` runtime that resolves a bare lazy key. */
const MIN_RUNTIME = [0, 7, 1] as const;

const scheme = process.env.E2E_PROTOCOL === 'h2' ? 'https' : 'http';
const SHELL = `${scheme}://localhost:${SHELL_PORT}`;

/** Console or page errors that mean the lazy import did not load. */
const LOAD_FAILURES = ['minted no blob', 'has no list', 'MfeLoadError', 'Failed to load'];

interface Case {
  name: string;
  trigger: string;
  output: string;
  rendered: string;
  /** Path suffixes that would be an own-chunk request named after the package. */
  ownChunkSuffixes: string[];
}

const CASES: Case[] = [
  {
    name: 'an MFE own-code bare import of a shared package',
    trigger: 'lazy-own-trigger',
    output: 'lazy-own-output',
    rendered: 'own-code-lazy-kit-loaded',
    ownChunkSuffixes: ['/lazy-own-kit', '/assets/lazy-own-kit'],
  },
  {
    name: 'a shared package that bare-imports another shared package from its own code',
    trigger: 'lazy-shared-trigger',
    output: 'lazy-shared-output',
    rendered: 'shared-unit-lazy-kit-loaded',
    ownChunkSuffixes: ['/lazy-leaf-kit/sub', '/assets/lazy-leaf-kit/sub', '/lazy-leaf-kit', '/assets/lazy-leaf-kit'],
  },
];

/** Tracks `/shared/**.js` unit fetches, with what the round count needs. */
function watchUnits(cdp: CDPSession): Req[] {
  const byId = new Map<string, Req>();
  const requests: Req[] = [];
  cdp.on('Network.requestWillBeSent', (e: any) => {
    const url: string = e.request.url;
    if (!url.includes('/shared/') || !url.endsWith('.js')) return;
    const initiator = e.initiator ?? {};
    const type: string = initiator.type ?? 'other';
    const initiatorUrl =
      type === 'script'
        ? (initiator.stack?.callFrames?.[0]?.url as string | undefined)
        : type === 'parser'
          ? (initiator.url as string | undefined)
          : undefined;
    const r: Req = { url, start: e.timestamp, initiatorType: type, resourceType: String(e.type ?? ''), initiatorUrl };
    byId.set(e.requestId, r);
    requests.push(r);
  });
  const finish = (e: any) => {
    const r = byId.get(e.requestId);
    if (r) r.end = e.timestamp;
  };
  cdp.on('Network.loadingFinished', finish);
  cdp.on('Network.loadingFailed', finish);
  return requests;
}

/** The `@gears-frontx/mfes` version the built shell ships, read off its import map. */
async function shellRuntimeVersion(page: Page): Promise<string | undefined> {
  const html = await (await page.request.get(`${SHELL}/index.html`)).text();
  return /@gears-frontx\/mfes@(\d+\.\d+\.\d+[^/"]*)/.exec(html)?.[1];
}

function atLeast(version: string, min: readonly number[]): boolean {
  const parts = version.split(/[.-]/).slice(0, 3).map(Number);
  for (let i = 0; i < min.length; i += 1) {
    if (parts[i] !== min[i]) return parts[i] > min[i];
  }
  return true;
}

for (const c of CASES) {
  test(`${c.name} loads on its first call`, async ({ page }) => {
    // A runtime older than the fix cannot pass this spec silently: the check
    // is reported alongside the behavioural assertions below.
    const version = await shellRuntimeVersion(page);
    expect.soft(
      version !== undefined && atLeast(version, MIN_RUNTIME),
      `the shell's @gears-frontx/mfes runtime is ${version ?? 'unknown'}; this spec needs @gears-frontx/mfes >= ${MIN_RUNTIME.join('.')}, the first release that loads a bare lazy import of a shared package`,
    ).toBe(true);

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    const units = watchUnits(cdp);

    await page.goto(`${SHELL}/`);
    await expect(page.locator('#root')).not.toBeEmpty({ timeout: 60_000 });
    await page.getByTestId(menuItemTestId(LAZY_IMPORT_EXTENSION_ID)).click();
    await waitForMountedScreen(page, LAZY_IMPORT_EXTENSION_ID);

    // Everything below observes the lazy step only.
    const errors: string[] = [];
    const paths: string[] = [];
    const notFound: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('request', (r) => paths.push(new URL(r.url()).pathname));
    page.on('response', (r) => {
      if (r.status() === 404) notFound.push(r.url());
    });
    const before = units.length;

    await page.getByTestId(c.trigger).click();
    await expect.soft(page.getByTestId(c.output), 'the lazily imported module is rendered by the first click').toHaveText(
      c.rendered,
      { timeout: 10_000 },
    );
    // Let any failure the first call raises settle before the assertions.
    await page.waitForTimeout(500);

    const failures = errors.filter((text) => LOAD_FAILURES.some((needle) => text.includes(needle)));
    expect.soft(failures, 'load errors during the lazy step').toEqual([]);
    expect.soft(
      paths.filter((p) => c.ownChunkSuffixes.some((suffix) => p.endsWith(suffix))),
      'own-chunk requests named after the shared package',
    ).toEqual([]);
    expect.soft(notFound, '404 responses during the lazy step').toEqual([]);

    const lazy = roundsOf(units.slice(before));
    expect.soft(lazy.rounds, 'the lazy step fetches its unit in exactly one round').toBe(1);
  });
}
