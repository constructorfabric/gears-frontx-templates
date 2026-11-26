/**
 * `PackageEntryFileResolver` — resolves a bare specifier (`pkg`,
 * `pkg/sub`) to the file a browser ESM build loads for it, as seen from
 * a consumer directory: esbuild's own resolver with the producer's
 * platform (`browser`) and conditions, so the file is the one the
 * producer's entry build starts from. Results are real paths, cached per
 * `(fromDir, specifier)`.
 */

import * as esbuild from 'esbuild';
import * as fs from 'node:fs';

export class PackageEntryFileResolver {
  private static readonly NESTED = 'unit-producer-entry-file-resolve';

  private readonly cache = new Map<string, Promise<string | undefined>>();

  /** The real path of the file `specifier` resolves to from `fromDir`. */
  resolve(specifier: string, fromDir: string): Promise<string | undefined> {
    const key = `${fromDir}\0${specifier}`;
    let pending = this.cache.get(key);
    if (pending === undefined) {
      pending = PackageEntryFileResolver.resolveUncached(specifier, fromDir);
      this.cache.set(key, pending);
    }
    return pending;
  }

  private static async resolveUncached(
    specifier: string,
    fromDir: string
  ): Promise<string | undefined> {
    let found: string | undefined;
    const marker = PackageEntryFileResolver.NESTED;
    try {
      await esbuild.build({
        stdin: { contents: `import ${JSON.stringify(specifier)};`, resolveDir: fromDir },
        bundle: true,
        write: false,
        platform: 'browser',
        format: 'esm',
        logLevel: 'silent',
        plugins: [
          {
            name: 'unit-producer-entry-file-capture',
            setup(build) {
              build.onResolve({ filter: /.*/ }, async (args) => {
                const data = args.pluginData as Record<string, unknown> | undefined;
                if (data?.[marker] === true || args.path !== specifier) return null;
                const result = await build.resolve(args.path, {
                  kind: args.kind,
                  resolveDir: args.resolveDir,
                  pluginData: { [marker]: true },
                });
                if (result.errors.length === 0 && !result.external && result.path !== '') {
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
    try {
      return fs.realpathSync(found);
    } catch {
      return found;
    }
  }
}
