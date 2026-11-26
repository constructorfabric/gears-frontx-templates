/**
 * `SkippedEntryIndex` — the build-wide record of entries a
 * production-runtime screen dropped: every skipped entry's
 * specifier (`pkg/testing`) and resolved file, with the reason it can
 * never load in a production browser runtime. The entry-screen consults
 * it while walking a closure — an entry of any package whose closure
 * reaches a skipped entry (by its specifier, or by any specifier that
 * resolves to the skipped file) is itself skipped, which is the
 * transitive fixpoint; and the list gates name the recorded reason when
 * a runtime actually imports a skipped entry.
 */

/** One recorded skip, in recording order — what it changed in the index. */
export interface SkipAddition {
  specifier: string;
  file: string;
  root: string;
  /** Whether the skip gave its root its first skipped entry. */
  newRoot: boolean;
}

export class SkippedEntryIndex {
  private readonly bySpecifier = new Map<string, string>();
  private readonly byFile = new Map<string, { specifier: string; reason: string }>();
  private readonly roots = new Set<string>();
  private readonly additions: SkipAddition[] = [];

  /** Records one skipped entry: its specifier, resolved file, reason. */
  add(specifier: string, file: string, reason: string): void {
    if (this.bySpecifier.has(specifier)) return;
    this.bySpecifier.set(specifier, reason);
    this.byFile.set(file, { specifier, reason });
    const root = SkippedEntryIndex.rootOf(specifier);
    const newRoot = !this.roots.has(root);
    this.roots.add(root);
    this.additions.push({ specifier, file, root, newRoot });
  }

  /** How many skips have been recorded so far. */
  additionCount(): number {
    return this.additions.length;
  }

  /** The skips recorded after the first `count`, in recording order. */
  additionsSince(count: number): readonly SkipAddition[] {
    return this.additions.slice(count);
  }

  /** The skip reason when `specifier` itself names a skipped entry. */
  forSpecifier(specifier: string): string | undefined {
    return this.bySpecifier.get(specifier);
  }

  /**
   * The skip reason when `resolvedFile` (real path) is a skipped
   * entry's file, plus the skipped entry's own specifier for messages.
   */
  forFile(
    resolvedFile: string
  ): { specifier: string; reason: string } | undefined {
    return this.byFile.get(resolvedFile);
  }

  /**
   * Whether `root` (a package root name) has any skipped entries —
   * only then does a specifier into that package need a file-level
   * look-up.
   */
  hasSkippedForRoot(root: string): boolean {
    return this.roots.has(root);
  }

  private static rootOf(specifier: string): string {
    if (specifier.startsWith('@')) {
      const parts = specifier.split('/');
      return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier;
    }
    const slash = specifier.indexOf('/');
    return slash === -1 ? specifier : specifier.slice(0, slash);
  }
}
