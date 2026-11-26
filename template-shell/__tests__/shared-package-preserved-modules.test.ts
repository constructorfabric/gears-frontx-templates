/**
 * Tests for the preserved-module ESM output of the shared sub-packages
 * (`framework`, `react`, `state`, `i18n`, `auth`) —
 * `ecosystem_package_build_output`: one ESM output file per source module,
 * internal imports kept as relative module imports, so the unit producer's
 * entry-point chunking can split the package. Public entry points and `exports`
 * maps are unchanged; CJS output stays bundled.
 *
 * The plugin is exercised on a fixture tree; each package's real ESM
 * config is then built into a temporary directory (no declarations, so the
 * suite stays fast) and its output checked module by module.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as esbuild from 'esbuild';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as tsupBuild, type Options } from 'tsup';

import { PreservedModulesEsbuildPlugin } from '../scripts/lib/PreservedModulesEsbuildPlugin';
import { SharedPackageTsupConfig } from '../scripts/lib/SharedPackageTsupConfig';

const SHELL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES = ['framework', 'react', 'state', 'i18n', 'auth'] as const;

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) out.push(...listFiles(abs));
    else out.push(abs);
  }
  return out;
}

function toPosix(p: string): string {
  return p.split(sep).join('/');
}

/** Static and re-export specifiers of an emitted ESM file. */
function specifiersOf(code: string): string[] {
  const specs: string[] = [];
  const re = /(?:^|[\s;}])(?:import|export)\s*(?:[^'";]*?\s*from\s*)?(['"])([^'"]+)\1/g;
  for (let m = re.exec(code); m !== null; m = re.exec(code)) specs.push(m[2]);
  return specs;
}

function isSourceModule(rel: string): boolean {
  return (
    /\.(ts|tsx)$/.test(rel) &&
    !/\.d\.ts$/.test(rel) &&
    !/\.test\.tsx?$/.test(rel) &&
    !rel.split('/').includes('__tests__')
  );
}

describe('PreservedModulesEsbuildPlugin', () => {
  let fixture: string;

  beforeAll(() => {
    fixture = mkdtempSync(join(tmpdir(), 'preserved-modules-'));
    const src = join(fixture, 'src');
    mkdirSync(join(src, 'nested'), { recursive: true });
    writeFileSync(
      join(src, 'index.ts'),
      [
        "export { a } from './a';",
        "export { b } from './nested';",
        "export { value } from './data';",
        "export { helper } from 'some-bare-package';",
        "export { sub } from 'some-bare-package/sub';",
      ].join('\n')
    );
    writeFileSync(join(src, 'a.ts'), "import { b } from './nested/b';\nexport const a = () => b;\n");
    writeFileSync(join(src, 'nested', 'index.ts'), "export { b } from './b';\n");
    writeFileSync(join(src, 'nested', 'b.tsx'), 'export const b = 1;\n');
    writeFileSync(join(src, 'data.ts'), "import json from './data.json';\nexport const value = json.v;\n");
    writeFileSync(join(src, 'data.json'), '{ "v": 42 }\n');
  });

  afterAll(() => {
    rmSync(fixture, { recursive: true, force: true });
  });

  it('emits one file per source module with relative .js imports, inlines JSON, keeps bare imports external', async () => {
    const outdir = join(fixture, 'dist');
    const srcDir = join(fixture, 'src');
    await esbuild.build({
      entryPoints: ['index.ts', 'a.ts', 'nested/index.ts', 'nested/b.tsx', 'data.ts'].map((f) => join(srcDir, f)),
      outbase: srcDir,
      outdir,
      bundle: true,
      format: 'esm',
      logLevel: 'silent',
      plugins: [new PreservedModulesEsbuildPlugin({ sourceDir: srcDir }).toEsbuildPlugin()],
    });

    const emitted = listFiles(outdir).map((f) => toPosix(relative(outdir, f))).sort();
    expect(emitted).toEqual(['a.js', 'data.js', 'index.js', 'nested/b.js', 'nested/index.js']);

    const index = readFileSync(join(outdir, 'index.js'), 'utf-8');
    expect(specifiersOf(index).sort()).toEqual(
      ['./a.js', './data.js', './nested/index.js', 'some-bare-package', 'some-bare-package/sub'].sort()
    );
    expect(specifiersOf(readFileSync(join(outdir, 'a.js'), 'utf-8'))).toEqual(['./nested/b.js']);
    expect(specifiersOf(readFileSync(join(outdir, 'nested/index.js'), 'utf-8'))).toEqual(['./b.js']);
    const data = readFileSync(join(outdir, 'data.js'), 'utf-8');
    expect(specifiersOf(data)).toEqual([]);
    expect(data).toContain('42');
  });

  it('maps a source path to its emitted relative specifier', () => {
    expect(PreservedModulesEsbuildPlugin.outputSpecifier('/p/src/a.ts', '/p/src/nested/b.tsx')).toBe('./nested/b.js');
    expect(PreservedModulesEsbuildPlugin.outputSpecifier('/p/src/x/y.ts', '/p/src/z.ts')).toBe('../z.js');
  });
});

