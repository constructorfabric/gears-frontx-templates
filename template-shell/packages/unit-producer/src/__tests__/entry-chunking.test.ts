import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { UnitProducer, type ProducedSharedPackage } from '../UnitProducer';

/**
 * Scenario: Module Federation-style entry-point chunking — a package's
 * chunk boundaries and bytes come from its own complete entry set
 * (exports subpaths + barrel members split only when side-effect-free),
 * never from who consumes it. Two consumers importing different subsets
 * produce byte-identical package chunks; each build emits flat per-entry
 * fetch lists, lazy delta lists for literal `import()` targets, and
 * writes only the chunks its own lists reference.
 */

const roots: string[] = [];

function write(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function pkg(
  root: string,
  name: string,
  json: object,
  files: Record<string, string>
): void {
  const dir = join(root, 'node_modules', name);
  write(
    join(dir, 'package.json'),
    JSON.stringify({ name, version: '1.0.0', ...json })
  );
  for (const [rel, content] of Object.entries(files)) {
    write(join(dir, rel), content);
  }
}

function tmpRoot(label: string): string {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), `unit-producer-chunks-${label}-`))
  );
  roots.push(root);
  return root;
}


async function produce(
  root: string,
  out: string,
  consumerSpecifiers: readonly string[] = []
): Promise<ProducedSharedPackage[]> {
  return new UnitProducer({
    packageRoot: root,
    outputDir: join(root, out),
    consumerSpecifiers,
  }).produce((m) => {
    throw new Error(m);
  });
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

/** A shared package: barrel index + feature/util entries + a lazy target. */
function makeBarrelRoot(label: string, deps: Record<string, string> = { 'kit': '1.0.0' }): string {
  const root = tmpRoot(label);
  write(
    join(root, 'package.json'),
    JSON.stringify({ name: 'host', version: '0.0.0', dependencies: deps })
  );
  pkg(
    root,
    'kit',
    {
      type: 'module',
      sideEffects: false,
      exports: {
        '.': './dist/index.js',
        './feature': './dist/feature.js',
        './util': './dist/util.js',
      },
    },
    {
      'dist/index.js': [
        "export { feature } from './feature.js';",
        "export { util } from './util.js';",
        '',
      ].join('\n'),
      'dist/feature.js':
        "import { util } from './util.js';\n" +
        "export const feature = () => 'FEATURE' + util();\n" +
        "export const lazyLoad = () => import('./lazy.js');\n",
      'dist/util.js': "export const util = () => 'UTIL';\n",
      'dist/lazy.js': "export const lazy = () => 'LAZY';\n",
    }
  );
  return root;
}

describe('UnitProducer — entry-point chunking and flat lists', () => {
  it('emits one flat list per requested entry, units inline', async () => {
    const root = makeBarrelRoot('lists');
    const produced = await produce(root, 'out', ['kit/feature']);
    const kit = produced.find((p) => p.name === 'kit')!;

    const doc = kit.lists['kit/feature'];
    expect(doc).toBeDefined();
    expect(doc.items.length).toBeGreaterThan(0);
    for (const item of doc.items) {
      expect(item.contentHash).toMatch(/^[0-9a-f]{64}$/);
      expect(Array.isArray(item.answers)).toBe(true);
      expect(Array.isArray(item.imports)).toBe(true);
    }
    // The feature entry's answering chunk answers its specifier.
    const answering = doc.items.find((i) => i.answers.includes('kit/feature'));
    expect(answering).toBeDefined();
    // Every item's bytes exist under the output dir.
    for (const item of doc.items) {
      expect(existsSync(join(root, 'out', item.location)), item.location).toBe(true);
    }
  }, 60000);

  it('splits side-effect-free barrel members into their own chunks', async () => {
    const root = makeBarrelRoot('b2-split');
    const produced = await produce(root, 'out', ['kit', 'kit/feature']);
    const kit = produced.find((p) => p.name === 'kit')!;
    // `kit/util` is answered by a chunk (the barrel member entry).
    const utilChunk = kit.entryUnits['kit/dist/util.js'];
    expect(utilChunk).toBeDefined();
    // A consumer of `kit/feature` reaches the util module's own
    // chunk (the shared internal split), not the barrel bytes. The
    // answering chunk's exact content-addressed location is the
    // feature list — not any chunk whose id merely contains `util`.
    const featureList = kit.lists['kit/feature'];
    expect(featureList).toBeDefined();
    const locations = featureList.items.map((i) => i.location);
    expect(locations).toContain(utilChunk);
  }, 60000);

  it('keeps a side-effectful barrel whole and reports package, reason and one-line fix', async () => {
    const root = tmpRoot('b2-kept');
    write(
      join(root, 'package.json'),
      JSON.stringify({ name: 'host', version: '0.0.0', dependencies: { 'fat': '1.0.0' } })
    );
    pkg(
      root,
      'fat',
      { type: 'module', exports: { '.': './dist/index.js' } },
      {
        'dist/index.js':
          "export { a } from './a.js';\n" +
          "export { b } from './b.js';\n" +
          "globalThis.__fat_evaluated = true;\n",
        'dist/a.js': "export const a = 'A';\n",
        'dist/b.js': "export const b = 'B';\n",
      }
    );
    const produced = await produce(root, 'out', ['fat']);
    const fat = produced.find((p) => p.name === 'fat')!;
    // The member module is answered only by the whole entry's chunk —
    // a consumer rewriting to `fat/dist/a.js` gets the whole entry's
    // bytes (MF behaviour: the entry's chunk is used as-is).
    expect(fat.entryUnits['fat/dist/a.js']).toBe(fat.entryUnits['fat']);
    expect(fat.barrelKeptReason).toBeDefined();
    expect(fat.barrelKeptReason).toMatch(/fat@1\.0\.0/);
    expect(fat.barrelKeptReason).toMatch(/sideEffects/i);
  }, 60000);

  it('produces byte-identical chunks for two consumers using different subsets', async () => {
    const root = makeBarrelRoot('independence');
    const a = await produce(root, 'out-a', ['kit/feature']);
    const b = await produce(root, 'out-b', ['kit']);
    const kitA = a.find((p) => p.name === 'kit')!;
    const kitB = b.find((p) => p.name === 'kit')!;
    // The chunks each consumer's lists reference are drawn from one
    // identical chunk set — same locations, same bytes.
    const locsA = Object.values(kitA.lists).flatMap((l) => l.items.map((i) => i.location));
    const locsB = Object.values(kitB.lists).flatMap((l) => l.items.map((i) => i.location));
    // Every chunk both lists share is byte-identical across builds.
    for (const loc of locsA.filter((l) => locsB.includes(l))) {
      expect(readFileSync(join(root, 'out-a', loc), 'utf-8')).toBe(
        readFileSync(join(root, 'out-b', loc), 'utf-8')
      );
    }
    // Strong form: the answering chunk of `kit/feature` is identical —
    // its location carries the bytes' SHA-256, so equal locations are
    // equal bytes (out-b did not publish it — its lists never reached
    // it — so it is compared by identity, not read).
    expect(kitA.entryUnits['kit/feature']).toBe(kitB.entryUnits['kit/feature']);
  }, 120000);

  it('writes only the chunks its own lists reference (B1)', async () => {
    const root = makeBarrelRoot('b1');
    const produced = await produce(root, 'out', ['kit/feature']);
    const kit = produced.find((p) => p.name === 'kit')!;
    // The root entry's barrel chunk is computed (consumer-independent
    // chunk boundaries) but not published: no emitted list references it.
    // `kit` is a declared dep — its root list is emitted and its
    // barrel chunk published. The `kit/util` entry's own chunk, an
    // entry shim no list reaches, is NOT published.
    // A list references its own items and, through its lazy delta
    // lists, the chunks a literal `import()` target needs.
    const referenced = new Set(
      Object.values(kit.lists).flatMap((l) => [
        ...l.items.map((i) => i.location),
        ...Object.values(l.lazy ?? {}).flatMap((nested) =>
          nested.items.map((i) => i.location)
        ),
      ])
    );
    for (const u of kit.units) {
      // A computed chunk no emitted list references is never
      // published into dist.
      if (!referenced.has(u.location)) {
        expect(existsSync(join(root, 'out', u.location))).toBe(false);
      }
    }
    const { readdirSync, statSync } = await import('node:fs');
    const all: string[] = [];
    const walk = (d: string): void => {
      for (const e of readdirSync(d)) {
        const p = join(d, e);
        if (statSync(p).isDirectory()) walk(p);
        else all.push(p);
      }
    };
    walk(join(root, 'out'));
    const names = all.map((f) => f.slice(join(root, 'out').length + 1));
    // No pack/graph/partition emission remains.
    expect(names.some((n) => n.includes('.pack.') || n.includes('.graph.') || n.includes('.part-'))).toBe(false);
  }, 60000);

  it('emits a lazy delta list holding only what the target needs beyond the parent list', async () => {
    const root = makeBarrelRoot('lazy');
    const produced = await produce(root, 'out', ['kit/feature']);
    const kit = produced.find((p) => p.name === 'kit')!;
    const list = kit.lists['kit/feature'];
    expect(list.lazy).toBeDefined();
    const keys = Object.keys(list.lazy!);
    expect(keys.length).toBeGreaterThan(0);
    const lazyDoc = list.lazy![keys[0]];
    const parentHashes = new Set(list.items.map((i) => i.contentHash));
    for (const item of lazyDoc.items) {
      expect(parentHashes.has(item.contentHash)).toBe(false);
    }
  }, 60000);

  it('answers every entry specifier of byte-identical twin entries on the emitted item', async () => {
    // Two entry files under one stem with identical bytes share one
    // content identity: the emitted item is whichever twin the hash
    // lookup returns first, yet every specifier resolved to the
    // shared bytes — the bare entry included — must be answered by it.
    const root = tmpRoot('twins');
    write(
      join(root, 'package.json'),
      JSON.stringify({ name: 'host', version: '0.0.0', dependencies: { 'dup': '1.0.0' } })
    );
    const body = "export const v = 'V';\nexport default v;\n";
    pkg(
      root,
      'dup',
      {
        type: 'module',
        module: 'esm.js',
        main: 'esm.js',
        exports: {
          '.': { 'module': './esm.mjs', 'default': './esm.js' },
          './*': './*',
        },
      },
      {
        'esm.js': body,
        'esm.mjs': body,
      }
    );
    const produced = await produce(root, 'out', ['dup']);
    const dup = produced.find((p) => p.name === 'dup')!;
    const list = dup.lists['dup'];
    expect(list).toBeDefined();
    const answered = new Set(list.items.flatMap((i) => i.answers));
    expect(answered.has('dup')).toBe(true);
    expect(answered.has('dup/esm.js')).toBe(true);
    expect(answered.has('dup/esm.mjs')).toBe(true);
  }, 60000);

  it('caches the per-package@version computation on the build machine', async () => {
    const root = makeBarrelRoot('cache');
    const cacheDir = join(root, '.unit-cache');
    const produceCached = (out: string) =>
      new UnitProducer({
        packageRoot: root,
        outputDir: join(root, out),
        consumerSpecifiers: ['kit/feature'],
        cacheDir,
      }).produce((m) => {
        throw new Error(m);
      });
    const first = await produceCached('out-1');
    expect(existsSync(cacheDir)).toBe(true);
    const second = await produceCached('out-2');
    const listA = first.find((p) => p.name === 'kit')!.lists['kit/feature'];
    const listB = second.find((p) => p.name === 'kit')!.lists['kit/feature'];
    expect(listA).toEqual(listB);
  }, 120000);
});
