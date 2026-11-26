/**
 * `DynamicImportClassifier` — classifies every `import(...)` call site
 * in emitted chunk source as a literal specifier, a statically bounded
 * pattern (a template literal with a fixed prefix and suffix, e.g.
 * ``import(`./locales/${lang}.json`)``), or a fully opaque
 * `import(expr)`. Read from the module's AST (`EsmSourceParser`), never
 * from text scanning, so `import(` inside strings and comments is
 * never misread.
 *
 * Literal targets reach the emitted chunk's list through esbuild's
 * metafile (they become dynamic-import edges); patterns and opaque
 * calls are what the classifier reports for list emission
 * — one list per file matching a pattern, a report entry
 * for every opaque call — which stays native and never fails the
 * build.
 */

import { EsmSourceParser, type EsmNode } from './EsmSourceParser';

export type ClassifiedImport =
  | { kind: 'literal'; specifier: string; line: number }
  | {
      kind: 'pattern';
      /** Raw source of the argument, e.g. `` `./locales/${lang}.json` ``. */
      expression: string;
      /** Fixed text before the first `${…}` (empty when none). */
      prefix: string;
      /** Fixed text after the last `${…}` (empty when none). */
      suffix: string;
      line: number;
    }
  | { kind: 'opaque'; expression: string; line: number };

export class DynamicImportClassifier {
  /** Every `import(...)` call site in `source`, classified. */
  static classify(source: string, filename = 'chunk.js'): ClassifiedImport[] {
    const program = EsmSourceParser.parse(source, filename);
    if (program === undefined) return [];
    const out: ClassifiedImport[] = [];
    const lineOf = (offset: number): number => {
      let line = 1;
      for (let i = 0; i < offset && i < source.length; i++) {
        if (source[i] === '\n') line++;
      }
      return line;
    };
    EsmSourceParser.forEachNode(
      { type: 'Program', start: 0, end: 0, body: program.body },
      (node) => {
        const arg = DynamicImportClassifier.importArgument(node);
        if (arg === undefined) return;
        const start = (arg.start as number) ?? (node.start as number) ?? 0;
        const end = (arg.end as number) ?? start;
        const line = lineOf((node.start as number) ?? start);
        const literal = EsmSourceParser.literalValue(arg);
        if (literal !== undefined) {
          out.push({ kind: 'literal', specifier: literal, line });
          return;
        }
        if (arg.type === 'TemplateLiteral') {
          const pattern = DynamicImportClassifier.templatePattern(arg);
          if (pattern !== undefined) {
            out.push({
              kind: 'pattern',
              expression: source.slice(start, end),
              ...pattern,
              line,
            });
            return;
          }
        }
        out.push({
          kind: 'opaque',
          expression: source.slice(start, end),
          line,
        });
      }
    );
    return out;
  }

  /**
   * The single argument of an `import(...)` node — a `CallExpression`
   * whose callee is `import`, or a direct `ImportExpression`. Returns
   * `undefined` for any other node.
   */
  private static importArgument(node: EsmNode): EsmNode | undefined {
    if (node.type === 'ImportExpression') {
      return node.source as EsmNode | undefined;
    }
    if (node.type === 'CallExpression') {
      const callee = node.callee as EsmNode | undefined;
      if (callee?.type !== 'Import') return undefined;
      const args = node.arguments as unknown[] | undefined;
      if (!Array.isArray(args) || args.length !== 1) return undefined;
      return args[0] as EsmNode;
    }
    return undefined;
  }

  /**
   * A template literal's fixed prefix and suffix when every
   * substitution is bounded (the literal is the webpack-context shape:
   * fixed text, one or more `${…}`, fixed text). `undefined` when the
   * literal has no fixed part at all — an unbounded pattern reads as
   * opaque.
   */
  private static templatePattern(
    node: EsmNode
  ): { prefix: string; suffix: string } | undefined {
    const quasis = node.quasis as EsmNode[] | undefined;
    if (!Array.isArray(quasis) || quasis.length === 0) return undefined;
    const cooked = (q: EsmNode): string => {
      const value = q.value as { cooked?: string; raw?: string } | undefined;
      return value?.cooked ?? value?.raw ?? '';
    };
    const prefix = cooked(quasis[0]);
    const suffix = cooked(quasis[quasis.length - 1]);
    if (prefix === '' && suffix === '') return undefined;
    return { prefix, suffix };
  }
}
