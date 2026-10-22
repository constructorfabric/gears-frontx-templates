// @vitest-environment node

/**
 * Tests for the shared-import guard in the frontx-mf-gts plugin, and for how
 * a CommonJS shared chunk imports the sibling shared chunks it requires.
 *
 * The handler points each bare import at the shared chunk for that package,
 * and ES modules link by name: an import of a name the chunk does not export
 * fails with a SyntaxError before any code runs, and the MFE never mounts.
 * The guard turns that into a build failure. The pure functions are tested
 * on hand-written chunks; the fixture packages at the end are built with the
 * real `StandaloneEsmBuilder`, one per case the guard and the CommonJS
 * interop have to get right.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { BuildOptions } from 'esbuild';
import { parseAst } from 'vite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  StandaloneEsmBuilder,
  findCjsWrapperExport,
  findSharedImportMismatches,
  findUncheckedNamespaceImports,
  formatSharedImportMismatchError,
  formatUncheckedNamespaceImportWarning,
  patchCjsExternalsInSource,
  readChunkLinkage,
  type AmbiguousExport,
  type ImportingChunk,
  type MintedSharedChunk,
  type SharedChunk,
} from '../../src/build/mf-gts';

// The builder sets no `absWorkingDir`, so esbuild resolves each shared dep
// from its default working directory, which it reads once, when it loads.
// Passing the current one on every build lets the fixture tests below build
// from their own directory, as a build run from the MFE's directory does.
vi.mock('esbuild', async (importOriginal) => {
  const actual = await importOriginal<typeof import('esbuild')>();
  return {
    ...actual,
    build: (options: BuildOptions) =>
      actual.build({ absWorkingDir: process.cwd(), ...options }),
  };
});

function shared(
  name: string,
  overrides: Partial<Omit<SharedChunk, 'name'>> = {}
): SharedChunk {
  return {
    name,
    fileName: `shared/${name}.js`,
    exports: [],
    starExports: [],
    reExports: {},
    locals: {},
    imports: {},
    ...overrides,
  };
}

function importer(
  fileName: string,
  imports: Record<string, string[]>
): ImportingChunk {
  return { fileName, imports };
}

describe('findCjsWrapperExport', () => {
  it('finds the default export of a chunk that wraps a CommonJS module', () => {
    const source = 'var require_x = __commonJS({});\nexport default require_x();\n';
    expect(findCjsWrapperExport(source)).toEqual({
      statement: 'export default require_x();',
      expression: 'require_x()',
    });
  });

  it('returns undefined for an ESM chunk', () => {
    expect(
      findCjsWrapperExport('var a = 1;\nexport {\n  a,\n  a as default\n};\n')
    ).toBeUndefined();
  });
});

describe('patchCjsExternalsInSource', () => {
  const source = 'var r = __require("react");\nvar d = __require("dep");\n';

  it('imports a CommonJS sibling chunk by its default, exactly as before', () => {
    // The bytes the plugin has always written for react and react-dom.
    expect(patchCjsExternalsInSource(source, ['react'], new Set(['react']))).toBe(
      'import __ext_react from "react";\n' +
        'var r = __ext_react;\nvar d = __require("dep");\n'
    );
  });

  it('imports an ESM sibling chunk as a namespace wrapped as CommonJS', () => {
    const patched = patchCjsExternalsInSource(source, ['dep'], new Set());
    expect(patched).toContain('import * as __ext_dep_ns from "dep";');
    expect(patched).toContain('var __ext_dep = __frontx_toCommonJS(__ext_dep_ns);');
    expect(patched).toContain('var d = __ext_dep;');
    expect(patched).not.toContain('import __ext_dep from');
  });

  it('leaves a chunk with no __require of an external unchanged', () => {
    expect(patchCjsExternalsInSource(source, ['other'], new Set())).toBe(source);
  });
});

describe('readChunkLinkage', () => {
  it('reads every import and export form a chunk can carry', () => {
    const code = [
      'import a from "a";',
      'import * as b from "b";',
      'import { c, d as dd } from "c";',
      'import "side-effect";',
      'export { e as f } from "e";',
      'export * from "g";',
      'export * as h from "h";',
      'var m = {};',
      'export default m;',
      'export var { i, j: [k], ...l } = m;',
      'export function fn() {}',
      'export class Cls {}',
      'export { m as "string-name" };',
    ].join('\n');

    expect(readChunkLinkage(code, parseAst)).toEqual({
      exports: ['f', 'h', 'default', 'i', 'k', 'l', 'fn', 'Cls', 'string-name'],
      starExports: ['g'],
      reExports: { f: { from: 'e', name: 'e' } },
      locals: { 'string-name': 'm' },
      imports: {
        a: ['default'],
        b: ['*'],
        c: ['c', 'd'],
        'side-effect': [],
        e: ['e'],
        g: ['*'],
        h: ['*'],
      },
    });
  });

  it('records which module each re-exported name is bound in', () => {
    const code = [
      // Imports hoist, so an export may name a binding imported below it.
      'export { b as c, d, ns, own };',
      'export { default as dflt, z } from "w";',
      'import d, { a as b } from "x";',
      'import * as ns from "y";',
      'var own = 1;',
    ].join('\n');

    // A namespace exported again, like `own`, is the chunk's own binding.
    expect(readChunkLinkage(code, parseAst).reExports).toEqual({
      c: { from: 'x', name: 'a' },
      d: { from: 'x', name: 'default' },
      dflt: { from: 'w', name: 'default' },
      z: { from: 'w', name: 'z' },
    });
  });

  it('records the local binding behind each own export named otherwise', () => {
    const code = [
      'var x = 1;',
      'function f() {}',
      'export { x as N, x as y, x, f as default };',
      'export class Cls {}',
    ].join('\n');

    expect(readChunkLinkage(code, parseAst).locals).toEqual({
      N: 'x',
      y: 'x',
      default: 'f',
    });
  });

  it('binds a default declaration to its name, a default expression to none', () => {
    const localsOf = (code: string) => readChunkLinkage(code, parseAst).locals;
    expect(localsOf('export default function f() {}\nexport { f };')).toEqual({
      default: 'f',
    });
    expect(localsOf('export default class Cls {}')).toEqual({ default: 'Cls' });
    expect(localsOf('export default function () {}')).toEqual({});
    expect(localsOf('function f() {}\nexport default (function f() {});')).toEqual(
      {}
    );
    // `export default x` binds a new binding to x's value, not x itself.
    expect(localsOf('var x;\nexport default x;\nexport { x };')).toEqual({});
  });
});

describe('findSharedImportMismatches', () => {
  it('reports a name the shared chunk does not export, with the discovery failure', () => {
    const chunks = [
      shared('pkg', {
        exports: ['default'],
        discoveryFailure: 'named-export discovery failed: boom',
      }),
    ];
    expect(
      findSharedImportMismatches(
        [importer('assets/a.js', { pkg: ['default', 'ratio', 'ratio'] })],
        chunks
      )
    ).toEqual([
      {
        importer: 'assets/a.js',
        packageName: 'pkg',
        missing: ['ratio'],
        discoveryFailure: 'named-export discovery failed: boom',
      },
    ]);
  });

  it('passes a name a shared chunk re-exports through export * from a sibling', () => {
    const chunks = [
      shared('@tanstack/react-query', {
        exports: ['useQuery'],
        starExports: ['@tanstack/query-core'],
      }),
      shared('@tanstack/query-core', { exports: ['QueryClient', 'default'] }),
    ];
    const mfeChunk = importer('assets/a.js', {
      '@tanstack/react-query': ['useQuery', 'QueryClient', 'default'],
    });
    // `export *` never re-exports `default`.
    expect(findSharedImportMismatches([mfeChunk], chunks)).toEqual([
      expect.objectContaining({
        packageName: '@tanstack/react-query',
        missing: ['default'],
      }),
    ]);
  });

  it('checks the imports of shared chunks too', () => {
    const chunks = [
      shared('react-dom', { imports: { react: ['default', 'nope'] } }),
      shared('react', { exports: ['default', 'useState'] }),
    ];
    expect(findSharedImportMismatches(chunks, chunks)).toEqual([
      expect.objectContaining({
        importer: 'shared/react-dom.js',
        importerPackage: 'react-dom',
        packageName: 'react',
        missing: ['nope'],
      }),
    ]);
  });

  it('reports a name re-exported from a sibling that lacks it, to both importers', () => {
    const chunks = [
      shared('outer', {
        exports: ['x'],
        reExports: { x: { from: 'inner', name: 'x' } },
        imports: { inner: ['x'] },
      }),
      shared('inner', { exports: ['y'] }),
    ];
    // Neither import links: `outer` fails first, and with it its importer.
    expect(
      findSharedImportMismatches(
        [...chunks, importer('assets/a.js', { outer: ['x'] })],
        chunks
      )
    ).toEqual([
      expect.objectContaining({ importer: 'shared/outer.js', missing: ['x'] }),
      expect.objectContaining({ importer: 'assets/a.js', missing: ['x'] }),
    ]);
  });

  it('skips namespace imports and specifiers that are not shared dependencies', () => {
    expect(
      findSharedImportMismatches(
        [importer('assets/a.js', { react: ['*'], './b.js': ['anything'] })],
        [shared('react', { exports: ['default'] })]
      )
    ).toEqual([]);
  });

  describe('a name two export * lines supply', () => {
    // The graph the cases share, each module checked against Node 25 as
    // plain .mjs files: `import { N }` links from `diamond`, and fails from
    // `conflict` and `outer` with "contains conflicting star exports".
    const chunks = [
      shared('core', { exports: ['N'] }),
      shared('a', { starExports: ['core'] }),
      shared('b', { starExports: ['core'] }),
      shared('diamond', { starExports: ['a', 'b'] }),
      shared('c1', { exports: ['N'] }),
      shared('c2', { exports: ['N'] }),
      shared('conflict', { starExports: ['c1', 'c2'] }),
      shared('outer', { starExports: ['conflict', 'core'] }),
    ];
    const importing = (from: string) =>
      findSharedImportMismatches([importer('assets/a.js', { [from]: ['N'] })], chunks);

    it('passes it when both lines lead to the same binding', () => {
      expect(importing('diamond')).toEqual([]);
    });

    it('reports it as ambiguous when the lines lead to different bindings', () => {
      expect(importing('conflict')).toEqual([
        {
          importer: 'assets/a.js',
          packageName: 'conflict',
          missing: ['N'],
          ambiguous: [{ name: 'N', chunk: 'conflict', sources: ['c1', 'c2'] }],
        },
      ]);
    });

    it('reports it through a further export *, even when another line supplies it', () => {
      expect(importing('outer')).toEqual([
        expect.objectContaining({
          packageName: 'outer',
          missing: ['N'],
          ambiguous: [{ name: 'N', chunk: 'conflict', sources: ['c1', 'c2'] }],
        }),
      ]);
    });

    it('passes an own export of the name over the conflicting lines', () => {
      const shadowing = [
        ...chunks,
        shared('shadow', { exports: ['N'], starExports: ['c1', 'c2'] }),
      ];
      expect(
        findSharedImportMismatches(
          [importer('assets/a.js', { shadow: ['N'] })],
          shadowing
        )
      ).toEqual([]);
    });

    it('follows a re-export by name to the binding an export * line also reaches', () => {
      const viaName = [
        ...chunks,
        shared('named', { exports: ['N'], reExports: { N: { from: 'core', name: 'N' } } }),
        shared('mixed', { starExports: ['named', 'a'] }),
        // Reaches `a` by name after `a` was already asked for: still core's N.
        shared('via', { exports: ['N'], reExports: { N: { from: 'a', name: 'N' } } }),
        shared('later', { starExports: ['a', 'via'] }),
      ];
      expect(
        findSharedImportMismatches(
          [importer('assets/a.js', { mixed: ['N'], later: ['N'] })],
          viaName
        )
      ).toEqual([]);
    });

    it('passes it when the lines lead to one binding under two names', () => {
      // ES modules tell bindings apart by module and local name, not by the
      // name exported. Node 24 links both imports below as plain .mjs files.
      const aliased = [
        ...chunks,
        // const x = 1; export { x as N, x as y };
        shared('alias', { exports: ['N', 'y'], locals: { N: 'x', y: 'x' } }),
        // export { y as N } from "alias";
        shared('renamed', {
          exports: ['N'],
          reExports: { N: { from: 'alias', name: 'y' } },
        }),
        shared('aliases', { starExports: ['alias', 'renamed'] }),
        // function f() {} export { f as default, f };
        shared('fn', { exports: ['default', 'f'], locals: { default: 'f' } }),
        // export { default as f } from "fn";
        shared('fromDefault', {
          exports: ['f'],
          reExports: { f: { from: 'fn', name: 'default' } },
        }),
        shared('functions', { starExports: ['fn', 'fromDefault'] }),
      ];
      expect(
        findSharedImportMismatches(
          [importer('assets/a.js', { aliases: ['N'], functions: ['f'] })],
          aliased
        )
      ).toEqual([]);
    });

    it('lets a binding outside the shared chunks conflict with none', () => {
      // The guard has not read 'unshared', so it cannot tell whether the
      // binding there is the one another line leads to. The first binding
      // in a shared chunk is still what the other lines have to match.
      const outside = [
        ...chunks,
        shared('external', {
          exports: ['N'],
          reExports: { N: { from: 'unshared', name: 'N' } },
        }),
        shared('beside', { starExports: ['external', 'c1'] }),
        shared('stillConflicting', { starExports: ['external', 'c1', 'c2'] }),
      ];
      expect(
        findSharedImportMismatches(
          [
            importer('assets/a.js', {
              external: ['N'],
              beside: ['N'],
              stillConflicting: ['N'],
            }),
          ],
          outside
        )
      ).toEqual([
        {
          importer: 'assets/a.js',
          packageName: 'stillConflicting',
          missing: ['N'],
          ambiguous: [
            { name: 'N', chunk: 'stillConflicting', sources: ['c1', 'c2'] },
          ],
        },
      ]);
    });

    it('counts export * as ns as a binding of the chunk that does it', () => {
      // V8 links it that way: two chunks each doing `export * as ns from
      // "core"` give a third that re-exports both a conflicting `ns`.
      const namespaces = [
        ...chunks,
        shared('ns1', { exports: ['ns'] }),
        shared('ns2', { exports: ['ns'] }),
        shared('both', { starExports: ['ns1', 'ns2'] }),
      ];
      expect(
        findSharedImportMismatches([importer('assets/a.js', { both: ['ns'] })], namespaces)
      ).toEqual([expect.objectContaining({ missing: ['ns'] })]);
    });
  });
});

describe('formatSharedImportMismatchError', () => {
  const mfeFix = "Fix, where one of the MFE's own chunks imports the name";
  const sharedFix = 'Fix, where a shared chunk imports the name';

  it('names the importing chunk, the names, the package, the reason and the fix', () => {
    const message = formatSharedImportMismatchError([
      {
        importer: 'assets/a.js',
        packageName: 'pkg',
        missing: ['ratio', 'size'],
        discoveryFailure: 'named-export discovery failed: require("pkg") threw: x',
      },
    ]);
    expect(message).toContain("'assets/a.js' imports ratio, size from 'pkg'");
    expect(message).toContain('(named-export discovery failed: require("pkg") threw: x)');
    expect(message).toContain(mfeFix);
    // A failed discovery still leaves the whole module.exports as the default.
    expect(message).toContain("import pkg from 'pkg'; pkg.name");
    expect(message).toContain('build.rollupOptions.external');
    expect(message).not.toContain(sharedFix);
  });

  it('points a shared chunk importing the name at the package versions', () => {
    // Vendor code cannot import something else, so the MFE fix does not fit.
    const message = formatSharedImportMismatchError([
      {
        importer: 'shared/react-redux.js',
        importerPackage: 'react-redux',
        packageName: 'react',
        missing: ['useSyncExternalStore'],
      },
    ]);
    expect(message).toContain(
      "'shared/react-redux.js' imports useSyncExternalStore from 'react'"
    );
    expect(message).toContain(sharedFix);
    expect(message).toContain('install versions that do');
    expect(message).not.toContain(mfeFix);
  });

  it('says where an ambiguous name meets its two export * lines', () => {
    const message = formatSharedImportMismatchError([
      {
        importer: 'assets/a.js',
        packageName: 'outer',
        missing: ['N'],
        ambiguous: [{ name: 'N', chunk: 'conflict', sources: ['c1', 'c2'] }],
      },
    ]);
    expect(message).toContain("'assets/a.js' imports N from 'outer'");
    expect(message).toContain(
      "(N is ambiguous: 'conflict' has export * from both 'c1' and 'c2', " +
        'which supply it from different bindings)'
    );
    expect(message).toContain('Fix, where a name is ambiguous');
    expect(message).toContain('share that package too');
    // Importing another name or another package version does not resolve it.
    expect(message).not.toContain(mfeFix);
    expect(message).not.toContain(sharedFix);
  });

  it('gives the other fixes only for names that are not ambiguous', () => {
    const ambiguous: AmbiguousExport[] = [
      { name: 'N', chunk: 'conflict', sources: ['c1', 'c2'] },
    ];
    const fromSharedChunk = formatSharedImportMismatchError([
      {
        importer: 'shared/x.js',
        importerPackage: 'x',
        packageName: 'outer',
        missing: ['N'],
        ambiguous,
      },
    ]);
    expect(fromSharedChunk).not.toContain(sharedFix);

    const alsoMissing = formatSharedImportMismatchError([
      {
        importer: 'assets/a.js',
        packageName: 'outer',
        missing: ['N', 'other'],
        ambiguous,
      },
    ]);
    expect(alsoMissing).toContain(mfeFix);
    expect(alsoMissing).toContain('Fix, where a name is ambiguous');
  });

  it('leaves the ambiguity fix out when no name is ambiguous', () => {
    const message = formatSharedImportMismatchError([
      { importer: 'assets/a.js', packageName: 'pkg', missing: ['ratio'] },
    ]);
    expect(message).not.toContain('ambiguous');
  });
});

describe('findUncheckedNamespaceImports', () => {
  it('finds a namespace import of a chunk whose discovery failed', () => {
    const chunks = [
      shared('cjs-pkg', { exports: ['default'], discoveryFailure: 'boom' }),
      shared('esm-pkg', { exports: ['a'] }),
    ];
    expect(
      findUncheckedNamespaceImports(
        [
          importer('assets/a.js', { 'cjs-pkg': ['*'], 'esm-pkg': ['*'] }),
          importer('assets/b.js', { 'cjs-pkg': ['default'] }),
        ],
        chunks
      )
    ).toEqual([
      { importer: 'assets/a.js', packageName: 'cjs-pkg', discoveryFailure: 'boom' },
    ]);
  });

  it('formats the warning with the importing chunk, the package, the reason and the fix', () => {
    const message = formatUncheckedNamespaceImportWarning([
      { importer: 'assets/a.js', packageName: 'react', discoveryFailure: 'boom' },
    ]);
    expect(message).toContain("'assets/a.js' imports * from 'react'");
    expect(message).toContain('(boom)');
    expect(message).toContain("read the package through its default import");
    expect(message).toContain("import R from 'pkg'; R.name");
    expect(message).toContain('build.rollupOptions.external');
  });
});

// ── Fixture packages built with the real StandaloneEsmBuilder ────────────────

type Files = Record<string, string>;

/** CommonJS unless `type: "module"` is passed in `pkg`. */
const FIXTURES: Record<string, { pkg?: Record<string, unknown>; files: Files }> = {
  // Reads `window` at load, so Node's require() throws during discovery.
  'cjs-window': {
    files: { 'index.js': 'exports.ratio = window.devicePixelRatio;\n' },
  },
  // Node reads index.js; esbuild bundles browser.js, which has one more name.
  'cjs-browser': {
    pkg: { browser: './browser.js' },
    files: {
      'index.js': 'exports.a = 1;\n',
      'browser.js': 'exports.a = 1;\nexports.b = 2;\n',
    },
  },
  // No keys to discover, and nothing wrong with the chunk.
  'cjs-fn': {
    files: { 'index.js': 'module.exports = function () { return 4; };\n' },
  },
  'esm-nodefault': {
    pkg: { type: 'module' },
    files: { 'index.js': 'export const x = 5;\n' },
  },
  'cjs-uses-nodefault': {
    pkg: { dependencies: { 'esm-nodefault': '*' } },
    files: { 'index.js': 'exports.getX = () => require("esm-nodefault").x;\n' },
  },
  'esm-default': {
    pkg: { type: 'module' },
    files: { 'index.js': 'export default "d";\nexport const x = 6;\n' },
  },
  'cjs-uses-default': {
    pkg: { dependencies: { 'esm-default': '*' } },
    files: {
      'index.js':
        'exports.getX = () => require("esm-default").x;\n' +
        'exports.getDefault = () => require("esm-default").default;\n',
    },
  },
  // esbuild cannot list the names of `export *` from CommonJS.
  'esm-star-cjs': {
    pkg: { type: 'module' },
    files: {
      'index.js': 'export * from "./lib.cjs";\n',
      'lib.cjs': 'exports.fromCjs = 7;\n',
    },
  },
  'star-outer': {
    pkg: { type: 'module', dependencies: { 'star-inner': '*' } },
    files: { 'index.js': 'export * from "star-inner";\nexport const own = 1;\n' },
  },
  'star-inner': {
    pkg: { type: 'module' },
    files: { 'index.js': 'export const fromInner = 2;\nexport default 3;\n' },
  },
};

