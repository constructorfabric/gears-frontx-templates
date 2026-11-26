import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ConsumerBarrelFallback } from '../ConsumerBarrelFallback';
import { ConsumerBarrelResolver } from '../ConsumerBarrelResolver';
import { ConsumerBarrelRewriteLedger } from '../ConsumerBarrelRewriteLedger';
import { ConsumerBarrelRewriteTransform } from '../ConsumerBarrelRewriteTransform';
import { UnitProducer, type ProducedSharedPackage } from '../UnitProducer';

/**
 * Scenario: the consumer half of barrel handling. A consumer build
 * rewrites named (and default) imports from a side-effect-free shared
 * package's barrel to the module that defines each binding, so only the
 * units defining used bindings become roots. Namespace imports, explicit
 * side-effect imports, excluded packages and packages without declared
 * side-effect freedom are evaluated through the barrel and reported as
 * bypassed. After production, a rewritten import no unit answers falls
 * back to the barrel.
 */

let root: string;

function write(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function pkg(name: string, json: object, files: Record<string, string>): void {
  const dir = join(root, 'node_modules', name);
  write(join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0', ...json }));
  for (const [rel, content] of Object.entries(files)) write(join(dir, rel), content);
}

const ESM = { type: 'module', sideEffects: false, exports: { '.': './dist/index.js' } };

beforeAll(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'consumer-barrel-')));
  write(
    join(root, 'package.json'),
    JSON.stringify({
      name: 'consumer',
      version: '0.0.0',
      dependencies: {
        'barrel-pkg': '1.0.0',
        'alias-pkg': '1.0.0',
        'effects-pkg': '1.0.0',
        'excluded-pkg': '1.0.0',
        'cjs-pkg': '1.0.0',
        'mixed-pkg': '1.0.0',
      },
    })
  );
  pkg('barrel-pkg', ESM, {
    'dist/index.js': [
      "export { Icon } from './icons/index.js';",
      "export * from './utils.js';",
      "export { default } from './def.js';",
      "export { Thing as Renamed } from './thing.js';",
      '',
    ].join('\n'),
    // Re-export chain: barrel → sub-barrel → defining module.
    'dist/icons/index.js': "export { Icon } from './icon.js';\n",
    'dist/icons/icon.js': "import { util } from '../utils.js';\nexport const Icon = () => util('ICON_BODY');\n",
    'dist/utils.js': "export function util(x) { return x + 'UTIL_BODY'; }\n",
    'dist/def.js': "export default function D() { return 'DEF_BODY'; }\n",
    'dist/thing.js': "export const Thing = 'THING_BODY';\n",
  });
  pkg('alias-pkg', ESM, {
    'dist/index.js': "export { Thing as default } from './thing.js';\n",
    'dist/thing.js': "export const Thing = 'ALIAS_THING';\n",
  });
  pkg('effects-pkg', { type: 'module', exports: { '.': './dist/index.js' } }, {
    'dist/index.js': "export { A } from './a.js';\n",
    'dist/a.js': 'export const A = 1;\n',
  });
  pkg('excluded-pkg', ESM, {
    'dist/index.js': "export { B } from './b.js';\n",
    'dist/b.js': 'export const B = 1;\n',
  });
  pkg('cjs-pkg', { main: './index.js', sideEffects: false }, {
    'index.js': 'module.exports = { C: 1 };\n',
  });
  pkg('mixed-pkg', ESM, {
    'dist/index.js': "export { M } from './m.js';\nexport const own = 1;\n",
    'dist/m.js': 'export const M = 1;\n',
  });
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function makeTransform(): {
  transform: ConsumerBarrelRewriteTransform;
  ledger: ConsumerBarrelRewriteLedger;
} {
  const ledger = new ConsumerBarrelRewriteLedger();
  const resolver = new ConsumerBarrelResolver({
    packageRoot: root,
    isShared: (name) =>
      ['barrel-pkg', 'alias-pkg', 'effects-pkg', 'excluded-pkg', 'cjs-pkg', 'mixed-pkg'].includes(name),
    exclude: ['excluded-pkg'],
  });
  return { transform: new ConsumerBarrelRewriteTransform({ resolver, ledger }), ledger };
}

