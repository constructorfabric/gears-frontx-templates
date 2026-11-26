import crypto from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkBootLists, runCli } from './list-completeness-check.mjs';

/** @type {string | undefined} */
let rootDir;

afterEach(async () => {
  if (rootDir) await rm(rootDir, { recursive: true, force: true });
  rootDir = undefined;
});

/** Runs the CLI against `rootDir` and returns its exit code and error lines. */
function run(argv) {
  const errors = [];
  const code = runCli({ rootDir, argv, log: () => {}, logError: (line) => errors.push(line) });
  return { code, errors };
}

describe('list-completeness-check --shell-dist', () => {
  it('reads the shell build from the directory --shell-dist names', async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), 'list-completeness-'));
    await mkdir(path.join(rootDir, 'dist'));

    const { errors } = run(['--shell-dist', 'dist']);

    expect(errors.some((line) => line.includes('no shell build at'))).toBe(false);
    expect(errors.some((line) => line.includes('template-shell: shell fill chunk'))).toBe(true);
  });

  it('defaults to template-shell/dist', async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), 'list-completeness-'));
    await mkdir(path.join(rootDir, 'dist'));

    const { code, errors } = run([]);

    expect(code).toBe(1);
    expect(errors.some((line) => line.includes(`no shell build at ${path.join(rootDir, 'template-shell', 'dist')}`))).toBe(true);
  });

  it('fails when --shell-dist has no value', async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), 'list-completeness-'));

    const { code, errors } = run(['--shell-dist']);

    expect(code).toBe(1);
    expect(errors.join('\n')).toContain('--shell-dist needs a value');
  });
});

describe('checkBootLists unitsBase shapes', () => {
  const UNIT = 'export const x = 1;\n';
  const hash = crypto.createHash('sha256').update(UNIT).digest('hex');
  const location = `x@1.0.0/index.${hash.slice(0, 12)}.js`;

  for (const unitsBase of ['./shared/', '/shared/', '/app/shared/', 'https://cdn.example/x/shared/']) {
    it(`resolves chunks and import-map entries under unitsBase ${unitsBase}`, async () => {
      rootDir = await mkdtemp(path.join(tmpdir(), 'list-completeness-'));
      const boot = {
        unitsBase,
        units: [{ location, contentHash: hash, answers: [], imports: [] }],
        list: { units: [hash], ownChunks: [] },
      };
      await mkdir(path.join(rootDir, 'assets'));
      await mkdir(path.join(rootDir, 'shared', 'x@1.0.0'), { recursive: true });
      await writeFile(path.join(rootDir, 'assets', 'frontx-shell-fill-AAA.js'), `f.run(${JSON.stringify(boot)});`);
      await writeFile(path.join(rootDir, 'shared', location), UNIT);
      const mapped = `${unitsBase}${location}`;
      await writeFile(
        path.join(rootDir, 'index.html'),
        `<script type="importmap">${JSON.stringify({ imports: { x: mapped } })}</script>`,
      );

      expect(checkBootLists(rootDir)).toEqual([]);
    });
  }
});
