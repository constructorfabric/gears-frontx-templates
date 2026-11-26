/**
 * `MfeGtsPlugin` — the MFE-side Vite plugin object: asserts the plugin
 * owns Module Federation (a user-added federation plugin fails the
 * config), enforces the build settings remote loading requires,
 * resolves the shared
 * set via `SharedSetResolver` and externalizes it by root package name,
 * rewrites the MFE's named imports from shared barrels to the defining
 * modules (barrel handling, consumer half — so roots name only the
 * units defining used bindings; unanswered rewrites fall back to the
 * barrel after production), imports the stylesheets each shared module
 * the MFE imports loads where the MFE imports it (shared units load none,
 * so the MFE's own CSS carries them), rewrites lazy `import()` calls to
 * `__frontx_lazy`, captures the output
 * chunk graph, then in `closeBundle` produces the shared units, runs the
 * CSS and lazy checks, writes the GTS-typed closed enriched manifest
 * (`units`, `lists`, `metaData.sharedBase`),
 * validates every `mfe.json` entity by registering it with the type
 * system, and emits the per-MFE
 * build report.
 *
 * The hooks are thin delegates over private methods; the mutable state
 * they share lives in {@link MfeGtsBuildState}, one per build.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type {
  OutputBundle,
  OutputChunk,
  PluginContext,
  RenderedChunk,
  ResolveIdResult,
} from 'rollup';
import type { Plugin, ResolvedConfig, UserConfig } from 'vite';
import {
  AliasMap,
  BuildGraphSharing,
  ConsumerBarrelFallback,
  ConsumerBarrelResolver,
  ConsumerBarrelRewriteTransform,
  defaultProducerCacheDir,
  ExternalChain,
  FallbackReproduction,
  PackageJsonResolver,
  RuntimeEntryDetector,
  SharedSetResolver,
  SharedSetSelection,
  SharedSetSummary,
  SharedStylesheetImports,
  UnitProducer,
  type ProducedSharedPackage,
  type ResolvablePackageJson,
  type RuntimeEntryFields,
} from '@gears-frontx/unit-producer';

import { CssAttributor } from './CssAttributor';
import { EmptyCssRecorder } from './EmptyCssRecorder';
import { FederationChunkFilter } from './FederationChunkFilter';
import { GtsEntityValidator } from './GtsEntityValidator';
import { LazyImportTransformer } from './LazyImportTransformer';
import { LineEditSourceMap, type LineEditMap } from './LineEditSourceMap';
import { MfeBuildReport } from './MfeBuildReport';
import { MfeGtsBuildState } from './MfeGtsBuildState';
import { MfeManifestEnricher } from './MfeManifestEnricher';
import { SharedImportCheck } from './SharedImportCheck';
import { ExposeListComposer } from './ExposeListComposer';
import { SpecifiersDeriver } from './SpecifiersDeriver';
import type { SharedDepFetchList, SharedDepUnit } from '@gears-frontx/mfes/unit-format';
import type {
  CapturedChunk,
  FederationExpose,
  FederationManifest,
  MfeJson,
} from './types';

export interface VitePluginMfeGtsOptions {
  /**
   * The packages to share; mutually exclusive with `exclude` (both set
   * fails the build). Their runtime dependencies are shared too and
   * reported in the build report; `[]` shares nothing. Unset (with
   * `exclude` unset) shares every bare package the build graph imports.
   */
  include?: string[];
  /**
   * The `share.exclude` opt-out: packages removed from the shared set
   * (also read from `mfe.json`'s `share.exclude`; the two union). An
   * excluded package a still-shared package depends on fails the build.
   */
  exclude?: string[];
  /**
   * The MFE's `exposes` map (`'./name'` → module path). When absent,
   * `mfe.json`'s `exposes` field supplies it.
   */
  exposes?: Record<string, string>;
  /**
   * The package root: `package.json`, `mfe.json`, the shared set, the
   * exposes and the producer all resolve from it, whatever Vite's own
   * `root` is. Defaults to `process.cwd()` — where a Vite config file
   * runs.
   */
  root?: string;
  /**
   * Internal wiring: the plugin objects `vitePluginMfeGts` created from
   * `@module-federation/vite`, so the config hook can tell them apart
   * from a federation plugin added by hand — federation sharing is a
   * contract the plugin owns, and configuring it externally is a build
   * error.
   */
  ownedFederationPlugins?: ReadonlySet<unknown>;
  /**
   * Directory under the build output dir where shared units and fetch
   * lists are emitted. Default `'shared'`.
   */
  sharedOutDir?: string;
  /**
   * Per-package escape hatch from barrel rewriting. Applies to the MFE's
   * own code only; shared units' bytes never depend on it.
   */
  barrelRewriteExclude?: string[];
  /** Type-system override for entity validation (tests). */
  typeSystem?: ConstructorParameters<typeof GtsEntityValidator>[0];
  /**
   * Build-machine cache directory for the per-`package@version`
   * producer computation. Defaults to the workspace-wide
   * `<workspace root>/node_modules/.cache/frontx-unit-producer`,
   * shared with the shell and every other MFE build; set it for
   * separate repositories or a shared CI path.
   */
  cacheDir?: string;
}

/** The enriched manifest `MfeManifestEnricher.enrich` returns. */
type EnrichedResult = ReturnType<MfeManifestEnricher['enrich']>;

export class MfeGtsPlugin {
  private readonly options: VitePluginMfeGtsOptions;
  /** The package root, resolved once (`VitePluginMfeGtsOptions.root`). */
  private readonly root: string;

  constructor(options?: VitePluginMfeGtsOptions) {
    this.options = options ?? {};
    this.root = path.resolve(this.options.root ?? process.cwd());
    if ('chunkGrouping' in (this.options as object)) {
      throw new Error(
        '[vite-plugin-mfe-gts] "chunkGrouping" is not an option — shared packages use ' +
          "the bundler's normal chunking with no merging; remove it."
      );
    }
  }

