/**
 * The consumer half of barrel handling in the MFE plugin: in a build,
 * the plugin's `transform` hook rewrites the MFE's own named imports from
 * a side-effect-free shared barrel to the defining modules, so the
 * emitted chunk imports — and the manifest roots derived from them — name
 * only the units that define used bindings. A namespace import read
 * only through static `ns.Member` accesses is rewritten the same way
 * ; a namespace used dynamically falls back to the barrel and
 * is listed as bypassed in the build report.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Plugin } from 'vite';
import type { ProducedSharedPackage } from '@gears-frontx/unit-producer';

import { vitePluginMfeGts } from '../index';
import { MfeBuildReport } from '../MfeBuildReport';
import { SpecifiersDeriver } from '../SpecifiersDeriver';

let root: string;

function write(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

beforeAll(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'mfe-gts-barrel-')));
  write(
    join(root, 'package.json'),
    JSON.stringify({ name: 'mfe', dependencies: { icons: '1.0.0', 'kept-whole': '1.0.0' } })
  );
  write(
    join(root, 'mfe.json'),
    JSON.stringify({ manifest: { id: 'x', remoteEntry: 'r' }, entries: [], share: { barrelRewrite: { exclude: ['kept-whole'] } } })
  );
  const pkg = (name: string): void => {
    const dir = join(root, 'node_modules', name);
    write(
      join(dir, 'package.json'),
      JSON.stringify({ name, version: '1.0.0', type: 'module', sideEffects: false, exports: { '.': './dist/index.js' } })
    );
    write(join(dir, 'dist/index.js'), "export { Icon } from './icons/icon.js';\nexport { Other } from './icons/other.js';\n");
    write(join(dir, 'dist/icons/icon.js'), 'export const Icon = 1;\n');
    write(join(dir, 'dist/icons/other.js'), 'export const Other = 2;\n');
  };
  pkg('icons');
  pkg('kept-whole');
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

type TransformHandler = (code: string, id: string) => Promise<{ code: string } | null>;

function pluginFor(command: 'build' | 'serve'): { plugin: Plugin; transform: TransformHandler } {
  const plugin = vitePluginMfeGts({ root }).find(
    (p): p is Plugin =>
      typeof p === 'object' &&
      p !== null &&
      (p as Plugin).name === 'gears-frontx-vite-plugin-mfe-gts'
  )!;
  (plugin.config as (c: object) => unknown).call({}, { root });
  (plugin.configResolved as (c: object) => void).call({}, { root, command, build: { outDir: 'dist' } });
  const hook = plugin.transform as { order?: string; handler: TransformHandler };
  return { plugin, transform: (code, id) => hook.handler.call({}, code, id) };
}

describe('vite-plugin-mfe-gts consumer barrel rewrite', () => {
  it('runs before TypeScript is stripped', () => {
    const plugin = vitePluginMfeGts().find(
      (p): p is Plugin =>
        typeof p === 'object' &&
        p !== null &&
        (p as Plugin).name === 'gears-frontx-vite-plugin-mfe-gts'
    )!;
    expect((plugin.transform as { order?: string }).order).toBe('pre');
  });

  it('rewrites named imports from a shared barrel to the defining modules in a build', async () => {
    const { transform } = pluginFor('build');
    const out = await transform("import { Icon } from 'icons';\nexport const x = Icon;\n", join(root, 'src/App.tsx'));
    expect(out?.code).toContain("import { Icon } from 'icons/dist/icons/icon.js';");
  });

  it('rewrites a namespace import read only through static member accesses', async () => {
    const { transform } = pluginFor('build');
    const out = await transform("import * as I from 'icons';\nI.Icon;\n", join(root, 'src/B.ts'));
    // `I.Icon` is statically resolvable; the member is imported from its
    // defining module under a collision-free local (`Icon` is taken by
    // the member access itself).
    expect(out?.code).toContain("import { Icon as I_Icon } from 'icons/dist/icons/icon.js';");
    expect(out?.code).toContain('I_Icon;');
  });

  it('leaves the barrel for packages mfe.json excludes, for dynamic namespace uses, and outside builds', async () => {
    const build = pluginFor('build');
    expect(await build.transform("import { Icon } from 'kept-whole';\n", join(root, 'src/A.ts'))).toBeNull();
    // The namespace passed whole is a dynamic use — the barrel stands.
    expect(await build.transform("import * as I from 'icons';\nconsole.log(I);\n", join(root, 'src/B.ts'))).toBeNull();
    // A computed member access is dynamic too.
    expect(
      await build.transform("import * as I from 'icons';\ndeclare const k: string;\nI[k];\n", join(root, 'src/C.ts'))
    ).toBeNull();
    expect(await build.transform("import { Icon } from 'icons';\n", join(root, 'node_modules/x/y.js'))).toBeNull();
    const serve = pluginFor('serve');
    expect(await serve.transform("import { Icon } from 'icons';\n", join(root, 'src/App.tsx'))).toBeNull();
  });

  it('derives the defining module specifier, not the barrel', () => {
    const specifiers = SpecifiersDeriver.entrySpecifiers({
      exposes: [{ path: './entry', assets: { js: { sync: ['entry.js'] } } }],
      chunks: new Map([
        [
          'entry.js',
          {
            fileName: 'entry.js',
            cssAssets: [],
            imports: ['icons/dist/icons/icon.js'],
            dynamicImports: [],
            ownCssModules: [],
          },
        ],
      ]),
      sharedDepNames: new Set(['icons']),
    });
    expect(specifiers['./entry']).toEqual(['icons/dist/icons/icon.js']);
  });

  it('lists consumer barrel outcomes and bypassed barrels in the build report', () => {
    const report = MfeBuildReport.compose({
      mfe: 'mfe',
      sharedOutDir: 'shared',
      produced: [] as ProducedSharedPackage[],
      consumerBarrels: [
        { name: 'icons', mode: 'rewritten', rewrites: 3, keptReasons: [] },
        { name: 'kept-whole', mode: 'kept', rewrites: 0, keptReasons: ['package excluded from barrel rewriting'] },
      ],
    });
    expect(report.consumerBarrels).toHaveLength(2);
    expect(report.keptBarrels).toEqual(['kept-whole: package excluded from barrel rewriting']);
  });
});
