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
import { afterEach, describe, expect, it, vi } from 'vitest';

import { UnitProducer, type ProducedSharedPackage } from '../UnitProducer';

/**
 * Scenario: a CJS entry whose only surface is a reexport
 * (`module.exports = require('./cjs/react.production.js')`, React's
 * `index.js`) makes `cjs-module-lexer` report reexports and no named
 * exports. The pre-fix `cjsEntryNames` returned `undefined` for that
 * shape and relied on `@rollup/plugin-commonjs` to emit the named
 * exports — but the plugin emits only `default`, so
 * `import { createContext } from 'react'` threw
 * `SyntaxError: The requested module 'react' does not provide an
 * export named 'createContext'` at load time and the shell's `#root`
 * stayed empty.
 *
 * The fix follows `reexports` recursively — resolving each reexport
 * specifier from the reexporting file with the same
 * browser/production resolution the producer uses, lexing the
 * target, unioning the names, cycle-safe, deterministic sorted
 * output — like Node's ESM loader does with this lexer. An
 * unresolvable reexport falls back without crashing and reports.
 *
 * Coverage: a reexport-only entry in the React shape (conditional
 * `process.env.NODE_ENV` branches), chained reexports, a cycle, and
 * an unresolvable reexport.
 */

const roots: string[] = [];

function write(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function tmpRoot(label: string): string {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), `unit-producer-reexport-${label}-`))
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
  write(join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0', ...json }));
  for (const [rel, content] of Object.entries(files)) {
    write(join(dir, rel), content);
  }
}

async function produce(
  root: string,
  specifiers: readonly string[]
): Promise<ProducedSharedPackage[]> {
  return new UnitProducer({
    packageRoot: root,
    outputDir: join(root, 'out'),
    consumerSpecifiers: specifiers,
  }).produce((m) => {
    throw new Error(m);
  });
}

/** The emitted chunk text for an entry specifier, or `undefined`. */
function entryChunkText(
  root: string,
  produced: ProducedSharedPackage[],
  pkgName: string,
  specifier: string
): string | undefined {
  const p = produced.find((x) => x.name === pkgName);
  if (p === undefined) return undefined;
  const location = p.entryUnits[specifier];
  if (location === undefined) return undefined;
  // The output dir is `<root>/out`; the chunk is at `<root>/out/<location>`.
  const outDir = join(root, 'out');
  return readFileSync(join(outDir, location), 'utf-8');
}

/**
 * The named export surface of an emitted chunk — every name in an
 * `export { … }` clause, quoted or unquoted. `default` is excluded;
 * the facade's `export default` is not a named export.
 */
