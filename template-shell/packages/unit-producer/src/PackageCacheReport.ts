/**
 * `PackageCacheReport` — per-package build-cache outcomes for the
 * build report: `hit` (served from the cache), `miss` (computed, then
 * stored) or `disabled` (no cache dir). Entries are sorted by
 * `name@version` on output, so the record never depends on the order
 * parallel package work finished in.
 */

export type CacheOutcome = 'hit' | 'miss' | 'disabled';

export interface PackageCacheEntry {
  name: string;
  version: string;
  outcome: CacheOutcome;
}

export interface PackageCacheSummary {
  hits: number;
  misses: number;
  packages: PackageCacheEntry[];
}

export class PackageCacheReport {
  private readonly entries = new Map<string, PackageCacheEntry>();

  record(name: string, version: string, outcome: CacheOutcome): void {
    this.entries.set(`${name}@${version}`, { name, version, outcome });
  }

  toSummary(): PackageCacheSummary {
    const packages = [...this.entries.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, entry]) => entry);
    return {
      hits: packages.filter((p) => p.outcome === 'hit').length,
      misses: packages.filter((p) => p.outcome === 'miss').length,
      packages,
    };
  }
}
