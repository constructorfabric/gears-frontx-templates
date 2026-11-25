#!/usr/bin/env node
/**
 * Survey of a FrontX app for the frontx-design-proposal skill
 * (references/propose.md, step 1). Reads files only; no model, no build, no
 * browser, no network.
 *
 *   node survey-app.mjs [--project <root>] [--json] [--out <file>]
 *
 * It reports the app as it renders, not as the kit would draw it:
 * - screens: the screen extensions the app registers and shows. A package
 *   whose mfe.json says templateExample: true, a blank scaffold (name starts
 *   with "_") and, when public/generated-mfe-manifests.json exists, a package
 *   that is not in it are listed apart under notShown, never as screens;
 * - services, mocks and design files (DESIGN.md and any other DESIGN*.md at
 *   the root, any design contract under .frontx outside .frontx/ai);
 * - the chrome: side menu or top header, where the header links sit, how the
 *   active link is marked (underline, pill or filled), the app name and its
 *   mark, and whether a phone shows a second row of links or a menu button,
 *   each with the file it was read from;
 * - brandMark, brandDefs and brandHtml: the shell's own logo, an SVG cleaned
 *   for inlining or a small image as a data URI (RASTER_CAP), else the accent
 *   square or initials with the reason; an SVG logo is defined once per page
 *   (brandDefs, a <symbol id="brand-mark">) and brandHtml, the brand as every
 *   drawn header writes it, refers to it with <use>;
 * - the look: every --d-* value of the drawing kit, resolved in the order the
 *   app uses it: the CSS Modules of the shown screens (their root's kit token
 *   bridge, page heading, lead, content column, cards, buttons, counters,
 *   table headers; the content column's width without its padding when the
 *   app's global reset or the column itself sets border-box) and of the
 *   shell's header and menu, then the active theme's own variables object (its
 *   literal pairs and those of a const object it spreads, followed one level,
 *   in source order, a later entry winning;
 *   a value built in code or a spread it cannot follow is unresolved), then
 *   the installed kit (theme.css and its component styles). Each value names its source; where the kit's value
 *   and the app's differ the app's wins and the survey says so;
 * - scale: real pixel sizes are scaled to the drawing window by one rule
 *   (SCALE_RULE below), so the agent never computes them;
 * - screenLooks: per shown screen, what it uses beyond the shared values:
 *   its own page heading when it differs from the shared one, the section
 *   heading, and the coloured bands (background and text colours from the
 *   app's own tokens); the first screen with bands sets --d-band-*, the
 *   first with a section heading sets --d-section;
 * - links: the address each screen's links carry as the app renders them
 *   (the shell's menu links, literal links in the screens' code), and
 *   whether they disagree with the registered route; a route template
 *   counts only where a link is built from it (an href or to prop, a
 *   navigation call, or a small helper named for addresses), templates that
 *   disagree leave the links unresolved, and so does a layout that builds
 *   links from code the survey does not read (link form not detected);
 * - variants: the drawing kit classes the app window, its navigation, the
 *   phone header and the brand take;
 * - appLookCss: the app-look style block for the proposal page.
 *
 * The project is untrusted input. Every value copied into the page passes a
 * strict allow-list for its kind (LOOK_KINDS: a colour, a length, a font
 * family list, a weight, a keyword), under the kind's length cap
 * (LOOK_VALUE_CAPS) read before its shape; a value that does not fit is never
 * written and is listed under dropped with the reason. A colour is a hex
 * colour, a CSS named colour (NAMED_COLOURS, not any word) or a colour
 * function whose arguments are read token by token as colour syntax only. A logo is embedded
 * only from a regular file whose real path lies inside the project, under
 * its size cap, whose first bytes match its extension. Every file is read
 * only when its real path lies inside the project (or inside the installed
 * kit's own folder, for the kit's styles: the real folder
 * node_modules/@gears-frontx/ui-kit leads to, a link included, from which only
 * theme.css and the CSS under chunks are read; every other read takes the
 * project root only, so a project link into the kit folder is a link out of
 * the project), and every folder is listed only
 * when its real path lies there too: a folder the survey starts from (a walk,
 * the themes, the packages, the global stylesheets) that is a link out of the
 * project is not listed, and inside a folder the walk follows no symbolic
 * link, so no name of a file outside the project reaches the output; a link
 * there that leads to a folder, or names a file the walk would have read, is
 * listed under skipped (the reason says when it leads to a regular file inside
 * the project, the one kind references/propose.md lets the agent read). Nothing
 * the project holds stops the survey or drops out of sight: a file over
 * TEXT_CAP or not a regular file, a CSS file with @media rules nested deeper
 * than MEDIA_DEPTH_CAP (the rest of it is not read), a file or a folder the survey cannot read
 * (no permission), a link to nothing or out of the project, a
 * file where a folder is expected, a folder out of the project, an empty
 * manifest and a manifest that does not parse or has the wrong shape are each
 * listed under skipped with the reason, and each counts as unresolved. Only a
 * project root the survey cannot list is an input error. Every pattern runs in time linear in
 * the text it reads (tags and comments are read by scanning, not by
 * backtracking patterns).
 *
 * A file with more than one hard link is not read: an archive can deliver a
 * hard link to a file outside the folder it is extracted into, and the path
 * inside the project would pass the containment check. Such a file under the
 * project root (a text file, a design file, the logo) is listed under skipped
 * with that reason and counts as unresolved; a logo is drawn as the accent
 * square with it. Only the look reading of the kit's own style files
 * (theme.css and the CSS under chunks, inside the kit folder) is exempt,
 * because package stores install files as hard links: refusing them would
 * leave every such install without its look. The project can make such a file
 * a hard link to any CSS file, so what a kit style file can put into the
 * survey is bounded instead: a kit declaration name is used only to look a
 * value up and is never written, each value that fits no look kind (a colour, a length or a calc of lengths, a
 * font family list of plain characters, a weight, a text case, each
 * length-capped as written, before a var() in it is read) is replaced by
 * KIT_HIDDEN, a kit value that does not fit its key is listed under dropped
 * as KIT_HIDDEN, never as written, a kit value is written as the
 * kit's side of an app value only when it fits the key's kind, and a kit
 * selector is matched but never written. Text, markup, a path or an address in
 * a kit file never reaches the output; a value that fits a look kind does
 * (that is the cost of reading the look of a package store install). Every
 * other read, the logo and the reason given for a skipped link included,
 * applies the hard link rule wherever the file lies. The project chooses where the kit link leads, so a
 * kit folder whose real path is the project root, a folder above it, or a
 * folder of the project outside its node_modules is not used: it is listed
 * under skipped with the reason and counts as unresolved.
 *
 * Output: a short readable list, then the JSON; with --json only the JSON;
 * with --out <file> the JSON is written to that file and the list is printed.
 * Inside the project every folder below the root is checked one at a time: a
 * symbolic link is refused, a missing folder is made, and the JSON goes to a
 * new file that is renamed onto the target, so it is never written through a
 * symbolic or a hard link. Outside the project (and above its root) the
 * folders are made as given, only the file and its own folder are refused
 * when they are a symbolic link, and the JSON goes to a new file renamed onto
 * the target as well, so no existing file is written through there either.
 * Exit 0 everything resolved, 1 something unresolved (printed "unresolved":
 * the agent fills it by reading the files the list names, a skipped one only
 * as references/propose.md step 1 allows), 2 input error
 * (bad flag, no such folder, a project root it cannot list, --out not
 * writable or a symbolic link). The
 * CLI runs only when this file is the entry point.
 */
