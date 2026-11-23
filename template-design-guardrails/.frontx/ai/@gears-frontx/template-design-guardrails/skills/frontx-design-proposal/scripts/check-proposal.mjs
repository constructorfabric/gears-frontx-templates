#!/usr/bin/env node
/**
 * Check of a proposal page, or of a whole revision folder, of the
 * frontx-design-proposal skill (references/propose.md, step 6). No browser:
 * the page is read as text.
 *
 *   node check-proposal.mjs <proposal.html | revision-dir>
 *
 * Findings, one line each as `file: [kind] message`:
 * - external: the page is not self-contained or runs code of its own: an
 *   attribute that holds a list of addresses (srcset, imagesrcset, ping,
 *   itemtype, profile, attributionsrc, archive), whatever it holds; an
 *   attribute that moves the base addresses resolve against (xml:base, in
 *   any case and under any prefix), whatever it holds; an
 *   attribute that takes an address (src, href, xlink:href, poster,
 *   data, action, formaction and any other *src or *href) that is not a
 *   #fragment, except a small data: image in an img and an https link in the
 *   top bar's page facts (a link of the one p.topbar-meta closed by its own
 *   </a>); srcdoc; any on* event handler attribute;
 *   javascript: in any attribute; a CSS url() that is not a #fragment or a
 *   data: image, image-set(), image(), cross-fade(), element(),
 *   expression(), src(), @import or @font-face, in any case and through CSS
 *   or HTML escapes, comments included (a comment does not name url() or
 *   @import: the check reads comments as CSS); a control character a browser keeps in an address; an
 *   iframe, object, embed, link, base, frame, applet, portal, SVG animation
 *   or foreignObject; math or any MathML element, an svg desc anywhere, and
 *   inside svg any element but the drawing elements of SVG_ELEMENTS (the
 *   survey's logo list); a meta http-equiv other than the
 *   skeleton's Content-Security-Policy, and, read from the raw text apart
 *   from the tree, any meta tag but the skeleton's three or a second
 *   http-equiv attribute outside comments and the text of style and script blocks; a title outside the head; a template; a comment
 *   holding markup; markup the check cannot read as a browser does (a cut
 *   tag, an unclosed comment, CDATA, a processing instruction, a bogus
 *   declaration, an end tag with attributes, an end tag inside svg that does
 *   not close the element it is in, a tag or attribute name with a
 *   character outside printable ASCII, a second html, head or body, nesting
 *   deeper than 512 elements, markup inside a text block such as style,
 *   textarea or title); a network call in a script: fetch, XMLHttpRequest, WebSocket,
 *   EventSource, sendBeacon, import(). CSS is read where a browser reads
 *   it: style blocks, style attributes and the svg presentation attributes,
 *   these on every element, whatever its namespace;
 * - frame: a raw NUL character (U+0000) anywhere in the page, reported first,
 *   as a browser rewrites it by where it stands; the frame, draw, frame-js or answer-js block is missing or differs from
 *   templates/proposal.html (the two scripts byte for byte, since the
 *   Content-Security-Policy allows them by their hashes), the
 *   Content-Security-Policy meta is missing, doubled, outside the head,
 *   differs from the skeleton's or comes after anything but the doctype,
 *   html, head, meta tags and the title (where a browser has closed the
 *   head or the policy would come too late), the app-look block holds more than --d-*
 *   declarations on .d-app or a "{", a "[" or a "(" its declaration does not close
 *   (CSS would lose the rest of the rule), a double quote, a backslash or a single quote
 *   outside --d-font, or another style or script block is present;
 * - app-look (when survey.json lies beside the page): a --d-* value that
 *   differs from survey.json, is missing from the block, is not in
 *   survey.json, or fills a value the survey left unresolved, without a
 *   reason in a comment beside it (a "why:" comment that starts on the same line, three
 *   words or more; comments are read as CSS reads them, across lines, and the last
 *   declaration before "}" needs no ";");
 * - variants (when survey.json lies beside the page): an app window, its
 *   navigation, a phone header or the brand without the drawing kit classes
 *   survey.json names (variants), unless the element says why in data-why;
 * - strip: with options, no side-by-side strip (.strip) above the overview
 *   links, or one whose cells (data-strip-of) do not name one full drawing
 *   per option holding a region marked data-strip; a strip with one design;
 * - built: the "Built from what the app already has" section is longer than
 *   one short line (forty words) or holds a list;
 * - sections: a required section (head, asked, how, answer) is missing, the
 *   page has neither an overview nor a map, the sections are out of order, a section has no h2, or the
 *   recommendation section is missing with options or present with one design;
 * - takeaway: a section (all but the head, the glossary and the answer) without a
 *   one-sentence takeaway right under its h2, a takeaway of more than thirty
 *   words (the head's too), or one that only says its heading again; a
 *   sentence breaks at ".", "!" or "?" before more text, whatever starts it,
 *   never at the period of a common abbreviation (e.g.), and at an ellipsis
 *   only before a capital letter;
 * - ids: an id used twice;
 * - links: an in-page link (href="#...") to an id the page does not have;
 * - wordy: a section with more than 120 words of prose outside its heading,
 *   takeaway, drawings, notes, tables, link cards and the quoted request;
 * - label: a table cell of the mapping, the paths or the addresses longer
 *   than twelve words; an arrow written as text (\u2192, ->, \u21d2, \u2190, or a
 *   character reference a browser shows as one, such as &rarr;) in a
 *   drawing, a note, a map or a table, where the relation belongs in a drawn
 *   mark or a column;
 * - head: no top bar (.topbar) before main with the FrontX mark of
 *   templates/proposal.html, the page title as its only h1 reading
 *   "Proposal: <title>" (.topbar-title) and the page facts (.topbar-meta);
 *   a document <title> that differs from the h1;
 *   a takeaway that is not one sentence, no ask, no line saying these are
 *   drawings; no lang on <html>, or a lang that is not a language tag (two
 *   or three letters, then optional parts joined by hyphens);
 * - language: the page is written in the person's own language, named by
 *   <html lang>. A lang that is not a language tag is read as English. On a
 *   page in English the labels the agent writes read as
 *   below ("Proposal:", "Best for", "suggested", a chip's state, "Changed
 *   since", "on a phone", the table columns). On a page in another language
 *   the same parts are found by their place and class instead: the title is
 *   a word, a colon and the title; a disclaimer has text; an option has two
 *   fields; a tag in a ready answer marks it suggested; a chip has text; the
 *   "Changed since" line names the previous revision; a storyboard's width
 *   heading is there; every column of the mapping, paths and addresses
 *   tables has a heading with text, and today's cells are found by their
 *   class;
 * - views: an option, a screen without options or the one design without a
 *   phone drawing of its own (a .d-app--phone figure) or without a desktop
 *   drawing, a phone drawing after the desktop one or inside a disclosure,
 *   options that differ in which views they show;
 * - options: two or three options, each with Best for and Trade-off; one
 *   design with no option fields; ids unique;
 * - overview: every option (or the one design) has exactly one overview link
 *   that holds its thumbnail and its name, the link's target exists, and the
 *   thumbnail's drawing exists;
 * - pins: every data-note in a drawing has a note, every note a pin, numbers
 *   unique per drawing, every notes list belongs to a drawing;
 * - drawing: a class that is not in templates/draw/draw.css, a style that
 *   sets anything but --cols, --w or --h, a raw colour, an img, svg, canvas,
 *   p, h1-h6 or style element inside a drawing, a text run of more than 16
 *   words;
 * - mark: the app's logo in a .d-logo is the one exception to the img and
 *   svg rule: a use of the logo defined once (<svg><use href="#brand-mark">
 *   with one svg.brand-defs holding symbol#brand-mark of clean elements and
 *   attributes), an svg of the survey's clean elements and attributes only
 *   (no script, no reference outside the page), or an img whose src is a
 *   data: image under the survey's size cap; with survey.json beside the
 *   page, the same mark the survey gives (brandMark), and when it gives
 *   brandDefs, the logo defined once and never inlined again;
 * - text: a {{placeholder}}, TODO, REPLACE or <what goes here> left in the
 *   visible text or an aria-label (written as a tag, it is an element name
 *   that is not HTML, which a browser shows as nothing), garbled characters (UTF-8 read as another
 *   code page), a note label longer than five words or a note longer than
 *   thirty-six words;
 * - thumbnail: a .mini anywhere that does not point at a full drawing (a
 *   zoom, a missing id, or a drawing inside a disclosure);
 * - map: with more than one screen no map; a map node without its thumbnail
 *   or name, or pointing at no screen; a screen with no map node, or more
 *   than one; no line saying what the arrows mean;
 * - chips: a state other than accepted, proposed or open; a chip whose text
 *   is not its state; a chip repeating the state its head or section heading
 *   already gives; an open chip that does not link to an open question;
 * - disclosure: a disclosure inside a disclosure, or one whose summary does
 *   not say in three words or more what it hides;
 * - glossary: a term with no entry, an entry no term uses, a term marked
 *   twice in one section, a term marked in the map or the overview (they say
 *   it in plain words), an entry with no meaning, a term used in a section
 *   before the one its entry links to;
 * - tips: an empty data-tip, or a tip inside a takeaway;
 * - paths: a page that changes an existing screen (a mapping section) without
 *   paths, or a new single page (no screens, no mapping) with paths; no
 *   paths table (table.paths-tbl), a task with fewer than two step
 *   cells, a step cell without its number in order, its screen, its pin or
 *   what is used; when the page changes an existing screen (a mapping
 *   section), no Today column, a Today cell without its count of steps
 *   (data-steps), a path longer than today without the "!" mark (.longer)
 *   linked to an open question, or the mark on a path that is not longer; a
 *   "!" mark without an aria-label; a pin reference to a drawing or pin that
 *   does not exist;
 * - addresses: no addresses table, fewer rows than screens, a row without
 *   its screen and address, the column "Today the same link opens" missing
 *   when the page changes an existing screen, base lines (.bases) for a
 *   single base or a base line without its tag and address, no closing note
 *   (p.note) after the table;
 * - data: a screen without its data line (.reads) when the page has a data
 *   section, a data line without a mark;
 * - mapping: the mapping table without the columns Part, Today and Proposed,
 *   a row without its part, today's place and its proposed place, a row
 *   without a change mark (data-change moved, removed, kept, renamed or
 *   added), a
 *   removed part without its reason, no legend naming every mark the table
 *   uses, no disclosure holding a drawing of today's page;
 * - answer: an ask (.ask) that does not link to the answer block (#answer);
 *   no answer block (form#answer-form.answer in #answer); a data-subject
 *   that does not name the top bar's page id and revision; its options
 *   (values and names) differ from the page's options, or with one design
 *   from "Build it as drawn" and "Change it first"; not exactly one
 *   suggested option, the suggested option not the one checked, or not the
 *   recommended one; an open question missing from the block, or a question
 *   in the block the page has not; a question with fewer than two ready
 *   answers (radios named q<n>), not exactly one suggested answer, or the
 *   suggested answer not the one checked; a ready answer without data-say or
 *   with one shorter than five words; an answer that is a "not decided"
 *   placeholder; an open question without the reason for its suggested
 *   answer (.why); a group without its legend; no "Anything to change?"
 *   textarea in its label, or no answer text, Copy button or state line;
 *   on a page not in English, a data-phrase-* of the form (the words the
 *   scripts write: choose, answer, questions, changes, none, copied, failed,
 *   wide-part) missing or empty; on any page, a phrase given without a place
 *   the script fills ({subject}, {letter}, {name}, {answer}, {changes});
 * - revision: from r2 on, no "Changed since r<n-1>:" line in the head, or
 *   one without links or with a link to nothing; in r1, such a line.
 * Optional parts (references/page-parts.md, "Optional parts"):
 * - flow: a flow outside #flow or more than one; a box off the grid
 *   (data-row, data-col) or two on one cell; a step that neither links a
 *   drawing nor is marked outside the app (data-outside), or whose name is no
 *   screen of the map (without a map: not in the caption of the drawing it
 *   links); not exactly one start (data-start) or a start that is
 *   not a step; on a page not in English, a start whose data-start gives
 *   no word to show above it; a box with no way in but the start, or no way out but an end;
 *   an end that leads on, or with data-end other than done or stop; a
 *   decision with fewer than two ways out, or a way out without its label; a
 *   connector naming a box the flow lacks; a box the start never reaches, or
 *   one from which no end is reached; a decision with no refusal or error end
 *   (data-end="stop"); a flow of fewer than three steps and no decision;
 * - storyboard: a storyboard (ol.story) outside a screen, an option or the
 *   design, or inside a disclosure; without data-width phone or desktop and
 *   a heading right before it that names the same width; fewer than three or
 *   more than six frames; a frame without one drawing, or without its caption
 *   numbered in order, or with a caption over sixteen words; with options, a
 *   storyboard in some options but not all that is not in the recommended
 *   option alone or lacks the line saying it is the same in the others
 *   (p.story-same);
 * - stretched (rendered only, checkProposalLayout): a badge or chip wider
 *   than its text by far, stretched across its row;
 * - guarantee: a sentence of a section (but What you asked for, the open
 *   questions, the glossary and the answer, and outside drawings, flows and
 *   notes) that promises never, always, cannot, can only, only once or only
 *   ... can, with no pin reference (a.pinref) to what makes it true and no
 *   link to its open question;
 * - cue: past seven sections after the head or three screens, no position
 *   cue (nav.cue right after the head), or one on a shorter page; a cue entry
 *   to an id that is not a section; a section missing from the cue, or out of
 *   the page's order.
 * For a revision folder also CHOICE.md: required fields, no <placeholder>,
 * the optional parts each said added or not added with a reason, and each
 * matching the page (guarantees: added when a promising sentence links a pin),
 * a known Status, Replaces naming the previous revision, the options
 * matching the page, Chosen one of them whenever it is given, and the selection and hand-off fields "none yet" while
 * awaiting selection, filled when selected, and the person's words quoted
 * when replaced (references/record.md, references/revise.md).
 *
 * A survey.json beside the page that is not an object, or whose look,
 * variants, brandDefs or brandMark has the wrong shape, is a record finding
 * and is not used; the rest of the page and CHOICE.md are still checked. A
 * survey.json or CHOICE.md that is a symbolic link is a record finding and is
 * not read: the record is the files in the revision folder itself.
 * Every pattern applied to the whole page or a whole record runs in time
 * linear in its length (comments are read by scanning, not by a pattern).
 *
 * Exit 0 clean, 1 findings, 2 input error (bad flag, no such file).
 * The CLI runs only when this file is the entry point.
 */
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRAND_USE, RASTER_CAP, SVG_ATTRIBUTES, SVG_ELEMENTS, safeSvgValue, svgName, withoutBlocks } from './survey-app.mjs';

const USAGE = `usage: node check-proposal.mjs <proposal.html | revision-dir>

  <proposal.html>   A proposal page
  <revision-dir>    .frontx/proposals/<page-id>/<revision>/ with proposal.html and CHOICE.md
  --help            Print this message

Exit 0 clean, 1 findings, 2 input error.`;

const here = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.join(here, '../templates/proposal.html');
const DRAW_CSS = path.join(here, '../templates/draw/draw.css');

const SECTION_ORDER = ['head', 'asked', 'problem', 'map', 'flow', 'overview', 'place', 'how', 'mapping', 'paths', 'addresses', 'built', 'data', 'states', 'recommendation', 'questions', 'glossary', 'answer'];
const REQUIRED_SECTIONS = ['head', 'asked', 'how', 'answer'];
const STATES = ['accepted', 'proposed', 'open'];
const CHANGES = ['moved', 'removed', 'kept', 'renamed', 'added'];
const TAKEAWAY_MAX = 30;
const SECTION_MAX = 120;
const LABEL_MAX = 12;
const ARROW = /\u2192|->|\u21d2|\u2190/;
/** The named references a browser shows as one of the ARROW characters. */
const ARROW_REFS = { rarr: '\u2192', rightarrow: '\u2192', RightArrow: '\u2192', srarr: '\u2192', ShortRightArrow: '\u2192', larr: '\u2190', leftarrow: '\u2190', LeftArrow: '\u2190', slarr: '\u2190', ShortLeftArrow: '\u2190', rArr: '\u21d2', Rightarrow: '\u21d2', DoubleRightArrow: '\u21d2', Implies: '\u21d2' };
// UTF-8 read as Windows-1252: a lead letter followed by a continuation-byte character, or the replacement character.
const GARBLED = /[\u00c3\u00c2\u00e2][\u0080-\u00bf\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u0192\u02c6\u02dc\u2013-\u203a\u20ac\u2122]|\ufffd/;
const UNFILLED = /&lt;[a-zA-Z][a-zA-Z0-9 ,.'-]{0,60}&gt;|\bREPLACE\b|\bTODO\b/;
/**
 * An address written with a named part, `/?screen=<route>` or `/tasks/<id>`: the form the app's links take
 * (references/page-parts.md, the addresses), not a placeholder left. It starts with "/" at the start of a word,
 * every named part is one word in angle brackets, and it holds no space. After a named part comes a separator
 * ("/", "?", "=", ...) or the end of the address, never a letter, a digit or another bracket, and the address ends
 * at a boundary (a space, the end of the text, or closing punctuation), so text glued to it (`<route>TODO`,
 * `<route><REPLACE>`) is not taken in. A match starts only where a word starts and no address part holds a space,
 * so no two tries cover the same text and the scan stays linear. `lt` and `gt` are the brackets as the text writes them.
 */
const addressForm = (lt, gt) => {
  const part = `${lt}[a-zA-Z][\\w-]{0,30}${gt}`;
  return new RegExp(`(?<=^|[\\s("'\`])/[\\w\\-./?=#%]*${part}(?:[\\-./?=#%][\\w\\-./?=#%]*${part})*(?:[\\-./?=#%][\\w\\-./?=#%]*)?(?=$|[\\s.,;:)'"\`\\u2019\\u201d])`, 'g');
};
const ADDRESS_FORM_HTML = addressForm('&lt;', '&gt;');
const ADDRESS_FORM_TEXT = addressForm('<', '>');
const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'is', 'are', 'it', 'its', 'with', 'each', 'every', 'this', 'that', 'what', 'where', 'how', 'goes', 'go']);
const ALLOWED_STYLE_PROPS = new Set(['--cols', '--w', '--h']);
const FORBIDDEN_IN_DRAWING = new Set(['img', 'svg', 'canvas', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'style', 'script', 'iframe']);
/** The HTML element names a browser knows; any other name in the page is markup a browser shows as nothing. */
const HTML_ELEMENTS = new Set('html head body title meta link style script noscript base main header footer nav section article aside h1 h2 h3 h4 h5 h6 hgroup address search p hr pre blockquote ol ul li dl dt dd figure figcaption div a em strong small s cite q dfn abbr ruby rt rp data time code var samp kbd sub sup i b u mark bdi bdo span br wbr ins del picture source img iframe embed object param video audio track map area table caption colgroup col tbody thead tfoot tr td th form label input button select datalist optgroup option textarea output progress meter fieldset legend details summary dialog menu slot template canvas center font big strike tt nobr listing xmp plaintext noembed noframes frame frameset applet marquee portal dir'.split(' '));
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW_COLOUR = /#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color-mix)\(|\b(?:white|black|red|green|blue|gray|grey|orange|yellow|purple|pink)\b/i;
const words = (text) => text.trim().split(/\s+/).filter(Boolean).length;
/** A language tag: two or three letters, then optional parts of letters or digits joined by hyphens (en, de, pt-BR). */
const LANG_TAG = /^[a-z]{2,3}(?:-[a-z0-9]{1,8})*$/i;
const langOf = (root) => find(root, (n) => n.tag === 'html')[0]?.attrs.lang?.trim();
/** The page is in English when <html lang> says so, names no language or is no language tag; then the check reads its English labels. */
const inEnglish = (root) => {
  const lang = langOf(root);
  return !lang || !LANG_TAG.test(lang) || /^en(?:-|$)/i.test(lang);
};
/** On a page not in English: every column of a table has a heading with text (th in thead), counted against its widest body row. */
const headsEveryColumn = (table) => {
  const span = (n) => Math.max(1, Number.parseInt(n.attrs.colspan ?? '1', 10) || 1);
  const heads = find(table, (n) => n.tag === 'th' && inside(n, (a) => a.tag === 'thead'));
  const columns = Math.max(0, ...find(table, (n) => n.tag === 'tr' && inside(n, (a) => a.tag === 'tbody'))
    .map((tr) => tr.children.filter((c) => typeof c !== 'string' && (c.tag === 'th' || c.tag === 'td')).reduce((sum, c) => sum + span(c), 0)));
  return heads.every((n) => norm(textOf(n))) && heads.reduce((sum, n) => sum + span(n), 0) >= columns;
};
/** The revision the top bar's page facts give: the second code (r<n>), else the words "revision r<n>". */
const revisionOf = (meta) => {
  if (!meta) return null;
  const code = find(meta, (n) => n.tag === 'code').map((n) => norm(textOf(n)))[1];
  const m = /^r(\d+)$/.exec(code ?? '') ?? /revision\s+r(\d+)/i.exec(textOf(meta));
  return m ? Number(m[1]) : null;
};

