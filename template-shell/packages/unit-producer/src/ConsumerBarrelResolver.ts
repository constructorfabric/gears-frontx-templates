/**
 * `ConsumerBarrelResolver` — the consumer half of barrel handling:
 * answers, for a binding a consumer imports from a shared package's
 * barrel (`import { Icon } from 'lucide-react'`), which module of the
 * package defines it. The answer is a module specifier
 * `<pkg>/<module-path>` — the package-relative module path the producer
 * records as a unit's `modulePaths` — so the consumer's chunk
 * imports, and its roots name, exactly the unit that owns the binding.
 *
 * Re-export chains across shared packages are followed: a binding a
 * barrel re-exports from another shared package
 * (`@gears-frontx/react` re-exporting `createFrontX` from
 * `@gears-frontx/framework`) resolves into that package, through its
 * barrel when that one can be skipped too, transitively, to the module
 * that defines it. Where the chain meets a barrel that cannot be skipped,
 * the binding lands on that package's own specifier (as the re-exporting
 * barrel wrote it) and the redirect says why that barrel is evaluated.
 * Each package's bare specifiers resolve from its install location.
 *
 * Only packages declaring side-effect freedom (`sideEffects: false` or a
 * file list that leaves the barrel free) are rewritten; the per-package
 * `exclude` escape hatch opts one out. A package whose barrel cannot be
 * skipped is evaluated through it, with the reason recorded:
 *
 *  - `bypass`: the barrel is evaluated (no side-effect freedom, excluded,
 *    a barrel entry with its own statements, a binding that cannot be
 *    placed past the barrel);
 *  - `not-needed`: the entry module is no barrel (it defines what it
 *    exports, or is CommonJS), so the root already is the defining unit.
 *
 * Resolution of entry files is asynchronous; {@link prepare} the
 * specifiers of a module first, then {@link resolve} answers
 * synchronously.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { BarrelRedirect } from './BarrelImportRewriter';
import { BarrelResolver, type ForeignAnswer } from './BarrelResolver';
import { BarrelRewritePolicy } from './BarrelRewritePolicy';
import { ModuleLinkageScanner, type ModuleLinkageLite } from './ModuleLinkageScanner';
import { PackageEntryFileResolver } from './PackageEntryFileResolver';
import { PackageFileResolver } from './PackageFileResolver';
import { PackageJsonResolver } from './PackageJsonResolver';
import { SharedSetResolver } from './SharedSetResolver';
import { SharedSpecifierMatcher } from './SharedSpecifierMatcher';

/** Where one binding imported from a barrel is really defined. */
export interface ConsumerBarrelRedirect {
  /** The shared package's root name (where the chain ends). */
  packageName: string;
  /**
   * That package's installed version as resolved — the package@version
   * whose units must answer the redirect.
   */
  packageVersion?: string;
  /** `<pkg>/<module-path>` — the specifier the import moves to. */
  specifier: string;
  /** The binding's name as the defining module exports it. */
  importedName: string;
  /**
   * Package-relative posix module path of the defining module; `''` when
   * the redirect lands on another package's entry specifier (`pkg`,
   * `pkg/sub`) whose barrel is evaluated.
   */
  modulePath: string;
  /** The package whose barrel the redirect still evaluates, and why. */
  evaluates?: { packageName: string; reason: string };
}

export type ConsumerBarrelAnswer =
  | { kind: 'redirect'; redirect: ConsumerBarrelRedirect }
  | { kind: 'bypass'; packageName: string; reason: string }
  | { kind: 'not-needed'; packageName: string }
  | { kind: 'not-shared' };

/** What importing a specifier without naming a binding evaluates. */
export type ConsumerBarrelClassification =
  | { kind: 'barrel'; packageName: string }
  | { kind: 'bypass'; packageName: string; reason: string }
  | { kind: 'not-needed'; packageName: string }
  | { kind: 'not-shared' };

/** The names an entry module exports, when its linkage was read. */
interface EntryExports {
  names: ReadonlySet<string>;
  /** No `export *` and some ESM export: `names` is the whole surface. */
  complete: boolean;
}

