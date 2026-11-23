/**
 * One broken copy of a worked example per rule of check-proposal.mjs that the
 * other files do not break: the frame blocks, the scripts that would call the
 * network, the sections, the head, the options, the logo, the drawings and
 * their notes, the overview and the strip, the answer block, the map, the
 * glossary, the revision line, the flow, the storyboard, the cue, the mapping,
 * the paths, the addresses, the app look against survey.json, and the fields
 * of CHOICE.md. Each case makes one edit and expects the finding of its rule.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import './replace-or-fail.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const skill = path.join(here, '../.frontx/ai/@gears-frontx/template-design-guardrails/skills/frontx-design-proposal');
const check = await import(pathToFileURL(path.join(skill, 'scripts/check-proposal.mjs')).href);
const read = (rel) => readFileSync(path.join(skill, 'assets/proposals', rel), 'utf8');
const tasks = read('team-tasks/r1/proposal.html');
const tasksR2 = read('team-tasks/r2/proposal.html');
const account = read('account-settings/r1/proposal.html');
const docs = read('docs-redesign/r1/proposal.html');
const invite = read('invite-teammate/r1/proposal.html');
const tasksSurvey = JSON.parse(read('team-tasks/r1/survey.json'));
const accountSurvey = JSON.parse(read('account-settings/r1/survey.json'));

/** Replaces the first match and fails loudly when the example no longer holds it. */
const edit = (page, from, to) => {
  const out = page.replaceOrFail(from, to);
  expect(out, String(from).slice(0, 80)).not.toBe(page);
  return out;
};
const cut = (page, re) => edit(page, re, '');
const beforeMain = (page, html) => edit(page, '\n</main>', `\n${html}\n</main>`);
const CUE = /<nav class="cue"[^\n]*<\/nav>\n/;
const D_LOGO = '<span class="d-logo"><svg aria-hidden="true"><use href="#brand-mark"/></svg></span>';
/** A second, partial notes list for draw-details: either order is a finding, and the first list in document order is the one compared with the pins. */
const PARTIAL_NOTES = '<ol class="notes" data-for="draw-details"><li data-n="1"><b>Only</b> one</li></ol>';
const DETAILS ='<figure class="drawing" id="draw-details"><div class="scroll"><div class="canvas">\n<div class="d-app">';

