/**
 * A real build of a fixture MFE (`fixtures/lazy-shared-package`) that
 * imports the shared package `lazy-kit` only dynamically, by bare
 * specifier, and makes one fully opaque `import(expr)`. The plugin's `root`
 * option names the package, not the working directory. It runs in a
 * private copy of the fixture with its own producer cache.
 *
 *  - The bare import becomes `__frontx_lazy('lazy-kit')` and the build
 *    passes: the manifest holds a list under `lazy-kit` naming the unit
 *    that answers it, and the expose's list names that key in `lazy`.
 *  - The fixture's opaque import is reported once, against the emitted
 *    chunk's final file name and its line in the emitted code.
 *
 * The build runs `vite build` in a child process with NODE_ENV unset and
 * `MFE_VITE_NO_TEST_ENV_CHECK=true`, the federation plugin's opt-out of
 * turning itself off under a test runner.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { copyFixture, installPackage, type FixtureRun } from './helpers/fixtureRun';
import { readJson } from './helpers/files';
import { outputOf, runViteBuild } from './helpers/vite';

let run: FixtureRun;
let outDir = '';
let output = '';

beforeAll(() => {
  run = copyFixture('lazy-shared-package');
  installPackage(run, 'lazy-kit', { exports: { '.': './index.js' } }, {
    'index.js': "export const label = 'lazy-kit';\n",
  });
  outDir = path.join(run.dir, 'out');
  const result = runViteBuild({
    cwd: run.dir,
    args: ['--outDir', outDir, '--logLevel', 'info'],
    env: run.env,
  });
  output = outputOf(result);
  if (result.error || result.status !== 0) {
    throw new Error(`vite build exited with ${result.status ?? result.signal}\n${output.slice(-3000)}`);
  }
}, 150_000);

afterAll(() => {
  run?.remove();
});

interface Manifest {
  manifest: {
    units?: Array<{ location: string; contentHash: string; answers: string[] }>;
    lists?: Record<string, { units: string[]; ownChunks: string[]; lazy?: string[] }>;
  };
}

describe('a bare dynamic import of a shared package', () => {
  it('is loaded through __frontx_lazy under its bare specifier, whose list names the unit answering it', () => {
    const { manifest } = readJson<Manifest>(path.join(outDir, 'mfe-manifest.json'));
    const list = manifest.lists?.['lazy-kit'];
    expect(list, JSON.stringify(manifest.lists)).toBeDefined();
    const answering = (manifest.units ?? []).filter((u) => u.answers.includes('lazy-kit'));
    expect(answering).toHaveLength(1);
    expect(list!.units).toContain(answering[0].contentHash);
    expect(manifest.lists?.['./lifecycle']?.lazy).toContain('lazy-kit');
    const chunks = fs
      .readdirSync(path.join(outDir, 'assets'))
      .filter((f) => f.endsWith('.js'))
      .map((f) => fs.readFileSync(path.join(outDir, 'assets', f), 'utf-8'));
    expect(chunks.some((code) => /__frontx_lazy\(\s*["'`]lazy-kit["'`]\s*\)/.test(code))).toBe(true);
  });
});

describe('the opaque-import report', () => {
  it('names the final chunk and the line of the call in the emitted code, once', () => {
    const report = readJson<{ opaqueImports: string[] }>(path.join(outDir, 'mfe-build-report.json'));
    const own = report.opaqueImports.filter((line) => line.includes('dataset.target'));
    expect(own, report.opaqueImports.join('\n')).toHaveLength(1);
    const [location] = own[0].split(' · ');
    const separator = location.lastIndexOf(':');
    const file = location.slice(0, separator);
    const line = Number(location.slice(separator + 1));
    expect(file).not.toMatch(/!~\{/);
    expect(fs.existsSync(path.join(outDir, file)), file).toBe(true);
    const emitted = fs.readFileSync(path.join(outDir, file), 'utf-8').split('\n');
    expect(emitted[line - 1]).toMatch(/\bimport\s*\(/);
  });
});
