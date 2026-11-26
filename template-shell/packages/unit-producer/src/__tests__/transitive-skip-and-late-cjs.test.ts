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
import { afterEach, describe, expect, it } from 'vitest';

import { UnitProducer, type ProducedSharedPackage } from '../UnitProducer';

/**
 * Run-state skips and late CommonJS discovery:
 *  - The build cache stores the complete package-determined
 *    result — the transitive-skip screen is run state applied after
 *    loading, so an entry skipped only because another package was
 *    skipped is still in the cache for a run where the skip does not
 *    apply (no cache poisoning).
 *  - Byte-shaping runs once, after the dependency closure has
 *    stabilized — a supplementary chunk whose CJS dependency is
 *    discovered late still gets the CJS-default import, never the
 *    namespace wrapper.
 */

const roots: string[] = [];

function write(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function tmpRoot(label: string): string {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), `unit-producer-skip-${label}-`))
  );
  roots.push(root);
  return root;
}

function pkg(
  root: string,
  name: string,
  json: object,
  files: Record<string, string>
): void {
  const dir = join(root, 'node_modules', name);
  write(
    join(dir, 'package.json'),
    JSON.stringify({ name, version: '1.0.0', ...json })
  );
  for (const [rel, content] of Object.entries(files)) {
    write(join(dir, rel), content);
  }
}


afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

/**
 * Fixture: `x/feat` is deferred on the optional peer `optp` —
 * skipped in a run where `optp` is never delivered, buildable where it
 * is (consumer B declares `optp` as its own shared dependency, so it
 * is delivered there; the package bytes — and therefore the cache
 * fingerprint — are identical in both runs). `y/feat` imports
 * `x/feat`, so it is skipped transitively. `y` is discovered only
 * through `deep-req`'s supplementary coverage build, so its chunk
 * computation runs after `x/feat`'s skip is confirmed — exactly the
 * ordering that baked the run's skip state into `y`'s cache entry.
 */
function installSkipChain(root: string, withOptp: boolean): void {
  pkg(
    root,
    'x',
    {
      type: 'module',
      exports: { '.': './index.js', './feat': './feat.js' },
      peerDependencies: { optp: '1.0.0' },
      peerDependenciesMeta: { optp: { optional: true } },
    },
    {
      'index.js': 'export const x = 1;\n',
      'feat.js': "import { o } from 'optp';\nexport const f = o;\n",
    }
  );
  pkg(
    root,
    'y',
    {
      type: 'module',
      exports: { '.': './index.js', './feat': './feat.js' },
    },
    {
      'index.js': "import 'x';\nexport const y = 1;\n",
      'feat.js': "import 'x/feat';\nexport const f = 1;\n",
    }
  );
  pkg(
    root,
    'deep-req',
    { type: 'module', main: './dist/index.js' },
    {
      'dist/index.js': 'export const m = 1;\n',
      'dist/deep.js': "import 'y';\nexport const d = 1;\n",
    }
  );
  if (withOptp) {
    pkg(
      root,
      'optp',
      { type: 'module', main: './index.js' },
      { 'index.js': 'export const o = "OPT_BODY";\n' }
    );
  }
}

function makeSkipConsumer(label: string, withOptp: boolean): string {
  const root = tmpRoot(label);
  installSkipChain(root, withOptp);
  write(
    join(root, 'package.json'),
    JSON.stringify({
      name: `consumer-${label}`,
      version: '0.0.0',
      dependencies: {
        x: '1.0.0',
        'deep-req': '1.0.0',
        // Consumer B declares the optional peer itself: it is shared
        // and delivered there, so `x/feat` — and transitively
        // `y/feat` — is buildable in run B only.
        ...(withOptp ? { optp: '1.0.0' } : {}),
      },
    })
  );
  return root;
}

