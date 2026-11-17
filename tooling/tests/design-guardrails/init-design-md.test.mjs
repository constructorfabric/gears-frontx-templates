import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const skill = path.join(
  here,
  '../../../template-design-guardrails/.frontx/ai/@gears-frontx/template-design-guardrails/skills/frontx-design',
);
const script = path.join(skill, 'scripts/init-design-md.mjs');
const canonical = readFileSync(path.join(skill, 'templates/DESIGN.md'), 'utf8');

let dir;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

function run(cwd, args = []) {
  return spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' });
}

describe('init-design-md', () => {
  it('creates DESIGN.md at the project root from the bundle copy when absent', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'frontx-init-design-md-'));
    const result = run(dir);
    expect(result.status).toBe(0);
    expect(readFileSync(path.join(dir, 'DESIGN.md'), 'utf8')).toBe(canonical);
    expect(result.stdout).toContain('created');
  });

  it('leaves an existing DESIGN.md untouched, on every later run', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'frontx-init-design-md-'));
    writeFileSync(path.join(dir, 'DESIGN.md'), '# edited by the project\n');
    for (let i = 0; i < 2; i += 1) {
      const result = run(dir);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('left as it is');
    }
    expect(readFileSync(path.join(dir, 'DESIGN.md'), 'utf8')).toBe('# edited by the project\n');
  });

  it('honours --design and rejects an unknown option', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'frontx-init-design-md-'));
    expect(run(dir, ['--design', 'docs/DESIGN.md']).status).toBe(2);
    expect(run(dir, ['--bogus']).status).toBe(2);
    expect(run(dir, ['--design', 'D.md']).status).toBe(0);
    expect(readFileSync(path.join(dir, 'D.md'), 'utf8')).toBe(canonical);
  });
});
