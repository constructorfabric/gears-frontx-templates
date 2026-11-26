/**
 * Bundler settings the shell plugin applies for the derived shared set
 * `resolve.dedupe` covers every shared package in both `vite
 * dev` and `vite build`; `vite dev` additionally gets
 * `optimizeDeps.include` for the CJS shared packages and the subpaths
 * the host's own sources import. Non-runtime packages — no JavaScript
 * entry, asset-only entries, nothing installed — never join the shared
 * set; a build tool left in `dependencies` is warned about; `exclude`
 * stays the escape hatch for JavaScript that is not browser code.
 *
 * The fixture host is synthetic and non-React (the plugin is framework-
 * and template-agnostic): the `config` hook is exercised directly, the
 * way Vite calls it.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Plugin, UserConfig } from 'vite';

import { vitePluginShell } from '../index';

const dirs: string[] = [];

interface FixtureDep {
  name: string;
  version: string;
  /** package.json fields beyond name/version. */
  fields?: Record<string, unknown>;
  files?: Record<string, string>;
}

/**
 * A minimal host: `package.json` declaring `deps`, each installed under
 * its own `node_modules`, and `src/main.js` importing `imports`.
 * Deps listed in `uninstalled` are declared but never installed.
 */
function makeHost(opts: {
  deps: FixtureDep[];
  uninstalled?: string[];
  imports?: string[];
}): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shell-bundler-'));
  dirs.push(root);
  const dependencies: Record<string, string> = {};
  for (const dep of opts.deps) dependencies[dep.name] = dep.version;
  for (const name of opts.uninstalled ?? []) dependencies[name] = '1.0.0';
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'fixture-host', version: '0.0.0', dependencies })
  );
  for (const dep of opts.deps) {
    const dir = path.join(root, 'node_modules', dep.name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: dep.name, version: dep.version, ...dep.fields })
    );
    for (const [file, content] of Object.entries(dep.files ?? {})) {
      const target = path.join(dir, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    }
  }
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'src', 'main.js'),
    (opts.imports ?? [])
      .map((spec) => `import '${spec}';`)
      .join('\n')
  );
  return root;
}

type ConfigResult = {
  resolve?: { dedupe?: string[] };
  optimizeDeps?: { include?: string[] };
  build?: { rollupOptions?: { external?: (s: string) => boolean } };
} | null;

function callConfig(
  plugin: Plugin,
  root: string,
  command: 'build' | 'serve',
  extra?: UserConfig
): ConfigResult {
  const hook = plugin.config as (
    c: object,
    env: { command: string }
  ) => ConfigResult;
  const result = hook.call({}, { root, ...extra }, { command });
  // The shared set is externalized on the resolved config.
  const build = {
    outDir: 'dist',
    rollupOptions: { external: extra?.build?.rollupOptions?.external },
  };
  const resolved = plugin.configResolved as (c: object) => void;
  resolved.call({}, { root, command, base: '/', build, html: {} });
  if (result === null || typeof build.rollupOptions.external !== 'function') return result;
  return {
    ...result,
    build: { rollupOptions: { external: build.rollupOptions.external as (s: string) => boolean } },
  };
}

const DEPS: FixtureDep[] = [
  {
    name: 'cjs-lib',
    version: '1.0.0',
    fields: { main: 'index.js' },
    files: {
      'index.js': 'module.exports = {};\n',
      'extra.js': 'module.exports = {};\n',
    },
  },
  {
    name: 'esm-lib',
    version: '1.0.0',
    fields: { type: 'module', main: 'index.js' },
    files: { 'index.js': 'export const x = 1;\n' },
  },
  {
    name: 'font-pack',
    version: '1.0.0',
    // Asset-only package: stylesheet entries, no JavaScript entry.
    fields: { exports: { '.': './index.css' }, sideEffects: ['**/*.css'] },
    files: { 'index.css': 'body{}\n' },
  },
  {
    // A build tool: bin entries, Node-facing `main`, no ESM/browser entry.
    name: 'tool-pack',
    version: '1.0.0',
    fields: { main: 'lib/main.js', bin: { 'tool-pack': 'bin/cli.js' } },
    files: { 'lib/main.js': 'module.exports = {};\n', 'bin/cli.js': '#!/usr/bin/env node\n' },
  },
];

