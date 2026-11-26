/**
 * `MfeGtsBuildState` — the mutable state one `vite build` of an MFE
 * accumulates across the plugin's hooks: the resolved shared set and its
 * external matcher, the consumer barrel rewrite transform and ledger,
 * the per-chunk CSS and dynamic-import observations `renderChunk` makes,
 * the chunk graph `generateBundle` captures, and the flag a failed
 * contract check raises for `closeBundle`. One instance per
 * `toVitePlugin()` call; `renderStart` clears the per-output state.
 */

import {
  BuildGraphSharing,
  BuildStageTimer,
  ConsumerBarrelRewriteLedger,
  type ConsumerBarrelRewriteTransform,
  type PackageCacheSummary,
  type SharedSetSelection,
  type SharedStylesheetImports,
} from '@gears-frontx/unit-producer';

import type { CapturedChunk, ImportingChunk } from './types';

export class MfeGtsBuildState {
  /** The MFE package root (`configResolved`). */
  packageRoot = '';
  /** The build outDir, resolved from Vite's root (`configResolved`). */
  distDirPath = 'dist';
  /** The resolved shared set (`config`). */
  sharedDeps: string[] = [];
  /** The build-graph sharing rule (`config`), when anything can be shared. */
  sharing?: BuildGraphSharing;
  /** Whether `configResolved` installs the sharing rule as `external`. */
  externalizesShared = false;
  /** The `include`/`exclude` selection the shared set was derived with. */
  selection?: SharedSetSelection;
  /** Root names of the bare packages the bundler aliases point at. */
  aliasTargets: string[] = [];
  command: 'build' | 'serve' = 'build';
  /** The consumer barrel rewrite (`config`), builds only. */
  barrelTransform?: ConsumerBarrelRewriteTransform;
  /** The shared-package stylesheet imports (`config`), builds only. */
  stylesheetImports?: SharedStylesheetImports;
  /** What the consumer barrel rewrite did, per shared package. */
  readonly barrelLedger = new ConsumerBarrelRewriteLedger();
  /**
   * Per-stage build-time instrumentation. The plugin owns
   * the `vite-build` stage (renderStart → closeBundle); the producer
   * stages come from the timer it forwards to `UnitProducer`. The
   * timer is a side channel — it writes nothing into emitted bytes.
   */
  stageTimer = new BuildStageTimer();
  /** Per-package build-cache outcomes of the producer run, for the report. */
  cacheSummary?: PackageCacheSummary;

  /** Preliminary file name → the chunk's own emitted CSS files. */
  readonly chunkOwnCss = new Map<string, string[]>();
  /** Preliminary file name → the chunk's dynamic imports. */
  readonly chunkDynamicImports = new Map<string, string[]>();
  /** Preliminary file name → the chunk's static imports, as rendered. */
  readonly chunkStaticImports = new Map<string, string[]>();
  /** Preliminary file name → deliverable stylesheet module ids. */
  readonly chunkCssModules = new Map<string, string[]>();
  /**
   * Rendered chunks the CSS-only chunk rule marks: the ones whose
   * imports `generateBundle` recovers when Vite removed them.
   */
  readonly cssOnlyChunkNames = new Set<string>();
  /** Preliminary file name → dynamic imports left as-is (CSS-only chunks). */
  readonly chunkCssOnlyImports = new Map<string, Set<string>>();
  /**
   * Stylesheet module ids whose compiled CSS is the empty string, as the
   * `EmptyCssRecorder` records them. Not cleared per output or per
   * build start: a watch rebuild replays cached transforms without
   * running them, so the recording is the stylesheets' own state; the
   * recorder starts it empty for every build (`configResolved`).
   */
  readonly emptyCssModuleIds = new Set<string>();
  /** Non-static `import(expr)` calls left native, for the report. */
  readonly opaqueImports: Array<{ file: string; line: number; expression: string }> = [];
  /** A contract check failed in `generateBundle`; `closeBundle` stops. */
  outputFailed = false;
  /** Expose key → the reference of the entry chunk emitted for its module this build. */
  readonly exposeEntryRefs = new Map<string, string>();
  /** Expose key → the file name of its entry chunk, for this output. */
  readonly entryFileByExpose = new Map<string, string>();
  /** Final file name → the chunk's captured linkage. */
  readonly capturedChunks = new Map<string, CapturedChunk>();
  /** Final file name → the chunk's imported bindings. */
  readonly capturedImports = new Map<string, ImportingChunk>();

  /** Per-output state reset (`renderStart`). */
  resetRender(): void {
    this.chunkOwnCss.clear();
    this.chunkDynamicImports.clear();
    this.chunkStaticImports.clear();
    this.chunkCssModules.clear();
    this.chunkCssOnlyImports.clear();
    this.cssOnlyChunkNames.clear();
    this.capturedChunks.clear();
    this.opaqueImports.length = 0;
    this.entryFileByExpose.clear();
    this.outputFailed = false;
  }

  /** Per-build state reset (`buildStart`). */
  resetBuild(): void {
    this.capturedChunks.clear();
    this.capturedImports.clear();
    this.exposeEntryRefs.clear();
    this.barrelLedger.clear();
    this.cacheSummary = undefined;
  }
}
