import { execFileSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { menuItemTestId, BLANK_HOME_EXTENSION_ID, HELLO_WORLD_EXTENSION_ID } from './extensionIds.mjs';
import { SHELL_PORT } from './ports.mjs';
import { waitForMountedScreen } from './mountedScreen';

/**
 * Compatibility: the current shell registers and loads a microfrontend built
 * by an older producer, and one manifest or entry that fails registration
 * disables only its own microfrontend.
 *
 * `fixtures/old-producer-blank-mfe` is a real older build: its manifest holds
 * `shared[]` and the older-producer fields and no `units` or `lists`, and its
 * `publicPath` is "auto". It is served from its own origin next to the
 * current shell; its manifest reaches the shell the way every manifest does,
 * through the aggregate `generated-mfe-manifests.json`, which the shell's own
 * `ManifestGenerator` resolves ("auto" included) from the build output.
 *
 * Runs on HTTP/1.1 only: the fixture origin is plain HTTP.
 */

test.skip(process.env.E2E_PROTOCOL === 'h2', 'the older-producer origin is plain HTTP');

const SHELL = `http://localhost:${SHELL_PORT}`;
const OLD_ORIGIN = 'http://localhost:3098';
const FIXTURE = resolve(import.meta.dirname, 'fixtures', 'old-producer-blank-mfe');
const SHELL_DIR = resolve(import.meta.dirname, '..', 'template-shell');
const MIME: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

interface PackageConfig {
  manifest: { id: string; metaData: { publicPath: string }; shared?: unknown[] };
  entries: Array<Record<string, unknown>>;
  extensions?: Array<Record<string, unknown>>;
}

let server: Server;
let workspace: string;
let oldPackage: PackageConfig;

test.beforeAll(async () => {
  server = createServer((req, res) => {
    let decoded: string;
    try {
      decoded = decodeURIComponent(new URL(req.url ?? '/', OLD_ORIGIN).pathname);
    } catch {
      res.writeHead(400, { 'access-control-allow-origin': '*' });
      res.end('bad request');
      return;
    }
    const path = normalize(decoded).replace(/^([/\\])+/, '');
    const file = join(FIXTURE, 'emitted', path);
    if (path.startsWith('..') || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404, { 'access-control-allow-origin': '*' });
      res.end('not found');
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      'access-control-allow-origin': '*',
    });
    res.end(readFileSync(file));
  });
  await new Promise<void>((done) => server.listen(3098, done));

  // The shell's own generator aggregates the older build, resolving its
  // "auto" publicPath to the origin that serves it. It reads a package's
  // output from `dist/`, so the fixture's output is laid out there.
  workspace = mkdtempSync(join(tmpdir(), 'compat-older-producer-'));
  const oldBlank = join(workspace, 'src-app', 'mfe_packages', 'old-blank-mfe');
  mkdirSync(join(oldBlank, 'dist'), { recursive: true });
  cpSync(join(FIXTURE, 'mfe.json'), join(oldBlank, 'mfe.json'));
  cpSync(join(FIXTURE, 'emitted', 'mfe-manifest.json'), join(oldBlank, 'dist', 'mfe-manifest.json'));
  mkdirSync(join(workspace, 'public'));
  execFileSync(
    join(SHELL_DIR, 'node_modules', '.bin', 'tsx'),
    [join(SHELL_DIR, 'scripts', 'generate-mfe-manifests.ts'), '--base-url', OLD_ORIGIN],
    { cwd: workspace, stdio: 'pipe', env: { ...process.env, FRONTX_INCLUDE_TEMPLATE_EXAMPLES: '1' } },
  );
  // The older build is a template example, which the generator includes under
  // `FRONTX_INCLUDE_TEMPLATE_EXAMPLES`.
  oldPackage = (
    JSON.parse(readFileSync(join(workspace, 'public', 'generated-mfe-manifests.json'), 'utf-8')) as PackageConfig[]
  )[0];
  expect(oldPackage).toBeDefined();
});

test.afterAll(async () => {
  await new Promise((done) => server.close(done));
  rmSync(workspace, { recursive: true, force: true });
});

/** Serves the shell an aggregate built from the server's own, as `change` rewrites it. */
async function serveAggregate(page: Page, change: (served: PackageConfig[]) => PackageConfig[]): Promise<void> {
  await page.route('**/generated-mfe-manifests.json', async (route) => {
    const served = (await (await route.fetch()).json()) as PackageConfig[];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'cache-control': 'no-cache' },
      body: JSON.stringify(change(served)),
    });
  });
}

/** The older build replaces the current blank MFE: both declare the same ids. */
const withOldBlank = (served: PackageConfig[]): PackageConfig[] => [
  ...served.filter((config) => config.manifest.id !== oldPackage.manifest.id),
  oldPackage,
];

