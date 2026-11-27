/**
 * Every length and count limit of check-proposal.mjs at its boundary: the
 * value at the limit passes, the next one fails. Each case edits one worked
 * example and looks only at the finding of that limit.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import './replace-or-fail.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const skill = path.join(here, '../.frontx/ai/@gears-frontx/template-design-guardrails/skills/frontx-design-proposal');
const check = await import(pathToFileURL(path.join(skill, 'scripts/check-proposal.mjs')).href);
const example = (rel) => readFileSync(path.join(skill, 'assets/proposals', rel), 'utf8');
const tasks = example('team-tasks/r1/proposal.html');
const docs = example('docs-redesign/r1/proposal.html');
const invite = example('invite-teammate/r1/proposal.html');
const account = example('account-settings/r1/proposal.html');
const survey = JSON.parse(example('team-tasks/r1/survey.json'));
const edit = (page, from, to) => { expect(page.includes(from), String(from).slice(0, 60)).toBe(true); return page.replaceOrFail(from, () => to); };
// Every other change asserts that it changed the page, so no row can pass on the unchanged example.
const changed = (before, after) => { expect(after, 'the change matched nothing').not.toBe(before); return after; };
const replaceOnce = (page, pattern, to) => changed(page, page.replaceOrFail(pattern, to));
const words = (n, w = 'word') => Array.from({ length: n }, (_, i) => `${w}${i + 1}`).join(' ');
const findings = (html, opts) => check.checkPage(html, opts).findings;
// The findings of one rule: its kind and a piece of its message.
const of = (html, kind, piece, opts) => findings(html, opts).filter((f) => f.startsWith(`[${kind}]`) && f.includes(piece));

describe.each([
  // [rule, limit, build(n) -> page, kind, message piece]
  ['a note label of five words', 5, (n) => edit(tasks, '<b>Status select</b>', `<b>${words(n)}</b>`), 'text', 'longer than five words'],
  ['a note of thirty-six words', 36, (n) => edit(tasks, '<li data-n="9"><b>Missing values</b> Unassigned and No date are shown in words, never left blank.</li>', `<li data-n="9"><b>Missing values</b> ${words(n - 2)}.</li>`), 'text', 'note 9 of draw-a is longer than one line'],
  ['a section takeaway of thirty words', 30, (n) => edit(tasks, 'Two screens: the tasks list, and the details of one task, which a row click opens.', `${words(n)}.`), 'takeaway', 'the takeaway of #map runs'],
  ['the head takeaway of thirty words', 30, (n) => edit(tasks, 'A Tasks link in the side menu opens every team task with its owner, status and due date in one of three layouts; a task opens its details.', `${words(n)}.`), 'head', 'the takeaway runs'],
  ['a text of sixteen words in a drawing', 16, (n) => edit(tasks, '<span class="d-muted">10 tasks across the team</span></div><span class="d-btn d-btn--primary" data-note="1">', `<span class="d-muted">${words(n)}</span></div><span class="d-btn d-btn--primary" data-note="1">`), 'drawing', 'drawings carry labels, not paragraphs'],
  ['a mapping cell of twelve words', 12, (n) => edit(docs, '<td>the Section filter beside search</td>', `<td>${words(n)}</td>`), 'label', 'in a table cell; 12 at most'],
  ['a built line of forty words', 40, (n) => edit(tasks, '<p class="takeaway">The page head, a table in a card, badges and search that Home and Docs already use; new: status tabs, filters, owner initials and, in C, board columns.</p>', `<p class="takeaway">${words(n)}.</p>`), 'built', 'is one short line'],
  ['a storyboard caption of sixteen words', 16, (n) => edit(invite, 'Sent: it says to whom, and until when the link works.', `${words(n)}.`), 'storyboard', 'the caption of frame 3 runs past sixteen words'],
  ['a flow label of five words', 5, (n) => edit(invite, '>No: used or expired</span>', `>${words(n)}</span>`), 'flow', 'runs past five words'],
])('%s', (_, limit, build, kind, piece) => {
  it('passes at the limit', () => expect(of(build(limit), kind, piece)).toEqual([]));
  it('fails one past it', () => expect(of(build(limit + 1), kind, piece)).toHaveLength(1));
});

describe.each([
  // [rule, minimum, build(n), kind, message piece]: at the minimum it passes, one under it fails
  ['a ready answer\'s full sentence of five words', 5, (n) => edit(tasks, 'data-say="Done tasks show under All together with the open tasks."', `data-say="${words(n)}"`), 'answer', 'a data-say of fewer than five words'],
  ['a disclosure summary of three words', 3, (n) => edit(docs, "<summary>Today's Docs page, full size</summary>", `<summary>${words(n)}</summary>`), 'disclosure', 'does not say what it hides'],
  ['a removal reason of three words', 3, (n) => edit(docs, '<td>Removed: documents are read in the app now, <a href="#q-1">question 1</a></td>', `<td>${words(n)}</td>`), 'mapping', 'does not say why it goes'],
])('%s', (_, min, build, kind, piece) => {
  it('passes at the minimum', () => expect(of(build(min), kind, piece)).toEqual([]));
  it('fails one under it', () => expect(of(build(min - 1), kind, piece)).toHaveLength(1));
});

describe('a section of 120 words of prose', () => {
  const page = (extra) => edit(docs, '<p class="small">The drawings show sample data, eight documents of three sections.</p>', `<p class="small">The drawings show sample data, eight documents of three sections.</p><p>${words(extra)}.</p>`);
  // The words the data section shows already, learnt from the check itself when the tests run.
  let probe;
  beforeAll(() => {
    const said = of(page(200), 'wordy', '#data');
    expect(said, 'the wordy finding of #data').toHaveLength(1);
    const m = /#data shows (\d+) words/.exec(said[0]);
    expect(m, said[0]).not.toBeNull();
    probe = Number(m[1]) - 200;
  });
  it('passes at 120 words', () => expect(of(page(120 - probe), 'wordy', '#data')).toEqual([]));
  it('fails at 121 words', () => expect(of(page(121 - probe), 'wordy', '#data shows 121 words')).toHaveLength(1));
});

describe('the reason beside a value that differs from the survey', () => {
  const page = (why) => edit(tasks, '  --d-radius: 10px;\n', `  --d-radius: 14px; /* why: ${why} */\n`);
  it('passes with three words', () => expect(findings(page('rounder card corners'), { survey })).toEqual([]));
  it('fails with two words', () => expect(of(page('rounder corners'), 'app-look', '--d-radius is 14px', { survey })).toHaveLength(1));
});

describe('the position cue past seven sections', () => {
  const without = (ids) => ids.reduce((html, id) => replaceOnce(replaceOnce(html, new RegExp(`\\n<section class="sec" id="${id}">[\\s\\S]*?\\n</section>\\n`), '\n'), new RegExp(`<li><a href="#${id}">[^<]*</a></li>`), ''), account);
  it('keeps the cue on a page of eight sections after the head', () => expect(of(without(['built', 'data']), 'cue', '')).toEqual([]));
  it('refuses it on a page of seven', () => expect(of(without(['built', 'data', 'states']), 'cue', 'a page this short has no position cue')).toHaveLength(1));
});

describe('the number of options', () => {
  const D = /\n {2}<section class="option" id="option-c" data-option="c">[\s\S]*?\n {2}<\/section>\n/;
  it('refuses a fourth option', () => {
    const fourth = replaceOnce(tasks, D, (m) => `${m}${[[/option-c/g, 'option-d'], ['data-option="c"', 'data-option="d"'], [/id="(draw-c[\w-]*)"/g, 'id="$1-d"'], [/data-for="(draw-c[\w-]*)"/g, 'data-for="$1-d"'], ['<h3>C. Board by status</h3>', '<h3>D. Board copy</h3>']].reduce((h, [from, to]) => replaceOnce(h, from, to), m)}`);
    expect(of(fourth, 'options', '4 options; two or three')).toHaveLength(1);
  });
  it('refuses a single option marked as one of several', () => {
    const one = replaceOnce(replaceOnce(tasks, /\n {2}<section class="option" id="option-b"[\s\S]*?\n {2}<\/section>\n/, '\n'), D, '\n');
    expect(of(one, 'options', '1 options; two or three')).toHaveLength(1);
  });
});

describe('a storyboard of three to six frames', () => {
  const frame = /( {6}<li class="story-frame"><figure class="drawing" id="draw-send-3"[\s\S]*?<\/li>\n)/;
  const more = (n) => replaceOnce(invite, frame, (m) => m + Array.from({ length: n }, (_, i) => replaceOnce(replaceOnce(m, /draw-send-3/g, `draw-send-${4 + i}`), '<span class="story-no">3</span>', `<span class="story-no">${4 + i}</span>`)).join(''));
  it('passes with six', () => expect(of(more(3), 'storyboard', 'frames; three to six')).toEqual([]));
  it('fails with seven', () => expect(of(more(4), 'storyboard', 'has 7 frames; three to six')).toHaveLength(1));
});

describe('a flow box on the grid of ten rows', () => {
  const at = (row) => edit(invite, 'id="f-joined" data-end="done" data-row="8" data-col="2"', `id="f-joined" data-end="done" data-row="${row}" data-col="2"`);
  it('passes on row 10', () => expect(of(at(10), 'flow', 'is off the grid')).toEqual([]));
  it('fails on row 11', () => expect(of(at(11), 'flow', 'is off the grid')).toHaveLength(1));
});

describe('an embedded logo image of the size cap', () => {
  const page = example('account-settings/r1/proposal.html');
  const use = '<svg aria-hidden="true"><use href="#brand-mark"/></svg>';
  const img = (bytes) => {
    expect(page.split(use), 'the three uses of the logo').toHaveLength(4);
    return replaceOnce(page, /<svg class="brand-defs"[^\n]*<\/svg>\n/, '').replaceAllOrFail(use, `<img src="data:image/png;base64,${Buffer.alloc(bytes, 1).toString('base64')}" alt="">`);
  };
  it('passes at 16384 bytes', () => expect(of(img(16384), 'mark', 'byte cap')).toEqual([]));
  it('fails at 16385 bytes', () => expect(of(img(16385), 'mark', 'image is over the 16384 byte cap')).toHaveLength(3));
});

describe('the reason of each optional part in CHOICE.md', () => {
  const choice = example('invite-teammate/r1/CHOICE.md');
  const reason = (why) => replaceOnce(choice, 'position cue: added, 12 sections after the head', `position cue: added, ${why}`);
  it('passes with three words', () => expect(check.checkChoice(reason('twelve sections long')).filter((f) => f.includes('position cue needs its reason'))).toEqual([]));
  it('fails with two words', () => expect(check.checkChoice(reason('twelve sections'))).toContain('[choice] Optional parts: the position cue needs its reason, three words or more'));
});