import { closeSync, existsSync, fchmodSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const USAGE = `usage: node survey-app.mjs [--project <root>] [--json] [--out <file>]

  --project <root>   The FrontX project root (default: the current folder)
  --json             Print only the JSON
  --out <file>       Write the JSON to <file> (for example the revision's survey.json)
  --help             Print this message

Exit 0 everything resolved, 1 something unresolved, 2 input error.`;

export const UNRESOLVED = 'unresolved';

/** The drawing window stands for a desktop screen of this width. */
const SCREEN_WIDTH = 1440;
const WINDOW_WIDTH = 1120;
const SCALE_RULE = 'A desktop size in pixels is drawn at round(px * 1120 / 1440), never below min(px, 16) px, so text stays readable; the phone window is 390 px like the phone, so phone sizes are drawn as they are; em values, weights and colours are not scaled.';

/** The drawn size of a real desktop size in pixels. */
export const scalePx = (px) => Math.max(Math.min(px, 16), Math.round((px * WINDOW_WIDTH) / SCREEN_WIDTH));

/** Colour and font properties: kit tokens in order of preference. */
const LOOK_TOKENS = {
  bg: ['--background'],
  surface: ['--card'],
  text: ['--foreground'],
  muted: ['--muted-foreground'],
  subtle: ['--muted'],
  line: ['--border'],
  accent: ['--primary'],
  'accent-text': ['--primary-foreground'],
  ok: ['--success-foreground', '--success'],
  'ok-soft': ['--success-soft'],
  warn: ['--warning-foreground', '--warning'],
  'warn-soft': ['--warning-soft'],
  danger: ['--danger-foreground', '--danger'],
  'danger-soft': ['--danger-soft'],
  info: ['--info'],
  'info-soft': ['--info-soft'],
  'nav-bg': ['--left-menu', '--sidebar'],
  'nav-text': ['--left-menu-foreground', '--sidebar-foreground'],
  'nav-active': ['--left-menu-selected', '--primary'],
  'nav-active-text': ['--left-menu-selected-foreground', '--primary-foreground'],
  font: ['--font-sans'],
};

/**
 * Sizes and shapes read from the shown screens' CSS Modules. sel: selector
 * patterns in order of preference; prop: properties in order; at: desktop
 * (the widest min-width rule up to 1440, scaled) or phone (the base rule,
 * not scaled); kit: the kit token when the app sets nothing.
 */
// .title, .screen and .description are the class names of the screen scaffold (template-mfe's _blank-mfe).
const TITLE = [/pageTitle/i, /pageHeading/i, /(^|[\s,])h1\b/, /heroTitle/i, /\.title(?![\w-])/];
/** The screen root: the page background and the kit token bridge. */
const PAGE_ROOT = /\.(root|screen)(?![\w-])/;
/**
 * The shell's own page background behind the screen, innermost first: the stock shell's layout/Screen.module.css
 * .screen (background-color: var(--background)) wraps every screen; the global CSS's html, body or #root is under it.
 */
const SHELL_PAGE = [['src-app/app/layout/Screen.module.css', PAGE_ROOT], ['src-app/app/globals.css', /(^|,)\s*(html|body|#root)\s*(?=,|$)/]];
/** The roles the scaffold names: with the shown screens' CSS Modules read, no match leaves them unresolved, not the kit's. */
const SCAFFOLD_ROLES = new Set(['h1', 'h1-phone', 'h1-weight', 'h1-track']);
const COLUMN = [/\.column\b/, /\.container\b/, /\.content\b/, /\.page\b/];
const BUTTON = [/\.(cta|button|btn)\w*/i];
const PAGE_ROLES = {
  h1: { sel: TITLE, prop: ['font-size'], at: 'desktop', kit: '--text-heading-1-size' },
  'h1-phone': { sel: TITLE, prop: ['font-size'], at: 'phone', kit: '--text-heading-1-size' },
  'h1-weight': { sel: TITLE, prop: ['font-weight'], at: 'desktop', kit: '--text-heading-1-weight', raw: true },
  'h1-track': { sel: TITLE, prop: ['letter-spacing'], at: 'desktop', kit: '--text-heading-1-tracking', raw: true },
  h2: { sel: [/cardTitle\b/i, /sectionTitle/i, /(^|[\s,])h2\b/], prop: ['font-size'], at: 'desktop', kit: '--text-heading-2-size' },
  lead: { sel: [/pageLead/i, /\.lead\b/i, /\.description(?![\w-])/], prop: ['font-size'], at: 'desktop', kit: '--text-body-size' },
  body: { sel: [/\.body\b/], prop: ['font-size'], at: 'desktop', kit: '--text-body-size' },
  small: { sel: [/\.(label|meta|small|note)\b/], prop: ['font-size'], at: 'desktop', kit: '--text-meta-size' },
  stat: { sel: [/(kpi|stat|metric|count)\w*(value|number|figure)/i, /\.(kpi|stat|metric)\b/i], prop: ['font-size'], at: 'desktop', kit: '--text-kpi-size' },
  radius: { sel: [/card/i], prop: ['border-radius'], at: 'desktop', kit: '--radius', raw: true },
  gutter: { sel: COLUMN, prop: ['padding-inline', 'padding'], side: 'x', at: 'desktop' },
  'gutter-phone': { sel: COLUMN, prop: ['padding-inline', 'padding'], side: 'x', at: 'phone' },
  max: { sel: COLUMN, prop: ['max-width'], at: 'desktop', content: true },
  top: { sel: [/pageHead/i, /\.head\b/i], prop: ['padding-top', 'padding'], side: 'top', at: 'desktop' },
  'top-phone': { sel: [/pageHead/i, /\.head\b/i], prop: ['padding-top', 'padding'], side: 'top', at: 'phone' },
  'btn-h': { sel: BUTTON, prop: ['--control-height-lg', 'height', 'min-height'], at: 'desktop', kit: '--control-height-md' },
  'btn-radius': { sel: BUTTON, prop: ['--radius-lg', 'border-radius'], at: 'desktop', raw: true },
  'th-case': { sel: [/tableHead|columnHead|(^|[\s,])th\b/i], prop: ['text-transform'], at: 'desktop', raw: true },
  // The active tab's text: the kit's line tabs keep --secondary-foreground; an app may colour it.
  'tab-active': { sel: [/tab\w*(\[data-(active|state=["']?active)|\[aria-selected|--active\b|Active\b|\.active\b)/i], prop: ['color'], at: 'desktop', kit: '--secondary-foreground', raw: true },
};

/** The kind of every --d-* value; a value the survey copies must fit its kind, else it is dropped. */
const COLOUR_KEYS = ['bg', 'surface', 'text', 'muted', 'subtle', 'line', 'accent', 'accent-text', 'ok', 'ok-soft', 'warn', 'warn-soft', 'danger', 'danger-soft', 'info', 'info-soft', 'nav-bg', 'nav-text', 'nav-active', 'nav-active-text', 'tab-active', 'toplink', 'toplink-active', 'band-bg', 'band-text', 'band-alt-bg', 'band-alt-text', 'mark-color'];
const LENGTH_KEYS = ['h1', 'h1-phone', 'h1-track', 'h2', 'lead', 'body', 'small', 'stat', 'radius', 'gutter', 'gutter-phone', 'max', 'top', 'top-phone', 'btn-h', 'btn-radius', 'nav-h', 'nav-pad', 'nav-gap', 'nav-size', 'brand-size', 'mark', 'nav-h-phone', 'navrow-h-phone', 'band-title', 'band-title-phone', 'section', 'section-phone'];
const LOOK_KINDS = Object.fromEntries([
  ...COLOUR_KEYS.map((k) => [k, 'colour']), ...LENGTH_KEYS.map((k) => [k, 'length']),
  ['font', 'font family list'], ['h1-weight', 'weight'], ['band-title-weight', 'weight'], ['th-case', 'text case'],
]);
const COLOUR_FUNCTIONS = new Set(['rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color', 'color-mix']);
/** The CSS named colours, with transparent and currentcolor: the only single words a colour may be. */
const NAMED_COLOURS = new Set(`aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood
cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki
darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet
deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow
grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow
lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen
linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise
mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen
paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown
seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white
whitesmoke yellow yellowgreen transparent currentcolor`.split(/\s+/));
/** The words color() and color-mix() take: in, the colour spaces, the hue interpolation words. */
const COLOUR_SPACE_WORDS = new Set(['in', 'srgb', 'srgb-linear', 'display-p3', 'a98-rgb', 'prophoto-rgb', 'rec2020', 'xyz', 'xyz-d50', 'xyz-d65', 'lab', 'oklab', 'lch', 'oklch', 'hsl', 'hwb', 'shorter', 'longer', 'increasing', 'decreasing', 'hue']);
const COLOUR_NUMBER = /[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?(?:%|deg|grad|rad|turn)?/iy;
/** A hex colour has 3, 4, 6 or 8 digits. */
const COLOUR_HEX = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})/iy;
const COLOUR_WORD = /[a-z][a-z0-9-]*/y;
/**
 * A colour function read token by token from `at` (just past its "("): every token is a number (sign, decimal part,
 * exponent, then % or an angle unit), a comma, a slash standing alone between tokens (the alpha separator) or the word
 * none; color() and color-mix() also take the words of COLOUR_SPACE_WORDS, and color-mix() a hex colour, a named
 * colour and a nested colour function read by the same rule. Nothing else: no dot outside a number, no free word, no
 * empty position (at least one token, and a token before every comma and before the ")").
 * Returns the index just past the closing ")", or -1.
 */
function colourCall(v, fn, at, depth) {
  const spaces = fn === 'color' || fn === 'color-mix';
  let prev = null;
  let i = at;
  for (;;) {
    while (i < v.length && isWs(v[i])) i += 1;
    if (i >= v.length) return -1;
    const c = v[i];
    // No empty position: ")" and "," each follow a token, so "rgb()", "rgb(,1)", "rgb(1,,2)" and "rgb(1,)" are refused.
    if (c === ')') return prev === 'token' ? i + 1 : -1;
    let kind;
    if (c === ',') {
      if (prev !== 'token') return -1;
      kind = ','; i += 1;
    } else if (c === '/') {
      if (prev === null || prev === '/' || prev === ',') return -1;
      kind = '/'; i += 1;
    } else {
      let m;
      if ((COLOUR_NUMBER.lastIndex = i, m = COLOUR_NUMBER.exec(v))) i += m[0].length;
      else if (fn === 'color-mix' && (COLOUR_HEX.lastIndex = i, m = COLOUR_HEX.exec(v))) i += m[0].length;
      else if ((COLOUR_WORD.lastIndex = i, m = COLOUR_WORD.exec(v))) {
        const word = m[0];
        i += word.length;
        if (fn === 'color-mix' && v[i] === '(' && COLOUR_FUNCTIONS.has(word) && depth < 4) {
          i = colourCall(v, word, i + 1, depth + 1);
          if (i < 0) return -1;
        } else if (!(word === 'none' || (spaces && COLOUR_SPACE_WORDS.has(word)) || (fn === 'color-mix' && NAMED_COLOURS.has(word)))) return -1;
      } else return -1;
      // A token ends at a space, a comma, a slash or ")": "1px2", "a.b" or "#fffg" is not two tokens.
      if (i < v.length && !isWs(v[i]) && !',/)'.includes(v[i])) return -1;
      kind = 'token';
    }
    if (prev === '/' && kind !== 'token') return -1;
    prev = kind;
  }
}
/** The longest value each look kind takes, applied before its shape is read. */
const LOOK_VALUE_CAPS = { colour: 200, length: 40, 'font family list': 300, weight: 10, 'text case': 12 };
const SHAPES = {
  // #hex, a CSS named colour, or a colour function whose arguments are colour syntax only (colourCall). CSS reads
  // names in any ASCII case (the kit writes currentColor), so the value is read in ASCII lower case; no other letter
  // is folded, so a letter outside ASCII never turns into a name.
  colour: (v) => { const l = asciiLower(v); return COLOUR_HEX_ONLY.test(l) || NAMED_COLOURS.has(l) || colourFunction(l); },
  length: (v) => /^-?(?:\d+|\d*\.\d+)(?:px|rem|em|%)?$/.test(v) || /^(?:normal|none)$/.test(v),
  'font family list': (v) => /^[\w\s,'-]+$/.test(v) && (v.match(/'/g) ?? []).length % 2 === 0,
  weight: (v) => /^(?:[1-9]00|normal|bold|bolder|lighter)$/.test(v),
  'text case': (v) => /^(?:uppercase|lowercase|capitalize|none)$/.test(v),
};
const COLOUR_HEX_ONLY = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const asciiLower = (v) => v.replace(/[A-Z]/g, (c) => c.toLowerCase());
const colourFunction = (v) => {
  const m = /^([a-z-]+)\(/.exec(v);
  return m !== null && COLOUR_FUNCTIONS.has(m[1]) && colourCall(v, m[1], m[0].length, 0) === v.length;
};
const FITS = Object.fromEntries(Object.entries(SHAPES).map(([kind, shape]) => [kind, (v) => v.length <= LOOK_VALUE_CAPS[kind] && shape(v)]));
/** Whether a value fits the kind of --d-<key>; a key with no kind fits nothing. */
export const lookValueFits = (key, value) => !!LOOK_KINDS[key] && FITS[LOOK_KINDS[key]](String(value).trim());

/** Per screen: the section heading of a long page, and the coloured bands (a hero, a closing band). */
const SECTION_ROLE = { sel: [/sectionTitle/i, /sectionHeading/i, /sectionHead\b/i], prop: ['font-size'], at: 'desktop' };
const BAND = /\.(hero|band|banner|closing|promo|jumbotron|callout|outro|cover)\w*\b/i;
const NOT_BAND = /btn|button|cta|link|badge|chip|tag|card|title|lead|grid|inner|aside|loading|text|item|icon/i;

/**
 * The brand mark is drawn from the app's own logo when the survey can read
 * it safely: an SVG (inline in the shell, in a component the shell imports,
 * or an .svg file it imports) is cleaned to the elements and attributes
 * below and inlined; a raster file the shell imports is embedded as a data
 * URI up to RASTER_CAP bytes. Anything else falls back to the accent square
 * (a logo the survey cannot use) or to initials (no logo), and says why.
 */
export const RASTER_CAP = 16 * 1024;
export const SVG_CAP = 64 * 1024;
export const SVG_ELEMENTS = new Set(['svg', 'symbol', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'defs', 'lineargradient', 'radialgradient', 'stop', 'clippath', 'mask', 'use']);
/** An svg element name as an author writes it (svg names are lowercased when read). */
export const svgName = (name) => ({ lineargradient: 'linearGradient', radialgradient: 'radialGradient', clippath: 'clipPath', foreignobject: 'foreignObject' })[name] ?? name;
const SVG_SHAPES = new Set(['path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'use']);
export const SVG_ATTRIBUTES = new Set([
  'viewbox', 'xmlns', 'fill', 'fill-rule', 'fill-opacity', 'clip-rule', 'clip-path', 'mask', 'stroke', 'stroke-width', 'stroke-linecap',
  'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity', 'stroke-dasharray', 'stroke-dashoffset', 'opacity', 'transform', 'd', 'cx', 'cy', 'r',
  'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'fx', 'fy', 'width', 'height', 'points', 'id', 'offset', 'stop-color', 'stop-opacity',
  'gradientunits', 'gradienttransform', 'clippathunits', 'maskunits', 'preserveaspectratio', 'href', 'aria-hidden',
]);
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
/** The basic HTML entities of a text, decoded once: an app name is escaped once on the page, an svg value is judged as read. */
const decodeEntities = (s) => s.replace(/&(?:#(\d{1,7})|#x([0-9a-f]{1,6})|(amp|lt|gt|quot|apos|nbsp));/gi, (m, dec, hex, name) => {
  if (name) return ENTITIES[name.toLowerCase()];
  const code = dec ? Number(dec) : parseInt(hex, 16);
  return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
});
const COLOR_FUNCTIONS = ['rgb', 'rgba', 'hsl', 'hsla'];
const TRANSFORM_FUNCTIONS = ['matrix', 'translate', 'scale', 'rotate', 'skewx', 'skewy'];
/**
 * The functions an svg attribute may call, by attribute; url( only with a fragment of the page (url(#id)), var( only
 * with the name of a custom property and nothing else (var(--brand)), which can load nothing.
 */
const SVG_FUNCTIONS = {
  fill: [...COLOR_FUNCTIONS, 'url', 'var'],
  stroke: [...COLOR_FUNCTIONS, 'url', 'var'],
  'stop-color': [...COLOR_FUNCTIONS, 'var'],
  'clip-path': ['url'],
  mask: ['url'],
  transform: TRANSFORM_FUNCTIONS,
  gradienttransform: TRANSFORM_FUNCTIONS,
};
const VAR_NAME_ONLY = /\s*--[\w-]{1,100}\s*\)/y;
const isFunctionChar = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '-';
/**
 * Whether every "(" of a value opens a function this attribute may call.
 * Each "(" looks back over the spaces and the name before it, which end at
 * the "(" before, so the value is read about twice: linear.
 */
function callsAllowed(name, value) {
  const allowed = SVG_FUNCTIONS[name] ?? [];
  for (let p = value.indexOf('('); p !== -1; p = value.indexOf('(', p + 1)) {
    let e = p;
    while (e > 0 && isWs(value[e - 1])) e -= 1;
    let s = e;
    while (s > 0 && isFunctionChar(value[s - 1])) s -= 1;
    const fn = value.slice(s, e).toLowerCase();
    if (!allowed.includes(fn)) return false;
    if (fn === 'url') {
      let k = p + 1;
      while (k < value.length && isWs(value[k])) k += 1;
      if (value[k] === '"' || value[k] === "'") k += 1;
      if (value[k] !== '#') return false;
      // A browser percent-decodes the fragment before it looks the id up, so "%" could spell a page id.
      for (k += 1; k < value.length && !isWs(value[k]) && !'()\'"'.includes(value[k]); k += 1) if (value[k] === '%') return false;
    }
    if (fn === 'var') {
      VAR_NAME_ONLY.lastIndex = p + 1;
      if (!VAR_NAME_ONLY.test(value)) return false;
    }
  }
  return true;
}
/**
 * An attribute value an inlined mark may carry, judged by what it is allowed
 * to hold, not by a list of what is bad. The value is read as a browser
 * reads it, character references decoded once; one that still holds a
 * reference after that (a name the survey does not know, or a reference
 * written twice) is refused. A backslash is refused anywhere (a CSS escape
 * could spell any function name), and so is "<", ">", "{" or "}". A "(" may
 * only open a function the attribute takes (SVG_FUNCTIONS): url(#fragment),
 * a color function, a transform, var(--name). An href is a fragment of the
 * page with no space or control character, which a browser would trim. The
 * fragment of an href or a url(#...) holds no "%", which a browser would
 * percent-decode into another name.
 */
export const safeSvgValue = (name, raw) => {
  const value = decodeEntities(raw);
  return !/&[#a-z]/i.test(value)
    && !/[\\<>{}]/.test(value)
    && callsAllowed(name, value)
    && (name !== 'href' || (/^#[^ %]*$/.test(value) && ![...value].some((c) => c.codePointAt(0) < 0x20)));
};
const JSX_NAMES = { classname: 'class', strokewidth: 'stroke-width', strokelinecap: 'stroke-linecap', strokelinejoin: 'stroke-linejoin', strokemiterlimit: 'stroke-miterlimit', strokeopacity: 'stroke-opacity', strokedasharray: 'stroke-dasharray', strokedashoffset: 'stroke-dashoffset', fillrule: 'fill-rule', fillopacity: 'fill-opacity', cliprule: 'clip-rule', clippath: 'clip-path', stopcolor: 'stop-color', stopopacity: 'stop-opacity', xlinkhref: 'href', 'xlink:href': 'href' };
const DROPPED = /^(class|style|on\w+|aria-(?!hidden$)[\w-]+|role|focusable|tabindex|data-[\w-]+|xmlns:\w+|xml:\w+|version|key|ref)$/;
/** The dropped attributes that would have styled or run something: the survey names them under removed. */
const NAMED_DROP = /^(class|style|on\w+)$/;

/** The text without every block from `open` to `close`; a block left open runs to the end. One pass, no regular expression. */
export function withoutBlocks(text, open, close) {
  let out = '';
  let i = 0;
  for (;;) {
    const a = text.indexOf(open, i);
    if (a === -1) return out + text.slice(i);
    out += text.slice(i, a);
    const b = text.indexOf(close, a + open.length);
    if (b === -1) return out;
    i = b + close.length;
  }
}

/** The most attributes one tag of a logo may carry; a tag with more is refused, not read. */
export const SVG_ATTR_CAP = 100;
/**
 * The most <use> elements one cleaned SVG may hold. The shipped templates and
 * the drawn brand mark hold a few; each <use> a browser expands into its
 * target's subtree, so groups of uses that draw groups of uses grow past any
 * size while the source itself stays small.
 */
const SVG_USE_CAP = 16;
const isWs = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';
const isNameStart = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
const isNameChar = (c) => isNameStart(c) || (c >= '0' && c <= '9') || c === '_' || c === ':' || c === '-';

/**
 * The next tag of SVG markup or JSX from text[at], read once from left to
 * right: { closing, rawName, list: [name, value, expr][], selfClose, end },
 * { skip, end } for a "<" that opens no tag, { error } for a tag that is never
 * closed or holds more than SVG_ATTR_CAP attributes, null when no "<" is left.
 * A value in braces is kept whole as expr; braces nest.
 */
function readSvgTag(text, at) {
  const n = text.length;
  const lt = text.indexOf('<', at);
  if (lt === -1) return null;
  let j = lt + 1;
  const closing = text[j] === '/';
  if (closing) j++;
  if (!isNameStart(text[j] ?? '')) return { skip: true, end: lt + 1 };
  const nameStart = j;
  while (j < n && isNameChar(text[j])) j++;
  const rawName = text.slice(nameStart, j);
  const list = [];
  const unclosed = { error: 'the <svg> element is not closed' };
  for (;;) {
    while (j < n && isWs(text[j])) j++;
    if (j >= n) return unclosed;
    if (text[j] === '>') return { closing, rawName, list, selfClose: false, end: j + 1 };
    if (text[j] === '/') {
      if (text[j + 1] === '>') return { closing, rawName, list, selfClose: true, end: j + 2 };
      j++;
      continue;
    }
    if (closing) return { skip: true, end: lt + 1 }; // an end tag carries no attributes
    if (list.length >= SVG_ATTR_CAP) return { error: `a <${rawName}> tag holds more than ${SVG_ATTR_CAP} attributes` };
    if (text[j] === '{') {
      // {...spread}: passes props from code; nothing to inline.
      const e = text.indexOf('}', j);
      if (e === -1) return unclosed;
      j = e + 1;
      continue;
    }
    const k0 = j;
    while (j < n && !isWs(text[j]) && text[j] !== '=' && text[j] !== '>' && text[j] !== '/') j++;
    if (j === k0) { j++; continue; } // a stray "="
    const name = text.slice(k0, j);
    while (j < n && isWs(text[j])) j++;
    let value = '';
    let expr = null;
    if (text[j] === '=') {
      j++;
      while (j < n && isWs(text[j])) j++;
      const q = text[j];
      if (q === '"' || q === "'") {
        const e = text.indexOf(q, j + 1);
        if (e === -1) return unclosed;
        value = text.slice(j + 1, e);
        j = e + 1;
      } else if (q === '{') {
        let depth = 0;
        const e0 = j;
        for (; j < n; j++) {
          if (text[j] === '{') depth++;
          else if (text[j] === '}' && --depth === 0) break;
        }
        if (j >= n) return unclosed;
        expr = text.slice(e0, ++j);
      } else {
        const e0 = j;
        while (j < n && !isWs(text[j]) && text[j] !== '>') j++;
        value = text.slice(e0, j);
      }
    }
    list.push([name, value, expr]);
  }
}

let skeleton = null;
/**
 * The ids the proposal skeleton (templates/proposal.html) gives its own
 * elements, and brand-mark, the id of the logo's symbol. An id the skeleton
 * writes with a part the page fills ("draw-...", "f-{{STEP}}") or one of a
 * numbered family ("option-a", "q-1") stands for every id with that start;
 * so does tip-, the family its script gives the tooltips (tip-0, tip-1, ...).
 * An id that starts with a filled part gives no start, since an empty one
 * would stand for every id.
 */
function skeletonIds() {
  if (skeleton) return skeleton;
  const html = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'proposal.html'), 'utf8');
  const exact = new Set(['brand-mark']);
  const starts = new Set(['tip-']);
  for (const m of html.matchAll(/\sid="([^"]*)"/g)) {
    const id = m[1];
    const cut = id.search(/\.\.\.|\{\{/);
    if (cut > 0) starts.add(id.slice(0, cut));
    else if (cut === -1) {
      exact.add(id);
      const family = /^(.+-)[a-z0-9]$/.exec(id);
      if (family) starts.add(family[1]);
    }
  }
  skeleton = { exact, starts: [...starts] };
  return skeleton;
}
const isPageId = (id) => skeletonIds().exact.has(id) || skeletonIds().starts.some((s) => id.startsWith(s));

/** The ids the cleaned tags define, decoded. */
const logoIds = (out) => {
  const ids = new Set();
  for (const t of out) for (const [n, v] of t.attrs ?? []) if (n === 'id') ids.add(decodeEntities(v));
  return ids;
};

/**
 * The cleaned tags written out. An id of the logo that the page itself uses
 * (isPageId) is renamed to logo-<id>, and every href="#id" and url(#id) of
 * the logo follows it, so the logo cannot stand in for a page element and
 * still draws the same. Values are read decoded only where a rename touches
 * them; every other value is written as the logo had it. null when an id
 * finds no free name within as many tries as there are names taken.
 */
function writeSvg(out) {
  const ids = logoIds(out);
  const renamed = new Map();
  const taken = new Set(ids);
  for (const id of ids) {
    if (!isPageId(id)) continue;
    let to = `logo-${id}`;
    // Each try is a new name, so at most taken.size of them are taken; past that every name is a page id.
    for (let k = 2; isPageId(to) || taken.has(to); k += 1) {
      if (k > taken.size + 2) return null;
      to = `logo-${id}-${k}`;
    }
    taken.add(to);
    renamed.set(id, to);
  }
  const valueOf = (n, v) => {
    if (!renamed.size) return v;
    const d = decodeEntities(v);
    let r = d;
    if (n === 'id') r = renamed.get(d) ?? d;
    else if (n === 'href') r = renamed.has(d.slice(1)) ? `#${renamed.get(d.slice(1))}` : d;
    else r = d.replace(/url\(\s*(['"]?)#([^'")\s]*)/gi, (m, q, id) => (renamed.has(id) ? `url(${q}#${renamed.get(id)}` : m));
    return r === d ? v : r.replace(/&/g, '&amp;');
  };
  return out.map((t) => (typeof t === 'string' ? t
    : `<${t.tag}${t.attrs.map(([n, v]) => ` ${n}="${valueOf(n, v).replace(/"/g, '&quot;')}"`).join('')}${t.end}`)).join('');
}

/**
 * Cleans an SVG (markup or JSX) to the elements and attributes the drawing
 * may inline. Returns { svg, removed } or { error }. Linear in the length of
 * the source: each tag is read once (readSvgTag). An SVG holding more than
 * SVG_USE_CAP <use> elements is refused: each one a browser expands into its
 * target's subtree, and groups that draw groups grow past any size.
 */
export function sanitizeSvg(source) {
  const text = withoutBlocks(withoutBlocks(String(source), '<!--', '-->'), '/*', '*/');
  const start = text.search(/<svg\b/i);
  if (start === -1) return { error: 'no <svg> element' };
  const out = [];
  const removed = new Set();
  const open = [];
  let skip = 0;
  let shapes = 0;
  let uses = 0;
  let at = start;
  for (;;) {
    const tag = readSvgTag(text, at);
    if (tag === null) break;
    if (tag.error) return { error: tag.error };
    at = tag.end;
    if (tag.skip) continue;
    const { closing, rawName, list, selfClose } = tag;
    const name = rawName.toLowerCase();
    if (closing) {
      const top = open.pop();
      if (top === undefined) break;
      if (top.skipped) skip -= 1;
      else if (!skip) out.push(`</${top.name}>`);
      if (!open.length) break;
      continue;
    }
    const allowed = SVG_ELEMENTS.has(name) && !skip;
    if (!allowed) {
      removed.add(`<${name}>`);
      if (!selfClose) { open.push({ name, skipped: true }); skip += 1; }
      continue;
    }
    const attrs = [];
    const literalOf = (expr) => /^\{\s*(?:"([^"]*)"|'([^']*)'|(-?[\d.]+))\s*\}$/.exec(expr);
    let size = {};
    for (const [rawAttr, rawValue, expr] of list) {
      const raw = rawAttr.toLowerCase();
      const attr = JSX_NAMES[raw] ?? raw;
      let value = rawValue;
      if (expr !== null) {
        const literal = literalOf(expr);
        if (!literal) {
          if (NAMED_DROP.test(attr)) removed.add(attr);
          if (DROPPED.test(attr) || (name === 'svg' && (attr === 'width' || attr === 'height'))) continue;
          return { error: `the SVG takes ${rawAttr} from code` };
        }
        value = literal[1] ?? literal[2] ?? literal[3];
      }
      if (name === 'svg' && (attr === 'width' || attr === 'height')) { size[attr] ??= /^\s*([\d.]+)/.exec(value)?.[1]; continue; }
      if (DROPPED.test(attr)) { if (NAMED_DROP.test(attr)) removed.add(attr); continue; }
      if (!SVG_ATTRIBUTES.has(attr)) { removed.add(attr); continue; }
      if (!safeSvgValue(attr, value)) { removed.add(`${attr}="${value}"`); continue; }
      const outName = { viewbox: 'viewBox', gradientunits: 'gradientUnits', gradienttransform: 'gradientTransform', clippathunits: 'clipPathUnits', maskunits: 'maskUnits', preserveaspectratio: 'preserveAspectRatio' }[attr] ?? attr;
      attrs.push([outName, value]);
    }
    const outTag = svgName(name);
    if (name === 'svg' && !open.length) {
      if (!attrs.some(([n]) => n === 'viewBox')) {
        const { width: w, height: h } = size;
        if (!w || !h) return { error: 'the SVG has no viewBox and no width and height to make one' };
        attrs.unshift(['viewBox', `0 0 ${w} ${h}`]);
      }
      if (!attrs.some(([n, v]) => n === 'aria-hidden' && v === 'true')) attrs.push(['aria-hidden', 'true']);
    }
    // A use is counted below, once the ids the logo defines are known.
    if (SVG_SHAPES.has(name) && name !== 'use') shapes += 1;
    if (name === 'use') {
      uses += 1;
      if (uses > SVG_USE_CAP) return { error: `the SVG holds more than ${SVG_USE_CAP} <use> elements` };
    }
    out.push({ tag: outTag, attrs, end: selfClose ? '/>' : '>' });
    if (!selfClose) open.push({ name: outTag, skipped: false });
    if (selfClose && !open.length) break;
  }
  if (open.length) return { error: 'the <svg> element is not closed' };
  // A reference to a page id the logo does not define would point at the page's own element: it is dropped.
  const ids = logoIds(out);
  // Each element's place (its open tag and the token after its close) and its count of shapes other than use, itself included.
  const nodes = new Map();
  const stack = [];
  out.forEach((t, i) => {
    if (typeof t === 'string') { const n = stack.pop(); n.exit = i; if (stack.length) stack.at(-1).shapes += n.shapes; return; }
    const n = { enter: i, exit: i + 1, shapes: SVG_SHAPES.has(t.tag) && t.tag !== 'use' ? 1 : 0 };
    nodes.set(t, n);
    if (t.end === '/>') { if (stack.length) stack.at(-1).shapes += n.shapes; } else stack.push(n);
  });
  const byId = new Map();
  for (const t of out) for (const [n, v] of t.attrs ?? []) if (n === 'id' && !byId.has(decodeEntities(v))) byId.set(decodeEntities(v), nodes.get(t));
  const draws = (use, id) => {
    const target = byId.get(id);
    const u = nodes.get(use);
    return target !== undefined && target !== u && !(target.enter < u.enter && u.enter < target.exit) && target.shapes > 0;
  };
  const toPage = (n, v) => {
    const d = decodeEntities(v);
    const targets = n === 'href' ? [d.slice(1)] : [...d.matchAll(/url\(\s*['"]?#([^'")\s]*)/gi)].map((m) => m[1]);
    return targets.some((id) => isPageId(id) && !ids.has(id));
  };
  for (const t of out) {
    if (typeof t === 'string') continue;
    t.attrs = t.attrs.filter(([n, v]) => {
      if (!toPage(n, v)) return true;
      removed.add(`${n}="${v}" (it names an element of the page, which the logo does not define)`);
      return false;
    });
    // A use draws only what its fragment points to: it is a shape only when the logo itself defines that element, the
    // element is neither the use nor one of its ancestors (the root svg included), and it is a shape or holds one.
    if (t.tag === 'use' && t.attrs.some(([n, v]) => n === 'href' && draws(t, decodeEntities(v).slice(1)))) shapes += 1;
  }
  if (!shapes) return { error: 'the SVG draws no shape' };
  const svg = writeSvg(out);
  if (svg === null) return { error: 'an id of the SVG cannot be renamed apart from the ids of the page' };
  if (svg.length > SVG_CAP) return { error: `the cleaned SVG is ${svg.length} bytes, over the ${SVG_CAP} byte cap` };
  return { svg, removed: [...removed] };
}

/** Sizes read from the shell's header and menu CSS Modules (top header only). */
const SHELL_ROLES = {
  'nav-h': { sel: [/\.(bar|header|topbar|toolbar)\b/], prop: ['height', 'min-height'], at: 'desktop' },
  'nav-pad': { sel: [/\.(bar|header|topbar|toolbar)\b/], prop: ['padding-inline', 'padding'], side: 'x', at: 'desktop' },
  'nav-gap': { sel: [/\.(list|links|nav|navRow)\b/], prop: ['gap', 'column-gap'], at: 'desktop' },
  'nav-size': { sel: [/\.(link|navLink|item)\b/], prop: ['font-size'], at: 'desktop' },
  'brand-size': { sel: [/\.(name|brandName|appName|title)\b/], prop: ['font-size'], at: 'desktop' },
  mark: { sel: [/\.(mark|logo)\b/], prop: ['width', 'height'], at: 'desktop' },
  'nav-h-phone': { sel: [/\.(brand|logo)\b/, /\.(bar|header)\b/], prop: ['height', 'min-height'], at: 'phone' },
  'navrow-h-phone': { sel: [/\.(navRow|links|nav)\b/], prop: ['height', 'min-height'], at: 'phone' },
};

const SKIP_DIRS = new Set(['node_modules', 'dist', 'dist-lib', '.git', 'coverage']);
/** The largest project text file the survey reads; a bigger one is skipped. */
export const TEXT_CAP = 1024 * 1024;
/**
 * Files the survey meant to read and did not, each with the reason: over the
 * cap, not a regular file, a file or folder without read permission, a link
 * to nothing or out of the project, a folder that is a file, a manifest it
 * cannot read. Each one is also unresolved.
 */
let skipped = [];
/** The real folders a read may come from: the project, and the installed kit once it is found. */
let readRoots = [];
const skip = (file, why) => { skipped.push({ file, why }); };
const lexists = (file) => { try { lstatSync(file); return true; } catch { return false; } };
const lisLink = (file) => { try { return lstatSync(file).isSymbolicLink(); } catch { return false; } };
/** Whether a file is there; a link to nothing is listed under skipped and is not there. */
const exists = (file) => {
  if (existsSync(file)) return true;
  if (lexists(file)) skip(file, 'a link to a file that does not exist');
  return false;
};
/** Whether dir is a folder the survey can list; a file or a link to nothing in its place is listed under skipped. */
const isFolder = (dir) => {
  if (!lexists(dir)) return false;
  let stat;
  try { stat = statSync(dir); } catch { skip(dir, 'a link to a folder that does not exist'); return false; }
  if (!stat.isDirectory()) { skip(dir, 'not a folder: the survey expected a folder here'); return false; }
  return true;
};
/**
 * The real path of a file or folder when it lies inside the project, else null with the reason under skipped. Only the
 * look reading of the kit's own style files passes kit (theme.css and the walk of the CSS under chunks): for it alone the
 * kit folder counts too. Every other read takes the project root only, so a project link into the kit folder is a link
 * out of the project like any other.
 */
const contained = (file, what = 'file', kit = false) => {
  let real;
  try { real = realpathSync(file); } catch { skip(file, `cannot be read: no such ${what}, or a link to nothing`); return null; }
  if (!(kit ? readRoots : readRoots.slice(0, 1)).some((r) => within(real, r))) { skip(file, `a link to a ${what} outside the project`); return null; }
  return real;
};
/**
 * The entries of a folder whose real path lies inside the project (or the
 * kit); null when it is not there, not a folder, out of the project or cannot
 * be listed (listed under skipped).
 */
const list = (dir, kit = false) => {
  if (!isFolder(dir) || contained(dir, 'folder', kit) === null) return null;
  try { return readdirSync(dir, { withFileTypes: true }); } catch (err) { skip(dir, `cannot be listed (${err.code ?? err.message})`); return null; }
};
/** Why a file with more than one hard link is skipped. */
const HARD_LINK = 'a file with more than one hard link, which the survey does not read';
/**
 * Whether a file has more than one hard link: an archive can deliver a hard link to a file outside the project. Where the
 * file lies does not matter, as the project chooses where the kit link leads.
 */
const multiLinked = (stat) => stat.isFile() && stat.nlink > 1;
/**
 * What a skip reason adds for a file with more than one hard link: only a kit style file reaches a reason other than
 * HARD_LINK so, and the note keeps the agent from opening it by hand (references/propose.md).
 */
const LINK_NOTE = ', and it has more than one hard link';
const linkNote = (file) => { try { return multiLinked(statSync(file)) ? LINK_NOTE : ''; } catch { return ''; } };
/**
 * A project text file, or '' when it is outside the project, not a regular file, linked more than once, over TEXT_CAP or
 * cannot be read (listed under skipped). kitStyle is set only by the look reading of the kit's own style files
 * (theme.css and the CSS under chunks), which package stores install as hard links: that read alone, of a file in the
 * kit folder, skips the hard link rule.
 */
const read = (file, kitStyle = false) => {
  const real = contained(file, 'file', kitStyle);
  if (real === null) return '';
  const stat = statSync(real);
  // The flag alone does not do it: the file must also lie in the kit folder findKitDir accepted.
  const kitFile = kitStyle && readRoots.length > 1 && within(real, readRoots[1]);
  if (!kitFile && multiLinked(stat)) { skip(file, HARD_LINK); return ''; }
  const note = multiLinked(stat) ? LINK_NOTE : '';
  if (!stat.isFile() || stat.size > TEXT_CAP) {
    skip(file, stat.isFile() ? `${stat.size} bytes, over the ${TEXT_CAP} byte cap${note}` : 'not a regular file');
    return '';
  }
  try { return readFileSync(real, 'utf8'); } catch (err) { skip(file, `cannot be read (${err.code ?? err.message})${note}`); return ''; }
};
/** A record file the survey parses: its text, or null when read() skipped it (already listed under skipped); an empty file is text. */
const readRecord = (file) => {
  const before = skipped.length;
  const text = read(file);
  return skipped.length > before ? null : text;
};
const rel = (root, file) => path.relative(root, file).split(path.sep).join('/');
const stripComments = (text) => withoutBlocks(text, '/*', '*/').replace(/(^|[^:])\/\/.*$/gm, '$1');

/**
 * Files under dir that keep() accepts. dir itself is walked only when its
 * real path lies inside the project (or the kit); inside it symbolic links
 * are not followed, so a loop or a link out of the project is never walked.
 * A link that keep() would have taken or that leads to a folder (inside the
 * project, or out of it, as such), a dir out of the project and a dir that is
 * a file are listed under skipped.
 */
function walk(dir, keep, out = [], kit = false) {
  const entries = list(dir, kit);
  if (entries === null) return out;
  for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      if (keep(full)) skip(full, linkedFileWhy(full));
      // contained() names a link out of the project itself, as it does for a folder the survey starts from.
      else if (leadsToFolder(full) && contained(full, 'folder', kit) !== null) skip(full, 'a symbolic link to a folder, which the survey does not walk');
    }
    else if (entry.isDirectory()) walk(full, keep, out, kit);
    else if (entry.isFile() && keep(full)) out.push(full);
  }
  return out;
}

/**
 * Why a symbolic link the walk would have read is skipped: a regular file inside the project (one hard link, its real
 * path under the project root) is said so, as references/propose.md lets the agent read that one by hand; a link out of
 * the project or to nothing keeps its own reason; anything else is a link the survey does not follow.
 */
const linkedFileWhy = (file) => {
  let real;
  try { real = realpathSync(file); } catch { return 'cannot be read: no such file, or a link to nothing'; }
  const base = readRoots[0];
  if (real !== base && !real.startsWith(base + path.sep)) return 'a link to a file outside the project';
  let stat = null;
  try { stat = statSync(real); } catch { /* the generic reason below */ }
  return stat?.isFile() && !multiLinked(stat) ? 'a symbolic link to a file inside the project, which the survey does not follow' : 'a symbolic link, which the survey does not follow';
};

/** Whether a real path is folder or lies under it. */
const within = (real, folder) => { const r = path.relative(folder, real); return r === '' || (r !== '..' && !r.startsWith(`..${path.sep}`) && !path.isAbsolute(r)); };

const leadsToFolder = (file) => { try { return statSync(file).isDirectory(); } catch { return false; } };

/** Custom property declarations per scope of a CSS file: root, light, dark. */
function parseKitCss(full) {
  const scopes = { root: new Map(), light: new Map(), dark: new Map() };
  for (const rule of cssRules(full, '', true)) {
    if (rule.media !== null) continue;
    const names = rule.selector.split(',').map((s) => s.trim().replace(/"/g, "'"));
    const targets = [];
    if (names.includes(':root')) targets.push('root');
    if (names.includes("[data-theme='light']")) targets.push('light');
    if (names.includes("[data-theme='dark']")) targets.push('dark');
    for (const [name, value] of rule.decls) if (name.startsWith('--')) for (const t of targets) scopes[t].set(name, value);
  }
  return scopes;
}

/** The deepest nesting of @media rules the survey reads; past it the rest of the file is skipped. */
export const MEDIA_DEPTH_CAP = 32;
/** The block at-rules that hold style rules: each opens a frame like a non-min-width @media does, with media
 * 'other'; for @layer too, because the survey does not model the cascade layers. */
const RULE_HOLDING_AT_RULES = new Set(['@supports', '@layer', '@container', '@scope', '@starting-style', '@document']);

/**
 * Rules of a CSS file: { selector, media, decls }. media is null for a top
 * level rule, the min-width in px of the innermost @media (min-width: N px,
 * or N rem or N em read as N * 16 px) for a rule inside one, or 'other' for any other @media and for a rule
 * inside a rule-holding block at-rule (@supports, @layer, @container, @scope,
 * @starting-style, @document), which opens a frame like a non-min-width
 * @media does: layered rules are not read into the look because the survey
 * does not model the cascade layers. A block at-rule opened inside a frame
 * with media 'other' gets media 'other' too, whatever its own condition says,
 * so a min-width @media inside one of those blocks or inside a non-min-width
 * @media never feeds the look; a min-width @media inside a min-width @media
 * takes the innermost min-width. A rule inside any other at-rule is not
 * kept and the file is read on. One pass:
 * each open @media body is a frame with its own brace depth, start and
 * selector, so a body is read where it stands and never scanned again. A
 * semicolon ends an at-statement (@import, @charset, @layer a;, @namespace,
 * @value) in every frame, at its own depth 0: the statement itself is no
 * rule, and the rule after it is read as its own, as is the rule after a
 * stray semicolon. While a frame's pending text is an at-statement, a quoted
 * string ("...", '...', with backslash escapes) and the content of url(...)
 * in it hold no end: no semicolon or brace inside one ends or opens anything.
 * A string also ends at an unescaped newline, as a bad string: the file reads
 * on from there, while a quote inside an unquoted url( opens no string, a
 * quoted url("...") holds a string like any other and then everything up to
 * its ")", and url( is matched in any case. A rule inside a block at-rule the file never closes is not kept
 * and the file, given as full, is listed under skipped, once, also when the
 * file ends inside the string or url() of an at-statement there. An @media
 * nested deeper than MEDIA_DEPTH_CAP ends the reading: the rules before it
 * are kept and the file is listed under skipped; so does a "}" at the top
 * level with no rule open, and a file that ends inside the string or url()
 * of an at-statement.
 */
function parseCssRules(css, file = '', full = null) {
  const rules = [];
  const text = withoutBlocks(css, '/*', '*/');
  // head says what a frame's pending text (from start to the character being read) opens with: 'empty' while it holds
  // no character but white space and stray semicolons, 'at' when it opens with @, 'other' after any other character.
  // quote and url hold the string and url(...) the frame is inside while its pending text is an at-statement: no
  // semicolon or brace inside them ends or opens anything.
  const top = { media: null, depth: 0, start: 0, selector: '', kept: 0, head: 'empty', quote: '', url: 0 };
  const frames = [top];
  // A frame's pending text starts over: what a fresh frame would open with.
  const reset = (f, at) => { f.start = at; f.head = 'empty'; f.quote = ''; f.url = 0; };
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    const f = frames[frames.length - 1];
    // What the innermost frame's pending text opens with, read in one pass; a string or url() of a pending
    // at-statement is text of the statement and says nothing of what follows.
    if (f.depth === 0 && !f.quote && !f.url && f.head === 'empty' && c !== ';' && !/\s/.test(c)) f.head = c === '@' ? 'at' : 'other';
    if (f.head === 'at') {
      // A quoted string ends at its matching unescaped quote, or at an unescaped newline, which ends it as a bad
      // string: the file reads on from there. Inside a url( only ")" ends it, and a quote opens no string; a url(
      // whose first character after white space is a quote opens its string at once, read by the string branch while
      // url stays set, so a ")" inside the quotes ends nothing and, once the string ends, the url reads on to its ")".
      // url( is matched in any case.
      if (f.quote) {
        if (c === '\\') i += 1;
        else if (c === f.quote) f.quote = '';
        else if (c === '\n' || c === '\r' || c === '\f') f.quote = '';
        continue;
      }
      if (f.url) { if (c === ')') f.url = 0; continue; }
      if (c === '"' || c === "'") { f.quote = c; continue; }
      if ((c === 'u' || c === 'U') && /^url\(/i.test(text.slice(i, i + 4))) {
        let j = i + 4;
        while (j < text.length && /\s/.test(text[j])) j += 1;
        f.url = 1;
        if (text[j] === '"' || text[j] === "'") { f.quote = text[j]; i = j; } else i = j - 1;
        continue;
      }
    }
    if (c !== '{' && c !== '}' && !(c === ';' && f.depth === 0)) continue;
    if (c === ';') {
      // An at-statement ends here in any frame, at the frame's own depth 0: what follows is read as its own rule. A
      // pending text that is empty or holds only stray semicolons is no rule either, so the start moves past it.
      if (f.head !== 'other') reset(f, i + 1);
      continue;
    }
    if (c === '{') {
      if (f.depth === 0) {
        f.selector = text.slice(f.start, i).trim();
        reset(f, i + 1);
        // A min-width in rem or em is read as that many times 16 px: the survey assumes the browser's 16 px root size.
        const minMatch = /min-width:\s*(?:(\d+)px|(\d+(?:\.\d+)?)r?em\b)/i.exec(f.selector);
        const min = minMatch && [minMatch[0], minMatch[1] ?? String(Number(minMatch[2]) * 16)];
        // The at-rule name is read once, lower cased, and used for both the @media test and the rule-holding test, so
        // @MEDIA (min-width: 600px){ and @supports(display:grid){ are read like their lower case spellings. A
        // rule-holding block at-rule, @layer included, opens a frame like a non-min-width @media does, with media
        // 'other': layered rules are not read into the look because the survey does not model the cascade layers.
        // Nesting counts toward MEDIA_DEPTH_CAP the way @media nesting does. A frame opened inside a frame with media
        // 'other' gets media 'other' too, whatever its own selector says, so a min-width @media inside @layer,
        // @supports or @media print never feeds the look; a min-width @media inside a min-width @media takes the
        // innermost min-width.
        const name = /^@[\w-]+/.exec(f.selector)?.[0]?.toLowerCase() ?? '';
        const atMedia = name === '@media';
        const holding = !atMedia && RULE_HOLDING_AT_RULES.has(name);
        if (atMedia || holding) {
          if (frames.length > MEDIA_DEPTH_CAP) {
            if (full) skip(full, `block at-rules (@media, @supports, @layer, ...) nested more than ${MEDIA_DEPTH_CAP} deep: the rest of the file is not read${linkNote(full)}`);
            return rules;
          }
          f.depth = 1;
          frames.push({ media: f.media !== 'other' && atMedia ? (min && !/max-width/i.test(f.selector) ? Number(min[1]) : 'other') : 'other', depth: 0, start: i + 1, selector: '', kept: rules.length, head: 'empty', quote: '', url: 0 });
          continue;
        }
      }
      f.depth += 1;
    } else if (f === top && f.depth === 0) {
      // A "}" with no rule open: reading on would put every rule after it at the wrong depth, and so drop it.
      if (full) skip(full, `a closing brace with no rule open: the rest of the file is not read${linkNote(full)}`);
      return rules;
    } else if (f.depth === 0) {
      // The end of an @media or rule-holding at-rule body: the block that holds it closes too.
      frames.pop();
      const outer = frames[frames.length - 1];
      outer.depth = 0;
      reset(outer, i + 1);
    } else {
      f.depth -= 1;
      if (f.depth === 0) {
        if (!f.selector.startsWith('@')) {
          const decls = new Map();
          for (const m of text.slice(f.start, i).matchAll(/(?<![\w-])(--[\w-]{1,100}|[a-z-]{1,100})\s*:\s*([^;{}]+)/g)) decls.set(m[1], m[2].trim());
          rules.push({ selector: f.selector, media: f.media, decls, file });
        }
        reset(f, i + 1);
      }
    }
  }
  // The end of the file inside a string or url() of a pending at-statement, or inside a block the file never closes:
  // the rules of the unclosed block are cut, the rules before it stay, and the file is listed under skipped once.
  const last = frames[frames.length - 1];
  if (frames.length > 1) rules.length = frames[1].kept;
  if (full && (last.quote || last.url)) skip(full, `an unterminated string or url() in an at-rule: the rest of the file is not read${linkNote(full)}`);
  else if (full && frames.length > 1) skip(full, `a block at-rule (@media, @supports, ...) the file never closes: its rules are not read${linkNote(full)}`);
  return rules;
}

/** The longest custom property name a var() in a kit value may carry. */
const KIT_NAME_CAP = 64;
/** What stands in the survey for a kit value that fits no look kind: it fits none either, and holds nothing of the file. */
export const KIT_HIDDEN = '[a kit value that fits no look kind]';
/**
 * Whether a kit value may stand as it is: the value as written is within the cap of a look kind (LOOK_VALUE_CAPS) and,
 * with each var(--name) read as 0, fits that kind, or it is within KIT_CALC_CAP and a length toPx reads (a calc of
 * lengths). A var() counts only with a custom property name of the property shape, at most KIT_NAME_CAP long, and no
 * fallback. Anything else, text, markup, a path or an address, is replaced by KIT_HIDDEN.
 */
const KIT_CALC_CAP = 200;
const KIT_VAR = new RegExp(`var\\(\\s*--[A-Za-z0-9_-]{1,${KIT_NAME_CAP - 2}}\\s*\\)`, 'g');
export const kitValueFits = (value) => {
  const bare = value.replace(KIT_VAR, '0');
  return Object.entries(FITS).some(([kind, fits]) => value.length <= LOOK_VALUE_CAPS[kind] && fits(bare)) || (value.length <= KIT_CALC_CAP && toPx(bare) !== null);
};
/**
 * The rules of a project or kit CSS file read through read(); kitStyle only for the kit's own style files. In a kit rule
 * each value that fits no look kind becomes KIT_HIDDEN, so the survey can write nothing else from a kit file. Its
 * selector and its declaration names are kept for matching and looking up and are never written to the output.
 */
const cssRules = (full, file, kitStyle = false) => {
  const rules = parseCssRules(read(full, kitStyle), file, full);
  if (!kitStyle) return rules;
  return rules.map((rule) => ({
    ...rule,
    decls: new Map([...rule.decls].map(([name, value]) => [name, kitValueFits(value) ? value : KIT_HIDDEN])),
  }));
};

/** An entry of an object literal: a spread, or a pair whose key is a quoted custom property name; a value written as one plain string. */
const SPREAD_ENTRY = /^\.\.\.\s*([\s\S]*)$/;
const PAIR_ENTRY = /^(['"])(--[\w-]+)\1\s*:\s*([\s\S]*)$/;
const LITERAL_VALUE = /^(?:'([^'\\\n]*)'|"([^"\\\n]*)")$/;

/**
 * The text of the object literal whose "{" is at open, up to its matching "}", or null when the file never closes it.
 * Quoted strings and template literals are skipped whole, so a brace inside one counts for nothing.
 */
function objectBody(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    const c = text[i];
    if (c === '"' || c === "'" || c === '`') {
      for (i += 1; i < text.length && text[i] !== c; i += 1) if (text[i] === '\\') i += 1;
    } else if (c === '{') depth += 1;
    else if (c === '}' && --depth === 0) return text.slice(open + 1, i);
  }
  return null;
}

/**
 * The top level entries of an object literal's body, in source order: the text between two commas outside strings,
 * template literals and brackets, trimmed; an empty one (after a trailing comma) is left out. One pass.
 */
function objectEntries(body) {
  const entries = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i <= body.length; i += 1) {
    const c = body[i];
    if (c === '"' || c === "'" || c === '`') {
      for (i += 1; i < body.length && body[i] !== c; i += 1) if (body[i] === '\\') i += 1;
    } else if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' || c === ']' || c === '}') depth -= 1;
    else if (i === body.length || (c === ',' && depth === 0)) {
      const entry = body.slice(start, i).trim();
      if (entry) entries.push(entry);
      start = i + 1;
    }
  }
  return entries;
}

/**
 * Where the object literal each const (let, var) of a file opens, by name, the first of each name: local holds every
 * one, exported those written export const. One pass; the "=" is looked for within 200 characters of the name (room for
 * a type), so a declaration with none costs no more than that.
 */
const DECLARATION = /\b(export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)(?![\w$])[^=;{}]{0,200}=\s*\{/g;
function declarations(code) {
  const local = new Map();
  const exported = new Map();
  for (const m of code.matchAll(DECLARATION)) {
    const open = m.index + m[0].length - 1;
    if (!local.has(m[2])) local.set(m[2], open);
    if (m[1] && !exported.has(m[2])) exported.set(m[2], open);
  }
  return { local, exported };
}

const THEME_UNKNOWN = 'the colours of the theme are not known';

/**
 * The entries of the theme's own variables object (body), in source order: a literal '--x': '...' pair, a pair built
 * in code (a call, a template), or a spread (...name), followed one level to a const object in the theme file itself or
 * exported by a file the theme imports by a relative path, read through read() like every other file. A key takes the
 * value of the last entry that sets it, as in JS: the entries are applied last first, each key once, so a spread met
 * again sets nothing new and costs nothing. Each spread name is followed once and each imported file read once. A
 * literal goes to variables, a value built in code to unread with the reason, so no lookup falls through to the kit for
 * it. Returns why the colours are not known when a spread cannot be followed (the first in source order), else null.
 */
function readVariables(root, file, code, body, variables, from, unread) {
  const themeFile = rel(root, file);
  const own = declarations(code);
  const imports = importTable(code);
  const files = new Map();
  const spreads = new Map();
  const pair = (key, value, where, why) => {
    const literal = LITERAL_VALUE.exec(value.trim());
    return { key, where, value: literal ? literal[1] ?? literal[2] : null, why };
  };
  const follow = (name) => {
    const fail = (why) => ({ blocked: `${themeFile} spreads ${why}` });
    if (!/^[A-Za-z_$][\w$]*$/.test(name)) return fail(`${name.slice(0, 60)}, which the survey does not read: ${THEME_UNKNOWN}`);
    let where = file;
    let source = code;
    let open = own.local.get(name);
    if (open === undefined) {
      const spec = imports.get(name);
      if (spec === undefined) return fail(`${name}, which the survey cannot find: ${THEME_UNKNOWN}`);
      const target = { spec, file: resolveImport(root, file, spec) };
      if (!target.spec.startsWith('.') || !target.file) return fail(`${name} from ${target.spec}, which the survey does not read: ${THEME_UNKNOWN}`);
      if (!files.has(target.file)) { const text = stripComments(read(target.file)); files.set(target.file, { text, exported: declarations(text).exported }); }
      where = target.file;
      source = files.get(where).text;
      open = files.get(where).exported.get(name);
    }
    const object = open === undefined ? null : objectBody(source, open);
    if (object === null) return fail(`${name} from ${rel(root, where)}, which holds no ${where === file ? '' : 'exported '}object of that name the survey can read: ${THEME_UNKNOWN}`);
    const entries = objectEntries(object);
    if (entries.some((e) => SPREAD_ENTRY.test(e))) return fail(`${name} from ${rel(root, where)}, which spreads another object: the survey follows one level, so ${THEME_UNKNOWN}`);
    const pairs = [];
    for (const entry of entries) {
      const p = PAIR_ENTRY.exec(entry);
      if (p) pairs.push(pair(p[2], p[3], rel(root, where), `${themeFile} spreads ${name} from ${rel(root, where)}, which builds ${p[2]} in code (a call or a template, not a literal): the survey does not run it`));
    }
    return { pairs };
  };
  let blocked = null;
  const entries = objectEntries(body).map((entry) => {
    const spread = SPREAD_ENTRY.exec(entry);
    if (spread) {
      const name = spread[1].trim();
      if (!spreads.has(name)) spreads.set(name, follow(name));
      const got = spreads.get(name);
      if (got.blocked) { blocked ??= got.blocked; return null; }
      return { name, pairs: got.pairs };
    }
    const p = PAIR_ENTRY.exec(entry);
    return p ? { pairs: [pair(p[2], p[3], themeFile, `${themeFile} builds ${p[2]} in code (a call or a template, not a literal): the survey does not run it`)] } : null;
  });
  const set = new Set();
  const applied = new Set();
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i];
    if (!entry || applied.has(entry.name)) continue;
    if (entry.name) applied.add(entry.name);
    for (let j = entry.pairs.length - 1; j >= 0; j -= 1) {
      const { key, where, value, why } = entry.pairs[j];
      if (set.has(key)) continue;
      set.add(key);
      from.set(key, where);
      if (value === null) unread.set(key, why);
      else variables.set(key, value);
    }
  }
  return blocked;
}

/**
 * The active theme: the file under src-app/app/themes that says default: true, read from its variables object
 * (readVariables), comments stripped: from names the file each value comes from, unread the names built in code,
 * blocked why the colours are not known when a spread cannot be followed or the variables are not an object literal.
 */
function readActiveTheme(root) {
  const dir = path.join(root, 'src-app/app/themes');
  const names = list(dir)?.map((e) => e.name);
  if (!names) return null;
  const files = names.sort().filter((n) => /\.ts$/.test(n) && !/\.test\.ts$/.test(n)).map((n) => path.join(dir, n));
  const file = files.find((f) => /\bdefault:\s*true\b/.test(read(f)));
  if (!file) return null;
  const text = read(file);
  const code = stripComments(text);
  const variables = new Map();
  const from = new Map();
  const unread = new Map();
  const open = /\bvariables\s*:\s*\{/.exec(code);
  const body = open ? objectBody(code, open.index + open[0].length - 1) : null;
  const blocked = body !== null ? readVariables(root, file, code, body, variables, from, unread)
    : /\bvariables\s*:/.test(code) ? `${rel(root, file)} gives variables no object literal the survey can read: ${THEME_UNKNOWN}` : null;
  return {
    file: rel(root, file),
    id: text.match(/\bid:\s*['"]([\w-]+)['"]/)?.[1] ?? text.match(/_ID\s*=\s*['"]([\w-]+)['"]/)?.[1] ?? UNRESOLVED,
    appearance: text.match(/\bappearance:\s*['"](light|dark)['"]/)?.[1] ?? 'light',
    variables,
    from,
    unread,
    blocked,
  };
}

function findKitDir(root) {
  let dir = root;
  for (;;) {
    for (const sub of ['node_modules/@gears-frontx/ui-kit/dist', 'node_modules/@gears-frontx/ui-kit']) {
      if (existsSync(path.join(dir, sub, 'theme.css'))) {
        // The kit may be installed above the project or linked from a package store: its own real folder is the one place
        // outside the project a read may come from. The project chooses where the kit link leads, so a kit folder that is
        // the project root, a folder above it, or a folder of the project outside its node_modules is refused.
        const kit = realpathSync(path.join(dir, sub));
        const base = readRoots[0];
        const why = within(base, kit) ? 'the kit folder is the project root or a folder above it'
          : within(kit, base) && !within(kit, path.join(base, 'node_modules')) ? 'the kit folder lies inside the project outside its node_modules' : null;
        if (why) { skip(path.join(dir, sub), `${why}: the survey reads no kit from it`); return null; }
        readRoots.push(kit);
        return path.join(dir, sub);
      }
    }
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

/** The longest value one var() resolution may produce; over it the value cannot be resolved. */
const RESOLVE_CAP = 4096;

/**
 * Replaces every var(--x[, fallback]) in a value through lookup; null when one cannot be resolved or the resolved
 * value would be over RESOLVE_CAP characters. Within one resolution a name is resolved once and cached, so a value
 * with many var() calls of the same names costs one resolution of each name, not one per appearance; the depth cap
 * and the cycle behaviour are as before. A null is a result at a depth: the depth cap refuses only deep chains, so
 * the same name may still resolve in a frame shallower in the same resolution, and a null is reused only at or under
 * the depth it failed at, while a resolved value is reused at any depth. Caching nulls by depth keeps the work
 * bounded even when nothing resolves: a name is then resolved at most once per depth it is asked at.
 */
function resolveVars(raw, lookup, depth = 0, cache = new Map()) {
  if (raw === null || raw === undefined || depth > 12) return null;
  let out = '';
  let i = 0;
  while (i < raw.length) {
    const at = raw.indexOf('var(', i);
    if (at === -1) { out += raw.slice(i); if (out.length > RESOLVE_CAP) return null; break; }
    out += raw.slice(i, at);
    let level = 1;
    let j = at + 4;
    for (; j < raw.length && level; j += 1) {
      if (raw[j] === '(') level += 1;
      else if (raw[j] === ')') level -= 1;
    }
    const inner = raw.slice(at + 4, j - 1);
    const comma = inner.indexOf(',');
    const name = (comma === -1 ? inner : inner.slice(0, comma)).trim();
    const fallback = comma === -1 ? null : inner.slice(comma + 1).trim();
    let value;
    const cached = cache.get(name);
    if (cached !== undefined && (cached.value !== null || depth >= cached.depth)) value = cached.value;
    else {
      value = resolveVars(lookup(name), lookup, depth + 1, cache);
      cache.set(name, value === null ? { value: null, depth } : { value, depth: 0 });
    }
    if (value === null && fallback !== null) value = resolveVars(fallback, lookup, depth + 1, cache);
    if (value === null) return null;
    out += value;
    if (out.length > RESOLVE_CAP) return null;
    i = j;
  }
  return out.trim();
}

/**
 * A length in px: px, rem (16 px), or a calc() of them; null for anything
 * else, so a caller reads null as "unknown". A malformed number (more than
 * one dot, a lone dot or dash) is unknown too, and the plain branch never
 * returns NaN or Infinity.
 */
function toPx(value) {
  if (value === null || value === undefined) return null;
  const v = String(value).trim();
  const plain = /^(-?(?:\d+(?:\.\d+)?|\.\d+))(px|rem)?$/.exec(v);
  if (plain) {
    const n = Number(plain[1]) * (plain[2] === 'rem' ? 16 : 1);
    if (!Number.isFinite(n)) return null;
    return plain[2] || n === 0 ? n : null;
  }
  const calc = /^calc\((.*)\)$/.exec(v);
  if (!calc) return null;
  // A number is read from its first digit only (the look-behind), so a long run of digits is scanned once, not once per digit.
  const expr = calc[1].replace(/calc\(/g, '(').replace(/(?<![\d.])(-?[\d.]+)rem\b/g, (_, n) => String(Number(n) * 16)).replace(/(?<![\d.])(-?[\d.]+)px\b/g, '$1');
  if (!/^[\d.+\-*/()\s]+$/.test(expr)) return null;
  try { const n = Function(`"use strict"; return (${expr});`)(); return Number.isFinite(n) ? n : null; } catch { return null; }
}

/** The parts of a shorthand value, split at white space outside parentheses; one pass. */
function shorthandParts(value) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const c of value.trim()) {
    if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && isWs(c)) { if (cur) parts.push(cur); cur = ''; } else cur += c;
  }
  if (cur) parts.push(cur);
  return parts;
}

/** The horizontal (x) or top value of a padding shorthand. */
function side(value, which) {
  const parts = shorthandParts(value);
  if (which === 'top') return parts[0];
  return parts[1] ?? parts[0];
}

// [^{}]: a failed start stops at the next brace, so many "import {" before one "}" cost no more than one.
const KIT_IMPORT = /import\s+(type\s+)?\{([^{}]*)\}\s*from\s*['"]@gears-frontx\/ui-kit[^'"]*['"]/g;

/** PascalCase value imports from the kit in the given files. */
function kitImports(files) {
  const names = new Set();
  for (const file of files) {
    for (const m of read(file).matchAll(KIT_IMPORT)) {
      if (m[1]) continue;
      for (const part of m[2].split(',')) {
        const name = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
        if (/^[A-Z]\w*$/.test(name) && !part.trim().startsWith('type ')) names.add(name);
      }
    }
  }
  return [...names].sort();
}

/** Extension ids the app registers: public/generated-mfe-manifests.json, or null when there is none. */
function registeredIds(root) {
  const file = path.join(root, 'public/generated-mfe-manifests.json');
  if (!exists(file)) return null;
  const text = readRecord(file);
  if (text === null) return null;
  if (text.trim() === '') { skip(file, 'an empty file, not the list of registered screens; every screen is taken as shown'); return null; }
  try {
    const data = JSON.parse(text);
    const list = Array.isArray(data) ? data : data?.manifests;
    if (!Array.isArray(list) || list.some((item) => !item || typeof item !== 'object' || (item.extensions !== undefined && !Array.isArray(item.extensions)))) throw new Error('not a list of manifests, each with a list of extensions');
    const ids = new Set();
    for (const item of list) for (const ext of item.extensions ?? []) if (ext && typeof ext.id === 'string') ids.add(ext.id);
    return ids;
  } catch (err) {
    skip(file, `cannot be read as the list of registered screens (${err.message}); every screen is taken as shown`);
    return null;
  }
}

/** What is wrong with the shape of a parsed mfe.json, or null when the survey can read it. */
function manifestShape(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'is not a JSON object';
  for (const key of ['entries', 'extensions']) {
    if (data[key] === undefined) continue;
    if (!Array.isArray(data[key])) return `"${key}" is not a list`;
    if (data[key].some((x) => !x || typeof x !== 'object' || Array.isArray(x))) return `an item of "${key}" is not an object`;
  }
  for (const e of data.entries ?? []) if (e.exposedModule !== undefined && typeof e.exposedModule !== 'string') return 'an entry\'s exposedModule is not a text';
  for (const x of data.extensions ?? []) {
    if (x.route !== undefined && typeof x.route !== 'string') return 'an extension\'s route is not a text';
    // Every extension of the templates names its domain; the survey reads it as text (a screen is a layout.screen one).
    if (typeof x.domain !== 'string') return `an extension's domain is not a text (${x.route ? `route ${JSON.stringify(x.route)}` : 'no route'})`;
    if (x.presentation !== undefined && (!x.presentation || typeof x.presentation !== 'object')) return 'an extension\'s presentation is not an object';
    if (x.presentation?.label !== undefined && typeof x.presentation.label !== 'string') return 'an extension\'s label is not a text';
    if (x.presentation?.order !== undefined && !Number.isFinite(x.presentation.order)) return 'an extension\'s order is not a number';
  }
  return null;
}

function readScreens(root) {
  const base = path.join(root, 'src-app/mfe_packages');
  const screens = [];
  const notShown = [];
  const packages = list(base)?.map((e) => e.name);
  if (!packages) return { screens, notShown, registry: null };
  const registered = registeredIds(root);
  for (const pkg of packages.sort()) {
    const manifest = path.join(base, pkg, 'mfe.json');
    if (!exists(manifest)) continue;
    const text = readRecord(manifest);
    if (text === null) continue;
    if (text.trim() === '') { skip(manifest, 'an empty file: its screens are not listed'); continue; }
    let data;
    try { data = JSON.parse(text); } catch (err) { skip(manifest, `not valid JSON (${err.message}): its screens are not listed`); continue; }
    const wrong = manifestShape(data);
    if (wrong) { skip(manifest, `${wrong}: its screens are not listed`); continue; }
    const entries = new Map((data.entries ?? []).map((e) => [e.id, e]));
    const src = path.join(base, pkg, 'src');
    for (const ext of data.extensions ?? []) {
      if (!ext.route || !ext.domain.includes('layout.screen')) continue;
      const label = ext.presentation?.label ?? UNRESOLVED;
      let reason = null;
      if (pkg.startsWith('_')) reason = 'a blank scaffold (its folder name starts with "_")';
      else if (data.templateExample === true) reason = 'a template example (templateExample: true in its mfe.json)';
      else if (registered && !registered.has(ext.id)) reason = 'not in public/generated-mfe-manifests.json';
      if (reason) { notShown.push({ package: pkg, route: ext.route, label, reason }); continue; }
      const module = entries.get(ext.entry)?.exposedModule?.replace(/^\.\//, '');
      const lifecycle = module && ['.tsx', '.ts'].map((x) => path.join(src, module + x)).find((f) => exists(f));
      const dirs = lifecycle ? [...new Set([...read(lifecycle).matchAll(/screens\/([\w-]+)/g)].map((m) => m[1]))] : [];
      const files = dirs.flatMap((d) => walk(path.join(src, 'screens', d), (f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f)));
      const css = dirs.flatMap((d) => walk(path.join(src, 'screens', d), (f) => /\.module\.css$/.test(f))).map((f) => rel(root, f));
      screens.push({
        package: pkg,
        route: ext.route,
        label,
        order: ext.presentation?.order ?? null,
        source: dirs.length ? dirs.map((d) => `src-app/mfe_packages/${pkg}/src/screens/${d}/`) : [UNRESOLVED],
        kitComponents: kitImports(files),
        css,
      });
    }
  }
  // UTF-16 code units, like every other sort of the file: the order must not change with the machine's locale.
  // A screen without an order sorts at 999, the shell's ORDER_WITHOUT_ONE (template-shell src-app/app/mfe/defaultScreen.ts).
  screens.sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || (a.route < b.route ? -1 : a.route > b.route ? 1 : 0));
  return { screens, notShown, registry: registered ? 'public/generated-mfe-manifests.json' : null };
}

/** Data services and mocks of the shell and of the shown screens' packages only. */
function readServices(root, shown) {
  const inShown = (f) => { const m = /^src-app\/mfe_packages\/([^/]+)\//.exec(rel(root, f)); return !m || shown.has(m[1]); };
  const files = walk(path.join(root, 'src-app'), (f) => /\/api\/[^/]+\.ts$/.test(f.split(path.sep).join('/')) && !/\.test\.ts$/.test(f) && inShown(f));
  const services = [];
  for (const file of files) {
    const classes = [...read(file).matchAll(/export\s+class\s+(\w+ApiService)\b/g)].map((m) => m[1]);
    for (const name of classes) services.push({ name, file: rel(root, file) });
  }
  const mocks = files.filter((f) => /mocks\.ts$/.test(f)).map((f) => rel(root, f));
  return { services, mocks };
}

function readDesignFiles(root) {
  // The project root itself is listed with readdirSync: a root the survey cannot list is an input error (exit 2).
  const found = readdirSync(root).filter((n) => {
    if (!/^DESIGN.*\.md$/i.test(n)) return false;
    const real = contained(path.join(root, n));
    if (real === null) return false;
    const stat = statSync(real);
    if (multiLinked(stat)) { skip(path.join(root, n), HARD_LINK); return false; }
    if (stat.isFile()) return true;
    skip(path.join(root, n), 'not a regular file');
    return false;
  }).sort();
  for (const f of walk(path.join(root, '.frontx'), (file) => /design-contract[\w.-]*\.(json|md)$/i.test(file))) {
    // walk() lists only regular files, follows no link and opens only folders list() checked, so this cannot skip anything today;
    // it stays so a later change to walk() cannot let a file out of the project through.
    const real = contained(f);
    if (real === null) continue;
    if (multiLinked(statSync(real))) { skip(f, HARD_LINK); continue; }
    const r = rel(root, f);
    if (!r.startsWith('.frontx/ai/')) found.push(r);
  }
  return found;
}

/** The value of a role: the first matching rule (by selector preference) that sets one of its properties. */
function pickRule(rules, role) {
  const fits = (rule) => (role.at === 'phone' ? rule.media === null : rule.media === null || (typeof rule.media === 'number' && rule.media <= SCREEN_WIDTH));
  for (const pattern of role.sel) {
    for (const prop of role.prop) {
      const hits = rules.filter((r) => fits(r) && pattern.test(r.selector) && r.decls.has(prop) && !/:hover|:focus/.test(r.selector));
      if (!hits.length) continue;
      // Desktop: the widest min-width rule wins over the base rule of the same file and selector.
      const first = hits[0];
      const same = hits.filter((r) => r.file === first.file && r.selector === first.selector);
      const rule = role.at === 'phone' ? same[0] : same.reduce((a, b) => ((b.media ?? 0) >= (a.media ?? 0) ? b : a));
      return { rule, prop };
    }
  }
  return null;
}

const describe = (hit) => `${hit.rule.file} ${hit.rule.selector.split(/\s*,\s*/)[0]}${hit.rule.media ? ` (from ${hit.rule.media} px)` : ''} ${hit.prop}`;

function readChrome(root, lookup) {
  const layoutDir = path.join(root, 'src-app/app/layout');
  const layout = path.join(layoutDir, 'Layout.tsx');
  const chrome = { nav: UNRESOLVED, links: null, active: UNRESOLVED, phone: UNRESOLVED, mark: 'logo', initials: null, sources: {} };
  const tsx = ['Layout.tsx', 'Header.tsx', 'Menu.tsx', 'Sidebar.tsx'].map((n) => path.join(layoutDir, n)).filter((f) => exists(f));
  const code = tsx.map((f) => stripComments(read(f))).join('\n');
  if (exists(layout)) {
    const text = stripComments(read(layout));
    // The side menu is <Menu />: the stock shell's <Sidebar /> is the right-hand panel and renders with or without it.
    if (/<Menu\b/.test(text)) chrome.nav = 'side';
    else if (/<Header\b/.test(text)) chrome.nav = 'top';
    chrome.sources.nav = rel(root, layout);
  }
  const shellCss = walk(layoutDir, (f) => /(Header|Menu|Sidebar|Nav\w*)\.module\.css$/.test(f));
  const rules = shellCss.flatMap((f) => cssRules(f, rel(root, f)));
  // How the active link is marked.
  const activeRules = rules.filter((r) => /active|aria-current|selected/i.test(r.selector) && !/:hover|:focus/.test(r.selector));
  const isLine = (r) => (/::?(after|before)/.test(r.selector) && (toPx(r.decls.get('height')) ?? 99) <= 4 && /background/.test([...r.decls.keys()].join(' ')))
    || r.decls.has('border-bottom') || r.decls.has('border-bottom-width') || /underline/.test(r.decls.get('text-decoration') ?? '') || /inset\s+0\s+-/.test(r.decls.get('box-shadow') ?? '');
  const line = activeRules.find(isLine);
  const fill = activeRules.find((r) => !/::?(after|before)/.test(r.selector) && (r.decls.has('background-color') || r.decls.has('background')));
  if (line) { chrome.active = 'underline'; chrome.sources.active = `${line.file} ${line.selector}`; }
  else if (fill) {
    const bg = resolveVars(fill.decls.get('background-color') ?? fill.decls.get('background'), lookup);
    chrome.active = bg && bg === resolveVars('var(--primary)', lookup) ? 'filled' : 'pill';
    chrome.sources.active = `${fill.file} ${fill.selector}`;
  } else if (chrome.nav === 'side' && lookup('--left-menu-selected') !== null) {
    chrome.active = 'filled';
    chrome.sources.active = 'the shell side menu fills the active link with --left-menu-selected';
  } else if (activeRules.length || chrome.nav === 'top') chrome.active = UNRESOLVED;
  // Where the header links sit.
  if (chrome.nav === 'top') {
    const bar = rules.filter((r) => /\.(bar|header|topbar|toolbar)\b/.test(r.selector));
    const between = bar.find((r) => /space-between/.test(r.decls.get('justify-content') ?? ''));
    const pushed = rules.find((r) => /\.(nav|navRow|links|list)\b/.test(r.selector) && /auto/.test(r.decls.get('margin-left') ?? r.decls.get('margin-inline-start') ?? ''));
    if (between || pushed) { chrome.links = 'end'; chrome.sources.links = `${(between ?? pushed).file} ${(between ?? pushed).selector}`; }
    else if (bar.length) { chrome.links = 'after-brand'; chrome.sources.links = `${bar[0].file} ${bar[0].selector}`; }
    else chrome.links = UNRESOLVED;
  }
  // The phone header.
  const button = /<\s*(Burger|Hamburger|MenuButton|MenuToggle|NavToggle|SidebarTrigger|DrawerTrigger)\b|aria-label=\{?['"](open |toggle )?(the )?(menu|navigation)['"]/i.exec(code);
  if (button) { chrome.phone = 'menu-button'; chrome.sources.phone = `a menu button in src-app/app/layout (${button[0].trim()})`; }
  else if (chrome.nav === 'top') {
    const column = rules.find((r) => r.media === null && /\.(bar|header)\b/.test(r.selector) && r.decls.get('flex-direction') === 'column');
    if (column) { chrome.phone = 'rows'; chrome.sources.phone = `${column.file} ${column.selector} flex-direction: column, no menu button`; }
  } else if (chrome.nav === 'side') { chrome.phone = 'menu-button'; chrome.sources.phone = 'the shell folds the side menu into a menu button on a phone'; }
  // The app's mark.
  const brand = readBrandMark(root, tsx);
  chrome.mark = brand.kind;
  chrome.sources.mark = brand.why;
  return { chrome, rules, shellCss: shellCss.map((f) => rel(root, f)), brand, menuRules: menuOwnRules(root, layoutDir, shellCss) };
}

/**
 * The rules of the menu's own CSS: the CSS Modules imported by the files Menu.tsx imports from the app (the stock
 * shell's components/ui/sidebar.tsx and its sidebar.module.css), one level, each read through read(). Only the
 * logo's colour is taken from them.
 */
function menuOwnRules(root, layoutDir, shellCss) {
  const menu = path.join(layoutDir, 'Menu.tsx');
  if (!exists(menu)) return [];
  // Each file once, by resolved path: a file imported many times is read, stripped and scanned once.
  const specs = (file, code) => new Set([...code.matchAll(/\bimport\s/g)]
    .map((m) => /^([^'";]*?)\bfrom\s*['"]([^'"\n]+)['"]/.exec(code.slice(m.index + 7, m.index + 7 + IMPORT_SPAN))?.[2])
    .filter(Boolean).map((spec) => resolveImport(root, file, spec)).filter(Boolean));
  const css = new Set();
  for (const file of specs(menu, stripComments(read(menu)))) {
    if (!CODE_EXT.some((x) => file.endsWith(x))) continue;
    for (const f of specs(file, stripComments(read(file)))) if (/\.module\.css$/.test(f) && !shellCss.includes(f)) css.add(f);
  }
  return [...css].sort().flatMap((f) => cssRules(f, rel(root, f)));
}

const RASTER = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
const CODE_EXT = ['.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts'];

/** A module specifier as a file: relative to the importing file, "@/" from src-app, "/" from public; null for a package. */
function resolveImport(root, from, spec) {
  let base;
  if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec);
  else if (spec.startsWith('@/')) base = path.join(root, 'src-app', spec.slice(2));
  else if (spec.startsWith('/')) base = path.join(root, 'public', spec.slice(1));
  else return null;
  const plain = base.replace(/\?\w+$/, '');
  if (existsSync(plain) && statSync(plain).isFile()) return plain;
  return CODE_EXT.map((x) => plain + x).find((f) => existsSync(f)) ?? null;
}

/**
 * The module specifier each name of a file's imports comes from, the first import of a name winning: the default
 * import and every word of the brace list. Each import statement is read on its own, up to IMPORT_SPAN characters, and
 * no pattern is built from a name, so a name with a $ is read as written.
 */
function importTable(code) {
  const table = new Map();
  for (const m of code.matchAll(/\bimport\s/g)) {
    const span = code.slice(m.index + 7, m.index + 7 + IMPORT_SPAN);
    const from = /^([^'";]*?)\bfrom\s*['"]([^'"\n]+)['"]/.exec(span);
    if (!from) continue;
    const clause = from[1].trim();
    const brace = clause.indexOf('{');
    const head = (brace === -1 ? clause : clause.slice(0, brace)).replace(/,\s*$/, '').trim();
    const list = brace === -1 ? '' : clause.slice(brace + 1, clause.lastIndexOf('}'));
    for (const name of [head, ...(list.match(/[A-Za-z_$][\w$]*/g) ?? [])]) if (name && !table.has(name)) table.set(name, from[2]);
  }
  return table;
}

/** The file a name is imported from (null for a package) with its specifier, or null when the file does not import it. */
function importOf(root, file, code, name) {
  const spec = importTable(code).get(name);
  return spec === undefined ? null : { spec, file: resolveImport(root, file, spec) };
}
const IMPORT_SPAN = 2000;

/** The first bytes each raster type starts with. */
const MAGIC = {
  png: (b) => b.length > 8 && b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG',
  jpg: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  gif: (b) => b.toString('latin1', 0, 4) === 'GIF8',
  webp: (b) => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP',
};
MAGIC.jpeg = MAGIC.jpg;
const SVG_ROOT = /^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<!doctype[^>]*>\s*)?<svg\b/i;

/** The most files one logo is followed through: the first file and the imports after it. */
const LOGO_HOPS = 8;

/**
 * A mark from a file: an SVG file or a component with an <svg>, cleaned; a raster file under the cap. Only a regular
 * file inside the project. seen holds the real paths this resolution has visited: a file met again (an import loop) or
 * a chain longer than LOGO_HOPS gives the accent square.
 */
function markFromFile(root, file, via, seen = new Set()) {
  const ext = path.extname(file).slice(1).toLowerCase();
  const where = `${rel(root, file)}${via ? ` (${via})` : ''}`;
  const square = (why) => ({ kind: 'logo', why: `the logo ${where} ${why}: drawn as the accent square` });
  let real;
  try { real = realpathSync(file); } catch { return square('cannot be read'); }
  const base = realpathSync(root);
  if (real !== base && !real.startsWith(base + path.sep)) return square('is a link to a file outside the project');
  if (seen.has(real)) return square('is imported again in a loop of imports');
  if (seen.size >= LOGO_HOPS) return square(`is reached through more than ${LOGO_HOPS} files`);
  seen.add(real);
  const stat = statSync(real);
  if (!stat.isFile()) return square('is not a regular file');
  if (multiLinked(stat)) return square(`is ${HARD_LINK}`);
  const load = (encoding) => { try { return readFileSync(real, encoding); } catch (err) { return { failed: err.code ?? err.message }; } };
  if (RASTER[ext]) {
    if (stat.size > RASTER_CAP) return square(`is a ${stat.size} byte image, over the ${RASTER_CAP} byte cap for an embedded image`);
    const bytes = load();
    if (bytes.failed) return square(`cannot be read (${bytes.failed})`);
    if (!MAGIC[ext](bytes)) return square(`is not a ${ext} image: its first bytes say otherwise`);
    return { kind: 'raster', file: rel(root, file), src: `data:${RASTER[ext]};base64,${bytes.toString('base64')}`, why: `the logo ${where}, a ${bytes.length} byte image embedded as a data URI` };
  }
  if (stat.size > TEXT_CAP) return square(`is ${stat.size} bytes, over the ${TEXT_CAP} byte cap`);
  const text = load('utf8');
  if (text.failed) return square(`cannot be read (${text.failed})`);
  if (ext === 'svg' && !SVG_ROOT.test(text)) return square('is named .svg but does not start with an <svg> element');
  if (!/<svg\b/i.test(text)) {
    // A component that renders an imported image or SVG file.
    const img = /<img\b[^<>]*\bsrc=\{(\w+)\}/.exec(text);
    const target = img && importOf(root, file, text, img[1]);
    if (target?.file && !CODE_EXT.some((x) => target.file.endsWith(x))) return markFromFile(root, target.file, `imported by ${rel(root, file)}`, seen);
    return { kind: 'logo', why: `the logo ${where} holds no <svg> and no image file the survey can read: drawn as the accent square` };
  }
  const clean = sanitizeSvg(text);
  if (clean.error) return { kind: 'logo', why: `the logo ${where} cannot be inlined (${clean.error}): drawn as the accent square` };
  return { kind: 'svg', file: rel(root, file), svg: clean.svg, removed: clean.removed, why: `the logo ${where}, its SVG inlined${clean.removed.length ? ` without ${clean.removed.join(', ')}` : ''}` };
}

/** The shell's brand mark: { kind: svg | raster | logo | initials, why, svg?, src?, file? }. */
function readBrandMark(root, files) {
  for (const file of files) {
    const code = stripComments(read(file));
    const name = /<\s*([A-Z]\w{0,60}(?:Logo|Mark)\w{0,60}|[A-Z]\w{0,60}Brand\w{0,60}Icon)\b/.exec(code)?.[1];
    if (name) {
      const target = importOf(root, file, code, name);
      if (!target) return { kind: 'logo', why: `a logo in ${rel(root, file)} (${name}) whose import the survey cannot find: drawn as the accent square` };
      if (!target.file) return { kind: 'logo', why: `a logo in ${rel(root, file)} (${name}) from ${target.spec}, outside the app: drawn as the accent square` };
      return markFromFile(root, target.file, `${name}, imported by ${rel(root, file)}`);
    }
    const img = /<img\b[^<>]*\bsrc=(?:\{(\w+)\}|"([^"]+)")/.exec(code);
    if (img) {
      const target = img[1] ? importOf(root, file, code, img[1]) : { spec: img[2], file: resolveImport(root, file, img[2]) };
      if (!target?.file) return { kind: 'logo', why: `an image in ${rel(root, file)} the survey cannot find (${img[1] ?? img[2]}): drawn as the accent square` };
      return markFromFile(root, target.file, `the image in ${rel(root, file)}`);
    }
    const svgAt = code.search(/<svg\b/);
    const svgEnd = svgAt === -1 ? -1 : code.indexOf('</svg>', svgAt);
    if (svgEnd !== -1 && /brand|logo|mark/i.test(code.slice(Math.max(0, svgAt - 300), svgAt + 200))) {
      const clean = sanitizeSvg(code.slice(svgAt, svgEnd + 6));
      if (clean.error) return { kind: 'logo', why: `an inline logo in ${rel(root, file)} cannot be inlined (${clean.error}): drawn as the accent square` };
      return { kind: 'svg', file: rel(root, file), svg: clean.svg, removed: clean.removed, why: `the inline logo in ${rel(root, file)}, its SVG inlined${clean.removed.length ? ` without ${clean.removed.join(', ')}` : ''}` };
    }
  }
  return { kind: 'initials', why: 'no logo in src-app/app/layout: drawn as initials' };
}

/**
 * The box-sizing the app gives every element: a top level rule for * in a
 * global stylesheet (a .css file in src-app/app or src-app that is not a CSS
 * Module), as the templates' globals.css has; null when there is none.
 */
function globalBox(root) {
  let box = null;
  for (const dir of ['src-app', 'src-app/app']) {
    const folder = path.join(root, dir);
    const names = list(folder)?.map((e) => e.name);
    if (!names) continue;
    for (const name of names.sort()) {
      if (!/\.css$/.test(name) || /\.module\.css$/.test(name)) continue;
      for (const r of cssRules(path.join(folder, name), `${dir}/${name}`)) {
        if (r.media === null && r.decls.has('box-sizing') && r.selector.split(',').some((x) => x.trim() === '*')) box = r.decls.get('box-sizing');
      }
    }
  }
  return box;
}

function readLook(root, screens, chromeOf) {
  const theme = readActiveTheme(root);
  const kitDir = findKitDir(root);
  const kit = kitDir ? parseKitCss(path.join(kitDir, 'theme.css')) : { root: new Map(), light: new Map(), dark: new Map() };
  const appearance = theme?.appearance ?? 'light';
  const scope = new Map([...kit.root, ...kit[appearance]]);
  const kitRules = kitDir && existsSync(path.join(kitDir, 'chunks')) ? walk(path.join(kitDir, 'chunks'), (f) => /\.css$/.test(f), [], true).flatMap((f) => cssRules(f, rel(root, f), true)) : [];
  // Page CSS: the CSS Modules of the shown screens, in menu order.
  const pageCss = [...new Set(screens.flatMap((s) => s.css))];
  const pageRules = pageCss.flatMap((f) => cssRules(path.join(root, f), f));
  // The kit token bridge: kit tokens a screen root re-declares for the kit components inside it.
  const bridge = new Map();
  for (const r of pageRules) {
    if (r.media !== null || !PAGE_ROOT.test(r.selector)) continue;
    for (const [name, value] of r.decls) if (name.startsWith('--') && !bridge.has(name)) bridge.set(name, { value, file: r.file, root: PAGE_ROOT.exec(r.selector)[0] });
  }
  // A name the theme builds in code is unknown: a lookup gives null for it, never the kit's value.
  const appLookup = (name) => bridge.get(name)?.value ?? (theme?.unread.has(name) ? null : theme?.variables.get(name) ?? scope.get(name) ?? null);
  /**
   * One resolution of a value that keeps its own reason: through the screens' kit token bridge (unless bridged is
   * false), then the theme, then the kit. A name the theme builds in code, and for a colour any name the theme or kit
   * would answer while a theme spread cannot be followed, makes this resolution, and only this one, unresolved with
   * that reason; a value the app's own CSS gives without the theme or kit stands.
   */
  const resolveIn = (raw, { colour = false, bridged = true } = {}) => {
    let why = null;
    const value = resolveVars(raw, (name) => {
      if (bridged && bridge.has(name)) return bridge.get(name).value;
      const built = theme?.unread.get(name);
      if (built || (colour && theme?.blocked)) { why ??= built ?? theme.blocked; return null; }
      return theme?.variables.get(name) ?? scope.get(name) ?? null;
    });
    return why ? { value: null, why } : { value, why: null };
  };
  /** The reason a colour read from a rule is unresolved, after its source. */
  const because = (source, why) => (why ? `${source}: ${why}` : source);
  const whereToken = (name) => (bridge.has(name) ? `${bridge.get(name).file} ${bridge.get(name).root} ${name}` : theme?.variables.has(name) ? `${theme.from.get(name)} ${name}` : scope.has(name) ? `kit theme.css ${name}` : null);
  const { chrome, rules: shellRules, shellCss, brand, menuRules } = chromeOf(appLookup);

  const look = {};
  const sources = {};
  const real = {};
  const disagree = [];
  const unresolved = [];
  const dropped = [];
  const set = (key, value, source, kitValue, realValue) => {
    if (value !== UNRESOLVED && !lookValueFits(key, value)) {
      // A kit value that does not fit is never written, not even here: a kit style file may be a hard link to any file.
      const shown = source.startsWith('kit ') ? KIT_HIDDEN : String(value).slice(0, 120);
      dropped.push({ key: `look.${key}`, value: shown, source, why: `not a ${LOOK_KINDS[key] ?? 'value'} the drawing can take` });
      unresolved.push(`look.${key}`);
      return;
    }
    look[key] = value;
    sources[key] = source;
    if (realValue !== undefined && realValue !== value) real[key] = realValue;
    // The kit side is written only when it fits the kind of the key, as the app side does.
    if (kitValue !== undefined && kitValue !== null && value !== UNRESOLVED && kitValue !== value && lookValueFits(key, kitValue)) disagree.push({ key, kit: kitValue, app: value, source });
    if (value === UNRESOLVED) unresolved.push(`look.${key}`);
  };
  const sized = (value, at) => {
    const px = toPx(value);
    if (px === null) return null;
    return `${at === 'phone' ? Math.round(px) : scalePx(px)}px`;
  };

  // Colours and the font: the app's own page surface first, then kit tokens through the bridge, the theme and the kit.
  for (const [key, tokens] of Object.entries(LOOK_TOKENS)) {
    let value = null;
    let source = null;
    let kitValue = null;
    let why = null;
    // A theme spread the survey cannot follow may set any colour: only a value the screens give without the theme stands.
    const colour = key !== 'font';
    for (const token of tokens) {
      ({ value, why } = resolveIn(`var(${token})`, { colour }));
      kitValue = resolveIn(`var(${token})`, { bridged: false }).value;
      // A token the theme builds in code is unknown: the next token in the list does not stand for it.
      if (why) break;
      if (value) { source = whereToken(token); break; }
    }
    if (key === 'bg') {
      // What the page really shows, with the kind of its source: a shown screen's own background, else the shell's page
      // background behind the screen, else the active theme's --background (the token loop above).
      const paints = (r) => r.media === null && (r.decls.has('background-color') || r.decls.has('background'));
      const page = pageRules.find((r) => paints(r) && PAGE_ROOT.test(r.selector));
      const shell = page ? null : SHELL_PAGE.flatMap(([f, sel]) => (exists(path.join(root, f)) ? cssRules(path.join(root, f), f) : [])
        .filter((r) => sel.test(r.selector))).find(paints);
      const hit = page ?? shell;
      if (hit) {
        const prop = hit.decls.has('background-color') ? 'background-color' : 'background';
        const at = `${hit.file} ${hit.selector} ${prop} (${page ? 'screen' : 'shell'})`;
        // The screen's own kit tokens reach its own background only; the shell's element is outside the screen.
        const got = resolveIn(hit.decls.get(prop), { colour, bridged: Boolean(page) });
        if (!got.value) { set(key, UNRESOLVED, because(at, got.why ?? 'a value the survey cannot resolve')); continue; }
        if (shell && !shellCss.includes(shell.file)) shellCss.push(shell.file);
        value = got.value; source = at; why = null;
      } else if (source) source = `${source} (theme)`;
    }
    set(key, value ?? UNRESOLVED, why ?? source ?? 'none', kitValue);
  }

  const role = (key, spec, rules) => {
    const hit = pickRule(rules, spec);
    const colour = LOOK_KINDS[key] === 'colour';
    const kit = spec.kit ? resolveIn(`var(${spec.kit})`, { colour, bridged: false }) : { value: null, why: null };
    const kitRaw = kit.value;
    const asRaw = (v) => (toPx(v) !== null ? `${toPx(v)}px` : v);
    const realPx = (v) => (toPx(v) !== null ? `${Math.round(toPx(v))}px` : v);
    const kitValue = kitRaw === null ? null : spec.raw ? asRaw(kitRaw) : sized(kitRaw, spec.at);
    if (hit) {
      const got = resolveIn(hit.rule.decls.get(hit.prop), { colour });
      let raw = got.value;
      if (raw !== null && spec.side) raw = side(raw, spec.side);
      if (raw !== null && spec.content) {
        const pad = pickRule(rules, { ...spec, prop: ['padding-inline', 'padding'], side: 'x' });
        const padPx = pad ? toPx(side(resolveVars(pad.rule.decls.get(pad.prop), appLookup) ?? '', 'x')) : 0;
        // The column's own box-sizing wins; else the app's global reset; else the browser's content-box.
        const own = hit.rule.decls.get('box-sizing') ?? pad?.rule.decls.get('box-sizing');
        const box = (own ?? globalBox(root)) === 'border-box';
        const maxPx = toPx(raw);
        raw = maxPx === null ? null : `${box ? maxPx - 2 * (padPx ?? 0) : maxPx}px`;
      }
      if (raw === null) { set(key, UNRESOLVED, `${describe(hit)}: ${got.why ?? 'a value the survey cannot resolve'}`); return; }
      const value = spec.raw ? asRaw(raw) : sized(raw, spec.at);
      if (value === null) { set(key, UNRESOLVED, `${describe(hit)}: ${raw} is not a length`); return; }
      set(key, value, describe(hit), kitValue, spec.raw ? undefined : realPx(raw));
      return;
    }
    if (SCAFFOLD_ROLES.has(key) && pageCss.length) {
      set(key, UNRESOLVED, `no page title rule (.pageTitle, .pageHeading, h1, .heroTitle, .title) sets ${spec.prop.join(' or ')}${spec.at === 'phone' ? ' outside @media' : ''} in ${pageCss.join(', ')}`);
      return;
    }
    if (kit.why) { set(key, UNRESOLVED, kit.why); return; }
    if (kitValue !== null) { set(key, kitValue, `kit ${spec.kit} (the app sets none)`, undefined, spec.raw ? undefined : realPx(kitRaw)); return; }
    if (key === 'th-case') {
      const head = kitRules.find((r) => /_?tableHead/i.test(r.selector) && r.decls.has('text-transform'));
      // The kit selector is matched, never written: the source names the file and the property.
      if (head) set(key, head.decls.get('text-transform'), `kit ${head.file} table head text-transform (the app sets none)`);
    }
  };
  for (const [key, spec] of Object.entries(PAGE_ROLES)) role(key, spec, pageRules);
  if (chrome.nav === 'top') {
    for (const [key, spec] of Object.entries(SHELL_ROLES)) {
      if (key.endsWith('-phone') && chrome.phone !== 'rows' && key === 'navrow-h-phone') continue;
      role(key, spec, shellRules);
    }
    const link = shellRules.find((r) => /\.(link|navLink)\b/.test(r.selector) && r.media === null && !/active|:hover|:focus/.test(r.selector) && r.decls.has('color'));
    const ruleColour = (key, rule) => { const got = resolveIn(rule.decls.get('color'), { colour: true }); set(key, got.value ?? UNRESOLVED, because(`${rule.file} ${rule.selector} color`, got.why)); };
    if (link) ruleColour('toplink', link);
    const active = shellRules.find((r) => /active|aria-current/.test(r.selector) && !/::?(after|before)|:hover|:focus/.test(r.selector) && r.decls.has('color'));
    if (active) ruleColour('toplink-active', active);
  }
  // Per screen: its own heading when it differs from the shared one, its section heading and its bands.
  const measure = (spec, rules) => {
    const hit = pickRule(rules, spec);
    if (!hit) return null;
    let raw = resolveVars(hit.rule.decls.get(hit.prop), appLookup);
    if (raw === null) return null;
    if (spec.raw) return { value: toPx(raw) !== null ? `${toPx(raw)}px` : raw, source: describe(hit) };
    const px = toPx(raw);
    if (px === null) return null;
    return { value: sized(raw, spec.at), real: `${Math.round(px)}px`, source: describe(hit) };
  };
  const screenLooks = [];
  for (const s of screens) {
    const rules = s.css.flatMap((f) => cssRules(path.join(root, f), f));
    const entry = { route: s.route, label: s.label };
    const size = measure(PAGE_ROLES.h1, rules);
    const weight = measure(PAGE_ROLES['h1-weight'], rules);
    const phone = measure(PAGE_ROLES['h1-phone'], rules);
    const fitWeight = weight && FITS.weight(weight.value) ? weight.value : null;
    if (size && ((size.real ?? size.value) !== (real.h1 ?? look.h1) || (fitWeight && fitWeight !== look['h1-weight']))) {
      entry.heading = { size: size.value, real: size.real, phone: phone?.value ?? null, weight: fitWeight, source: size.source };
    }
    const section = measure(SECTION_ROLE, rules);
    if (section) entry.section = { size: section.value, real: section.real, phone: measure({ ...SECTION_ROLE, at: 'phone' }, rules)?.value ?? null, source: section.source };
    const bands = [];
    for (const r of rules) {
      if (r.media !== null || !BAND.test(r.selector) || NOT_BAND.test(r.selector.replace(BAND, '')) || /:hover|:focus/.test(r.selector)) continue;
      const prop = r.decls.has('background-color') ? 'background-color' : r.decls.has('background') ? 'background' : null;
      if (!prop || !r.decls.has('color')) continue;
      const name = r.selector.split(/\s*,\s*/)[0];
      const source = `${r.file} ${name} ${prop} and color`;
      const [bgIn, textIn] = [resolveIn(r.decls.get(prop), { colour: true }), resolveIn(r.decls.get('color'), { colour: true })];
      // A band coloured through the theme or kit while the theme refuses it is kept, unresolved, with the reason.
      if (bgIn.why || textIn.why) { bands.push({ name, bg: bgIn.value ?? UNRESOLVED, text: textIn.value ?? UNRESOLVED, source, bgWhy: bgIn.why, textWhy: textIn.why }); continue; }
      const [bg, text] = [bgIn.value, textIn.value];
      if (!bg || !text || /transparent|none|url\(/i.test(bg) || bg === look.bg) continue;
      if (!FITS.colour(bg) || !FITS.colour(text)) {
        dropped.push({ key: `screenLooks.${s.label}.band`, value: `${bg} / ${text}`.slice(0, 120), source: `${r.file} ${r.selector.split(/\s*,\s*/)[0]}`, why: 'not a colour the drawing can take' });
        continue;
      }
      bands.push({ name, bg, text, source });
    }
    if (bands.length) entry.bands = bands;
    screenLooks.push(entry);
  }
  const banded = screenLooks.find((e) => e.bands);
  if (banded) {
    const [first, second] = banded.bands;
    const band = (b, bgKey, textKey) => {
      set(bgKey, b.bg, because(b.source.replace(/ and color$/, ''), b.bgWhy));
      set(textKey, b.text, because(b.source.replace(/background(-color)? and /, ''), b.textWhy));
    };
    band(first, 'band-bg', 'band-text');
    if (second) band(second, 'band-alt-bg', 'band-alt-text');
    const own = banded.heading;
    if (own) {
      set('band-title', own.size, `${own.source} (the ${banded.label} screen's own heading)`, undefined, own.real);
      if (own.phone) set('band-title-phone', own.phone, `${own.source.replace(/ \(from \d+ px\)/, '')} (phone)`);
      if (own.weight) set('band-title-weight', own.weight, own.source.replace(/font-size$/, 'font-weight'));
    }
  }
  const sectioned = screenLooks.find((e) => e.section);
  if (sectioned) {
    set('section', sectioned.section.size, sectioned.section.source, undefined, sectioned.section.real);
    if (sectioned.section.phone) set('section-phone', sectioned.section.phone, `${sectioned.section.source.replace(/ \(from \d+ px\)/, '')} (phone)`);
  }
  // An inlined SVG mark draws in currentColor: the colour the shell gives the mark, else the accent.
  if (brand.kind === 'svg') {
    // The mark's own rule in the shell's CSS, else the colour the menu's own CSS gives the logo, the header it sits in or
    // the menu panel it inherits from (the stock shell's .sidebar).
    const plain = (r) => r.media === null && !/:hover|:focus|\[|::?(after|before)/.test(r.selector) && r.decls.has('color');
    const markRule = shellRules.find((r) => /\.(mark|logo)(?![\w-])/.test(r.selector) && r.media === null && !/:hover|:focus/.test(r.selector) && r.decls.has('color'))
      ?? [/\.(mark|logo)(?![\w-])/, /\.(brand|header|headerRow)(?![\w-])/, /\.(sidebar|menu|nav)(?![\w-])/].map((p) => menuRules.find((r) => plain(r) && p.test(r.selector))).find(Boolean);
    const got = markRule ? resolveIn(markRule.decls.get('color'), { colour: true }) : { value: null, why: null };
    if (got.value || got.why) set('mark-color', got.value ?? UNRESOLVED, because(`${markRule.file} ${markRule.selector} color`, got.why));
    else set('mark-color', look.accent, 'the accent (the shell gives the mark no colour of its own)');
  }
  return {
    look, sources, real, disagree, unresolved, dropped, chrome, shellCss, pageCss, brand, screenLooks,
    lookSources: {
      theme: theme ? theme.file : UNRESOLVED,
      themeId: theme ? theme.id : UNRESOLVED,
      appearance,
      kitCss: kitDir ? rel(root, path.join(kitDir, 'theme.css')) : UNRESOLVED,
    },
  };
}

/**
 * The address each screen's links carry as the app renders them: the shell's
 * menu builds its links from a template around the route (`/?screen=${route}`)
 * in an href or to prop or key (href= or href:) or a navigation call (LINK_BUILT), or as
 * what a small helper returns whose one parameter is the route and whose name
 * says it makes an address (LINK_HELPER: hrefFor, linkTo, pathOf); other templates
 * are not links, and two that disagree leave every link unresolved,
 * and a screen may carry literal links (an href or a *HREF constant). When no
 * template is read but the layout builds an href or to prop from code, or an
 * object key href: or to: from a call or a template with an expression
 * (LINK_UNREAD), the link form is not detected and every link is unresolved:
 * the person checks the menu code by hand. The same holds when a template is
 * read but the layout also builds an href or to from a call to a function that
 * is not a helper a template was read from (LINK_CALL): the readable helper
 * does not stand for that link. A layout that builds no link from code
 * gets the address the shell's router writes for a mounted screen,
 * /?screen=<route without the leading slash>. Each
 * screen gets its link and where it was read; mismatch says the registered
 * route is not what a shared link carries.
 */
const LINK_BUILT = /(?:\b(?:href|to)\s*[=:]\s*\{?|\b(?:navigate|push|assign|open|redirect)\(|\blocation(?:\.href)?\s*=)\s*$/;
const LINK_HELPER = /(?:\b(?:const|let|var)\s+(\w*(?:href|link|url|path)\w*)\s*=\s*\(\s*route\b[^()]*\)\s*(?::[^=;{}()]*)?=>|\bfunction\s+(\w*(?:href|link|url|path)\w*)\s*\(\s*route\b[^()]*\)[^{}]*\{\s*return)\s*\(?\s*(?:route\b[^?;]{0,40}\?\s*)?$/i;
const LINK_UNREAD = /\b(?:href|to)\s*=\s*\{(?!\s*['"])|\b(?:href|to)\s*:\s*(?:[A-Za-z_$][\w$.]*\s*\(|`[^`$]{0,200}\$\{)/;
const LINK_CALL = /\b(?:href|to)\s*[=:]\s*\{?\s*([A-Za-z_$][\w$.]*)\s*\(/g;

function readLinks(root, screens) {
  const layoutDir = path.join(root, 'src-app/app/layout');
  const files = walk(layoutDir, (f) => /\.(tsx|ts|jsx|js)$/.test(f) && !/\.test\./.test(f));
  // A template counts only where a link is built from it: an href or to prop (or a const of that name), a navigation call, or a link helper.
  const candidates = [];
  const unread = [];
  const calls = [];
  for (const file of files) {
    // Raw text: the template may hold a regular expression with // in it (`.replace(/^\//, '')`).
    const text = withoutBlocks(read(file), '/*', '*/');
    for (const m of text.matchAll(/`([^`$]*)\$\{\s*route((?:\.replace\([^)]*\))?)\s*\}([^`]*)`/g)) {
      // Both tests look at a short window before the template, so the read stays linear in the file's size.
      const before = text.slice(Math.max(0, m.index - 120), m.index);
      const built = LINK_BUILT.test(before.slice(-80));
      const helper = built ? null : LINK_HELPER.exec(before);
      if (!built && !helper) continue;
      candidates.push({ prefix: m[1], strip: /\^\\?\//.test(m[2]), suffix: m[3], file: rel(root, file), template: m[0], helper: helper?.[1] ?? helper?.[2] ?? null });
    }
    if (LINK_UNREAD.test(text)) unread.push(rel(root, file));
    for (const c of text.matchAll(LINK_CALL)) calls.push({ name: c[1], file: rel(root, file) });
  }
  const shapes = new Set(candidates.map((c) => JSON.stringify([c.prefix, c.strip, c.suffix])));
  const rule = shapes.size === 1 ? candidates[0] : null;
  const disagree = shapes.size > 1;
  // A link built by a call to anything but a helper a template was read from is a link form the survey does not read.
  const helpers = new Set(candidates.map((c) => c.helper).filter(Boolean));
  const foreign = rule ? [...new Set(calls.filter((c) => !helpers.has(c.name)).map((c) => c.file))] : [];
  if (foreign.length > 0) unread.splice(0, unread.length, ...foreign);
  const notDetected = !disagree && (rule ? foreign.length > 0 : unread.length > 0);
  const inCode = [];
  const base = path.join(root, 'src-app/mfe_packages');
  for (const pkg of [...new Set(screens.map((x) => x.package))]) {
    for (const file of walk(path.join(base, pkg, 'src'), (f) => /\.(tsx|ts)$/.test(f) && !/\.test\./.test(f))) {
      for (const m of stripComments(read(file)).matchAll(/(?:\b\w{0,60}HREF\w{0,60}\s*=\s*|\bhref=\{?\s*)['"](\/[^'"\s]*)['"]/g)) inCode.push({ href: m[1], file: rel(root, file) });
    }
  }
  const out = screens.map((x) => {
    if (disagree) return { route: x.route, label: x.label, link: UNRESOLVED, source: `the shell builds links from ${candidates.length} templates that disagree: ${candidates.map((c) => `${c.file} ${c.template}`).join('; ')}` };
    if (notDetected) return { route: x.route, label: x.label, link: UNRESOLVED, source: `link form not detected, check the menu code by hand: ${unread.join(', ')} ${unread.length > 1 ? 'build links' : 'builds a link'} from code the survey does not read` };
    // Without a template the menu mounts the screen in code (the stock shell dispatches mount_ext) and the shell's
    // router, from @gears-frontx/routing, writes the mount into the address as ?screen=<route without the slash>.
    const link = rule ? `${rule.prefix}${rule.strip ? x.route.replace(/^\//, '') : x.route}${rule.suffix}` : `/?screen=${x.route.replace(/^\//, '')}`;
    return { route: x.route, label: x.label, link, source: rule ? `${rule.file} ${rule.template}` : 'no link template in src-app/app/layout: the address the shell\'s router writes for a mounted screen, /?screen=<route without the leading slash>' };
  });
  return {
    screens: out,
    inCode,
    mismatch: !disagree && !notDetected && out.some((x) => x.link !== x.route),
    ...(disagree ? { templates: candidates.map((c) => `${c.file} ${c.template}`) } : {}),
    ...(notDetected ? { unread } : {}),
  };
}


function readAppName(root) {
  const index = path.join(root, 'index.html');
  const text = exists(index) ? read(index) : '';
  // The first <title> up to its </title>, found with two scans of the text, so a title holding "<" still names the app.
  // Only A to Z are lowered: that keeps every offset of lower true in text.
  const lower = text.replace(/[A-Z]/g, (c) => c.toLowerCase());
  const open = lower.indexOf('<title>');
  const close = open === -1 ? -1 : lower.indexOf('</title>', open + 7);
  const title = close === -1 ? null : text.slice(open + 7, close);
  return title ? decodeEntities(title).replace(/\s+/g, ' ').trim() || UNRESOLVED : UNRESOLVED;
}

const initialsOf = (name) => (name === UNRESOLVED ? UNRESOLVED : name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join(''));

/** The drawing kit classes of the app window, its navigation, the phone header and the brand. */
function variantsOf(chrome) {
  const active = chrome.active === UNRESOLVED ? null : `d-active--${chrome.active}`;
  const nav = chrome.nav === 'side' ? ['d-side', active] : ['d-top', chrome.links === 'end' ? 'd-top--end' : null, active];
  const phone = chrome.phone === 'rows' ? ['d-top', 'd-top--rows', active] : ['d-top'];
  return {
    window: chrome.nav === 'side' ? 'd-app' : 'd-app d-app--top',
    nav: nav.filter(Boolean).join(' '),
    phone: phone.filter(Boolean).join(' '),
    brand: chrome.mark === 'initials' ? 'd-brand d-brand--initials' : chrome.mark === 'svg' || chrome.mark === 'raster' ? 'd-brand d-brand--logo' : 'd-brand',
  };
}

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The app's SVG logo defined once per page: one <symbol id="brand-mark"> in a hidden svg; null for any other mark. */
export function brandDefs(brand) {
  if (brand.kind !== 'svg') return null;
  const m = /^<svg\b([^>]*)>([\s\S]*)<\/svg>$/.exec(brand.svg);
  if (!m) return null;
  // The symbol takes the logo's drawing attributes; its own id, xmlns and aria-hidden would clash with the symbol's.
  const attrs = m[1].replace(/\s+(xmlns|aria-hidden|id)="[^"]*"/g, '');
  return `<svg class="brand-defs" aria-hidden="true"><symbol id="brand-mark"${attrs}>${m[2]}</symbol></svg>`;
}

/** The mark a drawn brand writes when the logo is defined once: a use of #brand-mark. */
export const BRAND_USE = '<svg aria-hidden="true"><use href="#brand-mark"/></svg>';

/** The brand as the drawing writes it: the variant classes, the mark (the logo defined once, an embedded image, initials or none) and the app name. */
function brandHtml(variants, brand, appName, initials) {
  const name = escapeHtml(appName === UNRESOLVED ? 'App name' : appName);
  if (brand.kind === 'svg') return `<span class="${variants.brand}"><span class="d-logo">${BRAND_USE}</span>${name}</span>`;
  if (brand.kind === 'raster') return `<span class="${variants.brand}"><span class="d-logo"><img src="${brand.src}" alt=""></span>${name}</span>`;
  if (brand.kind === 'initials') return `<span class="${variants.brand}"><span class="d-mark">${escapeHtml(initials ?? '')}</span>${name}</span>`;
  return `<span class="${variants.brand}">${name}</span>`;
}

/** The app-look style block for the proposal page; each value carries its source as a comment. */
function appLookCss(look) {
  const lines = Object.entries(look).map(([key, value]) =>
    value === UNRESOLVED ? `  /* --d-${key}: unresolved, read the file lookFrom names in survey.json */` : `  --d-${key}: ${value};`);
  return `.d-app {\n${lines.join('\n')}\n}`;
}

export function survey(root) {
  skipped = [];
  readRoots = [realpathSync(root)];
  const appName = readAppName(root);
  const { screens, notShown, registry } = readScreens(root);
  const { services, mocks } = readServices(root, new Set(screens.map((s) => s.package)));
  const { look, sources, real, disagree, unresolved, dropped, chrome, shellCss, pageCss, lookSources, brand, screenLooks } = readLook(root, screens, (lookup) => readChrome(root, lookup));
  chrome.initials = chrome.mark === 'initials' ? initialsOf(appName) : null;
  const variants = variantsOf(chrome);
  const wasRead = (f) => !skipped.some((s) => s.file === path.join(root, f));
  const result = {
    project: root,
    appName,
    nav: chrome.nav,
    chrome,
    variants,
    brandMark: { kind: brand.kind, file: brand.file ?? null, why: brand.why, ...(brand.svg ? { svg: brand.svg } : {}), ...(brand.src ? { src: brand.src } : {}) },
    brandDefs: brandDefs(brand),
    brandHtml: brandHtml(variants, brand, appName, chrome.initials),
    screens: screens.map((s) => { const out = { ...s }; delete out.css; return out; }),
    links: readLinks(root, screens),
    screenLooks,
    notShown,
    registry,
    services,
    mocks,
    designFiles: readDesignFiles(root),
    // Only the files whose rules were read: a file the survey skipped is listed under skipped instead.
    lookSources: { ...lookSources, pageCss: pageCss.filter(wasRead), shellCss: shellCss.filter(wasRead) },
    scale: { screen: SCREEN_WIDTH, window: WINDOW_WIDTH, rule: SCALE_RULE },
    look,
    lookFrom: sources,
    lookReal: real,
    appOverKit: disagree,
    dropped,
  };
  result.appLookCss = appLookCss(look);
  result.unresolved = [
    ...unresolved,
    ...['nav', 'active', 'phone', 'links'].filter((k) => chrome[k] === UNRESOLVED).map((k) => `chrome.${k}`),
    ...(appName === UNRESOLVED ? ['appName'] : []),
    ...['theme', 'themeId', 'kitCss'].filter((k) => lookSources[k] === UNRESOLVED).map((k) => `lookSources.${k}`),
    ...result.screens.flatMap((s) => [
      ...(s.label === UNRESOLVED ? [`screens.${s.route}.label`] : []),
      ...(s.source.includes(UNRESOLVED) ? [`screens.${s.route}.source`] : []),
    ]),
    ...(result.links.templates || result.links.unread ? ['links'] : []),
  ];
  // One entry per file, the first reason recorded: the first skip is the one that stopped or limited the reading.
  const firstSkip = new Map();
  for (const s of skipped) if (!firstSkip.has(s.file)) firstSkip.set(s.file, { file: rel(root, s.file), why: s.why });
  result.skipped = [...firstSkip.values()];
  // A file the survey meant to read and could not is a gap the agent fills by hand.
  result.unresolved.push(...result.skipped.map((s) => `skipped ${s.file}`));
  return result;
}

/**
 * Text as the terminal may show it: a control character other than newline
 * and tab (below 0x20, or 0x7f to 0x9f) is written as a visible escape such
 * as \x1b, so no project text can move the cursor or recolour the screen;
 * so is a bidirectional control, a line or paragraph separator and U+FEFF
 * (written as \u202e), so none can reorder or break how a line looks.
 */
const HIDDEN = /(?![\t\n])[\p{Cc}\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\u2028\u2029\ufeff]/gu;
export const visible = (s) => s.replace(HIDDEN, (c) => (c.charCodeAt(0) > 0xff ? `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}` : `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`));

/** The survey as a short list for the person at the terminal; any project text in it goes through visible(). */
export function readable(result) {
  const c = result.chrome;
  const navWord = result.nav === 'side' ? 'side menu' : result.nav === 'top' ? 'top header' : result.nav;
  const out = [`App: ${result.appName}, navigation: ${navWord} (${c.sources.nav ?? 'unresolved'})`];
  out.push(`Screens the app shows (${result.screens.length}, in menu order${result.registry ? `, registered in ${result.registry}` : ''}):`);
  for (const s of result.screens) {
    out.push(`  ${s.order ?? '-'}  ${s.label}  ${s.route}  [${s.package}]  ${s.source.join(', ')}`);
    out.push(`      kit: ${s.kitComponents.join(', ') || 'none'}`);
  }
  const L = result.links;
  out.push(`Addresses the app's links carry (${L.screens[0]?.source ?? 'no screens'}):`);
  for (const x of L.screens) out.push(`  ${x.label}  ${x.link}${x.link !== x.route ? `  (registered route ${x.route})` : ''}`);
  for (const x of L.inCode) out.push(`  link in code: ${x.href}  (${x.file})`);
  if (L.mismatch) out.push('  The registered routes and the links disagree: a shared link carries the address above; the addresses table states what it opens.');
  out.push(`Not shown (${result.notShown.length}, never drawn as screens):`);
  for (const s of result.notShown) out.push(`  ${s.label}  ${s.route}  [${s.package}]  ${s.reason}`);
  if (result.nav === 'top') out.push(`Header links: ${c.links === 'end' ? 'at the far end' : c.links === 'after-brand' ? 'right after the brand' : c.links} (${c.sources.links ?? 'unresolved'})`);
  out.push(`Active link: ${c.active} (${c.sources.active ?? 'unresolved'})`);
  out.push(`Phone header: ${c.phone === 'rows' ? 'a second row of links, no menu button' : c.phone === 'menu-button' ? 'a menu button' : c.phone} (${c.sources.phone ?? 'unresolved'})`);
  const markWord = { svg: 'the app\'s logo, inlined', raster: 'the app\'s logo image, embedded', logo: 'the accent square', initials: `initials ${c.initials}` }[c.mark] ?? c.mark;
  out.push(`Brand: ${result.appName}, mark: ${markWord} (${c.sources.mark})`);
  if (result.brandDefs) out.push(`Brand mark, defined once right after <body> (paste as is, ${result.brandDefs.length} characters; take it whole from brandDefs in the JSON): ${result.brandDefs.slice(0, 120)}...`);
  out.push(`Brand markup for every drawn header (paste as is): ${result.brandHtml.length > 400 ? `${result.brandHtml.slice(0, 160)}... (${result.brandHtml.length} characters; take it whole from brandHtml in the JSON)` : result.brandHtml}`);
  out.push(`Drawing kit classes: window "${result.variants.window}", nav "${result.variants.nav}", phone header "${result.variants.phone}", brand "${result.variants.brand}"`);
  out.push(`Services: ${result.services.map((s) => `${s.name} (${s.file})`).join('; ') || 'none'}`);
  out.push(`Mocks: ${result.mocks.join('; ') || 'none'}`);
  out.push(`Design files (read them; their rules bind the drawing): ${result.designFiles.join('; ') || 'none'}`);
  out.push(`Look from: page CSS ${result.lookSources.pageCss.join(', ') || 'none'}; shell CSS ${result.lookSources.shellCss.join(', ') || 'none'}; theme ${result.lookSources.themeId} (${result.lookSources.theme}, ${result.lookSources.appearance}); kit ${result.lookSources.kitCss}`);
  out.push(`Scale: ${result.scale.rule}`);
  out.push('Values (drawn value, real value when scaled, source):');
  for (const [key, value] of Object.entries(result.look)) out.push(`  --d-${key}: ${value}${result.lookReal[key] ? ` (${result.lookReal[key]} in the app)` : ''}  ${result.lookFrom[key]}`);
  const looks = result.screenLooks.filter((e) => e.heading || e.section || e.bands);
  if (looks.length) {
    out.push('What each screen uses beyond the shared values (drawn value, real value, source):');
    for (const e of looks) {
      if (e.heading) out.push(`  ${e.label}: own page heading ${e.heading.size} (${e.heading.real} in the app)${e.heading.phone ? `, ${e.heading.phone} on a phone` : ''}${e.heading.weight ? `, weight ${e.heading.weight}` : ''}  ${e.heading.source}`);
      if (e.section) out.push(`  ${e.label}: section heading ${e.section.size} (${e.section.real} in the app)${e.section.phone ? `, ${e.section.phone} on a phone` : ''}  ${e.section.source}`);
      for (const b of e.bands ?? []) out.push(`  ${e.label}: band ${b.name} background ${b.bg}, text ${b.text}  ${b.source}`);
    }
  }
  if (result.appOverKit.length) {
    out.push('The app sets its own value where the kit says otherwise; the app wins:');
    for (const d of result.appOverKit) out.push(`  --d-${d.key}: app ${d.app}, kit ${d.kit}`);
  }
  for (const d of result.dropped) out.push(`Dropped, not written to the page: ${d.key} "${d.value}" (${d.source}): ${d.why}`);
  for (const s of result.skipped) out.push(`Skipped: ${s.file}, ${s.why}`);
  out.push('App-look CSS for the proposal page:');
  out.push(result.appLookCss);
  out.push(result.unresolved.length ? `Unresolved: ${result.unresolved.join(', ')}; read the files named above (a skipped one only as references/propose.md step 1 allows) and fill each with a "why" comment` : 'Unresolved: none');
  return visible(out.join('\n'));
}

function parseArgs(argv) {
  const opts = { project: '.', json: false, out: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--json') opts.json = true;
    else if (arg === '--project' || arg === '--out') {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`${arg} needs a ${arg === '--out' ? 'file' : 'folder'}`);
      opts[arg.slice(2)] = argv[(i += 1)];
    } else throw new Error(`unknown argument: ${arg}`);
  }
  return opts;
}

/** The folders holding an absolute path, from the filesystem root down to its own folder; `p` is node:path or path.win32. */
export function foldersOf(file, p = path) {
  const up = [];
  for (let dir = p.dirname(file); ; dir = p.dirname(dir)) {
    up.unshift(dir);
    if (p.dirname(dir) === dir) return up;
  }
}

/**
 * Writes the JSON for --out; returns null, or why it could not. Below the project root every folder is project
 * content: each is checked with lstat one at a time, a symbolic link is refused, a missing folder is made on its own
 * (not with recursive, which follows links), and the text goes to a new file in the last folder (flag wx) that is
 * then renamed onto the target, so nothing is written through a symbolic or a hard link. The root is found on the
 * target's path by identity (device and inode), not by spelling, so a root under a system link (macOS /var) or
 * spelled in another case on a case-insensitive volume is still found. When it is not found but the deepest existing
 * folder of the target still lies inside the project by real path, the write is refused. Folders above the root and a
 * target outside the project come from the person's own argument: there only the file and its own folder are checked,
 * and the text goes to a new file renamed onto the target there too, so no existing file is ever written through.
 * The new file takes the permission bits (0o777, never setuid, setgid or sticky) of an existing target file, so a
 * private survey.json stays private; a new target gets the default mode, like any file the person makes. An existing
 * target that is neither a regular file nor a folder (a FIFO, a socket, a device) is refused.
 */
function writeOut(root, file, text) {
  try {
    const id = statSync(root, { bigint: true });
    const folders = foldersOf(file);
    let below = -1;
    let deepest = null;
    for (let i = 0; i < folders.length && below === -1; i += 1) {
      let stat;
      try { stat = statSync(folders[i], { bigint: true }); } catch { break; }
      deepest = folders[i];
      if (stat.dev === id.dev && stat.ino === id.ino) below = i + 1;
    }
    if (below === -1) {
      const rel = deepest === null ? '..' : path.relative(realpathSync.native(root), realpathSync.native(deepest));
      if (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel)) return 'it lies inside the project, but the project folder is not on its path';
      const link = lisLink(path.dirname(file)) ? 'its folder is a symbolic link' : lisLink(file) ? 'it is a symbolic link' : null;
      if (link) return link;
      mkdirSync(path.dirname(file), { recursive: true });
    } else {
      for (const dir of folders.slice(below)) {
        let stat = null;
        try { stat = lstatSync(dir); } catch (err) { if (err.code !== 'ENOENT') throw err; }
        if (!stat) mkdirSync(dir);
        else if (stat.isSymbolicLink()) return 'its folder is a symbolic link';
      }
      if (lisLink(file)) return 'it is a symbolic link';
    }
    const temp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}-${Date.now()}.tmp`);
    let mode = null;
    let target = null;
    try { target = lstatSync(file); } catch (err) { if (err.code !== 'ENOENT') throw err; }
    // A FIFO, a socket or a device would be replaced by the rename; a folder makes the rename fail on its own.
    if (target && !target.isFile() && !target.isDirectory()) return 'it is not a regular file';
    // Only the permission bits: no setuid, setgid or sticky bit is ever copied.
    if (target?.isFile()) mode = target.mode & 0o777;
    let made = false;
    try {
      // Over an existing file the new one is private while it is written and takes the target's bits last, so a write
      // that clears a bit on some systems does not decide the mode the file ends with.
      const fd = mode === null ? openSync(temp, 'wx') : openSync(temp, 'wx', 0o600);
      made = true;
      try { writeFileSync(fd, text); if (mode !== null) fchmodSync(fd, mode); } finally { closeSync(fd); }
      renameSync(temp, file);
    } catch (err) {
      // Only a file this call made is removed (not one already at the name); the first error is the one reported.
      if (made) try { unlinkSync(temp); } catch { /* keep the first error */ }
      throw err;
    }
    return null;
  } catch (err) { return err.message.split('\n')[0]; }
}

export function main(argv, { log = console.log, error = console.error } = {}) {
  let opts;
  try { opts = parseArgs(argv); } catch (err) { error(`${err.message}\n\n${USAGE}`); return 2; }
  if (opts.help) { log(USAGE); return 0; }
  const root = path.resolve(opts.project);
  if (!existsSync(root) || !statSync(root).isDirectory()) { error(`no such folder: ${opts.project}`); return 2; }
  let result;
  try { result = survey(root); } catch (err) { error(`the survey could not read the project: ${visible(err.message)}`); return 2; }
  // JSON escapes the control characters below 0x20; the rest of HIDDEN is escaped too, so the printed JSON carries none raw.
  const json = JSON.stringify({ ...result, project: '.' }, null, 2).replace(HIDDEN, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  if (opts.out) {
    const problem = writeOut(root, path.resolve(opts.out), `${json}\n`);
    if (problem) { error(`cannot write ${opts.out}: ${problem}`); return 2; }
  }
  if (opts.json) log(json);
  else {
    log(readable(result));
    if (opts.out) log(`Saved the JSON to ${opts.out}`);
    else log(`\n${json}`);
  }
  return result.unresolved.length ? 1 : 0;
}

const isEntry = process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (isEntry) process.exitCode = main(process.argv.slice(2));
