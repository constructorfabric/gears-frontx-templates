// @vitest-environment node
/**
 * Regression guard for the duplicate-module-instance class of bug that broke
 * `useSearch()` under `<ExtensionRouter>` (widget-a/widget-beta both hit
 * `TypeError: Cannot read properties of null (reading 'stores')`).
 *
 * Root cause: this package's own Vite build (`vite.config.ts`'s `sharedDeps`
 * / `rollupOptions.external`) only externalizes the packages literally
 * listed there — everything else this package imports is bundled inline by
 * Rollup, and everything `@gears-frontx/react`'s own shared chunk imports
 * that is NOT in that same list is bundled inline by esbuild
 * (`StandaloneEsmBuilder`, `frontx-mf-gts`). `@gears-frontx/routing-tanstack`
 * was omitted, so two independent bundlers each minted their own copy of
 * `@tanstack/react-router` — one inside this package's own chunk (which
 * calls `useSearch`), one inside `@gears-frontx/react`'s shared chunk (which
 * builds the router `<ExtensionRouter>` renders) — so the hook's context
 * lookup missed the router instance that actually mounted.
 *
 * This guard is static (no real build), so it cannot see esbuild's own
 * inlining decision directly. It instead checks the precondition that makes
 * that inlining safe: any package this MFE imports directly that is ALSO a
 * dependency of an already-shared package must itself be declared shared —
 * otherwise the two bundlers' independent resolutions are free to diverge.
 */
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';

const PACKAGE_ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(PACKAGE_ROOT, 'src');
const nodeRequire = createRequire(path.join(PACKAGE_ROOT, 'package.json'));

function readSharedDeps(): string[] {
  const viteConfigPath = path.join(PACKAGE_ROOT, 'vite.config.ts');
  const source = fs.readFileSync(viteConfigPath, 'utf-8');
  const match = /const sharedDeps\s*=\s*\[([\s\S]*?)\];/.exec(source);
  if (!match) {
    throw new Error(`Could not find a "const sharedDeps = [...]" array in ${viteConfigPath}`);
  }
  // Strip `//` line comments first — an apostrophe inside a comment (e.g.
  // "this MFE imports routing-tanstack hooks") would otherwise be
  // misread as a quote delimiter by the string-literal match below.
  const withoutComments = match[1]
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
  return [...withoutComments.matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
}

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.test.tsx') && !entry.name.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

const BARE_SPECIFIER_IMPORT = /\bfrom\s+['"]([^'".][^'"]*)['"]/g;

function directBareImports(files: string[]): Set<string> {
  const specifiers = new Set<string>();
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf-8');
    for (const m of source.matchAll(BARE_SPECIFIER_IMPORT)) {
      specifiers.add(m[1]);
    }
  }
  return specifiers;
}

/**
 * Locates a package's `package.json` across npm/pnpm/yarn-pnp layouts.
 * Mirrors `resolvePackageJsonPath` in `frontx-mf-gts`'s own build
 * (`template-shell/src/build/mf-gts.ts`): `require.resolve` first, falling
 * back to a manual `node_modules` walk when a package's `exports` field
 * blocks subpath access to `package.json` (as `@gears-frontx/react`'s does).
 */
function resolvePackageJsonPath(name: string): string {
  try {
    return nodeRequire.resolve(`${name}/package.json`);
  } catch {
    // Fall through — some packages' `exports` block subpath access.
  }
  let current = PACKAGE_ROOT;
  for (;;) {
    const candidate = path.join(current, 'node_modules', name, 'package.json');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(`Cannot resolve package.json for "${name}" from ${PACKAGE_ROOT}`);
    }
    current = parent;
  }
}

/** Package names this `name` depends on, per its own package.json (dependencies + peerDependencies). */
function dependenciesOf(name: string): string[] {
  const pkgJsonPath = resolvePackageJsonPath(name);
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8')) as {
    dependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };
  return Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies });
}

describe('widgets-fixture-a shared-dep declaration', () => {
  it('declares every directly-imported package that a shared dep also depends on', () => {
    const sharedDeps = readSharedDeps();
    const sharedDepSet = new Set(sharedDeps);

    // What this package's own source directly imports, outside sharedDeps.
    const directImports = [...directBareImports(listSourceFiles(SRC_DIR))].filter(
      (specifier) => !sharedDepSet.has(specifier),
    );

    // What every ALREADY-shared package transitively depends on — those
    // dependencies get bundled into that shared package's own standalone
    // chunk unless they are themselves declared shared (StandaloneEsmBuilder
    // externalizes a dep's import only when it is also in `sharedDeps`).
    const sharedTransitiveDeps = new Set(sharedDeps.flatMap(dependenciesOf));

    const undeclaredDuplicateRisks = directImports.filter((specifier) =>
      sharedTransitiveDeps.has(specifier),
    );

    expect(
      undeclaredDuplicateRisks,
      `${undeclaredDuplicateRisks.join(', ')} ${undeclaredDuplicateRisks.length === 1 ? 'is' : 'are'} imported ` +
        `directly by this package's own source AND depended on by an already-shared package, but ` +
        `not declared in vite.config.ts's own sharedDeps. Left undeclared, this package's bundler and ` +
        `the shared package's esbuild build each mint their own copy — two module instances backing one ` +
        `React context, which is exactly how useSearch() under <ExtensionRouter> broke.`,
    ).toEqual([]);
  });
});
