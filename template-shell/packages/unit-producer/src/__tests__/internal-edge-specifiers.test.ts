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

import { UnitProducer, type ProducedSharedPackage } from '../UnitProducer';
import { declaredDependencies } from './support/declaredDependencies';

/**
 * Regression: an emitted item's relative specifiers must
 * resolve — against the item's own `location` — to an emitted item,
 * lazy target or pattern file of the same list. Item locations are
 * flat content-named files under `<pkg>@<version>/`, so an internal
 * chunk reference must carry the target's content-named basename
 * (`./<namePath>.<contentHash>.js`); anything else stays a native
 * relative import the blob realm cannot resolve and the boot dies.
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

/** Two entries sharing one module — esbuild splitting emits a shared chunk. */
function makeRoot(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'unit-producer-ie-')));
  roots.push(root);
  write(
    join(root, 'package.json'),
    JSON.stringify({ name: 'host', version: '0.0.0', dependencies: { 'split-lib': '1.0.0' } })
  );
  pkg(
    root,
    'split-lib',
    {
      type: 'module',
      sideEffects: false,
      exports: { '.': './dist/index.js', './feature': './dist/feature.js' },
    },
    {
      'dist/index.js':
        "import { shared } from './shared.js';\nexport const index = () => shared('INDEX');\n",
      'dist/feature.js':
        "import { shared } from './shared.js';\nexport const feature = () => shared('FEATURE');\n",
      'dist/shared.js': "export const shared = (x) => `SHARED:${x}`;\n",
    }
  );
  return root;
}

async function produce(root: string): Promise<ProducedSharedPackage[]> {
  return new UnitProducer({
    packageRoot: root,
    outputDir: join(root, 'out'),
    consumerSpecifiers: declaredDependencies(root),
  }).produce((m) => {
    throw new Error(m);
  });
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('UnitProducer — internal-edge specifiers', () => {
  it('every relative specifier in an emitted item resolves to a listed location', async () => {
    const root = makeRoot();
    const produced = await produce(root);
    const lib = produced.find((p) => p.name === 'split-lib')!;
    const lists = Object.values(lib.lists);
    expect(lists.length).toBeGreaterThan(0);
    const anyInternal = { found: false };
    for (const list of lists) {
      const locations = new Set([
        ...list.items.map((i) => i.location),
        ...Object.keys(list.lazy ?? {}),
        ...Object.keys(list.patterns ?? {}),
      ]);
      for (const item of list.items) {
        const file = join(root, 'out', item.location);
        expect(existsSync(file), item.location).toBe(true);
        const text = readFileSync(file, 'utf-8');
        for (const m of text.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
          const spec = m[1];
          if (!spec.startsWith('./') && !spec.startsWith('../')) continue;
          anyInternal.found = true;
          const resolved = new URL(spec, `http://r/${item.location}`).pathname.slice(1);
          expect(
            locations.has(resolved),
            `${item.location} carries unresolved relative specifier "${spec}" -> "${resolved}"`
          ).toBe(true);
        }
      }
    }
    // The fixture must actually exercise a shared chunk edge.
    expect(anyInternal.found).toBe(true);
  }, 60000);
});
