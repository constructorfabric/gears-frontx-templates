/**
 * What the plugin settles on the resolved config and the package root:
 *
 *  - the shared set's `external` predicate wraps whatever `external` the
 *    resolved config holds — a string, a regular expression, an array of
 *    them or a function — on the top-level build options and on every
 *    environment's, so a merged array never leaves the predicate uncalled;
 *  - the target is `esnext` even when the config asks for an array target,
 *    which Vite would otherwise merge with the plugin's value;
 *  - the plugin's `root` option is the one package root: Vite's own `root`
 *    does not decide which `package.json` and `mfe.json` the shared set
 *    comes from;
 *  - a watch rebuild transforms the MFE's own modules again, so the barrel
 *    ledger records the rewrites the rebuilt output carries;
 *  - the module transform returns a source map that keeps every line it
 *    did not edit on its original line.
 */

import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mergeConfig, type Plugin, type UserConfig } from 'vite';

import { vitePluginMfeGts } from '../index';
import { put } from './helpers/files';

type ExternalFn = (source: string, importer: string | undefined, resolved: boolean) => boolean;

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
  vi.restoreAllMocks();
});

/** An MFE package declaring `lib` and `lib2`, `mfe.json` opting `lib2` out. */
function makeMfe(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'mfe-gts-resolved-')));
  dirs.push(root);
  put(
    join(root, 'package.json'),
    JSON.stringify({ name: 'mfe', dependencies: { lib: '1.0.0', lib2: '1.0.0' } })
  );
  put(join(root, 'mfe.json'), JSON.stringify({ share: { exclude: ['lib2'] } }));
  for (const name of ['lib', 'lib2']) {
    put(join(root, 'node_modules', name, 'package.json'), JSON.stringify({ name, version: '1.0.0' }));
    put(join(root, 'node_modules', name, 'index.js'), 'export {};\n');
  }
  return root;
}

function mainPlugin(root: string): Plugin {
  return vitePluginMfeGts({ root }).find(
    (p): p is Plugin => (p as Plugin).name === 'gears-frontx-vite-plugin-mfe-gts'
  )!;
}

/**
 * Runs the plugin's `config` hook on `user`, merges its result the way
 * Vite does, and hands `configResolved` a resolved config holding the
 * merged build options at the top level and, as a separate object, in the
 * client environment.
 */
function resolve(
  plugin: Plugin,
  user: UserConfig,
  viteRoot: string
): { build: { target?: unknown; rollupOptions: { external?: unknown } }; environments: { client: { build: { target?: unknown; rollupOptions: { external?: unknown } } } } } {
  const returned = (plugin.config as (c: UserConfig, env: object) => UserConfig).call(
    {},
    user,
    { command: 'build' }
  );
  const merged = mergeConfig(user, returned);
  const build = { ...merged.build, outDir: 'dist', rollupOptions: { ...merged.build?.rollupOptions } };
  const resolved = {
    root: viteRoot,
    command: 'build',
    build,
    environments: {
      client: { build: { ...build, rollupOptions: { ...build.rollupOptions } } },
    },
  };
  (plugin.configResolved as (c: object) => void).call({}, resolved);
  return resolved;
}

describe('resolved external', () => {
  const cases: Array<[string, UserConfig['build']]> = [
    ['an array of a string and a regular expression', { rollupOptions: { external: ['node:fs', /^virtual:/] } }],
    ['a string', { rollupOptions: { external: 'node:fs' } }],
    ['a regular expression', { rollupOptions: { external: /^(node:fs|virtual:.*)$/ } }],
    [
      'a function',
      { rollupOptions: { external: (id: string) => id === 'node:fs' || id.startsWith('virtual:') } },
    ],
  ];
  for (const [form, build] of cases) {
    it(`externalizes the shared set and keeps ${form} the config holds, on every build`, () => {
      const root = makeMfe();
      const resolved = resolve(mainPlugin(root), { build }, root);
      for (const options of [resolved.build, resolved.environments.client.build]) {
        const external = options.rollupOptions.external as ExternalFn;
        expect(typeof external).toBe('function');
        expect(external('lib', undefined, false)).toBe(true);
        expect(external('lib/sub', undefined, false)).toBe(true);
        expect(external('node:fs', undefined, false)).toBe(true);
        expect(external('not-listed', undefined, false)).toBe(false);
      }
      expect((resolved.build.rollupOptions.external as ExternalFn)('virtual:x', undefined, false)).toBe(
        form !== 'a string'
      );
    });
  }
});