function namedExportsOf(chunkText: string): Set<string> {
  const names = new Set<string>();
  for (const m of chunkText.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const seg = part.trim();
      if (!seg) continue;
      // `X as "Y"` (quoted) — Y is the export name.
      const quoted = seg.match(/as\s+"([\w$]+)"/);
      if (quoted && quoted[1] !== 'default') {
        names.add(quoted[1]);
        continue;
      }
      // `X as Y` (unquoted) — Y is the export name.
      const unquoted = seg.match(/as\s+([\w$]+)$/);
      if (unquoted && unquoted[1] !== 'default') {
        names.add(unquoted[1]);
        continue;
      }
      // `"Y"` or `Y` (bare) — the name is the export.
      const bare = seg.match(/^"?([\w$]+)"?$/);
      if (bare && bare[1] !== 'default') {
        names.add(bare[1]);
      }
    }
  }
  return names;
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('UnitProducer — CJS reexport-only entry surface', () => {
  it('a reexport-only entry (React shape, conditional NODE_ENV branches) exposes the target named exports', async () => {
    // React's index.js shape: a conditional reexport whose two
    // branches both reexport a CJS file with named exports. The
    // lexer reports both reexports; the fix follows both and unions
    // the names — the branches export the same surface, so the union
    // is the production build's named exports.
    const root = tmpRoot('react-shape');
    write(
      join(root, 'package.json'),
      JSON.stringify({
        name: 'host',
        version: '0.0.0',
        dependencies: { 'reexport-cjs': '1.0.0' },
      })
    );
    pkg(
      root,
      'reexport-cjs',
      {
        type: 'commonjs',
        exports: { '.': './index.cjs' },
      },
      {
        'index.cjs': [
          '"use strict";',
          'if (process.env.NODE_ENV === "production") {',
          '  module.exports = require("./cjs/react.production.js");',
          '} else {',
          '  module.exports = require("./cjs/react.development.js");',
          '}',
          '',
        ].join('\n'),
        'cjs/react.production.js': [
          '"use strict";',
          'function createContext(defaultValue) {',
          '  return { $$typeof: Symbol.for("react.context"), _currentValue: defaultValue };',
          '}',
          'function createElement(type, props, children) {',
          '  return { type, props: props || {}, children: children };',
          '}',
          'const Fragment = Symbol.for("react.fragment");',
          'module.exports = { createContext, createElement, Fragment };',
        ].join('\n'),
        'cjs/react.development.js': [
          '"use strict";',
          'function createContext(defaultValue) {',
          '  return { $$typeof: Symbol.for("react.context"), _currentValue: defaultValue, _isDev: true };',
          '}',
          'function createElement(type, props, children) {',
          '  return { type, props: props || {}, children: children, _isDev: true };',
          '}',
          'const Fragment = Symbol.for("react.fragment");',
          'module.exports = { createContext, createElement, Fragment };',
        ].join('\n'),
      }
    );

    const produced = await produce(root, ['reexport-cjs']);
    const chunkText = entryChunkText(root, produced, 'reexport-cjs', 'reexport-cjs');
    expect(chunkText, 'entry chunk must be emitted').toBeDefined();
    const names = namedExportsOf(chunkText!);
    // The pre-fix chunk carried only `export default`; the named
    // imports the shell takes from `react` would have thrown
    // `does not provide an export named 'createContext'`.
    expect(names.has('createContext')).toBe(true);
    expect(names.has('createElement')).toBe(true);
    expect(names.has('Fragment')).toBe(true);
  }, 120000);

  it('chained reexports (A → B → C) expose the leaf target named exports', async () => {
    const root = tmpRoot('chained');
    write(
      join(root, 'package.json'),
      JSON.stringify({
        name: 'host',
        version: '0.0.0',
        dependencies: { 'chain-cjs': '1.0.0' },
      })
    );
    pkg(
      root,
      'chain-cjs',
      {
        type: 'commonjs',
        exports: { '.': './a.cjs' },
      },
      {
        'a.cjs': '"use strict";\nmodule.exports = require("./b.cjs");\n',
        'b.cjs': '"use strict";\nmodule.exports = require("./c.cjs");\n',
        'c.cjs': [
          '"use strict";',
          'function foo() { return "foo"; }',
          'function bar() { return "bar"; }',
          'module.exports = { foo, bar };',
        ].join('\n'),
      }
    );

    const produced = await produce(root, ['chain-cjs']);
    const chunkText = entryChunkText(root, produced, 'chain-cjs', 'chain-cjs');
    expect(chunkText).toBeDefined();
    const names = namedExportsOf(chunkText!);
    expect(names.has('foo')).toBe(true);
    expect(names.has('bar')).toBe(true);
  }, 120000);

  it('a reexport cycle terminates without infinite recursion and completes the build', async () => {
    const root = tmpRoot('cycle');
    write(
      join(root, 'package.json'),
      JSON.stringify({
        name: 'host',
        version: '0.0.0',
        dependencies: { 'cycle-cjs': '1.0.0' },
      })
    );
    pkg(
      root,
      'cycle-cjs',
      {
        type: 'commonjs',
        exports: { '.': './a.cjs' },
      },
      {
        'a.cjs': '"use strict";\nmodule.exports = require("./b.cjs");\n',
        'b.cjs': '"use strict";\nmodule.exports = require("./a.cjs");\n',
      }
    );

    // The fix must not follow the cycle forever: the visited set
    // terminates the recursion. The build completes — no named
    // exports are recovered (neither file has any), so the entry
    // keeps its direct input and `@rollup/plugin-commonjs` handles
    // the CJS cycle the way it always has.
    const produced = await produce(root, ['cycle-cjs']);
    expect(produced.length).toBeGreaterThan(0);
    const chunkText = entryChunkText(root, produced, 'cycle-cjs', 'cycle-cjs');
    expect(chunkText).toBeDefined();
  }, 120000);

  it('an unresolvable reexport falls back without crashing and reports', async () => {
    // The entry reexports a Node.js builtin (`node:fs`) — the
    // production-runtime screen skips builtins (`isBuiltin`), and
    // the bundler externalizes `node:`-prefixed specifiers, so the
    // build proceeds. The reexport follower cannot resolve `node:fs`
    // to a CJS file (esbuild treats it as external), skips it without
    // crashing, and reports a warning. The entry has no recoverable
    // named exports, so the chunk keeps its direct input.
    const root = tmpRoot('unresolvable');
    write(
      join(root, 'package.json'),
      JSON.stringify({
        name: 'host',
        version: '0.0.0',
        dependencies: { 'unresolvable-reexport-cjs': '1.0.0' },
      })
    );
    pkg(
      root,
      'unresolvable-reexport-cjs',
      {
        type: 'commonjs',
        exports: { '.': './index.cjs' },
      },
      {
        'index.cjs':
          '"use strict";\nmodule.exports = require("node:fs");\n',
      }
    );

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const produced = await produce(root, ['unresolvable-reexport-cjs']);
      expect(produced.length).toBeGreaterThan(0);
      // The follower reported the unresolvable reexport.
      expect(
        warnSpy.mock.calls.some(
          (c) =>
            typeof c[0] === 'string' &&
            c[0].includes('could not follow reexport') &&
            c[0].includes('node:fs')
        )
      ).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  }, 120000);

  it('a TS-compiled entry with own exports + `__exportStar(require("./x"), exports)` exposes the reexported names too', async () => {
    // TypeScript's CJS emit for a barrel that mixes `exports.X = …`
    // (or `Object.defineProperty(exports, "X", …)`) with
    // `__exportStar(require("./other"), exports)` reports both named
    // exports and a reexport to `cjs-module-lexer`. The pre-fix code
    // returned the own exports as soon as it saw them and skipped the
    // reexport, so the facade minted by the producer exposed only the
    // own names — `import { InvalidSegmentError } from
    // '@globaltypesystem/gts-ts'` (a name reexported from `./types`)
    // threw `does not provide an export named 'InvalidSegmentError'`
    // at load time. The fix follows the `__exportStar` reexport and
    // unions its target's named exports with the entry's own.
    //
    // The fixture mirrors `@globaltypesystem/gts-ts`'s `dist/index.js`:
    //  - `Object.defineProperty(exports, "__esModule", { value: true })`
    //  - a `__exportStar(require("./types"), exports)` reexport at the
    //    top of the file
    //  - several `Object.defineProperty(exports, "X", { … get … })`
    //    own exports over `require("./gts")` etc.
    //  - a few `exports.X = …` shorthand own exports
    const root = tmpRoot('ts-shape');
    write(
      join(root, 'package.json'),
      JSON.stringify({
        name: 'host',
        version: '0.0.0',
        dependencies: { 'ts-shape-cjs': '1.0.0' },
      })
    );
    pkg(
      root,
      'ts-shape-cjs',
      {
        type: 'commonjs',
        exports: { '.': './index.cjs' },
      },
      {
        'index.cjs': [
          '"use strict";',
          'var __exportStar = (function (m, exports) {',
          '  for (var p in m) if (p !== "default" && !exports.hasOwnProperty(p)) exports[p] = m[p];',
          '});',
          'Object.defineProperty(exports, "__esModule", { value: true });',
          'exports.OwnAlpha = void 0;',
          '__exportStar(require("./types"), exports);',
          'var gts_1 = require("./gts");',
          'Object.defineProperty(exports, "Gts", { enumerable: true, get: function () { return gts_1.Gts; } });',
          'const ownBeta = 42;',
          'exports.OwnBeta = ownBeta;',
          'exports.OwnAlpha = "alpha";',
          '',
        ].join('\n'),
        'types.cjs': [
          '"use strict";',
          'Object.defineProperty(exports, "__esModule", { value: true });',
          'exports.InvalidSegmentError = void 0;',
          'exports.GTS_PREFIX = "gts.";',
          'exports.MAX_ID_LENGTH = 1024;',
          'class InvalidSegmentError extends Error {',
          '  constructor() { super("invalid segment"); this.name = "InvalidSegmentError"; }',
          '}',
          'exports.InvalidSegmentError = InvalidSegmentError;',
          '',
        ].join('\n'),
        'gts.cjs': [
          '"use strict";',
          'class Gts { static parse() { return "gts"; } }',
          'module.exports = { Gts };',
          '',
        ].join('\n'),
      }
    );

    const produced = await produce(root, ['ts-shape-cjs']);
    const chunkText = entryChunkText(root, produced, 'ts-shape-cjs', 'ts-shape-cjs');
    expect(chunkText, 'entry chunk must be emitted').toBeDefined();
    const names = namedExportsOf(chunkText!);
    // Own exports (lexer-detected) — must be exposed by the facade.
    expect(names.has('OwnAlpha')).toBe(true);
    expect(names.has('OwnBeta')).toBe(true);
    expect(names.has('Gts')).toBe(true);
    // Reexported names from `./types` — the pre-fix lost these.
    expect(names.has('InvalidSegmentError')).toBe(true);
    expect(names.has('GTS_PREFIX')).toBe(true);
    expect(names.has('MAX_ID_LENGTH')).toBe(true);
  }, 120000);

  it('a 300-reexport barrel completes the produce under a time bound and exposes the reexported names the lexer recovers', async () => {
    // date-fns's root barrel reexports 245; the pre-fix capped the
    // walk at 50, which left any barrel past the cap relying on the
    // commonjs plugin's interop. The cap is gone now — the walk is
    // memoized per resolved file (one lex per file per build) so a
    // large barrel stays fast. A 300-reexport barrel (one above the
    // recorded date-fns count) must complete the produce under a
    // time bound and expose every reexported name the lexer recovers.
    //
    // `cjs-module-lexer`'s grammar recognises up to 255 reexports per
    // file (a lexer-side cap independent of this code); the pre-fix's
    // own 50-cap sat well below it. The fix has no count limit of its
    // own, so for a 300-reexport barrel the walk follows all 255
    // reexports the lexer reports (the first 255 in source order) and
    // unions their named exports into the facade — proving the 50-cap
    // is gone (255 > 50) and the walk completes in bounded time.
    const N = 300;
    const LEXER_REPORTED = 255; // lexer-side cap; the fix follows all of them
    const root = tmpRoot('barrel-300');
    write(
      join(root, 'package.json'),
      JSON.stringify({
        name: 'host',
        version: '0.0.0',
        dependencies: { 'barrel-300-cjs': '1.0.0' },
      })
    );
    const barrelLines: string[] = ['"use strict";'];
    const leafFiles: Record<string, string> = {};
    for (let i = 0; i < N; i++) {
      const leaf = `mod_${i}.cjs`;
      // Each leaf has one unique named export — the union of all
      // reexport targets' names is N distinct names.
      leafFiles[leaf] = [
        '"use strict";',
        `exports.leafExport_${i} = function () { return ${i}; };`,
        '',
      ].join('\n');
      barrelLines.push(`var _m${i} = require("./${leaf}");`);
      barrelLines.push(
        `Object.keys(_m${i}).forEach(function (k) { if (k === "default" || k === "__esModule") return; Object.defineProperty(exports, k, { enumerable: true, get: function () { return _m${i}[k]; } }); });`
      );
    }
    barrelLines.push('');
    pkg(
      root,
      'barrel-300-cjs',
      {
        type: 'commonjs',
        exports: { '.': './index.cjs' },
      },
      {
        'index.cjs': barrelLines.join('\n'),
        ...leafFiles,
      }
    );

    const t0 = process.hrtime.bigint();
    const produced = await produce(root, ['barrel-300-cjs']);
    const t1 = process.hrtime.bigint();
    const seconds = Number(t1 - t0) / 1e9;
    // The walk is memoized; the bound is generous so a cold CI machine
    // still passes, but tight enough that losing the memoization
    // (re-lexing the barrel's 300 leaves at every visit) would fail.
    expect(seconds, `produce took ${seconds}s — must complete under 120s`).toBeLessThan(120);
    const chunkText = entryChunkText(root, produced, 'barrel-300-cjs', 'barrel-300-cjs');
    expect(chunkText, 'entry chunk must be emitted').toBeDefined();
    const names = namedExportsOf(chunkText!);
    // The lexer reports the first 255 reexports in source order; the
    // fix follows all of them (no count limit) and the facade exposes
    // every recovered name. 255 is well past the pre-fix 50-cap, so
    // a regression that re-introduces a count limit below the lexer's
    // own cap would fail this assertion.
    expect(names.size, 'named export count in the facade').toBe(LEXER_REPORTED);
    for (let i = 0; i < LEXER_REPORTED; i++) {
      expect(names.has(`leafExport_${i}`), `leaf ${i} export present`).toBe(true);
    }
    // Names past the lexer's per-file cap are not reported — the
    // facade cannot expose what the lexer never saw. This is a
    // lexer-grammar limit, not a count limit in this code.
    for (let i = LEXER_REPORTED; i < N; i++) {
      expect(names.has(`leafExport_${i}`), `leaf ${i} not recovered by the lexer`).toBe(false);
    }
  }, 120000);
});
