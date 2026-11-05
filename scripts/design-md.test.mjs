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
  parseColour,
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

  it('accepts the allowed selectors in any quote and whitespace style', () => {
    const fixture = readFileSync(THEME, 'utf8');
    for (const [light, dark] of [
      [':root, [data-theme="light"]', '[data-theme="dark"]'],
      [':root,[data-theme=light]', '[data-theme=dark]'],
      [":root ,\n  [ data-theme = 'light' ]", "[ data-theme='dark' ]"],
    ]) {
      const theme = path.join(dir, 'theme.css');
      writeFileSync(theme, fixture.replace(":root,\n[data-theme='light'] {", `${light} {`).replace("\n[data-theme='dark'] {", `\n${dark} {`));
      expect(cli('generate', '--design', design, '--theme', theme)).toBe(0);
      expect([frontMatter().colors.background, frontMatter()['colors-dark'].background]).toEqual(['#f1f5f9', '#0f172a']);
    }
  });

  it('merges repeated allowed blocks in source order, the later declaration wins', () => {
    const theme = path.join(dir, 'theme.css');
    const fixture = readFileSync(THEME, 'utf8');
    writeFileSync(theme, fixture);
    cli('generate', '--design', design, '--theme', theme);
    const extra = [
      ':root, [data-theme="light"] { --primary: #ff0000; --extra: #00ff00; }',
      '[data-theme="dark"] { --primary: #0000ff; --extra: #00ff00; }',
      ':root { --space-2: 0.75rem; }',
      '[data-theme="dark"] { --primary: #000099; }',
    ].join('\n');
    writeFileSync(theme, `${fixture}\n${extra}\n`);
    expect(cli('check', '--design', design, '--theme', theme)).toBe(1);
    expect(cli('generate', '--design', design, '--theme', theme)).toBe(0);
    const fm = frontMatter();
    expect(fm.colors.primary).toBe('#ff0000');
    expect(fm.colors.background).toBe('#f1f5f9'); // the first light block still counts
    expect(fm.colors.extra).toBe('#00ff00');
    expect(fm.spacing[2]).toBe('12px');
    expect(fm['colors-dark'].primary).toBe('#000099');
    expect(fm['colors-dark'].background).toBe('#0f172a');
  });

  it('keeps the light and dark values of a token the invariant block also declares', () => {
    const theme = path.join(dir, 'theme.css');
    writeFileSync(theme, readFileSync(THEME, 'utf8').replace(':root {\n', ':root {\n  --primary: #123456;\n'));
    expect(cli('generate', '--design', design, '--theme', theme)).toBe(0);
    expect(frontMatter().colors.primary).toBe('#0065e3');
    expect(frontMatter()['colors-dark'].primary).toBe('#0065e3');
  });

  describe('reads only the kit block shape', () => {
    const themeWith = (extra) => {
      const theme = path.join(dir, 'theme.css');
      writeFileSync(theme, `${readFileSync(THEME, 'utf8')}\n${extra}\n`);
      return theme;
    };
    const primaries = (extra) => {
      expect(cli('generate', '--design', design, '--theme', themeWith(extra))).toBe(0);
      return [frontMatter().colors.primary, frontMatter()['colors-dark'].primary];
    };

    it('lets a later :root block win over the themed blocks in both themes', () => {
      expect(primaries(':root { --primary: #ff0000; }')).toEqual(['#ff0000', '#ff0000']);
    });

    it('accepts a fallback block that equals the dark theme', () => {
      const fallback = "@media (prefers-color-scheme: dark) {\n  :root:not([data-theme='light']) { --foreground: #ffffff; --primary: var(--primary-foreground); color-scheme: dark; }\n}";
      expect(primaries(`${fallback}\n[data-theme='dark'] { --primary: #ffffff; }`)).toEqual(['#0065e3', '#ffffff']);
    });

    it('ignores a block with no custom property, whatever its selector', () => {
      cli('generate', '--design', design, '--theme', THEME);
      const plain = readFileSync(design, 'utf8');
      const extra = 'body,\n[data-theme] { background-color: var(--background); color: var(--foreground); font-family: var(--font-sans); }\n@media (min-width: 1px) { .x { color: red; } }';
      expect(cli('generate', '--design', design, '--theme', themeWith(extra))).toBe(0);
      expect(readFileSync(design, 'utf8')).toBe(plain);
    });

    it('keeps a quoted value exactly: ;, comment marks and double spaces inside quotes', () => {
      const extra = `:root { --font-sans: 'Inter;  Display',   "A  /* x */ B",\n  sans-serif /* trailing */; --font-mono: "Mono}{" ; }`;
      expect(cli('generate', '--design', design, '--theme', themeWith(extra))).toBe(0);
      expect(frontMatter().fonts).toEqual({ sans: `'Inter;  Display', "A  /* x */ B", sans-serif`, mono: '"Mono}{"' });
    });

    it('accepts "!important" inside a quoted font-family', () => {
      const extra = `:root { --font-sans: "Brand !important", 'X ! IMPORTANT', sans-serif; }`;
      expect(cli('generate', '--design', design, '--theme', themeWith(extra))).toBe(0);
      expect(frontMatter().fonts.sans).toBe(`"Brand !important", 'X ! IMPORTANT', sans-serif`);
    });

    const rejected = {
      'another selector': ['.card { --primary: #ff0000; }', /theme\.css rule "\.card" declares --primary; .*fix:/],
      'an html block': ['html { --primary: #ff0000; }', /theme\.css rule "html" declares --primary; .*fix:/],
      ':root[data-theme=dark]': [':root[data-theme=dark] { --primary: #ff0000; }', /theme\.css rule ":root\[data-theme=dark\]" declares --primary; .*fix:/],
      'a selector list that only partly matches': ['[data-theme=dark], .dark { --primary: #ff0000; }', /theme\.css rule "\[data-theme=dark\], \.dark" declares --primary; .*fix:/],
      'a light and dark selector list': ['[data-theme="light"], [data-theme="dark"] { --primary: #ff0000; }', /rule "\[data-theme="light"\], \[data-theme="dark"\]" declares --primary/],
      '@media all': ['@media all { :root { --space-2: 1rem; } }', /theme\.css at-rule "@media all" declares --space-2; .*fix:/],
      '@media of another feature': ['@media (min-width: 1px) { :root { --primary: #ff0000; } }', /at-rule "@media \(min-width: 1px\)" declares --primary/],
      '@supports': ['@supports (color: red) { :root { --primary: #ff0000; } }', /theme\.css at-rule "@supports \(color: red\)" declares --primary; .*fix:/],
      '@layer': ['@layer kit { :root { --primary: #ff0000; } }', /at-rule "@layer kit" declares --primary/],
      'a nested rule': [':root { --space-2: 0.5rem; & .x { --primary: #ff0000; } }', /theme\.css rule "& \.x" nested in rule ":root" declares --primary; .*fix:/],
      'font-size in :root': [':root { font-size: 20px; }', /theme\.css rule ":root" sets font-size; .*rem values are converted at 16px.*fix:/],
      'a named colour': [':root { --primary: white; }', /token --primary in rule ":root" is the named colour white; fix: use hex, rgb\(\) or hsl\(\)/],
      'transparent': ["[data-theme='dark'] { --card: transparent; }", /token --card .* is the named colour transparent; fix: use hex, rgb\(\) or hsl\(\)/],
      '!important on a colour': [':root { --primary: #ff0000 !important; }', /token --primary in rule ":root" carries !important; fix: remove !important; the kit does not use it/],
      '!IMPORTANT with spaces on a ref': ["[data-theme='dark'] { --primary: var(--primary-foreground) ! IMPORTANT; }", /token --primary in rule "\[data-theme='dark'\]" carries !important; fix: remove !important/],
      '!important on a length': [':root { --space-2: 1rem!Important; }', /token --space-2 in rule ":root" carries !important; fix: remove !important/],
      'two tokens on one output path': [':root { --radius-base: 1rem; }', /tokens --radius and --radius-base are both written to rounded\.base; fix:/],
      'a fallback block that differs from dark': [
        "@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) { --background: #000000; } }",
        /token --background is #000000 in the prefers-color-scheme fallback block and #0f172a in the dark theme; fix:/,
      ],
    };
    for (const [form, [extra, message]] of Object.entries(rejected)) {
      it(`rejects ${form} on generate and check and leaves DESIGN.md untouched`, () => {
        cli('generate', '--design', design, '--theme', THEME);
        const generated = readFileSync(design);
        const theme = themeWith(extra);
        for (const mode of ['generate', 'check']) {
          expect(cli(mode, '--design', design, '--theme', theme)).toBe(2);
          expect(out[0]).toMatch(message);
        }
        expect(readFileSync(design).equals(generated)).toBe(true);
      });
    }

    it('classifies a token by name: a themed --radius equal in both themes is written once under rounded', () => {
      const theme = themeWith(':root, [data-theme="light"] { --radius: 1rem; }\n[data-theme="dark"] { --radius: 1rem; }');
      expect(cli('generate', '--design', design, '--theme', theme)).toBe(0);
      const fm = frontMatter();
      expect(fm.rounded).toEqual({ base: '16px', lg: '16px', xl: '18px' });
      expect(fm.colors.radius).toBeUndefined();
      expect(fm['colors-dark'].radius).toBeUndefined();
      expect(cli('lint', '--design', design)).toBe(0);
    });

    it('rejects a non-colour token whose value differs between the themes', () => {
      cli('generate', '--design', design, '--theme', THEME);
      const generated = readFileSync(design, 'utf8');
      const theme = themeWith('[data-theme="dark"] { --radius: 1rem; }');
      for (const mode of ['generate', 'check']) {
        expect(cli(mode, '--design', design, '--theme', theme)).toBe(2);
        expect(out[0]).toMatch(/token --radius is 0\.625rem in the light theme and 1rem in the dark theme, but DESIGN\.md has one rounded\.base value for both; fix:/);
      }
      expect(readFileSync(design, 'utf8')).toBe(generated);
    });
  });

  it('writes every var() ref under the path the token is written to, so lint finds no broken ref', () => {
    const theme = path.join(dir, 'theme.css');
    const extra = '  --raised-shadow: 0 var(--space-2) var(--text-body-size) 0 var(--popover-border);\n  --outline-gap: var(--radius);\n';
    writeFileSync(theme, readFileSync(THEME, 'utf8').replace(':root {\n', `:root {\n${extra}`));
    expect(cli('generate', '--design', design, '--theme', theme)).toBe(0);
    const fm = frontMatter();
    expect(fm.elevation['raised-shadow']).toBe('0 {spacing.2} {typography.body.fontSize} 0 {colors.popover-border}');
    expect(fm.other['outline-gap']).toBe('{rounded.base}');
    expect(cli('lint', '--design', design)).toBe(0);
  });

  describe('resolves var() chains before it classifies or converts, and fails closed', () => {
    const gen = (extra) => {
      const theme = path.join(dir, 'theme.css');
      writeFileSync(theme, `${readFileSync(THEME, 'utf8')}\n${extra}\n`);
      return cli('generate', '--design', design, '--theme', theme);
    };

    it('writes a colour alias shared by both themes as a colour ref', () => {
      expect(gen(':root { --brand: #0065e3; --primary: var(--brand); }')).toBe(0);
      const fm = frontMatter();
      expect([fm.colors.primary, fm['colors-dark'].primary]).toEqual(['{colors.brand}', '{colors.brand}']);
      expect(fm.other?.primary).toBeUndefined();
      expect(fm.components['button-primary'].backgroundColor).toBe('{colors.primary}');
      expect(cli('lint', '--design', design)).toBe(0);
    });

    it('writes an alias to a different colour per theme as a themed colour', () => {
      const extra = ':root { --brand-a: #0065e3; --brand-b: #1d4ed8; }\n:root, [data-theme="light"] { --primary: var(--brand-a); }\n[data-theme="dark"] { --primary: var(--brand-b); }';
      expect(gen(extra)).toBe(0);
      const fm = frontMatter();
      expect([fm.colors.primary, fm['colors-dark'].primary]).toEqual(['{colors.brand-a}', '{colors.brand-b}']);
      expect(fm.components['button-primary']).toBeDefined();
      expect(cli('lint', '--design', design)).toBe(0);
    });

    it('resolves an aliased font weight and opacity to numbers', () => {
      expect(gen(':root { --weight-regular: 400; --text-body-weight: var(--weight-regular); --dim: 0.5; --opacity-disabled: var(--dim); }')).toBe(0);
      expect(frontMatter().typography.body.fontWeight).toBe(400);
      expect(frontMatter().controls['opacity-disabled']).toBe(0.5);
    });

    it('rejects an alias to a missing token and a non-numeric weight, and writes nothing', () => {
      const cases = [
        [':root { --text-body-weight: var(--weight-missing); }', /token --text-body-weight refers to var\(--weight-missing\), which the light theme does not declare; fix:/],
        [':root { --text-body-weight: bold; }', /token --text-body-weight resolves to bold, not a number; fix:/],
        [':root { --opacity-disabled: var(--dim); --dim: 50%; }', /token --opacity-disabled resolves to 50%, not a number; fix:/],
      ];
      for (const [extra, message] of cases) {
        writeFileSync(design, BODY);
        expect(gen(extra)).toBe(2);
        expect(out[0]).toMatch(message);
        expect(readFileSync(design, 'utf8')).toBe(BODY);
      }
    });
  });

  it('parses a long theme.css in linear time', () => {
    const theme = path.join(dir, 'theme.css');
    const fixture = readFileSync(THEME, 'utf8');
    const filler = `${'a'.repeat(200_000)}\n.x { color:${' '.repeat(200_000)}red; }\n:root { --pad:${' '.repeat(200_000)}1px; --font-x: '${' '.repeat(200_000)}'; }\n`;
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

  const pairDesign = (colors, dark = colors) =>
    [
      '---',
      'name: "Pairs"',
      'colors:',
      ...Object.entries(colors).map(([k, v]) => `  ${k}: "${v}"`),
      'colors-dark:',
      ...Object.entries(dark).map(([k, v]) => `  ${k}: "${v}"`),
      'components:',
      '  label:',
      '    backgroundColor: "{colors.background}"',
      '    textColor: "{colors.foreground}"',
      '---',
      BODY,
    ].join('\n');

  it('checks contrast on rgb() and hsl() colours, comma and space syntax', () => {
    const cases = [
      ['rgb(255, 255, 255)', 'rgb(221 221 221)'],
      ['rgba(255, 255, 255, 1)', 'rgb(221 221 221 / 100%)'],
      ['hsl(0, 0%, 100%)', 'hsl(0deg 0% 86.67%)'],
      ['hsla(0, 0%, 100%, 1)', 'hsl(0 0 86.67 / 1)'],
    ];
    for (const [background, foreground] of cases) {
      writeFileSync(design, pairDesign({ background, foreground }));
      expect(cli('lint', '--design', design)).toBe(1);
      expect(out).toHaveLength(2);
      expect(out[0]).toMatch(/contrast components\.label \(light\): .*1\.36:1, below 4\.5:1/);
    }
    writeFileSync(design, pairDesign({ background: 'hsl(210, 40%, 96%)', foreground: 'rgb(15 23 42)' }));
    expect(cli('lint', '--design', design)).toBe(0);
  });

  it('reports a pair it cannot compute instead of passing it', () => {
    const cases = {
      'oklch(0.98 0.01 250)': /oklch\(0\.98 0\.01 250\), not a hex, rgb\(\) or hsl\(\) colour/,
      'color-mix(in oklab, #000 50%, white)': /not a hex, rgb\(\) or hsl\(\) colour/,
      'rgb(0 0 0 / 50%)': /which is translucent/,
      '#00000080': /which is translucent/,
    };
    for (const [background, reason] of Object.entries(cases)) {
      writeFileSync(design, pairDesign({ background, foreground: '#ffffff' }));
      expect(cli('lint', '--design', design)).toBe(1);
      expect(out).toHaveLength(2);
      expect(out[0]).toMatch(/^.*: contrast-unchecked components\.label \(light\): \{colors\.background\} resolves to /);
      expect(out[0]).toMatch(reason);
      expect(out[0]).toMatch(/fix: use a supported colour syntax .* or check the pair by hand/);
    }
  });

  it('reports a ref cycle and the pair it leaves unchecked', () => {
    writeFileSync(design, pairDesign({ background: '#ffffff', foreground: '{colors.foreground}' }));
    expect(cli('lint', '--design', design)).toBe(1);
    expect(out[0]).toMatch(/ref-cycle \{colors\.foreground\} -> \{colors\.foreground\}: .*fix:/);
    expect(out.filter((l) => /contrast-unchecked components\.label \(\w+\): \{colors\.foreground\} is a reference cycle/.test(l))).toHaveLength(2);

    writeFileSync(design, pairDesign({ background: '#ffffff', foreground: '{colors.ink}', ink: '{colors.foreground}' }));
    expect(cli('lint', '--design', design)).toBe(1);
    expect(out.filter((l) => l.includes('ref-cycle {colors.foreground} -> {colors.ink} -> {colors.foreground}'))).toHaveLength(1);
  });

  it('reports a ref chain that ends in a missing token', () => {
    writeFileSync(design, pairDesign({ background: '#ffffff', foreground: '{colors.ink}', ink: '{colors.missing}' }));
    expect(cli('lint', '--design', design)).toBe(1);
    expect(out.some((l) => /broken-ref colors\.ink: \{colors\.missing\}/.test(l))).toBe(true);
    expect(out.some((l) => /contrast-unchecked components\.label \(light\): \{colors\.foreground\} does not resolve to a value/.test(l))).toBe(true);
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

  it('reports a DESIGN.md target it cannot write as a usage error', () => {
    const target = path.join(dir, 'missing', 'DESIGN.md');
    expect(cli('generate', '--design', target, '--theme', THEME)).toBe(2);
    expect(out.join('\n')).toContain(`${target} cannot be written (ENOENT)`);
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
    expect(contrastRatio('rgb(0, 0, 0)', 'hsl(0 0% 100%)')).toBeCloseTo(21, 5);
    expect(contrastRatio('oklch(0 0 0)', '#ffffff')).toBeNull();
  });

  it('reads hex, rgb() and hsl() the same way', () => {
    expect(parseColour('#0065e3')).toEqual([0, 101, 227, 1]);
    expect(parseColour('rgb(0 101 227)')).toEqual([0, 101, 227, 1]);
    expect(parseColour('rgba(0, 101, 227, 0.5)')).toEqual([0, 101, 227, 0.5]);
    expect(parseColour('hsl(120, 100%, 25%)').map(Math.round)).toEqual([0, 128, 0, 1]);
    expect(parseColour('hsl(0.5turn 100% 50% / 25%)').map((c) => Math.round(c * 100) / 100)).toEqual([0, 255, 255, 0.25]);
    expect(parseColour('oklch(0.5 0.1 200)')).toBeNull();
    expect(parseColour('rgb(1, 2)')).toBeNull();
  });
});
