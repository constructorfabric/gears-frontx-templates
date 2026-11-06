#!/usr/bin/env node
/**
 * design-verify static check - reads a screen's source, no browser: literal
 * values where the kit has a token, and native elements where the kit has a
 * component.
 *
 *   npm run verify:static --workspace=@gears-frontx/design-verify -- \
 *     --src src-app/mfe_packages/orders [--src <dir or file>...]
 *
 * CSS Modules (`*.module.css`) are parsed with css-tree. Every declaration
 * value is walked outside `var()`: a colour literal anywhere (custom property
 * definitions included, or a literal would hide behind a local variable; a
 * `color-mix()` by each colour it mixes; a relative colour by the rule below),
 * literal lengths in spacing, radius and font-size properties, any literal in
 * a shadow, and literal durations and easings in transitions and animations.
 *
 * A relative colour is derived from a token when its origin is a `var()`, a
 * relative colour that is itself derived, or an allowed keyword such as
 * `currentColor`, AND every colour channel except alpha reads an origin
 * channel keyword or a `var()`, alone or inside `calc()`. A colour channel of
 * only literal numbers makes it a literal finding. Alpha may be a literal or
 * `alpha`; `alpha` is not a colour channel keyword. These pass:
 * `oklch(from var(--p) l c var(--h))`,
 * `rgb(from var(--p) var(--r) var(--g) var(--b))`,
 * `oklch(from var(--p) l c calc(h + 30))`, `rgb(from var(--p) r g b / 50%)`.
 * These are findings: `rgb(from var(--x) 255 0 0)`,
 * `rgb(from var(--x) 255 0 0 / alpha)`, `hwb(from var(--p) 0 0% 0% / alpha)`.
 *
 * `0` is never a finding. TSX and TS are parsed with the project's own
 * TypeScript compiler API: lowercase JSX tags (and React's
 * `createElement('tag')`, never `document.createElement`) that the kit ships
 * a component for, a native element given a role the kit
 * covers, an `<a>` with `onClick` and no link target, and inline style
 * literals of the same kinds as in CSS (`style={{...}}`, or a `style` prop
 * object passed to React's `createElement`, on any element or component).
 *
 * What counts and what to use instead is data in the frontx-design skill:
 * `rules/static-check.json` (elements, roles, literal kinds and the DESIGN.md
 * group that holds each kind's tokens) and `rules/quality-gates.json` (the
 * gate each finding names). A kind whose DESIGN.md group names no token
 * reports nothing: the kit has no token for it.
 *
 * A finding the per-screen waiver file covers (`screen.source` glob,
 * runner/waivers.mjs) moves to the report's waived list.
 *
 * Paths resolve against the project root ($INIT_CWD, set by npm to where it
 * was invoked, else the current directory). Writes
 * `<out>/static-findings.json`. Exit codes, as the render runner: 0 ran
 * (findings are advisory), 1 findings with --fail-on-findings (with
 * --baseline, only findings the baseline lacks), 2 usage or input error,
 * including a source file that does not parse: an unread file is not clean.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import * as csstree from 'css-tree';
import { ContractError, designMdParser, isEntryPoint, projectRoot, readSkillJson } from './skill.mjs';
import { applyWaivers, coversSource, loadWaivers, waiverLines, waiverReport, WaiverError } from './waivers.mjs';

export const USAGE = `design-verify static check - literal values and native elements where the
kit has a token or a component, in CSS Modules and TSX/TS, no browser.

Usage: npm run verify:static --workspace=@gears-frontx/design-verify -- --src <dir> [flags]

  --src <dir or file>       Source to check; repeat for more. Required: name
                            the screen's own package, not the whole app
  --design <file>           DESIGN.md whose front matter names the kit tokens
                            each fix suggests (default DESIGN.md)
  --out <dir>               Report directory (default design-verify-report);
                            the report is static-findings.json
  --waivers <file>          Per-screen waiver file (default design-waivers.json
                            at the project root, when present): a finding a
                            waiver's screen.source glob covers moves to waived
  --baseline <file>         Compare against a prior static-findings.json: with
                            --fail-on-findings only findings it lacks gate
  --fail-on-findings        Exit 1 when a finding is reported (default:
                            advisory, exit 0)
  --help                    Print this message

Relative paths resolve against the project root ($INIT_CWD, else the current
directory). Symbolic links are followed. Listed as skipped: an entry that
cannot be read (a broken link, no access) unless an exclude glob covers it,
since what it points to is unknown; a link cycle or a directory it cannot
list, unless excluded; a file the globs select that is not a regular file;
and a second path to a file already read. Only an exclude glob ending in /**
excludes a directory. Directories named node_modules or .git are never
entered and never listed. Exit 0 ran, 1 findings with --fail-on-findings, 2 usage or input
error (a source file that does not parse, or a --src that selects no file,
included).
`;

/** A usage or input error: exit 2. */
export class InputError extends Error {}

