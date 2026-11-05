#!/usr/bin/env node
/**
 * DESIGN.md front matter from the installed @gears-frontx/ui-kit tokens.
 *
 *   node design-md.mjs generate [--design DESIGN.md] [--theme <theme.css>] [--name <name>] [--kit-version <v>]
 *   node design-md.mjs check    [same flags]   exit 1 when the front matter differs from what generate writes
 *   node design-md.mjs lint     [--design DESIGN.md]   broken {refs}, orphaned tokens, WCAG contrast
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

/** Custom properties of the invariant (:root), light and dark blocks, in source order. */
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
    if (!kind || blocks[kind]) continue;
    const decls = new Map();
    for (const decl of body.split(';')) {
      const colon = decl.indexOf(':');
      if (colon === -1) continue;
      const name = decl.slice(0, colon).trim();
      const value = decl.slice(colon + 1).trim().replace(/\s+/g, ' ');
      if (/^--[\w-]+$/.test(name) && value) decls.set(name.slice(2), value);
    }
    blocks[kind] = decls;
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
  const where = new Map(); // invariant token -> group, for var() refs inside invariant values
  const fontOf = (role) => (role === 'mono' ? 'mono' : /^(display|heading)/.test(role) ? 'heading' : 'sans');

  for (const [n, v] of invariant) {
    if (n === 'radius' || n.startsWith('radius-')) where.set(n, 'rounded');
    else if (/^space-\w+$/.test(n)) where.set(n, 'spacing');
    else if (n.startsWith('text-')) where.set(n, 'typography');
    else if (n.startsWith('font-')) where.set(n, 'fonts');
    else if (/^(duration|ease)-/.test(n)) where.set(n, 'motion');
    else if (/^(control-|icon-size-|border-width|ring-|opacity-)/.test(n)) where.set(n, 'controls');
    else if (isColor(v)) where.set(n, 'colors');
    else if (/shadow|blur/.test(n)) where.set(n, 'elevation');
    else where.set(n, 'other');
  }
  const groupOf = (n) => where.get(n) ?? 'colors';
  const refInvariant = (v) => v.replace(/var\(--([\w-]+)\)/g, (whole, n) => (light.has(n) || invariant.has(n) ? `{${groupOf(n)}.${n}}` : whole));

  for (const [n, v] of light) groups.colors[n] = refInvariant(v);
  for (const [n, v] of dark) groups['colors-dark'][n] = refInvariant(v);

  for (const [n, v] of invariant) {
    const g = where.get(n);
    if (g === 'rounded') groups.rounded[n === 'radius' ? 'base' : n.slice('radius-'.length)] = resolveLength(v, invariant);
    else if (g === 'spacing') groups.spacing[n.slice('space-'.length)] = resolveLength(v, invariant);
    else if (g === 'fonts') groups.fonts[n.slice('font-'.length)] = v;
    else if (g === 'motion') groups.motion[n] = v;
    else if (g === 'controls') groups.controls[n] = /^opacity-/.test(n) ? Number(v) : resolveLength(v, invariant);
    else if (g === 'colors') {
      groups.colors[n] = refInvariant(v);
      groups['colors-dark'][n] = refInvariant(v);
    } else if (g === 'typography') {
      const m = n.match(/^text-(.+)-(size|line-height|weight|tracking)$/);
      if (!m) {
        groups.other[n] = refInvariant(v);
        continue;
      }
      const role = (groups.typography[m[1]] ??= { fontFamily: `{fonts.${fontOf(m[1])}}` });
      role[TYPE_PROPS[m[2]]] = m[2] === 'weight' ? Number(v) : resolveLength(v, invariant);
    } else groups[g][n] = refInvariant(remToPx(v));
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

function luminance(hex) {
  let h = hex.slice(1);
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
  if (h.length === 8) {
    if (h.slice(6) !== 'ff') return null;
    h = h.slice(0, 6);
  }
  if (h.length !== 6) return null;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function* strings(node, at = []) {
  for (const [k, v] of Object.entries(node)) {
    if (v !== null && typeof v === 'object') yield* strings(v, [...at, k]);
    else if (typeof v === 'string') yield [[...at, k].join('.'), v];
  }
}

/** Findings for a parsed front matter: broken refs, tokens in one theme only, low text contrast. */
export function lintFrontMatter(fm) {
  const findings = [];
  for (const [where, value] of strings(fm)) {
    for (const [, target] of value.matchAll(/\{([^{}\s]+)\}/g)) {
      if (lookup(fm, target) === undefined) {
        findings.push(`broken-ref ${where}: {${target}} does not resolve; fix: point it at an existing token or run generate`);
      }
    }
  }
  const light = fm.colors ?? {};
  const dark = fm['colors-dark'] ?? {};
  for (const n of Object.keys(light)) if (!(n in dark)) findings.push(`orphaned-token colors.${n}: no dark value in colors-dark; fix: regenerate from the kit or declare the dark value in the theme`);
  for (const n of Object.keys(dark)) if (!(n in light)) findings.push(`orphaned-token colors-dark.${n}: no light value in colors; fix: regenerate from the kit or declare the light value in the theme`);

  const resolve = (value, palette, depth = 0) => {
    const m = typeof value === 'string' && value.match(/^\{colors\.([\w-]+)\}$/);
    if (!m || depth > 8) return value;
    return resolve(palette[m[1]], palette, depth + 1);
  };
  for (const [id, spec] of Object.entries(fm.components ?? {})) {
    if (!spec.backgroundColor || !spec.textColor) continue;
    for (const [theme, palette] of [['light', light], ['dark', { ...light, ...dark }]]) {
      const bg = resolve(spec.backgroundColor, palette);
      const fg = resolve(spec.textColor, palette);
      if (typeof bg !== 'string' || typeof fg !== 'string' || !bg.startsWith('#') || !fg.startsWith('#')) continue;
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
