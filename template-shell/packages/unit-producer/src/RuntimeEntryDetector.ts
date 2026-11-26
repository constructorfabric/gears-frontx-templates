/**
 * `RuntimeEntryDetector` — whether an installed package is runtime
 * browser code at all, read off its `package.json` entry fields and the
 * files they name.
 *
 * An entry target counts only when it names a script file — directly,
 * through an extensionless path that resolves to one, or as an
 * `exports` pattern whose matches include one. Type declarations
 * (the `types`/`typings` conditions, `x.d.ts`, `x.d.css.ts`),
 * stylesheets, fonts, licences and any other file a package exports
 * never count. A package declaring no entry fields counts when an
 * `index` JavaScript file exists at its root (npm's default entry).
 *
 * A package without a runtime entry — a webfont or stylesheet package
 * is the common case — has nothing a shared unit could carry; a
 * consuming build handles its files as assets and never shares it.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/** The `package.json` entry fields the detector reads. */
export interface RuntimeEntryFields {
  main?: string;
  module?: string;
  browser?: unknown;
  exports?: unknown;
}

export class RuntimeEntryDetector {
  /** Extensions of a file a package entry loads as JavaScript. */
  private static readonly SCRIPT = /\.(?:[cm]?[jt]sx?)$/i;
  /** Type declarations (`x.d.ts`, `x.d.css.ts`) — never runtime code. */
  private static readonly DECLARATION = /\.d(?:\.[^./]+)?\.[cm]?ts$/i;
  /** `exports` conditions naming type declarations, not runtime files. */
  private static readonly TYPE_CONDITIONS = new Set(['types', 'typings']);
  /** What an extensionless target resolves through. */
  private static readonly IMPLIED_SCRIPT_FILES = [
    '.js',
    '.mjs',
    '.cjs',
    '/index.js',
    '/index.mjs',
    '/index.cjs',
  ];

  /** Whether the package at `packageDir` has a runtime JavaScript entry. */
  static hasRuntimeEntry(pkg: RuntimeEntryFields, packageDir: string): boolean {
    const targets = RuntimeEntryDetector.entryTargets(pkg);
    if (targets.length === 0) {
      return ['index.js', 'index.mjs', 'index.cjs'].some((f) =>
        RuntimeEntryDetector.isFile(path.join(packageDir, f))
      );
    }
    return targets.some((target) =>
      RuntimeEntryDetector.isScriptTarget(target, packageDir)
    );
  }

  /** Whether one entry target names (or, as a pattern, matches) a script file. */
  private static isScriptTarget(target: string, packageDir: string): boolean {
    const { SCRIPT, DECLARATION } = RuntimeEntryDetector;
    const star = target.indexOf('*');
    if (star === -1) {
      if (DECLARATION.test(target)) return false;
      if (SCRIPT.test(target)) return true;
      if (path.extname(target) !== '') return false;
      const file = path.join(packageDir, target);
      if (RuntimeEntryDetector.isFile(file)) return false;
      return RuntimeEntryDetector.IMPLIED_SCRIPT_FILES.some((suffix) =>
        RuntimeEntryDetector.isFile(file + suffix)
      );
    }
    const prefix = target.slice(0, star);
    const suffix = target.slice(star + 1);
    if (DECLARATION.test(suffix)) return false;
    if (SCRIPT.test(suffix)) return true;
    if (path.extname(suffix) !== '') return false;
    const base = path.join(packageDir, prefix);
    const walkRoot = prefix.endsWith('/') ? base : path.dirname(base);
    const stack = [walkRoot];
    while (stack.length > 0) {
      const dir = stack.pop()!;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'node_modules') stack.push(full);
          continue;
        }
        if (
          full.startsWith(base) &&
          full.endsWith(suffix) &&
          SCRIPT.test(full) &&
          !DECLARATION.test(full)
        ) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Every file an `exports`/`main`/`module`/`browser` field points at,
   * minus the targets of type-declaration conditions.
   */
  private static entryTargets(pkg: RuntimeEntryFields): string[] {
    const targets: string[] = [];
    const collect = (value: unknown): void => {
      if (typeof value === 'string') {
        targets.push(value);
      } else if (Array.isArray(value)) {
        value.forEach(collect);
      } else if (value !== null && typeof value === 'object') {
        for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
          if (!RuntimeEntryDetector.TYPE_CONDITIONS.has(key)) collect(inner);
        }
      }
    };
    collect(pkg.exports);
    for (const field of [pkg.main, pkg.module]) {
      if (typeof field === 'string') targets.push(field);
    }
    if (typeof pkg.browser === 'string') targets.push(pkg.browser);
    return targets;
  }

  private static isFile(file: string): boolean {
    try {
      return fs.statSync(file).isFile();
    } catch {
      return false;
    }
  }
}
