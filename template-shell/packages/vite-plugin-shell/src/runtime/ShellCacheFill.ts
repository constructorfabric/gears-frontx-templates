/**
 * The realm-cache fill: it starts when the fill
 * chunk has loaded, which is after the shell entry has run (document
 * order) and so after the MFE handler has published the realm cache,
 * never before; it does not wait for window load. It refills the realm content-identity text
 * cache from the build's boot list by re-fetching the same URLs through
 * `SharedUnitFetcher` (fetch → cache admit under the declared content
 * hash). Every unit's in-flight fetch is published under its content
 * identity at once; fill and MFE loads join each other's in-flight
 * entries whichever publishes first, so a unit is downloaded once and an
 * MFE waits only for the units it needs, never the whole fill. MFE loads reuse those sources and mint their own
 * instances. The listed `contentHash` is trusted as declared: the shell
 * computes and verifies no hash.
 *
 * The re-fetch rides the HTTP cache: the immutable content-addressed
 * URLs were already fetched by the native load, so the fill's requests
 * are answered without a second download when dist is served with
 * cacheable headers.
 * Units dedupe by content identity (one `chunk:<hash>` entry each). A
 * failed fill is reported on the console and never crashes the page —
 * the shell itself is already up, and an MFE load simply refetches any
 * text the cache lacks.
 *
 * One class per file (`runtime_style`).
 */

import {
  SharedAssetUrlResolver,
  SharedUnitFetcher,
} from '@gears-frontx/mfes/unit-loader';
import type {
  SharedDepFetchList,
  SharedDepUnit,
} from '@gears-frontx/mfes/unit-format';

/** The build-time data the plugin embeds inline in the fill chunk. */
export interface ShellCacheFillData {
  /** Directory URL (document-relative) the shared-file locations resolve under. */
  unitsBase: string;
  /** The unit table: every unit the boot list names. */
  units: SharedDepUnit[];
  /** The boot entry's fetch list — the units the cache is filled with. */
  list: SharedDepFetchList;
}

const ENTRY_ID = 'shell-cache-fill';

export class ShellCacheFill {
  protected constructor() {}

  /**
   * Fill the realm text cache from the boot list. Resolves to a report
   * of what was filled and what failed — failures are logged, never
   * thrown: the page is already booted and an empty cache slot only
   * costs an MFE load a refetch.
   */
  static async run(
    data: ShellCacheFillData,
    deps?: {
      fetchText?: (url: string) => Promise<string>;
      documentBase?: string;
    }
  ): Promise<{ filled: number; failed: number }> {
    const documentBase =
      deps?.documentBase ??
      (typeof document !== 'undefined' ? document.baseURI : undefined);
    if (documentBase === undefined) {
      console.error(`${ENTRY_ID}: no document to resolve build data against`);
      return { filled: 0, failed: 0 };
    }
    const unitsBase = new URL(data.unitsBase, documentBase).href;
    const fetchText =
      deps?.fetchText ??
      (async (url: string): Promise<string> => {
        // The boot's HTTP-cache copies serve the re-fetch, and it
        // yields to every other request.
        const response = await fetch(url, {
          cache: 'force-cache',
          priority: 'low',
        });
        if (!response.ok) {
          throw new Error(
            `${ENTRY_ID}: fetch '${url}' failed with ${response.status}`
          );
        }
        return response.text();
      });
    const fetcher = new SharedUnitFetcher(fetchText, ENTRY_ID);

    // One cache entry per content identity — the same hash under
    // several locations is one payload, one realm-cache slot.
    const table = new Map<string, SharedDepUnit>();
    for (const unit of data.units) {
      if (!table.has(unit.contentHash)) table.set(unit.contentHash, unit);
    }
    const items = [...new Set(data.list.units)].flatMap((hash) => {
      const unit = table.get(hash);
      return unit === undefined ? [] : [unit];
    });
    const settled = await Promise.allSettled(
      items.map(async (item) =>
        fetcher.fetch(
          SharedAssetUrlResolver.resolve(item.location, unitsBase, ENTRY_ID),
          item.contentHash
        )
      )
    );
    const failures = settled.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected'
    );
    if (failures.length > 0) {
      console.error(
        `[${ENTRY_ID}] ${failures.length} of ${items.length} boot-list ` +
          `item(s) failed the realm-cache fill; MFE loads will refetch them:`,
        failures.map((f) => (f.reason instanceof Error ? f.reason.message : f.reason))
      );
    }
    return { filled: items.length - failures.length, failed: failures.length };
  }
}
