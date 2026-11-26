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
import { UnitOutputChecks } from './support/UnitOutputChecks';

import { UnitProducer, type ProducedSharedPackage } from '../UnitProducer';
import { declaredDependencies } from './support/declaredDependencies';

/**
 * Scenario: no shared package is inlined into another's unit or pack.
 * Every shared-set package — including subpath specifiers such as
 * `react/jsx-runtime` — stays external in unit and pack builds by root
 * package name, and the shared set covers the runtime closure of the
 * shared packages (`closure_enforcement.formation`), so a package the
 * consumer never declares but a shared package depends on is shared too.
 */

const roots: string[] = [];

function write(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function pkg(root: string, name: string, json: object, files: Record<string, string>): void {
  const dir = join(root, 'node_modules', name);
  write(join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0', ...json }));
  for (const [rel, content] of Object.entries(files)) write(join(dir, rel), content);
}

/**
 * host → @s/lib (ESM). @s/lib peers on `cjs-dep` (CJS, with a
 * `cjs-dep/jsx` subpath that requires its own root) and depends on
 * `esm-dep`; it also imports `undeclared-shared`, which it does not
 * declare but the host shares.
 */
function makeRoot(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'unit-producer-closure-')));
  roots.push(root);
  write(
    join(root, 'package.json'),
    JSON.stringify({
      name: 'host',
      version: '0.0.0',
      dependencies: { '@s/lib': '1.0.0', 'undeclared-shared': '1.0.0' },
    })
  );
  pkg(
    root,
    '@s/lib',
    {
      type: 'module',
      sideEffects: false,
      exports: { '.': './dist/index.js' },
      dependencies: { 'esm-dep': '1.0.0' },
      peerDependencies: { 'cjs-dep': '1.0.0' },
    },
    {
      'dist/index.js': [
        "import { jsx } from 'cjs-dep/jsx';",
        "import base from 'cjs-dep';",
        "import { helper } from 'esm-dep';",
        "import { u } from 'undeclared-shared';",
        "export { other } from './other.js';",
        'export const render = () => jsx(base.label, helper(), u);',
        '',
      ].join('\n'),
      'dist/other.js': "export const other = () => 'LIB_OTHER_BODY';\n",
    }
  );
  pkg(
    root,
    'cjs-dep',
    { main: './index.js' },
    {
      'index.js': "module.exports = { label: 'CJS_MAIN_BODY' };\n",
      'jsx.js':
        "const base = require('cjs-dep');\n" +
        'exports.jsx = (...a) => [base.label, ...a];\n',
    }
  );
  pkg(
    root,
    'esm-dep',
    { type: 'module', main: './index.js' },
    { 'index.js': "export const helper = () => 'ESM_DEP_BODY';\n" }
  );
  pkg(
    root,
    'undeclared-shared',
    { type: 'module', main: './index.js' },
    { 'index.js': 'export const u = "UNDECLARED_BODY";\n' }
  );
  return root;
}

async function produce(root: string, out: string): Promise<ProducedSharedPackage[]> {
  return new UnitProducer({
    packageRoot: root,
    outputDir: join(root, out),
    consumerSpecifiers: declaredDependencies(root),
  }).produce((m) => {
    throw new Error(m);
  });
}

