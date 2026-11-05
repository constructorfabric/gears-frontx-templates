#!/usr/bin/env node
/**
 * DESIGN.md front matter from the installed @gears-frontx/ui-kit tokens.
 *
 *   node design-md.mjs generate [--design DESIGN.md] [--theme <theme.css>] [--name <name>] [--kit-version <v>]
 *   node design-md.mjs check    [same flags]   exit 1 when the front matter differs from what generate writes
 *   node design-md.mjs lint     [--design DESIGN.md]   broken {refs}, ref cycles, orphaned tokens, WCAG contrast;
 *                                                      a pair it cannot compute (not opaque hex, rgb() or hsl()) is a finding
 *
 * The kit's theme.css is the source; DESIGN.md mirrors it, never the reverse.
 * generate rewrites only the YAML front matter and keeps the markdown body.
 *
 * Contract: the script reads only the shape of the kit's own theme.css and
 * does not emulate the CSS cascade (see parseTheme):
 *   - custom properties come from `:root`, `:root, [data-theme='light']` and
 *     `[data-theme='dark']` blocks, in that order: all :root blocks, then the
 *     light blocks, then the dark blocks, then the optional
 *     `@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) }`
 *     fallback; each may repeat, a block out of this order is exit 2;
 *   - light = :root + light blocks, dark = :root + light + dark blocks (the light
 *     block lists :root, so the browser applies it to the dark root too);
 *   - the fallback is not read for output, but each token it declares must
 *     equal its dark value;
 *   - blocks with no custom property (such as `body, [data-theme]`) are ignored;
 *   - only color-scheme may sit beside the tokens, and font-size or font
 *     anywhere in the file is exit 2, so rem values are converted at 16px;
 *   - every token value matches the kit's value grammar (see valueForm): hex,
 *     a number with px, rem, em, %, ms, s or deg, var(--x), calc(a + b) or
 *     calc(a - b) of those, color-mix(in oklab, <hex or var> <p>%, transparent),
 *     rgb() or hsl(); by name also a font list (font-*), a shadow of four
 *     lengths and a colour (*shadow*) and cubic-bezier() (ease-*);
 *   - a colour token resolves to hex, rgb(), hsl() or such a color-mix();
 *   - two tokens must not map to one output path (--radius, --radius-base),
 *     and no path segment may be __proto__, prototype or constructor.
 * Anything else that declares a custom property (another selector, html,
 * :root[data-theme=dark], a selector list that only partly matches, @media of
 * another kind, @supports, @layer, @container, nesting) is exit 2.
 * Known gaps, also exit 2 rather than converted: any value outside the
 * grammar (lab(), lch(), oklch(), light-dark(), named colours, an empty value,
 * var() with a fallback or spaces inside, calc() with * or /, named font
 * weights, percentage opacity, !important, a quoted font name holding var(),
 * an unquoted family name with a space); full list in references/design-md.md.
 * var() chains are resolved per theme before a token is classified or
 * converted, and the script fails closed: a value it cannot resolve, classify
 * or convert is a usage error, never a written guess.
 * Findings print one per line with a fix. Exit codes: 0 ok, 1 findings,
 * 2 usage or input error. Node standard library only.
 */
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_THEME = 'node_modules/@gears-frontx/ui-kit/dist/theme.css';
const DEFAULT_DESIGN = 'DESIGN.md';
const SCRIPT = '.frontx/ai/@gears-frontx/template-design-guardrails/skills/frontx-design/scripts/design-md.mjs';
const MIN_TEXT_CONTRAST = 4.5;

class UsageError extends Error {}

// ---------------------------------------------------------------- theme.css

const isQuote = (c) => c === '"' || c === "'";

/** The CSS with every comment outside a quoted string removed. */
function stripComments(css) {
  const parts = [];
  let from = 0;
  let quote = null;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
    } else if (isQuote(c)) quote = c;
    else if (c === '/' && css[i + 1] === '*') {
      parts.push(css.slice(from, i));
      const end = css.indexOf('*/', i + 2);
      i = end === -1 ? css.length : end + 1;
      from = i + 1;
    }
  }
  parts.push(css.slice(from));
  return parts.join('');
}

/** Index of the `}` closing the `{` at `open`; braces inside quotes do not count. */
function closingBrace(text, open) {
  let depth = 0;
  let quote = null;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
    } else if (isQuote(c)) quote = c;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
  }
  throw new UsageError('theme.css has a { that is never closed');
}

/**
 * The items of a style sheet or block body in source order: `{ decl }` for text
 * ended by `;` (a declaration, or a statement such as @import at the top level)
 * and `{ prelude, inner }` for a nested block. `;` and braces inside quotes or
 * parentheses do not split.
 */
function splitBlock(text) {
  const items = [];
  let start = 0;
  let quote = null;
  let parens = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
    } else if (isQuote(c)) quote = c;
    else if (c === '(') parens++;
    else if (c === ')') parens = Math.max(0, parens - 1);
    else if (parens) continue;
    else if (c === ';') {
      items.push({ decl: text.slice(start, i) });
      start = i + 1;
    } else if (c === '{') {
      const end = closingBrace(text, i);
      items.push({ prelude: text.slice(start, i), inner: text.slice(i + 1, end) });
      start = end + 1;
      i = end;
    } else if (c === '}') throw new UsageError('theme.css has a } with no matching {');
  }
  items.push({ decl: text.slice(start) });
  return items.filter((item) => item.inner !== undefined || item.decl.trim());
}

/** Whitespace runs outside quoted strings collapsed to one space and trimmed; quoted text is kept exactly. */
function squeeze(text) {
  let out = '';
  let quote = null;
  let space = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      out += c;
      if (c === '\\' && i + 1 < text.length) out += text[++i];
      else if (c === quote) quote = null;
      continue;
    }
    if (/\s/.test(c)) {
      space = true;
      continue;
    }
    if (space && out) out += ' ';
    space = false;
    if (isQuote(c)) quote = c;
    out += c;
  }
  return out;
}

/** The text with every quoted string (quotes included) removed. */
function unquoted(text) {
  let out = '';
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
    } else if (isQuote(c)) quote = c;
    else out += c;
  }
  return out;
}

