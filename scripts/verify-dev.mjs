#!/usr/bin/env node
/**
 * `scripts/verify-dev.mjs` — deterministic build + boot + browser-spec
 * verification for every later phase and the orchestrator. Runs
 * each step as its own child process with stdin closed and output to a log
 * under `e2e/results/logs/`, each with its own 15-minute timeout (kill on
 * timeout, mark failed, never retry, one build at a time). Writes
 * `e2e/results/verify-dev-<ISO>.json` with shape
 * `{status, steps: [{step, command, exitCode, durationMs, log}], summary}`
 * and exits non-zero on fail.
 *
 * CLI:
 *   node scripts/verify-dev.mjs [--clean] [--runs=N] [--skip-build] [--specs=<list>]
 *
 *   --clean        run `cache:clear` first
 *   --runs=N       repeat the browser specs N times (default 3)
 *   --skip-build   skip the build steps (assume dist is already built)
 *   --specs=<list> comma-separated spec names (default `smoke,round-count`)
 *
 * Generic: discovers MFE fixtures by directory; no package names in logic.
 *
 * It changes no package version and writes only `e2e/results/`. Unit tests
 * use tiny fake commands only, never a real run.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import process from 'node:process';
import { StepRunner, DEFAULT_TIMEOUT_MS } from './verify/StepRunner.mjs';
import { MfeFixtureDiscovery } from './verify/MfeFixtureDiscovery.mjs';
import { BootCheck, DEFAULT_SHELL_ORIGIN } from './verify/BootCheck.mjs';
import { VerifyDev, DEFAULT_SPECS, DEFAULT_RUNS } from './verify/VerifyDev.mjs';

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const RESULTS_DIR = path.join(REPO_ROOT, 'e2e', 'results');
const LOGS_DIR = path.join(RESULTS_DIR, 'logs');

/**
 * @param {string[]} argv
 * @returns {{ clean: boolean; runs: number; skipBuild: boolean; specs: string[] }}
 */
export function parseArgs(argv) {
  const opts = { clean: false, runs: DEFAULT_RUNS, skipBuild: false, specs: DEFAULT_SPECS };
  for (const a of argv) {
    if (a === '--clean') opts.clean = true;
    else if (a === '--skip-build') opts.skipBuild = true;
    else if (a.startsWith('--runs=')) opts.runs = Number.parseInt(a.slice('--runs='.length), 10);
    else if (a.startsWith('--specs=')) opts.specs = a.slice('--specs='.length).split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--help' || a === '-h') {
      console.log('Usage: verify-dev.mjs [--clean] [--runs=N] [--skip-build] [--specs=<list>]');
      process.exit(0);
    }
  }
  return opts;
}

/**
 * Real page loader: launches a headless Chromium, loads the shell origin,
 * captures page errors and console errors, and waits for `#root` to have at
 * least one child. Returns the probe shape `BootCheck` expects as
 * `{ probe, close }` — `close` releases the browser. If the probe throws
 * (Playwright timeout, navigation error), the browser is closed before the
 * error re-throws so no headless Chromium leaks; once the handle is returned
 * to BootCheck, BootCheck owns the close (in its `finally`).
 *
 * @param {string} url
 * @returns {Promise<{ probe: { rootChildCount: number; pageErrors: string[]; consoleErrors: string[] }; close: () => Promise<void> }>}
 */
async function realPageLoader(url) {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    /** @type {string[]} */
    const pageErrors = [];
    /** @type {string[]} */
    const consoleErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(
      () => {
        const root = document.querySelector('#root');
        return root !== null && root.childElementCount >= 1;
      },
      undefined,
      { timeout: 60_000 },
    );
    const rootChildCount = await page.evaluate(() => document.querySelector('#root')?.childElementCount ?? 0);
    return {
      probe: { rootChildCount, pageErrors, consoleErrors },
      close: async () => {
        try {
          await browser.close();
        } catch {
          /* best-effort: BootCheck's finally must not throw on a double-close */
        }
      },
    };
  } catch (error) {
    try {
      await browser.close();
    } catch {
      /* best-effort: a cleanup failure must not mask the real error */
    }
    throw error;
  }
}

const isEntryPoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  const opts = parseArgs(process.argv.slice(2));
  const stepRunner = new StepRunner({ logDir: LOGS_DIR, timeoutMs: DEFAULT_TIMEOUT_MS });
  const fixtureDiscovery = new MfeFixtureDiscovery({ root: REPO_ROOT });

  // Browser specs run as their own child processes via the StepRunner, one
  // at a time. Each spec path is `e2e/<spec>.spec.ts`.
  const runBrowserSpec = async (spec, runIdx) =>
    stepRunner.run({
      step: `browser-${spec}-${runIdx}`,
      command: ['npx', 'playwright', 'test', `e2e/${spec}.spec.ts`],
      cwd: REPO_ROOT,
    });

  const vd = new VerifyDev({
    root: REPO_ROOT,
    logDir: RESULTS_DIR,
    stepRunner,
    fixtureDiscovery,
    bootCheck: new BootCheck({
      // Lazily import so unit tests of VerifyDev never load the real server.
      startServers: async () => {
        const { startServers } = await import('../e2e/server.mjs');
        return startServers();
      },
      pageLoader: realPageLoader,
      shellOrigin: DEFAULT_SHELL_ORIGIN,
    }),
    runBrowserSpec,
    specs: opts.specs,
    runs: opts.runs,
    skipBuild: opts.skipBuild,
    clean: opts.clean,
  });

  vd.run()
    .then(({ jsonPath, status }) => {
      console.log(`verify-dev: status=${status} → ${jsonPath}`);
      process.exitCode = status === 'pass' ? 0 : 1;
    })
    .catch((error) => {
      console.error(`[verify-dev] FAIL: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
}
