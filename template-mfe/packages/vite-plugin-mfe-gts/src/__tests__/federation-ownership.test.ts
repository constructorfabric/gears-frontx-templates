/**
 * Federation ownership: `vitePluginMfeGts` configures
 * `@module-federation/vite` itself — name derived from the MFE's
 * `package.json`, `remoteEntry.js` fixed, exposes from the plugin
 * options or `mfe.json`, `shared` always `{}` (user-configured
 * federation sharing is a build error), `manifest` always `true` — and
 * owns the build settings remote loading requires (`esnext`, no
 * modulePreload, `minify`, `cssCodeSplit`), warning when a user override
 * would break loading.
 *
 * The fixtures are minimal non-React MFE packages: the plugin is
 * framework- and template-agnostic.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Plugin, PluginOption } from 'vite';

import { MfeFederationSetup, vitePluginMfeGts } from '../index';

const MFE_PLUGIN_NAME = 'gears-frontx-vite-plugin-mfe-gts';

const dirs: string[] = [];

function makeMfeRoot(opts?: {
  name?: string;
  mfeJson?: object;
  deps?: Record<string, string>;
}): string {
  const root = mkdtempSync(join(tmpdir(), 'mfe-gts-fed-'));
  dirs.push(root);
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      name: opts?.name ?? '@scope/my-mfe',
      version: '1.0.0',
      dependencies: opts?.deps ?? {},
    })
  );
  if (opts?.mfeJson !== undefined) {
    writeFileSync(join(root, 'mfe.json'), JSON.stringify(opts.mfeJson));
  }
  return root;
}

function mfePluginOf(plugins: PluginOption[]): Plugin {
  return plugins.find(
    (p): p is Plugin =>
      typeof p === 'object' && p !== null && (p as Plugin).name === MFE_PLUGIN_NAME
  )!;
}

/** Names only `@module-federation/vite`'s plugin array produces. */
const FEDERATION_PLUGIN_NAMES = new Set([
  'vite:module-federation-config',
  'module-federation-manifest',
  'module-federation-vite',
]);

function federationPluginsOf(plugins: PluginOption[]): Plugin[] {
  const out: Plugin[] = [];
  const visit = (option: unknown): void => {
    if (Array.isArray(option)) {
      option.forEach(visit);
      return;
    }
    if (option === null || typeof option !== 'object') return;
    const name = (option as { name?: unknown }).name;
    if (typeof name === 'string' && FEDERATION_PLUGIN_NAMES.has(name)) {
      out.push(option as Plugin);
    }
  };
  visit(plugins);
  return out;
}

type ConfigHookResult = {
  build: {
    target?: unknown;
    modulePreload?: unknown;
    minify?: unknown;
    cssCodeSplit?: unknown;
    rollupOptions?: { external?: unknown };
  };
};

function callConfig(
  plugin: Plugin,
  config: object,
  command: 'build' | 'serve' = 'build'
): ConfigHookResult {
  const hook = plugin.config as (
    c: object,
    env: { command: string }
  ) => ConfigHookResult;
  return hook.call({}, config, { command });
}

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('MfeFederationSetup', () => {
  it('derives the federation name from package.json (scope stripped, camelCase)', () => {
    expect(MfeFederationSetup.deriveName('@scope/demo-mfe')).toBe('demoMfe');
    expect(MfeFederationSetup.deriveName('widgets-fixture-a')).toBe('widgetsFixtureA');
    expect(MfeFederationSetup.deriveName('blank-mfe')).toBe('blankMfe');
  });

  it('never emits a leading digit — a numeric start gets the mfe prefix', () => {
    expect(MfeFederationSetup.deriveName('3d-widgets')).toBe('mfe3dWidgets');
    expect(MfeFederationSetup.deriveName('@scope/2fa')).toBe('mfe2fa');
    expect(MfeFederationSetup.deriveName('@scope/3d-widgets')).toBe('mfe3dWidgets');
  });

  it('fixes filename, shared {} and manifest; takes exposes from mfe.json', () => {
    const root = makeMfeRoot({
      name: '@scope/my-mfe',
      mfeJson: {
        manifest: { id: 'x', remoteEntry: 'r' },
        entries: [],
        exposes: { './lifecycle': './src/lifecycle.ts' },
      },
    });
    const settings = new MfeFederationSetup(root).getSettings();
    expect(settings).toEqual({
      name: 'myMfe',
      filename: 'remoteEntry.js',
      exposes: { './lifecycle': './src/lifecycle.ts' },
      shared: {},
      manifest: true,
    });
  });

  it('prefers option exposes over mfe.json', () => {
    const root = makeMfeRoot({
      mfeJson: {
        manifest: { id: 'x', remoteEntry: 'r' },
        entries: [],
        exposes: { './from-json': './src/a.ts' },
      },
    });
    const settings = new MfeFederationSetup(root, {
      './from-options': './src/b.ts',
    }).getSettings();
    expect(settings.exposes).toEqual({ './from-options': './src/b.ts' });
  });

  it('fails when package.json carries no name', () => {
    const root = mkdtempSync(join(tmpdir(), 'mfe-gts-fed-'));
    dirs.push(root);
    writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '1.0.0' }));
    expect(() => new MfeFederationSetup(root)).toThrow(
      /cannot derive the federation name/
    );
  });
});

