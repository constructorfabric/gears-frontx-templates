/**
 * check-proposal.mjs on the optional parts of references/page-parts.md (the
 * flow, the storyboard, a guarantee drawn as its mechanism, the position
 * cue): broken copies of the invitation example, one per finding, the
 * examples that lack a part staying clean, and the Optional parts field of
 * CHOICE.md.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import './replace-or-fail.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const skill = path.join(here, '../.frontx/ai/@gears-frontx/template-design-guardrails/skills/frontx-design-proposal');
const check = await import(pathToFileURL(path.join(skill, 'scripts/check-proposal.mjs')).href);
const dir = path.join(skill, 'assets/proposals/invite-teammate/r1');
const page = readFileSync(path.join(dir, 'proposal.html'), 'utf8');
const choice = readFileSync(path.join(dir, 'CHOICE.md'), 'utf8');
const findingsOf = (html) => check.checkPage(html).findings;
const edit = (from, to, html = page) => {
  expect(html.includes(from), from).toBe(true);
  return html.replaceOrFail(from, to);
};
const FLOW_SECTION = /\n<section class="sec" id="flow">[\s\S]*?<\/section>\n/;
const CUE = /<nav class="cue"[\s\S]*?<\/nav>\n/;
const STORY = /    <h4 class="view-name">Sending, step by step, on a phone<\/h4>\n    <ol class="story"[\s\S]*?<\/ol>\n<ol class="notes" data-for="draw-send-2">[\s\S]*?<\/ol>\n/;
const FRAME_3 = /      <li class="story-frame"><figure class="drawing" id="draw-send-3"[\s\S]*?<\/li>\n/;

describe('the invitation example', () => {
  it('has every optional part', () => {
    const { parts } = check.checkPage(page);
    expect(parts).toEqual({ guarantees: true, flow: true, storyboard: true, cue: true });
  });
});

describe('check-proposal.mjs on broken copies of the flow', () => {
  it.each([
    ['a step that links no drawing', edit('href="#draw-join-used" data-row="7"', 'href="#draw-nowhere" data-row="7"'), 'the step "Join the team" links no drawing'],
    ['a step named off the map', edit('<span class="flow-name">Invite a teammate</span>', '<span class="flow-name">Invite form</span>'), 'the step "Invite form" is not a screen of the map'],
    ['an outside step that links', edit('<span class="flow-step flow-step--outside" id="f-mail" data-outside data-row="5" data-col="2"><span class="flow-name">Email</span><span class="flow-what">outside the app; the invitee opens the link</span></span>', '<a class="flow-step flow-step--outside" id="f-mail" href="#draw-join" data-outside data-row="5" data-col="2"><span class="flow-name">Email</span></a>'), 'the step "Email" is outside the app and links nowhere'],
    ['two starts', edit('data-row="2" data-col="2">', 'data-row="2" data-col="2" data-start>'), '2 starts; a flow has one'],
    ['no start', edit(' data-row="1" data-col="2" data-start="Start">', ' data-row="1" data-col="2">'), '0 starts; a flow has one'],
    ['a box with no way in', edit('<span class="flow-edge" data-from="f-sent" data-to="f-mail"></span>', ''), '"Email" has no way in'],
    ['a box with no way out', edit('<span class="flow-edge" data-from="f-join" data-to="f-joined"></span>', ''), '"Join the team" has no way out'],
    ['an end that leads on', edit('<span class="flow-edge" data-from="f-dead" data-to="f-ask"></span>', '<span class="flow-edge" data-from="f-dead" data-to="f-ask"></span><span class="flow-edge" data-from="f-ask" data-to="f-joined"></span>'), 'the end "Asks for a new link" leads on'],
    ['a decision with one way out', edit('<span class="flow-edge" data-from="f-member" data-to="f-refused">Yes</span>', ''), 'the decision "Already in the team?" has 1 way out'],
    ['a way out without its label', edit('data-to="f-refused">Yes</span>', 'data-to="f-refused"></span>'), 'the way out of "Already in the team?" to "Refused, says who it is" has no label'],
    ['a connector to nothing', edit('data-to="f-joined"></span>', 'data-to="f-nowhere"></span>'), 'names a box the flow lacks'],
    ['a box the start never reaches', edit('<span class="flow-edge" data-from="f-team" data-to="f-invite"></span>', '<span class="flow-edge" data-from="f-invite" data-to="f-team"></span>'), '"Invite a teammate" cannot be reached from the start'],
    ['a branch that never ends', edit('<span class="flow-edge" data-from="f-dead" data-to="f-ask"></span>', '<span class="flow-edge" data-from="f-dead" data-to="f-dead"></span>'), 'no end is reached from "Join the team"'],
    ['no refusal branch', edit('<span class="flow-end" id="f-refused" data-end="stop"', '<span class="flow-end" id="f-refused" data-end="done"', edit('<span class="flow-end" id="f-ask" data-end="stop"', '<span class="flow-end" id="f-ask" data-end="done"')), 'draws its refusal or error branch'],
    ['an end without its kind', edit('id="f-joined" data-end="done"', 'id="f-joined"'), 'the end "In the team" needs data-end'],
    ['two boxes on one cell', edit('id="f-refused" data-end="stop" data-row="4" data-col="3"', 'id="f-refused" data-end="stop" data-row="4" data-col="2"'), 'sit on one cell (row 4, column 2)'],
    ['a box off the grid', edit('data-row="4" data-col="3"', 'data-row="4" data-col="4"'), 'is off the grid'],
    ['a label of six words', edit('>No: used or expired</span>', '>No: it was used or expired</span>'), 'runs past five words'],
    ['a flow outside its section', page.replaceOrFail(FLOW_SECTION, '\n').replaceOrFail('<li><a href="#flow">How it goes</a></li>', '').replaceOrFail('<p class="small map-key">', '<div class="flow"></div><p class="small map-key">'), 'a flow lives in its own section #flow'],
  ])('%s', (_name, html, message) => {
    expect(findingsOf(html).filter((f) => f.startsWith('[flow]')).join('\n')).toContain(message);
  });

  it('refuses a flow of two steps and no decision', () => {
    const tiny = '<figure class="flow-fig"><div class="flow" data-cols="2"><a class="flow-step" id="f-a" href="#draw-team" data-row="1" data-col="1" data-start><span class="flow-name">Team members</span></a><a class="flow-step" id="f-b" href="#draw-invite" data-row="2" data-col="1"><span class="flow-name">Invite a teammate</span></a><span class="flow-end" id="f-c" data-end="done" data-row="3" data-col="1">Sent</span><span class="flow-edge" data-from="f-a" data-to="f-b"></span><span class="flow-edge" data-from="f-b" data-to="f-c"></span></div><figcaption>Two steps.</figcaption></figure>';
    const html = page.replaceOrFail(/<figure class="flow-fig">[\s\S]*?<\/figure>/, tiny);
    expect(findingsOf(html).join('\n')).toContain('a flow of fewer than three steps and no decision');
  });
});

describe('check-proposal.mjs on broken copies of the storyboard', () => {
  it.each([
    ['no width', edit('<ol class="story" data-width="phone"', '<ol class="story"'), 'needs data-width="phone" or "desktop"'],
    ['a heading of another width', edit('Sending, step by step, on a phone', 'Sending, step by step, on a desktop'), 'says "on a phone"'],
    ['two frames', page.replaceOrFail(FRAME_3, ''), 'has 2 frames; three to six'],
    ['frames out of order', edit('<span class="story-no">2</span>', '<span class="story-no">3</span>'), 'frame 2 has no caption (.story-cap) numbered 2'],
    ['a long caption', edit('Sent: it says to whom, and until when the link works.', 'Sent: the page now says to whom the invitation went, and until which day exactly the link it carries still works.'), 'the caption of frame 3 runs past sixteen words'],
    ['outside a screen', page.replaceOrFail(STORY, '').replaceOrFail('<section class="sec" id="paths">', (m) => `${page.match(STORY)[0].replaceOrFail(/<ol class="notes"[\s\S]*$/, '')}${m}`), 'sits outside a screen, an option or the design'],
    ['in a disclosure', page.replaceOrFail(STORY, (m) => `    <details class="more"><summary>Sending, step by step</summary>\n${m}    </details>\n`), 'is inside a disclosure'],
  ])('%s', (_name, html, message) => {
    expect(findingsOf(html).filter((f) => f.startsWith('[storyboard]')).join('\n')).toContain(message);
  });
});

describe('check-proposal.mjs on a guarantee without its mechanism', () => {
  const PINNED = '<a class="pinref" href="#draw-join-used" data-n="1">1</a>';
  it('fails a promise whose pin reference is gone', () => {
    expect(findingsOf(edit(PINNED, '')).join('\n')).toContain('[guarantee] #how: "An invitation can be used only once');
  });
  it('accepts the promise when it links its open question instead', () => {
    expect(findingsOf(edit(PINNED, '<a href="#q-2">question 2</a>'))).toEqual([]);
  });
  it('fails each promising word in a section, and not in the request, the assumptions, the questions or a note', () => {
    for (const promise of ['A member can never see Invite.', 'The list is always sorted by name.', 'A member cannot invite.', 'Only a team lead can invite.', 'Members can only read the list.']) {
      expect(findingsOf(edit('<ul><li>Links in from:', `<p>${promise}</p><ul><li>Links in from:`)).join('\n'), promise).toContain(`[guarantee] #place: "${promise}"`);
    }
    const exempt = edit('<li>Only a team lead invites; open question 1', '<li>Only a team lead can invite, and a member can never see Invite; open question 1');
    expect(findingsOf(exempt)).toEqual([]);
  });
  it('says the page draws a guarantee only while a promising sentence links a pin', () => {
    expect(check.checkPage(page).parts.guarantees).toBe(true);
    const pins = [...page.matchAll(/<a class="pinref"[^>]*>\d+<\/a>/g)].map((m) => m[0]);
    expect(pins.length).toBeGreaterThan(0);
    // Every promise linking its open question instead: the page still passes, but it draws no guarantee.
    const asked = pins.reduce((html, pin) => html.replace(pin, '<a href="#q-2">question 2</a>'), page);
    expect(check.checkPage(asked).parts.guarantees).toBe(false);
  });
  it('takes no mark from a control character in the text, and reports the character', () => {
    const faked = findingsOf(edit('<ul><li>Links in from:', '<p>A member can never see Invite\u0001.</p><ul><li>Links in from:'));
    expect(faked).toContain('[guarantee] #place: "A member can never see Invite." promises a guarantee; link the pin of what makes it true (a.pinref), or its open question');
    expect(faked).toContain('[text] the text holds the control character U+0001, which a reader cannot see; remove it');
    const asked = [...page.matchAll(/<a class="pinref"[^>]*>\d+<\/a>/g)].reduce((html, [pin]) => html.replace(pin, '<a href="#q-2">question 2</a>\u0002'), page);
    const result = check.checkPage(asked);
    expect(result.parts.guarantees).toBe(false);
    expect(result.findings).toContain('[text] the text holds the control character U+0002, which a reader cannot see; remove it');
  });
  it.each([
    ['DEL in the text', '<p>Invite\u007f opens a form.</p>', 'U+007F'],
    ['a C1 control in the text', '<p>Invite\u0085 opens a form.</p>', 'U+0085'],
    ['a C1 control in an attribute value', '<p title="Invite\u0085">Invite opens a form.</p>', 'U+0085'],
  ])('reports %s', (_, para, code) => {
    expect(findingsOf(edit('<ul><li>Links in from:', `${para}<ul><li>Links in from:`))).toEqual([`[text] the text holds the control character ${code}, which a reader cannot see; remove it`]);
  });
  it('lets ordinary uses of "only" pass', () => {
    for (const plain of ['Shows only open tasks.', 'One address only.', 'The only change is the menu link.']) expect(findingsOf(edit('<ul><li>Links in from:', `<p>${plain}</p><ul><li>Links in from:`)), plain).toEqual([]);
  });
});

describe('check-proposal.mjs on the position cue', () => {
  it.each([
    ['missing past the threshold', page.replaceOrFail(CUE, ''), '12 sections and 3 screens: past seven sections or three screens the page needs its position cue'],
    ['an entry that points nowhere', edit('<li><a href="#paths">Paths</a></li>', '<li><a href="#paths">Paths</a></li><li><a href="#q-1">Question 1</a></li>'), 'the cue entry #q-1 points at no section'],
    ['a section missing from it', edit('<li><a href="#data">Data</a></li>', ''), 'section #data is missing from the cue'],
    ['out of order', edit('<li><a href="#data">Data</a></li><li><a href="#states">States</a></li>', '<li><a href="#states">States</a></li><li><a href="#data">Data</a></li>'), 'out of the page\'s order'],
    ['not right after the head', page.replaceOrFail(CUE, '').replaceOrFail('<section class="sec" id="map">', (m) => `${page.match(CUE)[0]}${m}`), 'sits right after the head'],
  ])('%s', (_name, html, message) => {
    expect(findingsOf(html).filter((f) => f.startsWith('[cue]')).join('\n')).toContain(message);
  });

  it('refuses a cue on a short page', () => {
    const short = page.replaceOrFail(/\n<section class="sec" id="(paths|addresses|built|data|states)">[\s\S]*?<\/section>\n/g, '\n').replaceOrFail(/<li><a href="#(paths|addresses|built|data|states)">[^<]*<\/a><\/li>/g, '');
    const findings = findingsOf(short);
    expect(findings.filter((f) => f.startsWith('[cue]')).join('\n')).toContain('a page this short has no position cue');
  });
});

describe('the Optional parts field of CHOICE.md', () => {
  const parts = { guarantees: true, flow: true, storyboard: true, cue: true };
  it('accepts the example', () => {
    expect(check.checkChoice(choice, { pageId: 'invite-teammate', revision: 'r1', parts })).toEqual([]);
  });
  it('reports a part not accounted for, a part without its reason, and a part said added that the page lacks', () => {
    const field = /^- Optional parts: .*$/m;
    const noCue = choice.replaceOrFail(field, '- Optional parts: flow: added, it branches twice on two checks; storyboard: added, sending changes one screen; guarantees: added, two promises drawn');
    expect(check.checkChoice(noCue, { parts }).join('\n')).toContain('does not say whether the position cue was added');
    const short = choice.replaceOrFail('storyboard: added, sending changes one screen in three steps the states do not show, and step 2 is where Send locks', 'storyboard: added');
    expect(check.checkChoice(short, { parts }).join('\n')).toContain('the storyboard needs its reason');
    expect(check.checkChoice(choice, { parts: { ...parts, storyboard: false } }).join('\n')).toContain('says the storyboard was added, but the page has no storyboard');
  });
  it('matches the guarantees against the page both ways', () => {
    expect(check.checkChoice(choice, { parts: { ...parts, guarantees: false } })).toEqual(['[choice] Optional parts says the guarantees were added, but the page has no guarantees']);
    const notAdded = choice.replaceOrFail(/guarantees: added, [^;]*/, 'guarantees: not added, the page makes no promise');
    expect(check.checkChoice(notAdded, { parts })).toEqual(['[choice] Optional parts says the guarantees were not added, but the page has guarantees']);
  });
});