/** The text with `fn` applied to each run outside quoted strings; quoted strings are kept exactly. */
function outsideQuotes(text, fn) {
  let out = '';
  let from = 0;
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) {
        quote = null;
        out += text.slice(from, i + 1);
        from = i + 1;
      }
    } else if (isQuote(c)) {
      out += fn(text.slice(from, i));
      from = i;
      quote = c;
    }
  }
  return out + (quote ? text.slice(from) : fn(text.slice(from)));
}

/** The items of a comma-separated list; commas inside quotes do not split. */
function commaItems(text) {
  const items = [];
  let from = 0;
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
    } else if (isQuote(c)) quote = c;
    else if (c === ',') {
      items.push(text.slice(from, i).trim());
      from = i + 1;
    }
  }
  items.push(text.slice(from).trim());
  return items;
}

const IMPORTANT_RE = /!\s*important\b/i;

// The kit's value grammar: every custom property value in ui-kit 0.4.x has one of these shapes.
const G_PLAIN = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)`;
const G_NUM = String.raw`${G_PLAIN}(?:px|rem|em|%|ms|s|deg)?`;
const G_HEX = '#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})';
const G_REF = String.raw`var\(--[\w-]+\)`;
const G_MIX = String.raw`color-mix\(in oklab, ?(?:${G_HEX}|${G_REF}) (?:\d+\.?\d*|\.\d+)%, ?transparent\)`;
const G_OPERAND = `(?:${G_REF}|${G_NUM})`;
const whole = (re) => new RegExp(`^(?:${re})$`);
const VALUE_FORMS = [
  ['hex', whole(G_HEX)],
  ['number', whole(G_NUM)],
  ['ref', whole(G_REF)],
  ['calc', whole(String.raw`calc\( ?${G_OPERAND} [+-] ${G_OPERAND} ?\)`)],
  ['mix', whole(G_MIX)],
];
const SHADOW_FORM = whole(`(?:${G_NUM} ){4}(?:${G_REF}|${G_MIX})`);
const SHADOW_FINAL_RE = new RegExp(`^(?:${G_NUM} ){4}(.+)$`);
const EASE_FORM =whole(String.raw`cubic-bezier\(${G_PLAIN}, ?${G_PLAIN}, ?${G_PLAIN}, ?${G_PLAIN}\)`);
const FAMILY_FORM = /^(?:"[^"\\]*"|'[^'\\]*'|-?[A-Za-z][A-Za-z0-9-]*)$/;

/**
 * The grammar form a token value has, or null when it has none. Font lists,
 * shadows and cubic-bezier() are accepted only for tokens named for them.
 */
function valueForm(n, v) {
  for (const [form, re] of VALUE_FORMS) if (re.test(v)) return form;
  if (/^(rgba?|hsla?)\(/.test(v) && parseColour(v)) return 'rgb';
  if (n.startsWith('font-') && commaItems(v).every((item) => FAMILY_FORM.test(item) && !/var\(/i.test(item))) return 'fonts';
  if (/shadow/.test(n) && SHADOW_FORM.test(v)) return 'shadow';
  if (n.startsWith('ease-') && EASE_FORM.test(v)) return 'ease';
  return null;
}

const GRAMMAR =
  'hex; a number with px, rem, em, %, ms, s or deg; var(--name); calc(a + b) or calc(a - b) of those; color-mix(in oklab, <hex or var> <p>%, transparent); rgb() or hsl(); by token name a font list, a shadow of four lengths and a colour, or cubic-bezier()';

/** `{ name, value }` of a declaration (the name contains no quote, so the first colon ends it); null when the text is no declaration. */
function parseDecl(text) {
  const colon = text.indexOf(':');
  if (colon === -1) return null;
  const name = text.slice(0, colon).trim();
  if (!/^(--[\w-]+|-?[a-z][a-z-]*)$/i.test(name)) return null;
  return { name, value: squeeze(text.slice(colon + 1)) };
}

/** The first custom property a block body declares, nested blocks included, in source order; null when it declares none. */
function firstToken(inner) {
  for (const item of splitBlock(inner)) {
    const name = item.inner === undefined ? parseDecl(item.decl)?.name : firstToken(item.inner);
    if (name?.startsWith('--')) return name;
  }
  return null;
}

const KIT_SHAPE =
  ":root, \":root, [data-theme='light']\", \"[data-theme='dark']\" and \":root:not([data-theme='light'])\" inside \"@media (prefers-color-scheme: dark)\"";

/** A usage error when a block outside the kit's shape declares a custom property; such a block without one is ignored. */
function rejectTokens(form, inner) {
  const token = firstToken(inner);
  if (token) {
    throw new UsageError(
      `theme.css ${form} declares ${token}; design-md reads custom properties only from the kit's own blocks (${KIT_SHAPE}); fix: move the token into one of those blocks or report the need to the kit owner`,
    );
  }
}

/**
 * The custom properties of one allowed block, `[name, value]` in source order.
 * Only color-scheme may sit beside them: any other plain property (font-size
 * would change the rem base) and any nested block that declares a custom
 * property is a usage error.
 */
function blockTokens(form, inner) {
  const tokens = [];
  for (const item of splitBlock(inner)) {
    if (item.inner !== undefined) {
      rejectTokens(`rule "${squeeze(item.prelude)}" nested in ${form}`, item.inner);
      continue;
    }
    const decl = parseDecl(item.decl);
    if (!decl) throw new UsageError(`theme.css ${form} holds "${squeeze(item.decl)}", which is not a declaration; fix: correct the CSS`);
    if (IMPORTANT_RE.test(unquoted(decl.value))) {
      throw new UsageError(`${decl.name.startsWith('--') ? 'token' : 'property'} ${decl.name} in ${form} carries !important; fix: remove !important; the kit does not use it`);
    }
    if (!decl.name.startsWith('--')) {
      if (decl.name === 'color-scheme') continue;
      throw new UsageError(
        `theme.css ${form} sets ${decl.name}; design-md accepts only custom properties and color-scheme there (rem values are converted at 16px); fix: move ${decl.name} out of the token blocks or report it to the kit owner`,
      );
    }
    if (NAMED_COLOURS.has(decl.value.toLowerCase())) {
      throw new UsageError(`token ${decl.name} in ${form} is the named colour ${decl.value}; fix: use hex, rgb() or hsl()`);
    }
    const n = decl.name.slice(2);
    if (!valueForm(n, decl.value)) {
      throw new UsageError(
        `token ${decl.name} in ${form} has the value "${decl.value}"; fix: the value is outside the kit's value grammar (${GRAMMAR}); use one of those forms or report the need to the kit owner`,
      );
    }
    tokens.push([n, decl.value]);
  }
  return tokens;
}

