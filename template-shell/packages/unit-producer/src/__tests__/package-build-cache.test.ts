import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import * as fs from 'node:fs';
import {
  PackageBuildCache,
  type CachedPackageBuild,
} from '../PackageBuildCache';

/**
 * Scenario: the producer's build-machine cache is safe under
 * concurrent builds. `store` assembles an entry in a sibling staging
 * directory and moves it into place with one rename: a `load` either
 * sees the complete entry or misses cleanly — never a torn entry —
 * and two producers racing one fingerprint end with one complete
 * entry and no staging leftovers.
 */

const dirs: string[] = [];

function tmp(label: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), `pkg-cache-${label}-`)));
  dirs.push(dir);
  return dir;
}

function manifest(chunkIds: string[]): CachedPackageBuild {
  return {
    chunks: chunkIds.map((id) => ({
      id,
      namePath: id.replace(/\.js$/, ''),
      modulePaths: [],
      externalEdges: [],
      internalEdges: [],
      isCjsEntry: false,
    })),
    entryChunks: {},
    barrelNotes: [],
    entrySpecifiers: [],
    inputs: [],
  };
}

function store(
  cache: PackageBuildCache,
  fingerprint: string,
  chunks: Record<string, string>
): void {
  const sourceDir = join(tmp('src'), 'chunks-src');
  mkdirSync(sourceDir, { recursive: true });
  for (const [id, text] of Object.entries(chunks)) {
    writeFileSync(join(sourceDir, id), text);
  }
  cache.store('pkg', '1.0.0', fingerprint, manifest(Object.keys(chunks)), sourceDir);
}

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe('PackageBuildCache — atomic, race-safe store', () => {
  it('round-trips a stored entry and leaves no staging leftovers', () => {
    const cacheDir = join(tmp('basic'), 'cache');
    const cache = new PackageBuildCache(cacheDir);
    store(cache, 'fp-one', { 'index.js': 'chunk-bytes' });
    const hit = cache.load('pkg', '1.0.0', 'fp-one');
    expect(hit).toBeDefined();
    expect(hit!.build.chunks.map((c) => c.id)).toEqual(['index.js']);
    expect(readFileSync(join(hit!.chunkDir, 'index.js'), 'utf-8')).toBe(
      'chunk-bytes'
    );
    // No `.tmp-*` staging directories survive anywhere in the cache.
    const all = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? [e.name, ...all(join(dir, e.name))] : []
      );
    expect(all(cacheDir).filter((n) => n.includes('.tmp-'))).toEqual([]);
  });

  it('two stores racing one fingerprint leave exactly one complete entry', () => {
    const cacheDir = join(tmp('race'), 'cache');
    const cache = new PackageBuildCache(cacheDir);
    store(cache, 'fp-race', { 'a.js': 'first' });
    store(cache, 'fp-race', { 'a.js': 'second' });
    const hit = cache.load('pkg', '1.0.0', 'fp-race');
    expect(hit).toBeDefined();
    // Identical inputs produce identical entries — whichever store won
    // the rename, the readable entry is complete.
    expect(['first', 'second']).toContain(
      readFileSync(join(hit!.chunkDir, 'a.js'), 'utf-8')
    );
    const entries = readdirSync(join(cacheDir, 'pkg@1.0.0')).filter(
      (n) => !n.includes('.tmp-')
    );
    expect(entries).toEqual(['fp-race']);
  });

  it('a crashed store’s leftover staging directory never satisfies a load', () => {
    const cacheDir = join(tmp('torn'), 'cache');
    const cache = new PackageBuildCache(cacheDir);
    // Simulate a store killed between mkdir and rename: a `.tmp-*`
    // sibling holding a manifest but not all chunks.
    const entry = join(cacheDir, 'pkg@1.0.0', 'fp-torn');
    const torn = `${entry}.tmp-dead`;
    mkdirSync(join(torn, 'chunks'), { recursive: true });
    writeFileSync(join(torn, 'manifest.json'), JSON.stringify(manifest(['a.js'])));
    expect(cache.load('pkg', '1.0.0', 'fp-torn')).toBeUndefined();
  });

  it('rethrows a non-race rename error (EACCES) instead of swallowing it as a race (R5)', () => {
    // The pre-fix `catch {}` swallowed every rename error as a race;
    // a real I/O failure (permission denied on the cache directory,
    // disk full, read-only filesystem) silently dropped the cache
    // write and the next build rebuilt from scratch without any
    // clue why. The fix rethrows anything that is not a real race
    // (EEXIST/ENOTEMPTY/EPERM).
    //
    // Drive the EACCES path by making the cache's package directory
    // read-only so `renameSync(tmp, dir)` cannot move the staging
    // entry into place. The store's inner catch rethrows (the code
    // is not EEXIST/ENOTEMPTY/EPERM), the outer catch rethrows after
    // cleaning up — a pre-fix build would have returned without
    // throwing on the same input.
    const cacheDir = join(tmp('rethrow'), 'cache');
    const pkgDir = join(cacheDir, 'pkg@1.0.0');
    mkdirSync(pkgDir, { recursive: true });
    const cache = new PackageBuildCache(cacheDir);
    fs.chmodSync(pkgDir, 0o555); // r-xr-xr-x — no write/rename
    try {
      let threw: unknown;
      try {
        store(cache, 'fp-eacces', { 'index.js': 'bytes' });
      } catch (err) {
        threw = err;
      }
      // The store must surface the I/O error, not swallow it.
      expect(threw).toBeDefined();
      const code = (threw as NodeJS.ErrnoException).code;
      // A read-only parent yields EACCES on POSIX; some sandboxes
      // surface EPERM. Either is a non-race rethrow; the race
      // sentinels (EEXIST/ENOTEMPTY) would mean the fix swallowed
      // the error and the test failed to exercise the rethrow path.
      expect(['EACCES', 'EPERM', 'ENOSPC', 'EROFS']).toContain(code);
    } finally {
      // Restore writability so afterEach's rmSync can clean up.
      fs.chmodSync(pkgDir, 0o755);
    }
  });

  it('still swallows a real rename race (EEXIST) and keeps the winner entry (R5)', () => {
    // A concurrent store winning the rename race surfaces as the
    // target existing (EEXIST) or being non-empty (ENOTEMPTY). The
    // fix keeps the prior `rmSync` of the loser's staging directory
    // — both entries are byte-identical for the same fingerprint, so
    // the loser's discard is correct and the store returns cleanly.
    const cacheDir = join(tmp('race-swallow'), 'cache');
    const cache = new PackageBuildCache(cacheDir);
    // First store fills the fingerprint; second store hits a real
    // rename race (target exists) and must not throw.
    store(cache, 'fp-race', { 'index.js': 'first' });
    expect(() =>
      store(cache, 'fp-race', { 'index.js': 'second' })
    ).not.toThrow();
    const hit = cache.load('pkg', '1.0.0', 'fp-race');
    expect(hit).toBeDefined();
    expect(['first', 'second']).toContain(
      readFileSync(join(hit!.chunkDir, 'index.js'), 'utf-8')
    );
  });
});
