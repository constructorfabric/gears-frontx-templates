import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { UnitOutputChecks } from './support/UnitOutputChecks';

import { PackageJsonResolver } from '../PackageJsonResolver';
import { SharedSetResolver } from '../SharedSetResolver';
import { UnitProducer } from '../UnitProducer';

/**
 * Scenario: a shared package installed as a symlink (workspace link or
 * `dev:template:link`) is unitized from its real directory. esbuild
 * reports metafile inputs under the symlink target, so a package dir
 * taken from the symlink path matched no input and degraded every
 * linked package to the "no package modules found"
 * whole-package fallback.
 */

const roots: string[] = [];

function tmp(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'unit-producer-link-')));
  roots.push(dir);
  return dir;
}

function write(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

/**
 * A real ESM package (no `./package.json` export, so the resolver's
 * fallback walk is what finds it) at `<base>/eco/packages/linked` (a separate checkout), symlinked into
 * `<root>/node_modules/@s/linked`.
 */
function makeLinkedRoot(): { root: string; realDir: string } {
  const base = tmp();
  const realDir = join(base, 'eco', 'packages', 'linked');
  write(
    join(realDir, 'package.json'),
    JSON.stringify({
      name: '@s/linked',
      version: '1.0.0',
      type: 'module',
      sideEffects: false,
      exports: { '.': './dist/index.js' },
    })
  );
  write(
    join(realDir, 'dist', 'index.js'),
    "export { a } from './a.js';\nexport { b } from './b.js';\n"
  );
  write(join(realDir, 'dist', 'a.js'), "export const a = () => 'a';\n");
  write(join(realDir, 'dist', 'b.js'), "export const b = () => 'b';\n");

  const root = join(base, 'consumer');
  write(
    join(root, 'package.json'),
    JSON.stringify({
      name: 'consumer',
      version: '0.0.0',
      dependencies: { '@s/linked': '1.0.0' },
    })
  );
  mkdirSync(join(root, 'node_modules', '@s'), { recursive: true });
  symlinkSync(realDir, join(root, 'node_modules', '@s', 'linked'), 'dir');
  return { root, realDir };
}

afterEach(() => {
  while (roots.length > 0) {
    rmSync(roots.pop()!, { recursive: true, force: true });
  }
});

describe('PackageJsonResolver — symlinked installs', () => {
  it('returns the real package.json path of a symlinked package', () => {
    const { root, realDir } = makeLinkedRoot();
    expect(PackageJsonResolver.resolve(root, '@s/linked')).toBe(
      join(realDir, 'package.json')
    );
  });
});

describe('UnitProducer — symlinked package', () => {
  it('unitizes a symlinked ESM package instead of falling back', async () => {
    const { root } = makeLinkedRoot();
    const produced = await new UnitProducer({
      packageRoot: root,
      outputDir: join(root, 'out'),
    }).produce((m) => {
      throw new Error(m);
    });

    expect(produced).toHaveLength(1);
    const [pkg] = produced;
    expect(pkg.fallbackReason).toBeUndefined();
    expect(pkg.unitMode).toBe('units');
    expect(pkg.units.flatMap((u) => u.modulePaths).sort()).toEqual([
      'dist/a.js',
      'dist/b.js',
      'dist/index.js',
    ]);
  }, 60000);
});

describe('linked package dependencies resolve through the install tree', () => {
  /**
   * `@s/linked` (symlinked) depends on `dep-x`. The consumer's install
   * tree has dep-x 1.0.0; the link target's own surroundings have dep-x
   * 2.0.0 (the linked checkout's dev install). A published install puts
   * `@s/linked` inside the consumer's tree, so 1.0.0 is the version it
   * gets at runtime — the closure must agree.
   */
  function makeRootWithDep(): string {
    const { root, realDir } = makeLinkedRoot();
    const pkgPath = join(realDir, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    pkg.dependencies = { 'dep-x': '^1.0.0' };
    writeFileSync(pkgPath, JSON.stringify(pkg));
    write(
      join(realDir, 'dist', 'a.js'),
      "import { x } from 'dep-x';\nexport const a = () => x;\n"
    );
    const depPkg = (dir: string, version: string): void => {
      write(
        join(dir, 'package.json'),
        JSON.stringify({ name: 'dep-x', version, type: 'module', main: './index.js' })
      );
      write(join(dir, 'index.js'), `export const x = 'DEP_X_${version}';\n`);
    };
    depPkg(join(root, 'node_modules', 'dep-x'), '1.0.0');
    depPkg(join(dirname(dirname(realDir)), 'node_modules', 'dep-x'), '2.0.0');
    return root;
  }

  it('locates the closure from the linked package\'s install location first', () => {
    const root = makeRootWithDep();
    const resolver = new SharedSetResolver(root);
    const res = resolver.resolve();
    expect(res.ok).toBe(true);
    if (res.ok) {
      const linked = res.packages.find((p) => p.name === '@s/linked')!;
      expect(resolver.locate(linked, 'dep-x')?.version).toBe('1.0.0');
    }
  });

  it('resolves a package found only beside the link target against the consumer tree first', () => {
    const root = makeRootWithDep();
    // `foreign-only` exists only in the linked checkout's tree (a
    // dependency the consumer's install predates); its own dependency
    // dep-x still resolves to the consumer tree's copy.
    const base = dirname(dirname(realpathSync(join(root, 'node_modules', '@s', 'linked'))));
    write(
      join(base, 'node_modules', 'foreign-only', 'package.json'),
      JSON.stringify({
        name: 'foreign-only',
        version: '1.0.0',
        dependencies: { 'dep-x': '*' },
      })
    );
    const linkedPkg = join(realpathSync(join(root, 'node_modules', '@s', 'linked')), 'package.json');
    const pkg = JSON.parse(readFileSync(linkedPkg, 'utf-8'));
    pkg.dependencies['foreign-only'] = '1.0.0';
    writeFileSync(linkedPkg, JSON.stringify(pkg));

    const resolver = new SharedSetResolver(root);
    const res = resolver.resolve();
    expect(res.ok ? undefined : res.message).toBeUndefined();
    if (res.ok) {
      const linked = res.packages.find((p) => p.name === '@s/linked')!;
      const foreign = resolver.locate(linked, 'foreign-only');
      expect(foreign).toBeDefined();
      expect(resolver.locate(foreign!, 'dep-x')?.version).toBe('1.0.0');
    }
  });

  it('builds the install-tree copy of the dependency', async () => {
    const root = makeRootWithDep();
    const produced = await new UnitProducer({
      packageRoot: root,
      outputDir: join(root, 'out'),
    }).produce((m) => {
      throw new Error(m);
    });
    const dep = produced.find((p) => p.name === 'dep-x')!;
    expect(dep.version).toBe('1.0.0');
    expect(readFileSync(join(root, 'out', dep.packLocation), 'utf-8')).toContain(
      'DEP_X_1.0.0'
    );
  }, 60000);
});

describe('preserveSymlinks — a linked package\'s own dependencies', () => {
  /**
   * `@s/linked` (symlinked) depends on `link-only-dep`, which exists
   * ONLY beside the link target's real directory — the linked
   * checkout's own install — not in the consumer's tree. With
   * `preserveSymlinks: true`, esbuild resolves the linked package's
   * imports under its `node_modules/@s/linked` path, where
   * `link-only-dep` cannot be found; the producer must still locate it
   * through the link target's surroundings, deliver it as a shared
   * package, and emit conforming, byte-identical output.
   */
  function makeRootWithLinkedOnlyDep(): string {
    const { root, realDir } = makeLinkedRoot();
    const pkgPath = join(realDir, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    pkg.dependencies = { 'link-only-dep': '^3.0.0' };
    writeFileSync(pkgPath, JSON.stringify(pkg));
    write(
      join(realDir, 'dist', 'a.js'),
      "import { v } from 'link-only-dep';\nexport const a = () => v;\n"
    );
    const depDir = join(dirname(dirname(realDir)), 'node_modules', 'link-only-dep');
    write(
      join(depDir, 'package.json'),
      JSON.stringify({
        name: 'link-only-dep',
        version: '3.0.0',
        type: 'module',
        sideEffects: false,
        main: './index.js',
      })
    );
    write(join(depDir, 'index.js'), "export const v = 'LINK_ONLY_3';\n");
    return root;
  }

  it('delivers a dependency resolvable only through the link target, conformantly', async () => {
    const root = makeRootWithLinkedOnlyDep();
    const outA = join(root, 'out-a');
    const outB = join(root, 'out-b');
    const onError = (m: string): never => {
      throw new Error(m);
    };
    const produced = await new UnitProducer({
      packageRoot: root,
      outputDir: outA,
    }).produce(onError);
    const producedB = await new UnitProducer({
      packageRoot: root,
      outputDir: outB,
    }).produce(onError);

    const dep = produced.find((p) => p.name === 'link-only-dep');
    expect(dep, 'link-only-dep delivered').toBeDefined();
    expect(dep!.version).toBe('3.0.0');
    const linked = produced.find((p) => p.name === '@s/linked')!;
    expect(linked.requires).toContain('link-only-dep');
    expect(
      readFileSync(join(outA, dep!.packLocation), 'utf-8')
    ).toContain('LINK_ONLY_3');

    const violations = new UnitOutputChecks().check(
      { dir: outA, produced },
      { dir: outB, produced: producedB }
    );
    expect(violations).toEqual([]);
  }, 60000);
});