const VAR_ONLY = /^var\((--[\w-]+)\)$/;
/** Directory names the source walk never enters, whatever the globs say. */
const ALWAYS_EXCLUDED = new Set(['node_modules', '.git']);
const SHOWN_TOKENS = 6;

/**
 * Each literal kind's token names, from the DESIGN.md front matter group the
 * data names (and its key pattern or typography field).
 *
 * @param {any} literals `literals` of rules/static-check.json
 * @param {Record<string, any>} front parsed DESIGN.md front matter
 * @returns {Map<string, {group: string, tokens: string[]}>}
 */
export function kindTokens(literals, front) {
  const result = new Map();
  for (const [kind, spec] of Object.entries(literals.kinds)) {
    const group = front[spec.group];
    let values = [];
    if (group && typeof group === 'object') {
      const pattern = spec.keyPattern ? new RegExp(spec.keyPattern) : null;
      for (const [key, value] of Object.entries(group)) {
        if (pattern && !pattern.test(key)) continue;
        values.push(spec.field ? value?.[spec.field] : value);
      }
    }
    values = values.filter((v) => typeof v === 'string');
    const tokens = [...new Set(values.map((v) => VAR_ONLY.exec(v)?.[1]).filter(Boolean))];
    result.set(kind, { group: spec.group, tokens });
  }
  return result;
}

/** @param {string} kind @param {{group: string, tokens: string[]}} entry */
function tokenFix(kind, entry) {
  const shown = entry.tokens.slice(0, SHOWN_TOKENS).map((t) => `var(${t})`).join(', ');
  const more = entry.tokens.length - SHOWN_TOKENS;
  return (
    `use ${/^[aeiou]/.test(kind) ? 'an' : 'a'} ${kind} token from DESIGN.md ${entry.group}: ${shown}` +
    (more > 0 ? ` and ${more} more there` : '')
  );
}

/**
 * The context the value and element checks share.
 *
 * @param {any} rules rules/static-check.json
 * @param {Record<string, any>} front DESIGN.md front matter
 */
export function checkContext(rules, front) {
  const { literals } = rules;
  return {
    rules,
    tokens: kindTokens(literals, front),
    allowed: new Set(literals.allowedKeywords.map((k) => k.toLowerCase())),
    colorFunctions: new Set(literals.colorFunctions),
    colorIgnore: new Set(literals.colorIgnoreProperties ?? []),
    lengthUnits: new Set(literals.lengthUnits),
    timeUnits: new Set(literals.timeUnits),
    easingKeywords: new Set(literals.easings.keywords),
    easingFunctions: new Set(literals.easings.functions),
  };
}

/** Kinds that apply to a property and have a kit token. */
function applicableKinds(ctx, property, isCustom) {
  const kinds = new Set();
  for (const [kind, spec] of Object.entries(ctx.rules.literals.kinds)) {
    if (ctx.tokens.get(kind).tokens.length === 0) continue;
    if (spec.properties === '*') {
      if (!ctx.colorIgnore.has(property)) kinds.add(kind);
    } else if (!isCustom && spec.properties.includes(property)) {
      kinds.add(kind);
    }
  }
  return kinds;
}

function isZero(node) {
  return Number(node.value) === 0;
}

/**
 * The colour channel keywords relative colour syntax gives each colour
 * function: the origin's channels, by the CSS Color 5 grammar. `color()` names
 * `r g b` or `x y z` by its colour space. `alpha` is not a colour channel.
 */
const ORIGIN_CHANNELS = {
  rgb: ['r', 'g', 'b'],
  rgba: ['r', 'g', 'b'],
  hsl: ['h', 's', 'l'],
  hsla: ['h', 's', 'l'],
  hwb: ['h', 'w', 'b'],
  lab: ['l', 'a', 'b'],
  oklab: ['l', 'a', 'b'],
  lch: ['l', 'c', 'h'],
  oklch: ['l', 'c', 'h'],
  color: ['r', 'g', 'b', 'x', 'y', 'z'],
};

/**
 * Whether every colour channel (the values before the `/` that starts alpha)
 * reads an origin channel keyword or a `var()`, alone or inside `calc()`.
 * Alpha is not checked.
 */
