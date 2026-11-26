import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { UnitProducer, type ProducedSharedPackage } from '../UnitProducer';

/**
 * Scenario: a shared package imports bindings from another shared
 * package's nested barrel. The member respell moves each binding to the
 * module defining it; a respell stands only when the unit answering
 * that module exports the name the importer takes from it. A nested
 * barrel's entry chunk holds the modules below it and exports only its
 * own names, so a renamed binding (`export { default as Button }`,
 * `export { Tag as Chip }`) goes back to the barrel specifier it was
 * written with, while a binding the answering unit does export stays on
 * the module.
 */

let root: string;
let produced: ProducedSharedPackage[];

function write(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function pkg(name: string, files: Record<string, string>, extra: object = {}): void {
  const dir = join(root, 'node_modules', name);
  write(
    join(dir, 'package.json'),
    JSON.stringify({ name, version: '1.0.0', type: 'module', sideEffects: false, main: './index.js', ...extra })
  );
  for (const [file, content] of Object.entries(files)) write(join(dir, file), content);
}

/** The text of the unit answering `specifier` of package `name`. */
function unitText(name: string, specifier: string): string {
  const p = produced.find((x) => x.name === name)!;
  return readFileSync(join(root, 'out', p.entryUnits[specifier]), 'utf-8');
}

beforeAll(async () => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'shared-respell-')));
  write(
    join(root, 'package.json'),
    JSON.stringify({
      name: 'host',
      version: '0.0.0',
      dependencies: { app: '1.0.0', kit: '1.0.0', ui: '1.0.0', lib: '1.0.0', shell: '1.0.0' },
    })
  );
  pkg('ui', {
    'index.js': "export * from './components/index.js';\n",
    'components/index.js':
      "export * from './Button/index.js';\nexport * from './Tag/index.js';\nexport { Plain } from './Plain.js';\n",
    'components/Button/index.js': "export { default as Button } from './Button.js';\n",
    'components/Button/Button.js': 'export default function Button() { return "button"; }\n',
    'components/Tag/index.js': "export { Tag as Chip } from './Tag.js';\n",
    'components/Tag/Tag.js': 'export function Tag() { return "tag"; }\n',
    'components/Plain.js': 'export function Plain() { return "plain"; }\n',
  });
  pkg(
    'app',
    {
      'index.js':
        "import { Button, Chip, Plain } from 'ui';\nexport const App = () => [Button(), Chip(), Plain()];\n",
    },
    { dependencies: { ui: '1.0.0' } }
  );
  pkg(
    'kit',
    {
      'index.js':
        "import { Button } from 'ui/components/index.js';\nexport const Kit = () => Button();\n",
    },
    { dependencies: { ui: '1.0.0' } }
  );
  // A renamed binding whose defining module is an entry of its own: the
  // unit answering the module exports the defining name, so the respell
  // stands.
  pkg(
    'lib',
    {
      'index.js': "export { default as Widget } from './Widget.js';\n",
      'Widget.js': 'export default function Widget() { return "widget"; }\n',
    },
    { main: undefined, exports: { '.': './index.js', './Widget.js': './Widget.js' } }
  );
  pkg(
    'shell',
    { 'index.js': "import { Widget } from 'lib';\nexport const Shell = () => Widget();\n" },
    { dependencies: { lib: '1.0.0' } }
  );
  produced = await new UnitProducer({
    packageRoot: root,
    outputDir: join(root, 'out'),
    consumerSpecifiers: ['app', 'kit', 'shell'],
  }).produce((message) => {
    throw new Error(message);
  });
}, 120_000);

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('a shared package importing another shared package nested barrel', () => {
  it('keeps the barrel specifier for a renamed binding the answering unit does not export', () => {
    const text = unitText('app', 'app');
    expect(text).toMatch(/from\s*["']ui["']/);
    expect(text).not.toContain('ui/components/Button/Button.js');
    expect(text).not.toContain('ui/components/Tag/Tag.js');
  });

  it('keeps the barrel specifier for a deep import of the nested barrel too', () => {
    const text = unitText('kit', 'kit');
    expect(text).not.toContain('ui/components/Button/Button.js');
    expect(text).toMatch(/from\s*["']ui(\/components\/index\.js)?["']/);
  });

  it('leaves a binding the answering unit exports on its defining module', () => {
    const text = unitText('app', 'app');
    expect(text).toContain('ui/components/Plain.js');
  });

  it('keeps a renamed binding on its defining module when that unit exports the defining name', () => {
    const lib = produced.find((p) => p.name === 'lib')!;
    const answering = lib.units.find((u) => u.location === lib.entryUnits['lib/Widget.js']);
    expect(answering?.exports).toContain('default');
    expect(unitText('shell', 'shell')).toContain('lib/Widget.js');
  });

  it('answers every import of the importer with a unit exporting the imported name', () => {
    const ui = produced.find((p) => p.name === 'ui')!;
    const answering = ui.units.find((u) => u.location === ui.entryUnits['ui']);
    expect(answering?.exports).toEqual(expect.arrayContaining(['Button', 'Chip', 'Plain']));
    const app = produced.find((p) => p.name === 'app')!;
    expect(app.requires).toContain('ui');
    expect(Object.keys(app.lists)).toContain('app');
    expect(Object.keys(ui.lists)).toContain('ui');
  });

  it('turns the respell back the same way when the package is served from the build cache', async () => {
    const cacheDir = join(root, 'cache');
    const run = async (out: string) => {
      const producer = new UnitProducer({
        packageRoot: root,
        outputDir: join(root, out),
        consumerSpecifiers: ['app', 'kit', 'shell'],
        cacheDir,
      });
      const result = await producer.produce((message) => {
        throw new Error(message);
      });
      return { result, outcomes: producer.cacheOutcomes().packages };
    };
    const cold = await run('out-cold');
    const warm = await run('out-warm');
    expect(cold.outcomes.every((p) => p.outcome === 'miss')).toBe(true);
    expect(warm.outcomes.every((p) => p.outcome === 'hit')).toBe(true);
    const textOf = (out: string, run: ProducedSharedPackage[]): string => {
      const app = run.find((p) => p.name === 'app')!;
      return readFileSync(join(root, out, app.entryUnits['app']), 'utf-8');
    };
    expect(textOf('out-warm', warm.result)).toBe(textOf('out-cold', cold.result));
    expect(textOf('out-warm', warm.result)).toMatch(/from\s*["']ui["']/);
  }, 120_000);
});
