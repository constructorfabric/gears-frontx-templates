/**
 * `PluginBuildWiring` — the build wiring the host plugin and the MFE
 * plugin apply identically, so the two cannot diverge:
 *
 *  - {@link ExternalChain}: installs the sharing rule as the resolved
 *    config's `external`, in every environment's build, chaining whatever
 *    `external` the project configured;
 *  - {@link FallbackReproduction}: produces the units and lists again for
 *    the specifiers the emitted chunks import once the consumer barrel
 *    fallback turned some of them back to their barrel.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { PackageCacheEntry, PackageCacheSummary } from './PackageCacheReport';
import type { ProducedSharedPackage, UnitProducer } from './UnitProducer';

/** Rollup's `external` option in every form it accepts. */
export type ExternalOptionLike =
  | string
  | RegExp
  | ReadonlyArray<string | RegExp>
  | ((
      source: string,
      importer: string | undefined,
      isResolved: boolean
    ) => boolean | null | undefined | void);

/** The slice of a resolved config the chain reads and writes. */
export interface ExternalChainConfig {
  build?: { rollupOptions?: { external?: unknown } };
  environments?: Record<string, { build?: { rollupOptions?: { external?: unknown } } }>;
}

export class ExternalChain {
  protected constructor() {}

  /**
   * One `external` function: nothing an importer `bundled` answers for is
   * external; otherwise `shared` first, then the `previous` option in any
   * of the forms Rollup accepts.
   */
  static chain(
    shared: (source: string, importer: string | undefined) => boolean,
    previous: ExternalOptionLike | undefined,
    bundled?: (importer: string | undefined) => boolean
  ): (source: string, importer: string | undefined, isResolved: boolean) => boolean {
    const patterns =
      previous === undefined || typeof previous === 'function'
        ? []
        : Array.isArray(previous)
          ? (previous as ReadonlyArray<string | RegExp>)
          : [previous as string | RegExp];
    return (source, importer, isResolved) => {
      if (bundled?.(importer) === true) return false;
      if (shared(source, importer)) return true;
      if (typeof previous === 'function') {
        return Boolean(previous(source, importer, isResolved));
      }
      return patterns.some((pattern) =>
        typeof pattern === 'string' ? pattern === source : pattern.test(source)
      );
    };
  }

  /**
   * Replaces the `external` of the config's build and of every
   * environment's build with the chain over what each carried. A
   * `rollupOptions` object shared by several builds is wrapped once.
   * Replacing on the resolved config, rather than returning an option
   * from `config`, keeps the project's own `external` out of Vite's
   * config merge, which replaces a string `external` and puts a function
   * into an array, where Rollup never calls it.
   */
  static install(
    config: ExternalChainConfig,
    shared: (source: string, importer: string | undefined) => boolean,
    bundled?: (importer: string | undefined) => boolean
  ): void {
    const builds = [
      config.build,
      ...Object.values(config.environments ?? {}).map((env) => env.build),
    ];
    const wrapped = new Set<object>();
    for (const build of builds) {
      if (build === undefined) continue;
      const rollupOptions = (build.rollupOptions ??= {});
      if (wrapped.has(rollupOptions)) continue;
      wrapped.add(rollupOptions);
      rollupOptions.external = ExternalChain.chain(
        shared,
        rollupOptions.external as ExternalOptionLike | undefined,
        bundled
      );
    }
  }
}

/** What {@link FallbackReproduction.run} returns. */
export interface FallbackReproductionResult {
  produced: ProducedSharedPackage[];
  /** Cache outcomes of every producer run, merged. */
  cache: PackageCacheSummary;
}

export class FallbackReproduction {
  protected constructor() {}

  /**
   * The specifiers the second production covers, or `undefined` when the
   * fallback changed nothing the chunks import: the consumer specifiers
   * the chunks no longer import are dropped — unless a chunk still
   * imports them dynamically — and the ones they import now are added.
   */
  static specifiers(params: {
    consumerSpecifiers: readonly string[];
    dynamicSpecifiers: ReadonlySet<string>;
    importedBefore: ReadonlySet<string>;
    importedAfter: ReadonlySet<string>;
  }): string[] | undefined {
    const { importedBefore, importedAfter } = params;
    const dropped = new Set(
      [...importedBefore].filter(
        (s) => !importedAfter.has(s) && !params.dynamicSpecifiers.has(s)
      )
    );
    const added = [...importedAfter].filter((s) => !importedBefore.has(s));
    if (dropped.size === 0 && added.length === 0) return undefined;
    return [
      ...new Set([
        ...params.consumerSpecifiers.filter((s) => !dropped.has(s)),
        ...added,
      ]),
    ].sort();
  }

