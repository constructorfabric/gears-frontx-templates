/**
 * `BarrelImportRewriter` — rewrites named `import`/`export ... from`
 * statements whose specifier resolves to a barrel so they point at the
 * defining module instead. `resolveRedirect` answers, per
 * `(specifier, importedName)`, where the name is really defined — or
 * `undefined` to leave that name on the original specifier.
 *
 * Side-effect imports (`import 'x'`), namespace imports, `import type` /
 * `export type` statements, inline `type` specifiers, `export *` and
 * statements carrying import attributes are never rewritten: a namespace
 * names nothing to redirect, a type-only clause erases at compile time,
 * and a side-effect import must keep evaluating exactly what it asked
 * for. Statements are located by parsing the module
 * ({@link ModuleLinkageScanner.statements}), so text inside comments,
 * strings, template and regular-expression literals never matches; a
 * module that cannot be parsed is left as written.
 */

import {
  ModuleLinkageScanner,
  type ClauseSpecifiers,
} from './ModuleLinkageScanner';

/** The redirect a barrel resolver returns for one imported name. */
export interface BarrelRedirect {
  /** New specifier (relative, posix) pointing at the defining module. */
  specifier: string;
  /** The name as the defining module exports it (barrels may alias). */
  importedName: string;
  /**
   * Set when the redirect lands on another package's barrel that cannot
   * be skipped (a re-export chain across packages): that package and why
   * its barrel is evaluated.
   */
  evaluates?: { packageName: string; reason: string };
  /**
   * Set by a foreign resolver (a chain into another package): that
   * package's root name, and the package-relative module path of the
   * defining module — `''` when the redirect lands on the package's
   * entry specifier itself.
   */
  packageName?: string;
  modulePath?: string;
  /** That package's installed version, where the chain resolved it. */
  packageVersion?: string;
}

export class BarrelImportRewriter {
  /** Only a statement with a `from` clause can be rewritten. */
  private static readonly HAS_FROM = /\bfrom\b/;

  static rewrite(
    source: string,
    resolveRedirect: (
      specifier: string,
      importedName: string
    ) => BarrelRedirect | undefined,
    filename?: string
  ): { code: string; rewrites: number } {
    if (!BarrelImportRewriter.HAS_FROM.test(source)) return { code: source, rewrites: 0 };
    const statements = ModuleLinkageScanner.statements(source, filename);
    if (statements === undefined) return { code: source, rewrites: 0 };
    let rewrites = 0;
    let out = '';
    let cursor = 0;

    for (const stmt of statements) {
      if (stmt.typeOnly || stmt.sideEffect || stmt.star || stmt.hasAttributes) continue;
      const spec = stmt.specifier;
      const specifiers = stmt.specifiers;

      // Partition names into groups by the specifier they move to. Names
      // the resolver cannot place — and inline `type` specifiers — stay on
      // the original specifier.
      const groups = new Map<string, ClauseSpecifiers>();
      const push = (target: string, s: ClauseSpecifiers): void => {
        const existing = groups.get(target) ?? { named: [] };
        if (s.defaultName) existing.defaultName = s.defaultName;
        if (s.namespaceName) existing.namespaceName = s.namespaceName;
        existing.named.push(...s.named);
        groups.set(target, existing);
      };

      let movedAny = false;
      for (const n of specifiers.named) {
        if (n.isType) {
          push(spec, { named: [n] });
          continue;
        }
        const redirect = resolveRedirect(spec, n.imported);
        if (redirect) {
          push(redirect.specifier, {
            named: [{ imported: redirect.importedName, local: n.local }],
          });
          movedAny = true;
        } else {
          push(spec, { named: [n] });
        }
      }
      if (specifiers.defaultName) {
        const redirect = resolveRedirect(spec, 'default');
        if (redirect && redirect.importedName !== 'default') {
          // The barrel's default is a named export of its defining
          // module (`export { Thing as default } from './thing'`).
          push(redirect.specifier, {
            named: [{ imported: redirect.importedName, local: specifiers.defaultName }],
          });
        } else {
          push(redirect?.specifier ?? spec, {
            named: [],
            defaultName: specifiers.defaultName,
          });
        }
        if (redirect) movedAny = true;
      }
      if (specifiers.namespaceName) {
        push(spec, { named: [], namespaceName: specifiers.namespaceName });
      }

      if (!movedAny) continue;
      rewrites +=
        specifiers.named.length +
        (specifiers.defaultName ? 1 : 0) -
        (groups.get(spec)?.named.length ?? 0) -
        (groups.get(spec)?.defaultName ? 1 : 0);
      const replacement = [...groups.entries()]
        .map(
          ([target, s]) =>
            `${stmt.keyword} ${ModuleLinkageScanner.renderClause(s)} from '${target}';`
        )
        .join('\n');
      out += source.slice(cursor, stmt.start) + replacement;
      cursor = stmt.end;
    }
    out += source.slice(cursor);
    return { code: out, rewrites };
  }
}
