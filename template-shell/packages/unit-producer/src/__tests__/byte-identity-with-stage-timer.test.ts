/**
 * Scenario: instrumentation MUST NOT change emitted bytes
 * (byte identity of units). A unit
 * produced through the producer with a `BuildStageTimer` and one
 * produced without it must be byte-identical: every emitted file's
 * content hash matches. The instrumentation is a side channel — it
 * writes nothing into the chunk bytes or the fetch lists — and
 * this scenario proves it by reusing the producer's own fixture set
 * under both shapes and comparing every emitted file's SHA-256.
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { UnitProducer, type UnitProducerOptions, BuildStageTimer } from '../index';

/**
 * Reuses the unit-producer's own unit-format fixtures (the same set
 * `byte-identity.test.ts` uses) so this scenario proves the
 * instrumentation over the same package shapes the byte-identity
 * contract already covers — ESM cycles, CJS packages, barrels and
 * subpath imports.
 */
const FIXTURES = [
  '@unit-format-fixture/esm-cycle',
  '@unit-format-fixture/cjs-package',
  '@unit-format-fixture/barrel-package',
  '@unit-format-fixture/subpath-import',
];

const CONSUMER_SPECIFIERS = ['@unit-format-fixture/subpath-import/feature'];

function fixturesDir(): string {
  const dir = fileURLToPath(new URL('./fixtures/unit-format', import.meta.url));
  if (!existsSync(dir)) {
    throw new Error(`unit-format fixtures not found at ${dir}`);
  }
  return dir;
}

const tmpRoots: string[] = [];

function tmpRoot(label: string): string {
  const root = mkdtempSync(join(tmpdir(), `upbi-stage-${label}-`));
  tmpRoots.push(root);
  return root;
}

/** Build a package root declaring every fixture as a dependency (real copies). */
function makeFixtureRoot(base: string): string {
  mkdirSync(join(base, 'node_modules'), { recursive: true });
  const src = fixturesDir();
  for (const name of FIXTURES) {
    const short = name.split('/').pop()!;
    cpSync(join(src, short), join(base, 'node_modules', name), {
      recursive: true,
    });
  }
  writeFileSync(
    join(base, 'package.json'),
    JSON.stringify({
      name: 'stage-timer-host',
      version: '0.0.0',
      dependencies: Object.fromEntries(FIXTURES.map((n) => [n, '1.0.0'])),
    })
  );
  return base;
}

const onError = (errors: string[]) => (m: string): never => {
  errors.push(m);
  throw new Error(m);
};

async function produce(
  packageRoot: string,
  outputDir: string,
  options?: Partial<UnitProducerOptions>
): Promise<string[]> {
  const errors: string[] = [];
  await new UnitProducer({
    packageRoot,
    outputDir,
    consumerSpecifiers: CONSUMER_SPECIFIERS,
    ...options,
  }).produce(onError(errors));
  return errors;
}

function listFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) files.push(...listFiles(p));
    else files.push(p);
  }
  return files;
}

/** SHA-256 of every file under `dir`, keyed by its path relative to `dir`. */
function hashTree(dir: string): Map<string, string> {
  const hashes = new Map<string, string>();
  for (const file of listFiles(dir)) {
    const rel = relative(dir, file).split(/[\\/]/).join('/');
    const buf = readFileSync(file);
    hashes.set(rel, createHash('sha256').update(buf).digest('hex'));
  }
  return hashes;
}

afterEach(() => {
  while (tmpRoots.length > 0) {
    rmSync(tmpRoots.pop()!, { recursive: true, force: true });
  }
});

describe('UnitProducer — instrumentation byte-identity', () => {
  it('produces byte-identical output with and without a stage timer', async () => {
    // Two identical roots — the producer is a pure function of
    // (package@version, modules, settings), so the only difference
    // between the runs is whether a BuildStageTimer is supplied.
    const rootBare = makeFixtureRoot(join(tmpRoot('bare'), 'app'));
    const rootTimer = makeFixtureRoot(join(tmpRoot('timer'), 'app'));
    const outBare = join(rootBare, 'out');
    const outTimer = join(rootTimer, 'out');

    const errorsBare = await produce(rootBare, outBare, {});
    const errorsTimer = await produce(rootTimer, outTimer, {
      stageTimer: new BuildStageTimer(),
    });
    expect(errorsBare).toEqual([]);
    expect(errorsTimer).toEqual([]);

    const bareHashes = hashTree(outBare);
    const timerHashes = hashTree(outTimer);

    // Same file set under both outputs.
    const bareNames = [...bareHashes.keys()].sort();
    const timerNames = [...timerHashes.keys()].sort();
    expect(bareNames.length).toBeGreaterThan(0);
    expect(timerNames).toEqual(bareNames);

    // Every emitted file's content hash matches.
    for (const name of bareNames) {
      expect(timerHashes.get(name), name).toBe(bareHashes.get(name));
    }
  }, 240000);

  it('the stage timer records non-negative timings for every stage the producer touches', async () => {
    const root = makeFixtureRoot(join(tmpRoot('timer-records'), 'app'));
    const out = join(root, 'out');
    const stageTimer = new BuildStageTimer();
    const errors = await produce(root, out, { stageTimer });
    expect(errors).toEqual([]);

    const timings = stageTimer.toRecord();
    // The producer always resolves the shared set and computes at
    // least one entry set; both Rollup and Terser run for a fresh
    // build; cache-read runs (a miss is a load attempt too); and
    // cache-write runs because cacheDir is unset here so no store
    // happens — that stage stays 0 by design.
    expect(timings['shared-set-resolution']).toBeGreaterThanOrEqual(0);
    expect(timings['entry-set-computation']).toBeGreaterThanOrEqual(0);
    expect(timings['rollup']).toBeGreaterThanOrEqual(0);
    expect(timings['terser']).toBeGreaterThanOrEqual(0);
    expect(timings['cache-read']).toBeGreaterThanOrEqual(0);
    expect(timings['cache-write']).toBe(0);
    expect(timings['vite-build']).toBe(0);
  }, 240000);

  it('emitted bytes carry no source-map, path-comment or build-environment text under instrumentation', async () => {
    const root = makeFixtureRoot(join(tmpRoot('scan'), 'app'));
    const out = join(root, 'out');
    const errors = await produce(root, out, {
      stageTimer: new BuildStageTimer(),
    });
    expect(errors).toEqual([]);

    const files = listFiles(out).filter((f) => f.endsWith('.js'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(file, 'utf-8');
      expect(source).not.toContain('sourceMappingURL');
      // No absolute filesystem path of this build's environment.
      expect(source).not.toContain(root);
      expect(source).not.toContain(tmpdir());
    }
  }, 240000);
});
