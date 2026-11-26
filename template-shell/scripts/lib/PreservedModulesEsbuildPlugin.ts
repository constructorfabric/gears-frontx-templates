/**
 * `PreservedModulesEsbuildPlugin` — turns an esbuild bundle over every
 * source module of a package into preserved-module ESM output
 * (`ecosystem_package_build_output`): each source module is its own entry
 * point, and every relative import of another source module stays an
 * external relative module import, rewritten to the emitted `.js` file.
 * The unit producer's entry-point chunking can then split the package
 * along its real module graph instead of meeting one opaque bundle.
 *
 *  - A relative import resolving to a JavaScript/TypeScript module under
 *    `sourceDir` stays external as `./<path>.js`, relative to the
 *    importer's emitted file (the output mirrors the source tree).
 *  - Any other relative import (`./data.json`) is bundled into the
 *    importing module, as before.
 *  - Every bare import (`react`, `pkg/sub`, `node:fs`) stays external.
 *
 * esbuild has no preserve-modules mode; this plugin plus one entry point
 * per source module (tsup's glob `entry`) is that mode.
 */

import type * as esbuild from 'esbuild';
import * as fs from 'node:fs';
import * as path from 'node:path';

export class PreservedModulesEsbuildPlugin {
  /** The esbuild plugin name. */
  static readonly NAME = 'frontx-preserved-modules';

  private static readonly NESTED_MARKER = 'frontx-preserved-modules-nested';
  private static readonly SOURCE_MODULE = /\.(?:ts|tsx|js|jsx|mts|mjs)$/;
  private static readonly DECLARATION = /\.d\.[cm]?ts$/;

  private readonly sourceDir: string;

  constructor(params: { sourceDir: string }) {
    // Real paths: esbuild resolves through symlinks (`/var` → `/private/var`).
    this.sourceDir = PreservedModulesEsbuildPlugin.realPath(path.resolve(params.sourceDir));
  }

  /**
   * The specifier an emitted module uses to import `target` from
   * `importer` (both absolute source paths): posix, `./`-prefixed, with
   * the emitted `.js` extension.
   */
  static outputSpecifier(importer: string, target: string): string {
    const rel = path
      .relative(path.dirname(importer), target)
      .split(path.sep)
      .join('/')
      .replace(/\.(?:ts|tsx|jsx|mts)$/, (ext) => (ext === '.mts' ? '.mjs' : '.js'));
    return rel.startsWith('.') ? rel : `./${rel}`;
  }

  private static realPath(p: string): string {
    try {
      return fs.realpathSync(p);
    } catch {
      return p;
    }
  }

  toEsbuildPlugin(): esbuild.Plugin {
    const sourceDir = this.sourceDir;
    return {
      name: PreservedModulesEsbuildPlugin.NAME,
      setup(build) {
        build.onResolve({ filter: /.*/ }, async (args) => {
          if (args.kind === 'entry-point') return null;
          const data = args.pluginData as Record<string, unknown> | undefined;
          if (data?.[PreservedModulesEsbuildPlugin.NESTED_MARKER] === true) return null;
          if (path.isAbsolute(args.path)) return null;
          if (!args.path.startsWith('./') && !args.path.startsWith('../') && args.path !== '.' && args.path !== '..') {
            // Bare: another package (or a built-in) — never inlined.
            return { path: args.path, external: true };
          }
          const result = await build.resolve(args.path, {
            kind: args.kind,
            importer: args.importer,
            resolveDir: args.resolveDir,
            pluginData: { [PreservedModulesEsbuildPlugin.NESTED_MARKER]: true },
          });
          if (result.errors.length > 0) return { errors: result.errors };
          const target = result.path;
          if (
            !PreservedModulesEsbuildPlugin.SOURCE_MODULE.test(target) ||
            PreservedModulesEsbuildPlugin.DECLARATION.test(target)
          ) {
            return null;
          }
          const rel = path.relative(sourceDir, PreservedModulesEsbuildPlugin.realPath(target));
          if (rel.startsWith('..') || path.isAbsolute(rel)) {
            return {
              errors: [
                {
                  text:
                    `"${args.path}" from ${args.importer} resolves outside the ` +
                    `package source directory; a preserved-module build cannot ` +
                    `emit it as a sibling module`,
                },
              ],
            };
          }
          return {
            path: PreservedModulesEsbuildPlugin.outputSpecifier(args.importer, target),
            external: true,
          };
        });
      },
    };
  }
}
