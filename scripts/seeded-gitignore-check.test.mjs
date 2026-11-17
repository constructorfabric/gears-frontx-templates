// @cpt-dod:cpt-frontx-dod-unit-test-generation-and-agent-verification-standard-test-convention:p1
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { isShipped, isolatedGitEnv, projectPath, runCli } from './seeded-gitignore-check.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** @type {string[]} */
let tempDirs = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

async function makeTempDir() {
  const dir = await mkdtemp(path.join(tmpdir(), 'frontx-seeded-gitignore-test-'));
  tempDirs.push(dir);
  return dir;
}

/** @param {string} root @param {string} relativePath @param {string} content */
async function writeSource(root, relativePath, content) {
  const filePath = path.join(root, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
}

/**
 * `git init` (idempotent) and `git add -A -f` in `root` (forced: a fixture
 * .gitignore must not keep fixture files untracked), isolated like the guard.
 * @param {string} root
 */
function gitAddAll(root) {
  for (const args of [['init', '-q'], ['add', '-A', '-f']]) {
    const result = spawnSync('git', args, { cwd: root, env: isolatedGitEnv(), encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  }
}

/** @param {string} root @param {string} dir @param {object} manifest */
async function writeManifest(root, dir, manifest) {
  await writeSource(root, `${dir}/frontx-template.json`, JSON.stringify(manifest));
}

/** @param {string} root @param {Record<string, string[]>} templates */
async function writeComposition(root, templates) {
  await writeSource(root, 'frontx-composition.json', JSON.stringify({ templates }));
}

const SHELL = { name: 'shell', version: '1.0.0', description: 'shell', excludedSubtrees: ['src-app/mfe_packages/'] };
const MFE = { name: 'mfe', version: '1.0.0', description: 'mfe', excludedSubtrees: [] };

/**
 * A shell at the root that ships its .gitignore and excludes
 * `src-app/mfe_packages/`, where an MFE overlay lands with one package - the
 * shape of the real pair. Files are tracked by git, as the guard reads
 * tracked files.
 * @param {string} shellGitignore
 */
async function makeRoot(shellGitignore, { mfeGitignore = 'node_modules\n' } = {}) {
  const root = await makeTempDir();
  await writeManifest(root, 'template-shell', SHELL);
  await writeSource(root, 'template-shell/.gitignore', shellGitignore);
  await writeSource(root, 'template-shell/src/main.ts', '');
  await writeSource(root, 'template-shell/.frontx/ai/shell/extension.json', '{}\n');
  await writeManifest(root, 'template-mfe', MFE);
  await writeSource(root, 'template-mfe/demo-mfe/package.json', '{}\n');
  await writeSource(root, 'template-mfe/demo-mfe/src/index.ts', '');
  await writeSource(root, 'template-mfe/demo-mfe/.gitignore', mfeGitignore);
  await writeComposition(root, { shell: ['.'], mfe: ['src-app/mfe_packages'] });
  gitAddAll(root);
  return root;
}

/** @param {string} root */
function run(root) {
  /** @type {string[]} */
  const lines = [];
  /** @param {string} line */
  const record = (line) => lines.push(line);
  const exitCode = runCli({ rootDir: root, log: record, logError: record });
  return { exitCode, output: lines.join('\n') };
}

describe('isShipped', () => {
  const template = { dir: '', name: 't', excludedSubtrees: ['src-app/mfe_packages/'], bundle: '.frontx/ai/t', targets: ['.'] };

  it('ships the payload and the bundle, never the manifest or an excluded subtree', () => {
    expect(isShipped('.gitignore', template)).toBe(true);
    expect(isShipped('src/nested/.gitignore', template)).toBe(true);
    expect(isShipped('.frontx/ai/t/extension.json', template)).toBe(true);
    expect(isShipped('frontx-template.json', template)).toBe(false);
    expect(isShipped('src-app/mfe_packages/x/.gitignore', template)).toBe(false);
    expect(isShipped('.frontx/ai/other/extension.json', template)).toBe(false);
  });

  it('lands a payload path under the target', () => {
    expect(projectPath('.', 'src/a.ts')).toBe('src/a.ts');
    expect(projectPath('src-app/mfe_packages', 'demo-mfe/src/a.ts')).toBe('src-app/mfe_packages/demo-mfe/src/a.ts');
  });
});

describe('seeded-gitignore-check', () => {
  it("fails when a shipped .gitignore ignores the ground a nested template's package lands on", async () => {
    const root = await makeRoot('node_modules\nsrc-app/mfe_packages/*\n');
    const { exitCode, output } = run(root);
    expect(exitCode).toBe(1);
    expect(output).toContain('template-shell/.gitignore:2: "src-app/mfe_packages/*" ignores src-app/mfe_packages/demo-mfe/package.json');
    expect(output).toContain('which template-mfe (mfe) ships to "src-app/mfe_packages"');
  });

  it('fails when a shipped .gitignore ignores a file a template tracks', async () => {
    const root = await makeRoot('node_modules\nsrc/main.ts\n');
    const { exitCode, output } = run(root);
    expect(exitCode).toBe(1);
    expect(output).toContain('"src/main.ts" ignores src/main.ts, which template-shell (shell) ships to "."');
  });

  it('fails when a shipped .gitignore ignores the AI bundle a template delivers', async () => {
    const root = await makeRoot('node_modules\n.frontx/\n');
    const { exitCode, output } = run(root);
    expect(exitCode).toBe(1);
    expect(output).toContain('ignores .frontx/ai/shell/extension.json, which template-shell (shell) ships to ".frontx/ai/shell"');
  });

  it('fails when the shipped packages are re-included but a package the team adds is not', async () => {
    const root = await makeRoot('node_modules\nsrc-app/mfe_packages/*\n!src-app/mfe_packages/demo-mfe\n');
    const { exitCode, output } = run(root);
    expect(exitCode).toBe(1);
    expect(output).toContain('ignores src-app/mfe_packages/seeded-gitignore-probe-dir/package.json');
    expect(output).toContain('ground template-shell (shell) reserves for a nested template in "src-app/mfe_packages"');
    expect(output).not.toContain('ignores src-app/mfe_packages/demo-mfe/package.json');
  });

  it('fails when a package the team adds loses a nested directory the shipped package keeps', async () => {
    const root = await makeRoot('node_modules\nsrc-app/mfe_packages/*/src/\n!src-app/mfe_packages/demo-mfe/src/\n');
    const { exitCode, output } = run(root);
    expect(exitCode).toBe(1);
    expect(output).toContain('ignores src-app/mfe_packages/seeded-gitignore-probe-dir/src/index.ts');
  });

  it('fails when a new file under a reserved subtree is ignored by its extension', async () => {
    const root = await makeRoot('node_modules\nsrc-app/mfe_packages/**/*.ts\n');
    const { exitCode, output } = run(root);
    expect(exitCode).toBe(1);
    expect(output).toContain('ignores src-app/mfe_packages/seeded-gitignore-probe.ts');
  });

  it("checks a nested template's own shipped .gitignore at its project path", async () => {
    const root = await makeRoot('node_modules\n', { mfeGitignore: 'src/\n' });
    const { exitCode, output } = run(root);
    expect(exitCode).toBe(1);
    expect(output).toContain('template-mfe/demo-mfe/.gitignore:1: "src/" ignores src-app/mfe_packages/demo-mfe/src/index.ts');
  });

  it('matches case-sensitively on every OS', async () => {
    const root = await makeRoot('node_modules\nSRC/\n');
    const { exitCode } = run(root);
    expect(exitCode).toBe(0);
  });

  it('counts only tracked .gitignore files', async () => {
    const root = await makeRoot('node_modules\n');
    await writeSource(root, 'template-shell/src/.gitignore', '*\n');
    const { exitCode } = run(root);
    expect(exitCode).toBe(0);
  });

  it('passes when the shipped .gitignore leaves template ground alone', async () => {
    const root = await makeRoot('node_modules\ndist\n*.local\n');
    const { exitCode, output } = run(root);
    expect(output).toMatch(/Seeded \.gitignore check passed: 2 shipped \.gitignore file\(s\) across 2 template\(s\)/);
    expect(exitCode).toBe(0);
  });

  it('fails when two templates ship a .gitignore to the same project path', async () => {
    const root = await makeRoot('node_modules\n');
    await writeManifest(root, 'template-other', { name: 'other', version: '1.0.0', description: 'o', excludedSubtrees: [] });
    await writeSource(root, 'template-other/.gitignore', 'node_modules\n');
    await writeComposition(root, { shell: ['.'], mfe: ['src-app/mfe_packages'], other: ['.'] });
    gitAddAll(root);
    const { exitCode, output } = run(root);
    expect(exitCode).toBe(1);
    expect(output).toContain('FAIL: 1 shipped .gitignore collision(s)');
    expect(output).toContain('.gitignore is shipped by both template-other and template-shell');
  });

  it('names the manifest that is not valid JSON', async () => {
    const root = await makeRoot('node_modules\n');
    await writeSource(root, 'template-shell/frontx-template.json', '{ not json');
    const { exitCode, output } = run(root);
    expect(exitCode).toBe(1);
    expect(output).toContain('template-shell/frontx-template.json:');
  });

  it('names the manifest that is not a JSON object', async () => {
    const root = await makeRoot('node_modules\n');
    await writeSource(root, 'template-mfe/frontx-template.json', '[]');
    const { exitCode, output } = run(root);
    expect(exitCode).toBe(1);
    expect(output).toContain('template-mfe/frontx-template.json: the manifest is not a JSON object');
  });

  it('fails closed when a template has no target in the composition batch', async () => {
    const root = await makeRoot('node_modules\n');
    await writeComposition(root, { shell: ['.'] });
    const { exitCode, output } = run(root);
    expect(exitCode).toBe(1);
    expect(output).toContain('"mfe" has no target in frontx-composition.json');
  });

  it('rejects an excludedSubtrees entry that is not a usable project path', async () => {
    const root = await makeRoot('node_modules\n');
    const bad = ['../escape/', '/etc/', '', '.', './', 'a/./b/', 'no-slash'];
    await writeManifest(root, 'template-extra', { name: 'extra', version: '1.0.0', description: 'e', excludedSubtrees: bad });
    await writeComposition(root, { shell: ['.'], mfe: ['src-app/mfe_packages'], extra: ['extra'] });
    gitAddAll(root);
    const { exitCode, output } = run(root);
    expect(exitCode).toBe(1);
    expect(output).toContain('FAIL: 7 boundary entr(ies) are not usable project paths');
    for (const entry of bad) {
      expect(output).toContain(`template-extra (extra) declares excludedSubtrees entry "${entry}"`);
    }
    expect(output).not.toContain('escapes the scratch repository');
  });

  it('rejects a composition target that escapes the project', async () => {
    const root = await makeRoot('node_modules\n');
    await writeComposition(root, { shell: ['.'], mfe: ['../up'] });
    const { exitCode, output } = run(root);
    expect(exitCode).toBe(1);
    expect(output).toContain('"mfe" target "../up" must be a relative path without ".."');
  });

  it('fails closed when no template is found', async () => {
    const root = await makeTempDir();
    const { exitCode, output } = run(root);
    expect(exitCode).toBe(1);
    expect(output).toContain('no template');
  });

  it('passes on the real repository tree', () => {
    const { exitCode, output } = run(REPO_ROOT);
    expect(output).toMatch(/Seeded \.gitignore check passed: [1-9]\d* shipped \.gitignore file\(s\)/);
    expect(exitCode).toBe(0);
  });

  it('ignores a GIT_DIR inherited from the caller', async () => {
    const root = await makeRoot('node_modules\n');
    const other = await makeTempDir();
    spawnSync('git', ['init', '-q'], { cwd: other, env: isolatedGitEnv() });
    const saved = process.env.GIT_DIR;
    process.env.GIT_DIR = path.join(other, '.git');
    try {
      expect(run(root).exitCode).toBe(0);
    } finally {
      if (saved === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = saved;
    }
  });
});