function readsOriginChannels(fnName, channels) {
  const keywords = new Set(ORIGIN_CHANNELS[fnName] ?? []);
  const slash = channels.findIndex((n) => n.type === 'Operator' && n.value === '/');
  let colour = slash === -1 ? channels : channels.slice(0, slash);
  // color() names its colour space first (`srgb`); the channels follow.
  if (fnName === 'color') colour = colour.slice(1);
  return (
    colour.length > 0 &&
    colour.every((channel) => {
      let reads = false;
      csstree.walk(channel, function enter(node) {
        if (node.type === 'Function' && node.name.toLowerCase() === 'var') {
          reads = true;
          return csstree.walk.skip;
        }
        if (node.type === 'Identifier' && keywords.has(node.name.toLowerCase())) reads = true;
        return undefined;
      });
      return reads;
    })
  );
}

/**
 * A colour written as a value rather than taken from a token; a relative
 * colour by the rule in the header. `color-mix()` is not a colour function
 * here, so the walk checks each of its colour arguments on its own.
 */
function isColorLiteral(ctx, node) {
  if (node.type === 'Hash') return true;
  if (node.type === 'Function') {
    const name = node.name.toLowerCase();
    if (!ctx.colorFunctions.has(name)) return false;
    const [first, origin, ...channels] = node.children.toArray().filter((n) => n.type !== 'WhiteSpace');
    const relative = first?.type === 'Identifier' && first.name.toLowerCase() === 'from';
    if (!relative || origin === undefined) return true;
    return isColorLiteral(ctx, origin) || !readsOriginChannels(name, channels);
  }
  if (node.type === 'Identifier') {
    const name = node.name.toLowerCase();
    if (ctx.allowed.has(name)) return false;
    return csstree.lexer.matchType('named-color', name).matched !== null;
  }
  return false;
}

/**
 * Literal values in one declaration value, outside `var()`.
 *
 * @param {ReturnType<typeof checkContext>} ctx
 * @param {string} rawProperty
 * @param {any} value a css-tree Value node
 * @returns {Array<{kind: string, found: string, loc?: {line: number, column: number}}>}
 */
export function literalsInValue(ctx, rawProperty, value) {
  const isCustom = rawProperty.startsWith('--');
  const property = isCustom ? rawProperty : rawProperty.toLowerCase();
  const kinds = applicableKinds(ctx, property, isCustom);
  if (kinds.size === 0) return [];
  const out = [];
  const lengthKind = ['spacing', 'radius', 'font-size'].find((k) => kinds.has(k));

  if (property === 'font') {
    // The shorthand holds one font size: the length (or calc) before its
    // `/line-height`, else its only length. The line height is not one.
    const nodes = value.children.toArray();
    const slash = nodes.findIndex((n) => n.type === 'Operator' && n.value === '/');
    const size = (slash === -1 ? nodes : nodes.slice(0, slash)).findLast(
      (n) =>
        (n.type === 'Dimension' && ctx.lengthUnits.has(n.unit.toLowerCase())) ||
        (n.type === 'Function' && n.name.toLowerCase() !== 'var'),
    );
    if (!size) return out;
    csstree.walk(size, function enter(node) {
      if (node.type === 'Function' && node.name.toLowerCase() === 'var') return csstree.walk.skip;
      if (node.type === 'Dimension' && !isZero(node) && ctx.lengthUnits.has(node.unit.toLowerCase())) {
        out.push({ kind: 'font-size', found: csstree.generate(node), loc: node.loc?.start });
      }
      return undefined;
    });
    return out;
  }

  if (kinds.has('shadow')) {
    // A shadow is one value: report it once, whatever literal it holds.
    let literal = false;
    csstree.walk(value, function enter(node) {
      if (node.type === 'Function' && node.name.toLowerCase() === 'var') return csstree.walk.skip;
      if ((node.type === 'Dimension' && !isZero(node)) || isColorLiteral(ctx, node)) literal = true;
      return undefined;
    });
    if (literal) out.push({ kind: 'shadow', found: csstree.generate(value), loc: value.loc?.start });
    return out;
  }

  csstree.walk(value, function enter(node) {
    if (node.type === 'Function' && node.name.toLowerCase() === 'var') return csstree.walk.skip;
    const loc = node.loc?.start;
    if (kinds.has('color') && isColorLiteral(ctx, node)) {
      out.push({ kind: 'color', found: csstree.generate(node), loc });
      return csstree.walk.skip;
    }
    if (kinds.has('easing')) {
      const easingFn = node.type === 'Function' && ctx.easingFunctions.has(node.name.toLowerCase());
      const easingWord = node.type === 'Identifier' && ctx.easingKeywords.has(node.name.toLowerCase());
      if (easingFn || easingWord) {
        out.push({ kind: 'easing', found: csstree.generate(node), loc });
        return csstree.walk.skip;
      }
    }
    if (node.type === 'Dimension' && !isZero(node)) {
      const unit = node.unit.toLowerCase();
      if (lengthKind && ctx.lengthUnits.has(unit)) out.push({ kind: lengthKind, found: csstree.generate(node), loc });
      else if (kinds.has('duration') && ctx.timeUnits.has(unit)) out.push({ kind: 'duration', found: csstree.generate(node), loc });
    }
    return undefined;
  });
  return out;
}