async function boot(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${SHELL}/`);
  await expect(page.locator('#root')).not.toBeEmpty({ timeout: 60_000 });
  return errors;
}

test('the manifest the older build wrote carries shared[] and no unit table', () => {
  expect(oldPackage.manifest.metaData.publicPath).toBe(`${OLD_ORIGIN}/`);
  expect(Array.isArray(oldPackage.manifest.shared) && oldPackage.manifest.shared.length > 0).toBe(true);
  expect('units' in oldPackage.manifest).toBe(false);
  expect('lists' in oldPackage.manifest).toBe(false);
});

test('an older-producer microfrontend registers and mounts in the current shell, loaded through shared[]', async ({ page }) => {
  await serveAggregate(page, withOldBlank);
  const oldRequests: string[] = [];
  page.on('request', (r) => {
    if (r.url().startsWith(OLD_ORIGIN)) oldRequests.push(new URL(r.url()).pathname);
  });
  const errors = await boot(page);

  await page.getByTestId(menuItemTestId(BLANK_HOME_EXTENSION_ID)).click();
  await waitForMountedScreen(page, BLANK_HOME_EXTENSION_ID, 60_000);

  // The older build's whole-package entries came from its own origin.
  expect(oldRequests.some((p) => p.startsWith('/shared/'))).toBe(true);
  expect(oldRequests.some((p) => p.startsWith('/assets/lifecycle-'))).toBe(true);
  expect(errors).toEqual([]);
});

test('a manifest that fails registration leaves the shell, the older build and another microfrontend working', async ({ page }) => {
  const broken: PackageConfig = {
    // No publicPath: the type system rejects the manifest at registration.
    manifest: { id: 'gts.frontx.mfes.mfe.mf_manifest.v1~compat.broken.mfe.manifest.v1', metaData: {} as { publicPath: string } },
    entries: [
      {
        id: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~compat.broken.mfe.home.v1',
        requiredProperties: [],
        actions: [],
        domainActions: [],
        manifest: 'gts.frontx.mfes.mfe.mf_manifest.v1~compat.broken.mfe.manifest.v1',
        exposedModule: './lifecycle',
        exposeAssets: { js: { sync: ['assets/none.js'] }, css: { sync: [], async: [] } },
      },
    ],
    extensions: [],
  };
  await serveAggregate(page, (served) => [broken, ...withOldBlank(served)]);
  const disabled: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && m.text().includes('Disabling')) disabled.push(m.text());
  });
  const errors = await boot(page);

  // Another microfrontend of the same aggregate mounts.
  await page.getByTestId(menuItemTestId(HELLO_WORLD_EXTENSION_ID)).click();
  await waitForMountedScreen(page, HELLO_WORLD_EXTENSION_ID, 60_000);

  // So does the older build.
  await page.getByTestId(menuItemTestId(BLANK_HOME_EXTENSION_ID)).click();
  await waitForMountedScreen(page, BLANK_HOME_EXTENSION_ID, 60_000);

  // The broken package is the only thing the shell disabled.
  await expect
    .poll(() => disabled.some((text) => text.includes('compat.broken.mfe.manifest')))
    .toBe(true);
  expect(disabled).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('the older manifest and entry register unmodified, as the older producer wrote them', async ({ page }) => {
  // The fixture's own files, byte for byte: `publicPath` stays "auto" and
  // every older-producer field stays in place; nothing resolves or strips them.
  const emitted = JSON.parse(readFileSync(join(FIXTURE, 'emitted', 'mfe-manifest.json'), 'utf-8')) as {
    manifest: Record<string, unknown>;
    entries: Array<Record<string, unknown>>;
  };
  // The current build of the same microfrontend is left out of the aggregate,
  // so the older ids are registered once, by this test.
  await serveAggregate(page, (served) => served.filter((config) => config.manifest.id !== oldPackage.manifest.id));
  await boot(page);

  const registered = await page.evaluate(
    ({ manifest, entries }) => {
      // The shell's registry, read from the React tree the way a component reads it.
      type Fiber = { memoizedProps?: any; child?: Fiber; sibling?: Fiber };
      const root = document.getElementById('root') as any;
      const key = Object.keys(root).find((k) => k.startsWith('__reactContainer$'));
      if (!key) throw new Error('no React container on #root');
      let registry: any;
      const stack: Fiber[] = [root[key]];
      while (stack.length > 0 && registry === undefined) {
        const fiber = stack.pop()!;
        const props = fiber.memoizedProps;
        registry = props?.app?.mfeRegistry ?? props?.value?.mfeRegistry ?? props?.value?.app?.mfeRegistry;
        if (fiber.sibling) stack.push(fiber.sibling);
        if (fiber.child) stack.push(fiber.child);
      }
      if (!registry) throw new Error('the shell registry was not found in the React tree');
      registry.typeSystem.register(manifest);
      for (const entry of entries) registry.typeSystem.register(entry);
      return { manifest: manifest.id, entries: entries.length };
    },
    { manifest: emitted.manifest, entries: emitted.entries },
  );

  expect(registered.manifest).toBe(oldPackage.manifest.id);
  expect(registered.entries).toBeGreaterThan(0);
  expect((emitted.manifest.metaData as { publicPath: string }).publicPath).toBe('auto');
});
