/**
 * Runs the design skill's `scripts/check-design-md.mjs` as a user would, in a
 * child process, on the fixtures under `scripts/fixtures/check-design-md/`:
 * a small theme and DESIGN.md that match, and variants of them written to a
 * temp dir. Asserts exit codes and the finding lines that name the key.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(here, 'fixtures/check-design-md');
const script = path.join(
  here,
  '../template-design-guardrails/.frontx/ai/@gears-frontx/template-design-guardrails/skills/frontx-design/scripts/check-design-md.mjs',
);
const DESIGN = readFileSync(path.join(fixtures, 'DESIGN.md'), 'utf8');
const THEME = readFileSync(path.join(fixtures, 'theme.css'), 'utf8');

/** @type {string | undefined} */
let dir;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

/** Writes `files` (relative path to content) into a fresh temp dir and returns it. */
function project(files) {
  dir = mkdtempSync(path.join(tmpdir(), 'frontx-check-design-md-'));
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), content);
  }
  return dir;
}

function run(args, cwd = here) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** Runs the script on a DESIGN.md and theme given as text. */
function runOn(design, theme = THEME) {
  const cwd = project({ 'DESIGN.md': design, 'theme.css': theme });
  return run(['--theme', 'theme.css'], cwd);
}

const lines = (text) => text.trim().split('\n');

describe('check-design-md', () => {
  it('passes when every name matches and every kit property is named', () => {
    const result = run(['--design', path.join(fixtures, 'DESIGN.md'), '--theme', path.join(fixtures, 'theme.css')]);
    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
  });

  it.each([
    [
      'a var() the theme does not declare',
      DESIGN.replace('var(--radius)', 'var(--radiuss)'),
      ['rounded.base: --radiuss is not declared by the kit theme', '--radius: declared by the kit theme, not named in the front matter'],
    ],
    [
      'a reference to a missing map key',
      DESIGN.replace('{rounded.base}', '{rounded.huge}'),
      ['components.button.rounded: {rounded.huge} names no front matter token'],
    ],
    [
      'a reference to a missing group',
      DESIGN.replace('{colors.primary}', '{palette.primary}'),
      ['components.button.backgroundColor: {palette.primary} names no front matter token'],
    ],
    [
      'a literal value in a token map',
      DESIGN.replace('"var(--primary)"', '"#0065e3"'),
      ['colors.primary: "#0065e3" is not exactly one var(--name)', '--primary: declared by the kit theme, not named in the front matter'],
    ],
    [
      'a value wrapping a var()',
      DESIGN.replace('"var(--text-body-size)"', '"calc(var(--text-body-size) + 2px)"'),
      [
        'typography.body.fontSize: "calc(var(--text-body-size) + 2px)" is not exactly one var(--name)',
        '--text-body-size: declared by the kit theme, not named in the front matter',
      ],
    ],
    [
      'a kit property the front matter does not name',
      DESIGN.replace('elevation:\n  shadow: "var(--shadow)"\n', ''),
      ['--shadow: declared by the kit theme, not named in the front matter'],
    ],
  ])('reports %s and exits 1', (_name, design, expected) => {
    const result = runOn(design);
    expect(result.code).toBe(1);
    expect(lines(result.stdout).sort()).toEqual([...expected].sort());
  });

  it('does not join the two sides of a comment into one declared name', () => {
    // Removing the comment outright would declare --foo-bar, an unnamed kit property.
    const result = runOn(DESIGN, `${THEME}\n:root { --foo/* split */-bar: 1px; }\n`);
    expect(result.stdout).not.toContain('--foo');
    expect(result.code).toBe(0);
  });

  it('passes on the shipped DESIGN.md against the kit 0.4.1 theme', () => {
    const result = run([
      '--design',
      path.join(here, '../template-design-guardrails/DESIGN.md'),
      '--theme',
      path.join(fixtures, 'ui-kit-0.4.1-theme.css'),
    ]);
    expect(result.code, result.stdout + result.stderr).toBe(0);
  });

  it('resolves the kit theme through the package exports when --theme is not given', () => {
    const cwd = project({
      'DESIGN.md': DESIGN,
      'node_modules/@gears-frontx/ui-kit/package.json': JSON.stringify({
        name: '@gears-frontx/ui-kit',
        exports: { './theme.css': './dist/theme.css' },
      }),
      'node_modules/@gears-frontx/ui-kit/dist/theme.css': THEME,
    });
    const result = run([], cwd);
    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
  });

  describe('exits 2 without a stack trace on a usage or input error', () => {
    const cases = [
      ['an unknown option', () => run(['--colors'])],
      ['a missing DESIGN.md', () => run(['--design', 'missing.md', '--theme', path.join(fixtures, 'theme.css')], project({}))],
      ['a DESIGN.md that is a directory', () => run(['--design', fixtures, '--theme', path.join(fixtures, 'theme.css')])],
      ['a missing theme', () => run(['--design', path.join(fixtures, 'DESIGN.md'), '--theme', 'missing.css'], project({}))],
      ['no front matter', () => runOn('# DESIGN\n')],
      ['an unclosed front matter', () => runOn(DESIGN.replace('\n---\n\n# Fixture', '\n\n# Fixture'))],
      ['a YAML list', () => runOn(DESIGN.replace('  primary: "var(--primary)"', '  - "var(--primary)"'))],
      ['an odd indent', () => runOn(DESIGN.replace('  primary: "var(--primary)"', '   primary: "var(--primary)"'))],
      ['a map nested three levels deep', () => runOn(DESIGN.replace('    fontSize: "var(--text-body-size)"', '    fontSize:\n      value: "var(--text-body-size)"'))],
      ['a group with no entries', () => runOn(DESIGN.replace('  primary: "var(--primary)"\n', ''))],
      ['a duplicate key', () => runOn(DESIGN.replace('  base: "var(--radius)"', '  base: "var(--radius)"\n  base: "var(--radius)"'))],
    ];

    it.each(cases)('%s', (_name, exec) => {
      const result = exec();
      expect(result.code).toBe(2);
      expect(result.stderr).not.toMatch(/\n\s+at /);
      expect(result.stdout).toBe('');
    });

    it('asks for --theme when the kit cannot be resolved', () => {
      const result = run([], project({ 'DESIGN.md': DESIGN }));
      expect(result.code).toBe(2);
      expect(result.stderr).toContain('--theme');
      expect(result.stderr).not.toMatch(/\n\s+at /);
    });
  });
});