/** @param {ReturnType<typeof checkContext>} ctx @param {string} kind @param {string} found */
function literalFinding(ctx, kind, found, property) {
  return {
    gate: ctx.rules.literals.gate,
    kind,
    found: `${found} in ${property}`,
    fix: tokenFix(kind, ctx.tokens.get(kind)),
  };
}

/**
 * @param {ReturnType<typeof checkContext>} ctx
 * @param {string} text
 * @param {string} file root-relative path, for the report
 */
export function checkCss(ctx, text, file) {
  const findings = [];
  const parseErrors = [];
  const ast = csstree.parse(text, {
    positions: true,
    filename: file,
    parseCustomProperty: true,
    onParseError: (error) => parseErrors.push(`${file}:${error.line}:${error.column}: ${error.message}`),
  });
  csstree.walk(ast, {
    visit: 'Declaration',
    enter(decl) {
      if (decl.value.type !== 'Value') return;
      for (const hit of literalsInValue(ctx, decl.property, decl.value)) {
        const at = hit.loc ?? decl.loc.start;
        findings.push({
          ...literalFinding(ctx, hit.kind, hit.found, decl.property),
          file,
          line: at.line,
          column: at.column,
        });
      }
    },
  });
  return { findings, parseErrors };
}

/** `marginTop` -> `margin-top`, `WebkitTransition` -> `-webkit-transition`, `--x` stays. */
function cssProperty(key) {
  if (key.startsWith('--')) return key;
  return key.replace(/^(Webkit|Moz|ms)(?=[A-Z])/, (p) => `-${p.toLowerCase()}`).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/**
 * @param {ReturnType<typeof checkContext>} ctx
 * @param {any} ts the TypeScript module
 * @param {string} text
 * @param {string} file root-relative path, for the report
 */
export function checkScript(ctx, ts, text, file) {
  const findings = [];
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const parseErrors = (source.parseDiagnostics ?? []).map((d) => {
    const { line, character } = source.getLineAndCharacterOfPosition(d.start ?? 0);
    return `${file}:${line + 1}:${character + 1}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`;
  });
  const at = (node) => {
    const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
    return { file, line: line + 1, column: character + 1 };
  };
  const literalText = (expr) =>
    expr && (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) ? expr.text : undefined;
  const { elements } = ctx.rules;

  /** @param {any} object an ObjectLiteralExpression of style properties */
  const checkStyle = (object) => {
    for (const prop of object.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      const key = ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : undefined;
      if (!key) continue;
      const property = cssProperty(key);
      const init = prop.initializer;
      const text = literalText(init);
      if (text !== undefined) {
        let value;
        try {
          value = csstree.parse(text, { context: 'value' });
        } catch {
          continue;
        }
        for (const hit of literalsInValue(ctx, property, value)) {
          findings.push({ ...literalFinding(ctx, hit.kind, hit.found, property), ...at(init) });
        }
        continue;
      }
      const negative = ts.isPrefixUnaryExpression(init) && init.operator === ts.SyntaxKind.MinusToken;
      const num = negative ? init.operand : init;
      if (ts.isNumericLiteral(num) && Number(num.text) !== 0) {
        // React appends px to a bare number on a length property.
        const kinds = applicableKinds(ctx, property, false);
        const lengthKind = ['spacing', 'radius', 'font-size'].find((k) => kinds.has(k));
        if (lengthKind) {
          findings.push({ ...literalFinding(ctx, lengthKind, `${negative ? '-' : ''}${num.text}`, property), ...at(init) });
        }
      }
    }
  };

  /**
   * @param {string} tag
   * @param {Map<string, {value?: string, dynamic: boolean}>} attrs
   * @param {boolean} spread props of unknown shape are spread in
   * @param {any} node
   */
  const checkElement = (tag, attrs, spread, node) => {
    const push = (found, components) =>
      findings.push({
        gate: elements.gate,
        kind: 'element',
        found,
        fix: `use the kit ${components.join(' or ')} from @gears-frontx/ui-kit`,
        ...at(node),
      });
    const role = attrs.get('role')?.value?.trim().toLowerCase();
    if (role && Object.hasOwn(elements.roles, role)) {
      push(`<${tag} role="${role}">`, elements.roles[role]);
      return;
    }
    if (tag === 'a') {
      if (!attrs.has('onClick')) return;
      const href = attrs.get('href');
      if (href === undefined && spread) return;
      if (href?.dynamic) return;
      const target = href?.value?.trim().toLowerCase();
      if (href === undefined || target === '' || target === '#' || target?.startsWith('javascript:')) {
        push(`<a onClick> with no link target`, elements.anchorAsButton);
      }
      return;
    }
    let components = Object.hasOwn(elements.tags, tag) ? elements.tags[tag] : undefined;
    let found = `<${tag}>`;
    if (tag === 'input') {
      const type = attrs.get('type');
      if (type?.dynamic) return;
      const value = (type?.value ?? 'text').trim().toLowerCase();
      if (Object.hasOwn(elements.inputTypes, value)) components = elements.inputTypes[value];
      found = `<input type="${value}">`;
    }
    if (components && components.length > 0) push(found, components);
  };

  const jsxAttrs = (attributes) => {
    const attrs = new Map();
    let spread = false;
    for (const attr of attributes.properties) {
      if (ts.isJsxSpreadAttribute(attr)) {
        spread = true;
        continue;
      }
      const name = attr.name.getText(source);
      const init = attr.initializer;
      if (init === undefined) attrs.set(name, { value: '', dynamic: false });
      else if (ts.isStringLiteral(init)) attrs.set(name, { value: init.text, dynamic: false });
      else if (ts.isJsxExpression(init)) {
        const text = literalText(init.expression);
        attrs.set(name, text === undefined ? { dynamic: true } : { value: text, dynamic: false });
        if (name === 'style' && init.expression && ts.isObjectLiteralExpression(init.expression)) {
          checkStyle(init.expression);
        }
      }
    }
    return { attrs, spread };
  };

  const objectAttrs = (object) => {
    const attrs = new Map();
    let spread = false;
    if (!object) return { attrs, spread };
    // Props passed as a variable could hold anything.
    if (!ts.isObjectLiteralExpression(object)) return { attrs, spread: object.kind !== ts.SyntaxKind.NullKeyword };
    for (const prop of object.properties) {
      if (ts.isSpreadAssignment(prop)) {
        spread = true;
        continue;
      }
      if (!ts.isPropertyAssignment(prop) && !ts.isShorthandPropertyAssignment(prop)) continue;
      const name = prop.name.getText(source).replace(/^['"]|['"]$/g, '');
      const text = ts.isPropertyAssignment(prop) ? literalText(prop.initializer) : undefined;
      attrs.set(name, text === undefined ? { dynamic: true } : { value: text, dynamic: false });
      if (name === 'style' && ts.isPropertyAssignment(prop) && ts.isObjectLiteralExpression(prop.initializer)) {
        checkStyle(prop.initializer);
      }
    }
    return { attrs, spread };
  };

  // React's createElement only: `React.createElement` (or the name `react`'s
  // default or namespace import binds), and a bare name imported from
  // `react`. `document.createElement('input')` builds DOM, not React.
  const reactNamespaces = new Set(['React']);
  const reactCreateElement = new Set();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || literalText(statement.moduleSpecifier) !== 'react') continue;
    const clause = statement.importClause;
    if (clause?.name) reactNamespaces.add(clause.name.text);
    const bindings = clause?.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) reactNamespaces.add(bindings.name.text);
    if (bindings && ts.isNamedImports(bindings)) {
      for (const spec of bindings.elements) {
        if ((spec.propertyName ?? spec.name).text === 'createElement') reactCreateElement.add(spec.name.text);
      }
    }
  }
  const isReactCreateElement = (callee) =>
    ts.isIdentifier(callee)
      ? reactCreateElement.has(callee.text)
      : ts.isPropertyAccessExpression(callee) &&
        callee.name.text === 'createElement' &&
        ts.isIdentifier(callee.expression) &&
        reactNamespaces.has(callee.expression.text);

  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const { attrs, spread } = jsxAttrs(node.attributes);
      if (ts.isIdentifier(node.tagName) && /^[a-z][a-z0-9]*$/.test(node.tagName.text)) {
        checkElement(node.tagName.text, attrs, spread, node);
      }
    } else if (ts.isCallExpression(node) && isReactCreateElement(node.expression)) {
      // Props are read for every type, as JSX attributes are, so an inline
      // style on a component counts; only a native tag is an element finding.
      const { attrs, spread } = objectAttrs(node.arguments[1]);
      const tag = literalText(node.arguments[0]);
      if (tag && /^[a-z][a-z0-9]*$/.test(tag)) checkElement(tag, attrs, spread, node);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { findings, parseErrors };
}

