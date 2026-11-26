/**
 * `ReexportResolver` — resolves a CJS
 * `module.exports = require(…)` reexport specifier from the
 * reexporting file using the same browser/production resolution the
 * producer's bundler uses (`@rollup/plugin-node-resolve` with
 * `browser: true` and conditions `production`/`browser`/`import`/
 * `module`/`default`), so following a reexport-only CJS entry's
 * reexports recursively reaches the same file the bundler would
 * bundle.
 *
 * Relative specifiers (`./x`, `../x`) resolve directly with extension
 * and index probing; bare specifiers and absolute paths resolve via
 * esbuild with the producer's exact conditions. Returns `undefined`
 * for unresolvable specifiers — the caller skips them without
 * crashing and reports (an unresolvable reexport falls back
 * without crash).
 *
 * Generic — no package names. Resolution conditions are the bundler's
 * fixed set, not a package-specific branch.
 */

import * as esbuild from 'esbuild';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** Resolution conditions, in preference order (bundler browser build). */
const CONDITIONS = ['production', 'browser', 'import', 'module', 'default'];

/** Suffixes probed for a relative specifier without an extension. */
const SUFFIXES = ['', '.js', '.mjs', '.cjs', '/index.js'];

export class ReexportResolver {
  private readonly cache = new Map<string, string | undefined>();

  /**
   * Resolves `specifier` (relative, absolute or bare) from `fromDir`
   * to the file the producer's bundler would load for it. `undefined`
   * for unresolvable specifiers — the caller skips without crashing.
   */
  async resolve(
    specifier: string,
    fromDir: string
  ): Promise<string | undefined> {
    const key = `${fromDir}\0${specifier}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const result = await this.resolveUncached(specifier, fromDir);
    this.cache.set(key, result);
    return result;
  }

  private async resolveUncached(
    specifier: string,
    fromDir: string
  ): Promise<string | undefined> {
    if (specifier.startsWith('./') || specifier.startsWith('../')) {
      const base = path.resolve(fromDir, specifier);
      return ReexportResolver.probe(base);
    }
    if (specifier.startsWith('/')) {
      return ReexportResolver.probe(specifier);
    }
    // Bare specifier (or `node:`-tagged builtin) — esbuild with the
    // producer's conditions. A builtin resolves as external, so the
    // capture stays empty and the caller skips it.
    return ReexportResolver.resolveViaEsbuild(specifier, fromDir);
  }

  private static probe(base: string): string | undefined {
    for (const suffix of SUFFIXES) {
      const candidate = base + suffix;
      if (ReexportResolver.isFile(candidate)) {
        return ReexportResolver.realpath(candidate);
      }
    }
    return undefined;
  }

  private static isFile(p: string): boolean {
    try {
      return fs.statSync(p).isFile();
    } catch {
      return false;
    }
  }

  private static realpath(p: string): string {
    try {
      return fs.realpathSync(p);
    } catch {
      return p;
    }
  }

  /**
   * One-shot esbuild resolve: a bundle whose only onResolve captures
   * the top-level import of `specifier` and immediately externalizes
   * it, so the build is a no-op over the dependency tree and finishes
   * with the resolved path (or an empty result on failure).
   */
  private static async resolveViaEsbuild(
    specifier: string,
    fromDir: string
  ): Promise<string | undefined> {
    let found: string | undefined;
    const marker = 'frontx-reexport-resolve-nested';
    try {
      await esbuild.build({
        stdin: {
          contents: `import ${JSON.stringify(specifier)};`,
          resolveDir: fromDir,
        },
        bundle: true,
        write: false,
        platform: 'browser',
        format: 'esm',
        conditions: CONDITIONS,
        logLevel: 'silent',
        plugins: [
          {
            name: 'frontx-reexport-resolve-capture',
            setup(build) {
              build.onResolve({ filter: /.*/ }, async (args) => {
                const data = args.pluginData as
                  | Record<string, unknown>
                  | undefined;
                if (data?.[marker] === true || args.path !== specifier) {
                  return null;
                }
                const result = await build.resolve(args.path, {
                  kind: args.kind,
                  resolveDir: args.resolveDir,
                  pluginData: { [marker]: true },
                });
                if (
                  result.errors.length === 0 &&
                  !result.external &&
                  result.path !== ''
                ) {
                  found = result.path;
                }
                return { path: args.path, external: true };
              });
            },
          },
        ],
      });
    } catch {
      return undefined;
    }
    if (found === undefined) return undefined;
    return ReexportResolver.realpath(found);
  }
}