describe.each(PACKAGES)('@gears-frontx/%s ESM build output', (pkgName) => {
  const packageDir = join(SHELL_DIR, 'packages', pkgName);
  let outDir: string;

  beforeAll(async () => {
    outDir = mkdtempSync(join(tmpdir(), `preserved-${pkgName}-`));
    {
      const configModule = (await import(join(packageDir, 'tsup.config.ts'))) as {
        default: Options[] | ((overrides: Options) => Options[] | Promise<Options[]>);
      };
      const configs =
        typeof configModule.default === 'function'
          ? await configModule.default({ clean: false })
          : configModule.default;
      const esm = configs.find((c) => Array.isArray(c.format) ? c.format.includes('esm') && c.format.length === 1 : c.format === 'esm');
      expect(esm, 'the config declares an ESM-only build').toBeDefined();
      await tsupBuild({ ...esm!, config: false, dts: false, sourcemap: false, outDir, silent: true, clean: false });
    }
  }, 120_000);

  afterAll(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  it('emits one ESM file per source module and no shared chunks', () => {
    const srcDir = join(packageDir, 'src');
    const expected = listFiles(srcDir)
      .map((f) => toPosix(relative(srcDir, f)))
      .filter(isSourceModule)
      .map((rel) => rel.replace(/\.tsx?$/, '.js'))
      .sort();
    const emitted = listFiles(outDir)
      .map((f) => toPosix(relative(outDir, f)))
      .filter((f) => f.endsWith('.js'))
      .sort();
    expect(emitted).toEqual(expected);
    expect(emitted.some((f) => /^chunk-/.test(posix.basename(f)))).toBe(false);
  });

  it('keeps every internal import a relative module import that resolves to an emitted file', () => {
    for (const file of listFiles(outDir).filter((f) => f.endsWith('.js'))) {
      for (const spec of specifiersOf(readFileSync(file, 'utf-8'))) {
        if (!spec.startsWith('.')) continue;
        expect(spec, `${relative(outDir, file)} imports ${spec}`).toMatch(/\.js$/);
        expect(existsSync(resolve(dirname(file), spec)), `${relative(outDir, file)} -> ${spec}`).toBe(true);
      }
    }
  });

  it('emits every public entry point the exports map names', () => {
    const pkg = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf-8')) as {
      exports: Record<string, { import: string }>;
    };
    for (const entry of Object.values(pkg.exports)) {
      const rel = entry.import.replace(/^\.\/dist\//, '');
      expect(existsSync(join(outDir, rel)), entry.import).toBe(true);
    }
  });
});

describe('SharedPackageTsupConfig', () => {
  it('keeps CJS bundled per public entry and ESM preserved per module, with declarations for the public entries', () => {
    const configs = new SharedPackageTsupConfig({
      entry: { index: 'src/index.ts', types: 'src/types.ts' },
      external: ['react'],
      cleanOutDir: false,
      packageDir: '/pkg',
    }).create();
    const entry = { index: join('/pkg', 'src/index.ts'), types: join('/pkg', 'src/types.ts') };
    const esm = configs.find((c) => c.format === 'esm' || (Array.isArray(c.format) && c.format[0] === 'esm'))!;
    const cjs = configs.find((c) => c.format === 'cjs' || (Array.isArray(c.format) && c.format[0] === 'cjs'))!;
    expect(esm.entry).toEqual(SharedPackageTsupConfig.SOURCE_GLOBS.map((g) => (g.startsWith('!') ? `!/pkg/${g.slice(1)}` : `/pkg/${g}`)));
    expect(esm.dts).toEqual({ entry });
    expect(esm.outDir).toBe(join('/pkg', 'dist'));
    expect(esm.esbuildPlugins?.map((p) => p.name)).toContain(PreservedModulesEsbuildPlugin.NAME);
    expect(cjs.entry).toEqual(entry);
    expect(cjs.external).toEqual(['react']);
    expect(cjs.esbuildPlugins ?? []).toEqual([]);
    expect(configs.every((c) => c.clean === false)).toBe(true);
  });
});
