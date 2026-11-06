// @vitest-environment node
// The static check on fixture projects written to a temp dir. Fixtures are
// strings, not files in this package, so the shell's lint and type-check
// never read the raw elements and literals they hold on purpose.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import * as kit from '@gears-frontx/ui-kit';
import { main } from '../runner/static.mjs';
import { readSkillJson } from '../runner/skill.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
// The project DESIGN.md: the package sits at <root>/src-app/verify_packages/design-verify.
const DESIGN_MD = path.resolve(here, '../../../../DESIGN.md');

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
    expect(findings[0].fix).toMatch(/^use a color token from DESIGN\.md colors: var\(--background\), .* and \d+ more there$/);
    expect(findings.find((f) => f.kind === 'spacing')?.fix).toContain('var(--space-4)');
    expect(findings.find((f) => f.kind === 'shadow')?.fix).toBe('use a shadow token from DESIGN.md elevation: var(--popover-shadow)');
    expect(findings.find((f) => f.kind === 'duration')?.fix).toContain('var(--duration-micro)');
    expect(findings.find((f) => f.kind === 'easing')?.fix).toBe('use an easing token from DESIGN.md motion: var(--ease-standard)');
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
  it('names only components the installed kit exports', () => {
    expect(named.length).toBeGreaterThan(20);
    expect(named.filter((name) => typeof (kit as Record<string, unknown>)[name] === 'undefined')).toEqual([]);
  });
});
