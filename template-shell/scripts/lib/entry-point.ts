/**
 * Whether a script module is the file node was told to run.
 *
 * Scripts that export helpers for tests run their command only when they are
 * the process entry point, so importing them has no side effects. Node resolves
 * the main module to its realpath, so the comparison resolves both sides: on a
 * symlinked checkout the unresolved spellings differ. It holds under `tsx` as
 * well as under node.
 */

import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A path with symlinks resolved, or the path itself when it cannot be resolved.
 * `realpathSync` throws when the path does not exist, which is not a reason to
 * fail: fall back to the input and let the comparison decide.
 */
function realPathOrSelf(target: string): string {
  try {
    return realpathSync(target);
  } catch {
    return target;
  }
}

/** Pass the caller's `import.meta.url`. */
export function isProcessEntryPoint(moduleUrl: string): boolean {
  const invokedPath = process.argv[1];
  return (
    invokedPath !== undefined &&
    realPathOrSelf(resolve(invokedPath)) === realPathOrSelf(fileURLToPath(moduleUrl))
  );
}
