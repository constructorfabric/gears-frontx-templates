/**
 * `RollupPackageBundler` — the one split build of a shared package
 * under bundler parity: the producer's exact-pinned Rollup with
 * its standard plugins (`ProducerBuildSettings`) builds the package's
 * complete entry set in one pass; overlapping internals land in
 * shared internal chunks under Rollup's normal
 * chunking — no merging — and every bare specifier — every shared
 * package, the package's own name included — stays an external edge
 * the emitted lists later answer.
 *
 * The bundler does all module work: node resolution (`browser` field,
 * production/browser conditions), CommonJS interop, JSON, assets,
 * tree shaking under the `sideEffects` semantics. The producer
 * adds only the entry set, the externalization of shared specifiers,
 * content-addressed names and the flat lists.
 *
 * Supplementary builds pass `externalizeModules`: modules the
 * package's chunk set already owns are externalized back to their
 * `pkg/<rel>` module-path specifier, so a deep-import build never
 * mints a second copy of an owned module.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { parse as parseCjs, init as initCjsLexer } from 'cjs-module-lexer';
import { rollup, type OutputAsset, type OutputChunk, type Plugin, type RollupBuild, type RollupOutput } from 'rollup';

import { ExternalModuleKind } from './ExternalModuleKind';
import { UnitFileNaming } from './UnitFileNaming';
import { ProducerBuildSettings } from './ProducerBuildSettings';
import { ReexportResolver } from './ReexportResolver';
import type { BuildStageTimer } from './BuildStageTimer';

/** One chunk of a package's split build, pre byte-shaping. */
export interface BundledChunk {
  /** Chunk id — its outdir-relative emitted path. */
  id: string;
  /** Absolute emitted file. */
  file: string;
  /** Deterministic name segment for content naming. */
  namePath: string;
  /** Absolute input file when this chunk is an entry output. */
  entryPoint?: string;
  /** Package-relative module paths the chunk owns. */
  modulePaths: string[];
  /** External edges: specifier + kind (`static` | `dynamic`). */
  externalEdges: Array<{ specifier: string; kind: string }>;
  /** Internal edges to sibling chunk ids, with kind. */
  internalEdges: Array<{ id: string; kind: string }>;
  /** Whether the entry output wraps a CommonJS module. */
  isCjsEntry: boolean;
  /** Emitted non-JS files the chunk references (assets), outdir-relative. */
  referencedFiles: string[];
}

export interface BundlerBuildResult {
  chunks: BundledChunk[];
  /** Every real input module id the build saw (the inlining guard's data). */
  inputModuleIds: string[];
}


export class RollupPackageBundler {
  /**
   * Resolves CJS reexport specifiers from the reexporting file with
   * the same browser/production resolution the producer's bundler
   * uses. One cache per bundler instance — the bundler is
   * per `UnitProducer`, so the cache is per produce.
   */
  private readonly reexportResolver = new ReexportResolver();

  /**
   * Per-build `cjs-module-lexer` cache, keyed by the resolved
   * (realpath) file id. Each CJS file is parsed at most once per
   * produce — a barrel that reexports hundreds of sub-modules
   * (date-fns's root reexports 245) reaches each leaf through one
   * reexport edge, and the leaves are reached again when their
   * sub-modules' own reexport edges are followed; without memoizing,
   * the same file would be re-read and re-lexed at every visit
     * `null` is cached for files that fail to read or parse,
   * so a broken leaf reached through many reexport paths is reported
   * once and skipped cheaply afterwards.
   *
   * Per-bundler instance = per-`UnitProducer` = per-produce, so the
   * cache is fresh every build and never leaks across produces.
   */
  private readonly cjsLexerCache = new Map<
    string,
    { exports: string[]; reexports: string[] } | null
  >();

