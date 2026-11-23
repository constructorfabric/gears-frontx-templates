/**
 * check-proposal.mjs reads markup the way a browser does, and fails closed
 * where it cannot:
 * - tags: "/" separates attributes, an unquoted value runs to a space or ">"
 *   and may hold "=" and "`"; a name with a character outside printable
 *   ASCII (a NUL or a Kelvin sign included) is a finding, and only ASCII
 *   letters are lowercased;
 * - comments end at "-->", "--!>", "<!-->" and "<!--->" and never start
 *   inside a raw text block;
 * - raw text and RCDATA blocks (script, style, textarea, title, xmp, iframe,
 *   noembed, noframes, noscript, plaintext) end only at their own end tag,
 *   and markup inside one is a finding;
 * - svg holds only the drawing elements of the survey's logo list, each
 *   closed by its own end tag; math, MathML elements, desc and foreignObject
 *   are findings anywhere, so no integration point and no HTML inside svg
 *   passes; the breakout start tags and the end tags </p> and </br> still
 *   leave svg as in a browser;
 * - a cut tag, an unclosed comment, CDATA, a processing instruction, a bogus
 *   declaration, an end tag with attributes, a second body or html, a comment holding markup, a title outside the head
 *   and nesting past 512 levels are findings;
 * - apart from the tree, the raw page text carries exactly the skeleton's
 *   meta tags and one http-equiv attribute;
 * - the parse stays linear on a page cut inside markup and on deep nesting,
 *   and so does every pattern over page text (comments, placeholders, the
 *   app-look block, CHOICE.md fields) and every rule that looks an element
 *   up by its id (drawings with their notes, overview links, flow steps, pin
 *   references): a size eight times larger takes less than 24 times as long;
 * - the app-look block is read as CSS reads it: a "{", a "[" or a "(" its
 *   declaration does not close is a finding, a comment that spans lines
 *   hides nothing after its end, the last declaration needs no ";", and a
 *   single quote stands only in --d-font;
 * - text is read as a browser shows it: an arrow written as a character
 *   reference is an arrow, a placeholder written as a tag is not an HTML
 *   element, an abbreviation's period ends no sentence, and a comment or the
 *   text of a style block that names http-equiv is no attribute.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import './replace-or-fail.mjs';
import { expectLinear } from './linear-time.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const skill = path.join(here, '../.frontx/ai/@gears-frontx/template-design-guardrails/skills/frontx-design-proposal');
const check = await import(pathToFileURL(path.join(skill, 'scripts/check-proposal.mjs')).href);
const survey = await import(pathToFileURL(path.join(skill, 'scripts/survey-app.mjs')).href);
const page = readFileSync(path.join(skill, 'assets/proposals/invite-teammate/r1/proposal.html'), 'utf8');
const swapOnce = (html, from, to) => { expect(html.split(from).length, from).toBe(2); return html.replaceOrFail(from, () => to); };
const atEnd = (html) => swapOnce(page, '</main>', `${html}</main>`);
const LOOK = /<style id="app-look">[\s\S]*?<\/style>/;
const inLook = (html) => { expect(page).toMatch(LOOK); return page.replaceOrFail(LOOK, (m) => m.replaceOrFail('</style>', () => html)); };
const findings = (html) => check.checkPage(html).findings;
const R = 'https://attacker.example/';
const REFRESH = `<meta http-equiv="refresh" content="0;url=${R}">`;
const IMG = `<img src=${R}x>`;
const OUT = `<img src="${R}x"> points outside the page`;
const METAS = "the page has meta tags other than the skeleton's";
const UNREAD = 'markup the check cannot read';
const IN_TEXT = (tag) => `markup inside the text of a <${tag}> block`;
const SVG_ONLY = "an svg on a proposal page holds only drawing elements";
/** An inline chart an agent would write: every element of the svg allow-list, fragment references only, named by aria-label. */
const HONEST_SVG = `<svg viewBox="0 0 40 20" width="40" height="20" role="img" aria-label="Tasks done per week"><defs><linearGradient id="hs-lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor"/><stop offset="1" stop-color="currentColor" stop-opacity="0.2"/></linearGradient><radialGradient id="hs-rg"><stop offset="0" stop-color="currentColor"/></radialGradient><clipPath id="hs-clip"><rect width="40" height="20" rx="2"/></clipPath><mask id="hs-mask"><rect width="40" height="20" fill="currentColor"/></mask><symbol id="hs-dot" viewBox="0 0 2 2"><circle cx="1" cy="1" r="1"/></symbol></defs><g clip-path="url(#hs-clip)" mask="url(#hs-mask)"><rect x="2" y="8" width="6" height="12" fill="url(#hs-lg)"></rect><ellipse cx="20" cy="10" rx="3" ry="2" fill="url(&quot;#hs-rg&quot;)"/><line x1="0" y1="19" x2="40" y2="19" stroke="currentColor"/><polyline points="0,10 10,5 20,8" fill="none" stroke="currentColor"/><polygon points="30,2 34,8 26,8"/><path d="M0 0h1"/><use href="#hs-dot" x="36" y="2" width="2" height="2"/></g></svg>`;
const COMMENT = 'a comment holds markup';
const TITLE = 'a <title> outside the document head';

/** Exactly one [external] finding carries the message. */
const expectOne = (html, message) => {
  const found = findings(html);
  expect(found.filter((f) => f.startsWith('[external]') && f.includes(message)), found.join('\n')).toHaveLength(1);
};

