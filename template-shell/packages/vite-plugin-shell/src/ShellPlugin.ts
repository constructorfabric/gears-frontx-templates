/**
 * `ShellPlugin` — the Vite plugin object (native boot model,
 * the host's native boot): derives the host's shared set from its
 * `package.json` plus options and externalizes it, rewrites the host's
 * named imports from shared barrels to the defining modules
 * (consumer half), imports the stylesheets each shared
 * module the host imports loads where the host imports it (the host's own
 * CSS carries its kit components' styles), produces the host's shared units
 * and fetch lists into the host's own build output (`unitsDir`, default
 * `shared/`), generates an import map from every fetch list the producer returned
 * — inline in the emitted `index.html`, pointing only into the host's
 * own `dist`, with a `sha256-…` CSP source emitted and a nonce, when one
 * is configured, on every tag it injects — and emits a small fill chunk
 * that, from the shell entry,
 * refills the realm content-identity text cache from the boot list by
 * re-fetching the same URLs through the shared unit fetcher, so MFE loads
 * reuse those sources and mint their own instances.
 *
 * The shell loads like a Module Federation host: the emitted HTML keeps
 * its native module scripts, the browser fetches the shared chunks
 * straight off the host's own dist (modulepreload links flatten the
 * boot-list waterfall into one round), and bare specifiers inside the
 * content-identical shared chunks resolve through the import map. There
 * is no blob minting and no boot-chunk loader for the shell; MFEs never
 * use the shell's import map and still mint per load from the cache.
 *
 * The plugin is framework- and implementation-agnostic: its inputs are
 * the host's `package.json`, the build output and these options. It is
 * inactive outside `vite build` — `vite dev` stays native.
 */

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Plugin, UserConfig } from 'vite';
import {
  BuildStageTimer,
  ConsumerBarrelResolver,
  ConsumerBarrelRewriteLedger,
  ConsumerBarrelRewriteTransform,
  AliasMap,
  ExternalChain,
  BuildGraphSharing,
  type ProducedFetchList,
  SharedSetResolver,
  SharedSetSelection,
  SharedSetSummary,
  SharedStylesheetImports,
} from '@gears-frontx/unit-producer';

import { HostSharedSetResolver } from './HostSharedSetResolver';
import { RuntimePackageInspector } from './RuntimePackageInspector';
import { HostUnitProducer } from './HostUnitProducer';
import { BootChunkGraph, type BootGraphChunk } from './BootChunkGraph';
import { BootDataComposer } from './BootDataComposer';
import { ImportMapComposer } from './ImportMapComposer';
import { ShellBuildReport } from './ShellBuildReport';

export interface VitePluginShellOptions {
  /**
   * The packages to share; mutually exclusive with `exclude` (both set
   * fails the build). Their runtime dependencies are shared too and
   * reported in the build report. An empty list shares nothing: the
   * shell boots fully natively. Unset (with `exclude` unset) shares
   * every bare package the build graph imports.
   */
  include?: string[];
  /**
   * The `exclude` opt-out: packages removed from the shared set. An
   * excluded package a still-shared package depends on fails the build.
   * Packages that are not runtime code at all — no JavaScript entry,
   * asset-only entries, nothing installed — never join the set on their
   * own; `exclude` stays the hatch for JavaScript packages that are not
   * browser code.
   */
  exclude?: string[];
  /**
   * Directory under the build output dir where shared units and fetch
   * lists are emitted; the import map and the boot preloads address them
   * under `${base}${unitsDir}/`. A non-empty relative path strictly
   * inside the output dir (no `.` or `..` segment, not absolute); any
   * other value fails the build. Default `'shared'`.
   */
  unitsDir?: string;
  /** Per-package escape hatch from the consumer barrel rewrite. */
  barrelRewriteExclude?: string[];
  /**
   * A nonce stamped on every tag the plugin injects into the emitted HTML —
   * the inline `<script type="importmap">`, the modulepreload links and the
   * fill chunk's module script — so a nonce-based host CSP admits them.
   * Unset, Vite's own `html.cspNonce` is used. The build always emits the
   * map's `sha256-…` CSP source token in its log for hash-based policies.
   * The value must match the CSP nonce grammar `[A-Za-z0-9+/=_-]+`
   * (base64 + `_-`, no quotes or whitespace); any other character is
   * rejected so the attribute is never a vector for tag injection.
   */
  importMapNonce?: string;
  /**
   * Build-machine cache directory for the per-`package@version`
   * producer computation. Defaults to the workspace-wide
   * `<workspace root>/node_modules/.cache/frontx-unit-producer`
   * (project root without a workspace), shared with every MFE build;
   * set it for separate repositories or a shared CI path.
   */
  cacheDir?: string;
}