  /**
   * One Rollup split build over `input` (outname → file) written into
   * `outdir`. `dep` carries the package's name and both dirs:
   * `packageDir` (real) for module ownership, `installDir` (the path
   * imports resolve through) kept by `preserveSymlinks`.
   */
  async build(options: {
    dep: { name: string; packageDir: string; installDir: string };
    input: Record<string, string>;
    outdir: string;
    /**
     * Package-relative module paths already owned by the package's
     * chunk set — externalized to their `pkg/<rel>` specifier
     * (supplementary builds only).
     */
    externalizeModules?: ReadonlySet<string>;
    /**
     * Source transform applied to the package's own modules before
     * chunking — the member respelling of named imports taken from
     * other shared packages' barrels (the rewrite applies to shared-package
     * importers: `import { X } from 'barrel-pkg'` becomes the member
     * chunk's `pkg/<rel>` specifier under the side-effect rules,
     * so the chunk's external edge names the member chunk, never the
     * whole root entry).
     */
    transformModule?: (
      code: string,
      id: string
    ) => Promise<{ code: string; rewrites: number } | null>;
    /** Silence plugin warnings for transitive packages. */
    quiet?: boolean;
    /**
     * Per-stage build-time instrumentation. When passed,
     * the bundler measures the `rollup` stage over the `rollup()`
     * call (input graph construction) and the `terser` stage over the
     * `bundle.write()` output-generation pass (which runs the
     * synchronous inline terser `renderChunk`). The timer is a side
     * channel: it writes nothing into the emitted bytes.
     */
    stageTimer?: BuildStageTimer;
  }): Promise<BundlerBuildResult> {
    const { dep, outdir } = options;
    const stageTimer = options.stageTimer;
    // Owned modules (supplementary builds): the resolved file stays
    // external and `output.paths` emits its `pkg/<rel>` specifier —
    // Rollup emits external ids through `paths`, so the specifier is
    // the module-path spelling the owning chunk answers.
    const ownedPaths = new Map<string, string>();
    // Module ids are realpath'd below; the package root must be too —
    // under a symlinked tree (e.g. /tmp on macOS) a non-real
    // packageDir makes `path.relative` escape with `..` and owned
    // modules silently stop being recognized.
    const packageReal = this.realpathOf(dep.packageDir) ?? dep.packageDir;
    const installReal = this.realpathOf(dep.installDir) ?? dep.installDir;
    const moduleKind = new ExternalModuleKind([
      dep.installDir,
      dep.packageDir,
    ]);
    // The build's own entry files can never be external — a
    // supplementary entry whose module another chunk already owns is
    // bundled (a thin second copy) rather than externalized.
    const entryReals = new Set(
      Object.values(options.input)
        .map((f) => this.realpathOf(f))
        .filter((f): f is string => f !== undefined)
    );
    // CommonJS entries get a generated ESM facade (see class doc):
    // the bundler sees no named-import request for a shared package's
    // entries — every consumer is external — so a CJS entry would
    // emit a default-only chunk and `import { x } from 'pkg'` in an
    // emitted chunk would break at load. The facade re-exports the
    // entry's statically-detected named export surface name by name;
    // ESM and unreadable entries, and CJS entries whose named
    // exports the static lexer cannot recover, keep their direct
    // input and let `@rollup/plugin-commonjs` do the interop.
    await initCjsLexer;
    const facadeModules = new Map<string, { file: string; names: string[] }>();
    const input: Record<string, string> = {};
    for (const [outname, file] of Object.entries(options.input)) {
      const names = await this.cjsEntryNames(file);
      if (names === undefined || names.length === 0) {
        input[outname] = file;
        continue;
      }
      const virtual = `\0frontx-cjs-entry:${file}`;
      facadeModules.set(virtual, { file, names });
      input[outname] = virtual;
    }
    // @cpt-begin:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-externalize-imports
    const external = (
      source: string,
      _importer: string | undefined,
      isResolved: boolean
    ): boolean => {
      if (bare(source) || source.startsWith('node:')) return true;
      if (
        isResolved &&
        options.externalizeModules !== undefined &&
        path.isAbsolute(source)
      ) {
        const marker = this.ownedSpecifier(
          source,
          packageReal,
          options.externalizeModules,
          dep.name,
          entryReals
        );
        if (marker !== undefined) {
          // `output.paths` emits this verbatim: a protocol-tagged
          // id is never relativized; the record pass strips the
          // marker back to the `pkg/<rel>` specifier.
          ownedPaths.set(source, marker);
          return true;
        }
      }
      return false;
    };
    // @cpt-end:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-externalize-imports
    const plugins: Plugin[] = [
      // The CJS entry facade: a `load` step emitting one ESM wrapper
      // per CJS entry — `default` carries the whole `module.exports`,
      // each enumerated name a named re-export. The inner `import`
      // resolves through the standard chain, so the CommonJS plugin
      // still does the interop; the facade only exposes the surface.
      {
        name: 'frontx-cjs-entry-facade',
        resolveId: {
          order: 'pre',
          handler(source) {
            return facadeModules.has(source) ? source : null;
          },
        },
        load(id) {
          const entry = facadeModules.get(id);
          if (entry === undefined) return null;
          // `as "name"` keeps every enumerated name a legal export
          // — reserved words and non-identifier names included.
          const names = entry.names
            .map(
              (n, i) =>
                `const __frontx_n${i} = __frontx_cjs__[${JSON.stringify(n)}];\n` +
                `export { __frontx_n${i} as ${JSON.stringify(n)} };`
            )
            .join('\n');
          // `__moduleExports` is the plugin's synthetic export of the
          // real `module.exports` — a default import would run the
          // `__esModule`+`default` unwrapping and lose the exports on
          // dual-marked CJS packages, and `?commonjs-exports` yields
          // the pre-reassignment object when the entry does
          // `module.exports = require(...)`.
          return (
            `import { __moduleExports as __frontx_cjs__ } from ${JSON.stringify(
              entry.file
            )};\n` +
            `export default __frontx_cjs__;\n` +
            names +
            '\n'
          );
        },
      },
      // Non-JS imports (stylesheets, images, fonts) carry no module
      // surface — Rollup fails parsing them, so they load as an empty
      // module. esbuild's loader pipeline swallowed them the same way.
      // A consuming build imports the stylesheets itself where it
      // imports the shared module (`SharedStylesheetImports`).
      {
        name: 'frontx-non-js-stub',
        resolveId: {
          order: 'pre',
          handler(source) {
            if (
              /\.(css|less|scss|sass|svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|eot|mp4|webm|wasm|txt|md)(\?.*)?$/.test(
                source
              )
            ) {
              return `\0frontx-non-js-stub:${source}`;
            }
            return null;
          },
        },
        load(id) {
          return id.startsWith('\0frontx-non-js-stub:')
            ? 'export default "";'
            : null;
        },
      },
      // Member respelling: a transform step before chunking rewrites
      // the named imports a package module takes from another shared
      // package's barrel to the member chunk's `pkg/<rel>` specifier.
      // Bare specifiers inside the package resolve from its install
      // location (modules arrive on the install path under
      // `preserveSymlinks`), so the rewritten specifier is external
      // here and answered by that package's own chunk set.
      {
        name: 'frontx-member-respell',
        async transform(code, id) {
          if (options.transformModule === undefined) return null;
          if (id.includes('\0') || id.includes('?')) return null;
          if (!/\.[cm]?[jt]sx?$/.test(id)) return null;
          // Module ids arrive on the install path under
          // `preserveSymlinks`, but a resolver may realpath them —
          // the module is package-owned under either spelling.
          const inside = (root: string): string | undefined => {
            const rel = path.relative(root, id);
            return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
              ? rel
              : undefined;
          };
          const rel =
            inside(path.resolve(dep.installDir)) ?? inside(installReal);
          if (rel === undefined) return null;
          // A module under the package's own node_modules belongs to
          // another package.
          if (rel.split(path.sep).includes('node_modules')) return null;
          const out = await options.transformModule(code, id);
          return out === null ? null : { code: out.code, map: null };
        },
      },
      ...ProducerBuildSettings.plugins({
        // `require()` of an external emits a default import for CJS
        // targets and a namespace proxy for ESM ones — the plugin
        // cannot classify specifiers it never resolves, so the
        // module-kind classifier answers per bare id, from the
        // package's install view.
        esmExternals: (id) => moduleKind.isEsm(id),
      }),
      // Packages import sibling modules without an extension
      // (`import hasClass from './hasClass'`) — when the resolver
      // chain hands back an extensionless id, retry the usual
      // module suffixes so the file actually loads.
      {
        name: 'frontx-suffix-resolve',
        resolveId: {
          order: 'post',
          async handler(source, importer) {
            if (
              importer === undefined ||
              source.includes('\0') ||
              (!source.startsWith('.') && !source.startsWith('/'))
            ) {
              return null;
            }
            const resolved = await this.resolve(source, importer, {
              skipSelf: true,
            });
            if (resolved !== null) return resolved;
            const base = source.startsWith('/')
              ? source
              : path.join(path.dirname(importer), source);
            for (const suffix of ['.js', '.mjs', '.cjs', '/index.js']) {
              if (fs.existsSync(`${base}${suffix}`)) {
                return await this.resolve(`${source}${suffix}`, importer, {
                  skipSelf: true,
                });
              }
            }
            return null;
          },
        },
      },
    ];
    const buildRollup = (): Promise<RollupBuild> => rollup({
      input,
      external,
      // An entry output must keep exactly the exports its source
      // module declares — the unit model's specifier-answer contract
      // is `import { member } from 'pkg/sub'` answered by an emitted
      // chunk exporting `member` under that name. 'strict' also keeps
      // entry modules in their own chunks instead of merging them into
      // shared chunks whose exported names get renamed.
      preserveEntrySignatures: 'strict',
      preserveSymlinks: true,
      plugins,
      treeshake: { moduleSideEffects: undefined },
      // Never stream plugin warnings: a chatty build blocks on a full
      // stderr pipe long before it finishes.
      logLevel: 'silent',
      onLog: () => undefined,
    });
    const bundle = stageTimer !== undefined
      ? await stageTimer.measureAsync('rollup', buildRollup)
      : await buildRollup();
    try {
      const writeOutput = (): Promise<RollupOutput> => bundle.write({
        dir: outdir,
        ...ProducerBuildSettings.outputOptions(),
        paths: (id) => {
          // An external id the resolver never grounded — an absolute
          // path possibly missing its extension — is probed here too:
          // when it lands on an owned module, the marker path is
          // emitted exactly as for resolved externals.
          const marker =
            ownedPaths.get(id) ??
            (options.externalizeModules !== undefined
              ? this.ownedSpecifier(id, packageReal, options.externalizeModules, dep.name, entryReals)
              : undefined);
          return marker ?? id;
        },
      });
      const { output } = stageTimer !== undefined
        ? await stageTimer.measureAsync('terser', writeOutput)
        : await writeOutput();
      this.unmarkOwned(outdir, output);
      return this.records(
        dep,
        outdir,
        output,
        ownedPaths,
        packageReal,
        options.externalizeModules,
        entryReals
      );
    } finally {
      await bundle.close();
    }
  }

