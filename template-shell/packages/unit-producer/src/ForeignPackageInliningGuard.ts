/**
 * `ForeignPackageInliningGuard` — fails the build when a package's chunks
 * contain modules of another shared package. Every shared package is
 * delivered once, from its own chunks; a copy inlined
 * into a sibling's output is a second, per-consumer instance of it —
 * exactly what the unit model exists to prevent.
 *
 * Each JavaScript input is attributed to its owning package: the package
 * named after the input's last `node_modules` segment, else the shared
 * package whose real (symlink-resolved) directory contains it — how a
 * workspace- or `dev:template:link`-linked package appears. An input
 * owned by a shared package other than the host is a violation. Assets,
 * non-file namespaces, generated entries and packages outside the shared
 * set are not.
 */

import * as path from 'node:path';

/** One module of another shared package found in a build. */
export interface ForeignPackageInlining {
  /** The shared package the inlined module belongs to. */
  packageName: string;
  /** Absolute path of the inlined module. */
  input: string;
}

export class ForeignPackageInliningGuard {
  private static readonly SCRIPT = /\.[cm]?[jt]sx?$/;

  private readonly dirs: Array<{ name: string; dir: string }>;
  private readonly names: ReadonlySet<string>;

  /** `sharedPackages`: shared root package name → real install dir. */
  constructor(sharedPackages: ReadonlyMap<string, string>) {
    this.names = new Set(sharedPackages.keys());
    // Longest directory first, so a nested package wins over its parent.
    this.dirs = [...sharedPackages]
      .map(([name, dir]) => ({ name, dir: path.resolve(dir) }))
      .sort((a, b) => b.dir.length - a.dir.length);
  }

  /**
   * Every input module id (absolute or `workDir`-relative paths, as
   * the bundler reports them) owned by a shared package other than
   * `hostName`. Virtual/helper ids are ignored.
   */
  findViolations(
    inputModuleIds: readonly string[],
    workDir: string,
    hostName: string
  ): ForeignPackageInlining[] {
    const violations: ForeignPackageInlining[] = [];
    for (const key of inputModuleIds) {
      if (key.includes('\0')) continue;
      const bare = key.split('?')[0];
      // Non-file namespaces: `(disabled):…`, `ns:…`, `node:…`.
      if (/^\(?[a-z-]+\)?:/i.test(bare) && !path.isAbsolute(bare)) continue;
      if (!ForeignPackageInliningGuard.SCRIPT.test(bare)) continue;
      const input = path.resolve(workDir, bare);
      const owner = this.ownerOf(input);
      if (owner === undefined || owner === hostName) continue;
      if (!this.names.has(owner)) continue;
      violations.push({ packageName: owner, input });
    }
    return violations;
  }

  /** The package owning `input`, when one can be named. */
  private ownerOf(input: string): string | undefined {
    const segments = input.split(path.sep);
    const nm = segments.lastIndexOf('node_modules');
    if (nm !== -1 && nm + 1 < segments.length) {
      const first = segments[nm + 1];
      if (first.startsWith('@')) {
        return nm + 2 < segments.length ? `${first}/${segments[nm + 2]}` : undefined;
      }
      return first;
    }
    for (const { name, dir } of this.dirs) {
      const rel = path.relative(dir, input);
      if (rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)) return name;
    }
    return undefined;
  }

  /** The build-failing message, naming the offending packages and host unit. */
  static formatError(
    hostName: string,
    outputLabel: string,
    violations: readonly ForeignPackageInlining[]
  ): string {
    const byPackage = new Map<string, string[]>();
    for (const v of violations) {
      const list = byPackage.get(v.packageName) ?? [];
      list.push(v.input);
      byPackage.set(v.packageName, list);
    }
    const lines = [...byPackage].map(
      ([name, inputs]) =>
        `  - "${name}" (${inputs.length} module(s), e.g. ${inputs[0]})`
    );
    return (
      `[unit-producer] shared package "${hostName}": ${outputLabel} inlines ` +
      `modules of other shared package(s):\n${lines.join('\n')}\n` +
      `Every shared package is delivered once, from its own graph; an ` +
      `inlined copy is a second instance of it. Fix: keep the import a bare ` +
      `specifier the producer can externalize.`
    );
  }
}