/** The barrel classification of one imported specifier. */
type SpecifierInfo =
  | { kind: 'not-shared' }
  | {
      kind: 'bypass';
      packageName: string;
      reason: string;
      version?: string;
      /** The package's `sideEffects` declaration, when read. */
      sideEffects?: boolean | string[];
      /** Read from the entry: a chain may land on the specifier. */
      entry?: EntryExports;
    }
  | {
      kind: 'not-needed';
      packageName: string;
      version?: string;
      sideEffects?: boolean | string[];
      entry?: EntryExports;
    }
  | {
      kind: 'barrel';
      packageName: string;
      version?: string;
      sideEffects?: boolean | string[];
      packageDir: string;
      entryFile: string;
      entryModulePath: string;
      barrel: BarrelResolver;
      /** The package's bare re-export specifiers, once listed. */
      foreign?: string[];
      /** Where the package's own bare specifiers resolve from. */
      installDir: string;
    };

export interface ConsumerBarrelResolverOptions {
  /** The consumer's package root; bare specifiers resolve from here. */
  packageRoot: string;
  /** Whether a root package name is in the consumer's shared set. */
  isShared: (packageName: string) => boolean;
  /** The per-package `barrelRewrite.exclude` escape hatch. */
  exclude?: Iterable<string>;
  /** Entry-file resolver override (shared cache). */
  entryResolver?: PackageEntryFileResolver;
}

export class ConsumerBarrelResolver {
  private readonly packageRoot: string;
  private readonly isShared: (packageName: string) => boolean;
  private readonly exclude: ReadonlySet<string>;
  private readonly entryResolver: PackageEntryFileResolver;
  private readonly scanner = new ModuleLinkageScanner();
  /** `fromDir \0 specifier` → classification. */
  private readonly infos = new Map<string, Promise<SpecifierInfo>>();
  private readonly settled = new Map<string, SpecifierInfo>();
  /** Chain hops on the current resolution path (cycle guard). */
  private readonly visiting = new Set<string>();

  constructor(options: ConsumerBarrelResolverOptions) {
    this.packageRoot = options.packageRoot;
    this.isShared = options.isShared;
    this.exclude = new Set(options.exclude ?? []);
    this.entryResolver = options.entryResolver ?? new PackageEntryFileResolver();
  }

  /**
   * Resolves and classifies every specifier before {@link resolve}, and
   * every shared package their barrels' re-export chains reach.
   */
  async prepare(specifiers: Iterable<string>): Promise<void> {
    const visited = new Set<string>();
    let pending = [...new Set(specifiers)].map((specifier) => ({
      specifier,
      fromDir: this.packageRoot,
    }));
    while (pending.length > 0) {
      const round = pending.filter((p) => {
        const key = ConsumerBarrelResolver.keyOf(p.fromDir, p.specifier);
        if (visited.has(key)) return false;
        visited.add(key);
        return true;
      });
      const infos = await Promise.all(round.map((p) => this.settle(p.specifier, p.fromDir)));
      pending = [];
      for (const info of infos) {
        if (info.kind !== 'barrel') continue;
        info.foreign ??= info.barrel.foreignSpecifiers(info.entryFile);
        for (const specifier of info.foreign) {
          if (!SharedSpecifierMatcher.isBareModuleSpecifier(specifier)) continue;
          if (!this.isShared(SharedSetResolver.extractRootPackageName(specifier))) continue;
          pending.push({ specifier, fromDir: info.installDir });
        }
      }
    }
  }