/**
 * Files under the given sources that the data's globs select, as
 * root-relative posix paths. Symbolic links are followed; a link back to a
 * directory above it (a cycle) is not walked again, and a file reached
 * through two paths is read once. `skipped` lists, with the reason: an
 * entry that cannot be read (a broken link, no access) unless an exclude
 * glob covers it, since the walk cannot know what it points to; a link
 * cycle and a directory it cannot list, unless excluded; a non-regular file
 * the globs select; and a second path to a file already read. A directory is
 * excluded whole only by an exclude glob ending in `/**` whose part before
 * it matches the directory. Directories named node_modules or .git are never
 * entered and never listed. `empty` names each source that selected no file.
 *
 * @param {string} root
 * @param {string[]} sources absolute paths
 * @param {{css: string[], script: string[], exclude: string[]}} globs
 * @returns {{files: Array<[string, 'css' | 'script']>, skipped: Array<{path: string, reason: string}>, empty: string[]}}
 */
export function collectFiles(root, sources, globs) {
  const files = new Map();
  const skipped = [];
  const empty = [];
  const reached = new Map(); // a selected file's real path -> the root-relative path it was first read by
  let selected = 0;
  const rel = (abs) => path.relative(root, abs).split(path.sep).join('/') || '.';
  const matches = (file, patterns) => patterns.some((p) => path.posix.matchesGlob(file, p));
  /** @returns {'css' | 'script' | undefined} the check a file at this path gets, if any */
  const typeOf = (file) =>
    matches(file, globs.exclude) ? undefined : matches(file, globs.css) ? 'css' : matches(file, globs.script) ? 'script' : undefined;
  // A directory an exclude glob covers whole: one that ends in `/**` and
  // whose part before it matches the directory (`**/dist/**`). Read from the
  // glob's shape, so a file-name glob such as `**/_*` excludes no directory.
  const dirExcludes = globs.exclude.filter((p) => p.endsWith('/**')).map((p) => p.slice(0, -3));
  const excludedDir = (dir) => matches(dir, dirExcludes);
  const errorCode = (error) => error.code ?? error.message;
  /** @param {string} abs @param {Map<string, string>} ancestors real path -> path of each directory above */
  const visit = (abs, ancestors) => {
    const at = rel(abs);
    let stat;
    try {
      stat = fs.statSync(abs);
    } catch (error) {
      // What a broken link points to is unknown: list it unless an exclude glob covers it.
      if (!matches(at, globs.exclude) && !excludedDir(at)) {
        skipped.push({ path: at, reason: `cannot be read (${errorCode(error)}), a broken link or no access` });
      }
      return;
    }
    if (stat.isDirectory()) {
      if (excludedDir(at)) return;
      let real;
      let entries;
      try {
        real = fs.realpathSync(abs);
        entries = fs.readdirSync(abs);
      } catch (error) {
        skipped.push({ path: at, reason: `a directory that cannot be listed (${errorCode(error)})` });
        return;
      }
      if (ancestors.has(real)) {
        skipped.push({ path: at, reason: `a link cycle back to ${ancestors.get(real)}, read once` });
        return;
      }
      const below = new Map(ancestors).set(real, at);
      for (const entry of entries) {
        if (!ALWAYS_EXCLUDED.has(entry)) visit(path.join(abs, entry), below);
      }
      return;
    }
    const file = at;
    const type = typeOf(file);
    if (!type) return;
    if (!stat.isFile()) {
      skipped.push({ path: file, reason: 'not a regular file or directory' });
      return;
    }
    let real;
    try {
      real = fs.realpathSync(abs);
    } catch (error) {
      skipped.push({ path: file, reason: `cannot be read (${errorCode(error)})` });
      return;
    }
    selected += 1;
    const first = reached.get(real);
    if (first === undefined) {
      reached.set(real, file);
      files.set(file, type);
    } else if (first !== file) {
      // The same path twice (two --src that overlap) is one file, not a skip.
      skipped.push({ path: file, reason: `the same file as ${first}, read once` });
    }
  };
  for (const source of sources) {
    const before = selected;
    visit(source, new Map());
    if (selected === before) empty.push(rel(source));
  }
  // Code point order: the same on every machine, whatever its locale.
  return { files: [...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)), skipped, empty };
}