describe('ConsumerBarrelRewriteTransform — named, default, namespace, re-export chains', () => {
  it('rewrites named imports to the defining modules, following re-export chains', async () => {
    const { transform, ledger } = makeTransform();
    const out = await transform.transform("import { Icon, util } from 'barrel-pkg';\nIcon(util);\n");
    expect(out?.code).toContain("import { Icon } from 'barrel-pkg/dist/icons/icon.js';");
    expect(out?.code).toContain("import { util } from 'barrel-pkg/dist/utils.js';");
    expect(out?.code).not.toMatch(/from 'barrel-pkg';/);
    expect(ledger.packages()).toEqual([
      { name: 'barrel-pkg', mode: 'rewritten', rewrites: 2, keptReasons: [] },
    ]);
    expect(ledger.targets().sort()).toEqual(['barrel-pkg/dist/icons/icon.js', 'barrel-pkg/dist/utils.js']);
  });

  it('rewrites a default import and an aliased named import', async () => {
    const { transform } = makeTransform();
    const out = await transform.transform(
      "import D, { Renamed as R } from 'barrel-pkg';\nimport X from 'alias-pkg';\nD(R, X);\n"
    );
    expect(out?.code).toContain("import D from 'barrel-pkg/dist/def.js';");
    expect(out?.code).toContain("import { Thing as R } from 'barrel-pkg/dist/thing.js';");
    // A barrel default that is a named export of its defining module.
    expect(out?.code).toContain("import { Thing as X } from 'alias-pkg/dist/thing.js';");
  });

  it('rewrites re-exports from a barrel', async () => {
    const { transform } = makeTransform();
    const out = await transform.transform("export { Icon as AppIcon } from 'barrel-pkg';\n");
    expect(out?.code).toContain("export { Icon as AppIcon } from 'barrel-pkg/dist/icons/icon.js';");
  });

  it('rewrites a namespace import read only through static member accesses', async () => {
    const { transform, ledger } = makeTransform();
    const out = await transform.transform(
      "import * as NS from 'barrel-pkg';\nNS.Icon();\nNS.util('x');\n"
    );
    // `Icon`/`util` read as bound (member-property identifiers), so
    // the members land under collision-free `NS_*` aliases.
    expect(out?.code).toContain("import { Icon as NS_Icon } from 'barrel-pkg/dist/icons/icon.js';");
    expect(out?.code).toContain("import { util as NS_util } from 'barrel-pkg/dist/utils.js';");
    expect(out?.code).not.toContain('import * as NS');
    expect(out?.code).toContain('NS_Icon();');
    expect(out?.code).toContain("NS_util('x');");
    const [record] = ledger.packages();
    expect(record.name).toBe('barrel-pkg');
    expect(record.mode).toBe('rewritten');
    expect(record.rewrites).toBe(2);
  });

  it('leaves a namespace import as written when the namespace is also used in JSX', async () => {
    const { transform } = makeTransform();
    const out = await transform.transform(
      "import * as NS from 'barrel-pkg';\nNS.util('x');\nconst el = <NS.Icon />;\n",
      '/src/view.jsx'
    );
    expect(out?.code ?? null).toBeNull();
  });

  it('keeps the default binding of a combined default and namespace import', async () => {
    const { transform } = makeTransform();
    const out = await transform.transform(
      "import D, * as NS from 'barrel-pkg';\nNS.util('x');\nD();\n"
    );
    expect(out?.code).toContain("import { util as NS_util } from 'barrel-pkg/dist/utils.js';");
    // The kept default binding then takes the named-binding rewrite.
    expect(out?.code).toMatch(/import D from 'barrel-pkg(\/[^']*)?';/);
    expect(out?.code).toContain('D();');
  });

  it.each([
    ['passed whole', 'take(NS);'],
    ['assigned through', 'NS.Icon = 1;'],
    ['deleted through', 'delete NS.Icon;'],
    ['updated through', 'NS.Icon++;'],
    ['read computed', 'NS[name]();'],
    ['destructured', 'const { Icon } = NS;'],
  ])(
    'falls back to the barrel for a namespace %s and reports the bypass',
    async (_label, statement) => {
      const { transform, ledger } = makeTransform();
      const out = await transform.transform(
        `import * as NS from 'barrel-pkg';\n${statement}\n`
      );
      expect(out).toBeNull();
      const [record] = ledger.packages();
      expect(record.name).toBe('barrel-pkg');
      expect(record.mode).toBe('kept');
      expect(record.keptReasons.join(' ')).toMatch(/namespace import/);
    }
  );

  it('never rewrites an explicit side-effect import of a package that can have JS side effects; it is evaluated and reported', async () => {
    const { transform, ledger } = makeTransform();
    const out = await transform.transform("import 'effects-pkg';\n");
    expect(out).toBeNull();
    expect(ledger.packages()[0].mode).toBe('kept');
    expect(ledger.packages()[0].keptReasons.length).toBeGreaterThan(0);
  });

  it('prunes an explicit side-effect import whose package declares only asset (or no) side effects', async () => {
    const { transform, ledger } = makeTransform();
    // `barrel-pkg` declares `sideEffects: false`: `import 'barrel-pkg'`
    // can have no JS effect, so the statement is dropped instead of
    // naming the package a reachability root.
    const out = await transform.transform("import 'barrel-pkg';\nkeep();\n");
    expect(out?.code).toBe('keep();\n');
    expect(ledger.packages()[0].mode).toBe('not-needed');
  });

  it('leaves type-only imports untouched', async () => {
    const { transform, ledger } = makeTransform();
    const source = "import type { Icon } from 'barrel-pkg';\nimport { type util } from 'barrel-pkg';\n";
    expect(await transform.transform(source)).toBeNull();
    expect(ledger.packages()).toEqual([]);
  });

  it('bypasses excluded packages and packages without declared side-effect freedom', async () => {
    const { transform, ledger } = makeTransform();
    const out = await transform.transform(
      "import { A } from 'effects-pkg';\nimport { B } from 'excluded-pkg';\nA(B);\n"
    );
    expect(out).toBeNull();
    const byName = new Map(ledger.packages().map((p) => [p.name, p]));
    expect(byName.get('effects-pkg')?.keptReasons).toEqual(['package does not declare side-effect freedom']);
    expect(byName.get('excluded-pkg')?.keptReasons).toEqual(['package excluded from barrel rewriting']);
  });

  it('reports a barrel entry with its own statements as bypassed, and a non-barrel entry as not needing a rewrite', async () => {
    const { transform, ledger } = makeTransform();
    const out = await transform.transform(
      "import { M } from 'mixed-pkg';\nimport { C } from 'cjs-pkg';\nM(C);\n"
    );
    expect(out).toBeNull();
    const byName = new Map(ledger.packages().map((p) => [p.name, p]));
    expect(byName.get('mixed-pkg')?.mode).toBe('kept');
    expect(byName.get('mixed-pkg')?.keptReasons.join(' ')).toMatch(/own statements/);
    expect(byName.get('cjs-pkg')).toEqual({ name: 'cjs-pkg', mode: 'not-needed', rewrites: 0, keptReasons: [] });
  });

  it('ignores packages outside the shared set and relative imports', async () => {
    const { transform, ledger } = makeTransform();
    expect(await transform.transform("import { x } from './local';\nimport { y } from 'not-shared';\n")).toBeNull();
    expect(ledger.packages()).toEqual([]);
  });

  it('only transforms the consumer\'s own modules', () => {
    expect(ConsumerBarrelRewriteTransform.isConsumerModule('/app/src/App.tsx')).toBe(true);
    expect(ConsumerBarrelRewriteTransform.isConsumerModule('/app/node_modules/x/index.js')).toBe(false);
    expect(ConsumerBarrelRewriteTransform.isConsumerModule('/app/src/App.tsx?inline')).toBe(false);
    expect(ConsumerBarrelRewriteTransform.isConsumerModule('\0virtual:x')).toBe(false);
    expect(ConsumerBarrelRewriteTransform.isConsumerModule('/app/src/style.css')).toBe(false);
  });
});

