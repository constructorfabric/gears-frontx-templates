/**
 * The build-side shape of one flat fetch list: the units a list delivers
 * carried inline, with the nested lazy-target and pattern-import lists
 * inline too. Composers merge these across packages; the manifest-side
 * contract shape (`SharedDepUnit` table plus lists naming units by content
 * identity) is derived from them by `ManifestListBuilder`.
 */

import type { SharedDepUnit } from '@gears-frontx/mfes/unit-format';

/** A fully opaque `import(expr)` the producer reports in its own output. */
export interface OpaqueImportReport {
  /** The emitted file carrying the call, as a location relative to the shared base. */
  file: string;
  /** The 1-based line of the `import(` call inside `file`. */
  line: number;
  /** The argument's source text, when the producer can record it. */
  expression?: string;
}

/** One flat fetch list, units inline. */
export interface ProducedFetchList {
  /** The units this list delivers. */
  items: SharedDepUnit[];
  /** The microfrontend's own chunks the module or target reaches statically. */
  ownChunks: string[];
  /** Lazy-target lists keyed by the target's chunk location. */
  lazy?: Record<string, ProducedFetchList>;
  /** Pattern-import lists keyed by the matching file's location. */
  patterns?: Record<string, ProducedFetchList>;
  /** Opaque-import report entries; never part of the manifest. */
  opaqueImports?: OpaqueImportReport[];
}
