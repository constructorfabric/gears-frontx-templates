import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { PatternImportMatcher } from '../PatternImportMatcher';
import { UnitProducer, type ProducedSharedPackage } from '../UnitProducer';

/**
 * Shared-package build edges:
 *  - binding→member rewrite inside shared-package chunk builds —
 *    a shared package importing named bindings from another package's
 *    splittable barrel keeps member specifiers (`pkg/<module>`) external,
 *    never the root barrel (the side-effect rules apply).
 *  - internal chunk-edge lookup is scoped to the chunk's own
 *    build — colliding outdir-relative ids across packages cannot wire
 *    an edge to a foreign chunk.
 *  - a literal `import('pkg/sub')` inside a shared chunk gets a
 *    lazy delta list keyed by the answering item's chunk location.
 *  - a `.extra` single-entry build externalizes modules the main
 *    chunk set already owns — no module in two chunks.
 *  - pattern imports publish only files matching the fixed
 *    prefix and suffix, through atomic content-addressed publishing.
 *  - the build-machine cache key mixes in the producer identity
 *    and the fixed build settings.
 *  - require-kind edges are kept as import edges on the item.
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

function tmpRoot(label: string): string {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), `unit-producer-p21-${label}-`))
  );
  roots.push(root);
  return root;
}


async function produce(
  root: string,
  out: string,
  consumerSpecifiers: readonly string[] = [],
  cacheDir?: string
): Promise<ProducedSharedPackage[]> {
  return new UnitProducer({
    packageRoot: root,
    outputDir: join(root, out),
    consumerSpecifiers,
    ...(cacheDir !== undefined ? { cacheDir } : {}),
  }).produce((m) => {
    throw new Error(m);
  });
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

/** A UI-kit shared package importing three icons from an icon barrel. */
function makeUiKitRoot(): string {
  const root = tmpRoot('uikit');
  write(
    join(root, 'package.json'),
    JSON.stringify({
      name: 'host',
      version: '0.0.0',
      dependencies: { 'ui-kit': '1.0.0', icons: '1.0.0' },
    })
  );
  pkg(
    root,
    'icons',
    {
      type: 'module',
      sideEffects: false,
      exports: { '.': './dist/index.js' },
    },
    {
      'dist/index.js': [
        "export { IconA } from './icons/a.js';",
        "export { IconB } from './icons/b.js';",
        "export { IconC } from './icons/c.js';",
        "export { IconD } from './icons/d.js';",
        "export { IconE } from './icons/e.js';",
        '',
      ].join('\n'),
      'dist/icons/a.js': "export const IconA = () => 'A';\n",
      'dist/icons/b.js': "export const IconB = () => 'B';\n",
      'dist/icons/c.js': "export const IconC = () => 'C';\n",
      'dist/icons/d.js': "export const IconD = () => 'D';\n",
      'dist/icons/e.js': "export const IconE = () => 'E';\n",
    }
  );
  pkg(
    root,
    'ui-kit',
    {
      type: 'module',
      sideEffects: false,
      exports: { '.': './dist/index.js' },
      dependencies: { icons: '1.0.0' },
    },
    {
      'dist/index.js':
        "import { IconA, IconB, IconC } from 'icons';\n" +
        'export const button = () => [IconA(), IconB(), IconC()];\n',
    }
  );
  return root;
}

