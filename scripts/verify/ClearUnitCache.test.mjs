import path from 'node:path';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { ClearUnitCache } from './ClearUnitCache.mjs';

/** @type {string | undefined} */
let rootDir;

afterEach(async () => {
  if (rootDir) await rm(rootDir, { recursive: true, force: true });
  rootDir = undefined;
});

async function makeRoot() {
  rootDir = await mkdtemp(path.join(tmpdir(), 'clear-cache-'));
  return rootDir;
}

/**
 * @param {string} root
 * @param {Record<string, string>} layout rel-path → content
 */
async function writeTree(root, layout) {
  for (const [rel, content = ''] of Object.entries(layout)) {
    const full = path.join(root, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content);
  }
}

describe('ClearUnitCache', () => {
  it('deletes every node_modules/.cache/frontx-unit-producer below the root and prints each removed path', async () => {
    const root = await makeRoot();
    await writeTree(root, {
      'template-shell/node_modules/.cache/frontx-unit-producer/chunk-a.js': '// a',
      'template-shell/node_modules/.cache/frontx-unit-producer/chunk-b.js': '// b',
      'template-mfe/src-app/mfe_packages/demo-mfe/node_modules/.cache/frontx-unit-producer/x.js': '// x',
    });
    const printed = [];
    const c = new ClearUnitCache({ root, log: (s) => printed.push(s) });
    const count = await c.run();
    expect(count).toBe(2);
    expect(printed).toHaveLength(2);
    expect(existsSync(path.join(root, 'template-shell/node_modules/.cache/frontx-unit-producer'))).toBe(false);
    expect(existsSync(path.join(root, 'template-mfe/src-app/mfe_packages/demo-mfe/node_modules/.cache/frontx-unit-producer'))).toBe(false);
  });

  it('returns 0 and prints nothing when no cache directory exists', async () => {
    const root = await makeRoot();
    await writeTree(root, { 'template-shell/src/index.ts': 'export {}' });
    const printed = [];
    const c = new ClearUnitCache({ root, log: (s) => printed.push(s) });
    const count = await c.run();
    expect(count).toBe(0);
    expect(printed).toEqual([]);
  });

  it('deletes nothing else — sibling caches and unrelated files survive', async () => {
    const root = await makeRoot();
    await writeTree(root, {
      'template-shell/node_modules/.cache/frontx-unit-producer/a.js': '// a',
      'template-shell/node_modules/.cache/vite/deps_a.js': '// v',
      'template-shell/node_modules/.cache/other-tool/x.json': '{}',
      'template-shell/node_modules/.cache/frontx-unit-producer-nested/x.js': '// keep (name not exact)',
      'template-shell/src/app.ts': 'export {}',
      'template-shell/dist/index.js': '// dist',
    });
    const c = new ClearUnitCache({ root, log: () => {} });
    const count = await c.run();
    expect(count).toBe(1);
    expect(existsSync(path.join(root, 'template-shell/node_modules/.cache/frontx-unit-producer'))).toBe(false);
    expect(existsSync(path.join(root, 'template-shell/node_modules/.cache/vite/deps_a.js'))).toBe(true);
    expect(existsSync(path.join(root, 'template-shell/node_modules/.cache/other-tool/x.json'))).toBe(true);
    expect(existsSync(path.join(root, 'template-shell/node_modules/.cache/frontx-unit-producer-nested/x.js'))).toBe(true);
    expect(existsSync(path.join(root, 'template-shell/src/app.ts'))).toBe(true);
    expect(existsSync(path.join(root, 'template-shell/dist/index.js'))).toBe(true);
  });

  it('honours --dir=<path> to scope the root walk', async () => {
    const root = await makeRoot();
    await writeTree(root, {
      'template-shell/node_modules/.cache/frontx-unit-producer/a.js': '// a',
      'template-mfe/src-app/mfe_packages/demo-mfe/node_modules/.cache/frontx-unit-producer/b.js': '// b',
    });
    const c = new ClearUnitCache({ root: path.join(root, 'template-mfe'), log: () => {} });
    const count = await c.run();
    expect(count).toBe(1);
    expect(existsSync(path.join(root, 'template-shell/node_modules/.cache/frontx-unit-producer'))).toBe(true);
    expect(existsSync(path.join(root, 'template-mfe/src-app/mfe_packages/demo-mfe/node_modules/.cache/frontx-unit-producer'))).toBe(false);
  });

  it('finds nested node_modules caches deeper in the tree', async () => {
    const root = await makeRoot();
    await writeTree(root, {
      'a/node_modules/.cache/frontx-unit-producer/top.js': '// top',
      'a/node_modules/some-pkg/node_modules/.cache/frontx-unit-producer/deep.js': '// deep',
    });
    const c = new ClearUnitCache({ root, log: () => {} });
    const count = await c.run();
    expect(count).toBe(2);
    expect(existsSync(path.join(root, 'a/node_modules/.cache/frontx-unit-producer'))).toBe(false);
    expect(existsSync(path.join(root, 'a/node_modules/some-pkg/node_modules/.cache/frontx-unit-producer'))).toBe(false);
  });
});
