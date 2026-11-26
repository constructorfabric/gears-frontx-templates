import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { PackageBuildCache } from '../PackageBuildCache';
import { ProducerCodeHash } from '../ProducerCodeHash';
import { ProducerCacheFingerprint } from '../ProducerCacheFingerprint';

/**
 * Scenario: the build-cache key mixes the package's content
 * fingerprint with the producer's *version string*
 * (`JSON.stringify(this.producer)`) and the fixed settings text, so a
 * change to producer code without a version bump reuses outputs
 * computed by old code. That masked stale output: after a fix, warm
 * builds kept serving the chunks computed before it, so a round-count run
 * measured stale output.
 *
 * The fix drops the version string from the key and folds in a
 * content hash of the producer's own built code (the unit-producer
 * `dist/` files actually executed, computed once per process) plus
 * the fixed settings text. Keys are content hashes of every input,
 * never version labels.
 */

const dirs: string[] = [];

function tmp(label: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), `producer-code-hash-${label}-`)));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe('ProducerCacheFingerprint — content-hash cache key', () => {
  it('a different producer code-hash misses the cache (different fingerprint)', () => {
    const pkgDir = join(tmp('pkg-a'), 'pkg');
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(join(pkgDir, 'index.js'), 'export const x = 1;\n');
    const fp1 = PackageBuildCache.fingerprint(
      pkgDir,
      ProducerCacheFingerprint.mix('code-hash-A')
    );
    const fp2 = PackageBuildCache.fingerprint(
      pkgDir,
      ProducerCacheFingerprint.mix('code-hash-B')
    );
    expect(fp1).not.toBe(fp2);
  });

  it('identical inputs hit the cache (same fingerprint)', () => {
    const pkgDir = join(tmp('pkg-b'), 'pkg');
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(join(pkgDir, 'index.js'), 'export const x = 1;\n');
    const fp1 = PackageBuildCache.fingerprint(
      pkgDir,
      ProducerCacheFingerprint.mix('code-hash-A')
    );
    const fp2 = PackageBuildCache.fingerprint(
      pkgDir,
      ProducerCacheFingerprint.mix('code-hash-A')
    );
    expect(fp1).toBe(fp2);
  });

  it('the key is independent of the producer version string', () => {
    // The mix construction takes only a code-hash and a chunk
    // grouping — no producer identity participates — so two
    // producers with different version strings but the same code
    // produce the same key. The pre-fix key embedded
    // `JSON.stringify(this.producer)`, so a producer version bump
    // alone would invalidate every cache entry.
    const mix = ProducerCacheFingerprint.mix('code-hash-A');
    expect(mix).not.toContain('test-producer');
    // A plausible producer version label must not appear in the
    // key text — the only inputs are the code hash and the fixed
    // settings text.
    expect(mix).not.toContain('9.9.9-test-version');
  });
});

describe('ProducerCodeHash — per-process content hash', () => {
  it('returns a SHA-256 hex digest of the executed producer code', () => {
    const hash = ProducerCodeHash.compute();
    expect(typeof hash).toBe('string');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is memoized per process (same value across calls)', () => {
    const a = ProducerCodeHash.compute();
    const b = ProducerCodeHash.compute();
    expect(a).toBe(b);
  });

  it('returns a fresh hash after the cache is reset', () => {
    const a = ProducerCodeHash.compute();
    ProducerCodeHash.reset();
    const b = ProducerCodeHash.compute();
    // The hash is over the same code, so it is stable across a
    // reset — the memoization is an optimization, not a source of
    // variation.
    expect(a).toBe(b);
  });
});
