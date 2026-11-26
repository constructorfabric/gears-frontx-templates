/**
 * `SharedStylesheetImports` — keeps the stylesheets a shared package's
 * modules import in the consuming build's own CSS.
 *
 * A shared package is externalized: the consuming bundler never loads
 * its modules, and the producer builds them into units, where a
 * stylesheet import carries no module surface and loads as an empty
 * module. A UI kit whose components import their own CSS would then
 * style nothing. This transform restores what a bundler that bundled
 * the package itself would have done: before every import of a shared
 * module it inserts a side-effect import of each stylesheet that
 * module's static import graph loads, in the order evaluating the graph
 * would load them, so the consuming build extracts, splits and links
 * that CSS like its own — next to the chunk that imports the package,
 * at the version the consumer installed.
 *
 * The walk follows static `import`/`export … from` statements (bare
 * ones from each module's own location), skips a side-effect-only
 * import of a module its package declares side-effect free (a bundler
 * drops it, stylesheets included), and leaves CSS Modules
 * (`*.module.css`) out: their class map lives in the package's
 * JavaScript, which only the package's own build can pair with them.
 * A literal dynamic `import('pkg')` of a shared package gets its
 * stylesheets at the top of the importing module.
 *
 * Bundler-agnostic: a Vite/Rollup plugin calls {@link inject} from its
 * `transform` hook, in builds only, after the consumer barrel rewrite so
 * the walk starts from the modules that define the used bindings.
 */

import * as fs from 'node:fs';
import { isBuiltin } from 'node:module';
import * as path from 'node:path';

import { BarrelRewritePolicy } from './BarrelRewritePolicy';
import { ModuleLinkageScanner, type LinkageStatement } from './ModuleLinkageScanner';
import { PackageEntryFileResolver } from './PackageEntryFileResolver';
import { PackageJsonResolver } from './PackageJsonResolver';
import { SharedSetResolver } from './SharedSetResolver';
import { SharedSpecifierMatcher } from './SharedSpecifierMatcher';

/** One load edge of a module, in source order. */
type StylesheetEdge =
  | { kind: 'stylesheet'; file: string }
  | { kind: 'module'; file: string };

export interface SharedStylesheetImportsOptions {
  /**
   * Whether a bare specifier written in a module the build bundles is
   * externalized as a shared package.
   */
  isShared: (specifier: string) => boolean;
  /** Entry-file resolver override (shared cache). */
  entryResolver?: PackageEntryFileResolver;
}

export class SharedStylesheetImports {
  private static readonly SCRIPT = /\.(?:[cm]?[jt]sx?)$/;
  private static readonly STYLESHEET = /\.(css|less|sass|scss|styl|stylus|pcss|postcss|sss)$/;
  private static readonly CSS_MODULE = /\.module\.(css|less|sass|scss|styl|stylus|pcss|postcss|sss)$/;
  private static readonly EXTENSIONS = ['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.mts', '.cts'];
  private static readonly INDEX_FILES = SharedStylesheetImports.EXTENSIONS.map((e) => `index${e}`);

  private readonly isShared: (specifier: string) => boolean;
  private readonly entryResolver: PackageEntryFileResolver;
  /** Module file → its load edges, parsed and resolved once per build. */
  private readonly edges = new Map<string, Promise<StylesheetEdge[]>>();
  /** Package dir → whether it or a package it depends on ships a stylesheet. */
  private readonly reachesStylesheets = new Map<string, boolean>();
  /** Package dir → whether its own files include a stylesheet. */
  private readonly ownStylesheets = new Map<string, boolean>();
  /** Directory → the `sideEffects` of its nearest package.json. */
  private readonly sideEffectsByDir = new Map<string, { dir: string; sideEffects?: boolean | string[] } | undefined>();

  constructor(options: SharedStylesheetImportsOptions) {
    this.isShared = options.isShared;
    this.entryResolver = options.entryResolver ?? new PackageEntryFileResolver();
  }

  /**
   * Whether `id` is a JavaScript/TypeScript module the transform reads:
   * a file on disk, no virtual module, no query.
   */
  static isScriptModule(id: string): boolean {
    if (id.startsWith('\0') || id.includes('?')) return false;
    return SharedStylesheetImports.SCRIPT.test(id);
  }

