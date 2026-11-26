/**
 * `UnitProducer` — the shared-dependency producer: chunks each shared
 * `package@version` the Module Federation way — one chunk per entry
 * point of the package's own complete entry set (`exports` subpaths
 * plus side-effect-free barrel members),
 * overlapping internals in shared internal chunks — and emits flat
 * per-entry fetch lists (`ProducedFetchList`, units inline) plus
 * nested lazy delta lists and pattern lists, from which the manifest's
 * unit table and lists in the `./unit-format` contract format derive.
 *
 * Content-hash naming (`unit_url_scheme`):
 *   chunks `<pkg>@<version>/<path>.<hash>.js`
 *
 * Chunk boundaries and bytes depend on `package@version` alone — the
 * same producer settings (`ProducerBuildSettings`), no
 * build-environment text — so two consumers using different subsets
 * produce byte-identical package chunks. Each build's `dist` receives
 * only the chunks its own lists reference; the per-package
 * computation is cached on the build machine (`cacheDir`).
 *
 * Built on the producer's own exact-pinned Rollup with its standard
 * plugins (bundler parity): the bundler does resolution, CommonJS
 * interop, JSON, assets and chunk merging; the producer adds only the
 * entry set, shared-specifier externalization,
 * content-addressed names, flat lists and the build report.
 */

import * as fs from 'node:fs';
import { isBuiltin } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';

import type {
  SharedDepImportEdge,
  SharedDepUnit,
} from '@gears-frontx/mfes/unit-format';

import { BuildReport } from './BuildReport';
import type { BuildStageTimer } from './BuildStageTimer';
import { ContentAddressedPublisher } from './ContentAddressedPublisher';
import { ChunkSyntaxMemo } from './ChunkSyntaxMemo';
import { ContentHasher } from './ContentHasher';
import { ConsumerBarrelResolver } from './ConsumerBarrelResolver';
import { ConsumerBarrelFallback } from './ConsumerBarrelFallback';
import { ConsumerBarrelRewriteLedger } from './ConsumerBarrelRewriteLedger';
import { ConsumerBarrelRewriteTransform } from './ConsumerBarrelRewriteTransform';
import { ExportClauseMembers } from './ExportClauseMembers';
import { LazyListSeeds } from './LazyListSeeds';
import { UnitExportNames } from './UnitExportNames';
import { UnitFileNaming } from './UnitFileNaming';
import { ForeignPackageInliningGuard } from './ForeignPackageInliningGuard';
import { ModuleLinkageScanner } from './ModuleLinkageScanner';
import { OrderedParallelMap } from './OrderedParallelMap';
import { PackageCacheReport, type PackageCacheSummary } from './PackageCacheReport';
import { EntryClosureMemo } from './EntryClosureMemo';
import { EntryScreen } from './EntryScreen';
import { EntryScreenLedger } from './EntryScreenLedger';
import { PackageBuildCache, type CachedPackageBuild, type CachedChunkRecord } from './PackageBuildCache';
import { PackageEntryFileResolver } from './PackageEntryFileResolver';
import { PackageEntrySet, type BarrelNote, type ExcludedEntry } from './PackageEntrySet';
import { PackageExportPatternExpander } from './PackageExportPatternExpander';
import { PackageContentFingerprints } from './PackageContentFingerprints';
import { PatternImportMatcher } from './PatternImportMatcher';
import { PortableCacheRecord } from './PortableCacheRecord';
import { restoreMemberNames } from './ProducerBuildSettings';
import { ProducerCacheFingerprint } from './ProducerCacheFingerprint';
import type { OpaqueImportReport, ProducedFetchList } from './ProducedFetchList';
import { RollupPackageBundler } from './RollupPackageBundler';
import { SharedSetResolver, type SharedPackageLocation } from './SharedSetResolver';
import { SharedSpecifierMatcher } from './SharedSpecifierMatcher';
import { SkippedEntryIndex } from './SkippedEntryIndex';

/** The package.json fields the producer reads on dependency packages. */
export interface SharedDepPackageJson {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  exports?: unknown;
  main?: string;
  module?: string;
  browser?: unknown;
  /** The package's side-effect declaration; gates barrel member splitting. */
  sideEffects?: boolean | string[];
  optionalDependencies?: Record<string, string>;
  version?: string;
}

/** One shared dep resolved to its install location. */
export interface ResolvedSharedDep {
  name: string;
  packageDir: string;
  installDir: string;
  resolveDir: string;
  pkg: SharedDepPackageJson;
  version: string;
  transitive: boolean;
}

/** One emitted chunk's consumer-facing record. */
export interface ProducedChunk {
  location: string;
  contentHash: string;
  modulePaths: string[];
  /** Root names of the bare specifiers the chunk keeps external. */
  bareImports: string[];
  /**
   * The names the emitted unit exports; absent when the unit is not
   * emitted by this build or its surface is not statically known.
   */
  exports?: string[];
}

/** One produced shared package, as `UnitProducer.produce` returns it. */
export interface ProducedSharedPackage {
  name: string;
  version: string;
  /** Root entry chunk location (the `pkg` specifier's answering chunk). */
  packLocation: string;
  /** 'units' = more than one emitted chunk; 'single' = one. */
  unitMode: 'units' | 'single';
  /** Every computed chunk (referenced or not). */
  units: ProducedChunk[];
  /** Specifier (`pkg`, `pkg/sub`, `pkg/<module>`) → answering chunk location. */
  entryUnits: Record<string, string>;
  /** Requested entry specifier → its fetch list, build-side with units inline. */
  lists: Record<string, ProducedFetchList>;
  requires?: string[];
  transitive: boolean;
  /** Bytes of every emitted chunk file. */
  chunkBytes: number;
  barrelMode: 'rewritten' | 'not-needed' | 'kept';
  barrelKeptReason?: string;
  fallbackReason?: string;
  /** `name — versions` drift line when peer builds resolve differently. */
  versionDrift?: string;
  /**
   * Entries skipped by the production-runtime screen — each with the
   * reason it can never load in a production browser.
   */
  skippedEntries?: Array<{ entry: string; specifier: string; reason: string }>;
}

export interface UnitProducerOptions {
  packageRoot: string;
  outputDir: string;
  exclude?: readonly string[];
  /** The `include` option (mutually exclusive with `exclude`). */
  include?: readonly string[];
  declaredVersions?: ReadonlyMap<string, string>;
  consumerSpecifiers?: readonly string[];
  /**
   * Versions other runtime builds of the same application resolved for
   * the same package names — the build report's version-drift line
   * names any package resolving differently here.
   */
  peerVersions?: ReadonlyMap<string, string>;
  /**
   * Build-machine cache directory for the per-`package@version`
   * computation (build speed only).
   */
  cacheDir?: string;
  /**
   * Per-stage build-time instrumentation. When passed, the producer measures
   * shared-set resolution, entry-set computation, cache-read,
   * cache-write at the relevant call sites and forwards the timer
   * to the bundler for `rollup` and `terser`. The timer is a side
   * channel: it writes nothing into the emitted chunk bytes or list
   * documents, so an un-instrumented build and an instrumented one
   * produce byte-identical output.
   */
  stageTimer?: BuildStageTimer;
}

/** One chunk of a package's split build, pre- and post-patch. */
interface ChunkRecord {
  id: string;
  file: string;
  namePath: string;
  entryPoint?: string;
  modulePaths: string[];
  externalEdges: Array<{ specifier: string; kind: string }>;
  internalEdges: Array<{ id: string; kind: string }>;
  isCjsEntry: boolean;
  location: string;
  contentHash: string;
  /**
   * Extra locations publishing the same file: a chunk inside an
   * import cycle is reached through the deterministic unhashed
   * `./<namePath>.js` specifier its cyclic partners emit — the alias
   * carries it.
   */
  publishAliases?: string[];
  answers: string[];
  /**
   * Built by `coverRequested` for a deep import outside the
   * package-determined entry set's closures.
   */
  supplementary?: boolean;
  /**
   * The deep import was requested by the consuming build itself
   * (`consumerSpecifiers`), not reached through the shared closure —
   * the chunk stays out of `units`/`entryUnits` so the package's
   * shared chunk-set record depends only on the package and the
   * closure, never on which consumer asked.
   */
  consumerOnly?: boolean;
}

/** A package's computed chunk set (the cached computation). */
/** One package's computation: its chunks and the entries it excluded. */
interface ComputedPackage {
  build: PackageChunks | undefined;
  excluded: readonly ExcludedEntry[];
}

interface PackageChunks {
  dep: ResolvedSharedDep;
  chunks: ChunkRecord[];
  /** Build input module ids of the package build — the inlining guard's data. */
  buildInputs: string[];
  /** Entry specifier → chunk id. */
  entryChunks: Map<string, string>;
  /**
   * Entry specifier → resolved file — kept so the transitive-skip
   * fixpoint can re-screen entries computed before a skip in
   * another package was recorded.
   */
  entryFiles: Map<string, string>;
  barrelNotes: BarrelNote[];
  entrySpecifiers: string[];
  /**
   * Entries deferred on an optional-peer reach: confirmed
   * skipped by the fixpoint only when the peer is never delivered.
   */
  pendingPeers: ExcludedEntry[];
  /**
   * Chunk ids of entries confirmed skipped this run: their
   * external edges never queue a request — the skipped entry can never
   * load, so neither can its own imports.
   */
  skippedChunkIds?: Set<string>;
  /**
   * Bare specifiers the package requires only inside `try`/`catch`
   * — computed lazily from the chunks' owned modules: they
   * stay runtime requires and never enter the delivered closure.
   */
  optionalExternals?: Set<string>;
  /** Member respells of this package turned back to their barrel this run. */
  turnedBackRespells?: Set<string>;
}

/** What every list of one package's emit shares: lookups and the publisher. */
interface ListEmitContext {
  build: PackageChunks;
  answerToItem: ReadonlyMap<string, string>;
  answerToRecord: ReadonlyMap<string, { build: PackageChunks; chunk: ChunkRecord }>;
  chunkByHash: ReadonlyMap<string, { build: PackageChunks; chunk: ChunkRecord }>;
  deliveredRoots: ReadonlySet<string>;
  onError: (message: string) => never;
  recordFor: (hash: string) => { build: PackageChunks; chunk: ChunkRecord } | undefined;
  byIdOf: (b: PackageChunks) => Map<string, ChunkRecord>;
  answersOf: (b: PackageChunks, chunk: ChunkRecord) => string[];
  publishChunk: (chunk: ChunkRecord) => void;
}

/** The state of the one list being emitted that its edge walk reads and extends. */
interface ListEmitState {
  answeredNow: Set<string>;
  emittedHashes: Set<string>;
  parentLocations: ReadonlySet<string>;
  seedLazy: (build: PackageChunks, chunk: ChunkRecord, key?: string) => void;
  push: (entry: string | { build: PackageChunks; chunk: ChunkRecord }) => void;
}

// @cpt-dod:cpt-template-shell-dod-unit-producer-output-obligations:p1
export class UnitProducer {
  private readonly packageRoot: string;
  private readonly outputDir: string;
  private readonly options: UnitProducerOptions;
  private inliningGuard?: ForeignPackageInliningGuard;
  private readonly inliningFailures: string[] = [];
  private stagingDir?: string;
  private readonly bundler = new RollupPackageBundler();
  private readonly entryFileResolver = new PackageEntryFileResolver();
  /**
   * One member-respelling transform per package — its resolver caches
   * the shared packages' barrel classifications across the build.
   */
  private readonly memberRespells = new Map<
    string,
    ConsumerBarrelRewriteTransform
  >();
  /** Excluded entries per package root, for failure reporting. */
  private readonly excludedByRoot = new Map<string, ExcludedEntry[]>();
  /** Skipped entries across every package — the transitive-skip index. */
  private readonly skipped = new SkippedEntryIndex();
  /**
   * The current run's incremental entry screen — created by `produce()`
   * and dropped when it returns: its memo holds file contents and
   * closures valid only while the run's inputs stay unchanged.
   */
  private entryScreens?: EntryScreenLedger;
  /** Per-package cache outcomes, for the build report. */
  private readonly cacheReport = new PackageCacheReport();
  /**
   * The content fingerprint of each package directory, read once: it
   * keys the package's own cached computation and is a part of the key
   * of every package that reads it.
   */
  readonly contentFingerprints: PackageContentFingerprints;
  /** What the current run reads out of each emitted chunk, parsed once per chunk. */
  private chunkSyntax = new ChunkSyntaxMemo();
  private patternImports: PatternImportMatcher;
  /** Per package: the origins of the imports its own build respelled. */
  private readonly respellLedgers = new Map<string, ConsumerBarrelRewriteLedger>();

