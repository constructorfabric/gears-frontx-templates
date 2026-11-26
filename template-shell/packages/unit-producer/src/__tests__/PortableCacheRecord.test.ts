import { describe, expect, it } from 'vitest';

import type { CachedPackageBuild } from '../PackageBuildCache';
import { PortableCacheRecord } from '../PortableCacheRecord';

const shallow = { packageDir: '/r1/node_modules/x', installDir: '/r1/node_modules/x' };
const deeper = {
  packageDir: '/other/a/b/c/node_modules/x',
  installDir: '/other/a/b/c/node_modules/x',
};

describe('PortableCacheRecord.toPortable', () => {
  const cases: Array<[string, string, string]> = [
    ['an absolute file in the package', '/r1/node_modules/x/dist/a.js', '<package>/dist/a.js'],
    [
      'a virtual id over an absolute file',
      '\0/r1/node_modules/x/dist/a.js?commonjs-module',
      '\0<package>/dist/a.js?commonjs-module',
    ],
    ['an absolute file with a query', '/r1/node_modules/x/dist/a.js?commonjs-proxy', '<package>/dist/a.js?commonjs-proxy'],
    ['a file beside the package', '/r1/node_modules/other/i.js', '<install>/../other/i.js'],
    ['a virtual id with no path', '\0react/jsx-runtime?commonjs-external', '\0react/jsx-runtime?commonjs-external'],
    ['a virtual helper', '\0commonjsHelpers.js', '\0commonjsHelpers.js'],
    ['a bare specifier', 'react/jsx-runtime', 'react/jsx-runtime'],
  ];

  it.each(cases)('%s', (_name, id, portable) => {
    expect(PortableCacheRecord.toPortable(id, shallow)).toBe(portable);
  });

  it.each(cases)('round-trips %s across two install depths', (_name, id) => {
    const portable = PortableCacheRecord.toPortable(id, shallow);
    expect(PortableCacheRecord.toLocated(portable, shallow)).toBe(id);
    const moved = PortableCacheRecord.toLocated(portable, deeper);
    expect(PortableCacheRecord.toPortable(moved, deeper)).toBe(portable);
    if (!id.includes('/r1/')) expect(moved).toBe(id);
    else expect(moved).toContain('/other/a/b/c/');
  });
});

describe('PortableCacheRecord.portable', () => {
  it('holds no install root and places back at another one', () => {
    const build: CachedPackageBuild = {
      chunks: [
        {
          id: 'a.js',
          namePath: 'a',
          entryPoint: '/r1/node_modules/x/a.js',
          modulePaths: ['a.js'],
          externalEdges: [],
          internalEdges: [],
          isCjsEntry: false,
        },
      ],
      entryChunks: { x: 'a.js' },
      entries: { x: '/r1/node_modules/x/a.js' },
      excludedEntries: [{ entry: 'x/b', file: '/r1/node_modules/x/b.js', specifier: 's', reason: 'r' }],
      barrelNotes: [],
      entrySpecifiers: ['x'],
      inputs: ['/r1/node_modules/x/a.js', '\0react/jsx-runtime?commonjs-external'],
    };
    const portable = PortableCacheRecord.portable(build, shallow);
    expect(JSON.stringify(portable)).not.toContain('/r1/');
    expect(portable.inputs[1]).toBe('\0react/jsx-runtime?commonjs-external');
    const placed = PortableCacheRecord.located(portable, deeper);
    expect(placed.entries?.x).toBe('/other/a/b/c/node_modules/x/a.js');
    expect(placed.inputs).toEqual([
      '/other/a/b/c/node_modules/x/a.js',
      '\0react/jsx-runtime?commonjs-external',
    ]);
  });
});
