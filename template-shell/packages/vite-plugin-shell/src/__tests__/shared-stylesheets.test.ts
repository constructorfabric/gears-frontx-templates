/**
 * Shared-package stylesheets in the host build: a shared kit stays
 * shared (its modules are units, its stylesheet imports load as empty
 * modules there), and the stylesheets its used components import reach
 * the host's own CSS instead — in the order the host imports them, after
 * the stylesheets imported ahead of the kit and before those imported
 * after it, and only for the components the host uses. The host's own
 * kit components are styled in the host document that way, at the
 * host's kit version (upstream #65: the host styles its own kit
 * components; screens get theirs through their manifests).
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { build } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';

import { vitePluginShell } from '../index';

const roots: string[] = [];

function makeHost(mainSource: string): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'shell-shared-css-')));
  roots.push(root);
  const write = (rel: string, content: string): void => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content);
  };
  write(
    'package.json',
    JSON.stringify({ name: 'host', version: '0.0.0', type: 'module', dependencies: { kit: '1.0.0' } })
  );
  write(
    'node_modules/kit/package.json',
    JSON.stringify({
      name: 'kit',
      version: '1.0.0',
      type: 'module',
      sideEffects: ['**/*.css'],
      exports: { '.': './dist/index.js' },
    })
  );
  write(
    'node_modules/kit/dist/index.js',
    "export { Button } from './button.js';\nexport { Card } from './card.js';\n"
  );
  write(
    'node_modules/kit/dist/button.js',
    "import './button.css';\nexport const Button = () => 'kit-button';\n"
  );
  write('node_modules/kit/dist/button.css', '.kit-button { color: rgb(1, 1, 1); }\n');
  write('node_modules/kit/dist/card.js', "import './card.css';\nexport const Card = () => 'kit-card';\n");
  write('node_modules/kit/dist/card.css', '.kit-card { color: rgb(2, 2, 2); }\n');
  write('src/globals.css', '.host-globals { color: rgb(3, 3, 3); }\n');
  write('src/own.css', '.host-own { color: rgb(4, 4, 4); }\n');
  write(
    'index.html',
    '<!doctype html><html><head><title>h</title></head><body><script type="module" src="/src/main.js"></script></body></html>\n'
  );
  write('src/main.js', mainSource);
  return root;
}

async function buildHost(root: string): Promise<{ css: string; units: string[] }> {
  await build({
    root,
    logLevel: 'silent',
    plugins: [vitePluginShell()],
    build: { outDir: 'dist', emptyOutDir: true, minify: false },
  });
  const assets = path.join(root, 'dist', 'assets');
  const css = fs
    .readdirSync(assets)
    .filter((f) => f.endsWith('.css'))
    .map((f) => fs.readFileSync(path.join(assets, f), 'utf-8'))
    .join('\n');
  const sharedKit = path.join(root, 'dist', 'shared', 'kit@1.0.0');
  const units = fs.existsSync(sharedKit) ? fs.readdirSync(sharedKit).filter((f) => f.endsWith('.js')) : [];
  return { css, units };
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('vitePluginShell shared-package stylesheets', () => {
  it("puts the used kit component's stylesheet in the host CSS, in import order, and keeps the kit shared", async () => {
    const root = makeHost(
      "import './globals.css';\nimport { Button } from 'kit';\nimport './own.css';\n" +
        'document.body.className = Button();\n'
    );
    const { css, units } = await buildHost(root);
    expect(css).toContain('.kit-button');
    expect(css).not.toContain('.kit-card');
    const at = (marker: string): number => css.indexOf(marker);
    expect(at('.host-globals')).toBeLessThan(at('.kit-button'));
    expect(at('.kit-button')).toBeLessThan(at('.host-own'));
    // The kit itself is still delivered as shared units.
    expect(units.length).toBeGreaterThan(0);
  }, 120_000);

  it('adds no kit stylesheet for a kit import erased as type-only', async () => {
    const root = makeHost(
      "import './globals.css';\nimport { Button } from 'kit';\nimport type { Card } from 'kit';\n" +
        'document.body.className = Button();\n'
    );
    // The type-only statement is a TypeScript form: build it from a .ts entry.
    fs.renameSync(path.join(root, 'src', 'main.js'), path.join(root, 'src', 'main.ts'));
    fs.writeFileSync(
      path.join(root, 'index.html'),
      '<!doctype html><html><head><title>h</title></head><body><script type="module" src="/src/main.ts"></script></body></html>\n'
    );
    const { css } = await buildHost(root);
    expect(css).toContain('.kit-button');
    expect(css).not.toContain('.kit-card');
  }, 120_000);
});
