// @vitest-environment node
/**
 * Pins the shared-dependency mechanism in this package's `vite.config.ts`.
 *
 * Since `@gears-frontx/vite-plugin-mfe-gts` derives the shared set from the
 * package's own declared dependencies (the shared set over the build graph), a scaffold config
 * declares no externals or shared list at all: a curated `sharedDeps` array
 * or `rollupOptions.external` list would silently fight the plugin's
 * resolution. The check is static (no real build): the config must call
 * `vitePluginMfeGts(...)` and must not declare a shared/externals list.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const PACKAGE_ROOT = path.resolve(__dirname, '..');

function readViteConfig(): string {
  return fs.readFileSync(path.join(PACKAGE_ROOT, 'vite.config.ts'), 'utf-8');
}

describe('widgets-fixture-b vite.config.ts shared-dep mechanism', () => {
  it('builds shared deps through vitePluginMfeGts()', () => {
    const source = readViteConfig();
    expect(source).toContain("import { vitePluginMfeGts } from '@gears-frontx/vite-plugin-mfe-gts'");
    expect(source).toMatch(/\bvitePluginMfeGts\(/);
  });

  it('declares no sharedDeps array', () => {
    expect(readViteConfig()).not.toMatch(/\bconst sharedDeps\b/);
  });

  it('declares no externals/shared list of its own', () => {
    const source = readViteConfig();
    // No Rollup externals list: the plugin merges the resolved shared set
    // into rollupOptions.external itself.
    expect(source).not.toMatch(/\bexternal\s*:/);
    // No non-empty federation `shared` list: `shared: {}` (or absence) is the
    // only accepted shape — MF 2.0's own sharing is bypassed.
    const sharedMatch = /\bshared\s*:\s*([\s\S]*?)\n?\s*,/m.exec(source);
    if (sharedMatch) {
      expect(sharedMatch[1]!.trim()).toBe('{}');
    }
  });
});
