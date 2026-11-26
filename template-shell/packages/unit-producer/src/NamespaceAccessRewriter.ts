/**
 * `NamespaceAccessRewriter` — rewrites statically resolvable member
 * accesses on a namespace import (`import * as Select from 'pkg'`,
 * `Select.Item`) into direct named imports of the members actually
 * used: the barrel's whole surface is no longer evaluated —
 * or reached — for the few members a consumer reads.
 *
 * A namespace import is rewritten only when EVERY reference to its
 * local name is a non-computed member access (`ns.Name`) that is only
 * READ; the import statement's own specifier binds the name and is not
 * a use. Any other use — a computed access (`ns[key]`), a member
 * expression written to (`ns.Foo = x`), deleted (`delete ns.Foo`),
 * updated (`ns.Foo++`) or bound (`for (ns.Foo of …)`), the namespace
 * passed whole, destructured or spread, or referenced from JSX
 * (`<ns.Item />`) — is dynamic and the statement
 * is left exactly as written. The local names the members are bound
 * under never collide: a member whose own name is already taken in the
 * module is imported under a `ns_Member` alias.
 *
 * Statements are located and member accesses classified by parsing
 * the module ({@link EsmSourceParser}), so text inside comments,
 * strings and template literals never matches; a module that cannot
 * be parsed is left as written.
 */

import { EsmSourceParser, type EsmNode } from './EsmSourceParser';
import { ModuleLinkageScanner } from './ModuleLinkageScanner';

/** One `ns.Member` read to rewrite: its member name and source span. */
interface MemberAccess {
  member: string;
  start: number;
  end: number;
}

/** The local name → member accesses of one namespace import. */
export interface NamespaceUse {
  /** The namespace import's local name. */
  local: string;
  /** Every `local.Member` read, in source order. */
  accesses: MemberAccess[];
  /**
   * `false` when a reference to `local` is not a static member access —
   * the namespace is used dynamically and must not be rewritten.
   */
  onlyMembers: boolean;
}

export class NamespaceAccessRewriter {
  /**
   * The namespace bindings `source` declares through
   * `import * as ns from 'specifier'` and how each is used. Keys are
   * local names; `specifier` is the import's specifier. `undefined`
   * when the module cannot be parsed or declares no namespace import.
   */
  static analyze(
    source: string,
    filename?: string
  ): Map<string, { specifier: string; use: NamespaceUse }> | undefined {
    const statements = ModuleLinkageScanner.statements(source, filename);
    if (statements === undefined) return undefined;
    const namespaces = new Map<string, { specifier: string; use: NamespaceUse }>();
    for (const stmt of statements) {
      if (stmt.keyword !== 'import' || stmt.typeOnly || stmt.hasAttributes) continue;
      const local = stmt.specifiers.namespaceName;
      if (local === undefined) continue;
      namespaces.set(local, {
        specifier: stmt.specifier,
        use: { local, accesses: [], onlyMembers: true },
      });
    }
    if (namespaces.size === 0) return namespaces;
    const program = EsmSourceParser.parse(source, filename);
    if (program === undefined) return undefined;

    // Parent links over the whole program — use context (a binding
    // specifier, an assignment target) is read off the parent chain.
    const parentOf = new Map<EsmNode, EsmNode>();
    for (const statement of program.body) {
      const stack: EsmNode[] = [statement];
      while (stack.length > 0) {
        const node = stack.pop()!;
        for (const child of NamespaceAccessRewriter.childNodes(node)) {
          parentOf.set(child, node);
          stack.push(child);
        }
      }
    }

    // Every Identifier that names a namespace local must sit as the
    // `object` of a non-computed `MemberExpression` whose `property`
    // is an Identifier and which is only read — that is the only
    // statically resolvable access.
    const objectOf = new Map<EsmNode, EsmNode>();
    for (const statement of program.body) {
      EsmSourceParser.forEachNode(statement, (node) => {
        if (node.type !== 'MemberExpression' && node.type !== 'OptionalMemberExpression') {
          return;
        }
        const object = node.object as EsmNode | undefined;
        if (object !== undefined && object.type === 'Identifier') {
          objectOf.set(object, node);
        }
      });
    }
    for (const statement of program.body) {
      EsmSourceParser.forEachNode(statement, (node) => {
        // A JSX reference (`<NS.Item />`) reads the namespace binding
        // itself, which a rewrite into named imports would leave unbound.
        if (node.type === 'JSXIdentifier') {
          const jsxUse = namespaces.get(String(node.name));
          if (jsxUse !== undefined) jsxUse.use.onlyMembers = false;
          return;
        }
        if (node.type !== 'Identifier') return;
        const use = namespaces.get(String(node.name));
        if (use === undefined) return;
        const parent = parentOf.get(node);
        // The import's own specifier binds the local — it is not a use.
        if (parent !== undefined && NamespaceAccessRewriter.isImportSpecifier(parent)) {
          return;
        }
        const member = objectOf.get(node);
        const property = member?.property as EsmNode | undefined;
        if (
          member === undefined ||
          member.computed === true ||
          property === undefined ||
          property.type !== 'Identifier' ||
          NamespaceAccessRewriter.isWriteTarget(member, parentOf)
        ) {
          use.use.onlyMembers = false;
          return;
        }
        use.use.accesses.push({
          member: String(property.name),
          start: member.start,
          end: member.end,
        });
      });
    }
    for (const use of namespaces.values()) {
      use.use.accesses.sort((a, b) => a.start - b.start);
    }
    return namespaces;
  }

