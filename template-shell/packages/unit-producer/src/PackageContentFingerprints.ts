/**
 * `PackageContentFingerprints` — the content fingerprint of a package
 * directory, read from disk once per directory. A package is
 * fingerprinted twice in one build: as the package whose computation is
 * cached (its own key) and as a dependency of every package that reads
 * it (their keys). One memo serves both, and every producer of one
 * host produce call can share it: a package's files do not change
 * between the producers of one call.
 */

import { PackageBuildCache } from './PackageBuildCache';

export class PackageContentFingerprints {
  private readonly digests = new Map<string, string>();

  /** The fingerprint of `packageDir`'s files folded with `mix`. */
  of(packageDir: string, mix = ''): string {
    let digests = this.digests.get(packageDir);
    if (digests === undefined) {
      digests = PackageBuildCache.fileDigests(packageDir);
      this.digests.set(packageDir, digests);
    }
    return PackageBuildCache.fingerprint(packageDir, mix, digests);
  }
}
