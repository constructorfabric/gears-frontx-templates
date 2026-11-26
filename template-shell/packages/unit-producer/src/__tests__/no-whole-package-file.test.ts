import { mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { UnitProducer } from '../UnitProducer';

const roots: string[] = [];

function write(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function makeRoot(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'unit-producer-nowhole-')));
  roots.push(root);
  write(
    join(root, 'package.json'),
    JSON.stringify({ name: 'host', version: '0.0.0', dependencies: { used: '1.0.0', unused: '1.0.0' } })
  );
  for (const name of ['used', 'unused']) {
    const dir = join(root, 'node_modules', name);
    write(join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0', type: 'module', main: './index.js' }));
    write(join(dir, 'index.js'), `export const ${name} = () => '${name.toUpperCase()}_BODY';\n`);
  }
  return root;
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('UnitProducer — no whole-package file for a package nothing imports', () => {
  it('writes a package only when some code imports it', async () => {
    const root = makeRoot();
    const out = join(root, 'out');
    await new UnitProducer({
      packageRoot: root,
      outputDir: out,
      consumerSpecifiers: ['used'],
    }).produce((m) => {
      throw new Error(m);
    });
    const written = readdirSync(out);
    expect(written.some((name) => name.startsWith('used@'))).toBe(true);
    expect(written.some((name) => name.startsWith('unused@'))).toBe(false);
  }, 60000);
});
