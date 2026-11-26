/**
 * `MfeManifestEnricher` — merges the package's `mfe.json` with the
 * federation `mf-manifest.json` into `dist/mfe-manifest.json`: the closed
 * served manifest (`id`, `metaData{publicPath, sharedBase?}`, `units?`,
 * `lists?` — shared code is described by `units` and `lists` alone, with no
 * `shared` entry) and per-entry `exposeAssets { js: { sync }, css: { sync, async } }` — only the
 * fields the runtime contract lists.
 */

import type { SharedDepFetchList, SharedDepUnit } from '@gears-frontx/mfes/unit-format';
import type { MfManifest } from '@gears-frontx/mfes';
import type {
  EnrichedMfeJson,
  FederationExpose,
  FederationManifest,
  MfeJson,
  MfeJsonEntry,
} from './types';

export class MfeManifestEnricher {
  enrich(
    mfeJson: MfeJson,
    mfManifest: FederationManifest,
    options?: {
      /** Shared-file base written into metaData (`'./<sharedOutDir>/'`). */
      sharedBase?: string;
      /** The unit table the plugin composed. */
      units?: readonly SharedDepUnit[];
      /** Per-expose fetch lists the plugin composed, naming units by content identity. */
      lists?: Readonly<Record<string, SharedDepFetchList>>;
    }
  ): EnrichedMfeJson {
    for (const entry of mfeJson.entries) {
      if (entry.manifest !== mfeJson.manifest.id) {
        throw new Error(
          `[vite-plugin-mfe-gts] Entry "${entry.id}" names manifest ` +
            `"${entry.manifest}", but the package's manifest is ` +
            `"${mfeJson.manifest.id}": an entry references the registered ` +
            `manifest by its identifier`
        );
      }
    }
    const entries = this.buildEntries(mfeJson.entries, mfManifest.exposes);

    const manifest: MfManifest = {
      id: mfeJson.manifest.id,
      metaData: {
        publicPath: mfManifest.metaData.publicPath,
        ...(options?.sharedBase !== undefined
          ? { sharedBase: options.sharedBase }
          : {}),
      },
      ...(options?.units !== undefined && options.units.length > 0
        ? { units: [...options.units] }
        : {}),
      ...(options?.lists !== undefined && Object.keys(options.lists).length > 0
        ? { lists: { ...options.lists } }
        : {}),
    };

    return { ...mfeJson, manifest, entries };
  }

  private buildEntries(
    mfeEntries: MfeJsonEntry[],
    mfExposes: FederationExpose[]
  ): EnrichedMfeJson['entries'] {
    const exposesIndex = new Map(mfExposes.map((e) => [e.path, e]));
    return mfeEntries.map((entry) => {
      const expose = exposesIndex.get(entry.exposedModule);
      if (!expose) {
        throw new Error(
          `[vite-plugin-mfe-gts] No expose in mf-manifest.json matches ` +
            `entry exposedModule "${entry.exposedModule}"`
        );
      }
      return {
        ...entry,
        exposeAssets: {
          js: { sync: expose.assets.js.sync },
          css: {
            sync: expose.assets.css.sync,
            async: expose.assets.css.async ?? [],
          },
        },
      };
    });
  }
}
