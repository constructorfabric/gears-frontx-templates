import { test, expect, type CDPSession, type Page } from '@playwright/test';

const scheme = process.env.E2E_PROTOCOL === 'h2' ? 'https' : 'http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { menuItemTestId, BLANK_HOME_EXTENSION_ID, HELLO_WORLD_EXTENSION_ID } from './extensionIds.mjs';
import { SHELL_PORT } from './ports.mjs';
import { HTTP1_BOOT_BASELINE, NOISE_MARGIN } from '../scripts/load-matrix/MatrixProfiles.mjs';
import { waitForMountedScreen } from './mountedScreen';

/**
 * Timing gate (load_gates (3)): boot and MFE load-to-mount are measured
 * on the pinned throttled CDP profile. There is no absolute millisecond
 * budget; each number is judged against a measured reference plus the
 * documented noise margin.
 *
 * - HTTP/1.1 shell boot (Fast 4G and office-LAN) is judged against this
 *   branch's stored HTTP/1.1 baseline (`HTTP1_BOOT_BASELINE`,
 *   `scripts/load-matrix/http1-boot-baseline.json`), never against the
 *   old rule.
 * - MFE load-to-mount on the default cell (Fast 4G + 4x CPU over
 *   HTTP/1.1) is judged against the old rule built from the same inputs:
 *   the old-rule worktree of templates `main` eb10640.
 *
 * Run shape: the spec runs once per variant — `E2E_VARIANT=new`
 * (default, this build's dists) and `E2E_VARIANT=old` with
 * `E2E_SERVE_ROOT=<old-rule worktree>` serving the old-rule dists on the
 * same ports. Each variant writes
 * `e2e/results/load-time-results-<variant>.json` (medians of `RUNS`
 * measured runs). The `new` run reads the `old` results file for the MFE
 * comparison; when the file is absent the gate fails closed — the
 * comparison is mandatory, never skipped.
 *
 * Noise margin (documented, owner-resolved): a measured median may
 * exceed its reference median by NOISE_MARGIN (15%) without failing —
 * run-to-run variance of the throttled profile on repeated local runs
 * stays inside it, while a real regression does not.
 *
 * Pinned throttle profile (documented, do not retune without re-pinning):
 * Chrome DevTools "Fast 4G" network preset — ≈9 Mbps down, ≈1.5 Mbps up,
 * 150 ms RTT — plus 4x CPU slowdown. MFE load is timed from the mount
 * action (menu click, issued after the default screen has mounted) to the
 * MFE mounted/rendered in the screen container, not to the first
 * remote-entry response.
 */

const SHELL = `${scheme}://localhost:${SHELL_PORT}`;
const RUNS = Number(process.env.LOAD_GATE_RUNS ?? 30);
const VARIANT = process.env.E2E_VARIANT ?? 'new';
const RESULTS_DIR = path.resolve('e2e', 'results');
const RESULTS_FILE = path.join(
  RESULTS_DIR,
  `load-time-results-${VARIANT}` +
    `${process.env.E2E_PROFILE ? `-${process.env.E2E_PROFILE}` : ''}` +
    `${scheme === 'https' ? '-h2' : ''}.json`,
);
const OLD_RESULTS_FILE = path.join(RESULTS_DIR, 'load-time-results-old.json');

// Chrome DevTools "Fast 4G" preset: ~9 Mbps download, ~1.5 Mbps upload,
// 150 ms RTT, plus the decided 4x CPU slowdown. `E2E_PROFILE=office-lan`
// selects the second matrix cell: no network emulation and no CPU
// throttle (developer-machine office LAN). The pinned gate profile is
// unchanged; office-lan only adds a measurement column.
const PROFILES = {
  'fast-4g': {
    name: 'chrome-devtools-fast-4g',
    cpuThrottlingRate: 4,
    latency: 150,
    downloadThroughput: Math.round(9_000_000 / 8),
    uploadThroughput: Math.round(1_500_000 / 8),
  },
  'office-lan': {
    name: 'office-lan',
    cpuThrottlingRate: 1,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  },
} as const;
type ProfileName = keyof typeof PROFILES;
const PROFILE_NAME: ProfileName =
  (process.env.E2E_PROFILE as ProfileName) in PROFILES
    ? (process.env.E2E_PROFILE as ProfileName)
    : 'fast-4g';