describe('check-proposal.mjs reports each rule on a broken copy of a worked example', () => {
  it.each([
    // the frame and the self-contained page
    ['external', 'a script calls fetch', () => beforeMain(tasks, '<script>fetch("x")</script>')],
    ['external', 'a script calls XMLHttpRequest', () => beforeMain(tasks, '<script>new XMLHttpRequest()</script>')],
    ['external', 'a script calls WebSocket', () => beforeMain(tasks, '<script>new WebSocket("x")</script>')],
    ['external', 'a script calls EventSource', () => beforeMain(tasks, '<script>new EventSource("x")</script>')],
    ['external', 'a script calls sendBeacon', () => beforeMain(tasks, '<script>navigator.sendBeacon("x")</script>')],
    ['external', 'a script calls import', () => beforeMain(tasks, '<script>import("x")</script>')],
    ['frame', 'an extra <script> block', () => beforeMain(tasks, '<script>fetch("x")</script>')],
    ['frame', 'the draw block is missing', () => edit(tasks, '<style id="draw">', '<style id="draw-x">')],
    ['frame', 'the frame-js block is missing', () => edit(tasks, '<script id="frame-js">', '<script id="frame-x">')],
    ['frame', 'the app-look block is missing', () => edit(tasks, '<style id="app-look">', '<style id="look-x">')],
    ['frame', 'the app-look block must be one .d-app', () => edit(tasks, '<style id="app-look">', '<style id="app-look">\n.d-top { --d-x: 1px; }')],
    // sections and the head
    ['sections', 'unknown section #extra', () => edit(tasks, '<section class="sec" id="answer">', '<section class="sec" id="extra"><h2>Extra</h2><p class="takeaway">One more part.</p></section>\n<section class="sec" id="answer">')],
    ['sections', 'the page needs an overview, or a map', () => edit(account, '<section class="sec" id="overview">', '<section class="sec" id="extra">')],
    ['sections', 'with options the recommendation section is required', () => cut(tasks, /<section class="sec" id="recommendation">[\s\S]*?<\/section>\n/)],
    ['head', 'the top bar (.topbar) sits before main', () => edit(edit(tasks, '\n<main>\n', '\n'), '<div class="topbar">', '<main>\n<div class="topbar">')],
    ['head', 'no takeaway (.takeaway)', () => edit(tasks, '<p class="takeaway">A Tasks link', '<p class="lead">A Tasks link')],
    ['head', 'no ask (.ask) in the head', () => edit(tasks, '<p class="ask">', '<p>')],
    // options
    ['options', 'option ids repeat', () => edit(tasks, 'id="option-b" data-option="b"', 'id="option-a" data-option="b"')],
    ['options', 'option #option-b needs data-option and the id option-<letter>', () => edit(tasks, 'id="option-b" data-option="b"', 'id="option-b" data-option="z"')],
    ['options', 'one design needs exactly one .option with id "design"', () => edit(account, 'class="option" id="design"', 'class="option" id="the-design"')],
    ['options', 'with several screens and no options, each .screen holds its drawing directly', () => edit(docs, '<section class="screen" id="screen-doc">', '<section class="screen" id="screen-doc"><section class="option" id="design"></section>')],
    // the logo defined once
    ['mark', '2 brand definitions (svg.brand-defs)', () => edit(account, /<svg class="brand-defs"[^\n]*\n/, (m) => m + m)],
    ['mark', 'the logo definition (svg.brand-defs) sits right after <body>, outside main', () => edit(edit(account, /<svg class="brand-defs"[^\n]*\n/, ''), '\n<main>\n', `\n<main>\n${/<svg class="brand-defs"[^\n]*\n/.exec(account)[0]}`)],
    ['mark', 'svg.brand-defs holds no <symbol id="brand-mark">', () => edit(account, '<symbol id="brand-mark"', '<symbol id="brand-x"')],
    ['mark', 'the logo definition (svg.brand-defs) holds text', () => edit(account, '</symbol></svg>', 'x</symbol></svg>')],
    ['mark', 'holds one svg or one img and nothing else', () => edit(account, D_LOGO, D_LOGO.replaceOrFail('<svg', '<i></i><svg'))],
    ['mark', 'img is not a data: png, jpeg, gif or webp image', () => edit(account, D_LOGO, '<span class="d-logo"><img src="data:image/svg+xml;base64,AAAA" alt=""></span>')],
    // drawings and notes
    ['pins', 'a drawing without an id', () => edit(tasks, '<figure class="drawing" id="draw-details">', '<figure class="drawing">')],
    ['pins', '#draw-details: pin 1 used twice', () => edit(tasks, '<span class="d-small d-muted">Tasks / TSK-128</span>', '<span class="d-small d-muted" data-note="1">Tasks / TSK-128</span>')],
    ['drawing', '#draw-details: no .canvas with a .d-app window', () => edit(tasks, DETAILS, DETAILS.replaceOrFail('<div class="d-app">', '<div class="d-main">'))],
    ['drawing', '#draw-details: a .d-app--zoom window outside a zoom', () => edit(tasks, DETAILS, DETAILS.replaceOrFail('"d-app"', '"d-app d-app--zoom"'))],
    ['drawing', 'raw colour in style "--cols: #ffffff"', () => edit(tasks, '<div class="d-grid" style="--cols: 3">', '<div class="d-grid" style="--cols: #ffffff">')],
    ['pins', 'notes list for "draw-nope" has no drawing', () => edit(tasks, '<ol class="notes" data-for="draw-details">', '<ol class="notes" data-for="draw-details"></ol>\n<ol class="notes" data-for="draw-nope">')],
    ['pins', 'two notes lists for #draw-details', () => edit(tasks, /<ol class="notes" data-for="draw-details">[\s\S]*?<\/ol>/, (m) => `${m}\n${PARTIAL_NOTES}`)],
    ['pins', 'two notes lists for #draw-details', () => edit(tasks, '<ol class="notes" data-for="draw-details">', `${PARTIAL_NOTES}\n<ol class="notes" data-for="draw-details">`)],
    ['pins', '#draw-details: pin 2 has no note', () => edit(tasks, '<ol class="notes" data-for="draw-details">', `${PARTIAL_NOTES}\n<ol class="notes" data-for="draw-details">`)],
    ['text', 'note 9 of draw-a has no bold label', () => edit(tasks, '<li data-n="9"><b>Missing values</b>', '<li data-n="9">Missing values')],
    // overview and strip
    ['overview', 'the thumbnail of #option-b shows "draw-nope", which is not a drawing', () => edit(tasks, '<a class="opt-link" href="#option-b"><span class="mini" data-mini-of="draw-b">', '<a class="opt-link" href="#option-b"><span class="mini" data-mini-of="draw-nope">')],
    ['overview', 'the link to #option-b holds no name (.opt-name)', () => edit(tasks, '<span class="opt-name">B. Cards</span>', '<span>B. Cards</span>')],
    ['overview', '#option-b has 0 overview links', () => edit(tasks, '<a class="opt-link" href="#option-b"><span class="mini"', '<a class="opt-link" href="#option-a"><span class="mini"')],
    ['overview', 'with options the overview marks "The same in every option"', () => edit(tasks, '<dt>The same in every option</dt>', '<dt>Shared</dt>')],
    ['strip', 'the strip sits above the overview links', () => {
      const strip = /  <div class="strip">[\s\S]*?\n  <\/div>\n/.exec(tasks)[0];
      return edit(cut(tasks, strip), '  <dl class="compare">', `${strip}  <dl class="compare">`);
    }],
    ['strip', 'a strip cell of "draw-nope", which is not a full drawing', () => edit(tasks, 'data-strip-of="draw-c"', 'data-strip-of="draw-nope"')],
    ['strip', '#draw-c marks no region (data-strip) for the strip', () => edit(tasks, '<div class="d-board" style="--cols: 4" data-strip>', '<div class="d-board" style="--cols: 4">')],
    ['strip', 'the strip cell of "draw-c" shows a drawing inside a disclosure', () => edit(tasks, /<figure class="drawing" id="draw-c">[\s\S]*?<\/figure>/, (m) => `<details class="more"><summary>The board option, drawn full size</summary>${m}</details>`)],
    ['strip', 'a strip compares options; with one design there is none', () => beforeMain(account, '<div class="strip"></div>')],
    ['overview', 'recommendation link #option-z is not an option', () => edit(tasks, 'href="#option-c"><span class="opt-name">C. Board by status</span><span class="small">Trade-off', 'href="#option-z"><span class="opt-name">C. Board by status</span><span class="small">Trade-off')],
    // the answer block
    ['answer', 'the group "option" has no legend', () => edit(tasks, '<legend>Which option?</legend>', '')],
    ['answer', 'no "Which option?" group', () => edit(tasks, 'data-q="option"', 'data-q="pick"')],
    ['answer', '"Which option?" marks 0 options suggested', () => edit(tasks, '<b>A. Table</b> <span class="tag">suggested</span>', '<b>A. Table</b>')],
    // map, glossary, revision
    ['map', 'a map shows two screens or more', () => cut(tasks, /<div class="map-col"><a class="map-node" href="#screen-details">.*?<\/div>/)],
    ['map', 'map node #screen-details holds no thumbnail (.mini)', () => edit(tasks, '<span class="mini" data-mini-of="draw-details"></span><span class="map-name">', '<span class="map-name">')],
    ['map', 'map node #screen-details holds no name (.map-name)', () => edit(tasks, '<span class="map-name">Task details</span>', '<span>Task details</span>')],
    ['glossary', 'entry "Overdue" needs the id term-<key>', () => edit(tasks, '<dt id="term-overdue">', '<dt id="overdue">')],
    ['revision', 'the "Changed since" line links to the changed sections', () => edit(tasksR2, /<p class="changed">.*<\/p>/, '<p class="changed">Changed since r1: the list and its filters.</p>')],
    // flow
    ['flow', '#flow holds the page\'s one flow (div.flow)', () => beforeMain(invite, '<div class="flow"></div>')],
    ['flow', 'data-cols="5"; a flow has 2, 3 or 4 columns', () => edit(invite, '<div class="flow" data-cols="3">', '<div class="flow" data-cols="5">')],
    ['flow', 'the box "Invite a teammate" has no id', () => edit(invite, '<a class="flow-step" id="f-invite" ', '<a class="flow-step" ')],
    ['flow', 'has no name (.flow-name)', () => edit(invite, '<span class="flow-name">Invite a teammate</span>', '<span>Invite a teammate</span>')],
    ['flow', 'the start "', () => edit(edit(invite, ' data-start="Start">', '>'), 'class="flow-decision" id=', 'data-start="Start" class="flow-decision" id=')],
    // storyboard, cue, text
    ['storyboard', 'a storyboard (ol.story) without an aria-label', () => edit(invite, '<ol class="story" data-width="phone" aria-label="Sending an invitation, step by step">', '<ol class="story" data-width="phone">')],
    ['storyboard', 'frame 3 is not an li.story-frame', () => edit(invite, '<li class="story-frame"><figure class="drawing" id="draw-send-3"', '<li class="story-step"><figure class="drawing" id="draw-send-3"')],
    ['storyboard', 'frame 3 holds one drawing', () => edit(invite, '<li class="story-frame"><figure class="drawing" id="draw-send-3"', '<li class="story-frame"><figure class="sketch" id="draw-send-3"')],
    ['cue', 'the position cue is a nav.cue right in main, after the head', () => edit(cut(invite, CUE), '\n</header>', `\n${CUE.exec(invite)[0]}</header>`)],
    ['cue', 'the position cue (nav.cue) has no aria-label', () => edit(invite, '<nav class="cue" aria-label="On this page">', '<nav class="cue">')],
    ['text', 'aria-label "TODO steps" still holds template text', () => edit(invite, 'aria-label="Sending an invitation, step by step"', 'aria-label="TODO steps"')],
    // mapping, paths, addresses
    ['mapping', 'no mapping table (table.mapping)', () => edit(docs, '<table class="tbl mapping"', '<table class="tbl"')],
    ['mapping', 'the mapping table has no part of today\'s page', () => edit(docs, /(<table class="tbl mapping"[\s\S]*?<tbody>)[\s\S]*?(<\/tbody>)/, '$1\n    $2')],
    ['mapping', 'a mapping row needs the part (th), where it is today and where it goes', () => edit(docs, '<td>the same place, new lead</td></tr>', '</tr>')],
    ['mapping', 'the row "Heading and lead" does not say where it goes', () => edit(docs, '<td>the same place, new lead</td>', '<td> </td>')],
    ['paths', 'the paths table has no task', () => edit(docs, /(<table class="tbl paths-tbl"[\s\S]*?<tbody>)[\s\S]*?(<\/tbody>)/, '$1\n    $2')],
    ['paths', 'a path row without its task (th scope="row")', () => edit(docs, '<tr><th scope="row">Find a guide by name</th>', '<tr><td>Find a guide by name</td>')],
    ['paths', 'step 1 of "Find a guide by name" does not name its screen (.step-screen)', () => edit(docs, '<span class="step-no">1</span><span class="step-screen">Docs list</span><a class="pinref" href="#draw-list" data-n="1">', '<span class="step-no">1</span><a class="pinref" href="#draw-list" data-n="1">')],
    ['paths', 'step 1 of "Find a guide by name" does not say what is used there (.step-what)', () => edit(docs, '<span class="step-what">search "deploy"</span>', '')],
    ['paths', 'the task "Find a guide by name" has no Today cell', () => edit(docs, '<td class="today" data-steps="3">each tab in turn, reading titles, then Open</td>', '<td></td>')],
    ['paths', 'a "!" mark with no Today column to compare against', () => edit(tasks, /(<th scope="row">See what is done)(<\/th>)/, '$1<a class="longer" href="#q-2" aria-label="Longer, see question 2">!</a>$2')],
    ['addresses', 'no addresses table (table.addresses)', () => edit(docs, '<table class="tbl addresses"', '<table class="tbl"')],
    ['addresses', 'the addresses table has no "Address" column', () => edit(docs, '<th>Screen</th><th>Address</th>', '<th>Screen</th><th>Link</th>')],
    ['addresses', 'a base line needs its tag (.base-tag) and its address (code)', () => edit(docs, '<div class="tbl-wrap"><table class="tbl addresses"', '<p class="bases"><span><span class="base-tag">Live</span><code>https://app.example.com</code></span><span>No tag here</span></p>\n  <div class="tbl-wrap"><table class="tbl addresses"')],
  ])('[%s] %s', (kind, message, build) => {
    const found = check.checkPage(build()).findings;
    expect(found.filter((f) => f.startsWith(`[${kind}]`) && f.includes(message)), found.join('\n')).toHaveLength(1);
  });
});

