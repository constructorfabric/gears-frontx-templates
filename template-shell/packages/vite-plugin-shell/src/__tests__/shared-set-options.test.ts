/**
 * Behavioural tests for the shell plugin's shared-set options on a
 * synthetic host: the default derives the set from the resolved build
 * graph (workspace-linked packages included), `include` shares
 * the listed packages plus their runtime dependencies and reports them,
 * `include: []` boots fully natively, and `include` with `exclude` fails
 * the build. Assertions read the emitted output and build report.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { build } from 'vite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { vitePluginShell, type VitePluginShellOptions } from '../index';

interface Pkg {
  name: string;
  files?: Record<string, string>;
  dependencies?: Record<string, string>;
  /** Linked from outside `node_modules` (a workspace package). */
  workspace?: boolean;
}

function writePkg(dir: string, pkg: Pkg): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({
      name: pkg.name,
      version: '1.0.0',
      type: 'module',
      main: 'index.js',
      ...(pkg.dependencies ? { dependencies: pkg.dependencies } : {}),
    })
  );
  const files = { 'index.js': 'export const value = 1;\n', ...(pkg.files ?? {}) };
  for (const [file, source] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, file), source);
  }
}

function makeHost(
  root: string,
  params: { declared: string[]; imports: string[]; packages: Pkg[] }
): void {
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({
      name: 'fixture-host',
      version: '0.0.0',
      type: 'module',
      dependencies: Object.fromEntries(params.declared.map((n) => [n, '1.0.0'])),
    })
  );
  fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true });
  for (const pkg of params.packages) {
    const target = pkg.workspace
      ? path.join(path.dirname(root), 'workspace', pkg.name)
      : path.join(root, 'node_modules', pkg.name);
    writePkg(target, pkg);
    if (pkg.workspace) {
      fs.symlinkSync(target, path.join(root, 'node_modules', pkg.name), 'dir');
    }
  }
  fs.writeFileSync(
    path.join(root, 'index.html'),
    '<!doctype html><html><head><meta charset="UTF-8" /></head><body>' +
      '<script type="module" src="/src/main.js"></script></body></html>\n'
  );
  fs.writeFileSync(
    path.join(root, 'src', 'main.js'),
    params.imports.map((n) => `import '${n}';`).join('\n') + '\n'
  );
}

async function buildHost(root: string, options?: VitePluginShellOptions): Promise<void> {
  await build({
    root,
    logLevel: 'silent',
    plugins: [vitePluginShell(options)],
    build: { outDir: 'dist', emptyOutDir: true },
  });
}

function sharedNames(root: string): string[] {
  const dir = path.join(root, 'dist', 'shared');
  return fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
}

function entryChunk(root: string): string {
  const assets = path.join(root, 'dist', 'assets');
  return fs
    .readdirSync(assets)
    .filter((f) => f.endsWith('.js') && !f.startsWith('frontx-shell-fill'))
    .map((f) => fs.readFileSync(path.join(assets, f), 'utf-8'))
    .join('\n');
}

function report(root: string): {
  sharedSet: {
    mode: string;
    packages: Array<{ name: string; reachedAs: string }>;
    closureAdded: string[];
    warnings: string[];
    estimatedDuplicateBytes?: number;
  };
} {
  return JSON.parse(
    fs.readFileSync(path.join(root, 'dist', 'shell-build-report.json'), 'utf-8')
  );
}

