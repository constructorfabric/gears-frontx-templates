import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BarrelImportRewriter } from '../BarrelImportRewriter';
import { ConsumerBarrelResolver } from '../ConsumerBarrelResolver';
import { ConsumerBarrelRewriteLedger } from '../ConsumerBarrelRewriteLedger';
import { ConsumerBarrelRewriteTransform } from '../ConsumerBarrelRewriteTransform';
import { ConsumerBarrelFallback } from '../ConsumerBarrelFallback';
import { ModuleLinkageScanner } from '../ModuleLinkageScanner';

/**
 * Scenario: module linkage is read by a real ECMAScript parser, never by
 * scanning text. Comment markers inside strings, template literals with
 * substitutions and nested backticks, regular-expression literals holding
 * quotes or comment markers, export clauses placed after the code they
 * export, and directive prologues all leave the linkage exactly as the
 * language defines it.
 */

const scanner = new ModuleLinkageScanner();

describe('ModuleLinkageScanner — parsed, not scanned', () => {
  it('reads re-exports around strings holding `//` and `/*`', () => {
    const linkage = scanner.scan(
      [
        "export { a } from './a.js';",
        'const url = "http://example.test/*";',
        "const other = '/* not a comment';",
        "export { b } from './b.js';",
        '',
      ].join('\n')
    );
    expect([...linkage.reExports.keys()].sort()).toEqual(['a', 'b']);
    expect(linkage.reExports.get('b')).toEqual({ from: './b.js', name: 'b' });
    expect(linkage.isPure).toBe(false);
  });

  it('reads re-exports after template literals with substitutions and nested backticks', () => {
    const linkage = scanner.scan(
      [
        'const t = `a ${`b ${"}"}`} c // d` + "`";',
        "export { c } from './c.js';",
        '',
      ].join('\n')
    );
    expect(linkage.reExports.get('c')).toEqual({ from: './c.js', name: 'c' });
  });

  it('reads re-exports after regular-expression literals holding quotes and comment markers', () => {
    const linkage = scanner.scan(
      [
        "const quote = /['\"`]/g;",
        'const slashes = /\\/\\/|\\/\\*/;',
        "export { d } from './d.js';",
        '',
      ].join('\n')
    );
    expect(linkage.reExports.get('d')).toEqual({ from: './d.js', name: 'd' });
  });

  it('maps a trailing export clause to imports declared after it (imports hoist)', () => {
    const linkage = scanner.scan(
      [
        'export { a as b, local as renamed, f };',
        "import { a } from './a.js';",
        'const local = 1;',
        'function f() { return "}"; }',
        '',
      ].join('\n')
    );
    expect(linkage.reExports.get('b')).toEqual({ from: './a.js', name: 'a' });
    expect([...linkage.ownExports].sort()).toEqual(['f', 'renamed']);
  });

  it('treats a `"use strict"` prologue and a license banner as pure linkage', () => {
    const linkage = scanner.scan(
      [
        '"use strict";',
        "'use client';",
        '/** @license x - ISC */',
        "export { e } from './e.js';",
        "export * from './star.js';",
        '',
      ].join('\n')
    );
    expect(linkage.isPure).toBe(true);
    expect(linkage.reExports.get('e')).toEqual({ from: './e.js', name: 'e' });
    expect(linkage.starExports).toEqual(['./star.js']);
  });

  it('keeps type-only declarations pure and records a default export only as `default`', () => {
    const ts = scanner.scan(
      [
        "import type { T } from './t';",
        "export type { U } from './u';",
        'export interface I { x: string }',
        'export type A = { y: number };',
        "export { type V, w } from './w';",
        '',
      ].join('\n'),
      'barrel.ts'
    );
    expect(ts.isPure).toBe(true);
    expect([...ts.reExports.keys()]).toEqual(['w']);
    const js = scanner.scan('export default function named() {}\n');
    expect([...js.ownExports]).toEqual(['default']);
    expect(js.isPure).toBe(false);
  });

  it('marks an unparseable module impure with no linkage', () => {
    const linkage = scanner.scan("export { a } from './a.js'\nconst = ;\n");
    expect(linkage.isPure).toBe(false);
    expect(linkage.reExports.size).toBe(0);
  });
});

