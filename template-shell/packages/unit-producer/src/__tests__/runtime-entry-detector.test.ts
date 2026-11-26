import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { RuntimeEntryDetector } from '../RuntimeEntryDetector';

/**
 * A package is runtime code only when an entry target names a script
 * file. Licences, extensionless asset patterns, stylesheets, fonts and
 * type declarations — the whole export surface of a webfont package —
 * never count.
 */

const dirs: string[] = [];

function packageDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'runtime-entry-'));
  dirs.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), content);
  }
  return dir;
}

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe('RuntimeEntryDetector.hasRuntimeEntry', () => {
  it('rejects a webfont package: licence, extensionless font pattern, css and a .d.css.ts types target', () => {
    const dir = packageDir({
      'index.css': 'body{}',
      'index.d.css.ts': 'export {};',
      LICENSE: 'licence',
      'files/f.woff2': 'wOF2',
      'scss/metadata.scss': '$m: ();',
    });
    const pkg = {
      main: 'index.css',
      exports: {
        '.': { types: './index.d.css.ts', sass: './index.css', default: './index.css' },
        './LICENSE': './LICENSE',
        './*': { default: './*.css' },
        './files/*': { default: './files/*' },
        './scss': { sass: './scss/metadata.scss' },
        './package.json': './package.json',
      },
    };
    expect(RuntimeEntryDetector.hasRuntimeEntry(pkg, dir)).toBe(false);
  });

  it('ignores the types condition of an otherwise asset-only export', () => {
    const dir = packageDir({ 'index.css': '', 'index.d.ts': '' });
    expect(
      RuntimeEntryDetector.hasRuntimeEntry(
        { exports: { '.': { types: './index.d.ts', default: './index.css' } } },
        dir
      )
    ).toBe(false);
  });

  it('accepts a script target, an extensionless main resolving to a script, and a pattern matching scripts', () => {
    expect(RuntimeEntryDetector.hasRuntimeEntry({ exports: { '.': { import: './dist/index.mjs' } } }, packageDir({}))).toBe(true);
    expect(RuntimeEntryDetector.hasRuntimeEntry({ main: 'lib/index' }, packageDir({ 'lib/index.js': '' }))).toBe(true);
    expect(
      RuntimeEntryDetector.hasRuntimeEntry({ exports: { './*': './dist/*' } }, packageDir({ 'dist/a.js': '', 'dist/a.d.ts': '' }))
    ).toBe(true);
    expect(RuntimeEntryDetector.hasRuntimeEntry({}, packageDir({ 'index.js': '' }))).toBe(true);
  });

  it('rejects a pattern whose directory holds only assets and declarations', () => {
    expect(
      RuntimeEntryDetector.hasRuntimeEntry({ exports: { './*': './dist/*' } }, packageDir({ 'dist/a.css': '', 'dist/a.d.ts': '' }))
    ).toBe(false);
  });
});
