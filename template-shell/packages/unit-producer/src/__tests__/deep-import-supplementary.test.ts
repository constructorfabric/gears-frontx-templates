import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { UnitProducer } from '../UnitProducer';

/**
 * Scenario: a package without an `exports` map enters
 * its declared runtime entries (`browser`/`module`/`main`) and their
 * closures — never every shipped file. A file that is not runtime
 * output (Flow/TS-typed `src/` a bundler would never parse) is never
 * an entry; a deep import outside the declared closures is built as
 * its own supplementary entry whose bytes depend only on the package
 * and that file, so two consumers requesting it mint identical bytes.
 */

const roots: string[] = [];

function write(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function tmpRoot(label: string): string {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), `unit-producer-deep-${label}-`))
  );
  roots.push(root);
  return root;
}


/**
 * An export-less package: `main` names a runtime `dist/` entry, `src/`
 * ships Flow-typed source no JavaScript build can parse, and
 * `dist/deep.js` is a shipped module the declared entry never reaches.
 */
function installDeepPackage(root: string): void {
  const dir = join(root, 'node_modules', 'srcship');
  write(
    join(dir, 'package.json'),
    JSON.stringify({
      name: 'srcship',
      version: '1.0.0',
      main: './dist/index.js',
    })
  );
  write(
    join(dir, 'src', 'index.js'),
    [
      '// @flow — source, not runtime output: a JavaScript build fails',
      'function run(x: number): number {',
      '  return x * 2;',
      '}',
      'module.exports = run;',
    ].join('\n')
  );
  write(
    join(dir, 'dist', 'index.js'),
    "export const main = () => 'MAIN_BODY';\n"
  );
  write(
    join(dir, 'dist', 'deep.js'),
    "export const deep = () => 'DEEP_BODY';\n"
  );
}

function makeConsumer(label: string): string {
  const root = tmpRoot(label);
  installDeepPackage(root);
  write(
    join(root, 'package.json'),
    JSON.stringify({
      name: `consumer-${label}`,
      version: '0.0.0',
      dependencies: { srcship: '1.0.0' },
    })
  );
  return root;
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('UnitProducer — export-less packages enter declared runtime entries only', () => {
  it('src/ source is never an entry; a deep import outside the closure is a supplementary chunk, byte-identical across consumers', async () => {
    const cacheDir = join(tmpRoot('cache'), 'build-cache');
    const produce = async (root: string, specifiers: string[]) =>
      new UnitProducer({
        packageRoot: root,
        outputDir: join(root, 'out'),
        consumerSpecifiers: specifiers,
        cacheDir,
      }).produce((m) => {
        throw new Error(m);
      });

    // Consumer A requests the deep import alone; consumer B requests
    // root plus the same deep import over the shared build cache. If
    // `src/index.js` were an entry the Flow syntax would fail parsing.
    const rootA = makeConsumer('a');
    const rootB = makeConsumer('b');
    const a = await produce(rootA, ['srcship/dist/deep.js']);
    const b = await produce(rootB, ['srcship', 'srcship/dist/deep.js']);

    const pkgA = a.find((p) => p.name === 'srcship')!;
    const pkgB = b.find((p) => p.name === 'srcship')!;

    // The package-determined chunk set holds only the declared
    // entry's closure — identical across consumers and free of src/.
    const unitsOf = (p: typeof pkgA) =>
      new Map(p.units.map((u) => [u.location, u.contentHash] as const));
    expect(unitsOf(pkgB)).toEqual(unitsOf(pkgA));
    for (const u of pkgA.units) {
      expect(u.modulePaths.some((m) => m.startsWith('src/'))).toBe(false);
    }

    // Both consumers emit a list for the deep specifier, and the
    // supplementary chunk it answers is byte-identical.
    const deepItemOf = (p: typeof pkgA) => {
      const list = p.lists['srcship/dist/deep.js'];
      expect(list, 'list for srcship/dist/deep.js').toBeDefined();
      const item = list.items.find((i) =>
        i.answers.includes('srcship/dist/deep.js')
      );
      expect(item).toBeDefined();
      return item!;
    };
    const itemA = deepItemOf(pkgA);
    const itemB = deepItemOf(pkgB);
    expect(itemA.contentHash).toBe(itemB.contentHash);
    expect(itemA.location).toBe(itemB.location);
    const bytesA = readFileSync(join(rootA, 'out', itemA.location));
    const bytesB = readFileSync(join(rootB, 'out', itemB.location));
    expect(bytesB.equals(bytesA)).toBe(true);
    expect(bytesA.toString('utf-8')).toContain('DEEP_BODY');
  }, 120000);
});
