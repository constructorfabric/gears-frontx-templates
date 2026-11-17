// @vitest-environment node
/**
 * An MFE has no standalone preview: it is tested inside a shell, for
 * instance the template shell via `npm run dev:all`. Its `preview` script
 * only serves the built remote for a shell to load, and its `index.html`
 * loads none of the MFE's code. So no package has a standalone script, and
 * opening a package's own page mounts nothing.
 *
 * The check covers every package under `src-app/mfe_packages/`, discovered the
 * way the shell's scanners discover them (a directory with an `mfe.json`, not
 * starting with `.`, not `shared`).
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const PACKAGE_ROOT = path.resolve(__dirname, '..');
const MFE_PACKAGES_ROOT = path.dirname(PACKAGE_ROOT);

function mfePackageDirs(): string[] {
  return fs
    .readdirSync(MFE_PACKAGES_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'shared')
    .map((entry) => path.join(MFE_PACKAGES_ROOT, entry.name))
    .filter((dir) => fs.existsSync(path.join(dir, 'mfe.json')));
}

function scriptsOf(packageDir: string): Record<string, string> {
  const pkg = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf-8')) as {
    scripts?: Record<string, string>;
  };
  return pkg.scripts ?? {};
}

/** Every `<script ...>` opening tag of the package's own `index.html` that loads code from a file or as a module. */
function codeLoadingScripts(packageDir: string): string[] {
  const htmlPath = path.join(packageDir, 'index.html');
  if (!fs.existsSync(htmlPath)) return [];
  const html = fs.readFileSync(htmlPath, 'utf-8');
  return [...html.matchAll(/<script\b[^>]*>/gi)]
    .map((m) => m[0])
    .filter((tag) => /\bsrc\s*=/i.test(tag) || /\btype\s*=\s*['"]?module\b/i.test(tag));
}

describe('MFE packages — no standalone preview', () => {
  it('discovers the MFE packages, this one included', () => {
    const names = mfePackageDirs().map((dir) => path.basename(dir));
    expect(names).toContain(path.basename(PACKAGE_ROOT));
  });

  it('no MFE package has a standalone script', () => {
    const standalone = mfePackageDirs().flatMap((dir) =>
      Object.entries(scriptsOf(dir))
        .filter(([name, command]) => /standalone/i.test(name) || /standalone/i.test(command))
        .map(([name]) => `${path.basename(dir)}: ${name}`),
    );
    expect(standalone).toEqual([]);
  });

  it("no MFE package's own index.html loads the MFE's code", () => {
    const loaders = mfePackageDirs().flatMap((dir) =>
      codeLoadingScripts(dir).map((tag) => `${path.basename(dir)}: ${tag}`),
    );
    expect(loaders).toEqual([]);
  });
});
