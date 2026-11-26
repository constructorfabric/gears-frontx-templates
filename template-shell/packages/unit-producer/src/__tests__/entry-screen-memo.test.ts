import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { EntryClosureMemo } from '../EntryClosureMemo';
import { EntryScreen, type ScreenedPackage, type ScreenFailure } from '../EntryScreen';
import { EntryScreenLedger } from '../EntryScreenLedger';
import { ModuleLinkageScanner } from '../ModuleLinkageScanner';
import { PackageEntryFileResolver } from '../PackageEntryFileResolver';
import { PackageEntrySet } from '../PackageEntrySet';
import { SharedSetResolver } from '../SharedSetResolver';
import { SkippedEntryIndex } from '../SkippedEntryIndex';

/**
 * The entry screen's per-run memo (`warm_build_screen_memo`):
 *  A — each entry's closure is computed once per memo;
 *  B — each file's load edges and each relative resolution once per memo,
 *      closures assembled from them in the unmemoized walk's order;
 *  D — the skip fixpoint re-screens only entries whose earlier screen
 *      read a skip-index value a new skip changed, reaching the same
 *      skips, in the same order, with the same reasons.
 */

const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

function write(file: string, content: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function tmpRoot(label: string): string {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), `unit-producer-memo-${label}-`)));
  roots.push(root);
  return root;
}

function pkg(
  root: string,
  name: string,
  json: Record<string, unknown>,
  files: Record<string, string>
): ScreenedPackage {
  const dir = path.join(root, 'node_modules', name);
  const manifest = { name, version: '1.0.0', ...json };
  write(path.join(dir, 'package.json'), JSON.stringify(manifest));
  for (const [rel, content] of Object.entries(files)) write(path.join(dir, rel), content);
  return { name, packageDir: dir, resolveDir: dir, pkg: manifest as ScreenedPackage['pkg'] };
}

/**
 * The closure walk as it ran before the memo — every file read and
 * parsed on every walk, relative specifiers resolved on the spot,
 * `queue.shift()` order. The memoized walk must return exactly this.
 */
function referenceClosure(packageDir: string, file: string): unknown {
  const bare = new Map<
    string,
    { specifier: string; via: string; kind: 'import' | 'require'; optional: boolean }
  >();
  const opaque: Array<{ via: string; expression: string }> = [];
  const seen = new Set<string>();
  const queue = [file];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);
    let source: string;
    try {
      source = readFileSync(current, 'utf-8');
    } catch {
      continue;
    }
    const edges = ModuleLinkageScanner.loadEdges(source, path.basename(current));
    if (edges === undefined) continue;
    const rel = EntryClosureMemo.moduleRel(packageDir, current) ?? current;
    for (const o of edges.opaqueRequires) opaque.push({ via: rel, expression: o.expression });
    const reached = [
      ...edges.statements
        .filter((s) => !s.typeOnly)
        .map((s) => ({ spec: s.specifier, kind: 'import' as const, optional: false })),
      ...edges.requireCalls.map((r) => ({
        spec: r.specifier,
        kind: 'require' as const,
        optional: r.optional,
      })),
    ];
    for (const { spec, kind, optional } of reached) {
      if (spec.startsWith('.')) {
        const target = EntryClosureMemo.resolveRelative(current, spec);
        if (target !== undefined && !path.relative(packageDir, target).startsWith('..')) {
          queue.push(target);
        }
      } else if (!spec.startsWith('/') && !bare.has(spec)) {
        bare.set(spec, { specifier: spec, via: current, kind, optional });
      }
    }
  }
  return {
    bare: [...bare.values()].sort((a, b) =>
      a.specifier < b.specifier ? -1 : a.specifier > b.specifier ? 1 : 0
    ),
    opaque: opaque.sort((a, b) => (a.via < b.via ? -1 : a.via > b.via ? 1 : 0)),
  };
}

