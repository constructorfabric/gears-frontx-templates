// @vitest-environment node
/**
 * Every MFE package builds its shared dependencies through
 * `@gears-frontx/vite-plugin-mfe-gts` — the plugin resolves the shared set
 * over the build graph from each package's declared dependencies, so each MFE
 * runtime evaluates exactly one copy of `@gears-frontx/routing` (and of every
 * other shared package), never a second copy inlined next to the host's.
 * A scaffold config therefore declares no sharedDeps or externals list of its
 * own: a curated list would silently fight the plugin's resolution.
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

function readViteConfig(packageDir: string): string {
  return fs.readFileSync(path.join(packageDir, 'vite.config.ts'), 'utf-8');
}

describe('MFE packages — shared deps through vite-plugin-mfe-gts', () => {
  it('discovers the MFE packages, this one included', () => {
    const names = mfePackageDirs().map((dir) => path.basename(dir));
    expect(names).toContain(path.basename(PACKAGE_ROOT));
  });

  it('every MFE package calls vitePluginMfeGts() in its vite.config.ts', () => {
    const missing = mfePackageDirs()
      .filter((dir) => !/\bvitePluginMfeGts\(/.test(readViteConfig(dir)))
      .map((dir) => path.basename(dir));
    expect(missing).toEqual([]);
  });

  it('no MFE package declares a sharedDeps array or externals list of its own', () => {
    const offenders = mfePackageDirs().flatMap((dir) => {
      const source = readViteConfig(dir);
      const name = path.basename(dir);
      const problems: string[] = [];
      if (/\bconst sharedDeps\b/.test(source)) problems.push(`${name}: sharedDeps array`);
      if (/\bexternal\s*:/.test(source)) problems.push(`${name}: external option`);
      const sharedMatch = /\bshared\s*:\s*([\s\S]*?)\n?\s*,/m.exec(source);
      if (sharedMatch && sharedMatch[1]!.trim() !== '{}') {
        problems.push(`${name}: non-empty federation shared list`);
      }
      return problems;
    });
    expect(offenders).toEqual([]);
  });
});
