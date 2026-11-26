import { describe, expect, it } from 'vitest';

import { ForeignPackageInliningGuard } from '../ForeignPackageInliningGuard';

/**
 * Scenario: no shared package may be inlined into another's unit or
 * pack. The guard reads a build's input module ids, attributes each module
 * to its owning package, and reports every module owned by a shared
 * package other than the host — naming the offending package and the
 * host unit.
 */

function metafile(inputs: string[]): string[] {
  return inputs;
}

const shared = new Map([
  ['@s/host', '/eco/packages/host'],
  ['react', '/w/node_modules/react'],
  ['@s/linked', '/eco/packages/linked'],
]);

describe('ForeignPackageInliningGuard', () => {
  it('passes a build that holds only the host package\'s own modules', () => {
    const guard = new ForeignPackageInliningGuard(shared);
    expect(
      guard.findViolations(
        metafile(['../../eco/packages/host/dist/index.js', '../../eco/packages/host/dist/a.js']),
        '/w/app',
        '@s/host'
      )
    ).toEqual([]);
  });

  it('names a shared package inlined from node_modules', () => {
    const guard = new ForeignPackageInliningGuard(shared);
    const violations = guard.findViolations(
      metafile([
        '../../eco/packages/host/dist/index.js',
        '../../eco/packages/host/node_modules/react/index.js',
        '../node_modules/react/cjs/react.production.js',
      ]),
      '/w/app',
      '@s/host'
    );
    expect(violations.map((v) => v.packageName)).toEqual(['react', 'react']);
  });

  it('names a linked shared package inlined by its real path', () => {
    const guard = new ForeignPackageInliningGuard(shared);
    const violations = guard.findViolations(
      metafile(['../../eco/packages/linked/dist/index.js']),
      '/w/app',
      '@s/host'
    );
    expect(violations).toEqual([
      { packageName: '@s/linked', input: '/eco/packages/linked/dist/index.js' },
    ]);
  });

  it('ignores packages outside the shared set, assets and non-file inputs', () => {
    const guard = new ForeignPackageInliningGuard(shared);
    expect(
      guard.findViolations(
        metafile([
          '../node_modules/not-shared/index.js',
          '../node_modules/react/styles.css',
          '(disabled):/w/node_modules/react/fs',
          '/tmp/unit-producer-entry-x/unit-producer-entry.js',
        ]),
        '/w/app',
        '@s/host'
      )
    ).toEqual([]);
  });

  it('formats an error naming the offending package and the host unit', () => {
    const message = ForeignPackageInliningGuard.formatError('@s/host', '@s/host@1.0.0/dist-index.js', [
      { packageName: 'react', input: '/w/node_modules/react/index.js' },
    ]);
    expect(message).toContain('"react"');
    expect(message).toContain('@s/host@1.0.0/dist-index.js');
    expect(message).toContain('"@s/host"');
  });
});