describe('shared chunks built from fixture packages', () => {
  const originalCwd = process.cwd();
  let root = '';
  let sharedChunks: SharedChunk[] = [];
  let minted: MintedSharedChunk[] = [];

  /** The mismatches an MFE chunk importing `names` from `pkg` would get. */
  function check(pkg: string, names: string[]) {
    return findSharedImportMismatches(
      [importer('assets/mfe.js', { [pkg]: names }), ...sharedChunks],
      sharedChunks
    );
  }

  /**
   * Loads one shared chunk in Node with every bare import of a shared chunk
   * pointed at that chunk's file, the way the handler points them at blob
   * URLs.
   */
  async function load(name: string): Promise<Record<string, unknown>> {
    const loadDir = path.join(root, 'load');
    fs.mkdirSync(loadDir, { recursive: true });
    for (const chunk of minted) {
      const source = fs
        .readFileSync(chunk.outfile, 'utf-8')
        .replace(/from "([^"]+)"/g, (statement, from: string) =>
          minted.some((other) => other.name === from)
            ? `from "./${StandaloneEsmBuilder.normalizeDepName(from)}.mjs"`
            : statement
        );
      fs.writeFileSync(
        path.join(loadDir, StandaloneEsmBuilder.normalizeDepName(chunk.name) + '.mjs'),
        source
      );
    }
    const file = path.join(loadDir, StandaloneEsmBuilder.normalizeDepName(name) + '.mjs');
    return (await import(/* @vite-ignore */ pathToFileURL(file).href)) as Record<
      string,
      unknown
    >;
  }

  beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-gts-shared-imports-'));
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"fixture-root"}\n');
    for (const [name, fixture] of Object.entries(FIXTURES)) {
      const dir = path.join(root, 'node_modules', name);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'package.json'),
        JSON.stringify({ name, version: '1.0.0', main: './index.js', ...fixture.pkg })
      );
      for (const [file, content] of Object.entries(fixture.files)) {
        fs.writeFileSync(path.join(dir, file), content);
      }
    }

    // See the esbuild mock at the top of the file.
    process.chdir(root);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const builder = new StandaloneEsmBuilder(
      Object.keys(FIXTURES),
      path.join(root, 'dist', 'shared'),
      root
    );
    minted = await builder.build((message) => {
      throw new Error(message);
    });
    sharedChunks = minted.map((chunk) => ({
      name: chunk.name,
      fileName: path.relative(path.join(root, 'dist'), chunk.outfile),
      discoveryFailure: chunk.discoveryFailure,
      ...readChunkLinkage(fs.readFileSync(chunk.outfile, 'utf-8'), parseAst),
    }));
  });

  afterAll(() => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('fails a name of a CommonJS package that cannot load in Node, and says why', () => {
    const [mismatch] = check('cjs-window', ['ratio']);
    expect(mismatch).toMatchObject({ packageName: 'cjs-window', missing: ['ratio'] });
    expect(mismatch.discoveryFailure).toMatch(
      /^named-export discovery failed: require\("cjs-window"\) threw: .*window is not defined/
    );
  });

  it('fails a name only the browser file of a CommonJS package has', () => {
    expect(check('cjs-browser', ['a', 'b'])).toEqual([
      expect.objectContaining({ packageName: 'cjs-browser', missing: ['b'] }),
    ]);
  });

  it('warns about a namespace import of a package whose discovery failed', () => {
    const [unchecked, ...rest] = findUncheckedNamespaceImports(
      [importer('assets/mfe.js', { 'cjs-window': ['*'], 'esm-default': ['*'] })],
      sharedChunks
    );
    expect(rest).toEqual([]);
    expect(unchecked).toMatchObject({ importer: 'assets/mfe.js', packageName: 'cjs-window' });
    expect(unchecked.discoveryFailure).toMatch(/window is not defined/);
  });

  it('reads every name through the default export when discovery failed', async () => {
    // The fix the error and the warning offer: the default export is the
    // whole module.exports, so a browser reads `ratio` through it.
    expect(check('cjs-window', ['default'])).toEqual([]);
    vi.stubGlobal('window', { devicePixelRatio: 2 });
    try {
      const mod = await load('cjs-window');
      expect((mod.default as { ratio: unknown }).ratio).toBe(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('passes a function-only CommonJS package imported by its default', () => {
    expect(check('cjs-fn', ['default'])).toEqual([]);
  });

  it('fails a name of an ESM entry that does export * from CommonJS', () => {
    expect(check('esm-star-cjs', ['fromCjs'])).toEqual([
      expect.objectContaining({ packageName: 'esm-star-cjs', missing: ['fromCjs'] }),
    ]);
  });

  it('passes names a shared chunk re-exports from a sibling through export *', () => {
    expect(check('star-outer', ['own', 'fromInner'])).toEqual([]);
    expect(check('star-outer', ['default'])).toEqual([
      expect.objectContaining({ packageName: 'star-outer', missing: ['default'] }),
    ]);
  });

  it('passes every import between the fixture shared chunks', () => {
    expect(findSharedImportMismatches(sharedChunks, sharedChunks)).toEqual([]);
  });

  it('lets CommonJS require an ESM shared chunk that has no default export', async () => {
    const mod = await load('cjs-uses-nodefault');
    expect((mod.getX as () => unknown)()).toBe(5);
  });

  it('lets CommonJS require an ESM shared chunk that has a default export', async () => {
    const mod = await load('cjs-uses-default');
    expect((mod.getX as () => unknown)()).toBe(6);
    expect((mod.getDefault as () => unknown)()).toBe('d');
  });
});
