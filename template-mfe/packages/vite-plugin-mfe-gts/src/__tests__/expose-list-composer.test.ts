import { describe, expect, it } from 'vitest';
import type {
  SharedDepFetchList,
  SharedDepUnit,
} from '@gears-frontx/mfes/unit-format';
import type {
  ProducedFetchList,
  ProducedSharedPackage,
} from '@gears-frontx/unit-producer';

import { ExposeListComposer } from '../ExposeListComposer';

/**
 * Scenario: a lazy chunk's list is held once and named by every
 * expose list that reaches it. A unit that list keeps must have every
 * internal import — `{unit}` edges, bare specifiers — resolve to a unit
 * the list itself or ITS parent chain delivers. The parent chain is
 * whichever expose list loads the lazy chunk, so a reached chunk carried
 * by only SOME exposes can never be skipped: under an expose that lacks
 * it the edge dangles and the load would need a further request.
 */

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);
const HASH_R = 'd'.repeat(64);

function item(
  location: string,
  contentHash: string,
  answers: string[],
  imports: SharedDepUnit['imports'] = []
): SharedDepUnit {
  return { location, contentHash, answers, imports };
}

/** A manifest list's units, resolved through the unit table. */
function unitsOf(
  units: readonly SharedDepUnit[],
  list: SharedDepFetchList
): SharedDepUnit[] {
  return list.units.map((hash) => units.find((u) => u.contentHash === hash)!);
}

/**
 * `shared-pkg` emits two entry lists:
 * - `shared-pkg/reexp` answers through a re-export item R whose
 *   `{item}` edges reach chunks A and C.
 * - `shared-pkg/only` delivers chunk C too (a chunk several lists carry).
 */
function produced(): ProducedSharedPackage[] {
  const reexp: ProducedFetchList = {
    ownChunks: [],
    items: [
      item(
        'shared-pkg@1.0.0/body-b.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.js',
        HASH_B,
        [],
        []
      ),
      item(
        'shared-pkg@1.0.0/body-c.cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc.js',
        HASH_C,
        [],
        []
      ),
      item(
        'shared-pkg@1.0.0/reexp.dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd.js',
        HASH_R,
        ['shared-pkg/reexp'],
        [{ unit: HASH_B }, { unit: HASH_C }, 'shared-pkg/helpers']
      ),
      item(
        'shared-pkg@1.0.0/helpers.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.js',
        HASH_A,
        ['shared-pkg/helpers'],
        []
      ),
    ],
  };
  const only: ProducedFetchList = {
    ownChunks: [],
    items: [
      item(
        'shared-pkg@1.0.0/body-c.cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc.js',
        HASH_C,
        [],
        []
      ),
      item(
        'shared-pkg@1.0.0/only.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.js',
        HASH_A,
        ['shared-pkg/only'],
        []
      ),
    ],
  };
  const base: ProducedFetchList = {
    ownChunks: [],
    items: [
      item(
        'shared-pkg@1.0.0/base.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.js',
        HASH_B,
        ['shared-pkg/base'],
        []
      ),
    ],
  };
  return [
    {
      name: 'shared-pkg',
      version: '1.0.0',
      packLocation: 'shared-pkg@1.0.0/reexp.d.js',
      unitMode: 'units',
      units: [],
      entryUnits: {},
      lists: {
        'shared-pkg/reexp': reexp,
        'shared-pkg/only': only,
        'shared-pkg/base': base,
      },
      transitive: false,
      chunkBytes: 0,
      barrelMode: 'not-needed',
    },
  ];
}

