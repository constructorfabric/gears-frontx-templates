/**
 * `MfeFixtureDiscovery` — discovers MFE fixture packages by directory under
 * `template-mfe/src-app/mfe_packages/*`. A directory is a fixture when it
 * carries a `package.json`; the discovery carries no package names in logic,
 * so it tracks whatever fixtures exist.
 *
 * Core logic is exported for unit tests.
 */
import { readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

/** Relative path from the templates root to the fixture MFE packages. */
export const MFE_PACKAGES_REL = path.join('template-mfe', 'src-app', 'mfe_packages');

export class MfeFixtureDiscovery {
  /**
   * @param {{
   *   root: string;
   *   mfePackagesRel?: string;
   *   readdirFn?: typeof readdirSync;
   *   existsFn?: typeof existsSync;
   * }} opts
   */
  constructor({
    root,
    mfePackagesRel = MFE_PACKAGES_REL,
    readdirFn = readdirSync,
    existsFn = existsSync,
  } = {}) {
    if (!root) throw new Error('MfeFixtureDiscovery: root is required');
    this.root = root;
    this.mfePackagesRel = mfePackagesRel;
    this.readdirFn = readdirFn;
    this.existsFn = existsFn;
  }

  /**
   * Returns the absolute paths of every directory under the fixture MFE
   * packages directory that carries a `package.json`. Hidden directories
   * (leading `.`) are skipped. No package names are read.
   *
   * @returns {string[]}
   */
  discover() {
    const dir = path.join(this.root, this.mfePackagesRel);
    if (!this.existsFn(dir)) return [];
    /** @type {import('node:fs').Dirent[]} */
    const entries = this.readdirFn(dir, { withFileTypes: true });
    /** @type {string[]} */
    const fixtures = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.')) continue;
      const pkgPath = path.join(dir, entry.name, 'package.json');
      if (!this.existsFn(pkgPath)) continue;
      fixtures.push(path.join(dir, entry.name));
    }
    return fixtures;
  }
}
