/**
 * `ModuleLinkageScanner` — reads a module's linkage from its parsed AST
 * ({@link EsmSourceParser}): what it re-exports, defines and imports for
 * side effects, and whether every top-level statement is linkage alone.
 * Any statement that evaluates something (an expression, a call, a value
 * declaration) makes the module impure, so a module with real side
 * effects is never treated as a barrel. A directive prologue, a bare
 * string-literal statement and TypeScript type-only declarations
 * evaluate nothing.
 *
 * {@link statements} lists the module's static `import`/`export … from`
 * statements with their source spans and {@link imports} adds its
 * literal `import()` specifiers — what the barrel rewriters edit and
 * classify. {@link loadEdges} adds literal `require()` calls instead —
 * what evaluating a CommonJS or UMD build loads. A module no grammar
 * accepts has impure, empty linkage and no statements.
 */

import { EsmSourceParser, type EsmNode, type EsmProgram } from './EsmSourceParser';
import { ProductionConditionEvaluator } from './ProductionConditionEvaluator';

/** A module's linkage as the barrel rewriter reads it. */
export interface ModuleLinkageLite {
  /**
   * Exported name → the specifier and imported name behind it
   * (`export { b as a } from './x'`, or
   * `import { b } from './x'; export { b as a }`).
   */
  reExports: Map<string, { from: string; name: string }>;
  /** `export * from '...'` specifiers. */
  starExports: string[];
  /** Names the module defines itself. */
  ownExports: Set<string>;
  /**
   * Bare side-effect imports (`import './polyfill.js'`). A barrel carrying
   * one is only pure when the target is itself side-effect free.
   */
  sideEffectImports: string[];
  /** Every top-level statement is an import or export declaration. */
  isPure: boolean;
}

/** A static `import`/`export` clause's specifiers. */
export interface ClauseSpecifiers {
  /** Local identifier of a default import, when present. */
  defaultName?: string;
  /** Local identifier of a namespace import (`* as x`), when present. */
  namespaceName?: string;
  /**
   * `{ imported as local }` pairs; for `export { a as b } from`,
   * `imported` is `a` and `local` is `b`. `isType` marks inline `type`
   * specifiers.
   */
  named: Array<{ imported: string; local: string; isType?: boolean }>;
}

/** One literal `require('x')` call found in a module's text. */
export interface RequireCallEdge {
  specifier: string;
  /** Inside `try`/`catch`: a runtime-optional load, never a hard edge. */
  optional: boolean;
}

/** A `require(<non-literal>)` — stays a runtime require; reported. */
export interface OpaqueRequire {
  /** The argument's source text (`name`, `'' + path`). */
  expression: string;
}

/** What evaluating a file loads — see {@link ModuleLinkageScanner.loadEdges}. */
export interface LoadEdges {
  statements: LinkageStatement[];
  requireCalls: RequireCallEdge[];
  opaqueRequires: OpaqueRequire[];
}

/** One static `import … from` / `export … from` / side-effect import. */
export interface LinkageStatement {
  keyword: 'import' | 'export';
  /** Source span of the whole statement, its `;` included. */
  start: number;
  end: number;
  specifier: string;
  /** `import type …` / `export type …`: erased at compile time. */
  typeOnly: boolean;
  /** `import 'x'` (no clause). */
  sideEffect: boolean;
  /** `export * from 'x'` or `export * as ns from 'x'`. */
  star: boolean;
  /** Carries import attributes (`with { type: 'json' }`). */
  hasAttributes: boolean;
  specifiers: ClauseSpecifiers;
}

export class ModuleLinkageScanner {
  private static readonly IDENTIFIER = /^[A-Za-z_$][\w$]*$/u;