/**
 * One package whose modules share most of their closures and exercise
 * every walk rule: cycles, the same bare specifier reached along two
 * paths (first reach wins), `require()` inside and outside `try`,
 * opaque requires, type-only imports, directory `index` resolution, an
 * escape outside the package, a missing relative target and an
 * unparseable module.
 */
function closureFixture(root: string): { dir: string; files: string[] } {
  const p = pkg(root, 'walk', { type: 'module' }, {
    'index.js': [
      "import './a.js';",
      "import { b } from './b.js';",
      "export * from './dir';",
      "import 'zeta';",
      'export { b };',
    ].join('\n'),
    'a.js': ["import './b.js';", "import 'alpha';", "import '../outside/x.js';", "import './missing.js';"].join('\n'),
    'b.js': ["import './a.js';", "import 'alpha/sub';", "import type { T } from 'types-only';", 'export const b = 1;'].join('\n'),
    'dir/index.js': ["import 'alpha';", "import './broken.js';", "export const d = 1;"].join('\n'),
    'broken.js': 'export const = ;',
    'dir/broken.js': 'export const x = ((;',
    'cjs.cjs': [
      "const beta = require('beta');",
      "try { require('gamma'); } catch {}",
      'const dyn = require(name);',
      "module.exports = require('./cjs-inner.cjs');",
    ].join('\n'),
    'cjs-inner.cjs': ["const a = require('alpha');", 'module.exports = require(other + "x");'].join('\n'),
  });
  write(path.join(root, 'node_modules', 'outside', 'x.js'), "import 'never-reached';");
  const files = [
    'index.js',
    'a.js',
    'b.js',
    'dir/index.js',
    'broken.js',
    'cjs.cjs',
    'cjs-inner.cjs',
    'absent.js',
  ].map((f) => path.join(p.packageDir, f));
  return { dir: p.packageDir, files };
}

describe('EntryClosureMemo (A, B)', () => {
  it('returns exactly the unmemoized walk for every entry, in any query order', () => {
    const root = tmpRoot('ref');
    const { dir, files } = closureFixture(root);
    const memo = new EntryClosureMemo();
    for (const file of [...files, ...[...files].reverse()]) {
      expect(memo.closure(dir, file)).toEqual(referenceClosure(dir, file));
    }
    const index = memo.closure(dir, files[0]);
    // First reach wins: `alpha` is reached from a.js before b.js/dir.
    expect(index.bare.map((b) => [b.specifier, path.basename(b.via), b.kind])).toEqual([
      ['alpha', 'a.js', 'import'],
      ['alpha/sub', 'b.js', 'import'],
      ['zeta', 'index.js', 'import'],
    ]);
    const cjs = memo.closure(dir, files[5]);
    expect(cjs.bare.map((b) => [b.specifier, b.kind, b.optional])).toEqual([
      ['alpha', 'require', false],
      ['beta', 'require', false],
      ['gamma', 'require', true],
    ]);
    expect(cjs.opaque.map((o) => o.via)).toEqual(['cjs-inner.cjs', 'cjs.cjs']);
  });

  it('reads and parses each file once per memo, and computes each entry closure once', () => {
    const root = tmpRoot('hits');
    const { dir, files } = closureFixture(root);
    const reads = new Map<string, number>();
    const memo = new EntryClosureMemo((file) => {
      reads.set(file, (reads.get(file) ?? 0) + 1);
      return readFileSync(file, 'utf-8');
    });
    const first = files.map((f) => memo.closure(dir, f));
    expect([...reads.values()].every((n) => n === 1)).toBe(true);
    const readsAfterFirstPass = [...reads.entries()];
    const second = files.map((f) => memo.closure(dir, f));
    // A: the same closure object is returned; B: no further reads.
    second.forEach((c, i) => expect(c).toBe(first[i]));
    expect([...reads.entries()]).toEqual(readsAfterFirstPass);
    // An unreadable file is remembered as unreadable — not retried.
    expect(reads.get(files[7])).toBe(1);
  });

  it('never shares results between memo instances (no state outlives its owner)', () => {
    const root = tmpRoot('owner');
    const { dir, files } = closureFixture(root);
    const before = new EntryClosureMemo().closure(dir, files[1]);
    write(files[1], "import 'changed';");
    const stale = new EntryClosureMemo();
    const after = stale.closure(dir, files[1]);
    expect(before.bare.map((b) => b.specifier)).toContain('alpha');
    expect(after.bare.map((b) => b.specifier)).toEqual(['changed']);
    expect(after).toEqual(referenceClosure(dir, files[1]));
  });
});

