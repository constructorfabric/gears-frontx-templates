/**
 * The per-MFE build report the size gate reads: `reachableBytes` is the
 * bytes of the shared chunks on the emitted fetch lists, each counted
 * once; `totalBytes` is every emitted shared byte (chunks + list
 * documents). Version-drift lines and opaque `import(expr)` entries are
 * carried onto the report.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProducedSharedPackage } from '@gears-frontx/unit-producer';

import { MfeBuildReport } from '../MfeBuildReport';

const item = (location: string, answers: string[] = []) => ({
  location,
  contentHash: location,
  answers,
  imports: [],
});

/**
 * a: ESM, its `a` list carries index + b chunks (reached: ./b and `b/sub`).
 * b: CJS, its `b` + `b/sub` lists carry pack + sub chunks.
 */
const produced: ProducedSharedPackage[] = [
  {
    name: 'a',
    version: '1.0.0',
    packLocation: 'a@1.0.0/pack.p.js',
    unitMode: 'units',
    barrelMode: 'not-needed',
    chunkBytes: 111,
    units: [],
    entryUnits: {},
    lists: {
      a: {
        items: [
          item('a@1.0.0/index.x.js', ['a']),
          item('a@1.0.0/b.y.js'),
        ],
        ownChunks: [],
      },
    },
    transitive: false,
  },
  {
    name: 'b',
    version: '2.0.0',
    packLocation: 'b@2.0.0/pack.q.js',
    unitMode: 'units',
    barrelMode: 'kept',
    fallbackReason: 'CommonJS package; delivered as one chunk per entry point (2)',
    chunkBytes: 5020,
    units: [],
    entryUnits: {},
    lists: {
      b: { items: [item('b@2.0.0/pack.q.js', ['b'])], ownChunks: [] },
      'b/sub': { items: [item('b@2.0.0/sub.s.js', ['b/sub'])], ownChunks: [] },
    },
    transitive: true,
  },
];

describe('MfeBuildReport.compose', () => {
  let sharedDir: string;

  beforeEach(() => {
    sharedDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mfe-report-')));
    const sizes: Record<string, number> = {
      'a@1.0.0/index.x.js': 10,
      'a@1.0.0/b.y.js': 1,
      'b@2.0.0/pack.q.js': 5000,
      'b@2.0.0/sub.s.js': 20,
    };
    for (const [rel, size] of Object.entries(sizes)) {
      fs.mkdirSync(path.join(sharedDir, path.dirname(rel)), { recursive: true });
      fs.writeFileSync(path.join(sharedDir, rel), Buffer.alloc(size));
    }
  });

  afterEach(() => {
    fs.rmSync(sharedDir, { recursive: true, force: true });
  });

  it('counts only the chunks the emitted lists carry, each once', () => {
    const report = MfeBuildReport.compose({
      mfe: 'm',
      sharedOutDir: 'shared',
      produced,
      sharedDir,
    });
    const a = report.packages.find((p) => p.name === 'a')!;
    const b = report.packages.find((p) => p.name === 'b')!;
    expect(a.reachableBytes).toBe(11);
    expect(a.reachableChunks).toBe(2);
    expect(b.reachableBytes).toBe(5020);
    expect(report.reachableBytes).toBe(5031);
  });

  it('carries the per-package cache hits and misses when passed', () => {
    const cache = {
      hits: 1,
      misses: 1,
      packages: [
        { name: 'a', version: '1.0.0', outcome: 'hit' as const },
        { name: 'b', version: '2.0.0', outcome: 'miss' as const },
      ],
    };
    const report = MfeBuildReport.compose({
      mfe: 'm',
      sharedOutDir: 'shared',
      produced,
      sharedDir,
      cache,
    });
    expect(report.cache).toEqual(cache);
    expect(
      MfeBuildReport.compose({ mfe: 'm', sharedOutDir: 'shared', produced, sharedDir }).cache
    ).toBeUndefined();
  });

  it('totals every emitted byte: the chunk files', () => {
    const report = MfeBuildReport.compose({
      mfe: 'm',
      sharedOutDir: 'shared',
      produced,
      sharedDir,
    });
    const a = report.packages.find((p) => p.name === 'a')!;
    const b = report.packages.find((p) => p.name === 'b')!;
    expect(a.totalBytes).toBe(111);
    expect(b.totalBytes).toBe(5020);
    expect(report.totalBytes).toBe(111 + 5020);
  });

  it('records unit mode, transitivity and fallback per package', () => {
    const report = MfeBuildReport.compose({
      mfe: 'm',
      sharedOutDir: 'shared',
      produced,
      sharedDir,
    });
    expect(report.packages.map((p) => [p.name, p.unitMode, p.transitive])).toEqual([
      ['a', 'units', false],
      ['b', 'units', true],
    ]);
    expect(report.fallbackReasons).toEqual([
      'b: CommonJS package; delivered as one chunk per entry point (2)',
    ]);
  });

  it('carries version-drift and opaque import entries', () => {
    const drifted = produced.map((p) =>
      p.name === 'a'
        ? { ...p, versionDrift: 'a — 1.0.0 here, 2.0.0 in another runtime' }
        : p
    ) as ProducedSharedPackage[];
    const report = MfeBuildReport.compose({
      mfe: 'm',
      sharedOutDir: 'shared',
      produced: drifted,
      sharedDir,
      opaqueImports: [
        { file: 'assets/lazy.js', line: 12, expression: 'name' },
      ],
    });
    expect(report.packages.find((p) => p.name === 'a')!.versionDrift).toContain('1.0.0');
    expect(report.opaqueImports).toEqual([
      'assets/lazy.js:12 · import(name) · stays native',
    ]);
  });

  it('carries the per-stage build-time record when stageTimings is passed', () => {
    const stageTimings = {
      'shared-set-resolution': 12,
      'entry-set-computation': 34,
      'rollup': 560,
      'terser': 78,
      'cache-read': 9,
      'cache-write': 11,
      'vite-build': 1234,
    };
    const report = MfeBuildReport.compose({
      mfe: 'm',
      sharedOutDir: 'shared',
      produced,
      sharedDir,
      stageTimings,
    });
    expect(report.stageTimings).toEqual(stageTimings);
    expect(report.stageTimings!['vite-build']).toBe(1234);
  });

  it('omits stageTimings when none is passed (older reports stay readable)', () => {
    const report = MfeBuildReport.compose({
      mfe: 'm',
      sharedOutDir: 'shared',
      produced,
      sharedDir,
    });
    expect(report.stageTimings).toBeUndefined();
  });
});
