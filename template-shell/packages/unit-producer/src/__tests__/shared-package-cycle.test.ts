import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { UnitProducer } from '../UnitProducer';
import { declaredDependencies } from './support/declaredDependencies';

/**
 * Scenario: two shared packages that require each other leave no unit
 * that can be minted before the other, so the build fails naming the
 * cycle. The packages exist only under a package root other than the
 * directory the tests run in: the import edges the cycle check reads
 * come from the builds resolved against that root, so a check that read
 * them against the process's working directory would find no edge, and
 * the cycle would pass.
 */

const roots: string[] = [];

function write(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function pkg(root: string, name: string, json: object, files: Record<string, string>): void {
  const dir = join(root, 'node_modules', name);
  write(join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0', ...json }));
  for (const [rel, content] of Object.entries(files)) write(join(dir, rel), content);
}

function makeRoot(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'unit-producer-cycle-')));
  roots.push(root);
  write(
    join(root, 'package.json'),
    JSON.stringify({
      name: 'host',
      version: '0.0.0',
      dependencies: { 'cycle-a': '1.0.0', 'cycle-b': '1.0.0' },
    })
  );
  pkg(
    root,
    'cycle-a',
    { main: './index.js', dependencies: { 'cycle-b': '*' } },
    { 'index.js': 'exports.getB = () => require("cycle-b");\n' }
  );
  pkg(
    root,
    'cycle-b',
    { main: './index.js', dependencies: { 'cycle-a': '*' } },
    { 'index.js': 'exports.getA = () => require("cycle-a");\n' }
  );
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('a cycle between shared packages', () => {
  it('fails the build, reading its edges from the package root', async () => {
    const root = makeRoot();
    // The packages are reachable from the package root only.
    expect(relative(process.cwd(), root).startsWith('..')).toBe(true);

    await expect(
      new UnitProducer({
        packageRoot: root,
        outputDir: join(root, 'out'),
        consumerSpecifiers: declaredDependencies(root),
      }).produce((message) => {
        throw new Error(message);
      })
    ).rejects.toThrow(
      /Cyclic shared-dependency graph: (cycle-a -> cycle-b -> cycle-a|cycle-b -> cycle-a -> cycle-b)/
    );
  });
});
