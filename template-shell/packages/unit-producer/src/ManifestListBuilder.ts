/**
 * `ManifestListBuilder` — derives the manifest-side contract shape from
 * build-side fetch lists: one unit table holding every unit once, and one
 * `lists` record holding every list once — each root list under its name,
 * each lazy-target or pattern-import list under the target's chunk
 * location — where a list names units by content identity and the lists it
 * reaches by key (`./unit-format`'s `SharedDepUnit` and
 * `SharedDepFetchList`).
 *
 * A unit appears once, keyed by its location: the same bytes emitted under
 * two package directories are two units (each importer's relative
 * specifiers resolve against its own location), and a list that reaches
 * both names the content identity once. Producer obligation: every
 * content identity a list names, every `{ unit }` edge a unit holds and
 * every key a list names is held by the manifest; the build fails
 * otherwise. Two parents that reach one lazy target with different deltas
 * leave the key holding the union of their lists.
 */

import type {
  SharedDepFetchList,
  SharedDepUnit,
} from '@gears-frontx/mfes/unit-format';

import type { ProducedFetchList } from './ProducedFetchList';

/** The unit table and the manifest-side lists derived from build-side lists. */
export interface ManifestLists {
  units: SharedDepUnit[];
  lists: Record<string, SharedDepFetchList>;
}

// @cpt-dod:cpt-template-shell-dod-unit-producer-output-fetch-lists:p1
export class ManifestListBuilder {
  protected constructor() {}

  /**
   * Build the unit table and the lists for `roots` (a name → build-side
   * list record, e.g. exposed module → list). `fail` reports a violated
   * producer obligation and never returns.
   */
  // @cpt-flow:cpt-template-shell-flow-unit-producer-output-produce:p1
  static build(
    roots: Readonly<Record<string, ProducedFetchList>>,
    fail: (message: string) => never
  ): ManifestLists {
    // @cpt-begin:cpt-template-shell-flow-unit-producer-output-produce:p1:inst-record-manifest-entries
    // @cpt-begin:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-write-units-lists-only
    const table = new Map<string, SharedDepUnit>();
    const lists: Record<string, SharedDepFetchList> = {};
    const place = (key: string, list: ProducedFetchList): void => {
      const converted = ManifestListBuilder.convert(list, table, place);
      const held = lists[key];
      lists[key] = held === undefined ? converted : ManifestListBuilder.merge(held, converted);
    };
    for (const [name, list] of Object.entries(roots)) place(name, list);
    const units = [...table.values()].sort((a, b) =>
      a.location < b.location ? -1 : a.location > b.location ? 1 : 0
    );
    ManifestListBuilder.assertClosed(units, lists, fail);
    // @cpt-begin:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-return-lists
    return { units, lists };
    // @cpt-end:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-return-lists
    // @cpt-end:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-write-units-lists-only
    // @cpt-end:cpt-template-shell-flow-unit-producer-output-produce:p1:inst-record-manifest-entries
  }

  /** The union of two manifest-side lists held under one key. */
  private static merge(a: SharedDepFetchList, b: SharedDepFetchList): SharedDepFetchList {
    // @cpt-begin:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-merge-shared-target
    // @cpt-begin:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-merge-union
    const union = (x: readonly string[] | undefined, y: readonly string[] | undefined): string[] => [
      ...new Set([...(x ?? []), ...(y ?? [])]),
    ];
    const lazy = union(a.lazy, b.lazy).sort();
    const patterns = union(a.patterns, b.patterns).sort();
    return {
      units: union(a.units, b.units),
      ownChunks: union(a.ownChunks, b.ownChunks),
      ...(lazy.length > 0 ? { lazy } : {}),
      ...(patterns.length > 0 ? { patterns } : {}),
    };
    // @cpt-end:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-merge-union
    // @cpt-end:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-merge-shared-target
  }

  /**
   * The build-side list as a manifest-side list: its units added to
   * `table`, and each nested list placed under its key through `place`.
   */
  private static convert(
    list: ProducedFetchList,
    table: Map<string, SharedDepUnit>,
    place: (key: string, list: ProducedFetchList) => void
  ): SharedDepFetchList {
    const hashes = new Set<string>();
    for (const unit of list.items) {
      if (!table.has(unit.location)) table.set(unit.location, unit);
      hashes.add(unit.contentHash);
    }
    const keysOf = (
      record: Readonly<Record<string, ProducedFetchList>> | undefined
    ): string[] | undefined => {
      if (record === undefined || Object.keys(record).length === 0) return undefined;
      const keys = Object.keys(record).sort();
      for (const key of keys) place(key, record[key]);
      return keys;
    };
    const lazy = keysOf(list.lazy);
    const patterns = keysOf(list.patterns);
    // @cpt-begin:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-emit-own-chunks
    return {
      units: [...hashes],
      ownChunks: [...list.ownChunks],
      ...(lazy !== undefined ? { lazy } : {}),
      ...(patterns !== undefined ? { patterns } : {}),
    };
    // @cpt-end:cpt-template-shell-algo-unit-producer-output-emit-fetch-lists:p1:inst-emit-own-chunks
  }

  /** Producer obligation: every identity, edge and key named is held. */
  private static assertClosed(
    units: readonly SharedDepUnit[],
    lists: Readonly<Record<string, SharedDepFetchList>>,
    fail: (message: string) => never
  ): void {
    const held = new Set(units.map((unit) => unit.contentHash));
    for (const unit of units) {
      for (const edge of unit.imports) {
        if (typeof edge !== 'string' && !held.has(edge.unit)) {
          fail(
            `[unit-producer] unit "${unit.location}" imports content ` +
              `identity ${edge.unit}, which the manifest's unit table does not hold`
          );
        }
      }
    }
    for (const [name, list] of Object.entries(lists)) {
      for (const hash of list.units) {
        if (!held.has(hash)) {
          fail(
            `[unit-producer] list "${name}" names content identity ` +
              `${hash}, which the manifest's unit table does not hold`
          );
        }
      }
      for (const key of [...(list.lazy ?? []), ...(list.patterns ?? [])]) {
        if (lists[key] === undefined) {
          fail(`[unit-producer] list "${name}" names list "${key}", which the manifest does not hold`);
        }
      }
    }
  }
}
