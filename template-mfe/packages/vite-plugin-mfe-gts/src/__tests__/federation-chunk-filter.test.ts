/**
 * Federation control chunks are identified by the modules they hold, never
 * by their file name: an MFE chunk named like federation plumbing is still
 * an MFE chunk and its lazy imports are transformed.
 */

import { describe, expect, it } from 'vitest';
import { FederationChunkFilter } from '../FederationChunkFilter';
import { LazyImportTransformer } from '../LazyImportTransformer';

describe('FederationChunkFilter.isFederationControlChunk', () => {
  it('recognises the chunks holding only federation virtual modules', () => {
    expect(
      FederationChunkFilter.isFederationControlChunk([
        'virtual:mf-exposes:__mfe_internal__demo__remoteEntry_js',
      ])
    ).toBe(true);
    expect(
      FederationChunkFilter.isFederationControlChunk([
        '\0virtual:mf:__mfe_internal__demo__mf_owner__1__H_A_I__hostAutoInit__H_A_I__.js',
      ])
    ).toBe(true);
    expect(
      FederationChunkFilter.isFederationControlChunk([
        '\0virtual:mf-localSharedImportMap:__mfe_internal__demo__mf_owner__1',
      ])
    ).toBe(true);
    expect(
      FederationChunkFilter.isFederationControlChunk([
        'virtual:mf-REMOTE_ENTRY_ID:__mfe_internal__demo__remoteEntry_js',
      ])
    ).toBe(true);
  });

  it('never treats a chunk of the MFE own modules as a control chunk', () => {
    expect(
      FederationChunkFilter.isFederationControlChunk([
        '/pkg/src/remoteEntryScreen.tsx',
      ])
    ).toBe(false);
    expect(
      FederationChunkFilter.isFederationControlChunk([
        '/pkg/src/hostInitPanel.tsx',
        'virtual:mf-exposes:x',
      ])
    ).toBe(false);
    expect(FederationChunkFilter.isFederationControlChunk([])).toBe(false);
  });

  it('keeps the lazy imports of an MFE chunk named like federation plumbing', () => {
    const code = `const p = import('./lazy.js');`;
    const parse = (input: string): unknown => ({
      type: 'Program',
      body: [
        {
          type: 'ImportExpression',
          start: input.indexOf('import'),
          end: input.length - 1,
          source: {
            type: 'Literal',
            start: input.indexOf("'"),
            end: input.lastIndexOf("'") + 1,
            value: './lazy.js',
          },
        },
      ],
    });
    for (const name of ['remoteEntryScreen', 'hostInitPanel']) {
      const moduleIds = [`/pkg/src/${name}.tsx`];
      expect(FederationChunkFilter.isFederationControlChunk(moduleIds)).toBe(
        false
      );
      const result = LazyImportTransformer.transformChunk(
        code,
        parse,
        (message) => {
          throw new Error(message);
        },
        `assets/${name}-abc123.js`
      );
      expect(result?.code).toBe(`const p = __frontx_lazy('./lazy.js');`);
    }
  });
});
