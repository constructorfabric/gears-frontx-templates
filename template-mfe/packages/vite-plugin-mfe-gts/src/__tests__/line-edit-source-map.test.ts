/**
 * `LineEditSourceMap` maps every line a transform kept back to its original
 * line, token by token, and an inserted or replaced line to nothing. Past
 * the edit limit only the common leading and trailing lines are mapped.
 */

import { describe, expect, it } from 'vitest';

import { LineEditSourceMap } from '../LineEditSourceMap';

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Generated line → the original lines its segments point at. */
function originalLines(mappings: string): Array<number[]> {
  let originalLine = 0;
  return mappings.split(';').map((line) => {
    if (line === '') return [];
    return line.split(',').map((segment) => {
      const values: number[] = [];
      let shift = 0;
      let value = 0;
      for (const char of segment) {
        const digit = BASE64.indexOf(char);
        value += (digit & 31) << shift;
        if (digit & 32) {
          shift += 5;
          continue;
        }
        values.push(value & 1 ? -(value >> 1) : value >> 1);
        shift = 0;
        value = 0;
      }
      originalLine += values[2];
      return originalLine;
    });
  });
}

const kept = (original: string, transformed: string): Array<number | undefined> =>
  originalLines(LineEditSourceMap.of(original, transformed, 'm.js').mappings).map((l) => l[0]);

describe('LineEditSourceMap', () => {
  it('maps the lines after an insertion to their original lines', () => {
    expect(kept('a\nb\nc\n', 'a\nX\nb\nc\n')).toEqual([0, undefined, 1, 2]);
  });

  it('leaves a replaced line unmapped and keeps its neighbours', () => {
    expect(kept('a\nb\nc\n', 'a\nB\nc\n')).toEqual([0, undefined, 2]);
  });

  it('carries the source and its content', () => {
    const map = LineEditSourceMap.of('a\n', 'a\nb\n', 'm.js');
    expect(map).toMatchObject({ version: 3, sources: ['m.js'], sourcesContent: ['a\n'] });
  });

  it('maps only the common leading and trailing lines past the edit limit', () => {
    const lines = (prefix: string): string[] => Array.from({ length: 2500 }, (_, i) => `${prefix}${i};\n`);
    const original = ['head\n', ...lines('o'), 'keep\n', 'x\n', 'tail\n'].join('');
    const transformed = ['head\n', ...lines('n'), 'keep\n', 'y\n', 'tail\n'].join('');
    const result = kept(original, transformed);
    expect(result[0]).toBe(0);
    expect(result[result.length - 1]).toBe(original.split('\n').length - 2);
    // `keep` is a kept line, but only a full line diff would find it.
    expect(result[result.length - 3]).toBeUndefined();
    expect(result.slice(1, 2501).every((l) => l === undefined)).toBe(true);
  });
});
