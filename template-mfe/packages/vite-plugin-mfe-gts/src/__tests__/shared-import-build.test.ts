/**
 * Real builds of scratch MFEs, each in a private copy with its own
 * producer cache, for the shared-package wiring of `closeBundle`:
 *
 *  - a name the MFE imports from a shared package that the unit answering
 *    it does not export fails the build with the formatted message;
 *  - a rewrite of the consumer barrel rewrite no unit answers — an import
 *    through a nested barrel that renames a re-export — goes back to the
 *    barrel: the build passes, the manifest lists the barrel specifier and
 *    the emitted chunk imports it;
 *  - a name checked after such a revert is checked under the barrel
 *    specifier.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { put, readJson } from './helpers/files';
import { installPackage, scratchMfe, type FixtureRun } from './helpers/fixtureRun';
import { outputOf, runViteBuild } from './helpers/vite';

const runs: FixtureRun[] = [];
afterEach(() => {
  for (const run of runs.splice(0)) run.remove();
});

function mfeImporting(source: string): FixtureRun {
  const run = scratchMfe({ name: 'shared-import', exposes: { './lifecycle': './src/lifecycle.js' } });
  runs.push(run);
  put(path.join(run.dir, 'package.json'), JSON.stringify({ name: 'mfe', version: '0.0.0', dependencies: { ui: '1.0.0' } }));
  put(path.join(run.dir, 'src', 'lifecycle.js'), source);
  return run;
}

/** `ui` re-exports `Button` through a nested barrel that renames it. */
function installNestedBarrel(run: FixtureRun): void {
  installPackage(run, 'ui', { sideEffects: false, main: './index.js' }, {
    'index.js': "export * from './components/index.js';\n",
    'components/index.js': "export * from './Button/index.js';\n",
    'components/Button/index.js': "export { default as Button } from './Button.js';\n",
    'components/Button/Button.js': 'export default function Button() { return "button"; }\n',
  });
}

function build(run: FixtureRun): { status: number | null; output: string; outDir: string } {
  const outDir = path.join(run.dir, 'out');
  const result = runViteBuild({ cwd: run.dir, args: ['--outDir', outDir, '--logLevel', 'info'], env: run.env });
  return { status: result.status, output: outputOf(result), outDir };
}

const chunkSources = (outDir: string): string =>
  fs
    .readdirSync(path.join(outDir, 'assets'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => fs.readFileSync(path.join(outDir, 'assets', f), 'utf-8'))
    .join('\n');

describe('the shared-import check in a real build', () => {
  it('fails the build naming the chunk, the specifier and a name the shared unit does not export', () => {
    const run = mfeImporting("import { B } from 'ui';\nexport default { mount() { return B; }, unmount() {} };\n");
    installPackage(run, 'ui', { main: './index.js' }, { 'index.js': 'export const A = 1;\n' });
    const { status, output } = build(run);
    expect(status, output.slice(-2000)).not.toBe(0);
    expect(output).toMatch(/imports B from 'ui'/);
    expect(output).toContain('does not export');
  });

  it('builds when every imported name is exported', () => {
    const run = mfeImporting("import { A } from 'ui';\nexport default { mount() { return A; }, unmount() {} };\n");
    installPackage(run, 'ui', { main: './index.js' }, { 'index.js': 'export const A = 1;\n' });
    const { status, output } = build(run);
    expect(status, output.slice(-2000)).toBe(0);
  });
});

describe('the consumer barrel fallback in a real build', () => {
  it('lists the barrel specifier of an import through a nested renamed barrel, and the chunk imports the barrel', () => {
    const run = mfeImporting("import { Button } from 'ui';\nexport default { mount() { return Button(); }, unmount() {} };\n");
    installNestedBarrel(run);
    const { status, output, outDir } = build(run);
    expect(status, output.slice(-3000)).toBe(0);
    const { manifest } = readJson<{ manifest: { lists?: Record<string, unknown>; units?: Array<{ answers: string[] }> } }>(
      path.join(outDir, 'mfe-manifest.json')
    );
    expect(Object.keys(manifest.lists ?? {})).toContain('./lifecycle');
    expect((manifest.units ?? []).some((u) => u.answers.includes('ui'))).toBe(true);
    expect(chunkSources(outDir)).toMatch(/from\s*["']ui["']/);
    expect(chunkSources(outDir)).not.toMatch(/from\s*["']ui\/components/);
  });

  it('checks a name of a reverted rewrite under the barrel specifier', () => {
    const run = mfeImporting(
      "import { Button, Missing } from 'ui';\nexport default { mount() { return [Button, Missing]; }, unmount() {} };\n"
    );
    installNestedBarrel(run);
    const { status, output } = build(run);
    expect(status, output.slice(-3000)).not.toBe(0);
    expect(output).toMatch(/imports Missing from 'ui'/);
  });
});