/** Identity across runs: line and column move with unrelated edits, so they are left out. */
function staticKey(finding) {
  return JSON.stringify([finding.file, finding.gate, finding.kind, finding.found]);
}

function countBy(findings) {
  const map = new Map();
  for (const finding of findings) {
    const key = staticKey(finding);
    const entry = map.get(key);
    if (entry) entry.count += 1;
    else map.set(key, { file: finding.file, gate: finding.gate, kind: finding.kind, found: finding.found, count: 1 });
  }
  return map;
}

/**
 * Multiset diff against a prior static report, as the render runner's
 * diff: new (absent, or more instances), resolved (fewer, in a file checked
 * now), unverified (fewer, in a file not checked now), carriedOver.
 *
 * @param {{findings?: any[]}} baseline
 * @param {{findings: any[], files: string[]}} current
 */
export function diffStatic(baseline, current) {
  const before = countBy(baseline.findings ?? []);
  const after = countBy(current.findings);
  const checked = new Set(current.files);
  const added = [];
  const resolved = [];
  const unverified = [];
  let carriedOver = 0;
  for (const [key, entry] of after) {
    const previous = before.get(key)?.count ?? 0;
    carriedOver += Math.min(previous, entry.count);
    if (entry.count > previous) added.push({ ...entry, count: entry.count - previous });
  }
  for (const [key, entry] of before) {
    const now = after.get(key)?.count ?? 0;
    if (now >= entry.count) continue;
    const gone = { ...entry, count: entry.count - now };
    (checked.has(entry.file) ? resolved : unverified).push(gone);
  }
  return { new: added, resolved, unverified, carriedOver };
}

