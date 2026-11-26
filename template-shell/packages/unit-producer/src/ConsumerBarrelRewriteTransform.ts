/**
 * `ConsumerBarrelRewriteTransform` — the consumer build's source
 * transform for barrel handling: rewrites the named and default
 * imports (and `export … from` re-exports) a consumer module takes from
 * a shared package's barrel to the modules that define them, through a
 * {@link ConsumerBarrelResolver}. Bundler-agnostic — a Vite/Rollup
 * plugin calls it from its `transform` hook on the consumer's own
 * modules, before TypeScript is stripped, so the emitted chunks import,
 * and their reachability roots name, only the units that define used
 * bindings.
 *
 * Never rewritten, and recorded as evaluating the barrel when the
 * package has one: namespace imports (`import * as ns`), `export *`
 * re-exports, explicit side-effect imports (`import 'pkg'`) and dynamic
 * `import('pkg')`. Type-only statements and inline `type` specifiers
 * erase at compile time and are left alone.
 */

import { BarrelImportRewriter } from './BarrelImportRewriter';
import type {
  ConsumerBarrelRedirect,
  ConsumerBarrelResolver,
} from './ConsumerBarrelResolver';
import type { ConsumerBarrelRewriteLedger } from './ConsumerBarrelRewriteLedger';
import { ModuleLinkageScanner } from './ModuleLinkageScanner';
import { NamespaceAccessRewriter } from './NamespaceAccessRewriter';
import { SharedSetResolver } from './SharedSetResolver';
import { SharedSpecifierMatcher } from './SharedSpecifierMatcher';

/** One import statement the transform found, by its barrel effect. */
interface FoundImport {
  specifier: string;
  /** Why it evaluates the whole module, when it names no binding. */
  wholeModule?: string;
}

export class ConsumerBarrelRewriteTransform {
  private static readonly SOURCE_FILE = /\.(?:[cm]?[jt]sx?)$/;

  private readonly resolver: ConsumerBarrelResolver;
  private readonly ledger: ConsumerBarrelRewriteLedger;
  private readonly accept?: (
    redirect: ConsumerBarrelRedirect,
    barrelName: string
  ) => string | undefined;

  constructor(params: {
    resolver: ConsumerBarrelResolver;
    ledger: ConsumerBarrelRewriteLedger;
    /**
     * Decides each redirect before it is applied, when the units
     * answering it are already known (a shared unit importing another
     * shared package, produced first): returns why no unit answers it,
     * and the binding then stays on the barrel with that reason
     * recorded — the same rule {@link ConsumerBarrelFallback} applies
     * after the fact to consumer chunks. Absent: every redirect stands.
     */
    accept?: (redirect: ConsumerBarrelRedirect, barrelName: string) => string | undefined;
  }) {
    this.resolver = params.resolver;
    this.ledger = params.ledger;
    this.accept = params.accept;
  }

  /**
   * Whether a module id is the consumer's own JavaScript/TypeScript
   * source: no installed package, no virtual module, no query.
   */
  static isConsumerModule(id: string): boolean {
    if (id.startsWith('\0') || id.includes('?')) return false;
    if (id.split(/[\\/]/).includes('node_modules')) return false;
    return ConsumerBarrelRewriteTransform.SOURCE_FILE.test(id);
  }

