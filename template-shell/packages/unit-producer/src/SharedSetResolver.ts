/**
 * `SharedSetResolver` — owns the shared-dependency set for a producing
 * build. The set is derived, never listed. It describes the declared
 * seed — every name declared in the producing package's `dependencies`
 * plus its non-optional `peerDependencies`, never its `devDependencies`
 * — which the build graph extends with every package the bundled code
 * imports (`BuildGraphSharing`). The `share.exclude` opt-out removes entries, and is rejected —
 * naming the dependents — when a still-shared package declares the
 * excluded one (`closure_enforcement.formation`).
 *
 * The declared set is the seed of the runtime closure: the producer keeps
 * every bare import of every shared package external, and each package a
 * shared package imports joins the set (located here through
 * {@link locate}, which follows the same install-tree rules), so no
 * shared package ever inlines another third-party package. Packages a
 * shared package merely declares but never imports (a server-side
 * dependency of an isomorphic library, say) are not delivered.
 *
 * Also owns the closure version checks (`closure_enforcement.version_check`):
 * the bundled copy's `package.json` version must equal the manifest's
 * declared version, and no second version of a shared package may be
 * reachable from the shared closure. The declared-set checks run on
 * `package.json` metadata before anything is emitted, so a violating
 * build fails early with no output written; the producer repeats the
 * second check for every package the closure reaches by import.
 *
 * No name list is curated by hand: the seed is derived from the declared
 * names and extended by what the build graph imports.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { PackageJsonResolver } from './PackageJsonResolver';
import { SharedSetSelection } from './SharedSetSelection';

/** The package.json fields the resolver reads. */
export interface ResolvablePackageJson {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
}

export interface SharedSetResolverOptions {
  /**
   * The `include` option: only these packages (and, through the closure,
   * their runtime dependencies) are shared; `[]` shares nothing. Mutually
   * exclusive with `exclude`.
   */
  include?: readonly string[];
  /**
   * The `share: { exclude: [...] }` opt-out: packages removed from the
   * shared set. An excluded package a still-shared package depends on
   * fails the resolution, named in the message.
   */
  exclude?: readonly string[];
  /**
   * The manifest's declared version per shared package name. When a name
   * is absent the bundled-vs-declared check is skipped for it (there is
   * no declaration to disagree with); the multiple-version check still
   * applies.
   */
  declaredVersions?: ReadonlyMap<string, string>;
}

/** One shared package as located in the install tree. */
export interface SharedPackageLocation {
  /** Root package name. */
  name: string;
  /** Installed version from the package's `package.json`. */
  version: string;
  /** Real (symlink-resolved) install directory. */
  dir: string;
  /**
   * Install directory as found — through a symlink when the package is
   * linked. The package's own dependencies resolve from here first.
   */
  installDir: string;
  /**
   * Directory the package was resolved from: the producing package root
   * for a declared dependency, the importer's install directory for a
   * package only the closure reaches. Bare specifiers of the package
   * resolve to `dir` from here.
   */
  resolveDir: string;
  /** Whether the package is shared only because the closure reaches it. */
  transitive: boolean;
}

/**
 * The resolved shared set — `ok: true` with the declared dependency
 * names to mint and where each lives, or `ok: false` with a
 * build-failing message naming the offending packages.
 */
export type SharedSetResolution =
  | { ok: true; sharedDeps: string[]; packages: SharedPackageLocation[] }
  | { ok: false; message: string };

export class SharedSetResolver {
  private readonly packageRoot: string;
  private readonly exclude: readonly string[];
  private readonly include?: readonly string[];
  private readonly declaredVersions?: ReadonlyMap<string, string>;

  constructor(packageRoot: string, options?: SharedSetResolverOptions) {
    this.packageRoot = packageRoot;
    this.exclude = options?.exclude ?? [];
    this.include = options?.include;
    this.declaredVersions = options?.declaredVersions;
  }

  /**
   * Extract the root npm package name from a specifier that may include a
   * subpath. Handles scoped packages:
   *   'pkg/sub'        → 'pkg'
   *   '@scope/pkg/sub' → '@scope/pkg'
   *   'pkg'            → 'pkg'
   */
  static extractRootPackageName(name: string): string {
    if (name.startsWith('@')) {
      const parts = name.split('/');
      return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : name;
    }
    const firstSlash = name.indexOf('/');
    return firstSlash === -1 ? name : name.slice(0, firstSlash);
  }