/**
 * Skip-chain fixture. `a/bad` is the seed skip (its closure needs a
 * specifier nothing provides); everything else fails only transitively:
 *  - `b/x` imports `a/bad` (by specifier);
 *  - `c/z` re-exports `b/x` through an inner module (a chained skip);
 *  - `e/top` imports `c/z` (three hops from the seed);
 *  - `d/alias` imports `a/alias`, another specifier for `a/bad`'s file
 *    (by file, declared dependency);
 *  - `g/undeclared` imports `a/alias` without declaring `a` (by file,
 *    undeclared);
 *  - `f/opt` reaches only the optional peer `optp`; `f/both` reaches the
 *    optional peer and `c/z`.
 * Builds are visited in an order that makes the fixpoint need several
 * rounds.
 */
function skipFixture(root: string) {
  const a = pkg(root, 'a', {
    exports: { '.': './index.js', './bad': './bad.js', './alias': './bad.js' },
  }, { 'index.js': 'export const a = 1;', 'bad.js': "import 'nope-not-installed';" });
  const b = pkg(root, 'b', {
    dependencies: { a: '1.0.0' },
    exports: { './x': './x.js', './y': './y.js' },
  }, { 'x.js': "import 'a/bad';", 'y.js': "import './inner.js';", 'inner.js': "import 'a';" });
  const c = pkg(root, 'c', {
    dependencies: { b: '1.0.0' },
    exports: { './z': './z.js', './w': './w.js' },
  }, { 'z.js': "import { q } from './lib/q.js'; export { q };", 'lib/q.js': "export * from 'b/x'; export const q = 1;", 'w.js': "import 'b/y';" });
  const d = pkg(root, 'd', { dependencies: { a: '1.0.0' }, exports: { './alias': './alias.js', './ok': './ok.js' } }, {
    'alias.js': "import 'a/alias';",
    'ok.js': "import 'a';",
  });
  const e = pkg(root, 'e', { dependencies: { c: '1.0.0' }, exports: { './top': './top.js' } }, {
    'top.js': "import 'c/z';",
  });
  const f = pkg(root, 'f', {
    dependencies: { c: '1.0.0' },
    peerDependencies: { optp: '1.0.0' },
    peerDependenciesMeta: { optp: { optional: true } },
    exports: { './opt': './opt.js', './both': './both.js' },
  }, { 'opt.js': "import 'optp';", 'both.js': "import 'optp'; import 'c/z';" });
  const g = pkg(root, 'g', { exports: { './undeclared': './u.js', './fine': './fine.js' } }, {
    'u.js': "import 'a/alias';",
    'fine.js': "import 'a';",
  });
  const entry = (p: ScreenedPackage, sub: string, rel: string): [string, string] => [
    `${p.name}/${sub}`,
    realpathSync(path.join(p.packageDir, rel)),
  ];
  const builds = (): Array<{ dep: ScreenedPackage; entryFiles: Map<string, string> }> => [
    { dep: e, entryFiles: new Map([entry(e, 'top', 'top.js')]) },
    { dep: c, entryFiles: new Map([entry(c, 'z', 'z.js'), entry(c, 'w', 'w.js')]) },
    { dep: f, entryFiles: new Map([entry(f, 'opt', 'opt.js'), entry(f, 'both', 'both.js')]) },
    { dep: d, entryFiles: new Map([entry(d, 'alias', 'alias.js'), entry(d, 'ok', 'ok.js')]) },
    { dep: g, entryFiles: new Map([entry(g, 'undeclared', 'u.js'), entry(g, 'fine', 'fine.js')]) },
    { dep: b, entryFiles: new Map([entry(b, 'x', 'x.js'), entry(b, 'y', 'y.js')]) },
  ];
  const seed = (skipped: SkippedEntryIndex): void => {
    skipped.add('a/bad', realpathSync(path.join(a.packageDir, 'bad.js')), 'seed: needs nope-not-installed');
  };
  return { builds, seed };
}