  toVitePlugin(): Plugin {
    const state = new MfeGtsBuildState();
    // The empty-stylesheet recorder: placed before `vite:css-post` by
    // this plugin's own `configResolved`.
    const recorder = new EmptyCssRecorder(state.emptyCssModuleIds);
    const plugin = this;

    return {
      name: 'gears-frontx-vite-plugin-mfe-gts',
      // After @module-federation/vite so mf-manifest.json exists on disk.
      enforce: 'post',

      renderStart() {
        state.resetRender();
        // Vite's own build-time stage starts here, ends in
        // `closeBundle`. `renderStart` runs before any output is
        // emitted, so it bounds the full build.
        state.stageTimer.start('vite-build');
      },

      // Federation ownership and the build settings remote loading
      // requires come first; then the shared set over the build
      // graph (never a name list) is resolved. Its
      // `external` predicate is installed on the resolved config
      // (`configResolved`), where it wraps whatever `external` the
      // config ended up with.
      config(config, env) {
        plugin.assertFederationOwnership(config);
        const enforced = plugin.enforceBuildSettings(config, env);
        plugin.configureSharing(config, state);
        return { build: enforced };
      },

      // ── Consumer barrel rewrite, shared-package stylesheets ──────
      // Before TypeScript is stripped (hook-level `pre`; the plugin
      // itself runs `post`), in builds only — the dev server resolves
      // imports itself. The barrel rewrite runs on the MFE's own
      // modules; the stylesheets the shared modules load are then
      // imported where those modules are, so the MFE's own CSS carries
      // them (kit CSS at the MFE's own kit version).
      transform: {
        order: 'pre',
        handler(code, id) {
          return plugin.transformModule(code, id, state);
        },
      },

      // ── Lazy-import AST transform ─────────────────────────────────
      renderChunk(code, chunk, _options, meta) {
        return plugin.captureRenderedChunk(this, code, chunk, meta, state);
      },

      // Resolve relative `exposes` paths from the package root wherever
      // the build runs.
      resolveId: {
        order: 'pre',
        handler(source, importer, resolveOptions) {
          return plugin.resolveExposeId(this, source, importer, resolveOptions, state);
        },
      },

      configResolved(config) {
        recorder.place(config);
        plugin.captureConfig(config, state);
        plugin.applyResolvedBuildSettings(config, state);
      },

      // A watch rebuild serves unchanged modules from Rollup's transform
      // cache without running `transform`, but the barrel ledger starts
      // empty for every build: the MFE's own modules are transformed
      // again so the ledger records every rewrite the rebuilt output
      // carries. `pre`, because the first plugin to answer decides, and
      // no answer for other modules leaves the decision to the rest.
      shouldTransformCachedModule: {
        order: 'pre',
        handler({ id }) {
          return state.barrelTransform !== undefined &&
            ConsumerBarrelRewriteTransform.isConsumerModule(id)
            ? true
            : null;
        },
      },

      // The exposed modules' entry chunks are emitted once per build,
      // here, in one order.
      async buildStart() {
        state.resetBuild();
        await plugin.emitExposeEntries(this, state);
      },

      // Capture the chunk graph while it is still visible.
      generateBundle(_options, bundle) {
        plugin.captureOutputGraph(this, bundle, state);
      },

      async closeBundle(error?: unknown) {
        await plugin.finishBuild(this, error, state);
      },
    };
  }

  /**
   * `config` hook: resolves the shared set over the build graph and records
   * the sharing rule `configResolved` externalizes by root package name.
   * No shared package means nothing to externalize.
   */
  private configureSharing(config: UserConfig, state: MfeGtsBuildState): void {
    const root = this.root;
    // One effective selection feeds the resolver, the `external`
    // decision and the producer: the `exclude` option and `mfe.json`'s
    // `share.exclude` union into it; `include` with either fails.
    const optedOut = [
      ...(this.options.exclude ?? []),
      ...MfeGtsPlugin.readShareExclude(root),
    ];
    // A declared package with no runtime JavaScript entry (a webfont or
    // stylesheet package) has nothing a shared unit could carry: it is
    // never shared, so its files stay assets this build handles itself.
    // An explicit `include` list is the whole declaration of intent.
    const nonRuntime =
      this.options.include === undefined
        ? MfeGtsPlugin.nonRuntimeDeclaredDeps(root, optedOut)
        : [];
    state.selection = new SharedSetSelection({
      include: this.options.include,
      exclude: [...new Set([...optedOut, ...nonRuntime])],
    });
    const resolver = new SharedSetResolver(root, {
      exclude: state.selection.exclude,
      include: state.selection.include,
    });
    const resolved = resolver.resolve();
    if (!resolved.ok) throw new Error(resolved.message);
    state.sharedDeps = resolved.sharedDeps;
    state.aliasTargets = new AliasMap(config.resolve?.alias).targetRoots();
    // The shared set over the build graph: the declared closure, so a
    // package the producer may deliver to a shared package is never also
    // inlined into the MFE's chunks, plus every bare package the code
    // imports (workspace-linked and aliased ones included).
    const sharing = new BuildGraphSharing({
      packageRoot: path.resolve(root),
      selection: state.selection,
      closureNames: resolver.declaredClosureNames(),
      alias: config.resolve?.alias,
    });
    state.sharing = sharing;
    if (state.selection.mode === 'include' && state.sharedDeps.length === 0) {
      return;
    }
    state.barrelTransform = new ConsumerBarrelRewriteTransform({
      resolver: new ConsumerBarrelResolver({
        packageRoot: path.resolve(root),
        isShared: (name) => sharing.sharesRoot(name),
        exclude: [
          ...(this.options.barrelRewriteExclude ?? []),
          ...MfeGtsPlugin.readBarrelRewriteExclude(root),
        ],
      }),
      ledger: state.barrelLedger,
    });
    const alias = new AliasMap(config.resolve?.alias);
    state.stylesheetImports = new SharedStylesheetImports({
      isShared: (specifier) =>
        !alias.rewrites(specifier) &&
        sharing.sharesRoot(SharedSetResolver.extractRootPackageName(specifier)),
    });
    state.externalizesShared = true;
  }

