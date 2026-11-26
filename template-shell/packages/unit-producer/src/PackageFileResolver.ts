/**
 * `PackageFileResolver` — resolves a specifier written in `importerDir`
 * to an absolute file path inside `packageDir`, trying the usual
 * extension and index-file forms. Returns `undefined` for bare specifiers
 * and paths outside the package.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export class PackageFileResolver {
  private static readonly EXTENSIONS = [
    '.js',
    '.mjs',
    '.cjs',
    '.ts',
    '.tsx',
    '.jsx',
    '.mts',
    '.cts',
  ];

  private static readonly INDEX_FILES = [
    'index.js',
    'index.mjs',
    'index.cjs',
    'index.ts',
    'index.tsx',
    'index.jsx',
  ];

  static resolve(
    specifier: string,
    importerDir: string,
    packageDir: string
  ): string | undefined {
    let base: string;
    if (specifier.startsWith('.')) {
      base = path.resolve(importerDir, specifier);
    } else if (path.isAbsolute(specifier)) {
      base = specifier;
    } else {
      return undefined;
    }
    const candidates = [
      base,
      ...PackageFileResolver.EXTENSIONS.map((e) => base + e),
      ...PackageFileResolver.INDEX_FILES.map((f) => path.join(base, f)),
    ];
    for (const candidate of candidates) {
      if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) {
        continue;
      }
      const abs = path.resolve(candidate);
      const rel = path.relative(packageDir, abs);
      if (rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)) {
        return abs;
      }
      return undefined;
    }
    return undefined;
  }
}
