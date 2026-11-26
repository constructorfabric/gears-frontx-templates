/**
 * `UnitExportNames` — the names an emitted unit's text exports, read by
 * parsing it ({@link EsmSourceParser}). A consumer import bound to a
 * unit stands only when the unit exports the imported name, so the
 * consumer side checks its rewrites and imports against this surface.
 * A star re-export (`export * from '…'`) exports names the text does
 * not spell, so the surface is then not statically known; a text that
 * cannot be parsed has no surface to know and fails.
 */

import { EsmSourceParser, type EsmNode } from './EsmSourceParser';

export class UnitExportNames {
  protected constructor() {}

  /**
   * The export names of `source`, sorted; `undefined` when the text
   * carries an unnamed star re-export. Throws when the text of `unit`
   * cannot be parsed.
   */
  static of(source: string, unit = 'unit.js'): string[] | undefined {
    const program = EsmSourceParser.parse(source, unit);
    if (program === undefined) {
      throw new Error(
        `[unit-producer] the text of unit "${unit}" cannot be parsed to read ` +
          `the names it exports`
      );
    }
    const names = new Set<string>();
    for (const node of program.body) {
      if (node.type === 'ExportDefaultDeclaration') {
        names.add('default');
        continue;
      }
      if (node.type === 'ExportAllDeclaration') {
        const exported = node.exported as EsmNode | null | undefined;
        if (exported === null || exported === undefined) return undefined;
        names.add(UnitExportNames.nameOf(exported));
        continue;
      }
      if (node.type !== 'ExportNamedDeclaration') continue;
      for (const specifier of (node.specifiers as EsmNode[] | undefined) ?? []) {
        names.add(UnitExportNames.nameOf(specifier.exported as EsmNode));
      }
      const declaration = node.declaration as EsmNode | null | undefined;
      if (declaration === null || declaration === undefined) continue;
      if (declaration.type === 'VariableDeclaration') {
        for (const d of (declaration.declarations as EsmNode[] | undefined) ?? []) {
          UnitExportNames.bindingNames(d.id as EsmNode, names);
        }
      } else {
        const id = declaration.id as EsmNode | null | undefined;
        if (id !== null && id !== undefined) names.add(String(id.name));
      }
    }
    return [...names].sort();
  }

  /** An export specifier's name: an identifier or a string literal. */
  private static nameOf(node: EsmNode): string {
    return node.type === 'StringLiteral' ? String(node.value) : String(node.name);
  }

  /** The names a declaration pattern binds. */
  private static bindingNames(pattern: EsmNode | undefined, out: Set<string>): void {
    if (pattern === undefined || pattern === null) return;
    switch (pattern.type) {
      case 'Identifier':
        out.add(String(pattern.name));
        return;
      case 'ObjectPattern':
        for (const p of (pattern.properties as EsmNode[] | undefined) ?? []) {
          UnitExportNames.bindingNames(
            (p.type === 'RestElement' ? p.argument : p.value) as EsmNode,
            out
          );
        }
        return;
      case 'ArrayPattern':
        for (const e of (pattern.elements as Array<EsmNode | null> | undefined) ?? []) {
          if (e !== null) UnitExportNames.bindingNames(e, out);
        }
        return;
      case 'AssignmentPattern':
        UnitExportNames.bindingNames(pattern.left as EsmNode, out);
        return;
      case 'RestElement':
        UnitExportNames.bindingNames(pattern.argument as EsmNode, out);
        return;
      default:
        return;
    }
  }
}