  /**
   * Federation is configured by `vitePluginMfeGts` itself — a second,
   * user-added `@module-federation` plugin means user-configured
   * federation (sharing, a second remote entry), which the contract
   * forbids: `shared` is always `{}` because the unit mechanism provides
   * shared dependencies. Fails the config with the offending plugin
   * names.
   */
  private assertFederationOwnership(config: UserConfig): void {
    const owned = this.options.ownedFederationPlugins ?? new Set();
    // Federation is detected by plugin metadata, not a name regex:
    // the `@module-federation/vite` plugin array always carries its
    // core plugin — the one holding the normalized `federation()`
    // options object on `_options` (name, filename, shareScope and
    // friends). A plugin carrying that metadata which is not one this
    // run's own factory created comes from a second, user-added
    // federation() call; generic names like `add-entry` or
    // `check-alias-conflicts` never match, and a renamed plugin is
    // still caught.
    const foreign: string[] = [];
    const visit = (option: unknown): void => {
      if (Array.isArray(option)) {
        option.forEach(visit);
        return;
      }
      if (option === null || typeof option !== 'object') return;
      if (owned.has(option)) return;
      const opts = (option as { _options?: unknown })._options;
      if (opts === null || typeof opts !== 'object') return;
      const mf = opts as { name?: unknown; filename?: unknown; shareScope?: unknown };
      if (typeof mf.name !== 'string' || typeof mf.filename !== 'string') return;
      if (!('shareScope' in (opts as object))) return;
      const label = (option as { name?: unknown }).name;
      foreign.push(typeof label === 'string' ? label : String(mf.name));
    };
    visit(config.plugins);
    if (foreign.length > 0) {
      throw new Error(
        `[vite-plugin-mfe-gts] Module Federation is configured by ` +
          `vitePluginMfeGts itself — found user-added federation ` +
          `plugin(s): ${[...new Set(foreign)].join(', ')}. Remove ` +
          `federation() from vite.config.ts (federation sharing is ` +
          `always {}; pass the MFE's exposes to ` +
          `vitePluginMfeGts({ exposes }) or declare them in mfe.json).`
      );
    }
  }

  /**
   * The build settings a loadable remote requires: `esnext` target, no
   * module preload polyfill, minification, per-expose CSS splitting.
   * The plugin's values win; a user override is warned about because a
   * different value would break loading, then ignored. Vite merges an
   * array `build.target` with a plugin's value instead of replacing it,
   * so the target is also set in place here and again on the resolved
   * config.
   */
  private enforceBuildSettings(
    config: UserConfig,
    env: { command?: string }
  ): { target: 'esnext'; modulePreload: false; minify: true; cssCodeSplit: true } {
    if (env?.command === 'build') {
      const build = config.build ?? {};
      const overridden: string[] = [];
      const target = build.target;
      const isEsnext =
        target === 'esnext' ||
        (Array.isArray(target) && target.length === 1 && target[0] === 'esnext');
      if (target !== undefined && !isEsnext) {
        overridden.push(`build.target ${JSON.stringify(target)}`);
      }
      if (build.modulePreload !== undefined && build.modulePreload !== false) {
        overridden.push('build.modulePreload');
      }
      if (build.minify !== undefined && build.minify !== true) {
        overridden.push(`build.minify ${JSON.stringify(build.minify)}`);
      }
      if (build.cssCodeSplit !== undefined && build.cssCodeSplit !== true) {
        overridden.push('build.cssCodeSplit');
      }
      for (const field of overridden) {
        console.warn(
          `[vite-plugin-mfe-gts] ${field} is owned by the plugin — ` +
            `the override is ignored; a different value would break ` +
            `remote loading.`
        );
      }
    }
    if (config.build !== undefined && config.build.target !== undefined) {
      config.build.target = 'esnext';
    }
    return {
      target: 'esnext',
      modulePreload: false,
      minify: true,
      cssCodeSplit: true,
    };
  }

  /**
   * `transform` handler, builds only: the consumer barrel rewrite on the
   * MFE's own modules, then the stylesheets of every shared module the
   * (rewritten) module imports, imported ahead of it. Both edit whole
   * import statements, so the returned map keeps every other line on its
   * original position.
   */
  private async transformModule(
    code: string,
    id: string,
    state: MfeGtsBuildState
  ): Promise<{ code: string; map: LineEditMap } | null> {
    if (state.command !== 'build') return null;
    let current: string | null = null;
    if (
      state.barrelTransform !== undefined &&
      ConsumerBarrelRewriteTransform.isConsumerModule(id)
    ) {
      current = (await state.barrelTransform.transform(code, id))?.code ?? null;
    }
    const styled = await state.stylesheetImports?.inject(current ?? code, id);
    if (styled != null) current = styled.code;
    return current === null
      ? null
      : { code: current, map: LineEditSourceMap.of(code, current, id) };
  }

  /**
   * `renderChunk` hook: records the chunk's own CSS, its static and
   * dynamic imports, its deliverable stylesheet modules and whether the
   * CSS-only chunk rule marks it (keyed by the preliminary file name
   * `generateBundle` matches on), then rewrites
   * its lazy `import()` calls to `__frontx_lazy` — except the ones
   * targeting CSS-only chunks, recorded for the kept-chunk check.
   */
  private captureRenderedChunk(
    ctx: PluginContext,
    code: string,
    chunk: RenderedChunk,
    meta: { chunks: Record<string, RenderedChunk> },
    state: MfeGtsBuildState
  ): { code: string; map: null } | null {
    const ownCss = [...(chunk.viteMetadata?.importedCss ?? [])];
    state.chunkOwnCss.set(chunk.fileName, ownCss);
    state.chunkDynamicImports.set(chunk.fileName, [...chunk.dynamicImports]);
    state.chunkStaticImports.set(chunk.fileName, [...chunk.imports]);
    state.chunkCssModules.set(
      chunk.fileName,
      CssAttributor.deliverableCssModules(chunk.moduleIds, state.emptyCssModuleIds)
    );
    if (CssAttributor.isCssOnlyChunk(chunk)) {
      state.cssOnlyChunkNames.add(chunk.fileName);
    }

    if (FederationChunkFilter.isFederationControlChunk(chunk.moduleIds)) {
      return null;
    }

    const cssOnlyImports = new Set<string>();
    state.chunkCssOnlyImports.set(chunk.fileName, cssOnlyImports);
    const result = LazyImportTransformer.transformChunk(
      code,
      (input) => ctx.parse(input),
      (message, pos) => ctx.error({ message, pos }),
      chunk.fileName,
      (specifier) => {
        const target = path.posix.join(
          path.posix.dirname(chunk.fileName),
          specifier
        );
        const targetChunk = meta.chunks[target];
        if (
          targetChunk === undefined ||
          !CssAttributor.isCssOnlyChunk(targetChunk)
        ) {
          return false;
        }
        cssOnlyImports.add(target);
        return true;
      },
      // Opaque imports are reported from the final chunks
      // (`captureOutputGraph`): this name and line are preliminary.
      'leave'
    );
    if (result === null) return null;
    console.log(
      `[vite-plugin-mfe-gts] transformed ${result.count} dynamic ` +
        `import(s) in ${chunk.fileName}`
    );
    return { code: result.code, map: null };
  }

