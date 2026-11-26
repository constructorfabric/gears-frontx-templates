/**
 * `defaultProducerCacheDir` — the build-machine cache directory the
 * plugins wire into `UnitProducerOptions.cacheDir` when the caller
 * does not pin one: one cache per workspace,
 * `<workspace root>/node_modules/.cache/frontx-unit-producer`, read
 * and written by the shell and every MFE build of that workspace so a
 * `package@version` is computed once. A package outside any workspace
 * uses its own project root. The `cacheDir` option of either plugin
 * overrides this location (separate repositories, shared CI paths).
 */

import * as path from 'node:path';

import { WorkspaceRoot } from './WorkspaceRoot';

export function defaultProducerCacheDir(packageRoot: string): string {
  return path.join(
    WorkspaceRoot.of(packageRoot),
    'node_modules',
    '.cache',
    'frontx-unit-producer'
  );
}
