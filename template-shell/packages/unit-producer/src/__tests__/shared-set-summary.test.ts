import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { SharedSetSelection } from '../SharedSetSelection';
import { SharedSetSummary } from '../SharedSetSummary';

/**
 * Scenario: the build report's shared-set account — reach per package,
 * `include` closure additions, undeclared-import warnings and the
 * duplicate-bytes estimate for non-default configurations.
 */

const dirs: string[] = [];

function writePkg(dir: string, pkg: Record<string, unknown>, source = ''): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg));
  if (source !== '') writeFileSync(join(dir, 'index.js'), source);
}

function makeHost(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'sssum-test-')));
  dirs.push(root);
  writePkg(root, { name: 'host', dependencies: { declared: '1.0.0' } });
  writePkg(join(root, 'node_modules', 'declared'), { name: 'declared', version: '1.0.0' });
  writePkg(join(root, 'node_modules', 'undeclared'), { name: 'undeclared', version: '2.0.0' });
  writePkg(
    join(root, 'node_modules', 'bundled'),
    { name: 'bundled', version: '1.0.0' },
    'x'.repeat(100)
  );
  return root;
}

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe('SharedSetSummary.compose', () => {
  it('reports each package\'s reach and warns for imported-but-undeclared packages', () => {
    const summary = SharedSetSummary.compose({
      packageRoot: makeHost(),
      selection: new SharedSetSelection(),
      produced: [
        { name: 'declared', version: '1.0.0' },
        { name: 'undeclared', version: '2.0.0' },
        { name: 'reached', version: '1.0.0' },
      ],
      imported: [
        { name: 'declared', shared: true },
        { name: 'undeclared', shared: true },
      ],
    });
    expect(summary.mode).toBe('default');
    expect(summary.packages.map((p) => [p.name, p.reachedAs])).toEqual([
      ['declared', 'declared'],
      ['reached', 'closure'],
      ['undeclared', 'undeclared'],
    ]);
    expect(summary.warnings).toEqual([
      '"undeclared" is imported but not declared in dependencies or peerDependencies',
    ]);
    expect(summary.estimatedDuplicateBytes).toBeUndefined();
  });

  it('reports include closure additions and estimates duplicate bytes', () => {
    const summary = SharedSetSummary.compose({
      packageRoot: makeHost(),
      selection: new SharedSetSelection({ include: ['declared'] }),
      produced: [
        { name: 'declared', version: '1.0.0' },
        { name: 'undeclared', version: '2.0.0' },
      ],
      imported: [
        { name: 'declared', shared: true },
        { name: 'bundled', shared: false },
      ],
    });
    expect(summary.mode).toBe('include');
    expect(summary.closureAdded).toEqual(['undeclared']);
    expect(summary.estimatedDuplicateBytes).toBe(100);
  });

  it('classifies aliased packages', () => {
    const summary = SharedSetSummary.compose({
      packageRoot: makeHost(),
      selection: new SharedSetSelection(),
      produced: [{ name: 'declared', version: '1.0.0' }],
      imported: [{ name: 'declared', shared: true }],
      aliasTargets: ['declared'],
    });
    expect(summary.packages[0].reachedAs).toBe('alias');
  });
});