describe('check-proposal.mjs reads markup the way a browser does', () => {
  it('finds nothing to add on the example page itself', () => {
    expect(findings(page)).toEqual([]);
  });

  it.each([
    ['an unquoted meta refresh', `<meta http-equiv=refresh content=0;url=${R}>`, METAS],
    ['a meta refresh with "/" between attributes', `<meta/http-equiv="refresh"/content="0;url=${R}">`, METAS],
    ['a meta refresh after a comment closed by <!-->', `<!-->${REFRESH}-->`, METAS],
    ['a meta refresh after a comment closed by --!>', `<!-- x --!>${REFRESH} -->`, METAS],
    ['a link whose unquoted address holds "="', `<a href=${R}?a=b>x</a>`, `<a href="${R}?a=b"> points outside the page`],
    ['a dns-prefetch link with an unquoted address', '<link rel=dns-prefetch href=//attacker.example/?a=b>', '<link> is not allowed'],
    ['an svg with "/" before its handler', '<svg/onload=a=1>', '<svg onload> is an event handler'],
    ['an img whose handler value holds "="', '<img src=x onerror=a=1>', '<img onerror> is an event handler'],
    ['an img with "/" before its address', `<img/src="${R}x" onerror=x>`, OUT],
    ['an img after an unquoted value with a backtick', `<img title=a\`b src=${R}x>`, OUT],
    ['an img after a comment closed by --!>', `<!-- --!>${IMG} -->`, OUT],
    ['an img after a comment closed by <!--->', `<!--->${IMG}-->`, OUT],
    ['an img after a comment closed by <!-->', `<!-->${IMG}-->`, OUT],
    ['an img with a form feed before its address', `<img\fsrc=${R}x>`, OUT],
  ])('reports %s', (_, html, message) => expectOne(atEnd(html), message));

  it('reports a comment that starts inside a style block and would hide a meta refresh', () => {
    expectOne(inLook(`/* <!-- */</style>${REFRESH}<style>/* --> */</style>`), METAS);
  });

  it.each([
    ['a form feed', `<meta\fhttp-equiv=refresh\fcontent=0;url=${R}>`, METAS],
    ['upper case', `<META HTTP-EQUIV=REFRESH CONTENT="0;URL=${R}">`, METAS],
    ['a doctype before it in the body', `<!DOCTYPE html>${REFRESH}`, METAS],
    ['a comment opened inside an attribute value', `<p title="<!--">${REFRESH}<p title="-->">x</p>`, METAS],
    ['a NUL inside javascript:', '<a href="java\u0000script:alert(1)">x</a>', 'points outside the page'],
    ['a second, outside src', `<img src="data:image/png;base64,AA" src=${R}x>`, OUT],
    ['an entity-encoded javascript:', '<a href="&#x6A;avascript&colon;alert(1)">x</a>', 'runs code'],
    ['&num without ";", which a browser keeps as it is', `<a href="&num//attacker.example/">x</a>`, 'points outside the page'],
    ['&NUM;, which is no reference a browser knows', `<a href="&NUM;//attacker.example/">x</a>`, 'points outside the page'],
    ['a nested comment', `<!--<!-->${IMG}-->`, OUT],
    ['a template', `<template>${IMG}</template>`, OUT],
    ['an svg link', `<svg><a href="${R}"><text>x</text></a></svg>`, `<a href="${R}"> points outside the page`],
    ['an svg fill', `<svg><rect fill="url(${R}x#p)"/></svg>`, `url(${R}x#p) points outside the page`],
  ])('reports markup hidden with %s', (_, html, message) => expectOne(atEnd(html), message));
});