  /**
   * `contentFingerprints`: the memo of another producer of the same
   * host produce call, so the packages both read are fingerprinted once.
   */
  constructor(options: UnitProducerOptions, contentFingerprints?: PackageContentFingerprints) {
    this.options = options;
    this.packageRoot = options.packageRoot;
    this.outputDir = options.outputDir;
    this.contentFingerprints = contentFingerprints ?? new PackageContentFingerprints();
    this.patternImports = new PatternImportMatcher(options.outputDir);
  }

  /** Per-package cache hits/misses of the last `produce()`, sorted by `name@version`. */
  cacheOutcomes(): PackageCacheSummary {
    return this.cacheReport.toSummary();
  }

  // @cpt-flow:cpt-template-shell-flow-unit-producer-output-produce:p1
  async produce(
    onError: (message: string) => never
  ): Promise<ProducedSharedPackage[]> {
    fs.mkdirSync(this.outputDir, { recursive: true });
    // @cpt-begin:cpt-template-shell-flow-unit-producer-output-produce:p1:inst-produce-output
    this.stagingDir = fs.mkdtempSync(`${this.outputDir}.staging-`);
    this.chunkSyntax = new ChunkSyntaxMemo();
    this.patternImports = new PatternImportMatcher(this.outputDir);
    this.entryScreens = new EntryScreenLedger(
      new EntryScreen(this.entryFileResolver, new EntryClosureMemo()),
      this.skipped
    );
    try {
      // @cpt-begin:cpt-template-shell-flow-unit-producer-output-produce:p1:inst-return-output
      return await this.produceStaged(onError);
      // @cpt-end:cpt-template-shell-flow-unit-producer-output-produce:p1:inst-return-output
    } finally {
      fs.rmSync(this.stagingDir, { recursive: true, force: true });
      this.stagingDir = undefined;
      this.entryScreens = undefined;
    }
    // @cpt-end:cpt-template-shell-flow-unit-producer-output-produce:p1:inst-produce-output
  }

  /**
   * The screen failure of one entry against the skip index as it
   * stands now — re-screened only when a skip recorded since its last
   * screen changed a value that screen read ({@link EntryScreenLedger}).
   */
  private screenFailure(
    build: PackageChunks,
    file: string
  ): Promise<{ specifier: string; reason: string; optionalPeer?: string } | undefined> {
    if (this.entryScreens === undefined) {
      throw new Error('[unit-producer] the entry screen runs only inside produce()');
    }
    return this.entryScreens.failure(build.dep, file);
  }

  private staging(): string {
    return this.stagingDir ?? this.outputDir;
  }

  private async produceStaged(
    onError: (message: string) => never
  ): Promise<ProducedSharedPackage[]> {
    const stageTimer = this.options.stageTimer;
    const resolver = new SharedSetResolver(this.packageRoot, {
      exclude: this.options.exclude,
      include: this.options.include,
      declaredVersions: this.options.declaredVersions,
    });
    const resolveSharedSet = () => resolver.resolve();
    const resolvedSet = stageTimer !== undefined
      ? stageTimer.measure('shared-set-resolution', resolveSharedSet)
      : resolveSharedSet();
    if (!resolvedSet.ok) onError(resolvedSet.message);
    const set = resolvedSet as Extract<typeof resolvedSet, { ok: true }>;

    const deps = new Map<string, ResolvedSharedDep>();
    const builds = new Map<string, PackageChunks>();
    /** Root name → specifiers the consumers/shared packages request. */
    const requested = new Map<string, Set<string>>();
    const request = (root: string, specifier: string): void => {
      const s = requested.get(root) ?? new Set<string>();
      s.add(specifier);
      requested.set(root, s);
    };
    const versionChecked = new Set<string>();
    const queue: Array<{ specifier: string; importer?: ResolvedSharedDep }> = [];
    const consumer = { dir: this.packageRoot, installDir: this.packageRoot };

    const addDep = async (
      dep: ResolvedSharedDep,
      computed?: ComputedPackage
    ): Promise<void> => {
      deps.set(dep.name, dep);
      const { build, excluded } =
        computed ?? (await this.computeChunks(dep, onError));
      // Exclusions enter the run's skip index here, in the serial
      // application order — never from inside a concurrent computation.
      this.recordExcluded(dep, excluded);
      if (build === undefined) {
        console.log(
          `  [unit-producer] ${dep.name}: no resolvable JavaScript entry; ` +
            `not delivered`
        );
        return;
      }
      builds.set(dep.name, build);
      // Per-run skip screening right after the computation (cached or
      // freshly built alike): an entry whose closure reaches an
      // already-skipped entry leaves the run's deliverable set before
      // its edges can queue requests for it — the complete chunk set
      // stays, only the entry's deliverability is run state.
      await this.screenNewBuild(build);
      for (const spec of buildExternalSpecifiers(build)) {
        queue.push({ specifier: spec, importer: dep });
      }
    };

    const declaredDeps = this.resolveDeps(set);
    // The declared packages' computations (cache read or Rollup build)
    // are independent: run them concurrently, apply them in declaration
    // order so the run state never depends on completion order.
    const computedDeclared = await OrderedParallelMap.map(
      declaredDeps,
      UnitProducer.defaultParallelism(),
      (dep) => this.computeChunks(dep, onError)
    );
    // @cpt-begin:cpt-template-shell-flow-unit-producer-output-produce:p1:inst-emit-no-whole-package
    for (const [i, dep] of declaredDeps.entries()) {
      await addDep(dep, computedDeclared[i]);
      // A declared dependency is shared, but its root specifier is requested
      // only when some code imports it: no whole-package file is built
      // for a package nothing names.
    }
    // @cpt-end:cpt-template-shell-flow-unit-producer-output-produce:p1:inst-emit-no-whole-package
    for (const spec of this.options.consumerSpecifiers ?? []) {
      queue.push({ specifier: spec });
    }

    let head = 0;
    const drainQueue = async (): Promise<void> => {
    for (; head < queue.length; head++) {
      const { specifier, importer } = queue[head];
      if (!SharedSpecifierMatcher.isBareModuleSpecifier(specifier)) continue;
      // Node built-ins stay external specifiers; nothing delivers them.
      if (isBuiltin(specifier)) continue;
      const root = SharedSetResolver.extractRootPackageName(specifier);
      const importerName = importer?.name ?? 'the consuming build';
      let dep = deps.get(root);
      if (dep === undefined) {
        if (resolver.isExcluded(root)) {
          onError(SharedSetResolver.formatExcludedDependentError(root, [importerName]));
        }
        const located = resolver.locate(
          importer !== undefined
            ? { dir: importer.packageDir, installDir: importer.installDir }
            : consumer,
          root
        );
        // Bundler parity: an optional peer
        // (`peerDependenciesMeta.optional`) stays a native external —
        // a bundler never delivers it — with a warning; every other
        // locatable import is delivered, declared or not (an
        // undeclared-but-locatable import is what a bundler bundles,
        // so it warns and is delivered); an import nothing can locate
        // is a resolution failure, the same failure a bundler reports.
        const optionalPeer =
          importer !== undefined &&
          importer.pkg.peerDependencies?.[root] !== undefined &&
          importer.pkg.peerDependenciesMeta?.[root]?.optional === true;
        if (optionalPeer) {
          console.warn(
            `  [unit-producer] shared package "${importerName}" imports ` +
              `"${specifier}", but "${root}" is only an optional peer of ` +
              `"${importerName}"; it stays a native external`
          );
          continue;
        }
        if (located === undefined) {
          // A specifier the importer requires only inside
          // `try`/`catch` is a runtime-optional require — a bundler
          // leaves it runtime; it warns and stays a native external,
          // never a delivered package.
          if (
            importer !== undefined &&
            this.optionalExternalsOf(builds.get(importer.name)).has(specifier)
          ) {
            console.warn(
              `  [unit-producer] shared package "${importerName}" ` +
                `requires "${specifier}" only inside try/catch and ` +
                `"${specifier}" cannot be located from ` +
                `${importer.installDir}; it stays a runtime require`
            );
            continue;
          }
          onError(
            `[unit-producer] ${importer ? `shared package "${importerName}"` : importerName} ` +
              `imports "${specifier}", but "${root}" cannot be located ` +
              `from ${importer?.installDir ?? this.packageRoot}.\n` +
              `Every package a shared package imports is shared; install ` +
              `"${root}" so the closure can be delivered.`
          );
        }
        const declared =
          importer === undefined ||
          importer.pkg.dependencies?.[root] !== undefined ||
          importer.pkg.peerDependencies?.[root] !== undefined;
        if (!declared) {
          console.warn(
            `  [unit-producer] shared package "${importerName}" imports ` +
              `"${specifier}", but "${root}" is not a declared dependency ` +
              `of "${importerName}"; delivered like a bundler would`
          );
        }
        dep = this.toResolvedDep(located!);
        await addDep(dep);
      } else if (importer !== undefined && importer.name !== root) {
        const key = `${importer.name}>${root}`;
        if (!versionChecked.has(key)) {
          versionChecked.add(key);
          const located = resolver.locate(
            { dir: importer.packageDir, installDir: importer.installDir },
            root
          );
          if (located !== undefined && located.version !== dep.version) {
            onError(
              SharedSetResolver.formatMultipleVersionsError(
                root,
                dep.version,
                located.version,
                importer.name
              )
            );
          }
        }
      }
      request(root, specifier);
    }
    };
    await drainQueue();
    // Transitive skipping: an entry of any package whose
    // closure reaches a skipped entry is skipped too — a fixpoint over
    // every package's entry set.
    await this.propagateSkips(builds);

    const live = [...deps.values()].filter((d) => builds.has(d.name));

    this.inliningGuard = new ForeignPackageInliningGuard(
      new Map(live.map((d) => [d.name, d.packageDir]))
    );
    for (const [name, build] of builds) {
      for (const failure of this.pendingInliningFailures(name, build)) {
        this.inliningFailures.push(failure);
      }
    }
    if (this.inliningFailures.length > 0) onError(this.inliningFailures[0]);

    // Supplementary coverage first, byte-shaping last. Cover requested
    // specifiers nothing answers with supplementary single-entry
    // builds — a consumer-independent deep path is covered by the chunk
    // owning its module; only an unreached module needs one. A
    // supplementary build's own external edges re-enter the closure
    // queue under the same bundler-parity rules: a package they
    // reach is delivered, an unlocatable one fails. Every chunk stays
    // unshaped until the dependency closure has stabilized: only then
    // is the CJS entry set final, so byte-shaping (CJS interop, path
    // normalization, mangling, hashing) runs exactly once over every
    // chunk of every package — no chunk is ever patched against an
    // incomplete CJS specifier set.
    for (;;) {
      for (const build of [...builds.values()]) {
        await this.coverRequested(
          build,
          requested.get(build.dep.name) ?? new Set(),
          new Set(this.options.consumerSpecifiers ?? []),
          queue,
          onError
        );
      }
      // At rest, a shared package's member respells whose answering
      // unit lacks an imported name go back to the barrel; the barrel
      // specifiers they restore are requested like any other.
      if (head >= queue.length && !this.keepUnansweredRespells(builds, queue)) break;
      await drainQueue();
      await this.propagateSkips(builds);
    }

    // CJS entries: detected on unpatched outputs. Only the package's
    // complete entry set counts — a supplementary coverage entry exists
    // only because a consumer requested its specifier, and a request
    // must never reach interop shaping; a specifier
    // answered by a non-entry chunk keeps the namespace+CommonJS wrap.
    const cjsSpecifiers = new Set<string>();
    for (const build of builds.values()) {
      const entrySet = new Set(build.entrySpecifiers);
      for (const [spec, id] of build.entryChunks) {
        if (!entrySet.has(spec)) continue;
        if (build.chunks.find((c) => c.id === id)?.isCjsEntry) {
          cjsSpecifiers.add(spec);
        }
      }
    }
    for (const build of builds.values()) {
      await this.shapeChunks(build, cjsSpecifiers);
    }

    // Which specifiers a runtime can actually import: the declared
    // roots, the consumer's own specifiers, and every bare edge of a
    // chunk still reachable from a live (non-skipped, non-skipped-set)
    // entry or supplementary chunk. A specifier reached
    // only through dead code — the chunk set of an entry this run
    // skipped — is never imported at runtime, so it neither fails the
    // build nor gets a list. The `requested` map still drives
    // supplementary coverage inside the fixpoint (discovery); this set
    // decides emission and failure.
    const liveRequested = new Map<string, Set<string>>();
    const addLive = (root: string, spec: string): void => {
      const s = liveRequested.get(root) ?? new Set<string>();
      s.add(spec);
      liveRequested.set(root, s);
    };
    for (const spec of this.options.consumerSpecifiers ?? []) {
      if (SharedSpecifierMatcher.isBareModuleSpecifier(spec) && !isBuiltin(spec)) {
        addLive(SharedSetResolver.extractRootPackageName(spec), spec);
      }
    }
    for (const build of builds.values()) {
      const optionalExternals = this.optionalExternalsOf(build);
      for (const chunk of this.liveChunks(build)) {
        for (const edge of chunk.externalEdges) {
          const spec = edge.specifier;
          if (
            !SharedSpecifierMatcher.isBareModuleSpecifier(spec) ||
            isBuiltin(spec) ||
            // A try/catch require stays a runtime require the bundler
            // never resolves — not an import the runtime
            // expects a list for.
            optionalExternals.has(spec)
          ) {
            continue;
          }
          addLive(SharedSetResolver.extractRootPackageName(spec), spec);
        }
      }
    }

    // List completeness: a requested specifier whose package
    // produced no deliverable build — every entry excluded by the
    // production-runtime screen, or no resolvable JavaScript
    // entry — fails the build naming the specifier; it can never get
    // a list and a silent skip leaves the consumer holding a bare
    // specifier no minted chunk answers.
    for (const [root, specs] of liveRequested) {
      if (builds.has(root)) continue;
      const reasons = (this.excludedByRoot.get(root) ?? [])
        .map((e) => `"${e.entry}" excluded: ${e.reason}`)
        .join('; ');
      onError(
        `[unit-producer] requested specifier(s) ` +
          `${[...specs].sort().map((s) => `"${s}"`).join(', ')} of ` +
          `"${root}" have no emitted list — the package produced no ` +
          `deliverable entries${reasons !== '' ? ` (${reasons})` : ''}`
      );
    }

    // Global answer map: specifier → content identity. Non-entry
    // chunks (the ones holding a module's body) answer module-path
    // specifiers before the thin entry shims that re-export them.
    const answerToItem = new Map<string, string>();
    // The chunk record that answers each specifier — byte-identical
    // twins share one content identity but keep their own answers, so
    // an edge resolved by `answerToItem` alone can point at an item
    // whose answers do not cover the specifier. `answerToRecord` keeps
    // the first chunk claiming the specifier: emitting it is the only
    // way to deliver the specifier's blob binding.
    const answerToRecord = new Map<
      string,
      { build: PackageChunks; chunk: ChunkRecord }
    >();
    for (const build of builds.values()) {
      for (const chunk of UnitProducer.entriesLast(build.chunks)) {
        for (const spec of chunk.answers) {
          if (!answerToItem.has(spec)) {
            answerToItem.set(spec, chunk.contentHash);
            answerToRecord.set(spec, { build, chunk });
          }
        }
      }
    }
    const chunkByHash = new Map<string, { build: PackageChunks; chunk: ChunkRecord }>();
    for (const build of builds.values()) {
      for (const chunk of build.chunks) {
        chunkByHash.set(chunk.contentHash, { build, chunk });
      }
    }

    // Emit the flat lists of every requested specifier. The
    // deliverable set is recomputed after the coverage fixpoint:
    // packages discovered through a supplementary build's external
    // edges are delivered like every other shared package — their
    // entry lists and records are emitted too.
    const produced: ProducedSharedPackage[] = [];
    const deliverable = [...deps.values()].filter((d) => builds.has(d.name));
    for (const dep of UnitProducer.dependencyOrder(deliverable, builds, onError)) {
      const build = builds.get(dep.name)!;
      const key = UnitFileNaming.packageKey(dep.name, dep.version);
      const requestedSpecs = [...(liveRequested.get(dep.name) ?? new Set())].sort();
      const emitted = this.emitLists(
        build,
        requestedSpecs,
        answerToItem,
        answerToRecord,
        chunkByHash,
        new Set([...builds.values()].map((b) => b.dep.name)),
        onError
      );
      produced.push(this.finishPackage(build, key, emitted, onError));
    }
    return produced;
  }