  /** Parses `source` into its linkage record. */
  scan(source: string, filename?: string): ModuleLinkageLite {
    const linkage: ModuleLinkageLite = {
      reExports: new Map(),
      starExports: [],
      ownExports: new Set(),
      sideEffectImports: [],
      isPure: true,
    };
    const program = EsmSourceParser.parse(source, filename);
    if (program === undefined) return { ...linkage, isPure: false };

    // Imports hoist: an export clause may name a binding imported later.
    const importedBindings = new Map<string, { from: string; name: string }>();
    for (const node of program.body) {
      if (node.type !== 'ImportDeclaration' || node.importKind === 'type') continue;
      const from = EsmSourceParser.nameOf(node.source as EsmNode);
      const specifiers = node.specifiers as EsmNode[];
      if (specifiers.length === 0) linkage.sideEffectImports.push(from);
      for (const s of specifiers) {
        if (s.importKind === 'type') continue;
        const local = EsmSourceParser.nameOf(s.local as EsmNode);
        if (s.type === 'ImportDefaultSpecifier') {
          importedBindings.set(local, { from, name: 'default' });
        } else if (s.type === 'ImportNamespaceSpecifier') {
          importedBindings.set(local, { from, name: '*' });
        } else {
          importedBindings.set(local, {
            from,
            name: EsmSourceParser.nameOf(s.imported as EsmNode),
          });
        }
      }
    }

    for (const node of program.body) {
      switch (node.type) {
        case 'ImportDeclaration':
          break;
        case 'ExportNamedDeclaration':
          this.readNamedExport(node, importedBindings, linkage);
          break;
        case 'ExportAllDeclaration':
          if (node.exportKind !== 'type') {
            linkage.starExports.push(EsmSourceParser.nameOf(node.source as EsmNode));
          }
          break;
        case 'ExportDefaultDeclaration': {
          const declaration = node.declaration as EsmNode;
          if (declaration.type === 'TSInterfaceDeclaration') break;
          linkage.ownExports.add('default');
          linkage.isPure = false;
          break;
        }
        default:
          if (!ModuleLinkageScanner.evaluatesNothing(node)) linkage.isPure = false;
      }
    }
    return linkage;
  }

  /**
   * The module's static import and `export … from` statements, in source
   * order; `undefined` when `source` cannot be parsed.
   */
  static statements(source: string, filename?: string): LinkageStatement[] | undefined {
    const program = EsmSourceParser.parse(source, filename);
    return program === undefined ? undefined : ModuleLinkageScanner.statementsOf(program);
  }

  /**
   * Static statements plus every literal dynamic `import('x')` specifier
   * anywhere in the module; `undefined` when `source` cannot be parsed.
   */
  static imports(
    source: string,
    filename?: string
  ): { statements: LinkageStatement[]; dynamicImports: string[] } | undefined {
    const program = EsmSourceParser.parse(source, filename);
    if (program === undefined) return undefined;
    const dynamicImports: string[] = [];
    for (const statement of program.body) {
      EsmSourceParser.forEachNode(statement, (node) => {
        if (node.type !== 'ImportExpression') return;
        const specifier = EsmSourceParser.literalValue(node.source as EsmNode | undefined);
        if (specifier !== undefined) dynamicImports.push(specifier);
      });
    }
    return { statements: ModuleLinkageScanner.statementsOf(program), dynamicImports };
  }