describe('BarrelImportRewriter — statements located by the parser', () => {
  const toIcons = (specifier: string, name: string) =>
    specifier === 'icons' ? { specifier: `icons/dist/${name}.js`, importedName: name } : undefined;

  it('rewrites an import that follows a regex literal holding a quote', () => {
    const out = BarrelImportRewriter.rewrite(
      ['const r = /"/;', "import { Check } from 'icons';", 'r.test(Check);', ''].join('\n'),
      toIcons
    );
    expect(out.rewrites).toBe(1);
    expect(out.code).toContain("import { Check } from 'icons/dist/Check.js';");
  });

  it('leaves import-shaped text inside strings, templates and comments alone', () => {
    const source = [
      "const s = \"import { Check } from 'icons'\";",
      "const t = `${'`'} import { Arrow } from 'icons'`;",
      "// import { Gone } from 'icons';",
      "import { Real } from 'icons';",
      '',
    ].join('\n');
    const out = BarrelImportRewriter.rewrite(source, toIcons);
    expect(out.rewrites).toBe(1);
    expect(out.code).toContain("import { Real } from 'icons/dist/Real.js';");
    expect(out.code).toContain("const s = \"import { Check } from 'icons'\";");
    expect(out.code).toContain("const t = `${'`'} import { Arrow } from 'icons'`;");
    expect(out.code).toContain("// import { Gone } from 'icons';");
  });

  it('parses TSX consumer source', () => {
    const out = BarrelImportRewriter.rewrite(
      [
        "import { Check, type Props } from 'icons';",
        'const El = <div title="// x">{`${1}`}</div>;',
        'export const C = (p: Props) => [El, Check, p];',
        '',
      ].join('\n'),
      toIcons,
      'view.tsx'
    );
    expect(out.code).toContain("import { Check } from 'icons/dist/Check.js';");
    expect(out.code).toContain("import { type Props } from 'icons';");
  });
});

describe('ConsumerBarrelRewriteTransform — imports found by the parser', () => {
  let root = '';
  beforeAll(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'linkage-parsing-')));
    const dir = join(root, 'node_modules', 'icons');
    mkdirSync(join(dir, 'dist'), { recursive: true });
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'consumer', version: '0.0.0', dependencies: { icons: '1.0.0' } }));
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'icons', version: '1.0.0', type: 'module', sideEffects: false, exports: { '.': './dist/index.js' } })
    );
    writeFileSync(join(dir, 'dist', 'index.js'), "export { Check } from './Check.js';\n");
    writeFileSync(join(dir, 'dist', 'Check.js'), 'export const Check = 1;\n');
  });
  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('sees a namespace import placed after a regex literal holding a quote', async () => {
    const resolver = new ConsumerBarrelResolver({
      packageRoot: root,
      isShared: (name) => name === 'icons',
    });
    const ledger = new ConsumerBarrelRewriteLedger();
    await new ConsumerBarrelRewriteTransform({ resolver, ledger }).transform(
      ["const r = /'/;", "import * as I from 'icons';", 'r.test(I);', ''].join('\n'),
      'view.ts'
    );
    expect(ledger.packages()).toEqual([
      {
        name: 'icons',
        mode: 'kept',
        rewrites: 0,
        keptReasons: ['namespace import of "icons" evaluates the barrel'],
      },
    ]);
  });
});

describe('ConsumerBarrelFallback.revert — emitted chunks parsed', () => {
  it('turns a minified import after a regex literal back to the barrel', () => {
    const ledger = new ConsumerBarrelRewriteLedger();
    ledger.recordRewrite({
      packageName: 'icons',
      specifier: 'icons/dist/check.js',
      importedName: 'Check',
      modulePath: 'dist/check.js',
      barrelSpecifier: 'icons',
      barrelName: 'Check',
    });
    const { code, reverts } = ConsumerBarrelFallback.revert(
      'const r=/"/;import{Check as c}from"icons/dist/check.js";r.test(c);',
      new Set(['icons/dist/check.js']),
      ledger
    );
    expect(reverts).toBe(1);
    expect(code).toBe('const r=/"/;import { Check as c } from "icons";r.test(c);');
  });
});
