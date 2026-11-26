/**
 * `ShellBuildReport` — the host-side per-stage build report. The shell plugin writes a single JSON
 * document to `<distDir>/shell-build-report.json` at the end of
 * `closeBundle` carrying the per-package summary (count, mode, bytes)
 * and the per-stage wall-clock timings the producer and the plugin
 * collected.
 *
 * The report is a side channel: it writes nothing into the emitted
 * chunk bytes (a conformance test asserts that
 * instrumenting a build with a `BuildStageTimer` produces byte-identical
 * output). The report exists so a later
 * measurement phase can read the stage breakdown alongside
 * Vite's own build time without re-instrumenting the build.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type {
  BuildStageTimings,
  PackageCacheSummary,
  ProducedSharedPackage,
  SharedSetSummaryDocument,
} from '@gears-frontx/unit-producer';

export interface ShellBuildReportPackage {
  name: string;
  version: string;
  unitMode: string;
  barrelMode: string;
  reachableBytes: number;
  totalBytes: number;
  fallbackReason?: string;
}

export interface ShellBuildReportDocument {
  host: string;
  sharedOutDir: string;
  packages: ShellBuildReportPackage[];
  reachableBytes: number;
  totalBytes: number;
  fallbackReasons: string[];
  stageTimings: BuildStageTimings;
  /** Per-package build-cache hits/misses (volatile: differs cold vs warm). */
  cache?: PackageCacheSummary;
  /** The host's effective shared set, how each package was reached. */
  sharedSet?: SharedSetSummaryDocument;
}

export class ShellBuildReport {
  static compose(params: {
    host: string;
    /** The units directory as the report names it (`unitsDir`). */
    sharedOutDir: string;
    /** The absolute directory the units were written to. */
    sharedDir: string;
    produced: readonly ProducedSharedPackage[];
    stageTimings: BuildStageTimings;
    cache?: PackageCacheSummary;
    sharedSet?: SharedSetSummaryDocument;
  }): ShellBuildReportDocument {
    const packages = params.produced.map((p): ShellBuildReportPackage => {
      const locations = new Set<string>();
      for (const list of Object.values(p.lists)) {
        for (const item of list.items) locations.add(item.location);
      }
      let reachableBytes = 0;
      // Each listed unit's size, read from the directory it was written
      // to, so the report does not depend on the working directory.
      for (const location of locations) {
        const file = path.join(params.sharedDir, location);
        try {
          reachableBytes += fs.statSync(file).size;
        } catch (cause) {
          // The producer wrote every listed unit moments ago: one that is
          // missing means the output was damaged, and the report must not
          // describe a build that cannot boot.
          throw new Error(
            `[vite-plugin-shell] listed unit '${location}' of '${p.name}@${p.version}' ` +
              `is missing from '${file}' (${(cause as Error).message})`
          );
        }
      }
      return {
        name: p.name,
        version: p.version,
        unitMode: p.unitMode,
        barrelMode: p.barrelMode,
        reachableBytes,
        totalBytes: p.chunkBytes,
        ...(p.fallbackReason !== undefined
          ? { fallbackReason: p.fallbackReason }
          : {}),
      };
    });
    return {
      host: params.host,
      sharedOutDir: params.sharedOutDir,
      packages,
      reachableBytes: packages.reduce((n, p) => n + p.reachableBytes, 0),
      totalBytes: packages.reduce((n, p) => n + p.totalBytes, 0),
      fallbackReasons: params.produced
        .filter((p) => p.fallbackReason !== undefined)
        .map((p) => `${p.name}: ${p.fallbackReason}`),
      stageTimings: params.stageTimings,
      ...(params.cache !== undefined ? { cache: params.cache } : {}),
      ...(params.sharedSet !== undefined ? { sharedSet: params.sharedSet } : {}),
    };
  }

  static emit(
    report: ShellBuildReportDocument,
    distDir: string,
    log: (message: string) => void = console.log
  ): void {
    const file = path.join(distDir, 'shell-build-report.json');
    fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n', 'utf-8');
    log(`[vite-plugin-shell] report: ${JSON.stringify(report)}`);
  }
}