  /**
   * Rewrites one consumer module's `code`; `null` when nothing moved
   * off a barrel. Bypasses are recorded either way. `id` (the module's
   * file name) selects the grammar — TypeScript, JSX — it is parsed with.
   */
  async transform(
    code: string,
    id?: string
  ): Promise<{ code: string; rewrites: number } | null> {
    const found = ConsumerBarrelRewriteTransform.findImports(code, id);
    const bare = found
      .map((f) => f.specifier)
      .filter(SharedSpecifierMatcher.isBareModuleSpecifier);
    if (bare.length === 0) return null;
    await this.resolver.prepare(bare);

    // A side-effect import of a package whose `sideEffects` declaration
    // covers only non-JavaScript assets can have no JS effect — it is
    // planning-time noise that would otherwise name the package a
    // reachability root and pull its units. It is pruned here, before
    // the barrel rewrite rewrites what remains.
    const pruned = this.pruneAssetOnlySideEffectImports(code, id);

    // A namespace import read only through static member
    // accesses (`Select.Item`) is rewritten to the named imports of
    // the members actually read, each carried to its defining module
    // like any named binding. A namespace used dynamically — or one
    // whose members cannot all be placed — stays exactly as written.
    const ns = this.rewriteNamespaceAccesses(pruned.code, id);

    for (const imp of found) {
      if (imp.wholeModule === undefined) continue;
      // A namespace import fully rewritten above evaluates no barrel.
      if (
        imp.wholeModule === 'namespace import' &&
        ns.rewrittenSpecifiers.has(imp.specifier)
      ) {
        continue;
      }
      // A pruned side-effect import is already ledgered `not-needed`;
      // it is not "still evaluated through the barrel".
      if (
        imp.wholeModule === 'side-effect import' &&
        pruned.specifiers.has(imp.specifier)
      ) {
        continue;
      }
      const classification = this.resolver.classification(imp.specifier);
      if (classification.kind === 'barrel') {
        this.ledger.recordKept(
          classification.packageName,
          `${imp.wholeModule} of "${imp.specifier}" evaluates the barrel`
        );
      } else if (classification.kind === 'bypass') {
        this.ledger.recordKept(classification.packageName, classification.reason);
      } else if (classification.kind === 'not-needed') {
        this.ledger.recordNotNeeded(classification.packageName);
      }
    }

    const { code: rewritten0, rewrites } = BarrelImportRewriter.rewrite(
      ns.code,
      (specifier, importedName) => {
        const answer = this.resolver.resolve(specifier, importedName);
        switch (answer.kind) {
          case 'redirect': {
            const rejected = this.accept?.(answer.redirect, importedName);
            if (rejected !== undefined) {
              this.ledger.recordKept(
                SharedSetResolver.extractRootPackageName(specifier),
                `"${specifier}" evaluated: ${rejected}`
              );
              return undefined;
            }
            this.ledger.recordRewrite({
              ...answer.redirect,
              barrelSpecifier: specifier,
              barrelName: importedName,
            });
            return {
              specifier: answer.redirect.specifier,
              importedName: answer.redirect.importedName,
            };
          }
          case 'bypass':
            this.ledger.recordKept(answer.packageName, answer.reason);
            return undefined;
          case 'not-needed':
            this.ledger.recordNotNeeded(answer.packageName);
            return undefined;
          default:
            return undefined;
        }
      },
      id
    );
    const rewritten = rewritten0;
    if (
      (rewrites === 0 || rewritten === ns.code) &&
      pruned.removed === 0 &&
      ns.rewrites === 0
    ) {
      return null;
    }
    return { code: rewritten, rewrites: rewrites + pruned.removed + ns.rewrites };
  }

  /**
   * The namespace pass: every `import * as ns from '<bare>'` read only
   * through static `ns.Member` accesses becomes named imports of the
   * members read — carried to their defining modules through the same
   * resolver/`accept` path a named binding takes. Members resolving
   * to the specifier's own entry (`not-needed`) are imported from the
   * specifier itself. One unplaceable member or dynamic use leaves
   * the whole namespace import — and its recorded barrel evaluation —
   * untouched.
   */
  private rewriteNamespaceAccesses(
    code: string,
    id?: string
  ): { code: string; rewrites: number; rewrittenSpecifiers: Set<string> } {
    const empty = { code, rewrites: 0, rewrittenSpecifiers: new Set<string>() };
    const namespaces = NamespaceAccessRewriter.analyze(code, id);
    if (namespaces === undefined || namespaces.size === 0) return empty;
    const bound = NamespaceAccessRewriter.boundIdentifiers(code, id) ?? new Set<string>();
    const statements = ModuleLinkageScanner.statements(code, id) ?? [];

    const edits: { start: number; end: number; text: string }[] = [];
    const rewrittenSpecifiers = new Set<string>();
    let rewrites = 0;
    for (const [local, entry] of namespaces) {
      if (!entry.use.onlyMembers || entry.use.accesses.length === 0) continue;
      const specifier = entry.specifier;
      if (!SharedSpecifierMatcher.isBareModuleSpecifier(specifier)) continue;
      const members = [...new Set(entry.use.accesses.map((a) => a.member))].sort();

      // Every member must be placeable before any edit stands. Each
      // member is bound under a collision-free local recorded in
      // `memberLocals` (`ns_Member` when the member's own name is
      // taken in the module).
      const groups = new Map<string, { imported: string; local: string }[]>();
      const memberLocals = new Map<string, string>();
      const redirects: { redirect: ConsumerBarrelRedirect; barrelName: string }[] = [];
      let placeable = true;
      for (const member of members) {
        const answer = this.resolver.resolve(specifier, member);
        let target: string;
        let imported: string;
        if (answer.kind === 'redirect') {
          const rejected = this.accept?.(answer.redirect, member);
          if (rejected !== undefined) {
            this.ledger.recordKept(
              SharedSetResolver.extractRootPackageName(specifier),
              `"${specifier}" evaluated: ${rejected}`
            );
            placeable = false;
            break;
          }
          redirects.push({ redirect: answer.redirect, barrelName: member });
          target = answer.redirect.specifier;
          imported = answer.redirect.importedName;
        } else if (answer.kind === 'not-needed') {
          target = specifier;
          imported = member;
        } else {
          placeable = false;
          break;
        }
        const localName = NamespaceAccessRewriter.freeName(member, local, bound);
        bound.add(localName);
        memberLocals.set(member, localName);
        const group = groups.get(target) ?? [];
        group.push({ imported, local: localName });
        groups.set(target, group);
      }
      if (!placeable) continue;

      const stmt = statements.find(
        (s) =>
          s.keyword === 'import' &&
          s.specifier === specifier &&
          s.specifiers.namespaceName === local
      );
      if (stmt === undefined) continue;
      // A default binding sharing the statement (`import D, * as ns`)
      // keeps importing from the specifier as written.
      const defaultName = stmt.specifiers.defaultName;
      const clauses = [
        ...(defaultName !== undefined
          ? [`import ${ModuleLinkageScanner.renderClause({ named: [], defaultName })} from '${specifier}';`]
          : []),
        ...[...groups.entries()].map(
          ([target, named]) =>
            `import ${ModuleLinkageScanner.renderClause({
              named: named.map((n) => ({ imported: n.imported, local: n.local })),
            })} from '${target}';`
        ),
      ].join('\n');
      edits.push({ start: stmt.start, end: stmt.end, text: clauses });
      for (const access of entry.use.accesses) {
        edits.push({
          start: access.start,
          end: access.end,
          text: memberLocals.get(access.member) ?? access.member,
        });
      }
      for (const r of redirects) {
        this.ledger.recordRewrite({
          ...r.redirect,
          barrelSpecifier: specifier,
          barrelName: r.barrelName,
        });
      }
      rewrittenSpecifiers.add(specifier);
      rewrites += members.length;
    }
    if (edits.length === 0) return empty;
    let out = code;
    for (const edit of edits.sort((a, b) => b.start - a.start)) {
      out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
    }
    return { code: out, rewrites, rewrittenSpecifiers };
  }