describe('vitePluginMfeGts factory', () => {
  it('returns the federation plugins plus the MFE plugin', () => {
    const plugins = vitePluginMfeGts({
      root: makeMfeRoot({ name: '@scope/demo-mfe' }),
      exposes: { './lifecycle': './src/lifecycle.ts' },
    });
    // `@module-federation/vite` short-circuits to [] under a test env,
    // so the array's non-MFE tail is empty here; what must hold in every
    // environment is that the array ends with the MFE plugin and any
    // federation plugins present precede it.
    expect(plugins[plugins.length - 1]).toBe(mfePluginOf(plugins));
    for (const plugin of federationPluginsOf(plugins)) {
      expect(plugin.name).toMatch(/module-federation|mf:/);
    }
  });
});

describe('federation ownership', () => {
  // The metadata `@module-federation/vite`'s core plugin carries: the
  // normalized `federation()` options object on `_options`.
  const foreignFederation = () => ({
    name: 'anything',
    _options: { name: 'userRemote', filename: 'remoteEntry.js', shareScope: 'default' },
  });

  it('errors when the user config adds a federation plugin of its own', () => {
    const root = makeMfeRoot();
    const plugin = mfePluginOf(vitePluginMfeGts({ root }));
    expect(() =>
      callConfig(plugin, {
        root,
        plugins: [foreignFederation()],
      })
    ).toThrow(/Module Federation is configured by vitePluginMfeGts itself/);
  });

  it('does not flag a plugin that merely carries a federation-looking name', () => {
    const root = makeMfeRoot();
    const plugin = mfePluginOf(vitePluginMfeGts({ root }));
    expect(() =>
      callConfig(plugin, {
        root,
        plugins: [{ name: 'module-federation-manifest' }, { name: 'mf:custom' }],
      })
    ).not.toThrow();
  });

  it('does not flag the federation plugins the factory itself created', () => {
    const root = makeMfeRoot();
    const plugins = vitePluginMfeGts({ root });
    const plugin = mfePluginOf(plugins);
    expect(() =>
      callConfig(plugin, { root, plugins: [plugins] })
    ).not.toThrow();
  });
});

describe('owned build settings', () => {
  it('enforces esnext / modulePreload false / minify / cssCodeSplit', () => {
    const root = makeMfeRoot();
    const plugin = mfePluginOf(vitePluginMfeGts({ root }));
    const result = callConfig(plugin, { root });
    expect(result.build.target).toBe('esnext');
    expect(result.build.modulePreload).toBe(false);
    expect(result.build.minify).toBe(true);
    expect(result.build.cssCodeSplit).toBe(true);
  });

  it('warns when a user override would break loading, and wins anyway', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const root = makeMfeRoot();
    const plugin = mfePluginOf(vitePluginMfeGts({ root }));
    const result = callConfig(plugin, {
      root,
      build: { minify: false, target: 'es5', cssCodeSplit: false },
    });
    expect(result.build.minify).toBe(true);
    expect(result.build.target).toBe('esnext');
    expect(result.build.cssCodeSplit).toBe(true);
    const messages = warn.mock.calls.map((c) => String(c[0])).join('\n');
    expect(messages).toContain('build.minify');
    expect(messages).toContain('build.target');
    expect(messages).toContain('build.cssCodeSplit');
  });
});
