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
import { parse as acornParse } from 'acorn';
import type { BuildOptions } from 'esbuild';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  StandaloneEsmBuilder,
  findCjsWrapperExport,
  findSharedImportMismatches,
  formatSharedImportMismatchError,
  patchCjsExternalsInSource,
  readChunkLinkage,
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

function parse(code: string): unknown {
  return acornParse(code, { ecmaVersion: 'latest', sourceType: 'module' });
}

function shared(
  name: string,
  overrides: Partial<Omit<SharedChunk, 'name'>> = {}
): SharedChunk {
  return {
    name,
    fileName: `shared/${name}.js`,
    exports: [],
    starExports: [],
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

    expect(readChunkLinkage(code, parse)).toEqual({
      exports: ['f', 'h', 'default', 'i', 'k', 'l', 'fn', 'Cls', 'string-name'],
      starExports: ['g'],
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

  it('skips namespace imports and specifiers that are not shared dependencies', () => {
    expect(
      findSharedImportMismatches(
        [importer('assets/a.js', { react: ['*'], './b.js': ['anything'] })],
        [shared('react', { exports: ['default'] })]
      )
    ).toEqual([]);
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
      ...readChunkLinkage(fs.readFileSync(chunk.outfile, 'utf-8'), parse),
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
