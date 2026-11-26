/**
 * Scenario: the build report's per-package cache outcomes are sorted
 * by `name@version`, so they never depend on parallel finish order.
 */

import { describe, expect, it } from 'vitest';

import { PackageCacheReport } from '../PackageCacheReport';

describe('PackageCacheReport', () => {
  it('counts hits and misses and sorts packages regardless of record order', () => {
    const a = new PackageCacheReport();
    a.record('zeta', '1.0.0', 'hit');
    a.record('alpha', '2.0.0', 'miss');
    a.record('mid', '1.0.0', 'disabled');
    const b = new PackageCacheReport();
    b.record('mid', '1.0.0', 'disabled');
    b.record('alpha', '2.0.0', 'miss');
    b.record('zeta', '1.0.0', 'hit');
    expect(a.toSummary()).toEqual(b.toSummary());
    expect(a.toSummary()).toEqual({
      hits: 1,
      misses: 1,
      packages: [
        { name: 'alpha', version: '2.0.0', outcome: 'miss' },
        { name: 'mid', version: '1.0.0', outcome: 'disabled' },
        { name: 'zeta', version: '1.0.0', outcome: 'hit' },
      ],
    });
  });
});