describe('check-proposal.mjs reports each rule against survey.json', () => {
  const look = (key, value) => ({ ...tasksSurvey, look: { ...tasksSurvey.look, [key]: value } });
  it.each([
    ['app-look', 'survey.json left --d-radius unresolved', () => [edit(tasks, /(<style id="app-look">[\s\S]*?)  --d-radius: [^\n]*\n/, '$1'), look('radius', 'unresolved')]],
    ['app-look', '--d-radius fills a value the survey left unresolved', () => [tasks, look('radius', 'unresolved')]],
    // A variant the survey asks for is missing from every drawing: one finding per desktop window (6) and per brand (10) of the page.
    ['variants', 'an app window without d-app--wide', () => [tasks, { ...tasksSurvey, variants: { ...tasksSurvey.variants, window: `${tasksSurvey.variants.window} d-app--wide` } }], 6],
    ['variants', 'the brand lacks d-brand--wide', () => [tasks, { ...tasksSurvey, variants: { ...tasksSurvey.variants, brand: `${tasksSurvey.variants.brand} d-brand--wide` } }], 10],
    ['mark', 'survey.json defines no logo (brandDefs is null)', () => [account, { ...accountSurvey, brandDefs: null }]],
    ['mark', 'survey.json draws no logo (brandMark initials)', () => [edit(account, D_LOGO, '<span class="d-logo"><img src="data:image/png;base64,AAAA" alt=""></span>'), { ...accountSurvey, brandMark: { kind: 'initials' } }]],
  ])('[%s] %s', (kind, message, build, count = 1) => {
    const [html, survey] = build();
    const found = check.checkPage(html, { survey }).findings;
    expect(found.filter((f) => f.startsWith(`[${kind}]`) && f.includes(message)), found.join('\n')).toHaveLength(count);
  });
});