  /**
   * Removes `import 'pkg';` statements whose package's `sideEffects`
   * declaration leaves no JavaScript side effect possible
   * (`BarrelRewritePolicy.declaresOnlyAssetSideEffects`, via the
   * resolver). Each removal is ledgered as `not-needed`: the package's
   * barrel — and its units — never had to answer for the import.
   */
  private pruneAssetOnlySideEffectImports(
    code: string,
    id?: string
  ): { code: string; removed: number; specifiers: ReadonlySet<string> } {
    const parsed = ModuleLinkageScanner.imports(code, id);
    if (parsed === undefined) {
      return { code, removed: 0, specifiers: new Set() };
    }
    const ranges: Array<{ start: number; end: number; specifier: string }> = [];
    for (const stmt of parsed.statements) {
      if (!stmt.sideEffect || stmt.typeOnly) continue;
      if (!SharedSpecifierMatcher.isBareModuleSpecifier(stmt.specifier)) continue;
      if (!this.resolver.hasOnlyAssetSideEffects(stmt.specifier)) continue;
      ranges.push({ start: stmt.start, end: stmt.end, specifier: stmt.specifier });
      this.ledger.recordNotNeeded(
        SharedSetResolver.extractRootPackageName(stmt.specifier)
      );
    }
    if (ranges.length === 0) {
      return { code, removed: 0, specifiers: new Set() };
    }
    let out = code;
    for (const range of ranges.sort((a, b) => b.start - a.start)) {
      // Swallow a trailing line break so no blank line is left behind.
      let end = range.end;
      if (out[end] === '\r' && out[end + 1] === '\n') end += 2;
      else if (out[end] === '\n') end += 1;
      out = out.slice(0, range.start) + out.slice(end);
    }
    return {
      code: out,
      removed: ranges.length,
      specifiers: new Set(ranges.map((r) => r.specifier)),
    };
  }

  /**
   * Every static import/re-export, side-effect import and literal
   * dynamic import in `code`, read from its parsed AST so text inside
   * comments and literals never matches. Unparseable code has none.
   */
  private static findImports(code: string, id?: string): FoundImport[] {
    if (!code.includes('import') && !code.includes('export')) return [];
    const parsed = ModuleLinkageScanner.imports(code, id);
    if (parsed === undefined) return [];
    const found: FoundImport[] = [];
    for (const stmt of parsed.statements) {
      if (stmt.typeOnly) continue;
      const specifier = stmt.specifier;
      if (stmt.sideEffect) {
        found.push({ specifier, wholeModule: 'side-effect import' });
      } else if (stmt.keyword === 'export' && stmt.star) {
        found.push({ specifier, wholeModule: '`export *`' });
      } else if (stmt.specifiers.namespaceName !== undefined) {
        found.push({ specifier, wholeModule: 'namespace import' });
      } else {
        found.push({ specifier });
      }
    }
    for (const specifier of parsed.dynamicImports) {
      found.push({ specifier, wholeModule: 'dynamic import' });
    }
    return found;
  }
}
