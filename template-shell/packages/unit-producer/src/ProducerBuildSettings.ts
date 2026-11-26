/**
 * `ProducerBuildSettings` — the fixed settings every chunk and
 * entry build runs under, so a unit's hashed bytes depend only on the
 * package's `package@version` and module set — never on the consuming
 * build's config (byte identity).
 *
 * Bundler parity: shared packages are built by the producer's
 * own exact-pinned Rollup with its standard plugins — node
 * resolution (browser/production conditions, `browser` field),
 * CommonJS, JSON, imported-asset files and `new URL(…, import.meta.url)`
 * emission — under fixed deterministic settings. No custom
 * resolution, interop or shape heuristic sits between the package and
 * the bundler.
 *
 * The pinned set:
 *   - `format: 'es'` code-split per entry — the unit shape
 *   - `@rollup/plugin-replace` `process.env.NODE_ENV: "production"` —
 *     production defines, fixed; the consumer's NODE_ENV never
 *     reaches unit bytes
 *   - `@rollup/plugin-node-resolve` `browser: true`, conditions
 *     `production`/`browser`/`import`/`module`/`default`,
 *     `preferBuiltins` — the `browser` field and production
 *     conditions, like every standard bundler production build
 *   - `@rollup/plugin-commonjs` (+ mixed ES modules) — the standard
 *     CommonJS interop; non-literal `require()` stays a runtime
 *     require through the plugin's helper
 *   - `@rollup/plugin-json` — JSON modules
 *   - `@rollup/plugin-url` `limit: 0` — imported assets emitted as
 *     files; `new URL(…, import.meta.url)` assets emit natively
 *   - synchronous inline `terser` (`compress: true`, `mangle: true`,
 *     `format.comments: false`) — fixed whitespace, identifier and
 *     syntax minification matching the size gate's reference; the
 *     `frontx-member-name-restore` output plugin re-aliases minified
 *     short names back to the source member names the emitted public
 *     module interfaces answer
 *   - `treeshake.moduleSideEffects` default — the `sideEffects` field
 *     incl. globs gates module inclusion (the standard bundlers'
 *     semantics)
 *   - `preserveSymlinks` — a package reached through a symlinked
 *     `node_modules` entry keeps `node_modules/<pkg>/…` module paths
 *   - no chunk merging — Rollup's normal chunking, no
 *     `experimentalMinChunkSize`
 *   - `chunkFileNames: 'chunks/[name]-[hash].js'` — internal chunks
 *     get deterministic content-hashed names
 *   - `sourcemap: false` — no source-map text inside hashed bytes
 */

import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import nodeResolve from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import { minify as terserMinify } from 'terser';
import url from '@rollup/plugin-url';
import type { OutputOptions, Plugin } from 'rollup';

/**
 * Post-minification member-name restore: `minifyInternalExports`
 * renames exported bindings on non-entry chunks
 * (`export{compareStrings as c}`) — dedup-safe inside one build, but
 * the unit model's specifier-answer contract needs the source member
 * name: an external chunk asks `import { compareStrings } from
 * 'pkg/sub'` and the answering chunk must export `compareStrings`. A
 * member-name alias `export{compareStrings as "compareStrings"}` is
 * appended for every short renamed export whose local binding still
 * carries the source name, so both names resolve.
 */
export function restoreMemberNames(code: string): string {
  const shortName = /^[$\w]{1,3}$/;
  const exported = new Set<string>();
  const aliases: string[] = [];
  // `export{X as y} from "mod"` is a pass-through re-export — `X`
  // is the source module's binding, not a local one, so it must not
  // be aliased back. Only bare `export{X as y}` lists bind locally.
  // `from` clauses still feed the exported-name set.
  for (const m of code.matchAll(/export\s*\{([^}]*)\}(\s*from\b)?/g)) {
    const isReExport = m[2] !== undefined;
    for (const part of m[1].split(',')) {
      const seg = part.trim();
      const am = seg.match(/^([\w$]+)\s+as\s+"?([\w$]+)"?$/);
      if (am) {
        exported.add(am[2]);
        if (isReExport) continue;
        // `export{compareStrings as c}` renames the exported name;
        // the local binding `compareStrings` still carries the member
        // name — re-export it under that name. Generated bindings
        // (`__frontx_n1 as jsx`) are skipped: `jsx` already is the
        // member name.
        if (
          am[1] !== 'default' &&
          am[2] !== 'default' &&
          shortName.test(am[2]) &&
          am[1] !== am[2] &&
          !am[1].startsWith('__frontx_')
        ) {
          aliases.push(am[1]);
        }
      } else {
        const nm = seg.match(/^"?([\w$]+)"?$/);
        if (nm) exported.add(nm[1]);
      }
    }
  }
  const extra = aliases.filter((a) => !exported.has(a));
  if (extra.length === 0) return code;
  const seen = new Set<string>();
  const list = extra
    .filter((a) => (seen.has(a) ? false : (seen.add(a), true)))
    .map((a) => `${a} as "${a}"`)
    .join(',');
  return `${code}export{${list}};`;
}

