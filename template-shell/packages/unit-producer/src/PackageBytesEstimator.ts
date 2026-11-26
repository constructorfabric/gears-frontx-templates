/**
 * `PackageBytesEstimator` — an upper-bound estimate of the bytes one
 * package contributes to a runtime that bundles it itself: the size of
 * the JavaScript files in its install directory, never descending into
 * a nested `node_modules`. Used for the build report's duplicate-bytes
 * estimate; it is an estimate, never a gate.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { PackageJsonResolver } from './PackageJsonResolver';

const SCRIPT_FILE = /\.(?:[cm]?js)$/i;

export class PackageBytesEstimator {
  private readonly packageRoot: string;

  constructor(packageRoot: string) {
    this.packageRoot = packageRoot;
  }

  estimate(root: string): number {
    const installed = PackageJsonResolver.resolveInstalled(this.packageRoot, root);
    if (installed === undefined) return 0;
    let total = 0;
    const stack = [path.dirname(installed)];
    while (stack.length > 0) {
      const dir = stack.pop()!;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'node_modules') stack.push(full);
        } else if (SCRIPT_FILE.test(entry.name)) {
          try {
            total += fs.statSync(full).size;
          } catch {
            // an unreadable file contributes nothing to the estimate
          }
        }
      }
    }
    return total;
  }
}