// The tokenizer below follows the HTML standard's tokenizer, and the parts of its tree builder that
// decide how the text after a tag is read: tag and attribute grammar, comments, raw text and RCDATA
// blocks, and foreign content (svg, math) with its integration points and the tags that leave it.
// Where the tree builder does something the check does not model and a page could use it to make
// the browser read markup differently, the parser reports the place instead (root.unread).
//
// svg and math: a proposal page has no math, and an svg holds only drawing elements (SVG_ELEMENTS,
// the list the survey's logo cleaner keeps), each closed by its own end tag or by />. Everything else met
// inside svg or math is a finding, and so is any MathML element or svg integration point anywhere.
// So no page that passes has an integration point, and no HTML sits inside svg: the question where a
// browser reads svg content as HTML again, which four review rounds found new answers to, does not
// arise. The verdict does not depend on the namespace either: presentation attributes are read as
// CSS on every element (PRESENTATION), and addresses, handlers, title and style or script blocks
// are checked by name on every element.
const isSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\f' || c === '\r';
/** A browser lowercases only the ASCII letters of a name: the Kelvin sign stays as it is. */
const lowerAscii = (s) => s.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));
/** A tag or attribute name with a character outside printable ASCII: no honest page needs one. */
const ODD_NAME = /[^\x21-\x7e]/;
/** Elements whose content a browser reads as text up to their own end tag (outside svg and math). */
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript', 'plaintext']);
const FOREIGN = new Set(['svg', 'math']);
/** MathML elements and svg integration points: a finding wherever they stand, whatever namespace a reader gives them. */
const NO_SUCH_ELEMENT = new Set(['math', 'mi', 'mo', 'mn', 'ms', 'mtext', 'mglyph', 'malignmark', 'annotation', 'annotation-xml', 'semantics', 'mrow', 'mfrac', 'msqrt', 'mroot', 'mstyle', 'merror', 'mpadded', 'mphantom', 'mfenced', 'menclose', 'msub', 'msup', 'msubsup', 'munder', 'mover', 'munderover', 'mmultiscripts', 'mprescripts', 'mtable', 'mtr', 'mtd', 'mlabeledtr', 'maligngroup', 'mspace', 'maction', 'mstack', 'mlongdiv', 'msgroup', 'msrow', 'mscarries', 'mscarry', 'msline', 'foreignobject', 'desc']);
/** Start tags that end svg or math content in a browser (font only with color, face or size; the check leaves at any font, which is a finding inside svg either way). */
const BREAKOUT = new Set(['b', 'big', 'blockquote', 'body', 'br', 'center', 'code', 'dd', 'div', 'dl', 'dt', 'em', 'embed', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'hr', 'i', 'img', 'li', 'listing', 'menu', 'meta', 'nobr', 'ol', 'p', 'pre', 'ruby', 's', 'small', 'span', 'strong', 'strike', 'sub', 'sup', 'table', 'tt', 'u', 'ul', 'var', 'font']);
const SVG_ONLY = `an svg on a proposal page holds only drawing elements (${[...SVG_ELEMENTS].map(svgName).join(', ')}), each closed by its own end tag or by />; name an icon with aria-label on the svg, not a title inside it, and put text, links and formulas in HTML outside it`;
/** Elements nested deeper than this are a finding; the parser then stops going down, so every walk of the tree stays shallow. */
const MAX_DEPTH = 512;
/** Start tags that keep a browser in the document head; the Content-Security-Policy meta counts only after these. */
const HEAD_PRELUDE = new Set(['html', 'head', 'meta', 'title']);
const END_TAG = /<\/([a-zA-Z][^\t\n\f\r /><]*)[\t\n\f\r ]*>/y;
const DOCTYPE = /<!doctype[\t\n\f\r ]+html[\t\n\f\r ]*>/iy;
const snippet = (html, at) => JSON.stringify(html.slice(at, at + 40));

/** The comment that opens at html[lt] ("<!--"), read as a browser reads it: { end, text, closed }; an unclosed one runs to the end of the page. */
function readComment(html, lt) {
  if (html.startsWith('>', lt + 4)) return { end: lt + 5, text: '', closed: true }; // <!-->
  if (html.startsWith('->', lt + 4)) return { end: lt + 6, text: '', closed: true }; // <!--->
  const close = /--!?>/g;
  close.lastIndex = lt + 4;
  const m = close.exec(html);
  return m ? { end: m.index + m[0].length, text: html.slice(lt + 4, m.index), closed: true } : { end: html.length, text: html.slice(lt + 4), closed: false };
}

/**
 * The page without its comments and without the text of its style and script blocks: what a raw-text count of
 * attributes may look at. The places are the ones the tree parser read (parseHtml's skips, in page order), so an
 * opener inside an attribute value or another text block hides nothing, and a block ends where a browser ends it.
 */
function withoutCommentsAndBlocks(html, skips) {
  let out = '';
  let i = 0;
  for (const [start, end] of skips) { out += html.slice(i, start); i = end; }
  return out + html.slice(i);
}

/** One start tag from html[at] (the letter after "<"), read as a browser reads it; null when the page ends inside it. */
function readStartTag(html, at) {
  const n = html.length;
  let j = at;
  while (j < n && !isSpace(html[j]) && html[j] !== '/' && html[j] !== '>') j++;
  const tag = lowerAscii(html.slice(at, j));
  const list = [];
  let slash = false;
  let odd = ODD_NAME.test(tag) ? tag : null;
  for (;;) {
    while (j < n && (isSpace(html[j]) || html[j] === '/')) slash = html[j++] === '/';
    if (j >= n) return null;
    if (html[j] === '>') return { tag, list, selfClose: slash, end: j + 1, odd };
    slash = false;
    let k = j + 1; // a first "=" belongs to the name
    while (k < n && !isSpace(html[k]) && html[k] !== '/' && html[k] !== '>' && html[k] !== '=') k++;
    const name = lowerAscii(html.slice(j, k));
    if (odd === null && ODD_NAME.test(name)) odd = name;
    j = k;
    while (j < n && isSpace(html[j])) j++;
    let value = '';
    if (html[j] === '=') {
      j++;
      while (j < n && isSpace(html[j])) j++;
      const q = html[j];
      if (q === '"' || q === "'") {
        const e = html.indexOf(q, j + 1);
        if (e === -1) return null;
        value = html.slice(j + 1, e);
        j = e + 1;
      } else {
        k = j;
        while (k < n && !isSpace(html[k]) && html[k] !== '>') k++;
        value = html.slice(j, k);
        j = k;
      }
    }
    list.push([name, value.replace(/\0/g, '\ufffd')]); // a NUL in a value is U+FFFD to a browser
  }
}

/**
 * A small tree of the markup: nodes { tag, ns, attrs, list, children, parent, depth }, text as
 * strings; ns is html, svg or math, as a browser gives it. root.unread lists every place where the
 * page holds markup the check cannot read the way a browser does (a cut tag, a bogus comment, an
 * end tag with attributes, an end tag in svg or math that does not close the element it is in, an
 * element svg may not hold, math, a name outside printable ASCII, a second body, nesting past
 * MAX_DEPTH); a text block holding markup carries markupInText; root.comments keeps the text of
 * every comment. The check reports each one, so the parser fails closed.
 * Each node notes prelude: whether only white space, comments, the doctype and the start tags of
 * HEAD_PRELUDE came before it, which is where a browser still reads the document head.
 * Linear in the page's length: every step looks at the current node or pops nodes it pushed,
 * and a count of the open elements by name answers whether an end tag closes anything.
 */
function parseHtml(html) {
  // skips: [start, end) of every comment and of the text of every style and script block, in page order.
  const rootNode = { tag: '#root', ns: 'html', attrs: {}, list: [], children: [], parent: null, depth: 0, unread: [], comments: [], skips: [] };
  const { unread, comments, skips } = rootNode;
  const n = html.length;
  const open = new Map(); // tag -> how many elements of that name are open
  const seen = new Set();
  let node = rootNode;
  let textStart = 0;
  let i = 0;
  let prelude = true;
  let titleEnd = -1; // where the text of the last title block ends
  let tooDeep = false;
  const flush = (end) => {
    if (end <= textStart) return;
    const text = html.slice(textStart, end);
    if (/[^\t\n\f\r ]/.test(text)) prelude = false; // text a browser does not skip ends the head
    node.children.push(text);
  };
  const popTo = (target) => { for (; node !== target; node = node.parent) open.set(node.tag, open.get(node.tag) - 1); };
  const close = (up) => { up.closedOwn = up === node; popTo(up.parent); };
  while (i < n) {
    const lt = html.indexOf('<', i);
    if (lt === -1) break;
    const c = html[lt + 1] ?? '';
    i = lt + 1;
    if (html.startsWith('<!--', lt)) {
      flush(lt);
      const { end, text, closed } = readComment(html, lt);
      if (!closed) unread.push(`an unclosed comment hides the rest of the page from ${snippet(html, lt)}`);
      comments.push(text);
      skips.push([lt, end]);
      i = textStart = end;
      continue;
    }
    if (c === '!') {
      DOCTYPE.lastIndex = lt;
      if (DOCTYPE.test(html)) { flush(lt); i = textStart = DOCTYPE.lastIndex; }
      else { unread.push(`markup the check cannot read: ${snippet(html, lt)}`); prelude = false; }
      continue;
    }
    if (c === '?') { unread.push(`markup the check cannot read: ${snippet(html, lt)}`); prelude = false; continue; }
    if (c === '/') {
      END_TAG.lastIndex = lt;
      const m = END_TAG.exec(html);
      if (!m) { unread.push(`markup the check cannot read: ${snippet(html, lt)}`); prelude = false; continue; }
      flush(lt);
      const tag = lowerAscii(m[1]);
      // The end tag of a title read as a text block in the head keeps the head open, as in a browser.
      if (!(tag === 'title' && titleEnd === lt)) prelude = false;
      i = textStart = END_TAG.lastIndex;
      if (ODD_NAME.test(tag)) unread.push(`markup the check cannot read: the end tag name ${JSON.stringify(tag)} holds a character outside printable ASCII; write tag names in plain ASCII letters`);
      if (node.ns !== 'html') {
        // Inside svg or math an end tag closes exactly the element it is in, or the page is refused:
        // a browser reads the other end tags by rules (closing outer elements, leaving at </p> and
        // </br>) that a page has no honest use for.
        if (tag !== node.tag) unread.push(`markup the check cannot read: the end tag </${tag}> inside <${svgName(node.tag)}> does not close it; close <${svgName(node.tag)}> with /> or </${svgName(node.tag)}> before </${tag}>; ${SVG_ONLY}: ${snippet(html, lt)}`);
        if (tag === 'p' || tag === 'br') {
          while (node.ns !== 'html') popTo(node.parent); // the browser leaves svg or math here
        } else {
          let up = node;
          while (up.ns !== 'html' && up.tag !== tag) up = up.parent;
          if (up.ns !== 'html') { close(up); continue; }
        }
      }
      if (!open.get(tag)) continue; // nothing of that name is open
      let up = node;
      while (up.tag !== tag) up = up.parent;
      close(up);
      continue;
    }
    if (!/[a-zA-Z]/.test(c)) continue;
    const t = readStartTag(html, lt + 1);
    if (!t) { unread.push(`a tag the page never closes hides the rest of the page from ${snippet(html, lt)}`); flush(lt); textStart = n; break; }
    flush(lt);
    i = textStart = t.end;
    if (t.odd !== null) unread.push(`markup the check cannot read: the name ${JSON.stringify(t.odd)} holds a character outside printable ASCII; write tag and attribute names in plain ASCII: ${snippet(html, lt)}`);
    if (NO_SUCH_ELEMENT.has(t.tag)) unread.push(`<${svgName(t.tag)}> is not allowed: a proposal page has no math and no svg ${t.tag === 'desc' || t.tag === 'foreignobject' ? 'description or embedded HTML' : 'formula'}; ${SVG_ONLY}`);
    else if (node.ns === 'svg' && !SVG_ELEMENTS.has(t.tag)) unread.push(`<svg> holds <${t.tag}>; ${SVG_ONLY}: ${snippet(html, lt)}`);
    if (node.ns !== 'html' && BREAKOUT.has(t.tag)) {
      while (node.ns !== 'html') popTo(node.parent); // the browser leaves svg or math here
    }
    const ns = node.ns === 'html' ? (FOREIGN.has(t.tag) ? t.tag : 'html') : node.ns;
    if (ns === 'html' && (t.tag === 'html' || t.tag === 'head' || t.tag === 'body')) {
      if (seen.has(t.tag)) unread.push(`markup the check cannot read: a second <${t.tag}> start tag, which a browser does not open again (it adds the attributes of a second <html> or <body> to the first): ${snippet(html, lt)}`);
      seen.add(t.tag);
    }
    const attrs = {};
    for (const [k, v] of t.list) if (!(k in attrs)) attrs[k] = v; // a browser keeps the first of two equal names
    const child = { tag: t.tag, ns, attrs, list: t.list, children: [], parent: node, depth: node.depth + 1, prelude };
    if (!HEAD_PRELUDE.has(t.tag) || ns !== 'html') prelude = false;
    node.children.push(child);
    if (ns === 'html' && RAW_TEXT.has(t.tag)) {
      let end = n;
      if (t.tag !== 'plaintext') {
        const closer = new RegExp(`</${t.tag}[\\t\\n\\f\\r />]`, 'gi'); // a browser ends the block at </STYLE as at </style>
        closer.lastIndex = i;
        end = closer.exec(html)?.index ?? n;
      }
      const body = html.slice(i, end);
      if (t.tag === 'script' || t.tag === 'style') skips.push([i, end]);
      child.children.push(body);
      child.raw = true;
      const at = body.search(/<[a-zA-Z/!?]/);
      if (at !== -1) child.markupInText = `markup inside the text of a <${t.tag}> block: ${snippet(body, at)}; write no "<" before a letter, "/", "!" or "?" in a style, script, title or other text block, not even in a comment (name a component as Header, not <Header>)`;
      if (t.tag === 'title') titleEnd = end;
      i = textStart = end;
      continue;
    }
    if (ns !== 'html' ? t.selfClose : VOID.has(t.tag)) continue;
    if (child.depth > MAX_DEPTH) {
      if (!tooDeep) unread.push(`markup the check cannot read: elements nested deeper than ${MAX_DEPTH} levels from ${snippet(html, lt)}`);
      tooDeep = true;
      continue;
    }
    node = child;
    open.set(t.tag, (open.get(t.tag) ?? 0) + 1);
  }
  flush(n);
  return rootNode;
}

/** The named character references a browser knows that can change how an address reads; names are case-sensitive. */
const HTML_ENTITIES = { amp: '&', AMP: '&', lt: '<', LT: '<', gt: '>', GT: '>', quot: '"', QUOT: '"', apos: "'", colon: ':', lpar: '(', rpar: ')', sol: '/', bsol: '\\', Tab: '\t', NewLine: '\n', nbsp: '\u00a0', num: '#', period: '.', comma: ',', semi: ';', equals: '=' };
/** The ones a browser also reads without ";", in an attribute only when no "=", letter or digit follows. */
const LEGACY = new Set(['amp', 'AMP', 'lt', 'LT', 'gt', 'GT', 'quot', 'QUOT', 'nbsp']);
/** An attribute value as the browser reads it: character references decoded where a browser decodes them, and no others. */
const decodeHtml = (s) => s.replace(/&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([a-zA-Z][a-zA-Z0-9]*))(;?)/g, (m, dec, hex, name, semi, at, all) => {
  if (name) {
    if (!Object.hasOwn(HTML_ENTITIES, name)) return m;
    if (semi || (LEGACY.has(name) && !/[=a-zA-Z0-9]/.test(all[at + m.length] ?? ''))) return HTML_ENTITIES[name];
    return m;
  }
  const code = dec ? Number(dec) : parseInt(hex, 16);
  return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '\ufffd';
});
/**
 * CSS text as the browser reads it: escapes decoded, so \75 rl( is url(. A hex escape ends with one CSS whitespace
 * (space, tab, LF, CR, CRLF or form feed), not a no-break space or another character JavaScript's \s takes.
 */
const decodeCss = (s) => s.replace(/\\(?:([0-9a-f]{1,6})(?:\r\n|[\t\n\f\r ])?|\n|(.))/gi, (m, hex, ch) => (hex ? String.fromCodePoint(Math.min(parseInt(hex, 16) || 0xfffd, 0x10ffff)) : ch ?? ''));
/**
 * An address as URL parsing reads it: C0 controls and the ASCII space removed at the ends, tab, LF and CR anywhere,
 * nothing more. JavaScript's trim() and \s would also drop a no-break space, U+2028, U+FEFF or U+3000, which a URL
 * keeps as a path character, so no check of what an address starts with uses them. U+0000 is kept: HTML and CSS turn a
 * raw NUL into U+FFFD before URL parsing, which keeps that as a path character, so an address that holds one fails
 * the checks of what it starts with (checkPage also reports any raw NUL on its own).
 */
const urlStripped = (s) => {
  // Trimmed by two loops: a pattern anchored at the end would start again at every space of a long run.
  let a = 0;
  let b = s.length;
  while (a < b && s.charCodeAt(a) >= 0x01 && s.charCodeAt(a) <= 0x20) a += 1;
  while (b > a && s.charCodeAt(b - 1) >= 0x01 && s.charCodeAt(b - 1) <= 0x20) b -= 1;
  return s.slice(a, b).replace(/[\t\n\r]/g, '');
};
/** The text a scheme check reads: the address as URL parsing reads it, in ASCII lower case. */
const bare = (s) => lowerAscii(urlStripped(s));
/**
 * A control character a browser does not strip from inside an address; no honest address holds one: every C0 control
 * but tab, line feed and carriage return, and DEL (\p{Cc} with those three and the C1 block taken out).
 */
