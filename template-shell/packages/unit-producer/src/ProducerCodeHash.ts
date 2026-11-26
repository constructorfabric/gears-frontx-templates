/**
 * `ProducerCodeHash` — the content hash of the unit-producer's own
 * built code (the `dist/` files actually executed in production),
 * computed once per process. Folded into the build-cache key
 * (`ProducerCacheFingerprint`) so a change to producer code without a
 * version bump cannot reuse outputs computed by old code: the key is a content hash of every input, never
 * a version label.
 *
 * The hash covers the directory the executing code actually lives in:
 * `dist/` when the producer runs from its built output (production,
 * `cjs-entry-handle-cleanup.test.ts`'s spawned child), `src/` when it
 * runs from source (vitest). A source edit during test development
 * invalidates the cache; a rebuilt `dist/` invalidates it in
 * production. `node_modules` is never walked.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ContentHasher } from './ContentHasher';

export class ProducerCodeHash {
  private static cached: string | undefined;

  /** The content hash of the producer's own executed code, memoized per process. */
  static compute(): string {
    if (ProducerCodeHash.cached !== undefined) return ProducerCodeHash.cached;
    const thisFile = ProducerCodeHash.thisFile();
    const pkgDir = ProducerCodeHash.packageDir(thisFile);
    const distDir = path.join(pkgDir, 'dist');
    const srcDir = path.join(pkgDir, 'src');
    // Hash the directory the executed code actually lives in. When
    // the producer runs from `dist/` (production, the spawned-child
    // test), that is `dist/`; when it runs from `src/` (vitest), that
    // is `src/`. Either way, an edit to the executed code changes the
    // hash and invalidates the cache.
    const dir = thisFile.startsWith(distDir + path.sep)
      ? distDir
      : srcDir;
    const hash = ProducerCodeHash.hashDir(dir);
    ProducerCodeHash.cached = hash;
    return hash;
  }

  /** Resets the per-process memo — tests use this to verify memoization. */
  static reset(): void {
    ProducerCodeHash.cached = undefined;
  }

  private static thisFile(): string {
    return fileURLToPath(import.meta.url);
  }

  /** The nearest package directory above `fromFile` (contains `package.json`). */
  private static packageDir(fromFile: string): string {
    let dir = path.dirname(fromFile);
    for (;;) {
      if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
      const parent = path.dirname(dir);
      if (parent === dir) return dir;
      dir = parent;
    }
  }

  /** SHA-256 over every file's relative path and content under `dir`. */
  private static hashDir(dir: string): string {
    if (!fs.existsSync(dir)) return ContentHasher.ofText('empty');
    const parts: string[] = [];
    const walk = (d: string): void => {
      for (const name of fs.readdirSync(d).sort()) {
        if (name === 'node_modules') continue;
        const p = path.join(d, name);
        const stat = fs.statSync(p);
        if (stat.isDirectory()) {
          walk(p);
          continue;
        }
        if (!stat.isFile()) continue;
        const rel = path.relative(dir, p).split(path.sep).join('/');
        parts.push(`${rel}:${ContentHasher.ofFile(p) ?? 'unreadable'}`);
      }
    };
    walk(dir);
    return ContentHasher.ofText(parts.join('\n'));
  }
}
