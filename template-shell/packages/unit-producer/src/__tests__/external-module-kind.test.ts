import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { ExternalModuleKind } from '../ExternalModuleKind';

/**
 * Regression: a `.js` file with no statements (comments
 * alone, an empty file, or a freshly-touched placeholder) is the
 * ambiguous case the bundler resolves by syntax — the prior
 * classifier returned `false` (CommonJS) for it, which made
 * `@rollup/plugin-commonjs` apply its default-import interop to an
 * empty ESM entry and broke named imports the file does not declare.
 * The fix treats a statement-less `.js` as ESM unless the package
 * `type` or the file's own CJS syntax says otherwise — the bundler's
 * own default for a parseable but empty file.
 */
const roots: string[] = [];

function tmpRoot(label: string): string {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), `unit-producer-emk-${label}-`))
  );
  roots.push(root);
  return root;
}

function pkg(
  root: string,
  name: string,
  json: object,
  files: Record<string, string>
): string {
  const dir = join(root, 'node_modules', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0', ...json }));
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(join(dir, rel.split('/').slice(0, -1).join('/')) ?? dir, { recursive: true });
    writeFileSync(join(dir, rel), content);
  }
  return dir;
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('ExternalModuleKind — statement-less .js defaults to ESM (R11)', () => {
  it('a statement-less .js in a package without `type` is ESM', () => {
    const root = tmpRoot('empty-js');
    pkg(root, 'empty-js', { main: './index.js' }, {
      'index.js': '// just a comment, nothing else\n',
    });
    const kind = new ExternalModuleKind(root);
    expect(kind.isEsm('empty-js')).toBe(true);
  });

  it('a .js with ESM syntax is ESM even without `type: "module"`', () => {
    const root = tmpRoot('esm-syntax');
    pkg(root, 'esm-syntax', { main: './index.js' }, {
      'index.js': 'export const x = 1;\n',
    });
    const kind = new ExternalModuleKind(root);
    expect(kind.isEsm('esm-syntax')).toBe(true);
  });

  it('a .js with CJS `require()` is CommonJS even without `type: "commonjs"`', () => {
    const root = tmpRoot('cjs-require');
    pkg(root, 'cjs-require', { main: './index.js' }, {
      'index.js': 'const x = require("./other");\nmodule.exports = x;\n',
    });
    const kind = new ExternalModuleKind(root);
    expect(kind.isEsm('cjs-require')).toBe(false);
  });

  it('a .js in a `type: "commonjs"` package is CommonJS even when empty', () => {
    const root = tmpRoot('cjs-type');
    pkg(root, 'cjs-type', { type: 'commonjs', main: './index.js' }, {
      'index.js': '// empty\n',
    });
    const kind = new ExternalModuleKind(root);
    expect(kind.isEsm('cjs-type')).toBe(false);
  });

  it('a .cjs entry is CommonJS regardless of contents', () => {
    const root = tmpRoot('cjs-ext');
    pkg(root, 'cjs-ext', { main: './index.cjs' }, {
      'index.cjs': '// empty .cjs\n',
    });
    const kind = new ExternalModuleKind(root);
    expect(kind.isEsm('cjs-ext')).toBe(false);
  });

  it('an .mjs entry is ESM regardless of contents', () => {
    const root = tmpRoot('mjs-ext');
    pkg(root, 'mjs-ext', { main: './index.mjs' }, {
      'index.mjs': '// empty .mjs\n',
    });
    const kind = new ExternalModuleKind(root);
    expect(kind.isEsm('mjs-ext')).toBe(true);
  });
});
