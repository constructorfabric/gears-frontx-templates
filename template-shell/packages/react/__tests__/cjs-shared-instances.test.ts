// @vitest-environment node
/**
 * The CommonJS build keeps one instance of the package's React context,
 * provider and query client across its entries: `dist/mfe.cjs` renders the
 * provider `useFrontX()` from `dist/index.cjs` reads, so neither entry may
 * carry a copy of its own. The ESM build shares modules by construction.
 */

import * as fs from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build as tsupBuild, type Options } from 'tsup';

const PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('@gears-frontx/react CommonJS build', () => {
  let outDir: string;

  // The CJS output is built from the package's own tsup config into a
  // temporary directory, so the test never reads a prebuilt `dist/`.
  beforeAll(async () => {
    outDir = mkdtempSync(path.join(tmpdir(), 'react-cjs-'));
    const configModule = (await import(path.join(PACKAGE_DIR, 'tsup.config.ts'))) as {
      default: Options[] | ((overrides: Options) => Options[] | Promise<Options[]>);
    };
    const configs =
      typeof configModule.default === 'function'
        ? await configModule.default({ clean: false })
        : configModule.default;
    const cjs = configs.find((c) => (Array.isArray(c.format) ? c.format.includes('cjs') : c.format === 'cjs'));
    expect(cjs, 'the config declares a CJS build').toBeDefined();
    await tsupBuild({ ...cjs!, config: false, dts: false, sourcemap: false, outDir, silent: true, clean: false });
  }, 120_000);

  afterAll(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  it('creates its React contexts in a chunk the entries share, never inside an entry', () => {
    const cjs = (file: string): string => fs.readFileSync(path.join(outDir, file), 'utf-8');
    for (const entry of ['index.cjs', 'mfe.cjs']) {
      expect(cjs(entry), entry).not.toMatch(/\bcreateContext\b/);
    }
    const creators = fs
      .readdirSync(outDir)
      .filter((f) => f.endsWith('.cjs') && /\bcreateContext\b/.test(cjs(f)));
    expect(creators.length).toBeGreaterThan(0);
    for (const entry of ['index.cjs', 'mfe.cjs']) {
      for (const chunk of creators) {
        expect(cjs(entry)).toContain(`require('./${chunk}')`);
      }
    }
  });
});