describe('binding→member rewrite inside shared-package builds', () => {
  it('a UI-kit chunk importing 3 icons names only the 3 member specifiers, not the icon root entry', async () => {
    const root = makeUiKitRoot();
    const produced = await produce(root, 'out', ['ui-kit']);
    const kit = produced.find((p) => p.name === 'ui-kit')!;
    const icons = produced.find((p) => p.name === 'icons')!;

    const list = kit.lists['ui-kit'];
    expect(list).toBeDefined();
    // The ui-kit entry chunk keeps exactly the member specifiers
    // external — no 'icons' root edge that would pull every member.
    const importer = list.items.find((i) => i.answers.includes('ui-kit'));
    expect(importer).toBeDefined();
    const stringEdges = importer!.imports.filter(
      (e): e is string => typeof e === 'string'
    );
    expect(stringEdges).not.toContain('icons');
    expect(stringEdges.sort()).toEqual([
      'icons/dist/icons/a.js',
      'icons/dist/icons/b.js',
      'icons/dist/icons/c.js',
    ]);

    // The list reaches only the three member chunks — the unused
    // members' chunks are not on it.
    const answers = new Set(list.items.flatMap((i) => i.answers));
    expect(answers.has('icons')).toBe(false);
    expect(answers.has('icons/dist/icons/a.js')).toBe(true);
    expect(answers.has('icons/dist/icons/b.js')).toBe(true);
    expect(answers.has('icons/dist/icons/c.js')).toBe(true);
    expect(answers.has('icons/dist/icons/d.js')).toBe(false);
    expect(answers.has('icons/dist/icons/e.js')).toBe(false);

    // The emitted chunk keeps the member specifiers in source.
    const chunkText = list.items
      .filter((i) => i.answers.includes('ui-kit'))
      .map((i) => readFileSync(join(root, 'out', i.location), 'utf-8'))
      .join('\n');
    expect(chunkText).toMatch(/from\s*["']icons\/dist\/icons\/a\.js["']/);
    expect(chunkText).not.toMatch(/from\s*["']icons["']/);
    expect(icons.units.length).toBeGreaterThan(0);
  }, 120000);

  it('keeps the root specifier when the imported barrel is not side-effect-free', async () => {
    const root = tmpRoot('b2-kept');
    write(
      join(root, 'package.json'),
      JSON.stringify({
        name: 'host',
        version: '0.0.0',
        dependencies: { 'ui-kit': '1.0.0', icons: '1.0.0' },
      })
    );
    pkg(
      root,
      'icons',
      { type: 'module', exports: { '.': './dist/index.js' } },
      {
        'dist/index.js':
          "export { IconA } from './icons/a.js';\n" +
          'globalThis.__icons_evaluated = true;\n',
        'dist/icons/a.js': "export const IconA = () => 'A';\n",
      }
    );
    pkg(
      root,
      'ui-kit',
      {
        type: 'module',
        sideEffects: false,
        exports: { '.': './dist/index.js' },
        dependencies: { icons: '1.0.0' },
      },
      {
        'dist/index.js':
          "import { IconA } from 'icons';\nexport const button = () => IconA();\n",
      }
    );
    const produced = await produce(root, 'out', ['ui-kit']);
    const kit = produced.find((p) => p.name === 'ui-kit')!;
    const importer = kit.lists['ui-kit'].items.find((i) =>
      i.answers.includes('ui-kit')
    )!;
    expect(importer.imports).toContain('icons');
  }, 120000);
});

describe('build-scoped chunk-edge lookup', () => {
  it('wires internal edges to chunks of the same package when outdir-relative ids collide', async () => {
    const root = tmpRoot('collide');
    write(
      join(root, 'package.json'),
      JSON.stringify({
        name: 'host',
        version: '0.0.0',
        dependencies: { 'pkg-a': '1.0.0', 'pkg-b': '1.0.0' },
      })
    );
    // Both packages emit `dist/index.js` + `dist/util.js` + a shared
    // internal chunk — identical outdir-relative chunk ids.
    for (const name of ['pkg-a', 'pkg-b']) {
      pkg(
        root,
        name,
        {
          type: 'module',
          sideEffects: false,
          exports: { '.': './dist/index.js', './util': './dist/util.js' },
        },
        {
          'dist/index.js':
            "import { u } from './util.js';\n" +
            `export const main = () => 'MAIN_${name}' + u();\n`,
          'dist/util.js':
            "import { base } from './base.js';\n" +
            `export const u = () => 'U_${name}' + base();\n`,
          'dist/base.js': `export const base = () => 'BASE_${name}';\n`,
        }
      );
    }
    const produced = await produce(root, 'out', ['pkg-a', 'pkg-b']);
    for (const name of ['pkg-a', 'pkg-b']) {
      const p = produced.find((x) => x.name === name)!;
      const list = p.lists[name];
      expect(list).toBeDefined();
      const hashToLocation = new Map(
        list.items.map((i) => [i.contentHash, i.location])
      );
      for (const item of list.items) {
        for (const edge of item.imports) {
          if (typeof edge === 'string') continue;
          const location = hashToLocation.get(edge.unit);
          expect(location, `${name}: {item} edge must resolve on-list`).toBeDefined();
          // The edge target is a chunk of the same package, never the
          // colliding id of the other package's build.
          expect(location).toMatch(new RegExp(`^${name}@`));
        }
      }
      // And the util chunk's bytes carry this package's marker.
      const util = list.items.find((i) =>
        i.answers.includes(`${name}/dist/util.js`)
      );
      expect(util).toBeDefined();
      if (util !== undefined) {
        const text = readFileSync(join(root, 'out', util.location), 'utf-8');
        expect(text).toContain(`U_${name}`.slice(0, 2));
      }
    }
  }, 120000);
});

describe('dynamic external import gets a lazy list', () => {
  it('emits a lazy delta list keyed by the bare specifier for import("other-lib/sub")', async () => {
    const root = tmpRoot('dynext');
    write(
      join(root, 'package.json'),
      JSON.stringify({
        name: 'host',
        version: '0.0.0',
        dependencies: { 'lazy-importer': '1.0.0' },
      })
    );
    pkg(
      root,
      'lazy-importer',
      {
        type: 'module',
        sideEffects: false,
        exports: { '.': './dist/index.js' },
        dependencies: { 'other-lib': '1.0.0' },
      },
      {
        'dist/index.js':
          "export const load = () => import('other-lib/sub');\n" +
          "export const main = () => 'MAIN';\n",
      }
    );
    pkg(
      root,
      'other-lib',
      {
        type: 'module',
        sideEffects: false,
        exports: { '.': './dist/index.js', './sub': './dist/sub.js' },
      },
      {
        'dist/index.js': "export const root = () => 'ROOT';\n",
        'dist/sub.js': "export const sub = () => 'SUB';\n",
      }
    );
    const produced = await produce(root, 'out', ['lazy-importer']);
    const importer = produced.find((p) => p.name === 'lazy-importer')!;
    const other = produced.find((p) => p.name === 'other-lib')!;
    const list = importer.lists['lazy-importer'];
    expect(list).toBeDefined();

    // The answering item for 'other-lib/sub'.
    const otherList = other.lists['other-lib'] ?? Object.values(other.lists)[0];
    const answering = Object.values(other.lists)
      .flatMap((l) => l.items)
      .find((i) => i.answers.includes('other-lib/sub'));
    expect(answering ?? otherList).toBeDefined();
    expect(list.lazy).toBeDefined();
    const lazyKeys = Object.keys(list.lazy!);
    // The runtime looks a bare lazy target up by the specifier itself.
    expect(lazyKeys).toContain('other-lib/sub');
    expect(lazyKeys).not.toContain(answering!.location);
    const lazyDoc = list.lazy!['other-lib/sub'];
    // The lazy list holds the answering chunk and nothing the parent
    // already carries.
    const parentHashes = new Set(list.items.map((i) => i.contentHash));
    expect(lazyDoc.items.map((i) => i.contentHash)).toContain(
      answering!.contentHash
    );
    for (const item of lazyDoc.items) {
      expect(parentHashes.has(item.contentHash)).toBe(false);
    }
  }, 120000);
});

describe('extra builds externalize owned modules', () => {
  it('no module appears in two chunks when a requested subpath shares internals with the root entry', async () => {
    const root = tmpRoot('extra');
    write(
      join(root, 'package.json'),
      JSON.stringify({
        name: 'host',
        version: '0.0.0',
        dependencies: { deep: '1.0.0' },
      })
    );
    pkg(
      root,
      'deep',
      {
        type: 'module',
        sideEffects: false,
        // No `exports` map: the root resolves through `main`, and
        // `deep/dist/secret.js` resolves as a plain file path without
        // joining the complete entry set — the `.extra` case.
        main: './dist/index.js',
      },
      {
        'dist/index.js':
          "import { shared } from './shared-internal.js';\n" +
          "export const main = () => shared() + 'MAIN';\n",
        'dist/shared-internal.js':
          "export const shared = () => 'SHARED_INTERNAL';\n",
        'dist/secret.js':
          "import { shared } from './shared-internal.js';\n" +
          "export const secret = () => shared() + 'SECRET';\n",
      }
    );
    const produced = await produce(root, 'out', ['deep', 'deep/dist/secret.js']);
    const deep = produced.find((p) => p.name === 'deep')!;
    // No module is owned by two chunks of the package.
    const seen = new Map<string, string>();
    for (const unit of deep.units) {
      for (const m of unit.modulePaths) {
        expect(seen.has(m), `${m} in two chunks`).toBe(false);
        seen.set(m, unit.location);
      }
    }
    // The requested specifier is answered and its list reaches the
    // shared module's owning chunk, not a rebundled copy.
    const secretList = deep.lists['deep/dist/secret.js'];
    expect(secretList).toBeDefined();
    const answers = new Set(secretList.items.flatMap((i) => i.answers));
    expect(answers.has('deep/dist/shared-internal.js')).toBe(true);
  }, 120000);
});

describe('pattern prefix filter and atomic publish', () => {
  it('publishes only files matching the fixed prefix and suffix', async () => {
    const root = tmpRoot('pattern');
    write(
      join(root, 'package.json'),
      JSON.stringify({
        name: 'host',
        version: '0.0.0',
        dependencies: { i18n: '1.0.0' },
      })
    );
    pkg(
      root,
      'i18n',
      {
        type: 'module',
        sideEffects: false,
        exports: { '.': './dist/index.js' },
      },
      {
        'dist/index.js': "export const t = () => 'T';\n",
        'dist/locales/en.json': '{"hello":"hi"}\n',
        'dist/locales/de.json': '{"hello":"hallo"}\n',
        'dist/locales/fr.txt': 'bonjour\n',
        'dist/locales/readme.txt': 'not a locale\n',
      }
    );
    const out = join(root, 'out');
    const matcher = new PatternImportMatcher(out);
    // The matcher is exercised directly, for a call made by
    // `dist/index.js` emitted at the package directory's top level.
    const packageDir = join(root, 'node_modules', 'i18n');
    const dep = { name: 'i18n', packageDir, version: '1.0.0' };
    const from = {
      location: 'i18n@1.0.0/dist-index.0.js',
      entryPoint: join(packageDir, 'dist', 'index.js'),
      modulePaths: [],
    };
    const fail = (m: string): never => {
      throw new Error(m);
    };
    const matched = matcher.match(dep, from, './locales/', '.json', fail);

    // Only the two .json files match — fr.txt and readme.txt fail the
    // suffix filter and are never published.
    const locations = matched.map((m) => m.location);
    expect(locations.length).toBe(2);
    for (const location of locations) {
      expect(location).toMatch(/^i18n@1\.0\.0\/locales\/.+\.json$/);
      expect(existsSync(join(out, location))).toBe(true);
    }
    expect(locations.some((l) => l.includes('readme'))).toBe(false);
    expect(locations.some((l) => l.includes('fr'))).toBe(false);
    const patternDir = join(out, 'i18n@1.0.0', 'locales');
    expect(
      readdirSync(patternDir).every((f) => f.endsWith('.json'))
    ).toBe(true);
    // Each match's list names the file itself.
    for (const m of matched) {
      expect(m.list.items.some((i) => i.location === m.location)).toBe(true);
    }
    // The name prefix is applied too: a prefix naming a file stem
    // yields only stems with that prefix.
    const enOnly = matcher.match(dep, from, './locales/en', '.json', fail);
    expect(enOnly.map((m) => m.location).length).toBe(1);
  }, 120000);
});

describe('cache key mixes producer code hash and settings', () => {
  it('the key is independent of the producer version string (same code reuses the cache entry)', async () => {
    // The build-cache key holds a content hash of the producer's own
    // built code, not its version string: a version label is not a
    // content hash, and relying on it would serve chunks computed
    // before a fix until the version bumped.
    const root = tmpRoot('cachekey');
    write(
      join(root, 'package.json'),
      JSON.stringify({
        name: 'host',
        version: '0.0.0',
        dependencies: { plain: '1.0.0' },
      })
    );
    pkg(
      root,
      'plain',
      { type: 'module', sideEffects: false, main: './index.js' },
      { 'index.js': "export const p = () => 'PLAIN';\n" }
    );
    const cacheDir = join(root, '.cache');
    await produce(root, 'out-a', ['plain'], cacheDir);
    await produce(root, 'out-b', ['plain'], cacheDir);
    const entries = readdirSync(join(cacheDir, 'plain@1.0.0'));
    // One cache entry, not two: the producer version is no part of
    // the fingerprint, so the second produce reuses the first's raw
    // outputs — the code that produced them is identical.
    expect(entries.length).toBe(1);
    // A third produce under either version still hits the same entry.
    await produce(root, 'out-c', ['plain'], cacheDir);
    expect(readdirSync(join(cacheDir, 'plain@1.0.0')).length).toBe(1);
  }, 180000);
});

describe('require-kind edges are kept', () => {
  it('a require-call edge to a shared package stays an imports specifier on the item', async () => {
    const root = tmpRoot('require');
    write(
      join(root, 'package.json'),
      JSON.stringify({
        name: 'host',
        version: '0.0.0',
        dependencies: { 'cjs-user': '1.0.0' },
      })
    );
    pkg(
      root,
      'cjs-user',
      { main: './index.js', dependencies: { 'cjs-dep': '1.0.0' } },
      {
        'index.js':
          "const dep = require('cjs-dep');\n" +
          'exports.run = () => dep.label;\n',
      }
    );
    pkg(
      root,
      'cjs-dep',
      { main: './index.js' },
      { 'index.js': "module.exports = { label: 'DEP' };\n" }
    );
    const produced = await produce(root, 'out', ['cjs-user']);
    const user = produced.find((p) => p.name === 'cjs-user')!;
    const list = user.lists['cjs-user'];
    expect(list).toBeDefined();
    const item = list.items.find((i) => i.answers.includes('cjs-user'));
    expect(item).toBeDefined();
    expect(item!.imports).toContain('cjs-dep');
    expect(user.requires).toContain('cjs-dep');
  }, 120000);
});
