/**
 * Scenario: the shell plugin's `cacheDir` option places the shared
 * build cache; the default is the workspace-wide
 * cache. The shell build report carries per-package cache hits and
 * misses; a second build of an unchanged project is served from the
 * cache and emits an identical shared directory.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { build } from 'vite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { vitePluginShell } from '../index';

function makeHost(root: string): void {
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'host', version: '0.0.0', type: 'module', dependencies: { 'lib-a': '1.0.0' } })
  );
  const lib = path.join(root, 'node_modules', 'lib-a');
  fs.mkdirSync(lib, { recursive: true });
  fs.writeFileSync(
    path.join(lib, 'package.json'),
    JSON.stringify({ name: 'lib-a', version: '1.0.0', type: 'module', main: 'index.js' })
  );
  fs.writeFileSync(path.join(lib, 'index.js'), 'export const value = 1;\n');
  fs.writeFileSync(
    path.join(root, 'index.html'),
    '<!doctype html><html><head></head><body><script type="module" src="/src/main.js"></script></body></html>\n'
  );
  fs.writeFileSync(path.join(root, 'src', 'main.js'), "import 'lib-a';\n");
}

async function buildHost(root: string, cacheDir?: string): Promise<void> {
  await build({
    root,
    logLevel: 'silent',
    plugins: [vitePluginShell({ cacheDir })],
    build: { outDir: 'dist', emptyOutDir: true },
  });
}

function sharedListing(root: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else out.push(`${path.relative(root, full)}:${fs.readFileSync(full, 'utf-8').length}`);
    }
  };
  walk(path.join(root, 'dist', 'shared'));
  return out.sort();
}

function cacheOf(root: string): { hits: number; misses: number; packages: Array<{ name: string; outcome: string }> } {
  return JSON.parse(fs.readFileSync(path.join(root, 'dist', 'shell-build-report.json'), 'utf-8')).cache;
}

describe('vitePluginShell cacheDir option', () => {
  let tmp: string;
  let root: string;
  beforeEach(() => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'vpsh-cache-')));
    root = path.join(tmp, 'host');
    makeHost(root);
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('writes the cache under the configured cacheDir and reports a miss, then a hit', async () => {
    const cacheDir = path.join(tmp, 'ci-cache');
    await buildHost(root, cacheDir);
    expect(fs.existsSync(path.join(cacheDir, 'lib-a@1.0.0'))).toBe(true);
    expect(cacheOf(root)).toMatchObject({ hits: 0, misses: 1, packages: [{ name: 'lib-a', outcome: 'miss' }] });
    const cold = sharedListing(root);
    await buildHost(root, cacheDir);
    expect(cacheOf(root)).toMatchObject({ hits: 1, misses: 0, packages: [{ name: 'lib-a', outcome: 'hit' }] });
    expect(sharedListing(root)).toEqual(cold);
  }, 120000);

  it('defaults to the project root cache when no workspace encloses the project', async () => {
    await buildHost(root);
    expect(
      fs.existsSync(path.join(root, 'node_modules', '.cache', 'frontx-unit-producer', 'lib-a@1.0.0'))
    ).toBe(true);
  }, 120000);
});