/**
 * The transitive-skip fixpoint loop exactly as `UnitProducer.propagateSkips`
 * runs it, over an injected screen. Returns every confirmed skip in
 * order, with its reason, plus the number of rounds.
 */
async function fixpoint(
  builds: Array<{ dep: ScreenedPackage; entryFiles: Map<string, string> }>,
  skipped: SkippedEntryIndex,
  delivered: ReadonlySet<string>,
  failureOf: (dep: ScreenedPackage, file: string) => Promise<ScreenFailure | undefined>
): Promise<{ skips: string[]; rounds: number }> {
  const skips: string[] = [];
  let rounds = 0;
  for (;;) {
    rounds++;
    let changed = false;
    for (const build of builds) {
      for (const [spec, file] of [...build.entryFiles]) {
        const failing = await failureOf(build.dep, file);
        if (failing === undefined) continue;
        if (failing.optionalPeer !== undefined) {
          const peerRoot = SharedSetResolver.extractRootPackageName(failing.specifier);
          if (peerRoot === build.dep.name || delivered.has(peerRoot)) continue;
        }
        const reason = `its closure reaches "${failing.specifier}": ${failing.reason}`;
        skipped.add(spec, file, reason);
        build.entryFiles.delete(spec);
        skips.push(`${spec} | ${reason}`);
        changed = true;
      }
    }
    if (!changed) return { skips, rounds };
  }
}

