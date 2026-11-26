#!/usr/bin/env node
/**
 * `scripts/load-full-matrix.mjs` — full matrix (once per phase close).
 *
 * Full matrix = compression (none / gzip / brotli) × protocol
 * (HTTP/1.1 / HTTP/2) × network (Fast 4G + 4x CPU / office-LAN) ×
 * cache state (cold / warm / upgrade) × session (shell+1 / shell+5
 * sequential / shell+5 parallel startup). Each cell runs as its
 * own bounded StepRunner step (15-minute hard timeout per step,
 * kill on timeout, mark failed, never retry). Writes a JSON result of
 * one record per step
 * `{status, steps: [{step, command, exitCode, durationMs, log}], summary, ...}`
 * under `e2e/results/load-full-matrix-<ISO>.json` and a markdown summary.
 *
 * CLI: `node scripts/load-full-matrix.mjs [--runs N] [--old-serve-root PATH] [--dry-run]`
 *
 * Coordinator script — runs detached with stdin closed (`nohup node … < /dev/null > <log> 2>&1 &`);
 * every step inside it carries its own 15-minute limit enforced by the
 * StepRunner; the caller polls the log and the JSON.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import process from 'node:process';

import { StepRunner, DEFAULT_TIMEOUT_MS } from './verify/StepRunner.mjs';
import { LoadMatrixRunner } from './load-matrix/LoadMatrixRunner.mjs';

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const RESULTS_DIR = path.join(REPO_ROOT, 'e2e', 'results');
const LOGS_DIR = path.join(RESULTS_DIR, 'logs');

const args = process.argv.slice(2);
/** @type {Record<string, string | boolean>} */
const opts = {};
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--dry-run') opts.dryRun = true;
  else if (a === '--runs') opts.runs = Number(args[++i]);
  else if (a === '--old-serve-root') opts.oldServeRoot = args[++i];
  else if (a === '--help' || a === '-h') {
    console.log('Usage: load-full-matrix.mjs [--runs N] [--old-serve-root PATH] [--dry-run]');
    process.exit(0);
  }
}

const isEntryPoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  const stepRunner = new StepRunner({ logDir: LOGS_DIR, timeoutMs: DEFAULT_TIMEOUT_MS });
  // --runs > LOAD_GATE_RUNS env > default.
  const cliRuns = typeof opts.runs === 'number' && !Number.isNaN(opts.runs) ? opts.runs : undefined;
  const envRuns =
    process.env.LOAD_GATE_RUNS !== undefined && process.env.LOAD_GATE_RUNS !== ''
      ? Number(process.env.LOAD_GATE_RUNS)
      : undefined;
  const runner = new LoadMatrixRunner({
    mode: 'full-matrix',
    stepRunner,
    resultsDir: RESULTS_DIR,
    repoRoot: REPO_ROOT,
  });
  runner
    .run({
      runs: cliRuns,
      envRuns,
      oldServeRoot: typeof opts.oldServeRoot === 'string' ? opts.oldServeRoot : undefined,
      dryRun: opts.dryRun === true,
    })
    .then(({ markdown, jsonPath, status, results }) => {
      console.log(markdown);
      // A dry-run prints the plan and writes NO result JSON
      // (jsonPath is null); it exits 0 because the plan was printed.
      // A real run exits 0 on pass, 1 on fail.
      if (jsonPath) {
        console.log(`\nload-full-matrix: status=${status} → ${jsonPath}`);
        console.log(`Wrote ${results.length} full-matrix results to e2e/results/`);
      } else {
        console.log(`\nload-full-matrix: status=${status} (dry-run: no result JSON written)`);
      }
      process.exitCode = status === 'pass' || status === 'dry-run' ? 0 : 1;
    })
    .catch((error) => {
      console.error(`[load-full-matrix] FAIL: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
}

export { LoadMatrixRunner, StepRunner, DEFAULT_TIMEOUT_MS };
