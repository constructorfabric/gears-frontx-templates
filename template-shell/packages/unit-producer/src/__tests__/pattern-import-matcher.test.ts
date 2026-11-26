import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { PatternImportMatcher } from '../PatternImportMatcher';

const roots: string[] = [];

function write(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

const fail = (m: string): never => {
  throw new Error(m);
};

function fixture(): { out: string; dep: { name: string; version: string; packageDir: string } } {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'pattern-matcher-')));
  roots.push(root);
  const packageDir = join(root, 'pkg');
  write(join(packageDir, 'dist/a/caller.js'), 'export const f = (l) => import(`./locales/${l}.js`);\n');
  write(join(packageDir, 'dist/b/caller.js'), 'export const g = (l) => import(`./locales/${l}.js`);\n');
  write(join(packageDir, 'dist/a/locales/en.js'), 'export default 1;\n');
  write(join(packageDir, 'dist/b/locales/de.js'), 'export default 2;\n');
  return { out: join(root, 'out'), dep: { name: 'pkg', version: '1.0.0', packageDir } };
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('PatternImportMatcher', () => {
  it('prefers every module spelling the prefix over the entry directory', () => {
    const { out, dep } = fixture();
    const matched = new PatternImportMatcher(out).match(
      dep,
      {
        location: 'pkg@1.0.0/index.h.js',
        entryPoint: join(dep.packageDir, 'dist/index.js'),
        modulePaths: ['dist/a/caller.js', 'dist/b/caller.js'],
      },
      './locales/',
      '.js',
      fail
    );
    expect(matched.map((m) => m.location).sort()).toEqual([
      'pkg@1.0.0/locales/de.js',
      'pkg@1.0.0/locales/en.js',
    ]);
  });

  it('answers a repeated (chunk, prefix, suffix) from the first match', () => {
    const { out, dep } = fixture();
    const matcher = new PatternImportMatcher(out);
    const caller = {
      location: 'pkg@1.0.0/index.h.js',
      modulePaths: ['dist/a/caller.js'],
    };
    const first = matcher.match(dep, caller, './locales/', '.js', fail);
    rmSync(join(dep.packageDir, 'dist/a/locales'), { recursive: true });
    expect(matcher.match(dep, caller, './locales/', '.js', fail)).toBe(first);
  });

  it('fails when an owned module cannot be read to find the caller', () => {
    const { out, dep } = fixture();
    expect(() =>
      new PatternImportMatcher(out).match(
        dep,
        { location: 'pkg@1.0.0/x.h.js', modulePaths: ['dist/gone.js'] },
        './locales/',
        '.js',
        fail
      )
    ).toThrow(/module "dist\/gone\.js" of "pkg" in "pkg@1\.0\.0\/x\.h\.js" cannot be read/);
  });

  it('fails when no module and no entry spells the prefix', () => {
    const { out, dep } = fixture();
    expect(() =>
      new PatternImportMatcher(out).match(
        dep,
        { location: 'pkg@1.0.0/x.h.js', modulePaths: [] },
        './locales/',
        '.js',
        fail
      )
    ).toThrow(/no module of "pkg" in "pkg@1\.0\.0\/x\.h\.js" spells the pattern import prefix/);
  });
});