  /**
   * What evaluating the file loads: its static `import`/`export … from`
   * statements plus every literal `require('x')` call anywhere in it —
   * the edges a CommonJS or UMD build reaches its dependencies through,
   * which a bundler follows exactly like static imports. The file is
   * read as a module or, failing that, as a sloppy-mode script, so a
   * CommonJS build no module grammar accepts still yields its requires.
   * `undefined` when neither goal accepts it.
   *
   * A `require` is classified the way the entry build treats it
   * as follows: a call inside `try`/`catch` is `optional` (a bundler
   * leaves it as a runtime require that may fail); a call reachable
   * only through a branch the fixed production defines decide is dead
   * is not a load edge at all; a `require(<non-literal>)` stays a
   * runtime require and is reported in {@link LoadEdges.opaqueRequires}.
   */
  static loadEdges(
    source: string,
    filename?: string
  ): LoadEdges | undefined {
    const program = EsmSourceParser.parseModuleOrScript(source, filename);
    if (program === undefined) return undefined;
    const requireCalls: RequireCallEdge[] = [];
    const opaqueRequires: OpaqueRequire[] = [];
    const visit = (node: EsmNode, optional: boolean): void => {
      switch (node.type) {
        case 'TryStatement':
          // Everything under a try/catch may fail at runtime — a
          // bundler keeps each of these requires runtime-optional.
          for (const child of EsmSourceParser.childNodes(node)) visit(child, true);
          return;
        case 'IfStatement':
        case 'ConditionalExpression': {
          const decided = ProductionConditionEvaluator.evaluate(
            node.test as EsmNode
          );
          if (decided !== false) visit(node.consequent as EsmNode, optional);
          const alternate = node.alternate as EsmNode | null | undefined;
          if (decided !== true && alternate != null) visit(alternate, optional);
          return;
        }
        case 'LogicalExpression': {
          visit(node.left as EsmNode, optional);
          const left = ProductionConditionEvaluator.evaluate(node.left as EsmNode);
          const rightDead =
            (node.operator === '&&' && left === false) ||
            (node.operator === '||' && left === true);
          if (!rightDead) visit(node.right as EsmNode, optional);
          return;
        }
        case 'CallExpression': {
          const callee = node.callee as EsmNode;
          if (callee?.type === 'Identifier' && callee.name === 'require') {
            const arg = (node.arguments as EsmNode[] | undefined)?.[0];
            const specifier = EsmSourceParser.literalValue(arg);
            if (specifier !== undefined) {
              requireCalls.push({ specifier, optional });
            } else if (arg !== undefined) {
              opaqueRequires.push({
                expression: source.slice(arg.start, arg.end),
              });
            }
            return;
          }
          break;
        }
        default:
          break;
      }
      for (const child of EsmSourceParser.childNodes(node)) visit(child, optional);
    };
    for (const statement of program.body) visit(statement, false);
    return {
      statements: ModuleLinkageScanner.statementsOf(program),
      requireCalls,
      opaqueRequires,
    };
  }

  /** Renders specifiers back to a clause (`x, { a as b }`, `* as ns`). */
  static renderClause(specifiers: ClauseSpecifiers): string {
    const name = (n: string): string =>
      ModuleLinkageScanner.IDENTIFIER.test(n) ? n : JSON.stringify(n);
    const parts: string[] = [];
    if (specifiers.defaultName) parts.push(specifiers.defaultName);
    if (specifiers.namespaceName) parts.push(`* as ${specifiers.namespaceName}`);
    if (specifiers.named.length > 0) {
      parts.push(
        `{ ${specifiers.named
          .map(
            (n) =>
              `${n.isType ? 'type ' : ''}` +
              (n.imported === n.local ? name(n.imported) : `${name(n.imported)} as ${name(n.local)}`)
          )
          .join(', ')} }`
      );
    }
    return parts.join(', ');
  }

  private readNamedExport(
    node: EsmNode,
    importedBindings: ReadonlyMap<string, { from: string; name: string }>,
    linkage: ModuleLinkageLite
  ): void {
    if (node.exportKind === 'type') return;
    const declaration = node.declaration as EsmNode | null | undefined;
    if (declaration) {
      for (const name of ModuleLinkageScanner.declaredNames(declaration)) {
        linkage.ownExports.add(name);
      }
      // A declaration binding a runtime value makes the module a mixed
      // module, not a barrel; type-only declarations keep it pure.
      if (!ModuleLinkageScanner.evaluatesNothing(declaration)) linkage.isPure = false;
      return;
    }
    const source = node.source as EsmNode | null | undefined;
    const from = source ? EsmSourceParser.nameOf(source) : undefined;
    for (const s of node.specifiers as EsmNode[]) {
      if (s.exportKind === 'type') continue;
      const exported = EsmSourceParser.nameOf(s.exported as EsmNode);
      if (s.type === 'ExportNamespaceSpecifier') {
        // `export * as ns from 'x'` binds one namespace object here.
        linkage.ownExports.add(exported);
        continue;
      }
      const local = EsmSourceParser.nameOf(s.local as EsmNode);
      if (from !== undefined) {
        linkage.reExports.set(exported, { from, name: local });
      } else {
        const bound = importedBindings.get(local);
        if (bound) linkage.reExports.set(exported, bound);
        else linkage.ownExports.add(exported);
      }
    }
  }

