/**
 * `PackageEntrySet` — computes a package's complete entry set
 * — every `exports` subpath (or `main`/
 * `module`/`browser`/`index.js` when no `exports` map exists) plus every
 * module a public barrel re-exports, split into member entries only
 * when side-effect-free by the standard bundlers' semantics:
 * the `sideEffects` field including globs, or — when absent — a barrel
 * proven to be a pure re-export list. A barrel that cannot be split
 * stays a whole-entry chunk and is reported with the package, the
 * reason and a one-line fix.
 *
 * A pattern export (`./*`) contributes only the package's runtime entry
 * candidates ({@link PackageExportPatternExpander}); an entry whose
 * load closure — imports and `require()` calls — needs a specifier no
 * production browser runtime can load is excluded with a report line.
 *
 * The set depends on the package alone — never on any consumer — so
 * every runtime's chunks of `package@version` are byte-identical.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { BarrelRewritePolicy } from './BarrelRewritePolicy';
import { EntryClosureMemo } from './EntryClosureMemo';
import { EntryScreen } from './EntryScreen';
import { ModuleLinkageScanner } from './ModuleLinkageScanner';
import { PackageEntryFileResolver } from './PackageEntryFileResolver';
import { PackageExportPatternExpander } from './PackageExportPatternExpander';
import { SkippedEntryIndex } from './SkippedEntryIndex';

/** One unsplittable barrel, for the build report. */
export interface BarrelNote {
  /** The entry specifier carrying the barrel (e.g. `pkg`). */
  entry: string;
  reason: string;
  /** One-line fix the report prints. */
  fix: string;
}

/** One entry dropped by the production-runtime screen. */
export interface ExcludedEntry {
  /** The entry specifier that left the set (`pkg/testing`). */
  entry: string;
  /** The resolved file the entry named. */
  file: string;
  /** The specifier its closure could never load. */
  specifier: string;
  reason: string;
  /**
   * Set when the failure is an optional-peer reach: the entry
   * is deferred, not excluded — it stays buildable while the peer is
   * delivered, and is confirmed skipped only when the peer never joins
   * the delivered set.
   */
  optionalPeer?: string;
}

/** A `require(<non-literal>)` an entry's closure keeps — reported. */
export interface RuntimeRequire {
  /** The entry specifier whose closure carries it. */
  entry: string;
  /** The module holding the call, package-relative. */
  via: string;
  /** The argument's source text. */
  expression: string;
}

/** What the package's own entry set resolves to. */
export interface PackageEntrySetResult {
  /** Entry specifier (`pkg`, `pkg/sub`, `pkg/<module-path>`) → file. */
  entries: Map<string, string>;
  /** Report lines for barrels kept whole. */
  barrelNotes: BarrelNote[];
  /**
   * Entries whose production-browser closure could never load —
   * excluded with the specifier that fails them.
   */
  excludedEntries: ExcludedEntry[];
  /**
   * `require(<non-literal>)` calls the surviving entries keep — they
   * stay runtime requires and are reported.
   */
  runtimeRequires: RuntimeRequire[];
  /**
   * Entries whose only screen failure is reaching an optional peer —
   * kept as entries while the peer is deliverable, confirmed skipped
   * by the fixpoint when it is not.
   */
  deferredEntries: ExcludedEntry[];
}

export class PackageEntrySet {
  private static readonly scanner = new ModuleLinkageScanner();
  private static readonly fileResolver = new PackageEntryFileResolver();

