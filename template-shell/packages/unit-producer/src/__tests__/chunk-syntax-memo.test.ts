import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChunkSyntaxMemo } from '../ChunkSyntaxMemo';
import { EsmSourceParser } from '../EsmSourceParser';
import { UnitProducer } from '../UnitProducer';

const roots: string[] = [];

function write(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

afterEach(() => {
  vi.restoreAllMocks();
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('ChunkSyntaxMemo', () => {
  it('reads each fact of a chunk once however often it is asked', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'chunk-memo-')));
    roots.push(root);
    const file = join(root, 'c.js');
    write(
      file,
      "import { a } from './a.js';\nexport const b = () => import('./b.js');\nexport const c = a;\n"
    );
    const memo = new ChunkSyntaxMemo();
    const parse = vi.spyOn(EsmSourceParser, 'parse');
    const ask = (): void => {
      expect(memo.relativeSpecifiers(file, 'c.js')).toEqual(['./a.js', './b.js']);
      expect(memo.dynamicImports(file, 'c.js').map((c) => c.kind)).toEqual(['literal']);
      expect(memo.exportNames(file, 'c.js')).toEqual(['b', 'c']);
    };
    ask();
    const parsesAfterFirst = parse.mock.calls.length;
    ask();
    ask();
    expect(parse.mock.calls.length).toBe(parsesAfterFirst);
  });

  it('fails, naming the unit, for a chunk that cannot be parsed', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'chunk-memo-')));
    roots.push(root);
    const file = join(root, 'bad.js');
    write(file, 'export {{{');
    const memo = new ChunkSyntaxMemo();
    expect(() => memo.relativeSpecifiers(file, 'pkg@1.0.0/bad.js')).toThrow(/unit "pkg@1\.0\.0\/bad\.js"/);
    expect(() => memo.exportNames(file, 'pkg@1.0.0/bad.js')).toThrow(/unit "pkg@1\.0\.0\/bad\.js"/);
  });
});

describe('UnitProducer chunk reads', () => {
  it('parses each emitted chunk a bounded number of times however many lists emit it', async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'chunk-reads-')));
    roots.push(root);
    write(join(root, 'package.json'), JSON.stringify({ name: 'host', version: '0.0.0', dependencies: { lib: '1.0.0' } }));
    const dir = join(root, 'node_modules/lib');
    write(
      join(dir, 'package.json'),
      JSON.stringify({
        name: 'lib',
        version: '1.0.0',
        type: 'module',
        exports: { '.': './index.js', './a': './a.js', './b': './b.js', './c': './c.js' },
      })
    );
    write(join(dir, 'shared.js'), 'export const shared = () => "S".repeat(40);\n');
    for (const name of ['index', 'a', 'b', 'c']) {
      write(join(dir, `${name}.js`), `import { shared } from './shared.js';\nexport const ${name === 'index' ? 'i' : name} = () => shared();\n`);
    }
    const parse = vi.spyOn(EsmSourceParser, 'parse');
    const produced = await new UnitProducer({
      packageRoot: root,
      outputDir: join(root, 'out'),
      consumerSpecifiers: ['lib', 'lib/a', 'lib/b', 'lib/c'],
    }).produce((m) => {
      throw new Error(m);
    });
    const lib = produced.find((p) => p.name === 'lib')!;
    expect(Object.keys(lib.lists).length).toBe(4);
    const perUnit = new Map<string, number>();
    for (const [source, name] of parse.mock.calls) {
      void source;
      if (typeof name === 'string' && name.startsWith('lib@1.0.0/')) {
        perUnit.set(name, (perUnit.get(name) ?? 0) + 1);
      }
    }
    expect(perUnit.size).toBeGreaterThan(0);
    // static statements, classified dynamic imports and export names
    for (const count of perUnit.values()) expect(count).toBeLessThanOrEqual(3);
  }, 120_000);
});
