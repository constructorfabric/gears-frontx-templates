import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { SharedSetResolver } from '../SharedSetResolver';
import { UnitProducer } from '../UnitProducer';
import { declaredDependencies } from './support/declaredDependencies';

/**
 * Scenario: `include: []` — the shell shares nothing and boots fully
 * natively, while two MFEs that take the derived shared set still reuse each
 * other's shared sources: the same package@version yields the same
 * content-addressed files, so the second MFE's output names exactly the
 * first MFE's locations.
 */

const dirs: string[] = [];

function tmp(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'inc-empty-')));
  dirs.push(dir);
  return dir;
}

function write(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function makeRuntime(name: string): string {
  const root = tmp();
  write(
    join(root, 'package.json'),
    JSON.stringify({ name, version: '0.0.0', dependencies: { 'shared-lib': '1.0.0' } })
  );
  const lib = join(root, 'node_modules', 'shared-lib');
  write(
    join(lib, 'package.json'),
    JSON.stringify({ name: 'shared-lib', version: '1.0.0', type: 'module', main: './index.js' })
  );
  write(join(lib, 'index.js'), "export const answer = () => 42;\n");
  return root;
}

function produce(root: string, outputDir: string, include?: string[]) {
  return new UnitProducer({
    packageRoot: root,
    outputDir,
    include,
    consumerSpecifiers: include ?? declaredDependencies(root),
  }).produce((m) => {
    throw new Error(m);
  });
}

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe('include: [] with MFEs sharing among themselves', () => {
  it('the shell shares nothing', async () => {
    const shell = makeRuntime('shell');
    const resolved = new SharedSetResolver(shell, { include: [] }).resolve();
    expect(resolved.ok && resolved.sharedDeps).toEqual([]);
    expect(await produce(shell, join(tmp(), 'shared'), [])).toEqual([]);
  });

  it('the second MFE reuses the first MFE\'s shared sources', async () => {
    const first = await produce(makeRuntime('mfe-a'), join(tmp(), 'shared'));
    const second = await produce(makeRuntime('mfe-b'), join(tmp(), 'shared'));
    expect(first.map((p) => p.name)).toEqual(['shared-lib']);
    const locations = (produced: typeof first): string[] =>
      produced.flatMap((p) =>
        Object.values(p.lists).flatMap((l) => l.items.map((i) => i.location))
      );
    expect(locations(second)).toEqual(locations(first));
    expect(locations(first).length).toBeGreaterThan(0);
  });
});
