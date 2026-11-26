#!/usr/bin/env node
/**
 * `scripts/clear-unit-cache.mjs` — thin CLI wrapper around `ClearUnitCache`.
 *
 * Default root is the templates repo root resolved from this script's
 * location. `--dir=<path>` overrides the root to walk. Exits 0 always (also
 * when nothing exists). Prints each removed path; prints a one-line "none
 * found" note when the walk removed nothing.
 *
 * Invoked as `npm run cache:clear` (templates root), `node ../scripts/clear-unit-cache.mjs --dir=.`
 * (template-shell, scoped to `template-shell`), and
 * `node ../../../../scripts/clear-unit-cache.mjs --dir=.` inside each
 * `template-mfe/src-app/mfe_packages/*` fixture's `build:clean` script.
 *
 * It changes no package version and deletes only build caches, never git
 * state.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import process from 'node:process';
import { ClearUnitCache, CACHE_SEGMENT } from './verify/ClearUnitCache.mjs';

/**
 * @param {string[]} argv
 * @returns {{ dir: string | undefined }}
 */
export function parseArgs(argv) {
  const opts = { dir: undefined };
  for (const a of argv) {
    if (a.startsWith('--dir=')) {
      opts.dir = a.slice('--dir='.length);
    } else if (a === '--help' || a === '-h') {
      console.log('Usage: clear-unit-cache.mjs [--dir=<path>]');
      process.exit(0);
    }
  }
  return opts;
}

const isEntryPoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  const opts = parseArgs(process.argv.slice(2));
  const root = opts.dir
    ? path.resolve(opts.dir)
    : path.resolve(fileURLToPath(import.meta.url), '..', '..');
  const clear = new ClearUnitCache({ root });
  clear
    .run()
    .then((count) => {
      if (count === 0) {
        console.log(`no ${CACHE_SEGMENT} caches found below ${root}`);
      }
      process.exitCode = 0;
    })
    .catch((error) => {
      console.error(`[clear-unit-cache] FAIL: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
}
