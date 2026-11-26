import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PackageBuildCache } from '../PackageBuildCache';
import { ProducerCacheFingerprint } from '../ProducerCacheFingerprint';
import { UnitProducer } from '../UnitProducer';

/**
 * The build-cache key covers every input of the cached computation: the
 * package's own files, the files of the packages its build reads (its
 * declared dependencies — the member respell and the module-kind
 * classification read them), the toolchain versions and the producer's
 * own code. The cached records hold no absolute path, so an entry
 * written from one install location answers another.
 */
const roots: string[] = [];

function write(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function makeRoot(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'unit-producer-cachekey-')));
  roots.push(root);
  write(join(root, 'package.json'), JSON.stringify({ name: 'host', version: '0.0.0', dependencies: { app: '1.0.0' } }));
  write(
    join(root, 'node_modules/app/package.json'),
    JSON.stringify({
      name: 'app',
      version: '1.0.0',
      type: 'module',
      exports: { '.': './index.js' },
      dependencies: { lib: '1.0.0' },
    })
  );
  write(join(root, 'node_modules/app/index.js'), "import { a } from 'lib';\nexport const app = () => a();\n");
  write(
    join(root, 'node_modules/lib/package.json'),
    JSON.stringify({ name: 'lib', version: '1.0.0', type: 'module', sideEffects: false, exports: { '.': './index.js' } })
  );
  write(join(root, 'node_modules/lib/index.js'), "export { a } from './a.js';\n");
  write(join(root, 'node_modules/lib/a.js'), "export const a = () => 'A';\n");
  return root;
}

