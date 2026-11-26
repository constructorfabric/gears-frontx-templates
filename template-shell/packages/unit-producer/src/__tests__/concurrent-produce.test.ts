import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { UnitOutputChecks } from './support/UnitOutputChecks';

import { ManifestListBuilder } from '../ManifestListBuilder';
import { UnitProducer } from '../UnitProducer';
import { declaredDependencies } from './support/declaredDependencies';

/**
 * Scenario: concurrent builds — parallel MFE builds share the same
 * emitted `dist/shared` output root. Two `produce()` calls writing the
 * same content-addressed files must not collide on self-emitted
 * intermediates (the `.pack.js` / `.entry-*` files esbuild writes and
 * the producer then renames): each build stages its intermediates
 * privately and publishes content-named files atomically, so no build
 * ever reads or renames a file a concurrent build moved (ENOENT), and
 * the output is identical to a solo build's.
 */

const roots: string[] = [];

function tmp(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'unit-producer-par-')));
  roots.push(dir);
  return dir;
}

function write(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function makeRoot(): string {
  const root = tmp();
  write(
    join(root, 'package.json'),
    JSON.stringify({
      name: 'consumer',
      version: '0.0.0',
      dependencies: { '@s/esm-pkg': '1.0.0', 'cjs-pkg': '1.0.0' },
    })
  );
  write(
    join(root, 'node_modules', '@s', 'esm-pkg', 'package.json'),
    JSON.stringify({
      name: '@s/esm-pkg',
      version: '1.0.0',
      type: 'module',
      sideEffects: false,
      main: './index.js',
    })
  );
  const esmDir = join(root, 'node_modules', '@s', 'esm-pkg');
  write(join(esmDir, 'index.js'), "export * from './a.js';\nexport * from './b.js';\n");
  write(join(esmDir, 'a.js'), "export const a = () => 'a';\n");
  write(join(esmDir, 'b.js'), "export const b = () => 'b';\n");
  write(
    join(root, 'node_modules', 'cjs-pkg', 'package.json'),
    JSON.stringify({ name: 'cjs-pkg', version: '1.0.0', main: './index.cjs' })
  );
  write(
    join(root, 'node_modules', 'cjs-pkg', 'index.cjs'),
    "module.exports = { answer: () => 42 };\n"
  );
  return root;
}

function produce(root: string, outputDir: string) {
  return new UnitProducer({
    packageRoot: root,
    outputDir,
    consumerSpecifiers: declaredDependencies(root),
  }).produce((m) => {
    throw new Error(m);
  });
}

function sortedFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(full.slice(dir.length + 1));
    }
  };
  walk(dir);
  return out.sort();
}

afterEach(() => {
  while (roots.length > 0) {
    rmSync(roots.pop()!, { recursive: true, force: true });
  }
});

describe('UnitProducer — concurrent produce()', () => {
  it('two concurrent builds into separate outputs both succeed identically', async () => {
    const root = makeRoot();
    const outA = join(root, 'out-a');
    const outB = join(root, 'out-b');
    const [a, b] = await Promise.all([
      produce(root, outA),
      produce(root, outB),
    ]);
    expect(a.length).toBe(b.length);
    // The manifest a build would record: the unit table and the lists
    // derived from each package's produced lists.
    const roots: Record<string, (typeof a)[number]['lists'][string]> = {};
    for (const pkg of a) {
      for (const [spec, list] of Object.entries(pkg.lists)) roots[`${pkg.name}:${spec}`] = list;
    }
    expect(Object.keys(roots).length).toBeGreaterThan(0);
    const manifest = ManifestListBuilder.build(roots, (m) => {
      throw new Error(m);
    });
    const violations = new UnitOutputChecks().checkAll(
      [
        { dir: outA, produced: a },
        { dir: outB, produced: b },
      ],
      manifest
    );
    expect(violations).toEqual([]);
  }, 60000);

  it('two concurrent builds into the same output root do not collide', async () => {
    const root = makeRoot();
    const shared = join(root, 'out-shared');
    await Promise.all([produce(root, shared), produce(root, shared)]);

    // No intermediate or staging file is left behind.
    for (const file of sortedFiles(shared)) {
      expect(file).not.toMatch(/\.pack\.js$|\.entry-|\.unit-|staging/);
    }

    // The shared output equals a solo build's, byte for byte.
    const solo = join(root, 'out-solo');
    const soloProduced = await produce(root, solo);
    const violations = new UnitOutputChecks().checkAll([
      { dir: shared, produced: soloProduced },
      { dir: solo, produced: soloProduced },
    ]);
    expect(violations).toEqual([]);
  }, 60000);
});
