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
});

describe('contrastRatio', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#0065e3')).toBeCloseTo(5.29, 2);
    expect(contrastRatio('#fff', '#ffffff')).toBeCloseTo(1, 5);
  });
});
