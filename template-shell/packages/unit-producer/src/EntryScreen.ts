/**
 * `EntryScreen` — the entry screen (buildability) over a
 * closure memo ({@link EntryClosureMemo}) owned by the caller. One
 * screen instance lives as long as its memo: one producer run, or one
 * package's entry-set computation.
 */

import { isBuiltin } from 'node:module';

import { EntryClosureMemo } from './EntryClosureMemo';
import type { PackageEntryFileResolver } from './PackageEntryFileResolver';
import { SharedSetResolver } from './SharedSetResolver';
import type { SkippedEntryIndex } from './SkippedEntryIndex';

/** The skip-index reads the screen makes. */
export type SkipLookup = Pick<
  SkippedEntryIndex,
  'forSpecifier' | 'forFile' | 'hasSkippedForRoot'
>;

/** The package facts the screen reads. */
export interface ScreenedPackage {
  name: string;
  packageDir: string;
  resolveDir: string;
  pkg: {
    dependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  };
}

/** Why an entry's closure cannot load, when it cannot. */
export interface ScreenFailure {
  specifier: string;
  reason: string;
  optionalPeer?: string;
}

export interface ScreenResult {
  failure?: ScreenFailure;
  runtimeRequires: Array<{ via: string; expression: string }>;
}

export class EntryScreen {
  constructor(
    private readonly fileResolver: PackageEntryFileResolver,
    private readonly memo: EntryClosureMemo
  ) {}

  /**
   * The first bare specifier of `file`'s intra-package static closure
   * that no production browser runtime can load, plus the runtime
   * `require(<non-literal>)` calls the closure keeps. A specifier
   * fails the entry when it is a skipped entry of any package (the
   * transitive skip), when the package neither declares nor can locate
   * it, or when it is reached only through an optional peer. Literal
   * `require()` calls are load edges exactly like imports —
   * except a `require` inside `try`/`catch`, which is runtime-optional
   * and never fails the entry.
   */
  async screen(
    dep: ScreenedPackage,
    file: string,
    skipped?: SkipLookup
  ): Promise<ScreenResult> {
    const closure = this.memo.closure(dep.packageDir, file);
    // An optional-peer reach is deferred, not failed — recorded and
    // returned only when no harder failure exists.
    let deferred: { specifier: string; reason: string; optionalPeer: string } | undefined;
    for (const { specifier, via, kind, optional } of closure.bare) {
      if (optional) continue;
      if (isBuiltin(specifier)) continue;
      const reached = `reached through ${kind === 'require' ? 'require()' : 'import'} in ${
        EntryClosureMemo.moduleRel(dep.packageDir, via) ?? via
      }`;
      const root = SharedSetResolver.extractRootPackageName(specifier);
      if (root === dep.name) continue;
      // A skipped entry propagates to everything reaching it —
      // declared or not.
      const specSkip = skipped?.forSpecifier(specifier);
      if (specSkip !== undefined) {
        return {
          runtimeRequires: [],
          failure: {
            specifier,
            reason: `"${specifier}" is a skipped entry (${specSkip}) (${reached})`,
          },
        };
      }
      const declared =
        dep.pkg.dependencies?.[root] !== undefined ||
        dep.pkg.peerDependencies?.[root] !== undefined;
      const rootHasSkips = skipped?.hasSkippedForRoot(root) === true;
      let resolved: string | undefined;
      if (!declared || rootHasSkips) {
        resolved = await this.fileResolver.resolve(specifier, dep.resolveDir);
      }
      if (resolved !== undefined) {
        const fileSkip = skipped?.forFile(resolved);
        if (fileSkip !== undefined) {
          return {
            runtimeRequires: [],
            failure: {
              specifier,
              reason: `"${specifier}" resolves to skipped entry "${fileSkip.specifier}" (${fileSkip.reason}) (${reached})`,
            },
          };
        }
      }
      if (dep.pkg.dependencies?.[root] !== undefined) continue;
      if (dep.pkg.peerDependencies?.[root] !== undefined) {
        if (dep.pkg.peerDependenciesMeta?.[root]?.optional === true) {
          deferred ??= {
            specifier,
            optionalPeer: root,
            reason: `"${root}" is only an optional peer of "${dep.name}" — it stays a native external a browser cannot resolve (${reached})`,
          };
        }
        continue;
      }
      if (resolved === undefined) {
        return {
          runtimeRequires: [],
          failure: {
            specifier,
            reason: `"${specifier}" is not declared by "${dep.name}" and cannot be located from the install location of "${dep.name}" (${reached})`,
          },
        };
      }
    }
    return { runtimeRequires: [...closure.opaque], failure: deferred };
  }
}