const PROFILE = PROFILES[PROFILE_NAME];

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

const BOOT_TIMEOUT = 300_000;
const MOUNT_TIMEOUT = 120_000;

type BootStage = 'document' | 'manifest' | 'unit' | 'static' | 'other';

interface NetRequest {
  url: string;
  stage: BootStage;
  start: number; // CDP monotonic seconds
  end?: number;
  bytes: number;
}

function stageOf(url: string): BootStage {
  const pathname = url.split('?')[0];
  if (pathname.includes('/shared/')) {
    return 'unit';
  }
  if (pathname.includes('generated-mfe-manifests') || pathname.includes('mfe-manifest'))
    return 'manifest';
  if (pathname.endsWith('/') || pathname.endsWith('.html')) return 'document';
  if (/\.(js|css|svg|png|woff2?|ttf|ico|json)$/.test(pathname)) return 'static';
  return 'other';
}

/** Attaches CDP Network listeners; call collect() after boot to read stats. */
function watchNetwork(cdp: CDPSession) {
  const requests = new Map<string, NetRequest>();
  cdp.on('Network.requestWillBeSent', (e: any) => {
    requests.set(e.requestId, {
      url: e.request.url,
      stage: stageOf(e.request.url),
      start: e.timestamp,
      bytes: 0,
    });
  });
  const finish = (e: any) => {
    const r = requests.get(e.requestId);
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
 * Sequential fetch rounds: a request's round is 1 + the deepest round of
 * any request that completed before it started — the designed model's
 * sequentiality (list data → one parallel batch → one round per lazy
 * target) measured as waterfall depth.
 */
export function waterfallDepth(requests: NetRequest[]): number {
  const sorted = [...requests]
    .filter((r) => r.end !== undefined)
    .sort((a, b) => a.start - b.start);
  const ended: { end: number; depth: number }[] = [];
  let max = 0;
  for (const r of sorted) {
    let d = 1;
    for (const e of ended) {
      if (e.end <= r.start && e.depth + 1 > d) d = e.depth + 1;
    }
    ended.push({ end: r.end!, depth: d });
    if (d > max) max = d;
  }
  return max;
}

interface BootBreakdown {
  requestCount: number;
  sequentialFetchRounds: number;
  unitFetchRounds: number;
  totalBytes: number;
  stages: Record<string, { count: number; bytes: number; transferMs: number; spanMs: number }>;
}

function bootBreakdown(requests: Map<string, NetRequest>): BootBreakdown {
  const all = [...requests.values()].filter((r) => r.end !== undefined);
  const stages: BootBreakdown['stages'] = {};
  for (const r of all) {
    const s = (stages[r.stage] ??= { count: 0, bytes: 0, transferMs: 0, spanMs: 0 });
    s.count += 1;
    s.bytes += r.bytes;
    s.transferMs += (r.end! - r.start) * 1000;
  }
  for (const stage of Object.keys(stages)) {
    const rs = all.filter((r) => r.stage === stage);
    stages[stage].spanMs =
      (Math.max(...rs.map((r) => r.end!)) - Math.min(...rs.map((r) => r.start))) * 1000;
    stages[stage].transferMs = Math.round(stages[stage].transferMs);
    stages[stage].spanMs = Math.round(stages[stage].spanMs);
  }
  return {
    requestCount: all.length,
    sequentialFetchRounds: waterfallDepth(all),
    unitFetchRounds: waterfallDepth(all.filter((r) => r.stage === 'unit')),
    totalBytes: all.reduce((n, r) => n + r.bytes, 0),
    stages,
  };
}

async function measureBoot(page: Page): Promise<number> {
  const t0 = Date.now();
  await page.goto(`${SHELL}/`, { waitUntil: 'commit' });
  await page.waitForFunction(() => {
    const el = document.getElementById('root');
    return el !== null && el.childElementCount > 0;
  }, undefined, { timeout: BOOT_TIMEOUT });
  return Date.now() - t0;
}

async function measureMfeLoad(page: Page): Promise<number> {
  // The shell mounts the default screen (the menu's first item, Hello World)
  // after boot; the timer starts only once it has, so the sample covers the
  // clicked MFE's load alone. The old-rule shell mounts no screen at boot, so
  // it has no default mount to wait for.
  if (VARIANT !== 'old') await waitForMountedScreen(page, HELLO_WORLD_EXTENSION_ID, MOUNT_TIMEOUT);
  const t0 = Date.now();
  await page.getByTestId(menuItemTestId(BLANK_HOME_EXTENSION_ID)).click();
  await waitForMountedScreen(page, BLANK_HOME_EXTENSION_ID, MOUNT_TIMEOUT);
  return Date.now() - t0;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

test(`timing gate (${VARIANT}): HTTP/1.1 boot vs its baseline, MFE load-to-mount vs the old rule`, async ({
  browser,
}) => {
  test.setTimeout(Math.max(1_800_000, RUNS * 40_000));
  const bootSamples: number[] = [];
  const mfeSamples: number[] = [];
  const bootBreakdowns: BootBreakdown[] = [];

  for (let i = 0; i < RUNS; i++) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await applyThrottle(cdp);
    const net = watchNetwork(cdp);
    const b = await measureBoot(page);
    bootSamples.push(b);
    if (i === 0) bootBreakdowns.push(bootBreakdown(net));
    const m = await measureMfeLoad(page);
    mfeSamples.push(m);
    console.log(`[${VARIANT}] run ${i + 1}/${RUNS}: boot=${b}ms mfe=${m}ms`);
    await context.close();
  }

  const result = {
    variant: VARIANT,
    profile: PROFILE,
    runs: RUNS,
    noiseMargin: NOISE_MARGIN,
    medianBoot: median(bootSamples),
    medianMfe: median(mfeSamples),
    minBoot: Math.min(...bootSamples),
    minMfe: Math.min(...mfeSamples),
    bootBreakdowns,
    measuredAt: new Date().toISOString(),
  };
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(result, null, 2));
  console.log(`[${VARIANT}] median boot=${result.medianBoot}ms median mfe=${result.medianMfe}ms`);

  if (VARIANT === 'old') return; // the old run only records the baseline.
  if (scheme === 'https') return; // HTTP/2 cells are judged by the load matrix.

  // HTTP/1.1 boot: no regression from this branch's stored baseline.
  const bootBaseline = HTTP1_BOOT_BASELINE[PROFILE_NAME];
  const bootAllowed = Math.ceil(bootBaseline * (1 + NOISE_MARGIN));
  expect(
    result.medianBoot,
    `HTTP/1.1 ${PROFILE_NAME} boot median ${result.medianBoot}ms regressed beyond the ${NOISE_MARGIN * 100}% noise margin vs the stored baseline ${bootBaseline}ms (allowed ${bootAllowed}ms)`,
  ).toBeLessThanOrEqual(bootAllowed);

  // MFE load-to-mount: judged against the old rule on the default cell,
  // whose old-rule baseline exists. The old-rule file is mandatory — its
  // absence fails closed (the comparison is the gate; it is never skipped).
  if (PROFILE_NAME !== 'fast-4g') return;
  expect(
    fs.existsSync(OLD_RESULTS_FILE),
    `old-rule results missing at ${OLD_RESULTS_FILE} — run E2E_VARIANT=old E2E_SERVE_ROOT=<old-rule worktree> first`,
  ).toBe(true);
  const old = JSON.parse(fs.readFileSync(OLD_RESULTS_FILE, 'utf-8'));
  const mfeAllowed = Math.ceil(old.medianMfe * (1 + NOISE_MARGIN));
  expect(
    result.medianMfe,
    `mfe load-to-mount median ${result.medianMfe}ms regressed beyond the ${NOISE_MARGIN * 100}% noise margin vs the old rule's ${old.medianMfe}ms (allowed ${mfeAllowed}ms)`,
  ).toBeLessThanOrEqual(mfeAllowed);
});
