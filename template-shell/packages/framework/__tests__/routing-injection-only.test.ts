/**
 * The framework's only routing code is the router injection in the
 * microfrontends plugin: `import { router } from '@gears-frontx/routing'` and
 * `mfeRegistryFactory.build({ typeSystem, mfeHandlers, router })`. The
 * framework holds no router of its own, publishes no router handle on the
 * app, has no framework-internal subpath, and depends on no
 * `@gears-frontx/routing-tanstack`.
 *
 * @vitest-environment node
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { FrontXApp, FrontXAppRuntimeExtensions } from '../src/types';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = path.join(packageRoot, 'src');
const pluginIndex = path.join(srcRoot, 'plugins', 'microfrontends', 'index.ts');

interface PackageJson {
  exports?: Record<string, unknown>;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, unknown>;
}

function readPackageJson(): PackageJson {
  return JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as PackageJson;
}

function sourceFilesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const full = path.join(directory, name);
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : sourceFilesUnder(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

/** Module specifiers a source file imports, re-exports, dynamically imports or type-imports. */
function importedSpecifiers(source: string): string[] {
  return [...source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"]+)\1/g)].map((match) => match[2]!);
}

function relative(file: string): string {
  return path.relative(packageRoot, file);
}

describe('@gears-frontx/framework — the router injection is its only routing code', () => {
  it('holds no router of its own', () => {
    expect(existsSync(path.join(srcRoot, 'plugins', 'microfrontends', 'router.ts'))).toBe(false);
    expect(existsSync(path.join(srcRoot, 'plugins', 'microfrontends', '__tests__', 'router.test.ts'))).toBe(false);
  });

  it('has no framework-internal subpath: no internal entry, no ./internal export, no internal build entry', () => {
    expect(existsSync(path.join(srcRoot, 'internal.ts'))).toBe(false);
    expect(Object.keys(readPackageJson().exports ?? {})).not.toContain('./internal');
    expect(readFileSync(path.join(packageRoot, 'tsup.config.ts'), 'utf8')).not.toMatch(/['"]?internal['"]?\s*:\s*['"]src\/internal\.ts['"]/);
  });

  it('carries no @gears-frontx/routing-tanstack dependency, peer dependency or peer metadata', () => {
    const pkg = readPackageJson();
    expect(Object.keys(pkg.dependencies ?? {})).not.toContain('@gears-frontx/routing-tanstack');
    expect(Object.keys(pkg.peerDependencies ?? {})).not.toContain('@gears-frontx/routing-tanstack');
    expect(Object.keys(pkg.peerDependenciesMeta ?? {})).not.toContain('@gears-frontx/routing-tanstack');
  });

  it('no source file imports @gears-frontx/routing-tanstack', () => {
    const importers = sourceFilesUnder(srcRoot)
      .filter((file) =>
        importedSpecifiers(readFileSync(file, 'utf8')).some(
          (specifier) => specifier === '@gears-frontx/routing-tanstack' || specifier.startsWith('@gears-frontx/routing-tanstack/'),
        ),
      )
      .map(relative);
    expect(importers).toEqual([]);
  });

  it('only the microfrontends plugin imports @gears-frontx/routing, and only its `router`', () => {
    const files = sourceFilesUnder(srcRoot);
    expect(files).toContain(pluginIndex);

    const importers = files
      .filter((file) => importedSpecifiers(readFileSync(file, 'utf8')).includes('@gears-frontx/routing'))
      .map(relative);
    expect(importers).toEqual([relative(pluginIndex)]);

    const routingImports = [
      ...readFileSync(pluginIndex, 'utf8').matchAll(/\bimport\s+(type\s+)?\{([^}]*)\}\s*from\s*['"]@gears-frontx\/routing['"]/g),
    ].map((match) => `${match[1] ?? ''}{${match[2]!.split(',').map((name) => name.trim()).filter(Boolean).join(', ')}}`);
    expect(routingImports).toEqual(['{router}']);
  });

  it('publishes no router handle: the FrontXApp type has no mfeRouter and no source names MfeRouterHandle', () => {
    expectTypeOf<FrontXApp>().not.toHaveProperty('mfeRouter');
    expectTypeOf<FrontXAppRuntimeExtensions>().not.toHaveProperty('mfeRouter');

    expect(readFileSync(path.join(srcRoot, 'types.ts'), 'utf8')).not.toMatch(/\bmfeRouter\s*\??\s*:/);
    const namers = sourceFilesUnder(srcRoot)
      .filter((file) => /\bMfeRouterHandle\b/.test(readFileSync(file, 'utf8')))
      .map(relative);
    expect(namers).toEqual([]);
  });
});
