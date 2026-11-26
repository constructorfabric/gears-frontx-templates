/**
 * `MfeBuildReport` — the per-MFE build report the plugin emits at the end
 * of `closeBundle`, consumed by the size and reachability gates. The
 * report is a single JSON document written to
 * `<distDir>/mfe-build-report.json` and echoed on one log line:
 *
 *   {
 *     "mfe": "<mf-manifest metaData.name>",
 *     "sharedOutDir": "<dir under distDir>",
 *     "packages": [
 *       {
 *         "name": string, "version": string,
 *         "unitMode": "units" | "single",
 *         "barrelMode": "rewritten" | "not-needed" | "kept",
 *         "transitive": boolean,      // shared only through the closure
 *         "reachableBytes": number,   // bytes of this package's chunks on its emitted lists
 *         "reachableChunks": number,
 *         "totalBytes": number,       // every byte emitted for the package: the chunk files
 *         "versionDrift"?: string,    // version drift over the manifest shared set
 *         "fallbackReason"?: string,
 *         "importedBarrels"?: [
 *           { "name": string, "mode": ..., "rewrites": number, "keptReasons": string[] }
 *         ]
 *       }
 *     ],
 *     "reachableBytes": number,       // deduplicated bytes of every reachable chunk
 *     "totalBytes": number,           // every emitted shared byte
 *     "fallbackReasons": string[],    // every package fallback, named
 *     "consumerBarrels": [            // the MFE's own imports from shared barrels
 *       { "name": string, "mode": "rewritten" | "kept" | "not-needed",
 *         "rewrites": number, "keptReasons": string[] }
 *     ],
 *     "keptBarrels": string[],        // every barrel still evaluated, with why
 *     "opaqueImports": string[]       // `file:line · import(expr) · stays native`
 *   }
 *
 * `barrelMode` is the producing build's own barrel rewrite inside the
 * package; `consumerBarrels` is the consumer rewrite of the MFE's
 * imports; `importedBarrels` is the same rule applied by the producer to
 * a shared package's chunks' imports of other shared packages.
 *
 * Reachability is list-driven: a package's emitted fetch lists reference
 * exactly the chunks a load of the MFE's entries reaches, so the
 * reachable set is the deduplicated union of items across the package's
 * lists.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type {
  BuildStageTimings,
  ConsumerBarrelPackageRecord,
  OpaqueImportReport,
  PackageCacheSummary,
  ProducedSharedPackage,
  SharedSetSummaryDocument,
} from '@gears-frontx/unit-producer';


export interface MfeBuildReportPackage {
  name: string;
  version: string;
  unitMode: string;
  barrelMode: string;
  transitive: boolean;
  reachableBytes: number;
  reachableChunks: number;
  totalBytes: number;
  versionDrift?: string;
  fallbackReason?: string;
}

export interface MfeBuildReportDocument {
  mfe: string;
  sharedOutDir: string;
  packages: MfeBuildReportPackage[];
  reachableBytes: number;
  totalBytes: number;
  fallbackReasons: string[];
  consumerBarrels: ConsumerBarrelPackageRecord[];
  keptBarrels: string[];
  opaqueImports: string[];
  /**
   * Per-stage build-time record.
   * Optional so older reports without it stay readable; the plugin
   * always writes it.
   */
  stageTimings?: BuildStageTimings;
  /** Per-package build-cache hits/misses (volatile: differs cold vs warm). */
  cache?: PackageCacheSummary;
  /** This MFE's effective shared set, how each package was reached. */
  sharedSet?: SharedSetSummaryDocument;
}

export class MfeBuildReport {
  static compose(params: {
    mfe: string;
    sharedOutDir: string;
    produced: readonly ProducedSharedPackage[];
    /** Absolute dir the chunks were emitted into. */
    sharedDir: string;
    /** The consumer barrel rewrite's per-package outcomes. */
    consumerBarrels?: readonly ConsumerBarrelPackageRecord[];
    /** Opaque `import(expr)` entries from the produced lists. */
    opaqueImports?: readonly OpaqueImportReport[];
    /**
     * Per-stage build-time record. When passed, the
     * report carries the stage breakdown alongside Vite's own build
     * time; the MFE plugin measures `vite-build` from `renderStart` to
     * `closeBundle` and forwards the timer to the producer.
     */
    stageTimings?: BuildStageTimings;
    cache?: PackageCacheSummary;
    sharedSet?: SharedSetSummaryDocument;
  }): MfeBuildReportDocument {
    const consumerBarrels = [...(params.consumerBarrels ?? [])];
    const packages = params.produced.map((p): MfeBuildReportPackage => {
      const locations = new Set<string>();
      for (const list of Object.values(p.lists)) {
        for (const item of list.items) locations.add(item.location);
      }
      let reachableBytes = 0;
      for (const location of locations) {
        // A listed chunk missing from the shared dir is an emit
        // failure — surface the fs error rather than reporting 0
        // bytes silently.
        reachableBytes += fs.statSync(
          path.join(params.sharedDir, location)
        ).size;
      }
      return {
        name: p.name,
        version: p.version,
        unitMode: p.unitMode,
        barrelMode: p.barrelMode,
        transitive: p.transitive,
        reachableBytes,
        reachableChunks: locations.size,
        totalBytes: MfeBuildReport.emittedBytesOf(p),
        ...(p.versionDrift !== undefined
          ? { versionDrift: p.versionDrift }
          : {}),
        ...(p.fallbackReason !== undefined
          ? { fallbackReason: p.fallbackReason }
          : {}),
      };
    });
    return {
      mfe: params.mfe,
      sharedOutDir: params.sharedOutDir,
      packages,
      reachableBytes: packages.reduce((n, p) => n + p.reachableBytes, 0),
      totalBytes: packages.reduce((n, p) => n + p.totalBytes, 0),
      fallbackReasons: params.produced
        .filter((p) => p.fallbackReason !== undefined)
        .map((p) => `${p.name}: ${p.fallbackReason}`),
      consumerBarrels,
      keptBarrels: consumerBarrels.flatMap((b) =>
        b.keptReasons.map((reason) => `${b.name}: ${reason}`)
      ),
      opaqueImports: [
        ...new Map(
          (params.opaqueImports ?? []).map((o) => [`${o.file}:${o.line}`, o])
        ),
      ]
        .map(([, o]) => `${o.file}:${o.line} · import(${o.expression ?? 'expr'}) · stays native`)
        .sort(),
      ...(params.stageTimings !== undefined
        ? { stageTimings: params.stageTimings }
        : {}),
      ...(params.cache !== undefined ? { cache: params.cache } : {}),
      ...(params.sharedSet !== undefined ? { sharedSet: params.sharedSet } : {}),
    };
  }

  /** Every byte emitted for one package: its chunks. */
  private static emittedBytesOf(p: ProducedSharedPackage): number {
    return p.chunkBytes;
  }

  static emit(
    report: MfeBuildReportDocument,
    distDir: string,
    log: (message: string) => void = console.log
  ): void {
    const file = path.join(distDir, 'mfe-build-report.json');
    fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n', 'utf-8');
    log(`[vite-plugin-mfe-gts] report: ${JSON.stringify(report)}`);
  }
}