describe('UnitProducer — consumer module specifiers', () => {
  let produced: ProducedSharedPackage[];
  let outDir: string;

  beforeAll(async () => {
    outDir = join(root, 'out');
    produced = await new UnitProducer({
      packageRoot: root,
      outputDir: outDir,
      consumerSpecifiers: ['barrel-pkg/dist/icons/icon.js', 'barrel-pkg/dist/def.js'],
    }).produce((message) => {
      throw new Error(message);
    });
  }, 60_000);

  it('answers a rewritten module specifier with the unit that owns the module, without a separate entry build', () => {
    const barrel = produced.find((p) => p.name === 'barrel-pkg')!;
    expect(barrel.unitMode).toBe('units');
    const iconUnit = barrel.units.find((u) => u.location === barrel.entryUnits['barrel-pkg/dist/icons/icon.js']);
    expect(iconUnit?.modulePaths).toContain('dist/icons/icon.js');
    const defUnit = barrel.units.find((u) => u.location === barrel.entryUnits['barrel-pkg/dist/def.js']);
    expect(defUnit?.modulePaths).toContain('dist/def.js');
    // No unit duplicates a module another unit owns.
    const all = barrel.units.flatMap((u) => u.modulePaths);
    expect(new Set(all).size).toBe(all.length);
  });

  it('keeps a rewritten target that a split package answers, and falls back for one it cannot', () => {
    const ledger = new ConsumerBarrelRewriteLedger();
    ledger.recordRewrite({
      barrelSpecifier: 'barrel-pkg',
      barrelName: 'Icon',
      packageName: 'barrel-pkg',
      specifier: 'barrel-pkg/dist/icons/icon.js',
      importedName: 'Icon',
      modulePath: 'dist/icons/icon.js',
    });
    ledger.recordRewrite({
      barrelSpecifier: 'cjs-pkg',
      barrelName: 'C',
      packageName: 'cjs-pkg',
      specifier: 'cjs-pkg/lib/c.js',
      importedName: 'C',
      modulePath: 'lib/c.js',
    });
    const unanswered = ConsumerBarrelFallback.unanswered(produced, ledger);
    expect([...unanswered.keys()]).toEqual(['cjs-pkg/lib/c.js']);

    // Applied to a written build: the chunk file and its imports go back
    // to the barrel, the kept rewrite stays, and the report says why.
    const dist = join(root, 'dist-apply');
    write(
      join(dist, 'entry.js'),
      'import{Icon as i}from"barrel-pkg/dist/icons/icon.js";import{C as c}from"cjs-pkg/lib/c.js";i(c);'
    );
    const chunk = { fileName: 'entry.js', imports: ['barrel-pkg/dist/icons/icon.js', 'cjs-pkg/lib/c.js'] };
    ConsumerBarrelFallback.apply({ produced, ledger, outDir: dist, chunks: [chunk] });
    expect(chunk.imports).toEqual(['barrel-pkg/dist/icons/icon.js', 'cjs-pkg']);
    const code = readFileSync(join(dist, 'entry.js'), 'utf-8');
    expect(code).toContain('import{Icon as i}from"barrel-pkg/dist/icons/icon.js";');
    expect(code).toContain('import { C as c } from "cjs-pkg";');
    const cjs = ledger.packages().find((p) => p.name === 'cjs-pkg')!;
    expect(cjs.mode).toBe('kept');
    expect(cjs.rewrites).toBe(0);
    expect(cjs.keptReasons.join(' ')).toMatch(/"cjs-pkg" evaluated: .*delivered as one unit/);
  });
});