const ADDRESS_CONTROL = /(?![\t\n\r\x80-\x9f])\p{Cc}/u;

const URL_ATTRS = new Set(['srcset', 'poster', 'data', 'action', 'formaction', 'ping', 'background', 'lowsrc', 'dynsrc', 'longdesc', 'cite', 'codebase', 'classid', 'manifest', 'icon', 'archive', 'usemap', 'itemtype']);
/**
 * Attributes a browser or the HTML standard reads as a list of addresses, not one: srcset and imagesrcset (image
 * candidates), ping, itemtype, profile and attributionsrc (space-separated), archive (space- or comma-separated). The
 * check of what an address starts with would read only the first, so each is refused on any element: a proposal page
 * needs none of them (its logo is an img src with a data image).
 */
const MULTI_URL_ATTRS = new Set(['srcset', 'imagesrcset', 'ping', 'itemtype', 'profile', 'attributionsrc', 'archive']);
const takesUrl = (name) => URL_ATTRS.has(name) || /(?:^|:)(?:href|src)$/.test(name);
/**
 * An attribute that moves the base every relative address and fragment of its element and its children resolves
 * against: xml:base (XML Base, which an svg reader may honour), in any case and under any prefix, as a document can
 * bind its own prefix to the XML namespace with xmlns. It is refused on any element whatever it holds; the base
 * element is refused as an element.
 */
const changesBase = (name) => /(?:^|:)base$/.test(name);
const NOT_ALLOWED = new Set(['iframe', 'object', 'embed', 'link', 'base', 'frame', 'frameset', 'applet', 'portal', 'template', 'set', 'animate', 'animatemotion', 'animatetransform', 'discard', 'handler', 'listener']);
const DATA_IMAGE = /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/=]+$/i;
/**
 * The svg presentation attributes (SVG 2 and the older ones a browser still maps to CSS). They are
 * read as CSS on every element, whatever namespace a reader gives it, so the verdict does not
 * depend on where svg content begins and ends; text attributes (alt, title, aria-*, data-*) stay text.
 */
