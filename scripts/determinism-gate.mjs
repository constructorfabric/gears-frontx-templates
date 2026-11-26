#!/usr/bin/env node
/**
 * `scripts/determinism-gate.mjs` — the two-tier determinism gate. Builds
 * the shell and the MFE fixtures and compares the content hashes of every
 * emitted file between two builds per comparison (see
 * `scripts/verify/DeterminismGate.mjs`).
 *
 * Tiers:
 * - `--tier=fix` — cold vs warm and serial vs parallel, on the shell and
 *   the first MFE fixture.
 * - `--tier=full` — all four comparisons (cold vs warm, serial vs
 *   parallel, two checkout folders, npm install vs workspace link) on the
 *   shell and every MFE fixture.
 *
 * Needs installed templates (`npm ci` in `template-shell` and
 * `template-mfe`); it builds their packages itself. No browser is used.
 * Every build is its own bounded 15-minute step (StepRunner), never
 * retried. Writes `e2e/results/determinism-gate-<ISO>.json` with each
 * comparison's verdict (and every differing file), and each step's
 * `{step, command, exitCode, durationMs, log}`; logs go to
 * `e2e/results/logs/`. Exits non-zero on fail, naming the first differing
 * file and the stage.
 *
 * CLI: `node scripts/determinism-gate.mjs --tier=fix|full [--mfes=a,b]`
 *
 * It changes no package version and writes only build outputs, producer
 * caches and `e2e/results/`.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import process from 'node:process';

import { StepRunner, DEFAULT_TIMEOUT_MS } from './verify/StepRunner.mjs';
import { DeterminismGate } from './verify/DeterminismGate.mjs';
import { MfeFixtureDiscovery } from './verify/MfeFixtureDiscovery.mjs';
import { ClearUnitCache } from './verify/ClearUnitCache.mjs';

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const RESULTS_DIR = path.join(REPO_ROOT, 'e2e', 'results');
const LOGS_DIR = path.join(RESULTS_DIR, 'logs');

const args = process.argv.slice(2);
/** @type {{ tier: 'fix' | 'full' | undefined; mfes: string[] | undefined }} */
const opts = { tier: undefined, mfes: undefined };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith('--tier=')) opts.tier = a.slice('--tier='.length);
  else if (a.startsWith('--mfes=')) opts.mfes = a.slice('--mfes='.length).split(',').map((s) => s.trim()).filter(Boolean);
  else if (a === '--help' || a === '-h') {
    console.log('Usage: determinism-gate.mjs --tier=fix|full [--mfes=a,b]');
    process.exit(0);
  }
}

if (opts.tier !== 'fix' && opts.tier !== 'full') {
  console.error('[determinism-gate] --tier=fix|full is required');
  process.exit(2);
}

const isEntryPoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  const stepRunner = new StepRunner({ logDir: LOGS_DIR, timeoutMs: DEFAULT_TIMEOUT_MS });
  const mfes = opts.mfes ?? new MfeFixtureDiscovery({ root: REPO_ROOT }).discover().map((p) => path.basename(p)).sort();
  const gate = new DeterminismGate({
    tier: opts.tier,
    stepRunner,
    resultsDir: RESULTS_DIR,
    repoRoot: REPO_ROOT,
    mfes,
    clearCache: (root) => new ClearUnitCache({ root, log: () => {} }).run(),
  });
  gate.run()
    .then(({ jsonPath, status }) => {
      console.log(`determinism-gate: status=${status} → ${jsonPath}`);
      process.exitCode = status === 'pass' ? 0 : 1;
    })
    .catch((error) => {
      console.error(`[determinism-gate] FAIL: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
}

export { DeterminismGate, StepRunner, DEFAULT_TIMEOUT_MS };