function standardHost(): string {
  return makeHost({
    deps: DEPS,
    uninstalled: ['ghost-pack'],
    imports: ['cjs-lib', 'cjs-lib/extra', 'esm-lib'],
  });
}

afterEach(() => {
  while (dirs.length > 0) fs.rmSync(dirs.pop()!, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('resolve.dedupe', () => {
  it('covers the whole derived shared set in dev and build, minus non-runtime packages', () => {
    const root = standardHost();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    for (const command of ['serve', 'build'] as const) {
      const result = callConfig(vitePluginShell(), root, command);
      expect(result?.resolve?.dedupe).toEqual(
        expect.arrayContaining(['cjs-lib', 'esm-lib', 'tool-pack'])
      );
      expect(result?.resolve?.dedupe).not.toContain('font-pack');
      expect(result?.resolve?.dedupe).not.toContain('ghost-pack');
    }
  });
});

describe('dev optimizeDeps', () => {
  it('includes CJS shared packages and the subpaths the host imports', () => {
    const root = standardHost();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const result = callConfig(vitePluginShell(), root, 'serve');
    const include = result?.optimizeDeps?.include ?? [];
    expect(include).toEqual(
      expect.arrayContaining(['cjs-lib', 'cjs-lib/extra'])
    );
    expect(include).not.toContain('esm-lib');
    expect(include).not.toContain('font-pack');
  });

  it('is not set for builds', () => {
    const root = standardHost();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const result = callConfig(vitePluginShell(), root, 'build');
    expect(result?.optimizeDeps).toBeUndefined();
  });
});

describe('non-runtime detection', () => {
  it('never externalizes an auto-excluded package, and reports it', () => {
    const root = standardHost();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const result = callConfig(vitePluginShell(), root, 'build');
    const external = result?.build?.rollupOptions?.external;
    expect(external?.('cjs-lib')).toBe(true);
    expect(external?.('font-pack')).toBe(false);
    expect(external?.('ghost-pack')).toBe(false);
    expect(
      log.mock.calls.map((c) => String(c[0])).join('\n')
    ).toContain('non-runtime package(s) never shared: font-pack, ghost-pack');
    void warn;
  });

  it('warns when a build tool sits in dependencies but still shares it', () => {
    const root = standardHost();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const result = callConfig(vitePluginShell(), root, 'build');
    expect(
      warn.mock.calls.map((c) => String(c[0])).join('\n')
    ).toContain('"tool-pack" looks like a build tool');
    expect(result?.build?.rollupOptions?.external?.('tool-pack')).toBe(true);
  });

  it('never shares a webfont package exporting a licence, a font-file pattern and a .d.css.ts types target', () => {
    const root = makeHost({
      deps: [
        ...DEPS,
        {
          name: 'webfont-pack',
          version: '1.0.0',
          fields: {
            main: 'index.css',
            exports: {
              '.': { types: './index.d.css.ts', sass: './index.css', default: './index.css' },
              './LICENSE': './LICENSE',
              './*': { sass: './*.css', default: './*.css' },
              './files/*': { sass: './files/*', default: './files/*' },
              './scss': { sass: './scss/metadata.scss' },
              './package.json': './package.json',
            },
          },
          files: {
            'index.css': 'body{}\n',
            'index.d.css.ts': 'export {};\n',
            LICENSE: 'licence\n',
            'files/f-latin.woff2': 'wOF2',
            'scss/metadata.scss': '$m: ();\n',
          },
        },
      ],
      imports: ['cjs-lib'],
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const result = callConfig(vitePluginShell(), root, 'build');
    expect(result?.build?.rollupOptions?.external?.('webfont-pack')).toBe(false);
    expect(result?.resolve?.dedupe).not.toContain('webfont-pack');
    expect(
      log.mock.calls.map((c) => String(c[0])).join('\n')
    ).toContain('webfont-pack');
  });
});

describe('exclude escape hatch', () => {
  it('still removes a JavaScript package from the shared set', () => {
    const root = makeHost({ deps: DEPS, imports: [] });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const result = callConfig(
      vitePluginShell({ exclude: ['tool-pack'] }),
      root,
      'build'
    );
    expect(result?.resolve?.dedupe).not.toContain('tool-pack');
    expect(result?.build?.rollupOptions?.external?.('tool-pack')).toBe(false);
  });
});
