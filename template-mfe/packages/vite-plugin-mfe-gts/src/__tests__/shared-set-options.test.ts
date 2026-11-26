/**
 * The MFE plugin applies the same shared-set rule as the shell plugin:
 * mutually exclusive `include` / `exclude`, and a default that shares
 * every bare package the build graph imports — workspace-linked ones
 * included — whether or not `package.json` declares it.
 */

import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Plugin } from 'vite';

import { vitePluginMfeGts } from '../index';

const dirs: string[] = [];

function writePkg(dir: string, pkg: Record<string, unknown>): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg));
}

/** An MFE declaring `declared-lib`, with a linked workspace package and an undeclared one. */
function makeMfe(): string {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'mfe-shared-set-')));
  dirs.push(base);
  const root = join(base, 'mfe');
  writePkg(root, { name: 'mfe', dependencies: { 'declared-lib': '1.0.0' } });
  writePkg(join(root, 'node_modules', 'declared-lib'), { name: 'declared-lib', version: '1.0.0' });
  writeFileSync(join(root, 'node_modules', 'declared-lib', 'index.js'), 'export {};\n');
  writePkg(join(base, 'workspace', 'ws-lib'), { name: 'ws-lib', version: '1.0.0' });
  symlinkSync(join(base, 'workspace', 'ws-lib'), join(root, 'node_modules', 'ws-lib'), 'dir');
  return root;
}

type ExternalFn = (source: string, importer: string | undefined, resolved: boolean) => boolean;

function configure(
  root: string,
  options?: Parameters<typeof vitePluginMfeGts>[0]
): { external: ExternalFn | undefined } {
  const plugin = vitePluginMfeGts({ ...options, root }).find(
    (p): p is Plugin => (p as Plugin).name === 'gears-frontx-vite-plugin-mfe-gts'
  )!;
  (plugin.config as (c: object, env: object) => unknown).call({}, {}, { command: 'build' });
  const resolved = {
    root,
    command: 'build',
    build: { outDir: 'dist', rollupOptions: {} as { external?: ExternalFn } },
  };
  (plugin.configResolved as (c: object) => void).call({}, resolved);
  return { external: resolved.build.rollupOptions.external };
}

const SOURCE = '/mfe/src/index.tsx';

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe('vitePluginMfeGts shared-set options', () => {
  it('never shares a declared webfont package: its files stay assets of this build', () => {
    const root = makeMfe();
    writePkg(root, {
      name: 'mfe',
      dependencies: { 'declared-lib': '1.0.0', 'webfont-pack': '1.0.0' },
    });
    const font = join(root, 'node_modules', 'webfont-pack');
    writePkg(font, {
      name: 'webfont-pack',
      version: '1.0.0',
      main: 'index.css',
      exports: {
        '.': { types: './index.d.css.ts', default: './index.css' },
        './LICENSE': './LICENSE',
        './*': { default: './*.css' },
        './files/*': { default: './files/*' },
        './package.json': './package.json',
      },
    });
    writeFileSync(join(font, 'index.css'), 'body{}\n');
    writeFileSync(join(font, 'index.d.css.ts'), 'export {};\n');
    writeFileSync(join(font, 'LICENSE'), 'licence\n');
    mkdirSync(join(font, 'files'), { recursive: true });
    writeFileSync(join(font, 'files', 'f-latin.woff2'), 'wOF2');
    const { external } = configure(root);
    expect(external!('webfont-pack', SOURCE, false)).toBe(false);
    expect(external!('declared-lib', SOURCE, false)).toBe(true);
  });

  it('default: shares an imported workspace-linked package package.json does not declare', () => {
    const { external } = configure(makeMfe());
    expect(external!('declared-lib', SOURCE, false)).toBe(true);
    expect(external!('ws-lib', SOURCE, false)).toBe(true);
  });

  it('ignores a package only tooling imports (an html entry)', () => {
    const { external } = configure(makeMfe());
    expect(external!('ws-lib', '/mfe/index.html', false)).toBe(false);
  });

  it('exclude removes a package from the default set', () => {
    const { external } = configure(makeMfe(), { exclude: ['ws-lib'] });
    expect(external!('ws-lib', SOURCE, false)).toBe(false);
  });

  it('mfe.json share.exclude feeds the same decision as the exclude option', () => {
    const root = makeMfe();
    writeFileSync(join(root, 'mfe.json'), JSON.stringify({ share: { exclude: ['ws-lib'] } }));
    const { external } = configure(root);
    expect(external!('ws-lib', SOURCE, false)).toBe(false);
    expect(external!('declared-lib', SOURCE, false)).toBe(true);
  });

  it('fails when include is combined with mfe.json share.exclude', () => {
    const root = makeMfe();
    writeFileSync(join(root, 'mfe.json'), JSON.stringify({ share: { exclude: ['ws-lib'] } }));
    expect(() => configure(root, { include: ['declared-lib'] })).toThrow(/mutually exclusive/);
  });

  it('include shares only the listed package; include: [] shares nothing', () => {
    const listed = configure(makeMfe(), { include: ['declared-lib'] });
    expect(listed.external!('declared-lib', SOURCE, false)).toBe(true);
    expect(listed.external!('ws-lib', SOURCE, false)).toBe(false);
    expect(configure(makeMfe(), { include: [] }).external).toBeUndefined();
  });

  it('fails the build with a clear message when include and exclude are both set', () => {
    expect(() =>
      configure(makeMfe(), { include: ['declared-lib'], exclude: ['ws-lib'] })
    ).toThrow(/"include" and "exclude" are mutually exclusive/);
  });
});