describe('vitePluginShell shared-set options', () => {
  let tmp: string;
  let root: string;

  beforeEach(() => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'vpsh-shared-set-')));
    root = path.join(tmp, 'host');
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('default: shares an imported workspace-linked package its package.json does not declare', async () => {
    makeHost(root, {
      declared: ['declared-lib'],
      imports: ['declared-lib', 'ws-lib'],
      packages: [{ name: 'declared-lib' }, { name: 'ws-lib', workspace: true }],
    });

    await buildHost(root);

    expect(sharedNames(root).some((n) => n.startsWith('ws-lib@'))).toBe(true);
    expect(entryChunk(root)).toMatch(/import\s*["']ws-lib["']/);
    const { sharedSet } = report(root);
    expect(sharedSet.mode).toBe('default');
    expect(sharedSet.packages.find((p) => p.name === 'ws-lib')?.reachedAs).toBe('workspace');
    expect(sharedSet.warnings).toEqual([
      '"ws-lib" is imported but not declared in dependencies or peerDependencies',
    ]);
    expect(sharedSet.estimatedDuplicateBytes).toBeUndefined();
  });

  it('default: a host declaring nothing still shares an imported workspace package, with an import map', async () => {
    makeHost(root, {
      declared: [],
      imports: ['ws-lib'],
      packages: [{ name: 'ws-lib', workspace: true }],
    });

    await buildHost(root);

    const html = fs.readFileSync(path.join(root, 'dist', 'index.html'), 'utf-8');
    expect(html).toMatch(/<script type="importmap"[^>]*>[^<]*ws-lib/);
    expect(sharedNames(root).some((n) => n.startsWith('ws-lib@'))).toBe(true);
    expect(report(root).sharedSet.packages.find((p) => p.name === 'ws-lib')?.reachedAs).toBe(
      'workspace'
    );
  });

  it('exclude: the excluded package is bundled, not external, and not produced', async () => {
    makeHost(root, {
      declared: ['declared-lib'],
      imports: ['declared-lib', 'ws-lib'],
      packages: [{ name: 'declared-lib' }, { name: 'ws-lib', workspace: true }],
    });

    await buildHost(root, { exclude: ['ws-lib'] });

    expect(sharedNames(root).some((n) => n.startsWith('ws-lib@'))).toBe(false);
    expect(entryChunk(root)).not.toMatch(/import\s*["']ws-lib["']/);
  });

  it('include: shares the listed package, adds and reports its runtime dependencies, bundles the rest', async () => {
    makeHost(root, {
      declared: ['top', 'other'],
      imports: ['top', 'other'],
      packages: [
        {
          name: 'top',
          dependencies: { inner: '1.0.0' },
          files: { 'index.js': "import { value } from 'inner';\nexport const top = value;\n" },
        },
        { name: 'inner' },
        { name: 'other', files: { 'index.js': 'export const other = 7;\n' } },
      ],
    });

    await buildHost(root, { include: ['top'] });

    const names = sharedNames(root);
    expect(names.some((n) => n.startsWith('top@'))).toBe(true);
    expect(names.some((n) => n.startsWith('inner@'))).toBe(true);
    expect(names.some((n) => n.startsWith('other@'))).toBe(false);
    expect(entryChunk(root)).not.toMatch(/import\s*["']other["']/);
    const { sharedSet } = report(root);
    expect(sharedSet.mode).toBe('include');
    expect(sharedSet.closureAdded).toEqual(['inner']);
    expect(sharedSet.estimatedDuplicateBytes).toBeGreaterThan(0);
  });

  it('fails the build with a clear message when include and exclude are both set', async () => {
    makeHost(root, {
      declared: ['declared-lib'],
      imports: ['declared-lib'],
      packages: [{ name: 'declared-lib' }],
    });

    await expect(
      buildHost(root, { include: ['declared-lib'], exclude: ['other'] })
    ).rejects.toThrow(/"include" and "exclude" are mutually exclusive/);
  });

  it('include: [] boots fully natively — nothing shared, no import map, no fill chunk', async () => {
    makeHost(root, {
      declared: ['declared-lib'],
      imports: ['declared-lib'],
      packages: [{ name: 'declared-lib' }],
    });

    await buildHost(root, { include: [] });

    const html = fs.readFileSync(path.join(root, 'dist', 'index.html'), 'utf-8');
    expect(html).not.toContain('type="importmap"');
    expect(html).not.toContain('frontx-shell-fill');
    expect(sharedNames(root)).toEqual([]);
  });
});
