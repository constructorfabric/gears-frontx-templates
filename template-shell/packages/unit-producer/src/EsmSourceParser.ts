/**
 * `EsmSourceParser` — parses a JavaScript or TypeScript module into an
 * AST with `@babel/parser`, so module linkage is read from the language's
 * own grammar: comment markers inside strings, template literals with
 * substitutions, regular-expression literals and directive prologues are
 * whatever the grammar says they are, never guessed from text.
 *
 * The grammar is chosen by the file's extension (`.ts`/`.mts`/`.cts` —
 * TypeScript; `.tsx` — TypeScript with JSX; `.jsx` — JSX); a module with
 * no or another extension is tried as JavaScript with JSX, then as
 * TypeScript with and without JSX. A module no grammar accepts parses to
 * `undefined` and its callers stay conservative (no rewrite, impure
 * linkage).
 *
 * Only the node fields the producer reads are typed ({@link EsmNode});
 * nothing of Babel's own types reaches the package's public surface.
 */

import { parse, type ParserPlugin } from '@babel/parser';

/** One AST node: Babel's shape, only the fields read here typed. */
export interface EsmNode {
  type: string;
  start: number;
  end: number;
  [key: string]: unknown;
}

/** A parsed module: its top-level statements and directive prologue. */
export interface EsmProgram {
  body: EsmNode[];
  directives: EsmNode[];
}

export class EsmSourceParser {
  private static readonly TS = /\.[cm]?ts$/;
  private static readonly TSX = /\.tsx$/;
  private static readonly JSX = /\.jsx$/;
  /** Node fields that hold no child syntax. */
  private static readonly SKIPPED_KEYS = new Set([
    'loc',
    'extra',
    'leadingComments',
    'trailingComments',
    'innerComments',
  ]);

  /** The module's program, or `undefined` when no grammar accepts it. */
  static parse(source: string, filename?: string): EsmProgram | undefined {
    return EsmSourceParser.parseAs(source, filename, 'module');
  }

  /**
   * The file's program read as an ES module or, when no module grammar
   * accepts it, as a sloppy-mode script — the goal a CommonJS or UMD
   * build is written for (`with`, legacy octals, non-strict bindings).
   * `undefined` when neither goal accepts it.
   */
  static parseModuleOrScript(source: string, filename?: string): EsmProgram | undefined {
    return (
      EsmSourceParser.parseAs(source, filename, 'module') ??
      EsmSourceParser.parseAs(source, filename, 'script')
    );
  }

  private static parseAs(
    source: string,
    filename: string | undefined,
    sourceType: 'module' | 'script'
  ): EsmProgram | undefined {
    for (const plugins of EsmSourceParser.grammarsFor(filename)) {
      try {
        const file = parse(source, {
          sourceType,
          plugins,
          createImportExpressions: true,
          errorRecovery: false,
          ...(sourceType === 'script' ? { allowReturnOutsideFunction: true } : {}),
        });
        const program = EsmSourceParser.toProgram(file.program);
        if (program !== undefined) return program;
      } catch {
        // Try the next grammar.
      }
    }
    return undefined;
  }

  /**
   * Visits every node under `root` (depth first, children in source
   * order), the root included.
   */
  static forEachNode(root: EsmNode, visit: (node: EsmNode) => void): void {
    const stack: EsmNode[] = [root];
    while (stack.length > 0) {
      const node = stack.pop()!;
      visit(node);
      const children = EsmSourceParser.childNodes(node);
      for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
    }
  }

  /** The node's child syntax nodes, in source order. */
  static childNodes(node: EsmNode): EsmNode[] {
    const children: EsmNode[] = [];
    for (const [key, value] of Object.entries(node)) {
      if (EsmSourceParser.SKIPPED_KEYS.has(key)) continue;
      if (Array.isArray(value)) {
        for (const item of value) {
          if (EsmSourceParser.isNode(item)) children.push(item);
        }
      } else if (EsmSourceParser.isNode(value)) {
        children.push(value);
      }
    }
    return children;
  }

  /** An identifier's name or a string literal's value. */
  static nameOf(node: EsmNode): string {
    return node.type === 'Identifier' ? String(node.name) : String(node.value);
  }

  /** The value of a string literal or substitution-free template literal. */
  static literalValue(node: EsmNode | undefined): string | undefined {
    if (node === undefined) return undefined;
    if (node.type === 'StringLiteral') return String(node.value);
    if (node.type === 'TemplateLiteral' && (node.expressions as unknown[]).length === 0) {
      const quasi = (node.quasis as EsmNode[])[0];
      const cooked = (quasi?.value as { cooked?: string } | undefined)?.cooked;
      return cooked ?? undefined;
    }
    return undefined;
  }

  /** The parsed program in the shape read here, or `undefined` when it has none. */
  private static toProgram(program: object): EsmProgram | undefined {
    if (
      !('body' in program) ||
      !Array.isArray(program.body) ||
      !program.body.every(EsmSourceParser.isNode)
    ) {
      return undefined;
    }
    const directives =
      'directives' in program &&
      Array.isArray(program.directives) &&
      program.directives.every(EsmSourceParser.isNode)
        ? program.directives
        : [];
    return { body: program.body, directives };
  }

  private static isNode(value: unknown): value is EsmNode {
    return (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as { type?: unknown }).type === 'string'
    );
  }

  private static grammarsFor(filename: string | undefined): ParserPlugin[][] {
    if (filename !== undefined) {
      if (EsmSourceParser.TS.test(filename)) return [['typescript']];
      if (EsmSourceParser.TSX.test(filename)) return [['typescript', 'jsx']];
      if (EsmSourceParser.JSX.test(filename)) return [['jsx']];
    }
    return [['jsx'], ['typescript', 'jsx'], ['typescript']];
  }
}
