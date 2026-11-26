import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { PackageEntrySet } from '../PackageEntrySet';
import { UnitProducer } from '../UnitProducer';

/**
 * An `exports` key naming a file that is no module — a licence, a
 * stylesheet, a font, a Sass partial, a `.d.css.ts` declaration — is an
 * asset the consuming build handles itself, never a unit entry. A
 * package whose every export is such a file (a webfont package) has no
 * entry the producer builds, and producing it never feeds Rollup a
 * non-module file.
 */

const roots: string[] = [];

function write(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function makeRoot(deps: Record<string, string>): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'unit-producer-asset-exports-')));
  roots.push(root);
  write(join(root, 'package.json'), JSON.stringify({ name: 'host', version: '0.0.0', dependencies: deps }));
  return root;
}

function pkg(root: string, name: string, json: Record<string, unknown>, files: Record<string, string>): Record<string, unknown> {
  const dir = join(root, 'node_modules', name);
  const full = { name, version: '1.0.0', ...json };
  write(join(dir, 'package.json'), JSON.stringify(full));
  for (const [rel, content] of Object.entries(files)) write(join(dir, rel), content);
  return full;
}

/** Shaped like a variable-webfont package: stylesheets, font files, a licence. */
const FONT_JSON = {
  main: 'index.css',
  exports: {
    '.': { types: './index.d.css.ts', sass: './index.css', default: './index.css' },
    './LICENSE': './LICENSE',
    './*': { sass: './*.css', default: './*.css' },
    './files/*': { sass: './files/*', default: './files/*' },
    './files/*.woff2': { sass: './files/*.woff2', default: './files/*.woff2' },
    './scss': { sass: './scss/metadata.scss' },
  },
};

const FONT_FILES = {
  'index.css': "@font-face{font-family:'F';src:url(./files/f-latin.woff2)}\n",
  'index.d.css.ts': 'declare const css: string;\nexport default css;\n',
  'wght.css': 'body{}\n',
  LICENSE: 'Copyright (c) 2026 Fixture\n\nPermission is granted.\n',
  'files/f-latin.woff2': 'wOF2',
  'scss/metadata.scss': '$m: ();\n',
};

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('PackageEntrySet — exported non-module files are no entries', () => {
  it('leaves an asset-only package with an empty entry set', async () => {
    const root = makeRoot({ 'font-pack': '1.0.0' });
    const json = pkg(root, 'font-pack', FONT_JSON, FONT_FILES);
    const result = await PackageEntrySet.compute({
      name: 'font-pack',
      packageDir: join(root, 'node_modules', 'font-pack'),
      resolveDir: root,
      version: '1.0.0',
      pkg: json,
    });
    expect([...result.entries.keys()]).toEqual([]);
  });

  it('keeps a script package’s modules and drops the asset files it also exports', async () => {
    const root = makeRoot({ kit: '1.0.0' });
    const json = pkg(
      root,
      'kit',
      {
        type: 'module',
        exports: {
          '.': { types: './dist/index.d.ts', import: './dist/index.js' },
          './theme.css': './dist/theme.css',
          './LICENSE': './LICENSE',
          './package.json': './package.json',
        },
      },
      {
        'dist/index.js': 'export const kit = 1;\n',
        'dist/index.d.ts': 'export declare const kit: number;\n',
        'dist/theme.css': ':root{}\n',
        LICENSE: 'Copyright (c) 2026 Fixture\n',
      }
    );
    const result = await PackageEntrySet.compute({
      name: 'kit',
      packageDir: join(root, 'node_modules', 'kit'),
      resolveDir: root,
      version: '1.0.0',
      pkg: json,
    });
    expect([...result.entries.keys()].sort()).toEqual(['kit', 'kit/package.json']);
  });
});

describe('UnitProducer — an asset-only package handed over as shared', () => {
  it('fails naming the package, never feeding its licence to the chunk build', async () => {
    const root = makeRoot({ 'font-pack': '1.0.0' });
    pkg(root, 'font-pack', FONT_JSON, FONT_FILES);
    const orig = console.warn;
    console.warn = () => undefined;
    let message = '';
    try {
      await new UnitProducer({
        packageRoot: root,
        outputDir: join(root, 'out'),
        consumerSpecifiers: ['font-pack'],
      }).produce((m) => {
        throw new Error(m);
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    } finally {
      console.warn = orig;
    }
    expect(message).toContain('"font-pack" have no emitted list');
    expect(message).not.toContain('LICENSE');
  });
});
