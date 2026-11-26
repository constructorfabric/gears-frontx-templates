import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

import * as producer from '../index';
import { ProducerBuildSettings } from '../ProducerBuildSettings';

/**
 * Shared packages use the bundler's normal chunking with no merging:
 * the producer exposes no chunk-grouping setting, hands Rollup no
 * `experimentalMinChunkSize`, and carries no duplicate-`default` repair
 * that only merged chunks needed.
 */
describe('no chunk merging', () => {
  it('exposes no chunk-grouping setting', () => {
    expect('DEFAULT_CHUNK_GROUPING' in producer).toBe(false);
    expect('minChunkSizeOf' in producer).toBe(false);
  });

  it('passes no experimentalMinChunkSize to the bundler', () => {
    expect('experimentalMinChunkSize' in ProducerBuildSettings.outputOptions()).toBe(
      false
    );
  });

  it('the settings fingerprint and sources carry no merge setting', () => {
    expect(ProducerBuildSettings.fingerprintText()).not.toMatch(/minChunk|grouping/i);
    const src = path.join(__dirname, '..');
    expect(fs.existsSync(path.join(src, 'ChunkGrouping.ts'))).toBe(false);
  });

  it('keeps member-name aliasing but no duplicate-default renaming', async () => {
    const { restoreMemberNames } = await import('../ProducerBuildSettings');
    const aliased = restoreMemberNames('function compareStrings(){}export{compareStrings as c};');
    expect(aliased).toContain('compareStrings as "compareStrings"');
    const twoDefaults = 'export{a as default,b as default};';
    expect(restoreMemberNames(twoDefaults)).toBe(twoDefaults);
  });
});
