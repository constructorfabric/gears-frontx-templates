/**
 * Scenario: the host's second unit production after the consumer barrel
 * fallback. A host chunk imports a shared package's nested renamed barrel
 * through a rewritten specifier no unit answers, so the fallback turns it
 * back to the barrel: the units and lists are produced again for what the
 * chunks import now. The re-run covers every change of the imported set
 * (an added barrel specifier, a dropped rewrite), keeps a specifier a
 * chunk still imports dynamically, writes no stale unit, removes only the
 * files its first pass wrote and reports both runs' cache outcomes.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  ConsumerBarrelResolver,
  ConsumerBarrelRewriteLedger,
  ConsumerBarrelRewriteTransform,
  PackageBuildCache,
} from '@gears-frontx/unit-producer';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HostUnitProducer } from '../HostUnitProducer';

const dirs: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function write(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function walk(dir: string, top = dir): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory() ? walk(path.join(dir, e.name), top) : [path.relative(top, path.join(dir, e.name))]
    )
    .sort();
}

/** A consumer of `ui`, whose `Button` sits behind a nested renamed barrel. */
async function setup(options: { otherImportsUi?: boolean; dynamicTarget?: boolean } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'host-reproduce-')));
  dirs.push(root);
  write(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'consumer', version: '0.0.0', dependencies: { ui: '1.0.0' } })
  );
  const ui = path.join(root, 'node_modules', 'ui');
  write(
    path.join(ui, 'package.json'),
    JSON.stringify({ name: 'ui', version: '1.0.0', type: 'module', sideEffects: false, main: './index.js' })
  );
  write(path.join(ui, 'index.js'), "export * from './components/index.js';\n");
  write(path.join(ui, 'components/index.js'), "export * from './Button/index.js';\n");
  write(path.join(ui, 'components/Button/index.js'), "export { default as Button } from './Button.js';\n");
  write(path.join(ui, 'components/Button/Button.js'), 'export default function Button() { return "button"; }\n');

  const ledger = new ConsumerBarrelRewriteLedger();
  const transform = new ConsumerBarrelRewriteTransform({
    resolver: new ConsumerBarrelResolver({ packageRoot: root, isShared: (n: string) => n === 'ui' }),
    ledger,
  });
  const rewritten = (await transform.transform("import { Button } from 'ui';\nButton();\n"))?.code;
  const target = [...ledger.targets()][0];
  expect(rewritten).toContain(target);

  const dist = path.join(root, 'dist');
  write(path.join(dist, 'b.js'), rewritten as string);
  const chunks: Array<{ fileName: string; imports: string[] }> = [{ fileName: 'b.js', imports: [target] }];
  const consumerSpecifiers = [target];
  if (options.otherImportsUi) {
    write(path.join(dist, 'a.js'), "import * as UI from 'ui';\nconsole.log(UI);\n");
    chunks.unshift({ fileName: 'a.js', imports: ['ui'] });
    consumerSpecifiers.unshift('ui');
  }
  const outputDir = path.join(dist, 'shared');
  write(path.join(outputDir, 'keep.txt'), 'not a unit');
  const production = await new HostUnitProducer({
    packageRoot: root,
    outputDir,
    distDir: dist,
    consumerSpecifiers,
    dynamicSpecifiers: options.dynamicTarget ? [target] : [],
    barrelLedger: ledger,
    hostChunks: chunks,
    cacheDir: path.join(root, '.cache'),
  }).produce((message) => {
    throw new Error(message);
  });
  return { root, dist, outputDir, chunks, target, production, consumerSpecifiers };
}

const listKeys = (p: Awaited<ReturnType<typeof setup>>['production']): string[] =>
  (p?.produced ?? []).flatMap((x) => Object.keys(x.lists)).sort();

describe('HostUnitProducer after the consumer barrel fallback', () => {
  it('lists the barrel specifier the reverted chunk imports and leaves non-unit files alone', async () => {
    const { chunks, dist, outputDir, target, production } = await setup();
    expect(chunks[0].imports).toEqual(['ui']);
    expect(fs.readFileSync(path.join(dist, 'b.js'), 'utf-8')).toMatch(/from\s*["']ui["']/);
    expect(listKeys(production)).toEqual(['ui']);
    expect(listKeys(production)).not.toContain(target);
    expect(fs.readFileSync(path.join(outputDir, 'keep.txt'), 'utf-8')).toBe('not a unit');
  });

  it('writes no unit for a dropped rewrite when another chunk already imports the barrel', async () => {
    const { chunks, production, target } = await setup({ otherImportsUi: true });
    expect(chunks.map((c) => c.imports)).toEqual([['ui'], ['ui']]);
    expect(listKeys(production)).toEqual(['ui']);
    expect(listKeys(production)).not.toContain(target);
  });

  it('keeps a dropped specifier a chunk still imports dynamically', async () => {
    const { production, target } = await setup({ otherImportsUi: true, dynamicTarget: true });
    expect(listKeys(production)).toEqual(['ui', target].sort());
  });

  it('removes only what the first pass wrote', async () => {
    const { outputDir, production } = await setup({ otherImportsUi: true });
    const listed = new Set(
      (production?.produced ?? []).flatMap((p) =>
        Object.values(p.lists).flatMap((l) => l.items.map((i) => i.location))
      )
    );
    // Beside the file that was never a unit, only the second production's
    // units remain: nothing the first one wrote for the dropped rewrite.
    expect(walk(outputDir)).toEqual(['keep.txt', ...listed].sort());
  });

  it('reports the cache outcomes of both productions', async () => {
    const { production } = await setup({ otherImportsUi: true });
    expect(production?.cache.packages.map((p) => p.name)).toEqual(['ui']);
    expect(production?.cache.misses).toBe(1);
    expect(production?.cache.hits).toBe(0);
  });

  it('fingerprints each package directory once across the two productions', async () => {
    const read = vi.spyOn(PackageBuildCache, 'fileDigests');
    const { production } = await setup({ otherImportsUi: true });
    expect(production?.cache.packages.length).toBeGreaterThan(0);
    const dirs = read.mock.calls.map(([dir]) => dir);
    expect(dirs.length).toBeGreaterThan(0);
    expect(new Set(dirs).size).toBe(dirs.length);
  });
});