function filesOf(root: string, out: string, p: ProducedSharedPackage): string[] {
  const locations = new Set([p.packLocation, ...p.units.map((u) => u.location)]);
  return [...locations]
    .filter((l) => existsSync(join(root, out, l)))
    .map((l) => readFileSync(join(root, out, l), 'utf-8'));
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('UnitProducer — shared closure and externals', () => {
  it('shares the runtime closure of the shared packages', async () => {
    const root = makeRoot();
    const produced = await produce(root, 'out');
    expect(produced.map((p) => p.name).sort()).toEqual([
      '@s/lib',
      'cjs-dep',
      'esm-dep',
      'undeclared-shared',
    ]);
  }, 60000);

  it('keeps every shared package external — root and subpath — in units and pack', async () => {
    const root = makeRoot();
    const produced = await produce(root, 'out');
    const lib = produced.find((p) => p.name === '@s/lib')!;
    for (const text of filesOf(root, 'out', lib)) {
      expect(text).not.toContain('CJS_MAIN_BODY');
      expect(text).not.toContain('ESM_DEP_BODY');
      expect(text).not.toContain('UNDECLARED_BODY');
      expect(text).not.toContain('base.label, ...a');
    }
    const libText = filesOf(root, 'out', lib).join('\n');
    expect(libText).toMatch(/from\s*["']cjs-dep\/jsx["']/);
    expect(libText).toMatch(/from\s*["']cjs-dep["']/);
    expect(libText).toMatch(/from\s*["']esm-dep["']/);
    expect(libText).toMatch(/from\s*["']undeclared-shared["']/);
    expect(lib.requires).toEqual(['cjs-dep', 'esm-dep', 'undeclared-shared']);
  }, 60000);

  it('delivers an imported subpath of a shared package as its own unit, its root kept external', async () => {
    const root = makeRoot();
    const produced = await produce(root, 'out');
    const cjs = produced.find((p) => p.name === 'cjs-dep')!;
    const jsxUnit = cjs.units.find((u) => u.modulePaths.includes('jsx.js'));
    expect(jsxUnit).toBeDefined();
    expect(jsxUnit!.modulePaths).not.toContain('index.js');
    expect(cjs.entryUnits['cjs-dep/jsx']).toBe(jsxUnit!.location);
    expect(cjs.entryUnits['cjs-dep']).toBe(cjs.packLocation);
    const text = readFileSync(join(root, 'out', jsxUnit!.location), 'utf-8');
    expect(text).not.toContain('CJS_MAIN_BODY');
    expect(text).toMatch(/from\s*["']cjs-dep["']/);
    // Mangling identifiers before hashing: the unit now ends in
    // `export{<mangled> as default,<mangled> as jsx}` rather than the
    // old unminified `export var { … }` interop clause.
    expect(text).toMatch(/export\s*\{[^}]*\bjsx\b/);
  }, 60000);

  it('builds a consumer-requested subpath even when no shared package imports it', async () => {
    const root = makeRoot();
    pkg(
      root,
      'esm-dep',
      { type: 'module', main: './index.js' },
      {
        'index.js': "export const helper = () => 'ESM_DEP_BODY';\n",
        'extra.js': "export const extra = () => 'EXTRA';\n",
      }
    );
    const produced = await new UnitProducer({
      packageRoot: root,
      outputDir: join(root, 'out'),
      consumerSpecifiers: ['esm-dep/extra'],
    }).produce((m) => {
      throw new Error(m);
    });
    const esm = produced.find((p) => p.name === 'esm-dep')!;
    // A consumer-requested deep import is delivered by a
    // supplementary chunk emitted on its list — outside the shared
    // `units`/`entryUnits` record.
    const extraItem = esm.lists['esm-dep/extra'].items.find((i) =>
      i.answers.includes('esm-dep/extra')
    );
    expect(extraItem).toBeDefined();
    const extraText = readFileSync(join(root, 'out', extraItem!.location), 'utf-8');
    expect(extraText).toContain('EXTRA');
  }, 60000);

  it('does not deliver a package a shared package declares but never imports', async () => {
    const root = makeRoot();
    pkg(root, 'server-only', { main: './index.js' }, { 'index.js': 'module.exports = 1;\n' });
    const libPkg = join(root, 'node_modules', '@s', 'lib', 'package.json');
    const json = JSON.parse(readFileSync(libPkg, 'utf-8'));
    json.dependencies['server-only'] = '1.0.0';
    writeFileSync(libPkg, JSON.stringify(json));
    const produced = await produce(root, 'out');
    expect(produced.map((p) => p.name)).not.toContain('server-only');
  }, 60000);

  it('rejects excluding a package a shared package imports, naming the importer', async () => {
    const root = makeRoot();
    await expect(
      new UnitProducer({
        packageRoot: root,
        outputDir: join(root, 'out'),
        exclude: ['esm-dep'],
      }).produce((m) => {
        throw new Error(m);
      })
    ).rejects.toThrow(/"esm-dep".*\n?.*"@s\/lib"|"@s\/lib"[\s\S]*"esm-dep"|"esm-dep"[\s\S]*"@s\/lib"/);
  }, 60000);

  it('fails when a shared package imports a package that is not installed, naming both', async () => {
    const root = makeRoot();
    write(
      join(root, 'node_modules', '@s', 'lib', 'dist', 'other.js'),
      "import 'ghost-pkg';\nexport const other = () => 'LIB_OTHER_BODY';\n"
    );
    await expect(produce(root, 'out')).rejects.toThrow(/@s\/lib[\s\S]*ghost-pkg/);
  }, 60000);

  it('fails when the closure reaches a second version of a shared package by import', async () => {
    const root = makeRoot();
    // @s/lib carries its own nested esm-dep 2.0.0 while the host's
    // undeclared-shared imports the root esm-dep 1.0.0.
    pkg(root, 'undeclared-shared', { type: 'module', main: './index.js', dependencies: { 'esm-dep': '*' } }, {
      'index.js': "import { helper } from 'esm-dep';\nexport const u = helper();\n",
    });
    const nested = join(root, 'node_modules', '@s', 'lib', 'node_modules', 'esm-dep');
    write(join(nested, 'package.json'), JSON.stringify({ name: 'esm-dep', version: '2.0.0', type: 'module', main: './index.js' }));
    write(join(nested, 'index.js'), "export const helper = () => 'NESTED';\n");
    await expect(produce(root, 'out')).rejects.toThrow(/esm-dep[\s\S]*1\.0\.0[\s\S]*2\.0\.0|esm-dep[\s\S]*2\.0\.0[\s\S]*1\.0\.0/);
  }, 60000);

  it('delivers the imported subpaths of a package that has no root entry', async () => {
    const root = makeRoot();
    pkg(
      root,
      'subpath-only',
      { type: 'module', exports: { './a': './dist/a.js', './b': './dist/b.js' } },
      {
        'dist/a.js': "import { b } from './b.js';\nexport const a = () => b();\n",
        'dist/b.js': "export const b = () => 'SUB_B';\n",
      }
    );
    write(
      join(root, 'node_modules', '@s', 'lib', 'dist', 'other.js'),
      "import { a } from 'subpath-only/a';\nexport const other = () => a();\n"
    );
    const produced = await produce(root, 'out');
    const sub = produced.find((p) => p.name === 'subpath-only')!;
    expect(sub).toBeDefined();
    expect(sub.entryUnits['subpath-only/a']).toBeDefined();
    expect(sub.entryUnits['subpath-only']).toBeUndefined();
    expect(sub.units.flatMap((u) => u.modulePaths).sort()).toEqual(['dist/a.js', 'dist/b.js']);
    expect(
      new UnitOutputChecks().check(
        { dir: join(root, 'out'), produced },
        { dir: join(root, 'out'), produced }
      )
    ).toEqual([]);
  }, 60000);

  it('fails when a shared package\'s module is inlined into another\'s pack or unit, naming both', async () => {
    const root = makeRoot();
    // A deep relative import reaches into the sibling shared package
    // `esm-dep` — esbuild would inline it.
    write(
      join(root, 'node_modules', '@s', 'lib', 'dist', 'other.js'),
      "import { helper } from '../../../esm-dep/index.js';\nexport const other = () => helper();\n"
    );
    await expect(produce(root, 'out')).rejects.toThrow(
      /"@s\/lib"[\s\S]*"esm-dep"/
    );
  }, 60000);

  it('passes UnitOutputChecks with subpath units and closure externals', async () => {
    const root = makeRoot();
    const producedA = await produce(root, 'out-a');
    const producedB = await produce(root, 'out-b');
    expect(
      new UnitOutputChecks().check(
        { dir: join(root, 'out-a'), produced: producedA },
        { dir: join(root, 'out-b'), produced: producedB }
      )
    ).toEqual([]);
  }, 60000);
});