  private static statementsOf(program: EsmProgram): LinkageStatement[] {
    const statements: LinkageStatement[] = [];
    for (const node of program.body) {
      const isImport = node.type === 'ImportDeclaration';
      const isNamedExport = node.type === 'ExportNamedDeclaration' && node.source;
      const isStarExport = node.type === 'ExportAllDeclaration';
      if (!isImport && !isNamedExport && !isStarExport) continue;
      const nodeSpecifiers = (node.specifiers as EsmNode[] | undefined) ?? [];
      const specifiers: ClauseSpecifiers = { named: [] };
      let star = isStarExport;
      for (const s of nodeSpecifiers) {
        const isType = s.importKind === 'type' || s.exportKind === 'type';
        switch (s.type) {
          case 'ImportDefaultSpecifier':
            specifiers.defaultName = EsmSourceParser.nameOf(s.local as EsmNode);
            break;
          case 'ImportNamespaceSpecifier':
            specifiers.namespaceName = EsmSourceParser.nameOf(s.local as EsmNode);
            break;
          case 'ExportNamespaceSpecifier':
            star = true;
            specifiers.namespaceName = EsmSourceParser.nameOf(s.exported as EsmNode);
            break;
          case 'ImportSpecifier':
            specifiers.named.push({
              imported: EsmSourceParser.nameOf(s.imported as EsmNode),
              local: EsmSourceParser.nameOf(s.local as EsmNode),
              ...(isType ? { isType: true } : {}),
            });
            break;
          case 'ExportSpecifier':
            specifiers.named.push({
              imported: EsmSourceParser.nameOf(s.local as EsmNode),
              local: EsmSourceParser.nameOf(s.exported as EsmNode),
              ...(isType ? { isType: true } : {}),
            });
            break;
          default:
            break;
        }
      }
      const kind = isImport ? node.importKind : node.exportKind;
      statements.push({
        keyword: isImport ? 'import' : 'export',
        start: node.start,
        end: node.end,
        specifier: EsmSourceParser.nameOf(node.source as EsmNode),
        typeOnly: kind === 'type',
        sideEffect: isImport && nodeSpecifiers.length === 0,
        star,
        hasAttributes:
          ((node.attributes as unknown[] | undefined)?.length ?? 0) > 0 ||
          ((node.assertions as unknown[] | undefined)?.length ?? 0) > 0,
        specifiers,
      });
    }
    return statements;
  }

  /**
   * Whether a top-level statement or exported declaration evaluates
   * nothing: TypeScript type-only and ambient declarations, an empty
   * statement, a string-literal expression statement.
   */
  private static evaluatesNothing(node: EsmNode): boolean {
    switch (node.type) {
      case 'EmptyStatement':
      case 'TSInterfaceDeclaration':
      case 'TSTypeAliasDeclaration':
      case 'TSDeclareFunction':
      case 'TSNamespaceExportDeclaration':
        return true;
      case 'ExpressionStatement':
        return (node.expression as EsmNode).type === 'StringLiteral';
      default:
        return node.declare === true;
    }
  }

  /** The names a declaration binds (destructuring patterns included). */
  private static declaredNames(node: EsmNode): string[] {
    switch (node.type) {
      case 'Identifier':
        return [String(node.name)];
      case 'VariableDeclaration':
        return (node.declarations as EsmNode[]).flatMap((d) =>
          ModuleLinkageScanner.declaredNames(d.id as EsmNode)
        );
      case 'ObjectPattern':
        return (node.properties as EsmNode[]).flatMap((p) =>
          ModuleLinkageScanner.declaredNames(
            (p.type === 'RestElement' ? p.argument : p.value) as EsmNode
          )
        );
      case 'ArrayPattern':
        return (node.elements as Array<EsmNode | null>).flatMap((e) =>
          e ? ModuleLinkageScanner.declaredNames(e) : []
        );
      case 'AssignmentPattern':
        return ModuleLinkageScanner.declaredNames(node.left as EsmNode);
      case 'RestElement':
        return ModuleLinkageScanner.declaredNames(node.argument as EsmNode);
      default: {
        const id = node.id as EsmNode | null | undefined;
        return id && id.type === 'Identifier' ? [String(id.name)] : [];
      }
    }
  }
}
