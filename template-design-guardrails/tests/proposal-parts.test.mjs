/**
 * check-proposal.mjs on the page parts of references/page-parts.md: broken
 * copies of the worked example's r1 and r2 pages, one per finding, and the
 * revision fields of CHOICE.md.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import './replace-or-fail.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const skill = path.join(here, '../.frontx/ai/@gears-frontx/template-design-guardrails/skills/frontx-design-proposal');
const example = path.join(skill, 'assets/proposals/team-tasks');
const check = await import(pathToFileURL(path.join(skill, 'scripts/check-proposal.mjs')).href);

const r1 = readFileSync(path.join(example, 'r1/proposal.html'), 'utf8');
const r2 = readFileSync(path.join(example, 'r2/proposal.html'), 'utf8');
const edit = (page, from, to) => {
  expect(page.includes(from), from).toBe(true);
  return page.replaceOrFail(from, to);
};
const AFTER_A = '  </section>\n\n  <section class="option" id="option-b"';
const zoom = (cls, of = 'draw-a') => `<figure class="drawing" id="draw-a-zoom" data-zoom-of="${of}"><div class="scroll"><div class="canvas"><div class="${cls}"><span class="d-select">Assignee: Me</span></div></div></div><figcaption>The assignee filter, open.</figcaption></figure>\n${AFTER_A}`;
const withZoom = (cls, of) => edit(r1, AFTER_A, zoom(cls, of));
const NAV = '<nav class="d-side d-active--filled"><span class="d-brand d-brand--initials"><span class="d-mark">TH</span>Team Hub</span><span class="d-navlink">Home</span><span class="d-navlink">Docs</span><span class="d-navlink d-navlink--active">Tasks</span></nav><div class="d-main">\n<div class="d-row"><span class="d-btn d-btn--ghost d-btn--sm" data-note="1">Back to tasks</span>';
// Option A's phone view, the pair of its drawing and notes, and its headings
const A_PHONE = /    <h4 class="view-name">On a phone<\/h4>\n    <div class="pair">\n<figure class="drawing" id="draw-a-phone">[\s\S]*?<\/ol>\n    <\/div>\n/;
const aPhone = () => r1.match(A_PHONE)[0];
const phoneInDisclosure = () => r1.replaceOrFail(A_PHONE, (m) => `    <details class="more"><summary>Option A on a phone, full size</summary>\n${m}    </details>\n`);
const DISCLOSE = '    <p class="reads">Reads: <span class="mark">exists today</span> people\'s names, from AccountsApiService; <span class="mark mark--new">needs a new data request</span> one task';
const disclosure = (summary, inner = '') => edit(r1, DISCLOSE, `    <details class="more"><summary>${summary}</summary>${inner}<span>The activity of the last year.</span></details>\n${DISCLOSE}`);

describe('check-proposal.mjs on broken copies of the page parts', () => {
  it.each([
    ['thumbnail', 'a thumbnail of "draw-nope", which is not a full drawing', edit(r1, 'data-mini-of="draw-details"', 'data-mini-of="draw-nope"')],
    ['thumbnail', 'a thumbnail of "draw-a-zoom"', edit(withZoom('d-app d-app--zoom'), 'data-mini-of="draw-details"', 'data-mini-of="draw-a-zoom"')],
    ['thumbnail', 'shows a drawing inside a disclosure', edit(phoneInDisclosure(), 'data-mini-of="draw-details"', 'data-mini-of="draw-a-phone"')],
    ['map', 'map node #screen-nope is not a screen', edit(r1, '<a class="map-node" href="#screen-details">', '<a class="map-node" href="#screen-nope">')],
    ['map', 'screen #screen-details has 0 map nodes', edit(r1, '<a class="map-node" href="#screen-details">', '<a class="map-node" href="#screen-nope">')],
    ['map', 'no line saying what the arrows mean', edit(r1, 'class="small map-key"', 'class="small"')],
    ['map', '2 screens and no map', r1.replaceOrFail(/<section class="sec" id="map">[\s\S]*?<\/section>\n/, '')],
    ['drawing', '#draw-details: an app window without its navigation', edit(r1, NAV, NAV.replaceOrFail(/<nav class="d-side[^"]*">.*<\/nav>/, ''))],
    ['drawing', 'a zoom holds only .d-app--zoom windows', withZoom('d-app')],
    ['drawing', 'zoom of "draw-x", which is not a full drawing', withZoom('d-app d-app--zoom', 'draw-x')],
    ['chips', 'a chip with state "agreed"', edit(r1, '<span class="chip" data-state="accepted">accepted</span>', '<span class="chip" data-state="agreed">agreed</span>')],
    ['chips', 'reads "done" but its state is accepted', edit(r1, '<span class="chip" data-state="accepted">accepted</span>', '<span class="chip" data-state="accepted">done</span>')],
    ['chips', 'repeats "proposed"', edit(r1, '<span class="chip" data-state="accepted">accepted</span>', '<span class="chip" data-state="proposed">proposed</span>')],
    ['chips', 'repeats "accepted"', edit(r2, '<b>Show done</b> Off by default', '<b>Show done</b> <span class="chip" data-state="accepted">accepted</span> Off by default')],
    ['chips', 'an open chip links to its open question', edit(r1, 'href="#q-2">open</a>', 'href="#q-9">open</a>')],
    ['disclosure', 'does not say what it hides', disclosure('Older')],
    ['disclosure', 'a disclosure inside a disclosure', disclosure('The older activity, full', '<details class="more"><summary>One more level down</summary></details>')],
    ['views', 'option #option-a has no phone drawing', r1.replaceOrFail(A_PHONE, '')],
    ['views', 'options differ in which views they show (#option-a: desktop, #option-b: desktop+phone, #option-c: desktop+phone)', r1.replaceOrFail(A_PHONE, '')],
    ['views', 'screen #screen-details has no phone drawing', r1.replaceOrFail(/(<section class="screen" id="screen-details">[\s\S]*?)    <h4 class="view-name">On a phone<\/h4>[\s\S]*?    <h4 class="view-name">On a desktop<\/h4>\n/, '$1')],
    ['views', 'option #option-a: the phone drawing comes after the desktop one', r1.replaceOrFail(A_PHONE, '').replaceOrFail('<ol class="notes" data-for="draw-a">', () => `${aPhone()}<ol class="notes" data-for="draw-a">`)],
    ['views', 'option #option-a: the phone drawing #draw-a-phone is inside a disclosure', phoneInDisclosure()],
    ['views', 'option #option-b has no desktop drawing', r1.replaceOrFail(/<section class="option" id="option-b"[\s\S]*?<figure class="drawing" id="draw-b">[\s\S]*?<\/figure>\n<ol class="notes" data-for="draw-b">[\s\S]*?<\/ol>\n/, (m) => m.replaceOrFail(/<figure class="drawing" id="draw-b">[\s\S]*?<\/ol>\n$/, ''))],
    ['head', 'no top bar (.topbar)', r1.replaceOrFail(/<div class="topbar">[\s\S]*?<\/div><\/div>\n/, '')],
    ['head', 'the title must read "Proposal: <page title>"', edit(r1, '<h1 class="topbar-title">Proposal: Team tasks</h1>', '<h1 class="topbar-title">Team tasks</h1>')],
    ['head', '2 h1 elements', edit(r1, '<header class="sec head" id="head">', '<header class="sec head" id="head">\n  <h1>Proposal: Team tasks</h1>')],
    ['head', 'the top bar has no page facts', edit(r1, '<p class="topbar-meta">', '<p class="topbar-facts">')],
    ['frame', 'the top bar\'s FrontX mark (.topbar-logo) differs', edit(r1, '<span class="topbar-logo"><svg', '<span class="topbar-logo"><svg data-x="1"')],
    ['glossary', 'term "column" has no glossary entry', edit(r1, 'data-term="board">board</span>', 'data-term="column">board</span>')],
    ['glossary', 'entry "board" is used by no term', edit(r1, '<span class="term" data-term="board">board</span>', 'board')],
    ['glossary', 'term "counters" is marked twice in #how', edit(r1, '<span class="term" data-term="board">board</span>', '<span class="term" data-term="counters">board</span>')],
    ['glossary', 'entry "board" has no meaning', edit(r1, '<dd>Tasks as columns, one per status, moved from column to column. Like sticky notes on a wall. <a href="#option-c">Drawn in option C</a></dd>', '<dd> </dd>')],
    ['tips', 'a tip inside a takeaway', edit(r1, 'in one of three layouts;', 'in one of <span data-tip="see options">three layouts</span>;')],
    ['tips', 'an empty data-tip', edit(r1, 'data-tip="Our guess;', 'data-tip=" " data-x="Our guess;')],
    ['paths', 'pin 55 of #draw-details, which has no such pin', edit(r1, 'href="#draw-details" data-n="5">5</a>', 'href="#draw-details" data-n="55">55</a>')],
    ['paths', 'a pin reference to "draw-x", which is not a drawing', edit(r1, 'href="#draw-details" data-n="5">5</a>', 'href="#draw-x" data-n="5">5</a>')],
    ['paths', 'the task "See what is done" has fewer than two steps', r1.replaceOrFail(/(<th scope="row">See what is done<\/th><td class="step">.*?<\/td>)<td class="step">.*?<\/td>/, '$1<td></td>')],
    ['data', 'screen #screen-details has no data line', r1.replaceOrFail(/(<section class="screen" id="screen-details">[\s\S]*?)<p class="reads">.*?<\/p>\n/, '$1')],
    ['data', 'a data line without', r1.replaceOrFail(/(<section class="screen" id="screen-details">[\s\S]*?<p class="reads">)Reads:.*?<\/p>/, '$1Reads: one task.</p>')],
    ['revision', 'revision r2 needs the line "Changed since r1: ..."', r2.replaceOrFail(/ {2}<p class="changed">.*<\/p>\n/, '')],
    ['revision', 'links to #nowhere, which does not exist', edit(r2, '<a href="#paths">', '<a href="#nowhere">')],
    ['revision', 'r1 has no "Changed since" line', edit(r1, '  <p class="takeaway">', '  <p class="changed">Changed since r0: <a href="#how">all</a></p>\n  <p class="takeaway">')],
  ])('reports %s: %s', (kind, message, html) => {
    const found = check.checkPage(html).findings;
    expect(found.filter((f) => f.startsWith(`[${kind}]`) && f.includes(message)), found.join('\n')).toHaveLength(1);
  });

  it('keeps a zoom on a full drawing and a named disclosure clean', () => {
    expect(check.checkPage(withZoom('d-app d-app--zoom')).findings).toEqual([]);
    expect(check.checkPage(disclosure('The older activity, full')).findings).toEqual([]);
  });
});

describe('the revision fields of CHOICE.md', () => {
  const choice = readFileSync(path.join(example, 'r1/CHOICE.md'), 'utf8');

  it('reports a wrong Replaces and a replaced record without the feedback quoted', () => {
    const found = check.checkChoice(choice.replaceOrFail('- Replaces: none', '- Replaces: r0').replaceOrFail(/^- Person's words: .*$/m, "- Person's words: liked it"), { options: ['a', 'b', 'c'] });
    expect(found).toContain('[choice] Replaces is "r0"; revision r1 replaces none');
    expect(found).toContain("[choice] Person's words of a replaced revision quote the feedback word for word");
  });

  it('takes the chosen option letter in either case', () => {
    const selected = readFileSync(path.join(example, 'CHOICE.selected.md'), 'utf8').replaceOrFail('- Design: one', '- Design: options\n- Option a: Table. Best for: x. Trade-off: y.\n- Option b: Cards. Best for: x. Trade-off: y.').replaceOrFail('- Chosen: design', '- Chosen: B');
    expect(check.checkChoice(selected, { options: ['a', 'b'] }).filter((f) => f.includes('Chosen'))).toEqual([]);
  });

  it('reports a field still holding its template text, an @ value included', () => {
    expect(check.checkChoice(choice.replaceOrFail(/^- Kit version: .*$/m, '- Kit version: <@gears-frontx/ui-kit version from its package.json>'))).toContain('[choice] placeholder <@gears-frontx/ui-kit version from its package.json> left');
  });

  it('takes an address written with a named part in the survey line as the address form, not a placeholder', () => {
    const survey = (line) => check.checkChoice(choice.replaceOrFail(/^(- Survey: .*)$/m, `$1 ${line}`)).filter((f) => f.includes('placeholder'));
    expect(survey('The menu builds its links as /?screen=<route>, and a task opens at /tasks/<id>.')).toEqual([]);
    expect(survey('The menu builds its links as <route>.')).toEqual(['[choice] placeholder <route> left']);
    expect(survey('The menu builds its links as /?screen=<the route name>.')).toEqual(['[choice] placeholder <the route name> left']);
  });

  it('reports a replaced record that fills the build hand-off', () => {
    expect(check.checkChoice(choice.replaceOrFail('- Route: none yet', '- Route: /tasks'), { options: ['a', 'b', 'c'] })).toContain('[choice] "Route" stays "none yet" in a replaced revision');
  });
});

describe('the frame of templates/proposal.html', () => {
  const frame = readFileSync(path.join(skill, 'templates/proposal.html'), 'utf8').match(/<style id="frame">([\s\S]*?)<\/style>/)[1];
  const value = (name) => frame.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`))?.[1];
  const neutral = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)); return Math.max(r, g, b) - Math.min(r, g, b) <= 4; };

  it('is one light theme on a white page with no dark scheme', () => {
    expect(value('--bg')).toBe('#ffffff');
    expect(frame).not.toMatch(/color-scheme|prefers-color-scheme/);
  });

  it('keeps every frame surface, text and line neutral grey, with no blue tint', () => {
    for (const name of ['--bg', '--raise', '--raise-2', '--text', '--muted', '--line', '--line-strong', '--link']) expect(neutral(value(name)), name).toBe(true);
  });
});
