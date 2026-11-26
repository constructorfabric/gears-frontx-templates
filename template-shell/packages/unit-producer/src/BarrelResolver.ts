/**
 * `BarrelResolver` — the redirect resolver the barrel rewriter plugs into
 * esbuild. For `(specifier, importedName)` asked from `importerDir`: when
 * the specifier resolves to a pure-linkage barrel module inside
 * `packageDir` that the package's `sideEffects` declaration leaves free,
 * the name is followed through the barrel's re-exports (named, then
 * `export *`) until the module that defines it is found. The redirect's
 * specifier is the defining module's path relative to the importer,
 * posix-style with a `./` prefix.
 *
 * A re-export from another package (`export { x } from 'other'`,
 * `export * from 'other'`) is answered by `resolveForeign` when one is
 * given — the consumer half of barrel handling follows the chain into
 * that package and answers with a bare specifier — and left on the
 * barrel otherwise (the producing build's intra-package rewrite).
 *
 * A name that cannot be placed — a barrel that defines it locally, an
 * `export *` ambiguity, a module outside the package — resolves to
 * `undefined` and the import is left as written.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { BarrelRedirect } from './BarrelImportRewriter';
import {
  ModuleLinkageScanner,
  type ModuleLinkageLite,
} from './ModuleLinkageScanner';
import { PackageFileResolver } from './PackageFileResolver';

/**
 * Where a name re-exported from another package's specifier is defined:
 * a redirect, `absent` when that package does not export it, `unknown`
 * when it cannot be told.
 */
export type ForeignAnswer = BarrelRedirect | 'absent' | 'unknown';

/**
 * Answers a re-export of `name` from the bare `specifier`. `asserted`:
 * a named re-export (`export { name } from 'x'`), which asserts that the
 * package exports the name; a star re-export asserts nothing.
 */
export type ForeignResolver = (
  specifier: string,
  name: string,
  asserted: boolean
) => ForeignAnswer;

/** Internal answer of one lookup. */
type Lookup = { hit: BarrelRedirect } | 'absent' | 'unknown';

export class BarrelResolver {
  private readonly packageDir: string;
  private readonly isSideEffectFreeModule: (moduleRelPath: string) => boolean;
  private readonly resolveForeign?: ForeignResolver;
  private readonly cache = new Map<string, ModuleLinkageLite | null>();
  private readonly scanner = new ModuleLinkageScanner();

  constructor(params: {
    packageDir: string;
    isSideEffectFreeModule: (moduleRelPath: string) => boolean;
    resolveForeign?: ForeignResolver;
  }) {
    this.packageDir = path.resolve(params.packageDir);
    this.isSideEffectFreeModule = params.isSideEffectFreeModule;
    this.resolveForeign = params.resolveForeign;
  }

  /**
   * Answers where `importedName`, imported from `specifier` by a module in
   * `importerDir`, is really defined — or `undefined` to leave it.
   */
  resolve(
    specifier: string,
    importerDir: string,
    importedName: string
  ): BarrelRedirect | undefined {
    const answer = this.answer(specifier, importerDir, importedName);
    return typeof answer === 'object' ? answer : undefined;
  }

  /**
   * Like {@link resolve}, telling a name the barrel does not export
   * (`absent`) from one it cannot place (`unknown`).
   */
  answer(specifier: string, importerDir: string, importedName: string): ForeignAnswer {
    const target = PackageFileResolver.resolve(
      specifier,
      importerDir,
      this.packageDir
    );
    if (target === undefined) return 'unknown';
    const linkage = this.load(target);
    // Only a pure-linkage module is a barrel; anything else keeps its
    // imports.
    if (!linkage || !linkage.isPure) return 'unknown';
    // A barrel whose bare side-effect imports reach a module that is not
    // itself side-effect free evaluates real side effects — it is not
    // pure.
    for (const se of linkage.sideEffectImports) {
      const seTarget = PackageFileResolver.resolve(
        se,
        path.dirname(target),
        this.packageDir
      );
      if (seTarget === undefined) return 'unknown';
      if (!this.isSideEffectFreeModule(this.relOf(seTarget))) return 'unknown';
    }
    if (linkage.reExports.size === 0 && linkage.starExports.length === 0) {
      return 'unknown';
    }
    const found = this.findDefining(target, importedName, importerDir, new Set());
    return typeof found === 'object' ? found.hit : found;
  }