  /**
   * The transitive-skip fixpoint: re-screens every package's
   * surviving entries against the skip index — an entry whose closure
   * reaches a skipped entry (by specifier, or by any specifier
   * resolving to the skipped file) is itself skipped and reported.
   * Skipping removes the entry's specifier from the answer map so the
   * build can never emit a list for it; it fails only when a runtime
   * actually imports it — at the list-completeness gates, which name
   * entry and reason. Loops until no entry changes state, since each
   * new skip can fail further entries in any package; an entry is
   * re-screened only when a skip recorded since its last screen changed
   * a value that screen read, so each round costs only what changed.
   */
  private async propagateSkips(
    builds: ReadonlyMap<string, PackageChunks>
  ): Promise<void> {
    const deliveredRoots = new Set(builds.keys());
    // Deferred optional-peer entries: buildable while the
    // peer is delivered — a delivered peer's chunk answers the edge —
    // confirmed skipped when it never joins the delivered set.
    for (const build of builds.values()) {
      for (const pending of build.pendingPeers.splice(0)) {
        const peerRoot = SharedSetResolver.extractRootPackageName(
          pending.specifier
        );
        if (peerRoot === build.dep.name || deliveredRoots.has(peerRoot)) {
          continue;
        }
        this.confirmSkip(
          build,
          pending.entry,
          pending.file,
          pending.specifier,
          pending.reason
        );
      }
    }
    for (;;) {
      let changed = false;
      for (const build of builds.values()) {
        for (const [spec, file] of [...build.entryFiles]) {
          const failing = await this.screenFailure(build, file);
          if (failing === undefined) continue;
          // An optional-peer reach found on re-screen is deferred too:
          // while the peer is delivered the entry stays buildable (it
          // remains in entryFiles so a later skip still propagates).
          if (failing.optionalPeer !== undefined) {
            const peerRoot = SharedSetResolver.extractRootPackageName(
              failing.specifier
            );
            if (peerRoot === build.dep.name || deliveredRoots.has(peerRoot)) {
              continue;
            }
          }
          const reason = `its closure reaches "${failing.specifier}": ${failing.reason}`;
          this.confirmSkip(build, spec, file, failing.specifier, reason);
          changed = true;
        }
      }
      if (!changed) return;
    }
  }

  /**
   * The chunks a runtime can reach: every chunk of a live (non-skipped)
   * entry or supplementary chunk, transitively through internal edges.
   * Chunks owned solely by skipped entries are dead code — their
   * external edges are never runtime imports.
   */
  private liveChunks(build: PackageChunks): ChunkRecord[] {
    const byId = new Map(build.chunks.map((c) => [c.id, c]));
    const live = new Set<ChunkRecord>();
    const stack: ChunkRecord[] = build.chunks.filter((c) => c.supplementary === true);
    for (const id of build.entryChunks.values()) {
      const chunk = byId.get(id);
      if (chunk !== undefined) stack.push(chunk);
    }
    while (stack.length > 0) {
      const chunk = stack.pop()!;
      if (live.has(chunk)) continue;
      live.add(chunk);
      for (const edge of chunk.internalEdges) {
        const target = byId.get(edge.id);
        if (target !== undefined) stack.push(target);
      }
    }
    return [...live];
  }

  /**
   * The per-run half of the entry screen, applied the moment a
   * package's chunk set is known — cache hit or fresh build alike
     * It re-screens the build's entries against the skip index as
   * it stands now, so entries skipped only because another package was
   * skipped leave this run's deliverable set without ever having been
   * baked into the cached computation. The fixpoint
   * ({@link propagateSkips}) re-runs the same screen as later skips
   * arrive. Optional-peer reaches are never confirmed here — this
   * screen can run while the closure queue still holds the
   * undiscovered peer; the fixpoint decides them once the queue is
   * drained.
   */
  private async screenNewBuild(build: PackageChunks): Promise<void> {
    for (const [spec, file] of [...build.entryFiles]) {
      const failing = await this.screenFailure(build, file);
      if (failing === undefined || failing.optionalPeer !== undefined) {
        continue;
      }
      const reason = `its closure reaches "${failing.specifier}": ${failing.reason}`;
      this.confirmSkip(build, spec, file, failing.specifier, reason);
    }
  }

  /**
   * Confirms one skipped entry: records it in the skip index and the
   * package's exclusion report, drops its specifier from the entry and
   * answer maps — the build can never emit a list for it, so it fails
   * only when a runtime actually imports it.
   */
  private confirmSkip(
    build: PackageChunks,
    spec: string,
    file: string,
    specifier: string,
    reason: string
  ): void {
    this.skipped.add(spec, file, reason);
    // The skipped entry's own chunk set stops queueing requests: its
    // edges can never execute, so they must never become requested
    // specifiers.
    const skippedChunk = build.entryChunks.get(spec);
    if (skippedChunk !== undefined) {
      (build.skippedChunkIds ??= new Set()).add(skippedChunk);
    }
    const list = this.excludedByRoot.get(build.dep.name) ?? [];
    list.push({ entry: spec, file, specifier, reason });
    this.excludedByRoot.set(build.dep.name, list);
    console.warn(
      `  [unit-producer] ${build.dep.name}: entry "${spec}" ` +
        `skipped — its closure cannot load in a production ` +
        `browser runtime: ${reason}`
    );
    build.entryFiles.delete(spec);
    build.entryChunks.delete(spec);
    for (const chunk of build.chunks) {
      if (chunk.answers.includes(spec)) {
        chunk.answers = chunk.answers.filter((a) => a !== spec);
      }
    }
  }

  // ── Chunk computation ────────────────────────────────────────────

  /**
   * The package's chunk set: `exports` subpaths plus side-effect-free
   * barrel members as one Rollup split build — boundaries and bytes
   * from the package's own complete entry set. Cached per
   * `package@version` on the build machine when `cacheDir` is set
   *  (build speed only): the cache stores raw outputs and edge
   * records; byte-shaping always runs.
   */
  private static defaultParallelism(): number {
    return Math.max(1, Math.min(4, os.availableParallelism()));
  }

