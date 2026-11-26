/**
 * Shared packages use the bundler's normal chunking with no merging, so
 * the MFE plugin has no chunk-grouping option: a project still passing
 * `chunkGrouping` fails with a message naming the option.
 */

import { describe, expect, it } from 'vitest';

import { vitePluginMfeGts, type VitePluginMfeGtsOptions } from '../index';

describe('vitePluginMfeGts chunk-grouping option', () => {
  it('rejects the removed chunkGrouping option with a clear message', () => {
    // A stale options object still carrying the removed key.
    const options: VitePluginMfeGtsOptions & Record<string, unknown> = {
      chunkGrouping: { minChunkSizeBytes: 0 },
    };
    expect(() => vitePluginMfeGts(options)).toThrow(
      /\[vite-plugin-mfe-gts\] "chunkGrouping" is not an option/
    );
  });
});
