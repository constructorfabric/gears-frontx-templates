/**
 * `ExternalModuleKind` — whether a bare external specifier resolves to
 * an ES module or a CommonJS module, synchronously, as the bundler's
 * own resolution sees it (`browser`/`production`/`import`/`module`
 * conditions, `browser`/`module`/`main` fallbacks).
 *
 * `@rollup/plugin-commonjs` cannot classify a specifier it never
 * resolves — externalized bare imports stay bare — so `require()` of
 * an ESM external would emit a default import against a chunk with no
 * default export (`import x from 'esm-pkg'` is a load-time
 * SyntaxError). The plugin's `esmExternals` hook asks this class per
 * specifier: ESM externals get namespace-based `require` proxies —
 * exactly Node's `require(esm)` namespace semantics — while CJS
 * externals keep the default import their facade chunk answers.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { ModuleLinkageScanner } from './ModuleLinkageScanner';
import { PackageJsonResolver } from './PackageJsonResolver';
import { SharedSetResolver } from './SharedSetResolver';
import { SharedSpecifierMatcher } from './SharedSpecifierMatcher';

/** Resolution conditions, in preference order (bundler browser build). */
const CONDITIONS = ['production', 'browser', 'import', 'module', 'default'];

interface PackageJsonShape {
  type?: string;
  exports?: unknown;
  browser?: unknown;
  module?: string;
  main?: string;
}

export class ExternalModuleKind {
  private readonly fromDirs: string[];
  private readonly cache = new Map<string, boolean>();
  private readonly packages = new Map<string, PackageJsonShape | undefined>();

  /**
   * `fromDirs` — every directory view the package's bare specifiers
   * may resolve through: its resolve dir, install dir and real dir
   * (linked packages resolve their dependencies through the link
   * target's tree, not the consumer's installed copy).
   */
  constructor(fromDirs: string | readonly string[]) {
    this.fromDirs = (Array.isArray(fromDirs) ? fromDirs : [fromDirs]).map(
      (d) => path.resolve(d)
    );
  }

  /**
   * Whether `specifier` resolves to an ES module — `false` for
   * CommonJS, non-bare ids and anything that cannot be classified
   * (the plugin's default behaviour then stands).
   */
  isEsm(specifier: string): boolean {
    const cached = this.cache.get(specifier);
    if (cached !== undefined) return cached;
    const answer = this.classify(specifier);
    this.cache.set(specifier, answer);
    return answer;
  }

  private classify(specifier: string): boolean {
    if (!SharedSpecifierMatcher.isBareModuleSpecifier(specifier)) return false;
    const root = SharedSetResolver.extractRootPackageName(specifier);
    const pkgJsonPath = this.fromDirs
      .map((dir) => PackageJsonResolver.resolve(dir, root))
      .find((p): p is string => p !== undefined);
    if (pkgJsonPath === undefined) return false;
    const json = this.packageJson(pkgJsonPath);
    if (json === undefined) return false;
    const file = this.entryFile(json, specifier.slice(root.length), path.dirname(pkgJsonPath));
    if (file === undefined) return false;
    if (file.endsWith('.mjs')) return true;
    if (file.endsWith('.cjs')) return false;
    if (json.type === 'module') return true;
    if (json.type === 'commonjs') return false;
    // A `.js` file in a package without an explicit `type` is the
    // ambiguous case the bundler resolves by syntax: dual packages
    // ship `lib/esm/*.js` behind an `import` condition, mixed modules
    // carry both ESM `import`/`export` and CJS `require()`/`module
    // exports`. The bundler treats the file by its syntax — so does
    // the classifier. A file with no statements at all (comments
    // alone, or a freshly-touched empty file) has no CJS evidence:
    // the safer default is ESM (a default import against an empty
    // module is a no-op; the reverse — CJS interop on an empty ESM
    // entry — would break named imports the file does not declare).
    try {
      const source = fs.readFileSync(file, 'utf-8');
      const linkage = new ModuleLinkageScanner().scan(source, file);
      if (linkage.ownExports.size > 0 || linkage.starExports.length > 0) {
        return true;
      }
      // CJS evidence: literal `require('x')` calls or opaque
      // `require(<expr>)` (the `module.exports = …` shape is
      // observable through `require` reexports the lexer reports).
      // A file carrying any of them is CommonJS by syntax.
      const edges = ModuleLinkageScanner.loadEdges(source, file);
      if (
        edges !== undefined &&
        (edges.requireCalls.length > 0 || edges.opaqueRequires.length > 0)
      ) {
        return false;
      }
      // No ESM exports, no CJS requires — statement-less `.js`: the
      // bundler's own default for a parseable but empty file under
      // `@rollup/plugin-commonjs` is to leave it as ESM, and so is
      // ours.
      return true;
    } catch {
      return false;
    }
  }

  private packageJson(pkgJsonPath: string): PackageJsonShape | undefined {
    if (this.packages.has(pkgJsonPath)) return this.packages.get(pkgJsonPath);
    let json: PackageJsonShape | undefined;
    try {
      json = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8')) as PackageJsonShape;
    } catch {
      json = undefined;
    }
    this.packages.set(pkgJsonPath, json);
    return json;
  }

  /**
   * The file `sub` (`''` or `/path` after the package root) resolves
   * to: the `exports` map under the bundler's conditions when present,
   * the declared runtime fields otherwise; a deep subpath without an
   * exports map resolves to the file itself.
   */
  private entryFile(
    json: PackageJsonShape,
    sub: string,
    packageDir: string
  ): string | undefined {
    if (json.exports === undefined || json.exports === null) {
      if (sub !== '') return path.join(packageDir, sub);
      const main =
        typeof json.browser === 'string'
          ? json.browser
          : json.module ?? json.main ?? 'index.js';
      return path.join(packageDir, main);
    }
    const key = sub === '' ? '.' : `.${sub}`;
    const target = ExternalModuleKind.exportsTarget(json.exports, key);
    return target === undefined ? undefined : path.join(packageDir, target);
  }

  /**
   * The export target of `key` ('.' or './sub'): the exact key first,
   * then `*` patterns (segment matching with star substitution).
   */
  private static exportsTarget(exports: unknown, key: string): string | undefined {
    if (typeof exports !== 'object' || exports === null) return undefined;
    const map = exports as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(map, key)) {
      return ExternalModuleKind.cond(map[key]);
    }
    for (const [k, v] of Object.entries(map)) {
      if (!k.includes('*')) continue;
      const starAt = k.indexOf('*');
      const pre = k.slice(0, starAt);
      const suf = k.slice(starAt + 1);
      if (!key.startsWith(pre) || !key.endsWith(suf)) continue;
      const star = key.slice(pre.length, key.length - suf.length);
      return ExternalModuleKind.cond(v)?.replace(/\*/g, star);
    }
    return undefined;
  }

  /** Follows one `exports` condition node to its file target. */
  private static cond(node: unknown): string | undefined {
    if (typeof node === 'string') return node;
    if (Array.isArray(node)) {
      for (const item of node) {
        const t = ExternalModuleKind.cond(item);
        if (t !== undefined) return t;
      }
      return undefined;
    }
    if (typeof node === 'object' && node !== null) {
      const record = node as Record<string, unknown>;
      for (const condition of CONDITIONS) {
        if (Object.prototype.hasOwnProperty.call(record, condition)) {
          const t = ExternalModuleKind.cond(record[condition]);
          if (t !== undefined) return t;
        }
      }
    }
    return undefined;
  }
}