  // @cpt-algo:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1
  private async computeChunks(
    dep: ResolvedSharedDep,
    onError: (message: string) => never
  ): Promise<ComputedPackage> {
    // @cpt-begin:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-determine-chunks
    const stageTimer = this.options.stageTimer;
    const cache =
      this.options.cacheDir !== undefined
        ? new PackageBuildCache(this.options.cacheDir)
        : undefined;
    // The key is a content hash of every input of the cached raw
    // Rollup output, never a version label: the package's files, the
    // files of the packages its build reads, the producer's own built
    // code, the toolchain versions and the fixed settings text.
    // @cpt-begin:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-key-build-cache
    // @cpt-begin:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-cache-key-inputs
    const fingerprint =
      cache !== undefined
        ? this.contentFingerprints.of(
            dep.packageDir,
            `${ProducerCacheFingerprint.forProcess()}\n` +
              ProducerCacheFingerprint.dependencyFingerprints(dep, this.contentFingerprints)
          )
        : undefined;
    // @cpt-end:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-cache-key-inputs
    // @cpt-end:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-key-build-cache
    const loadCached = () => cache?.load(dep.name, dep.version, fingerprint!);
    const cached = stageTimer !== undefined
      ? stageTimer.measure('cache-read', loadCached)
      : loadCached();
    this.cacheReport.record(
      dep.name,
      dep.version,
      cache === undefined ? 'disabled' : cached !== undefined ? 'hit' : 'miss'
    );
    if (cached !== undefined) {
      cached.build = PortableCacheRecord.located(cached.build, dep);
      this.respellLedger(dep).restoreOrigins(cached.build.respells ?? []);
      const chunks = cached.build.chunks.map((r) => this.chunkFromCache(cached.chunkDir, dep, r));
      const build: PackageChunks = {
        dep,
        chunks,
        buildInputs: cached.build.inputs,
        entryChunks: new Map(
          Object.entries(cached.build.entryChunks)
        ),
        entryFiles: new Map(
          Object.entries(cached.build.entries ?? {})
        ),
        barrelNotes: cached.build.barrelNotes,
        entrySpecifiers: cached.build.entrySpecifiers,
        pendingPeers: cached.build.deferredEntries ?? [],
      };
      this.assignAnswers(build);
      return { build, excluded: cached.build.excludedEntries ?? [] };
    }

    // The cached computation is the complete package-determined result
    // The entry set is screened for what can never load in a
    // production browser runtime — but NOT against this run's skip
    // index. An entry skipped only because another package was skipped
    // is run state: it is screened per run after loading by
    // `screenNewBuild`/`propagateSkips`, so a later build that no longer
    // skips the cause finds the entry still in the cache.
    const computeEntrySet = () => PackageEntrySet.compute({
      name: dep.name,
      packageDir: dep.packageDir,
      resolveDir: dep.resolveDir,
      version: dep.version,
      pkg: dep.pkg,
    });
    // @cpt-begin:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-package-own-entry-set
    const entrySet = stageTimer !== undefined
      ? await stageTimer.measureAsync('entry-set-computation', computeEntrySet)
      : await computeEntrySet();
    // @cpt-end:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-package-own-entry-set
    for (const excluded of entrySet.excludedEntries) {
      console.warn(
        `  [unit-producer] ${dep.name}: entry "${excluded.entry}" ` +
          `excluded — its closure cannot load in a production browser ` +
          `runtime: ${excluded.reason}`
      );
    }
    for (const r of entrySet.runtimeRequires) {
      console.warn(
        `  [unit-producer] ${dep.name}: entry "${r.entry}" keeps a ` +
          `runtime require(${r.expression}) in ${r.via} — not ` +
          `statically resolvable, stays a runtime require`
      );
    }
    if (entrySet.entries.size === 0) {
      return { build: undefined, excluded: entrySet.excludedEntries };
    }

    const key = UnitFileNaming.packageKey(dep.name, dep.version);
    const outdir = path.join(this.staging(), key);
    fs.mkdirSync(outdir, { recursive: true });
    // Entry files are resolved to real paths, but Rollup must see
    // the install path (through the symlink) so `preserveSymlinks`
    // keeps `node_modules/…` module text identical to a real-copy
    // layout.
    const installPathOf = (file: string): string =>
      file.startsWith(dep.packageDir + path.sep) &&
      dep.installDir !== dep.packageDir
        ? dep.installDir + file.slice(dep.packageDir.length)
        : file;
    const files = [...new Set(entrySet.entries.values())].filter(
      (f) =>
        !f.endsWith('.d.ts') && !f.endsWith('.d.cts') && !f.endsWith('.d.mts')
    );
    // `.js`/`.mjs`/`.cjs` files in one dir collide on one output
    // stem. Only true twins — the same file reached more than
    // once — dedupe (the Set above); distinct modules sharing a stem
    // are all kept: the ESM-preferred file (what the exports map's
    // import conditions resolve) holds the canonical stem and each
    // further file emits under a deterministic `-twin-N` output name,
    // so no entry is dropped.
    const byStem = new Map<string, string[]>();
    for (const f of files.map(installPathOf).sort()) {
      const stem = f.replace(/\.(js|mjs|cjs|jsx|ts|mts|cts|tsx)$/, '');
      const group = byStem.get(stem) ?? [];
      group.push(f);
      byStem.set(stem, group);
    }
    const extRank = (f: string): number => (f.endsWith('.cjs') ? 1 : 0);
    const input: Record<string, string> = {};
    const outnameOf = new Map<string, string>();
    for (const [stem, group] of byStem) {
      const ordered = [...group].sort(
        (a, b) => extRank(a) - extRank(b) || (a < b ? -1 : 1)
      );
      ordered.forEach((f, i) => {
        const out = `${path
          .relative(dep.installDir, stem)
          .split(path.sep)
          .join('/')}${i === 0 ? '' : `-twin-${i}`}`;
        input[out] = f;
        outnameOf.set(f, out);
      });
    }
    try {
      const result = await this.bundler.build({
        dep,
        input,
        outdir,
        transformModule: this.memberRespell(dep),
        quiet: dep.transitive,
        stageTimer,
      });
      const chunks: ChunkRecord[] = result.chunks.map((c) => ({
        id: c.id,
        file: c.file,
        namePath: c.namePath,
        entryPoint: c.entryPoint,
        modulePaths: c.modulePaths,
        externalEdges: c.externalEdges,
        internalEdges: c.internalEdges,
        isCjsEntry: c.isCjsEntry,
        location: '',
        contentHash: '',
        answers: [],
      }));
      const byEntryPoint = new Map<string, ChunkRecord>();
      const byFileName = new Map(chunks.map((c) => [c.id, c]));
      for (const chunk of chunks) {
        if (chunk.entryPoint !== undefined) {
          byEntryPoint.set(chunk.entryPoint, chunk);
        }
      }
      const entryChunks = new Map<string, string>();
      for (const [spec, file] of entrySet.entries) {
        const install = installPathOf(file);
        const out = outnameOf.get(install);
        const byName =
          out !== undefined ? byFileName.get(`${out}.js`) : undefined;
        const real = fs.existsSync(file) ? fs.realpathSync(file) : file;
        const chunk =
          byName ?? byEntryPoint.get(file) ?? byEntryPoint.get(real);
        if (chunk !== undefined) entryChunks.set(spec, chunk.id);
      }
      const storeCached = () => cache?.store(
        dep.name,
        dep.version,
        fingerprint!,
        // @cpt-begin:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-cache-record-portable
        PortableCacheRecord.portable(
          this.cacheManifest(
            chunks,
            entryChunks,
            entrySet,
            result.inputModuleIds,
            this.respellLedger(dep)
          ),
          dep
        ),
        // @cpt-end:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-cache-record-portable
        outdir
      );
      if (stageTimer !== undefined) {
        stageTimer.measure('cache-write', storeCached);
      } else {
        storeCached();
      }
      const build: PackageChunks = {
        dep,
        chunks,
        buildInputs: result.inputModuleIds,
        entryChunks,
        entryFiles: new Map(entrySet.entries),
        barrelNotes: entrySet.barrelNotes,
        entrySpecifiers: [...entrySet.entries.keys()].sort(),
        pendingPeers: entrySet.deferredEntries,
      };
      this.assignAnswers(build);
      return { build, excluded: entrySet.excludedEntries };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return onError(
        `[unit-producer] chunking shared package "${dep.name}" failed: ${reason}`
      );
    }
    // @cpt-end:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-determine-chunks
  }

  /**
   * Bare specifiers `build`'s package requires only inside
   * `try`/`catch`: every literal `require()` site of the specifier in
   * the package's owned modules is optional, so the specifier is a
   * runtime-optional require that never enters the delivered closure
     * A specifier with any non-optional load edge is a real
   * dependency under bundler parity.
   */
  private optionalExternalsOf(build: PackageChunks | undefined): Set<string> {
    if (build === undefined) return new Set();
    if (build.optionalExternals !== undefined) return build.optionalExternals;
    const optional = new Set<string>();
    const required = new Set<string>();
    for (const rel of new Set(build.chunks.flatMap((c) => c.modulePaths))) {
      const file = path.join(build.dep.packageDir, rel);
      let source: string;
      try {
        source = fs.readFileSync(file, 'utf-8');
      } catch {
        continue;
      }
      const edges = ModuleLinkageScanner.loadEdges(source, rel);
      if (edges === undefined) continue;
      for (const r of edges.requireCalls) {
        if (!SharedSpecifierMatcher.isBareModuleSpecifier(r.specifier)) continue;
        (r.optional ? optional : required).add(r.specifier);
      }
    }
    build.optionalExternals = new Set(
      [...optional].filter((s) => !required.has(s))
    );
    return build.optionalExternals;
  }

  /**
   * Records a package's screen-excluded entries in the reporting map
   * and the transitive-skip index.
   */
  private recordExcluded(
    dep: ResolvedSharedDep,
    excluded: readonly ExcludedEntry[]
  ): void {
    if (excluded.length === 0) return;
    const list = this.excludedByRoot.get(dep.name) ?? [];
    for (const e of excluded) {
      list.push(e);
      this.skipped.add(e.entry, e.file, e.reason);
    }
    this.excludedByRoot.set(dep.name, list);
  }

  /**
   * The member respelling applied inside a shared package's own Rollup
   * builds: `import { X } from 'barrel-pkg'` in a package module moves
   * to the member specifier `pkg/<module-path>` when the imported
   * package's barrel is splittable under the standard `sideEffects`
   * semantics — the rewrite applies to shared-package importers, so the
   * chunk's external edge names the member chunk, never the whole
   * root entry. The consumer-transform machinery answers per binding
   * exactly as it does for consumer code; bypassed barrels keep their
   * original specifier.
   */
  private memberRespell(
    dep: ResolvedSharedDep
  ): (code: string, id: string) => Promise<{ code: string; rewrites: number } | null> {
    let transform = this.memberRespells.get(dep.name);
    if (transform === undefined) {
      transform = new ConsumerBarrelRewriteTransform({
        resolver: new ConsumerBarrelResolver({
          // Bare specifiers inside the package resolve from its
          // install location — the same view the closure walk uses.
          packageRoot: dep.installDir,
          // Every package a shared package imports is shared by the
          // closure rule; unlocatable or unsplittable ones classify as
          // bypass and keep their specifier.
          isShared: () => true,
          entryResolver: this.entryFileResolver,
        }),
        ledger: this.respellLedger(dep),
      });
      this.memberRespells.set(dep.name, transform);
    }
    const rewrite = transform;
    return (code, id) => rewrite.transform(code, id);
  }

  /**
   * A member respell stands only when the unit answering the member
   * specifier exports every name the importing package takes from it —
   * the rule {@link ConsumerBarrelFallback} applies to consumer code,
   * here applied to a shared package's own chunks before they are
   * shaped. A nested barrel's entry chunk answers the module paths of
   * the modules it holds but exports only its own names, so a binding
   * respelled to such a module is turned back to the barrel specifier
   * it was written with. Decided against the package-determined chunk
   * set only, so the result never depends on which consumer asked.
   * Returns whether any respell was turned back.
   */
  private keepUnansweredRespells(
    builds: ReadonlyMap<string, PackageChunks>,
    queue: Array<{ specifier: string; importer?: ResolvedSharedDep }>
  ): boolean {
    let turnedBack = false;
    for (const build of builds.values()) {
      const ledger = this.respellLedgers.get(build.dep.name);
      if (ledger === undefined) continue;
      const unanswered = new Set<string>();
      for (const target of ledger.targets()) {
        if (build.turnedBackRespells?.has(target)) continue;
        const targetBuild = builds.get(SharedSetResolver.extractRootPackageName(target));
        if (targetBuild === undefined || targetBuild === build) continue;
        const answering = UnitProducer.entriesLast(
          targetBuild.chunks.filter((c) => !c.consumerOnly)
        ).find((c) => c.answers.includes(target));
        if (answering === undefined) continue;
        const reason = ConsumerBarrelFallback.missingExport(
          this.exportSurface(targetBuild.dep, answering),
          [...ledger.bindingsOf(target).keys()],
          target
        );
        if (reason !== undefined) unanswered.add(target);
      }
      if (unanswered.size === 0) continue;
      this.turnBackRespells(build, ledger, unanswered, queue);
      build.turnedBackRespells = new Set([...(build.turnedBackRespells ?? []), ...unanswered]);
      turnedBack = true;
    }
    return turnedBack;
  }

  /**
   * Turns every import of a `targets` specifier in `build`'s chunks
   * back to the barrel specifier and barrel name it was written with,
   * and swaps the chunk's external edge for the barrel's.
   */
  private turnBackRespells(
    build: PackageChunks,
    ledger: ConsumerBarrelRewriteLedger,
    targets: ReadonlySet<string>,
    queue: Array<{ specifier: string; importer?: ResolvedSharedDep }>
  ): void {
    for (const chunk of build.chunks) {
      if (!chunk.externalEdges.some((e) => targets.has(e.specifier))) continue;
      const source = fs.readFileSync(chunk.file, 'utf-8');
      const { code, reverts } = ConsumerBarrelFallback.revert(source, targets, ledger, chunk.id);
      if (reverts > 0) fs.writeFileSync(chunk.file, code, 'utf-8');
      const edges = new Map<string, { specifier: string; kind: string }>();
      for (const edge of chunk.externalEdges) {
        const origins = targets.has(edge.specifier)
          ? [...ledger.bindingsOf(edge.specifier).values()].map((o) => o.barrelSpecifier)
          : [edge.specifier];
        for (const specifier of origins) {
          edges.set(`${edge.kind}:${specifier}`, { specifier, kind: edge.kind });
          if (targets.has(edge.specifier)) queue.push({ specifier, importer: build.dep });
        }
      }
      chunk.externalEdges = [...edges.values()];
    }
  }

  /**
   * The names the chunk's unit will export once shaped — its text with
   * the module interface exposed and member names restored — or
   * `undefined` when not statically known.
   */
  private exportSurface(dep: ResolvedSharedDep, chunk: ChunkRecord): string[] | undefined {
    const text = fs.readFileSync(chunk.file, 'utf-8');
    try {
      return UnitExportNames.of(
        restoreMemberNames(`${text}${this.interfaceAdditions(chunk, dep, text)}`),
        chunk.id
      );
    } catch {
      return undefined;
    }
  }

  /** The origins of the imports `dep`'s own builds respelled. */
  private respellLedger(dep: ResolvedSharedDep): ConsumerBarrelRewriteLedger {
    let ledger = this.respellLedgers.get(dep.name);
    if (ledger === undefined) {
      ledger = new ConsumerBarrelRewriteLedger();
      this.respellLedgers.set(dep.name, ledger);
    }
    return ledger;
  }

