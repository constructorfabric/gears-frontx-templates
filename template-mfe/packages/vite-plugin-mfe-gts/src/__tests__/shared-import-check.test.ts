/**
 * The shared-import guard: a name one of the MFE's own chunks imports
 * from a shared specifier must be one the unit answering the specifier
 * exports, else the whole MFE fails to link at load. A unit recording no
 * export names is not checked; a namespace import needs no name; a
 * rewrite the barrel fallback turned back is checked under its barrel
 * specifier and name.
 */

import { describe, expect, it } from 'vitest';
import type { ProducedSharedPackage } from '@gears-frontx/unit-producer';

import { SharedImportCheck } from '../SharedImportCheck';

function produced(exports?: string[]): ProducedSharedPackage[] {
  const unit = {
    location: 'kit@1.0.0/index.js',
    contentHash: 'a'.repeat(64),
    modulePaths: ['index.js'],
    bareImports: [],
    ...(exports !== undefined ? { exports } : {}),
  };
  const member = {
    location: 'kit@1.0.0/button.js',
    contentHash: 'b'.repeat(64),
    modulePaths: ['button.js'],
    bareImports: [],
    exports: ['Button'],
  };
  return [
    {
      name: 'kit',
      version: '1.0.0',
      packLocation: unit.location,
      unitMode: 'units',
      units: [unit, member],
      entryUnits: { kit: unit.location, 'kit/button.js': member.location },
      lists: {},
      transitive: false,
      chunkBytes: 0,
      barrelMode: 'not-needed',
    },
  ];
}

const noOrigin = (): undefined => undefined;

describe('SharedImportCheck', () => {
  it('reports a name the answering unit does not export, naming chunk, specifier and name', () => {
    const mismatches = SharedImportCheck.findMismatches({
      importers: [{ fileName: 'assets/a.js', imports: { kit: ['Button', 'Missing', 'default'] } }],
      produced: produced(['Button', 'default']),
      reverted: new Set(),
      origin: noOrigin,
    });
    expect(mismatches).toEqual([
      { importer: 'assets/a.js', specifier: 'kit', missing: ['Missing'] },
    ]);
    expect(SharedImportCheck.formatError(mismatches)).toMatch(
      /'assets\/a\.js' imports Missing from 'kit'/
    );
  });

  it('passes names the unit exports and namespace imports', () => {
    expect(
      SharedImportCheck.findMismatches({
        importers: [{ fileName: 'assets/a.js', imports: { kit: ['Button', '*'] } }],
        produced: produced(['Button']),
        reverted: new Set(),
        origin: noOrigin,
      })
    ).toEqual([]);
  });

  it('does not check a unit that records no export names, nor a specifier no produced unit answers', () => {
    expect(
      SharedImportCheck.findMismatches({
        importers: [
          { fileName: 'assets/a.js', imports: { kit: ['Anything'], 'not-shared': ['X'] } },
        ],
        produced: produced(),
        reverted: new Set(),
        origin: noOrigin,
      })
    ).toEqual([]);
  });

  it('checks a rewrite the barrel fallback turned back under its barrel specifier and name', () => {
    const mismatches = SharedImportCheck.findMismatches({
      importers: [{ fileName: 'assets/a.js', imports: { 'kit/button.js': ['Button'] } }],
      produced: produced(['Other']),
      reverted: new Set(['kit/button.js']),
      origin: () => ({ barrelSpecifier: 'kit', barrelName: 'Button' }),
    });
    expect(mismatches).toEqual([
      { importer: 'assets/a.js', specifier: 'kit', missing: ['Button'] },
    ]);
  });

  it('reads the export names of a specifier once, whatever number of chunks import it', () => {
    const [pkg] = produced(['Button']);
    let reads = 0;
    for (const unit of pkg.units) {
      const names = unit.exports;
      Object.defineProperty(unit, 'exports', {
        get: () => {
          reads += 1;
          return names;
        },
      });
    }
    const importers = ['a', 'b', 'c'].map((n) => ({ fileName: `assets/${n}.js`, imports: { kit: ['Button'] } }));
    expect(
      SharedImportCheck.findMismatches({ importers, produced: [pkg], reverted: new Set(), origin: noOrigin })
    ).toEqual([]);
    // Two reads for the one specifier: the presence check and the names.
    expect(reads).toBeLessThanOrEqual(2);
  });
});
