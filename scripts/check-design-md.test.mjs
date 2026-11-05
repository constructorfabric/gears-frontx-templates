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
// The line number of the first line appended to DESIGN.
const NEXT_LINE = DESIGN.split('\n').length;

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
      ['rounded.base: --radiuss is not declared by the kit theme', '--radius: declared by the kit theme, not named in the token maps'],
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
      ['colors.primary: "#0065e3" is not exactly one var(--name)', '--primary: declared by the kit theme, not named in the token maps'],
    ],
    [
      'a value wrapping a var()',
      DESIGN.replace('"var(--text-body-size)"', '"calc(var(--text-body-size) + 2px)"'),
      [
        'typography.body.fontSize: "calc(var(--text-body-size) + 2px)" is not exactly one var(--name)',
        '--text-body-size: declared by the kit theme, not named in the token maps',
      ],
    ],
    [
      'a kit property the front matter does not name',
      DESIGN.replace('elevation:\n  shadow: "var(--shadow)"\n', ''),
      ['--shadow: declared by the kit theme, not named in the token maps'],
    ],
    [
      'a reference to an inherited group',
      DESIGN.replace('{colors.primary}', '{constructor.name}'),
      ['components.button.backgroundColor: {constructor.name} names no front matter token'],
    ],
    [
      'a reference to an inherited method',
      DESIGN.replace('{colors.primary}', '{toString.length}'),
      ['components.button.backgroundColor: {toString.length} names no front matter token'],
    ],
    [
      'a reference to an inherited key',
      DESIGN.replace('{colors.primary}', '{colors.constructor}'),
      ['components.button.backgroundColor: {colors.constructor} names no front matter token'],
    ],
    [
      'a components var() the theme does not declare',
      DESIGN.replace('"{colors.primary}"', '"var(--does-not-exist)"'),
      ['components.button.backgroundColor: --does-not-exist is not declared by the kit theme'],
    ],
    [
      'a body reference to a missing map key',
      `${DESIGN}Use \`{colors.huge}\` for nothing.\n`,
      [`DESIGN.md line ${NEXT_LINE}: {colors.huge} names no front matter token`],
    ],
    [
      'a body reference to a missing dotted key',
      `${DESIGN}Use {rounded.0.5} for nothing.\n`,
      [`DESIGN.md line ${NEXT_LINE}: {rounded.0.5} names no front matter token`],
    ],
    [
      'a body reference on the first line after the front matter',
      DESIGN.replace('---\n\n# Fixture', '---\nSee {colors.huge}.\n# Fixture'),
      [`DESIGN.md line ${DESIGN.split('\n').indexOf('---', 1) + 2}: {colors.huge} names no front matter token`],
    ],
    [
      'a missing reference inside a fenced code block',
      `${DESIGN}\n\`\`\`md\n{colors.huge}\n\`\`\`\n`,
      [`DESIGN.md line ${NEXT_LINE + 2}: {colors.huge} names no front matter token`],
    ],
    [
      'a literal value in components',
      DESIGN.replace('"{colors.primary}"', '"red"'),
      ['components.button.backgroundColor: "red" is not exactly one {group.key} or var(--name)'],
    ],
    [
      'a components value mixing a literal and a reference',
      DESIGN.replace('"{colors.primary}"', '"1px solid {colors.primary}"'),
      ['components.button.backgroundColor: "1px solid {colors.primary}" is not exactly one {group.key} or var(--name)'],
    ],
    [
      'a token map key that only components name',
      DESIGN.replace('elevation:\n  shadow: "var(--shadow)"\n', '').replace('  button:\n', '  button:\n    shadow: "var(--shadow)"\n'),
      ['--shadow: declared by the kit theme, not named in the token maps'],
    ],
  ])('reports %s and exits 1', (_name, design, expected) => {
    const result = runOn(design);
    expect(result.code).toBe(1);
    expect(lines(result.stdout).sort()).toEqual([...expected].sort());
  });

  it('does not take a selector such as .btn--primary:hover for a declaration', () => {
    const theme = `${THEME.replace(/^ *--primary: [^;]+;\n/gm, '')}\n.btn--primary:hover { color: red; }\n`;
    const result = runOn(DESIGN, theme);
    expect(result.code).toBe(1);
    expect(lines(result.stdout)).toEqual(['colors.primary: --primary is not declared by the kit theme']);
  });

  it.each([
    ['a named token the theme declares only through @property', DESIGN.replace('colors:\n', 'colors:\n  brand: "var(--brand)"\n'), `${THEME}\n@property --brand {\n  syntax: '<color>';\n  inherits: true;\n  initial-value: red;\n}\n`],
    ['a UTF-8 BOM before the front matter', `\u{FEFF}${DESIGN}`, THEME],
    ['a full-line # comment in the front matter', DESIGN.replace('colors:\n', '# Brand colours\ncolors:\n'), THEME],
    ['a valid body reference', `${DESIGN}Use \`{colors.primary}\` once.\n`, THEME],
    ['an uppercase group in the body', `${DESIGN}See {iOS.notes} and {Colors.huge}.\n`, THEME],
    ['a components value that is one var() the theme declares', DESIGN.replace('"{colors.primary}"', '"var(--primary)"'), THEME],
    ['CSS braces in a body code span', `${DESIGN}Set \`.card { padding: 0.5rem }\` in CSS.\n`, THEME],
  ])('passes with %s', (_name, design, theme) => {
    const result = runOn(design, theme);
    expect(result.code, result.stdout + result.stderr).toBe(0);
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
      ['a DESIGN.md that is a directory', () => run(['--design', fixtures, '--theme', path.join(fixtures, 'theme.css')]), /is not a file/],
      ['a missing theme', () => run(['--design', path.join(fixtures, 'DESIGN.md'), '--theme', 'missing.css'], project({}))],
      ['no front matter', () => runOn('# DESIGN\n')],
      ['an unclosed front matter', () => runOn(DESIGN.replace('\n---\n\n# Fixture', '\n\n# Fixture'))],
      ['a YAML list', () => runOn(DESIGN.replace('  primary: "var(--primary)"', '  - "var(--primary)"'))],
      ['an odd indent', () => runOn(DESIGN.replace('  primary: "var(--primary)"', '   primary: "var(--primary)"'))],
      ['a map nested three levels deep', () => runOn(DESIGN.replace('    fontSize: "var(--text-body-size)"', '    fontSize:\n      value: "var(--text-body-size)"')), /line 13: "typography.body.fontSize" must be a scalar/],
      ['a map nested three levels deep in components', () => runOn(DESIGN.replace('    backgroundColor: "{colors.primary}"', '    backgroundColor:\n      value: "{colors.primary}"')), /line 16: "components.button.backgroundColor" must be a scalar/],
      ['a group with no entries', () => runOn(DESIGN.replace('  primary: "var(--primary)"\n', '')), /line 6: "colors" has no entries/],
      ['a typography key with no entries', () => runOn(DESIGN.replace('    fontSize: "var(--text-body-size)"\n', '')), /line 13: "typography.body" has no entries/],
      ['a component with no entries before the closing ---', () => runOn(DESIGN.replace(/ {4}backgroundColor:[^]*?(?=---)/, '')), /front matter: "components.button" has no entries/],
      ['a duplicate key', () => runOn(DESIGN.replace('  base: "var(--radius)"', '  base: "var(--radius)"\n  base: "var(--radius)"'))],
      ['a __proto__ group', () => runOn(DESIGN.replace('rounded:\n', '__proto__:\n  primary: "#0065e3"\nrounded:\n')), /line 7: reserved key/],
      ['a constructor key in a token map', () => runOn(DESIGN.replace('  base: "var(--radius)"', '  base: "var(--radius)"\n  constructor: "var(--radius)"')), /reserved key/],
      ['a prototype key in components', () => runOn(DESIGN.replace('  button:\n', '  prototype:\n    rounded: "{rounded.base}"\n  button:\n')), /reserved key/],
      ['a misspelled top-level scalar', () => runOn(DESIGN.replace('version:', 'verison:')), /line 3: "verison" must be a map/],
      ['a token at the top level', () => runOn(DESIGN.replace('colors:\n', 'primary: "var(--primary)"\ncolors:\n')), /line 5: "primary" must be a map/],
      ['a token map group holding a scalar', () => runOn(DESIGN.replace('elevation:\n  shadow: "var(--shadow)"\n', 'elevation: "var(--shadow)"\n')), /line 9: "elevation" must be a map/],
      ['a camelCase group', () => runOn(DESIGN.replace('elevation:', 'fontSizes:')), /line 9: top-level key "fontSizes" must match/],
      ['a snake_case group', () => runOn(DESIGN.replace('elevation:', 'font_sizes:')), /line 9: top-level key "font_sizes" must match/],
      ['a meta key holding a map', () => runOn(DESIGN.replace('name: "Fixture"', 'name:\n  value: "Fixture"')), /"name" must be a scalar/],
      ['a nested map under colors', () => runOn(DESIGN.replace('  primary: "var(--primary)"', '  primary:\n    shade: "var(--primary)"')), /line 6: "colors.primary" must be a scalar/],
      ['a scalar directly under typography', () => runOn(DESIGN.replace('  body:\n    fontSize:', '  body: "var(--text-body-size)"\n  other:\n    fontSize:')), /line 12: "typography.body" must be a map/],
      ['a scalar directly under components', () => runOn(DESIGN.replace('  button:\n', '  link: "{colors.primary}"\n  button:\n')), /line 15: "components.link" must be a map/],
      ...['name', 'version', 'description'].map((key) => [
        `a missing ${key}`,
        () => runOn(DESIGN.replace(new RegExp(`^${key}: .*\\n`, 'm'), '')),
        new RegExp(`"${key}" is missing`),
      ]),
    ];

    it.each(cases)('%s', (_name, exec, stderr = /./) => {
      const result = exec();
      expect(result.code).toBe(2);
      expect(result.stderr).toMatch(stderr);
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
