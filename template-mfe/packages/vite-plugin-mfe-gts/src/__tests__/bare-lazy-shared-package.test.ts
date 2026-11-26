/**
 * A shared package the MFE's own code imports dynamically by bare
 * specifier (`import('kit')`) is a lazy target of its own: its list is
 * held under that bare specifier — the key the runtime looks a bare
 * `__frontx_lazy` argument up under — holding what the package needs
 * beyond the expose lists, and named in the `lazy` array of every expose
 * list.
 */

import { describe, expect, it } from 'vitest';
import type { SharedDepUnit } from '@gears-frontx/mfes/unit-format';
import type { ProducedSharedPackage } from '@gears-frontx/unit-producer';

import { ExposeListComposer } from '../ExposeListComposer';
import { SpecifiersDeriver } from '../SpecifiersDeriver';
import type { CapturedChunk } from '../types';

const HASH_K = 'a'.repeat(64);
const HASH_R = 'b'.repeat(64);

const chunk = (partial: Partial<CapturedChunk>): CapturedChunk => ({
  fileName: 'x.js',
  cssAssets: [],
  imports: [],
  dynamicImports: [],
  cssModules: [],
  ...partial,
});

const unit = (location: string, contentHash: string, answers: string[]): SharedDepUnit => ({
  location,
  contentHash,
  answers,
  imports: [],
});

function produced(): ProducedSharedPackage[] {
  return [
    {
      name: 'react',
      version: '19.0.0',
      packLocation: 'react@19.0.0/index.js',
      unitMode: 'single',
      units: [],
      entryUnits: {},
      lists: {
        react: {
          ownChunks: [],
          items: [unit(`react@19.0.0/index.${HASH_R}.js`, HASH_R, ['react'])],
        },
      },
      transitive: false,
      chunkBytes: 0,
      barrelMode: 'not-needed',
    },
    {
      name: 'kit',
      version: '1.0.0',
      packLocation: 'kit@1.0.0/index.js',
      unitMode: 'single',
      units: [],
      entryUnits: {},
      lists: {
        kit: {
          ownChunks: [],
          items: [
            unit(`kit@1.0.0/index.${HASH_K}.js`, HASH_K, ['kit']),
            unit(`react@19.0.0/index.${HASH_R}.js`, HASH_R, ['react']),
          ],
        },
      },
      transitive: false,
      chunkBytes: 0,
      barrelMode: 'not-needed',
    },
  ];
}

describe('a bare dynamic import of a shared package', () => {
  const chunks = new Map<string, CapturedChunk>([
    [
      'assets/lifecycle.js',
      chunk({
        fileName: 'assets/lifecycle.js',
        imports: ['react'],
        dynamicImports: ['kit', 'assets/lazy.js'],
      }),
    ],
    ['assets/lazy.js', chunk({ fileName: 'assets/lazy.js' })],
  ]);
  const sharedDepNames = new Set(['react', 'kit']);

  it('is a lazy target keyed by its bare specifier, reaching that specifier', () => {
    const specifiers = SpecifiersDeriver.lazyChunkSpecifiers({ chunks, sharedDepNames });
    expect(specifiers.kit).toEqual(['kit']);
    expect(specifiers['assets/lazy.js']).toEqual([]);
  });

  it('gets a list under the bare specifier with only what the expose list lacks, named by the expose list', () => {
    const composed = ExposeListComposer.compose({
      produced: produced(),
      exposeSpecifiers: new Map([['./lifecycle', ['react']]]),
      lazyChunkSpecifiers: new Map(
        Object.entries(SpecifiersDeriver.lazyChunkSpecifiers({ chunks, sharedDepNames }))
      ),
      exposeOwnChunks: new Map(),
      lazyChunkOwnChunks: new Map(
        Object.entries(SpecifiersDeriver.lazyChunkOwnChunks({ chunks, sharedDepNames }))
      ),
      onError: (m) => {
        throw new Error(m);
      },
    });
    expect(composed.lists.kit).toEqual({ units: [HASH_K], ownChunks: [] });
    expect(composed.lists['./lifecycle'].lazy).toContain('kit');
    expect(composed.lists['./lifecycle'].units).toEqual([HASH_R]);
  });
});
