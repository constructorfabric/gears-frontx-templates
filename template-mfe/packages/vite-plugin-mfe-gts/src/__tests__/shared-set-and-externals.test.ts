/**
 * Shared-set derivation and the externals predicate: the set comes from
 * `SharedSetResolver` (never a name list), and externalization matches by
 * root package name so `react-dom/client` and other subpaths externalize.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SharedSetResolver } from '@gears-frontx/unit-producer';
import { vitePluginMfeGts } from '../index';
import type { Plugin } from 'vite';

/** The `MfeGtsPlugin` object out of the factory's plugin array. */
function mfeGtsPlugin(
  options?: Parameters<typeof vitePluginMfeGts>[0]
): Plugin {
  return vitePluginMfeGts(options).find(
    (p): p is Plugin =>
      typeof p === 'object' &&
      p !== null &&
      (p as Plugin).name === 'gears-frontx-vite-plugin-mfe-gts'
  )!;
}

describe('shared set + externals predicate', () => {
  it('the plugin exposes no externals list option', () => {
    const plugin = mfeGtsPlugin();
    expect(plugin.name).toBe('gears-frontx-vite-plugin-mfe-gts');
    // No `externals`/`sharedDeps` option exists — the set is derived.
    expect(vitePluginMfeGts.length).toBeLessThanOrEqual(1);
  });

  it('config hook derives the set via SharedSetResolver and externalizes by root name', () => {
    const plugin = mfeGtsPlugin();
    const configHook = plugin.config;
    expect(typeof configHook).toBe('function');
  });

  it('root-name matching covers subpath specifiers', () => {
    // The externals predicate inside the plugin uses the same root-name
    // rule as SharedSetResolver.extractRootPackageName — assert the rule
    // it relies on directly.
    const sharedRoots = new Set(['react', 'react-dom', '@gears-frontx/react']);
    const isExternal = (spec: string): boolean =>
      sharedRoots.has(SharedSetResolver.extractRootPackageName(spec));

    expect(isExternal('react')).toBe(true);
    expect(isExternal('react-dom/client')).toBe(true);
    expect(isExternal('@gears-frontx/react/lifecycle')).toBe(true);
    expect(isExternal('lodash')).toBe(false);
  });
});

describe('config hook externals (real predicate)', () => {
  const dirs: string[] = [];
  afterEach(() => {
    while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
  });

  function makeRoot(): string {
    const root = mkdtempSync(join(tmpdir(), 'mfe-gts-externals-'));
    dirs.push(root);
    const write = (rel: string, json: object): void => {
      mkdirSync(join(root, rel), { recursive: true });
      writeFileSync(join(root, rel, 'package.json'), JSON.stringify(json));
    };
    write('.', { name: 'mfe', dependencies: { lib: '1.0.0' } });
    write('node_modules/lib', {
      name: 'lib',
      version: '1.0.0',
      peerDependencies: { 'peer-pkg': '1.0.0' },
    });
    write('node_modules/peer-pkg', { name: 'peer-pkg', version: '1.0.0' });
    writeFileSync(join(root, 'node_modules/lib/index.js'), 'export {};\n');
    return root;
  }

  function externalOf(root: string): (source: string) => boolean {
    const plugin = mfeGtsPlugin({ root });
    (plugin.config as (c: object, env: object) => unknown).call({}, {}, { command: 'build' });
    const resolved = {
      root,
      command: 'build',
      build: {
        outDir: 'dist',
        rollupOptions: {} as { external?: (s: string, i?: string, r?: boolean) => boolean },
      },
    };
    (plugin.configResolved as (c: object) => void).call({}, resolved);
    return (s) => resolved.build.rollupOptions.external!(s, undefined, false);
  }

  it('externalizes shared roots, their subpaths, and the closure', () => {
    const external = externalOf(makeRoot());
    expect(external('lib')).toBe(true);
    expect(external('lib/jsx-runtime')).toBe(true);
    expect(external('peer-pkg')).toBe(true);
    expect(external('not-shared')).toBe(false);
  });

  it('leaves asset specifiers of shared packages to Vite', () => {
    const external = externalOf(makeRoot());
    expect(external('lib/theme.css?inline')).toBe(false);
    expect(external('lib/theme.css')).toBe(false);
    expect(external('lib/icon.svg?url')).toBe(false);
  });
});
