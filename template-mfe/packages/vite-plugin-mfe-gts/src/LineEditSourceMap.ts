/**
 * `LineEditSourceMap` — the source map of a transform that replaces or
 * inserts whole statements and leaves every other line as it was (the
 * consumer barrel rewrite, the injected shared-package stylesheet
 * imports). The two texts are compared line by line; every line the
 * transform kept maps back to its original line, token by token, and an
 * inserted or replaced line maps nowhere. Rollup composes the map with
 * the later transforms' maps, so code after an edit keeps its original
 * positions.
 *
 * The map is derived from the two texts because the transforms that use it
 * return the rewritten code, not the edits they made; a diff dependency
 * would add a package for what a line-level edit script and a VLQ encoder
 * cover in this file.
 */

/** The raw map Rollup accepts from a `transform` hook. */
export interface LineEditMap {
  version: 3;
  sources: string[];
  sourcesContent: string[];
  names: string[];
  mappings: string;
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Past this many line edits the texts are not a statement-level edit of
 * each other: only their common leading and trailing lines are mapped.
 */
const MAX_EDIT_DISTANCE = 2000;

export class LineEditSourceMap {
  static of(original: string, transformed: string, source: string): LineEditMap {
    const before = LineEditSourceMap.lines(original);
    const after = LineEditSourceMap.lines(transformed);
    const originalLineOf = LineEditSourceMap.keptLines(before, after);
    let mappings = '';
    let previousOriginalLine = 0;
    let previousOriginalColumn = 0;
    after.forEach((line, generatedLine) => {
      if (generatedLine > 0) mappings += ';';
      const originalLine = originalLineOf.get(generatedLine);
      if (originalLine === undefined) return;
      let previousColumn = 0;
      const segments: string[] = [];
      for (const token of line.matchAll(/\S+/g)) {
        const column = token.index ?? 0;
        segments.push(
          LineEditSourceMap.vlq(column - previousColumn) +
            LineEditSourceMap.vlq(0) +
            LineEditSourceMap.vlq(originalLine - previousOriginalLine) +
            LineEditSourceMap.vlq(column - previousOriginalColumn)
        );
        previousColumn = column;
        previousOriginalLine = originalLine;
        previousOriginalColumn = column;
      }
      mappings += segments.join(',');
    });
    return {
      version: 3,
      sources: [source],
      sourcesContent: [original],
      names: [],
      mappings,
    };
  }

  /** The text's lines, each with its terminator. */
  private static lines(text: string): string[] {
    return text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  }

  /**
   * Generated line → original line, for every line the shortest line
   * edit (Myers) keeps.
   */
  private static keptLines(a: readonly string[], b: readonly string[]): Map<number, number> {
    const kept = new Map<number, number>();
    let start = 0;
    while (start < a.length && start < b.length && a[start] === b[start]) {
      kept.set(start, start);
      start++;
    }
    let endA = a.length;
    let endB = b.length;
    while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
      endA--;
      endB--;
      kept.set(endB, endA);
    }
    const n = endA - start;
    const m = endB - start;
    const max = Math.min(n + m, MAX_EDIT_DISTANCE);
    const offset = max + 1;
    const v = new Int32Array(2 * max + 3);
    const trace: Int32Array[] = [];
    for (let d = 0; d <= max; d++) {
      trace.push(v.slice());
      for (let k = -d; k <= d; k += 2) {
        let x =
          k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])
            ? v[offset + k + 1]
            : v[offset + k - 1] + 1;
        let y = x - k;
        while (x < n && y < m && a[start + x] === b[start + y]) {
          x++;
          y++;
        }
        v[offset + k] = x;
        if (x >= n && y >= m) {
          LineEditSourceMap.backtrack(trace, offset, n, m, (i, j) =>
            kept.set(start + j, start + i)
          );
          return kept;
        }
      }
    }
    return kept;
  }

  private static backtrack(
    trace: readonly Int32Array[],
    offset: number,
    n: number,
    m: number,
    keep: (i: number, j: number) => void
  ): void {
    let x = n;
    let y = m;
    for (let d = trace.length - 1; d >= 0; d--) {
      const v = trace[d];
      const k = x - y;
      const previousK =
        k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? k + 1 : k - 1;
      const previousX = v[offset + previousK];
      const previousY = previousX - previousK;
      while (x > previousX && y > previousY) {
        x--;
        y--;
        keep(x, y);
      }
      if (d > 0) {
        x = previousX;
        y = previousY;
      }
    }
  }

  private static vlq(value: number): string {
    let rest = value < 0 ? (-value << 1) | 1 : value << 1;
    let out = '';
    do {
      let digit = rest & 31;
      rest >>>= 5;
      if (rest > 0) digit |= 32;
      out += BASE64[digit];
    } while (rest > 0);
    return out;
  }
}
