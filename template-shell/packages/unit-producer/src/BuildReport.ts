/**
 * `BuildReport` — formats one line of the per-MFE build report for a
 * shared dep: unit mode, barrel mode, emitted
 * chunk bytes, and the fallback reason.
 */

export class BuildReport {
  static formatLine(record: {
    name: string;
    version: string;
    unitMode: 'units' | 'single';
    barrelMode: 'rewritten' | 'not-needed' | 'kept';
    unitBytes: number;
    packBytes: number;
    fallbackReason?: string;
    barrelKeptReason?: string;
  }): string {
    const parts = [
      `${record.name}@${record.version}`,
      `unit=${record.unitMode}`,
      `barrel=${record.barrelMode}`,
      `reachable=${record.unitBytes}B`,
      `total=${record.packBytes}B`,
    ];
    if (record.fallbackReason) parts.push(`fallback="${record.fallbackReason}"`);
    if (record.barrelKeptReason) {
      parts.push(`barrel-kept="${record.barrelKeptReason}"`);
    }
    return `  [unit-producer] report: ${parts.join(' ')}`;
  }

  /**
   * Warns that a CommonJS package is always delivered whole: importing
   * any of its bindings pulls the whole package — chunks can never narrow
   * it — so a fat CJS barrel (a `lodash`-style index) costs every
   * consumer the package's full bytes.
   */
  static cjsWholePackageWarning(name: string): string {
    return (
      `  [unit-producer] warning: ${name} is CommonJS — every import ` +
        `of it downloads the whole package; prefer per-method or ESM ` +
        `imports where the package offers them`
    );
  }

  /**
   * The unsplittable-barrel line:
   * `package@version · entry · reason · one-line fix`.
   */
  static formatUnsplittableBarrelLine(
    packageAtVersion: string,
    entry: string,
    reason: string,
    fix: string
  ): string {
    return (
      `  [unit-producer] barrel kept: ${packageAtVersion} · ${entry} · ` +
        `${reason} · fix: ${fix}`
    );
  }

  /**
   * The version-drift line: when the same shared
   * package resolves at different versions across the runtimes in a
   * build, the report names the package and the versions.
   */
  static formatVersionDriftLine(
    name: string,
    thisVersion: string,
    peerVersion: string
  ): string {
    return `version-drift: ${name} — ${thisVersion} (this runtime) vs ${peerVersion} (another runtime)`;
  }
}
