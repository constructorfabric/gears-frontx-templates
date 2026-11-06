// @vitest-environment node
// The static check on fixture projects written to a temp dir. Fixtures are
// strings, not files in this package, so the shell's lint and type-check
// never read the raw elements and literals they hold on purpose.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { checkContext, checkScript, collectFiles, main } from '../runner/static.mjs';
import { designMdParser, readSkillJson } from '../runner/skill.mjs';

// A small DESIGN.md of its own, so a token edit in the project DESIGN.md
// does not change the fix texts asserted here.
const FIXTURE_DESIGN_MD = `---
name: "Fixture"
version: "0.0.0"
description: "Tokens for the static check tests."
colors:
  background: "var(--background)"
  foreground: "var(--foreground)"
  primary: "var(--primary)"
  muted: "var(--muted)"
  border: "var(--border)"
  ring: "var(--ring)"
  danger: "var(--danger)"
spacing:
  space-2: "var(--space-2)"
  space-4: "var(--space-4)"
rounded:
  base: "var(--radius)"
typography:
  body:
    fontSize: "var(--text-body-size)"
elevation:
  popover-shadow: "var(--popover-shadow)"
motion:
  duration-micro: "var(--duration-micro)"
  ease-standard: "var(--ease-standard)"
---

# Fixture
`;
const designDir = fs.mkdtempSync(path.join(os.tmpdir(), 'design-verify-static-design-'));
const DESIGN_MD = path.join(designDir, 'DESIGN.md');
fs.writeFileSync(DESIGN_MD, FIXTURE_DESIGN_MD);
afterAll(() => fs.rmSync(designDir, { recursive: true, force: true }));

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function project(files: Record<string, string>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'design-verify-static-'));
  dirs.push(root);
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  }
  return root;
}

type Finding = { gate: string; kind: string; file: string; line: number; column: number; found: string; fix: string };

async function check(root: string, args: string[] = []) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await main(['--src', 'src', '--design', DESIGN_MD, ...args], {
    cwd: root,
    env: {},
    log: (line) => out.push(line),
    error: (line) => err.push(line),
  });
  const reportFile = path.join(root, 'design-verify-report', 'static-findings.json');
  const report = fs.existsSync(reportFile) ? JSON.parse(fs.readFileSync(reportFile, 'utf8')) : undefined;
  return { code, out: out.join('\n'), err: err.join('\n'), report, findings: (report?.findings ?? []) as Finding[] };
}

const found = (findings: Finding[]) => findings.map((f) => `${f.kind} ${f.found}`);

