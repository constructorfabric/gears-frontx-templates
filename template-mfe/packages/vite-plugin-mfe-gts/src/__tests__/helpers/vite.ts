/**
 * Runs `vite build` of a fixture in a child process with NODE_ENV unset
 * and `MFE_VITE_NO_TEST_ENV_CHECK=true`, the federation plugin's opt-out
 * of turning itself off under a test runner.
 */

import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { createRequire } from 'node:module';
import * as path from 'node:path';

export const viteBin = path.join(
  path.dirname(createRequire(import.meta.url).resolve('vite/package.json')),
  'bin',
  'vite.js'
);

/** `process.env` as a fixture build sees it, plus `extra`. */
export function buildEnv(extra: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env, ...extra };
  delete env.NODE_ENV;
  delete env.VITEST;
  env.MFE_VITE_NO_TEST_ENV_CHECK = 'true';
  return env;
}

/** The build's combined stdout and stderr. */
export function outputOf(result: SpawnSyncReturns<Buffer>): string {
  return `${String(result.stdout)}\n${String(result.stderr)}`;
}

/** Runs `vite build <args>` in `cwd` and returns the child's result. */
export function runViteBuild(params: {
  cwd: string;
  args?: string[];
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
}): SpawnSyncReturns<Buffer> {
  return spawnSync(process.execPath, [viteBin, 'build', ...(params.args ?? [])], {
    cwd: params.cwd,
    env: buildEnv(params.env),
    stdio: 'pipe',
    timeout: params.timeoutMs ?? 120_000,
  });
}