export const ProducerBuildSettings = {
  /** The production defines, fixed for every build. */
  defines: {
    'process.env.NODE_ENV': 'production',
  } as Record<string, string>,


  /**
   * The standard plugin set, fresh per build (plugins hold per-build
   * state). Order: replace before resolution so conditionals fold on
   * the production define; commonjs after nodeResolve per the
   * plugins' contract.
   */
  plugins(options?: {
    /**
     * Whether an external specifier resolves to an ES module — the
     * commonjs plugin cannot classify specifiers it never resolves,
     * so `require()` of an ESM external needs the answer supplied.
     */
    esmExternals?: (id: string) => boolean;
  }): Plugin[] {
    return [
      replace({
        preventAssignment: true,
        values: Object.fromEntries(
          Object.entries(ProducerBuildSettings.defines).map(([k, v]) => [
            k,
            JSON.stringify(v),
          ])
        ),
      }),
      nodeResolve({
        browser: true,
        exportConditions: [
          'production',
          'browser',
          'import',
          'module',
          'default',
        ],
        preferBuiltins: true,
      }),
      commonjs({
        transformMixedEsModules: true,
        ...(options?.esmExternals !== undefined
          ? { esmExternals: options.esmExternals }
          : {}),
      }),
      json(),
      url({ limit: 0, fileName: 'assets/[name]-[hash][extname]' }),
    ];
  },

  /** The output plugin set (render-chunk), fresh per build. */
  outputPlugins(): Plugin[] {
    return [
      // Full minification, run synchronously inside the bundler —
      // a worker-pool minifier idles the whole package corpus.
      // `compress: true` + `mangle: true` + `format.comments: false`
      // is the fixed shape every unit build runs under: byte
      // identity depends only on `package@version` and module set, so
      // the size gate compares against the same minified shape on
      // every consumer. The `frontx-member-name-restore` output
      // plugin below re-aliases minified short names back to the
      // source member names the emitted public interfaces answer.
      {
        name: 'frontx-terser-minify',
        async renderChunk(code) {
          const result = await terserMinify(code, {
            compress: true,
            mangle: true,
            format: { comments: false },
          });
          return { code: result.code ?? code, map: null };
        },
      },
      // Member-name restore, run as an output
      // plugin so the mutated code is what gets hashed, recorded
      // and written — a post-write file rewrite loses races with
      // content-hashed names and the package build cache.
      {
        name: 'frontx-member-name-restore',
        // `generateBundle` — `preserveEntrySignatures` facade export
        // lists are assembled after `renderChunk`, so the pass runs
        // where `chunk.code` can still be mutated before write.
        generateBundle(_options, bundle) {
          for (const o of Object.values(bundle)) {
            if (o.type === 'chunk') {
              o.code = restoreMemberNames(o.code);
            } else if (
              o.type === 'asset' &&
              o.fileName.endsWith('.js') &&
              typeof o.source === 'string'
            ) {
              o.source = restoreMemberNames(o.source);
            }
          }
        },
      },
    ];
  },

  /**
   * The fixed `bundle.generate`/`write` output options shared by every
   * hashed-byte build. Entry file names come from the input map keys
   * (`[name]`).
   */
  outputOptions(): OutputOptions {
    return {
      format: 'es',
      entryFileNames: '[name].js',
      chunkFileNames: 'chunks/[name]-[hash].js',
      assetFileNames: 'assets/[name]-[hash][extname]',
      sourcemap: false,
      plugins: ProducerBuildSettings.outputPlugins(),
    };
  },

  /**
   * A stable serialization of the fixed settings — folded into the
   * build-machine cache fingerprint so a settings change never reuses
   * a computation it did not run.
   */
  fingerprintText(): string {
    return JSON.stringify({
      bundler: 'rollup',
      rollup: '4.67.4',
      conditions: [
        'production',
        'browser',
        'import',
        'module',
        'default',
      ],
      define: { 'process.env.NODE_ENV': 'production' },
      commonjs: { transformMixedEsModules: true },
      cjsEntryFacade: true,
      esmExternals: 'module-kind',
      preserveEntrySignatures: 'strict',
      memberAliasRestore: true,
      minify: 'terser{compress:true,mangle:true,comments:false}',
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        preserveEntrySignatures: 'strict',
        sourcemap: false,
      },
    });
  },
} as const;