describe('ExposeListComposer — lazy delta closure', () => {
  it('keeps every unit its units reach that not every expose delivers', () => {
    const composed = ExposeListComposer.compose({
      produced: produced(),
      // Expose "./one" reaches `shared-pkg/only` (carries chunk C);
      // expose "./two" does not. Both reference the lazy delta.
      exposeSpecifiers: new Map([
        ['./one', ['shared-pkg/only']],
        ['./two', ['shared-pkg/base']],
      ]),
      // The lazy chunk reaches `shared-pkg/reexp` — its list answers
      // the specifier through a re-export unit whose {unit} edges
      // reach chunks B and C. C is delivered only by expose "./one".
      lazyChunkSpecifiers: new Map([['assets/lazy.js', ['shared-pkg/reexp']]]),
      exposeOwnChunks: new Map(),
      lazyChunkOwnChunks: new Map(),
      onError: (m) => {
        throw new Error(m);
      },
    });
    const exposeTwo = composed.lists['./two'];
    expect(exposeTwo).toBeDefined();
    // The lazy chunk's list is held once under its key and named by the expose.
    expect(exposeTwo.lazy).toContain('assets/lazy.js');
    const deltaList = composed.lists['assets/lazy.js'];
    expect(deltaList).toBeDefined();
    const exposeUnits = unitsOf(composed.units, exposeTwo);
    const deltaUnits = unitsOf(composed.units, deltaList!);

    // The delta must close under expose "./two" alone: every {unit}
    // edge and bare specifier of every delivered unit resolves on the
    // delta or "./two"'s list — C joins the delta because "./two"
    // does not deliver it.
    const chain = new Set([...exposeUnits, ...deltaUnits].map((i) => i.contentHash));
    const answers = new Set([...exposeUnits, ...deltaUnits].flatMap((i) => i.answers));
    for (const it of deltaUnits) {
      for (const edge of it.imports) {
        if (typeof edge === 'string') {
          expect(answers.has(edge), `specifier "${edge}"`).toBe(true);
        } else {
          expect(chain.has(edge.unit), `{unit} ${edge.unit}`).toBe(true);
        }
      }
    }
    expect(
      deltaUnits.some((i) => i.contentHash === HASH_C),
      'chunk C must join the delta — expose "./two" does not deliver it'
    ).toBe(true);
  });

  it('holds every unit once in the table, and every list names only units the table holds', () => {
    const composed = ExposeListComposer.compose({
      produced: produced(),
      exposeSpecifiers: new Map([
        ['./one', ['shared-pkg/only']],
        ['./two', ['shared-pkg/only', 'shared-pkg/base']],
      ]),
      lazyChunkSpecifiers: new Map([['assets/lazy.js', ['shared-pkg/reexp']]]),
      exposeOwnChunks: new Map(),
      lazyChunkOwnChunks: new Map(),
      onError: (m) => {
        throw new Error(m);
      },
    });
    const locations = composed.units.map((u) => u.location);
    expect(new Set(locations).size).toBe(locations.length);
    const held = new Set(composed.units.map((u) => u.contentHash));
    for (const list of Object.values(composed.lists)) {
      for (const hash of list.units) expect(held.has(hash)).toBe(true);
      for (const key of [...(list.lazy ?? []), ...(list.patterns ?? [])]) {
        expect(composed.lists[key]).toBeDefined();
      }
    }
  });
});

describe('ExposeListComposer — ownChunks', () => {
  const compose = (
    exposeOwnChunks: Map<string, string[]>,
    lazyChunkOwnChunks: Map<string, string[]>,
    lazyChunkSpecifiers = new Map([['assets/lazy.js', ['shared-pkg/only']]])
  ) =>
    ExposeListComposer.compose({
      produced: produced(),
      exposeSpecifiers: new Map([
        ['./one', ['shared-pkg/only']],
        ['./two', []],
      ]),
      lazyChunkSpecifiers,
      exposeOwnChunks,
      lazyChunkOwnChunks,
      onError: (m) => {
        throw new Error(m);
      },
    });

  it('carries the own chunks an expose reaches on its list, and emits a list for an expose that reaches only own chunks', () => {
    const composed = compose(
      new Map([
        ['./one', ['assets/a.js', 'assets/b.js']],
        ['./two', ['assets/c.js']],
      ]),
      new Map()
    );
    expect(composed.lists['./one'].ownChunks).toEqual(['assets/a.js', 'assets/b.js']);
    const two = composed.lists['./two'];
    expect(two.units).toEqual([]);
    expect(two.ownChunks).toEqual(['assets/c.js']);
  });

  it('emits an empty list for an expose that reaches neither shared nor own chunks', () => {
    const composed = compose(new Map(), new Map(), new Map());
    expect(composed.lists['./two']).toEqual({ units: [], ownChunks: [] });
    expect(composed.lists['./one'].ownChunks).toEqual([]);
  });

  it('gives a lazy delta only the own chunks not delivered by every expose', () => {
    const composed = compose(
      new Map([
        ['./one', ['assets/a.js']],
        ['./two', ['assets/a.js', 'assets/c.js']],
      ]),
      new Map([['assets/lazy.js', ['assets/a.js', 'assets/lazy-dep.js']]])
    );
    const delta = composed.lists['assets/lazy.js'];
    expect(delta.ownChunks).toEqual(['assets/lazy-dep.js']);
  });
});

describe('ExposeListComposer — a list for every lazy target', () => {
  it('holds a list for a lazy target whose delta is empty, named by every expose list', () => {
    const composed = ExposeListComposer.compose({
      produced: produced(),
      exposeSpecifiers: new Map([['./one', ['shared-pkg/only']]]),
      // The target reaches nothing the expose list does not already deliver.
      lazyChunkSpecifiers: new Map([['assets/en.js', ['shared-pkg/only']]]),
      exposeOwnChunks: new Map(),
      lazyChunkOwnChunks: new Map(),
      onError: (m) => {
        throw new Error(m);
      },
    });
    expect(composed.lists['assets/en.js']).toEqual({ units: [], ownChunks: [] });
    expect(composed.lists['./one'].lazy).toContain('assets/en.js');
  });
});
