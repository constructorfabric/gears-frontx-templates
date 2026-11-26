import {
  
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { UnitProducer, type ProducedSharedPackage } from '../UnitProducer';
import { declaredDependencies } from './support/declaredDependencies';

/**
 * Unresolvable and optional imports:
 *  - list completeness — a requested specifier with no
 *    answering item fails the build naming the specifier (no silent
 *    skip in emitLists or coverRequested).
 *  - bundler parity — a locatable undeclared import is
 *    delivered (with a warning); an optional peer stays a native
 *    external (with a warning); an unlocatable import is an error.
 *  - an entry whose closure needs an unlocatable or
 *    optional-peer-only specifier is excluded from the entry set and
 *    reported; a consumer requesting it fails as a requested specifier with no answering item.
 *  - distinct modules sharing an output stem are all emitted —
 *    the ESM file keeps the canonical stem, the `.cjs` twin a
 *    deterministic `-twin-N` name.
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

function makeRoot(deps: Record<string, string> = { lib: '1.0.0' }): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'unit-producer-resolve-')));
  roots.push(root);
  write(
    join(root, 'package.json'),
    JSON.stringify({ name: 'host', version: '0.0.0', dependencies: deps })
  );
  return root;
}

async function produce(
  root: string,
  consumerSpecifiers: string[] = declaredDependencies(root)
): Promise<ProducedSharedPackage[]> {
  return new UnitProducer({
    packageRoot: root,
    outputDir: join(root, 'out'),
    consumerSpecifiers,
  }).produce((m) => {
    throw new Error(m);
  });
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('UnitProducer — unresolvable, undeclared and optional imports', () => {
  it('a consumer-requested specifier with no resolving file fails naming the specifier', async () => {
    const root = makeRoot();
    pkg(
      root,
      'lib',
      { type: 'module', exports: { '.': './dist/index.js' } },
      { 'dist/index.js': 'export const x = 1;\n' }
    );
    await expect(produce(root, ['lib/no-such-entry'])).rejects.toThrow(
      /lib\/no-such-entry/
    );
  }, 60000);

  it('a locatable undeclared import of a shared package is delivered with a warning', async () => {
    const root = makeRoot();
    pkg(
      root,
      'lib',
      { type: 'module', exports: { '.': './dist/index.js' } },
      {
        'dist/index.js':
          "import { u } from 'sneaky';\nexport const x = u;\n",
      }
    );
    pkg(
      root,
      'sneaky',
      { type: 'module', main: './index.js' },
      { 'index.js': 'export const u = "SNEAKY_BODY";\n' }
    );
    const warnings: string[] = [];
    const orig = console.warn;
    console.warn = (...a: unknown[]) => warnings.push(a.join(' '));
    try {
      const produced = await produce(root);
      expect(produced.map((p) => p.name)).toContain('sneaky');
    } finally {
      console.warn = orig;
    }
    expect(warnings.some((w) => /sneaky.*not a declared|delivered/.test(w))).toBe(
      true
    );
  }, 60000);

  it('an optional peer import stays a native external and is not delivered', async () => {
    const root = makeRoot();
    pkg(
      root,
      'lib',
      {
        type: 'module',
        exports: {
          '.': './dist/index.js',
          './feature': './dist/feature.js',
        },
        peerDependencies: { opt: '1.0.0' },
        peerDependenciesMeta: { opt: { optional: true } },
      },
      {
        'dist/index.js': 'export const x = 1;\n',
        'dist/feature.js':
          "import { o } from 'opt';\nexport const x = o ?? 1;\n",
      }
    );
    pkg(
      root,
      'opt',
      { type: 'module', main: './index.js' },
      { 'index.js': 'export const o = "OPT_BODY";\n' }
    );
    const produced = await produce(root);
    expect(produced.map((p) => p.name)).not.toContain('opt');
    // The entry statically importing only an optional peer can never
    // load in a browser runtime — it is excluded and reported.
    const lib = produced.find((p) => p.name === 'lib')!;
    expect(lib.entryUnits['lib']).toBeDefined();
    expect(lib.entryUnits['lib/feature']).toBeUndefined();
  }, 60000);

  it('an unlocatable import of a shared package is an error naming the importer', async () => {
    const root = makeRoot();
    pkg(
      root,
      'lib',
      { type: 'module', exports: { '.': './dist/index.js' } },
      {
        'dist/index.js': "import 'ghost-pkg';\nexport const x = 1;\n",
      }
    );
    await expect(produce(root)).rejects.toThrow(/lib[\s\S]*ghost-pkg/);
  }, 60000);

  it('an unlocatable consumer-requested specifier is an error', async () => {
    const root = makeRoot();
    pkg(
      root,
      'lib',
      { type: 'module', exports: { '.': './dist/index.js' } },
      { 'dist/index.js': 'export const x = 1;\n' }
    );
    await expect(produce(root, ['not-installed-pkg/x'])).rejects.toThrow(
      /not-installed-pkg/
    );
  }, 60000);

  it('an entry whose closure needs an unlocatable specifier is excluded and reported', async () => {
    const root = makeRoot();
    pkg(
      root,
      'lib',
      {
        type: 'module',
        exports: {
          '.': './dist/index.js',
          './testing': './dist/testing.js',
        },
      },
      {
        'dist/index.js': 'export const x = 1;\n',
        'dist/testing.js':
          "import { run } from 'unlocatable-test-kit';\nexport const t = run;\n",
      }
    );
    const produced = await produce(root);
    const lib = produced.find((p) => p.name === 'lib')!;
    expect(lib.entryUnits['lib']).toBeDefined();
    expect(lib.entryUnits['lib/testing']).toBeUndefined();
    // A consumer requesting the excluded entry still fails the
    // build: the supplementary build's own specifier cannot be
    // located.
    const root2 = makeRoot();
    pkg(
      root2,
      'lib',
      {
        type: 'module',
        exports: {
          '.': './dist/index.js',
          './testing': './dist/testing.js',
        },
      },
      {
        'dist/index.js': 'export const x = 1;\n',
        'dist/testing.js':
          "import { run } from 'unlocatable-test-kit';\nexport const t = run;\n",
      }
    );
    await expect(produce(root2, ['lib/testing'])).rejects.toThrow(
      /unlocatable-test-kit/
    );
  }, 60000);

  it('distinct modules sharing an output stem are all emitted, ESM preferred', async () => {
    const root = makeRoot();
    pkg(
      root,
      'lib',
      {
        type: 'module',
        exports: {
          '.': './dist/index.js',
          './impl.js': './dist/impl.js',
          './impl.cjs': './dist/impl.cjs',
        },
      },
      {
        'dist/index.js': 'export const x = 1;\n',
        'dist/impl.js': 'export const impl = () => "ESM_IMPL";\n',
        'dist/impl.cjs': 'module.exports = { impl: () => "CJS_IMPL" };\n',
      }
    );
    const produced = await produce(root);
    const lib = produced.find((p) => p.name === 'lib')!;
    const implUnits = lib.units.filter(
      (u) =>
        u.modulePaths.includes('dist/impl.js') ||
        u.modulePaths.includes('dist/impl.cjs')
    );
    expect(implUnits.length).toBe(2);
    expect(lib.entryUnits['lib/impl.js']).toBeDefined();
    expect(lib.entryUnits['lib/impl.cjs']).toBeDefined();
    // The ESM twin keeps the canonical stem; the .cjs twin a
    // deterministic -twin-N name.
    expect(
      lib.units.some((u) => /impl\.[0-9a-f]{64}\.js$/.test(u.location))
    ).toBe(true);
    expect(
      lib.units.some((u) => /impl-twin-1\.[0-9a-f]{64}\.js$/.test(u.location))
    ).toBe(true);
  }, 60000);
});