describe('CSS Modules', () => {
  it('reports each literal kind where DESIGN.md names a token for it', async () => {
    const root = project({
      'src/Orders.module.css': [
        '.a {',
        '  color: #fff;',
        '  background: rgb(0 0 0 / 50%);',
        '  border-color: oklch(0.7 0.1 200);',
        '  outline-color: red;',
        '  --local: #123456;',
        '  padding: 12px;',
        '  margin: calc(var(--space-2) + 2px);',
        '  border-radius: 6px;',
        '  font-size: 13px;',
        '  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);',
        '  transition: opacity 150ms ease-in;',
        '}',
      ].join('\n'),
    });
    const { code, findings } = await check(root);
    expect(code).toBe(0);
    expect(found(findings)).toEqual([
      'color #fff in color',
      'color rgb(0 0 0/50%) in background',
      'color oklch(0.7 0.1 200) in border-color',
      'color red in outline-color',
      'color #123456 in --local',
      'spacing 12px in padding',
      'spacing 2px in margin',
      'radius 6px in border-radius',
      'font-size 13px in font-size',
      'shadow 0 1px 2px rgba(0,0,0,0.2) in box-shadow',
      'duration 150ms in transition',
      'easing ease-in in transition',
    ]);
    expect(findings.every((f) => f.gate === 'SYS-002')).toBe(true);
    expect(findings[0]).toMatchObject({ file: 'src/Orders.module.css', line: 2, column: 10 });
    expect(findings[0].fix).toBe(
      'use a color token from DESIGN.md colors: var(--background), var(--foreground), var(--primary), ' +
        'var(--muted), var(--border), var(--ring) and 1 more there',
    );
    expect(findings.find((f) => f.kind === 'spacing')?.fix).toBe('use a spacing token from DESIGN.md spacing: var(--space-2), var(--space-4)');
    expect(findings.find((f) => f.kind === 'radius')?.fix).toBe('use a radius token from DESIGN.md rounded: var(--radius)');
    expect(findings.find((f) => f.kind === 'font-size')?.fix).toBe('use a font-size token from DESIGN.md typography: var(--text-body-size)');
    expect(findings.find((f) => f.kind === 'shadow')?.fix).toBe('use a shadow token from DESIGN.md elevation: var(--popover-shadow)');
    expect(findings.find((f) => f.kind === 'duration')?.fix).toBe('use a duration token from DESIGN.md motion: var(--duration-micro)');
    expect(findings.find((f) => f.kind === 'easing')?.fix).toBe('use an easing token from DESIGN.md motion: var(--ease-standard)');
  });

  it('reads only the font size of the font shorthand, not its line height', async () => {
    const root = project({
      'src/Type.module.css': [
        '.a { font: 600 14px/20px var(--font-sans); }',
        '.b { font: 12px system-ui; }',
        '.c { font: italic 600 var(--text-body-size)/24px var(--font-sans); }',
        '.d { font: 600 calc(1rem + 2px)/1.5 var(--font-sans); }',
      ].join('\n'),
      'src/Type.tsx': "export const T = () => <p style={{ font: '600 14px/20px var(--font-sans)' }} />;",
    });
    const { findings } = await check(root);
    expect(findings.map((f) => `${f.file}:${f.line} ${f.kind} ${f.found}`)).toEqual([
      'src/Type.module.css:1 font-size 14px in font',
      'src/Type.module.css:2 font-size 12px in font',
      'src/Type.module.css:4 font-size 1rem in font',
      'src/Type.module.css:4 font-size 2px in font',
      'src/Type.tsx:1 font-size 14px in font',
    ]);
  });

  // Vite compiles `color: danger` to the @value's literal, so the definition
  // is where the literal is.
  it('reads a CSS Modules @value definition as a local custom property, and skips the import form', async () => {
    const root = project({
      'src/Values.module.css': [
        '@value danger: #e11d48;',
        '@value brand: var(--primary);',
        "@value muted, gap from './tokens.module.css';",
        '@value  warn  oklch(0.8 0.1 80);',
        '@value pad: 12px;',
        '.a { color: danger; }',
      ].join('\n'),
    });
    const { code, findings } = await check(root);
    expect(code).toBe(0);
    expect(findings.map((f) => `${f.line}:${f.column} ${f.gate} ${f.kind} ${f.found}`)).toEqual([
      '1:1 SYS-002 color #e11d48 in @value danger',
      '4:1 SYS-002 color oklch(0.8 0.1 80) in @value warn',
    ]);
    expect(findings[0].fix).toMatch(/^use a color token from DESIGN.md colors: /);
  });

  // references/foundations.md allows values derived from tokens: a relative
  // colour or a color-mix() is checked by the colours it starts from.
  it('checks a relative colour by its origin and color-mix() by each colour argument', async () => {
    const root = project({
      'src/Derived.module.css': [
        '.a { color: rgb(from var(--foreground) r g b / 50%); }',
        '.b { background: oklch(from var(--primary) calc(l * 0.9) c h); }',
        '.c { border-color: hsl(from oklch(from var(--border) l c h) h s l); }',
        '.d { outline-color: rgb(from currentColor r g b / 40%); }',
        '.e { color: rgb(from #fff r g b / 50%); }',
        '.f { color: hsl(from red h s l); }',
        '.g { color: hsl(from oklch(from #123456 l c h) h s l); }',
        '.h { background: color-mix(in srgb, var(--primary) 30%, transparent); }',
        '.i { background: color-mix(in oklch, var(--primary), rgb(from var(--muted) r g b / 50%)); }',
        '.j { background: color-mix(in srgb, var(--primary) 30%, #fff); }',
        '.k { background: color-mix(in hsl longer hue, red, rgb(from #000 r g b)); }',
        '.l { box-shadow: 0 0 0 var(--space-2) rgb(from var(--ring) r g b / 50%); }',
        '.m { box-shadow: 0 0 0 var(--space-2) rgb(from #000 r g b / 50%); }',
      ].join('\n'),
      'src/Derived.tsx': [
        "export const A = () => <p style={{ color: 'rgb(from var(--foreground) r g b / 50%)' }} />;",
        "export const B = () => <p style={{ color: 'rgb(from #fff r g b)' }} />;",
      ].join('\n'),
    });
    const { findings } = await check(root);
    expect(findings.map((f) => `${f.file}:${f.line} ${f.kind} ${f.found}`)).toEqual([
      'src/Derived.module.css:5 color rgb(from #fff r g b/50%) in color',
      'src/Derived.module.css:6 color hsl(from red h s l) in color',
      'src/Derived.module.css:7 color hsl(from oklch(from #123456 l c h) h s l) in color',
      'src/Derived.module.css:10 color #fff in background',
      'src/Derived.module.css:11 color red in background',
      'src/Derived.module.css:11 color rgb(from #000 r g b) in background',
      'src/Derived.module.css:13 shadow 0 0 0 var(--space-2) rgb(from #000 r g b/50%) in box-shadow',
      'src/Derived.tsx:2 color rgb(from #fff r g b) in color',
    ]);
    expect(findings.every((f) => f.gate === 'SYS-002')).toBe(true);
  });

  // Every colour channel (alpha aside) must read an origin channel keyword or
  // a var(), alone or inside calc(); a channel of only literal numbers is a
  // fixed value, so the colour is a literal. Alpha may be anything, and
  // `alpha` is not a colour channel keyword.
  it('derives a relative colour only when every colour channel reads its origin or a var()', async () => {
    const root = project({
      'src/Channels.module.css': [
        '.a { color: oklch(from var(--p) l c var(--h)); }',
        '.b { color: rgb(from var(--p) var(--r) var(--g) var(--b)); }',
        '.c { color: oklch(from var(--p) l c calc(h + 30)); }',
        '.d { color: rgb(from var(--p) r g b / 50%); }',
        '.e { color: color(from var(--p) srgb r g b); }',
        '.f { color: rgb(from var(--x) 255 0 0); }',
        '.g { color: rgb(from var(--x) 255 0 0 / alpha); }',
        '.h { color: hwb(from var(--p) 0 0% 0% / alpha); }',
        '.i { color: rgb(from var(--p) r 0 0); }',
      ].join('\n'),
    });
    const { findings } = await check(root);
    expect(findings.map((f) => `${f.line} ${f.found}`)).toEqual([
      '6 rgb(from var(--x)255 0 0) in color',
      '7 rgb(from var(--x)255 0 0/alpha) in color',
      '8 hwb(from var(--p)0 0% 0%/alpha) in color',
      '9 rgb(from var(--p) r 0 0) in color',
    ]);
  });

  it('accepts tokens, var() fallbacks, 0, the allowed keywords and plain .css files', async () => {
    const root = project({
      'src/Clean.module.css': [
        '.a {',
        '  color: var(--foreground);',
        '  background: var(--surface, #fff);',
        '  border-color: transparent;',
        '  fill: currentColor;',
        '  padding: 0;',
        '  margin: calc(var(--space-2) * -1);',
        '  gap: var(--space-2);',
        '  border-radius: 50%;',
        '  box-shadow: none;',
        '  transition: opacity var(--duration-micro) var(--ease-standard);',
        '  font-family: var(--font-sans);',
        '  width: 320px;',
        '}',
      ].join('\n'),
      'src/global.css': '.b { color: #fff; }',
    });
    const { code, findings, report } = await check(root);
    expect(findings).toEqual([]);
    expect(report.files).toEqual(['src/Clean.module.css']);
    expect(code).toBe(0);
  });
});