  /**
   * The package's complete entry set. `dep` carries its parsed
   * package.json and real install dir; specifiers resolve from
   * `dep.resolveDir` so linked packages and `browser` remaps behave
   * exactly as the entry build resolves them.
   */
  static async compute(dep: {
    name: string;
    packageDir: string;
    resolveDir: string;
    version: string;
    pkg: {
      exports?: unknown;
      main?: string;
      module?: string;
      browser?: unknown;
      sideEffects?: boolean | string[];
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      peerDependenciesMeta?: Record<string, { optional?: boolean }>;
    };
    /**
     * Entries already skipped this build: an entry whose
     * closure reaches a skipped entry's specifier or file is skipped
     * too — the transitive half of the fixpoint.
     */
    skipped?: SkippedEntryIndex;
  }): Promise<PackageEntrySetResult> {
    const entries = new Map<string, string>();
    const barrelNotes: BarrelNote[] = [];
    const excludedEntries: ExcludedEntry[] = [];
    const deferredEntries: ExcludedEntry[] = [];
    const runtimeRequires: RuntimeRequire[] = [];

    // @cpt-begin:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-compute-entry-set
    const subpaths = PackageEntrySet.exportsSubpaths(dep.pkg);
    if (subpaths.length === 0) {
      const file = await PackageEntrySet.fileResolver.resolve(
        dep.name,
        dep.resolveDir
      );
      if (file !== undefined && PackageEntrySet.isModuleEntry(file)) entries.set(dep.name, file);
      // No `exports` map means the entry set is the declared
      // runtime entries (`browser`/`module`/`main` per standard
      // resolution) and everything they reach — never every shipped
      // file: source files that are not runtime output are never
      // entries. A deep import outside those closures is built as its
      // own supplementary entry by the producer (`coverRequested`),
      // whose bytes depend only on the package and that file.
    } else {
      for (const [subpath, target] of subpaths) {
        const pattern = subpath.includes('*');
        // A pattern expands only to the package's runtime entry
        // candidates (its runtime-condition target's shipped JavaScript),
        // never to test directories or sources it does not run.
        for (const expanded of PackageExportPatternExpander.expand(dep.packageDir, subpath, target)) {
          const spec =
            expanded.subpath === '.'
              ? dep.name
              : `${dep.name}/${expanded.subpath.slice(2)}`;
          const file = await PackageEntrySet.fileResolver.resolve(
            spec,
            dep.resolveDir
          );
          if (file === undefined || !PackageEntrySet.isModuleEntry(file)) continue;
          if (pattern) {
            // The resolver settles which file the subpath names (a
            // more specific key or a `null` target may win); that file
            // must itself be a runtime candidate.
            const rel = PackageEntrySet.moduleRel(dep.packageDir, file);
            if (
              rel === undefined ||
              !PackageExportPatternExpander.isRuntimeCandidate(rel, expanded.targetSuffix)
            ) {
              continue;
            }
          }
          entries.set(spec, file);
        }
      }
    }

    // @cpt-begin:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-split-barrel-members
    // Every module a public barrel re-exports becomes an entry —
    // when the package's sideEffects semantics allow the member to
    // stand alone. An unsplittable barrel stays one entry and is
    // reported with reason and one-line fix.
    for (const [specifier, file] of [...entries]) {
      const barrel = PackageEntrySet.barrelMembers(dep, file);
      if (barrel === undefined || barrel.members.length === 0) continue;
      const splitAllowed = barrel.pure
        ? PackageEntrySet.barrelSplittable(dep, barrel.members)
        : {
            ok: false as const,
            reason:
              'barrel is not a pure re-export list — its own side effects must be evaluated',
          };
      if (!splitAllowed.ok) {
        // @cpt-begin:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-keep-whole-entry
        barrelNotes.push({
          entry: specifier,
          reason: splitAllowed.reason,
          fix: 'declare "sideEffects" (false or a glob list) in the package\'s package.json',
        });
        // @cpt-end:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-keep-whole-entry
        continue;
      }
      const members = barrel.members;
      for (const memberFile of members) {
        const rel = PackageEntrySet.moduleRel(dep.packageDir, memberFile);
        if (rel === undefined) continue;
        const spec = `${dep.name}/${rel}`;
        if (!entries.has(spec) && PackageEntrySet.isModuleEntry(memberFile)) entries.set(spec, memberFile);
      }
    }
    // @cpt-end:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-split-barrel-members
    // @cpt-end:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-compute-entry-set

    // Entries resolve under production browser runtime
    // conditions alone (the resolver's conditions never include
    // `types`/`development`/`test`). An entry whose own static closure
    // — import and `require()` edges alike — can never load in
    // that runtime — a specifier the package neither declares nor can
    // locate, or one it reaches only through an optional peer — leaves
    // the complete entry set with a report line; a consumer that
    // requests it fails at the list-completeness gate. One
    // closure memo serves every entry of this computation: entries of
    // one package share most of their closures.
    const entryScreen = new EntryScreen(
      PackageEntrySet.fileResolver,
      new EntryClosureMemo()
    );
    for (const [spec, file] of [...entries]) {
      const screen = await entryScreen.screen(dep, file, dep.skipped);
      for (const r of screen.runtimeRequires) {
        runtimeRequires.push({ entry: spec, ...r });
      }
      if (screen.failure !== undefined) {
        if (screen.failure.optionalPeer !== undefined) {
          deferredEntries.push({ entry: spec, file, ...screen.failure });
          continue;
        }
        entries.delete(spec);
        excludedEntries.push({ entry: spec, file, ...screen.failure });
      }
    }

    return { entries, barrelNotes, excludedEntries, runtimeRequires, deferredEntries };
  }