describe('checkChoice reports each field rule', () => {
  const awaiting = read('invite-teammate/r1/CHOICE.md');
  const selected = read('team-tasks/CHOICE.selected.md');
  it.each([
    ['field "Purpose" is empty', () => edit(awaiting, /^- Purpose: .*$/m, '- Purpose:'), {}],
    ['unknown Status "pending"', () => edit(awaiting, '- Status: awaiting selection', '- Status: pending'), {}],
    ['Design is "one" or "options"', () => edit(awaiting, '- Design: one', '- Design: two'), {}],
    ['Design is "options" but fewer than two "- Option <letter>:" lines', () => edit(awaiting, '- Design: one', '- Design: options'), {}],
    ['Design is "one" but option lines are listed', () => edit(awaiting, '- Design: one', '- Design: one\n- Option a: Table. Best for: x. Trade-off: y.'), {}],
    ['the page shows one design but CHOICE.md lists options', () => edit(awaiting, '- Design: one', '- Design: options\n- Option a: Table. Best for: x. Trade-off: y.\n- Option b: Cards. Best for: x. Trade-off: y.'), { options: [] }],
    ['"Chosen" must be "none yet" while awaiting selection', () => edit(awaiting, '- Chosen: none yet', '- Chosen: design'), {}],
    ['Selected on must be a date, YYYY-MM-DD', () => edit(selected, /^- Selected on: .*$/m, '- Selected on: yesterday'), {}],
    ["Person's words must be the reply quoted word for word", () => edit(selected, /^- Person's words: "(.*)"$/m, "- Person's words: $1"), {}],
  ])('%s', (message, build, opts) => {
    const found = check.checkChoice(build(), opts);
    expect(found.filter((f) => f.startsWith(`[choice] ${message}`)), found.join('\n')).toHaveLength(1);
  });
});
