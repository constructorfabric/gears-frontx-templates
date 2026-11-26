/**
 * `LazyImportTransformer` — the `__frontx_lazy` build-time half of the
 * lazy-import ABI: AST-level rewrites of dynamic `import('<rel>')` calls
 * in compiled chunks into `__frontx_lazy('<rel>')` calls.
 *
 * Operates on Rollup-emitted output (post-bundle) so Rollup's
 * code-splitting is preserved — every lazy chunk is still emitted as its
 * own file. A literal import and a statically bounded pattern import (a
 * template literal with a fixed prefix or suffix) both reach the ABI, the
 * pattern call passing its runtime-computed path; a fully opaque
 * `import(expr)` fails the build, or stays native where the caller asks
 * for `opaque: 'leave'` and reads it through `opaqueImports`.
 */

/** ESTree node shape as produced by Rollup's `this.parse()`. */
export interface AstNode {
  type: string;
  start: number;
  end: number;
  [key: string]: unknown;
}

interface ImportExpressionNode extends AstNode {
  type: 'ImportExpression';
  source: AstNode;
}

export class LazyImportTransformer {
  private readonly replacements: { start: number; end: number }[] = [];
  private transformedCount = 0;
  private readonly nonStatic: { node: AstNode }[] = [];

  constructor(
    private readonly code: string,
    private readonly leaveAlone: (specifier: string) => boolean = () => false
  ) {}

