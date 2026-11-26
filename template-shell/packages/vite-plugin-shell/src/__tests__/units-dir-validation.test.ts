/**
 * Scenario: `unitsDir` names the directory the producer writes into and
 * the URL segment the runtime addresses, so a value that is empty, `.`,
 * `..`, absolute or climbs out of the build output fails the build before
 * anything is written, naming the option; a nested relative path builds.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { build } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';

import { vitePluginShell } from '../index';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function makeHost(): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'units-dir-')));
  dirs.push(root);
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
  return root;
}

async function buildWith(root: string, unitsDir: string): Promise<unknown> {
  return build({
    root,
    logLevel: 'silent',
    plugins: [vitePluginShell({ unitsDir, cacheDir: path.join(root, '.cache') })],
    build: { outDir: 'dist', emptyOutDir: true },
  });
}

describe('unitsDir validation', () => {
  it.each(['', '.', '..', '../out', 'a/../..', 'a//b', '/abs', 'C:\\abs'])(
    'rejects %j before touching dist',
    async (unitsDir) => {
      const root = makeHost();
      const sentinel = path.join(root, 'dist', 'sentinel.txt');
      fs.mkdirSync(path.dirname(sentinel), { recursive: true });
      fs.writeFileSync(sentinel, 'keep');
      await expect(buildWith(root, unitsDir)).rejects.toThrow(/unitsDir/);
      expect(fs.readFileSync(sentinel, 'utf-8')).toBe('keep');
    }
  );

  it('builds into a nested relative directory', async () => {
    const root = makeHost();
    await buildWith(root, 'assets/units');
    expect(fs.existsSync(path.join(root, 'dist', 'assets', 'units'))).toBe(true);
    expect(fs.readFileSync(path.join(root, 'dist', 'index.html'), 'utf-8')).toContain('assets/units/');
  });
});