/**
 * @param {{root: string, sources: string[], files: string[], findings: any[],
 *   skipped?: Array<{path: string, reason: string}>,
 *   waived?: any[], waivers?: object, parseErrors: string[]}} run
 */
export function buildStaticReport(run) {
  const byGate = {};
  const byKind = {};
  for (const finding of run.findings) {
    byGate[finding.gate] = (byGate[finding.gate] ?? 0) + 1;
    byKind[finding.kind] = (byKind[finding.kind] ?? 0) + 1;
  }
  return {
    tool: 'design-verify static check',
    generatedAt: new Date().toISOString(),
    root: run.root,
    sources: run.sources,
    summary: {
      filesChecked: run.files.length,
      skipped: run.skipped?.length ?? 0,
      totalFindings: run.findings.length,
      waived: run.waived?.length ?? 0,
      parseErrors: run.parseErrors.length,
      byGate,
      byKind,
    },
    files: run.files,
    skipped: run.skipped ?? [],
    findings: run.findings,
    waived: run.waived ?? [],
    ...(run.waivers ? { waivers: run.waivers } : {}),
    parseErrors: run.parseErrors,
  };
}

/**
 * @param {ReturnType<typeof buildStaticReport>} report
 * @param {{failOnFindings: boolean}} config
 * @param {ReturnType<typeof diffStatic>} [diff]
 */
export function staticExitCode(report, config, diff) {
  if (report.summary.parseErrors > 0) return 2;
  if (!config.failOnFindings) return 0;
  if (diff) return diff.new.length > 0 ? 1 : 0;
  return report.summary.totalFindings > 0 ? 1 : 0;
}

/** @param {ReturnType<typeof buildStaticReport>} report @param {ReturnType<typeof diffStatic>} [diff] */
export function staticSummaryLines(report, diff) {
  const s = report.summary;
  const lines = [
    `design-verify static: ${s.filesChecked} file(s) checked` +
      (s.skipped > 0 ? `, ${s.skipped} skipped` : '') +
      ` - ${s.totalFindings} finding(s), ${s.waived} waived, ${s.parseErrors} parse error(s)`,
  ];
  for (const entry of report.skipped) lines.push(`  SKIPPED ${entry.path}: ${entry.reason}`);
  for (const f of report.findings) {
    lines.push(`  ${f.gate} ${f.file}:${f.line}:${f.column} ${f.kind} ${f.found}: ${f.fix}`);
  }
  for (const f of report.waived) {
    lines.push(`  WAIVED ${f.gate} ${f.file}:${f.line}:${f.column} ${f.kind} ${f.found} - waiver #${f.waiver.index}: ${f.waiver.reason}`);
  }
  lines.push(...waiverLines(report.waivers));
  for (const error of report.parseErrors) lines.push(`  PARSE ERROR ${error}`);
  if (diff) {
    const total = (entries) => entries.reduce((sum, e) => sum + e.count, 0);
    lines.push(
      `  vs baseline: ${total(diff.new)} new, ${total(diff.resolved)} resolved, ` +
        `${total(diff.unverified)} unverified, ${diff.carriedOver} carried over`,
    );
    const describe = (f) => `${f.gate} ${f.file}: ${f.kind} ${f.found}` + (f.count > 1 ? ` (x${f.count})` : '');
    for (const f of diff.new) lines.push(`  NEW ${describe(f)}`);
    for (const f of diff.resolved) lines.push(`  RESOLVED ${describe(f)}`);
    for (const f of diff.unverified) lines.push(`  UNVERIFIED ${describe(f)}`);
  }
  return lines;
}

/** The project's TypeScript, else the one this package resolves. */
function loadTypeScript(root) {
  for (const from of [path.join(root, 'package.json'), fileURLToPath(import.meta.url)]) {
    try {
      return createRequire(from)('typescript');
    } catch {
      // try the next location
    }
  }
  throw new InputError(`cannot resolve typescript from ${root} or from design-verify; install the project dependencies`);
}

