/**
 * `SharedImportCheck` — finds every name one of the MFE's own chunks
 * imports from a shared specifier that the unit answering the specifier
 * does not export. ES modules link by name: such an import fails the
 * whole MFE at load with a link error, so the build fails instead, naming
 * the chunk, the specifier and the names.
 *
 * The bindings are read as the chunk imports them after the consumer
 * barrel fallback: a rewrite the fallback turned back is checked under
 * its barrel specifier and barrel name. A namespace import (`*`) needs no
 * name, and a unit that records no export names — its surface is not
 * statically enumerable — is not checked.
 */

import type { ProducedSharedPackage } from '@gears-frontx/unit-producer';

import type { ImportingChunk } from './types';

/** Names a chunk imports from a shared specifier whose unit lacks them. */
export interface SharedImportMismatch {
  importer: string;
  specifier: string;
  missing: string[];
}

/** A produced unit as the check reads it: its export names, when recorded. */
type UnitExports = { location: string; exports?: readonly string[] };

export class SharedImportCheck {
  static findMismatches(params: {
    importers: Iterable<ImportingChunk>;
    produced: readonly ProducedSharedPackage[];
    /** Rewritten specifiers the consumer barrel fallback turned back. */
    reverted: ReadonlySet<string>;
    /** The barrel specifier and name behind a rewritten binding. */
    origin: (
      specifier: string,
      importedName: string
    ) => { barrelSpecifier: string; barrelName: string } | undefined;
  }): SharedImportMismatch[] {
    // Units by location, and the export set of each specifier once: the
    // check asks for the same specifier from every importing chunk.
    const unitsByLocation = new Map<string, UnitExports>();
    for (const pkg of params.produced) {
      for (const unit of pkg.units as readonly UnitExports[]) {
        unitsByLocation.set(unit.location, unit);
      }
    }
    const exportSets = new Map<string, ReadonlySet<string> | undefined>();
    const exportsOf = (specifier: string): ReadonlySet<string> | undefined => {
      if (exportSets.has(specifier)) return exportSets.get(specifier);
      let names: ReadonlySet<string> | undefined;
      for (const pkg of params.produced) {
        const location = pkg.entryUnits[specifier];
        if (location === undefined) continue;
        const unit = unitsByLocation.get(location);
        names = unit?.exports === undefined ? undefined : new Set(unit.exports);
        break;
      }
      exportSets.set(specifier, names);
      return names;
    };
    const mismatches: SharedImportMismatch[] = [];
    for (const importer of params.importers) {
      const bySpecifier = new Map<string, Set<string>>();
      for (const [specifier, names] of Object.entries(importer.imports)) {
        for (const name of names) {
          if (name === '*') continue;
          const origin = params.reverted.has(specifier)
            ? params.origin(specifier, name)
            : undefined;
          const target = origin?.barrelSpecifier ?? specifier;
          const set = bySpecifier.get(target) ?? new Set<string>();
          set.add(origin?.barrelName ?? name);
          bySpecifier.set(target, set);
        }
      }
      for (const [specifier, names] of [...bySpecifier].sort(([a], [b]) =>
        a < b ? -1 : a > b ? 1 : 0
      )) {
        const exported = exportsOf(specifier);
        if (exported === undefined) continue;
        const missing = [...names].filter((n) => !exported.has(n)).sort();
        if (missing.length > 0) {
          mismatches.push({ importer: importer.fileName, specifier, missing });
        }
      }
    }
    return mismatches;
  }

  /** The build failure: one line per importing chunk and specifier. */
  static formatError(mismatches: readonly SharedImportMismatch[]): string {
    const lines = mismatches.map(
      (m) => `  - '${m.importer}' imports ${m.missing.join(', ')} from '${m.specifier}'`
    );
    return (
      `[vite-plugin-mfe-gts] Chunks import names that the shared unit ` +
      `answering the specifier does not export. ES modules link by name, ` +
      `so each such import fails the MFE at load:\n${lines.join('\n')}\n` +
      `Fix: import only names the package exports, or stop sharing the ` +
      `package (share.exclude) so it is bundled into the MFE.`
    );
  }
}
