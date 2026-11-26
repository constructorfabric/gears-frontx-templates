/**
 * `PackageJsonResolver` — locates a package's `package.json` across
 * npm / pnpm / yarn-pnp layouts. Tries
 * `require.resolve('<pkg>/package.json')` first (honors each package
 * manager's resolver) and falls back to a manual walk up `node_modules`
 * directories when the package's `exports` field blocks subpath access.
 */

import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';

export class PackageJsonResolver {
  /**
   * Resolves the on-disk path of `rootName`'s `package.json` as seen from
   * `startDir`. `rootName` must be a root package name — apply
   * {@link SharedSetResolver.extractRootPackageName} to subpath specifiers
   * first. Returns `undefined` when the package cannot be located either
   * way; callers decide whether to throw with a specific message. The
   * returned path is always the real (symlink-resolved) path.
   */
  static resolve(startDir: string, rootName: string): string | undefined {
    const found = PackageJsonResolver.locate(startDir, rootName);
    // The real path, never the symlink: esbuild (and node) resolve
    // through symlinks, so a workspace- or `dev:template:link`-linked
    // package's modules appear in metafiles under its real directory. A
    // package dir taken from the symlink path matches none of them.
    return found === undefined ? undefined : fs.realpathSync(found);
  }

  /**
   * Like {@link resolve}, but returns the path as installed — through any
   * symlink, not resolved. Resolving a package's own dependencies from its
   * install location gives what a published install of it would get; a
   * linked package's real directory sits in another checkout's tree.
   */
  static resolveInstalled(startDir: string, rootName: string): string | undefined {
    return PackageJsonResolver.locate(startDir, rootName);
  }

  private static locate(startDir: string, rootName: string): string | undefined {
    // The node_modules walk first: it yields the install location as is.
    let current = startDir;
    for (;;) {
      const candidate = path.join(current, 'node_modules', rootName, 'package.json');
      if (fs.existsSync(candidate)) return candidate;
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
    // Then the package manager's resolver (Yarn PnP and other layouts
    // without a node_modules directory).
    const nodeRequire = createRequire(path.join(startDir, 'package.json'));
    try {
      return nodeRequire.resolve(`${rootName}/package.json`);
    } catch {
      // Some packages' `exports` block subpath access.
      return undefined;
    }
  }
}