  /**
   * Whether `node` is an import statement's specifier — the position
   * that BINDS a namespace local rather than using it. Export
   * specifiers are real uses (re-exporting the namespace is dynamic).
   */
  private static isImportSpecifier(node: EsmNode): boolean {
    return (
      node.type === 'ImportSpecifier' ||
      node.type === 'ImportDefaultSpecifier' ||
      node.type === 'ImportNamespaceSpecifier' ||
      node.type === 'ImportDeclaration'
    );
  }

  /**
   * Whether the member access `member` is WRITTEN rather than read —
   * an assignment or update target, a `delete` operand, or a loop
   * binding — so rewriting it into an imported binding would produce
   * an assignment to an import.
   */
  private static isWriteTarget(
    member: EsmNode,
    parentOf: ReadonlyMap<EsmNode, EsmNode>
  ): boolean {
    const parent = parentOf.get(member);
    if (parent === undefined) return false;
    if (parent.type === 'AssignmentExpression') {
      return parent.left === member;
    }
    if (parent.type === 'UpdateExpression') {
      return parent.argument === member;
    }
    if (parent.type === 'UnaryExpression') {
      return parent.operator === 'delete' && parent.argument === member;
    }
    if (parent.type === 'ForInStatement' || parent.type === 'ForOfStatement') {
      return parent.left === member;
    }
    return false;
  }

  /** `node`'s child syntax nodes — the same traversal fields `EsmSourceParser.forEachNode` walks. */
  private static childNodes(node: EsmNode): EsmNode[] {
    const children: EsmNode[] = [];
    for (const [key, value] of Object.entries(node)) {
      if (
        key === 'loc' ||
        key === 'extra' ||
        key === 'leadingComments' ||
        key === 'trailingComments' ||
        key === 'innerComments'
      ) {
        continue;
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          if (NamespaceAccessRewriter.isNode(item)) children.push(item);
        }
      } else if (NamespaceAccessRewriter.isNode(value)) {
        children.push(value);
      }
    }
    return children;
  }

  private static isNode(value: unknown): value is EsmNode {
    return (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as { type?: unknown }).type === 'string'
    );
  }

  /**
   * A collision-free local for `member` imported off namespace `ns`:
   * the member's own name when free, else `ns_Member`, then
   * `ns_Member2`, `ns_Member3`, … — `bound` is consulted and updated
   * by the caller.
   */
  static freeName(member: string, ns: string, bound: ReadonlySet<string>): string {
    const legal = /^[A-Za-z_$][\w$]*$/u.test(member) ? member : `_${member.replace(/\W/g, '_')}`;
    if (!bound.has(legal)) return legal;
    const base = `${ns}_${legal}`;
    let candidate = base;
    for (let i = 2; bound.has(candidate); i++) candidate = `${base}${i}`;
    return candidate;
  }

  /**
   * The identifiers already bound or referenced in `source` — the
   * names a rewritten member may not collide with. `undefined` when
   * the module cannot be parsed.
   */
  static boundIdentifiers(source: string, filename?: string): Set<string> | undefined {
    const program = EsmSourceParser.parse(source, filename);
    if (program === undefined) return undefined;
    const names = new Set<string>();
    for (const statement of program.body) {
      EsmSourceParser.forEachNode(statement, (node) => {
        if (node.type === 'Identifier') names.add(String(node.name));
      });
    }
    return names;
  }
}