  /**
   * Produces the units and lists for `consumerSpecifiers`, runs
   * `applyFallback` over the written units, and — when the chunks import
   * other specifiers after it — produces again for those, so every
   * specifier a chunk imports has a list and no unit is written for a
   * rewrite the chunks no longer import. Only the files the first pass
   * wrote are removed before the second: whatever else lives in
   * `outputDir` stays.
   */
  static async run(params: {
    producerFor: (specifiers: readonly string[]) => UnitProducer;
    outputDir: string;
    consumerSpecifiers: readonly string[];
    /** Specifiers the chunks import dynamically. */
    dynamicSpecifiers: ReadonlySet<string>;
    /** The specifiers the emitted chunks import statically right now. */
    importedNow: () => ReadonlySet<string>;
    /** Turns unanswered rewrites back in the chunks, in place. */
    applyFallback: (produced: ProducedSharedPackage[]) => void;
    onError: (message: string) => never;
  }): Promise<FallbackReproductionResult> {
    const existing = FallbackReproduction.filesUnder(params.outputDir);
    const first = params.producerFor(params.consumerSpecifiers);
    const produced = await first.produce(params.onError);
    const cache = first.cacheOutcomes();

    const importedBefore = new Set(params.importedNow());
    params.applyFallback(produced);
    const specifiers = FallbackReproduction.specifiers({
      consumerSpecifiers: params.consumerSpecifiers,
      dynamicSpecifiers: params.dynamicSpecifiers,
      importedBefore,
      importedAfter: params.importedNow(),
    });
    if (specifiers === undefined) return { produced, cache };

    // @cpt-begin:cpt-template-shell-algo-unit-producer-output-host-production:p1:inst-reproduce-after-fallback
    // @cpt-begin:cpt-template-shell-algo-unit-producer-output-host-production:p1:inst-remove-first-pass-files
    for (const file of FallbackReproduction.filesUnder(params.outputDir)) {
      if (!existing.has(file)) fs.rmSync(path.join(params.outputDir, file), { force: true });
    }
    FallbackReproduction.pruneEmptyDirs(params.outputDir);
    // @cpt-end:cpt-template-shell-algo-unit-producer-output-host-production:p1:inst-remove-first-pass-files
    const second = params.producerFor(specifiers);
    const reproduced = await second.produce(params.onError);
    // @cpt-begin:cpt-template-shell-algo-unit-producer-output-host-production:p1:inst-merge-cache-summary
    return {
      produced: reproduced,
      cache: FallbackReproduction.mergeCache(cache, second.cacheOutcomes()),
    };
    // @cpt-end:cpt-template-shell-algo-unit-producer-output-host-production:p1:inst-merge-cache-summary
    // @cpt-end:cpt-template-shell-algo-unit-producer-output-host-production:p1:inst-reproduce-after-fallback
  }

  /**
   * The merged cache outcomes: the first run's outcome stands for a
   * package both runs covered (the second run hits only what the first
   * stored); packages only one run covered keep their own.
   */
  static mergeCache(
    first: PackageCacheSummary,
    second: PackageCacheSummary
  ): PackageCacheSummary {
    const byKey = new Map<string, PackageCacheEntry>();
    for (const entry of [...second.packages, ...first.packages]) {
      byKey.set(`${entry.name}@${entry.version}`, entry);
    }
    const packages = [...byKey.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, entry]) => entry);
    return {
      hits: packages.filter((p) => p.outcome === 'hit').length,
      misses: packages.filter((p) => p.outcome === 'miss').length,
      packages,
    };
  }

  /** Every file under `dir`, as `dir`-relative paths. */
  private static filesUnder(dir: string): Set<string> {
    const files = new Set<string>();
    const walk = (current: string): void => {
      if (!fs.existsSync(current)) return;
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) walk(full);
        else files.add(path.relative(dir, full));
      }
    };
    walk(dir);
    return files;
  }

  /** Removes the directories under `dir` that hold nothing; `dir` stays. */
  private static pruneEmptyDirs(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      FallbackReproduction.pruneEmptyDirs(full);
      if (fs.readdirSync(full).length === 0) fs.rmdirSync(full);
    }
  }
}
