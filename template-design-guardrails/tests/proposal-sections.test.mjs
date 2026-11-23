/**
 * check-proposal.mjs on the sections that explain a proposal: section
 * takeaways, the mapping of today's page, the paths table with today's steps,
 * the addresses with today's links, text density and labels, glossary order,
 * ids and links, and the Decisions field of CHOICE.md. Broken copies of the
 * worked examples, one finding each.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import './replace-or-fail.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const skill = path.join(here, '../.frontx/ai/@gears-frontx/template-design-guardrails/skills/frontx-design-proposal');
const check = await import(pathToFileURL(path.join(skill, 'scripts/check-proposal.mjs')).href);
const docsDir = path.join(skill, 'assets/proposals/docs-redesign/r1');
const docs = readFileSync(path.join(docsDir, 'proposal.html'), 'utf8');
const tasks = readFileSync(path.join(skill, 'assets/proposals/team-tasks/r1/proposal.html'), 'utf8');
const edit = (page, from, to) => {
  expect(page.includes(from), from).toBe(true);
  return page.replaceOrFail(from, to);
};
const findings = (html) => check.checkPage(html).findings;
const one = (html, kind, message) => {
  const found = findings(html);
  expect(found.filter((f) => f.startsWith(`[${kind}]`) && f.includes(message)), found.join('\n')).toHaveLength(1);
};
// Rows are written [kind, page, message]; the title names the kind and the message, never the page.
const titled = (rows) => rows.map(([kind, html, message]) => [kind, message, html]);

describe('section takeaways', () => {
  it.each(titled([
    ['takeaway', edit(docs, '  <p class="takeaway">Two screens: the list of every document, and one document, which a row click opens.</p>\n', ''), '#map has no takeaway'],
    ['takeaway', edit(docs, 'Two screens: the list of every document, and one document, which a row click opens.', 'Two screens. The list and one document.'), 'the takeaway of #map is not one sentence'],
    ['takeaway', edit(docs, 'Two screens: the list of every document, and one document, which a row click opens.', 'Two screens: the list of every document, and one document, which a row click opens from the list, the search, the section filter and every other place a link may sit today.'), 'the takeaway of #map runs 32 words'],
    ['takeaway', edit(docs, 'Two screens: the list of every document, and one document, which a row click opens.', 'The screens.'), 'the takeaway of #map only says its heading again'],
    ['sections', edit(docs, '<section class="sec" id="states">\n  <h2>States</h2>', '<section class="sec" id="states">\n  <h3>States</h3>'), '#states does not start with its heading'],
    ['head', edit(docs, 'Docs becomes one searchable list of every section, and a document opens inside the app on its own page with its outline.', 'Docs becomes one searchable list of every section of the documentation, and a document opens inside the app on its own page with its outline and a way back to the list.'), 'the takeaway runs 32 words'],
    ['head', edit(docs, '<title>Proposal: Docs</title>', '<title>Docs</title>'), 'the document <title> "Docs" differs from the h1'],
  ]))('reports %s: %s', (kind, message, html) => one(html, kind, message));
});

describe('the mapping of today\'s page', () => {
  it.each(titled([
    ['mapping', edit(docs, '<thead><tr><th>Part</th><th>Today</th><th>Proposed</th></tr></thead>', '<thead><tr><th>Today</th><th>New place</th><th>Note</th></tr></thead>'), 'the columns Part, Today and Proposed'],
    ['mapping', edit(docs, '<tr data-change="kept">', '<tr>'), 'the row "Heading and lead" has no change mark'],
    ['mapping', edit(docs, '<td>Removed: documents are read in the app now, <a href="#q-1">question 1</a></td>', '<td>Removed</td>'), 'the removed part "Download all" does not say why it goes'],
    ['mapping', edit(docs, '<span><span class="swatch" data-change="kept"></span>stays where it is</span>', ''), 'does not name the mark "kept"'],
    ['mapping', docs.replaceOrFail(/<details class="more"><summary>Today's Docs page, full size<\/summary>[\s\S]*?<\/details>/, ''), 'today\'s page, drawn full size, goes in a disclosure'],
  ]))('reports %s: %s', (kind, message, html) => one(html, kind, message));
});

describe('the paths table', () => {
  it.each(titled([
    ['paths', edit(docs, '<span class="step-no">2</span><span class="step-screen">Docs list</span><a class="pinref" href="#draw-list" data-n="4">4</a><span class="step-what">open Rate limits</span>', '<span class="step-no">3</span><span class="step-screen">Docs list</span><a class="pinref" href="#draw-list" data-n="4">4</a><span class="step-what">open Rate limits</span>'), 'step 2 of "Read the API rate limits" does not show its number 2'],
    ['paths', edit(docs, '<a class="pinref" href="#draw-list" data-n="1">1</a><span class="step-what">search "deploy"</span>', '<span class="step-what">search "deploy"</span>'), 'step 1 of "Find a guide by name" has no pin'],
    ['paths', edit(docs, '<a class="longer" href="#q-2" aria-label="Longer than today, see open question 2">!</a>', ''), '"Read the API rate limits" takes 3 steps, today 2'],
    ['paths', edit(docs, '<th scope="row">Find a guide by name</th>', '<th scope="row">Find a guide by name<a class="longer" href="#q-2" aria-label="Longer than today">!</a></th>'), 'carries the "!" mark but takes no more steps than today'],
    ['paths', edit(docs, ' aria-label="Longer than today, see open question 2">!</a>', '>!</a>'), 'a "!" mark (.longer) without an aria-label'],
    ['paths', edit(docs, '<a class="longer" href="#q-2"', '<a class="longer" href="#draw-list"'), 'the "!" mark of "Read the API rate limits" links to no open question'],
    ['paths', edit(docs, '<td class="today" data-steps="3">', '<td class="today">'), 'the Today cell of "Find a guide by name" has no count of steps'],
    ['paths', docs.replaceOrFail('<th>Step 3</th><th>Today</th>', '<th>Step 3</th>').replaceOrFail(/<td class="today"[^>]*>.*?<\/td>/g, '').replaceOrFail(/<a class="longer" href="#q-2" aria-label="[^"]*">!<\/a>/, ''), 'the paths table needs a Today column'],
    ['paths', edit(tasks, '<table class="tbl paths-tbl"', '<table class="tbl"'), 'no paths table (table.paths-tbl)'],
  ]))('reports %s: %s', (kind, message, html) => one(html, kind, message));
});

describe('the addresses', () => {
  const bases = '<div class="bases"><div><span class="base-tag">in the app</span><code>https://app.example/</code></div></div>\n  <div class="tbl-wrap"><table class="tbl addresses"';
  it.each(titled([
    ['addresses', docs.replaceOrFail(/<tr><th scope="row">Document<\/th>.*?<\/tr>\n/, ''), '1 address rows for 2 screens'],
    ['addresses', docs.replaceOrFail('<th>Today the same link opens</th>', '').replaceOrFail(/<td class="today-opens">.*?<\/td>/g, ''), 'the table needs the column "Today the same link opens"'],
    ['addresses', edit(docs, '<div class="tbl-wrap"><table class="tbl addresses"', bases), 'base lines (.bases) are for more than one base'],
    ['addresses', docs.replaceOrFail(/<p class="note">The app's links carry[^<]*<\/p>/, ''), 'no closing note (p.note) after the table'],
    ['addresses', edit(docs, '<td><code>/?screen=docs/rate-limits#limits-per-plan</code></td>', '<td>/?screen=docs/rate-limits</td>'), 'an address row needs its screen (th) and its address (code)'],
  ]))('reports %s: %s', (kind, message, html) => one(html, kind, message));

  it('keeps two base lines, each with its tag and address, clean', () => {
    const two = '<div class="bases"><div><span class="base-tag">in the app</span><code>https://app.example/</code></div><div><span class="base-tag">inside the shell</span><code>https://shell.example/apps/docs/</code></div></div>\n  <div class="tbl-wrap"><table class="tbl addresses"';
    expect(findings(edit(docs, '<div class="tbl-wrap"><table class="tbl addresses"', two))).toEqual([]);
  });
});

describe('words, labels, ids, links and the glossary', () => {
  const long = Array.from({ length: 130 }, (_, i) => `word${i}`).join(' ');
  it.each(titled([
    ['wordy', edit(docs, '<p class="small">The drawings show sample data, eight documents of three sections.</p>', `<p>${long}.</p>`), '#data shows 1'],
    ['label', edit(docs, '<td>the Section filter beside search</td>', '<td>the Section filter that sits beside the search field at the top of the new list</td>'), 'in a table cell; 12 at most'],
    ['label', edit(docs, '<li data-n="4"><b>Row click</b> Opens the document', '<li data-n="4"><b>Row click</b> List -> document: opens the document'), '"->" written in a label'],
    ['ids', edit(docs, '<li id="q-3">', '<li id="q-2">'), 'id "q-2" is used 2 times'],
    ['links', edit(docs, '<a href="#q-1">question 1</a>', '<a href="#q-9">question 1</a>'), 'a link to #q-9, which the page does not have'],
    ['text', edit(docs, '<li>Writing or editing documents.</li>', '<li>TODO</li>'), 'template text "TODO" left'],
    ['text', edit(docs, '<li>Writing or editing documents.</li>', '<li>Writing or editing documentsâ€”.</li>'), 'garbled characters'],
    ['glossary', edit(docs, '<span class="map-name">Document</span>', '<span class="map-name"><span class="term" data-term="outline">Document</span></span>'), 'term "outline" is marked in #map'],
    ['glossary', edit(docs, '<li>Writing or editing documents.</li>', '<li>Writing an outline for documents.</li>'), '"Outline" appears in #asked, before #how'],
  ]))('reports %s: %s', (kind, message, html) => one(html, kind, message));
});

describe('the Decisions field of CHOICE.md', () => {
  const choice = readFileSync(path.join(docsDir, 'CHOICE.md'), 'utf8');
  it('is required', () => {
    expect(check.checkChoice(choice.replaceOrFail(/^- Decisions: .*\n/m, ''))).toContain('[choice] field "Decisions" is missing');
  });
});

describe('the frame for the rendered check and the hover notes', () => {
  const tpl = readFileSync(path.join(skill, 'templates/proposal.html'), 'utf8');
  const js = tpl.match(/<script id="frame-js">([\s\S]*?)<\/script>/)[1];
  const frame = tpl.match(/<style id="frame">([\s\S]*?)<\/style>/)[1];
  const hex = (name) => frame.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`))[1];
  const lum = (h) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

  /**
   * checkProposalLayout from the skeleton's frame script, run on a stand-in of
   * the page as the answer script is: elements with fixed rectangles, the
   * lists the function asks for by selector (any other selector throws), and
   * computed styles. layout() is the frame's own and does nothing here.
   */
  const layoutCheck = (() => {
    // The pattern follows the skeleton's layout (two-space indent, the function closed by "  };"): a reformatted frame
    // script fails here with the message below, not as a broken check.
    const src = /\n {2}window\.checkProposalLayout = \(\) => \{[\s\S]*?\n {2}\};\n/.exec(js)?.[0];
    if (!src) throw new Error('the frame script of templates/proposal.html has no window.checkProposalLayout');
    return (doc) => {
      const win = {};
      new Function('window', 'document', 'getComputedStyle', 'layout', src)(win, doc, (el) => el.style, () => {});
      return win.checkProposalLayout();
    };
  })();
  const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
  /**
   * An element of the stand-in. closest(selector) answers from the element's
   * own class and the classes of its ancestors (more.inside), by the last part
   * of each selector in the list, so every exemption the check makes can be
   * reached.
   */
  const el = (tag, cls, r, more = {}) => ({
    tagName: tag.toUpperCase(), id: more.id ?? '', classList: cls ? [cls] : [], hidden: more.hidden ?? false, dataset: {},
    textContent: more.text ?? '', childNodes: more.text ? [{ nodeType: 3, data: more.text }] : [],
    parentElement: more.parent ?? { getBoundingClientRect: () => rect(0, 0, 1200, 800) },
    closest: (sel) => sel.split(',').some((s) => [`.${cls}`, ...(more.inside ?? [])].includes(s.trim().split(' ').pop())),
    getBoundingClientRect: () => r, getAttribute: (name) => more.attrs?.[name] ?? null,
    offsetWidth: r.width, clientWidth: r.width, scrollWidth: more.scrollWidth ?? r.width, clientHeight: r.height, scrollHeight: more.scrollHeight ?? r.height,
    tabIndex: more.tabIndex ?? -1, textWidth: more.textWidth ?? 0,
    style: { textOverflow: more.textOverflow ?? 'clip', overflowX: more.overflow ?? 'visible', overflowY: more.overflowY ?? 'visible' },
    querySelectorAll: () => more.items ?? [],
    _segs: more.segs,
  });
  const page = ({ width = 1280, all = [], layers = [], scrolls = [], badges = [], flows = [] } = {}) => {
    const lists = { 'body *': all, 'main .pins': layers, 'main .scroll, main .map, main .tbl-wrap': scrolls, 'main .canvas .d-badge, main .chip, main .tag': badges, 'main .flow': flows };
    return {
      documentElement: { clientWidth: width },
      querySelectorAll(sel) { if (!(sel in lists)) throw new Error(`unknown selector ${sel}`); return lists[sel]; },
      createRange() { let node; return { selectNodeContents(n) { node = n; }, getBoundingClientRect: () => ({ width: node.textWidth }) }; },
    };
  };
  const row = { getBoundingClientRect: () => rect(0, 0, 400, 30) };
  const kinds = (doc) => layoutCheck(doc).problems.map((p) => p.kind);
  const wide = (more) => el('div', 'wide', rect(0, 0, 1400, 20), more);
  const note = (more) => el('p', 'note', rect(0, 0, 200, 20), { text: 'A long note', overflow: 'hidden', scrollWidth: 300, ...more });
  const scroll = (more) => el('div', 'scroll', rect(0, 0, 600, 100), { scrollWidth: 900, ...more });
  const chip = (more) => el('span', 'chip', rect(0, 0, 300, 20), { textWidth: 40, parent: row, text: 'proposed', ...more });

  it('checkProposalLayout passes a page that fits and reports each layout fault by its kind', () => {
    const fits = page({
      all: [el('p', 'takeaway', rect(0, 0, 600, 20), { text: 'One sentence.' })],
      layers: [el('div', 'pins', rect(0, 0, 200, 200), { items: [el('a', 'pin', rect(0, 0, 20, 20)), el('a', 'pin', rect(40, 0, 20, 20))] })],
      scrolls: [scroll({ tabIndex: 0, attrs: { 'aria-label': 'Table, scrolls sideways' } })],
      badges: [el('span', 'chip', rect(0, 0, 70, 20), { textWidth: 40, parent: row })],
    });
    expect(layoutCheck(fits)).toEqual({ ok: true, problems: [] });
    const pins = [el('a', 'pin', rect(0, 0, 20, 20)), el('a', 'pin', rect(5, 5, 20, 20))];
    pins.forEach((p, i) => { p.dataset.n = String(i + 1); });
    expect(layoutCheck(page({ all: [wide()] }))).toEqual({ ok: false, problems: [expect.objectContaining({ kind: 'page-overflow' })] });
    expect(kinds(page({ all: [note()] }))).toEqual(['text-clipped']);
    expect(kinds(page({ all: [note({ overflow: 'visible', overflowY: 'hidden', scrollWidth: 200, scrollHeight: 60 })] }))).toEqual(['text-clipped']);
    expect(kinds(page({ layers: [el('div', 'pins', rect(0, 0, 200, 200), { items: pins })] }))).toEqual(['pin-overlap']);
    expect(kinds(page({ scrolls: [scroll()] }))).toEqual(['scroll-unreachable']);
    expect(kinds(page({ scrolls: [scroll({ attrs: { 'aria-label': 'Table, scrolls sideways' } })] }))).toEqual(['scroll-unreachable']);
    expect(kinds(page({ scrolls: [scroll({ tabIndex: 0 })] }))).toEqual(['scroll-unreachable']);
    const stretched = layoutCheck(page({ badges: [chip()] }));
    expect(stretched.problems).toEqual([{ kind: 'stretched', item: 'span.chip "proposed"', detail: '300 px wide for 40 px of text: it stretches across its row; wrap it in a d-row' }]);
    const wideRow = { getBoundingClientRect: () => rect(0, 0, 1000, 30) };
    expect(kinds(page({ badges: [chip({ parent: wideRow })] }))).toEqual([]);
  });

  it('checkProposalLayout leaves out what it exempts: a wide box in a wide parent, a box in a scroll box, a thumbnail, a dialog or a tip, a hidden one, an ellipsis, a note on the canvas, a box with no text of its own, a chip in a thumbnail', () => {
    const parent = wide();
    expect(kinds(page({ all: [parent, wide({ parent })] }))).toEqual(['page-overflow']);
    for (const inside of ['.scroll', '.mini', '.strip-clip', 'dialog', '.tipbox']) expect(kinds(page({ all: [wide({ inside: [inside] })] })), inside).toEqual([]);
    expect(kinds(page({ all: [wide({ hidden: true })] }))).toEqual([]);
    expect(kinds(page({ all: [note({ textOverflow: 'ellipsis' })] }))).toEqual([]);
    expect(kinds(page({ all: [note({ inside: ['.canvas'] })] }))).toEqual([]);
    expect(kinds(page({ all: [note({ text: '' })] }))).toEqual([]);
    for (const inside of ['.mini', '.strip-clip']) expect(kinds(page({ badges: [chip({ inside: [inside] })] })), inside).toEqual([]);
  });

  it('checkProposalLayout reports flow parts that cover each other and a connector that runs through a part', () => {
    const flow = (items, segs) => el('div', 'flow', rect(0, 0, 400, 300), { items, segs });
    const step = (id, r) => el('div', 'flow-step', r, { id, text: id });
    const [a, b, c] = [step('a', rect(0, 0, 100, 40)), step('b', rect(0, 160, 100, 40)), step('c', rect(20, 80, 100, 40))];
    expect(kinds(page({ flows: [flow([a, b, c], [])] }))).toEqual([]);
    expect(kinds(page({ flows: [flow([a, step('d', rect(50, 10, 100, 40))], [])] }))).toEqual(['flow-overlap']);
    const through = page({ flows: [flow([a, b, c], [{ from: a, to: b, x1: 50, y1: 40, x2: 50, y2: 160 }])] });
    expect(layoutCheck(through).problems).toEqual([expect.objectContaining({ kind: 'flow-crosses', detail: 'the connector a to b runs through it' })]);
    expect(kinds(page({ flows: [flow([a, b, c], [{ from: a, to: b, x1: 300, y1: 40, x2: 300, y2: 160 }])] }))).toEqual([]);
  });

  it('the frame script keeps a tip 8 px inside the window, closes it on Escape, describes it to a screen reader and names scroll boxes', () => {
    expect(js).toMatch(/innerWidth - w - 8/);
    expect(js).toMatch(/e\.key === 'Escape'/);
    expect(js).toMatch(/aria-describedby/);
    expect(js).toMatch(/setAttribute\('role', 'region'\)/);
    expect(frame).not.toMatch(/\[data-tip\]:hover::after/);
  });

  it('has a motion guard and a danger pair, and its mapping colours read at 4.5:1 on white', () => {
    expect(frame).toMatch(/prefers-reduced-motion: reduce/);
    for (const name of ['--danger', '--info', '--ok', '--warn']) expect(contrast(hex(name), '#ffffff'), name).toBeGreaterThanOrEqual(4.5);
    expect(contrast(hex('--danger'), hex('--danger-soft'))).toBeGreaterThanOrEqual(4.5);
  });
});

