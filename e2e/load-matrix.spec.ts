import { test, expect, type CDPSession, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { awaitCacheFill } from '../scripts/load-matrix/CacheFillWait.mjs';
import { summarizeRequests } from '../scripts/load-matrix/RequestClassifier.mjs';
import { summarizeEvaluatedBytes } from '../scripts/load-matrix/EvaluatedBytes.mjs';
import { CacheStateDriver } from '../scripts/load-matrix/CacheStateDriver.mjs';
import { ParallelCaseChecks } from '../scripts/load-matrix/ParallelCaseChecks.mjs';
import { FillRequestWatcher } from '../scripts/load-matrix/FillRequestWatcher.mjs';
import { SessionFixtures } from '../scripts/load-matrix/SessionFixtures.mjs';
import {
  BLANK_HOME_EXTENSION_ID,
  CURRENT_THEME_EXTENSION_ID,
  HELLO_WORLD_EXTENSION_ID,
  PROFILE_EXTENSION_ID,
  UIKIT_ELEMENTS_EXTENSION_ID,
  WIDGETS_HOST_EXTENSION_ID,
  menuItemTestId,
} from './extensionIds.mjs';
import { SHELL_PORT } from './ports.mjs';
import { waitForMountedScreen } from './mountedScreen';

const scheme = process.env.E2E_PROTOCOL === 'h2' ? 'https' : 'http';

/**
 * Load-matrix cell measurement. One playwright invocation per
 * cell; the cell is selected by env vars set by scripts/load-matrix/LoadMatrixRunner.mjs:
 *   E2E_PROTOCOL (http1|h2), E2E_PROFILE (fast-4g|office-lan),
 *   E2E_COMPRESSION (none|gzip|brotli), E2E_CACHE_STATE (cold|warm|upgrade),
 *   E2E_SESSION (shell+1|shell+5-sequential|shell+5-parallel-startup),
 *   E2E_VARIANT (new|old), LOAD_GATE_RUNS (N).
 *
 * The spec measures boot (first render = #root ≥ 1 child via measureBoot)
 * and the session (shell+1, shell+5 sequential, shell+5 parallel startup).
 * Each run records requests (total / from cache / classified network vs
 * blob/data/cacheServed), bytes, evaluated bytes (via CDP
 * Debugger.scriptParsed), time to mount. Medians over LOAD_GATE_RUNS runs.
 * The FrontX-only cache-fill wait (the shell's own `fetch()` requests to
 * its unit URLs, until all have finished) applies only to the FrontX
 * variant; the old-rule variant skips it. The cache state
 * is selectable per cell: cold clears the browser cache before every
 * run; warm keeps the HTTP cache across runs (repeat visit, same build);
 * upgrade keeps the HTTP cache from the first build (the rebuild and
 * revert are driver responsibilities). Results written to
 * e2e/results/<cell>-measurements.json.
 */

const SHELL = `${scheme}://localhost:${SHELL_PORT}`;
const RUNS = Number(process.env.LOAD_GATE_RUNS ?? 30);
const VARIANT = process.env.E2E_VARIANT ?? 'new';
const PROFILE_NAME = (process.env.E2E_PROFILE ?? 'fast-4g') as 'fast-4g' | 'office-lan';
const SESSION = (process.env.E2E_SESSION ?? 'shell+1') as string;
const CACHE_STATE = (process.env.E2E_CACHE_STATE ?? 'cold') as 'cold' | 'warm' | 'upgrade';

const PROFILES = {
  'fast-4g': {
    cpuThrottlingRate: 4,
    latency: 150,
    downloadThroughput: Math.round(9_000_000 / 8),
    uploadThroughput: Math.round(1_500_000 / 8),
  },
  'office-lan': {
    cpuThrottlingRate: 1,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  },
} as const;
const PROFILE = PROFILES[PROFILE_NAME];

const CELL_NAME = [
  VARIANT,
  process.env.E2E_PROTOCOL === 'h2' ? 'h2' : 'http1',
  PROFILE_NAME,
  process.env.E2E_COMPRESSION ?? 'none',
  CACHE_STATE,
  SESSION,
].join('-');
const RESULTS_FILE = path.resolve('e2e', 'results', `${CELL_NAME}-measurements.json`);

/**
 * The per-run cache policy for the selected cache state. cold
 * clears the browser cache before every run (first visit); warm
 * keeps the HTTP cache across runs (repeat visit, same build);
 * upgrade keeps the HTTP cache from the first build (the rebuild
 * and revert are driver responsibilities — the spec measures with
 * the warm cache). Gate cells stay cold (the runner's gate-cell set
 * never selects warm or upgrade).
 */
const UPGRADE_FIXTURE = { packageName: '@gears-frontx/shared-x', mfe: '_blank-mfe' };
const CACHE_POLICY = new CacheStateDriver({
  upgradeFixture: UPGRADE_FIXTURE,
}).perRunPolicy(CACHE_STATE);

interface NetRequest {
  url: string;
  bytes: number;
  fromCache: boolean;
  /** A `fetch()` of one of the shell's own units: the cache fill re-reading what the shell already loaded. */
  byShellFill?: boolean;
  start: number;
  end?: number;
}

function watchNetwork(cdp: CDPSession) {
  const byId = new Map<string, NetRequest>();
  const requests: NetRequest[] = [];
  cdp.on('Network.requestWillBeSent', (e: any) => {
    const r: NetRequest = {
      url: e.request.url,
      bytes: 0,
      fromCache: false,
      start: e.timestamp,
    };
    r.byShellFill = e.type === 'Fetch' && r.url.startsWith(`${SHELL}/shared/`);
    byId.set(e.requestId, r);
    requests.push(r);
  });
  // Set fromCache from the response so the classifier can
  // distinguish cache-served requests from network requests.
  cdp.on('Network.responseReceived', (e: any) => {
    const r = byId.get(e.requestId);
    if (!r) return;
    const resp = e.response ?? {};
    if (resp.fromDiskCache || resp.fromPrefetchCache || resp.fromServiceWorker) {
      r.fromCache = true;
    }
  });
  const finish = (e: any) => {
    const r = byId.get(e.requestId);
    if (r && r.end === undefined) {
      r.end = e.timestamp;
      r.bytes += e.encodedDataLength ?? 0;
    }
  };
  cdp.on('Network.loadingFinished', finish);
  cdp.on('Network.loadingFailed', finish);
  return requests;
}

/**
 * Capture every script the browser parsed during the load
 * window via `Debugger.scriptParsed` (the event carries `length`,
 * the script parse size the engine actually processed). The
 * summariser filters to the page origin so test-harness and
 * chrome-extension scripts do not inflate the metric.
 */
function watchParsedScripts(cdp: CDPSession) {
  /** @type {{ url: string; length: number }[]} */
  const scripts: { url: string; length: number }[] = [];
  cdp.on('Debugger.scriptParsed', (e: any) => {
    if (typeof e?.url !== 'string' || e.url === '') return;
    scripts.push({ url: e.url, length: typeof e.length === 'number' ? e.length : 0 });
  });
  return scripts;
}

async function applyThrottle(cdp: CDPSession) {
  if (PROFILE.cpuThrottlingRate > 1) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: PROFILE.cpuThrottlingRate });
  }
  await cdp.send('Network.enable');
  if (PROFILE.downloadThroughput > 0) {
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: PROFILE.latency,
      downloadThroughput: PROFILE.downloadThroughput,
      uploadThroughput: PROFILE.uploadThroughput,
    });
  }
}

