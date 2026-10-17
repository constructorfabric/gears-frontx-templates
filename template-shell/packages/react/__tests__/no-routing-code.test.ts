/**
 * `@gears-frontx/react` carries no routing code. An MFE with routes renders
 * `<ExtensionRouter routeTree={routeTree} />` from
 * `@gears-frontx/routing-tanstack`; starting and stopping a routed domain is
 * the registry's own concern once its root attaches. So this package holds no
 * extension router, its domain slot reaches no framework-internal subpath and
 * starts or stops nothing routed, and it depends on no
 * `@gears-frontx/routing-tanstack`.
 *
 * @vitest-environment node
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = path.join(packageRoot, 'src');
const slotFile = path.join(srcRoot, 'mfe', 'components', 'ExtensionDomainSlot.tsx');

const ROUTING_SPECIFIERS = ['@gears-frontx/routing', '@gears-frontx/routing-tanstack', '@gears-frontx/framework/internal'];

interface PackageJson {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, unknown>;
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

function isRoutingSpecifier(specifier: string): boolean {
  return ROUTING_SPECIFIERS.some((routing) => specifier === routing || specifier.startsWith(`${routing}/`));
}

describe('@gears-frontx/react — no routing code', () => {
  it('holds no extension router of its own', () => {
    expect(existsSync(path.join(srcRoot, 'mfe', 'components', 'ExtensionRouter.tsx'))).toBe(false);
  });

  it('keeps no guard for a router handle or a framework-internal subpath that do not exist', () => {
    expect(existsSync(path.join(packageRoot, '__tests__', 'no-raw-url-write.test.ts'))).toBe(false);
  });

  it('carries no @gears-frontx/routing-tanstack dependency, peer dependency or peer metadata', () => {
    const pkg = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as PackageJson;
    expect(Object.keys(pkg.dependencies ?? {})).not.toContain('@gears-frontx/routing-tanstack');
    expect(Object.keys(pkg.peerDependencies ?? {})).not.toContain('@gears-frontx/routing-tanstack');
    expect(Object.keys(pkg.peerDependenciesMeta ?? {})).not.toContain('@gears-frontx/routing-tanstack');
  });

  it('no source file imports routing, routing-tanstack or the framework-internal subpath', () => {
    const files = sourceFilesUnder(srcRoot);
    expect(files).toContain(slotFile);

    const importers = files
      .filter((file) => importedSpecifiers(readFileSync(file, 'utf8')).some(isRoutingSpecifier))
      .map((file) => path.relative(packageRoot, file));
    expect(importers).toEqual([]);
  });

  it('the domain slot starts and stops no routed domain', () => {
    const slot = readFileSync(slotFile, 'utf8');
    expect(importedSpecifiers(slot)).not.toContain('@gears-frontx/framework/internal');
    expect(slot).not.toMatch(/\b(?:startRoutedDomain|stopRoutedDomain)\s*\(/);
  });
});
