/**
 * `PackageExportPatternExpander` — expands one `exports` pattern
 * (`"./*"`, `"./features/*"`) into the concrete subpaths that are the
 * package's runtime entry candidates, so a pattern export joins the
 * complete entry set with what the package
 * ships to run — never with everything its directory tree happens to
 * hold.
 *
 * The expansion reads the pattern's *target*, not its key: the files
 * matching the target pattern under the production browser runtime
 * conditions the entry resolver applies (`browser`, `import`,
 * `module`, `default` — never `types`, `require` or tooling
 * conditions) are walked, and each match's `*` is substituted back
 * into the key. A file is a candidate only when the package ships it
 * as runtime JavaScript:
 *
 *  - its extension is a runtime JavaScript one (`.js`, `.mjs`, `.cjs`)
 *    — or the target pattern names the file's JavaScript-family
 *    extension explicitly (`"./*": "./src/*.ts"`), which makes that
 *    source the entry the package declares;
 *  - it is no declaration file, source map or other asset;
 *  - no path segment is a test directory (`__tests__`, `__mocks__`,
 *    `__fixtures__`, `__snapshots__`, `test`, `tests`) or a nested
 *    `node_modules`, and its name is no `*.test.*`/`*.spec.*` file.
 *
 * Subpaths a `null` target excludes, or that resolve elsewhere, are
 * settled by the entry resolver itself; the caller re-checks the file
 * each subpath resolves to with {@link isRuntimeCandidate}.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/** One concrete subpath a pattern expands to. */
export interface PatternExpansion {
  /** The concrete `exports` subpath (`./features/a`). */
  subpath: string;
  /** The target pattern's suffix after `*` (`.js`, `''`). */
  targetSuffix: string;
}

export class PackageExportPatternExpander {
  /** Conditions the entry resolver applies (esbuild, browser, ESM import). */
  private static readonly RUNTIME_CONDITIONS = new Set(['browser', 'import', 'module', 'default']);
  private static readonly RUNTIME_JS_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
  /** JavaScript-family extensions a target may name explicitly. */
  private static readonly SOURCE_JS_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx']);
  private static readonly EXCLUDED_SEGMENTS = new Set([
    '__tests__',
    '__mocks__',
    '__fixtures__',
    '__snapshots__',
    'test',
    'tests',
    'node_modules',
  ]);
  private static readonly TEST_FILE = /\.(?:test|spec)\.[^/]+$/;
  private static readonly DECLARATION_FILE = /\.d\.[cm]?ts$/;

  /**
   * The concrete subpaths `key` expands to under `target` (the `exports`
   * value for that key). A key without `*` is itself the only subpath.
   */
  static expand(packageDir: string, key: string, target: unknown): PatternExpansion[] {
    if (!key.includes('*')) return [{ subpath: key, targetSuffix: '' }];
    const [keyPrefix, keySuffix] = PackageExportPatternExpander.split(key);
    const out = new Map<string, PatternExpansion>();
    for (const pattern of PackageExportPatternExpander.runtimeTargets(target)) {
      if (!pattern.startsWith('./')) continue;
      const parts = PackageExportPatternExpander.split(pattern);
      if (parts.length !== 2) continue;
      const [targetPrefix, targetSuffix] = parts;
      const walkRoot = path.join(packageDir, targetPrefix.slice(2, targetPrefix.lastIndexOf('/') + 1));
      for (const rel of PackageExportPatternExpander.files(packageDir, walkRoot)) {
        const dotted = `./${rel}`;
        if (
          dotted.length < targetPrefix.length + targetSuffix.length ||
          !dotted.startsWith(targetPrefix) ||
          !dotted.endsWith(targetSuffix)
        ) {
          continue;
        }
        if (!PackageExportPatternExpander.isRuntimeCandidate(rel, targetSuffix)) continue;
        const star = dotted.slice(targetPrefix.length, dotted.length - targetSuffix.length);
        const subpath = `${keyPrefix}${star}${keySuffix}`;
        if (!out.has(subpath)) out.set(subpath, { subpath, targetSuffix });
      }
    }
    return [...out.values()].sort((a, b) => (a.subpath < b.subpath ? -1 : a.subpath > b.subpath ? 1 : 0));
  }

  /**
   * Whether `rel` (a posix path relative to the package dir) is a file
   * the package ships as runtime JavaScript — or one `targetSuffix`
   * names by its JavaScript-family extension.
   */
  static isRuntimeCandidate(rel: string, targetSuffix: string): boolean {
    const segments = rel.split('/');
    const name = segments[segments.length - 1];
    if (segments.slice(0, -1).some((s) => PackageExportPatternExpander.EXCLUDED_SEGMENTS.has(s))) return false;
    if (PackageExportPatternExpander.TEST_FILE.test(name)) return false;
    if (PackageExportPatternExpander.DECLARATION_FILE.test(name)) return false;
    const ext = path.extname(name);
    if (PackageExportPatternExpander.RUNTIME_JS_EXTENSIONS.has(ext)) return true;
    return (
      PackageExportPatternExpander.SOURCE_JS_EXTENSIONS.has(ext) &&
      // `'x' +` so a bare-extension suffix (`.ts`) is read as one.
      path.extname(`x${targetSuffix}`) === ext
    );
  }