describe('the invite-teammate example agrees with itself', () => {
  const invite = readFileSync(path.join(skill, 'assets/proposals/invite-teammate/r1/proposal.html'), 'utf8');
  const figure = (id) => new RegExp(`<figure class="drawing" id="${id}">([\\s\\S]*?)</figure>`).exec(invite)?.[1] ?? '';
  const row = /<tr><th scope="row">A team lead: invite a teammate<\/th>(.*?)<\/tr>/.exec(invite)?.[1] ?? '';
  const steps = [...row.matchAll(/<a class="pinref" href="#([\w-]+)" data-n="(\d+)">\d+<\/a><span class="step-what">([^<]*)<\/span>/g)];
  const invited = steps[1]?.[3];

  it('invites one address in the path, and the last step points at the list', () => {
    expect(steps).toHaveLength(4);
    expect(invited).toBe('jordan.lee@example.com');
    expect(steps[3].slice(1, 3)).toEqual(['draw-team', '2']);
  });

  it.each(['draw-team', 'draw-team-phone'])('shows the invited address as Invited in #%s, under the pin of the last step', (id) => {
    const pinned = new RegExp(`<div class="d-listrow" data-note="${steps[3][2]}">(.*?)</div>\\n`).exec(figure(id))?.[1] ?? '';
    expect(pinned).toContain(`>${invited}<`);
    expect(pinned).toContain('<span class="d-badge d-badge--info">Invited</span>');
  });

  it('counts in the header the invitations the list draws', () => {
    const list = figure('draw-team');
    const drawn = (list.match(/<span class="d-strong">[\w.]+@example\.com<\/span>/g) ?? []).length;
    expect(list).toContain(`7 members, ${drawn} invitations`);
    expect(drawn).toBe(3);
  });
});
