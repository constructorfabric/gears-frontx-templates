/**
 * `BootDataComposer` — merges the producer's per-specifier fetch lists
 * into the shell's inline boot data: one boot list covering every shared
 * specifier the host chunks import statically. The boot list names the
 * units by content identity (`./unit-format`'s `SharedDepFetchList`) and
 * the plugin embeds the units it names beside it; the units of the
 * dynamically imported specifiers and of the own lazy chunks are produced
 * and validated here but need no embedded list — the import map resolves
 * them natively.
 */

import type {
  SharedDepFetchList,
  SharedDepUnit,
} from '@gears-frontx/mfes/unit-format';
import type {
  OpaqueImportReport,
  ProducedFetchList,
  ProducedSharedPackage,
} from '@gears-frontx/unit-producer';

/** The boot fields this composer fills. */
export interface ComposedBootLists {
  /** The boot list: the units the boot-evaluated host chunks need. */
  list: SharedDepFetchList;
  /** The units the boot list names, one per location, in location order. */
  bootUnits: SharedDepUnit[];
  /** Every opaque `import(expr)` seen across the merged lists. */
  opaqueImports: OpaqueImportReport[];
}

const byLocation = (a: SharedDepUnit, b: SharedDepUnit): number =>
  a.location < b.location ? -1 : a.location > b.location ? 1 : 0;

export class BootDataComposer {
  /**
   * Merge `produced` into the boot list.
   *
   * @param staticSpecifiers  shared specifiers the host chunks import
   *   statically — their units go on the boot list.
   * @param dynamicSpecifiers shared specifiers the host chunks import
   *   dynamically — each must have an emitted list.
   * @param lazyChunks  emitted own chunks reached through `import()`,
   *   each with the shared specifiers it reaches — each specifier must
   *   have an emitted list.
   * @param onError  fatal-reporting callback: a reached specifier with
   *   no emitted list fails the build naming the entry and the specifier
   *   (list completeness — never a silent skip).
   */
  static compose(options: {
    produced: readonly ProducedSharedPackage[];
    staticSpecifiers: readonly string[];
    dynamicSpecifiers: readonly string[];
    lazyChunks: ReadonlyMap<string, ReadonlySet<string>>;
    onError: (message: string) => never;
  }): ComposedBootLists {
    const { produced, staticSpecifiers, dynamicSpecifiers, lazyChunks, onError } = options;
    const items = new Map<string, SharedDepUnit>();
    const opaqueImports: OpaqueImportReport[] = [];
    const opaqueSeen = new Set<string>();

    const listOf = (specifier: string): ProducedFetchList | undefined => {
      for (const pkg of produced) {
        const found = pkg.lists[specifier];
        if (found !== undefined) return found;
      }
      return undefined;
    };

    // A requested specifier the producer emitted no list for leaves a
    // bare specifier in a host chunk no minted chunk answers — the
    // composer fails naming the entry and the specifier.
    const requireList = (entry: string, spec: string): ProducedFetchList => {
      const list = listOf(spec);
      if (list === undefined) {
        return onError(
          `[vite-plugin-shell] ${entry} reaches shared specifier ` +
            `"${spec}", but no fetch list was emitted for it`
        );
      }
      return list;
    };

    for (const spec of staticSpecifiers) {
      const list = requireList('the shell boot entry', spec);
      for (const item of list.items) {
        // Units dedupe by location, not content identity: identical
        // bytes emitted under two package directories are distinct
        // units — each importer's relative specifiers resolve
        // against its own location.
        if (!items.has(item.location)) items.set(item.location, item);
      }
      for (const opaque of list.opaqueImports ?? []) {
        const key = `${opaque.file}:${opaque.line}`;
        if (!opaqueSeen.has(key)) {
          opaqueSeen.add(key);
          opaqueImports.push(opaque);
        }
      }
    }
    for (const spec of dynamicSpecifiers) {
      requireList('a dynamically imported host chunk', spec);
    }
    for (const [fileName, specifiers] of lazyChunks) {
      for (const spec of specifiers) requireList(`lazy chunk "${fileName}"`, spec);
    }

    const bootUnits = [...items.values()].sort(byLocation);
    return {
      list: {
        units: [...new Set(bootUnits.map((unit) => unit.contentHash))],
        ownChunks: [],
      },
      bootUnits,
      opaqueImports,
    };
  }
}