describe('check-proposal.mjs fails closed on markup it cannot read', () => {
  it.each([
    ['a CDATA section', `<svg><![CDATA[>${IMG}]]></svg>`, UNREAD],
    ['a processing instruction', `<?php ${IMG} ?>`, UNREAD],
    ['a bogus declaration', `<!x ${REFRESH}>`, UNREAD],
    ['an end tag with attributes', `</p foo=">${IMG}">`, UNREAD],
    ['an end tag closed by "/>"', '</p/>', UNREAD],
    ['an unclosed comment', `<!-- ${REFRESH}`, 'an unclosed comment hides the rest of the page'],
    ['an unclosed quote, read on to the next quote as a browser does', `<a href="${R} x>`, `<a href="${R} x>`],
  ])('reports %s', (_, html, message) => expectOne(atEnd(html), message));

  it.each([
    ['a tag', `<img src=${R}x`],
    ['a quote', `<a href="${R}`],
  ])('reports %s cut by the end of the page', (_, cut) => expectOne(`${page}${cut}`, 'a tag the page never closes'));

  it.each([
    ['textarea', `<textarea><!--</textarea>${REFRESH}--></textarea>`],
    ['title', `<title><!--</title>${IMG}-->`],
    ['xmp', `<xmp><!--</xmp>${IMG}-->`],
    ['iframe', `<iframe><!--</iframe>${IMG}-->`],
    ['noembed', `<noembed><!--</noembed>${IMG}-->`],
    ['noframes', `<noframes><!--</noframes>${IMG}-->`],
    ['noscript', `<noscript><!--</noscript>${IMG}-->`],
    ['plaintext', `<plaintext></plaintext>${IMG}`],
    ['style', `<style><!--</style>${IMG}--></style>`],
  ])('reads <%s> as text up to its own end tag and reports markup inside it', (tag, html) => expectOne(atEnd(html), IN_TEXT(tag)));

  it('reads <script> as text up to its own end tag, so a comment in it hides nothing', () => {
    expectOne(atEnd(`<script>/*<!--*/</script>${IMG}`), OUT);
  });

  it('ends a style block only at </style followed by a space, "/" or ">"', () => {
    expectOne(inLook(`</stylex> .d-app{background:url(${R}x)}</style>`), IN_TEXT('style'));
  });

  it('accepts an svg of every drawing element, each closed by its own end tag', () => {
    expect(findings(atEnd(HONEST_SVG))).toEqual([]);
  });

  it('accepts every logo the survey cleans: its cleaner keeps the same svg elements the check allows', () => {
    const all = [...survey.SVG_ELEMENTS].filter((t) => t !== 'svg').map((t) => `<${t} id="x-${t}"><title>a</title></${t}>`).join('');
    const cleaned = survey.sanitizeSvg(`<svg viewBox="0 0 9 9"><title>Logo</title><desc>d</desc><foreignObject><p>x</p></foreignObject><text>T</text><style>a{}</style>${all}<path d="M0 0h9"/></svg>`);
    expect(cleaned.error).toBeUndefined();
    for (const t of survey.SVG_ELEMENTS) expect(cleaned.svg.toLowerCase()).toContain(`<${t} `);
    expect(findings(atEnd(cleaned.svg)).filter((f) => f.startsWith('[external]'))).toEqual([]);
  });

  it.each(['foreignObject', 'desc', 'title', 'style', 'script', 'a', 'text', 'tspan', 'image', 'pattern', 'filter', 'feImage', 'marker', 'switch', 'symbolx', 'font', 'annotation-xml'].flatMap((tag) => [
    [tag, 'a child', `<svg><${tag}></${tag}></svg>`],
    [tag, 'a grandchild', `<svg><g><${tag}></${tag}></g></svg>`],
  ]).concat([['text', 'a grandchild in defs', '<svg><defs><text></text></defs></svg>']]))('reports <%s> inside svg as %s, which holds only drawing elements', (_, __, html) => {
    const found = findings(atEnd(html));
    expect(found.filter((f) => f.includes(SVG_ONLY)).length, found.join('\n')).toBeGreaterThan(0);
    expect(found.join('\n')).toContain('name an icon with aria-label on the svg');
  });

  it.each(['b', 'big', 'blockquote', 'body', 'br', 'center', 'code', 'dd', 'div', 'dl', 'dt', 'em', 'embed', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'hr', 'i', 'img', 'li', 'listing', 'menu', 'meta', 'nobr', 'ol', 'p', 'pre', 'ruby', 's', 'small', 'span', 'strong', 'strike', 'sub', 'sup', 'table', 'tt', 'u', 'ul', 'var', 'font color="red"', 'font'])('reports <%s> inside svg, and leaves svg there as a browser does, so a style after it is text', (tag) => {
    const html = atEnd(`<svg><${tag}><style><!--</style>${IMG}--></style></svg>`);
    expectOne(html, `<svg> holds <${tag.split(' ')[0]}>`);
    expectOne(html, IN_TEXT('style'));
  });

  it.each([
    ['<math>', '<math></math>'],
    ['<math> with a text point, each element once', '<math><mi>x</mi></math>', 2],
    ['a MathML element outside math', '<p><mi>x</mi></p>'],
    ['<annotation-xml> outside math', '<annotation-xml encoding="text/html"></annotation-xml>'],
    ['<desc> outside svg', '<desc></desc>'],
    ['<foreignObject> outside svg', '<foreignObject></foreignObject>'],
  ])('reports %s, which no proposal page holds, whatever namespace a reader gives it', (_, html, count = 1) => {
    expect(findings(atEnd(html)).filter((f) => / is not allowed: a proposal page has no math and no svg /.test(f))).toHaveLength(count);
  });

  it.each([
    ['outside svg', '<foreignObject></foreignObject>'],
    ['inside svg', '<svg><foreignObject></foreignObject></svg>'],
  ])('reports <foreignObject> %s once, named as an author writes it', (_, html) => {
    const found = findings(atEnd(html));
    expect(found, found.join('\n')).toHaveLength(1);
    expect(found[0]).toMatch(/^\[external\] <foreignObject> is not allowed: /);
  });

  it('names the svg elements in its message as an author writes them, closed by an end tag or by />', () => {
    const found = findings(atEnd('<svg><text></text></svg>'));
    expect(found.join('\n')).toContain('linearGradient, radialGradient, stop, clipPath, mask, use), each closed by its own end tag or by />');
  });

  it('tells which open element to close before an end tag that does not close it', () => {
    expectOne(atEnd('<svg><rect width="9"></svg>'), 'the end tag </svg> inside <rect> does not close it; close <rect> with /> or </rect> before </svg>');
    expectOne(atEnd('<svg><clipPath id="c"></svg>'), 'inside <clipPath> does not close it; close <clipPath> with /> or </clipPath> before </svg>');
  });

  it('reports an svg style block even when its text hides url() behind a character reference, so the row fails if svg ever allows style', () => {
    expectOne(atEnd(`<svg><style>.x { fill: &#117;rl(${R}a.png) }</style></svg>`), '<svg> holds <style>');
  });

  it.each([
    ['an outer svg element', '<svg><g><path d="M0 0"/></svg>', 'svg'],
    ['an HTML element', '<svg></span><rect/></svg>', 'span'],
    ['nothing open', '<svg></x></svg>', 'x'],
    ['</p>, which a browser reads as leaving svg', '<svg></p><rect/></svg>', 'p'],
    ['</br>, which a browser reads as leaving svg', '<svg></br><rect/></svg>', 'br'],
  ])('reports an end tag inside svg that does not close the element it is in: %s', (_, html, tag) => {
    expectOne(atEnd(html), `the end tag </${tag}> inside <`);
  });

  it.each(['</p>', '</br>'].flatMap((end) => [
    [end, 'a link', `<a href="${R}">x</a>`, `<a href="${R}"> points outside the page`],
    [end, 'an image', IMG, OUT],
    [end, 'an iframe', '<iframe></iframe>', '<iframe> is not allowed'],
  ]))('leaves svg at the end tag %s as a browser does, so %s after a title there is seen', (end, _, payload, message) => {
    expectOne(atEnd(`<svg>${end}<title><!--</title>${payload}--></title></svg>`), message);
  });

  // Inputs from the round 4 reviews, where the check and a browser disagreed on where svg content ends:
  // each now fails on the element or end tag svg may not hold, and the outside url() is read as CSS
  // whatever namespace the check gives the element that carries it.
  it.each([
    ['an end tag naming the svg desc from inside it', `<svg><desc><i></desc></svg></i></desc><rect width="9" height="9" fill="url(${R}x#p)"/></svg>`],
    ['the same with a span', `<svg width="9" height="9"><desc><span></desc></svg></span></desc><rect width="9" height="9" fill="url(${R}x#p)"/></svg>`],
    ['a form inside desc', `<svg><desc><form><i></form></desc></svg></i></desc><rect fill="url(${R}x#p)"/></svg>`],
    ['an end tag stopped by a div', `<svg><desc><span><div></span></desc></svg></div></span></desc><rect fill="url(${R}x#p)"/></svg>`],
    ['an end tag stopped by b and div', `<svg><desc><b><div></b></desc></svg></div></b></desc><rect fill="url(${R}x#p)"/></svg>`],
    ['a Kelvin sign in blockquote', `<svg width="9" height="9"><bloc\u212aquote></bloc\u212aquote><rect width="9" height="9" fill="url(${R}x#p)"/></svg>`],
    ['a Kelvin sign in strike', `<svg><stri\u212ae></stri\u212ae><rect fill="url(${R}x#p)"/></svg>`],
  ])('reports %s, and the url() after it', (_, html) => {
    const found = findings(atEnd(html));
    expect(found.filter((f) => f === `[external] url(${R}x#p) points outside the page`), found.join('\n')).toHaveLength(1);
    expect(found.filter((f) => f.includes(SVG_ONLY)).length, found.join('\n')).toBeGreaterThan(0);
  });

  it('lowercases only ASCII letters of a name, so a Kelvin sign is a name outside printable ASCII and not a breakout tag', () => {
    expectOne(atEnd('<svg><bloc\u212aquote></bloc\u212aquote></svg>'), 'the name "bloc\u212aquote" holds a character outside printable ASCII');
  });

  it.each([
    ['a tag name', '<p\u00e9>x</p\u00e9>'],
    ['an attribute name', '<p d\u0430ta-x="1">x</p>'],
    ['an attribute name with a Kelvin sign, which is no marker-end to a browser', '<p mar\u212aer-end="x">x</p>'],
    ['a NUL in an attribute name', '<p a\u0000b="1">x</p>'],
    ['a NUL in a tag name', '<p\u0000>x</p>'],
  ])('reports a character outside printable ASCII in %s', (_, html) => {
    expect(findings(atEnd(html)).filter((f) => f.includes('outside printable ASCII')).length).toBeGreaterThan(0);
  });

  it.each(['p\u00e9', 'bloc\u212aquote'])('reports the end tag name %s, outside printable ASCII', (name) => {
    expectOne(atEnd(`</${name}>`), `the end tag name "${name}" holds a character outside printable ASCII`);
  });

  it.each([
    ['inside svg', '<svg viewBox="0 0 1 1" role="img"><title>Team chart</title></svg>', 1],
    ['in the body', '<title>Team chart</title>', 0],
  ])('reports a <title> %s', (_, html, svg) => {
    const found = findings(atEnd(html));
    expect(found.filter((f) => f === `[external] ${TITLE}; the page has one title, in the head`), found.join('\n')).toHaveLength(1);
    expect(found.filter((f) => f.includes(SVG_ONLY))).toHaveLength(svg);
  });

  it.each([
    ['a link', `<!-- <a href="${R}">x</a> -->`],
    ['an end tag', '<!-- </title> -->'],
    ['a declaration', '<!-- <!x> -->'],
  ])('reports a comment that holds %s', (_, html) => expectOne(atEnd(html), COMMENT));

  it('reads the kit\'s blocks, comments included, pasted into a page, with no finding of markup', () => {
    const blocks = readFileSync(path.join(skill, 'templates/draw/blocks.html'), 'utf8');
    expect(findings(atEnd(blocks)).filter((f) => f.startsWith('[external]'))).toEqual([]);
  });

  it('keeps a comment of the skeleton as it is, and a comment without markup, clean', () => {
    const skeleton = readFileSync(path.join(skill, 'templates/proposal.html'), 'utf8');
    const own = /<!--\s*Names this page coins[\s\S]*?-->/.exec(skeleton)[0];
    expect(own).toMatch(/<span/);
    expect(findings(atEnd(`${own}<!-- a < b, 3 > 2 -->`))).toEqual([]);
  });

  it.each([
    ['<body>', '<body class="topbar-meta">'],
    ['<html>', '<html lang="de">'],
    ['<head>', '<head>'],
  ])('reports a second %s start tag', (tag, html) => expectOne(atEnd(html), `a second ${tag} start tag`));

  it.each([
    ['5000 nested <div>', '<div>'.repeat(5000)],
    ['5000 nested <svg><g>', `<svg>${'<g>'.repeat(5000)}`],
    ['5000 nested <b>', '<b>'.repeat(5000)],
  ])('reports %s as nesting past 512 levels', (_, html) => {
    expectOne(atEnd(html), 'elements nested deeper than 512 levels');
  });

  it('accepts nesting of 512 levels and reports 513', () => {
    const deep = (levels) => check.checkPage('<div>'.repeat(levels)).findings.filter((f) => f.includes('nested deeper'));
    expect(deep(512)).toEqual([]);
    expect(deep(513)).toHaveLength(1);
  });

  it('keeps the first of two class attributes, so a second topbar-meta does not let a link through', () => {
    expectOne(atEnd('<span class="small" class="topbar-meta"><a href="https://tracker.example/issues/1">x</a></span>'), '<a href="https://tracker.example/issues/1"> points outside the page');
  });

  it('ignores "/>" on an HTML element, so a "self-closed" drawing keeps what follows it', () => {
    expect(findings(swapOnce(page, '<figure class="drawing" id="draw-team">', '<figure class="drawing" id="draw-team"/>'))).toEqual([]);
  });

  it('reports a component named in angle brackets in an app-look comment, and says what to write instead', () => {
    const found = findings(inLook('/* the shell header (<Header> in Header.tsx) has no border */</style>'));
    expect(found.filter((f) => f.startsWith(`[external] ${IN_TEXT('style')}`)), found.join('\n')).toHaveLength(1);
    expect(found.join('\n')).toContain('name a component as Header, not <Header>');
    expect(findings(inLook('/* the shell header (Header in Header.tsx) has no border */</style>'))).toEqual([]);
  });

});

