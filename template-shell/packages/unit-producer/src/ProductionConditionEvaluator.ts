/**
 * `ProductionConditionEvaluator` — statically decides a condition under
 * the producer's fixed `define` map (`ProducerBuildSettings`), so the
 * closure screen sees the same branch liveness the entry build emits:
 * `if (process.env.NODE_ENV === 'production')` is decided here exactly
 * the way the fixed production define decides it in the emitted bytes.
 * A test the defines cannot decide evaluates to `undefined` and both
 * branches stay live.
 */

import type { EsmNode } from './EsmSourceParser';
import { ProducerBuildSettings } from './ProducerBuildSettings';

/** The evaluation produced no value — the branch cannot be decided. */
const UNKNOWN = Symbol('unknown');
/** A name the define map does not cover — runtime `undefined`. */
const RUNTIME_UNDEFINED = Symbol('runtime-undefined');
type Value = string | number | boolean | null | typeof UNKNOWN | typeof RUNTIME_UNDEFINED;

export class ProductionConditionEvaluator {
  /** `process.env.X` → its defined string, read off the fixed settings. */
  private static readonly DEFINES: Record<string, string> =
    ProductionConditionEvaluator.readDefines();

  /**
   * Whether the test is statically decided: `true`/`false` when the
   * fixed defines decide it, `undefined` when they do not.
   */
  static evaluate(test: EsmNode | undefined): boolean | undefined {
    if (test === undefined) return undefined;
    const v = ProductionConditionEvaluator.value(test);
    if (v === UNKNOWN) return undefined;
    return ProductionConditionEvaluator.truthy(v);
  }

  private static truthy(v: Value): boolean {
    if (v === UNKNOWN) return false;
    if (v === RUNTIME_UNDEFINED || v === null || v === false) return false;
    if (v === 0 || v === '') return false;
    return true;
  }

  private static value(node: EsmNode | undefined): Value {
    if (node === undefined) return UNKNOWN;
    switch (node.type) {
      case 'StringLiteral':
      case 'NumericLiteral':
      case 'BooleanLiteral':
        return node.value as string | number | boolean;
      case 'NullLiteral':
        return null;
      case 'TemplateLiteral': {
        if ((node.expressions as unknown[]).length > 0) return UNKNOWN;
        const quasi = (node.quasis as EsmNode[])[0];
        return (quasi?.value as { cooked?: string } | undefined)?.cooked ?? UNKNOWN;
      }
      case 'Identifier':
        return node.name === 'undefined' ? RUNTIME_UNDEFINED : UNKNOWN;
      case 'UnaryExpression':
        return ProductionConditionEvaluator.unary(node);
      case 'MemberExpression':
        return ProductionConditionEvaluator.member(node);
      case 'LogicalExpression':
        return ProductionConditionEvaluator.logical(node);
      case 'BinaryExpression':
        return ProductionConditionEvaluator.binary(node);
      case 'ConditionalExpression': {
        const test = ProductionConditionEvaluator.evaluate(node.test as EsmNode);
        if (test === undefined) return UNKNOWN;
        return ProductionConditionEvaluator.value(
          (test ? node.consequent : node.alternate) as EsmNode
        );
      }
      default:
        return UNKNOWN;
    }
  }

  private static unary(node: EsmNode): Value {
    const operator = String(node.operator);
    const arg = node.argument as EsmNode;
    if (operator === 'void') return RUNTIME_UNDEFINED;
    if (operator === '!') {
      const v = ProductionConditionEvaluator.value(arg);
      return v === UNKNOWN ? UNKNOWN : !ProductionConditionEvaluator.truthy(v);
    }
    if (operator === 'typeof') {
      const v = ProductionConditionEvaluator.value(arg);
      if (v === UNKNOWN) {
        // `typeof <identifier>` is always a defined string.
        return arg.type === 'Identifier' && arg.name === 'undefined'
          ? 'undefined'
          : UNKNOWN;
      }
      if (v === RUNTIME_UNDEFINED || v === null) return 'undefined';
      return typeof v;
    }
    const v = ProductionConditionEvaluator.value(arg);
    if (typeof v !== 'number') return UNKNOWN;
    if (operator === '-') return -v;
    if (operator === '+') return +v;
    if (operator === '~') return ~v;
    return UNKNOWN;
  }

  /** `process.env.NAME` → the fixed define's value (or runtime undefined). */
  private static member(node: EsmNode): Value {
    const object = node.object as EsmNode;
    const property = node.property as EsmNode;
    if (
      object?.type === 'MemberExpression' &&
      (object.object as EsmNode)?.type === 'Identifier' &&
      (object.object as EsmNode).name === 'process' &&
      (object.property as EsmNode)?.type === 'Identifier' &&
      (object.property as EsmNode).name === 'env' &&
      property?.type === 'Identifier'
    ) {
      const key = `process.env.${String(property.name)}`;
      return key in ProductionConditionEvaluator.DEFINES
        ? ProductionConditionEvaluator.DEFINES[key]
        : RUNTIME_UNDEFINED;
    }
    return UNKNOWN;
  }

  private static logical(node: EsmNode): Value {
    const left = ProductionConditionEvaluator.value(node.left as EsmNode);
    const operator = String(node.operator);
    if (left === UNKNOWN) return UNKNOWN;
    const leftTruth = ProductionConditionEvaluator.truthy(left);
    if (operator === '&&') {
      return leftTruth ? ProductionConditionEvaluator.value(node.right as EsmNode) : left;
    }
    if (operator === '||') {
      return leftTruth ? left : ProductionConditionEvaluator.value(node.right as EsmNode);
    }
    if (operator === '??') {
      return left === null || left === RUNTIME_UNDEFINED
        ? ProductionConditionEvaluator.value(node.right as EsmNode)
        : left;
    }
    return UNKNOWN;
  }

  private static binary(node: EsmNode): Value {
    const left = ProductionConditionEvaluator.value(node.left as EsmNode);
    const right = ProductionConditionEvaluator.value(node.right as EsmNode);
    if (left === UNKNOWN || right === UNKNOWN) return UNKNOWN;
    const a = left === RUNTIME_UNDEFINED ? undefined : left;
    const b = right === RUNTIME_UNDEFINED ? undefined : right;
    switch (String(node.operator)) {
      case '===':
        return a === b;
      case '!==':
        return a !== b;
      case '==':
        return a == b;
      case '!=':
        return a != b;
      case '<':
        return (a as number) < (b as number);
      case '<=':
        return (a as number) <= (b as number);
      case '>':
        return (a as number) > (b as number);
      case '>=':
        return (a as number) >= (b as number);
      case '+':
        if (typeof a === 'string' || typeof b === 'string') return `${a}${b}`;
        if (typeof a === 'number' && typeof b === 'number') return a + b;
        return UNKNOWN;
      case '-':
        return typeof a === 'number' && typeof b === 'number' ? a - b : UNKNOWN;
      default:
        return UNKNOWN;
    }
  }

  private static readDefines(): Record<string, string> {
    return { ...ProducerBuildSettings.defines };
  }
}
