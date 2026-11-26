import { describe, expect, it } from 'vitest';
import type { SharedDepUnit } from '@gears-frontx/mfes/unit-format';

import { ManifestListBuilder } from '../ManifestListBuilder';
import type { ProducedFetchList } from '../ProducedFetchList';

const unit = (location: string, hash: string, imports: SharedDepUnit['imports'] = []): SharedDepUnit => ({
  location,
  contentHash: hash.repeat(64),
  answers: [location],
  imports,
});

const fail = (message: string): never => {
  throw new Error(message);
};

// @cpt-begin:cpt-template-shell-flow-unit-producer-output-produce:p1:inst-verify-own-output
// The producer verifies its own output against the producer output obligations here and in its other tests.
describe('ManifestListBuilder', () => {
  const a = unit('p@1/a.js', 'a');
  const b = unit('p@1/b.js', 'b');
  const lazyList: ProducedFetchList = { items: [b], ownChunks: ['assets/own.js'] };

  it('holds each unit once and each list once, the lazy list under its key and named by every list that reaches it', () => {
    const built = ManifestListBuilder.build(
      {
        './one': { items: [a], ownChunks: [], lazy: { 'assets/lazy.js': lazyList } },
        './two': { items: [a, b], ownChunks: [], lazy: { 'assets/lazy.js': lazyList } },
      },
      fail
    );
    expect(built.units.map((u) => u.location)).toEqual(['p@1/a.js', 'p@1/b.js']);
    expect(Object.keys(built.lists).sort()).toEqual(['./one', './two', 'assets/lazy.js']);
    expect(built.lists['./one']!.lazy).toEqual(['assets/lazy.js']);
    expect(built.lists['./two']!.lazy).toEqual(['assets/lazy.js']);
    expect(built.lists['assets/lazy.js']).toEqual({ units: [b.contentHash], ownChunks: ['assets/own.js'] });
  });

  it('holds a pattern-import list under the matching file location, named in the `patterns` array of the list that reaches it', () => {
    const built = ManifestListBuilder.build(
      {
        './one': { items: [a], ownChunks: [], patterns: { 'p@1/pattern/en.js': { items: [b], ownChunks: [] } } },
      },
      fail
    );
    expect(built.lists['./one']!.patterns).toEqual(['p@1/pattern/en.js']);
    expect(built.lists['./one']!.lazy).toBeUndefined();
    expect(built.lists['p@1/pattern/en.js']).toEqual({ units: [b.contentHash], ownChunks: [] });
  });

  it('names a content identity once in a list although two table units carry it', () => {
    const twin = unit('q@1/a.js', 'a');
    const built = ManifestListBuilder.build({ './one': { items: [a, twin], ownChunks: [] } }, fail);
    expect(built.units).toHaveLength(2);
    expect(built.lists['./one']!.units).toEqual([a.contentHash]);
  });

  it('holds the union of the lists two parents reach one lazy target with (kit `.` and `./sub` both lazily importing ./feature.js)', () => {
    const c = unit('p@1/c.js', 'c');
    const built = ManifestListBuilder.build(
      {
        '.': { items: [a], ownChunks: [], lazy: { 'assets/feature.js': { items: [b], ownChunks: ['assets/own-a.js'] } } },
        './sub': {
          items: [a],
          ownChunks: [],
          lazy: { 'assets/feature.js': { items: [b, c], ownChunks: ['assets/own-b.js'] } },
        },
      },
      fail
    );
    expect(built.lists['assets/feature.js']).toEqual({
      units: [b.contentHash, c.contentHash],
      ownChunks: ['assets/own-a.js', 'assets/own-b.js'],
    });
    expect(built.lists['.']!.lazy).toEqual(['assets/feature.js']);
    expect(built.lists['./sub']!.lazy).toEqual(['assets/feature.js']);
  });

  it('fails the build when a unit edge names a content identity the table does not hold', () => {
    const dangling = unit('p@1/c.js', 'c', [{ unit: 'f'.repeat(64) }]);
    expect(() => ManifestListBuilder.build({ './one': { items: [dangling], ownChunks: [] } }, fail)).toThrow(
      /does not hold/
    );
  });
});
// @cpt-end:cpt-template-shell-flow-unit-producer-output-produce:p1:inst-verify-own-output
