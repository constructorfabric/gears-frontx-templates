/**
 * `RuntimePackageInspector` — classifies the host's declared dependency
 * set for the bundler settings sharing requires. The shared set is
 * derived, and so is its bundler handling: the inspector decides, per
 * declared package, whether the package is runtime browser code at all
 * (a package with no JavaScript entry, or one whose every entry is an
 * asset, is never shared), whether it looks like a build tool that
 * wandered into `dependencies` (warned about — it still needs the
 * `exclude` hatch), and whether it ships CommonJS (so `vite dev` can
 * pre-bundle it through `optimizeDeps.include` together with the
 * subpaths the host's own sources actually import).
 *
 * The plugin is framework-agnostic: all of this is read off
 * `package.json` metadata and a specifier scan of the host's own
 * sources; nothing about a framework or a template is assumed.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  PackageJsonResolver,
  RuntimeEntryDetector,
  SharedSetResolver,
  type ResolvablePackageJson,
} from '@gears-frontx/unit-producer';

/** The package.json fields the inspector reads beyond the resolver's. */
export type InstalledPackageJson = ResolvablePackageJson & {
  type?: string;
  main?: string;
  module?: string;
  browser?: string | Record<string, unknown>;
  exports?: unknown;
  sideEffects?: boolean | string[];
  bin?: string | Record<string, string>;
};

/** What {@link RuntimePackageInspector.inspect} reports. */
export interface RuntimePackageInspection {
  /**
   * Declared packages that are not runtime code and must never be
   * shared: no locatable install, no JavaScript entry, or asset-only
   * entries. Joined into the effective `exclude` set by the caller.
   */
  autoExcluded: string[];
  /** Human-readable warnings (unlocatable and build-tool packages). */
  warnings: string[];
  /** Shared packages shipping CommonJS the dev server should pre-bundle. */
  cjsPackages: string[];
}

/** Sources scanned for used subpath specifiers, in dev only. */
const SOURCE_FILE = /\.(?:[cm]?[jt]sx?)$/;

/** Directories the used-subpath scan never descends into. */
const SKIP_DIR = new Set(['node_modules', 'dist', '.git']);

