/**
 * Shared packages use the bundler's normal chunking with no merging, so
 * the shell plugin has no chunk-grouping option: a host still passing
 * `chunkGrouping` fails the build with a message naming the option.
 */

import { build } from 'vite';
import { describe, expect, it } from 'vitest';

import { vitePluginShell, type VitePluginShellOptions } from '../index';

describe('vitePluginShell chunk-grouping option', () => {
  it('rejects the removed chunkGrouping option with a clear message', async () => {
    // A stale options object still carrying the removed key.
    const options: VitePluginShellOptions & Record<string, unknown> = {
      chunkGrouping: { minChunkSizeBytes: 0 },
    };
    await expect(async () =>
      build({
        root: process.cwd(),
        logLevel: 'silent',
        plugins: [vitePluginShell(options)],
      })
    ).rejects.toThrow(/\[vite-plugin-shell\] "chunkGrouping" is not an option/);
  });
});
