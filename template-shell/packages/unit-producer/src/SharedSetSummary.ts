/**
 * `SharedSetSummary` — the build report's account of one runtime's
 * effective shared set: the mode it was configured with, each shared
 * package with how it was reached, the runtime dependencies `include`
 * added automatically, a warning for every package the code imports
 * without declaring it, and — for non-default configurations — an
 * estimate of the bytes the runtime bundles itself that the default set
 * would have shared. A mismatch between runtimes is only reported, never
 * a failure.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { PackageBytesEstimator } from './PackageBytesEstimator';
import { PackageReachClassifier, type PackageReach } from './PackageReachClassifier';
import { SharedSetResolver, type ResolvablePackageJson } from './SharedSetResolver';
import type { SharedSetMode, SharedSetSelection } from './SharedSetSelection';

export interface SharedSetSummaryPackage {
  name: string;
  version: string;
  reachedAs: PackageReach;
}

export interface SharedSetSummaryDocument {
  mode: SharedSetMode;
  packages: SharedSetSummaryPackage[];
  /** Runtime dependencies `include` shared on its own, reported. */
  closureAdded: string[];
  /** Imported-but-undeclared packages. */
  warnings: string[];
  /** Estimated duplicate bytes; present for non-default configurations. */
  estimatedDuplicateBytes?: number;
}

export interface SharedSetSummaryParams {
  packageRoot: string;
  selection: SharedSetSelection;
  /** The shared packages the producer delivered. */
  produced: ReadonlyArray<{ name: string; version: string }>;
  /** Packages the code imported (graph-derived), shared or not. */
  imported: ReadonlyArray<{ name: string; shared: boolean }>;
  /** The bundler's alias target roots. */
  aliasTargets?: readonly string[];
}

export class SharedSetSummary {
  static compose(params: SharedSetSummaryParams): SharedSetSummaryDocument {
    const { selection } = params;
    const declared = SharedSetSummary.declaredRoots(params.packageRoot);
    const classifier = new PackageReachClassifier(
      params.packageRoot,
      declared,
      params.aliasTargets
    );
    const importedNames = new Set(params.imported.map((i) => i.name));
    const packages = params.produced
      .map((p): SharedSetSummaryPackage => {
        const root = SharedSetResolver.extractRootPackageName(p.name);
        return {
          name: p.name,
          version: p.version,
          reachedAs: classifier.classify(root, importedNames.has(root)),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    const sharedRoots = new Set(
      packages.map((p) => SharedSetResolver.extractRootPackageName(p.name))
    );
    const requested = new Set(
      (selection.include ?? []).map(SharedSetResolver.extractRootPackageName)
    );
    const closureAdded =
      selection.mode === 'include'
        ? [...sharedRoots].filter((n) => !requested.has(n)).sort()
        : [];
    const warnings = params.imported
      .filter((i) => !classifier.isDeclared(i.name))
      .map(
        (i) =>
          `"${i.name}" is imported but not declared in dependencies or ` +
          `peerDependencies${i.shared ? '' : ' (bundled, not shared)'}`
      );
    const document: SharedSetSummaryDocument = {
      mode: selection.mode,
      packages,
      closureAdded,
      warnings,
    };
    if (selection.mode !== 'default') {
      const estimator = new PackageBytesEstimator(params.packageRoot);
      document.estimatedDuplicateBytes = params.imported
        .filter((i) => !sharedRoots.has(i.name))
        .reduce((n, i) => n + estimator.estimate(i.name), 0);
    }
    return document;
  }

  private static declaredRoots(packageRoot: string): string[] {
    try {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf-8')
      ) as ResolvablePackageJson;
      return SharedSetResolver.declaredDepNames(pkg).map(
        SharedSetResolver.extractRootPackageName
      );
    } catch {
      return [];
    }
  }
}