/**
 * The id of the fill chunk's source module: virtual, so nothing is written
 * into the host's tree. Rollup sees it under the NUL-prefixed form.
 */
const FILL_MODULE_SOURCE = 'virtual:frontx-shell-fill';
const FILL_MODULE_ID = `\0${FILL_MODULE_SOURCE}`;

/** Marker in the emitted fill chunk replaced by the inline fill data. */
const FILL_DATA_MARKER = '__FRONTX_FILL_DATA__';

/**
 * The CSP nonce grammar (CSP3 §2.4.2): base64 characters plus `-` and
 * `_`, at least one. `+`, `/` and `=` come from base64; `_` and `-`
 * from the base64url variant the CSP spec also admits. Any other
 * character would let a host-supplied nonce break out of the
 * `nonce="…"` attribute the import map tag carries, so it is rejected
 * up front. The returned value is safe to interpolate into the
 * attribute without further escaping.
 */
function assertNonce(nonce: string, source: string): string {
  if (!/^[A-Za-z0-9+/=_-]+$/.test(nonce)) {
    throw new Error(
      `[vite-plugin-shell] ${source} must match the CSP nonce ` +
        'grammar [A-Za-z0-9+/=_-]+ (base64 + "_-"); received a value ' +
        'with another character — refusing to write the injected tags.'
    );
  }
  return nonce;
}

/**
 * The emitted runtime module file, resolved beside this file so any
 * host — including one that cannot resolve the plugin package by name —
 * bundles it: `dist/runtime.js` built, `src/runtime.ts` when the plugin
 * source itself drives the build (its tests).
 */
function fillRuntimePath(): string {
  for (const file of ['runtime.js', 'runtime.ts']) {
    const candidate = fileURLToPath(new URL(`./${file}`, import.meta.url));
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error('[vite-plugin-shell] emitted fill runtime is missing');
}

/**
 * Whether `id` is a module of the emitted fill runtime. Those modules are
 * native code that bundles into the fill chunk with everything they
 * import, whichever package that is.
 */
function isFillRuntimeModule(id: string): boolean {
  const runtime = fillRuntimePath();
  return id === runtime || id.startsWith(`${path.dirname(runtime)}${path.sep}runtime${path.sep}`);
}

/** A `<script … src="…"></script>` tag in the emitted HTML. */
const SCRIPT_TAG = /<script\b[^>]*\bsrc="([^"]+)"[^>]*>\s*<\/script>/gi;

export class ShellPlugin {
  private readonly options: VitePluginShellOptions;

  /** The validated `unitsDir`. */
  private readonly unitsDir: string;

  constructor(options?: VitePluginShellOptions) {
    this.options = options ?? {};
    this.unitsDir = ShellPlugin.validatedUnitsDir(this.options.unitsDir);
    if ('chunkGrouping' in (this.options as object)) {
      throw new Error(
        '[vite-plugin-shell] "chunkGrouping" is not an option — shared packages use ' +
          "the bundler's normal chunking with no merging; remove it."
      );
    }
  }

