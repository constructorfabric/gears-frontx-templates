import { describe, expect, it } from 'vitest';

import { BootChunkGraph, type BootGraphChunk } from '../BootChunkGraph';

const chunk = (
  fileName: string,
  over: Partial<BootGraphChunk> = {}
): BootGraphChunk => ({
  fileName,
  isEntry: false,
  staticImports: [],
  bareImports: [],
  ...over,
});

describe('BootChunkGraph', () => {
  const graph = new BootChunkGraph([
    chunk('entry.js', { isEntry: true, staticImports: ['a.js'], bareImports: ['react'] }),
    chunk('a.js', { staticImports: ['b.js'], bareImports: ['redux'] }),
    chunk('b.js', { bareImports: ['react'] }),
    // Reached only through a dynamic import() from a boot chunk.
    chunk('lazy.js', { staticImports: ['lazy-dep.js'], bareImports: ['chart'] }),
    chunk('lazy-dep.js', { bareImports: ['react', 'date-fns'] }),
  ]);

  it('reaches the entry chunks and what they import statically', () => {
    expect([...graph.bootChunkFiles()].sort()).toEqual(['a.js', 'b.js', 'entry.js']);
  });

  it('lists the specifiers the boot-evaluated chunks import', () => {
    expect(graph.bootSpecifiers()).toEqual(['react', 'redux']);
  });

  it('lists the specifiers only lazily reached chunks import', () => {
    expect(graph.lazyOnlySpecifiers()).toEqual(['chart', 'date-fns']);
  });

  it('ignores an import of a chunk that is not emitted', () => {
    const g = new BootChunkGraph([
      chunk('entry.js', { isEntry: true, staticImports: ['missing.js'] }),
    ]);
    expect([...g.bootChunkFiles()]).toEqual(['entry.js']);
  });

  it('survives an import cycle', () => {
    const g = new BootChunkGraph([
      chunk('entry.js', { isEntry: true, staticImports: ['a.js'] }),
      chunk('a.js', { staticImports: ['entry.js'], bareImports: ['x'] }),
    ]);
    expect(g.bootSpecifiers()).toEqual(['x']);
  });
});
