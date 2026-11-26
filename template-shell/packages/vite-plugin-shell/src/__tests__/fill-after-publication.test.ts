/**
 * The host fill is never the first realm-cache publisher: the MFE handler
 * publishes the realm cache when it is constructed (inside the shell
 * entry), and the fill chunk's module script follows the entry's, so the
 * fill runs after that publication. Observed through behaviour: the byte
 * budget the handler published is the one the filled cache obeys; a fill
 * that published first would have set the default budget instead.
 */

import { MfeHandlerMF } from '@gears-frontx/mfes';
import { SharedUnitFetcher } from '@gears-frontx/mfes/unit-loader';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import { ShellCacheFill } from '../runtime/ShellCacheFill';

describe('ShellCacheFill after the realm cache is published', () => {
  it('fills the cache the handler published, under the handler budget', async () => {
    const text = 'export const big = "' + 'x'.repeat(256) + '";\n';
    const contentHash = createHash('sha256').update(text, 'utf-8').digest('hex');
    const BASE = 'https://host.test/';

    // The handler publishes first, with a budget below the text's size.
    new MfeHandlerMF('gts.test.handler.v1~', { sharedDepTextCacheMaxBytes: 16 });

    const report = await ShellCacheFill.run(
      {
        unitsBase: './shared/',
        units: [{ location: 'big@1/chunk-big.js', contentHash, answers: ['big'], imports: [] }],
        list: { units: [contentHash], ownChunks: [] },
      },
      { documentBase: BASE, fetchText: async () => text }
    );
    expect(report).toEqual({ filled: 1, failed: 0 });

    // The text exceeds the handler's budget, so the cache did not retain
    // it: a later load fetches it again. Under a fill-published default
    // budget it would have been retained.
    const refetch = vi.fn(async () => text);
    await new SharedUnitFetcher(refetch, 'mfe-load').fetch(
      `${BASE}shared/big@1/chunk-big.js`,
      contentHash
    );
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