  /** A cache record back into a chunk record (bytes under `chunkDir`). */
  private chunkFromCache(
    chunkDir: string,
    dep: ResolvedSharedDep,
    r: CachedChunkRecord
  ): ChunkRecord {
    // The cache keeps pristine pre-patch bytes: shape a copy staged
    // for this run — never the cached file. Byte-shaping is not
    // idempotent (interop text patching, identifier mangling), so a
    // consumer served from a cache its predecessor already shaped
    // would mint different bytes for identical content.
    const key = UnitFileNaming.packageKey(dep.name, dep.version);
    const staged = path.join(this.staging(), key, r.id);
    fs.mkdirSync(path.dirname(staged), { recursive: true });
    fs.copyFileSync(path.join(chunkDir, r.id), staged);
    return {
      id: r.id,
      file: staged,
      namePath: r.namePath,
      entryPoint: r.entryPoint,
      modulePaths: r.modulePaths,
      externalEdges: r.externalEdges,
      internalEdges: r.internalEdges,
      isCjsEntry: r.isCjsEntry,
      location: '',
      contentHash: '',
      answers: [],
    };
  }

  private cacheManifest(
    chunks: ChunkRecord[],
    entryChunks: Map<string, string>,
    entrySet: {
      entries: Map<string, string>;
      barrelNotes: BarrelNote[];
      excludedEntries: ExcludedEntry[];
      deferredEntries: ExcludedEntry[];
    },
    inputModuleIds: string[],
    respells: ConsumerBarrelRewriteLedger
  ): CachedPackageBuild {
    return {
      chunks: chunks.map((c) => ({
        id: c.id,
        namePath: c.namePath,
        entryPoint: c.entryPoint,
        modulePaths: c.modulePaths,
        externalEdges: c.externalEdges,
        internalEdges: c.internalEdges,
        isCjsEntry: c.isCjsEntry,
      })),
      entryChunks: Object.fromEntries(entryChunks),
      entries: Object.fromEntries(entrySet.entries),
      excludedEntries: entrySet.excludedEntries,
      deferredEntries: entrySet.deferredEntries,
      barrelNotes: entrySet.barrelNotes,
      entrySpecifiers: [...entrySet.entries.keys()].sort(),
      inputs: inputModuleIds,
      respells: respells.originRecords(),
    };
  }

  /**
   * Computes every chunk's `answers` — the specifiers that resolve to
   * its entry or its owned modules. Pure derivation over `entryChunks`,
   * `entryPoint` and `modulePaths`: no byte-shaping, so it runs when
   * the chunk set is computed — coverage decisions
   * ({@link coverRequested}) need the answers long before the
   * stabilized closure lets {@link shapeChunks} fix the bytes.
   *
   * A chunk answers every specifier that resolves to its
   * entry file — all exports-map subpaths/conditions applicable to
   * browser production builds (each `entryChunks` specifier), not
   * only the first spelling — plus the direct in-package path where
   * deep imports are allowed (no `exports` map restricting subpaths).
   */
  private assignAnswers(build: PackageChunks): void {
    const dep = build.dep;
    const entrySpecsByChunk = new Map<string, string[]>();
    for (const [spec, id] of build.entryChunks) {
      const list = entrySpecsByChunk.get(id) ?? [];
      list.push(spec);
      entrySpecsByChunk.set(id, list);
    }
    const deepImportsAllowed = dep.pkg.exports === undefined || dep.pkg.exports === null;
    // A module-path specifier is answered exactly once: consolidated
    // or supplementary importers can hold a module's bytes alongside
    // its primary owner. Per module, ownership goes to the chunk
    // whose entry point IS that module file — it is emitted whenever
    // the specifier is requested — else to the first owner in a
    // stable order: main chunks before supplementary ones (a
    // supplementary item is emitted only for the consumer whose
    // specifier built it, so it can never be the sole answer).
    const order = [
      ...build.chunks.filter((c) => !c.supplementary),
      ...build.chunks.filter((c) => c.supplementary),
    ];
    const entryByModule = new Map<string, (typeof order)[number]>();
    for (const chunk of order) {
      if (chunk.entryPoint === undefined) continue;
      const rel = path
        .relative(dep.packageDir, chunk.entryPoint)
        .split(path.sep)
        .join('/');
      if (rel !== '' && !rel.startsWith('..') && !entryByModule.has(rel)) {
        entryByModule.set(rel, chunk);
      }
    }
    const moduleOwner = new Map<string, (typeof order)[number]>();
    for (const chunk of order) {
      for (const m of chunk.modulePaths) {
        if (!moduleOwner.has(m)) moduleOwner.set(m, chunk);
      }
    }
    for (const [m, entry] of entryByModule) {
      // The entry chunk (a real entry, or a stub facade whose bytes
      // folded into a shared holder) claims its module's specifier —
      // it is the chunk the specifier resolves to, so the holder
      // answers only its own owned modules and never an unrequested
      // barrel-member deep path. A stub no list reaches is
      // published on the package's root list in `emitLists`, so its
      // entry-set specifier is still answered by an emitted item; the
      // override is safe because the stub is delivered.
      moduleOwner.set(m, entry);
    }
    // Owned modules per chunk — the entry chunk of a module file
    // claims it even when the module's bytes folded elsewhere.
    const ownedModules = new Map<(typeof order)[number], string[]>();
    for (const [m, owner] of moduleOwner) {
      const list = ownedModules.get(owner) ?? [];
      list.push(m);
      ownedModules.set(owner, list);
    }
    const taken = new Set<string>();
    for (const chunk of order) {
      const answers = new Set<string>();
      for (const spec of entrySpecsByChunk.get(chunk.id) ?? []) {
        answers.add(spec);
      }
      // The direct in-package path of the entry file itself, where
      // deep imports are allowed.
      if (chunk.entryPoint !== undefined && deepImportsAllowed) {
        const rel = path
          .relative(dep.packageDir, chunk.entryPoint)
          .split(path.sep)
          .join('/');
        if (rel !== '' && !rel.startsWith('..')) {
          answers.add(`${dep.name}/${rel}`);
        }
      }
      // Every module-path specifier the chunk's OWNED modules answer
      // — only the per-module owner claims them (deep-path
      // spellings included). A stub facade that claimed a module
      // keeps the holder from answering its member deep path, so a
      // barrel member no list requests stays unanswered; the
      // stub is published on the root list in `emitLists` so the
      // entry-set specifier is still answered by an emitted item.
      if (!chunk.isCjsEntry) {
        for (const spec of this.moduleSpecifierAnswers(
          dep,
          ownedModules.get(chunk) ?? []
        )) {
          if (!taken.has(spec)) answers.add(spec);
        }
      }
      for (const spec of answers) taken.add(spec);
      chunk.answers = [...answers].sort();
    }
  }

  /**
   * Byte-shaping: internal chunk references are rewritten to the
   * target chunk's content-named basename, the public module
   * interface is exposed — then the content hash fixes location. Runs
   * once, after the dependency closure has stabilized;
   * `answers` were already fixed by {@link assignAnswers}.
   */
  private async shapeChunks(
    build: PackageChunks,
    cjsSpecifiers: ReadonlySet<string>
  ): Promise<void> {
    void cjsSpecifiers;
    const dep = build.dep;
    const key = UnitFileNaming.packageKey(dep.name, dep.version);
    const byId = new Map(build.chunks.map((c) => [c.id, c]));
    const relSpec = (fromId: string, toName: string): string => {
      const rel = path.posix.relative(path.posix.dirname(fromId), toName);
      return rel.startsWith('.') ? rel : `./${rel}`;
    };
    const shape = async (chunk: ChunkRecord): Promise<void> => {
      // Internal chunk references carry the bundler's internal hash
      // names — build-environment text. Rewrite each to the target
      // chunk's content-named basename: item locations are flat under
      // `<pkg>@<version>/`, so the specifier the runtime resolves is
      // `./<namePath>.<contentHash>.js`.
      let source = fs.readFileSync(chunk.file, 'utf-8');
      let dirty = false;
      for (const edge of chunk.internalEdges) {
        const target = byId.get(edge.id);
        if (target === undefined) continue;
        const emitted = relSpec(chunk.id, edge.id);
        const deterministic =
          target.contentHash === ''
            ? `./${target.namePath}.js`
            : `./${target.namePath}.${target.contentHash}.js`;
        if (emitted === deterministic) continue;
        const next = source.split(`"${emitted}"`).join(`"${deterministic}"`);
        if (next !== source) {
          source = next;
          dirty = true;
        }
      }
      if (dirty) fs.writeFileSync(chunk.file, source, 'utf-8');
      this.exposeModuleInterface(chunk, dep);
      // Restore member names on the emitted file after
      // `exposeModuleInterface` — facade `export{...}` lines appended
      // there can lose member names; `generateBundle` output hooks
      // never see them.
      {
        const src = fs.readFileSync(chunk.file, 'utf-8');
        const fixed = restoreMemberNames(src);
        if (fixed !== src) fs.writeFileSync(chunk.file, fixed, 'utf-8');
      }

      const hash = ContentHasher.ofFile(chunk.file);
      if (hash === undefined) {
        throw new Error(
          `[unit-producer] content hash unavailable for "${chunk.file}"`
        );
      }
      chunk.contentHash = hash;
      chunk.location = UnitFileNaming.chunkLocation(key, chunk.namePath, hash);
    };

    // Internal edge targets shape before their importers (leaves
    // first): the importer's emitted specifier carries the target's
    // content hash. Cyclic leftovers shape in record order — an
    // unhashed target keeps the deterministic `<namePath>.js`
    // spelling until the resync pass below.
    const pending = new Set(build.chunks);
    while (pending.size > 0) {
      let advanced = false;
      for (const chunk of [...pending]) {
        const blocked = chunk.internalEdges.some((edge) => {
          const target = byId.get(edge.id);
          return (
            target !== undefined && target !== chunk && pending.has(target)
          );
        });
        if (blocked) continue;
        pending.delete(chunk);
        advanced = true;
        await shape(chunk);
      }
      if (!advanced) {
        const chunk = pending.values().next().value!;
        pending.delete(chunk);
        await shape(chunk);
      }
    }
    // Cyclic leftovers cannot carry a content hash in their
    // specifiers — rewriting one file changes its hash and
    // invalidates the partner's spec forever. A chunk reached
    // through an unhashed `./<namePath>.js` specifier additionally
    // publishes at that deterministic spelling: the hashed location
    // stays canonical for every hashed reference while the cyclic
    // partner's unhashed specifier resolves to the alias.
    for (const chunk of build.chunks) {
      const text = fs.readFileSync(chunk.file, 'utf-8');
      for (const edge of chunk.internalEdges) {
        const target = byId.get(edge.id);
        if (
          target !== undefined &&
          text.includes(`"./${target.namePath}.js"`)
        ) {
          const alias = `${key}/${target.namePath}.js`;
          (target.publishAliases ??= []).push(alias);
        }
      }
    }
  }

  /**
   * A non-entry chunk answering a module-path specifier must expose
   * that module's public export surface: `import x from 'pkg/mod'`
   * and `import { A } from 'pkg/mod'` rewrite to blob imports that
   * need the module's own export names. Rollup names a
   * shared chunk's exports after the module's LOCAL bindings
   * (`export{<b> as <local>}`), so `export { y as Empty }` reaches
   * consumers as `y` — every public name is re-exported from its
   * binding. Only a single-module chunk has an unambiguous surface;
   * `export default`/`X as default` maps to the `default` binding.
   */
  private exposeModuleInterface(
    chunk: ChunkRecord,
    dep: ResolvedSharedDep
  ): void {
    const text = fs.readFileSync(chunk.file, 'utf-8');
    const additions = this.interfaceAdditions(chunk, dep, text);
    if (additions !== '') fs.writeFileSync(chunk.file, `${text}${additions}`, 'utf-8');
  }

  /**
   * The `export{…};` line {@link exposeModuleInterface} appends to the
   * chunk's `text`; `''` when the chunk needs none.
   */
  private interfaceAdditions(
    chunk: ChunkRecord,
    dep: ResolvedSharedDep,
    text: string
  ): string {
    if (chunk.entryPoint !== undefined || chunk.isCjsEntry) return '';
    // module-local name → public export name, over every module in
    // the chunk: `export { y as Empty }` → y→Empty; `X as default` →
    // X→default; `export const C` → C→C; `export default ...` →
    // default→default. A local name two modules export is ambiguous —
    // Rollup emits it once — so those locals are skipped.
    const exposed = new Map<string, string>();
    const ambiguous = new Set<string>();
    for (const modulePath of chunk.modulePaths) {
      let source: string;
      try {
        source = fs.readFileSync(path.join(dep.packageDir, modulePath), 'utf-8');
      } catch {
        continue;
      }
      const locals = new Set<string>();
      const offer = (local: string, pub: string): void => {
        if (!locals.has(local)) locals.add(local);
        if (locals.has(local) && !ambiguous.has(local)) {
          if (exposed.has(local) && exposed.get(local) !== pub) {
            // Two modules export the same local name under different
            // public names — Rollup renames all but the first
            // module's export, so the earlier claim stands and the
            // later one is skipped for this local only.
            ambiguous.add(local);
            return;
          }
          exposed.set(local, pub);
        }
      };
      for (const member of ExportClauseMembers.of(source)) {
        offer(member.local, member.exported);
      }
      for (const m of source.matchAll(
        /export\s+(?:const|let|var|function\s*\*?|class)\s+([\w$]+)/g
      )) {
        offer(m[1], m[1]);
      }
      if (/export\s+default\b/.test(source)) offer('default', 'default');
    }
    if (exposed.size === 0) return '';
    // Chunk export names → bindings: `export{<b> as <local>}` and
    // bare `export{<b>}` (binding doubles as the export name).
    const bindingOf = new Map<string, string>();
    for (const member of ExportClauseMembers.of(text)) {
      bindingOf.set(member.exported, member.local);
    }
    const additions: string[] = [];
    for (const [local, pub] of exposed) {
      if (bindingOf.has(pub)) continue;
      const binding = bindingOf.get(local);
      if (binding !== undefined && pub !== local) {
        additions.push(`${binding} as ${pub}`);
      }
    }
    return additions.length === 0 ? '' : `export{${additions.join(',')}};\n`;
  }