/** Bare specifiers in source: `from '…'`, `import '…'`, `import('…')`, `require('…')`. */
const SPECIFIER =
  /(?:import|export)[^'"]*?\bfrom\s*['"]([^'"]+)['"]|(?:import|export)\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]|\brequire\s*\(\s*['"]([^'"]+)['"]/g;

export class RuntimePackageInspector {
  private readonly packageRoot: string;

  constructor(packageRoot: string) {
    this.packageRoot = packageRoot;
  }

  /**
   * Classifies every declared dependency (`dependencies` ∪
   * `optionalDependencies` ∪ non-optional `peerDependencies`) the
   * `exclude` option did not already remove. Returns the auto-exclusions,
   * the warnings to surface and the CJS package roots for
   * `optimizeDeps.include`.
   */
  inspect(exclude: readonly string[]): RuntimePackageInspection {
    let projectPkg: ResolvablePackageJson;
    try {
      projectPkg = JSON.parse(
        fs.readFileSync(path.join(this.packageRoot, 'package.json'), 'utf-8')
      ) as ResolvablePackageJson;
    } catch {
      return { autoExcluded: [], warnings: [], cjsPackages: [] };
    }
    const excluded = new Set(
      exclude.map(SharedSetResolver.extractRootPackageName)
    );
    const inspection: RuntimePackageInspection = {
      autoExcluded: [],
      warnings: [],
      cjsPackages: [],
    };
    for (const name of SharedSetResolver.declaredDepNames(projectPkg)) {
      const root = SharedSetResolver.extractRootPackageName(name);
      if (excluded.has(root)) continue;
      const installed = PackageJsonResolver.resolveInstalled(
        this.packageRoot,
        root
      );
      if (installed === undefined) {
        inspection.autoExcluded.push(name);
        inspection.warnings.push(
          `declared dependency "${name}" is not installed — nothing to ` +
            `share; it is treated as a non-runtime package. Install it or ` +
            `remove the declaration.`
        );
        continue;
      }
      let pkg: InstalledPackageJson;
      try {
        pkg = JSON.parse(
          fs.readFileSync(installed, 'utf-8')
        ) as InstalledPackageJson;
      } catch {
        continue;
      }
      const packageDir = path.dirname(installed);
      if (!RuntimePackageInspector.hasRuntimeEntry(pkg, packageDir)) {
        inspection.autoExcluded.push(name);
        continue;
      }
      if (RuntimePackageInspector.isBuildTool(pkg)) {
        inspection.warnings.push(
          `"${name}" looks like a build tool sitting in \`dependencies\` ` +
            `(declares bin entries, no browser/ESM entry): it is shared ` +
            `by default, which usually fails unit production on Node ` +
            `builtins. Move it to \`devDependencies\` or add it to ` +
            `\`exclude\`.`
        );
        continue;
      }
      if (RuntimePackageInspector.isCjs(pkg)) {
        inspection.cjsPackages.push(root);
      }
    }
    return inspection;
  }

  /**
   * The `optimizeDeps.include` list for `vite dev`: every CJS shared
   * package plus each subpath specifier of one the host's own sources
   * import (`react/jsx-runtime`). Subpath use is discovered by scanning
   * the source files under the package root — a specifier that is never
   * imported gains nothing from being listed.
   */
  optimizeInclude(cjsPackages: readonly string[]): string[] {
    const include = [...new Set(cjsPackages)].sort();
    const roots = new Set(cjsPackages);
    for (const specifier of this.usedSpecifiers()) {
      if (
        specifier.includes('/') &&
        roots.has(SharedSetResolver.extractRootPackageName(specifier))
      ) {
        include.push(specifier);
      }
    }
    return [...new Set(include)].sort();
  }

  /**
   * Whether the package has a runtime JavaScript entry at all — see
   * `RuntimeEntryDetector`, which the MFE build applies the same way. An
   * asset-only package has only stylesheets and fonts to offer and is
   * never shared.
   */
  static hasRuntimeEntry(
    pkg: InstalledPackageJson,
    packageDir: string
  ): boolean {
    return RuntimeEntryDetector.hasRuntimeEntry(pkg, packageDir);
  }

  /**
   * Whether the package is plausibly a Node-side build tool: it ships
   * executables (`bin`) but offers no browser- or bundler-facing entry
   * (`browser`, `module` or an `import`/`browser` export condition).
   */
  static isBuildTool(pkg: InstalledPackageJson): boolean {
    const bins =
      typeof pkg.bin === 'string'
        ? 1
        : Object.keys(pkg.bin ?? {}).length;
    if (bins === 0) return false;
    return !RuntimePackageInspector.hasEsmOrBrowserEntry(pkg);
  }

  /**
   * Whether the package's browser-facing entry is CommonJS — the case
   * `vite dev` must pre-bundle. An `import` condition, `.mjs` target,
   * `module` field or `type: "module"` entry marks it ESM.
   */
  static isCjs(pkg: InstalledPackageJson): boolean {
    return !RuntimePackageInspector.hasEsmOrBrowserEntry(pkg);
  }

  /** ESM/browser signals across `type`, `module`, `browser` and `exports`. */
  private static hasEsmOrBrowserEntry(pkg: InstalledPackageJson): boolean {
    if (pkg.type === 'module') return true;
    if (pkg.module !== undefined || pkg.browser !== undefined) return true;
    return RuntimePackageInspector.exportsHaveEsm(pkg.exports);
  }

  /** Whether any `exports` condition or target marks the package ESM. */
  private static exportsHaveEsm(exportsField: unknown): boolean {
    if (typeof exportsField === 'string') {
      return /\.mjs$/i.test(exportsField);
    }
    if (Array.isArray(exportsField)) {
      return exportsField.some((e) => RuntimePackageInspector.exportsHaveEsm(e));
    }
    if (exportsField !== null && typeof exportsField === 'object') {
      return Object.entries(exportsField as Record<string, unknown>).some(
        ([condition, value]) =>
          condition === 'import' ||
          condition === 'browser' ||
          condition === 'module' ||
          RuntimePackageInspector.exportsHaveEsm(value)
      );
    }
    return false;
  }

  /**
   * Bare specifiers the host's own sources name, scanned across the
   * package root — dev-only. The walk is bounded by the tree.
   */
  private *usedSpecifiers(): Generator<string> {
    const stack = [this.packageRoot];
    while (stack.length > 0) {
      const dir = stack.pop()!;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (!SKIP_DIR.has(entry.name) && !entry.name.startsWith('.')) {
            stack.push(path.join(dir, entry.name));
          }
          continue;
        }
        if (!SOURCE_FILE.test(entry.name)) {
          continue;
        }
        let code: string;
        try {
          code = fs.readFileSync(path.join(dir, entry.name), 'utf-8');
        } catch {
          continue;
        }
        for (const match of code.matchAll(SPECIFIER)) {
          const spec = match.slice(1).find((g) => g !== undefined);
          if (spec !== undefined && !spec.startsWith('.') && !spec.startsWith('/') && !spec.includes(':')) {
            yield spec;
          }
        }
      }
    }
  }
}