  /**
   * Inserts, before each import of a shared module in `code` (the module
   * `id`), side-effect imports of the stylesheets that module loads;
   * `null` when there are none.
   */
  async inject(code: string, id: string): Promise<{ code: string; stylesheets: string[] } | null> {
    if (!SharedStylesheetImports.isScriptModule(id)) return null;
    const found = ModuleLinkageScanner.imports(code, id);
    if (found === undefined) return null;
    const fromDir = path.dirname(id);
    const injected = new Set<string>();
    const inserts: Array<{ at: number; files: string[] }> = [];
    const take = (files: readonly string[]): string[] => {
      const fresh = files.filter((f) => !injected.has(f));
      for (const f of fresh) injected.add(f);
      return fresh;
    };

    for (const statement of found.statements) {
      if (!this.loadsSharedModule(statement)) continue;
      const files = take(await this.stylesheetsOf(statement.specifier, fromDir));
      if (files.length > 0) inserts.push({ at: statement.start, files });
    }
    const lazy: string[] = [];
    for (const specifier of found.dynamicImports) {
      if (!this.sharedBare(specifier)) continue;
      lazy.push(...take(await this.stylesheetsOf(specifier, fromDir)));
    }
    if (lazy.length > 0) inserts.unshift({ at: 0, files: lazy });
    if (inserts.length === 0) return null;

    let out = '';
    let cursor = 0;
    for (const { at, files } of inserts.sort((a, b) => a.at - b.at)) {
      out += code.slice(cursor, at);
      out += files.map((f) => `import ${JSON.stringify(SharedStylesheetImports.posix(f))};\n`).join('');
      cursor = at;
    }
    out += code.slice(cursor);
    return { code: out, stylesheets: [...injected] };
  }

  /**
   * The stylesheets evaluating `specifier` (resolved from `fromDir`)
   * loads, in load order: each module's stylesheets and dependencies in
   * the order its statements name them.
   */
  async stylesheetsOf(specifier: string, fromDir: string): Promise<string[]> {
    const entry = await this.resolveModule(specifier, fromDir);
    if (entry === undefined) return [];
    const sheets: string[] = [];
    const seenSheets = new Set<string>();
    const visited = new Set<string>([entry]);
    const visit = async (file: string): Promise<void> => {
      for (const edge of await this.edgesOf(file)) {
        if (edge.kind === 'stylesheet') {
          if (!seenSheets.has(edge.file)) {
            seenSheets.add(edge.file);
            sheets.push(edge.file);
          }
        } else if (!visited.has(edge.file)) {
          visited.add(edge.file);
          await visit(edge.file);
        }
      }
    };
    await visit(entry);
    return sheets;
  }

  /** A static statement of the consumer that evaluates a shared module. */
  private loadsSharedModule(statement: LinkageStatement): boolean {
    if (statement.typeOnly) return false;
    const { defaultName, namespaceName, named } = statement.specifiers;
    if (
      !statement.sideEffect &&
      !statement.star &&
      defaultName === undefined &&
      namespaceName === undefined &&
      named.length > 0 &&
      named.every((n) => n.isType === true)
    ) {
      return false;
    }
    return this.sharedBare(statement.specifier);
  }

  private sharedBare(specifier: string): boolean {
    return (
      SharedSpecifierMatcher.isBareModuleSpecifier(specifier) &&
      !isBuiltin(specifier) &&
      this.isShared(specifier)
    );
  }

  private edgesOf(file: string): Promise<StylesheetEdge[]> {
    let pending = this.edges.get(file);
    if (pending === undefined) {
      pending = this.readEdges(file);
      this.edges.set(file, pending);
    }
    return pending;
  }

  private async readEdges(file: string): Promise<StylesheetEdge[]> {
    let source: string;
    try {
      source = fs.readFileSync(file, 'utf-8');
    } catch {
      return [];
    }
    if (!/\b(?:import|export)\b/.test(source)) return [];
    const statements = ModuleLinkageScanner.statements(source, file);
    if (statements === undefined) return [];
    const dir = path.dirname(file);
    const edges: StylesheetEdge[] = [];
    for (const statement of statements) {
      if (statement.typeOnly) continue;
      const [pathPart, query] = statement.specifier.split('?', 2);
      if (SharedStylesheetImports.STYLESHEET.test(pathPart)) {
        if (query !== undefined || SharedStylesheetImports.CSS_MODULE.test(pathPart)) continue;
        const sheet = await this.resolveFile(pathPart, dir, true);
        if (sheet !== undefined) edges.push({ kind: 'stylesheet', file: sheet });
        continue;
      }
      if (query !== undefined) continue;
      const target = await this.resolveModule(statement.specifier, dir);
      if (target === undefined) continue;
      if (statement.sideEffect && this.declaredSideEffectFree(target)) continue;
      edges.push({ kind: 'module', file: target });
    }
    return edges;
  }

  /** The script module `specifier` names from `fromDir`, if any. */
  private async resolveModule(specifier: string, fromDir: string): Promise<string | undefined> {
    if (specifier.startsWith('.') || path.isAbsolute(specifier)) {
      return this.resolveFile(specifier, fromDir, false);
    }
    if (!SharedSpecifierMatcher.isBareModuleSpecifier(specifier) || isBuiltin(specifier)) {
      return undefined;
    }
    // A package whose dependency closure ships no stylesheet loads none:
    // its modules are not read at all.
    const pkgJson = PackageJsonResolver.resolve(
      fromDir,
      SharedSetResolver.extractRootPackageName(specifier)
    );
    if (pkgJson !== undefined && !this.closureShipsStylesheets(path.dirname(pkgJson))) {
      return undefined;
    }
    const resolved = await this.resolveBare(specifier, fromDir);
    return resolved !== undefined && SharedStylesheetImports.SCRIPT.test(resolved)
      ? resolved
      : undefined;
  }