  /** `a*b` → `['a', 'b']`; more than one `*` yields more parts. */
  private static split(pattern: string): string[] {
    return pattern.split('*');
  }

  /**
   * Every string target reachable from `target` through the runtime
   * conditions (arrays contribute each element; `null` nothing).
   */
  private static runtimeTargets(target: unknown): string[] {
    if (typeof target === 'string') return [target];
    if (Array.isArray(target)) return target.flatMap((t) => PackageExportPatternExpander.runtimeTargets(t));
    if (target === null || typeof target !== 'object') return [];
    const out: string[] = [];
    for (const [condition, value] of Object.entries(target)) {
      if (!PackageExportPatternExpander.RUNTIME_CONDITIONS.has(condition)) continue;
      out.push(...PackageExportPatternExpander.runtimeTargets(value));
    }
    return out;
  }

  /**
   * The `exports` map's subpath entries (`'.'`, `'./x'`, `'./*'`) with
   * their targets — the conditional-root form counts as the `'.'`
   * entry. Used both for expansion and for deriving the deep-path
   * spellings a pattern subpath gives a shipped module.
   */
  static exportsEntries(exportsMap: unknown): Array<[string, unknown]> {
    if (exportsMap === undefined || exportsMap === null) return [];
    if (typeof exportsMap === 'string' || Array.isArray(exportsMap)) {
      return [['.', exportsMap]];
    }
    if (typeof exportsMap !== 'object') return [];
    const record = exportsMap as Record<string, unknown>;
    const keys = Object.keys(record);
    // Conditional-root form: { import: ..., require: ... }.
    if (keys.every((k) => !k.startsWith('.'))) return [['.', exportsMap]];
    return keys.map((k) => [k, record[k]]);
  }

  /**
   * The specifier subpaths a pattern export gives `moduleRel` (a posix
   * path relative to the package dir): for each `exports` key with `*`
   * and each runtime-condition target with `*`, if `./moduleRel`
   * matches the target pattern the same `*` substituted into the key
   * is a specifier spelling that resolves to the module — e.g.
   * `'./*': './esm/*'` gives `esm/x/y.mjs` the spelling `x/y.mjs`
   * and returns each spelling without its leading `./`.
   */
  static spellingsForModule(exportsMap: unknown, moduleRel: string): string[] {
    const out = new Set<string>();
    const dotted = `./${moduleRel}`;
    for (const [key, target] of PackageExportPatternExpander.exportsEntries(exportsMap)) {
      if (!key.includes('*')) continue;
      const keyParts = PackageExportPatternExpander.split(key);
      if (keyParts.length !== 2) continue;
      for (const t of PackageExportPatternExpander.runtimeTargets(target)) {
        if (!t.startsWith('./') || !t.includes('*')) continue;
        const targetParts = PackageExportPatternExpander.split(t);
        if (targetParts.length !== 2) continue;
        const [targetPrefix, targetSuffix] = targetParts;
        if (
          dotted.length >= targetPrefix.length + targetSuffix.length &&
          dotted.startsWith(targetPrefix) &&
          dotted.endsWith(targetSuffix)
        ) {
          const star = dotted.slice(
            targetPrefix.length,
            dotted.length - targetSuffix.length
          );
          const spelling = `${keyParts[0]}${star}${keyParts[1]}`;
          out.add(spelling.startsWith('./') ? spelling.slice(2) : spelling);
        }
      }
    }
    return [...out].sort();
  }

  /**
   * Every file under `dir` as a posix path relative to `packageDir`,
   * skipping excluded directories; each real directory is walked once.
   */
  private static files(packageDir: string, dir: string): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    const walk = (current: string): void => {
      let real: string;
      try {
        real = fs.realpathSync(current);
      } catch {
        return;
      }
      if (seen.has(real)) return;
      seen.add(real);
      let names: fs.Dirent[];
      try {
        names = fs.readdirSync(current, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of names) {
        const full = path.join(current, entry.name);
        let isDir = entry.isDirectory();
        let isFile = entry.isFile();
        if (entry.isSymbolicLink()) {
          try {
            const stat = fs.statSync(full);
            isDir = stat.isDirectory();
            isFile = stat.isFile();
          } catch {
            continue;
          }
        }
        if (isDir) {
          if (!PackageExportPatternExpander.EXCLUDED_SEGMENTS.has(entry.name)) walk(full);
        } else if (isFile) {
          out.push(path.relative(packageDir, full).split(path.sep).join('/'));
        }
      }
    };
    walk(dir);
    return out;
  }
}
