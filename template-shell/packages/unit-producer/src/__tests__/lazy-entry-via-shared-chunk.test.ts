import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { ManifestListBuilder } from '../ManifestListBuilder';
import { UnitProducer } from '../UnitProducer';

/**
 * A package with two entries, where a shared internal chunk lazily
 * imports the second entry and that entry imports a helper back from
 * the shared chunk. The entry reaches the shared chunk through its
 * unhashed alias spelling; the alias is a unit of the parent list, so
 * the lazy list's completeness check accepts it and the build passes.
 */
const roots: string[] = [];

function write(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function makeRoot(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'unit-producer-lazyentry-')));
  roots.push(root);
  write(join(root, 'package.json'), JSON.stringify({ name: 'host', version: '0.0.0', dependencies: { kit: '1.0.0' } }));
  const dir = join(root, 'node_modules', 'kit');
  write(
    join(dir, 'package.json'),
    JSON.stringify({
      name: 'kit',
      version: '1.0.0',
      type: 'module',
      exports: { '.': './dist/index.js', './feature': './dist/feature.js' },
    })
  );
  write(
    join(dir, 'dist/index.js'),
    "import { helper, loadFeature } from '../src/core.js';\nexport { helper, loadFeature };\n"
  );
  write(
    join(dir, 'src/core.js'),
    `export const pad = '${'c'.repeat(300)}';\nexport const helper = () => pad.length;\nexport const loadFeature = () => import('../dist/feature.js');\n`
  );
  write(
    join(dir, 'dist/feature.js'),
    "import { helper } from '../src/core.js';\nexport const feature = () => helper() + 1;\n"
  );
  return root;
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('UnitProducer — a second entry lazily imported by a shared chunk', () => {
  it('builds: the entry reaches the shared chunk through an alias the parent list holds', async () => {
    const root = makeRoot();
    const produced = await new UnitProducer({
      packageRoot: root,
      outputDir: join(root, 'out'),
      consumerSpecifiers: ['kit'],
    }).produce((m) => {
      throw new Error(m);
    });
    const kit = produced.find((p) => p.name === 'kit')!;
    const list = kit.lists['kit'];
    expect(Object.keys(list.lazy ?? {}).length).toBeGreaterThan(0);
    const manifest = ManifestListBuilder.build({ './lifecycle': list }, (m) => {
      throw new Error(m);
    });
    expect(manifest.units.length).toBeGreaterThan(0);
  }, 60_000);
});

describe('UnitProducer — list completeness reads import statements, not text', () => {
  it('builds a chunk carrying an import-like string literal', async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'unit-producer-strlit-')));
    roots.push(root);
    write(join(root, 'package.json'), JSON.stringify({ name: 'host', version: '0.0.0', dependencies: { doc: '1.0.0' } }));
    const dir = join(root, 'node_modules', 'doc');
    write(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'doc', version: '1.0.0', type: 'module', exports: { '.': './index.js' } })
    );
    write(join(dir, 'index.js'), "export const example = \"import './x.js'\";\n");
    const produced = await new UnitProducer({
      packageRoot: root,
      outputDir: join(root, 'out'),
      consumerSpecifiers: ['doc'],
    }).produce((m) => {
      throw new Error(m);
    });
    expect(produced.find((p) => p.name === 'doc')?.lists['doc']).toBeDefined();
  }, 60_000);
});