  /**
   * `unitsDir` as the plugin uses it: the directory the producer writes into
   * and the URL segment the runtime addresses, so it must name a place
   * strictly inside the output dir.
   */
  private static validatedUnitsDir(value: string | undefined): string {
    // @cpt-begin:cpt-template-shell-algo-unit-producer-output-host-production:p1:inst-validate-units-dir
    if (value === undefined) return 'shared';
    const segments = typeof value === 'string' ? value.split(/[\\/]/) : [];
    if (
      typeof value !== 'string' ||
      path.posix.isAbsolute(value) ||
      path.win32.isAbsolute(value) ||
      segments.some((s) => s === '' || s === '.' || s === '..')
    ) {
      throw new Error(
        `[vite-plugin-shell] unitsDir must be a non-empty relative path ` +
          `strictly inside the build output dir (no '.' or '..' segment, ` +
          `not absolute); received ${JSON.stringify(value)}.`
      );
    }
    return value;
    // @cpt-end:cpt-template-shell-algo-unit-producer-output-host-production:p1:inst-validate-units-dir
  }

  /**
   * The fill chunk's glue, after its `ShellCacheFill` import: run the
   * fill on evaluation. No load listener, idle queue or timer.
   */
  static fillGlue(): string {
    return (
      `ShellCacheFill.run(${JSON.stringify(FILL_DATA_MARKER)})` +
      `.catch(function(e){console.error(e);});\n`
    );
  }

  /**
   * The emitted fill chunk's text with its data in place of the marker, or
   * `undefined` when the text carries no marker. The data is inserted
   * verbatim: a replacement string would give `$&` and `$$` in it their
   * special meaning.
   */
  static injectFillData(source: string, data: unknown): string | undefined {
    const marker = JSON.stringify(FILL_DATA_MARKER);
    if (!source.includes(marker)) return undefined;
    return source.replace(marker, () => JSON.stringify(data));
  }

  /**
   * The fill chunk's file name for its final text: the emitted chunk's
   * directory and a name carrying a hash of that text.
   */
  static fillFileNameOf(emittedFileName: string, source: string): string {
    const hash = createHash('sha256').update(source, 'utf-8').digest('hex').slice(0, 16);
    const dir = path.posix.dirname(emittedFileName);
    const name = `frontx-shell-fill-${hash}.js`;
    return dir === '.' ? name : `${dir}/${name}`;
  }

