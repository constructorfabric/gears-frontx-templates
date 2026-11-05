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

/** Innermost `selector { body }` rules (no brace inside the body), in one linear pass. */
function* innermostRules(text) {
  let afterBrace = 0; // where the text after the last brace starts
  let open = -1; // the `{` of a rule not yet closed and with no brace inside
  let selector = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c !== '{' && c !== '}') continue;
    if (c === '{') {
      selector = text.slice(afterBrace, i);
      open = i;
    } else {
      if (open !== -1) yield [selector, text.slice(open + 1, i)];
      open = -1;
    }
    afterBrace = i + 1;
  }
}

/**
 * Custom properties of the invariant (:root), light and dark blocks. Every block
 * of a kind is merged in source order and a later declaration wins, as in the
 * browser cascade (the selectors of one kind share a specificity).
 */
export function parseTheme(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks = { invariant: null, light: null, dark: null };
  for (const [rawSelector, body] of innermostRules(text)) {
    const selector = rawSelector.replace(/\s+/g, '').replace(/["']/g, '');
    if (selector.includes(':not(') || selector.startsWith('@')) continue;
    const parts = selector.split(',');
    let kind = null;
    if (selector === ':root') kind = 'invariant';
    else if (parts.includes('[data-theme=light]')) kind = 'light';
    else if (parts.includes('[data-theme=dark]')) kind = 'dark';
    if (!kind) continue;
    const decls = (blocks[kind] ??= new Map());
    for (const decl of body.split(';')) {
      const colon = decl.indexOf(':');
      if (colon === -1) continue;
      const name = decl.slice(0, colon).trim();
      const value = decl.slice(colon + 1).trim().replace(/\s+/g, ' ');
      if (/^--[\w-]+$/.test(name) && value) decls.set(name.slice(2), value);
    }
  }
  for (const kind of ['invariant', 'light', 'dark']) {
    if (!blocks[kind]) throw new UsageError(`theme.css has no ${kind === 'invariant' ? ':root' : `[data-theme='${kind}']`} block`);
  }
  return blocks;
}

const isColor = (v) => /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla|oklch|oklab|color-mix|color)\(|transparent$|currentcolor$)/i.test(v);
const fmtPx = (n) => `${Number(n.toFixed(4))}px`;
const remToPx = (v) => v.replace(/(-?\d*\.?\d+)rem\b/g, (_, n) => fmtPx(Number(n) * 16));

/** Resolve var() to other invariant values, rem to px, and simple px calc() to one length. */
function resolveLength(value, invariant, seen = new Set()) {
  let v = value.replace(/var\(--([\w-]+)\)/g, (whole, name) => {
    if (!invariant.has(name) || seen.has(name)) return whole;
    return resolveLength(invariant.get(name), invariant, new Set([...seen, name]));
  });
  v = remToPx(v);
  const calc = v.match(/^calc\((.*)\)$/);
  if (calc && /^[\s\d.px+-]+$/.test(calc[1])) {
    const terms = calc[1].match(/[+-]?\s*\d*\.?\d+px/g) ?? [];
    const joined = terms.join('').replace(/\s/g, '');
    if (joined === calc[1].replace(/\s/g, '')) {
      return fmtPx(terms.reduce((sum, t) => sum + Number(t.replace(/\s|px/g, '')), 0));
    }
  }
  return v;
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

/** The front matter object generate writes. */
export function buildFrontMatter(blocks, { name, kitVersion }) {
  const { invariant, light, dark } = blocks;
  const groups = { colors: {}, 'colors-dark': {}, typography: {}, fonts: {}, rounded: {}, spacing: {}, motion: {}, controls: {}, elevation: {}, other: {} };
  const where = new Map(); // invariant token -> group
  const pathOf = new Map(); // CSS token name -> the dotted path it is written under; every {ref} uses it
  const fontOf = (role) => (role === 'mono' ? 'mono' : /^(display|heading)/.test(role) ? 'heading' : 'sans');

  for (const [n, v] of invariant) {
    let g = 'other';
    let key = n;
    const type = n.match(/^text-(.+)-(size|line-height|weight|tracking)$/);
    if (n === 'radius' || n.startsWith('radius-')) [g, key] = ['rounded', n === 'radius' ? 'base' : n.slice('radius-'.length)];
    else if (/^space-\w+$/.test(n)) [g, key] = ['spacing', n.slice('space-'.length)];
    else if (type) [g, key] = ['typography', `${type[1]}.${TYPE_PROPS[type[2]]}`];
    else if (n.startsWith('text-')) g = 'other';
    else if (n.startsWith('font-')) [g, key] = ['fonts', n.slice('font-'.length)];
    else if (/^(duration|ease)-/.test(n)) g = 'motion';
    else if (/^(control-|icon-size-|border-width|ring-|opacity-)/.test(n)) g = 'controls';
    else if (isColor(v)) g = 'colors';
    else if (/shadow|blur/.test(n)) g = 'elevation';
    where.set(n, g);
    pathOf.set(n, `${g}.${key}`);
  }
  for (const n of [...light.keys(), ...dark.keys()]) pathOf.set(n, `colors.${n}`);
  const ref = (v) => v.replace(/var\(--([\w-]+)\)/g, (whole, n) => (pathOf.has(n) ? `{${pathOf.get(n)}}` : whole));

  for (const [n, v] of light) groups.colors[n] = ref(v);
  for (const [n, v] of dark) groups['colors-dark'][n] = ref(v);

  for (const [n, v] of invariant) {
    const g = where.get(n);
    const key = pathOf.get(n).slice(g.length + 1);
    if (g === 'rounded' || g === 'spacing') groups[g][key] = resolveLength(v, invariant);
    else if (g === 'fonts' || g === 'motion') groups[g][key] = v;
    else if (g === 'controls') groups.controls[key] = /^opacity-/.test(n) ? Number(v) : resolveLength(v, invariant);
    else if (g === 'colors') {
      // An invariant value sits under the themed ones: a light or dark declaration of the same token wins.
      groups.colors[n] ??= ref(v);
      groups['colors-dark'][n] ??= ref(v);
    } else if (g === 'typography') {
      const [role, prop] = key.split('.');
      groups.typography[role] ??= { fontFamily: `{fonts.${fontOf(role)}}` };
      groups.typography[role][prop] = prop === 'fontWeight' ? Number(v) : resolveLength(v, invariant);
    } else groups[g][key] = ref(remToPx(v));
  }

  for (const spec of Object.values(groups.typography)) {
    if (lookup(groups, spec.fontFamily.slice(1, -1)) === undefined) spec.fontFamily = '{fonts.sans}';
  }

  const fm = { name };
  if (kitVersion) fm.version = kitVersion;
  fm.description = `Generated from @gears-frontx/ui-kit${kitVersion ? `@${kitVersion}` : ''} theme.css by ${SCRIPT}. Do not edit by hand: run generate after a kit upgrade or theme change.`;
  for (const [g, map] of Object.entries(groups)) if (Object.keys(map).length) fm[g] = map;

  const skipped = [];
  const components = {};
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
    if (node === null || typeof node !== 'object' || !(key in node)) return undefined;
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
  const root = {};
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
      parent[key] = {};
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
  for (const n of Object.keys(light)) if (!(n in dark)) findings.push(`orphaned-token colors.${n}: no dark value in colors-dark; fix: regenerate from the kit or declare the dark value in the theme`);
  for (const n of Object.keys(dark)) if (!(n in light)) findings.push(`orphaned-token colors-dark.${n}: no light value in colors; fix: regenerate from the kit or declare the light value in the theme`);

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
    const key = flags[rest[i]];
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