describe('EntryScreenLedger (D) — incremental skip fixpoint', () => {
  for (const delivered of [
    ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
    ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'optp'],
  ]) {
    it(`reaches the unmemoized fixpoint exactly — same skips, order, reasons (delivered: ${delivered.length === 8 ? 'with' : 'without'} the optional peer)`, async () => {
      const root = tmpRoot('fixpoint');
      const fixture = skipFixture(root);
      const deliveredSet = new Set(delivered);

      // Reference: every round re-screens every entry from scratch
      // (a fresh closure walk per screen — the pre-memo behaviour).
      const naiveSkipped = new SkippedEntryIndex();
      fixture.seed(naiveSkipped);
      let naiveScreens = 0;
      const naive = await fixpoint(fixture.builds(), naiveSkipped, deliveredSet, (dep, file) => {
        naiveScreens++;
        return PackageEntrySet.entryClosureFailure(dep, file, naiveSkipped);
      });

      const ledgerSkipped = new SkippedEntryIndex();
      fixture.seed(ledgerSkipped);
      const screen = new EntryScreen(new PackageEntryFileResolver(), new EntryClosureMemo());
      const screenOnce = screen.screen.bind(screen);
      let ledgerScreens = 0;
      screen.screen = (...args) => {
        ledgerScreens++;
        return screenOnce(...args);
      };
      const ledger = new EntryScreenLedger(screen, ledgerSkipped);
      const incremental = await fixpoint(fixture.builds(), ledgerSkipped, deliveredSet, (dep, file) =>
        ledger.failure(dep, file)
      );

      expect(incremental).toEqual(naive);
      expect(naive.rounds).toBeGreaterThanOrEqual(3);
      const skippedSpecs = naive.skips.map((s) => s.split(' | ')[0]);
      expect(skippedSpecs).toEqual(
        delivered.includes('optp')
          ? ['d/alias', 'g/undeclared', 'b/x', 'c/z', 'f/both', 'e/top']
          : ['f/opt', 'f/both', 'd/alias', 'g/undeclared', 'b/x', 'c/z', 'e/top']
      );
      // Chained, by-specifier, by-file (declared and undeclared) reasons.
      expect(naive.skips.find((s) => s.startsWith('c/z'))).toContain('"b/x" is a skipped entry');
      expect(naive.skips.find((s) => s.startsWith('e/top'))).toContain('"c/z" is a skipped entry');
      expect(naive.skips.find((s) => s.startsWith('d/alias'))).toContain('resolves to skipped entry "a/bad"');
      expect(naive.skips.find((s) => s.startsWith('g/undeclared'))).toContain('resolves to skipped entry "a/bad"');
      // Fewer screens: only entries whose reads a new skip changed.
      expect(ledgerScreens).toBeLessThan(naiveScreens);
    });
  }

  it('re-screens an entry only when a new skip changes a value its screen read', async () => {
    const root = tmpRoot('stale');
    const fixture = skipFixture(root);
    const skipped = new SkippedEntryIndex();
    fixture.seed(skipped);
    const screen = new EntryScreen(new PackageEntryFileResolver(), new EntryClosureMemo());
    const screenOnce = screen.screen.bind(screen);
    const screened: string[] = [];
    screen.screen = (dep, file, lookup) => {
      screened.push(`${dep.name}:${path.basename(file)}`);
      return screenOnce(dep, file, lookup);
    };
    const ledger = new EntryScreenLedger(screen, skipped);
    const [e, c, , , , b] = fixture.builds();
    const top = e.entryFiles.get('e/top')!;
    const w = c.entryFiles.get('c/w')!;
    const x = b.entryFiles.get('b/x')!;

    expect(await ledger.failure(e.dep, top)).toBeUndefined();
    expect(await ledger.failure(c.dep, w)).toBeUndefined();
    expect(await ledger.failure(e.dep, top)).toBeUndefined();
    expect(screened).toEqual(['e:top.js', 'c:w.js']);

    // An unrelated skip (another root, another specifier) leaves both cached.
    skipped.add('unrelated/x', path.join(root, 'unrelated.js'), 'unrelated');
    expect(await ledger.failure(e.dep, top)).toBeUndefined();
    expect(await ledger.failure(c.dep, w)).toBeUndefined();
    expect(screened).toEqual(['e:top.js', 'c:w.js']);

    // `c/z` skipped: `e/top` read `forSpecifier('c/z')` — re-screened and
    // now fails; `c/w` read only `b/y` and root `b`, so it stays cached.
    skipped.add('c/z', c.entryFiles.get('c/z')!, 'chained');
    expect(await ledger.failure(e.dep, top)).toMatchObject({ specifier: 'c/z' });
    expect(await ledger.failure(c.dep, w)).toBeUndefined();
    expect(screened).toEqual(['e:top.js', 'c:w.js', 'e:top.js']);

    // A first skip under root `b` changes `hasSkippedForRoot('b')`,
    // which `c/w` read — re-screened, still passing.
    skipped.add('b/x', x, 'chained');
    expect(await ledger.failure(c.dep, w)).toBeUndefined();
    expect(screened).toEqual(['e:top.js', 'c:w.js', 'e:top.js', 'c:w.js']);
  });

  it('matches the public one-shot screen on every fixture entry', async () => {
    const root = tmpRoot('oneshot');
    const fixture = skipFixture(root);
    const skipped = new SkippedEntryIndex();
    fixture.seed(skipped);
    const shared = new EntryScreen(new PackageEntryFileResolver(), new EntryClosureMemo());
    for (const { dep, entryFiles } of fixture.builds()) {
      for (const file of entryFiles.values()) {
        expect(await shared.screen(dep, file, skipped)).toEqual(
          await PackageEntrySet.screenEntry(dep, file, skipped)
        );
      }
    }
  });
});
