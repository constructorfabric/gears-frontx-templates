import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { BuildGraphSharing } from '../BuildGraphSharing';
import { SharedSetSelection, type SharedSetSelectionOptions } from '../SharedSetSelection';

/**
 * Scenario: the build-graph sharing rule — every bare package a source
 * module imports is shared whether npm-installed, workspace-linked or
 * aliased, regardless of what `package.json` declares.
 */

const dirs: string[] = [];

function tmp(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'bgs-test-')));
  dirs.push(dir);
  return dir;
}

function writePkg(dir: string, pkg: Record<string, unknown>): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg));
}

/** A host declaring `declared`, with a workspace-linked and an installed package. */
function makeHost(): string {
  const base = tmp();
  const host = join(base, 'host');
  writePkg(host, { name: 'host', dependencies: { declared: '1.0.0' } });
  writePkg(join(host, 'node_modules', 'declared'), { name: 'declared', version: '1.0.0' });
  writePkg(join(host, 'node_modules', 'undeclared'), { name: 'undeclared', version: '1.0.0' });
  const workspace = join(base, 'workspace', 'linked');
  writePkg(workspace, { name: 'linked', version: '1.0.0' });
  mkdirSync(join(host, 'node_modules'), { recursive: true });
  symlinkSync(workspace, join(host, 'node_modules', 'linked'), 'dir');
  return host;
}

function sharing(host: string, selection: SharedSetSelectionOptions = {}, alias?: unknown) {
  return new BuildGraphSharing({
    packageRoot: host,
    selection: new SharedSetSelection(selection),
    closureNames: [],
    alias,
  });
}

const SOURCE = '/host/src/main.ts';

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe('BuildGraphSharing (default)', () => {
  it('shares declared, undeclared and workspace-linked packages the code imports', () => {
    const graph = sharing(makeHost());
    expect(graph.external('declared', SOURCE)).toBe(true);
    expect(graph.external('undeclared', SOURCE)).toBe(true);
    expect(graph.external('linked/sub', SOURCE)).toBe(true);
    expect(graph.matches('linked')).toBe(true);
    expect(graph.importedPackages().map((p) => p.name)).toEqual([
      'declared',
      'linked',
      'undeclared',
    ]);
  });

  it('never shares what nothing can locate, nor built-ins, relative or asset specifiers', () => {
    const graph = sharing(makeHost());
    expect(graph.external('missing', SOURCE)).toBe(false);
    expect(graph.external('fs', SOURCE)).toBe(false);
    expect(graph.external('./local', SOURCE)).toBe(false);
    expect(graph.external('declared/theme.css', SOURCE)).toBe(false);
  });

  it('ignores imports written by tooling: html entries, virtual modules, node_modules files', () => {
    const graph = sharing(makeHost());
    expect(graph.external('undeclared', '/host/index.html')).toBe(false);
    expect(graph.external('undeclared', '\0virtual:entry')).toBe(false);
    expect(graph.external('undeclared', undefined)).toBe(false);
    expect(graph.external('undeclared', '/host/node_modules/x/index.js')).toBe(false);
    expect(graph.importedPackages()).toEqual([]);
  });

  it('leaves a specifier an alias rewrites to the bundler', () => {
    const graph = sharing(makeHost(), {}, { declared: 'undeclared' });
    expect(graph.external('declared', SOURCE)).toBe(false);
    expect(graph.external('undeclared', SOURCE)).toBe(true);
  });

  it('decides a root for the barrel rewrite without recording an import', () => {
    const graph = sharing(makeHost());
    expect(graph.sharesRoot('linked')).toBe(true);
    expect(graph.sharesRoot('missing')).toBe(false);
    expect(graph.importedPackages()).toEqual([]);
  });
});

describe('BuildGraphSharing (exclude / include)', () => {
  it('exclude removes the package, records it as imported but not shared', () => {
    const graph = sharing(makeHost(), { exclude: ['undeclared'] });
    expect(graph.external('undeclared', SOURCE)).toBe(false);
    expect(graph.external('linked', SOURCE)).toBe(true);
    expect(graph.importedPackages()).toContainEqual({ name: 'undeclared', shared: false });
  });

  it('include shares only the closure names', () => {
    const host = makeHost();
    const graph = new BuildGraphSharing({
      packageRoot: host,
      selection: new SharedSetSelection({ include: ['declared'] }),
      closureNames: ['declared'],
    });
    expect(graph.external('declared', SOURCE)).toBe(true);
    expect(graph.external('linked', SOURCE)).toBe(false);
    expect(graph.sharesRoot('linked')).toBe(false);
  });
});