describe('check-proposal.mjs reads the meta tags from the raw page text too', () => {
  it('reports a second charset meta, which the tree rule for http-equiv does not see', () => {
    expectOne(atEnd('<meta charset="utf-8">'), METAS);
  });

  it('reports http-equiv on an element that is no meta', () => {
    expectOne(atEnd(`<p http-equiv="refresh" content="0;url=${R}">x</p>`), 'the page has 2 http-equiv attributes');
  });

  it('decodes &num; with its ";" to a fragment, and tab and newline references inside a scheme', () => {
    expect(findings(atEnd('<a href="&num;how">x</a>'))).toEqual([]);
    expectOne(atEnd('<a href="java&Tab;scr&NewLine;ipt:alert(1)">x</a>'), 'runs code');
  });

  it('reads the word http-equiv in prose as text', () => {
    expect(findings(atEnd('<p>The settings page explains the http-equiv option of an "http-equiv" meta tag.</p>'))).toEqual([]);
  });
});

// The scaling cases time each page eight times its size five times over, and once more if needed: on a loaded machine
// that takes minutes.
describe('check-proposal.mjs reads a page in time linear in its length', { timeout: 600_000 }, () => {
  const cut = (piece) => (n) => page.slice(0, page.indexOf('<main>')) + piece.repeat(n);
  // n is sized so the part that grows is not hidden by the fixed cost of checking the whole page (about 10 ms): the
  // rows whose growing part is cheap take 40000, the two that build tens of thousands of elements take 2500.
  it.each([
    ['an attribute list cut off', 10000, cut('<p a="1" ')],
    ['tag names cut off', 10000, cut('<a ')],
    ['end tags cut off', 10000, cut('</a ')],
    ['quotes cut off', 10000, cut('<p a="')],
    ['bogus markup', 10000, cut('<!x')],
    ['unclosed comment openers', 10000, cut('<!-- -')],
    ['placeholder openers', 40000, (n) => atEnd(`<p>${'{{'.repeat(n)}</p>`)],
    ['reason comment openers in the app-look block', 40000, (n) => inLook(`.d-app { --d-bg: #fff; ${'/* why:'.repeat(n)} }</style>`)],
    ['declaration names in the app-look block', 40000, (n) => inLook(`.d-app { ${'--d-'.repeat(n)} }</style>`)],
    ['declarations with no semicolon in the app-look block', 40000, (n) => inLook(`.d-app { --d-bg: #fff; ${' --d-a:b'.repeat(n)} }</style>`)],
    ['comments across lines in the app-look block', 40000, (n) => inLook(`.d-app { --d-bg: #fff; ${'/* why: a\n b */ --d-a: b;\n'.repeat(n)} }</style>`)],
    ['parentheses in an app-look value', 40000, (n) => inLook(`.d-app { --d-bg: #fff; --d-a: ${'('.repeat(n)}; }</style>`)],
    ['placeholder closers', 40000, (n) => atEnd(`<p>{{x ${'} '.repeat(n)}</p>`)],
    ['placeholder closers with no opener', 40000, (n) => atEnd(`<p>${'}}'.repeat(n)}</p>`)],
    ['placeholders split by markup', 2500, (n) => atEnd(`<p>${'{{a<b>b</b>'.repeat(n)}}}</p>`)],
    ['spaces in an address', 40000, (n) => atEnd(`<a href="#a${' '.repeat(n)}b">x</a>`)],
    ['an address form of many parts', 40000, (n) => atEnd(`<p>${'/a&lt;b&gt;'.repeat(n)}</p>`)],
    ['address form openers with no named part', 40000, (n) => atEnd(`<p> ${'/./'.repeat(n)}&lt;</p>`)],
    ['nested elements', 2500, cut('<b>')],
  ])('%s', (what, n, build) => {
    // With a survey beside the page, so the app-look block is read declaration by declaration.
    expectLinear((size) => check.checkPage(build(size), { survey: { look: { bg: '#fff' } } }), n, what);
  });

  // The rules that look an element up by its id: an earlier version walked the whole page once per drawing, link or
  // step, and failed these at the same sizes. Each row grows the page and the lookups together.
  const tasks = readFileSync(path.join(skill, 'assets/proposals/team-tasks/r1/proposal.html'), 'utf8');
  const before = (html, at, piece) => (n) => { expect(html.split(at).length, at).toBe(2); return html.replaceOrFail(at, () => Array.from({ length: n }, (_, i) => piece(i)).join('') + at); };
  it.each([
    ['drawings with ids and their notes', 400, before(page, '</main>', (i) => `<figure class="drawing" id="z${i}"><div class="canvas"><div class="d-app"><div class="d-side"></div><span data-note="1"></span></div></div></figure><ol class="notes" data-for="z${i}"><li data-n="1"><b>Pin</b> one</li></ol>`)],
    ['overview links', 1000, before(tasks, '<a class="opt-link recommended" href="#option-a"><span class="mini"', (i) => `<a class="opt-link" href="#x${i}"><span class="opt-name">x</span></a>`)],
    ['flow steps', 1000, before(page, '<a class="flow-step" id="f-team"', (i) => `<a class="flow-step" id="s${i}" href="#draw-team" data-row="1" data-col="1"><span class="flow-name">Team members</span></a>`)],
    ['pin references into a drawing of many pins', 1000, (n) => atEnd(`<figure class="drawing" id="zz"><div class="canvas"><div class="d-app"><div class="d-side"></div>${'<span data-note="1"></span>'.repeat(n)}</div></div></figure>${'<a class="pinref" href="#zz" data-n="1">1</a>'.repeat(n)}`)],
  ])('%s', (what, n, build) => {
    expectLinear((size) => check.checkPage(build(size)), n, what);
  });

  it.each([
    ['tag openers in a field', (n) => `- Page id: ${'<a'.repeat(n)}\n`],
    ['an address form of many parts in a field', (n) => `- Survey: ${'/a<b>'.repeat(n)}\n`],
    ['address form openers with no named part in a field', (n) => `- Survey: ${' /./'.repeat(n)}<\n`],
    ['an item of spaces in the optional parts', (n) => `- Optional parts: flow: added, it shows the steps;${' '.repeat(n)}; x\n`],
  ])('CHOICE.md: %s', (what, build) => {
    expectLinear((n) => check.checkChoice(build(n)), 10000, what);
  });
});