afterEach(() => {
  ProducerCacheFingerprint.useToolchainReader(undefined);
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

const run = async (root: string, cacheDir: string) => {
  const producer = new UnitProducer({
    packageRoot: root,
    outputDir: join(root, 'out'),
    consumerSpecifiers: ['app'],
    cacheDir,
  });
  await producer.produce((m) => {
    throw new Error(m);
  });
  return producer.cacheOutcomes().packages;
};

describe('build-cache key inputs', () => {
  it('a changed dependency of the package misses the package\'s cache entry', async () => {
    const root = makeRoot();
    const cacheDir = join(root, 'cache');
    await run(root, cacheDir);
    write(join(root, 'node_modules/lib/b.js'), "export const a = () => 'B';\n");
    write(join(root, 'node_modules/lib/index.js'), "export { a } from './b.js';\n");
    const second = await run(root, cacheDir);
    expect(second.find((p) => p.name === 'app')?.outcome).toBe('miss');
  }, 120_000);

  it('a changed toolchain version misses the package\'s cache entry', async () => {
    const root = makeRoot();
    const cacheDir = join(root, 'cache');
    const cold = await run(root, cacheDir);
    expect(cold.every((p) => p.outcome === 'miss')).toBe(true);
    ProducerCacheFingerprint.useToolchainReader(() => '0.0.0-other');
    const changed = await run(root, cacheDir);
    expect(changed.every((p) => p.outcome === 'miss')).toBe(true);
    ProducerCacheFingerprint.useToolchainReader(undefined);
    const restored = await run(root, cacheDir);
    expect(restored.every((p) => p.outcome === 'hit')).toBe(true);
  }, 180_000);

  it('folds the toolchain versions into the key', () => {
    const text = ProducerCacheFingerprint.mix('code');
    for (const name of ['rollup', 'terser', '@rollup/plugin-commonjs', '@rollup/plugin-node-resolve']) {
      expect(text).toContain(`"${name}"`);
    }
  });

  it('stores no absolute path, so another install location hits the entry', async () => {
    const first = makeRoot();
    const cacheDir = realpathSync(mkdtempSync(join(tmpdir(), 'unit-producer-sharedcache-')));
    roots.push(cacheDir);
    const cold = await run(first, cacheDir);
    expect(cold.every((p) => p.outcome === 'miss')).toBe(true);
    const manifests: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (entry.name === 'manifest.json') manifests.push(readFileSync(p, 'utf-8'));
      }
    };
    walk(cacheDir);
    expect(manifests.length).toBeGreaterThan(0);
    for (const text of manifests) expect(text).not.toContain(first);

    const second = realpathSync(mkdtempSync(join(tmpdir(), 'unit-producer-cachekey-')));
    roots.push(second);
    cpSync(join(first, 'node_modules'), join(second, 'node_modules'), { recursive: true });
    cpSync(join(first, 'package.json'), join(second, 'package.json'));
    const warm = await run(second, cacheDir);
    expect(warm.every((p) => p.outcome === 'hit')).toBe(true);
    const app = readdirSync(join(second, 'out', 'app@1.0.0'));
    const coldApp = readdirSync(join(first, 'out', 'app@1.0.0'));
    expect(app).toEqual(coldApp);
  }, 120_000);

  it('answers subpath entries and deep paths the same from a deeper install root', async () => {
    const first = makeRoot();
    write(
      join(first, 'node_modules/app/package.json'),
      JSON.stringify({
        name: 'app',
        version: '1.0.0',
        type: 'module',
        exports: { '.': './index.js', './sub': './sub/index.js' },
        dependencies: { lib: '1.0.0' },
      })
    );
    write(join(first, 'node_modules/app/sub/index.js'), "import { a } from 'lib/a.js';\nexport const sub = () => a();\n");
    const cacheDir = realpathSync(mkdtempSync(join(tmpdir(), 'unit-producer-sharedcache-')));
    roots.push(cacheDir);
    const specifiers = ['app', 'app/sub', 'lib/a.js'];
    const produceAt = async (root: string) => {
      const producer = new UnitProducer({
        packageRoot: root,
        outputDir: join(root, 'out'),
        consumerSpecifiers: specifiers,
        cacheDir,
      });
      const produced = await producer.produce((m) => {
        throw new Error(m);
      });
      return { produced, outcomes: producer.cacheOutcomes().packages };
    };
    const cold = await produceAt(first);

    const deeper = join(
      realpathSync(mkdtempSync(join(tmpdir(), 'unit-producer-cachekey-'))),
      'one',
      'two',
      'three'
    );
    roots.push(join(deeper, '..', '..', '..'));
    mkdirSync(deeper, { recursive: true });
    cpSync(join(first, 'node_modules'), join(deeper, 'node_modules'), { recursive: true });
    cpSync(join(first, 'package.json'), join(deeper, 'package.json'));
    const warm = await produceAt(deeper);

    expect(warm.outcomes.every((p) => p.outcome === 'hit')).toBe(true);
    const shape = (produced: Awaited<ReturnType<typeof produceAt>>['produced']) =>
      produced.map((p) => ({
        name: p.name,
        entryUnits: p.entryUnits,
        lists: p.lists,
        answers: p.units.map((u) => u.location),
      }));
    expect(shape(warm.produced)).toEqual(shape(cold.produced));
    const app = warm.produced.find((p) => p.name === 'app')!;
    expect(app.entryUnits['app/sub']).toBeDefined();
    expect(warm.produced.find((p) => p.name === 'lib')!.entryUnits['lib/a.js']).toBeDefined();
  }, 180_000);

  it('records an entry excluded by an unlocatable import without the install root', async () => {
    const root = makeRoot();
    write(
      join(root, 'node_modules/app/package.json'),
      JSON.stringify({
        name: 'app',
        version: '1.0.0',
        type: 'module',
        exports: { '.': './index.js', './broken': './broken.js' },
        dependencies: { lib: '1.0.0' },
      })
    );
    write(join(root, 'node_modules/app/broken.js'), "import 'not-installed-anywhere';\nexport const b = 1;\n");
    const cacheDir = join(root, 'cache');
    await run(root, cacheDir);
    const texts: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (entry.name === 'manifest.json') texts.push(readFileSync(p, 'utf-8'));
      }
    };
    walk(cacheDir);
    expect(texts.some((t) => t.includes('not-installed-anywhere'))).toBe(true);
    for (const text of texts) expect(text).not.toContain(root);
  }, 120_000);

  it('reads each package directory once, for its own key and for every dependent, across producers', async () => {
    const root = makeRoot();
    const cacheDir = join(root, 'cache');
    const digests = vi.spyOn(PackageBuildCache, 'fileDigests');
    const options = {
      packageRoot: root,
      outputDir: join(root, 'out'),
      consumerSpecifiers: ['app'],
      cacheDir,
    };
    const first = new UnitProducer(options);
    await first.produce((m) => {
      throw new Error(m);
    });
    const dirs = digests.mock.calls.map(([dir]) => dir);
    expect(dirs.length).toBeGreaterThan(0);
    expect(new Set(dirs).size).toBe(dirs.length);
    const readByFirst = digests.mock.calls.length;
    await new UnitProducer({ ...options, outputDir: join(root, 'out2') }, first.contentFingerprints).produce((m) => {
      throw new Error(m);
    });
    expect(digests.mock.calls.length).toBe(readByFirst);
    digests.mockRestore();
  }, 120_000);
});