/** CSS named colour keywords, plus transparent and currentcolor. */
const NAMED_COLOURS = new Set(
  `aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood
  cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray
  darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen
  darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue
  firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew
  hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan
  lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray
  lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue
  mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred
  midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid
  palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple
  rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue
  slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white
  whitesmoke yellow yellowgreen transparent currentcolor`.split(/\s+/),
);

const THEMES = ['light', 'dark'];
/** The allowed token blocks by normalised selector list (whitespace and quotes removed). */
const BLOCK_KINDS = new Map([
  [':root', 'root'],
  [':root,[data-theme=light]', 'light'],
  ['[data-theme=dark]', 'dark'],
]);
const BLOCK_RANK = new Map([
  ['root', [0, ':root']],
  ['light', [1, ":root, [data-theme='light']"]],
  ['dark', [2, "[data-theme='dark']"]],
  ['fallback', [3, '@media (prefers-color-scheme: dark)']],
]);
const FALLBACK_AT = '@media(prefers-color-scheme:dark)';
const FALLBACK_SELECTOR = ':root:not([data-theme=light])';
const selectorKey = (s) => s.replace(/\s+|["']/g, '');

/**
 * font-size and the font shorthand change the rem base, so they are a usage
 * error in any rule or at-rule of the file, with or without tokens beside them.
 */
function rejectFontSize(items, within) {
  for (const item of items) {
    if (item.inner !== undefined) {
      const prelude = squeeze(item.prelude);
      rejectFontSize(splitBlock(item.inner), within ? `rule "${prelude}" in ${within}` : `${prelude.startsWith('@') ? 'at-rule' : 'rule'} "${prelude}"`);
      continue;
    }
    const name = parseDecl(item.decl)?.name.toLowerCase();
    if (name === 'font-size' || name === 'font') {
      throw new UsageError(
        `theme.css ${within ?? 'top level'} sets ${name}; it changes the rem base, and rem values are converted at 16px; fix: remove ${name} from theme.css or report the need to the kit owner`,
      );
    }
  }
}

/**
 * Read the custom properties of the kit's theme.css shape and nothing else,
 * with its blocks in this order:
 *
 *   :root { ... }                                  invariant tokens, both themes
 *   :root, [data-theme='light'] { ... }            light tokens
 *   [data-theme='dark'] { ... }                    dark tokens
 *   @media (prefers-color-scheme: dark) {
 *     :root:not([data-theme='light']) { ... } }    fallback: must equal dark
 *
 * Each block may repeat; a block that comes before one of a kind listed above
 * it is a usage error. In this order the browser result is exact: light is
 * the :root and light blocks, dark the :root, light and dark blocks (the light
 * block lists :root, so it applies to the dark root too, and the dark blocks
 * come later and win). A token declared only in the light block is inherited
 * by dark. A block that declares no custom property (such as
 * `body, [data-theme]`) is ignored; any other selector, at-rule or nesting
 * that declares one is a usage error.
 *
 * Returns { light, dark, order }: a Map of name to value per theme, and every
 * name in output order (first declared by a themed block, then the rest, each
 * in source order; this keeps the kit's palette order stable).
 */
export function parseTheme(css) {
  const items = splitBlock(stripComments(css));
  rejectFontSize(items, null);
  const blocks = []; // [kind, tokens] in source order
  const fallback = new Map();
  let last = 'root';
  const enter = (kind, form) => {
    const [rank] = BLOCK_RANK.get(kind);
    const [lastRank, lastName] = BLOCK_RANK.get(last);
    if (rank < lastRank) {
      throw new UsageError(
        `theme.css ${form} comes after a ${lastName} block; design-md reads the kit's block order: :root, then ":root, [data-theme='light']", then "[data-theme='dark']", then the "@media (prefers-color-scheme: dark)" fallback; fix: move the block to its place in that order`,
      );
    }
    last = kind;
  };
  for (const item of items) {
    if (item.inner === undefined) continue; // a statement such as @import or @charset
    const prelude = squeeze(item.prelude);
    if (!prelude.startsWith('@')) {
      const kind = BLOCK_KINDS.get(selectorKey(prelude));
      if (kind) {
        blocks.push([kind, blockTokens(`rule "${prelude}"`, item.inner)]);
        enter(kind, `rule "${prelude}"`);
      } else rejectTokens(`rule "${prelude}"`, item.inner);
    } else if (selectorKey(prelude) !== FALLBACK_AT) rejectTokens(`at-rule "${prelude}"`, item.inner);
    else {
      for (const child of splitBlock(item.inner)) {
        if (child.inner === undefined) rejectTokens(`at-rule "${prelude}"`, child.decl);
        else if (selectorKey(child.prelude) !== FALLBACK_SELECTOR) rejectTokens(`rule "${squeeze(child.prelude)}" in "${prelude}"`, child.inner);
        else for (const [n, v] of blockTokens(`rule "${squeeze(child.prelude)}" in "${prelude}"`, child.inner)) fallback.set(n, v);
      }
      enter('fallback', `at-rule "${prelude}"`);
    }
  }

  const themes = { light: new Map(), dark: new Map() };
  const firstAt = new Map();
  const themedAt = new Map();
  for (const [kind, tokens] of blocks) {
    for (const [n, v] of tokens) {
      if (!firstAt.has(n)) firstAt.set(n, firstAt.size);
      if (kind !== 'root' && !themedAt.has(n)) themedAt.set(n, themedAt.size);
      if (kind !== 'dark') themes.light.set(n, v);
      themes.dark.set(n, v); // blocks are in kit order, so dark blocks come last and win
    }
  }
  for (const t of THEMES) if (!blocks.some(([kind]) => kind === t)) throw new UsageError(`theme.css has no [data-theme='${t}'] block`);
  checkFallback(fallback, themes);

  const rank = (n) => [themedAt.get(n) ?? Infinity, firstAt.get(n)];
  const order = [...firstAt.keys()].sort((a, b) => {
    const [ra, rb] = [rank(a), rank(b)];
    return ra[0] === rb[0] ? ra[1] - rb[1] : ra[0] < rb[0] ? -1 : 1;
  });
  return { ...themes, order };
}

/**
 * Every token the prefers-color-scheme fallback declares must resolve to its
 * dark value. The fallback is matched on a root with no data-theme, on top of
 * the :root and light blocks (its selector is more specific), so its var()
 * refs resolve there.
 */
function checkFallback(fallback, themes) {
  const scope = new Map([...themes.light, ...fallback]);
  for (const [n, v] of fallback) {
    const got = resolveVars([n], v, scope, 'prefers-color-scheme fallback');
    const want = themes.dark.has(n) ? resolveVars([n], themes.dark.get(n), themes.dark, 'dark') : 'not set';
    if (got !== want) {
      throw new UsageError(
        `token --${n} is ${got} in the prefers-color-scheme fallback block and ${want} in the dark theme; fix: give the fallback block the dark theme's value`,
      );
    }
  }
}

/** A resolved value that looks like a colour; isFinalColour then decides whether it is one design-md accepts. */
const isColor = (v) => /^(#|(rgba?|hsla?|color-mix)\()/i.test(v);
const MIX_FINAL_RE = /^color-mix\(in oklab, ?(.+) (?:\d+\.?\d*|\.\d+)%, ?transparent\)$/;

/** A resolved colour value: hex, rgb() or hsl(), or color-mix(in oklab, <one of those> <p>%, transparent). */
function isFinalColour(v, mix = true) {
  if (/^(#|rgba?\(|hsla?\()/.test(v)) return parseColour(v) !== null;
  const m = mix ? v.match(MIX_FINAL_RE) : null;
  return Boolean(m) && isFinalColour(m[1], false);
}

const fmtPx = (n) => `${Number(n.toFixed(4))}px`;
const remToPx = (v) => outsideQuotes(v, (s) => s.replace(/(-?\d*\.?\d+)rem\b/g, (_, n) => fmtPx(Number(n) * 16)));

const VAR_RE = /var\(--([\w-]+)\)/g;

/**
 * The value with every var() outside quoted strings replaced, recursively, by
 * the referenced token's value in one theme. A missing token, a cycle or a
 * var() form this script does not read (such as a fallback) is a usage error:
 * nothing unresolved is written.
 */
function resolveVars(chain, value, tokens, theme) {
  const v = outsideQuotes(value, (s) => s.replace(VAR_RE, (_, ref) => {
    if (chain.includes(ref)) {
      throw new UsageError(`token --${chain[0]} has a var() cycle in the ${theme} theme: ${[...chain, ref].map((t) => `--${t}`).join(' -> ')}; fix: point one of them at a literal value`);
    }
    if (!tokens.has(ref)) {
      throw new UsageError(`token --${chain.at(-1)} refers to var(--${ref}), which the ${theme} theme does not declare; fix: declare --${ref} or point the token at an existing one`);
    }
    return resolveVars([...chain, ref], tokens.get(ref), tokens, theme);
  }));
  if (unquoted(v).includes('var(')) {
    throw new UsageError(`token --${chain.at(-1)} has the value ${value}, a var() form design-md cannot resolve; fix: use var(--name) with no fallback`);
  }
  return v;
}

const NUMBER_RE = /^-?(\d+\.?\d*|\.\d+)$/;
const LENGTH_RE = /^-?(\d+\.?\d*|\.\d+)(px|em|%|ch|ex|lh|vw|vh|vmin|vmax)?$/;

/** A resolved value as a length: rem to px and a simple px calc() to one length; anything else is a usage error. */
function toLength(n, value) {
  let v = remToPx(value);
  const calc = v.match(/^calc\((.*)\)$/);
  if (calc && /^[\s\d.px+-]+$/.test(calc[1])) {
    const terms = calc[1].match(/[+-]?\s*\d*\.?\d+px/g) ?? [];
    const joined = terms.join('').replace(/\s/g, '');
    if (joined === calc[1].replace(/\s/g, '')) {
      v = fmtPx(terms.reduce((sum, t) => sum + Number(t.replace(/\s|px/g, '')), 0));
    }
  }
  if (!LENGTH_RE.test(v)) throw new UsageError(`token --${n} resolves to ${value}, not a length design-md can write; fix: give it a number with a unit (px, rem, em, %) or a calc() of px and rem terms`);
  return v;
}

/** A resolved value as a finite number; anything else is a usage error. */
function toNumber(n, value) {
  const num = Number(value);
  if (!NUMBER_RE.test(value) || !Number.isFinite(num)) {
    throw new UsageError(`token --${n} resolves to ${value}, not a number; fix: give it a plain number (such as 400 or 0.42)`);
  }
  return num;
}

const TYPE_PROPS = { size: 'fontSize', 'line-height': 'lineHeight', weight: 'fontWeight', tracking: 'letterSpacing' };

/** Components, as the kit 0.4.x CSS paints them. A component is emitted only when every token it names exists. */
const COMPONENTS = [
  ['body', { backgroundColor: 'colors.background', textColor: 'colors.foreground', typography: 'typography.body' }],
  ['card', { backgroundColor: 'colors.card', textColor: 'colors.card-foreground', borderColor: 'colors.border', rounded: 'rounded.xl', gap: 'spacing.4' }],
  ['button-primary', { backgroundColor: 'colors.primary', textColor: 'colors.primary-foreground', typography: 'typography.label', rounded: 'rounded.lg', height: 'controls.control-height-md' }],
  ['button-primary-hover', { backgroundColor: 'colors.primary-hover', textColor: 'colors.primary-foreground' }],
  ['button-secondary', { backgroundColor: 'colors.secondary', textColor: 'colors.secondary-foreground', typography: 'typography.label', rounded: 'rounded.lg' }],
  ['button-outline', { backgroundColor: 'colors.surface-elevated', textColor: 'colors.foreground', borderColor: 'colors.border-strong', typography: 'typography.label', rounded: 'rounded.lg' }],
  ['button-link', { textColor: 'colors.link-foreground', typography: 'typography.label' }],
  ['button-primary-focus', { outlineColor: 'colors.primary-ring', outlineWidth: 'controls.border-width-focus' }],
  ['input', { backgroundColor: 'colors.surface-elevated', textColor: 'colors.foreground', borderColor: 'colors.input', rounded: 'rounded.lg', height: 'controls.control-height-lg' }],
  ['input-focus', { borderColor: 'colors.ring' }],
  ['input-invalid', { borderColor: 'colors.destructive' }],
  ['badge-success', { backgroundColor: 'colors.success-soft', textColor: 'colors.success', rounded: 'rounded.full' }],
  ['badge-warning', { backgroundColor: 'colors.warning-soft', textColor: 'colors.warning', rounded: 'rounded.full' }],
  ['badge-danger', { backgroundColor: 'colors.danger-soft', textColor: 'colors.danger', rounded: 'rounded.full' }],
  ['badge-info', { backgroundColor: 'colors.info-soft', textColor: 'colors.info', rounded: 'rounded.full' }],
  ['table-header', { backgroundColor: 'colors.surface', textColor: 'colors.subtle-foreground', typography: 'typography.mono', height: 'controls.control-height-md' }],
  ['table-row-selected', { backgroundColor: 'colors.selection-subtle', textColor: 'colors.foreground' }],
  ['menu-item-highlighted', { backgroundColor: 'colors.accent', textColor: 'colors.accent-foreground' }],
  ['popover', { backgroundColor: 'colors.popover', textColor: 'colors.popover-foreground', borderColor: 'colors.popover-border', shadow: 'elevation.popover-shadow' }],
  ['tooltip', { backgroundColor: 'colors.foreground', textColor: 'colors.background', typography: 'typography.meta', rounded: 'rounded.md' }],
  ['skeleton', { backgroundColor: 'colors.muted', rounded: 'rounded.md' }],
  ['sidebar', { backgroundColor: 'colors.sidebar', textColor: 'colors.sidebar-foreground', borderColor: 'colors.sidebar-border' }],
  ['sidebar-item-active', { backgroundColor: 'colors.sidebar-accent', textColor: 'colors.sidebar-accent-foreground' }],
  ['code', { backgroundColor: 'colors.code-background', textColor: 'colors.code-foreground', typography: 'typography.mono' }],
  ['dialog-overlay', { backgroundColor: 'colors.overlay-modal' }],
  ['sheet-overlay', { backgroundColor: 'colors.overlay-panel', blur: 'elevation.overlay-panel-blur' }],
];

/** Token names the components read as colours: such a token must resolve to a colour. */
const COLOUR_NAMES = new Set(
  COMPONENTS.flatMap(([, props]) => Object.values(props))
    .filter((p) => p.startsWith('colors.'))
    .map((p) => p.slice('colors.'.length)),
);
const RESERVED_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);
const dict = () => Object.create(null);

/**
 * [group, key] a token is written under, from its name; only a name no rule
 * knows falls back to its values, which are already resolved through var().
 */
function classify(n, values) {
  const type = n.match(/^text-(.+)-(size|line-height|weight|tracking)$/);
  if (n === 'radius' || n.startsWith('radius-')) return ['rounded', n === 'radius' ? 'base' : n.slice('radius-'.length)];
  if (/^space-\w+$/.test(n)) return ['spacing', n.slice('space-'.length)];
  if (type) return ['typography', `${type[1]}.${TYPE_PROPS[type[2]]}`];
  if (n.startsWith('text-')) return ['other', n];
  if (n.startsWith('font-')) return ['fonts', n.slice('font-'.length)];
  if (/^(duration|ease)-/.test(n)) return ['motion', n];
  if (/^(control-|icon-size-|border-width|ring-|opacity-)/.test(n)) return ['controls', n];
  if (COLOUR_NAMES.has(n) || values.some(isColor)) return ['colors', n];
  if (/shadow|blur/.test(n)) return ['elevation', n];
  return ['other', n];
}

/**
 * The front matter object generate writes from parseTheme's resolved themes.
 * A colour token is written to colors (light) and colors-dark (dark). Any other
 * token has one slot, so a value that differs between the themes is a usage error.
 */
export function buildFrontMatter({ light, dark, order }, { name, kitVersion }) {
  const groups = dict();
  for (const g of ['colors', 'colors-dark', 'typography', 'fonts', 'rounded', 'spacing', 'motion', 'controls', 'elevation', 'other']) groups[g] = dict();
  const where = new Map(); // CSS token name -> [group, key]
  const pathOf = new Map(); // CSS token name -> the dotted path it is written under; every {ref} uses it
  const fontOf = (role) => (role === 'mono' ? 'mono' : /^(display|heading)/.test(role) ? 'heading' : 'sans');

  // Every var() chain resolved per theme first: classification and numeric conversion read the final value.
  const raw = { light, dark };
  const final = { light: new Map(), dark: new Map() };
  for (const t of THEMES) for (const [n, v] of raw[t]) final[t].set(n, resolveVars([n], v, raw[t], t));

  const tokenAt = new Map(); // dotted path -> the CSS token name written there
  for (const n of order) {
    const [g, key] = classify(n, THEMES.filter((t) => final[t].has(n)).map((t) => final[t].get(n)));
    const at = `${g}.${key}`;
    const reserved = key.split('.').find((s) => RESERVED_SEGMENTS.has(s));
    if (reserved) {
      throw new UsageError(`token --${n} would be written to ${at}, and ${reserved} is a reserved name; fix: rename the token`);
    }
    if (tokenAt.has(at)) {
      throw new UsageError(`tokens --${tokenAt.get(at)} and --${n} are both written to ${at}; fix: keep one of them, or rename one so it maps to its own path`);
    }
    tokenAt.set(at, n);
    where.set(n, [g, key]);
    pathOf.set(n, at);
  }
  // Every name exists (resolveVars checked it); quoted text is never rewritten.
  const ref = (v) => outsideQuotes(v, (s) => s.replace(VAR_RE, (_, n) => `{${pathOf.get(n)}}`));

  for (const n of order) {
    const [g, key] = where.get(n);
    for (const t of THEMES) {
      const v = final[t].get(n);
      if (v === undefined) continue;
      let bad = false;
      if (g === 'colors') bad = !isFinalColour(v);
      else if (g === 'elevation' && /shadow/.test(n) && v.includes(' ')) {
        const m = v.match(SHADOW_FINAL_RE);
        bad = !m || !isFinalColour(m[1]);
      }
      if (bad) {
        throw new UsageError(
          `token --${n} is a ${g === 'colors' ? 'colour' : 'shadow'} token but resolves to ${v} in the ${t} theme; fix: give it ${g === 'colors' ? 'a hex, rgb() or hsl() colour, color-mix(in oklab, <colour> <p>%, transparent)' : 'four lengths and a colour'} or a var() to one`,
        );
      }
    }
    if (g === 'colors') {
      if (light.has(n)) groups.colors[n] = ref(light.get(n));
      if (dark.has(n)) groups['colors-dark'][n] = ref(dark.get(n));
      continue;
    }
    // One slot for both themes. A group written as a resolved length or number compares the
    // converted values; a group written with {refs} compares the raw values (the refs carry any theming).
    const prop = g === 'typography' ? key.split('.')[1] : null;
    const convert =
      prop === 'fontWeight' || (g === 'controls' && /^opacity-/.test(n))
        ? (v) => toNumber(n, v)
        : g === 'rounded' || g === 'spacing' || g === 'controls' || g === 'typography'
          ? (v) => toLength(n, v)
          : null;
    const out = THEMES.map((t) => (!raw[t].has(n) ? undefined : convert ? convert(final[t].get(n)) : ref(remToPx(raw[t].get(n)))));
    if (out[0] !== out[1]) {
      const shown = (t) => (!raw[t].has(n) ? 'not set' : raw[t].get(n) === final[t].get(n) ? raw[t].get(n) : `${raw[t].get(n)} (resolves to ${final[t].get(n)})`);
      throw new UsageError(
        `token --${n} is ${shown('light')} in the light theme and ${shown('dark')} in the dark theme, but DESIGN.md has one ${g}.${key} value for both; fix: give it the same value in both themes (declare it once in :root) or report the per-theme need to the kit owner`,
      );
    }
    if (g === 'typography') {
      const role = key.split('.')[0];
      groups.typography[role] ??= { fontFamily: `{fonts.${fontOf(role)}}` };
      groups.typography[role][prop] = out[0];
    } else if (g === 'fonts' || g === 'motion') groups[g][key] = ref(light.get(n));
    else groups[g][key] = out[0];
  }

  for (const spec of Object.values(groups.typography)) {
    if (lookup(groups, spec.fontFamily.slice(1, -1)) === undefined) spec.fontFamily = '{fonts.sans}';
  }

  const fm = dict();
  fm.name = name;
  if (kitVersion) fm.version = kitVersion;
  fm.description = `Generated from @gears-frontx/ui-kit${kitVersion ? `@${kitVersion}` : ''} theme.css by ${SCRIPT}. Do not edit by hand: run generate after a kit upgrade or theme change.`;
  for (const [g, map] of Object.entries(groups)) if (Object.keys(map).length) fm[g] = map;

  const skipped = [];
  const components = dict();
  for (const [id, props] of COMPONENTS) {
    const missing = Object.values(props).filter((p) => lookup(fm, p) === undefined);
    if (missing.length) {
      skipped.push(`${id} (missing ${missing.join(', ')})`);
      continue;
    }
    components[id] = Object.fromEntries(Object.entries(props).map(([k, p]) => [k, `{${p}}`]));
  }
  if (Object.keys(components).length) fm.components = components;
  return { frontMatter: fm, skipped };
}

function lookup(tree, dotted) {
  let node = tree;
  for (const key of dotted.split('.')) {
    if (node === null || typeof node !== 'object' || !Object.hasOwn(node, key)) return undefined;
    node = node[key];
  }
  return node;
}

// ------------------------------------------------------------- YAML subset

const KEY_RE = /^[A-Za-z_][\w-]*$/;

/** Emit nested maps of strings and numbers as YAML; strings double-quoted. */
export function toYaml(obj, indent = 0) {
  const pad = ' '.repeat(indent);
  let out = '';
  for (const [k, v] of Object.entries(obj)) {
    const key = KEY_RE.test(k) ? k : JSON.stringify(k);
    if (v !== null && typeof v === 'object') out += `${pad}${key}:\n${toYaml(v, indent + 2)}`;
    else out += `${pad}${key}: ${typeof v === 'number' ? v : JSON.stringify(String(v))}\n`;
  }
  return out;
}

/** Parse the YAML subset toYaml writes (nested maps, scalar values); hand edits in that shape parse too. */
export function parseYaml(text) {
  const root = dict();
  const stack = [{ indent: -1, node: root }];
  text.split(/\r?\n/).forEach((raw, i) => {
    if (!raw.trim() || raw.trim().startsWith('#')) return;
    const bad = (why) => new UsageError(`front matter line ${i + 2} ${why}: ${raw.trim()}`);
    const unquote = (s) => {
      try {
        return JSON.parse(s);
      } catch {
        throw bad('has a broken double-quoted string');
      }
    };
    const m = raw.match(/^( *)("(?:[^"\\]|\\.)*"|[^:\s][^:]*?)\s*:(?:\s+(.*))?$/);
    if (!m) throw bad('is not "key: value" YAML');
    const indent = m[1].length;
    const key = m[2].startsWith('"') ? unquote(m[2]) : m[2];
    while (stack.at(-1).indent >= indent) stack.pop();
    const parent = stack.at(-1).node;
    const value = m[3]?.trim();
    if (value === undefined || value === '') {
      parent[key] = dict();
      stack.push({ indent, node: parent[key] });
    } else if (value.startsWith('"')) parent[key] = unquote(value);
    else if (value.startsWith("'")) {
      if (!/^'(?:[^']|'')*'$/.test(value)) throw bad('has a broken single-quoted string');
      parent[key] = value.slice(1, -1).replace(/''/g, "'");
    } else if (/^-?\d+(\.\d+)?$/.test(value)) parent[key] = Number(value);
    else parent[key] = value;
  });
  return root;
}

/** Split a DESIGN.md into its front matter text (null when absent) and body; LF or CRLF. */
export function splitDesign(text) {
  const m = text.match(/^---\r?\n([\s\S]*?\r?\n)?---(?:\r?\n)?/);
  if (!m) return { yaml: null, body: text };
  return { yaml: m[1] ?? '', body: text.slice(m[0].length) };
}

// -------------------------------------------------------------------- lint

const NUM = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?`;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const HUE_UNITS = { '': 1, deg: 1, grad: 0.9, rad: 180 / Math.PI, turn: 360 };

/** A number, or a percentage scaled so 100% is `full`; null for anything else. */
function amount(token, full, percentOnly = false) {
  const m = token.match(new RegExp(`^(${NUM})(%?)$`, 'i'));
  if (!m || (percentOnly && !m[2])) return null;
  return m[2] ? (Number(m[1]) / 100) * full : Number(m[1]);
}

/**
 * [r, g, b, alpha] (channels 0-255, alpha 0-1) for a hex, rgb() or hsl() colour,
 * comma or space syntax, optional alpha; null for any other syntax.
 */
export function parseColour(text) {
  const s = String(text).trim().toLowerCase();
  const hex = s.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/);
  if (hex) {
    const h = hex[1].length <= 4 ? [...hex[1]].map((c) => c + c).join('') : hex[1];
    const [r, g, b, a = 255] = h.match(/../g).map((p) => parseInt(p, 16));
    return [r, g, b, a / 255];
  }
  const fn = s.match(/^(rgba?|hsla?)\(\s*(.*?)\s*\)$/);
  if (!fn) return null;
  let parts;
  let alpha;
  if (fn[2].includes(',')) {
    parts = fn[2].split(',').map((p) => p.trim());
    if (parts.length === 4) alpha = parts.pop();
  } else {
    const slash = fn[2].split('/');
    if (slash.length > 2) return null;
    parts = slash[0].trim().split(/\s+/);
    alpha = slash[1]?.trim();
  }
  if (parts.length !== 3) return null;
  const a = alpha === undefined ? 1 : amount(alpha, 1);
  if (a === null) return null;
  let rgb;
  if (fn[1].startsWith('rgb')) {
    rgb = parts.map((p) => amount(p, 255));
  } else {
    const hue = parts[0].match(new RegExp(`^(${NUM})(deg|grad|rad|turn)?$`, 'i'));
    const sat = amount(parts[1], 1, fn[2].includes(','));
    const lig = amount(parts[2], 1, fn[2].includes(','));
    if (!hue || sat === null || lig === null) return null;
    // Space syntax takes bare numbers on the 0-100 scale, as percentages.
    const [S, L] = [sat, lig].map((v, i) => clamp(/%$/.test(parts[i + 1]) ? v : v / 100, 0, 1));
    const H = (((Number(hue[1]) * HUE_UNITS[hue[2] ?? '']) % 360) + 360) % 360;
    const k = (n) => (n + H / 30) % 12;
    const f = (n) => L - S * Math.min(L, 1 - L) * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    rgb = [f(0), f(8), f(4)].map((c) => c * 255);
  }
  if (rgb.some((c) => c === null)) return null;
  return [...rgb.map((c) => clamp(c, 0, 255)), clamp(a, 0, 1)];
}

function luminance([r, g, b]) {
  const [R, G, B] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/** WCAG contrast of two opaque colours (hex, rgb() or hsl()); null when either is unsupported or translucent. */
export function contrastRatio(a, b) {
  const ca = parseColour(a);
  const cb = parseColour(b);
  if (!ca || !cb || ca[3] < 1 || cb[3] < 1) return null;
  const la = luminance(ca);
  const lb = luminance(cb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function* strings(node, at = []) {
  for (const [k, v] of Object.entries(node)) {
    if (v !== null && typeof v === 'object') yield* strings(v, [...at, k]);
    else if (typeof v === 'string') yield [[...at, k].join('.'), v];
  }
}

const REF_RE = /\{([^{}\s]+)\}/g;
const refsIn = (value) => (typeof value === 'string' ? [...value.matchAll(REF_RE)].map((m) => m[1]) : []);

/** The value a ref names in one theme: in dark, colors.<n> reads colors-dark.<n> first. */
function refValue(fm, target, theme) {
  if (theme === 'dark' && target.startsWith('colors.')) {
    const dark = lookup(fm, `colors-dark.${target.slice('colors.'.length)}`);
    if (dark !== undefined) return dark;
  }
  return lookup(fm, target);
}

/** Every ref cycle, in either theme, as "{a} -> {b} -> {a}" starting at its smallest member. */
function refCycles(fm) {
  const cycles = new Set();
  for (const theme of ['light', 'dark']) {
    const done = new Set();
    const visit = (target, stack) => {
      const at = stack.indexOf(target);
      if (at !== -1) {
        const loop = stack.slice(at);
        const start = loop.indexOf([...loop].sort()[0]);
        const ordered = [...loop.slice(start), ...loop.slice(0, start)];
        cycles.add([...ordered, ordered[0]].map((t) => `{${t}}`).join(' -> '));
        return;
      }
      if (done.has(target)) return;
      for (const next of refsIn(refValue(fm, target, theme))) visit(next, [...stack, target]);
      done.add(target);
    };
    for (const [, value] of strings(fm)) for (const target of refsIn(value)) visit(target, []);
  }
  return [...cycles];
}

/** Follow a whole-value ref chain to a colour in one theme: { colour } or { reason } it cannot be checked. */
function resolveColour(fm, value, theme) {
  const seen = new Set();
  let v = value;
  for (let m; typeof v === 'string' && (m = v.match(/^\{([^{}\s]+)\}$/)); ) {
    if (seen.has(m[1])) return { reason: `${value} is a reference cycle` };
    seen.add(m[1]);
    v = refValue(fm, m[1], theme);
  }
  if (typeof v !== 'string') return { reason: `${value} does not resolve to a value` };
  const rgba = parseColour(v);
  if (!rgba) return { reason: `${value} resolves to ${v}, not a hex, rgb() or hsl() colour` };
  if (rgba[3] < 1) return { reason: `${value} resolves to ${v}, which is translucent` };
  return { colour: v };
}

/**
 * Findings for a parsed front matter: broken refs, ref cycles, tokens in one
 * theme only, low text contrast, and text and fill pairs whose contrast cannot
 * be computed (a colour syntax other than hex, rgb() or hsl(), a translucent
 * colour, a cycle or a broken chain). An unchecked pair is a finding and counts
 * toward exit 1: an unverified pair must not pass as clean.
 */
export function lintFrontMatter(fm) {
  const findings = [];
  for (const [where, value] of strings(fm)) {
    for (const target of refsIn(value)) {
      if (lookup(fm, target) === undefined) {
        findings.push(`broken-ref ${where}: {${target}} does not resolve; fix: point it at an existing token or run generate`);
      }
    }
  }
  for (const cycle of refCycles(fm)) {
    findings.push(`ref-cycle ${cycle}: the refs never reach a value; fix: point one of them at a token with a literal value or run generate`);
  }
  const light = fm.colors ?? {};
  const dark = fm['colors-dark'] ?? {};
  for (const n of Object.keys(light)) if (!Object.hasOwn(dark, n)) findings.push(`orphaned-token colors.${n}: no dark value in colors-dark; fix: regenerate from the kit or declare the dark value in the theme`);
  for (const n of Object.keys(dark)) if (!Object.hasOwn(light, n)) findings.push(`orphaned-token colors-dark.${n}: no light value in colors; fix: regenerate from the kit or declare the light value in the theme`);

  for (const [id, spec] of Object.entries(fm.components ?? {})) {
    if (!spec.backgroundColor || !spec.textColor) continue;
    for (const theme of ['light', 'dark']) {
      const bgRes = resolveColour(fm, spec.backgroundColor, theme);
      const fgRes = resolveColour(fm, spec.textColor, theme);
      const why = [fgRes.reason, bgRes.reason].filter(Boolean);
      if (why.length) {
        findings.push(`contrast-unchecked components.${id} (${theme}): ${why.join('; ')}; fix: use a supported colour syntax (opaque hex, rgb() or hsl()) and refs that resolve, or check the pair by hand`);
        continue;
      }
      const [bg, fg] = [bgRes.colour, fgRes.colour];
      const ratio = contrastRatio(fg, bg);
      if (ratio !== null && ratio < MIN_TEXT_CONTRAST) {
        findings.push(`contrast components.${id} (${theme}): textColor ${spec.textColor} ${fg} on backgroundColor ${spec.backgroundColor} ${bg} is ${ratio.toFixed(2)}:1, below ${MIN_TEXT_CONTRAST}:1; fix: choose a text and fill token pair that reaches ${MIN_TEXT_CONTRAST}:1; a failing pair inside the kit goes to the kit owner as a token finding`);
      }
    }
  }
  return findings;
}

// --------------------------------------------------------------------- CLI

function parseArgs(argv) {
  const [mode, ...rest] = argv;
  if (!['generate', 'check', 'lint'].includes(mode)) throw new UsageError('mode must be generate, check or lint');
  const opts = { mode, design: DEFAULT_DESIGN, theme: DEFAULT_THEME, name: null, kitVersion: null };
  const flags = { '--design': 'design', '--theme': 'theme', '--name': 'name', '--kit-version': 'kitVersion' };
  for (let i = 0; i < rest.length; i += 2) {
    const key = Object.hasOwn(flags, rest[i]) ? flags[rest[i]] : undefined;
    if (!key || rest[i + 1] === undefined) throw new UsageError(`unknown or incomplete flag: ${rest[i]}`);
    opts[key] = rest[i + 1];
  }
  return opts;
}

function readKitVersion(themePath) {
  const pkg = path.join(path.dirname(themePath), '..', 'package.json');
  if (!existsSync(pkg)) return null;
  try {
    const json = JSON.parse(readFileSync(pkg, 'utf8'));
    return json.name === '@gears-frontx/ui-kit' ? json.version : null;
  } catch {
    return null;
  }
}

/** Read a text file; a path that is missing, a directory or unreadable is a usage error. */
function readText(file, what, hint = '') {
  try {
    if (statSync(file).isFile()) return readFileSync(file, 'utf8');
  } catch (e) {
    if (!e.code) throw e;
    throw new UsageError(`${what} ${file} cannot be read (${e.code})${hint}`);
  }
  throw new UsageError(`${what} ${file} is not a file${hint}`);
}

function render(opts, existing) {
  const theme = readText(opts.theme, 'theme.css', '; pass --theme <path to @gears-frontx/ui-kit/dist/theme.css>');
  const { yaml, body } = splitDesign(existing ?? '');
  const current = yaml === null ? {} : parseYaml(yaml);
  const name = opts.name ?? (typeof current.name === 'string' ? current.name : 'FrontX');
  const kitVersion = opts.kitVersion ?? readKitVersion(opts.theme);
  const { frontMatter, skipped } = buildFrontMatter(parseTheme(theme), { name, kitVersion });
  const eol = existing?.includes('\r\n') ? '\r\n' : '\n';
  return { text: `---${eol}${toYaml(frontMatter).replace(/\n/g, eol)}---${eol}${body}`, skipped, yaml };
}

export function run(argv, log = console.log, err = console.error) {
  try {
    const opts = parseArgs(argv);
    const existing = existsSync(opts.design) ? readText(opts.design, 'DESIGN.md') : null;
    if (opts.mode === 'lint') {
      if (existing === null) throw new UsageError(`${opts.design} not found`);
      const { yaml } = splitDesign(existing);
      if (yaml === null) throw new UsageError(`${opts.design} has no YAML front matter; run generate first`);
      const findings = lintFrontMatter(parseYaml(yaml));
      for (const f of findings) log(`${opts.design}: ${f}`);
      return findings.length ? 1 : 0;
    }
    const { text, skipped } = render(opts, existing);
    for (const s of skipped) err(`${opts.design}: note: component ${s} not written`);
    if (opts.mode === 'generate') {
      try {
        writeFileSync(opts.design, text);
      } catch (e) {
        if (!e.code) throw e;
        throw new UsageError(`DESIGN.md ${opts.design} cannot be written (${e.code})`);
      }
      return 0;
    }
    if (existing === text) return 0;
    log(`${opts.design}: drift: the front matter differs from what generate writes from ${opts.theme}; fix: run "node ${SCRIPT} generate" and commit the result`);
    return 1;
  } catch (e) {
    if (!(e instanceof UsageError) && !(e instanceof SyntaxError)) throw e;
    err(`design-md: ${e.message}`);
    err('usage: design-md.mjs <generate|check|lint> [--design DESIGN.md] [--theme theme.css] [--name name] [--kit-version version]');
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = run(process.argv.slice(2));
}