describe('check-proposal.mjs reads the app-look block wherever a declaration stands on its line', () => {
  const survey = { look: { bg: '#fff', text: '#111' } };
  // The whole block is replaced by the rule under test.
  const lookFindings = (css) => check.checkPage(page.replaceOrFail(LOOK, () => `<style id="app-look">${css}</style>`), { survey }).findings.filter((f) => f.startsWith('[app-look]') || f.startsWith('[frame]'));
  const why = 'give the reason in a comment beside it (/* why: ... */)';
  it.each([
    ['one declaration per line', '.d-app {\n  --d-bg: #fff;\n  --d-text: #111;\n}', []],
    ['the whole rule on one line', '.d-app { --d-bg: #fff; --d-text: #111; }', []],
    ['the whole rule on one line with no spaces', '.d-app{--d-bg:#fff;--d-text:#111}', []],
    ['a value the survey does not list on the selector line', '.d-app { --d-x: red;\n  --d-bg: #fff;\n  --d-text: #111;\n}', [`[app-look] --d-x is not in survey.json; ${why}`]],
    ['a different value on the selector line', '.d-app { --d-bg: #000;\n  --d-text: #111;\n}', [`[app-look] --d-bg is #000 but survey.json gives #fff; use the survey value or ${why}`]],
    // A reason comment covers the declaration it follows on its line, or the one declaration of its line.
    ['two declarations and one reason after both', '.d-app {\n  --d-bg: #000; --d-x: red; /* why: the brand colours of the shell */\n  --d-text: #111;\n}', [`[app-look] --d-bg is #000 but survey.json gives #fff; use the survey value or ${why}`]],
    ['two declarations and one reason between them', '.d-app {\n  --d-bg: #000; /* why: the brand colours of the shell */ --d-x: red;\n  --d-text: #111;\n}', [`[app-look] --d-x is not in survey.json; ${why}`]],
    ['one declaration after its reason', '.d-app {\n  /* why: the brand colours of the shell */ --d-x: red;\n  --d-bg: #fff;\n  --d-text: #111;\n}', []],
    // A comment that spans lines hides nothing after its end; a reason comment counts on the line where it starts.
    ['a declaration after a comment that spans two lines', '.d-app {\n  /* a note\n  */ --d-bg: #000;\n  --d-text: #111;\n}', [`[app-look] --d-bg is #000 but survey.json gives #fff; use the survey value or ${why}`]],
    ['a reason comment that spans two lines', '.d-app {\n  --d-x: red; /* why: the brand colours\n  of the shell */\n  --d-bg: #fff;\n  --d-text: #111;\n}', []],
    // The last declaration before "}" needs no ";" in CSS, so it is compared like any other.
    ['the last declaration with no ";"', '.d-app {\n  --d-bg: #fff;\n  --d-text: #111\n}', []],
    ['the last declaration with no ";" and another value', '.d-app {\n  --d-bg: #fff;\n  --d-text: #000\n}', [`[app-look] --d-text is #000 but survey.json gives #111; use the survey value or ${why}`]],
    ['the last declaration with no ";" and a reason after it', '.d-app {\n  --d-bg: #fff;\n  --d-text: #000 /* why: the shell sets its own text colour */\n}', []],
    ['a value with a function, closed within its declaration', '.d-app {\n  --d-x: rgb(1, 2, 3); /* why: the brand colours of the shell */\n  --d-bg: #fff;\n  --d-text: #111;\n}', []],
  ])('%s', (_, css, expected) => {
    expect(lookFindings(css)).toEqual(expected);
  });

  it.each([
    ['on one line', '.d-app { --d-bg: #fff; } .d-app { --d-text: #111; }'],
    ['on two lines', '.d-app {\n  --d-bg: #fff;\n} .d-app { --d-bg: #000; --d-text: #111; }'],
  ])('still refuses two rules %s', (_, css) => {
    expect(lookFindings(css)).toContain('[frame] the app-look block must be one .d-app { --d-*: value; } rule');
  });

  // In CSS a "{" in a value opens a block that runs to the "}" of the rule, so every declaration after it is lost.
  it.each([
    ['a value the survey gives', '.d-app {\n  --d-bg:{#000;\n  --d-text: #111;\n}'],
    ['a value the survey does not list', '.d-app {\n  --d-bg: #fff;\n  --d-x:{red;\n  --d-text: #111;\n}'],
  ])('refuses a "{" inside the rule, before %s', (_, css) => {
    expect(lookFindings(css)).toContain('[frame] the app-look block must be one .d-app { --d-*: value; } rule');
  });

  // A "[" opens a block the same way, and so does a "(" that its own declaration does not close: the ";" and the "}"
  // after it are swallowed.
  const reason = ' /* why: the brand colours of the shell */';
  it.each([
    ['a "["', `.d-app {\n  --d-x: [red;${reason}\n  --d-bg: #fff;\n  --d-text: #111;\n}`, '[frame] the app-look block must be one .d-app { --d-*: value; } rule'],
    ['a "(" left open', `.d-app {\n  --d-x: (red;${reason}\n  --d-bg: #fff;\n  --d-text: #111;\n}`, '[frame] app-look declares "--d-x: (red" with a "(" it does not close; a browser would lose the rest of the rule'],
    ['a "(" closed only in a later declaration', `.d-app {\n  --d-x: (red;${reason}\n  --d-bg: #fff);\n  --d-text: #111;\n}`, '[frame] app-look declares "--d-x: (red" with a "(" it does not close; a browser would lose the rest of the rule'],
    ['a "(" whose ")" is inside a string', `.d-app {\n  --d-x: ( ")";${reason}\n  --d-bg: #fff;\n  --d-text: #111;\n}`, '[frame] app-look declares "--d-x: ( ")"" with a quote or a backslash; write values without double quotes or escapes, single quotes only in --d-font, in pairs around a font name'],
    ['a "(" whose ")" is escaped', `.d-app {\n  --d-x: (\\);${reason}\n  --d-bg: #fff;\n  --d-text: #111;\n}`, '[frame] app-look declares "--d-x: (\\)" with a quote or a backslash; write values without double quotes or escapes, single quotes only in --d-font, in pairs around a font name'],
  ])('refuses %s inside the rule', (_, css, expected) => {
    expect(lookFindings(css)).toContain(expected);
  });

  // A quoted string could hide a ";" or a "(" from the split at ";", so a value has no double quote or backslash, and
  // single quotes only in --d-font, in pairs in a font list.
  const quoteFinding = (decl) => `[frame] app-look declares "${decl}" with a quote or a backslash; write values without double quotes or escapes, single quotes only in --d-font, in pairs around a font name`;
  it.each([
    ['a ";" and an unclosed "(" after a string', `--d-x: "a;--d-y: " (;`, ['--d-x: "a', '--d-y: " (']],
    ['a ";" and a "(" inside a string', `--d-x: ";--d-y: (";`, ['--d-x: "', '--d-y: ("']],
    ['a ";" inside single quotes', "--d-x: 'a;b';", ["--d-x: 'a"]],
    ['a single quote outside a font list', "--d-x: url('a.png');", ["--d-x: url('a.png')"]],
    ['a quoted value in a declaration other than --d-font', "--d-extra: 'red';", ["--d-extra: 'red'"]],
  ])('refuses %s', (_, decls, quoted) => {
    const found = lookFindings(`.d-app {\n  ${decls}${reason}\n  --d-bg: #fff;\n  --d-text: #111;\n}`);
    for (const decl of quoted) expect(found).toContain(quoteFinding(decl));
  });

  it.each([
    ['a font list', "--d-font: 'Inter', ui-sans-serif, system-ui, sans-serif;"],
    ["an apostrophe in a reason comment", "--d-x: red; /* why: the brand's colour of the shell */"],
  ])('accepts %s', (_, decl) => {
    const found = lookFindings(`.d-app {\n  ${decl}${reason}\n  --d-bg: #fff;\n  --d-text: #111;\n}`);
    expect(found.filter((f) => f.startsWith('[frame]'))).toEqual([]);
  });
});