/**
 * The session screens, in order, with the route each is served on. The
 * default screen (Hello World) is the one the new shell mounts at boot, so
 * no five-extension session includes it. The sequential ids and the
 * parallel-startup routes both derive from this one list.
 */
const SESSION_SCREENS = [
  { id: HELLO_WORLD_EXTENSION_ID, label: 'Hello World', route: '/hello-world' },
  { id: PROFILE_EXTENSION_ID, label: 'Profile', route: '/profile' },
  { id: CURRENT_THEME_EXTENSION_ID, label: 'Current Theme', route: '/current-theme' },
  { id: UIKIT_ELEMENTS_EXTENSION_ID, label: 'UIKit Elements', route: '/uikit-elements' },
  { id: BLANK_HOME_EXTENSION_ID, label: 'Blank Home', route: '/blank-home' },
  { id: WIDGETS_HOST_EXTENSION_ID, label: 'Widgets Host', route: '/widgets-host' },
];
const SESSION_FIXTURES = new SessionFixtures({
  extensions: SESSION_SCREENS.map(({ id, label }) => ({ id, label, kind: 'visual' as const, domain: 'screen' })),
  singleExtensionId: BLANK_HOME_EXTENSION_ID,
  defaultExtensionId: HELLO_WORLD_EXTENSION_ID,
});
const PARALLEL_STARTUP_ROUTES = SESSION_FIXTURES.select('shell+5-parallel-startup').map(
  ({ id }) => SESSION_SCREENS.find((screen) => screen.id === id)!.route,
);