function readJsonFile(file, what) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new InputError(`${what} ${file} could not be read: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * @typedef {{cwd?: string, env?: Record<string, string | undefined>,
 *   log?: (line: string) => void, error?: (line: string) => void}} Io
 */

/**
 * @param {string[]} argv
 * @param {Io} [io]
 * @returns {Promise<number>} exit code
 */
export async function main(argv, io = {}) {
  try {
    return await run(argv, io);
  } catch (error) {
    if (!(error instanceof InputError || error instanceof ContractError || error instanceof WaiverError)) throw error;
    (io.error ?? ((line) => console.error(line)))(`design-verify static: ${error.message}`);
    return 2;
  }
}

/** @param {string[]} argv @param {Io} io */
async function run(argv, io) {
  const log = io.log ?? ((line) => console.log(line));
  const root = projectRoot(io.env ?? process.env, io.cwd ?? process.cwd());
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        src: { type: 'string', multiple: true },
        design: { type: 'string' },
        out: { type: 'string' },
        baseline: { type: 'string' },
        waivers: { type: 'string' },
        'fail-on-findings': { type: 'boolean' },
        help: { type: 'boolean' },
      },
    }));
  } catch (error) {
    throw new InputError(`${error instanceof Error ? error.message : String(error)}\nrun with --help for usage`);
  }
  if (values.help) {
    log(USAGE);
    return 0;
  }
  const at = (p) => path.resolve(root, p);
  const sources = (values.src ?? []).map(at);
  if (sources.length === 0) throw new InputError('--src is required: name the screen source to check\nrun with --help for usage');
  for (const source of sources) {
    if (!fs.existsSync(source)) throw new InputError(`--src ${source} does not exist`);
  }
  const baseline = values.baseline ? readJsonFile(at(values.baseline), '--baseline') : undefined;

  const rules = readSkillJson('rules/static-check.json');
  const waivers = loadWaivers(values.waivers ? at(values.waivers) : undefined, root, readSkillJson('rules/quality-gates.json'));
  const { readDesignMd, InputError: DesignMdError } = await designMdParser();
  let front;
  try {
    ({ front } = readDesignMd(at(values.design ?? 'DESIGN.md')));
  } catch (error) {
    if (error instanceof DesignMdError) throw new InputError(error.message);
    throw error;
  }
  const ctx = checkContext(rules, front);

  const { files, skipped, empty } = collectFiles(root, sources, rules.sources);
  // A source that selects nothing would pass a gate while checking nothing.
  if (empty.length > 0) {
    const why = (source) => skipped.find((s) => s.path === source)?.reason;
    throw new InputError(
      empty
        .map((source) => `--src ${source} selects no file to check` + (why(source) ? ` (${why(source)})` : ''))
        .join('\n') +
        `\nthe check reads ${[...rules.sources.css, ...rules.sources.script].join(', ')}, ` +
        `except ${rules.sources.exclude.join(', ')} (rules/static-check.json)`,
    );
  }
  const ts = files.some(([, type]) => type === 'script') ? loadTypeScript(root) : undefined;
  const findings = [];
  const parseErrors = [];
  for (const [file, type] of files) {
    let text;
    try {
      text = fs.readFileSync(path.join(root, file), 'utf8');
    } catch (error) {
      throw new InputError(`${file} could not be read: ${error instanceof Error ? error.message : String(error)}`);
    }
    const result = type === 'css' ? checkCss(ctx, text, file) : checkScript(ctx, ts, text, file);
    findings.push(...result.findings);
    parseErrors.push(...result.parseErrors);
  }

  const split = applyWaivers(findings, waivers.waivers, coversSource);
  const report = buildStaticReport({
    root,
    sources: sources.map((s) => path.relative(root, s).split(path.sep).join('/') || '.'),
    files: files.map(([file]) => file),
    skipped,
    findings: split.findings,
    waived: split.waived,
    waivers: waiverReport(waivers, {
      mode: 'source',
      gates: [rules.literals.gate, rules.elements.gate],
      exercised: files.map(([file]) => file),
    }),
    parseErrors,
  });
  const diff = baseline ? diffStatic(baseline, report) : undefined;
  if (diff) report.baselineComparison = { baseline: at(values.baseline), ...diff };
  const outDir = at(values.out ?? 'design-verify-report');
  fs.mkdirSync(outDir, { recursive: true });
  const reportPath = path.join(outDir, 'static-findings.json');
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  for (const line of staticSummaryLines(report, diff)) log(line);
  log(`design-verify static: report written to ${reportPath}`);
  return staticExitCode(report, { failOnFindings: Boolean(values['fail-on-findings']) }, diff);
}

if (isEntryPoint(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(`design-verify static: ${error instanceof Error ? error.stack : String(error)}`);
      process.exit(2);
    },
  );
}
