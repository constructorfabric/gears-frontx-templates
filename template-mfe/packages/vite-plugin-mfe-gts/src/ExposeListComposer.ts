/**
 * `ExposeListComposer` — the MFE-side fetch-list assembly: for every
 * exposed entry, the shared specifiers its chunk closure reaches merge
 * into one fetch list (units, lazy records, patterns, opaque-import
 * entries deduplicated by location); every lazy target — a lazily loaded
 * own chunk, or a shared package the own code imports dynamically by bare
 * specifier — gets a nested list holding only what it needs beyond its
 * expose's list. The result is the manifest's unit table `units` — every
 * shared unit once — and its `lists` record: one list per exposed module
 * naming units by content identity, and each lazy target's list held once
 * under its key (an own chunk's location, a shared package's bare
 * specifier) and named in the `lazy` array of every expose list.
 */

import type {
  SharedDepFetchList,
  SharedDepUnit,
} from '@gears-frontx/mfes/unit-format';
import {
  ManifestListBuilder,
  type OpaqueImportReport,
  type ProducedFetchList,
  type ProducedSharedPackage,
} from '@gears-frontx/unit-producer';

export interface ExposeListComposerOptions {
  /** The produced shared packages (`lists` keyed by requested specifier). */
  produced: readonly ProducedSharedPackage[];
  /** Expose path (`'./lifecycle'`) → shared specifiers its chunks reach. */
  exposeSpecifiers: ReadonlyMap<string, readonly string[]>;
  /**
   * Lazy target → the shared specifiers it reaches: a lazily loaded own
   * chunk (asset-base-relative file name) → its static closure's; a bare
   * specifier of a shared package the own code imports dynamically →
   * that specifier.
   */
  lazyChunkSpecifiers: ReadonlyMap<string, readonly string[]>;
  /**
   * Expose path → the MFE's own chunks its entry chunk reaches
   * statically (asset-base-relative file names, entry chunk excluded).
   */
  exposeOwnChunks: ReadonlyMap<string, readonly string[]>;
  /**
   * Lazily loaded own chunk → the own chunks its static closure reaches
   * beyond itself.
   */
  lazyChunkOwnChunks: ReadonlyMap<string, readonly string[]>;
  /**
   * Fatal-reporting callback: a reached specifier with no emitted
   * list fails the build naming the entry and the specifier (list
   * completeness — never a silent skip).
   */
  onError: (message: string) => never;
}

export interface ComposedExposeLists {
  /** `manifest.units`: every shared unit the lists name, once. */
  units: SharedDepUnit[];
  /** `manifest.lists`: every fetch list once — each expose's under its path, each lazy chunk's under its location. */
  lists: Record<string, SharedDepFetchList>;
  /** Every opaque `import(expr)` seen across the composed lists. */
  opaqueImports: OpaqueImportReport[];
}

