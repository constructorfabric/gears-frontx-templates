/**
 * `PackageReachClassifier` — says how a shared package was reached from
 * the producing package, for the build report:
 *
 * - `alias`: a bundler alias points at it;
 * - `workspace`: it is linked from outside any `node_modules` tree (a
 *   workspace package or a linked checkout);
 * - `declared`: it is an npm-installed package the producing package's
 *   `package.json` declares;
 * - `undeclared`: it is installed and imported but not declared;
 * - `closure`: it is shared only because a shared package imports it.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { PackageJsonResolver } from './PackageJsonResolver';

export type PackageReach =
  | 'declared'
  | 'workspace'
  | 'alias'
  | 'undeclared'
  | 'closure';

export class PackageReachClassifier {
  private readonly packageRoot: string;
  private readonly declared: ReadonlySet<string>;
  private readonly aliasTargets: ReadonlySet<string>;

  constructor(
    packageRoot: string,
    declaredRoots: Iterable<string>,
    aliasTargetRoots: Iterable<string> = []
  ) {
    this.packageRoot = packageRoot;
    this.declared = new Set(declaredRoots);
    this.aliasTargets = new Set(aliasTargetRoots);
  }

  isDeclared(root: string): boolean {
    return this.declared.has(root);
  }

  /** Whether `root` resolves from outside every `node_modules` tree. */
  isWorkspace(root: string): boolean {
    const installed = PackageJsonResolver.resolveInstalled(this.packageRoot, root);
    if (installed === undefined) return false;
    let real: string;
    try {
      real = fs.realpathSync(installed);
    } catch {
      return false;
    }
    return !real.split(path.sep).includes('node_modules');
  }

  /**
   * Reach of an imported package; `imported: false` marks a package
   * only the shared closure reaches.
   */
  classify(root: string, imported = true): PackageReach {
    if (this.aliasTargets.has(root)) return 'alias';
    if (this.isWorkspace(root)) return 'workspace';
    if (this.declared.has(root)) return 'declared';
    return imported ? 'undeclared' : 'closure';
  }
}