describe('UnitProducer — transitive skips in the cache, late CommonJS dependencies', () => {
  it('an entry skipped only transitively stays in the build cache — a later run without the skip finds it', async () => {
    const cacheDir = join(tmpRoot('cache'), 'build-cache');
    const produce = async (root: string) =>
      new UnitProducer({
        packageRoot: root,
        outputDir: join(root, 'out'),
        consumerSpecifiers: ['deep-req/dist/deep.js'],
        cacheDir,
      }).produce((m) => {
        throw new Error(m);
      });

    // Run A: `optp` is not installed — `x/feat` is confirmed skipped,
    // `y/feat` is skipped transitively.
    const rootA = makeSkipConsumer('a', false);
    const a = await produce(rootA);
    const pkgYA = a.find((p) => p.name === 'y')!;
    expect(pkgYA.entryUnits['y/feat']).toBeUndefined();
    expect(
      (pkgYA.skippedEntries ?? []).some((e) => e.entry === 'y/feat')
    ).toBe(true);

    // Run B: `optp` is installed — `x/feat` is buildable, so `y/feat`
    // must be too. A poisoned cache would serve run A's filtered entry
    // set and lose `y/feat` forever.
    const rootB = makeSkipConsumer('b', true);
    const b = await produce(rootB);
    const pkgYB = b.find((p) => p.name === 'y')!;
    expect(pkgYB.entryUnits['y/feat']).toBeDefined();
    const pkgXB = b.find((p) => p.name === 'x')!;
    expect(pkgXB.entryUnits['x/feat']).toBeDefined();

    // Byte identity: the package-determined chunk sets are identical
    // across the two runs (locations are content-derived).
    const unitsOf = (p: ProducedSharedPackage) =>
      new Map(p.units.map((u) => [u.location, u.contentHash] as const));
    expect(unitsOf(pkgYB)).toEqual(unitsOf(pkgYA));
    const pkgXA = a.find((p) => p.name === 'x')!;
    expect(unitsOf(pkgXB)).toEqual(unitsOf(pkgXA));

    // And the emitted list for `y` is byte-identical across runs.
    expect(pkgYB.lists['y']).toEqual(pkgYA.lists['y']);
  }, 120000);

  it('a supplementary chunk whose CJS dependency is discovered late gets the CJS-default import', async () => {
    const root = tmpRoot('cjs');
    pkg(
      root,
      'cjsdep',
      { type: 'commonjs', main: './index.cjs' },
      {
        'index.cjs':
          '"use strict";\nmodule.exports = { v: "CJSDEP_BODY" };\n',
      }
    );
    pkg(
      root,
      'deepmod',
      {
        type: 'module',
        main: './dist/index.js',
        dependencies: { cjsdep: '1.0.0' },
      },
      {
        'dist/index.js': 'export const m = 1;\n',
        'dist/deep.cjs':
          '"use strict";\nconst dep = require("cjsdep");\n' +
          'module.exports = { dep };\n',
      }
    );
    write(
      join(root, 'package.json'),
      JSON.stringify({
        name: 'consumer-cjs',
        version: '0.0.0',
        dependencies: { deepmod: '1.0.0' },
      })
    );

    const produced = await new UnitProducer({
      packageRoot: root,
      outputDir: join(root, 'out'),
      consumerSpecifiers: ['deepmod/dist/deep.cjs'],
    }).produce((m) => {
      throw new Error(m);
    });

    // `cjsdep` joins the closure only through the supplementary
    // build's external edge, after `deepmod`'s own entry set is known,
    // so the supplementary chunk must still be patched against the
    // final CJS specifier set.
    const deepmod = produced.find((p) => p.name === 'deepmod')!;
    const list = deepmod.lists['deepmod/dist/deep.cjs'];
    expect(list).toBeDefined();
    const item = list.items.find((i) =>
      i.answers.includes('deepmod/dist/deep.cjs')
    );
    expect(item).toBeDefined();
    const text = readFileSync(join(root, 'out', item!.location), 'utf-8');
    // The CJS dependency is a default import — the binding's local
    // name is mangled, so assert the shape, not the identifier. The
    // wrong patch would be a namespace import plus a toCommonJS wrap.
    expect(text).toMatch(/import\s+[\w$]+\s+from\s*"cjsdep"/u);
    expect(text).not.toMatch(/import\s*\*\s*as\s+[\w$]+\s+from\s*"cjsdep"/);
  }, 120000);
});
