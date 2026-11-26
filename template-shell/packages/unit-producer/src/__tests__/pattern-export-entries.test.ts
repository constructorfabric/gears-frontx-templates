import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { PackageEntrySet } from '../PackageEntrySet';
import { UnitProducer, type ProducedSharedPackage } from '../UnitProducer';

/**
 * A pattern export (`"./*": "./*"`) joins the complete entry set
 * only with the package's runtime entry candidates — files the pattern's
 * runtime-condition target maps to that the package ships as runtime
 * JavaScript, never its test directories, test files or TypeScript
 * sources. The production-runtime closure screen follows `require()`
 * edges as well as imports, so a CJS or UMD build needing a specifier
 * that cannot be located leaves the set with a report line instead of
 * failing the package's chunk build.
 */

const roots: string[] = [];

function write(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function makeRoot(deps: Record<string, string>): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'unit-producer-ci010-')));
  roots.push(root);
  write(join(root, 'package.json'), JSON.stringify({ name: 'host', version: '0.0.0', dependencies: deps }));
  return root;
}

function pkg(root: string, name: string, json: object, files: Record<string, string>): string {
  const dir = join(root, 'node_modules', name);
  write(join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0', ...json }));
  for (const [rel, content] of Object.entries(files)) write(join(dir, rel), content);
  return dir;
}

async function entrySetOf(
  root: string,
  name: string,
  json: Record<string, unknown>
): Promise<Awaited<ReturnType<typeof PackageEntrySet.compute>>> {
  const dir = join(root, 'node_modules', name);
  return PackageEntrySet.compute({
    name,
    packageDir: dir,
    resolveDir: root,
    version: '1.0.0',
    pkg: json,
  });
}

const UMD_REQUIRING_GHOST =
  '(function (global, factory) {\n' +
  "  typeof exports === 'object' && typeof module !== 'undefined'\n" +
  "    ? factory(exports, require('ghost-schema'))\n" +
  "    : typeof define === 'function' && define.amd\n" +
  "      ? define(['exports', 'ghost-schema'], factory)\n" +
  '      : factory((global.kit = {}), global.ghost);\n' +
  '})(this, function (exports, ghost) {\n' +
  "  exports.kit = 'KIT_UMD' + String(ghost);\n" +
  '});\n';

/** A package shaped like a validator-adapter bundle: `./*` exposes the whole tree. */
const KIT_JSON = {
  exports: {
    '.': {
      types: './dist/index.d.ts',
      umd: './dist/kit.umd.js',
      import: './dist/kit.mjs',
      require: './dist/kit.js',
    },
    './*': './*',
  },
  main: 'dist/kit.js',
  module: 'dist/kit.mjs',
};

const KIT_FILES: Record<string, string> = {
  'dist/kit.mjs': "export const kit = 'KIT_ESM';\n",
  'dist/kit.js': "'use strict';\nexports.kit = 'KIT_CJS';\n",
  'dist/kit.umd.js': UMD_REQUIRING_GHOST,
  'dist/index.d.ts': 'export declare const kit: string;\n',
  'adapter/dist/adapter.mjs': "import { s } from './shared.mjs';\nexport const adapter = s;\n",
  'adapter/dist/shared.mjs': "export const s = 'ADAPTER_SHARED';\n",
  'adapter/dist/adapter.cjs': "'use strict';\nconst h = require('./helper.cjs');\nexports.adapter = h;\n",
  'adapter/dist/helper.cjs': "'use strict';\nmodule.exports = require('ghost-schema/value');\n",
  'adapter/dist/adapter.spec.mjs': "import 'ghost-test-kit';\nexport const spec = 1;\n",
  'adapter/src/adapter.ts': "import { Type } from 'ghost-schema';\nexport const adapter: unknown = Type;\n",
  'adapter/src/__tests__/adapter.test.ts': "import { it } from 'vitest';\nit('x', () => {});\n",
  'adapter/src/__tests__/fixture.js': "import 'ghost-test-kit';\nexport const f = 1;\n",
  'adapter/test/setup.mjs': "import 'ghost-test-kit';\nexport const setup = 1;\n",
};

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('PackageEntrySet — pattern exports expand to runtime entry candidates', () => {
  it('keeps shipped runtime JavaScript and leaves out test directories, test files and TS sources', async () => {
    const root = makeRoot({ kit: '1.0.0' });
    pkg(root, 'kit', KIT_JSON, KIT_FILES);

    const set = await entrySetOf(root, 'kit', KIT_JSON);
    const keys = [...set.entries.keys()];

    expect(keys).toContain('kit');
    expect(keys).toContain('kit/dist/kit.mjs');
    expect(keys).toContain('kit/dist/kit.js');
    expect(keys).toContain('kit/adapter/dist/adapter.mjs');
    expect(keys).toContain('kit/adapter/dist/shared.mjs');
    for (const key of keys) {
      expect(key).not.toMatch(/__tests__|\/test\/|\.spec\.|\/src\/|\.d\.ts$/);
    }
    // Never candidates, so never reported as excluded either.
    for (const excluded of set.excludedEntries) {
      expect(excluded.entry).not.toMatch(/__tests__|\/test\/|\.spec\.|\/src\//);
    }
  }, 60000);

  it('excludes a UMD build whose require() needs an uninstalled package, with a report line', async () => {
    const root = makeRoot({ kit: '1.0.0' });
    pkg(root, 'kit', KIT_JSON, KIT_FILES);

    const set = await entrySetOf(root, 'kit', KIT_JSON);

    expect(set.entries.has('kit/dist/kit.umd.js')).toBe(false);
    const umd = set.excludedEntries.find((e) => e.entry === 'kit/dist/kit.umd.js');
    expect(umd).toBeDefined();
    expect(umd!.specifier).toBe('ghost-schema');
    expect(umd!.reason).toMatch(/ghost-schema/);
    expect(umd!.reason).toMatch(/require\(\)/);
  }, 60000);

  it('follows relative require() edges, so a transitive unlocatable require excludes the entry', async () => {
    const root = makeRoot({ kit: '1.0.0' });
    pkg(root, 'kit', KIT_JSON, KIT_FILES);

    const set = await entrySetOf(root, 'kit', KIT_JSON);

    expect(set.entries.has('kit/adapter/dist/adapter.cjs')).toBe(false);
    const cjs = set.excludedEntries.find((e) => e.entry === 'kit/adapter/dist/adapter.cjs');
    expect(cjs).toBeDefined();
    expect(cjs!.specifier).toBe('ghost-schema/value');
    expect(cjs!.reason).toMatch(/adapter\/dist\/helper\.cjs/);
  }, 60000);

  it('keeps a CJS or UMD build whose require() targets are installed', async () => {
    const root = makeRoot({ kit: '1.0.0' });
    const json = { ...KIT_JSON, dependencies: { 'ghost-schema': '1.0.0' } };
    pkg(root, 'kit', json, KIT_FILES);
    pkg(root, 'ghost-schema', { main: './index.js', exports: { '.': './index.js', './value': './value.js' } }, {
      'index.js': "exports.Type = 'T';\n",
      'value.js': "exports.Value = 'V';\n",
    });

    const set = await entrySetOf(root, 'kit', json);

    expect(set.entries.has('kit/dist/kit.umd.js')).toBe(true);
    expect(set.entries.has('kit/adapter/dist/adapter.cjs')).toBe(true);
    expect(set.excludedEntries.map((e) => e.entry)).not.toContain('kit/dist/kit.umd.js');
  }, 60000);

  it('expands a pattern through its runtime-condition target, honouring null exclusions', async () => {
    const root = makeRoot({ lib: '1.0.0' });
    const json = {
      type: 'module',
      exports: {
        '.': './dist/index.js',
        './features/*': { types: './types/features/*.d.ts', import: './dist/features/*.js' },
        './features/internal/*': null,
      },
    };
    pkg(root, 'lib', json, {
      'dist/index.js': 'export const x = 1;\n',
      'dist/features/a.js': "export const a = 'A';\n",
      'dist/features/b.js': "export const b = 'B';\n",
      'dist/features/a.test.js': "import 'ghost-test-kit';\n",
      'dist/features/internal/x.js': "export const x = 'X';\n",
      'types/features/a.d.ts': 'export declare const a: string;\n',
    });

    const set = await entrySetOf(root, 'lib', json);
    const keys = [...set.entries.keys()].sort();

    expect(keys).toEqual(['lib', 'lib/features/a', 'lib/features/b']);
  }, 60000);

  it('keeps TypeScript sources a pattern target names explicitly', async () => {
    const root = makeRoot({ lib: '1.0.0' });
    const json = { type: 'module', exports: { './*': './src/*.ts' } };
    pkg(root, 'lib', json, {
      'src/a.ts': "export const a: string = 'A';\n",
      'src/__tests__/a.test.ts': "import 'ghost-test-kit';\n",
    });

    const set = await entrySetOf(root, 'lib', json);

    expect([...set.entries.keys()]).toEqual(['lib/a']);
  }, 60000);
});

describe('UnitProducer — pattern-export package builds', () => {
  async function produce(root: string, warnings: string[]): Promise<ProducedSharedPackage[]> {
    const orig = console.warn;
    console.warn = (...a: unknown[]) => warnings.push(a.join(' '));
    try {
      return await new UnitProducer({
        packageRoot: root,
        outputDir: join(root, 'out'),
        consumerSpecifiers: [],
      }).produce((m) => {
        throw new Error(m);
      });
    } finally {
      console.warn = orig;
    }
  }

  it('builds a package whose ./* export covers test files and a UMD requiring an uninstalled package', async () => {
    const root = makeRoot({ kit: '1.0.0' });
    pkg(root, 'kit', KIT_JSON, KIT_FILES);
    const warnings: string[] = [];

    const produced = await produce(root, warnings);

    const kit = produced.find((p) => p.name === 'kit')!;
    expect(kit).toBeDefined();
    expect(kit.entryUnits['kit']).toBeDefined();
    expect(kit.entryUnits['kit/adapter/dist/adapter.mjs']).toBeDefined();
    expect(kit.entryUnits['kit/dist/kit.umd.js']).toBeUndefined();
    expect(Object.keys(kit.entryUnits).some((k) => /__tests__|\/test\/|\/src\//.test(k))).toBe(false);
    expect(
      warnings.some((w) => w.includes('kit/dist/kit.umd.js') && w.includes('ghost-schema') && /excluded/.test(w))
    ).toBe(true);
  }, 120000);
});