describe('ConsumerBarrelFallback.revert — emitted chunk code back to the barrel', () => {
  it('restores the barrel specifier and barrel names in minified and formatted output', () => {
    const ledger = new ConsumerBarrelRewriteLedger();
    for (const [barrelName, importedName] of [
      ['Renamed', 'Thing'],
      ['default', 'D'],
    ] as const) {
      ledger.recordRewrite({
        barrelSpecifier: 'barrel-pkg',
        barrelName,
        packageName: 'barrel-pkg',
        specifier: importedName === 'Thing' ? 'barrel-pkg/dist/thing.js' : 'barrel-pkg/dist/def.js',
        importedName: importedName === 'D' ? 'default' : importedName,
        modulePath: importedName === 'Thing' ? 'dist/thing.js' : 'dist/def.js',
      });
    }
    const code =
      'import{Thing as t}from"barrel-pkg/dist/thing.js";import d from "barrel-pkg/dist/def.js";\n' +
      'import{x}from"other";export{Thing}from"barrel-pkg/dist/thing.js";console.log(t,d,x);';
    const out = ConsumerBarrelFallback.revert(
      code,
      new Set(['barrel-pkg/dist/thing.js', 'barrel-pkg/dist/def.js']),
      ledger
    );
    expect(out.reverts).toBe(3);
    expect(out.code).toContain('import { Renamed as t } from "barrel-pkg";');
    expect(out.code).toContain('import d from "barrel-pkg";');
    expect(out.code).toContain('export { Renamed as Thing } from "barrel-pkg";');
    expect(out.code).toContain('import{x}from"other";');
    expect(out.code).toContain('console.log(t,d,x);');
  });
});