  /**
   * Rewrites emitted `frontx-owned:<spec>` external ids back to the
   * module-path specifier they stand for (in every emitted chunk file
   * and the records' external edges).
   *
   * `output.paths` returns the marker as a string; Rollup almost
   * always quotes external specifiers in its emitted syntax
   * (`import … from "…"`, `import("…")`), so the quoted form is the
   * common path. The assertion below verifies that no emitted chunk
   * leaves an unquoted marker in the file — a `frontx-owned:` token
   * sitting outside a string literal would mean Rollup emitted the
   * marker as something other than a quoted specifier, and the
   * rewrite would silently miss it (the chunk's bytes would carry an
   * invalid import). If that ever happens, the build must fail loudly
   * so the cause is found, not papered over.
   */
  private unmarkOwned(
    outdir: string,
    output: (OutputChunk | OutputAsset)[]
  ): void {
    for (const o of output) {
      if (o.type !== 'chunk') continue;
      const file = path.join(outdir, o.fileName);
      const text = fs.readFileSync(file, 'utf-8');
      if (!text.includes('frontx-owned:')) continue;
      // Rollup relativizes path-looking external ids, so the marker
      // arrives behind a `./`/`../` prefix — the specifier is the
      // bare `pkg/<rel>` the owning chunk answers.
      const stripped = text.replace(
        /(["'])(?:\.\.?\/)*frontx-owned:([^"']+)\1/g,
        '"$2"'
      );
      // Every marker the quoted regex did not reach is a bug: the
      // bundler emitted a `frontx-owned:` token outside a string
      // literal. Refuse to write bytes that would not load.
      if (stripped.includes('frontx-owned:')) {
        throw new Error(
          `[unit-producer] unmarkOwned: ${o.fileName} still contains ` +
            `an unquoted 'frontx-owned:' marker after the rewrite — ` +
            `Rollup emitted the external id outside a string ` +
            `literal, which the quoted rewrite cannot reach. ` +
            `Investigate the emit path before re-running the build.`
        );
      }
      fs.writeFileSync(file, stripped, 'utf-8');
    }
  }

  /**
   * Emitted output → chunk records: edges, module ownership, entry
   * points. Internal edges are the chunk-relative import specifiers
   * of sibling emitted chunks; every other specifier is external.
   */
  private records(
    dep: { name: string; packageDir: string },
    outdir: string,
    output: (OutputChunk | OutputAsset)[],
    ownedPaths: ReadonlyMap<string, string> = new Map(),
    packageReal?: string,
    externalizeModules?: ReadonlySet<string>,
    entryReals: ReadonlySet<string> = new Set()
  ): BundlerBuildResult {
    const chunkOutputs = output.filter(
      (o): o is OutputChunk => o.type === 'chunk'
    );
    const fileNames = new Set(chunkOutputs.map((c) => c.fileName));
    const packageDirReal =
      packageReal ?? this.realpathOf(dep.packageDir) ?? dep.packageDir;
    const toId = (fromFile: string, spec: string): string =>
      path.posix.normalize(
        path.posix.join(path.posix.dirname(fromFile), spec)
      );
    const inputModuleIds = new Set<string>();
    const chunks: BundledChunk[] = [];
    for (const chunk of chunkOutputs) {
      const externalEdges = new Map<string, { specifier: string; kind: string }>();
      const internalEdges = new Map<string, { id: string; kind: string }>();
      const edge = (spec: string, kind: 'static' | 'dynamic'): void => {
        const internal =
          spec.startsWith('./') || spec.startsWith('../')
            ? toId(chunk.fileName, spec)
            : fileNames.has(spec)
              ? spec
              : undefined;
        if (internal !== undefined && fileNames.has(internal)) {
          if (internal !== chunk.fileName) {
            internalEdges.set(`${kind}:${internal}`, { id: internal, kind });
          }
        } else if (!spec.startsWith('.')) {
          const mapped =
            ownedPaths.get(spec) ??
            (packageReal !== undefined &&
            externalizeModules !== undefined &&
            path.isAbsolute(spec)
              ? this.ownedSpecifier(
                  spec,
                  packageReal,
                  externalizeModules,
                  dep.name,
                  entryReals
                )
              : undefined) ??
            spec;
          const specifier = mapped.startsWith('frontx-owned:')
            ? mapped.slice('frontx-owned:'.length)
            : mapped;
          externalEdges.set(`${kind}:${specifier}`, { specifier, kind });
        }
      };
      for (const spec of chunk.imports) edge(spec, 'static');
      for (const spec of chunk.dynamicImports) edge(spec, 'dynamic');
      // `implicitlyLoadedBefore` is deliberately not an edge: the
      // dependency direction it restates is already covered by the
      // importer's own edge, and the reverse direction fabricates
      // import cycles no real module graph has.
      const modulePaths: string[] = [];
      for (const id of Object.keys(chunk.modules)) {
        const real = this.realModulePath(packageDirReal, id);
        if (real !== undefined) modulePaths.push(real);
        inputModuleIds.add(id);
      }
      modulePaths.sort();
      const entryPoint =
        chunk.facadeModuleId === null
          ? undefined
          : this.realpathOf(
              chunk.facadeModuleId.startsWith('\0frontx-cjs-entry:')
                ? chunk.facadeModuleId.slice('\0frontx-cjs-entry:'.length)
                : chunk.facadeModuleId
            );
      const isCjsEntry = Object.keys(chunk.modules).some(
        (m) =>
          m.includes('commonjs-entry') ||
          m.startsWith('\0frontx-cjs-entry:')
      );
      chunks.push({
        id: chunk.fileName,
        file: path.join(outdir, chunk.fileName),
        namePath:
          chunk.facadeModuleId === null && modulePaths.length > 0
            ? `chunk-${UnitFileNaming.namePathOf(modulePaths[0])}`
            : UnitFileNaming.namePathOf(
                chunk.fileName.replace(/\.js$/, '')
              ),
        entryPoint,
        modulePaths,
        externalEdges: [...externalEdges.values()].sort((a, b) =>
          a.specifier < b.specifier ? -1 : 1
        ),
        internalEdges: [...internalEdges.values()],
        isCjsEntry,
        referencedFiles: [...chunk.referencedFiles].sort(),
      });
    }
    return { chunks, inputModuleIds: [...inputModuleIds].sort() };
  }

  /**
   * The statically-detected named export surface of a CJS entry file:
   * `cjs-module-lexer` reads the source text without executing it
   * (no `require()`, no event-loop allocation, no side effects), and
   * returns the named exports and reexports the lexer's grammar
   * recognises. Sorted (deterministic), reduced to valid identifier
   * names minus `default`/`__esModule`.
   *
   * Reexports are followed for EVERY CJS entry — the entry's own
   * exports union with the named exports of every reexport target,
   * recursively. The pre-fix code only followed reexports
   * for reexport-ONLY entries (no own exports), which lost every
   * reexported name for a TypeScript-compiled entry that mixed own
   * exports with `__exportStar(require("./x"), exports)` (e.g.
   * `@globaltypesystem/gts-ts`'s `dist/index.js`): the lexer reported
   * the entry's own exports and a `./types` reexport, the code
   * returned the own exports and skipped the reexport, so the
   * facade minted by the producer exposed only the own names and
   * `import { InvalidSegmentError } from '@globaltypesystem/gts-ts'`
   * threw `does not provide an export named 'InvalidSegmentError'`
   * at load time.
   *
   * The walk is generic — no package names, no count limit. The
   * lexer resolves each reexport specifier from the reexporting
   * file with the same browser/production resolution the producer's
   * bundler uses (`ReexportResolver`), lexes the target, and unions
   * the names. Cycle-safe (a visited set per walk, keyed by realpath),
   * deterministic sorted output, like Node's ESM loader does with
   * this lexer. An unresolvable reexport falls back without crashing
   * and is reported — the walk continues with the names it did
   * recover.
   *
   * `null` for non-CJS files (ESM, JSON, anything but `.js`/`.cjs`),
   * unreadable files, and CJS files whose surface the lexer cannot
   * recover and whose reexports (if any) cannot be followed to any
   * named export — those keep their direct input and let
   * `@rollup/plugin-commonjs` do the interop. (The prior comment
   * claimed the commonjs plugin "emits the right named exports
   * itself" for reexport-only entries; it does not for the React
   * shape — a conditional `module.exports = require(…)` makes the
   * plugin emit only `default`, which left `import { createContext }
   * from 'react'` throwing at load time.)
   *
   * Replaces the prior `require()`-based enumeration, which executed
   * third-party CJS at build time: a package could allocate event-
   * loop resources at module scope (a top-level `new MessageChannel()`
   * in react-dom's server builds was the recorded case) and leave
   * them ref'd behind the require, pinning the build process open
   * after all work finished. Static analysis has no execution, so
   * no handles leak and no `unref` cleanup is needed.
   */
  private async cjsEntryNames(file: string): Promise<string[] | undefined> {
    // A `.json` entry is data, never a CommonJS module surface; an
    // `.mjs` entry is ESM by extension. Only `.js`/`.cjs` carry CJS.
    if (!/\.(js|cjs)$/i.test(file)) return undefined;
    // The lexer is already initialised at the top of `build`; the
    // `init` promise is idempotent so re-awaiting is a no-op.
    await initCjsLexer;
    const detected = this.lexCjs(file);
    if (detected === null) return undefined;
    // An entry with no reexports exposes only its own named
    // surface — no walk. (No names means the lexer could not
    // recover any; the entry keeps its direct input.)
    if (detected.reexports.length === 0) {
      const ownNames = filterExportNames(detected.exports);
      return ownNames.length > 0 ? [...ownNames].sort() : undefined;
    }
    // Every reexport target's named exports union with the entry's
    // own: a TS-compiled entry's `__exportStar` reexport is
    // followed the same way a reexport-only entry's
    // `module.exports = require(…)` is. Cycle-safe (visited set per
    // walk, keyed by realpath); deterministic sorted output.
    const names = new Set<string>(filterExportNames(detected.exports));
    const unresolved: Array<{ from: string; specifier: string }> = [];
    const visited = new Set<string>();
    const collect = async (f: string): Promise<void> => {
      const real = this.realpathOf(f);
      if (real === undefined) return;
      if (visited.has(real)) return;
      visited.add(real);
      const det = this.lexCjs(f);
      if (det === null) return;
      for (const n of filterExportNames(det.exports)) names.add(n);
      for (const r of det.reexports) {
        const target = await this.reexportResolver.resolve(r, path.dirname(f));
        if (target === undefined) {
          unresolved.push({ from: f, specifier: r });
          continue;
        }
        await collect(target);
      }
    };
    await collect(file);
    for (const u of unresolved) {
      console.warn(
        `[unit-producer] cjsEntryNames: could not follow reexport ` +
          `${JSON.stringify(u.specifier)} from ${u.from} — skipping ` +
          `(the bundler's commonjs plugin handles the interop)`
      );
    }
    return names.size > 0 ? [...names].sort() : undefined;
  }

  /**
   * Lexes `file` with `cjs-module-lexer`, memoizing the result per
   * resolved file path for the whole build: each CJS file is
   * parsed at most once per produce. Returns the parsed surface, or
   * `null` for unreadable files, files the lexer rejects, and
   * non-resolvable paths — the caller skips them without crashing.
   */
  private lexCjs(file: string): { exports: string[]; reexports: string[] } | null {
    const real = this.realpathOf(file);
    if (real === undefined) return null;
    const cached = this.cjsLexerCache.get(real);
    if (cached !== undefined) return cached;
    let source: string;
    try {
      source = fs.readFileSync(file, 'utf-8');
    } catch {
      this.cjsLexerCache.set(real, null);
      return null;
    }
    let detected: { exports: string[]; reexports: string[] };
    try {
      detected = parseCjs(source, file);
    } catch {
      this.cjsLexerCache.set(real, null);
      return null;
    }
    this.cjsLexerCache.set(real, detected);
    return detected;
  }

  /**
   * The package-relative path of a real module id, `undefined` for
   * virtual/helper ids and modules outside the package.
   */
  private realModulePath(
    packageDir: string,
    id: string
  ): string | undefined {
    const real = this.realpathOf(id);
    if (real === undefined) return undefined;
    const rel = path.relative(packageDir, real).split(path.sep).join('/');
    return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
      ? rel
      : undefined;
  }

  /** Real path of a module id (virtual prefixes and `?` tags stripped). */
  private realpathOf(id: string): string | undefined {
    if (id.includes('\0')) return undefined;
    const file = id.split('?')[0];
    if (!path.isAbsolute(file) || !fs.existsSync(file)) return undefined;
    return fs.realpathSync(file);
  }

  /**
   * `pkg/<rel>` specifier for an external id that realpaths to an
   * owned module (extension probing included), else `undefined`.
   */
  private ownedSpecifier(
    id: string,
    packageReal: string,
    owned: ReadonlySet<string>,
    name: string,
    entryReals: ReadonlySet<string>
  ): string | undefined {
    const real = this.realModuleFile(id);
    if (real === undefined || entryReals.has(real)) return undefined;
    const rel = path.relative(packageReal, real).split(path.sep).join('/');
    if (rel === '' || rel.startsWith('..') || !owned.has(rel)) {
      return undefined;
    }
    return `frontx-owned:${name}/${rel}`;
  }

  /**
   * Real path of a module FILE: a resolver may hand an extensionless
   * absolute id (packages importing `./hasClass` where only
   * `hasClass.js` exists); probe the usual module suffixes before
   * giving up.
   */
  private realModuleFile(id: string): string | undefined {
    const direct = this.realpathOf(id);
    if (direct !== undefined) return direct;
    if (id.includes('\0')) return undefined;
    const file = id.split('?')[0];
    for (const suffix of ['.js', '.mjs', '.cjs', '/index.js']) {
      const candidate = `${file}${suffix}`;
      if (fs.existsSync(candidate)) return fs.realpathSync(candidate);
    }
    return undefined;
  }
}

/** A bare package specifier (not a relative path, url or builtin tag). */
function bare(source: string): boolean {
  return (
    !source.startsWith('.') &&
    !source.startsWith('/') &&
    !source.includes('\0') &&
    !/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(source)
  );
}

/**
 * The named export surface of a lexer result, with the synthetic
 * `default` and `__esModule` markers the CJS interop generates
 * removed. A facade exposing them would either shadow the CJS
 * module's own `default` (the whole `module.exports`) or emit a
 * useless `__esModule` named export the lexer detected only because
 * the file sets `Object.defineProperty(exports, "__esModule", …)`.
 */
function filterExportNames(exports: readonly string[]): string[] {
  return exports.filter((n) => n !== 'default' && n !== '__esModule');
}