describe('TSX and TS', () => {
  it('reports native elements, roles and anchors the kit covers, and inline style literals', async () => {
    const root = project({
      'src/Orders.tsx': [
        "import { Button } from '@gears-frontx/ui-kit';",
        'export function Orders({ onClick }: { onClick: () => void }) {',
        '  return (',
        '    <div>',
        '      <button onClick={onClick}>Save</button>',
        '      <input />',
        '      <input type="checkbox" />',
        '      <input type="hidden" />',
        '      <select />',
        '      <textarea />',
        '      <dialog open />',
        '      <table />',
        '      <a onClick={onClick}>Open</a>',
        '      <a href="#" onClick={onClick}>Open</a>',
        '      <a href="/orders">Orders</a>',
        '      <div role="button" onClick={onClick} />',
        '      <Button>Kit</Button>',
        "      <div style={{ color: '#fff', padding: 8, margin: 0, gap: 'var(--space-2)' }} />",
        '    </div>',
        '  );',
        '}',
      ].join('\n'),
      'src/legacy.ts': "import React from 'react';\nexport const x = React.createElement('button', { type: 'button' });\n",
    });
    const { code, findings } = await check(root);
    expect(code).toBe(0);
    expect(found(findings)).toEqual([
      'element <button>',
      'element <input type="text">',
      'element <input type="checkbox">',
      'element <select>',
      'element <textarea>',
      'element <dialog>',
      'element <table>',
      'element <a onClick> with no link target',
      'element <a onClick> with no link target',
      'element <div role="button">',
      'color #fff in color',
      'spacing 8 in padding',
      'element <button>',
    ]);
    const button = findings[0];
    expect(button).toMatchObject({ gate: 'SYS-001', file: 'src/Orders.tsx', line: 5, column: 7 });
    expect(button.fix).toBe('use the kit Button from @gears-frontx/ui-kit');
    expect(findings[2].fix).toBe('use the kit Checkbox from @gears-frontx/ui-kit');
    expect(findings[3].fix).toBe('use the kit Select or NativeSelect from @gears-frontx/ui-kit');
    expect(findings.at(-1)).toMatchObject({ file: 'src/legacy.ts', line: 2 });
    expect(findings.filter((f) => f.kind !== 'element').every((f) => f.gate === 'SYS-002')).toBe(true);
  });

  it("reports React's createElement and leaves document.createElement alone", async () => {
    const root = project({
      'src/react-default.ts': "import React from 'react';\nexport const a = React.createElement('button');\n",
      'src/react-namespace.ts': "import * as R from 'react';\nexport const b = R.createElement('select');\n",
      'src/react-named.ts': "import { createElement as h } from 'react';\nexport const c = h('textarea');\n",
      'src/react-global.ts': "export const d = React.createElement('table');\n",
      'src/dom.ts': [
        "const field = document.createElement('input');",
        "const host = window.document.createElement('button');",
        "function createElement(tag: string) { return tag; }",
        "export const e = [field, host, createElement('dialog')];",
      ].join('\n'),
      'src/other-lib.ts': "import { createElement } from 'preact';\nexport const f = createElement('button', null);\n",
    });
    const { findings } = await check(root);
    expect(findings.map((f) => `${f.file} ${f.found}`)).toEqual([
      'src/react-default.ts <button>',
      'src/react-global.ts <table>',
      'src/react-named.ts <textarea>',
      'src/react-namespace.ts <select>',
    ]);
  });

  // The JSX form `<Button style={{ padding: 8 }} />` reports the literal; the
  // createElement form of the same call must too.
  it('reads the style of a createElement call whatever its type, and reports only a native tag as an element', async () => {
    const root = project({
      'src/Create.ts': [
        "import React from 'react';",
        "import { Button } from '@gears-frontx/ui-kit';",
        "const Local = () => null;",
        'export const a = React.createElement(Button, { style: { padding: 8 } });',
        "export const b = React.createElement(Local, { style: { color: '#fff' } });",
        "export const c = React.createElement('span', { style: { gap: 'var(--space-2)', margin: '4px' } });",
        "export const d = document.createElement('div');",
      ].join('\n'),
      'src/Jsx.tsx': [
        "import { Button } from '@gears-frontx/ui-kit';",
        'export const J = () => <Button style={{ padding: 8 }} />;',
      ].join('\n'),
    });
    const { findings } = await check(root);
    expect(findings.map((f) => `${f.file}:${f.line} ${f.kind} ${f.found}`)).toEqual([
      'src/Create.ts:4 spacing 8 in padding',
      'src/Create.ts:5 color #fff in color',
      'src/Create.ts:6 spacing 4px in margin',
      'src/Jsx.tsx:2 spacing 8 in padding',
    ]);
    expect(findings.every((f) => f.gate === 'SYS-002')).toBe(true);
  });

  it('is clean on a screen built from kit components and tokens, and skips tests', async () => {
    const root = project({
      'src/Clean.tsx': [
        "import { Button, Input } from '@gears-frontx/ui-kit';",
        "import styles from './Clean.module.css';",
        'export function Clean() {',
        "  return <div className={styles.row} style={{ gap: 'var(--space-2)' }}><Input /><Button>Save</Button><a href=\"/x\">x</a></div>;",
        '}',
      ].join('\n'),
      'src/Clean.module.css': '.row { display: flex; gap: var(--space-2); }',
      'src/__tests__/Clean.test.tsx': 'export const t = <button />;',
    });
    const { code, findings, report, out } = await check(root);
    expect(findings).toEqual([]);
    expect(report.files).toEqual(['src/Clean.module.css', 'src/Clean.tsx']);
    expect(report.summary).toMatchObject({ filesChecked: 2, totalFindings: 0, parseErrors: 0 });
    expect(out).toContain('2 file(s) checked - 0 finding(s)');
    expect(code).toBe(0);
  });
});

