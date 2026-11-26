/**
 * `EntryScreenLedger` — one producer run's incremental entry screen
 * (the screen of the entry set against the skip index). A screen result depends on the package, the entry file
 * (both fixed for the run) and exactly the skip-index values the screen
 * read: `forSpecifier(s)`, `hasSkippedForRoot(r)`, `forFile(f)`. The
 * ledger records those reads per screened entry and keeps a reverse
 * index from each read key to the entries that read it. A skip added
 * to the index marks only the entries that read one of its keys stale;
 * every other entry's recorded result is exactly what a re-screen
 * would return, so it is returned without re-screening. The fixpoint
 * therefore reaches the same skips, in the same order, with the same
 * reasons, as screening every entry every round.
 */

import type {
  EntryScreen,
  ScreenedPackage,
  ScreenFailure,
  SkipLookup,
} from './EntryScreen';
import type { SkipAddition, SkippedEntryIndex } from './SkippedEntryIndex';

interface ScreenRecord {
  failure: ScreenFailure | undefined;
  /** The skip-index keys the screen read. */
  reads: readonly string[];
  stale: boolean;
}

const specKey = (specifier: string): string => `s\0${specifier}`;
const rootKey = (root: string): string => `r\0${root}`;
const fileKey = (file: string): string => `f\0${file}`;

export class EntryScreenLedger {
  private readonly records = new WeakMap<object, Map<string, ScreenRecord>>();
  private readonly readers = new Map<string, Set<ScreenRecord>>();
  /** How many skip additions have been applied to the reverse index. */
  private applied = 0;

  constructor(
    private readonly screen: EntryScreen,
    private readonly skipped: SkippedEntryIndex
  ) {}

  /** The screen failure of `file` against the skip index as it stands now. */
  async failure(
    dep: ScreenedPackage,
    file: string
  ): Promise<ScreenFailure | undefined> {
    this.applyNewSkips();
    let byFile = this.records.get(dep);
    if (byFile === undefined) {
      byFile = new Map();
      this.records.set(dep, byFile);
    }
    const known = byFile.get(file);
    if (known !== undefined && !known.stale) return known.failure;

    const startedAt = this.skipped.additionCount();
    const reads = new Set<string>();
    const skipped = this.skipped;
    const tracked: SkipLookup = {
      forSpecifier: (specifier) => {
        reads.add(specKey(specifier));
        return skipped.forSpecifier(specifier);
      },
      hasSkippedForRoot: (root) => {
        reads.add(rootKey(root));
        return skipped.hasSkippedForRoot(root);
      },
      forFile: (resolvedFile) => {
        reads.add(fileKey(resolvedFile));
        return skipped.forFile(resolvedFile);
      },
    };
    const { failure } = await this.screen.screen(dep, file, tracked);
    const record: ScreenRecord = { failure, reads: [...reads], stale: false };
    byFile.set(file, record);
    for (const key of record.reads) {
      let set = this.readers.get(key);
      if (set === undefined) {
        set = new Set();
        this.readers.set(key, set);
      }
      set.add(record);
    }
    // A skip added while the screen awaited may already have changed a
    // value it read: the record is stale from the start.
    const readSet = new Set(record.reads);
    for (const addition of this.skipped.additionsSince(startedAt)) {
      if (EntryScreenLedger.keysOf(addition).some((k) => readSet.has(k))) {
        this.markStale(record);
        break;
      }
    }
    return failure;
  }

  /** Marks stale every recorded entry that read a key a new skip changed. */
  private applyNewSkips(): void {
    for (const addition of this.skipped.additionsSince(this.applied)) {
      for (const key of EntryScreenLedger.keysOf(addition)) {
        const set = this.readers.get(key);
        if (set === undefined) continue;
        for (const record of [...set]) this.markStale(record);
      }
    }
    this.applied = this.skipped.additionCount();
  }

  private markStale(record: ScreenRecord): void {
    if (record.stale) return;
    record.stale = true;
    for (const key of record.reads) this.readers.get(key)?.delete(record);
  }

  /** The read keys whose value one skip addition changes. */
  private static keysOf(addition: SkipAddition): string[] {
    const keys = [specKey(addition.specifier), fileKey(addition.file)];
    if (addition.newRoot) keys.push(rootKey(addition.root));
    return keys;
  }
}
