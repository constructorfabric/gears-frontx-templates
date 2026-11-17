// @cpt-dod:cpt-frontx-dod-unit-test-generation-and-agent-verification-standard-test-convention:p1
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { compose, isPayload, readComposition } from './compose-templates.mjs';

/** @type {string[]} */
let tempDirs = [];
afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

async function write(root, rel, content) {
  const file = path.join(root, rel);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
}

async function makeRepo() {
  const root = await mkdtemp(path.join(tmpdir(), 'frontx-compose-test-'));
  tempDirs.push(root);
  await write(root, 'template-shell/frontx-template.json', JSON.stringify({ name: 'shell', version: '1.0.0', description: 's', excludedSubtrees: ['src-app/mfe_packages/'] }));
  await write(root, 'template-shell/package.json', '{"name":"shell"}\n');
  await write(root, 'template-shell/package-lock.json', '{}\n');
  await write(root, 'template-shell/src/main.ts', 'shell');
  await write(root, 'template-shell/node_modules/x/index.js', '');
  await write(root, 'template-shell/.frontx/ai/shell/extension.json', '{}\n');
  await write(root, 'template-mfe/frontx-template.json', JSON.stringify({ name: 'mfe', version: '1.0.0', description: 'm', excludedSubtrees: [] }));
  await write(root, 'template-mfe/demo-mfe/package.json', '{"name":"demo"}\n');
  await write(root, 'template-mfe/demo-mfe/package-lock.json', '{}\n');
  await write(root, 'template-mfe/demo-mfe/src/index.ts', 'mfe');
  await write(root, 'template-mfe/.frontx/ai/mfe/extension.json', '{}\n');
  await write(root, 'frontx-composition.json', JSON.stringify({ templates: { shell: ['.'], mfe: ['src-app/mfe_packages'] } }));
  return root;
}

describe('isPayload', () => {
  const template = { excludedSubtrees: ['src-app/mfe_packages'], bundle: '.frontx/ai/shell' };
  it('leaves out the manifest, the bundle and declared exclusions', () => {
    expect(isPayload('src/main.ts', template)).toBe(true);
    expect(isPayload('frontx-template.json', template)).toBe(false);
    expect(isPayload('.frontx/ai/shell/extension.json', template)).toBe(false);
    expect(isPayload('src-app/mfe_packages/x/package.json', template)).toBe(false);
    expect(isPayload('src-app/mfe_packages-other/x', template)).toBe(true);
  });
});

describe('compose', () => {
  it('lays every template out under its target and every bundle under .frontx/ai', async () => {
    const root = await makeRepo();
    const out = path.join(root, 'out');
    const { files, bundles } = compose({ rootDir: root, outDir: out });
    expect(bundles).toBe(2);
    expect(readFileSync(path.join(out, 'src/main.ts'), 'utf8')).toBe('shell');
    expect(readFileSync(path.join(out, 'src-app/mfe_packages/demo-mfe/src/index.ts'), 'utf8')).toBe('mfe');
    expect(existsSync(path.join(out, '.frontx/ai/shell/extension.json'))).toBe(true);
    expect(existsSync(path.join(out, '.frontx/ai/mfe/extension.json'))).toBe(true);
    // The shell keeps its lockfile; a nested package's lockfile is dropped; node_modules never copies; manifests never ship.
    expect(existsSync(path.join(out, 'package-lock.json'))).toBe(true);
    expect(existsSync(path.join(out, 'src-app/mfe_packages/demo-mfe/package-lock.json'))).toBe(false);
    expect(existsSync(path.join(out, 'node_modules'))).toBe(false);
    expect(existsSync(path.join(out, 'frontx-template.json'))).toBe(false);
    expect(files).toBe(5);
  });

  it('refuses an existing output directory, an unknown template and a path two templates write', async () => {
    const root = await makeRepo();
    expect(() => compose({ rootDir: root, outDir: root })).toThrow('existing path');
    await write(root, 'frontx-composition.json', JSON.stringify({ templates: { shell: ['.'], ghost: ['x'] } }));
    expect(() => compose({ rootDir: root, outDir: path.join(root, 'o1') })).toThrow('"ghost"');
    await write(root, 'frontx-composition.json', JSON.stringify({ templates: { shell: ['.'], mfe: ['.'] } }));
    await write(root, 'template-mfe/src/main.ts', 'clash');
    expect(() => compose({ rootDir: root, outDir: path.join(root, 'o2') })).toThrow('written by both shell and mfe');
  });

  it('validates the batch shape', async () => {
    const root = await makeRepo();
    await write(root, 'frontx-composition.json', JSON.stringify({ templates: { shell: ['../x'] } }));
    expect(() => readComposition(root)).toThrow('without ".."');
    await write(root, 'frontx-composition.json', JSON.stringify({ templates: { shell: [] } }));
    expect(() => readComposition(root)).toThrow('at least one target');
  });
});
