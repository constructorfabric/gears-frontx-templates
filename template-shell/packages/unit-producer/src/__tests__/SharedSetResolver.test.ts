import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { SharedSetResolver } from '../SharedSetResolver';

/**
 * Scenario: SharedSetResolver — shared-set derivation and closure
 * enforcement over synthetic `node_modules` trees.
 */

const roots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ssr-test-'));
  roots.push(root);
  return root;
}

function writePkg(dir: string, pkg: Record<string, unknown>): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg));
}

function installDep(
  root: string,
  name: string,
  pkg: Record<string, unknown>,
  nested = false,
  underDir?: string
): void {
  const base = underDir ?? join(root, 'node_modules');
  const dir = nested ? join(base, name) : join(base, name);
  writePkg(dir, { name, version: '1.0.0', ...pkg });
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('SharedSetResolver.extractRootPackageName', () => {
  it('strips subpaths and keeps scope', () => {
    expect(SharedSetResolver.extractRootPackageName('a/b')).toBe('a');
    expect(SharedSetResolver.extractRootPackageName('@s/a/b')).toBe('@s/a');
    expect(SharedSetResolver.extractRootPackageName('a')).toBe('a');
    expect(SharedSetResolver.extractRootPackageName('@s/a')).toBe('@s/a');
  });
});

describe('SharedSetResolver.resolve', () => {
  it('shares dependencies and non-optional peerDependencies by default', () => {
    const root = makeRoot();
    writePkg(root, {
      name: 'host',
      dependencies: { depA: '1.0.0' },
      peerDependencies: { depB: '1.0.0', depC: '1.0.0' },
      peerDependenciesMeta: { depC: { optional: true } },
      devDependencies: { depD: '1.0.0' },
    });
    installDep(root, 'depA', {});
    installDep(root, 'depB', {});
    installDep(root, 'depD', {});
    const res = new SharedSetResolver(root).resolve();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.sharedDeps.sort()).toEqual(['depA', 'depB']);
  });

  it('never shares devDependencies even when installed', () => {
    const root = makeRoot();
    writePkg(root, { name: 'host', devDependencies: { depD: '1.0.0' } });
    installDep(root, 'depD', {});
    const res = new SharedSetResolver(root).resolve();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.sharedDeps).toEqual([]);
  });

  it('names the declared closure: dependencies and non-optional peers of shared packages', () => {
    const root = makeRoot();
    writePkg(root, { name: 'host', dependencies: { depA: '1.0.0' } });
    installDep(root, 'depA', {
      dependencies: { depB: '1.0.0' },
      peerDependencies: { depC: '1.0.0', depOpt: '1.0.0' },
      peerDependenciesMeta: { depOpt: { optional: true } },
      devDependencies: { depDev: '1.0.0' },
    });
    installDep(root, 'depB', { dependencies: { depE: '1.0.0' } });
    installDep(root, 'depC', {});
    installDep(root, 'depE', {});
    installDep(root, 'depOpt', {});
    installDep(root, 'depDev', {});
    const resolver = new SharedSetResolver(root);
    expect(resolver.declaredClosureNames()).toEqual(['depA', 'depB', 'depC', 'depE']);
    // The declared set itself stays the declared dependencies; the rest
    // of the closure joins by import, in the producer.
    const res = resolver.resolve();
    expect(res.ok && res.sharedDeps).toEqual(['depA']);
  });

  it('locates a closure package the way its importer resolves it', () => {
    const root = makeRoot();
    writePkg(root, { name: 'host', dependencies: { depA: '1.0.0' } });
    installDep(root, 'depA', { dependencies: { depB: '1.0.0' } });
    installDep(root, 'depB', {});
    // depA carries its own nested depB 2.0.0, which shadows the root one.
    writePkg(join(root, 'node_modules', 'depA', 'node_modules', 'depB'), {
      name: 'depB',
      version: '2.0.0',
    });
    const resolver = new SharedSetResolver(root);
    const res = resolver.resolve();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const depA = res.packages.find((p) => p.name === 'depA')!;
    expect(resolver.locate(depA, 'depB')?.version).toBe('2.0.0');
    expect(resolver.locate(depA, 'ghost')).toBeUndefined();
  });

  it('skips an optional dependency of a shared package that is not installed', () => {
    const root = makeRoot();
    writePkg(root, { name: 'host', dependencies: { depA: '1.0.0' } });
    installDep(root, 'depA', { optionalDependencies: { ghost: '1.0.0' } });
    const res = new SharedSetResolver(root).resolve();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.sharedDeps).toEqual(['depA']);
  });

  it('takes no name list: the set is derived from package.json fields only', () => {
    const root = makeRoot();
    writePkg(root, { name: 'host', dependencies: { depA: '1.0.0' } });
    installDep(root, 'depA', {});
    installDep(root, 'undeclared', {});
    const res = new SharedSetResolver(root).resolve();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.sharedDeps).toEqual(['depA']);
  });

  it('applies exclude by root name for subpath-safe naming', () => {
    const root = makeRoot();
    writePkg(root, {
      name: 'host',
      dependencies: { 'pkg/sub': 'x', depA: '1.0.0' },
    });
    installDep(root, 'depA', {});
    const res = new SharedSetResolver(root, { exclude: ['pkg'] }).resolve();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.sharedDeps).toEqual(['depA']);
  });

  it('rejects exclude when a still-shared package depends on it, naming dependents', () => {
    const root = makeRoot();
    writePkg(root, { name: 'host', dependencies: { depA: '1.0.0' } });
    installDep(root, 'depA', { dependencies: { depX: '1.0.0' } });
    installDep(root, 'depX', {});
    const res = new SharedSetResolver(root, { exclude: ['depX'] }).resolve();
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.message).toContain('depX');
      expect(res.message).toContain('depA');
    }
  });

  it('fails when bundled version differs from the declared version', () => {
    const root = makeRoot();
    writePkg(root, { name: 'host', dependencies: { depA: '1.0.0' } });
    installDep(root, 'depA', { version: '2.0.0' });
    const res = new SharedSetResolver(root, {
      declaredVersions: new Map([['depA', '1.0.0']]),
    }).resolve();
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.message).toContain('depA');
      expect(res.message).toContain('2.0.0');
      expect(res.message).toContain('1.0.0');
    }
  });

  it('fails when a second version of a shared package is reachable in the closure', () => {
    const root = makeRoot();
    writePkg(root, {
      name: 'host',
      dependencies: { depA: '1.0.0', depB: '1.0.0' },
    });
    installDep(root, 'depA', {});
    // depB carries a nested node_modules with a second version of depA.
    const depBDir = join(root, 'node_modules', 'depB');
    writePkg(depBDir, { name: 'depB', version: '1.0.0', dependencies: { depA: '2.0.0' } });
    writePkg(join(depBDir, 'node_modules', 'depA'), { name: 'depA', version: '2.0.0' });
    const res = new SharedSetResolver(root).resolve();
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.message).toContain('depA');
      expect(res.message).toContain('1.0.0');
      expect(res.message).toContain('2.0.0');
    }
  });

  it('fails when a shared package cannot be located', () => {
    const root = makeRoot();
    writePkg(root, { name: 'host', dependencies: { missing: '1.0.0' } });
    const res = new SharedSetResolver(root).resolve();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toContain('missing');
  });
});