  /**
   * The dependency names a package declares (`dependencies` ∪
   * `optionalDependencies` ∪ non-optional `peerDependencies`). Optional
   * dependencies are resolvable and bundled when present, so they count;
   * peers marked `optional` in `peerDependenciesMeta` may legitimately be
   * absent and are not treated as hard dependents. `devDependencies` are
   * not part of the declared seed: they are not installed for consumers
   * (a package the build graph imports is shared whether declared or not).
   */
  static declaredDepNames(pkg: ResolvablePackageJson): string[] {
    // A name declared in two fields (a `dependencies` entry that is also a
    // non-optional peer, for instance) is still one package: dedupe so the
    // producer mints it once.
    return [
      ...new Set([
        ...Object.keys(pkg.dependencies ?? {}),
        ...Object.keys(pkg.optionalDependencies ?? {}),
        ...Object.keys(pkg.peerDependencies ?? {}).filter(
          (name) => pkg.peerDependenciesMeta?.[name]?.optional !== true
        ),
      ]),
    ];
  }

  /** Whether `name` (root or subpath) is removed by the `exclude` opt-out. */
  isExcluded(name: string): boolean {
    const root = SharedSetResolver.extractRootPackageName(name);
    return this.exclude.some(
      (e) => SharedSetResolver.extractRootPackageName(e) === root
    );
  }