  /**
   * The entry screen (buildability): the first bare specifier of
   * `file`'s intra-package static closure that no production browser
   * runtime can load, plus the runtime `require(<non-literal>)` calls
   * the closure keeps. A specifier fails the entry when it is a skipped
   * entry of any package (the transitive skip), when the package
   * neither declares nor can locate it, or when it is reached only
   * through an optional peer. Literal `require()` calls are load edges
   * exactly like imports — except a `require` inside
   * `try`/`catch`, which is runtime-optional and never fails the entry.
   */
  static async screenEntry(
    dep: {
      name: string;
      packageDir: string;
      resolveDir: string;
      pkg: {
        dependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
        peerDependenciesMeta?: Record<string, { optional?: boolean }>;
      };
    },
    file: string,
    skipped?: SkippedEntryIndex
  ): Promise<{
    failure?: { specifier: string; reason: string; optionalPeer?: string };
    runtimeRequires: Array<{ via: string; expression: string }>;
  }> {
    return new EntryScreen(
      PackageEntrySet.fileResolver,
      new EntryClosureMemo()
    ).screen(dep, file, skipped);
  }

  /**
   * Compatibility view over the failure half of
   * {@link screenEntry}.
   */
  static async entryClosureFailure(
    dep: Parameters<typeof PackageEntrySet.screenEntry>[0],
    file: string,
    skipped?: SkippedEntryIndex
  ): Promise<{ specifier: string; reason: string; optionalPeer?: string } | undefined> {
    return (await PackageEntrySet.screenEntry(dep, file, skipped)).failure;
  }

  /**
   * Whether `file` is a barrel — a module re-exporting at least one
   * other module — and which modules it re-exports (resolved absolute
   * paths). `pure` marks the pure re-export list: every top-level
   * statement is linkage alone and no side-effect import is carried.
   * `undefined` when the file re-exports nothing.
   */
  static barrelMembers(
    _dep: { packageDir: string },
    file: string
  ): { members: string[]; pure: boolean } | undefined {
    let source: string;
    try {
      source = fs.readFileSync(file, 'utf-8');
    } catch {
      return undefined;
    }
    const linkage = PackageEntrySet.scanner.scan(source, path.basename(file));
    const reexportSpecifiers = [
      ...new Set([
        ...[...linkage.reExports.values()].map((r) => r.from),
        ...linkage.starExports,
      ]),
    ];
    if (reexportSpecifiers.length === 0) return undefined;
    const resolved: string[] = [];
    for (const spec of reexportSpecifiers) {
      if (!spec.startsWith('.')) continue; // foreign package: its own entries
      const target = PackageEntrySet.resolveRelative(file, spec);
      if (target !== undefined) resolved.push(target);
    }
    return {
      members: resolved,
      pure: linkage.isPure && linkage.sideEffectImports.length === 0,
    };
  }

  /**
   * Whether the barrel's members may become separate entries —
   * each member side-effect-free per the `sideEffects` declaration
   * (field semantics incl. globs), or the barrel proven a pure
   * re-export list when the declaration is absent.
   */
  private static barrelSplittable(
    dep: { packageDir: string; pkg: { sideEffects?: boolean | string[] } },
    members: readonly string[]
  ): { ok: true } | { ok: false; reason: string } {
    const sideEffects = dep.pkg.sideEffects;
    if (sideEffects === false || Array.isArray(sideEffects)) {
      const blocked = members
        .map((m) => PackageEntrySet.moduleRel(dep.packageDir, m))
        .filter(
          (rel): rel is string =>
            rel !== undefined &&
            !BarrelRewritePolicy.declaresSideEffectFreedom(sideEffects, rel)
        );
      if (blocked.length > 0) {
        return {
          ok: false,
          reason: `barrel members ${blocked.join(', ')} are not declared side-effect-free`,
        };
      }
      return { ok: true };
    }
    // Absent (or true): the barrel is already proven a pure re-export
    // list by the caller — that is exactly the split allowance.
    return { ok: true };
  }

  /**
   * The `exports` map's subpath keys (`'.'`, `'./x'`, `'./*'`) with
   * their targets, or `[]`.
   */
  private static exportsSubpaths(pkg: { exports?: unknown }): Array<[string, unknown]> {
    return PackageExportPatternExpander.exportsEntries(pkg.exports);
  }

  /**
   * Whether `file` is a module the entry build loads: a script (or JSON
   * data) file that is no type declaration. Anything else a package
   * exports — stylesheets, fonts, images, a licence, a Sass partial —
   * is an asset a consuming build handles itself and never a unit
   * entry; an asset-only package has an empty entry set.
   */
  private static isModuleEntry(file: string): boolean {
    if (/\.d(?:\.[^./\\]+)?\.[cm]?ts$/.test(file)) return false;
    return /\.(?:[cm]?[jt]sx?|json)$/.test(file);
  }

  /** Resolves a `./x` specifier relative to `fromFile`'s directory. */
  private static resolveRelative(
    fromFile: string,
    spec: string
  ): string | undefined {
    return EntryClosureMemo.resolveRelative(fromFile, spec);
  }

  /** `file` as a posix path relative to the package dir, or undefined. */
  private static moduleRel(
    packageDir: string,
    file: string
  ): string | undefined {
    return EntryClosureMemo.moduleRel(packageDir, file);
  }
}
