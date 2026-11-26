/**
 * Specifier derivation from Rollup's output graph: per expose (static
 * imports) and per lazy chunk (dynamic imports) — the specifiers select
 * which producer fetch lists merge into each document.
 */

import { describe, expect, it } from 'vitest';
import { SpecifiersDeriver } from '../SpecifiersDeriver';
import type { CapturedChunk } from '../types';

const chunk = (partial: Partial<CapturedChunk>): CapturedChunk => ({
  fileName: 'x.js',
  cssAssets: [],
  imports: [],
  dynamicImports: [],
  ownCssModules: [],
  ...partial,
});

describe('SpecifiersDeriver.entrySpecifiers', () => {
  it('collects shared specifiers reached through the static import chain', () => {
    const chunks = new Map<string, CapturedChunk>([
      ['lifecycle.js', chunk({ fileName: 'lifecycle.js', imports: ['shared.js', 'react'] })],
      ['shared.js', chunk({ fileName: 'shared.js', imports: ['react-dom'] })],
    ]);
    const specifiers = SpecifiersDeriver.entrySpecifiers({
      exposes: [{ path: './lifecycle', assets: { js: { sync: ['lifecycle.js'] } } }],
      chunks,
      sharedDepNames: new Set(['react', 'react-dom']),
    });
    expect(specifiers['./lifecycle']).toEqual(['react', 'react-dom']);
  });

  it('records subpath specifiers of shared packages (react/jsx-runtime)', () => {
    const chunks = new Map<string, CapturedChunk>([
      [
        'lifecycle.js',
        chunk({ fileName: 'lifecycle.js', imports: ['react/jsx-runtime', '@s/pkg/sub', 'b.js'] }),
      ],
      ['b.js', chunk({ fileName: 'b.js', imports: ['react-dom/client'] })],
    ]);
    const specifiers = SpecifiersDeriver.entrySpecifiers({
      exposes: [{ path: './lifecycle', assets: { js: { sync: ['lifecycle.js'] } } }],
      chunks,
      sharedDepNames: new Set(['react', 'react-dom', '@s/pkg']),
    });
    expect(specifiers['./lifecycle']).toEqual(['@s/pkg/sub', 'react-dom/client', 'react/jsx-runtime']);
    const lazy = SpecifiersDeriver.lazyChunkSpecifiers({
      chunks: new Map([
        ['entry.js', chunk({ fileName: 'entry.js', dynamicImports: ['lazy.js'] })],
        ['lazy.js', chunk({ fileName: 'lazy.js', imports: ['react/jsx-runtime'] })],
      ]),
      sharedDepNames: new Set(['react']),
    });
    expect(lazy['lazy.js']).toEqual(['react/jsx-runtime']);
  });

  it('yields an empty specifier set for entries reaching no shared package', () => {
    const specifiers = SpecifiersDeriver.entrySpecifiers({
      exposes: [{ path: './lifecycle', assets: { js: { sync: ['a.js'] } } }],
      chunks: new Map([['a.js', chunk({ fileName: 'a.js', imports: ['b.js'] })]]),
      sharedDepNames: new Set(['react']),
    });
    expect(specifiers['./lifecycle']).toEqual([]);
  });
});

describe('SpecifiersDeriver.lazyChunkSpecifiers', () => {
  it('records specifiers per dynamically imported chunk', () => {
    const chunks = new Map<string, CapturedChunk>([
      ['entry.js', chunk({ fileName: 'entry.js', dynamicImports: ['lazy.js'] })],
      ['lazy.js', chunk({ fileName: 'lazy.js', imports: ['inner.js'] })],
      ['inner.js', chunk({ fileName: 'inner.js', imports: ['lodash'] })],
    ]);
    const specifiers = SpecifiersDeriver.lazyChunkSpecifiers({
      chunks,
      sharedDepNames: new Set(['lodash']),
    });
    expect(specifiers['lazy.js']).toEqual(['lodash']);
  });
});

describe('SpecifiersDeriver own chunks', () => {
  const graph = new Map<string, CapturedChunk>([
    [
      'assets/lifecycle.js',
      chunk({
        fileName: 'assets/lifecycle.js',
        imports: ['assets/a.js', 'assets/b.js', 'react'],
        dynamicImports: ['assets/lazy.js'],
      }),
    ],
    ['assets/a.js', chunk({ fileName: 'assets/a.js', imports: ['assets/c.js', 'react-dom'] })],
    ['assets/b.js', chunk({ fileName: 'assets/b.js', imports: ['assets/c.js'] })],
    ['assets/c.js', chunk({ fileName: 'assets/c.js' })],
    [
      'assets/lazy.js',
      chunk({ fileName: 'assets/lazy.js', imports: ['assets/lazy-dep.js', 'assets/c.js'] }),
    ],
    ['assets/lazy-dep.js', chunk({ fileName: 'assets/lazy-dep.js', imports: ['react'] })],
  ]);
  const sharedDepNames = new Set(['react', 'react-dom']);

  it('lists the own chunks an expose reaches statically, once each, excluding the entry and shared specifiers and lazy targets', () => {
    expect(
      SpecifiersDeriver.entryOwnChunks({
        exposes: [{ path: './lifecycle', assets: { js: { sync: ['assets/lifecycle.js'] } } }],
        chunks: graph,
        sharedDepNames,
      })
    ).toEqual({ './lifecycle': ['assets/a.js', 'assets/b.js', 'assets/c.js'] });
  });

  it('lists the own chunks a lazy chunk reaches statically beyond itself', () => {
    expect(
      SpecifiersDeriver.lazyChunkOwnChunks({ chunks: graph, sharedDepNames })
    ).toEqual({ 'assets/lazy.js': ['assets/c.js', 'assets/lazy-dep.js'] });
  });

  it('never lists a removed CSS-only chunk (no emitted file) but traverses through it', () => {
    const css = new Map<string, CapturedChunk>([
      ['assets/lifecycle.js', chunk({ fileName: 'assets/lifecycle.js', imports: ['assets/style-only.js'] })],
      [
        'assets/style-only.js',
        chunk({ fileName: 'assets/style-only.js', imports: ['assets/after.js'], noEmittedFile: true }),
      ],
      ['assets/after.js', chunk({ fileName: 'assets/after.js' })],
    ]);
    expect(
      SpecifiersDeriver.entryOwnChunks({
        exposes: [{ path: './lifecycle', assets: { js: { sync: ['assets/lifecycle.js'] } } }],
        chunks: css,
        sharedDepNames,
      })
    ).toEqual({ './lifecycle': ['assets/after.js'] });
  });

  it('lists every sync asset after the first as an own chunk, walking from each', () => {
    const multi = new Map<string, CapturedChunk>([
      ['assets/entry.js', chunk({ fileName: 'assets/entry.js', imports: ['assets/a.js'] })],
      ['assets/second.js', chunk({ fileName: 'assets/second.js', imports: ['assets/d.js'] })],
      ['assets/a.js', chunk({ fileName: 'assets/a.js' })],
      ['assets/d.js', chunk({ fileName: 'assets/d.js' })],
    ]);
    expect(
      SpecifiersDeriver.entryOwnChunks({
        exposes: [
          { path: './x', assets: { js: { sync: ['assets/entry.js', 'assets/second.js'] } } },
        ],
        chunks: multi,
        sharedDepNames,
      })
    ).toEqual({ './x': ['assets/a.js', 'assets/d.js', 'assets/second.js'] });
  });
});