describe('resolved target', () => {
  it('is esnext when the config asks for an array target, warning that the override is ignored', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const root = makeMfe();
    const resolved = resolve(mainPlugin(root), { build: { target: ['es2020', 'chrome100'] } }, root);
    expect(resolved.build.target).toBe('esnext');
    expect(resolved.environments.client.build.target).toBe('esnext');
    expect(warn.mock.calls.flat().join('\n')).toMatch(/build\.target .*es2020.* the override is ignored/);
  });

  it('sets esnext on resolved build options another plugin gave an array target', () => {
    const root = makeMfe();
    const plugin = mainPlugin(root);
    (plugin.config as (c: object, env: object) => unknown).call({}, {}, { command: 'build' });
    const resolved = {
      root,
      command: 'build',
      build: { outDir: 'dist', target: ['es2015'], rollupOptions: {} },
      environments: { client: { build: { target: ['es2015'], rollupOptions: {} } } },
    };
    (plugin.configResolved as (c: object) => void).call({}, resolved);
    expect(resolved.build.target).toBe('esnext');
    expect(resolved.environments.client.build.target).toBe('esnext');
  });
});

describe('package root', () => {
  it('reads the shared set and mfe.json from the root option, not from Vite root', () => {
    const root = makeMfe();
    const elsewhere = realpathSync(mkdtempSync(join(tmpdir(), 'mfe-gts-vite-root-')));
    dirs.push(elsewhere);
    put(join(elsewhere, 'package.json'), JSON.stringify({ name: 'elsewhere' }));
    const resolved = resolve(mainPlugin(root), { root: elsewhere }, elsewhere);
    const external = resolved.build.rollupOptions.external as ExternalFn;
    expect(external('lib', undefined, false)).toBe(true);
    // `lib2` is opted out by the root's own mfe.json.
    expect(external('lib2', undefined, false)).toBe(false);
  });
});

describe('watch rebuild', () => {
  it("transforms the MFE's own modules again instead of serving them from the transform cache", () => {
    const root = makeMfe();
    const plugin = mainPlugin(root);
    resolve(plugin, {}, root);
    // Answered first: another plugin answering `false` must not keep the
    // cached transform of an own module.
    const hook = plugin.shouldTransformCachedModule as {
      order?: string;
      handler: (info: { id: string }) => boolean | null;
    };
    expect(hook.order).toBe('pre');
    expect(hook.handler.call({}, { id: join(root, 'src', 'App.tsx') })).toBe(true);
    expect(hook.handler.call({}, { id: join(root, 'node_modules', 'lib', 'index.js') })).toBeNull();
  });
});

/** Decodes a map's `mappings`: generated line → the original lines its segments name. */
function originalLines(mappings: string): Array<Set<number>> {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let originalLine = 0;
  return mappings.split(';').map((line) => {
    const lines = new Set<number>();
    for (const segment of line.split(',').filter((s) => s !== '')) {
      const values: number[] = [];
      let value = 0;
      let shift = 0;
      for (const c of segment) {
        const digit = chars.indexOf(c);
        value += (digit & 31) << shift;
        if (digit & 32) {
          shift += 5;
        } else {
          values.push(value & 1 ? -(value >>> 1) : value >>> 1);
          value = 0;
          shift = 0;
        }
      }
      originalLine += values[2];
      lines.add(originalLine);
    }
    return lines;
  });
}

describe('module transform source map', () => {
  it('maps every line the barrel rewrite and the stylesheet imports left unchanged to its original line', async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'mfe-gts-map-')));
    dirs.push(root);
    put(join(root, 'package.json'), JSON.stringify({ name: 'mfe', dependencies: { kit: '1.0.0' } }));
    const kit = join(root, 'node_modules', 'kit');
    put(
      join(kit, 'package.json'),
      JSON.stringify({ name: 'kit', version: '1.0.0', type: 'module', sideEffects: ['**/*.css'] })
    );
    put(join(kit, 'index.js'), "export { Button } from './button.js';\n");
    put(join(kit, 'button.js'), "import './button.css';\nexport function Button() {}\n");
    put(join(kit, 'button.css'), '.b { color: red; }\n');
    const plugin = vitePluginMfeGts({ root }).find(
      (p): p is Plugin => (p as Plugin).name === 'gears-frontx-vite-plugin-mfe-gts'
    )!;
    resolve(plugin, {}, root);
    const source = [
      "import { Button } from 'kit';",
      'const first = 1;',
      'export const second = Button;',
      'export const third = first;',
      '',
    ].join('\n');
    const hook = plugin.transform as {
      handler: (code: string, id: string) => Promise<{ code: string; map: { mappings: string } | null } | null>;
    };
    const out = await hook.handler.call({}, source, join(root, 'src', 'App.ts'));
    expect(out).not.toBeNull();
    expect(out!.code).not.toBe(source);
    expect(out!.map).not.toBeNull();
    const before = source.split('\n');
    const after = out!.code.split('\n');
    const mapped = originalLines(out!.map!.mappings);
    for (const kept of ['const first = 1;', 'export const second = Button;', 'export const third = first;']) {
      const generatedLine = after.indexOf(kept);
      expect(generatedLine, kept).toBeGreaterThan(-1);
      expect([...mapped[generatedLine]], kept).toEqual([before.indexOf(kept)]);
    }
  });
});