const PRESENTATION = new Set(['alignment-baseline', 'baseline-shift', 'clip', 'clip-path', 'clip-rule', 'color', 'color-interpolation', 'color-interpolation-filters', 'color-profile', 'color-rendering', 'cursor', 'cx', 'cy', 'd', 'direction', 'display', 'dominant-baseline', 'enable-background', 'fill', 'fill-opacity', 'fill-rule', 'filter', 'flood-color', 'flood-opacity', 'font', 'font-family', 'font-size', 'font-size-adjust', 'font-stretch', 'font-style', 'font-variant', 'font-weight', 'glyph-orientation-horizontal', 'glyph-orientation-vertical', 'height', 'image-rendering', 'kerning', 'letter-spacing', 'lighting-color', 'marker', 'marker-end', 'marker-mid', 'marker-start', 'mask', 'mask-type', 'opacity', 'overflow', 'paint-order', 'pointer-events', 'r', 'rx', 'ry', 'shape-rendering', 'stop-color', 'stop-opacity', 'stroke', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity', 'stroke-width', 'text-anchor', 'text-decoration', 'text-overflow', 'text-rendering', 'transform', 'transform-origin', 'unicode-bidi', 'vector-effect', 'visibility', 'white-space', 'width', 'word-spacing', 'writing-mode', 'x', 'y']);
const readsCss = (name) => name === 'style' || PRESENTATION.has(name);
const CSS_LOADS = [[/(?:^|[^\w-])(src)\(/i, 'src()'], [/(?:^|[^\w-])((?:-webkit-)?image-set)\(/i, 'image-set()'], [/(?:^|[^\w-])(image)\(/i, 'image()'], [/(?:^|[^\w-])(cross-fade)\(/i, 'cross-fade()'], [/(?:^|[^\w-])(element)\(/i, 'element()'], [/(?:^|[^\w-])(expression)\(/i, 'expression()'], [/@import\b/i, '@import'], [/@font-face\b/i, '@font-face']];

/**
 * The page facts of the top bar, where an https link may stand: the one
 * p.topbar-meta, in .topbar-in in .topbar, holding only span, code and a, so
 * that no start tag inside it makes a browser close it early. Null when the
 * page has another shape.
 */
function factsOf(root) {
  const all = find(root, (n) => hasClass(n, 'topbar-meta'));
  const facts = all.length === 1 ? all[0] : null;
  if (!facts || facts.tag !== 'p' || facts.ns !== 'html' || !hasClass(facts.parent, 'topbar-in') || !hasClass(facts.parent.parent ?? { attrs: {} }, 'topbar')) return null;
  return [...walk(facts)].every((n) => ['span', 'code', 'a'].includes(n.tag) && n.ns === 'html') ? facts : null;
}

/**
 * A link a browser keeps where the check sees it: a direct child of a span of
 * the page facts, closed by its own </a>. A link closed any other way stays
 * open to a browser, which copies it into later blocks.
 */
const isFactsLink = (n, facts) => facts !== null && n.tag === 'a' && n.closedOwn && n.parent.tag === 'span' && n.parent.parent === facts;

/**
 * The page fetches nothing and runs only the skeleton's two scripts: every
 * address points into the page (a small data: image in an img, an https link
 * in the top bar's page facts are the exceptions), no event handler, no
 * javascript:, no CSS that loads, no embedding or animation element, no meta
 * but the skeleton's, no title but the document's, no comment holding markup.
 * Linear in the size of the tree.
 */
function checkExternal({ html, template, root, tpl, add }) {
  for (const place of root.unread) add('external', place);
  const tplText = new Set(find(tpl, (n) => n.raw).map(textOf));
  for (const n of find(root, (x) => x.markupInText && !tplText.has(textOf(x)))) add('external', n.markupInText);
  // A comment holding markup: no page needs one, and a browser that reads the place as text shows what follows it.
  const tplComments = new Set(tpl.comments);
  for (const text of root.comments) {
    const at = text.search(/<[a-zA-Z/!]/);
    if (at !== -1 && !tplComments.has(text)) add('external', `a comment holds markup: ${snippet(text, at)}; write the comment without "<" before a letter, "/" or "!", or drop it`);
  }
  // Independent of the tree: the page's meta tags are the skeleton's, as written, and only one http-equiv attribute.
  const metas = (text) => (text.match(/<meta(?=[\t\n\f\r />])[^>]*>?/gi) ?? []).sort();
  if (metas(html).join('\n') !== metas(template).join('\n')) add('external', 'the page has meta tags other than the skeleton\'s; keep only its three, as written');
  // Counted where it can be an attribute: after a space, "/" or a quote, before "=". Prose that names it is not counted.
  const equivs = (text) => (text.match(/[\t\n\f\r /"']http-equiv[\t\n\f\r ]*=/gi) ?? []).length;
  // Comments and the text of style and script blocks are left out: they may name the attribute in words.
  const pageEquivs = equivs(withoutCommentsAndBlocks(html, root.skips));
  if (pageEquivs !== equivs(withoutCommentsAndBlocks(template, tpl.skips))) add('external', `the page has ${pageEquivs} http-equiv attributes; only the skeleton's Content-Security-Policy meta has one`);
  const tplMetas = new Set(find(tpl, (n) => n.tag === 'meta').map((n) => serialize(n)));
  const facts = factsOf(root);
  const css = [];
  for (const n of walk(root)) {
    if (NOT_ALLOWED.has(n.tag)) add('external', `<${n.tag}> is not allowed`);
    if (n.tag === 'meta' && n.attrs['http-equiv'] !== undefined && !tplMetas.has(serialize(n))) add('external', `<meta http-equiv="${n.attrs['http-equiv']}"> is not allowed; the page keeps only the skeleton's meta`);
    if (n.tag === 'title' && !(n.ns === 'html' && n.parent.tag === 'head')) add('external', 'a <title> outside the document head; the page has one title, in the head');
    if (n.tag === 'style') css.push(textOf(n));
    for (const [name, raw] of n.list) {
      const value = decodeHtml(raw);
      const scheme = bare(value);
      if (readsCss(name)) css.push(value);
      if (takesUrl(name) && ADDRESS_CONTROL.test(value)) add('external', `<${n.tag} ${name}> holds a control character, which a browser keeps in the address; write the address without it`);
      if (name.startsWith('on')) add('external', `<${n.tag} ${name}> is an event handler; the page runs only its own scripts`);
      else if (/(?:java|vb)script:/.test(scheme)) add('external', `<${n.tag} ${name}="${raw}"> runs code`);
      else if (name === 'srcdoc') add('external', `<${n.tag} srcdoc> embeds another page`);
      else if (changesBase(name)) add('external', `<${n.tag} ${name}> changes the base the page's addresses resolve against, which a proposal page does not need; drop it`);
      else if (MULTI_URL_ATTRS.has(name)) add('external', `<${n.tag} ${name}> holds a list of addresses, which a proposal page does not need; drop it (a logo is an img src with a data image)`);
      else if (takesUrl(name) && scheme !== '' && !scheme.startsWith('#')) {
        const address = urlStripped(value);
        const image = n.tag === 'img' && name === 'src' && DATA_IMAGE.test(address);
        const factsLink = name === 'href' && isFactsLink(n, facts) && /^https:\/\/[^\s"'<>\\]+$/i.test(address);
        if (!image && !factsLink) add('external', `<${n.tag} ${name}="${raw}"> points outside the page`);
      }
    }
  }
  // Comments are read as CSS: a comment that names url() or @import is reported, never one that hides a real load. The
  // finding for a url() that only a comment holds says so; the verdict is the same either way.
  for (const raw of css) {
    const text = decodeCss(raw);
    const outside = new Map();
    for (const m of decodeCss(cssWithoutComments(raw)).matchAll(CSS_URL)) outside.set(m[1], (outside.get(m[1]) ?? 0) + 1);
    for (const m of text.matchAll(CSS_URL)) {
      const address = urlStripped(m[1]);
      const left = outside.get(m[1]) ?? 0;
      if (left) outside.set(m[1], left - 1);
      if (!address.startsWith('#') && !DATA_IMAGE.test(address)) add('external', `url(${m[1]}) points outside the page${left ? '' : ' (comments are read as CSS)'}`);
    }
    for (const [re, name] of CSS_LOADS) if (re.test(text)) add('external', `${name} is not allowed`);
  }
}

/** A url() of CSS: only CSS whitespace may stand between "url(" and the address, which is then read as URL parsing reads it. */
const CSS_URL = /url\([\t\n\f\r ]*['"]?([^'")]*)/gi;
/** An unquoted url() token, from its "u": "/*" inside it is part of the address, not a comment. */
const URL_TOKEN = /url\((?![\t\n\f\r ]*['"])[^)]*\)?/iy;
/**
 * CSS text with each comment replaced by a space, the comments found as a CSS tokenizer finds them: "/*" after a
 * backslash, inside a string or inside an unquoted url() is text, and a comment left open runs to the end. One pass.
 * It decides only the wording of a finding, never whether a url() is reported.
 */
function cssWithoutComments(css) {
  let out = '';
  let from = 0;
  let i = 0;
  while (i < css.length) {
    const c = css[i];
    if (c === '\\') i += 2;
    else if (c === '"' || c === "'") {
      // A string ends at its quote or at a line break; a backslash escapes the next character, CRLF counted as one.
      for (i += 1; i < css.length && css[i] !== c && !'\n\r\f'.includes(css[i]); i += 1) if (css[i] === '\\') i += css.startsWith('\r\n', i + 1) ? 2 : 1;
      i += 1;
    } else if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      out += `${css.slice(from, i)} `;
      i = from = end === -1 ? css.length : end + 2;
    } else if ((c === 'u' || c === 'U') && !/[\w-]/.test(css[i - 1] ?? '') && (URL_TOKEN.lastIndex = i, URL_TOKEN.test(css))) i = URL_TOKEN.lastIndex;
    else i += 1;
  }
  return out + css.slice(from);
}

/** Every element under node in document order; a loop, not a recursion, so a deep page costs no more per element. */
function* walk(node) {
  const stack = [[node, 0]];
  while (stack.length) {
    const top = stack[stack.length - 1];
    const child = top[0].children[top[1]++];
    if (child === undefined) stack.pop();
    else if (typeof child !== 'string') { yield child; stack.push([child, 0]); }
  }
}
const classes = (node) => (node.attrs.class ?? '').split(/\s+/).filter(Boolean);
const hasClass = (node, name) => classes(node).includes(name);
const textOf = (node) => node.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('');
const find = (root, pred) => [...walk(root)].filter(pred);
/** Nodes by a key, the first in document order winning as a find(...)[0] would: one lookup instead of a walk per use. */
const firstBy = (nodes, key) => {
  const map = new Map();
  for (const n of nodes) if (!map.has(key(n))) map.set(key(n), n);
  return map;
};
/** The element offset places after (or before) node among its parent's elements; each parent's list is made once. */
const elementLists = new WeakMap();
const elementIndex = new WeakMap();
const sibling = (node, offset) => {
  let list = elementLists.get(node.parent);
  if (!list) {
    list = node.parent.children.filter((c) => typeof c !== 'string');
    elementLists.set(node.parent, list);
    list.forEach((c, i) => elementIndex.set(c, i));
  }
  return list[elementIndex.get(node) + offset];
};
/** How many nodes give each key. */
const countBy = (nodes, key) => {
  const map = new Map();
  for (const n of nodes) map.set(key(n), (map.get(key(n)) ?? 0) + 1);
  return map;
};
const norm = (s) => s.replace(/\s+/g, ' ').trim();

/** Elements a browser shows as blocks of their own; every other element sits inside a line of text. */
const BLOCK = new Set(['address', 'article', 'aside', 'blockquote', 'body', 'caption', 'center', 'col', 'colgroup', 'dd', 'details', 'dialog', 'dir', 'div', 'dl', 'dt', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hgroup', 'hr', 'html', 'legend', 'li', 'listing', 'main', 'menu', 'nav', 'ol', 'optgroup', 'option', 'p', 'plaintext', 'pre', 'search', 'section', 'summary', 'table', 'tbody', 'td', 'template', 'tfoot', 'th', 'thead', 'title', 'tr', 'ul', 'xmp']);

/**
 * The shown text of the page, in document order, outside script and style
 * blocks: one string per run of text that no block element breaks (text
 * split by inline markup stays joined), then each attribute value; character
 * references decoded. A loop, not a recursion, like walk().
 */
function shownStrings(root) {
  const runs = [];
  let run = [];
  const values = [];
  const breakRun = () => { if (run.length) { runs.push(run.join('')); run = []; } };
  const stack = [[root, 0]];
  while (stack.length) {
    const top = stack[stack.length - 1];
    const child = top[0].children[top[1]++];
    if (child === undefined) {
      stack.pop();
      if (BLOCK.has(top[0].tag)) breakRun();
    } else if (typeof child === 'string') run.push(decodeHtml(child));
    else if (child.tag !== 'script' && child.tag !== 'style') {
      if (BLOCK.has(child.tag)) breakRun();
      for (const [, v] of child.list) values.push(decodeHtml(v));
      stack.push([child, 0]);
    }
  }
  breakRun();
  return [...runs, ...values];
}

/**
 * The {{...}} placeholders of a text: "{{", any text without "}", then "}}".
 * One pass: the search for "}" and the search for "{{" each move forward
 * only, so no character is looked at more than twice.
 */
function placeholders(text) {
  const out = [];
  let open = -1;
  for (let i = 0; ;) {
    const close = text.indexOf('}', i);
    if (close === -1) return out;
    if (text[close + 1] === '}') {
      if (open < i) open = text.indexOf('{{', i);
      if (open === -1) return out;
      if (open + 1 < close) { out.push(text.slice(open, close + 2)); i = close + 2; continue; }
    }
    i = close + 1;
  }
}

/** Raw text of the style or script block with this id. */
function block(root, tag, id) {
  const node = find(root, (n) => n.tag === tag && n.attrs.id === id)[0];
  return node ? textOf(node) : null;
}

function drawClasses(css = readFileSync(DRAW_CSS, 'utf8')) {
  const names = new Set();
  for (const m of withoutBlocks(css, '/*', '*/').matchAll(/\.(d-[\w-]+)/g)) names.add(m[1]);
  return names;
}

/**
 * Declarations of the app-look block with the reason comment beside each: Map name -> { value, why }.
 * A "why:" comment covers the declaration it follows on the line where the comment starts, or the one declaration of
 * that line.
 */
function appLookDeclarations(look) {
  const out = new Map();
  // The block without its comments, as CSS reads it: a comment may span lines and one left open runs to the end. Each
  // comment leaves only its line breaks, so the lines stay where they were; each "why:" comment is kept with the place
  // in that text where it started.
  let text = '';
  const allWhys = [];
  for (let i = 0; ;) {
    const a = look.indexOf('/*', i);
    if (a === -1) { text += look.slice(i); break; }
    text += look.slice(i, a);
    const b = look.indexOf('*/', a + 2);
    if (b === -1) break;
    const inner = look.slice(a + 2, b);
    const why = /^\s*why:\s*([\s\S]*)$/.exec(inner);
    if (why) allWhys.push({ at: text.length, text: why[1].trim() });
    text += inner.replace(/[^\n]+/g, '');
    i = b + 2;
  }
  // Split the whole block at ";", "{" and "}", as CSS ends a declaration: the selector is a piece of its own, a
  // declaration is read wherever it stands, and the last one before "}" needs no ";". Each piece is read from its
  // start, so no pattern scans past the end of its own declaration; the piece after the last "}" is outside the rule.
  const decls = [];
  let at = 0;
  for (const piece of text.split(/[;{}]/)) {
    const end = at + piece.length;
    const m = end < text.length ? /^(\s*)(--d-[\w-]{1,100})\s*:\s*([\s\S]+)$/.exec(piece) : null;
    if (m) decls.push({ name: m[2], value: m[3].trim(), at: at + m[1].length, why: null });
    at = end + 1;
  }
  // A "why:" comment pairs with the declarations that start on its line: the last one before it, else the line's only
  // one. Declarations, comments and line breaks all run in text order, so one pass pairs them.
  let d = 0;
  let w = 0;
  for (let start = 0; start <= text.length;) {
    const nl = text.indexOf('\n', start);
    const stop = nl === -1 ? text.length : nl;
    const line = [];
    for (; d < decls.length && decls[d].at <= stop; d += 1) line.push(decls[d]);
    let k = 0;
    for (; w < allWhys.length && allWhys[w].at <= stop; w += 1) {
      while (k < line.length && line[k].at < allWhys[w].at) k += 1;
      const mine = k ? line[k - 1] : line.length === 1 ? line[0] : null;
      if (mine && mine.why === null) mine.why = allWhys[w].text;
    }
    start = stop + 1;
  }
  for (const x of decls) out.set(x.name, { value: x.value, why: x.why });
  return out;
}

const sameValue = (a, b) => norm(String(a)).toLowerCase().replace(/\s*,\s*/g, ', ') === norm(String(b)).toLowerCase().replace(/\s*,\s*/g, ', ');
const enoughWhy = (why) => why !== null && words(why) >= 3;

/** Findings of the app-look block and the drawing kit variants against the survey the page was drawn from. */
function checkAgainstSurvey({ look, drawings, survey, add }) {
  if (look !== null && survey.look) {
    const declared = appLookDeclarations(look);
    for (const [key, value] of Object.entries(survey.look)) {
      const name = `--d-${key}`;
      const mine = declared.get(name);
      if (value === 'unresolved') {
        if (!mine) add('app-look', `survey.json left ${name} unresolved; fill it from the files the survey names, with a reason comment (/* why: ... */)`);
        else if (!enoughWhy(mine.why)) add('app-look', `${name} fills a value the survey left unresolved; say where it was read in a comment beside it (/* why: ... */)`);
      } else if (!mine) add('app-look', `${name} is missing; survey.json gives ${value}`);
      else if (!sameValue(mine.value, value) && !enoughWhy(mine.why)) add('app-look', `${name} is ${mine.value} but survey.json gives ${value}; use the survey value or give the reason in a comment beside it (/* why: ... */)`);
    }
    for (const [name, mine] of declared) {
      if (!(name.slice(4) in survey.look) && !enoughWhy(mine.why)) add('app-look', `${name} is not in survey.json; give the reason in a comment beside it (/* why: ... */)`);
    }
  }
  const variants = survey.variants;
  if (!variants) return;
  const missing = (node, wanted) => String(wanted ?? '').split(/\s+/).filter(Boolean).filter((c) => !hasClass(node, c));
  for (const d of drawings) {
    if (d.attrs['data-zoom-of'] !== undefined) continue;
    for (const w of find(d, (n) => hasClass(n, 'd-app') && !hasClass(n, 'd-app--zoom'))) {
      const phone = hasClass(w, 'd-app--phone');
      const nav = w.children.find((c) => typeof c !== 'string' && (hasClass(c, 'd-side') || hasClass(c, 'd-top')));
      if (!phone && w.attrs['data-why'] === undefined) {
        const lack = missing(w, variants.window);
        if (lack.length) add('variants', `#${d.attrs.id}: an app window without ${lack.join(', ')} (survey.json variants.window "${variants.window}")`);
      }
      if (nav && nav.attrs['data-why'] === undefined) {
        const want = phone ? variants.phone : variants.nav;
        const lack = missing(nav, want);
        if (lack.length) add('variants', `#${d.attrs.id}: ${phone ? 'the phone header' : 'the navigation'} lacks ${lack.join(', ')} (survey.json variants.${phone ? 'phone' : 'nav'} "${want}"); or say why in data-why`);
      }
      for (const brand of find(w, (n) => hasClass(n, 'd-brand'))) {
        const lack = brand.attrs['data-why'] === undefined ? missing(brand, variants.brand) : [];
        if (lack.length) add('variants', `#${d.attrs.id}: the brand lacks ${lack.join(', ')} (survey.json variants.brand "${variants.brand}")`);
        else if (brand.attrs['data-why'] === undefined && /\bd-brand--logo\b/.test(variants.brand) && !find(brand, (n) => hasClass(n, 'd-logo')).length) add('mark', `#${d.attrs.id}: the brand has no logo (.d-logo); paste survey.json brandHtml as it is`);
      }
    }
  }
}

/** Findings for the text of a proposal page; survey is the parsed survey.json the page was drawn from, when known. */
export function checkPage(html, { survey = null } = {}) {
  const template = readFileSync(TEMPLATE, 'utf8');
  const kitClasses = drawClasses();
  const findings = [];
  const add = (kind, message) => findings.push(`[${kind}] ${message}`);
  // A raw NUL is reported before anything is read: a browser rewrites it by where it stands (U+FFFD in CSS and in
  // attribute values, dropped or replaced in text), so no later reading can be sure to see what a browser sees.
  const nul = html.indexOf('\u0000');
  if (nul !== -1) add('frame', `the page holds a raw NUL character (U+0000) on line ${html.slice(0, nul).split('\n').length}; a browser rewrites it by where it stands, so the check cannot read the page as a browser does: remove it`);
  const root = parseHtml(html);
  const tpl = parseHtml(template);

  // external
  checkExternal({ html, template, root, tpl, add });
  for (const s of find(root, (n) => n.tag === 'script')) {
    const code = textOf(s);
    for (const call of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'sendBeacon', 'import(']) {
      if (code.includes(call)) add('external', `a script calls ${call.replace('(', '')}`);
    }
  }

  // frame
  for (const [tag, id] of [['style', 'frame'], ['style', 'draw'], ['script', 'frame-js'], ['script', 'answer-js']]) {
    const mine = block(root, tag, id);
    const theirs = block(tpl, tag, id) ?? '';
    if (mine === null) add('frame', `the ${id} block is missing`);
    else if (tag === 'script' ? mine !== theirs : norm(mine) !== norm(theirs)) add('frame', `the ${id} block differs from templates/proposal.html; do not restyle the frame or the drawing kit${tag === 'script' ? ', and keep its script byte for byte: the Content-Security-Policy allows it by its hash' : ''}`);
  }
  const isCsp = (n) => n.tag === 'meta' && (n.attrs['http-equiv'] ?? '').toLowerCase() === 'content-security-policy';
  const csps = find(root, isCsp);
  const tplCsp = find(tpl, isCsp)[0]?.attrs.content;
  // A browser honours the policy only in the head, and closes the head at the first text or element that does not belong there.
  if (csps.length !== 1 || csps[0].attrs.content !== tplCsp || csps[0].parent.tag !== 'head' || !csps[0].prelude) {
    add('frame', 'the Content-Security-Policy meta is missing, differs from templates/proposal.html or does not open the head; keep it as the skeleton has it, right after the charset, with only the doctype, <html>, <head>, meta tags and the title before it, since a browser honours it only there');
  }
  const look = block(root, 'style', 'app-look');
  if (look === null) add('frame', 'the app-look block is missing');
  else {
    const body = withoutBlocks(look, '/*', '*/').trim();
    // In CSS a "{" or a "[" in a value, or a "(" its declaration does not close, opens a block that swallows the ";"
    // and the "}" after it, so every later declaration is lost while this check would still read it.
    const m = /^\.d-app\s*\{([^{}[]*)\}$/.exec(body);
    if (!m) add('frame', 'the app-look block must be one .d-app { --d-*: value; } rule');
    else {
      for (const decl of m[1].split(';').map((d) => d.trim()).filter(Boolean)) {
        if (!/^--d-[\w-]+\s*:/.test(decl)) add('frame', `app-look declares "${decl}"; only --d-* properties belong there`);
        // No string may hold a ";", "(", "{" or "[", so the split above and the count below read the rule as CSS does:
        // no double quote or backslash, and single quotes only in --d-font, in pairs in a font list such as 'Inter', sans-serif.
        const value = decl.slice(decl.indexOf(':') + 1);
        const font = decl.slice(0, decl.indexOf(':')).trim() === '--d-font';
        if (/["\\]/.test(decl) || (decl.includes("'") && (!font || !/^[\w\s,'-]*$/.test(value) || decl.split("'").length % 2 === 0))) {
          add('frame', `app-look declares "${decl}" with a quote or a backslash; write values without double quotes or escapes, single quotes only in --d-font, in pairs around a font name`);
        }
        let depth = 0;
        for (const c of decl) depth = c === '(' ? depth + 1 : c === ')' ? Math.max(0, depth - 1) : depth;
        if (depth) add('frame', `app-look declares "${decl}" with a "(" it does not close; a browser would lose the rest of the rule`);
      }
    }
  }
  for (const n of find(root, (x) => x.tag === 'style' || x.tag === 'script')) {
    if (!['frame', 'draw', 'app-look', 'frame-js', 'answer-js'].includes(n.attrs.id)) add('frame', `an extra <${n.tag}> block${n.attrs.id ? ` (#${n.attrs.id})` : ''}`);
  }

  // placeholders
  // Read from the tree: the shown text outside script and style blocks, comments left out, read whole so markup
  // inside a placeholder does not hide it, and each attribute value.
  const shown = new Set();
  for (const text of shownStrings(root)) for (const m of placeholders(text)) shown.add(m);
  for (const m of shown) add('text', `placeholder ${m.length > 80 ? `${m.slice(0, 60)}...${m.slice(-12)}` : m} left in the page`);
  checkText({ root, add });

  // sections
  const main = find(root, (n) => n.tag === 'main')[0] ?? root;
  const sections = main.children.filter((n) => typeof n !== 'string' && n.attrs.id && hasClass(n, 'sec'));
  const ids = sections.map((n) => n.attrs.id);
  for (const id of ids) if (!SECTION_ORDER.includes(id)) add('sections', `unknown section #${id}`);
  for (const id of REQUIRED_SECTIONS) if (!ids.includes(id)) add('sections', `required section #${id} is missing`);
  if (!ids.includes('map') && !ids.includes('overview')) add('sections', 'the page needs an overview, or a map of the screens');
  const known = ids.filter((id) => SECTION_ORDER.includes(id));
  const sorted = [...known].sort((a, b) => SECTION_ORDER.indexOf(a) - SECTION_ORDER.indexOf(b));
  if (known.join() !== sorted.join()) add('sections', `sections out of order: ${known.join(', ')}; expected ${sorted.join(', ')}`);
  const sectionById = new Map(sections.map((n) => [n.attrs.id, n]));
  checkTakeaways({ sections, add });

  // language: the page names the language it is written in; the English labels bind a page in English only
  const english = inEnglish(root);
  if (!find(root, (n) => n.tag === 'html' && norm(n.attrs.lang ?? '')).length) add('head', 'the page has no lang on <html>: the language the page is written in, the person\'s own');
  const lang = langOf(root);
  if (lang && !LANG_TAG.test(lang)) add('head', `the lang on <html> is not a language tag: "${lang}" (two or three letters, then optional parts joined by hyphens, as de or pt-BR)`);

  // top bar: the FrontX mark, the page title as the page's only h1, the page facts
  const topbar = find(root, (n) => hasClass(n, 'topbar'))[0];
  if (!topbar) add('head', 'no top bar (.topbar) before main with the FrontX mark, the title and the page facts');
  else {
    if (inside(topbar, (a) => a.tag === 'main')) add('head', 'the top bar (.topbar) sits before main, not inside it');
    const h1s = find(root, (n) => n.tag === 'h1');
    const title = find(topbar, (n) => n.tag === 'h1' && hasClass(n, 'topbar-title'))[0];
    if (!title || !(english ? /^Proposal: \S/ : /^[^:]+: \S/).test(norm(textOf(title)))) add('head', `the title must read ${english ? '"Proposal: <page title>"' : '"<the word for proposal>: <page title>"'} (h1.topbar-title in the top bar)`);
    if (h1s.length !== 1) add('head', `${h1s.length} h1 elements; the top bar's title is the page's only h1`);
    const docTitle = find(root, (n) => n.tag === 'title')[0];
    if (title && (!docTitle || norm(textOf(docTitle)) !== norm(textOf(title)))) add('head', `the document <title> "${docTitle ? norm(textOf(docTitle)) : ''}" differs from the h1 "${norm(textOf(title))}"`);
    if (!find(topbar, (n) => hasClass(n, 'topbar-meta')).length) add('head', 'the top bar has no page facts (.topbar-meta): page id, revision, date and the scope chip');
    const logo = find(topbar, (n) => hasClass(n, 'topbar-logo'))[0];
    const tplLogo = find(tpl, (n) => hasClass(n, 'topbar-logo'))[0];
    if (!logo || (tplLogo && serialize(logo) !== serialize(tplLogo))) add('frame', 'the top bar\'s FrontX mark (.topbar-logo) differs from templates/proposal.html; keep it as it is');
  }

  // head
  const head = sectionById.get('head');
  if (head) {
    const takeaway = find(head, (n) => hasClass(n, 'takeaway'))[0];
    if (!takeaway) add('head', 'no takeaway (.takeaway)');
    else {
      const t = norm(textOf(takeaway));
      if (sentenceFindings(t)) add('head', 'the takeaway must be one sentence');
      if (words(t) > TAKEAWAY_MAX) add('head', `the takeaway runs ${words(t)} words; ${TAKEAWAY_MAX} at most`);
    }
    if (!find(head, (n) => hasClass(n, 'ask')).length) add('head', 'no ask (.ask) in the head');
    const disclaimer = find(head, (n) => hasClass(n, 'disclaimer'))[0];
    if (!disclaimer || !(english ? /drawings/i : /\S/).test(textOf(disclaimer))) add('head', 'no line saying these are drawings for deciding (.disclaimer)');
  }

  // options
  const how = sectionById.get('how');
  const screens = how ? find(how, (n) => n.tag === 'section' && hasClass(n, 'screen')) : [];
  const optionNodes = how ? find(how, (n) => hasClass(n, 'option')) : [];
  const withOptions = optionNodes.some((n) => n.attrs['data-option'] !== undefined);
  const optionIds = optionNodes.map((n) => n.attrs.id);
  if (new Set(optionIds).size !== optionIds.length) add('options', 'option ids repeat');
  if (withOptions) {
    if (optionNodes.length < 2 || optionNodes.length > 3) add('options', `${optionNodes.length} options; two or three, or one design`);
    for (const opt of optionNodes) {
      if (opt.attrs['data-option'] === undefined || opt.attrs.id !== `option-${opt.attrs['data-option']}`) add('options', `option #${opt.attrs.id} needs data-option and the id option-<letter>`);
      const dts = find(opt, (n) => n.tag === 'dt').map((n) => norm(textOf(n)));
      if (english) for (const label of ['Best for', 'Trade-off']) if (!dts.includes(label)) add('options', `option #${opt.attrs.id} has no "${label}"`);
      if (!english && find(opt, (n) => n.tag === 'dl' && hasClass(n, 'fields')).flatMap((dl) => find(dl, (n) => n.tag === 'dt' && norm(textOf(n)))).length < 2) add('options', `option #${opt.attrs.id} has fewer than two fields (dl.fields: what it is best for, its trade-off)`);
    }
    if (!sectionById.has('recommendation')) add('sections', 'with options the recommendation section is required');
  } else {
    if (!screens.length && (optionNodes.length !== 1 || optionNodes[0].attrs.id !== 'design')) add('options', 'one design needs exactly one .option with id "design" in #how');
    if (screens.length && optionNodes.length) add('options', 'with several screens and no options, each .screen holds its drawing directly');
    if (how && find(how, (n) => hasClass(n, 'fields')).length) add('options', 'one design has no option fields (Best for, Trade-off)');
    if (sectionById.has('recommendation')) add('sections', 'with one design there is no recommendation section');
  }

  // the logo defined once: one svg.brand-defs outside main holding symbol#brand-mark
  const defs = find(root, (n) => n.tag === 'svg' && hasClass(n, 'brand-defs'));
  const brandSymbol = defs.length === 1 ? find(defs[0], (n) => n.tag === 'symbol' && n.attrs.id === 'brand-mark')[0] ?? null : null;
  if (defs.length > 1) add('mark', `${defs.length} brand definitions (svg.brand-defs); the logo is defined once`);
  if (defs.length && inside(defs[0], (a) => a.tag === 'main')) add('mark', 'the logo definition (svg.brand-defs) sits right after <body>, outside main');
  if (defs.length === 1 && !brandSymbol) add('mark', 'svg.brand-defs holds no <symbol id="brand-mark">');
  if (brandSymbol) checkBrandSymbol(brandSymbol, survey, add);

  // drawings and notes
  const drawings = find(main, (n) => n.tag === 'figure' && hasClass(n, 'drawing'));
  const drawingIds = new Set(drawings.map((d) => d.attrs.id));
  const drawingById = firstBy(drawings, (d) => d.attrs.id);
  const noteLists = find(main, (n) => n.tag === 'ol' && hasClass(n, 'notes'));
  const notesFor = firstBy(noteLists, (n) => n.attrs['data-for']);
  for (const [id, count] of countBy(noteLists, (n) => n.attrs['data-for'])) {
    if (id !== undefined && count > 1) add('pins', `${count === 2 ? 'two' : count} notes lists for #${id}; a drawing has one`);
  }
  for (const d of drawings) {
    if (!d.attrs.id) { add('pins', 'a drawing without an id'); continue; }
    const pins = find(d, (n) => n.attrs['data-note'] !== undefined).map((n) => n.attrs['data-note']);
    const pinSet = new Set();
    const dup = new Set();
    for (const p of pins) (pinSet.has(p) ? dup : pinSet).add(p);
    if (dup.size) add('pins', `#${d.attrs.id}: pin ${[...dup].join(', ')} used twice`);
    const list = notesFor.get(d.attrs.id);
    const notes = list ? find(list, (n) => n.tag === 'li').map((n) => n.attrs['data-n']) : [];
    const noteSet = new Set(notes);
    for (const p of pinSet) if (!noteSet.has(p)) add('pins', `#${d.attrs.id}: pin ${p} has no note`);
    for (const n of notes) if (!pinSet.has(n)) add('pins', `#${d.attrs.id}: note ${n} has no pin`);
    const canvas = find(d, (n) => hasClass(n, 'canvas'))[0];
    const windows = canvas ? find(canvas, (n) => hasClass(n, 'd-app')) : [];
    if (!windows.length) add('drawing', `#${d.attrs.id}: no .canvas with a .d-app window`);
    const zoomOf = d.attrs['data-zoom-of'];
    if (zoomOf !== undefined) {
      const target = drawingById.get(zoomOf);
      if (!target || target.attrs['data-zoom-of'] !== undefined) add('drawing', `#${d.attrs.id}: zoom of "${zoomOf}", which is not a full drawing`);
      for (const w of windows) if (!hasClass(w, 'd-app--zoom')) add('drawing', `#${d.attrs.id}: a zoom holds only .d-app--zoom windows`);
    } else {
      for (const w of windows) {
        if (hasClass(w, 'd-app--zoom')) add('drawing', `#${d.attrs.id}: a .d-app--zoom window outside a zoom (data-zoom-of)`);
        else if (!w.children.some((c) => typeof c !== 'string' && (hasClass(c, 'd-side') || hasClass(c, 'd-top')))) add('drawing', `#${d.attrs.id}: an app window without its navigation (.d-side or .d-top); a bare part is a zoom`);
      }
    }
    for (const n of canvas ? walk(canvas) : []) {
      if (isLogoPart(n)) continue;
      if (hasClass(n, 'd-logo')) checkLogo(n, d.attrs.id, survey, add, brandSymbol);
      if (FORBIDDEN_IN_DRAWING.has(n.tag)) add('drawing', `#${d.attrs.id}: <${n.tag}> inside a drawing`);
      for (const c of classes(n)) if (!kitClasses.has(c)) add('drawing', `#${d.attrs.id}: class "${c}" is not in the drawing kit`);
      if (n.attrs.style !== undefined) {
        for (const decl of n.attrs.style.split(';').map((s) => s.trim()).filter(Boolean)) {
          const [prop, ...rest] = decl.split(':');
          if (!ALLOWED_STYLE_PROPS.has(prop.trim())) add('drawing', `#${d.attrs.id}: style sets "${prop.trim()}"; only --cols, --w and --h`);
          else if (RAW_COLOUR.test(rest.join(':'))) add('drawing', `#${d.attrs.id}: raw colour in style "${decl}"`);
        }
      }
      for (const t of n.children) if (typeof t === 'string' && words(t) > 16) add('drawing', `#${d.attrs.id}: a text of ${words(t)} words; drawings carry labels, not paragraphs`);
    }
  }
  for (const list of noteLists) {
    if (!drawingIds.has(list.attrs['data-for'])) add('pins', `notes list for "${list.attrs['data-for']}" has no drawing`);
    for (const li of find(list, (n) => n.tag === 'li')) {
      const label = find(li, (n) => n.tag === 'b')[0];
      if (!label) add('text', `note ${li.attrs['data-n']} of ${list.attrs['data-for']} has no bold label`);
      else if (words(textOf(label)) > 5) add('text', `note ${li.attrs['data-n']} of ${list.attrs['data-for']}: label "${norm(textOf(label))}" is longer than five words`);
      if (words(textOf(li)) > 36) add('text', `note ${li.attrs['data-n']} of ${list.attrs['data-for']} is longer than one line`);
    }
  }

  // overview
  const overview = sectionById.get('overview');
  if (overview) {
    const links = find(overview, (n) => n.tag === 'a' && hasClass(n, 'opt-link'));
    const mainIds = new Set(find(main, (n) => n.attrs.id !== undefined).map((n) => n.attrs.id));
    for (const link of links) {
      const target = (link.attrs.href ?? '').replace(/^#/, '');
      if (!mainIds.has(target)) add('overview', `link to #${target}, which does not exist`);
      const mini = find(link, (n) => hasClass(n, 'mini'))[0];
      if (!mini) add('overview', `the link to #${target} holds no thumbnail (.mini)`);
      else if (!drawingIds.has(mini.attrs['data-mini-of'])) add('overview', `the thumbnail of #${target} shows "${mini.attrs['data-mini-of']}", which is not a drawing`);
      if (!find(link, (n) => hasClass(n, 'opt-name')).length) add('overview', `the link to #${target} holds no name (.opt-name)`);
    }
    const linksTo = countBy(links, (l) => l.attrs.href);
    for (const id of optionIds) {
      const count = linksTo.get(`#${id}`) ?? 0;
      if (count !== 1) add('overview', `#${id} has ${count} overview links; exactly one, the thumbnail with its name`);
    }
    if (withOptions && !find(overview, (n) => n.tag === 'dt' && /same in every option/i.test(textOf(n))).length) add('overview', 'with options the overview marks "The same in every option" and "What differs"');
  }

  // strip: the same rows of every option side by side, above the overview links
  const strips = find(main, (n) => hasClass(n, 'strip'));
  if (withOptions) {
    const strip = overview ? find(overview, (n) => hasClass(n, 'strip'))[0] : undefined;
    if (!strip) add('strip', 'with options the overview starts with a side-by-side strip (.strip): the same rows cut from every option\'s drawing');
    else {
      const order = [...walk(overview)];
      const firstLink = order.findIndex((n) => hasClass(n, 'opt-link'));
      if (firstLink !== -1 && order.indexOf(strip) > firstLink) add('strip', 'the strip sits above the overview links');
      const cells = find(strip, (n) => n.attrs['data-strip-of'] !== undefined);
      const cellsOf = countBy(cells, (c) => c.attrs['data-strip-of']);
      for (const opt of optionNodes) {
        const own = new Set(find(opt, (n) => n.tag === 'figure' && hasClass(n, 'drawing') && n.attrs['data-zoom-of'] === undefined).map((n) => n.attrs.id));
        const mine = [...own].reduce((sum, id) => sum + (cellsOf.get(id) ?? 0), 0);
        if (mine !== 1) add('strip', `option #${opt.attrs.id} has ${mine} strip cells; exactly one, cut from its drawing`);
      }
      const fullById = firstBy(drawings.filter((x) => x.attrs['data-zoom-of'] === undefined), (x) => x.attrs.id);
      for (const c of cells) {
        const id = c.attrs['data-strip-of'];
        const d = fullById.get(id);
        if (!d) add('strip', `a strip cell of "${id}", which is not a full drawing`);
        else if (!find(d, (n) => n.attrs['data-strip'] !== undefined).length) add('strip', `#${id} marks no region (data-strip) for the strip`);
        else if (inside(d, (a) => a.tag === 'details')) add('strip', `the strip cell of "${id}" shows a drawing inside a disclosure`);
      }
    }
  } else if (strips.length) add('strip', 'a strip compares options; with one design there is none');

  // built: one short line; the full list of reused components goes to CHOICE.md
  const built = sectionById.get('built');
  if (built) {
    const body = built.children.filter((c) => typeof c === 'string' || !/^h[1-6]$/.test(c.tag));
    const text = norm(body.map((c) => (typeof c === 'string' ? c : textOf(c))).join(' '));
    if (words(text) > 40 || find(built, (n) => n.tag === 'li').length) add('built', 'the "Built from what the app already has" part is one short line; the full list of components goes to CHOICE.md (Reuses)');
  }
  if (survey) checkAgainstSurvey({ look, drawings, survey, add });
  const rec = sectionById.get('recommendation');
  if (rec) {
    for (const link of find(rec, (n) => n.tag === 'a')) {
      if (!optionIds.includes((link.attrs.href ?? '').replace(/^#/, ''))) add('overview', `recommendation link ${link.attrs.href} is not an option`);
    }
  }
  checkAnswer({ root, sectionById, optionNodes, withOptions, english, add });
  checkViews({ how, screens, optionNodes, add });
  const { guarantees } = checkParts({ root, main, sectionById, drawings, screens, how, add });
  const parts = { guarantees, flow: sectionById.has('flow'), storyboard: find(main, (n) => n.tag === 'ol' && hasClass(n, 'story')).length > 0, cue: find(main, (n) => n.tag === 'nav' && hasClass(n, 'cue')).length > 0 };
  return { findings, options: withOptions ? optionNodes.map((n) => n.attrs['data-option']) : [], parts };
}

// A ready answer that defers the decision instead of making it.
// "Skip" alone defers; "Skip the confirmation step" is a real answer.
const NOT_DECIDED = /\b(?:not (?:yet )?decided|undecided|decide later|no answer|not sure|don'?t know|no preference|tbd|to be decided)\b|^\s*skip(?:ped)?\s*[.!]?\s*$/i;
/** The words the page's scripts write, from the answer form's data-phrase-*, and the places each must keep for the script to fill. */
const PHRASES = { choose: ['{subject}', '{letter}', '{name}'], answer: ['{subject}', '{answer}'], questions: [], changes: ['{changes}'], none: [], copied: [], failed: [], 'wide-part': [] };
const DESIGN_PICKS = [{ value: 'build', name: 'Build it as drawn' }, { value: 'change', name: 'Change it first' }];

/**
 * The answer block (references/page-parts.md, "Answer block"): every ask links
 * to it; it names the page, offers the page's options and every open question
 * with ready answers, the suggested ones checked, each with a full sentence to
 * copy, plus the changes and the Copy button.
 */
function checkAnswer({ root, sectionById, optionNodes, withOptions, english, add }) {
  for (const ask of find(root, (n) => hasClass(n, 'ask'))) {
    if (!find(ask, (n) => n.tag === 'a' && n.attrs.href === '#answer').length) add('answer', `the ask "${norm(textOf(ask)).slice(0, 50)}" does not link to the answer block (<a href="#answer">)`);
  }
  const sec = sectionById.get('answer');
  const form = sec ? find(sec, (n) => n.tag === 'form' && n.attrs.id === 'answer-form' && hasClass(n, 'answer'))[0] : undefined;
  if (!form) { add('answer', 'no answer block (form#answer-form.answer in #answer) with the option, the open questions, the changes and Copy answer'); return; }
  const meta = find(root, (n) => hasClass(n, 'topbar-meta'))[0];
  const [pageId, revision] = meta ? find(meta, (n) => n.tag === 'code').map((n) => norm(textOf(n))) : [];
  const subject = form.attrs['data-subject'] ?? '';
  const names = english ? [`page ${pageId}`, `revision ${revision}`] : [pageId, revision];
  if (pageId && revision && !names.every((x) => subject.includes(x))) add('answer', `data-subject "${subject}" does not name page ${pageId} and revision ${revision} as the top bar does`);
  // The scripts' own words: English by default, so a page in another language gives each one in its language.
  for (const [key, places] of Object.entries(PHRASES)) {
    const words = norm(form.attrs[`data-phrase-${key}`] ?? '');
    if (!words) { if (!english) add('answer', `the answer form has no words in data-phrase-${key}: the script writes them, so give them in the page's language`); continue; }
    for (const place of places) if (!words.includes(place)) add('answer', `data-phrase-${key} leaves out ${place}, the place the script fills in`);
  }
  const groups = find(form, (n) => n.tag === 'fieldset' && hasClass(n, 'ans-q'));
  for (const g of groups) if (!g.children.some((c) => typeof c !== 'string' && c.tag === 'legend' && norm(textOf(c)))) add('answer', `the group "${g.attrs['data-q'] ?? ''}" has no legend`);
  const picksOf = (g, name) => find(g, (n) => n.tag === 'input' && n.attrs.type === 'radio' && n.attrs.name === name).map((input) => {
    const label = [...ancestors(input)].find((a) => a.tag === 'label');
    return {
      input,
      text: label ? norm(proseOf(label, (n) => hasClass(n, 'tag') || hasClass(n, 'small'))) : '',
      name: label ? norm(textOf(find(label, (n) => n.tag === 'b')[0] ?? { children: [] })) : '',
      suggested: !!label && find(label, (n) => hasClass(n, 'tag') && (english ? norm(textOf(n)) === 'suggested' : norm(textOf(n)) !== '')).length > 0,
      checked: input.attrs.checked !== undefined,
    };
  });
  const oneChecked = (picks, sug) => sug.checked && picks.filter((p) => p.checked).length === 1;

  // the option
  const optGroup = groups.find((g) => g.attrs['data-q'] === 'option');
  if (!optGroup) add('answer', 'no "Which option?" group (fieldset data-q="option")');
  else {
    const picks = picksOf(optGroup, 'option');
    const want = withOptions ? optionNodes.map((o) => ({ value: (o.attrs['data-option'] ?? '').toUpperCase(), name: norm(textOf(find(o, (n) => n.tag === 'h3')[0] ?? { children: [] })) })) : DESIGN_PICKS;
    const have = picks.map((p) => ({ value: p.input.attrs.value ?? '', name: p.name, say: norm(p.input.attrs['data-say'] ?? '') }));
    // On a page in another language the two cards of one design are named in that language: their values bind, and a name.
    const named = (w, h) => (english || withOptions ? w.name === h.name : h.name !== '');
    const same = want.length === have.length && want.every((w, i) => w.value === have[i].value && named(w, have[i]) && (!withOptions || `${w.value}. ${have[i].say}` === w.name));
    const show = (xs) => xs.map((x) => `${x.value} "${x.name}"`).join(', ') || 'none';
    if (!same) add('answer', `the options of the answer block (${show(have.map((h) => ({ value: h.value, name: withOptions ? `${h.name}" say "${h.say}` : h.name })))}) differ from the page's (${show(want)})`);
    const sug = picks.filter((p) => p.suggested);
    if (sug.length !== 1) add('answer', `"Which option?" marks ${sug.length} options suggested; exactly one, the recommended one`);
    else {
      if (!oneChecked(picks, sug[0])) add('answer', `the suggested option ${sug[0].input.attrs.value} is not the one checked`);
      const rec = find(root, (n) => hasClass(n, 'opt-link') && hasClass(n, 'recommended') && /^#option-[a-z]$/.test(n.attrs.href ?? ''))[0];
      const letter = rec ? rec.attrs.href.slice(-1).toUpperCase() : null;
      if (letter && sug[0].input.attrs.value !== letter) add('answer', `the suggested option ${sug[0].input.attrs.value} is not the recommended option ${letter}`);
    }
  }

  // the open questions
  const qSec = sectionById.get('questions');
  const items = qSec ? find(qSec, (n) => n.tag === 'li' && /^q-\d+$/.test(n.attrs.id ?? '')) : [];
  const pageQs = items.map((n) => n.attrs.id.slice(2));
  const blockQs = groups.filter((g) => g.attrs['data-q'] !== 'option');
  const asked = new Set(blockQs.map((g) => g.attrs['data-q']));
  const itemOf = firstBy(items, (x) => x.attrs.id.slice(2));
  for (const n of pageQs) if (!asked.has(n)) add('answer', `open question ${n} is not in the answer block (fieldset data-q="${n}")`);
  for (const g of blockQs) {
    const n = g.attrs['data-q'] ?? '';
    if (!itemOf.has(n)) { add('answer', `the answer block asks question "${n}", which the open questions do not have (#q-${n})`); continue; }
    const picks = picksOf(g, `q${n}`);
    if (picks.length < 2 || picks.length > 4) add('answer', `question ${n} has ${picks.length} ready answer(s) (radios named q${n}); two to four`);
    const sug = picks.filter((p) => p.suggested);
    if (sug.length !== 1) add('answer', `question ${n} marks ${sug.length} answers suggested; exactly one`);
    else if (!oneChecked(picks, sug[0])) add('answer', `the suggested answer of question ${n} is not the one checked`);
    for (const p of picks) {
      const say = norm(p.input.attrs['data-say'] ?? '');
      if (words(say) < 5) add('answer', `the answer "${p.text}" of question ${n} has ${say ? 'a data-say of fewer than five words' : 'no data-say'}; write the full sentence the copied answer carries`);
      if (NOT_DECIDED.test(p.text) || NOT_DECIDED.test(p.input.attrs.value ?? '')) add('answer', `the answer "${p.text}" of question ${n} is a "not decided" placeholder; offer real answers and pick the suggested one`);
    }
    const li = itemOf.get(n);
    if (!find(li, (x) => hasClass(x, 'why') && words(textOf(x)) >= 3).length) add('answer', `open question ${n} gives no reason for its suggested answer (.why)`);
  }

  // the changes, the text and the Copy button
  if (!find(form, (n) => n.tag === 'textarea' && n.attrs.name === 'changes' && inside(n, (a) => a.tag === 'label')).length) add('answer', 'no "Anything to change?" textarea (name="changes") inside its label');
  for (const id of ['answer-text', 'answer-copy', 'answer-state']) if (!find(form, (n) => n.attrs.id === id).length) add('answer', `the answer block has no #${id}`);
}

const ancestors = function* (node) { for (let n = node.parent; n; n = n.parent) yield n; };
const inside = (node, pred) => { for (let n = node.parent; n; n = n.parent) if (pred(n)) return true; return false; };

/** The markup of a node as the check sees it, for comparing an inlined mark with the survey's. */
function serialize(node) {
  if (typeof node === 'string') return node.trim();
  const attrs = Object.entries(node.attrs).map(([k, v]) => ` ${k}="${v}"`).join('');
  return `<${node.tag}${attrs}>${node.children.map(serialize).join('')}</${node.tag}>`;
}
const isLogoPart = (n) => inside(n, (a) => hasClass(a, 'd-logo'));

const BRAND_USE_NODE = serialize(parseHtml(BRAND_USE).children.find((c) => typeof c !== 'string'));

/** Clean elements and attributes only, no text: an inlined mark or the logo's one definition. */
function checkClean(mark, at, add) {
  for (const n of [mark, ...walk(mark)]) {
    if (!SVG_ELEMENTS.has(n.tag)) add('mark', `${at} holds <${n.tag}>, which an inlined mark may not`);
    for (const [k, v] of Object.entries(n.attrs)) {
      if (!SVG_ATTRIBUTES.has(k) && !(n === mark && n.tag === 'svg' && k === 'class')) add('mark', `${at} carries the attribute ${k}, which an inlined mark may not`);
      else if (!safeSvgValue(k, v)) add('mark', `${at} carries ${k}="${v}", which points outside the page or runs code`);
    }
    for (const t of n.children) if (typeof t === 'string' && t.trim()) add('mark', `${at} holds text`);
  }
}

/** The logo defined once: clean, and with survey.json beside the page the survey's own (brandDefs). */
function checkBrandSymbol(symbol, survey, add) {
  checkClean(symbol.parent, 'the logo definition (svg.brand-defs)', add);
  if (survey && 'brandDefs' in survey) {
    const theirs = survey.brandDefs ? find(parseHtml(survey.brandDefs), (n) => n.tag === 'symbol')[0] : null;
    if (!theirs) add('mark', 'survey.json defines no logo (brandDefs is null); remove svg.brand-defs and paste brandHtml');
    else if (serialize(symbol) !== serialize(theirs)) add('mark', 'the logo definition differs from survey.json brandDefs; paste it as it is');
  }
}

/** A logo: a use of the logo defined once, one svg of clean elements and attributes, or one img with a small data: image; the survey's own mark when known. */
function checkLogo(logo, id, survey, add, brandSymbol = null) {
  const kids = logo.children.filter((c) => typeof c !== 'string' || c.trim());
  const at = `#${id}: the logo (.d-logo)`;
  if (kids.length !== 1 || typeof kids[0] === 'string' || !['svg', 'img'].includes(kids[0].tag)) { add('mark', `${at} holds one svg or one img and nothing else`); return; }
  const mark = kids[0];
  if (find(mark, (n) => n.tag === 'use').length) {
    if (serialize(mark) !== BRAND_USE_NODE) add('mark', `${at} refers to something other than the logo defined once; paste brandHtml as it is`);
    else if (!brandSymbol) add('mark', `${at} refers to #brand-mark, but the page does not define it; paste survey.json brandDefs once right after <body>`);
    return;
  }
  if (mark.tag === 'svg' && survey?.brandDefs) { add('mark', `${at} inlines the logo again; define it once (brandDefs) and paste brandHtml, which refers to it`); return; }
  if (mark.tag === 'img') {
    const src = mark.attrs.src ?? '';
    const m = /^data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/=]+)$/.exec(src);
    if (!m) add('mark', `${at} img is not a data: png, jpeg, gif or webp image`);
    else if (Buffer.from(m[2], 'base64').length > RASTER_CAP) add('mark', `${at} image is over the ${RASTER_CAP} byte cap; draw the accent square instead`);
  } else checkClean(mark, at, add);
  const want = survey?.brandMark;
  if (want) {
    const theirs = want.kind === 'svg' ? want.svg : want.kind === 'raster' ? `<img src="${want.src}" alt="">` : null;
    const theirNode = theirs === null ? null : parseHtml(theirs).children.find((c) => typeof c !== 'string');
    if (theirs === null) add('mark', `${at}: survey.json draws no logo (brandMark ${want.kind}); use its brandHtml`);
    else if (!theirNode) add('mark', `${at}: survey.json brandMark holds no element to compare with; run the survey again`);
    else if (serialize(mark) !== serialize(theirNode)) add('mark', `${at} differs from the mark survey.json gives (brandMark); paste its brandHtml as it is`);
  }
}

/** A full drawing's view: phone when its window is .d-app--phone, desktop otherwise; null for a zoom. */
const viewOf = (fig) => {
  if (fig.attrs['data-zoom-of'] !== undefined) return null;
  const windows = find(fig, (n) => hasClass(n, 'd-app') && !hasClass(n, 'd-app--zoom'));
  if (!windows.length) return null;
  return windows.every((w) => hasClass(w, 'd-app--phone')) ? 'phone' : 'desktop';
};

/**
 * Mobile first: every option, every screen without options and the one design
 * shows a phone drawing of its own, then a desktop drawing; a phone drawing is
 * never inside a disclosure; all options show the same views.
 */
function checkViews({ how, screens, optionNodes, add }) {
  if (!how) return;
  const units = [...optionNodes, ...screens.filter((s) => !find(s, (n) => hasClass(n, 'option')).length)];
  const viewsOf = new Map();
  for (const unit of units) {
    const name = `${hasClass(unit, 'screen') ? 'screen' : 'option'} #${unit.attrs.id}`;
    const figs = find(unit, (n) => n.tag === 'figure' && hasClass(n, 'drawing')).map((f) => ({ f, view: viewOf(f) })).filter((x) => x.view);
    const phones = figs.filter((x) => x.view === 'phone');
    const desktops = figs.filter((x) => x.view === 'desktop');
    if (!phones.length) add('views', `${name} has no phone drawing (a .d-app--phone figure of its own); a phone view comes first, then the desktop`);
    if (!desktops.length) add('views', `${name} has no desktop drawing`);
    if (phones.length && desktops.length && figs.indexOf(phones[0]) > figs.indexOf(desktops[0])) add('views', `${name}: the phone drawing comes after the desktop one; the phone comes first`);
    for (const { f } of phones) if (inside(f, (a) => a.tag === 'details')) add('views', `${name}: the phone drawing #${f.attrs.id} is inside a disclosure; a phone view is never secondary`);
    viewsOf.set(unit, [...new Set(figs.map((x) => x.view))].sort().join('+') || 'none');
  }
  const optionViews = new Set(optionNodes.map((o) => viewsOf.get(o)));
  if (optionViews.size > 1) add('views', `options differ in which views they show (${optionNodes.map((o) => `#${o.attrs.id}: ${viewsOf.get(o)}`).join(', ')}); show every option the same way`);
}

/** The parts of references/page-parts.md: thumbnails, map, chips, disclosures, glossary, tips, paths, data lines, mapping, revision. */
function checkParts({ root, main, sectionById, drawings, screens, how, add }) {
  const english = inEnglish(root);
  const byId = new Map(find(root, (n) => n.attrs.id).map((n) => [n.attrs.id, n]));
  const full = new Map(drawings.filter((d) => d.attrs['data-zoom-of'] === undefined).map((d) => [d.attrs.id, d]));
  const pinsOf = (d) => new Set(find(d, (n) => n.attrs['data-note'] !== undefined).map((n) => n.attrs['data-note']));

  // thumbnail
  for (const mini of find(main, (n) => hasClass(n, 'mini'))) {
    const id = mini.attrs['data-mini-of'];
    const target = full.get(id);
    if (!target) add('thumbnail', `a thumbnail of "${id ?? ''}", which is not a full drawing`);
    else if (inside(target, (a) => a.tag === 'details')) add('thumbnail', `the thumbnail of "${id}" shows a drawing inside a disclosure`);
  }

  // map
  const map = sectionById.get('map');
  if (screens.length > 1 && !map) add('map', `${screens.length} screens and no map (#map)`);
  if (map) {
    const nodes = find(map, (n) => n.tag === 'a' && hasClass(n, 'map-node'));
    if (nodes.length < 2) add('map', 'a map shows two screens or more');
    const screenIds = new Set(screens.map((s) => s.attrs.id));
    for (const node of nodes) {
      const target = (node.attrs.href ?? '').replace(/^#/, '');
      if (!screenIds.has(target)) add('map', `map node #${target} is not a screen (.screen in #how)`);
      if (!find(node, (n) => hasClass(n, 'mini')).length) add('map', `map node #${target} holds no thumbnail (.mini)`);
      if (!find(node, (n) => hasClass(n, 'map-name')).length) add('map', `map node #${target} holds no name (.map-name)`);
    }
    const nodesTo = countBy(nodes, (n) => n.attrs.href);
    for (const s of screens) {
      const count = nodesTo.get(`#${s.attrs.id}`) ?? 0;
      if (count !== 1) add('map', `screen #${s.attrs.id} has ${count} map nodes; exactly one`);
    }
    if (!find(map, (n) => hasClass(n, 'map-key') && norm(textOf(n))).length) add('map', 'no line saying what the arrows mean (.map-key)');
  }

  // chips: a scope chip sits in a heading or in the top bar's page facts and gives its state to its section (the top bar's: the page)
  const isScope = (chip) => inside(chip, (a) => /^h[1-4]$/.test(a.tag) || hasClass(a, 'topbar-meta'));
  const owner = (n) => [...ancestors(n)].find((a) => a.tag === 'section' || a.tag === 'header');
  const scopes = find(main, (n) => hasClass(n, 'chip') && isScope(n));
  const topMeta = find(root, (n) => hasClass(n, 'topbar-meta'))[0];
  const pageScope = topMeta ? find(topMeta, (n) => hasClass(n, 'chip'))[0] : undefined;
  const scopeByOwner = firstBy(scopes, owner);
  const scopeOf = (chip) => {
    for (const a of ancestors(chip)) {
      if ((a.tag !== 'section' && a.tag !== 'header') || a.attrs.id === 'head') continue;
      const own = scopeByOwner.get(a);
      if (own) return own;
    }
    return pageScope ?? null;
  };
  const questions = sectionById.get('questions');
  const questionIds = new Set(questions ? find(questions, (n) => n.tag === 'li' && n.attrs.id).map((n) => n.attrs.id) : []);
  for (const chip of [...(topMeta ? find(topMeta, (n) => hasClass(n, 'chip')) : []), ...find(main, (n) => hasClass(n, 'chip'))]) {
    const state = chip.attrs['data-state'];
    if (!STATES.includes(state)) { add('chips', `a chip with state "${state ?? ''}"; one of ${STATES.join(', ')}`); continue; }
    if (english ? norm(textOf(chip)).toLowerCase() !== state : !norm(textOf(chip))) add('chips', `a chip reads "${norm(textOf(chip))}" but its state is ${state}`);
    if (isScope(chip)) continue;
    if (scopeOf(chip)?.attrs['data-state'] === state) add('chips', `a chip repeats "${state}", which its heading already gives`);
    if (state === 'open' && (chip.tag !== 'a' || !questionIds.has((chip.attrs.href ?? '').replace(/^#/, '')))) add('chips', 'an open chip links to its open question (<a class="chip" href="#q-n">)');
  }

  // disclosure
  for (const d of find(main, (n) => n.tag === 'details')) {
    if (inside(d, (a) => a.tag === 'details')) add('disclosure', 'a disclosure inside a disclosure; two levels at most');
    const summary = d.children.find((c) => typeof c !== 'string' && c.tag === 'summary');
    if (!summary || words(textOf(summary)) < 3) add('disclosure', 'a disclosure whose summary does not say what it hides');
  }

  // glossary
  const glossary = sectionById.get('glossary');
  const entries = glossary ? find(glossary, (n) => n.tag === 'dt') : [];
  const entryKeys = new Set(entries.map((n) => (n.attrs.id ?? '').replace(/^term-/, '')));
  const terms = find(main, (n) => hasClass(n, 'term'));
  const used = new Set();
  const perSection = new Set();
  const order = [...sectionById.values()];
  const orderAt = new Map(order.map((sec, i) => [sec, i]));
  // The prose of each section as it is read for one home section, made once per pair however many entries share it.
  const proseFor = new Map();
  for (const t of terms) {
    const key = t.attrs['data-term'] ?? '';
    used.add(key);
    if (!entryKeys.has(key)) add('glossary', `term "${key}" has no glossary entry (#term-${key})`);
    const sec = [...ancestors(t)].find((a) => hasClass(a, 'sec'));
    if (['overview', 'map'].includes(sec?.attrs.id)) add('glossary', `term "${key}" is marked in #${sec.attrs.id}; the ${sec.attrs.id} says it in plain words, the section that draws it introduces the term`);
    const mark = `${sec?.attrs.id}/${key}`;
    if (perSection.has(mark)) add('glossary', `term "${key}" is marked twice in #${sec?.attrs.id}; mark its first use only`);
    perSection.add(mark);
  }
  for (const dt of entries) {
    const key = (dt.attrs.id ?? '').replace(/^term-/, '');
    if (!dt.attrs.id?.startsWith('term-')) add('glossary', `entry "${norm(textOf(dt))}" needs the id term-<key>`);
    else if (!used.has(key)) add('glossary', `entry "${key}" is used by no term on the page`);
    const dd = sibling(dt, 1);
    if (!dd || dd.tag !== 'dd' || !norm(textOf(dd))) add('glossary', `entry "${key}" has no meaning (dd)`);
    // A term is met first in the section its entry links to; before it the page says the thing in plain words.
    const home = dd ? find(dd, (n) => n.tag === 'a' && /^#./.test(n.attrs.href ?? ''))[0] : undefined;
    const target = home && byId.get(home.attrs.href.slice(1));
    const homeSec = target && (hasClass(target, 'sec') ? target : [...ancestors(target)].find((a) => hasClass(a, 'sec')));
    const at = homeSec ? orderAt.get(homeSec) ?? -1 : -1;
    const term = norm(textOf(dt));
    if (at > 0 && term) {
      const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
      const re = new RegExp(`(^|[^\\p{L}\\p{N}])${esc}(e?s)?(?=$|[^\\p{L}\\p{N}])`, 'iu');
      if (!proseFor.has(homeSec)) proseFor.set(homeSec, new Map());
      const prose = proseFor.get(homeSec);
      // A link into the home section, the strip (copies of the options' drawings under their names) and the person's quoted words may use the term.
      const into = (n) => n.tag === 'a' && (n.attrs.href ?? '').startsWith('#') && [byId.get(n.attrs.href.slice(1)), ...ancestors(byId.get(n.attrs.href.slice(1)) ?? { parent: null })].includes(homeSec);
      for (const sec of order.slice(0, at)) {
        if (sec.attrs.id === 'head') continue;
        if (!prose.has(sec)) prose.set(sec, proseOf(sec, (n) => into(n) || hasClass(n, 'strip') || hasClass(n, 'request')));
        if (re.test(prose.get(sec))) add('glossary', `"${term}" appears in #${sec.attrs.id}, before #${homeSec.attrs.id}, the section its entry links to; say it in plain words there`);
      }
    }
  }

  // tips
  for (const n of find(main, (x) => x.attrs['data-tip'] !== undefined)) {
    if (!norm(n.attrs['data-tip'])) add('tips', 'an empty data-tip');
    if (inside(n, (a) => hasClass(a, 'takeaway')) || hasClass(n, 'takeaway')) add('tips', 'a tip inside a takeaway; the takeaway is understood without one');
  }

  checkFlow({ flowSec: sectionById.get('flow'), main, map, english, add });
  checkStory({ main, how, english, add });
  const guarantees = checkGuarantees({ sections: [...sectionById.values()], add });
  checkCue({ main, sections: [...sectionById.values()], screens, add });
  if (sectionById.has('mapping') && !sectionById.has('paths')) add('paths', 'the page changes an existing screen (a mapping section): it needs Paths with the Today column, two or three typical tasks, steps named by their pins');
  if (sectionById.has('paths') && !sectionById.has('mapping') && screens.length < 2) add('paths', 'a new single page has no Paths; they are for several screens or for a change to an existing page');
  checkPaths({ paths: sectionById.get('paths'), changes: sectionById.has('mapping'), byId, main, english, add });
  checkAddresses({ addresses: sectionById.get('addresses'), screens, changes: sectionById.has('mapping'), english, add });
  const drawingById = firstBy(drawings, (x) => x.attrs.id);
  const pinsByDrawing = new Map();
  for (const ref of find(main, (n) => n.tag === 'a' && hasClass(n, 'pinref'))) {
    const id = (ref.attrs.href ?? '').replace(/^#/, '');
    const d = drawingById.get(id);
    if (d && !pinsByDrawing.has(d)) pinsByDrawing.set(d, pinsOf(d));
    if (!d) add('paths', `a pin reference to "${id}", which is not a drawing`);
    else if (!pinsByDrawing.get(d).has(ref.attrs['data-n'])) add('paths', `a pin reference to pin ${ref.attrs['data-n']} of #${id}, which has no such pin`);
  }

  // data lines
  if (sectionById.has('data') && how) {
    for (const holder of screens.length ? screens : [how]) {
      if (!find(holder, (n) => hasClass(n, 'reads')).length) add('data', `${holder === how ? '#how' : `screen #${holder.attrs.id}`} has no data line (.reads) under its drawing`);
    }
  }
  for (const r of find(main, (n) => hasClass(n, 'reads'))) if (!find(r, (n) => hasClass(n, 'mark')).length) add('data', 'a data line without "exists today" or "needs a new data request" (.mark)');

  checkMapping({ mapping: sectionById.get('mapping'), english, add });
  checkDensity({ sections: [...sectionById.values()], add });
  checkLinksAndIds({ root, byId, add });

  // revision
  const head = sectionById.get('head');
  if (head) {
    const meta = topMeta;
    const changed = find(head, (n) => hasClass(n, 'changed'))[0];
    const n = revisionOf(meta) ?? 1;
    const since = (text) => (english ? text.startsWith(`Changed since r${n - 1}:`) : new RegExp(`(^|[^\\w])r${n - 1}\\s*:`).test(text));
    if (n > 1) {
      if (!changed || !since(norm(textOf(changed)))) add('revision', `revision r${n} needs the line "Changed since r${n - 1}: ..." (.changed) in the head`);
      else {
        const links = find(changed, (x) => x.tag === 'a');
        if (!links.length) add('revision', 'the "Changed since" line links to the changed sections');
        for (const a of links) if (!byId.has((a.attrs.href ?? '').replace(/^#/, ''))) add('revision', `the "Changed since" line links to ${a.attrs.href}, which does not exist`);
      }
    } else if (changed) add('revision', 'r1 has no "Changed since" line');
  }
  return { guarantees };
}

/**
 * The flow (references/page-parts.md, "Flow"): boxes on a grid, steps that
 * link their drawings or say they are outside the app, one start, a way in
 * and a way out for every box, labelled ways out of a decision, every branch
 * reaching an end, the refusal or error branch drawn.
 */
function checkFlow({ flowSec, main, map, english, add }) {
  const flows = find(main, (n) => n.tag === 'div' && hasClass(n, 'flow'));
  if (!flowSec) { if (flows.length) add('flow', 'a flow lives in its own section #flow'); return; }
  const flow = flows.find((f) => inside(f, (a) => a === flowSec));
  if (!flow || flows.length !== 1) add('flow', '#flow holds the page\'s one flow (div.flow)');
  if (!flow) return;
  const cols = Number(flow.attrs['data-cols'] ?? 3);
  if (![2, 3, 4].includes(cols)) add('flow', `data-cols="${flow.attrs['data-cols']}"; a flow has 2, 3 or 4 columns`);
  const KINDS = ['flow-step', 'flow-decision', 'flow-end'];
  const nodes = find(flow, (n) => KINDS.some((k) => hasClass(n, k)));
  const edges = find(flow, (n) => hasClass(n, 'flow-edge'));
  const label = (n) => norm(textOf(find(n, (x) => hasClass(x, 'flow-name'))[0] ?? n));
  const ids = new Map();
  const cells = new Map();
  for (const n of nodes) {
    const id = n.attrs.id;
    if (!id) { add('flow', `the box "${label(n)}" has no id`); continue; }
    ids.set(id, n);
    const row = Number(n.attrs['data-row']); const col = Number(n.attrs['data-col']);
    if (!Number.isInteger(row) || row < 1 || row > 10 || !Number.isInteger(col) || col < 1 || col > cols) add('flow', `the box "${label(n)}" is off the grid: data-row 1 to 10, data-col 1 to ${cols}`);
    else if (cells.has(`${row}/${col}`)) add('flow', `"${label(n)}" and "${label(cells.get(`${row}/${col}`))}" sit on one cell (row ${row}, column ${col})`);
    else cells.set(`${row}/${col}`, n);
  }
  const mapNames = map ? new Set(find(map, (n) => hasClass(n, 'map-name')).map((n) => norm(textOf(n)))) : null;
  const steps = nodes.filter((n) => hasClass(n, 'flow-step'));
  const drawingById = firstBy(find(main, (n) => n.tag === 'figure' && hasClass(n, 'drawing')), (n) => n.attrs.id);
  for (const s of steps) {
    if (s.attrs['data-outside'] !== undefined) {
      if (s.tag === 'a') add('flow', `the step "${label(s)}" is outside the app and links nowhere`);
      continue;
    }
    const target = s.tag === 'a' ? (s.attrs.href ?? '').replace(/^#/, '') : '';
    const drawing = target && drawingById.get(target);
    if (!drawing) add('flow', `the step "${label(s)}" links no drawing; link the drawing that shows it, or mark it outside the app (data-outside)`);
    if (!find(s, (n) => hasClass(n, 'flow-name')).length) add('flow', `the step "${label(s)}" has no name (.flow-name)`);
    else if (mapNames && !mapNames.has(label(s))) add('flow', `the step "${label(s)}" is not a screen of the map (${[...mapNames].join(', ')})`);
    else if (!mapNames && drawing) {
      const cap = find(drawing, (n) => n.tag === 'figcaption')[0];
      if (!cap || !norm(textOf(cap)).toLowerCase().includes(label(s).toLowerCase())) add('flow', `the step "${label(s)}" is not the name of the drawing it links (#${target}'s caption); a page without a map names a step by its screen's drawing`);
    }
  }
  const out = new Map(nodes.map((n) => [n, []]));
  const into = new Map(nodes.map((n) => [n, []]));
  for (const e of edges) {
    const from = ids.get(e.attrs['data-from']); const to = ids.get(e.attrs['data-to']);
    if (!from || !to) { add('flow', `a connector from "${e.attrs['data-from'] ?? ''}" to "${e.attrs['data-to'] ?? ''}" names a box the flow lacks`); continue; }
    out.get(from).push({ e, to });
    into.get(to).push(from);
    if (words(textOf(e)) > 5) add('flow', `the connector label "${norm(textOf(e))}" runs past five words`);
  }
  const starts = nodes.filter((n) => n.attrs['data-start'] !== undefined);
  if (starts.length !== 1) add('flow', `${starts.length} starts; a flow has one (data-start)`);
  if (!english && starts.some((n) => !norm(n.attrs['data-start']))) add('flow', 'the start has no word in data-start: the word shown above it, "Start" in the page\'s language');
  for (const s of starts) if (!hasClass(s, 'flow-step')) add('flow', `the start "${label(s)}" is not a step`);
  for (const n of nodes) {
    const end = hasClass(n, 'flow-end');
    if (n.attrs['data-start'] === undefined && !into.get(n).length) add('flow', `"${label(n)}" has no way in`);
    if (end) {
      if (!['done', 'stop'].includes(n.attrs['data-end'])) add('flow', `the end "${label(n)}" needs data-end="done" or "stop"`);
      if (out.get(n).length) add('flow', `the end "${label(n)}" leads on; an end has no way out`);
    } else if (!out.get(n).length) add('flow', `"${label(n)}" has no way out; it leads to a box or is an end (.flow-end)`);
    if (hasClass(n, 'flow-decision')) {
      if (out.get(n).length < 2) add('flow', `the decision "${label(n)}" has ${out.get(n).length} way out; two or more`);
      for (const { e, to } of out.get(n)) if (!norm(textOf(e))) add('flow', `the way out of "${label(n)}" to "${label(to)}" has no label`);
    }
  }
  if (starts.length === 1) {
    const seen = new Set([starts[0]]);
    for (const queue = [starts[0]]; queue.length;) for (const { to } of out.get(queue.shift())) if (!seen.has(to)) { seen.add(to); queue.push(to); }
    for (const n of nodes) if (!seen.has(n)) add('flow', `"${label(n)}" cannot be reached from the start`);
  }
  const ends = nodes.filter((n) => hasClass(n, 'flow-end'));
  const reach = new Set(ends);
  for (const queue = [...ends]; queue.length;) for (const from of into.get(queue.shift())) if (!reach.has(from)) { reach.add(from); queue.push(from); }
  for (const n of nodes) if (!reach.has(n)) add('flow', `no end is reached from "${label(n)}": every branch reaches an end`);
  const decisions = nodes.filter((n) => hasClass(n, 'flow-decision'));
  if (decisions.length && !ends.some((n) => n.attrs['data-end'] === 'stop')) add('flow', 'a flow with a decision draws its refusal or error branch: an end with data-end="stop"');
  if (!decisions.length && steps.length < 3) add('flow', 'a flow of fewer than three steps and no decision says nothing the map does not; leave it out');
}

/** A storyboard (references/page-parts.md, "Storyboard"): three to six still frames of one screen, numbered captions, at a named width. */
function checkStory({ main, how, english, add }) {
  const options = how ? find(how, (n) => n.tag === 'section' && hasClass(n, 'option') && n.attrs['data-option'] !== undefined) : [];
  const withStory = options.filter((o) => find(o, (n) => n.tag === 'ol' && hasClass(n, 'story')).length);
  if (withStory.length && withStory.length < options.length) {
    const rec = find(main, (n) => hasClass(n, 'opt-link') && hasClass(n, 'recommended'))[0];
    const recId = rec ? (rec.attrs.href ?? '').replace(/^#/, '') : null;
    if (withStory.length > 1 || withStory[0].attrs.id !== recId) add('storyboard', `storyboards in ${withStory.map((o) => `#${o.attrs.id}`).join(', ')} but not in every option: one storyboard sits in the recommended option when the interaction is the same in all, else one per option`);
    else if (!find(withStory[0], (n) => n.tag === 'p' && hasClass(n, 'story-same') && norm(textOf(n))).length) add('storyboard', `the storyboard in #${withStory[0].attrs.id} is the only one: add the line (p.story-same) saying it is the same in the other options`);
  }
  for (const story of find(main, (n) => n.tag === 'ol' && hasClass(n, 'story'))) {
    const holder = [...ancestors(story)].find((a) => a.tag === 'section' && (hasClass(a, 'screen') || hasClass(a, 'option')));
    const name = `the storyboard "${story.attrs['aria-label'] ?? ''}"`;
    if (!holder) add('storyboard', `${name} sits outside a screen, an option or the design`);
    if (inside(story, (a) => a.tag === 'details')) add('storyboard', `${name} is inside a disclosure`);
    if (!norm(story.attrs['aria-label'] ?? '')) add('storyboard', 'a storyboard (ol.story) without an aria-label naming what it shows');
    const width = story.attrs['data-width'];
    const before = sibling(story, -1);
    if (!['phone', 'desktop'].includes(width)) add('storyboard', `${name} needs data-width="phone" or "desktop": the width it is drawn at`);
    else if (!before || before.tag !== 'h4' || !hasClass(before, 'view-name') || !(english ? new RegExp(`on a ${width}`, 'i') : /\S/).test(textOf(before))) add('storyboard', `${name}: the heading right before it (h4.view-name) says "on a ${width}"`);
    const frames = story.children.filter((c) => typeof c !== 'string');
    if (frames.length < 3 || frames.length > 6) add('storyboard', `${name} has ${frames.length} frames; three to six`);
    frames.forEach((li, i) => {
      if (li.tag !== 'li' || !hasClass(li, 'story-frame')) { add('storyboard', `${name}: frame ${i + 1} is not an li.story-frame`); return; }
      if (find(li, (n) => n.tag === 'figure' && hasClass(n, 'drawing')).length !== 1) add('storyboard', `${name}: frame ${i + 1} holds one drawing`);
      const cap = find(li, (n) => hasClass(n, 'story-cap'))[0];
      const no = cap ? find(cap, (n) => hasClass(n, 'story-no'))[0] : undefined;
      if (!cap || !no || norm(textOf(no)) !== String(i + 1)) add('storyboard', `${name}: frame ${i + 1} has no caption (.story-cap) numbered ${i + 1} (.story-no)`);
      else if (words(proseOf(cap, (n) => n === no)) > 16) add('storyboard', `${name}: the caption of frame ${i + 1} runs past sixteen words`);
    });
  }
}

// A promise the proposal makes: never, always, cannot, can only, only once, only ... can.
const GUARANTEE = /\b(?:never|always|cannot|can['’]t|can not|can only|may only|only once|only\b[^.!?;:]{0,30}?\b(?:can|may))\b/i;
const GUARANTEE_FREE = new Set(['asked', 'questions', 'glossary', 'answer']);
const BLOCKS = new Set(['p', 'li', 'dd', 'dt', 'td', 'th', 'figcaption', 'h2', 'h3', 'h4', 'summary']);

/**
 * A guarantee is drawn as its mechanism: each sentence that promises it links the pin of what makes it true, or its open
 * question. Returns whether the page draws one: a promising sentence that links a pin (CHOICE.md's "guarantees: added").
 */
function checkGuarantees({ sections, add }) {
  const MARK = '\u0001';
  const PIN = '\u0002';
  let drawn = false;
  const skip = (n) => ['script', 'style', 'code', 'pre', 'figure', 'nav'].includes(n.tag) || ['notes', 'canvas', 'request', 'story', 'flow-fig'].some((c) => hasClass(n, c));
  // The page's own copies of the two marks are taken out first (checkText reports them), so only a link makes a mark.
  const unmarked = (s) => s.replaceAll(MARK, '').replaceAll(PIN, '');
  const flat = (node) => node.children.map((c) => {
    if (typeof c === 'string') return unmarked(c);
    if (skip(c)) return ' ';
    if (c.tag === 'a' && hasClass(c, 'pinref')) return `${unmarked(textOf(c))}${MARK}${PIN}`;
    return c.tag === 'a' && /^#q-\d+$/.test(c.attrs.href ?? '') ? `${unmarked(textOf(c))}${MARK}` : flat(c);
  }).join('');
  for (const sec of sections) {
    if (GUARANTEE_FREE.has(sec.attrs.id)) continue;
    // A holder is a block with no block inside it: mark each block's ancestors once, stopping at one already marked.
    const below = new Set();
    for (const n of walk(sec)) if (BLOCKS.has(n.tag)) for (let a = n.parent; a && a !== sec && !below.has(a); a = a.parent) below.add(a);
    const holders = find(sec, (n) => BLOCKS.has(n.tag) && !below.has(n) && ![...ancestors(n)].some(skip));
    for (const h of holders) {
      for (const sentence of norm(flat(h)).match(/[^.!?]+[.!?]*/g) ?? []) {
        const said = sentence.replaceAll(MARK, '').replaceAll(PIN, '');
        if (GUARANTEE.test(said) && sentence.includes(PIN)) drawn = true;
        if (GUARANTEE.test(said) && !sentence.includes(MARK)) add('guarantee', `#${sec.attrs.id}: "${norm(said).slice(0, 80)}" promises a guarantee; link the pin of what makes it true (a.pinref), or its open question`);
      }
    }
  }
  return drawn;
}

/** The position cue (references/page-parts.md, "Position cue"): past seven sections or three screens, a list of every section right after the head. */
function checkCue({ main, sections, screens, add }) {
  const after = sections.filter((s) => s.attrs.id !== 'head');
  const long = after.length > 7 || screens.length > 3;
  const kids = main.children.filter((c) => typeof c !== 'string');
  const cues = find(main, (n) => hasClass(n, 'cue'));
  const cue = cues.find((n) => n.tag === 'nav' && n.parent === main);
  if (!cue) {
    if (long) add('cue', `${after.length} sections and ${screens.length} screens: past seven sections or three screens the page needs its position cue (nav.cue right after the head)`);
    if (cues.length) add('cue', 'the position cue is a nav.cue right in main, after the head');
    return;
  }
  if (!long) add('cue', `${after.length} sections and ${screens.length} screens: a page this short has no position cue`);
  const head = kids.find((k) => k.attrs.id === 'head');
  if (head && kids.indexOf(cue) !== kids.indexOf(head) + 1) add('cue', 'the position cue sits right after the head');
  if (!norm(cue.attrs['aria-label'] ?? '')) add('cue', 'the position cue (nav.cue) has no aria-label');
  const targets = find(cue, (n) => n.tag === 'a').map((a) => (a.attrs.href ?? '').replace(/^#/, ''));
  const ids = after.map((s) => s.attrs.id);
  const idSet = new Set(ids);
  const targetSet = new Set(targets);
  for (const t of targets) if (!idSet.has(t)) add('cue', `the cue entry #${t} points at no section of the page`);
  for (const id of ids) if (!targetSet.has(id)) add('cue', `section #${id} is missing from the cue`);
  const listed = targets.filter((t) => idSet.has(t));
  if (listed.join() !== ids.filter((id) => targetSet.has(id)).join()) add('cue', 'the cue lists the sections out of the page\'s order');
}

/** Text of a node as a reader meets it: no script, style, code or pre, and nothing under a node skip() names. */
function proseOf(node, skip = () => false) {
  return node.children.map((c) => {
    if (typeof c === 'string') return ` ${c} `;
    if (['script', 'style', 'code', 'pre'].includes(c.tag) || skip(c)) return ' ';
    return proseOf(c, skip);
  }).join('');
}
/** Text as a browser shows it: character references decoded, the arrow names among them. */
const shownText = (raw) => decodeHtml(raw.replace(/&([a-zA-Z]{2,20});/g, (m, name) => (Object.hasOwn(ARROW_REFS, name) ? ARROW_REFS[name] : m)));
/** Abbreviations whose period ends no sentence. */
const ABBREVIATIONS = /\b(?:e\.g|i\.e|etc|vs|cf|approx|incl|Dr|Mr|Mrs|Ms|St|No)\.(?=\s)/g;
/**
 * One sentence: it ends with ".", "!" or "?", and no break stands inside it.
 * A break is ".", "!" or "?" before more text, whatever starts it (a capital,
 * a lower-case word, a number); a period after a common abbreviation is no
 * break. A run of periods (an ellipsis) is a break only before a capital:
 * "counts... then" is one sentence, "counts... Then" two.
 */
const sentenceFindings = (t) => {
  const plain = t.replace(ABBREVIATIONS, (m) => m.slice(0, -1));
  return !/[.!?]$/.test(t) || /(?:(?<!\.)\.|[!?])\s+\S|\.\.\s+\p{Lu}/u.test(plain) ? 'is not one sentence' : null;
};
const contentWords = (t) => t.toLowerCase().match(/[\p{L}\p{N}]+/gu)?.filter((w) => w.length > 2 && !STOP.has(w)) ?? [];

/** Visible text left from the template, garbled characters, and placeholders in aria-labels. */
function checkText({ root, add }) {
  const body = find(root, (n) => n.tag === 'body')[0] ?? root;
  const text = proseOf(body);
  const left = UNFILLED.exec(text.replace(ADDRESS_FORM_HTML, ' '));
  if (left) add('text', `template text "${left[0]}" left in the page`);
  const bad = GARBLED.exec(text);
  if (bad) add('text', `garbled characters ${JSON.stringify(bad[0])}: the text was saved in one encoding and read in another`);
  // A control character (C0, DEL or C1) other than tab, line feed, form feed and carriage return shows as nothing, in
  // the text or in an attribute value, and the check's own reading of sentences uses two of them as private marks
  // (checkGuarantees).
  const controls = new Set();
  const scan = (s) => { for (const m of s.matchAll(/(?![\t\n\f\r])\p{Cc}/gu)) controls.add(`U+${m[0].charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`); };
  for (const n of [root, ...walk(root)]) {
    if (n.tag === 'script' || n.tag === 'style') continue;
    for (const c of n.children) if (typeof c === 'string') scan(c);
    for (const [, v] of n.list ?? []) scan(v);
  }
  if (controls.size) add('text', `the text holds the control character${controls.size > 1 ? 's' : ''} ${[...controls].join(', ')}, which a reader cannot see; remove ${controls.size > 1 ? 'them' : 'it'}`);
  for (const n of walk(root)) {
    // A placeholder written as <what goes here> is read as an element a browser shows as nothing.
    if (n.ns === 'html' && !HTML_ELEMENTS.has(n.tag) && !NO_SUCH_ELEMENT.has(n.tag) && !NOT_ALLOWED.has(n.tag)) add('text', `<${n.tag}${n.list.length ? ` ${n.list.map(([k]) => k).join(' ')}` : ''}> is not an HTML element, so a browser shows nothing for it; write the text it stands for, or escape "<" as &lt;`);
    const label = n.attrs['aria-label'];
    if (label && /<[a-zA-Z][a-zA-Z0-9 ,.'-]{0,60}>|\bREPLACE\b|\bTODO\b|\{\{/.test(label)) add('text', `aria-label "${label}" still holds template text`);
  }
}

/** Every section but the head and the glossary: an h2, then one takeaway sentence of thirty words at most that is not its heading again. */
function checkTakeaways({ sections, add }) {
  for (const sec of sections) {
    const id = sec.attrs.id;
    if (id === 'head') continue;
    const kids = sec.children.filter((c) => typeof c !== 'string');
    const h2 = kids[0]?.tag === 'h2' ? kids[0] : null;
    if (!h2) { add('sections', `#${id} does not start with its heading (h2)`); continue; }
    if (id === 'glossary' || id === 'answer') continue;
    const take = kids[1];
    if (!take || take.tag !== 'p' || !hasClass(take, 'takeaway')) { add('takeaway', `#${id} has no takeaway (p.takeaway) right under its heading: one sentence saying what the section settles`); continue; }
    const t = norm(textOf(take));
    const wrong = sentenceFindings(t);
    if (wrong) add('takeaway', `the takeaway of #${id} ${wrong}`);
    if (words(t) > TAKEAWAY_MAX) add('takeaway', `the takeaway of #${id} runs ${words(t)} words; ${TAKEAWAY_MAX} at most`);
    const heading = new Set(contentWords(textOf(h2)));
    if (contentWords(t).every((w) => heading.has(w))) add('takeaway', `the takeaway of #${id} only says its heading again; say what the section settles`);
  }
}

/** Prose a section shows beside its drawings: at most SECTION_MAX words per section, per screen and per option. */
function checkDensity({ sections, add }) {
  const skip = (n) => /^h[1-6]$/.test(n.tag) || n.tag === 'figure' || n.tag === 'table' || n.tag === 'details'
    || (n.tag === 'ol' && hasClass(n, 'notes')) || ['takeaway', 'request', 'canvas', 'mini', 'strip', 'map', 'overview', 'cards', 'opt-link', 'screen', 'option', 'answer', 'ans-hint', 'why', 'flow-fig', 'story', 'cue'].some((c) => hasClass(n, c));
  const units = [];
  for (const sec of sections) {
    if (sec.attrs.id === 'head') continue;
    units.push([`#${sec.attrs.id}`, sec]);
    for (const u of find(sec, (n) => n.tag === 'section' && (hasClass(n, 'screen') || hasClass(n, 'option')))) units.push([`#${u.attrs.id}`, u]);
  }
  for (const [name, node] of units) {
    const own = { ...node, children: node.children };
    const count = words(proseOf(own, skip));
    if (count > SECTION_MAX) add('wordy', `${name} shows ${count} words of prose; ${SECTION_MAX} at most: draw it, move it to a note, or cut it`);
  }
}

/** Ids used once; every in-page link names an id that exists; labels in tables short; no arrow written as text in a label. */
function checkLinksAndIds({ root, byId, add }) {
  const seen = new Map();
  for (const n of walk(root)) if (n.attrs.id) seen.set(n.attrs.id, (seen.get(n.attrs.id) ?? 0) + 1);
  for (const [id, count] of seen) if (count > 1) add('ids', `id "${id}" is used ${count} times`);
  for (const a of find(root, (n) => n.tag === 'a' && /^#./.test(n.attrs.href ?? ''))) {
    if (!byId.has(a.attrs.href.slice(1))) add('links', `a link to ${a.attrs.href}, which the page does not have`);
  }
  for (const table of find(root, (n) => n.tag === 'table' && ['mapping', 'paths-tbl', 'addresses'].some((c) => hasClass(n, c)))) {
    for (const cell of find(table, (n) => (n.tag === 'td' || n.tag === 'th') && inside(n, (a) => a.tag === 'tbody'))) {
      const count = words(proseOf(cell));
      if (count > LABEL_MAX) add('label', `"${norm(proseOf(cell)).slice(0, 50)}" runs ${count} words in a table cell; ${LABEL_MAX} at most`);
    }
  }
  const labelled = find(root, (n) => hasClass(n, 'canvas') || (n.tag === 'ol' && hasClass(n, 'notes')) || n.tag === 'table' || hasClass(n, 'map') || hasClass(n, 'flow') || hasClass(n, 'story'));
  const isLabelled = new Set(labelled);
  for (const holder of labelled.filter((h) => !inside(h, (a) => isLabelled.has(a)))) {
    const arrow = ARROW.exec(shownText(proseOf(holder)));
    if (arrow) add('label', `"${arrow[0]}" written in a label; draw the relation, or name it in words`);
  }
}

/** The mapping of today's page: Part, Today, Proposed; a change mark on every row; a reason for a removal; the legend; today's page drawn in a disclosure. */
function checkMapping({ mapping, english, add }) {
  if (!mapping) return;
  const table = find(mapping, (n) => n.tag === 'table' && hasClass(n, 'mapping'))[0];
  if (!table) { add('mapping', 'no mapping table (table.mapping)'); return; }
  const heads = find(table, (n) => n.tag === 'th' && inside(n, (a) => a.tag === 'thead')).map((n) => norm(textOf(n)));
  if (english ? heads.join('|') !== 'Part|Today|Proposed' : heads.length !== 3) add('mapping', 'the mapping table has the columns Part, Today and Proposed');
  if (!english && !headsEveryColumn(table)) add('mapping', 'the mapping table has a column without a heading (th in thead, with text)');
  const rows = find(table, (n) => n.tag === 'tr' && inside(n, (a) => a.tag === 'tbody'));
  if (!rows.length) add('mapping', 'the mapping table has no part of today\'s page');
  const used = new Set();
  for (const tr of rows) {
    const th = find(tr, (n) => n.tag === 'th')[0];
    const cells = find(tr, (n) => n.tag === 'td');
    const part = th ? norm(textOf(th)) : '';
    if (!part || cells.length !== 2 || !norm(textOf(cells[0]))) add('mapping', `a mapping row needs the part (th), where it is today and where it goes${part ? `: "${part}"` : ''}`);
    const change = tr.attrs['data-change'];
    if (!CHANGES.includes(change)) { add('mapping', `the row "${part}" has no change mark (data-change: ${CHANGES.join(', ')})`); continue; }
    used.add(change);
    const proposed = cells[1] ? norm(textOf(cells[1])) : '';
    if (change === 'removed' && words(proposed) < 3) add('mapping', `the removed part "${part}" does not say why it goes`);
    if (change !== 'removed' && !proposed) add('mapping', `the row "${part}" does not say where it goes`);
  }
  const legend = find(mapping, (n) => hasClass(n, 'legend'))[0];
  for (const change of used) {
    if (!legend || !find(legend, (n) => hasClass(n, 'swatch') && n.attrs['data-change'] === change).length) add('mapping', `the legend (.legend) does not name the mark "${change}" the table uses`);
  }
  const today = find(mapping, (n) => n.tag === 'details')[0];
  if (!today || !find(today, (n) => n.tag === 'figure' && hasClass(n, 'drawing')).length) add('mapping', 'today\'s page, drawn full size, goes in a disclosure (details) in this section');
}

/** The paths table: a row per task, numbered step cells with the screen, the pin and what is used; today's way when an existing screen changes. */
function checkPaths({ paths, changes, byId, main, english, add }) {
  for (const m of find(main, (n) => hasClass(n, 'longer'))) {
    if (m.attrs['aria-hidden'] !== 'true' && !norm(m.attrs['aria-label'] ?? '')) add('paths', 'a "!" mark (.longer) without an aria-label saying what it means');
  }
  if (!paths) return;
  const table = find(paths, (n) => n.tag === 'table' && hasClass(n, 'paths-tbl'))[0];
  if (!table) { add('paths', 'no paths table (table.paths-tbl): a row per task, a numbered cell per step'); return; }
  const heads = find(table, (n) => n.tag === 'th' && inside(n, (a) => a.tag === 'thead')).map((n) => norm(textOf(n)));
  const rows = find(table, (n) => n.tag === 'tr' && inside(n, (a) => a.tag === 'tbody'));
  const hasToday = english ? heads.includes('Today') : rows.some((tr) => find(tr, (n) => n.tag === 'td' && hasClass(n, 'today')).length);
  if (!english && !headsEveryColumn(table)) add('paths', 'the paths table has a column without a heading (th in thead, with text)');
  if (changes && !hasToday) add('paths', 'the page changes an existing screen; the paths table needs a Today column');
  if (!rows.length) add('paths', 'the paths table has no task');
  for (const tr of rows) {
    const th = find(tr, (n) => n.tag === 'th')[0];
    const mark = th ? find(th, (n) => hasClass(n, 'longer'))[0] : undefined;
    const name = th ? norm(proseOf(th, (n) => hasClass(n, 'longer'))) : '';
    if (!name) add('paths', 'a path row without its task (th scope="row")');
    const steps = find(tr, (n) => n.tag === 'td' && hasClass(n, 'step'));
    if (steps.length < 2) add('paths', `the task "${name}" has fewer than two steps`);
    steps.forEach((td, i) => {
      const no = find(td, (n) => hasClass(n, 'step-no'))[0];
      if (!no || norm(textOf(no)) !== String(i + 1)) add('paths', `step ${i + 1} of "${name}" does not show its number ${i + 1} (.step-no)`);
      if (!find(td, (n) => hasClass(n, 'step-screen') && norm(textOf(n))).length) add('paths', `step ${i + 1} of "${name}" does not name its screen (.step-screen)`);
      if (!find(td, (n) => n.tag === 'a' && hasClass(n, 'pinref')).length) add('paths', `step ${i + 1} of "${name}" has no pin (a.pinref) of the control used`);
      if (!find(td, (n) => hasClass(n, 'step-what') && norm(textOf(n))).length) add('paths', `step ${i + 1} of "${name}" does not say what is used there (.step-what)`);
    });
    const today = find(tr, (n) => n.tag === 'td' && hasClass(n, 'today'))[0];
    if (hasToday) {
      if (!today || !norm(textOf(today))) add('paths', `the task "${name}" has no Today cell saying how it goes today`);
      else if (!/^\d+$/.test(today.attrs['data-steps'] ?? '')) add('paths', `the Today cell of "${name}" has no count of steps (data-steps)`);
      else {
        const before = Number(today.attrs['data-steps']);
        const longer = before > 0 && steps.length > before;
        if (longer && !mark) add('paths', `"${name}" takes ${steps.length} steps, today ${before}: mark it with "!" (.longer) linked to its open question`);
        if (!longer && mark) add('paths', `"${name}" carries the "!" mark but takes no more steps than today`);
      }
    } else if (mark) add('paths', 'a "!" mark with no Today column to compare against');
    if (mark && (!/^#q-\d+$/.test(mark.attrs.href ?? '') || !byId.has(mark.attrs.href.slice(1)))) add('paths', `the "!" mark of "${name}" links to no open question`);
  }
}

/** The addresses: a row per screen with its address, the base lines when there is more than one base, today's same link when a screen changes, a closing note. */
function checkAddresses({ addresses, screens, changes, english, add }) {
  if (!addresses) return;
  const table = find(addresses, (n) => n.tag === 'table' && hasClass(n, 'addresses'))[0];
  if (!table) { add('addresses', 'no addresses table (table.addresses): a row per screen'); return; }
  const heads = find(table, (n) => n.tag === 'th' && inside(n, (a) => a.tag === 'thead')).map((n) => norm(textOf(n)));
  if (english) for (const h of ['Screen', 'Address']) if (!heads.includes(h)) add('addresses', `the addresses table has no "${h}" column`);
  if (!english && heads.length < 2) add('addresses', 'the addresses table has no screen and address columns');
  if (!english && !headsEveryColumn(table)) add('addresses', 'the addresses table has a column without a heading (th in thead, with text)');
  const todayOpens = english ? heads.includes('Today the same link opens') : find(table, (n) => n.tag === 'td' && hasClass(n, 'today-opens')).length > 0;
  if (changes && !todayOpens) add('addresses', 'the page changes an existing screen; the table needs the column "Today the same link opens"');
  const rows = find(table, (n) => n.tag === 'tr' && inside(n, (a) => a.tag === 'tbody'));
  const want = Math.max(screens.length, 1);
  if (rows.length < want) add('addresses', `${rows.length} address rows for ${want} screens; every screen has its row`);
  for (const tr of rows) {
    const th = find(tr, (n) => n.tag === 'th')[0];
    if (!th || !norm(textOf(th)) || !find(tr, (n) => n.tag === 'code').length) add('addresses', 'an address row needs its screen (th) and its address (code)');
  }
  const bases = find(addresses, (n) => hasClass(n, 'bases'))[0];
  if (bases) {
    const lines = bases.children.filter((c) => typeof c !== 'string');
    if (lines.length < 2) add('addresses', 'base lines (.bases) are for more than one base; with one base the table gives the whole address');
    for (const line of lines) if (!find(line, (n) => hasClass(n, 'base-tag')).length || !find(line, (n) => n.tag === 'code').length) add('addresses', 'a base line needs its tag (.base-tag) and its address (code)');
  }
  const order = [...walk(addresses)];
  if (!order.slice(order.indexOf(table)).some((n) => n.tag === 'p' && hasClass(n, 'note') && norm(textOf(n)))) add('addresses', 'no closing note (p.note) after the table: what a shared link keeps, and what Back does');
}

const CHOICE_FIELDS = [
  'Page id', 'Revision', 'Replaces', 'Status', 'Created', 'Proposal',
  'Request', 'Purpose', 'Users', 'Main task', 'Assumptions', 'Non-goals',
  'Design', 'Recommended', 'Open questions', 'Ready answers', 'Decisions', 'Reuses', 'Optional parts',
  'Kit version', 'Template versions', 'Survey',
  "Person's words", 'Chosen', 'Answers', 'Requested changes', 'Selected on',
  'Route', 'Menu place', 'Regions', 'Blocks', 'Data fields', 'States to build', 'Kit gaps',
];
const SELECTION_FIELDS = ["Person's words", 'Chosen', 'Answers', 'Requested changes', 'Selected on', 'Route', 'Menu place', 'Regions', 'Blocks', 'Data fields', 'States to build', 'Kit gaps'];
const NONE_YET = 'none yet';
const STATUSES = ['awaiting selection', 'selected', 'replaced'];

function readFields(text) {
  const fields = new Map();
  for (const label of CHOICE_FIELDS) {
    const m = new RegExp(`^- ${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:[ \\t]*(.*)$`, 'm').exec(text);
    if (m) fields.set(label, m[1].trim());
  }
  return fields;
}

/** Findings for CHOICE.md against the options of its page. */
// The optional parts CHOICE.md accounts for, by the name the field uses, and the key checkPage reports.
const OPTIONAL_PARTS = [['flow', 'flow'], ['storyboard', 'storyboard'], ['guarantees', 'guarantees'], ['position cue', 'cue']];

export function checkChoice(text, { options = [], pageId, revision, parts = null } = {}) {
  const findings = [];
  const add = (message) => findings.push(`[choice] ${message}`);
  const fields = readFields(text);
  for (const label of CHOICE_FIELDS) {
    if (!fields.has(label)) add(`field "${label}" is missing`);
    else if (fields.get(label) === '') add(`field "${label}" is empty; write "none" when there is nothing`);
  }
  // Inline code may name a placeholder on purpose (`<revision-dir>`), and so may an address form (/?screen=<route>); field values may not.
  for (const m of new Set(text.replace(/`[^`\n]*`/g, '').replace(ADDRESS_FORM_TEXT, ' ').match(/<[a-z@][^<>\n]*>/gi) ?? [])) add(`placeholder ${m} left`);
  if (pageId && fields.has('Page id') && fields.get('Page id') !== pageId) add(`Page id "${fields.get('Page id')}" is not the folder's "${pageId}"`);
  if (revision && fields.has('Revision') && fields.get('Revision') !== revision) add(`Revision "${fields.get('Revision')}" is not the folder's "${revision}"`);
  const revNo = Number(/^r(\d+)$/.exec(fields.get('Revision') ?? '')?.[1] ?? 0);
  if (revNo && fields.has('Replaces')) {
    const want = revNo > 1 ? `r${revNo - 1}` : 'none';
    if (fields.get('Replaces') !== want) add(`Replaces is "${fields.get('Replaces')}"; revision r${revNo} replaces ${want}`);
  }
  // Optional parts: each one considered, "added" or "not added" with its reason, and what the page has
  if (fields.has('Optional parts') && fields.get('Optional parts') !== '') {
    const said = new Map();
    for (const item of fields.get('Optional parts').split(';')) {
      const m = /^\s*([a-z][a-z ]*?):\s*(added|not added)\b,?\s*(.*)$/i.exec(item);
      if (m) said.set(m[1].toLowerCase(), { added: m[2].toLowerCase() === 'added', why: m[3].trim() });
    }
    for (const [name, key] of OPTIONAL_PARTS) {
      const entry = said.get(name);
      if (!entry) { add(`Optional parts does not say whether the ${name} was added ("${name}: added, <why>" or "${name}: not added, <why>")`); continue; }
      if (entry.why.split(/\s+/).filter(Boolean).length < 3) add(`Optional parts: the ${name} needs its reason, three words or more`);
      const was = name.endsWith('s') ? 'were' : 'was';
      if (parts && key && entry.added !== parts[key]) add(`Optional parts says the ${name} ${was} ${entry.added ? '' : 'not '}added, but the page ${parts[key] ? 'has' : 'has no'} ${name}`);
    }
  }
  const status = fields.get('Status');
  if (status !== undefined && !STATUSES.includes(status)) add(`unknown Status "${status}"; one of ${STATUSES.join(', ')}`);
  const listed = [...text.matchAll(/^- Option ([a-z]): \S/gm)].map((m) => m[1]);
  const design = fields.get('Design');
  if (design !== undefined && !['one', 'options'].includes(design)) add('Design is "one" or "options"');
  if (design === 'options' && listed.length < 2) add('Design is "options" but fewer than two "- Option <letter>:" lines');
  if (design === 'one' && listed.length) add('Design is "one" but option lines are listed');
  if (options.length && listed.join() !== options.join()) add(`options ${listed.join(', ') || 'none'} differ from the page's ${options.join(', ')}`);
  if (!options.length && design === 'options') add('the page shows one design but CHOICE.md lists options');
  const valid = design === 'one' ? ['design'] : listed;
  // A replaced revision keeps the option that was chosen, so the value is checked whenever it is given.
  if (fields.has('Chosen') && fields.get('Chosen') !== NONE_YET && fields.get('Chosen') !== '' && !valid.includes(fields.get('Chosen').toLowerCase())) add(`Chosen "${fields.get('Chosen')}" is not one of ${valid.join(', ')}`);
  if (status === 'awaiting selection') {
    for (const label of SELECTION_FIELDS) if (fields.has(label) && fields.get(label) !== NONE_YET) add(`"${label}" must be "${NONE_YET}" while awaiting selection`);
  }
  if (status === 'replaced') {
    for (const label of SELECTION_FIELDS.slice(5)) if (fields.has(label) && fields.get(label) !== NONE_YET) add(`"${label}" stays "${NONE_YET}" in a replaced revision`);
    if (!/^".+"$/.test(fields.get("Person's words") ?? '')) add("Person's words of a replaced revision quote the feedback word for word");
  }
  if (status === 'selected') {
    for (const label of SELECTION_FIELDS) if (fields.get(label) === NONE_YET) add(`"${label}" must be filled once selected`);
    if (fields.has('Selected on') && !/^\d{4}-\d{2}-\d{2}$/.test(fields.get('Selected on'))) add('Selected on must be a date, YYYY-MM-DD');
    const words = fields.get("Person's words") ?? '';
    if (words !== NONE_YET && !/^".+"$/.test(words)) add("Person's words must be the reply quoted word for word");
  }
  return findings;
}

/** The largest file the check reads: a proposal page, its survey.json, its CHOICE.md. */
export const CAPS = { 'proposal.html': 2 * 1024 * 1024, 'survey.json': 2 * 1024 * 1024, 'CHOICE.md': 256 * 1024 };
const PAGE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REVISION = /^r[1-9]\d*$/;

/** What is wrong with the shape of a parsed survey.json where the check reads it; an empty list when nothing is. */
function surveyShape(survey) {
  if (!survey || typeof survey !== 'object' || Array.isArray(survey)) return ['not a JSON object'];
  const wrong = [];
  const textMap = (v) => v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every((x) => typeof x === 'string');
  if (survey.look !== undefined && !textMap(survey.look)) wrong.push('look is not an object of text values');
  if (survey.variants !== undefined && survey.variants !== null && !textMap(survey.variants)) wrong.push('variants is not an object of text values');
  if (survey.brandDefs !== undefined && survey.brandDefs !== null && typeof survey.brandDefs !== 'string') wrong.push('brandDefs is neither text nor null');
  const mark = survey.brandMark;
  if (mark !== undefined && mark !== null) {
    if (typeof mark !== 'object' || Array.isArray(mark) || typeof mark.kind !== 'string') wrong.push('brandMark is not an object with a kind');
    else if (mark.kind === 'svg' && typeof mark.svg !== 'string') wrong.push('brandMark of kind svg holds no svg text');
    else if (mark.kind === 'raster' && typeof mark.src !== 'string') wrong.push('brandMark of kind raster holds no src text');
  }
  return wrong;
}

/** Checks a page file or a revision folder; returns findings as `file: message`. */
export function checkTarget(target) {
  const out = [];
  const isDir = statSync(target).isDirectory();
  const page = isDir ? path.join(target, 'proposal.html') : target;
  // A record file, read only when it is a regular file under its cap.
  const load = (file, cap, name) => {
    const stat = statSync(file);
    if (!stat.isFile()) { out.push(`${name}: [record] not a regular file`); return null; }
    if (stat.size > cap) { out.push(`${name}: [record] ${stat.size} bytes, over the ${cap} byte cap; it is not read`); return null; }
    return readFileSync(file, 'utf8');
  };
  if (!existsSync(page)) return [`${path.basename(page)}: [record] missing`];
  const abs = path.resolve(path.dirname(page));
  if (isDir) {
    const pageId = path.basename(path.dirname(abs));
    const revision = path.basename(abs);
    if (!PAGE_ID.test(pageId)) out.push(`${pageId}: [record] the page id is lower-case letters, digits and single hyphens`);
    if (!REVISION.test(revision)) out.push(`${revision}: [record] a revision folder is r1, r2, and so on`);
  }
  const surveyFile = path.join(path.dirname(page), 'survey.json');
  let survey = null;
  // The record files are read as they lie in the folder: a symbolic link is named, never followed.
  const linkStat = (file) => { try { return lstatSync(file); } catch { return null; } };
  const LINK = '[record] a symbolic link, which the check does not follow; keep the file itself in the revision folder';
  const surveyStat = linkStat(surveyFile);
  if (surveyStat?.isSymbolicLink()) out.push(`survey.json: ${LINK}`);
  else if (surveyStat) {
    const text = load(surveyFile, CAPS['survey.json'], 'survey.json');
    // A file that parses is shape-checked whatever it holds, null included: only a missing file means no survey.
    let parsed = false;
    if (text !== null) { try { survey = JSON.parse(text); parsed = true; } catch { out.push('survey.json: [record] not valid JSON'); } }
    const wrong = parsed ? surveyShape(survey) : [];
    if (wrong.length) { out.push(...wrong.map((w) => `survey.json: [record] ${w}; write it with survey-app.mjs --out`)); survey = null; }
  }
  const html = load(page, CAPS['proposal.html'], path.basename(page));
  if (html === null) return out;
  const { findings, options, parts } = checkPage(html, { survey });
  out.push(...findings.map((f) => `${path.basename(page)}: ${f}`));
  if (isDir) {
    const choice = path.join(target, 'CHOICE.md');
    const choiceStat = linkStat(choice);
    if (!choiceStat) out.push('CHOICE.md: [record] missing');
    else if (choiceStat.isSymbolicLink()) out.push(`CHOICE.md: ${LINK}`);
    else {
      const text = load(choice, CAPS['CHOICE.md'], 'CHOICE.md');
      if (text !== null) out.push(...checkChoice(text, { options, pageId: path.basename(path.dirname(abs)), revision: path.basename(abs), parts }).map((f) => `CHOICE.md: ${f}`));
    }
  }
  return out;
}

export function main(argv, { log = console.log, error = console.error } = {}) {
  if (argv.includes('--help') || argv.includes('-h')) { log(USAGE); return 0; }
  const unknown = argv.filter((a) => a.startsWith('--'));
  if (unknown.length || argv.length !== 1) { error(`${unknown.length ? `unknown argument: ${unknown[0]}` : 'one file or folder expected'}\n\n${USAGE}`); return 2; }
  if (!existsSync(argv[0])) { error(`no such file or folder: ${argv[0]}`); return 2; }
  let findings;
  try {
    findings = checkTarget(argv[0]);
  } catch (err) {
    // Fail closed: a page the check cannot finish is never called clean.
    findings = [`${path.basename(argv[0])}: [external] the check stopped on an unexpected error (${String(err?.message ?? err).slice(0, 200)}); the page is not clean`];
  }
  for (const f of findings) log(f);
  log(findings.length ? `${findings.length} finding(s)` : 'clean: 0 findings');
  return findings.length ? 1 : 0;
}

const isEntry = process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (isEntry) process.exitCode = main(process.argv.slice(2));
