/**
 * Tests for the frontx-design skill's DESIGN.md script
 * (template-design-guardrails/.frontx/.../skills/frontx-design/scripts/design-md.mjs)
 * on a trimmed kit theme.css fixture: generate writes the token front matter
 * and keeps the body, check reports drift, lint reports broken refs,
 * one-theme tokens and low contrast, and bad input exits 2.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  contrastRatio,
  parseYaml,
  run,
  splitDesign,
} from '../template-design-guardrails/.frontx/ai/@gears-frontx/template-design-guardrails/skills/frontx-design/scripts/design-md.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const THEME = path.join(here, 'fixtures/design-md/theme.css');
const BODY = '\n# Product design\n\nThe human-written body.\n';

let dir;
let design;
let out;
const cli = (...args) => {
  out = [];
  const push = (line) => out.push(line);
  return run(args, push, push);
};
const frontMatter = () => parseYaml(splitDesign(readFileSync(design, 'utf8')).yaml);

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'design-md-'));
  design = path.join(dir, 'DESIGN.md');
  writeFileSync(design, BODY);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('generate', () => {
  it('writes the kit tokens as front matter and keeps the body', () => {
    expect(cli('generate', '--design', design, '--theme', THEME, '--kit-version', '9.9.9')).toBe(0);
    const text = readFileSync(design, 'utf8');
    expect(text.endsWith(BODY)).toBe(true);

    const fm = frontMatter();
    expect(fm.name).toBe('FrontX');
    expect(fm.version).toBe('9.9.9');
    expect(fm.colors.primary).toBe('#0065e3');
    expect(fm['colors-dark'].background).toBe('#0f172a');
    expect(fm.colors['popover-border']).toBe('color-mix(in oklab, {colors.foreground} 12%, transparent)');
    expect(fm.rounded).toEqual({ base: '10px', lg: '10px', xl: '12px' });
    expect(fm.spacing).toEqual({ 2: '8px', 4: '16px' });
    expect(fm.controls['opacity-disabled']).toBe(0.42);
    expect(fm.elevation['popover-shadow']).toBe('0 8px 24px 0 {colors.popover-border}');
    expect(fm.typography.body).toEqual({ fontFamily: '{fonts.sans}', fontSize: '14px', lineHeight: '20px', fontWeight: 400 });
    expect(fm.components.tooltip).toBeUndefined(); // the fixture has no meta type role
    expect(out.join('\n')).toMatch(/note: component tooltip \(missing typography\.meta, rounded\.md\) not written/);
    expect(fm.components.card).toEqual({
      backgroundColor: '{colors.card}',
      textColor: '{colors.card-foreground}',
      borderColor: '{colors.border}',
      rounded: '{rounded.xl}',
      gap: '{spacing.4}',
    });
  });

  it('replaces existing front matter and keeps the body byte for byte', () => {
    const body = '\n# Body\n\n---\n\nA rule above, `---` inline, trailing spaces  \n\n\nend';
    writeFileSync(design, `---\nname: "Old"\ncolors:\n  primary: "#000000"\n---\n${body}`);
    expect(cli('generate', '--design', design, '--theme', THEME)).toBe(0);
    const text = readFileSync(design, 'utf8');
    expect(splitDesign(text).body).toBe(body);
    expect(text.split('\n').filter((l) => l === '---')).toHaveLength(3); // open, close, the body's own rule
    expect(frontMatter().name).toBe('Old');
    expect(frontMatter().colors.primary).toBe('#0065e3');
  });

  it('keeps CRLF line endings and does not stack a second front matter', () => {
    const body = '\r\n# Body\r\n\r\nText.\r\n';
    writeFileSync(design, `---\r\nname: "Crlf"\r\n---\r\n${body}`);
    expect(cli('generate', '--design', design, '--theme', THEME)).toBe(0);
    const text = readFileSync(design, 'utf8');
    expect(text.split('\r\n').filter((l) => l === '---')).toHaveLength(2);
    expect(text.replace(/\r\n/g, '')).not.toContain('\n');
    expect(splitDesign(text).body).toBe(body);
    expect(frontMatter().name).toBe('Crlf');
    expect(cli('check', '--design', design, '--theme', THEME)).toBe(0);
    expect(cli('generate', '--design', design, '--theme', THEME)).toBe(0);
    expect(readFileSync(design, 'utf8')).toBe(text);
  });

  it('accepts a dark block written as a selector list, quoted or not', () => {
    const fixture = readFileSync(THEME, 'utf8');
    for (const selector of [':root, [data-theme="dark"]', '[data-theme=dark], .dark', ":root,\n[data-theme='dark']"]) {
      const theme = path.join(dir, 'theme.css');
      writeFileSync(theme, fixture.replace("[data-theme='dark'] {", `${selector} {`));
      expect(cli('generate', '--design', design, '--theme', theme)).toBe(0);
      expect(frontMatter()['colors-dark'].background).toBe('#0f172a');
    }
  });

  it('parses a long theme.css in linear time', () => {
    const theme = path.join(dir, 'theme.css');
    const fixture = readFileSync(THEME, 'utf8');
    const filler = `${'a'.repeat(200_000)}\n.x { --pad:${' '.repeat(200_000)}; }\n`;
    writeFileSync(theme, filler + fixture);
    const started = performance.now();
    expect(cli('generate', '--design', design, '--theme', theme)).toBe(0);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it('keeps an existing name and is stable on a second run', () => {
    cli('generate', '--design', design, '--theme', THEME, '--name', 'Acme console');
    const first = readFileSync(design, 'utf8');
    cli('generate', '--design', design, '--theme', THEME);
    expect(readFileSync(design, 'utf8')).toBe(first);
    expect(frontMatter().name).toBe('Acme console');
  });
});

describe('check', () => {
  it('passes right after generate', () => {
    cli('generate', '--design', design, '--theme', THEME);
    expect(cli('check', '--design', design, '--theme', THEME)).toBe(0);
  });

  it('reports drift with a fix when the front matter was edited', () => {
    cli('generate', '--design', design, '--theme', THEME);
    writeFileSync(design, readFileSync(design, 'utf8').replace('"#0065e3"', '"#ff0000"'));
    expect(cli('check', '--design', design, '--theme', THEME)).toBe(1);
    expect(out.join('\n')).toMatch(/drift: .*fix: run .*generate/);
  });

  it('reports drift when DESIGN.md has no front matter yet', () => {
    expect(cli('check', '--design', design, '--theme', THEME)).toBe(1);
  });

  const themeChanges = {
    'a changed token': (css) => css.replace('--primary: #0065e3;\n  --primary-foreground: #ffffff;\n  color-scheme: light;', '--primary: #0050b3;\n  --primary-foreground: #ffffff;\n  color-scheme: light;'),
    'a removed token': (css) => css.replace('  --space-4: 1rem;\n', ''),
    'an added token': (css) => css.replace('  --space-4: 1rem;\n', '  --space-4: 1rem;\n  --space-8: 2rem;\n'),
  };
  for (const [change, edit] of Object.entries(themeChanges)) {
    it(`reports drift after ${change} in the theme and leaves DESIGN.md untouched`, () => {
      const theme = path.join(dir, 'theme.css');
      const fixture = readFileSync(THEME, 'utf8');
      writeFileSync(theme, fixture);
      cli('generate', '--design', design, '--theme', theme);
      const generated = readFileSync(design);
      const changed = edit(fixture);
      expect(changed).not.toBe(fixture);
      writeFileSync(theme, changed);
      expect(cli('check', '--design', design, '--theme', theme)).toBe(1);
      expect(out.join('\n')).toMatch(/drift: /);
      cli('lint', '--design', design);
      expect(readFileSync(design).equals(generated)).toBe(true);
    });
  }
});

describe('lint', () => {
  it('passes on generated front matter with readable pairs', () => {
    cli('generate', '--design', design, '--theme', THEME);
    expect(cli('lint', '--design', design)).toBe(0);
  });

  it('reports a broken ref, a one-theme token and a low-contrast pair, one line each with a fix', () => {
    writeFileSync(
      design,
      [
        '---',
        'name: "Broken"',
        'colors:',
        '  background: "#ffffff"',
        '  faint: "#dddddd"',
        '  only-light: "#000000"',
        'colors-dark:',
        '  background: "#000000"',
        '  faint: "#222222"',
        'components:',
        '  label:',
        '    backgroundColor: "{colors.background}"',
        '    textColor: "{colors.faint}"',
        '  chip:',
        '    textColor: "{colors.missing}"',
        '---',
        BODY,
      ].join('\n'),
    );
    expect(cli('lint', '--design', design)).toBe(1);
    expect(out).toHaveLength(4);
    expect(out[0]).toMatch(/broken-ref components\.chip\.textColor: \{colors\.missing\}.*fix:/);
    expect(out[1]).toMatch(/orphaned-token colors\.only-light: .*fix:/);
    expect(out[2]).toMatch(/contrast components\.label \(light\): .*1\.36:1, below 4\.5:1; fix:/);
    expect(out[3]).toMatch(/contrast components\.label \(dark\): .*fix:/);
  });
});

describe('usage errors exit 2', () => {
  it('rejects an unknown mode', () => {
    expect(cli('render')).toBe(2);
  });

  it('rejects a missing theme.css', () => {
    expect(cli('check', '--design', design, '--theme', path.join(dir, 'nope.css'))).toBe(2);
  });

  it('rejects a theme.css without a dark block', () => {
    const theme = path.join(dir, 'theme.css');
    writeFileSync(theme, ':root { --space-1: 0.25rem; }\n:root, [data-theme="light"] { --background: #fff; }\n');
    expect(cli('generate', '--design', design, '--theme', theme)).toBe(2);
    expect(out[0]).toMatch(/no \[data-theme='dark'\] block/);
  });

  it('rejects lint on a DESIGN.md without front matter', () => {
    expect(cli('lint', '--design', design)).toBe(2);
  });

  it('rejects a directory given as DESIGN.md or as theme.css', () => {
    expect(cli('generate', '--design', dir, '--theme', THEME)).toBe(2);
    expect(out[0]).toMatch(/is not a file/);
    expect(cli('lint', '--design', dir)).toBe(2);
    expect(cli('check', '--design', design, '--theme', dir)).toBe(2);
    expect(out[0]).toMatch(/theme\.css .* is not a file/);
  });

  const malformed = {
    'a line with no colon': ['---\nname: "X"\ncolors\n---\n', 3],
    'an unterminated double quote': ['---\nname: "X\n---\n', 2],
    'an unterminated single quote': ["---\nname: 'X\n---\n", 2],
  };
  for (const [what, [text, line]] of Object.entries(malformed)) {
    it(`rejects front matter with ${what} on lint and on check`, () => {
      writeFileSync(design, text + BODY);
      expect(cli('lint', '--design', design)).toBe(2);
      expect(out[0]).toContain(`front matter line ${line} `);
      expect(cli('check', '--design', design, '--theme', THEME)).toBe(2);
      expect(readFileSync(design, 'utf8')).toBe(text + BODY);
    });
  }
});

describe('contrastRatio', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#0065e3')).toBeCloseTo(5.29, 2);
    expect(contrastRatio('#fff', '#ffffff')).toBeCloseTo(1, 5);
  });
});
