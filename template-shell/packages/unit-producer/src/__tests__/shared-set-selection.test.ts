import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { SharedSetResolver } from '../SharedSetResolver';
import { SharedSetSelection } from '../SharedSetSelection';

/**
 * Scenario: `include` / `exclude` are mutually exclusive; `include`
 * seeds the shared set (an empty list shares nothing) and the closure
 * adds the listed packages' runtime dependencies.
 */

const roots: string[] = [];

function writePkg(dir: string, pkg: Record<string, unknown>): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg));
}

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'sss-test-'));
  roots.push(root);
  writePkg(root, {
    name: 'host',
    dependencies: { top: '1.0.0', other: '1.0.0' },
  });
  writePkg(join(root, 'node_modules', 'top'), {
    name: 'top',
    version: '1.0.0',
    dependencies: { inner: '1.0.0' },
  });
  writePkg(join(root, 'node_modules', 'inner'), { name: 'inner', version: '1.0.0' });
  writePkg(join(root, 'node_modules', 'other'), { name: 'other', version: '1.0.0' });
  return root;
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('SharedSetSelection', () => {
  it('reports the mode: default, include (even empty) or exclude', () => {
    expect(new SharedSetSelection().mode).toBe('default');
    expect(new SharedSetSelection({ exclude: [] }).mode).toBe('default');
    expect(new SharedSetSelection({ include: [] }).mode).toBe('include');
    expect(new SharedSetSelection({ exclude: ['a'] }).mode).toBe('exclude');
  });

  it('names both options when both are set', () => {
    const message = new SharedSetSelection({ include: ['a'], exclude: ['b'] }).conflict();
    expect(message).toMatch(/"include" and "exclude" are mutually exclusive/);
    expect(new SharedSetSelection({ include: ['a'] }).conflict()).toBeUndefined();
  });
});

describe('SharedSetResolver with include', () => {
  it('shares only the listed packages as seeds', () => {
    const res = new SharedSetResolver(makeRoot(), { include: ['top'] }).resolve();
    expect(res.ok && res.sharedDeps).toEqual(['top']);
  });

  it('adds the listed packages\' runtime dependencies through the closure', () => {
    const resolver = new SharedSetResolver(makeRoot(), { include: ['top'] });
    expect(resolver.declaredClosureNames()).toEqual(['inner', 'top']);
  });

  it('include: [] shares nothing', () => {
    const resolver = new SharedSetResolver(makeRoot(), { include: [] });
    const res = resolver.resolve();
    expect(res.ok && res.sharedDeps).toEqual([]);
    expect(resolver.declaredClosureNames()).toEqual([]);
  });

  it('fails with a clear message when include and exclude are both set', () => {
    const res = new SharedSetResolver(makeRoot(), {
      include: ['top'],
      exclude: ['other'],
    }).resolve();
    expect(res.ok).toBe(false);
    expect(!res.ok && res.message).toMatch(/mutually exclusive/);
  });

  it('exclude keeps the transitive-dependency rule', () => {
    const res = new SharedSetResolver(makeRoot(), { exclude: ['inner'] }).resolve();
    expect(!res.ok && res.message).toMatch(/"inner" cannot be excluded/);
  });
});
