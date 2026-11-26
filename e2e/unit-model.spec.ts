import { test, expect, type Page } from '@playwright/test';

import * as fs from 'node:fs';
import * as path from 'node:path';
import { FillRequestWatcher } from '../scripts/load-matrix/FillRequestWatcher.mjs';
import {
  BLANK_HOME_EXTENSION_ID,
  HELLO_WORLD_EXTENSION_ID,
  UIKIT_ELEMENTS_EXTENSION_ID,
  WIDGETS_HOST_EXTENSION_ID,
  menuItemTestId,
} from './extensionIds.mjs';
import { SHELL_PORT, fixturePorts } from './ports.mjs';
import { waitForMountedScreen } from './mountedScreen';

const scheme = process.env.E2E_PROTOCOL === 'h2' ? 'https' : 'http';

declare global {
  interface Window {
    /** Every JavaScript blob URL the page minted, recorded by the init script. */
    __mintedBlobs?: string[];
    /** The page's own `URL.createObjectURL`, which the init script wraps. */
    __createObjectURL?: typeof URL.createObjectURL;
  }
}

/**
 * Blocking specs for the shared-dependency unit model, run against the
 * built template-shell host (origin :4173) and the template-mfe fixture
 * dists on their own origins.
 *
 * Screen mounts are driven by the menu's mount_ext action chain, so the
 * specs click the menu items rather than navigating to the route URL.
 */

const SHELL = `${scheme}://localhost:${SHELL_PORT}`;
const MFE_PACKAGES = path.resolve('template-mfe', 'src-app', 'mfe_packages');
/** The origins the fixture MFEs are served from, read from their own manifests. */
const FIXTURE_PORTS = new RegExp(`localhost:(${fixturePorts(MFE_PACKAGES).join('|')})`);

/** The blank home screen is served by the `_blank-mfe` fixture. */
const BLANK_MFE_MANIFEST = path.resolve(
  'template-mfe',
  'src-app',
  'mfe_packages',
  '_blank-mfe',
  'dist',
  'mfe-manifest.json',
);

/**
 * Packages the blank MFE requires at runtime, read from its built
 * manifest: the package each unit of its unit table answers.
 */
function blankMfeRequiredPackages(): Set<string> {
  const manifest = JSON.parse(fs.readFileSync(BLANK_MFE_MANIFEST, 'utf-8'));
  const required = new Set<string>();
  for (const unit of manifest.manifest?.units ?? []) {
    for (const specifier of unit.answers ?? []) {
      const parts = String(specifier).split('/');
      required.add(specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]);
    }
  }
  return required;
}

/** Track every request URL plus every blob: URL the page mints. */
async function instrument(page: Page) {
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  const fill = new FillRequestWatcher(page, `${SHELL}/shared/`);
  await page.addInitScript(() => {
    const minted: string[] = [];
    const createObjectURL = URL.createObjectURL.bind(URL);
    window.__mintedBlobs = minted;
    window.__createObjectURL = createObjectURL;
    URL.createObjectURL = (source: Blob | MediaSource) => {
      const url = createObjectURL(source);
      if (source instanceof Blob && (source.type.includes('javascript') || source.type.includes('ecmascript'))) {
        minted.push(url);
      }
      return url;
    };
  });
  return { requests, fill };
}

async function bootShell(page: Page) {
  await page.goto(`${SHELL}/`);
  // The shell is booted when the app rendered into #root.
  await expect(page.locator('#root')).not.toBeEmpty({ timeout: 60_000 });
}

/**
 * A signature for the currently mounted screen — its extension id plus
 * its rendered text — so a re-mount can wait for the OLD screen to be
 * replaced, not just for any screen to exist.
 */
async function mountedScreenSignature(page: Page): Promise<string> {
  return page.evaluate(() => {
    const host = document.querySelector('[data-mfe-screen-container] [data-extension-id]');
    if (!host) return '';
    const el = host as HTMLElement;
    const root = el.shadowRoot ?? el;
    return `${el.dataset.extensionId}|${(root.textContent ?? '').slice(0, 200)}`;
  });
}

/** Mount an MFE screen through the host menu's mount action. */
async function mount(page: Page, extensionId: string) {
  await page.getByTestId(menuItemTestId(extensionId)).click();
}

async function mintedCount(page: Page): Promise<number> {
  return page.evaluate(() => window.__mintedBlobs?.length ?? 0);
}

test('shell boot loads shared units natively (no blob minting for the shell)', async ({ page }) => {
  const { requests } = await instrument(page);
  await bootShell(page);
  // The shell's shared chunks arrive as native /shared/ fetches resolved
  // through the inline import map; the shell itself mints nothing.
  expect(requests.some((u) => u.includes('/shared/'))).toBe(true);
  expect(await mintedCount(page)).toBe(0);
});