  /** `resolveId` handler: package-root-relative `exposes` paths. */
  private async resolveExposeId(
    ctx: PluginContext,
    source: string,
    importer: string | undefined,
    resolveOptions: { attributes?: Record<string, string>; custom?: Record<string, unknown>; isEntry: boolean },
    state: MfeGtsBuildState
  ): Promise<ResolveIdResult> {
    if (!FederationChunkFilter.resolvesFromPackageRoot(source, importer)) {
      return null;
    }
    const rooted = path.resolve(state.packageRoot, source);
    const resolved = await ctx.resolve(rooted, importer, {
      ...resolveOptions,
      skipSelf: true,
    });
    return resolved ?? rooted;
  }

  /**
   * `buildStart` hook: emits, for each exposed module, an entry chunk
   * whose export signature is kept as written. The loader reads the
   * exposed chunk's own `default` export; left as a dynamic import
   * target, Rollup may merge the module into a chunk that exports its
   * namespace under an alias instead. Exposes are visited in sorted
   * order so the emission order never depends on the declaration order,
   * and each module resolves through the bundler's resolver, so
   * extensionless paths, symlinks and queries get the id the module
   * graph uses. A module that does not resolve fails the build naming
   * its expose.
   */
  private async emitExposeEntries(
    ctx: PluginContext,
    state: MfeGtsBuildState
  ): Promise<void> {
    if (state.command !== 'build') return;
    const environment = ctx.environment;
    if (environment !== undefined && environment.name !== 'client') return;
    const exposes = Object.entries(this.options.exposes ?? {}).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0
    );
    for (const [exposeKey, modulePath] of exposes) {
      const resolved = await ctx.resolve(
        path.resolve(state.packageRoot, modulePath),
        undefined,
        { isEntry: true, skipSelf: true }
      );
      if (resolved === null || resolved.external !== false) {
        ctx.error(
          `[vite-plugin-mfe-gts] expose '${exposeKey}' names module ` +
            `'${modulePath}', which does not resolve under '${state.packageRoot}'.`
        );
      }
      const reference = ctx.emitFile({
        type: 'chunk',
        id: resolved.id,
        preserveSignature: 'strict',
      });
      state.exposeEntryRefs.set(exposeKey, reference);
    }
  }

  /**
   * `configResolved` hook. Package files resolve from the plugin's root;
   * the output directory resolves the way Vite resolves it, from Vite's
   * own `root`.
   */
  private captureConfig(config: ResolvedConfig, state: MfeGtsBuildState): void {
    state.packageRoot = this.root;
    state.distDirPath = path.resolve(config.root, config.build?.outDir ?? 'dist');
    state.command = config.command;
  }

  /**
   * `configResolved` hook: on the resolved build options — the
   * top-level ones and each environment's — the target is `esnext` and
   * the `external` option is replaced by one predicate that externalizes
   * the shared set by root package name, so subpaths externalize too and
   * asset specifiers (`pkg/x.css?inline`) stay with Vite, and otherwise
   * answers as the option it replaces would: a string, a regular
   * expression, an array of them or a function. Merging a function into
   * an array `external` instead would leave the function uncalled.
   */
  private applyResolvedBuildSettings(
    config: ResolvedConfig,
    state: MfeGtsBuildState
  ): void {
    if (config.command === 'build') {
      for (const build of [
        config.build,
        ...Object.values(config.environments ?? {}).map((env) => env.build),
      ]) {
        if (build !== undefined) build.target = 'esnext';
      }
    }
    const sharing = state.sharing;
    if (!state.externalizesShared || sharing === undefined) return;
    ExternalChain.install(config, (source, importer) =>
      sharing.external(source, importer)
    );
  }

  /** `generateBundle` hook: verify and capture every emitted chunk. */
  private captureOutputGraph(ctx: PluginContext, bundle: OutputBundle, state: MfeGtsBuildState): void {
    // The preliminary file names of the chunks still in the bundle: an
    // import whose preliminary file name is not among them was a chunk
    // an earlier `generateBundle` hook removed. Each surviving chunk also
    // maps its preliminary file name to its final one, which the
    // recorded static imports are rebuilt through.
    const preliminaryChunks = new Set<string>();
    const preliminaryToFinal = new Map<string, string>();
    for (const output of Object.values(bundle)) {
      if (output.type === 'chunk') {
        preliminaryChunks.add(output.preliminaryFileName);
        preliminaryToFinal.set(output.preliminaryFileName, output.fileName);
      }
    }
    this.captureExposeEntryFiles(ctx, bundle, state);
    for (const [fileName, output] of Object.entries(bundle)) {
      if (output.type !== 'chunk') continue;
      this.verifyLazyImports(ctx, fileName, output, bundle, state);
      const imports = this.recoverRemovedCssOnlyImports(
        output,
        preliminaryChunks,
        preliminaryToFinal,
        state
      );
      this.transformKeptLazyChunks(ctx, fileName, output, bundle, state);
      this.captureChunkLinkage(fileName, output, imports, state);
      this.captureOpaqueImports(ctx, fileName, output, state);
    }
  }

  /**
   * Records every fully opaque `import(expr)` of a final chunk — its
   * final file name and its line in the emitted code — once per call
   * site. Federation's own control chunks are not the MFE's code.
   */
  private captureOpaqueImports(
    ctx: PluginContext,
    fileName: string,
    output: OutputChunk,
    state: MfeGtsBuildState
  ): void {
    if (FederationChunkFilter.isFederationControlChunk(output.moduleIds)) return;
    for (const entry of LazyImportTransformer.opaqueImports(
      output.code,
      (input) => ctx.parse(input),
      fileName
    )) {
      const seen = state.opaqueImports.some(
        (o) => o.file === entry.file && o.line === entry.line && o.expression === entry.expression
      );
      if (!seen) state.opaqueImports.push(entry);
    }
  }

  /**
   * Reads, through the reference `buildStart` got for each expose, the
   * file name of the entry chunk emitted for its module. An expose whose
   * entry chunk is not in the bundle fails the build naming it.
   */
  private captureExposeEntryFiles(
    ctx: PluginContext,
    bundle: OutputBundle,
    state: MfeGtsBuildState
  ): void {
    for (const [exposeKey, reference] of state.exposeEntryRefs) {
      const fileName = ctx.getFileName(reference);
      if (bundle[fileName]?.type !== 'chunk') {
        ctx.error(
          `[vite-plugin-mfe-gts] expose '${exposeKey}' has no entry chunk ` +
            `in the bundle.`
        );
      }
      state.entryFileByExpose.set(exposeKey, fileName);
    }
  }

  /**
   * A CSS-only chunk a static import reaches is removed by Vite like a
   * dynamically imported one, and Vite also drops that import from
   * `output.imports`; the static imports `renderChunk` recorded still
   * list it. Each recorded import the CSS-only chunk rule marks and that
   * has no chunk in the bundle was one of those, so it becomes a
   * captured chunk of its own CSS, reached through the importer's static
   * import: the attribution walk and the CSS-delivery guard see the
   * stylesheets it held as they do for a dynamic import. With per-chunk
   * CSS Vite has already merged the chunk's file into the importer's
   * `importedCss`, so it changes no CSS list by itself.
   *
   * Returns the importer's static import list for the capture. The final
   * `output.imports` decides membership and order — whatever a plugin
   * between `renderChunk` and here did to the list (adding, removing,
   * replacing, reordering) is the truth; the recording never resurrects
   * an import the final list dropped and never re-orders survivors. The
   * one exception is a chunk Vite removed as CSS-only: the final list no
   * longer says where its import sat, so it is reinserted before the
   * first recorded survivor that followed it in the recorded order (at
   * the end when none did) — the place its import sat in the source
   * order. When a later plugin has reordered the survivors, the
   * reinserted chunk still follows its recorded successor:
   * deterministic, but no longer a source position.
   */
  private recoverRemovedCssOnlyImports(
    output: OutputChunk,
    preliminaryChunks: ReadonlySet<string>,
    preliminaryToFinal: ReadonlyMap<string, string>,
    state: MfeGtsBuildState
  ): string[] {
    const recorded = state.chunkStaticImports.get(output.preliminaryFileName) ?? [];
    const finalImports = new Set<string>(output.imports);
    // Only final imports recorded before the edit anchor a reinserted
    // chunk: one a plugin added after rendering has no recorded position.
    const recordedSurvivors = new Set<string>();
    for (const preliminaryImport of recorded) {
      const finalName = preliminaryToFinal.get(preliminaryImport);
      if (finalName !== undefined && finalImports.has(finalName)) {
        recordedSurvivors.add(finalName);
      }
    }
    const imports = [...output.imports];
    for (let i = 0; i < recorded.length; i++) {
      const preliminaryImport = recorded[i];
      if (
        !state.cssOnlyChunkNames.has(preliminaryImport) ||
        preliminaryChunks.has(preliminaryImport) ||
        finalImports.has(preliminaryImport)
      ) {
        continue;
      }
      if (!state.capturedChunks.has(preliminaryImport)) {
        state.capturedChunks.set(preliminaryImport, {
          fileName: preliminaryImport,
          cssAssets: state.chunkOwnCss.get(preliminaryImport) ?? [],
          imports: [],
          dynamicImports: [],
          cssModules: state.chunkCssModules.get(preliminaryImport) ?? [],
          noEmittedFile: true,
        });
      }
      const anchor = recorded
        .slice(i + 1)
        .map((later) => preliminaryToFinal.get(later))
        .find((finalName) => finalName !== undefined && recordedSurvivors.has(finalName));
      if (anchor !== undefined) {
        imports.splice(imports.indexOf(anchor), 0, preliminaryImport);
      } else {
        imports.push(preliminaryImport);
      }
    }
    return imports;
  }

  /**
   * The render-time and emit-time dynamic-import counts must match when
   * CSS-only targets were left alone, and every `__frontx_lazy` target
   * must exist in the bundle; a mismatch or a missing target fails the
   * output. Dynamic imports whose chunks Vite removed as CSS-only are
   * captured with their CSS for the manifest.
   */
  private verifyLazyImports(
    ctx: PluginContext,
    fileName: string,
    output: OutputChunk,
    bundle: OutputBundle,
    state: MfeGtsBuildState
  ): void {
    const preliminaryDynamic =
      state.chunkDynamicImports.get(output.preliminaryFileName) ?? [];
    const leftAlone = state.chunkCssOnlyImports.get(output.preliminaryFileName);
    if (
      preliminaryDynamic.length !== output.dynamicImports.length &&
      leftAlone?.size
    ) {
      state.outputFailed = true;
      ctx.error(
        `[vite-plugin-mfe-gts] '${fileName}' has a different number ` +
          `of dynamic imports than when it was rendered, so its ` +
          `imports of CSS-only chunks cannot be checked.`
      );
    }
    if (output.code.includes('__frontx_lazy')) {
      // A bare specifier of a shared package is no file of the bundle:
      // its target is the shared unit answering it, loaded through the
      // list held under that specifier.
      const missing = LazyImportTransformer.lazyCallSpecifiers(
        ctx.parse(output.code)
      ).filter(
        (specifier) =>
          state.sharing?.matches(specifier) !== true &&
          bundle[
            path.posix.join(path.posix.dirname(fileName), specifier)
          ] === undefined
      );
      if (missing.length) {
        state.outputFailed = true;
        ctx.error(
          `[vite-plugin-mfe-gts] '${fileName}' loads ` +
            `${missing.map((m) => `'${m}'`).join(', ')} through ` +
            `__frontx_lazy, but the bundle has no such file.`
        );
      }
    }
    if (preliminaryDynamic.length === output.dynamicImports.length) {
      output.dynamicImports.forEach((target, i) => {
        const removedCss =
          bundle[target] === undefined
            ? state.chunkOwnCss.get(preliminaryDynamic[i])
            : undefined;
        const isLeftAlone = leftAlone?.has(preliminaryDynamic[i]);
        if (isLeftAlone === false && removedCss !== undefined) {
          state.outputFailed = true;
          ctx.error(
            `[vite-plugin-mfe-gts] '${fileName}' loads '${target}' ` +
              `through __frontx_lazy, but Vite removed that chunk ` +
              `as CSS-only; the CSS-only chunk rule needs to match ` +
              `Vite's.`
          );
        }
        if (removedCss === undefined) return;
        state.capturedChunks.set(target, {
          fileName: target,
          cssAssets: removedCss,
          imports: [],
          dynamicImports: [],
          cssModules: state.chunkCssModules.get(preliminaryDynamic[i]) ?? [],
        });
      });
    }
  }

  /**
   * Chunks that had CSS-only dynamic-import targets left alone still
   * need `__frontx_lazy` for the targets the bundle kept — the render
   * pass skipped them, so the rewrite runs here on the final code.
   */
  private transformKeptLazyChunks(
    ctx: PluginContext,
    fileName: string,
    output: OutputChunk,
    bundle: OutputBundle,
    state: MfeGtsBuildState
  ): void {
    const leftAlone = state.chunkCssOnlyImports.get(output.preliminaryFileName);
    if (!leftAlone?.size) return;
    const kept = LazyImportTransformer.transformChunk(
      output.code,
      (input) => ctx.parse(input),
      (message, pos) => ctx.error({ message, pos }),
      fileName,
      (specifier) =>
        bundle[
          path.posix.join(path.posix.dirname(fileName), specifier)
        ] === undefined,
      'leave'
    );
    if (kept !== null) {
      output.code = kept.code;
      console.log(
        `[vite-plugin-mfe-gts] transformed ${kept.count} dynamic ` +
          `import(s) of kept chunks in ${fileName}`
      );
    }
  }

  /**
   * Captures one chunk's linkage for the manifest: the CSS files Vite
   * merged in from removed CSS-only chunks first, as the dependencies
   * they are, then its own file; its static imports (removed CSS-only
   * chunks reinserted), dynamic imports, deliverable stylesheet modules
   * and imported bindings.
   */
  private captureChunkLinkage(
    fileName: string,
    output: OutputChunk,
    imports: string[],
    state: MfeGtsBuildState
  ): void {
    const ownCss = state.chunkOwnCss.get(output.preliminaryFileName) ?? [];
    const allCss = [...(output.viteMetadata?.importedCss ?? [])];
    const ordered = [
      ...allCss.filter((f) => !ownCss.includes(f)),
      ...ownCss.filter((f) => allCss.includes(f)),
    ];
    state.capturedChunks.set(fileName, {
      fileName,
      cssAssets: ordered,
      imports,
      dynamicImports: [...output.dynamicImports],
      cssModules: CssAttributor.deliverableCssModules(
        output.moduleIds,
        state.emptyCssModuleIds
      ),
    });
    state.capturedImports.set(fileName, {
      fileName,
      imports: { ...output.importedBindings },
    });
  }

  /** `closeBundle` hook: produce, enrich, validate, report. */
  private async finishBuild(
    ctx: PluginContext,
    error: unknown,
    state: MfeGtsBuildState
  ): Promise<void> {
    if (error || state.outputFailed) return;
    const environment = ctx.environment;
    if (environment !== undefined && environment.name !== 'client') {
      return;
    }

    const { distDir, mfeJson, mfManifestPath, mfManifest, mfeJsonManifestPath } =
      this.readBuildInputs(state);

    // The loader reads each exposed module through the entry chunk emitted
    // for it, which keeps its `default` export; the federation manifest
    // names the chunk holding the module's code instead, which may be a
    // shared chunk exporting the module under a mangled name.
    const pointed = this.pointExposesAtEntryChunks(ctx, mfManifest.exposes, state);
    // ── Attribute shared-chunk CSS to every expose that reaches it ─
    const attributed = CssAttributor.attributeReachableChunkCss(
      mfManifest.exposes,
      state.capturedChunks
    );
    if (pointed || attributed) {
      fs.writeFileSync(
        mfManifestPath,
        JSON.stringify(mfManifest, null, 2),
        'utf-8'
      );
    }

    // ── Guard: every stylesheet an expose needs must be deliverable ─
    const undeclaredCss = CssAttributor.findUndeclaredExposeCss(
      mfManifest.exposes,
      state.capturedChunks
    );
    if (undeclaredCss.length > 0) {
      throw new Error(
        CssAttributor.formatUndeclaredExposeCssError(undeclaredCss)
      );
    }

    const sharedOutDir = this.options.sharedOutDir ?? 'shared';
    const sharedDir = path.join(distDir, sharedOutDir);
    const sharedBase = `./${sharedOutDir}/`;
    // ── Consumer barrel fallback: a rewrite no produced unit answers
    // goes back to the barrel in the written chunks and their
    // captured imports, before roots are derived from them; the units and
    // lists are produced again for what the chunks import after it.
    const { produced, barrelFallback } = await this.produceSharedUnits(
      ctx,
      state,
      sharedDir,
      distDir
    );
    for (const [target, reason] of barrelFallback) {
      console.log(
        `[vite-plugin-mfe-gts] barrel kept for "${target}": ${reason}`
      );
    }

    // ── Guard: every name the MFE imports from a shared specifier is one
    // the unit answering it exports.
    // @cpt-begin:cpt-template-mfe-flow-mfe-fetch-list-assembly-assemble:p1:inst-verify-shared-imports
    const importMismatches = SharedImportCheck.findMismatches({
      importers: state.capturedImports.values(),
      produced,
      // @cpt-begin:cpt-template-mfe-flow-mfe-fetch-list-assembly-assemble:p1:inst-read-reverted-imports
      reverted: new Set(barrelFallback.keys()),
      origin: (specifier, name) => state.barrelLedger.origin(specifier, name),
      // @cpt-end:cpt-template-mfe-flow-mfe-fetch-list-assembly-assemble:p1:inst-read-reverted-imports
    });
    if (importMismatches.length > 0) {
      ctx.error({ message: SharedImportCheck.formatError(importMismatches) });
    }
    // @cpt-end:cpt-template-mfe-flow-mfe-fetch-list-assembly-assemble:p1:inst-verify-shared-imports

    // ── Fetch lists: one list per expose (merged over the
    // specifiers its chunk closure reaches) plus a nested list per
    // lazy own chunk — recorded in the manifest's `lists`, over the
    // unit table `units` that holds every shared unit once.
    const sharedDepNames = new Set(
      produced.map((p) => p.name).map(SharedSetResolver.extractRootPackageName)
    );
    const exposeOwnChunks = SpecifiersDeriver.entryOwnChunks({
      exposes: mfManifest.exposes,
      chunks: state.capturedChunks,
      sharedDepNames,
    });
    const lazyChunkOwnChunks = SpecifiersDeriver.lazyChunkOwnChunks({
      chunks: state.capturedChunks,
      sharedDepNames,
    });
    // Every own chunk a list names must be a file the build emitted: a
    // list entry with no file would fail the load at runtime.
    for (const owner of [exposeOwnChunks, lazyChunkOwnChunks]) {
      for (const [key, chunks] of Object.entries(owner)) {
        for (const chunk of chunks) {
          if (!fs.existsSync(path.join(distDir, chunk))) {
            ctx.error({
              message:
                `[vite-plugin-mfe-gts] "${key}" lists own chunk "${chunk}" ` +
                `but no such file was emitted under ${distDir}`,
            });
          }
        }
      }
    }
    // @cpt-begin:cpt-template-mfe-flow-mfe-fetch-list-assembly-assemble:p1:inst-compose
    const composed = ExposeListComposer.compose({
      produced,
      exposeSpecifiers: new Map(
        Object.entries(
          SpecifiersDeriver.entrySpecifiers({
            exposes: mfManifest.exposes,
            chunks: state.capturedChunks,
            sharedDepNames,
          })
        )
      ),
      lazyChunkSpecifiers: new Map(
        Object.entries(
          SpecifiersDeriver.lazyChunkSpecifiers({
            chunks: state.capturedChunks,
            sharedDepNames,
          })
        )
      ),
      exposeOwnChunks: new Map(Object.entries(exposeOwnChunks)),
      lazyChunkOwnChunks: new Map(Object.entries(lazyChunkOwnChunks)),
      onError: (message) => ctx.error({ message }),
    });
    // @cpt-end:cpt-template-mfe-flow-mfe-fetch-list-assembly-assemble:p1:inst-compose
    const opaqueImports = [
      ...composed.opaqueImports,
      ...state.opaqueImports.map((o) => ({ ...o, specifier: '' })),
    ];
    for (const p of produced) {
      if (p.versionDrift !== undefined) {
        console.log(`[vite-plugin-mfe-gts] ${p.versionDrift}`);
      }
    }
    for (const opaque of opaqueImports) {
      // @cpt-begin:cpt-template-mfe-algo-mfe-fetch-list-assembly-compose:p1:inst-opaque-report
      console.log(
        `[vite-plugin-mfe-gts] ${opaque.file}:${opaque.line} · ` +
          `import(${opaque.expression ?? 'expr'}) · stays native`
      );
      // @cpt-end:cpt-template-mfe-algo-mfe-fetch-list-assembly-compose:p1:inst-opaque-report
    }

    // @cpt-begin:cpt-template-mfe-flow-mfe-fetch-list-assembly-assemble:p1:inst-record-units-lists
    this.writeEnrichedManifest(
      mfeJsonManifestPath,
      mfeJson,
      mfManifest,
      sharedBase,
      composed.units,
      composed.lists
    );
    // @cpt-end:cpt-template-mfe-flow-mfe-fetch-list-assembly-assemble:p1:inst-record-units-lists

    // ── Per-MFE build report (size gate) ──────────────────────────
    // Stop Vite's own build-time stage and fold the per-stage timings
    // into the MFE build report. The report is a side channel; chunk
    // bytes and the manifest lists are unchanged. It carries the
    // opaque-import report out with the manifest this build wrote.
    state.stageTimer.stop('vite-build');
    // @cpt-begin:cpt-template-mfe-flow-mfe-fetch-list-assembly-assemble:p1:inst-return-manifest
    MfeBuildReport.emit(
      MfeBuildReport.compose({
        mfe: mfManifest.metaData.name,
        sharedOutDir,
        produced,
        sharedDir,
        consumerBarrels: state.barrelLedger.packages(),
        opaqueImports,
        stageTimings: state.stageTimer.toRecord(),
        cache: state.cacheSummary,
        ...(state.selection !== undefined
          ? {
              sharedSet: SharedSetSummary.compose({
                packageRoot: state.packageRoot,
                selection: state.selection,
                produced,
                imported: state.sharing?.importedPackages() ?? [],
                aliasTargets: state.aliasTargets,
              }),
            }
          : {}),
      }),
      distDir
    );
    // @cpt-end:cpt-template-mfe-flow-mfe-fetch-list-assembly-assemble:p1:inst-return-manifest
  }

  /**
   * Names, for each expose, the entry chunk emitted for its module as the
   * expose's JavaScript asset. Returns whether any expose changed.
   */
  private pointExposesAtEntryChunks(
    ctx: PluginContext,
    exposes: FederationExpose[],
    state: MfeGtsBuildState
  ): boolean {
    let changed = false;
    for (const expose of exposes) {
      const file = state.entryFileByExpose.get(expose.path);
      if (file === undefined) {
        ctx.error(
          `[vite-plugin-mfe-gts] expose '${expose.path}' has no entry chunk.`
        );
      }
      const sync = expose.assets.js.sync;
      if (sync.length === 1 && sync[0] === file) continue;
      expose.assets.js.sync = [file];
      changed = true;
    }
    return changed;
  }

  /**
   * The three files `closeBundle` works from: the MFE's `mfe.json`, the
   * federation manifest the MF plugin wrote, and where the enriched
   * manifest lands — all under `packageRoot`/`distDirPath`.
   */
  private readBuildInputs(state: MfeGtsBuildState): {
    distDir: string;
    mfeJson: MfeJson;
    mfManifestPath: string;
    mfManifest: FederationManifest;
    mfeJsonManifestPath: string;
  } {
    const distDir = path.isAbsolute(state.distDirPath)
      ? state.distDirPath
      : path.join(state.packageRoot, state.distDirPath);
    const mfeJsonPath = path.join(state.packageRoot, 'mfe.json');
    const mfeJsonManifestPath = path.join(distDir, 'mfe-manifest.json');

    const mfeJson = JSON.parse(
      fs.readFileSync(mfeJsonPath, 'utf-8')
    ) as MfeJson;

    const mfManifestPath = path.join(distDir, 'mf-manifest.json');
    if (!fs.existsSync(mfManifestPath)) {
      throw new Error(
        `[vite-plugin-mfe-gts] mf-manifest.json not found at ` +
          `'${mfManifestPath}'. The Module Federation build for this ` +
          `MFE did not complete successfully — check the MFE's own ` +
          `build output above for the real failure.`
      );
    }
    const mfManifest = JSON.parse(
      fs.readFileSync(mfManifestPath, 'utf-8')
    ) as FederationManifest;
    return { distDir, mfeJson, mfManifestPath, mfManifest, mfeJsonManifestPath };
  }

  /**
   * Produces the shared units under `sharedDir`. `consumerSpecifiers` —
   * the bare specifiers the MFE's own chunks import — make subpaths of
   * shared packages (`react/jsx-runtime`) get delivered too.
   */
  private async produceSharedUnits(
    ctx: PluginContext,
    state: MfeGtsBuildState,
    sharedDir: string,
    distDir: string
  ): Promise<{
    produced: ProducedSharedPackage[];
    barrelFallback: Map<string, string>;
  }> {
    const sharing = state.sharing;
    if (sharing === undefined) return { produced: [], barrelFallback: new Map() };
    const isConsumerSpecifier = (spec: string): boolean =>
      state.capturedChunks.get(spec) === undefined && sharing.matches(spec);
    const specifiersOf = (pick: (chunk: CapturedChunk) => string[]): Set<string> =>
      new Set(
        [...state.capturedChunks.values()]
          .flatMap(pick)
          .filter(isConsumerSpecifier)
      );
    const dynamicSpecifiers = specifiersOf((chunk) => chunk.dynamicImports);
    let barrelFallback = new Map<string, string>();
    // @cpt-begin:cpt-template-mfe-flow-mfe-fetch-list-assembly-assemble:p1:inst-call-producer
    let fingerprints: UnitProducer['contentFingerprints'] | undefined;
    const { produced, cache } = await FallbackReproduction.run({
      producerFor: (consumerSpecifiers) => {
        const producer = new UnitProducer(
          {
            packageRoot: state.packageRoot,
            outputDir: sharedDir,
            exclude: state.selection?.exclude,
            include: state.selection?.include,
            consumerSpecifiers,
            stageTimer: state.stageTimer,
            cacheDir:
              this.options.cacheDir ?? defaultProducerCacheDir(state.packageRoot),
          },
          fingerprints
        );
        fingerprints = producer.contentFingerprints;
        return producer;
      },
      outputDir: sharedDir,
      consumerSpecifiers: [
        ...new Set([
          ...specifiersOf((chunk) => chunk.imports),
          ...dynamicSpecifiers,
        ]),
      ],
      dynamicSpecifiers,
      importedNow: () => specifiersOf((chunk) => chunk.imports),
      // @cpt-begin:cpt-template-mfe-flow-mfe-fetch-list-assembly-assemble:p1:inst-reproduce-after-fallback
      applyFallback: (units) => {
        barrelFallback = ConsumerBarrelFallback.apply({
          produced: units,
          ledger: state.barrelLedger,
          outDir: distDir,
          chunks: state.capturedChunks.values(),
        });
      },
      // @cpt-end:cpt-template-mfe-flow-mfe-fetch-list-assembly-assemble:p1:inst-reproduce-after-fallback
      onError: (message) => ctx.error({ message }),
    });
    // @cpt-end:cpt-template-mfe-flow-mfe-fetch-list-assembly-assemble:p1:inst-call-producer
    state.cacheSummary = cache;
    return { produced, barrelFallback };
  }

  /**
   * Enriches `mfe-manifest.json` (the closed served manifest and
   * entry assets), validates every `mfe.json` entity by registering it
   * with the type system — the verdict is the type system's, never a
   * regex's — and writes the result. The manifest describes shared code
   * through `units` and `lists` alone: it carries no `shared` entry.
   */
  private writeEnrichedManifest(
    mfeJsonManifestPath: string,
    mfeJson: MfeJson,
    mfManifest: FederationManifest,
    sharedBase: string,
    units: readonly SharedDepUnit[],
    lists: Readonly<Record<string, SharedDepFetchList>>
  ): EnrichedResult {
    const enriched = new MfeManifestEnricher().enrich(mfeJson, mfManifest, {
      sharedBase,
      units,
      lists,
    });

    new GtsEntityValidator(this.options.typeSystem).assertValid({
      schemas: enriched.schemas,
      manifest: { ...enriched.manifest, id: enriched.manifest.id },
      domains: enriched.domains,
      entries: enriched.entries,
      extensions: enriched.extensions,
    });

    fs.writeFileSync(
      mfeJsonManifestPath,
      JSON.stringify(enriched, null, 2) + '\n',
      'utf-8'
    );
    console.log(
      `[vite-plugin-mfe-gts] enriched ${mfeJsonManifestPath}`
    );
    return enriched;
  }

  /** `share.exclude` from the MFE's `mfe.json`, if any. */
  /**
   * The declared dependencies (`exclude` aside) that are installed but
   * have no runtime JavaScript entry (`RuntimeEntryDetector`). An
   * unreadable `package.json` yields none — the shared-set resolver
   * reports that failure itself.
   */
  private static nonRuntimeDeclaredDeps(root: string, excluded: readonly string[]): string[] {
    let projectPkg: ResolvablePackageJson;
    try {
      projectPkg = JSON.parse(
        fs.readFileSync(path.join(root, 'package.json'), 'utf-8')
      ) as ResolvablePackageJson;
    } catch {
      return [];
    }
    const skip = new Set(excluded.map(SharedSetResolver.extractRootPackageName));
    const out: string[] = [];
    for (const name of SharedSetResolver.declaredDepNames(projectPkg)) {
      const rootName = SharedSetResolver.extractRootPackageName(name);
      if (skip.has(rootName)) continue;
      const installed = PackageJsonResolver.resolveInstalled(root, rootName);
      if (installed === undefined) continue;
      let pkg: RuntimeEntryFields;
      try {
        pkg = JSON.parse(fs.readFileSync(installed, 'utf-8')) as RuntimeEntryFields;
      } catch {
        continue;
      }
      if (!RuntimeEntryDetector.hasRuntimeEntry(pkg, path.dirname(installed))) {
        out.push(name);
      }
    }
    return out;
  }

  private static readShareExclude(root: string): string[] {
    const file = path.join(root, 'mfe.json');
    if (!fs.existsSync(file)) return [];
    try {
      const json = JSON.parse(fs.readFileSync(file, 'utf-8')) as MfeJson;
      return json.share?.exclude ?? [];
    } catch {
      return [];
    }
  }

  /** `share.barrelRewrite.exclude` from the MFE's `mfe.json`, if any. */
  private static readBarrelRewriteExclude(root: string): string[] {
    const file = path.join(root, 'mfe.json');
    if (!fs.existsSync(file)) return [];
    try {
      const json = JSON.parse(fs.readFileSync(file, 'utf-8')) as MfeJson;
      return json.share?.barrelRewrite?.exclude ?? [];
    } catch {
      return [];
    }
  }
}