// @cpt-dod:cpt-template-mfe-dod-mfe-fetch-list-assembly-lists:p1
export class ExposeListComposer {
  // @cpt-algo:cpt-template-mfe-algo-mfe-fetch-list-assembly-compose:p1
  static compose(options: ExposeListComposerOptions): ComposedExposeLists {
    const {
      produced,
      exposeSpecifiers,
      lazyChunkSpecifiers,
      exposeOwnChunks,
      lazyChunkOwnChunks,
      onError,
    } = options;
    const listOf = (specifier: string): ProducedFetchList | undefined => {
      for (const pkg of produced) {
        const found = pkg.lists[specifier];
        if (found !== undefined) return found;
      }
      return undefined;
    };
    const opaque: OpaqueImportReport[] = [];
    const opaqueSeen = new Set<string>();
    const noteOpaque = (list: ProducedFetchList): void => {
      for (const entry of list.opaqueImports ?? []) {
        const key = `${entry.file}:${entry.line}`;
        if (!opaqueSeen.has(key)) {
          opaqueSeen.add(key);
          opaque.push(entry);
        }
      }
    };

    // @cpt-begin:cpt-template-mfe-algo-mfe-fetch-list-assembly-compose:p1:inst-merge-expose-list
    const mergeItems = (specs: readonly string[], entry: string, skip?: ReadonlySet<string>) => {
      const items = new Map<string, SharedDepUnit>();
      const lazy: Record<string, ProducedFetchList> = {};
      const patterns: Record<string, ProducedFetchList> = {};
      for (const spec of specs) {
        const list = listOf(spec);
        // A reached specifier no list was emitted for fails the
        // build — a silently skipped specifier leaves the chunk's
        // bare import unanswered.
        if (list === undefined) {
          onError(
            `[vite-plugin-mfe-gts] ${entry} reaches shared specifier ` +
              `"${spec}", but no fetch list was emitted for it`
          );
          continue;
        }
        noteOpaque(list);
        for (const item of list.items) {
          // Items dedupe by location, not content identity: the same
          // bytes emitted under two package directories are distinct
          // items — each importer's relative specifiers resolve
          // against its own location.
          if (skip?.has(item.location)) continue;
          if (!items.has(item.location)) items.set(item.location, item);
        }
        for (const [k, nested] of Object.entries(list.lazy ?? {})) {
          if (lazy[k] === undefined) lazy[k] = nested;
        }
        for (const [k, nested] of Object.entries(list.patterns ?? {})) {
          if (patterns[k] === undefined) patterns[k] = nested;
        }
      }
      return { items, lazy, patterns };
    };
    // @cpt-end:cpt-template-mfe-algo-mfe-fetch-list-assembly-compose:p1:inst-merge-expose-list

    // Lazy targets get a nested list each — only what the target needs
    // beyond every expose list (parent chain), keyed where the runtime
    // looks it up: an own chunk by its location relative to
    // `publicPath`, the base an own chunk resolves against; a shared
    // package imported dynamically by bare specifier by that specifier.
    const exposeItems = new Map<string, Map<string, SharedDepUnit>>();
    const mergedByExpose = new Map<string, ReturnType<typeof mergeItems>>();
    for (const [expose, specs] of exposeSpecifiers) {
      const merged = mergeItems(specs, `expose "${expose}"`);
      mergedByExpose.set(expose, merged);
      exposeItems.set(expose, merged.items);
    }
    // Delta lists skip by location — an expose-provided item is
    // already minted — but only what EVERY expose list delivers may be
    // skipped: every expose references every lazy delta, so a
    // delta's parent chain at runtime is whichever single expose loads
    // the chunk. An item carried only by some other expose leaves the
    // delta's `{item}` edges and specifiers dangling under this one —
    // the reached chunk must join the delta (closure over items).
    // @cpt-begin:cpt-template-mfe-algo-mfe-fetch-list-assembly-compose:p1:inst-two-parents
    // @cpt-begin:cpt-template-mfe-algo-mfe-fetch-list-assembly-compose:p1:inst-two-parents-union
    let sharedExposeLocations: Set<string> | undefined;
    for (const items of exposeItems.values()) {
      if (sharedExposeLocations === undefined) {
        sharedExposeLocations = new Set(items.keys());
      } else {
        for (const location of [...sharedExposeLocations]) {
          if (!items.has(location)) sharedExposeLocations.delete(location);
        }
      }
    }
    const allExposeLocations = sharedExposeLocations ?? new Set<string>();
    // The same rule for own chunks: a lazy delta names only the own
    // chunks not already delivered by every expose list.
    let sharedExposeOwn: Set<string> | undefined;
    for (const expose of exposeSpecifiers.keys()) {
      const own = new Set(exposeOwnChunks.get(expose) ?? []);
      if (sharedExposeOwn === undefined) {
        sharedExposeOwn = own;
      } else {
        for (const chunk of [...sharedExposeOwn]) {
          if (!own.has(chunk)) sharedExposeOwn.delete(chunk);
        }
      }
    }
    const allExposeOwn = sharedExposeOwn ?? new Set<string>();

    // @cpt-end:cpt-template-mfe-algo-mfe-fetch-list-assembly-compose:p1:inst-two-parents-union
    // @cpt-end:cpt-template-mfe-algo-mfe-fetch-list-assembly-compose:p1:inst-two-parents
    // @cpt-begin:cpt-template-mfe-algo-mfe-fetch-list-assembly-compose:p1:inst-lazy-lists
    // @cpt-begin:cpt-template-mfe-algo-mfe-fetch-list-assembly-compose:p1:inst-own-chunks
    const lazyChunkLists = new Map<string, ProducedFetchList>();
    for (const [fileName, specs] of lazyChunkSpecifiers) {
      const delta = mergeItems(specs, `lazy chunk "${fileName}"`, allExposeLocations);
      // Every lazy target has a list, an empty delta included: a target
      // matching no list makes the runtime warn once and load it without
      // one.
      const deltaOwn = (lazyChunkOwnChunks.get(fileName) ?? []).filter(
        (chunk) => !allExposeOwn.has(chunk)
      );
      lazyChunkLists.set(fileName, {
        items: [...delta.items.values()].sort((a, b) =>
          a.location < b.location ? -1 : a.location > b.location ? 1 : 0
        ),
        ownChunks: deltaOwn,
        ...(Object.keys(delta.lazy).length > 0 ? { lazy: delta.lazy } : {}),
        ...(Object.keys(delta.patterns).length > 0 ? { patterns: delta.patterns } : {}),
      });
    }

    // @cpt-end:cpt-template-mfe-algo-mfe-fetch-list-assembly-compose:p1:inst-own-chunks
    // @cpt-end:cpt-template-mfe-algo-mfe-fetch-list-assembly-compose:p1:inst-lazy-lists
    const exposeLists: Record<string, ProducedFetchList> = {};
    for (const [expose, merged] of mergedByExpose) {
      // @cpt-begin:cpt-template-mfe-algo-mfe-fetch-list-assembly-compose:p1:inst-lazy-keys
      // The lazy targets join the expose's `lazy` record under their
      // keys — the asset-base-relative file name of an own chunk, the
      // bare specifier of a shared package — the key the runtime resolves
      // a `__frontx_lazy` call to.
      for (const [fileName, nested] of lazyChunkLists) {
        if (merged.lazy[fileName] === undefined) merged.lazy[fileName] = nested;
      }
      // @cpt-end:cpt-template-mfe-algo-mfe-fetch-list-assembly-compose:p1:inst-lazy-keys
      const list: ProducedFetchList = {
        items: [...merged.items.values()].sort((a, b) =>
          a.location < b.location ? -1 : a.location > b.location ? 1 : 0
        ),
        ownChunks: [...(exposeOwnChunks.get(expose) ?? [])],
        ...(Object.keys(merged.lazy).length > 0
          ? {
              lazy: Object.fromEntries(
                Object.entries(merged.lazy).sort(([a], [b]) => (a < b ? -1 : 1))
              ),
            }
          : {}),
        ...(Object.keys(merged.patterns).length > 0
          ? { patterns: merged.patterns }
          : {}),
      };
      // Every exposed module has a list, an empty one included: a manifest
      // that holds lists names the list of each module it exposes.
      exposeLists[expose] = list;
    }
    // Producer obligation: every content identity a list names is held by
    // the unit table — the build fails otherwise.
    const { units, lists } = ManifestListBuilder.build(exposeLists, onError);
    // @cpt-begin:cpt-template-mfe-algo-mfe-fetch-list-assembly-compose:p1:inst-return-units-lists
    return { units, lists, opaqueImports: opaque };
    // @cpt-end:cpt-template-mfe-algo-mfe-fetch-list-assembly-compose:p1:inst-return-units-lists
  }
}
