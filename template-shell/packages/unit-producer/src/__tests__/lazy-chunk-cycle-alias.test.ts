import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { ManifestListBuilder } from '../ManifestListBuilder';
import { UnitProducer } from '../UnitProducer';

/**
 * A lazy chunk of a package that imports helpers from the package's own entry
 * chunk forms an import cycle with it (the entry reaches the lazy chunk
 * through a dynamic import). The entry then names the lazy chunk by an
 * unhashed alias, which the producer publishes: the alias must be resolvable
 * — a lazy list key and a unit of the table — so the package builds and the
 * runtime can mint it.
 */
const roots: string[] = [];

function write(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function makeRoot(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'unit-producer-cyclealias-')));
  roots.push(root);
  write(join(root, 'package.json'), JSON.stringify({ name: 'host', version: '0.0.0', dependencies: { kit: '1.0.0' } }));
  const dir = join(root, 'node_modules', 'kit');
  write(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'kit', version: '1.0.0', type: 'module', exports: { '.': './dist/index.js' } })
  );
  write(
    join(dir, 'dist/index.js'),
    "import {util} from './util.js';\nexport const load = () => import('./feature.js');\nexport {util};\n"
  );
  write(join(dir, 'dist/util.js'), "export const util = () => 'u';\n");
  write(
    join(dir, 'dist/feature.js'),
    `export const pad = '${'x'.repeat(400)}';\nimport {helper} from './helper.js';\nexport const feat = () => helper() + pad.length;\n`
  );
  write(join(dir, 'dist/helper.js'), "import {util} from './util.js';\nexport const helper = () => util() + 'h';\n");
  return root;
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('UnitProducer — a lazy chunk importing helpers from its own entry chunk', () => {
  it('builds, and publishes an alias that is a lazy list key and a unit of the table', async () => {
    const root = makeRoot();
    const out = join(root, 'out');
    const produced = await new UnitProducer({
      packageRoot: root,
      outputDir: out,
      consumerSpecifiers: ['kit'],
    }).produce((m) => {
      throw new Error(m);
    });
    const kit = produced.find((p) => p.name === 'kit')!;
    const list = kit.lists['kit'];
    const keys = Object.keys(list.lazy ?? {});
    const alias = keys.find((k) => !/\.[0-9a-f]{64}\.js$/.test(k));
    expect(alias).toBeDefined();
    expect(keys).toHaveLength(2);
    expect(existsSync(join(out, alias!))).toBe(true);

    const nested = list.lazy![alias!];
    const unit = nested.items.find((i) => i.location === alias);
    expect(unit).toBeDefined();
    const hashed = nested.items.find((i) => i.location !== alias && i.contentHash === unit!.contentHash);
    expect(hashed).toBeDefined();

    // The manifest side holds the alias as a unit and as a list key.
    const manifest = ManifestListBuilder.build({ './lifecycle': list }, (m) => {
      throw new Error(m);
    });
    expect(manifest.units.some((u) => u.location === alias)).toBe(true);
    expect(Object.keys(manifest.lists)).toContain(alias);
  }, 60000);
});