  /**
   * Derives the shared set from the producing package's own
   * `package.json` — every `dependencies` entry and every non-optional
   * `peerDependencies` entry, never a hand-maintained name list — applies
   * the `exclude` opt-out, and enforces the closure contract.
   */
  resolve(): SharedSetResolution {
    const conflict = new SharedSetSelection({
      include: this.include,
      exclude: this.exclude,
    }).conflict();
    if (conflict !== undefined) return { ok: false, message: conflict };
    let projectPkg: ResolvablePackageJson;
    try {
      projectPkg = SharedSetResolver.readPackageJson(
        path.join(this.packageRoot, 'package.json')
      );
    } catch (error) {
      return {
        ok: false,
        message:
          `[unit-producer] cannot read the producing package's ` +
          `package.json at ${this.packageRoot}: ` +
          (error instanceof Error ? error.message : String(error)),
      };
    }

    // The shared set over the build graph is derived from the declared dependency
    // fields, never from a curated name list (`closure_enforcement.formation`).
    const derived = this.include ?? SharedSetResolver.declaredDepNames(projectPkg);
    const sharedDeps = derived.filter((name) => !this.isExcluded(name));
    const sharedRootNames = new Set(
      sharedDeps.map(SharedSetResolver.extractRootPackageName)
    );

    // Resolve every shared package's bundled copy once; an unlocatable
    // package fails here rather than inside the walk below.
    const located = new Map<string, SharedPackageLocation>();
    const pkgs = new Map<string, ResolvablePackageJson>();
    for (const name of sharedDeps) {
      const rootName = SharedSetResolver.extractRootPackageName(name);
      const installedPath = PackageJsonResolver.resolveInstalled(
        this.packageRoot,
        rootName
      );
      if (installedPath === undefined) {
        return {
          ok: false,
          message:
            `[unit-producer] shared dependency "${name}": cannot locate ` +
            `its package.json from ${this.packageRoot}`,
        };
      }
      let pkg: ResolvablePackageJson;
      try {
        pkg = SharedSetResolver.readPackageJson(installedPath);
      } catch (error) {
        return {
          ok: false,
          message:
            `[unit-producer] shared-set resolution: cannot read ` +
            `package.json for "${name}" at ${installedPath}: ` +
            (error instanceof Error ? error.message : String(error)),
        };
      }
      if (pkg.version === undefined) {
        return {
          ok: false,
          message:
            `[unit-producer] shared dependency "${name}": cannot ` +
            `determine bundled version — package.json has no version field`,
        };
      }
      pkgs.set(name, pkg);
      if (!located.has(rootName)) {
        located.set(rootName, {
          name: rootName,
          version: pkg.version,
          dir: path.dirname(fs.realpathSync(installedPath)),
          installDir: path.dirname(installedPath),
          resolveDir: this.packageRoot,
          transitive: false,
        });
      }
    }

    // `exclude` rejection: an excluded package a still-shared package
    // declares fails the build, naming the dependents.
    for (const excluded of this.exclude) {
      const rootName = SharedSetResolver.extractRootPackageName(excluded);
      const dependents = sharedDeps.filter((shared) =>
        SharedSetResolver.declaredDepNames(pkgs.get(shared)!).some(
          (dep) => SharedSetResolver.extractRootPackageName(dep) === rootName
        )
      );
      if (dependents.length > 0) {
        return {
          ok: false,
          message: SharedSetResolver.formatExcludedDependentError(
            rootName,
            dependents
          ),
        };
      }
    }

    // Bundled-vs-declared version check.
    for (const name of sharedDeps) {
      const entry = located.get(SharedSetResolver.extractRootPackageName(name))!;
      const declared =
        this.declaredVersions?.get(name) ??
        this.declaredVersions?.get(
          SharedSetResolver.extractRootPackageName(name)
        );
      if (declared !== undefined && entry.version !== declared) {
        return {
          ok: false,
          message: SharedSetResolver.formatVersionMismatchError(
            name,
            entry.version,
            declared
          ),
        };
      }
    }

    // Multiple-version check over the declared closure: breadth-first
    // walk from each shared package's install location, resolving each
    // declared dependency the way the install tree does — a nested
    // `node_modules` copy shadows the top-level one, which is exactly the
    // second version this check must catch. Visited package.json paths
    // bound the walk so dependency cycles cannot loop it.
    const visited = new Set<string>();
    const queue = [...located.values()].map((loc) => ({ loc, reachedFrom: loc.name }));
    for (let head = 0; head < queue.length; head++) {
      const { loc, reachedFrom } = queue[head];
      let pkg: ResolvablePackageJson;
      try {
        pkg = SharedSetResolver.readPackageJson(path.join(loc.dir, 'package.json'));
      } catch {
        continue;
      }
      for (const depName of SharedSetResolver.declaredDepNames(pkg)) {
        const depRoot = SharedSetResolver.extractRootPackageName(depName);
        if (depRoot === loc.name) continue;
        const dep = this.locate(loc, depRoot);
        if (dep === undefined) continue;
        const key = path.join(dep.dir, 'package.json');
        if (visited.has(key)) continue;
        visited.add(key);
        const bundled = located.get(depRoot);
        if (
          sharedRootNames.has(depRoot) &&
          bundled !== undefined &&
          bundled.version !== dep.version
        ) {
          return {
            ok: false,
            message: SharedSetResolver.formatMultipleVersionsError(
              depRoot,
              bundled.version,
              dep.version,
              reachedFrom
            ),
          };
        }
        queue.push({ loc: dep, reachedFrom: depRoot });
      }
    }

    return { ok: true, sharedDeps, packages: [...located.values()] };
  }

  /**
   * Every package name the shared set's declared closure names
   * (best-effort, no checks): the declared set plus, transitively, each
   * shared package's declared dependencies. A consumer build keeps these
   * external, so a package the closure may deliver is never also inlined
   * into the consumer's own chunks.
   */
  declaredClosureNames(): string[] {
    const resolved = this.resolve();
    if (!resolved.ok) return [];
    const names = new Set(resolved.packages.map((p) => p.name));
    const queue = [...resolved.packages];
    const visited = new Set<string>();
    for (let head = 0; head < queue.length; head++) {
      const loc = queue[head];
      if (visited.has(loc.dir)) continue;
      visited.add(loc.dir);
      let pkg: ResolvablePackageJson;
      try {
        pkg = SharedSetResolver.readPackageJson(path.join(loc.dir, 'package.json'));
      } catch {
        continue;
      }
      for (const depName of SharedSetResolver.declaredDepNames(pkg)) {
        const depRoot = SharedSetResolver.extractRootPackageName(depName);
        if (this.isExcluded(depRoot)) continue;
        const dep = this.locate(loc, depRoot);
        if (dep === undefined) continue;
        names.add(depRoot);
        queue.push(dep);
      }
    }
    return [...names].sort();
  }

