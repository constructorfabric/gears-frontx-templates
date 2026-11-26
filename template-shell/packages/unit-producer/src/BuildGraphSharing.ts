/**
 * `BuildGraphSharing` — derives, during one runtime's bundling, which
 * bare packages the code imports and which of them are shared. It is the
 * single rule both plugins' `external` predicates apply, so a package is
 * shared the same way whether it is npm-installed, workspace-linked or
 * aliased:
 *
 * - `default`: every bare package a JavaScript/TypeScript module of the
 *   build graph imports and the install tree can locate;
 * - `exclude`: the default minus the excluded packages;
 * - `include`: only the packages the resolved closure names (the listed
 *   packages and their runtime dependencies).
 *
 * Imports written by tooling rather than by the code — an HTML entry,
 * a virtual module, a file inside a `node_modules` tree that the build
 * bundles — never decide sharing. The set of imported packages is
 * recorded (shared or not) for the build report.
 */

import { isBuiltin } from 'node:module';

import { AliasMap } from './AliasMap';
import { PackageJsonResolver } from './PackageJsonResolver';
import { SharedSetResolver } from './SharedSetResolver';
import type { SharedSetSelection } from './SharedSetSelection';
import { SharedSpecifierMatcher } from './SharedSpecifierMatcher';

export interface BuildGraphSharingOptions {
  packageRoot: string;
  selection: SharedSetSelection;
  /** The names the resolved closure shares regardless of the graph. */
  closureNames: Iterable<string>;
  /** The bundler's `resolve.alias` configuration. */
  alias?: unknown;
}

const SCRIPT_MODULE = /\.[cm]?[jt]sx?$/;

export class BuildGraphSharing {
  private readonly options: BuildGraphSharingOptions;
  private readonly closure: SharedSpecifierMatcher;
  private readonly alias: AliasMap;
  private readonly imported = new Map<string, boolean>();

  constructor(options: BuildGraphSharingOptions) {
    this.options = options;
    this.closure = new SharedSpecifierMatcher(options.closureNames);
    this.alias = new AliasMap(options.alias);
  }

  /**
   * The bundler's `external` decision for `source` imported by
   * `importer`; records the package as imported when the import counts.
   */
  external(source: string, importer: string | undefined): boolean {
    if (!SharedSpecifierMatcher.isBareModuleSpecifier(source)) return false;
    if (this.alias.rewrites(source)) return false;
    const root = SharedSetResolver.extractRootPackageName(source);
    const counts =
      !isBuiltin(source) && BuildGraphSharing.countsAsImport(importer);
    if (this.closure.matches(source)) {
      if (counts) this.imported.set(root, true);
      return true;
    }
    if (!counts) return this.matches(source);
    const known = this.imported.get(root);
    if (known !== undefined) return known;
    if (
      PackageJsonResolver.resolveInstalled(this.options.packageRoot, root) ===
      undefined
    ) {
      return false;
    }
    const shared = this.selects(root);
    this.imported.set(root, shared);
    return shared;
  }

  /** Whether `specifier` names a package this runtime shares. */
  matches(specifier: string): boolean {
    if (!SharedSpecifierMatcher.isBareModuleSpecifier(specifier)) return false;
    if (this.closure.matches(specifier)) return true;
    return (
      this.imported.get(SharedSetResolver.extractRootPackageName(specifier)) === true
    );
  }

  /**
   * Whether the rule shares the package `root`, wherever it is imported
   * from — for consumers (the barrel rewrite) that run before the
   * bundler resolves the imports. Records nothing.
   */
  sharesRoot(root: string): boolean {
    if (this.closure.hasRoot(root)) return true;
    if (this.imported.get(root) === true) return true;
    if (isBuiltin(root) || !this.selects(root)) return false;
    return (
      PackageJsonResolver.resolveInstalled(this.options.packageRoot, root) !==
      undefined
    );
  }

  /** Every package the code imported, with whether it is shared. */
  importedPackages(): Array<{ name: string; shared: boolean }> {
    return [...this.imported]
      .map(([name, shared]) => ({ name, shared }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private selects(root: string): boolean {
    const { selection } = this.options;
    if (selection.mode === 'include') return false;
    return !selection.exclude.some(
      (name) => SharedSetResolver.extractRootPackageName(name) === root
    );
  }

  /** Whether an import from `importer` is the code's own, not tooling's. */
  private static countsAsImport(importer: string | undefined): boolean {
    if (importer === undefined || importer.startsWith('\0')) return false;
    const file = importer.split('?')[0];
    if (!SCRIPT_MODULE.test(file)) return false;
    return !file.split(/[\\/]/).includes('node_modules');
  }
}
