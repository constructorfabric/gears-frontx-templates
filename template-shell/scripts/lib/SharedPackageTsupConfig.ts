/**
 * `SharedPackageTsupConfig` — the tsup build of a template-shell
 * sub-package whose code is shared at unit granularity (`framework`,
 * `react`, `state`, `i18n`, `auth`; `ecosystem_package_build_output`):
 *
 *  - ESM with preserved modules: one output file per source module,
 *    internal imports kept as relative module imports
 *    ({@link PreservedModulesEsbuildPlugin}); declarations for the public
 *    entry points only, so `types` paths are unchanged.
 *  - CJS bundled per public entry point, as before (with its `.d.cts`
 *    declarations).
 *
 * Public entry points (and so every `exports` path) are the same file
 * names as the bundled build emitted. The two builds share one output
 * directory and tsup runs them concurrently, so neither cleans it: the
 * directory is emptied once, here, before both start.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Options } from 'tsup';

import { PreservedModulesEsbuildPlugin } from './PreservedModulesEsbuildPlugin';

export interface SharedPackageTsupConfigOptions {
  /** Public entry points: output name → source file (`index: 'src/index.ts'`). */
  entry: Record<string, string>;
  /** Externals of the bundled CJS build (ESM keeps every bare import external). */
  external?: Options['external'];
  /** Code splitting across the CJS entries (shared singletons). */
  cjsSplitting?: boolean;
  /** Empty the output directory before building. Default `true`. */
  cleanOutDir?: boolean;
  /** Package directory (absolute); every path is resolved against it. */
  packageDir: string;
}

export class SharedPackageTsupConfig {
  /** Every source module of the package, tests and declarations excluded. */
  static readonly SOURCE_GLOBS: readonly string[] = [
    'src/**/*.{ts,tsx}',
    '!src/**/*.test.{ts,tsx}',
    '!src/**/__tests__/**',
    '!src/**/*.d.ts',
  ];

  private static readonly OUT_DIR = 'dist';

  /** {@link SOURCE_GLOBS} anchored at `packageDir`, posix-style for the globber. */
  static sourceGlobs(packageDir: string): string[] {
    const base = packageDir.split(path.sep).join('/');
    return SharedPackageTsupConfig.SOURCE_GLOBS.map((glob) =>
      glob.startsWith('!') ? `!${base}/${glob.slice(1)}` : `${base}/${glob}`
    );
  }

  private readonly options: SharedPackageTsupConfigOptions;

  constructor(options: SharedPackageTsupConfigOptions) {
    this.options = options;
  }

  create(): Options[] {
    const packageDir = path.resolve(this.options.packageDir);
    const outDir = path.join(packageDir, SharedPackageTsupConfig.OUT_DIR);
    if (this.options.cleanOutDir !== false) {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
    const entry = Object.fromEntries(
      Object.entries(this.options.entry).map(([name, file]) => [
        name,
        path.join(packageDir, file),
      ])
    );
    const dts = { entry };
    const esm: Options = {
      entry: SharedPackageTsupConfig.sourceGlobs(packageDir),
      format: ['esm'],
      outDir,
      bundle: true,
      splitting: false,
      dts,
      sourcemap: true,
      clean: false,
      esbuildPlugins: [
        new PreservedModulesEsbuildPlugin({
          sourceDir: path.join(packageDir, 'src'),
        }).toEsbuildPlugin(),
      ],
    };
    const cjs: Options = {
      entry: { ...entry },
      format: ['cjs'],
      outDir,
      dts,
      sourcemap: true,
      clean: false,
      splitting: this.options.cjsSplitting ?? false,
      ...(this.options.external !== undefined ? { external: this.options.external } : {}),
    };
    return [esm, cjs];
  }
}