  /**
   * Locates `depRoot` as `owner` resolves it. A package inside the
   * consumer's install tree resolves from its install location, exactly
   * as node would. A package found only outside it — beside a linked
   * checkout's real directory — keeps a copy nested under itself, else
   * takes the consumer tree's copy (what a published install of it would
   * get), else its own tree's. Returns `undefined` when the package is
   * not installed or carries no version.
   */
  locate(
    owner: Pick<SharedPackageLocation, 'dir' | 'installDir'>,
    depRoot: string
  ): SharedPackageLocation | undefined {
    const { installed, from } = this.locateDependency(owner, depRoot);
    if (installed === undefined) return undefined;
    let pkg: ResolvablePackageJson;
    try {
      pkg = SharedSetResolver.readPackageJson(installed);
    } catch {
      return undefined;
    }
    if (pkg.version === undefined) return undefined;
    return {
      name: depRoot,
      version: pkg.version,
      dir: path.dirname(fs.realpathSync(installed)),
      installDir: path.dirname(installed),
      resolveDir: from,
      transitive: true,
    };
  }

  private locateDependency(
    owner: Pick<SharedPackageLocation, 'dir' | 'installDir'>,
    depRoot: string
  ): { installed?: string; from: string } {
    if (this.inConsumerTree(owner.installDir)) {
      const installed = PackageJsonResolver.resolveInstalled(owner.installDir, depRoot);
      if (installed !== undefined) return { installed, from: owner.installDir };
    } else {
      const nested = path.join(owner.installDir, 'node_modules', depRoot, 'package.json');
      if (fs.existsSync(nested)) return { installed: nested, from: owner.installDir };
      const fromRoot = PackageJsonResolver.resolveInstalled(this.packageRoot, depRoot);
      if (fromRoot !== undefined) return { installed: fromRoot, from: this.packageRoot };
    }
    const own = PackageJsonResolver.resolveInstalled(owner.dir, depRoot);
    return { installed: own, from: owner.dir };
  }

  /** Whether `dir` lies under a node_modules dir the consumer resolves from. */
  private inConsumerTree(dir: string): boolean {
    let current = this.packageRoot;
    for (;;) {
      const rel = path.relative(path.join(current, 'node_modules'), dir);
      if (rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)) return true;
      const parent = path.dirname(current);
      if (parent === current) return false;
      current = parent;
    }
  }

  private static readPackageJson(pkgJsonPath: string): ResolvablePackageJson {
    return JSON.parse(
      fs.readFileSync(pkgJsonPath, 'utf-8')
    ) as ResolvablePackageJson;
  }

  /** Formats the `exclude` rejection, naming the dependents. */
  static formatExcludedDependentError(
    excluded: string,
    dependents: readonly string[]
  ): string {
    return (
      `[unit-producer] share.exclude: "${excluded}" cannot be excluded — ` +
      `shared package(s) ${dependents.map((d) => `"${d}"`).join(', ')} ` +
      `depend on it.\n` +
      `Fix: remove "${excluded}" from share.exclude, or stop sharing the ` +
      `dependent package(s) as well.`
    );
  }

  /** Formats the bundled-vs-declared version failure. */
  static formatVersionMismatchError(
    name: string,
    bundledVersion: string,
    declaredVersion: string
  ): string {
    return (
      `[unit-producer] shared dependency "${name}": bundled ` +
      `package.json version "${bundledVersion}" differs from the ` +
      `manifest's declared version "${declaredVersion}".\n` +
      `Fix: align the installed version with the declared one, or update ` +
      `the manifest declaration.`
    );
  }

  /** Formats the duplicate-version-in-closure failure. */
  static formatMultipleVersionsError(
    name: string,
    bundledVersion: string,
    otherVersion: string,
    reachedFrom: string
  ): string {
    return (
      `[unit-producer] shared dependency "${name}": more than one ` +
      `version is reachable from the shared closure — bundled ` +
      `"${bundledVersion}" plus "${otherVersion}" reached through ` +
      `"${reachedFrom}".\n` +
      `Fix: deduplicate "${name}" so the whole shared closure resolves a ` +
      `single version.`
    );
  }
}