  /**
   * Where `importedName`, imported from `specifier`, is defined — or why
   * the barrel stays. `specifier` must have been {@link prepare}d.
   */
  resolve(specifier: string, importedName: string): ConsumerBarrelAnswer {
    const info = this.infoOf(this.packageRoot, specifier);
    if (info.kind !== 'barrel') return ConsumerBarrelResolver.publicInfo(info);
    const found = info.barrel.resolve(info.entryFile, info.packageDir, importedName);
    if (found === undefined) {
      return {
        kind: 'bypass',
        packageName: info.packageName,
        reason: `binding "${importedName}" cannot be placed past the barrel`,
      };
    }
    if (found.packageName !== undefined) {
      // The chain ended in another shared package.
      return {
        kind: 'redirect',
        redirect: {
          packageName: found.packageName,
          ...(found.packageVersion !== undefined ? { packageVersion: found.packageVersion } : {}),
          specifier: found.specifier,
          importedName: found.importedName,
          modulePath: found.modulePath ?? '',
          ...(found.evaluates !== undefined ? { evaluates: found.evaluates } : {}),
        },
      };
    }
    const modulePath = found.specifier.replace(/^\.\//, '');
    if (ConsumerBarrelResolver.isOutside(modulePath)) {
      return {
        kind: 'bypass',
        packageName: info.packageName,
        reason: `binding "${importedName}" is defined outside the package`,
      };
    }
    if (modulePath === info.entryModulePath) {
      return { kind: 'not-needed', packageName: info.packageName };
    }
    return {
      kind: 'redirect',
      redirect: {
        packageName: info.packageName,
        ...(info.version !== undefined ? { packageVersion: info.version } : {}),
        specifier: `${info.packageName}/${modulePath}`,
        importedName: found.importedName,
        modulePath,
      },
    };
  }

  /**
   * Whether `import 'specifier'` can have no JavaScript effect: the
   * specifier's package declares `sideEffects: false` or a list that
   * covers only non-JavaScript assets (CSS and friends). Such an import
   * is planning-time noise — it reaches the bundler's stylesheet, never
   * the package's units. `specifier` must have been {@link prepare}d;
   * unprepareable or unshared specifiers answer `false`.
   */
  hasOnlyAssetSideEffects(specifier: string): boolean {
    const info = this.infoOf(this.packageRoot, specifier);
    if (info.kind === 'not-shared') return false;
    return BarrelRewritePolicy.declaresOnlyAssetSideEffects(info.sideEffects);
  }

  /**
   * The barrel classification of `specifier` without a binding — what a
   * namespace or side-effect import of it evaluates. `specifier` must
   * have been {@link prepare}d.
   */
  classification(specifier: string): ConsumerBarrelClassification {
    const info = this.infoOf(this.packageRoot, specifier);
    if (info.kind === 'barrel') return { kind: 'barrel', packageName: info.packageName };
    return ConsumerBarrelResolver.publicInfo(info);
  }

  private infoOf(fromDir: string, specifier: string): SpecifierInfo {
    return (
      this.settled.get(ConsumerBarrelResolver.keyOf(fromDir, specifier)) ?? {
        kind: 'not-shared' as const,
      }
    );
  }

  private async settle(specifier: string, fromDir: string): Promise<SpecifierInfo> {
    const key = ConsumerBarrelResolver.keyOf(fromDir, specifier);
    let pending = this.infos.get(key);
    if (pending === undefined) {
      pending = this.classify(specifier, fromDir);
      this.infos.set(key, pending);
    }
    const info = await pending;
    this.settled.set(key, info);
    return info;
  }

  /**
   * One hop of a re-export chain: `name`, re-exported from the bare
   * `specifier` by a package installed at `fromDir`.
   */
  private hop(fromDir: string, specifier: string, name: string, asserted: boolean): ForeignAnswer {
    if (!SharedSpecifierMatcher.isBareModuleSpecifier(specifier)) return 'unknown';
    const packageName = SharedSetResolver.extractRootPackageName(specifier);
    if (!this.isShared(packageName)) return 'unknown';
    const info = this.infoOf(fromDir, specifier);
    if (info.kind === 'not-shared') return 'unknown';
    const visitKey = `${ConsumerBarrelResolver.keyOf(fromDir, specifier)}\0${name}`;
    if (this.visiting.has(visitKey)) return 'unknown';
    this.visiting.add(visitKey);
    try {
      const withVersion = info.version !== undefined ? { packageVersion: info.version } : {};
      const land = (reason?: string): BarrelRedirect => ({
        specifier,
        importedName: name,
        packageName,
        ...withVersion,
        modulePath: '',
        ...(reason !== undefined ? { evaluates: { packageName, reason } } : {}),
      });
      if (info.kind === 'barrel') {
        const answer = info.barrel.answer(info.entryFile, info.packageDir, name);
        if (typeof answer === 'object') {
          if (answer.packageName !== undefined) return answer;
          const modulePath = answer.specifier.replace(/^\.\//, '');
          if (ConsumerBarrelResolver.isOutside(modulePath)) {
            return land(`binding "${name}" is defined outside the package`);
          }
          if (modulePath === info.entryModulePath) return land();
          return {
            specifier: `${packageName}/${modulePath}`,
            importedName: answer.importedName,
            packageName,
            ...withVersion,
            modulePath,
          };
        }
        if (!asserted) return answer;
        return land(`binding "${name}" cannot be placed past the barrel`);
      }
      if (info.entry === undefined) return 'unknown';
      const reason = info.kind === 'bypass' ? info.reason : undefined;
      if (asserted || info.entry.names.has(name)) return land(reason);
      return info.entry.complete ? 'absent' : 'unknown';
    } finally {
      this.visiting.delete(visitKey);
    }
  }

  private async classify(specifier: string, fromDir: string): Promise<SpecifierInfo> {
    if (!SharedSpecifierMatcher.isBareModuleSpecifier(specifier)) {
      return { kind: 'not-shared' };
    }
    const packageName = SharedSetResolver.extractRootPackageName(specifier);
    if (!this.isShared(packageName)) return { kind: 'not-shared' };
    const pkgJsonPath = PackageJsonResolver.resolve(fromDir, packageName);
    if (pkgJsonPath === undefined) {
      return { kind: 'bypass', packageName, reason: 'package cannot be located' };
    }
    const packageDir = path.dirname(pkgJsonPath);
    const installed = PackageJsonResolver.resolveInstalled(fromDir, packageName);
    const installDir = installed !== undefined ? path.dirname(installed) : packageDir;
    let sideEffects: boolean | string[] | undefined;
    let version: string | undefined;
    try {
      const json = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8')) as {
        sideEffects?: boolean | string[];
        version?: string;
      };
      sideEffects = json.sideEffects;
      version = json.version;
    } catch {
      return { kind: 'bypass', packageName, reason: 'package.json cannot be read' };
    }
    const isFree = (rel: string): boolean =>
      BarrelRewritePolicy.declaresSideEffectFreedom(sideEffects, rel);

    const entryFile = await this.entryResolver.resolve(specifier, fromDir);
    if (entryFile === undefined) {
      return { kind: 'bypass', packageName, reason: `"${specifier}" cannot be resolved` };
    }
    const entryModulePath = path.relative(packageDir, entryFile).split(path.sep).join('/');
    if (entryModulePath.startsWith('..') || path.isAbsolute(entryModulePath)) {
      return { kind: 'bypass', packageName, reason: `"${specifier}" resolves outside the package` };
    }
    let source: string;
    try {
      source = fs.readFileSync(entryFile, 'utf-8');
    } catch {
      return { kind: 'bypass', packageName, reason: `entry module of "${specifier}" cannot be read` };
    }
    const linkage = this.scanner.scan(source, entryFile);
    const entry = ConsumerBarrelResolver.entryExportsOf(linkage);
    if (linkage.reExports.size === 0 && linkage.starExports.length === 0) {
      // No re-exports: the entry defines what it exports (or is CommonJS).
      return { kind: 'not-needed', packageName, version, sideEffects, entry };
    }
    const bypass = (reason: string): SpecifierInfo => ({
      kind: 'bypass',
      packageName,
      reason,
      version,
      sideEffects,
      entry,
    });
    // A barrel: skipped only with the package's consent.
    if (this.exclude.has(packageName)) return bypass('package excluded from barrel rewriting');
    if (sideEffects !== false && !Array.isArray(sideEffects)) {
      return bypass('package does not declare side-effect freedom');
    }
    if (!isFree(entryModulePath)) return bypass('barrel entry is listed with side effects');
    if (!linkage.isPure) return bypass('barrel entry evaluates its own statements');
    for (const imported of linkage.sideEffectImports) {
      const target = PackageFileResolver.resolve(imported, path.dirname(entryFile), packageDir);
      const rel = target && path.relative(packageDir, target).split(path.sep).join('/');
      if (rel === undefined || !isFree(rel)) {
        return bypass(`barrel entry imports "${imported}" for its side effects`);
      }
    }
    return {
      kind: 'barrel',
      packageName,
      version,
      sideEffects,
      packageDir,
      entryFile,
      entryModulePath,
      installDir,
      barrel: new BarrelResolver({
        packageDir,
        isSideEffectFreeModule: isFree,
        resolveForeign: (foreign, name, asserted) => this.hop(installDir, foreign, name, asserted),
      }),
    };
  }

  private static publicInfo(
    info: Exclude<SpecifierInfo, { kind: 'barrel' }>
  ): Exclude<ConsumerBarrelClassification, { kind: 'barrel' }> {
    if (info.kind === 'bypass') {
      return { kind: 'bypass', packageName: info.packageName, reason: info.reason };
    }
    if (info.kind === 'not-needed') return { kind: 'not-needed', packageName: info.packageName };
    return info;
  }

  private static entryExportsOf(linkage: ModuleLinkageLite): EntryExports {
    const names = new Set([...linkage.ownExports, ...linkage.reExports.keys()]);
    return { names, complete: linkage.starExports.length === 0 && names.size > 0 };
  }

  private static isOutside(modulePath: string): boolean {
    return modulePath.startsWith('../') || modulePath.split('/').includes('node_modules');
  }

  private static keyOf(fromDir: string, specifier: string): string {
    return `${fromDir}\0${specifier}`;
  }
}