describe('exit codes and the baseline', () => {
  const dirty = { 'src/A.module.css': '.a { color: #fff; }\n.b { padding: 4px; }' };

  it('exits 1 on findings only with --fail-on-findings, and then only on new ones against a baseline', async () => {
    const root = project(dirty);
    expect((await check(root)).code).toBe(0);
    const failing = await check(root, ['--fail-on-findings']);
    expect(failing.code).toBe(1);

    fs.copyFileSync(path.join(root, 'design-verify-report/static-findings.json'), path.join(root, 'baseline.json'));
    const known = await check(root, ['--fail-on-findings', '--baseline', 'baseline.json']);
    expect(known.code).toBe(0);
    expect(known.out).toContain('vs baseline: 0 new, 0 resolved, 0 unverified, 2 carried over');

    // A line moved, a finding resolved and a new one: identity ignores the line.
    fs.writeFileSync(path.join(root, 'src/A.module.css'), '\n\n.a { color: #fff; }\n.c { margin: 3px; }');
    const changed = await check(root, ['--fail-on-findings', '--baseline', 'baseline.json']);
    expect(changed.code).toBe(1);
    expect(changed.out).toContain('vs baseline: 1 new, 1 resolved, 0 unverified, 1 carried over');
    expect(changed.out).toContain('NEW SYS-002 src/A.module.css: spacing 3px in margin');
    expect(changed.report.baselineComparison.new).toHaveLength(1);
  });

  it('exits 2 on usage and input errors, and on a file that does not parse', async () => {
    const root = project({ ...dirty, 'src/Broken.tsx': 'export const = ;' });
    const broken = await check(root);
    expect(broken.code).toBe(2);
    expect(broken.out).toContain('PARSE ERROR src/Broken.tsx:1:');

    const out: string[] = [];
    const io = { cwd: root, env: {}, log: () => undefined, error: (l: string) => out.push(l) };
    expect(await main(['--design', DESIGN_MD], io)).toBe(2);
    expect(out.pop()).toMatch(/--src is required/);
    expect(await main(['--src', 'missing', '--design', DESIGN_MD], io)).toBe(2);
    expect(out.pop()).toMatch(/does not exist/);
    expect(await main(['--src', 'src'], io)).toBe(2);
    expect(out.pop()).toMatch(/DESIGN\.md not found/);
    expect(await main(['--src', 'src', '--design', DESIGN_MD, '--baseline', 'nope.json'], io)).toBe(2);
    expect(out.pop()).toMatch(/--baseline .*nope\.json could not be read/);
    expect(await main(['--nope'], io)).toBe(2);
  });

  it('honours the root waiver file by source glob, and exits 2 on one it cannot honour', async () => {
    const root = project({
      'src/tree/Tree.tsx': 'export const T = () => <table />;',
      'src/Other.tsx': 'export const O = () => <table />;',
      'src/tree/Tree.module.css': '.a { color: #fff; }',
      'src/clean/Ok.tsx': 'export const K = () => null;',
      'design-waivers.json': JSON.stringify({
        waivers: [
          { gate: 'SYS-001', screen: { source: 'src/tree/**' }, reason: 'Tree grid: kit gap.' },
          { gate: 'SYS-001', screen: { source: 'src/clean/**' }, reason: 'Unused.' },
          { gate: 'SYS-001', screen: { route: '/?screen=tree' }, reason: 'For the render runner.' },
          { gate: 'LAY-001', screen: { source: 'src/tree/**' }, reason: 'Review only: no checker reports LAY-001.' },
          { gate: 'SYS-001', screen: { source: 'src/billing/**' }, reason: 'Outside this --src.' },
        ],
      }),
    });
    const { code, findings, report, out } = await check(root, ['--fail-on-findings']);
    expect(found(findings)).toEqual(['element <table>', 'color #fff in color']);
    expect(findings.map((f) => f.file)).toEqual(['src/Other.tsx', 'src/tree/Tree.module.css']);
    expect(report.waived).toEqual([
      expect.objectContaining({ file: 'src/tree/Tree.tsx', gate: 'SYS-001', waiver: { index: 0, reason: 'Tree grid: kit gap.' } }),
    ]);
  // parseDiagnostics is internal to TypeScript; a release without it must not
  // make every file parse clean.
  it('reports syntax errors through the public API, without the internal parseDiagnostics', async () => {
    const ts = (await import('typescript')).default;
    const withoutInternals = {
      ...ts,
      createSourceFile: (...args: Parameters<typeof ts.createSourceFile>) =>
        Object.defineProperty(ts.createSourceFile(...args), 'parseDiagnostics', { value: undefined }),
    };
    const { readDesignMd } = await designMdParser();
    const ctx = checkContext(readSkillJson('rules/static-check.json'), readDesignMd(DESIGN_MD).front);
    const { parseErrors } = checkScript(ctx, withoutInternals, 'export const = ;', 'src/Broken.tsx');
    expect(parseErrors).toEqual([expect.stringMatching(/^src\/Broken\.tsx:1:14: Variable declaration expected\.$/)]);
    expect(checkScript(ctx, withoutInternals, 'export const ok = <p />;', 'src/Ok.tsx').parseErrors).toEqual([]);
  });

    expect(report.summary).toMatchObject({ totalFindings: 2, waived: 1 });
    const unread = 'needs a file matching src/billing/** under --src; none of the files read matches';
    expect(report.waivers).toMatchObject({
      applied: 1,
      notApplicable: [
        { index: 2, needs: 'needs screen.source' },
        { index: 4, needs: unread },
      ],
    });
    expect(out).toContain('WAIVED SYS-001 src/tree/Tree.tsx:1:24 element <table> - waiver #0: Tree grid: kit gap.');
    expect(out).toContain('UNUSED WAIVER #1 SYS-001 (source src/clean/**): matched no finding in this run');
    expect(out).toContain('WAIVER #2 SYS-001 (route /?screen=tree): not applicable to this run (needs screen.source)');
    // A glob no file of this run matches was never exercised, so it is not unused.
    expect(out).toContain(`WAIVER #4 SYS-001 (source src/billing/**): not applicable to this run (${unread})`);
    expect(out).toContain('RECORDED WAIVER #3 LAY-001 (source src/tree/**): recorded, not checked by this runner');
    expect(report.waivers.unused.map((w: { index: number }) => w.index)).toEqual([1]);
    expect(code).toBe(1);

    // SYS-002 never yields: a waiver for it is an input error, not a pass.
    fs.writeFileSync(
      path.join(root, 'design-waivers.json'),
      JSON.stringify({ waivers: [{ gate: 'SYS-002', screen: { source: 'src/**' }, reason: 'x' }] }),
    );
    const rejected = await check(root);
    expect(rejected.code).toBe(2);
    expect(rejected.err).toMatch(/SYS-002 has waiver "never" and cannot be waived/);
  });

  it('exits 0 with --fail-on-findings when a waiver covers every finding, and 1 without it', async () => {
    const root = project({
      'src/tree/Tree.tsx': 'export const T = () => <table />;',
      'design-waivers.json': JSON.stringify({
        waivers: [{ gate: 'SYS-001', screen: { source: 'src/tree/**' }, reason: 'Tree grid: kit gap.' }],
      }),
    });
    const waived = await check(root, ['--fail-on-findings']);
    expect(waived.findings).toEqual([]);
    expect(waived.report.waived).toHaveLength(1);
    expect(waived.code).toBe(0);

    fs.rmSync(path.join(root, 'design-waivers.json'));
    const open = await check(root, ['--fail-on-findings']);
    expect(open.findings).toHaveLength(1);
    expect(open.code).toBe(1);
  });

  it('exits 2 naming each --src that selects no file, so a gate never passes on nothing', async () => {
    const root = project({
      'src/A.module.css': '.a { color: #fff; }',
      'src/typo/.keep': '',
      'tests-only/__tests__/A.test.tsx': 'export const t = <button />;',
    });
    const result = await check(root, ['--src', 'src/typo', '--src', 'tests-only']);
    expect(result.code).toBe(2);
    expect(result.err).toContain('--src src/typo selects no file to check\n--src tests-only selects no file to check\n');
    expect(result.err).not.toContain('--src src ');
    expect(result.report).toBeUndefined();

    // A --src inside another selects its files too: overlap is not empty.
    const overlap = await check(root, ['--src', 'src/A.module.css']);
    expect(overlap.code).toBe(0);
    expect(overlap.report.files).toEqual(['src/A.module.css']);
    expect(overlap.report.skipped).toEqual([]);
  });

  it('follows symbolic links, reads a cycle once and names every selectable entry it cannot check', async () => {
    const root = project({
      'lib/Shared.tsx': 'export const S = () => <button />;',
      'other/B.module.css': '.a { color: #fff; }',
    });
    fs.mkdirSync(path.join(root, 'src'));
    fs.symlinkSync('../lib', path.join(root, 'src/linked'));
    fs.symlinkSync('.', path.join(root, 'lib/loop'));
    fs.symlinkSync('../other/B.module.css', path.join(root, 'src/B.module.css'));
    fs.symlinkSync('../nowhere.tsx', path.join(root, 'src/Broken.tsx'));
    const { code, report, findings, out } = await check(root);
    expect(report.files).toEqual(['src/B.module.css', 'src/linked/Shared.tsx']);
    expect(found(findings)).toEqual(['color #fff in color', 'element <button>']);
    const skipped = [...report.skipped].sort((a, b) => (a.path < b.path ? -1 : 1));
    expect(skipped).toEqual([
      { path: 'src/Broken.tsx', reason: expect.stringMatching(/^cannot be read \(ENOENT\)/) },
      { path: 'src/linked/loop', reason: 'a link cycle back to src/linked, read once' },
    ]);
    expect(out).toContain('2 file(s) checked, 2 skipped');
    expect(out).toContain('SKIPPED src/linked/loop: a link cycle back to src/linked, read once');
    expect(code).toBe(0);
  });

  // chmod does not stop root, so the unlistable directory needs a normal user.
  it.skipIf(process.getuid?.() === 0)(
    'lists a directory it cannot list as skipped, and nothing the globs leave out',
    async () => {
      const root = project({
        'src/A.module.css': '.a { color: #fff; }',
        'src/locked/B.tsx': 'export const B = () => <button />;',
        'src/__tests__/locked/C.test.tsx': 'export const C = () => <button />;',
      });
      fs.symlinkSync('../nowhere.tsx', path.join(root, 'src/__tests__/Gone.tsx'));
      fs.symlinkSync('../nowhere', path.join(root, 'src/dist'));
      fs.symlinkSync('../nowhere.tsx', path.join(root, 'src/Moved.tsx'));
      const locked = [path.join(root, 'src/locked'), path.join(root, 'src/__tests__/locked')];
      for (const dir of locked) fs.chmodSync(dir, 0o000);
      try {
        const { code, report, out } = await check(root);
        expect(report.files).toEqual(['src/A.module.css']);
        const skipped = [...report.skipped].sort((a, b) => (a.path < b.path ? -1 : 1));
        expect(skipped).toEqual([
          { path: 'src/Moved.tsx', reason: expect.stringMatching(/^cannot be read \(ENOENT\)/) },
          { path: 'src/locked', reason: 'a directory that cannot be listed (EACCES)' },
        ]);
        expect(out).toContain('SKIPPED src/locked: a directory that cannot be listed (EACCES)');
        expect(code).toBe(0);
      } finally {
        for (const dir of locked) fs.chmodSync(dir, 0o755);
      }
    },
  );

  it('excludes a directory only by a glob ending in /**, never by a file-name glob', () => {
    const root = project({
      'src/_foo.tsx': 'export const F = () => null;',
      'src/Bar.tsx': 'export const B = () => null;',
      'src/pages/Baz.tsx': 'export const Z = () => null;',
      'src/dist/Out.tsx': 'export const O = () => null;',
      // A directory whose own name matches the file-name glob `**/_*`: its
      // files are still checked.
      'src/_drafts/Page.tsx': 'export const P = () => null;',
    });
    fs.symlinkSync('../nowhere.tsx', path.join(root, 'src/_gone.tsx'));
    fs.symlinkSync('../nowhere.tsx', path.join(root, 'src/Moved.tsx'));
    const globs = { css: ['**/*.css'], script: ['**/*.tsx'], exclude: ['**/_*', '**/dist/**'] };
    const { files, skipped } = collectFiles(root, [path.join(root, 'src')], globs);
    expect(files).toEqual([
      ['src/Bar.tsx', 'script'],
      ['src/_drafts/Page.tsx', 'script'],
      ['src/pages/Baz.tsx', 'script'],
    ]);
    // A broken link is listed unless an exclude glob covers it.
    expect(skipped).toEqual([{ path: 'src/Moved.tsx', reason: expect.stringMatching(/^cannot be read \(ENOENT\)/) }]);
  });

  it('resolves paths against $INIT_CWD, where npm was invoked', async () => {
    const root = project(dirty);
    const code = await main(['--src', 'src', '--design', DESIGN_MD], {
      cwd: os.tmpdir(),
      env: { INIT_CWD: root },
      log: () => undefined,
    });
    expect(code).toBe(0);
    expect(fs.existsSync(path.join(root, 'design-verify-report/static-findings.json'))).toBe(true);
  });
});

describe('rules/static-check.json', () => {
  const rules = readSkillJson('rules/static-check.json');
  const named = [
    ...Object.values(rules.elements.tags),
    ...Object.values(rules.elements.inputTypes),
    ...Object.values(rules.elements.roles),
    rules.elements.anchorAsButton,
  ].flat() as string[];

  // Real names only: a kit upgrade that drops or renames one fails here.
  it('names only components the installed kit exports', async () => {
    const kit = await import('@gears-frontx/ui-kit');
    expect(named.length).toBeGreaterThan(20);
    expect(named.filter((name) => typeof (kit as Record<string, unknown>)[name] === 'undefined')).toEqual([]);
  });
});
