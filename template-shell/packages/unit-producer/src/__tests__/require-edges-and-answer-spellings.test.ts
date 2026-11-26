import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { UnitProducer, type ProducedSharedPackage } from '../UnitProducer';

/**
 * Entry answers and buildability:
 *  - A chunk answers every specifier that resolves to its entry
 *    file — all exports-map subpaths/conditions applicable to browser
 *    production builds, plus the direct in-package path where deep
 *    imports are allowed.
 *  - Buildability: an entry is buildable iff every import and
 *    require in its closure resolves under browser production
 *    conditions (require inside try/catch is optional, NODE_ENV
 *    branches are decided by the fixed production define,
 *    require(variable) stays runtime and is reported); non-buildable
 *    entries are skipped and reported; skipping propagates across
 *    packages to a fixpoint; the build fails only when a runtime
 *    actually imports a skipped entry, naming entry and reason.
 */

const roots: string[] = [];

function write(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
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

function makeRoot(deps: Record<string, string>): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'unit-producer-edges-')));
  roots.push(root);
  write(
    join(root, 'package.json'),
    JSON.stringify({ name: 'host', version: '0.0.0', dependencies: deps })
  );
  return root;
}

async function produce(
  root: string,
  consumerSpecifiers: string[] = []
): Promise<ProducedSharedPackage[]> {
  return new UnitProducer({
    packageRoot: root,
    outputDir: join(root, 'out'),
    consumerSpecifiers,
  }).produce((m) => {
    throw new Error(m);
  });
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('UnitProducer — require edges and answer spellings', () => {
  it('a chunk answers every specifier spelling resolving to its entry file', async () => {
    const root = makeRoot({ lib: '1.0.0' });
    pkg(
      root,
      'lib',
      {
        type: 'module',
        exports: {
          '.': './dist/index.js',
          './sub': './dist/sub.js',
          './sub.js': './dist/sub.js',
        },
      },
      {
        'dist/index.js': 'export const x = 1;\n',
        'dist/sub.js': 'export const sub = "SUB_BODY";\n',
      }
    );
    // Both spellings name the same entry file; each must be answered,
    // not only the first (sorted) spelling.
    const produced = await produce(root, ['lib/sub.js']);
    const lib = produced.find((p) => p.name === 'lib')!;
    expect(lib.entryUnits['lib/sub']).toBeDefined();
    expect(lib.entryUnits['lib/sub.js']).toBe(lib.entryUnits['lib/sub']);
    expect(lib.lists['lib/sub.js']).toBeDefined();
  }, 60000);

  it('a CJS entry answers its direct in-package path where deep imports are allowed', async () => {
    const root = makeRoot({ cjslib: '1.0.0' });
    pkg(
      root,
      'cjslib',
      { main: './cjs/index.cjs' },
      { 'cjs/index.cjs': 'module.exports = { run: () => "CJS_BODY" };\n' }
    );
    // No `exports` map: deep imports are allowed, so the direct
    // in-package path spelling of the entry file is answered too.
    const produced = await produce(root, ['cjslib/cjs/index.cjs']);
    const lib = produced.find((p) => p.name === 'cjslib')!;
    expect(lib.entryUnits['cjslib']).toBeDefined();
    expect(lib.entryUnits['cjslib/cjs/index.cjs']).toBe(
      lib.entryUnits['cjslib']
    );
    expect(lib.lists['cjslib/cjs/index.cjs']).toBeDefined();
  }, 60000);

  it('require inside try/catch is optional — an unresolvable one does not skip the entry', async () => {
    const root = makeRoot({ trylib: '1.0.0' });
    pkg(
      root,
      'trylib',
      { main: './index.cjs' },
      {
        'index.cjs':
          "let extra;\ntry { extra = require('never-installed-opt'); } catch (e) { extra = null; }\n" +
          "module.exports = { run: () => extra ?? 'TRY_BODY' };\n",
      }
    );
    const produced = await produce(root);
    const lib = produced.find((p) => p.name === 'trylib')!;
    expect(lib.entryUnits['trylib']).toBeDefined();
    expect(lib.skippedEntries ?? []).toHaveLength(0);
  }, 60000);

  it('a require in a NODE_ENV-dead branch is no load edge; a live one is', async () => {
    const root = makeRoot({ envlib: '1.0.0' });
    pkg(
      root,
      'envlib',
      {
        exports: {
          '.': './dist/index.cjs',
          './dead': './dist/dead.cjs',
          './live': './dist/live.cjs',
        },
      },
      {
        'dist/index.cjs': 'module.exports = { x: 1 };\n',
        // The dev branch is dead under the fixed production define —
        // the unlocatable require inside it never gates the entry.
        'dist/dead.cjs':
          "let m;\nif (process.env.NODE_ENV !== 'production') { m = require('dev-only-missing'); } else { m = require('./ok.cjs'); }\n" +
          'module.exports = { m };\n',
        'dist/ok.cjs': 'module.exports = "OK";\n',
        // The production branch is live — its unlocatable require
        // makes the entry non-buildable.
        'dist/live.cjs':
          "let m;\nif (process.env.NODE_ENV === 'production') { m = require('prod-only-missing'); } else { m = null; }\n" +
          'module.exports = { m };\n',
      }
    );
    const produced = await produce(root);
    const lib = produced.find((p) => p.name === 'envlib')!;
    expect(lib.entryUnits['envlib']).toBeDefined();
    expect(lib.entryUnits['envlib/dead']).toBeDefined();
    expect(lib.entryUnits['envlib/live']).toBeUndefined();
    expect(
      (lib.skippedEntries ?? []).some(
        (e) => e.entry === 'envlib/live' && /prod-only-missing/.test(e.reason)
      )
    ).toBe(true);
  }, 60000);

  it('require(variable) stays runtime and is reported', async () => {
    const root = makeRoot({ varlib: '1.0.0' });
    pkg(
      root,
      'varlib',
      { main: './index.cjs' },
      {
        'index.cjs':
          'module.exports = { load: (name) => require(name) };\n',
      }
    );
    const warnings: string[] = [];
    const orig = console.warn;
    console.warn = (...a: unknown[]) => warnings.push(a.join(' '));
    try {
      const produced = await produce(root);
      expect(produced.find((p) => p.name === 'varlib')!.entryUnits['varlib']).toBeDefined();
    } finally {
      console.warn = orig;
    }
    expect(
      warnings.some((w) => /varlib/.test(w) && /runtime require\(name\)/.test(w))
    ).toBe(true);
  }, 60000);

  it('skipping propagates across packages to a re-exporting entry; requesting it fails naming entry and reason', async () => {
    const build = (consumerSpecifiers: string[] = []) => {
      const root = makeRoot({ framework: '1.0.0', reactish: '1.0.0' });
      pkg(
        root,
        'framework',
        {
          type: 'module',
          exports: {
            '.': './dist/index.js',
            './testing': './dist/testing.js',
          },
        },
        {
          'dist/index.js': 'export const f = 1;\n',
          'dist/testing.js':
            "import { run } from 'unlocatable-test-kit';\nexport const t = run;\n",
        }
      );
      pkg(
        root,
        'reactish',
        {
          type: 'module',
          dependencies: { framework: '1.0.0' },
          exports: {
            '.': './dist/index.js',
            './testing': './dist/testing.js',
          },
        },
        {
          'dist/index.js': 'export const r = 1;\n',
          // Cross-package re-export of a skipped entry — this entry's
          // closure reaches the skipped entry, so it is skipped too.
          'dist/testing.js': "export * from 'framework/testing';\n",
        }
      );
      return { root, consumerSpecifiers };
    };

    // Not requested: the build succeeds; both testing entries report
    // as skipped with reasons.
    const a = build();
    const produced = await produce(a.root, a.consumerSpecifiers);
    const reactish = produced.find((p) => p.name === 'reactish')!;
    expect(reactish.entryUnits['reactish']).toBeDefined();
    expect(reactish.entryUnits['reactish/testing']).toBeUndefined();
    expect(
      (reactish.skippedEntries ?? []).some(
        (e) =>
          e.entry === 'reactish/testing' && /framework\/testing/.test(e.reason)
      )
    ).toBe(true);

    // Requested: the build fails, naming the skipped entry and reason.
    const b = build(['reactish/testing']);
    await expect(produce(b.root, b.consumerSpecifiers)).rejects.toThrow(
      /reactish\/testing[\s\S]*framework\/testing|framework\/testing[\s\S]*reactish\/testing/
    );
  }, 60000);
});
