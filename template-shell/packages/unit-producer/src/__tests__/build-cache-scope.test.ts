/**
 * Scenario: the shared build cache under parallel builds
 * Several builds sharing one
 * cache dir run concurrently (atomic writes); a cache-served
 * build emits files identical to a cold build; parallel per-package
 * processing emits the same bytes as serial; the cache holds the
 * entry-set result so a hit skips entry-set computation; per-package
 * hit/miss outcomes are reported.
 */

import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BuildStageTimer } from '../BuildStageTimer';
import { PackageEntrySet } from '../PackageEntrySet';
import { UnitProducer } from '../UnitProducer';

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, availableParallelism: vi.fn(() => actual.availableParallelism()) };
});

const roots: string[] = [];
function tmp(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'cache-scope-')));
  roots.push(dir);
  return dir;
}
function write(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}
function makeRoot(): string {
  const root = tmp();
  const deps: Record<string, string> = {};
  for (const n of ['pa', 'pb', 'pc', 'pd']) {
    deps[`@s/${n}`] = '1.0.0';
    const dir = join(root, 'node_modules', '@s', n);
    write(
      join(dir, 'package.json'),
      JSON.stringify({ name: `@s/${n}`, version: '1.0.0', type: 'module', sideEffects: false, main: './index.js' })
    );
    write(join(dir, 'index.js'), `export * from './x.js';\nexport const ${n} = 1;\n`);
    write(join(dir, 'x.js'), `export const x_${n} = () => '${n}';\n`);
  }
  write(join(root, 'package.json'), JSON.stringify({ name: 'consumer', version: '0.0.0', dependencies: deps }));
  return root;
}
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, e.name);
      if (e.isDirectory()) walk(full);
      else out[full.slice(dir.length + 1)] = readFileSync(full, 'utf-8');
    }
  };
  walk(dir);
  return out;
}
function make(root: string, out: string, cacheDir: string | undefined, extra: object = {}) {
  return new UnitProducer({
    packageRoot: root,
    outputDir: out,
    cacheDir,
    ...extra,
  });
}
const fail = (m: string): never => {
  throw new Error(m);
};

afterEach(() => {
  vi.restoreAllMocks();
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('shared build cache — parallel builds and determinism', () => {
  it('several concurrent builds sharing one cache all succeed with identical output', async () => {
    const root = makeRoot();
    const cache = join(root, 'shared-cache');
    const outs = [0, 1, 2, 3].map((i) => join(root, `out-${i}`));
    await Promise.all(outs.map((o) => make(root, o, cache).produce(fail)));
    const first = snapshot(outs[0]);
    for (const o of outs.slice(1)) expect(snapshot(o)).toEqual(first);
    const solo = join(root, 'out-solo');
    await make(root, solo, undefined).produce(fail);
    expect(snapshot(solo)).toEqual(first);
  }, 120000);

  it('a cache-served build emits files identical to the cold build (hit/miss equivalence)', async () => {
    const root = makeRoot();
    const cache = join(root, 'cache');
    const coldOut = join(root, 'cold');
    const warmOut = join(root, 'warm');
    const cold = make(root, coldOut, cache);
    await cold.produce(fail);
    const warm = make(root, warmOut, cache);
    await warm.produce(fail);
    expect(snapshot(warmOut)).toEqual(snapshot(coldOut));
    expect(cold.cacheOutcomes().misses).toBe(4);
    expect(cold.cacheOutcomes().hits).toBe(0);
    expect(warm.cacheOutcomes().hits).toBe(4);
    expect(warm.cacheOutcomes().misses).toBe(0);
    expect(warm.cacheOutcomes().packages.map((p) => p.name)).toEqual([
      '@s/pa',
      '@s/pb',
      '@s/pc',
      '@s/pd',
    ]);
  }, 120000);

  it('parallel per-package processing emits the same bytes and report as serial', async () => {
    const root = makeRoot();
    const serialOut = join(root, 'serial');
    const parallelOut = join(root, 'parallel');
    const parallelism = vi.mocked(availableParallelism);
    parallelism.mockReturnValue(1);
    const serial = make(root, serialOut, join(root, 'c1'));
    const a = await serial.produce(fail);
    parallelism.mockReturnValue(4);
    const parallel = make(root, parallelOut, join(root, 'c2'));
    const b = await parallel.produce(fail);
    expect(snapshot(parallelOut)).toEqual(snapshot(serialOut));
    expect(b.map((p) => p.name)).toEqual(a.map((p) => p.name));
    expect(parallel.cacheOutcomes()).toEqual(serial.cacheOutcomes());
  }, 120000);

  it('a cache hit skips entry-set computation (the entry set is cached with the Rollup output)', async () => {
    const root = makeRoot();
    const cache = join(root, 'cache');
    await make(root, join(root, 'o1'), cache).produce(fail);
    const compute = vi.spyOn(PackageEntrySet, 'compute');
    const timer = new BuildStageTimer();
    await make(root, join(root, 'o2'), cache, { stageTimer: timer }).produce(fail);
    expect(compute).not.toHaveBeenCalled();
  }, 120000);

  it('reports `disabled` for every package when no cache dir is set', async () => {
    const root = makeRoot();
    const p = make(root, join(root, 'o'), undefined);
    await p.produce(fail);
    expect(p.cacheOutcomes().packages.every((e) => e.outcome === 'disabled')).toBe(true);
  }, 120000);
});