/**
 * The requests for the given entry module URLs, one per distinct URL.
 * Only requests issued after the session began count: the boot's own are
 * not the session's.
 */
function entryModules(net: NetRequest[], sessionStart: number, entryUrls: readonly string[]): NetRequest[] {
  const wanted = new Set(entryUrls);
  const byUrl = new Map<string, NetRequest>();
  for (const r of net.slice(sessionStart)) {
    if (wanted.has(r.url) && !byUrl.has(r.url)) byUrl.set(r.url, r);
  }
  return [...byUrl.values()];
}

/**
 * The parallel startup's checks over one run: exactly the five entry
 * modules the dispatched extensions declare were requested, their requests
 * overlapped (every one was issued before the first one finished), and no
 * shared file crossed the network twice.
 */
function checkParallelStartup(net: NetRequest[], sessionStart: number, entryUrls: readonly string[]) {
  const entries = entryModules(net, sessionStart, entryUrls);
  const lastIssued = Math.max(...entries.map((r) => r.start));
  const firstFinished = Math.min(...entries.map((r) => r.end ?? Infinity));
  // The shell's own cache fill re-reads every unit the shell loaded, by
  // design, to put its text in the realm cache; it finished before the
  // session began, so a `fetch()` of a shell unit after that is not the
  // fill's, and every other request for a shared file is a download the
  // realm cache should have answered.
  const duplicates = ParallelCaseChecks.duplicateDownloads(
    net
      .filter((r, index) => !(r.byShellFill === true && index < sessionStart))
      .map((r) => ({ url: r.url, bytes: r.bytes })),
  );
  return {
    entryModules: entries.length,
    declaredEntryModules: entryUrls.length,
    overlapped: entries.length === entryUrls.length && lastIssued < firstFinished,
    duplicateCount: duplicates.duplicateCount,
    duplicatePaths: duplicates.paths,
  };
}

async function measureBoot(page: Page): Promise<number> {
  const t0 = Date.now();
  await page.goto(`${SHELL}/`, { waitUntil: 'commit' });
  await page.waitForFunction(
    () => {
      const el = document.getElementById('root');
      return el !== null && el.childElementCount > 0;
    },
    undefined,
    { timeout: 300_000 },
  );
  return Date.now() - t0;
}