  visit(node: unknown): void {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const child of node) this.visit(child);
      return;
    }
    const astNode = node as AstNode;

    if (astNode.type === 'ImportExpression') {
      this.handleImportExpression(astNode as ImportExpressionNode);
    }

    for (const key of Object.keys(astNode)) {
      if (
        key === 'loc' ||
        key === 'range' ||
        key === 'start' ||
        key === 'end' ||
        key === 'type'
      ) {
        continue;
      }
      this.visit(astNode[key]);
    }
  }

  private handleImportExpression(node: ImportExpressionNode): void {
    const source = node.source;
    if (LazyImportTransformer.isStaticallyResolvable(source)) {
      const specifier = LazyImportTransformer.literalValue(source);
      if (specifier !== undefined && this.leaveAlone(specifier)) return;
      this.replacements.push({
        start: node.start,
        end: node.start + 'import'.length,
      });
      this.transformedCount += 1;
      return;
    }
    // A statically bounded pattern — a template literal with a
    // substitution and a fixed prefix or suffix — reaches the ABI with its
    // runtime-computed path, so the runtime resolves it through the
    // load's lists; the call is no opaque import.
    if (LazyImportTransformer.isBoundedPattern(source)) {
      this.replacements.push({
        start: node.start,
        end: node.start + 'import'.length,
      });
      this.transformedCount += 1;
      return;
    }
    // `@vite-ignore` between `import(` and the argument marks an
    // intentionally non-static dynamic import — leave it untouched.
    if (this.code.slice(node.start, source.start).includes('@vite-ignore')) {
      return;
    }
    this.nonStatic.push({ node: source });
  }

  /** The specifier of a string literal or a single-quasi template. */
  private static literalValue(node: AstNode): string | undefined {
    if (node.type === 'Literal' && typeof node.value === 'string') {
      return node.value;
    }
    if (
      node.type === 'TemplateLiteral' &&
      Array.isArray(node.quasis) &&
      node.quasis.length === 1
    ) {
      const cooked = (node.quasis[0] as { value?: { cooked?: unknown } }).value
        ?.cooked;
      return typeof cooked === 'string' ? cooked : undefined;
    }
    return undefined;
  }

  /**
   * A template literal with at least one substitution and a non-empty
   * fixed prefix or suffix: the webpack-context shape, bounded by its
   * fixed text.
   */
  private static isBoundedPattern(node: AstNode): boolean {
    if (
      node.type !== 'TemplateLiteral' ||
      !Array.isArray(node.expressions) ||
      node.expressions.length === 0 ||
      !Array.isArray(node.quasis) ||
      node.quasis.length === 0
    ) {
      return false;
    }
    const cooked = (quasi: unknown): string => {
      const value = (quasi as { value?: { cooked?: unknown } }).value;
      return typeof value?.cooked === 'string' ? value.cooked : '';
    };
    const quasis = node.quasis as unknown[];
    return cooked(quasis[0]) !== '' || cooked(quasis[quasis.length - 1]) !== '';
  }

  private static isStaticallyResolvable(node: AstNode): boolean {
    if (node.type === 'Literal' && typeof node.value === 'string') return true;
    if (
      node.type === 'TemplateLiteral' &&
      Array.isArray(node.expressions) &&
      node.expressions.length === 0
    ) {
      return true;
    }
    if (node.type === 'BinaryExpression' && node.operator === '+') {
      const left = node.left as AstNode | undefined;
      const right = node.right as AstNode | undefined;
      return (
        left !== undefined &&
        right !== undefined &&
        LazyImportTransformer.isStaticallyResolvable(left) &&
        LazyImportTransformer.isStaticallyResolvable(right)
      );
    }
    return false;
  }

  apply(code: string): string {
    if (this.replacements.length === 0) return code;
    // @cpt-begin:cpt-template-mfe-algo-mfe-fetch-list-assembly-compose:p1:inst-lazy-import-call
    const sorted = [...this.replacements].sort((a, b) => b.start - a.start);
    let out = code;
    for (const r of sorted) {
      out = out.slice(0, r.start) + '__frontx_lazy' + out.slice(r.end);
    }
    return out;
    // @cpt-end:cpt-template-mfe-algo-mfe-fetch-list-assembly-compose:p1:inst-lazy-import-call
  }

  count(): number {
    return this.transformedCount;
  }

  nonStaticNodes(): readonly { node: AstNode }[] {
    return this.nonStatic;
  }

  /**
   * Runs the transform on one compiled chunk: the rewritten code and the
   * transform count, or `null` when nothing changed. `parse` is the
   * caller-provided Rollup `parse`. A non-statically-resolvable
   * `import(expr)` fails the build with `opaque: 'error'` (the default);
   * with `opaque: 'leave'` it stays native and
   * {@link LazyImportTransformer.opaqueImports} reports it.
   */
  static transformChunk(
    code: string,
    parse: (input: string) => unknown,
    error: (message: string, pos: number) => never,
    chunkFileName: string,
    leaveAlone?: (specifier: string) => boolean,
    opaque: 'error' | 'leave' = 'error'
  ): { code: string; count: number } | null {
    // Fast skip: no `import` followed by a parenthesis or a comment.
    if (!/\bimport\s*(?:\(|\/[*/])/.test(code)) return null;

    let ast: unknown;
    try {
      ast = parse(code);
    } catch {
      // Another plugin surfaces the parse issue with its own diagnostic.
      return null;
    }

    const transformer = new LazyImportTransformer(code, leaveAlone);
    transformer.visit(ast);

    const first = transformer.nonStaticNodes()[0];
    if (opaque === 'error' && first !== undefined) {
      error(
        `[vite-plugin-mfe-gts] Non-statically-resolvable dynamic import ` +
          `in compiled chunk '${chunkFileName}'. Lazy-import paths MUST be ` +
          `string literals, constant template literals, or constant ` +
          `string concatenation so the MFE's runtime can resolve them ` +
          `through the per-load blob URL chain.`,
        first.node.start
      );
    }

    if (transformer.count() === 0) return null;
    return { code: transformer.apply(code), count: transformer.count() };
  }

  /**
   * Every fully opaque `import(expr)` left in `code` — neither a literal,
   * a constant expression nor a statically bounded pattern, and not
   * marked `@vite-ignore` — with its line and expression text. Reads only:
   * nothing is rewritten. `code` is the plugin's own emitted chunk, so a
   * parse failure fails the build instead of reporting nothing.
   */
  static opaqueImports(
    code: string,
    parse: (input: string) => unknown,
    file: string
  ): Array<{ file: string; line: number; expression: string }> {
    if (!/\bimport\s*(?:\(|\/[*/])/.test(code)) return [];
    let ast: unknown;
    try {
      ast = parse(code);
    } catch (cause) {
      throw new Error(
        `[vite-plugin-mfe-gts] cannot parse emitted chunk '${file}' to find its ` +
          `opaque dynamic imports: ${cause instanceof Error ? cause.message : String(cause)}`
      );
    }
    const transformer = new LazyImportTransformer(code);
    transformer.visit(ast);
    return transformer.nonStaticNodes().map(({ node }) => ({
      file,
      line: code.slice(0, node.start).split('\n').length,
      expression: code.slice(node.start, node.end),
    }));
  }

  /**
   * The constant specifier of every `__frontx_lazy(...)` call in a parsed
   * chunk, as the runtime resolver will fetch it.
   */
  static lazyCallSpecifiers(node: unknown, found: string[] = []): string[] {
    if (!node || typeof node !== 'object') return found;
    if (Array.isArray(node)) {
      for (const child of node) LazyImportTransformer.lazyCallSpecifiers(child, found);
      return found;
    }
    const astNode = node as AstNode;
    if (astNode.type === 'CallExpression') {
      const callee = astNode.callee as AstNode | undefined;
      const specifier =
        callee?.type === 'Identifier' && callee.name === '__frontx_lazy'
          ? LazyImportTransformer.constantString(
              (astNode.arguments as AstNode[] | undefined)?.[0]
            )
          : undefined;
      if (specifier !== undefined) found.push(specifier);
    }
    for (const key of Object.keys(astNode)) {
      if (
        key === 'loc' ||
        key === 'range' ||
        key === 'start' ||
        key === 'end' ||
        key === 'type'
      ) {
        continue;
      }
      LazyImportTransformer.lazyCallSpecifiers(astNode[key], found);
    }
    return found;
  }

  /** The string a constant lazy-call argument evaluates to. */
  private static constantString(node: AstNode | undefined): string | undefined {
    if (node === undefined) return undefined;
    if (node.type === 'Literal' && typeof node.value === 'string') {
      return node.value;
    }
    if (
      node.type === 'TemplateLiteral' &&
      Array.isArray(node.quasis) &&
      node.quasis.length === 1
    ) {
      const cooked = (node.quasis[0] as { value?: { cooked?: unknown } }).value
        ?.cooked;
      return typeof cooked === 'string' ? cooked : undefined;
    }
    if (node.type === 'BinaryExpression' && node.operator === '+') {
      const left = LazyImportTransformer.constantString(
        node.left as AstNode | undefined
      );
      const right = LazyImportTransformer.constantString(
        node.right as AstNode | undefined
      );
      return left !== undefined && right !== undefined ? left + right : undefined;
    }
    return undefined;
  }
}