describe('check-proposal.mjs reads text as a browser shows it', () => {
  // Every named reference of the check's arrow table, and the numeric forms.
  const ARROW_NAMES = ['rarr', 'rightarrow', 'RightArrow', 'srarr', 'ShortRightArrow', 'larr', 'leftarrow', 'LeftArrow', 'slarr', 'ShortLeftArrow', 'rArr', 'Rightarrow', 'DoubleRightArrow', 'Implies'];
  it.each([...ARROW_NAMES.map((name) => `&${name};`), '&#x2192;', '&#8594;'])('refuses the arrow %s written in a label, as the literal one', (ref) => {
    const found = findings(atEnd(`<table class="addresses"><tbody><tr><td>the header ${ref} home</td></tr></tbody></table>`));
    expect(found.filter((f) => f.startsWith('[label]') && f.includes('written in a label')), found.join('\n')).toHaveLength(1);
  });

  it.each(['<search>a</search>', '<dialog>a</dialog>', '<time>a</time>', '<dir><li>a</li></dir>', '<p><svg viewBox="0 0 10 10" role="img" aria-label="dot"><circle cx="5" cy="5" r="4"/></svg></p>'])('accepts %s as an element a browser knows', (html) => {
    expect(findings(atEnd(html)).filter((f) => f.startsWith('[text]'))).toEqual([]);
  });

  // desc and foreignObject are refused by their own rule, inside svg and out of it; they are no "unknown element".
  it.each(['<svg viewBox="0 0 10 10" aria-label="dot"><desc>a</desc></svg>', '<svg viewBox="0 0 10 10" aria-label="dot"><foreignObject>a</foreignObject></svg>', '<p><desc>a</desc></p>', '<p><foreignObject>a</foreignObject></p>'])('gives %s no [text] finding', (html) => {
    const found = findings(atEnd(html));
    expect(found.length).toBeGreaterThan(0);
    expect(found.filter((f) => f.startsWith('[text]'))).toEqual([]);
  });

  it('refuses a placeholder written as a tag, which a browser shows as nothing', () => {
    const found = findings(atEnd('<p>Fill <what goes here> before the build starts.</p>'));
    expect(found).toEqual(['[text] <what goes here> is not an HTML element, so a browser shows nothing for it; write the text it stands for, or escape "<" as &lt;']);
  });

  it('reads a takeaway with an abbreviation as one sentence, whatever follows it, and any other period, "!" or "?" before more text as a break', () => {
    const head = /(<header class="sec head" id="head">\n {2}<p class="takeaway">)[^<]*/;
    const takeaway = (text) => findings(page.replaceOrFail(head, (m, open) => `${open}${text}`)).filter((f) => f.includes('one sentence'));
    expect(takeaway('Show counts, e.g. 12 tasks, in the header next to the name.')).toEqual([]);
    expect(takeaway('Show counts, i.e. the open tasks, vs. the done ones, etc. in the header.')).toEqual([]);
    expect(takeaway('Ask Dr. Smith for the counts.')).toEqual([]);
    expect(takeaway('Show the tools, e.g. Jira and Linear, in the header.')).toEqual([]);
    expect(takeaway('Show counts... then the name.')).toEqual([]);
    expect(takeaway('Show counts... Then show the name.')).toHaveLength(1);
    expect(takeaway('Ask Dr.. Smith for the counts.')).toHaveLength(1);
    expect(takeaway('Show counts...? Then the name.')).toHaveLength(1);
    expect(takeaway('Show counts in the header. Then show the name.')).toHaveLength(1);
    expect(takeaway('Show counts in the header. then the name.')).toHaveLength(1);
    expect(takeaway('Ship v1. 2 steps follow.')).toHaveLength(1);
    expect(takeaway('Show counts in the header! then the name.')).toHaveLength(1);
    expect(takeaway('Show counts in the header? Yes, then the name.')).toHaveLength(1);
  });

  it.each(['e.g', 'i.e', 'etc', 'vs', 'cf', 'approx', 'incl', 'Dr', 'Mr', 'Mrs', 'Ms', 'St', 'No'])('reads "%s." in a takeaway as no sentence break', (abbr) => {
    const head = /(<header class="sec head" id="head">\n {2}<p class="takeaway">)[^<]*/;
    const text = `Show the counts, ${abbr}. Twelve tasks, in the header.`;
    expect(findings(page.replaceOrFail(head, (m, open) => `${open}${text}`)).filter((f) => f.includes('one sentence'))).toEqual([]);
  });

  it.each([
    ['a brace inside it', '<p>Hello {{a{b}}.</p>', 'placeholder {{a{b}} left in the page'],
    ['markup inside it', '<p>Hello {{na<b>me</b>}}.</p>', 'placeholder {{name}} left in the page'],
    // Only a block element breaks a run of text; every other element stays inside it.
    ['an insertion inside it', '<p>Hello {{na<ins>me</ins>}}.</p>', 'placeholder {{name}} left in the page'],
    ['a label inside it', '<p>Hello {{na<label>me</label>}}.</p>', 'placeholder {{name}} left in the page'],
    ['a span inside it', '<p>Hello {{na<span>me</span>}}.</p>', 'placeholder {{name}} left in the page'],
    ['a reference for its braces', '<p>Hello &#123;&#123;name}}.</p>', 'placeholder {{name}} left in the page'],
    ['an attribute value', '<p title="{{name}}">Hello.</p>', 'placeholder {{name}} left in the page'],
    ['a closer before it', '<p>Use }} to close, then {{name}}.</p>', 'placeholder {{name}} left in the page'],
  ])('reports a placeholder with %s', (_, html, message) => {
    expect(findings(atEnd(html)).filter((f) => f.startsWith('[text] placeholder'))).toEqual([`[text] ${message}`]);
  });

  it.each([
    ['two paragraphs', '<p>Type {{ to start a variable.</p><p>Close it with }} after the name.</p>'],
    ['a paragraph and a table cell', '<p>Type {{ to start a variable.</p><table><tbody><tr><td>}}</td></tr></tbody></table>'],
  ])('reads the text of separate blocks apart, so braces in %s make no placeholder', (_, html) => {
    expect(findings(atEnd(html)).filter((f) => f.includes('placeholder'))).toEqual([]);
  });

  it('reports a long placeholder, shortened in the message', () => {
    const found = findings(atEnd(`<p>{{${'x'.repeat(1200)}}}</p>`)).filter((f) => f.startsWith('[text] placeholder'));
    expect(found).toEqual([`[text] placeholder {{${'x'.repeat(58)}...${'x'.repeat(10)}}} left in the page`]);
  });

  it('counts http-equiv only outside comments and the text of style blocks', () => {
    expect(findings(atEnd('<!-- the CSP meta keeps its http-equiv= header line -->'))).toEqual([]);
    expect(findings(inLook('/* the CSP meta keeps its http-equiv= header line */</style>'))).toEqual([]);
    expectOne(atEnd('<meta http-equiv="refresh" content="0">'), 'http-equiv attributes');
  });

  it('skips only the comments and blocks a browser starts and ends', () => {
    // A block opener inside an attribute value starts no block, so the attribute after it is counted.
    expectOne(atEnd('<p title="<style >">x</p><p http-equiv="refresh">y</p>'), 'the page has 2 http-equiv attributes');
    expectOne(atEnd('<p title="<!--">x</p><p http-equiv="refresh">y</p><!-- -->'), 'the page has 2 http-equiv attributes');
    // "</stylex" ends no block: the meta after it is style text, not an attribute outside the block.
    expect(findings(inLook('</stylex <meta http-equiv="refresh"></style>')).filter((f) => f.includes('http-equiv attributes'))).toEqual([]);
  });
});