  /**
   * A relative/absolute path from `fromDir` (`exact` for stylesheets),
   * or a bare stylesheet specifier.
   */
  private async resolveFile(
    specifier: string,
    fromDir: string,
    exact: boolean
  ): Promise<string | undefined> {
    if (!specifier.startsWith('.') && !path.isAbsolute(specifier)) {
      return this.resolveBare(specifier, fromDir);
    }
    const base = path.resolve(fromDir, specifier);
    const candidates = exact
      ? [base]
      : [
          base,
          ...SharedStylesheetImports.EXTENSIONS.map((e) => base + e),
          ...SharedStylesheetImports.INDEX_FILES.map((f) => path.join(base, f)),
        ];
    for (const candidate of candidates) {
      if (SharedStylesheetImports.isFile(candidate)) return SharedStylesheetImports.real(candidate);
    }
    return undefined;
  }

  /**
   * A bare specifier: the package-relative module path form the barrel
   * rewrite writes (`pkg/dist/x.js`) when that file exists, otherwise the
   * file the package's own resolution (exports, browser) gives.
   */
  private async resolveBare(specifier: string, fromDir: string): Promise<string | undefined> {
    const root = SharedSetResolver.extractRootPackageName(specifier);
    const subpath = specifier.slice(root.length + 1);
    if (subpath !== '') {
      const pkgJson = PackageJsonResolver.resolve(fromDir, root);
      if (pkgJson !== undefined) {
        const direct = path.join(path.dirname(pkgJson), subpath);
        if (SharedStylesheetImports.isFile(direct)) return SharedStylesheetImports.real(direct);
      }
    }
    return this.entryResolver.resolve(specifier, fromDir);
  }

  /**
   * Whether the package at `packageDir`, or any package its declared
   * dependencies reach, holds a stylesheet file of its own.
   */
  private closureShipsStylesheets(packageDir: string): boolean {
    const known = this.reachesStylesheets.get(packageDir);
    if (known !== undefined) return known;
    const seen = new Set<string>([packageDir]);
    const queue = [packageDir];
    let ships = false;
    while (queue.length > 0 && !ships) {
      const dir = queue.shift() as string;
      if (this.reachesStylesheets.get(dir) === true || this.holdsStylesheet(dir)) {
        ships = true;
        break;
      }
      let json: Record<string, Record<string, string> | undefined>;
      try {
        json = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'));
      } catch {
        continue;
      }
      for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
        for (const name of Object.keys(json[field] ?? {})) {
          const dep = PackageJsonResolver.resolve(dir, name);
          if (dep === undefined) continue;
          const depDir = path.dirname(dep);
          if (seen.has(depDir) || this.reachesStylesheets.get(depDir) === false) continue;
          seen.add(depDir);
          queue.push(depDir);
        }
      }
    }
    this.reachesStylesheets.set(packageDir, ships);
    return ships;
  }

  /** Whether `packageDir` (its own files, `node_modules` aside) holds a stylesheet. */
  private holdsStylesheet(packageDir: string): boolean {
    const known = this.ownStylesheets.get(packageDir);
    if (known !== undefined) return known;
    const walk = (dir: string): boolean => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return false;
      }
      for (const entry of entries) {
        if (entry.isFile() && SharedStylesheetImports.STYLESHEET.test(entry.name)) return true;
      }
      return entries.some(
        (entry) => entry.isDirectory() && entry.name !== 'node_modules' && walk(path.join(dir, entry.name))
      );
    };
    const holds = walk(packageDir);
    this.ownStylesheets.set(packageDir, holds);
    return holds;
  }

  /** Whether the nearest package.json declares `file` side-effect free. */
  private declaredSideEffectFree(file: string): boolean {
    const pkg = this.packageOf(path.dirname(file));
    if (pkg === undefined) return false;
    const rel = path.relative(pkg.dir, file).split(path.sep).join('/');
    return BarrelRewritePolicy.declaresSideEffectFreedom(pkg.sideEffects, rel);
  }

  private packageOf(dir: string): { dir: string; sideEffects?: boolean | string[] } | undefined {
    if (this.sideEffectsByDir.has(dir)) return this.sideEffectsByDir.get(dir);
    let found: { dir: string; sideEffects?: boolean | string[] } | undefined;
    const pkgJson = path.join(dir, 'package.json');
    if (SharedStylesheetImports.isFile(pkgJson)) {
      try {
        const json = JSON.parse(fs.readFileSync(pkgJson, 'utf-8')) as {
          sideEffects?: boolean | string[];
        };
        found = { dir, sideEffects: json.sideEffects };
      } catch {
        found = { dir };
      }
    } else {
      const parent = path.dirname(dir);
      found = parent === dir ? undefined : this.packageOf(parent);
    }
    this.sideEffectsByDir.set(dir, found);
    return found;
  }

  private static isFile(file: string): boolean {
    try {
      return fs.statSync(file).isFile();
    } catch {
      return false;
    }
  }

  private static real(file: string): string {
    try {
      return fs.realpathSync(file);
    } catch {
      return file;
    }
  }

  private static posix(file: string): string {
    return file.split(path.sep).join('/');
  }
}