test('realm cache: a unit the shell fetched is reused by an MFE with no second fetch of that package', async ({
  page,
}) => {
  const { requests, fill } = await instrument(page);
  await bootShell(page);
  // The realm-cache fill starts as soon as the shell entry has run; wait
  // for its requests to finish so its cache-riding re-fetches don't land
  // inside the MFE-load window below.
  await fill.settled(60_000);

  // Packages the shell already delivered (its own shared set). The name
  // is everything before the `@version` segment — including the scope
  // for scoped packages (`@scope/pkg@ver`, never `.split('@')`, which
  // would eat the scope and leave an empty name).
  const packageName = (u: string) =>
    /\/shared\/((?:@[^/]+\/)?[^@/]+)@/.exec(u)?.[1];
  const shellSharedPackages = new Set(
    requests
      .filter((u) => u.startsWith(`${SHELL}/shared/`))
      .map(packageName)
      .filter((n): n is string => n !== undefined),
  );
  // Unit identity is the content-hashed path under /shared/ — the realm
  // cache answers by content identity, so a unit the shell fetched must
  // never cross the network again, whatever origin asks for it.
  const shellUnitPaths = new Set(
    requests
      .filter((u) => u.startsWith(`${SHELL}/shared/`) && u.endsWith('.js'))
      .map((u) => u.slice(u.indexOf('/shared/'))),
  );

  // The assertion below is only meaningful if the MFE actually requires
  // at least one package the shell fetched — prove the overlap from the
  // built manifest's unit table instead of assuming it.
  const mfeRequired = blankMfeRequiredPackages();
  const overlap = [...mfeRequired].filter((p) => shellSharedPackages.has(p));
  expect(overlap.length).toBeGreaterThan(0);

  const before = requests.length;

  await mount(page, BLANK_HOME_EXTENSION_ID);
  // Wait on the mount-settled signal (the screen rendered) — not a
  // fixed sleep — so every fetch the mount triggered is accounted for.
  await waitForMountedScreen(page, BLANK_HOME_EXTENSION_ID);

  const mfeRequests = requests.slice(before);
  // No unit the shell already delivered is fetched again — the realm
  // content-identity cache answers it, whichever origin asked. Compare
  // by unit path (package@version/unit.hash.js), not package name: the
  // MFE legitimately fetches units of a shell-fetched package that the
  // shell itself never reached. Only `.js` units are compared.
  const refetched = mfeRequests.filter((u) => {
    if (!u.endsWith('.js')) return false;
    return shellUnitPaths.has(u.slice(u.indexOf('/shared/')));
  });
  expect(refetched).toEqual([]);
});

test('blob minting is end-to-end: an MFE screen mounts from minted unit blobs', async ({
  page,
}) => {
  await instrument(page);
  await bootShell(page);
  const before = await mintedCount(page);
  await mount(page, BLANK_HOME_EXTENSION_ID);
  // Mounting the MFE mints its units through the same realm cache.
  await expect
    .poll(() => mintedCount(page), { timeout: 30_000 })
    .toBeGreaterThan(before);
  await waitForMountedScreen(page, BLANK_HOME_EXTENSION_ID);
});

test('lazy chunk loading: mounting a screen fetches its lazy chunks on demand', async ({
  page,
}) => {
  const { requests } = await instrument(page);
  await bootShell(page);
  const before = requests.length;

  await mount(page, UIKIT_ELEMENTS_EXTENSION_ID);
  // Lazy element chunks are named by the entry's fetch list and
  // fetched only when the screen needs them.
  await expect
    .poll(() => requests.slice(before).filter((u) => /Elements-[A-Za-z0-9_-]+\.js/.test(u)).length, {
      timeout: 30_000,
    })
    .toBeGreaterThan(0);
});

test('re-mount: navigating away and back remounts the MFE screen', async ({ page }) => {
  await instrument(page);
  await bootShell(page);
  await mount(page, BLANK_HOME_EXTENSION_ID);
  await waitForMountedScreen(page, BLANK_HOME_EXTENSION_ID);
  const first = await mountedScreenSignature(page);
  expect(first).not.toBe('');

  await mount(page, HELLO_WORLD_EXTENSION_ID);
  // Wait until the screen container shows a DIFFERENT mounted screen —
  // the replacement, not the old screen still in place.
  await expect
    .poll(async () => {
      const sig = await mountedScreenSignature(page);
      return sig !== '' && sig !== first;
    }, { timeout: 30_000 })
    .toBe(true);

  await mount(page, BLANK_HOME_EXTENSION_ID);
  await expect
    .poll(async () => (await mountedScreenSignature(page)) === first, { timeout: 30_000 })
    .toBe(true);
});

test('a shared unit containing a literal dynamic import() resolves it on demand', async ({
  page,
}) => {
  // The @gears-frontx/mfes units carry a literal `import(` (the dynamic
  // module ops the lazy-chunk path runs through). Mounting a nested-host
  // screen (demo-mfe widgets host drives the widgets domain) exercises
  // that unit's on-demand import in the browser.
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const { requests } = await instrument(page);
  await bootShell(page);
  const before = requests.length;

  await mount(page, WIDGETS_HOST_EXTENSION_ID);
  // On-demand work happened after mount: lazy chunks or widget MFE units.
  await expect
    .poll(
      () =>
        requests
          .slice(before)
          .filter((u) => FIXTURE_PORTS.test(u) || /Elements-|lifecycle/.test(u)).length,
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0);
  expect(errors.filter((e) => /resolve module specifier|dynamically imported/i.test(e))).toEqual([]);
});
