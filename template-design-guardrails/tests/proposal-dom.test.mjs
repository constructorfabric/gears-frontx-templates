/**
 * A whole worked example page run on a DOM (jsdom), its two scripts (frame-js
 * and answer-js) run as the page runs them, inline and in page order. The
 * other tests read the scripts through extracted functions and patterns; this
 * one catches a script that throws on the page as written, or a Copy answer
 * text with "undefined" in it.
 *
 * jsdom has no layout: every box is 0 px. A small stand-in gives each element
 * one fixed size, so the frame script places its pins and fills its
 * thumbnails; it says nothing about where they land.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';
import { describe, expect, it } from 'vitest';
import './replace-or-fail.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const skill = path.join(here, '../.frontx/ai/@gears-frontx/template-design-guardrails/skills/frontx-design-proposal');
const check = await import(pathToFileURL(path.join(skill, 'scripts/check-proposal.mjs')).href);
const read = (rev) => readFileSync(path.join(skill, 'assets/proposals', rev, 'proposal.html'), 'utf8');

/** The page loaded with its scripts run: { window, errors }, errors being what the scripts threw. */
function load(html) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => errors.push(e));
  const box = { x: 0, y: 0, left: 0, top: 0, right: 400, bottom: 300, width: 400, height: 300 };
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
      for (const [key, value] of [['offsetWidth', 400], ['offsetHeight', 300], ['clientWidth', 400], ['clientHeight', 300]]) {
        Object.defineProperty(window.HTMLElement.prototype, key, { configurable: true, get: () => value });
      }
      window.Element.prototype.getBoundingClientRect = () => ({ ...box });
      window.Range.prototype.getBoundingClientRect = () => ({ ...box });
      window.Range.prototype.getClientRects = () => [];
    },
  });
  return { window: dom.window, errors };
}
const answerOf = (window) => window.document.getElementById('answer-text').textContent;

describe('a worked example page run whole on a DOM', () => {
  it.each(['account-settings/r1', 'team-tasks/r1'])('%s runs both scripts without an error, places pins, fills thumbnails and writes a full answer', (rev) => {
    const { window, errors } = load(read(rev));
    expect(errors.map((e) => String(e.message))).toEqual([]);
    const { document } = window;
    expect(document.querySelectorAll('main .canvas > .pins .pin').length).toBeGreaterThan(0);
    const minis = [...document.querySelectorAll('.mini[data-mini-of]')];
    expect(minis.length).toBeGreaterThan(0);
    for (const mini of minis) expect(mini.querySelector(':scope > .d-app'), mini.dataset.miniOf).not.toBeNull();
    expect(typeof window.checkProposalLayout).toBe('function');
    const answer = answerOf(window);
    expect(answer).toMatch(rev === 'team-tasks/r1' ? /^For the Team tasks proposal \(page team-tasks, revision r1\) I choose option A, "Table"\./ : /^For the Account settings proposal \(page account-settings, revision r1\) I answer: build it as drawn\./);
    expect(answer).not.toContain('undefined');
    window.close();
  });

  it('runs the frame script to its end without the zoom dialog: pins placed, checkProposalLayout defined', () => {
    const page = read('account-settings/r1').replaceOrFail(/<dialog id="zoom"[\s\S]*?<\/dialog>\n/, '');
    expect(check.checkPage(page).findings).toContain('[frame] no zoom dialog (dialog#zoom) with its #zoom-body: the frame script enlarges a drawing into it; keep it as templates/proposal.html has it, only Close in the page\'s language');
    const { window, errors } = load(page);
    expect(errors.map((e) => String(e.message))).toEqual([]);
    expect(window.document.querySelectorAll('main .canvas > .pins .pin').length).toBeGreaterThan(0);
    expect(typeof window.checkProposalLayout).toBe('function');
    window.close();
  });

  // The answer script writes the checked card's data-say as it finds it; it is the check that keeps a card without
  // one off the page. The test proves the refusal, and shows the text such a page would give.
  it('refuses a one-design page whose build card has no data-say, which would make Copy answer say "undefined"', () => {
    const page = read('account-settings/r1').replaceOrFail(' value="build" data-say="build it as drawn"', ' value="build"');
    expect(check.checkPage(page).findings.filter((f) => f.startsWith('[answer] the options of the answer block'))).toHaveLength(1);
    const { window, errors } = load(page);
    expect(errors).toEqual([]);
    expect(answerOf(window)).toContain('I answer: undefined.');
    window.close();
  });
});
