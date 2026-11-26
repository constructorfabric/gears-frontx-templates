import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { SharedStylesheetImports } from '../SharedStylesheetImports';

/**
 * Scenario: a shared package is externalized and its units load its
 * stylesheet imports as empty modules, so the consuming build imports
 * the stylesheets the shared modules load itself — before the import of
 * the shared module, in the order evaluating its static graph loads
 * them, following bare edges into other packages, skipping side-effect
 * imports of modules declared side-effect free, CSS Modules (their class
 * map lives in the package's own JavaScript), queried stylesheets and
 * type-only imports, and never reading a package whose dependency
 * closure ships no stylesheet.
 */

const roots: string[] = [];

function write(root: string, rel: string, content: string): void {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), content);
}

function makeRoot(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'ssi-test-')));
  roots.push(root);
  write(root, 'package.json', JSON.stringify({ name: 'host', dependencies: { kit: '1.0.0', plain: '1.0.0' } }));
  write(root, 'src/local.js', 'export const local = 1;\n');
  write(
    root,
    'node_modules/kit/package.json',
    JSON.stringify({
      name: 'kit',
      version: '1.0.0',
      type: 'module',
      sideEffects: ['**/*.css', './dist/polyfill.js'],
      exports: { '.': './dist/index.js', './*': './dist/*.js' },
      dependencies: { icons: '1.0.0' },
    })
  );
  write(
    root,
    'node_modules/kit/dist/index.js',
    "export { Button } from './button.js';\nexport { Card } from './card.js';\n"
  );
  write(
    root,
    'node_modules/kit/dist/button.js',
    [
      "import './base.css';",
      "import { Icon } from 'icons';",
      "import './button.css';",
      "import './pure.js';",
      "import './polyfill.js';",
      "import styles from './button.module.css';",
      "import raw from './raw.css?inline';",
      "export const Button = () => [Icon, styles, raw];",
      '',
    ].join('\n')
  );
  write(root, 'node_modules/kit/dist/card.js', "import './base.css';\nimport './card.css';\nexport const Card = 1;\n");
  write(root, 'node_modules/kit/dist/pure.js', "import './pure.css';\nexport const pure = 1;\n");
  write(root, 'node_modules/kit/dist/polyfill.js', "import './polyfill.css';\nglobalThis.x = 1;\n");
  for (const css of ['base', 'button', 'card', 'pure', 'polyfill', 'raw', 'button.module']) {
    write(root, `node_modules/kit/dist/${css}.css`, `.${css.replace('.', '-')} {}\n`);
  }
  write(
    root,
    'node_modules/icons/package.json',
    JSON.stringify({ name: 'icons', version: '1.0.0', type: 'module', exports: { '.': './index.js' } })
  );
  write(root, 'node_modules/icons/index.js', "import './icons.css';\nexport const Icon = 'i';\n");
  write(root, 'node_modules/icons/icons.css', '.icons {}\n');
  // A package that ships no stylesheet and depends on none: never read.
  write(
    root,
    'node_modules/plain/package.json',
    JSON.stringify({ name: 'plain', version: '1.0.0', type: 'module', exports: { '.': './index.js' } })
  );
  write(root, 'node_modules/plain/index.js', 'this is not JavaScript at all {{{');
  return root;
}

const kit = (root: string, file: string): string => join(root, 'node_modules', 'kit', 'dist', file);

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('SharedStylesheetImports', () => {
  it('collects the stylesheets in load order, across packages, without CSS Modules, queries or side-effect-free modules', async () => {
    const root = makeRoot();
    const sheets = await new SharedStylesheetImports({ isShared: () => true }).stylesheetsOf(
      'kit/button',
      join(root, 'src')
    );
    expect(sheets).toEqual([
      kit(root, 'base.css'),
      join(root, 'node_modules', 'icons', 'icons.css'),
      kit(root, 'button.css'),
      kit(root, 'polyfill.css'),
    ]);
  });

  it('walks a whole barrel when the barrel itself is imported', async () => {
    const root = makeRoot();
    const sheets = await new SharedStylesheetImports({ isShared: () => true }).stylesheetsOf(
      'kit',
      join(root, 'src')
    );
    expect(sheets).toEqual([
      kit(root, 'base.css'),
      join(root, 'node_modules', 'icons', 'icons.css'),
      kit(root, 'button.css'),
      kit(root, 'polyfill.css'),
      kit(root, 'card.css'),
    ]);
  });

  it('inserts the stylesheets before each shared import, once per module, and leaves other imports alone', async () => {
    const root = makeRoot();
    const code = [
      "import './own.css';",
      "import { Button } from 'kit/button';",
      "import type { Card } from 'kit/card';",
      "import { Card as C } from 'kit/card';",
      "import { local } from './local.js';",
      "import { nothing } from 'plain';",
      "const lazy = () => import('kit/card');",
      '',
    ].join('\n');
    const result = await new SharedStylesheetImports({
      isShared: (s) => s.startsWith('kit') || s === 'plain',
    }).inject(code, join(root, 'src', 'main.ts'));
    expect(result?.code).toBe(
      [
        "import './own.css';",
        `import ${JSON.stringify(kit(root, 'base.css'))};`,
        `import ${JSON.stringify(join(root, 'node_modules', 'icons', 'icons.css'))};`,
        `import ${JSON.stringify(kit(root, 'button.css'))};`,
        `import ${JSON.stringify(kit(root, 'polyfill.css'))};`,
        "import { Button } from 'kit/button';",
        "import type { Card } from 'kit/card';",
        `import ${JSON.stringify(kit(root, 'card.css'))};`,
        "import { Card as C } from 'kit/card';",
        "import { local } from './local.js';",
        "import { nothing } from 'plain';",
        "const lazy = () => import('kit/card');",
        '',
      ].join('\n')
    );
  });

  it('puts the stylesheets of a literal dynamic import of a shared module at the top of the module', async () => {
    const root = makeRoot();
    const result = await new SharedStylesheetImports({ isShared: () => true }).inject(
      "export const lazy = () => import('kit/card');\n",
      join(root, 'src', 'main.js')
    );
    expect(result?.code).toBe(
      `import ${JSON.stringify(kit(root, 'base.css'))};\n` +
        `import ${JSON.stringify(kit(root, 'card.css'))};\n` +
        "export const lazy = () => import('kit/card');\n"
    );
  });

  it('answers null for unshared imports, virtual modules and modules with no shared import', async () => {
    const root = makeRoot();
    const imports = new SharedStylesheetImports({ isShared: () => false });
    expect(await imports.inject("import { Button } from 'kit/button';\n", join(root, 'src', 'a.js'))).toBeNull();
    const shared = new SharedStylesheetImports({ isShared: () => true });
    expect(await shared.inject("import { Button } from 'kit/button';\n", '\0virtual:a.js')).toBeNull();
    expect(await shared.inject("import x from './x.js';\n", join(root, 'src', 'a.js'))).toBeNull();
    expect(await shared.inject("import { nothing } from 'plain';\n", join(root, 'src', 'a.js'))).toBeNull();
  });
});
