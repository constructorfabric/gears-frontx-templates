/**
 * Scenario: one build cache per workspace — the
 * default cache dir is `<workspace root>/node_modules/.cache/
 * frontx-unit-producer`, shared by every package of the workspace; a
 * package outside any workspace uses its own project root.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { defaultProducerCacheDir } from '../ProducerCacheDir';
import { WorkspaceRoot } from '../WorkspaceRoot';

const roots: string[] = [];
function tmp(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'ws-cache-')));
  roots.push(dir);
  return dir;
}
function pkg(dir: string, json: object): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify(json));
}
afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('default producer cache dir — workspace scope', () => {
  it('the shell and every MFE of one workspace share the workspace root cache', () => {
    const ws = tmp();
    pkg(ws, { name: 'root', workspaces: ['apps/*'] });
    pkg(join(ws, 'apps', 'shell'), { name: 'shell' });
    pkg(join(ws, 'apps', 'mfe-a'), { name: 'mfe-a' });
    const expected = join(ws, 'node_modules', '.cache', 'frontx-unit-producer');
    expect(defaultProducerCacheDir(join(ws, 'apps', 'shell'))).toBe(expected);
    expect(defaultProducerCacheDir(join(ws, 'apps', 'mfe-a'))).toBe(expected);
    expect(defaultProducerCacheDir(ws)).toBe(expected);
  });

  it('a pnpm workspace marker also names the workspace root', () => {
    const ws = tmp();
    pkg(ws, { name: 'root' });
    writeFileSync(join(ws, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n");
    pkg(join(ws, 'apps', 'a'), { name: 'a' });
    expect(WorkspaceRoot.of(join(ws, 'apps', 'a'))).toBe(ws);
  });

  it('a project without a workspace uses its own project root, even with an outer node_modules', () => {
    const outer = tmp();
    mkdirSync(join(outer, 'node_modules'), { recursive: true });
    const project = join(outer, 'project');
    pkg(project, { name: 'solo' });
    expect(defaultProducerCacheDir(project)).toBe(
      join(project, 'node_modules', '.cache', 'frontx-unit-producer')
    );
  });
});