async function measureSession(
  page: Page,
  session: string,
  net: NetRequest[],
): Promise<{ mounts: number[]; sessionStart: number; entryUrls: string[] }> {
  const mounts: number[] = [];
  let entryUrls: string[] = [];
  let sessionStart = net.length;
  if (session === 'shell+1' || session === 'shell+5-sequential' || session === 'shell+5-parallel-startup') {
    // Timings start after the default screen (Hello World) the new shell
    // mounts at boot, so the session measures only its own work; the
    // old-rule shell mounts none. No session includes the default screen.
    if (VARIANT !== 'old') await waitForMountedScreen(page, HELLO_WORLD_EXTENSION_ID, 120_000);
  }
  if (session === 'shell+1') {
    const t0 = Date.now();
    const { id: singleExtensionId } = SESSION_FIXTURES.select('shell+1')[0];
    await page.getByTestId(menuItemTestId(singleExtensionId)).click();
    await waitForMountedScreen(page, singleExtensionId, 120_000);
    mounts.push(Date.now() - t0);
  } else if (session === 'shell+5-sequential') {
    const extensionIds = SESSION_FIXTURES.select('shell+5-sequential').map(({ id }) => id);
    for (const extensionId of extensionIds) {
      const t0 = Date.now();
      await page.getByTestId(menuItemTestId(extensionId)).click();
      await waitForMountedScreen(page, extensionId, 120_000);
      mounts.push(Date.now() - t0);
    }
  } else if (session === 'shell+5-parallel-startup') {
    // Five startup extensions, populated together right after the shell's
    // bootstrap: one `load_ext` per extension is dispatched through the
    // shell's own registry in a single turn, so all five loads are in flight
    // at once, none waiting for another. (A mount requested at registration
    // finds no root attached, and an exclusive domain admits at most two
    // queued mounts, so the dispatch is a load, which no domain gates.) The
    // session completes when the five entry modules have finished loading.
    const t0 = Date.now();
    sessionStart = net.length;
    entryUrls = await page.evaluate(async (routes) => {
      const LOAD_EXT = 'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.load_ext.v1~';
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
      const base = new URL('.', document.baseURI);
      const aggregate = (await (await fetch(new URL('generated-mfe-manifests.json', base))).json()) as Array<{
        manifest: { metaData: { publicPath: string } };
        entries?: Array<{ id: string; exposeAssets?: { js?: { sync?: string[] } } }>;
        extensions?: Array<{ id: string; domain: string; route?: string; entry?: string }>;
      }>;
      const startup = routes.map((route) => {
        for (const config of aggregate) {
          const found = (config.extensions ?? []).find((e) => e.route === route);
          if (found === undefined) continue;
          // The entry module is the first synchronous JavaScript asset the
          // entry's manifest declares, resolved against its publicPath.
          const entry = (config.entries ?? []).find((e) => e.id === found.entry);
          const file = entry?.exposeAssets?.js?.sync?.[0];
          if (file === undefined) throw new Error(`extension ${found.id} declares no entry module`);
          return { extension: found, url: new URL(file, config.manifest.metaData.publicPath).href };
        }
        throw new Error(`no startup extension on route ${route}`);
      });
      for (const { extension } of startup) {
        void registry.executeActionsChain({
          action: { type: LOAD_EXT, target: extension.domain, payload: { subject: extension.id } },
        });
      }
      return startup.map((s) => s.url);
    }, PARALLEL_STARTUP_ROUTES);
    await expect
      .poll(
        () => entryModules(net, sessionStart, entryUrls).filter((r) => r.end !== undefined).length,
        { timeout: 120_000, intervals: [50] },
      )
      .toBe(PARALLEL_STARTUP_ROUTES.length);
    mounts.push(Date.now() - t0);
  }
  return { mounts, sessionStart, entryUrls };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

function spread(values: number[]): number {
  if (values.length < 2) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  return max - min;
}

test(`load-matrix cell: ${CELL_NAME}`, async ({ browser }) => {
  test.setTimeout(Math.max(1_800_000, RUNS * 60_000));
  const bootSamples: number[] = [];
  const sessionSamples: number[][] = [];
  const requestSummaries: any[] = [];
  const evaluatedBytesSamples: number[] = [];
  const parallelChecks: ReturnType<typeof checkParallelStartup>[] = [];

  // Warm/upgrade reuse the same context across runs so the HTTP
  // cache persists (repeat visit, same build; or warm cache from the
  // first build). cold uses a fresh context per run (first visit).
  const keepContext = CACHE_POLICY.keepHttpCacheAcrossRuns;
  /** @type {import('@playwright/test').BrowserContext | undefined} */
  let keptContext: any;

  for (let i = 0; i < RUNS; i++) {
    const context = keepContext && keptContext ? keptContext : await browser.newContext();
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await applyThrottle(cdp);
    const net = watchNetwork(cdp);
    // Enable the Debugger domain so scriptParsed fires for the
    // scripts the browser parses during the load window.
    await cdp.send('Debugger.enable');
    const parsedScripts = watchParsedScripts(cdp);

    const fill = new FillRequestWatcher(page, `${SHELL}/shared/`);
    const boot = await measureBoot(page);
    bootSamples.push(boot);

    // FrontX-only cache-fill wait applies only to the FrontX
    // variant (`new`). The old-rule variant skips it: its page issues no
    // fill requests, so waiting for them would stall the measurement for
    // the full timeout on every run.
    await awaitCacheFill(fill, { variant: VARIANT, timeoutMs: 60_000 });

    const sessionResult = await measureSession(page, SESSION, net);
    if (SESSION === 'shell+5-parallel-startup') {
      parallelChecks.push(checkParallelStartup(net, sessionResult.sessionStart, sessionResult.entryUrls));
    }
    sessionSamples.push(sessionResult.mounts);

    // Classify requests into network / blob / data / cacheServed.
    // The reconciled network count excludes blob/data/cache-served.
    const requestSummary = summarizeRequests(net);
    requestSummaries.push(requestSummary);
    // Evaluated bytes = script parse size of every parsed script,
    // filtered to the page origin.
    const evaluated = summarizeEvaluatedBytes(parsedScripts, {
      originPrefix: `${scheme}://localhost:`,
    });
    evaluatedBytesSamples.push(evaluated.evaluatedBytes);

    const totalBytes = net.reduce((n, r) => n + r.bytes, 0);

    console.log(
      `[${CELL_NAME}] run ${i + 1}/${RUNS}: boot=${boot}ms ` +
        `session=${JSON.stringify(sessionResult.mounts)} ` +
        `reqs=${requestSummary.network}(total:${requestSummary.total} blob:${requestSummary.blob} data:${requestSummary.data} cache:${requestSummary.cacheServed}) ` +
        `bytes=${totalBytes} evaluatedBytes=${evaluated.evaluatedBytes}`,
    );

    if (keepContext) {
      keptContext = context;
    } else {
      await context.close();
    }
  }
  if (keptContext) {
    await keptContext.close();
  }

  const sessionMedians = sessionSamples.length > 0
    ? sessionSamples[0].map((_, idx) => median(sessionSamples.map((s) => s[idx] ?? 0)))
    : [];

  const medianNetworkReqs = median(requestSummaries.map((r) => r.network));
  const medianTotalReqs = median(requestSummaries.map((r) => r.total));
  const medianCacheServedReqs = median(requestSummaries.map((r) => r.cacheServed));
  const medianBlobReqs = median(requestSummaries.map((r) => r.blob));
  const medianDataReqs = median(requestSummaries.map((r) => r.data));
  const medianEvaluatedBytes = median(evaluatedBytesSamples);

  const result = {
    cell: CELL_NAME,
    variant: VARIANT,
    profile: PROFILE_NAME,
    protocol: process.env.E2E_PROTOCOL === 'h2' ? 'h2' : 'http1',
    compression: process.env.E2E_COMPRESSION ?? 'none',
    cacheState: CACHE_STATE,
    session: SESSION,
    runs: RUNS,
    medianBoot: median(bootSamples),
    bootSpread: spread(bootSamples),
    bootSamples,
    sessionMedians,
    sessionSpreads: sessionMedians.map((_, idx) =>
      spread(sessionSamples.map((s) => s[idx] ?? 0)),
    ),
    sessionSamples,
    // The reconciled network count and the full classification.
    requestClassification: {
      network: medianNetworkReqs,
      total: medianTotalReqs,
      blob: medianBlobReqs,
      data: medianDataReqs,
      cacheServed: medianCacheServedReqs,
    },
    medianNetworkReqs,
    medianTotalReqs,
    medianCacheServedReqs,
    medianEvaluatedBytes,
    // The per-run cache policy this cell ran under.
    cachePolicy: CACHE_POLICY,
    evaluatedBytesSamples,
    parallelChecks,
    measuredAt: new Date().toISOString(),
  };

  fs.mkdirSync(path.dirname(RESULTS_FILE), { recursive: true });
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(result, null, 2));
  // The parallel startup fails when its loads did not overlap, one of the five
  // declared entry modules was not requested, or any shared file was downloaded twice.
  for (const checks of parallelChecks) {
    expect(checks.declaredEntryModules).toBe(PARALLEL_STARTUP_ROUTES.length);
    expect(checks.entryModules).toBe(checks.declaredEntryModules);
    expect(checks.overlapped).toBe(true);
    expect(checks.duplicateCount, `duplicate shared downloads: ${checks.duplicatePaths.join(', ')}`).toBe(0);
  }
  console.log(
    `[${CELL_NAME}] median boot=${result.medianBoot}ms ` +
      `session medians=${JSON.stringify(sessionMedians)} ` +
      `boot spread=${result.bootSpread}ms ` +
      `network reqs=${medianNetworkReqs} (total ${medianTotalReqs}) ` +
      `evaluatedBytes=${medianEvaluatedBytes}`,
  );
});
