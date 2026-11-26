import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { UnitProducer } from '../UnitProducer';

/**
 * A statically bounded pattern import inside a shared package
 * (`import(\`./locales/${l}.js\`)`) is resolved by the runtime against
 * the calling unit's location. Each matching file of the package — found
 * relative to the module that makes the call — is a pattern list keyed,
 * and published, at the location the runtime computes.
 */
const roots: string[] = [];

function write(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function makeRoot(locales: Record<string, string>): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'unit-producer-pattern-')));
  roots.push(root);
  write(join(root, 'package.json'), JSON.stringify({ name: 'host', version: '0.0.0', dependencies: { i18n: '1.0.0' } }));
  const dir = join(root, 'node_modules', 'i18n');
  write(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'i18n', version: '1.0.0', type: 'module', exports: { '.': './dist/index.js' } })
  );
  write(join(dir, 'dist/index.js'), 'export const load = (l) => import(`./locales/${l}.js`);\n');
  for (const [name, text] of Object.entries(locales)) write(join(dir, 'dist/locales', name), text);
  write(join(dir, 'dist/locales/readme.txt'), 'not a locale\n');
  return root;
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

const produce = (root: string) =>
  new UnitProducer({
    packageRoot: root,
    outputDir: join(root, 'out'),
    consumerSpecifiers: ['i18n'],
  }).produce((m) => {
    throw new Error(m);
  });

describe('UnitProducer — pattern import lists', () => {
  it('keys and publishes each matching file at the location the runtime resolves', async () => {
    const root = makeRoot({
      'en.js': "export default { hello: 'hi' };\n",
      'de.js': "export default { hello: 'hallo' };\n",
    });
    const produced = await produce(root);
    const list = produced.find((p) => p.name === 'i18n')!.lists['i18n'];
    const keys = Object.keys(list.patterns ?? {}).sort();
    expect(keys).toEqual(['i18n@1.0.0/locales/de.js', 'i18n@1.0.0/locales/en.js']);
    for (const key of keys) {
      const nested = list.patterns![key];
      expect(nested.items.map((i) => i.location)).toEqual([key]);
      expect(existsSync(join(root, 'out', key))).toBe(true);
    }
    expect(readFileSync(join(root, 'out', 'i18n@1.0.0/locales/en.js'), 'utf-8')).toContain('hi');
  }, 60_000);

  it('fails the build for a matching file that imports other modules', async () => {
    const root = makeRoot({
      'en.js': "import { base } from '../base.js';\nexport default { ...base };\n",
    });
    write(join(root, 'node_modules/i18n/dist/base.js'), "export const base = { hello: 'hi' };\n");
    await expect(produce(root)).rejects.toThrow(/locales\/en\.js.*imports/);
  }, 60_000);

  it('finds the files relative to the module that spells the prefix, not the entry', async () => {
    const root = makeRoot({});
    const dir = join(root, 'node_modules', 'i18n');
    write(
      join(dir, 'dist/index.js'),
      "import { load } from './components/loader.js';\nexport const get = (l) => load(l);\n"
    );
    write(
      join(dir, 'dist/components/loader.js'),
      'export const load = (l) => import(`./locales/${l}.js`);\n'
    );
    write(join(dir, 'dist/components/locales/en.js'), "export default { hello: 'hi' };\n");
    const produced = await produce(root);
    const list = produced.find((p) => p.name === 'i18n')!.lists['i18n'];
    expect(Object.keys(list.patterns ?? {})).toEqual(['i18n@1.0.0/locales/en.js']);
    expect(existsSync(join(root, 'out', 'i18n@1.0.0/locales/en.js'))).toBe(true);
  }, 60_000);

  it('fails, naming the package, chunk and prefix, for a pattern that matches no file', async () => {
    const root = makeRoot({});
    await expect(produce(root)).rejects.toThrow(
      /pattern import of "i18n" in "i18n@1\.0\.0\/[^"]+" with prefix ".\/locales\/" matches no file/
    );
  }, 60_000);

  it('fails for a pattern naming a directory that does not exist', async () => {
    const root = makeRoot({ 'en.js': 'export default 1;\n' });
    write(
      join(root, 'node_modules/i18n/dist/index.js'),
      'export const load = (l) => import(`./missing/${l}.js`);\n'
    );
    await expect(produce(root)).rejects.toThrow(
      /prefix ".\/missing\/" matches no file \(directory "dist\/missing" does not exist\)/
    );
  }, 60_000);

  it('fails for a pattern that leaves the package', async () => {
    const root = makeRoot({ 'en.js': 'export default 1;\n' });
    write(
      join(root, 'node_modules/i18n/dist/index.js'),
      'export const load = (l) => import(`../../../${l}.js`);\n'
    );
    await expect(produce(root)).rejects.toThrow(/resolves outside the package/);
  }, 60_000);

  it('fails for a matching file that cannot be parsed to check its imports', async () => {
    const root = makeRoot({ 'en.js': 'export default {{{;\n' });
    await expect(produce(root)).rejects.toThrow(/locales\/en\.js.*cannot be parsed/);
  }, 60_000);

  it('publishes a file whose name percent-encodes at the decoded path, listed by its encoded location', async () => {
    const root = makeRoot({ 'my locale \u00e9.js': "export default { hello: 'hi' };\n" });
    const produced = await produce(root);
    const list = produced.find((p) => p.name === 'i18n')!.lists['i18n'];
    expect(Object.keys(list.patterns ?? {})).toEqual([
      'i18n@1.0.0/locales/my%20locale%20%C3%A9.js',
    ]);
    expect(existsSync(join(root, 'out', 'i18n@1.0.0/locales/my locale \u00e9.js'))).toBe(true);
    expect(existsSync(join(root, 'out', 'i18n@1.0.0/locales/my%20locale%20%C3%A9.js'))).toBe(false);
  }, 60_000);
});