  /**
   * The bare specifiers the barrel at `entryFile` re-exports from,
   * through its package-internal re-export chains — the other packages a
   * {@link ForeignResolver} may be asked about.
   */
  foreignSpecifiers(entryFile: string): string[] {
    const found = new Set<string>();
    const seen = new Set<string>();
    const queue = [path.resolve(entryFile)];
    while (queue.length > 0) {
      const moduleAbs = queue.pop()!;
      if (seen.has(moduleAbs)) continue;
      seen.add(moduleAbs);
      const linkage = this.load(moduleAbs);
      if (!linkage) continue;
      const from = [
        ...[...linkage.reExports.values()].map((r) => r.from),
        ...linkage.starExports,
      ];
      for (const specifier of from) {
        if (BarrelResolver.isBare(specifier)) {
          found.add(specifier);
          continue;
        }
        const target = PackageFileResolver.resolve(
          specifier,
          path.dirname(moduleAbs),
          this.packageDir
        );
        if (target !== undefined) queue.push(target);
      }
    }
    return [...found].sort();
  }

  private relOf(abs: string): string {
    return path.relative(this.packageDir, abs).split(path.sep).join('/');
  }

  private load(abs: string): ModuleLinkageLite | null {
    if (this.cache.has(abs)) return this.cache.get(abs) as ModuleLinkageLite | null;
    let linkage: ModuleLinkageLite | null = null;
    try {
      if (this.isSideEffectFreeModule(this.relOf(abs))) {
        linkage = this.scanner.scan(fs.readFileSync(abs, 'utf-8'), abs);
      }
    } catch {
      linkage = null;
    }
    this.cache.set(abs, linkage);
    return linkage;
  }

  /**
   * ResolveExport over the package's own modules: the module and local
   * name `name` resolves to, following named re-exports first and star
   * exports in order. `seen` ends re-export cycles.
   */
  private findDefining(
    moduleAbs: string,
    name: string,
    importerDir: string,
    seen: Set<string>
  ): Lookup {
    const key = `${moduleAbs}\0${name}`;
    // Already asked (a cycle, or a second star path to the same module):
    // contributes nothing new, as ResolveExport's resolve set does.
    if (seen.has(key)) return 'absent';
    seen.add(key);
    const linkage = this.load(moduleAbs);
    if (!linkage) return 'unknown';
    if (linkage.ownExports.has(name)) {
      const specifier =
        './' + path.relative(importerDir, moduleAbs).split(path.sep).join('/');
      return { hit: { specifier, importedName: name } };
    }
    const re = linkage.reExports.get(name);
    if (re) {
      // A named re-export asserts the name: anything but a hit is a
      // binding that cannot be placed.
      const found = this.follow(re.from, re.name, moduleAbs, importerDir, seen, true);
      return typeof found === 'object' ? found : 'unknown';
    }
    if (name === 'default') return 'absent';
    // `export *` ambiguity: collect every star resolution; two or more
    // distinct (module, name) definitions make the name ambiguous and it
    // stays on the barrel rather than silently picking the first.
    const hits = new Map<string, BarrelRedirect>();
    for (const star of linkage.starExports) {
      const found = this.follow(star, name, moduleAbs, importerDir, seen, false);
      if (found === 'unknown') return 'unknown';
      if (found !== 'absent') hits.set(`${found.hit.specifier}\0${found.hit.importedName}`, found.hit);
    }
    if (hits.size === 1) return { hit: [...hits.values()][0] };
    if (hits.size > 1) return 'unknown';
    return 'absent';
  }

  /** Follows one re-export of `name` from `from`, written in `moduleAbs`. */
  private follow(
    from: string,
    name: string,
    moduleAbs: string,
    importerDir: string,
    seen: Set<string>,
    asserted: boolean
  ): Lookup {
    if (BarrelResolver.isBare(from)) {
      // No foreign resolver (the intra-package rewrite): a star from
      // another package contributes nothing, as before.
      if (this.resolveForeign === undefined) return asserted ? 'unknown' : 'absent';
      const answer = this.resolveForeign(from, name, asserted);
      return typeof answer === 'object' ? { hit: answer } : answer;
    }
    const target = PackageFileResolver.resolve(from, path.dirname(moduleAbs), this.packageDir);
    if (target === undefined) return asserted ? 'unknown' : 'absent';
    return this.findDefining(target, name, importerDir, seen);
  }

  private static isBare(specifier: string): boolean {
    return !specifier.startsWith('.') && !path.isAbsolute(specifier);
  }
}
