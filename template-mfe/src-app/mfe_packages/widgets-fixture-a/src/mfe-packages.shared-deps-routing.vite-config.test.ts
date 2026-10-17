// @vitest-environment node
/**
 * Every MFE package lists `@gears-frontx/routing` in its `vite.config.ts`
 * `sharedDeps`, so each MFE runtime evaluates exactly one copy of it, never
 * shared across MFEs: the copy the MFE's registry receives through the
 * framework must be the copy `<ExtensionRouter>` and `navigation()` of
 * `@gears-frontx/routing-tanstack` read. Without the entry, the framework's
 * shared chunk and the routing-tanstack shared chunk each inline a copy of
 * their own.
 *
 * The check covers every package under `src-app/mfe_packages/`, discovered the
 * way the shell's scanners discover them (a directory with an `mfe.json`, not
 * starting with `.`, not `shared`), so a package without a test runner of its
 * own is covered too.
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

/** The string literals of `vite.config.ts`'s `const sharedDeps = [...]`, comments stripped. */
function readSharedDeps(packageDir: string): string[] {
  const viteConfigPath = path.join(packageDir, 'vite.config.ts');
  const source = fs.readFileSync(viteConfigPath, 'utf-8');
  const match = /const sharedDeps\s*=\s*\[([\s\S]*?)\];/.exec(source);
  if (!match) {
    throw new Error(`Could not find a "const sharedDeps = [...]" array in ${viteConfigPath}`);
  }
  const withoutComments = match[1]!
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
  return [...withoutComments.matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]!);
}

describe('MFE packages — @gears-frontx/routing is a shared dependency', () => {
  it('discovers the MFE packages, this one included', () => {
    const names = mfePackageDirs().map((dir) => path.basename(dir));
    expect(names).toContain(path.basename(PACKAGE_ROOT));
  });

  it('every MFE package lists @gears-frontx/routing in its sharedDeps', () => {
    const missing = mfePackageDirs()
      .filter((dir) => !readSharedDeps(dir).includes('@gears-frontx/routing'))
      .map((dir) => path.basename(dir));
    expect(missing).toEqual([]);
  });
});