  /**
   * Marks the requests that carry the boot — the module scripts and the
   * modulepreload links of the emitted document — with high fetch
   * priority. A tag that already states a priority keeps it (the fill
   * script states `low`).
   */
  private static prioritiseBoot(html: string): string {
    return html.replace(
      /<(script\b[^>]*\btype=["']module["']|link\b[^>]*\brel=["']modulepreload["'])([^>]*)>/gi,
      (tag, head: string, rest: string) =>
        /\bfetchpriority=/i.test(tag) ? tag : `<${head} fetchpriority="high"${rest}>`
    );
  }

  /**
   * The URL prefix the emitted HTML serves the host's own chunks under —
   * read off the matched entry `src` (whatever Vite `base` produced:
   * `/`, `/app/`, `./`, an absolute URL), falling back to the resolved
   * `base` when the src names no emitted chunk.
   */
  static ownBase(
    entrySrc: string | undefined,
    ownChunkFiles: readonly string[],
    base: string
  ): string {
    if (entrySrc !== undefined) {
      const match = [...ownChunkFiles]
        .sort((a, b) => b.length - a.length)
        .find((f) => entrySrc === f || entrySrc.endsWith(`/${f}`));
      if (match !== undefined) return entrySrc.slice(0, entrySrc.length - match.length);
    }
    if (base === '' || base.startsWith('.')) return './';
    return base.endsWith('/') ? base : `${base}/`;
  }

  toVitePlugin(): Plugin {
    let packageRoot = '';
    let outDir = 'dist';
    let sharedDeps: string[] = [];
    let effectiveExclude: string[] = [...(this.options.exclude ?? [])];
    let sharing: BuildGraphSharing | undefined;
    let aliasTargets: string[] = [];
    let selection = new SharedSetSelection();
    let command: 'build' | 'serve' = 'build';
    let active = false;
    let fillRef = '';
    let fillFileName = '';
    let base = '/';
    let cspNonce: string | undefined;
    const options = this.options;
    const unitsDir = this.unitsDir;
    // Bare specifiers the host's own chunks import statically — the
    // boot list's roots and the native load's eager reach.
    const chunkImports = new Set<string>();
    // Bare specifiers the host's own chunks import dynamically: produced
    // (so their units and lists exist), resolved through the
    // import map on demand.
    const dynamicChunkImports = new Set<string>();
    // The host's own emitted chunks (output-dir relative), fill excluded.
    const ownChunkFiles: string[] = [];
    // Each emitted host chunk's bare imports, for the barrel fallback.
    const hostChunks: Array<{ fileName: string; imports: string[] }> = [];
    const bootGraphChunks: BootGraphChunk[] = [];
    let barrelTransform: ConsumerBarrelRewriteTransform | undefined;
    let stylesheetImports: SharedStylesheetImports | undefined;
    const barrelLedger = new ConsumerBarrelRewriteLedger();
    // Per-stage build-time instrumentation. The timer is a
    // side channel shared with the producer; the plugin owns the
    // `vite-build` stage (buildStart → closeBundle).
    const stageTimer = new BuildStageTimer();

    return {
      name: 'gears-frontx-vite-plugin-shell',

      config(config, env) {
        const root = config.root ?? process.cwd();

        // Non-runtime packages — no JavaScript entry, asset-only entries,
        // or nothing installed at all — are never shared, derived the
        // same way the shared set is; `exclude` stays the escape hatch
        // for packages that do carry JavaScript but are not browser code
        // (build tools, Node-only libraries). Build tools left in
        // `dependencies` are warned about.
        const inspector = new RuntimePackageInspector(root);
        const conflict = new SharedSetSelection({
          include: options.include,
          exclude: options.exclude,
        }).conflict();
        // An explicit `include` list is the whole declaration of intent:
        // nothing is auto-excluded or inspected around it.
        const report =
          options.include !== undefined || conflict !== undefined
            ? { autoExcluded: [], warnings: [], cjsPackages: [] }
            : inspector.inspect(options.exclude ?? []);
        effectiveExclude = [...(options.exclude ?? []), ...report.autoExcluded];
        const resolved = new HostSharedSetResolver(
          root,
          effectiveExclude,
          options.include
        ).resolve();
        if (!resolved.ok) {
          // A dev server with an unreadable or unresolvable package
          // root stays fully native — there is nothing to dedupe or
          // pre-bundle; the same failure stays fatal for a build.
          if (env.command === 'build') {
            throw new Error(resolved.message);
          }
          console.warn(`[vite-plugin-shell] ${resolved.message}`);
          return null;
        }
        sharedDeps = resolved.sharedDeps;
        for (const warning of report.warnings) {
          console.warn(`[vite-plugin-shell] ${warning}`);
        }
        if (report.autoExcluded.length > 0) {
          console.log(
            `[vite-plugin-shell] non-runtime package(s) never shared: ` +
              report.autoExcluded.join(', ')
          );
        }

        // Bundler settings sharing requires: one resolution per shared
        // package (resolve.dedupe), and in dev a pre-bundle entry for
        // every CJS shared package and each subpath of one the host's
        // own sources import.
        const dedupe = [
          ...new Set(
            sharedDeps.map(SharedSetResolver.extractRootPackageName)
          ),
        ].sort();
        const bundlerConfig: UserConfig = { resolve: { dedupe } };
        if (env.command === 'serve') {
          bundlerConfig.optimizeDeps = {
            include: inspector.optimizeInclude(report.cjsPackages),
          };
        }

        // The default shares whatever the build graph imports, so an
        // empty declared set does not mean an empty shared set: only
        // `include` fixes the set up front. Activity is settled once the
        // graph is known (`generateBundle`).
        if (
          env.command !== 'build' ||
          (options.include !== undefined && sharedDeps.length === 0)
        ) {
          return bundlerConfig;
        }
        active = true;

        // Externalize the shared set so the emitted host chunks keep
        // bare specifiers the generated import map resolves to the
        // shared chunks in the host's own dist.
        selection = new SharedSetSelection({
          include: options.include,
          exclude: effectiveExclude,
        });
        const aliasMap = new AliasMap(config.resolve?.alias);
        aliasTargets = aliasMap.targetRoots();
        sharing = new BuildGraphSharing({
          packageRoot: path.resolve(root),
          selection,
          closureNames: resolved.externalNames,
          alias: config.resolve?.alias,
        });
        const graph = sharing;
        barrelTransform = new ConsumerBarrelRewriteTransform({
          resolver: new ConsumerBarrelResolver({
            packageRoot: path.resolve(root),
            isShared: (name) => graph.sharesRoot(name),
            exclude: options.barrelRewriteExclude,
          }),
          ledger: barrelLedger,
        });
        // The stylesheets a shared module loads are imported where the
        // host imports it, so the host's own CSS carries them (the kit
        // CSS of the kit components the host itself uses).
        stylesheetImports = new SharedStylesheetImports({
          isShared: (specifier) =>
            !aliasMap.rewrites(specifier) &&
            graph.sharesRoot(SharedSetResolver.extractRootPackageName(specifier)),
        });
        return bundlerConfig;
      },

      // The shared set is externalized on the resolved config, wrapping
      // whatever `external` the project configured: returned from
      // `config`, the predicate would go through Vite's config merge,
      // which replaces a string `external` and puts a function into an
      // array, where Rollup never calls it.
      configResolved(config) {
        packageRoot = config.root;
        outDir = config.build?.outDir ?? 'dist';
        command = config.command;
        base = config.base;
        cspNonce = config.html?.cspNonce;
        const graph = sharing;
        if (!active || graph === undefined) return;
        // What the fill runtime imports bundles natively into the fill
        // chunk; every realm copy of the loader converges through
        // Symbol.for.
        ExternalChain.install(
          config,
          (source, importer) => graph.external(source, importer),
          (importer) => importer !== undefined && isFillRuntimeModule(importer)
        );
      },

      resolveId(source) {
        if (source === FILL_MODULE_SOURCE) return FILL_MODULE_ID;
        return null;
      },

      load(id) {
        if (id !== FILL_MODULE_ID) return null;
        // The fill starts when its chunk has loaded, which is after the
        // shell entry has run: its module script follows the entry's in
        // the document, and module scripts run in document order. The
        // entry constructs the MFE handler and so publishes the realm
        // cache before this chunk evaluates; the host fill is never the
        // first publisher. It does not wait for window load. Fill and MFE
        // loads join each other's in-flight entries, whichever publishes
        // first; an MFE waits only for the units it needs.
        return (
          `import { ShellCacheFill } from ${JSON.stringify(fillRuntimePath())};\n` +
          ShellPlugin.fillGlue()
        );
      },

      // Consumer barrel rewrite: before TypeScript is stripped, on the
      // host's own modules, in builds only; then the stylesheets of every
      // shared module the (rewritten) module imports, imported ahead of
      // it.
      transform: {
        order: 'pre',
        async handler(code, id) {
          if (command !== 'build' || barrelTransform === undefined) return null;
          if (id === FILL_MODULE_ID) return null;
          // The emitted fill runtime is native code: it must keep its
          // imports exactly as written so they bundle into the fill
          // chunk. It lives outside the host's node_modules, so
          // isConsumerModule would otherwise admit it, and when the host
          // shares the package a runtime import names, the rewrite turns
          // it into deep `…/dist/…` specifiers that externalize —
          // unresolvable as native static imports.
          if (isFillRuntimeModule(id)) return null;
          const rewritten = ConsumerBarrelRewriteTransform.isConsumerModule(id)
            ? ((await barrelTransform.transform(code, id))?.code ?? null)
            : null;
          const styled = await stylesheetImports?.inject(rewritten ?? code, id);
          const result = styled?.code ?? rewritten;
          return result === null ? null : { code: result, map: null };
        },
      },

      buildStart() {
        chunkImports.clear();
        dynamicChunkImports.clear();
        ownChunkFiles.length = 0;
        hostChunks.length = 0;
        bootGraphChunks.length = 0;
        barrelLedger.clear();
        fillFileName = '';
        // Start Vite's own build-time stage here; the
        // `closeBundle` hook stops it. The plugin runs only in a
        // build, so the start is gated on `active` to mirror the
        // producer-pass gate below.
        if (active) stageTimer.start('vite-build');
        if (!active) return;
        fillRef = this.emitFile({
          type: 'chunk',
          id: FILL_MODULE_SOURCE,
          name: 'frontx-shell-fill',
        });
      },

      generateBundle(_options, bundle) {
        if (!active) return;
        // Nothing shared by the graph-derived set: the build stays a
        // plain native one, without the fill chunk.
        if (
          sharedDeps.length === 0 &&
          !(sharing?.importedPackages().some((p) => p.shared) ?? false)
        ) {
          delete bundle[this.getFileName(fillRef)];
          active = false;
          return;
        }
        fillFileName = this.getFileName(fillRef);
        for (const output of Object.values(bundle)) {
          if (output.type !== 'chunk') continue;
          // The fill chunk's own imports are the emitted runtime's —
          // bundled, never host-chunk specifiers; collecting them
          // would request lists for the runtime's own internals.
          if (output.fileName === fillFileName) continue;
          ownChunkFiles.push(output.fileName);
          const bare: string[] = [];
          for (const spec of output.imports) {
            if (bundle[spec] === undefined) {
              chunkImports.add(spec);
              bare.push(spec);
            }
          }
          // `dynamicImports` lists external ids beside emitted chunks:
          // a dynamic `import()` of a shared package or subpath.
          for (const spec of output.dynamicImports) {
            if (bundle[spec] === undefined) dynamicChunkImports.add(spec);
          }
          hostChunks.push({ fileName: output.fileName, imports: bare });
          bootGraphChunks.push({
            fileName: output.fileName,
            isEntry: output.isEntry,
            staticImports: output.imports.filter((spec) => bundle[spec] !== undefined),
            bareImports: bare,
          });
        }
      },

      async closeBundle(error?: unknown) {
        // A build that already failed wrote no shared output; let its own
        // error surface.
        if (error || !active) return;

        // Vite builds each environment separately and runs closeBundle
        // per build; a host setup adding a second environment (an SSR
        // pass, for instance) would otherwise mint a second producer
        // pass over the same output directory. The shared units are
        // emitted once, by the client build.
        const environment = this.environment;
        if (environment !== undefined && environment.name !== 'client') {
          return;
        }

        const distDir = path.isAbsolute(outDir)
          ? outDir
          : path.join(packageRoot, outDir);
        const sharedDir = path.join(distDir, unitsDir);

        // ── HTML: the native module scripts stay as emitted ─────────
        // An emitted index.html with no module script ships a page that
        // never boots: fail the build instead.
        const htmlPath = path.join(distDir, 'index.html');
        const html = fs.existsSync(htmlPath)
          ? fs.readFileSync(htmlPath, 'utf-8')
          : undefined;
        const moduleScripts =
          html === undefined
            ? []
            : [...html.matchAll(SCRIPT_TAG)].filter((m) =>
                /type=["']module["']/i.test(m[0])
              );
        if (html !== undefined && moduleScripts.length === 0) {
          this.error({
            message:
              `[vite-plugin-shell] the emitted '${path.relative(packageRoot, htmlPath)}' ` +
              'carries no <script type="module" src="…"> to serve natively.',
          });
        }
        const entrySrcs = moduleScripts.map((m) => m[1]);
        const ownBase = ShellPlugin.ownBase(entrySrcs[0], ownChunkFiles, base);

        const isShared = (spec: string): boolean =>
          sharing?.matches(spec) === true;
        const production = await new HostUnitProducer({
          packageRoot,
          outputDir: sharedDir,
          distDir,
          exclude: effectiveExclude,
          include: options.include,
          // Dynamic shared imports are produced too, so their units and
          // lists exist for the import map to answer.
          consumerSpecifiers: [
            ...new Set([...chunkImports, ...[...dynamicChunkImports].filter(isShared)]),
          ].sort(),
          dynamicSpecifiers: [...dynamicChunkImports].filter(isShared),
          barrelLedger,
          hostChunks,
          stageTimer,
          cacheDir: options.cacheDir,
        }).produce((message) => this.error({ message }));
        // The barrel fallback rewrites the host chunks' imports in place;
        // the import map answers what the chunks import after it.
        chunkImports.clear();
        for (const chunk of hostChunks) {
          for (const spec of chunk.imports) chunkImports.add(spec);
        }

        for (const record of barrelLedger.packages()) {
          if (record.mode === 'not-needed') continue;
          console.log(
            `[vite-plugin-shell] barrel ${record.name}: ${record.mode}` +
              (record.rewrites > 0 ? `, ${record.rewrites} binding(s) moved` : '') +
              (record.keptReasons.length > 0
                ? ` — evaluated: ${record.keptReasons.join('; ')}`
                : '')
          );
        }

        // ── Boot list: the fill chunk's embedded data ────────────────
        // The boot list covers the shared specifiers the host chunks
        // import statically. Dynamic specifiers are produced and
        // validated (a reached specifier with no emitted list fails the
        // build) but need no embedded lists — the import map resolves
        // them natively.
        // Only the specifiers the boot-evaluated chunks import go on the
        // boot list (so into the preloads and the fill): what only a
        // lazily reached chunk imports is produced and answered by the
        // import map, but never competes with the boot.
        // The bare imports come from `hostChunks` as the fallback left them,
        // not from the arrays captured in `generateBundle`.
        const hostImports = new Map(hostChunks.map((c) => [c.fileName, c.imports]));
        const bootGraph = new BootChunkGraph(
          bootGraphChunks.map((c) => ({
            ...c,
            bareImports: hostImports.get(c.fileName) ?? c.bareImports,
          }))
        );
        const composed = BootDataComposer.compose({
          produced: production?.produced ?? [],
          staticSpecifiers: bootGraph.bootSpecifiers().filter(isShared),
          dynamicSpecifiers: [
            ...new Set([...dynamicChunkImports, ...bootGraph.lazyOnlySpecifiers()]),
          ]
            .filter(isShared)
            .sort(),
          lazyChunks: new Map(),
          onError: (message) => this.error({ message }),
        });
        for (const pkg of production?.produced ?? []) {
          if (pkg.versionDrift !== undefined) {
            console.log(`[vite-plugin-shell] ${pkg.versionDrift}`);
          }
        }
        for (const opaque of composed.opaqueImports) {
          console.log(
            `[vite-plugin-shell] ${opaque.file}:${opaque.line} · ` +
              `import(${opaque.expression ?? 'expr'}) · stays native`
          );
        }

        // ── Import map: the entry lists answer the host chunks'
        // bare imports at the top level; every emitted document's
        // in-scope edges answer the shared chunks' own. ─────────────
        const lists: Record<string, ProducedFetchList> = {};
        for (const pkg of production?.produced ?? []) {
          for (const [spec, list] of Object.entries(pkg.lists)) {
            if (lists[spec] === undefined) lists[spec] = list;
          }
        }
        const importMap = ImportMapComposer.compose({
          unitsBaseUrl: `${ownBase}${unitsDir}/`,
          specifiers: [
            ...new Set(
              [...chunkImports, ...dynamicChunkImports].filter(isShared)
            ),
          ].sort(),
          lists,
          onError: (message) => this.error({ message }),
        });

        // The units base is the URL the import map and the preloads use,
        // so the fill requests the very URLs the boot fetched, whatever
        // address the document itself was served under.
        const fillData = {
          unitsBase: `${ownBase}${unitsDir}/`,
          units: composed.bootUnits,
          list: composed.list,
        };
        const emittedFillPath = path.join(distDir, fillFileName);
        const fillSource = ShellPlugin.injectFillData(
          fs.readFileSync(emittedFillPath, 'utf-8'),
          fillData
        );
        if (fillSource === undefined) {
          this.error({
            message:
              `[vite-plugin-shell] emitted fill chunk '${fillFileName}' ` +
              'carries no fill-data marker.',
          });
        }
        // Rollup hashed the chunk before its data existed, so the file is
        // renamed after the text it now carries: a release with different
        // data gets a different name, which immutable caching needs.
        fillFileName = ShellPlugin.fillFileNameOf(fillFileName, fillSource);
        fs.rmSync(emittedFillPath);
        fs.writeFileSync(path.join(distDir, fillFileName), fillSource, 'utf-8');

        // ── HTML: import map + modulepreloads before the first module
        // script; the fill chunk's module script after the last ──────
        if (html !== undefined) {
          const nonceValue =
            options.importMapNonce !== undefined
              ? assertNonce(options.importMapNonce, 'importMapNonce')
              : cspNonce !== undefined
                ? assertNonce(cspNonce, 'html.cspNonce')
                : undefined;
          const nonce = nonceValue !== undefined ? ` nonce="${nonceValue}"` : '';
          const preloads = composed.bootUnits
            .map(
              (item) =>
                `<link rel="modulepreload" fetchpriority="high" href="${ownBase}${unitsDir}/${item.location}"${nonce} />`
            )
            .join('');
          const first = moduleScripts[0];
          const last = moduleScripts[moduleScripts.length - 1];
          const lastEnd = (last.index ?? 0) + last[0].length;
          const rewritten =
            html.slice(0, first.index) +
            `<script type="importmap"${nonce}>${importMap.json}</script>` +
            preloads +
            html.slice(first.index, lastEnd) +
            `<script type="module" fetchpriority="low" src="${ownBase}${fillFileName}"${nonce}></script>` +
            html.slice(lastEnd);
          fs.writeFileSync(htmlPath, ShellPlugin.prioritiseBoot(rewritten), 'utf-8');
        }

        console.log(
          `[vite-plugin-shell] host units: ${production?.produced.length ?? 0} ` +
            `shared dep(s) under '${unitsDir}/'; ` +
            `import map ${Object.keys(importMap.imports).length} ` +
            `specifier(s), CSP source '${importMap.cspHash}'; ` +
            `fill chunk ${fillFileName}`
        );

        // Stop Vite's own build-time stage and emit the
        // per-stage build report. The report is a side channel: the
        // chunks and the import map are unchanged
        // by instrumentation. The timer's `vite-build` stage covers
        // buildStart → closeBundle end.
        stageTimer.stop('vite-build');
        ShellBuildReport.emit(
          ShellBuildReport.compose({
            host: 'template-shell',
            sharedOutDir: unitsDir,
            sharedDir,
            produced: production?.produced ?? [],
            stageTimings: stageTimer.toRecord(),
            cache: production?.cache,
            sharedSet: SharedSetSummary.compose({
              packageRoot,
              selection,
              produced: production?.produced ?? [],
              imported: sharing?.importedPackages() ?? [],
              aliasTargets,
            }),
          }),
          distDir
        );
      },
    };
  }
}