  /**
   * Requested specifiers no chunk answers (a deep path outside every
   * entry's reach) get a single-entry split build of their own —
   * appended to the package's chunk set, unshaped: byte-shaping runs
   * once over every chunk of every package after the dependency
   * closure has stabilized, so a supplementary chunk's CJS-dependency
   * patch sees the final CJS specifier set.
   */
  private async coverRequested(
    build: PackageChunks,
    specs: ReadonlySet<string>,
    consumerSpecifiers: ReadonlySet<string>,
    queue: Array<{ specifier: string; importer?: ResolvedSharedDep }>,
    onError: (message: string) => never
  ): Promise<void> {
    const dep = build.dep;
    const answered = new Set(build.chunks.flatMap((c) => c.answers));
    const key = UnitFileNaming.packageKey(dep.name, dep.version);
    // Modules the chunk set already owns stay out of every
    // supplementary build — no module in two chunks.
    const owned = new Set(build.chunks.flatMap((c) => c.modulePaths));
    for (const spec of [...specs].sort()) {
      // A skipped entry never gets supplementary coverage. Whether a
      // runtime actually imports it is decided after the closure
      // stabilizes — a specifier reached only through a skipped
      // entry's dead chunks is never a failure; a
      // live request still fails at the emit gate, naming entry and
      // reason.
      if (this.skipped.forSpecifier(spec) !== undefined) continue;
      let file = await this.entryFileResolver.resolve(spec, dep.resolveDir);
      // A minted module-path specifier `<pkg>/<rel>` resolves by file
      // existence inside its own package — exports maps do not gate
      // the spelling the producer itself emits (member rewrites and
      // deep-path answers carry it). When the exports-gated resolver
      // misses it, the file check is the resolver's own answer.
      if (file === undefined && spec.startsWith(`${dep.name}/`)) {
        const candidate = path.join(
          dep.packageDir,
          spec.slice(dep.name.length + 1)
        );
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          file = fs.realpathSync(candidate);
        }
      }
      // List completeness: a requested specifier nothing can
      // resolve is a build failure — never a skipped entry.
      if (file === undefined) {
        onError(
          `[unit-producer] shared specifier "${spec}" cannot be resolved ` +
            `from ${dep.resolveDir}`
        );
      }
      // The specifier resolves to a file the complete entry set
      // already builds — answer it with that chunk; a supplementary
      // build would mint a chunk only this consumer has.
      const realFile = fs.realpathSync(file!);
      const owning = build.chunks.find(
        (c) => c.entryPoint === file! || c.entryPoint === realFile
      );
      if (owning !== undefined) {
        owning.answers = [...new Set([...owning.answers, spec])].sort();
        build.entryChunks.set(spec, owning.id);
        answered.add(spec);
        continue;
      }
      // A spec already answered by an emitted chunk needs no
      // supplementary coverage; an entry's own specifier claims the
      // entry regardless, so this check sits after the owning check.
      if (answered.has(spec)) continue;
      const outdir = path.join(this.staging(), key, '.extra');
      fs.mkdirSync(outdir, { recursive: true });
      // `file` is realpath'd above; the install root must be too —
      // under a symlinked tree (e.g. /tmp on macOS) a non-real
      // packageDir makes `path.relative` escape with `..` segments,
      // which are illegal in an output file name.
      const installReal = fs.realpathSync(dep.installDir);
      const relKey = path
        .relative(installReal, realFile)
        .split(path.sep)
        .join('/')
        .replace(/\.(js|mjs|cjs|jsx|ts|mts|cts|tsx)$/, '');
      const result = await this.bundler.build({
        dep,
        input: { [`x/${relKey}`]: file! },
        outdir,
        externalizeModules: owned,
        transformModule: this.memberRespell(dep),
      });
      const extra: ChunkRecord[] = result.chunks.map((c) => ({
        id: c.id,
        file: c.file,
        namePath: c.namePath,
        entryPoint: c.entryPoint,
        modulePaths: c.modulePaths,
        externalEdges: c.externalEdges,
        internalEdges: c.internalEdges,
        isCjsEntry: c.isCjsEntry,
        location: '',
        contentHash: '',
        answers: [],
      }));
      const entry = extra.find((c) => c.entryPoint !== undefined);
      // List completeness: a supplementary build producing no
      // entry chunk leaves the requested specifier unanswered — fail,
      // naming entry and specifier.
      if (entry === undefined) {
        onError(
          `[unit-producer] shared specifier "${spec}" of "${dep.name}" ` +
            `resolved to ${file} but the supplementary build emitted ` +
            `no entry chunk for it`
        );
      }
      for (const chunk of extra) {
        // Bundler parity: the supplementary build's external
        // edges re-enter the closure queue — delivered when
        // locatable, native when an optional peer, an error when
        // unlocatable.
        for (const edge of chunk.externalEdges) {
          queue.push({ specifier: edge.specifier, importer: dep });
        }
        // Extra chunks answer the module-path specifiers of the
        // modules they own, like any main-build chunk — other extra
        // builds externalize those modules back onto these answers.
        // Answers come from `assignAnswers`; the chunks stay unshaped
        // until the closure stabilizes.
        chunk.supplementary = true;
        chunk.consumerOnly = consumerSpecifiers.has(spec);
        for (const m of chunk.modulePaths) owned.add(m);
        build.chunks.push(chunk);
      }
      build.entryChunks.set(spec, entry!.id);
      this.assignAnswers(build);
      for (const chunk of extra) {
        for (const a of chunk.answers) answered.add(a);
      }
      answered.add(spec);
    }
  }

  /**
   * The specifiers a chunk's owned modules answer: each module-path
   * specifier `pkg/<rel>` plus every deep-path spelling an
   * exports-map pattern subpath gives the module (`'./*': './esm/*'`
   * spells `esm/x.mjs` as `x.mjs`) — the spellings a deep import or a
   * barrel member rewrite can carry.
   */
  private moduleSpecifierAnswers(
    dep: ResolvedSharedDep,
    modulePaths: readonly string[]
  ): string[] {
    const out = new Set<string>();
    for (const m of modulePaths) {
      out.add(`${dep.name}/${m}`);
      for (const spelling of PackageExportPatternExpander.spellingsForModule(
        dep.pkg.exports,
        m
      )) {
        out.add(`${dep.name}/${spelling}`);
      }
    }
    return [...out].sort();
  }

  // ── List emission ────────────────────────────────────────────────

  /** The list item a chunk contributes. */
  private itemOf(chunk: ChunkRecord): SharedDepUnit {
    // @cpt-begin:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-emit-units
    const imports: SharedDepImportEdge[] = [];
    for (const edge of chunk.externalEdges) {
      // Every bare import stays external: it is an edge, never inlined text.
      if (edge.kind !== 'dynamic') imports.push(edge.specifier);
    }
    return {
      location: chunk.location,
      contentHash: chunk.contentHash,
      answers: chunk.answers,
      imports,
    };
    // @cpt-end:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-emit-units
  }

  /**
   * Emits one fetch list per requested specifier: the flat item list
   * the entry's static edges reach across every package, plus lazy
   * delta lists (only what a literal `import()` target needs beyond
   * the parent list), pattern lists and opaque-import report entries.
   * Referenced chunks are published; nothing else reaches `dist`.
   */
  private emitLists(
    build: PackageChunks,
    specs: readonly string[],
    answerToItem: ReadonlyMap<string, string>,
    answerToRecord: ReadonlyMap<
      string,
      { build: PackageChunks; chunk: ChunkRecord }
    >,
    chunkByHash: ReadonlyMap<string, { build: PackageChunks; chunk: ChunkRecord }>,
    deliveredRoots: ReadonlySet<string>,
    onError: (message: string) => never
  ): { lists: Record<string, ProducedFetchList> } {
    const dep = build.dep;
    const lists: Record<string, ProducedFetchList> = {};
    const published = new Set<string>();
    // Internal edges resolve inside their own build only: outdir-relative
    // chunk ids collide across packages (`dist/index.js` in two builds),
    // so a global lookup could wire an edge to another package's chunk
    const idsByBuild = new Map<PackageChunks, Map<string, ChunkRecord>>();
    const byIdOf = (b: PackageChunks): Map<string, ChunkRecord> => {
      let m = idsByBuild.get(b);
      if (m === undefined) {
        m = new Map(b.chunks.map((c) => [c.id, c]));
        idsByBuild.set(b, m);
      }
      return m;
    };
    // Byte-identical chunks produced by more than one package's build
    // share a content identity but keep their own locations: a
    // chunk's relative specifiers resolve against the importing item's
    // location, so the item reached through a build's internal edge is
    // that build's own chunk. The canonical record
    // (`chunkByHash`) still answers every external (bare) edge.
    const localByHash = new Map(
      build.chunks.map((c) => [c.contentHash, c] as const)
    );
    const recordFor = (hash: string): { build: PackageChunks; chunk: ChunkRecord } | undefined => {
      const local = localByHash.get(hash);
      return local !== undefined ? { build, chunk: local } : chunkByHash.get(hash);
    };
    // Byte-identical chunks share one content identity but keep their
    // own answers: an entry specifier answered by one twin resolves to
    // the shared bytes, and the emitted item is whichever twin the
    // hash lookup returns first. The item therefore answers the union
    // of every same-identity chunk in its build — a specifier's answer
    // is the bytes, not the outname that carried them.
    const answersByHash = new Map<PackageChunks, Map<string, string[]>>();
    const answersOf = (b: PackageChunks, chunk: ChunkRecord): string[] => {
      let byHash = answersByHash.get(b);
      if (byHash === undefined) {
        byHash = new Map();
        for (const c of b.chunks) {
          if (c.contentHash === '') continue;
          const list = byHash.get(c.contentHash) ?? [];
          byHash.set(c.contentHash, list);
          for (const a of c.answers) {
            if (!list.includes(a)) list.push(a);
          }
          list.sort();
        }
        answersByHash.set(b, byHash);
      }
      return byHash.get(chunk.contentHash) ?? chunk.answers;
    };
    const publishTo = (file: string, location: string): void => {
      if (published.has(location)) return;
      published.add(location);
      // @cpt-begin:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-emit-content-addressed
      // The location carries the content hash (UnitFileNaming), and the file
      // is published under it.
      const dest = path.join(this.outputDir, location);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      // Copy, never move: another list's emit may still read the
      // staged file (classify), and the build-machine cache owns its
      // own copies.
      const tmp = `${dest}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
      fs.copyFileSync(file, tmp);
      ContentAddressedPublisher.publish(tmp, dest);
      // @cpt-end:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-emit-content-addressed
    };
    // @cpt-begin:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-include-referenced-chunks
    const publishChunk = (chunk: ChunkRecord): void => {
      publishTo(chunk.file, chunk.location);
      for (const alias of chunk.publishAliases ?? []) {
        publishTo(chunk.file, alias);
      }
    };
    // @cpt-end:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-include-referenced-chunks

    const context: ListEmitContext = {
      build,
      answerToItem,
      answerToRecord,
      chunkByHash,
      deliveredRoots,
      onError,
      recordFor,
      byIdOf,
      answersOf,
      publishChunk,
    };

    for (const spec of specs) {
      const hash = answerToItem.get(spec);
      // List completeness: a requested specifier with no
      // answering item fails the build naming entry and specifier —
      // a silently skipped entry leaves the consumer with a bare
      // specifier no minted chunk can answer.
      if (hash === undefined) {
        const skip = this.skipped.forSpecifier(spec);
        onError(
          `[unit-producer] requested specifier "${spec}" of ` +
            `"${dep.name}" has no answering chunk; no list can be ` +
            `emitted for it` +
            (skip !== undefined ? ` — skipped entry: ${skip}` : '')
        );
      }
      lists[spec] = this.emitList(
        context,
        [hash],
        new Set(),
        UnitFileNaming.namePathOf(spec),
        spec
      );
    }
    return { lists };
  }

  /**
   * Emits one fetch list: the items reachable from `seeds` beyond
   * `parentLocations`, with the lazy delta lists its dynamic edges seed.
   */
  private emitList(
    context: ListEmitContext,
    seeds: readonly (
      | string
      | { build: PackageChunks; chunk: ChunkRecord }
    )[],
    parentLocations: ReadonlySet<string>,
    entryPath: string,
    listSpec: string,
    parentAnswers: ReadonlySet<string> = new Set()
  ): ProducedFetchList {
    const { build, recordFor, byIdOf, answersOf, publishChunk, onError } = context;
    const dep = build.dep;
    // Items are keyed by location: the same content identity reached
    // through two builds' internal edges needs both locations —
    // each importer's emitted specifier resolves against its own
    // item's location.
    const items = new Map<string, SharedDepUnit>();
    const emitted = new Map<string, ChunkRecord>();
    const emittedHashes = new Set<string>();
    const patterns: Record<string, ProducedFetchList> = {};
    const opaqueImports: OpaqueImportReport[] = [];
    const lazySeeds = new LazyListSeeds<PackageChunks, ChunkRecord>();
    const seedLazy = (
      seedBuild: PackageChunks,
      chunk: ChunkRecord,
      key?: string
    ): void => lazySeeds.add(seedBuild, chunk, key);
    // Specifiers already answered by a delivered item: the parent
    // list's answers plus every answer claimed by items this emit
    // produces. An external edge dedupes only when its SPECIFIER is
    // answered — never on content identity or location alone: a
    // byte-identical twin or a same-hash item can carry different
    // answers, and dropping the answering item leaves the emitted
    // bare specifier resolvable only by a second-round fetch
    const answeredNow = new Set<string>(parentAnswers);
    const queue: Array<{ build: PackageChunks; chunk: ChunkRecord }> = [];
    const push = (
      entry: string | { build: PackageChunks; chunk: ChunkRecord }
    ): void => {
      const found = typeof entry === 'string' ? recordFor(entry) : entry;
      if (found === undefined && typeof entry === 'string') {
        // A seeded or reached content identity no chunk produced —
        // an internal inconsistency, never a skippable item.
        onError(
          `[unit-producer] list "${entryPath}" of "${dep.name}" ` +
            `references item ${entry}, but no emitted chunk carries ` +
            `that content identity`
        );
      }
      if (found !== undefined) queue.push(found);
    };
    const state: ListEmitState = {
      answeredNow,
      emittedHashes,
      parentLocations,
      seedLazy,
      push,
    };
    for (const seed of seeds) push(seed);
    if (listSpec === dep.name) {
      for (const stub of this.stubFacadeSeeds(context, seeds)) push(stub);
    }
    const seen = new Set<string>();
    while (queue.length > 0) {
      const found = queue.pop()!;
      const { chunk } = found;
      if (
        seen.has(chunk.location) ||
        parentLocations.has(chunk.location) ||
        emitted.has(chunk.location)
      ) continue;
      seen.add(chunk.location);
      const item = this.itemOf(chunk);
      item.answers = answersOf(found.build, chunk);
      for (const answer of item.answers) answeredNow.add(answer);
      // Internal static edges resolve to item references — inside
      // the chunk's own build.
      for (const edge of chunk.internalEdges) {
        const target = byIdOf(found.build).get(edge.id);
        if (target === undefined) continue;
        if (edge.kind === 'dynamic') {
          // @cpt-begin:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-lazy-key-location
          seedLazy(found.build, target);
          // @cpt-end:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-lazy-key-location
          continue;
        }
        item.imports.push({ unit: target.contentHash });
        if (!parentLocations.has(target.location)) {
          queue.push({ build: found.build, chunk: target });
        }
      }
      // @cpt-begin:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-list-units
      items.set(chunk.location, item);
      emitted.set(chunk.location, chunk);
      emittedHashes.add(chunk.contentHash);
      // @cpt-end:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-list-units
      // External specifiers the chunk carries: resolved via the
      // global answer map.
      this.followExternalEdges(context, state, item, chunk, entryPath);
      // Pattern and opaque imports, read from the emitted source.
      this.collectDynamicImports(dep, chunk, patterns, opaqueImports, onError);
      // The chunk is published after every read of its staged file.
      publishChunk(chunk);
    }
    this.addAliasUnits(items, emitted);
    const list: ProducedFetchList = {
      items: [...items.values()].sort((a, b) =>
        a.location < b.location ? -1 : a.location > b.location ? 1 : 0
      ),
      // Shared units are not the microfrontend's own code: a shared
      // package's list names no own chunk.
      ownChunks: [],
      ...(Object.keys(patterns).length > 0 ? { patterns } : {}),
      ...(opaqueImports.length > 0 ? { opaqueImports } : {}),
    };
    const lazy = this.emitLazyLists(
      context,
      lazySeeds,
      emitted,
      parentLocations,
      answeredNow
    );
    if (Object.keys(lazy).length > 0) {
      list.lazy = Object.fromEntries(
        Object.entries(lazy).sort(([a], [b]) => (a < b ? -1 : 1))
      );
    }
    this.checkRelativeSpecifiers(context, entryPath, emitted, list, parentLocations);
    return list;
  }

  /** The lazy delta lists of one list, keyed by every spelling their target answers to. */
  private emitLazyLists(
    context: ListEmitContext,
    lazySeeds: LazyListSeeds<PackageChunks, ChunkRecord>,
    emitted: ReadonlyMap<string, ChunkRecord>,
    parentLocations: ReadonlySet<string>,
    answeredNow: ReadonlySet<string>
  ): Record<string, ProducedFetchList> {
    const lazy: Record<string, ProducedFetchList> = {};
    // Lazy delta lists after the parent items are final. A delta
    // holds only what the target needs beyond the parent list —
    // dedup is by location: two byte-identical chunks at different
    // locations are different items (an importer's specifier
    // resolves to its own edge's location). The parent's emitted
    // locations stay valid references inside the delta's text.
    // A chunk's alias spellings are units of this list too, so a
    // target reaching a parent chunk through its alias finds it here.
    const deliveredNow = new Set([
      ...emitted.keys(),
      ...[...emitted.values()].flatMap((c) => c.publishAliases ?? []),
      ...parentLocations,
    ]);
    // @cpt-begin:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-emit-lazy-lists
    for (const seed of lazySeeds) {
      // @cpt-begin:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-lazy-delta
      const target = this.emitList(
        context,
        [seed],
        deliveredNow,
        `lazy-${seed.chunk.namePath}`,
        '',
        answeredNow
      );
      // @cpt-end:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-lazy-delta
      // The same list answers the alias spelling a cyclic importer
      // carries for the target.
      for (const key of LazyListSeeds.keysOf(seed)) lazy[key] = target;
    }
    // @cpt-end:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-emit-lazy-lists
    return lazy;
  }

  /**
   * The stub facades the root list also delivers: entries whose bytes
   * folded into a shared holder already reachable from `seeds`.
   */
  private stubFacadeSeeds(
    context: ListEmitContext,
    seeds: readonly (string | { build: PackageChunks; chunk: ChunkRecord })[]
  ): Array<{ build: PackageChunks; chunk: ChunkRecord }> {
    const { build, recordFor, byIdOf } = context;
    const dep = build.dep;
    const stubs: Array<{ build: PackageChunks; chunk: ChunkRecord }> = [];
    // Every entry-set specifier is answered by an item
    // delivered with the package's ROOT list (the list for the bare
    // package name, emitted only when the whole package is in scope).
    // A stub facade Rollup mints for an entry whose bytes folded into
    // a shared holder — and which the barrel facade imports past, so
    // no list reaches it — is seeded on the root list and published,
    // so its entry specifiers are answered by an emitted item instead
    // of going unanswered. The stub's holder must already be
    // reachable from the root list's seed (the barrel) through static
    // internal edges, so the seed never pulls in a closure the
    // barrel does not deliver. Consumer lists never seed stubs, so a
    // barrel-member stub no consumer imports stays unpublished and
    // its unrequested member deep path stays unanswered.
    const closureChunks = new Set<ChunkRecord>();
    const closureQueue: Array<{ build: PackageChunks; chunk: ChunkRecord }> = [];
    for (const seed of seeds) {
      const found = typeof seed === 'string' ? recordFor(seed) : seed;
      if (found !== undefined && !closureChunks.has(found.chunk)) {
        closureChunks.add(found.chunk);
        closureQueue.push(found);
      }
    }
    const closureModules = new Set<string>();
    while (closureQueue.length > 0) {
      const { build: cb, chunk } = closureQueue.pop()!;
      for (const m of chunk.modulePaths) closureModules.add(m);
      for (const edge of chunk.internalEdges) {
        if (edge.kind === 'dynamic') continue;
        const target = byIdOf(cb).get(edge.id);
        if (target !== undefined && !closureChunks.has(target)) {
          closureChunks.add(target);
          closureQueue.push({ build: cb, chunk: target });
        }
      }
    }
    for (const chunk of build.chunks) {
      if (chunk.entryPoint === undefined) continue;
      if (chunk.modulePaths.length !== 0) continue;
      if (chunk.supplementary === true) continue;
      if (chunk.consumerOnly === true) continue;
      const rel = path
        .relative(dep.packageDir, chunk.entryPoint)
        .split(path.sep)
        .join('/');
      if (rel === '' || rel.startsWith('..')) continue;
      if (!closureModules.has(rel)) continue;
      stubs.push({ build, chunk });
    }
    return stubs;
  }

  /**
   * Resolves the external specifiers a chunk carries into item references,
   * seeds the lazy targets of dynamic ones and queues the answering records.
   */
  private followExternalEdges(
    context: ListEmitContext,
    state: ListEmitState,
    item: SharedDepUnit,
    chunk: ChunkRecord,
    entryPath: string
  ): void {
    const { build, answerToItem, answerToRecord, chunkByHash, deliveredRoots, onError } = context;
    const dep = build.dep;
    // @cpt-begin:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-answer-every-import
    // External specifiers the chunk carries: resolved via the
    // global answer map. A literal `import('pkg/sub')` gets a lazy
    // list keyed by the bare specifier.
    for (const edge of chunk.externalEdges) {
      const target = answerToItem.get(edge.specifier);
      if (target === undefined) {
        // List completeness: a reached specifier of a
        // delivered package must have an answering item — a bare
        // specifier of one surviving in the emitted list leaves a
        // native import the browser cannot resolve. Specifiers of
        // packages outside the delivered set (built-ins, optional
        // peers, native-staying imports) keep their native edge.
        const edgeRoot = SharedSetResolver.extractRootPackageName(
          edge.specifier
        );
        if (!isBuiltin(edge.specifier) && deliveredRoots.has(edgeRoot)) {
          const skip = this.skipped.forSpecifier(edge.specifier);
          onError(
            `[unit-producer] list "${entryPath}" of "${dep.name}" ` +
              `reaches specifier "${edge.specifier}" through ` +
              `${chunk.location}, but no emitted item answers it` +
              (skip !== undefined ? ` — skipped entry: ${skip}` : '')
          );
        }
        continue;
      }
      const targetFound = chunkByHash.get(target);
      if (edge.kind === 'dynamic') {
        // Seed a lazy target whenever the specifier stays
        // unanswered — a byte-identical twin or same-hash item
        // delivered elsewhere does not bind this specifier, so a
        // location/hash check must never silence the seed.
        if (
          !state.answeredNow.has(edge.specifier) &&
          targetFound !== undefined
        ) {
          const lazyTarget =
            answerToRecord.get(edge.specifier) ?? targetFound;
          // @cpt-begin:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-lazy-key-bare
          state.seedLazy(lazyTarget.build, lazyTarget.chunk, edge.specifier);
          // @cpt-end:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-lazy-key-bare
        }
        continue;
      }
      // Every importer records the reference — deduping by
      // location must not drop a later importer's edge.
      item.imports.push({ unit: target });
      // The edge is covered only when its specifier resolves to an
      // already-delivered item AND the referenced content identity
      // is itself delivered. Both are required: an unanswered
      // specifier resolves late at runtime (a second fetch round),
      // and a dangling `{item}` reference mints nothing.
      const specAnswered = state.answeredNow.has(edge.specifier);
      const hashDelivered =
        state.emittedHashes.has(target) ||
        (targetFound !== undefined &&
          state.parentLocations.has(targetFound.chunk.location));
      if (specAnswered && hashDelivered) continue;
      // Emit the record that actually answers the specifier —
      // byte-identical twins share the hash but keep their own
      // answers, so the answering record is the only item whose
      // emission delivers this specifier's binding.
      state.push(answerToRecord.get(edge.specifier) ?? target);
    }
    // @cpt-end:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-answer-every-import
  }

  /**
   * A chunk inside an import cycle is also reached through its unhashed alias
   * spelling; the alias becomes a unit of its own in the table.
   */
  private addAliasUnits(
    items: Map<string, SharedDepUnit>,
    emitted: ReadonlyMap<string, ChunkRecord>
  ): void {
    // @cpt-begin:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-emit-alias-unit
    // @cpt-begin:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-alias-unit-publish
    for (const [location, chunk] of emitted) {
      const held = items.get(location);
      if (held === undefined) continue;
      for (const alias of chunk.publishAliases ?? []) {
        if (!items.has(alias)) {
          items.set(alias, {
            location: alias,
            contentHash: held.contentHash,
            answers: [],
            imports: [...held.imports],
          });
        }
      }
    }
    // @cpt-end:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-alias-unit-publish
    // @cpt-end:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-emit-alias-unit
  }

  /**
   * List completeness: every relative specifier surviving in an emitted
   * item resolves to an emitted item, lazy target or pattern file.
   */
  private checkRelativeSpecifiers(
    context: ListEmitContext,
    entryPath: string,
    emitted: ReadonlyMap<string, ChunkRecord>,
    list: ProducedFetchList,
    parentLocations: ReadonlySet<string>
  ): void {
    const { build, onError } = context;
    const dep = build.dep;
    // List completeness: every relative specifier
    // surviving in an emitted item's text must resolve — against the
    // item's own location — to an emitted item, lazy target or
    // pattern file. An unresolved one leaves a native import the
    // blob realm cannot resolve: the module graph fails at runtime.
    const resolvable = new Set([
      ...emitted.keys(),
      ...Object.keys(list.lazy ?? {}),
      ...Object.keys(list.patterns ?? {}),
      ...parentLocations,
    ]);
    for (const chunk of emitted.values()) {
      for (const alias of chunk.publishAliases ?? []) {
        resolvable.add(alias);
      }
    }
    for (const [location, chunk] of emitted) {
      // The chunk's relative import statements and literal dynamic
      // imports, read by parsing: an import-like string in the text
      // is no edge.
      const specifiers = this.syntaxOf(() =>
        this.chunkSyntax.relativeSpecifiers(chunk.file, location), onError
      );
      for (const spec of specifiers) {
        const resolved = new URL(
          spec,
          `http://r/${location}`
        ).pathname.slice(1);
        if (!resolvable.has(resolved)) {
          onError(
            `[unit-producer] list "${entryPath}" of "${dep.name}" ` +
              `emits "${location}" carrying relative specifier ` +
              `"${spec}" resolving to "${resolved}", but no emitted ` +
              `item, lazy target or pattern file carries that location`
          );
        }
      }
    }
  }

  /**
   * Reads what a chunk's text yields through the run's memo; a text
   * that cannot be parsed fails the build, naming the unit.
   */
  private syntaxOf<T>(read: () => T, onError: (message: string) => never): T {
    try {
      return read();
    } catch (err) {
      return onError(err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * The dynamic imports of one emitted chunk that its list does not
   * carry as edges: every statically bounded pattern gets a list per
   * matching file, every fully opaque `import(expr)` is reported and
   * stays native.
   */
  private collectDynamicImports(
    dep: ResolvedSharedDep,
    chunk: ChunkRecord,
    patterns: Record<string, ProducedFetchList>,
    opaqueImports: OpaqueImportReport[],
    onError: (message: string) => never
  ): void {
    for (const call of this.chunkSyntax.dynamicImports(chunk.file, chunk.location)) {
      if (call.kind === 'literal') continue;
      if (call.kind === 'opaque') {
        // @cpt-begin:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-report-opaque-imports
        opaqueImports.push({
          file: chunk.location,
          line: call.line,
          expression: call.expression,
        });
        // @cpt-end:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-report-opaque-imports
        continue;
      }
      // @cpt-begin:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-emit-pattern-lists
      // @cpt-begin:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-pattern-file-location
      for (const matched of this.patternImports.match(
        dep,
        chunk,
        call.prefix,
        call.suffix,
        onError
      )) {
        if (patterns[matched.location] === undefined) {
          patterns[matched.location] = matched.list;
        }
      }
      // @cpt-end:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-pattern-file-location
      // @cpt-end:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-emit-pattern-lists
    }
  }

  // ── Finishing ────────────────────────────────────────────────────

  private finishPackage(
    build: PackageChunks,
    key: string,
    emitted: { lists: Record<string, ProducedFetchList> },
    onError: (message: string) => never
  ): ProducedSharedPackage {
    const dep = build.dep;
    void key;
    // `units`/`entryUnits` record the package-determined chunk set —
    // the entry-set build plus supplementary chunks the shared
    // closure reaches. A supplementary built only because the
    // consuming build asked (`consumerSpecifiers`) stays out: the
    // record is the same whichever consumer asked.
    // @cpt-begin:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-return-export-names
    const exportsOf = (chunk: ChunkRecord): string[] | undefined =>
      fs.existsSync(path.join(this.outputDir, chunk.location))
        ? this.syntaxOf(() => this.chunkSyntax.exportNames(chunk.file, chunk.location), onError)
        : undefined;
    const units: ProducedChunk[] = build.chunks
      .filter((c) => !c.consumerOnly)
      .map((c) => {
        const exported = exportsOf(c);
        return {
          location: c.location,
          contentHash: c.contentHash,
          modulePaths: c.modulePaths,
          bareImports: [
            ...new Set(
              c.externalEdges
                .map((e) => SharedSetResolver.extractRootPackageName(e.specifier))
            ),
          ].sort(),
          ...(exported !== undefined ? { exports: exported } : {}),
        };
      });
    // @cpt-end:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-return-export-names
    const entryUnits: Record<string, string> = {};
    for (const chunk of UnitProducer.entriesLast(
      build.chunks.filter((c) => !c.consumerOnly)
    )) {
      for (const spec of chunk.answers) {
        if (entryUnits[spec] === undefined) entryUnits[spec] = chunk.location;
      }
    }
    const requires = [
      ...new Set(
        build.chunks
          .flatMap((c) => c.externalEdges)
          .filter((e) => !isBuiltin(e.specifier))
          .map((e) => SharedSetResolver.extractRootPackageName(e.specifier))
          .filter((r) => r !== dep.name)
      ),
    ].sort();
    const rootSpec = dep.name;
    const packLocation =
      entryUnits[rootSpec] ??
      (build.chunks.length > 0 ? build.chunks[0].location : '');
    const chunkBytes = units
      .filter((u) => fs.existsSync(path.join(this.outputDir, u.location)))
      .reduce((n, u) => n + fs.statSync(path.join(this.outputDir, u.location)).size, 0);

    const barrelMode =
      build.barrelNotes.length > 0
        ? 'kept'
        : 'not-needed';
    const barrelKeptReason = build.barrelNotes
      .map(
        (n) =>
          `${dep.name}@${dep.version} · ${n.entry} · ${n.reason} · fix: ${n.fix}`
      )
      .join('; ');
    for (const note of build.barrelNotes) {
      console.log(
        BuildReport.formatUnsplittableBarrelLine(
          `${dep.name}@${dep.version}`,
          note.entry,
          note.reason,
          note.fix
        )
      );
    }
    const skipped = this.excludedByRoot.get(dep.name) ?? [];
    const isCjs = build.chunks.every((c) => c.isCjsEntry || c.entryPoint === undefined);
    const fallbackReason = isCjs
      ? 'CommonJS package; delivered as one chunk per entry point'
      : undefined;
    if (isCjs) console.warn(BuildReport.cjsWholePackageWarning(dep.name));

    let versionDrift: string | undefined;
    const peer = this.options.peerVersions?.get(dep.name);
    if (peer !== undefined && peer !== dep.version) {
      versionDrift = BuildReport.formatVersionDriftLine(
        dep.name,
        dep.version,
        peer
      );
      console.log(`  [unit-producer] report: ${versionDrift}`);
    }
    console.log(
      BuildReport.formatLine({
        name: dep.name,
        version: dep.version,
        unitMode: units.length > 1 ? 'units' : 'single',
        barrelMode,
        unitBytes: chunkBytes,
        packBytes: chunkBytes,
        fallbackReason,
        barrelKeptReason: build.barrelNotes.length > 0 ? barrelKeptReason : undefined,
      })
    );
    return {
      name: dep.name,
      version: dep.version,
      packLocation,
      unitMode: units.length > 1 ? 'units' : 'single',
      units,
      entryUnits,
      lists: emitted.lists,
      requires: requires.length > 0 ? requires : undefined,
      transitive: dep.transitive,
      chunkBytes,
      barrelMode,
      barrelKeptReason: build.barrelNotes.length > 0 ? barrelKeptReason : undefined,
      fallbackReason,
      versionDrift,
      ...(skipped.length > 0
        ? {
            skippedEntries: skipped.map((e) => ({
              entry: e.entry,
              specifier: e.specifier,
              reason: e.reason,
            })),
          }
        : {}),
    };
  }

  /** Non-entry chunks first, entry chunks last — deterministic order. */
  private static entriesLast(chunks: readonly ChunkRecord[]): ChunkRecord[] {
    return [
      ...chunks.filter((c) => c.entryPoint === undefined),
      ...chunks.filter((c) => c.entryPoint !== undefined),
    ];
  }

  /**
   * Dependency order: every package follows the packages it imports.
   * A package reached again while its own imports are still being
   * walked closes a cycle of static imports between shared packages:
   * no unit on it can be minted before the others, so the build fails
   * naming the packages on the cycle.
   */
  private static dependencyOrder(
    deps: readonly ResolvedSharedDep[],
    builds: ReadonlyMap<string, PackageChunks>,
    onError: (message: string) => never
  ): ResolvedSharedDep[] {
    // @cpt-begin:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-no-unit-cycle
    const byName = new Map(deps.map((d) => [d.name, d]));
    const importsOf = new Map(
      deps.map((d) => [
        d.name,
        [
          ...new Set(
            (builds.get(d.name)?.chunks ?? [])
              .flatMap((c) => c.externalEdges)
              .filter((e) => e.kind !== 'dynamic')
              .map((e) => SharedSetResolver.extractRootPackageName(e.specifier))
              .filter((r) => r !== d.name)
          ),
        ],
      ])
    );
    const ordered: ResolvedSharedDep[] = [];
    const visited = new Set<string>();
    const path: string[] = [];
    const visit = (name: string): void => {
      if (!byName.has(name)) return;
      const onPath = path.indexOf(name);
      if (onPath !== -1) {
        onError(
          `[unit-producer] Cyclic shared-dependency graph: ` +
            `${[...path.slice(onPath), name].join(' -> ')}`
        );
      }
      if (visited.has(name)) return;
      visited.add(name);
      path.push(name);
      for (const imported of importsOf.get(name) ?? []) visit(imported);
      path.pop();
      ordered.push(byName.get(name)!);
    };
    for (const dep of deps) visit(dep.name);
    // @cpt-end:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-no-unit-cycle
    return ordered;
  }

  /** No shared package's modules inlined into another's chunks. */
  private pendingInliningFailures(
    name: string,
    build: PackageChunks
  ): string[] {
    if (this.inliningGuard === undefined) return [];
    const violations = this.inliningGuard.findViolations(
      build.buildInputs,
      this.packageRoot,
      name
    );
    return violations.length > 0
      ? [
          ForeignPackageInliningGuard.formatError(
            name,
            `the chunks of "${name}"`,
            violations
          ),
        ]
      : [];
  }

  // ── Shared helpers ───────────────────────────────────────────────

  private resolveDeps(set: {
    sharedDeps: string[];
    packages: readonly SharedPackageLocation[];
  }): ResolvedSharedDep[] {
    const byRoot = new Map(set.packages.map((p) => [p.name, p]));
    const roots = [
      ...new Set(set.sharedDeps.map(SharedSetResolver.extractRootPackageName)),
    ];
    const out: ResolvedSharedDep[] = [];
    for (const name of roots) {
      const located = byRoot.get(name);
      if (located === undefined) {
        throw new Error(
          `[unit-producer] cannot find package.json for "${name}" ` +
            `from ${this.packageRoot}`
        );
      }
      out.push(this.toResolvedDep(located));
    }
    return out;
  }

  private toResolvedDep(located: SharedPackageLocation): ResolvedSharedDep {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(located.dir, 'package.json'), 'utf-8')
    ) as SharedDepPackageJson;
    return {
      name: located.name,
      packageDir: located.dir,
      installDir: located.installDir,
      resolveDir: located.resolveDir,
      pkg,
      version: located.version,
      transitive: located.transitive,
    };
  }

}

/**
 * Every external bare specifier a package's chunks carry. Chunks of
 * entries already confirmed skipped this run contribute nothing: the
 * skipped entry can never load, so the specifiers only its chunks
 * reach must never become requested specifiers.
 */
function buildExternalSpecifiers(build: PackageChunks): string[] {
  const skipped = build.skippedChunkIds;
  return [
    ...new Set(
      build.chunks
        .filter((c) => skipped === undefined || !skipped.has(c.id))
        .flatMap((c) => c.externalEdges.map((e) => e.specifier))
    ),
  ].sort();
}
