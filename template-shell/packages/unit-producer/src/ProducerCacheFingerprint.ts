/**
 * `ProducerCacheFingerprint` — the producer-side part of the mix string
 * folded into the build-cache key (`PackageBuildCache.fingerprint`'s
 * `mix` argument):
 *
 *   - the producer's own built code (`ProducerCodeHash.compute()` —
 *     a content hash of the `dist/` files actually executed, computed
 *     once per process), so a change to producer code without a
 *     version bump cannot reuse outputs computed by old code;
 *   - the fixed build settings (`ProducerBuildSettings.fingerprintText`),
 *     so a settings change never reuses a computation it did not run;
 *   - the installed versions of the toolchain that runs inside the
 *     cached computation (the bundler, its plugins, the minifier and the
 *     parsers), so a toolchain update never reuses its predecessor's
 *     output;
 *   - a cache-schema tag, bumped when the key composition changes.
 *
 * The package-side inputs — the package's own files and the files of
 * the packages its build reads — are folded in by `UnitProducer`. The
 * producer's *version string* is deliberately NOT in the key: a version
 * label is not a content hash.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { PackageContentFingerprints } from './PackageContentFingerprints';
import { PackageJsonResolver } from './PackageJsonResolver';
import { ProducerBuildSettings } from './ProducerBuildSettings';
import { ProducerCodeHash } from './ProducerCodeHash';

/** The packages that run inside the cached computation. */
const TOOLCHAIN = [
  '@babel/parser',
  '@rollup/plugin-commonjs',
  '@rollup/plugin-json',
  '@rollup/plugin-node-resolve',
  '@rollup/plugin-replace',
  '@rollup/plugin-url',
  'cjs-module-lexer',
  'esbuild',
  'rollup',
  'terser',
] as const;

/** The installed version of a toolchain package, as the producer resolves it. */
export type ToolchainVersionReader = (name: string) => string;

export class ProducerCacheFingerprint {
  private static toolchain: string | undefined;
  private static reader: ToolchainVersionReader | undefined;

  /**
   * The installed toolchain versions, as JSON, resolved from the
   * producer's own location the way its imports resolve; memoized per
   * process.
   */
  static toolchainText(): string {
    if (ProducerCacheFingerprint.toolchain !== undefined) {
      return ProducerCacheFingerprint.toolchain;
    }
    const read = ProducerCacheFingerprint.reader ?? ProducerCacheFingerprint.installedVersion;
    const versions: Record<string, string> = {};
    for (const name of TOOLCHAIN) versions[name] = read(name);
    ProducerCacheFingerprint.toolchain = JSON.stringify(versions);
    return ProducerCacheFingerprint.toolchain;
  }

  /**
   * Tests only: reads the toolchain versions through `reader` (the
   * installed ones when absent) and forgets the memoized text.
   */
  static useToolchainReader(reader: ToolchainVersionReader | undefined): void {
    ProducerCacheFingerprint.reader = reader;
    ProducerCacheFingerprint.toolchain = undefined;
  }

  private static installedVersion(name: string): string {
    const from = path.dirname(fileURLToPath(import.meta.url));
    const pkgJson = PackageJsonResolver.resolve(from, name);
    if (pkgJson === undefined) return 'absent';
    try {
      return (
        (JSON.parse(fs.readFileSync(pkgJson, 'utf-8')) as { version?: string }).version ??
        'unversioned'
      );
    } catch {
      return 'unreadable';
    }
  }

  /**
   * The content fingerprints of the packages a package's build reads:
   * its declared dependencies, resolved from its install view as its
   * bare imports resolve. The member respell follows their barrels and
   * the module-kind classification reads their entry files, so a change
   * to one of them changes the cached computation. Names and content
   * only — no location — so the key is the same from any install path.
   */
  static dependencyFingerprints(
    dep: {
      pkg: {
        dependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
        optionalDependencies?: Record<string, string>;
      };
      installDir: string;
      packageDir: string;
    },
    fingerprints: PackageContentFingerprints
  ): string {
    const names = [
      ...new Set([
        ...Object.keys(dep.pkg.dependencies ?? {}),
        ...Object.keys(dep.pkg.peerDependencies ?? {}),
        ...Object.keys(dep.pkg.optionalDependencies ?? {}),
      ]),
    ].sort();
    return names
      .map((name) => {
        const pkgJson = [dep.installDir, dep.packageDir]
          .map((dir) => PackageJsonResolver.resolve(dir, name))
          .find((p): p is string => p !== undefined);
        return pkgJson === undefined
          ? `${name}:absent`
          : `${name}:${fingerprints.of(path.dirname(pkgJson))}`;
      })
      .join('\n');
  }

  /**
   * The mix string for the build-cache key. Deterministic for a given
   * code hash; independent of the producer version string.
   */
  static mix(codeHash: string): string {
    return (
      `${codeHash}\n` +
      `${ProducerBuildSettings.fingerprintText()}\n` +
      `${ProducerCacheFingerprint.toolchainText()}\n` +
      `cache-schema-13`
    );
  }

  /**
   * The mix string using the memoized producer code hash — the form
   * `UnitProducer.computeChunks` folds into the build-cache key.
   */
  static forProcess(): string {
    return ProducerCacheFingerprint.mix(ProducerCodeHash.compute());
  }
}
