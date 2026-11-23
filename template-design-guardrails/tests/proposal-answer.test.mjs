/**
 * check-proposal.mjs on the answer block (references/page-parts.md, "Answer
 * block"): broken copies of the worked examples, one per finding, and the
 * Ready answers field of CHOICE.md. The page's answer script is run too: its
 * text builder alone, and the whole script of each example against a small
 * stand-in for the page's answer form.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import './replace-or-fail.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const skill = path.join(here, '../.frontx/ai/@gears-frontx/template-design-guardrails/skills/frontx-design-proposal');
const proposals = path.join(skill, 'assets/proposals');
const check = await import(pathToFileURL(path.join(skill, 'scripts/check-proposal.mjs')).href);

const r1 = readFileSync(path.join(proposals, 'team-tasks/r1/proposal.html'), 'utf8');
const r2 = readFileSync(path.join(proposals, 'team-tasks/r2/proposal.html'), 'utf8');
const edit = (page, from, to) => {
  expect(page.includes(from), from).toBe(true);
  return page.replaceOrFail(from, to);
};
const ANSWER = /<section class="sec" id="answer">[\s\S]*?<\/section>/;
const Q2_WRONG = '<label class="pick"><input type="radio" name="q2" value="Under All, with the rest" data-say="Done tasks show under All together with the open tasks."><span>Under All, with the rest</span></label>';

/**
 * The text building of the page's own answer script, taken from the skeleton
 * (every example carries the same script byte for byte, which the frame check
 * holds): answerText(subject, option, questions, changes).
 */
const answerText = (() => {
  const script = /<script id="answer-js">([\s\S]*?)<\/script>/.exec(readFileSync(path.join(skill, 'templates/proposal.html'), 'utf8'))?.[1] ?? '';
  const source = /\n {2}function answerText\([\s\S]*?\n {2}\}\n/.exec(script)?.[0];
  if (!source) throw new Error('the answer script of templates/proposal.html has no function answerText');
  return new Function(`${source}\nreturn answerText;`)();
})();

/** The data-phrase-* attributes of the answer form as the form's dataset names them (data-phrase-wide-part: phraseWidePart). */
const phrases = (attrs) => Object.fromEntries([...attrs.matchAll(/ data-(phrase-[a-z-]+)="([^"]*)"/g)]
  .map(([, name, value]) => [name.replace(/-([a-z])/g, (_, c) => c.toUpperCase()), value.replaceAll('&quot;', '"').replaceAll('&amp;', '&')]));
const GERMAN = {
  phraseChoose: 'Für {subject} wähle ich Option {letter}, "{name}".',
  phraseAnswer: 'Für {subject} antworte ich: {answer}.',
  phraseQuestions: 'Meine Antworten auf die offenen Fragen:',
  phraseChanges: 'Änderungen: {changes}',
  phraseNone: 'keine',
  phraseCopied: 'Kopiert. Füge es in den Chat ein.',
  phraseFailed: 'Kopieren ging nicht: der Text ist markiert, kopiere ihn von Hand.',
};

/** The answer a page's block gives with its picks as they are: the inputs read from the page, the text from answerText. */
const defaultAnswer = (html) => {
  const [, subject, attrs, body] = /<form class="answer" id="answer-form" data-subject="([^"]+)"([^>]*)>([\s\S]*?)<\/form>/.exec(html);
  const picked = (name) => {
    const m = new RegExp(`<input type="radio" name="${name}" value="([^"]*)" data-say="([^"]*)" checked>`).exec(body);
    expect(m, `the checked pick of ${name}`).not.toBeNull();
    return { value: m[1], say: m[2] };
  };
  const questions = [...body.matchAll(/<fieldset class="ans-q" data-q="(\d+)">/g)].map((m) => ({ n: m[1], say: picked(`q${m[1]}`).say }));
  return answerText(subject, picked('option'), questions, '', phrases(attrs)).split('\n');
};
const FULL_FIRST = /^For the .+ proposal \(page ([a-z0-9-]+), revision (r\d+)\) I (?:choose option [A-C], ".+"|answer: build it as drawn)\.$/;

describe('the answer text of the page script', () => {
  it('names the option by its letter, or gives the design\'s answer, then the questions and the changes', () => {
    expect(answerText('the X proposal', { value: 'B', say: 'Cards' }, [{ n: '1', say: 'Only a team lead invites.' }], '  move the filter  ')).toBe('For the X proposal I choose option B, "Cards".\n\nMy answers to the open questions:\n1. Only a team lead invites.\n\nChanges: move the filter');
    expect(answerText('the X proposal', { value: 'build', say: 'build it as drawn' }, [], ' ')).toBe('For the X proposal I answer: build it as drawn.\n\nChanges: none');
  });

  it('writes its own words from the page\'s phrases, in the page\'s language, filling each place once', () => {
    expect(answerText('den Vorschlag {name}', { value: 'B', say: 'Karten {letter}' }, [{ n: '1', say: 'Nur eine Teamleitung lädt ein.' }], '', GERMAN))
      .toBe('Für den Vorschlag {name} wähle ich Option B, "Karten {letter}".\n\nMeine Antworten auf die offenen Fragen:\n1. Nur eine Teamleitung lädt ein.\n\nÄnderungen: keine');
    expect(answerText('den Vorschlag', { value: 'build', say: 'so bauen' }, [], ' $& Filter ', GERMAN)).toBe('Für den Vorschlag antworte ich: so bauen.\n\nÄnderungen: $& Filter');
  });

  it('keeps its English words for a phrase the page leaves empty', () => {
    expect(answerText('the X proposal', { value: 'build', say: 'build it as drawn' }, [], '', { phraseAnswer: '', phraseNone: '' })).toBe('For the X proposal I answer: build it as drawn.\n\nChanges: none');
  });
});

/**
 * A stand-in for the document the answer script reads: the form of the page's
 * answer block (radios with value, data-say and checked, the question groups,
 * the changes field), the answer text and state, and the Copy button.
 * Selectors it does not know throw, so a change of the script shows here.
 */
function answerPage(html) {
  const [, subject, attrs, body] = /<form class="answer" id="answer-form" data-subject="([^"]+)"([^>]*)>([\s\S]*?)<\/form>/.exec(html);
  const radios = [...body.matchAll(/<input type="radio" name="([^"]+)" value="([^"]*)" data-say="([^"]*)"( checked)?>/g)].map(([, name, value, say, checked]) => ({ name, value, dataset: { say }, checked: !!checked }));
  const groups = [...body.matchAll(/<fieldset class="ans-q" data-q="([^"]+)">/g)].map((m) => ({ dataset: { q: m[1] } }));
  const listeners = {};
  const on = (key) => (type, fn) => { listeners[`${key}:${type}`] = fn; };
  const form = {
    dataset: { subject, ...phrases(attrs) },
    elements: { changes: { value: '' } },
    addEventListener: on('form'),
    querySelector(sel) {
      const m = /^input\[name="([^"]+)"\]:checked$/.exec(sel);
      if (!m) throw new Error(`unknown selector ${sel}`);
      return radios.find((r) => r.name === m[1] && r.checked) ?? null;
    },
    querySelectorAll(sel) {
      if (sel !== '.ans-q[data-q]') throw new Error(`unknown selector ${sel}`);
      return groups;
    },
  };
  const ids = { 'answer-form': form, 'answer-text': { textContent: '' }, 'answer-state': { textContent: '' }, 'answer-copy': { addEventListener: on('copy') } };
  const copied = [];
  const selected = [];
  const run = (writeText = async (t) => { copied.push(t); }) => {
    const script = /<script id="answer-js">([\s\S]*?)<\/script>/.exec(html)[1];
    new Function('document', 'navigator', 'getSelection', script)({ getElementById: (id) => ids[id] ?? null }, { clipboard: { writeText } }, () => ({ selectAllChildren(node) { selected.push(node); } }));
  };
  const pick = (name, value) => { for (const r of radios.filter((x) => x.name === name)) r.checked = r.value === value; };
  return { radios, groups, form, ids, listeners, copied, selected, run, pick, subject };
}

describe('the answer script of each worked example, run on its own answer form', () => {
  it.each(['team-tasks/r1', 'team-tasks/r2', 'account-settings/r1', 'docs-redesign/r1', 'invite-teammate/r1'])('%s shows the picks by their data-say and the changes typed, and copies the same text', async (dir) => {
    const page = answerPage(readFileSync(path.join(proposals, dir, 'proposal.html'), 'utf8'));
    page.run();
    expect(page.ids['answer-text'].textContent).toBe(defaultAnswer(readFileSync(path.join(proposals, dir, 'proposal.html'), 'utf8')).join('\n'));
    // Pick the last ready answer everywhere, type a change, and let the form say it changed.
    const names = [...new Set(page.radios.map((r) => r.name))];
    for (const name of names) page.pick(name, page.radios.filter((r) => r.name === name).at(-1).value);
    page.form.elements.changes.value = '  move the filter  ';
    page.listeners['form:input']();
    const say = (name) => page.radios.find((r) => r.name === name && r.checked);
    const questions = page.groups.filter((g) => g.dataset.q !== 'option').map((g) => ({ n: g.dataset.q, say: say(`q${g.dataset.q}`).dataset.say }));
    const option = say('option');
    expect(option.value).not.toBe(option.dataset.say);
    const want = answerText(page.subject, { value: option.value, say: option.dataset.say }, questions, '  move the filter  ');
    expect(want.split('\n').at(-1)).toBe('Changes: move the filter');
    expect(page.ids['answer-text'].textContent).toBe(want);
    await page.listeners['copy:click']();
    expect(page.copied).toEqual([want]);
    expect(page.ids['answer-state'].textContent).toBe('Copied. Paste it into the chat.');
  });

  it.each(['team-tasks/r1', 'team-tasks/r2', 'account-settings/r1', 'docs-redesign/r1', 'invite-teammate/r1'])('%s selects the text and says so when the clipboard refuses, and clears that line on the next input', async (dir) => {
    const page = answerPage(readFileSync(path.join(proposals, dir, 'proposal.html'), 'utf8'));
    page.run(async () => { throw new Error('denied'); });
    await page.listeners['copy:click']();
    expect(page.selected).toEqual([page.ids['answer-text']]);
    expect(page.ids['answer-state'].textContent).toBe('Could not copy: the text is selected, copy it by hand.');
    page.listeners['form:input']();
    expect(page.ids['answer-state'].textContent).toBe('');
  });

  it('writes the answer and the Copy states in the words the form gives, in another language', async () => {
    const html = readFileSync(path.join(proposals, 'team-tasks/r1/proposal.html'), 'utf8');
    const page = answerPage(html);
    Object.assign(page.form.dataset, GERMAN);
    page.run();
    const lines = page.ids['answer-text'].textContent.split('\n');
    expect(lines[0]).toBe(`Für ${page.subject} wähle ich Option A, "Table".`);
    expect(lines[2]).toBe('Meine Antworten auf die offenen Fragen:');
    expect(lines.at(-1)).toBe('Änderungen: keine');
    await page.listeners['copy:click']();
    expect(page.ids['answer-state'].textContent).toBe(GERMAN.phraseCopied);
    const refused = answerPage(html);
    Object.assign(refused.form.dataset, GERMAN);
    refused.run(async () => { throw new Error('denied'); });
    await refused.listeners['copy:click']();
    expect(refused.ids['answer-state'].textContent).toBe(GERMAN.phraseFailed);
  });

  it.each(['team-tasks/r1', 'team-tasks/r2', 'account-settings/r1', 'docs-redesign/r1', 'invite-teammate/r1'])('%s carries the scripts\' words on its answer form, in English', (dir) => {
    const [, attrs] = /<form class="answer" id="answer-form" data-subject="[^"]+"([^>]*)>/.exec(readFileSync(path.join(proposals, dir, 'proposal.html'), 'utf8'));
    expect(phrases(attrs)).toEqual({
      phraseChoose: 'For {subject} I choose option {letter}, "{name}".',
      phraseAnswer: 'For {subject} I answer: {answer}.',
      phraseQuestions: 'My answers to the open questions:',
      phraseChanges: 'Changes: {changes}',
      phraseNone: 'none',
      phraseCopied: 'Copied. Paste it into the chat.',
      phraseFailed: 'Could not copy: the text is selected, copy it by hand.',
      phraseWidePart: 'Wide part',
    });
  });
});

describe('the full answer each worked example gives', () => {
  it.each(['team-tasks/r1', 'team-tasks/r2', 'account-settings/r1', 'docs-redesign/r1', 'invite-teammate/r1'])('%s names the proposal, its page and revision, the choice and a full sentence per question', (dir) => {
    const lines = defaultAnswer(readFileSync(path.join(proposals, dir, 'proposal.html'), 'utf8'));
    expect(FULL_FIRST.exec(lines[0])?.slice(1, 3).join('/'), lines[0]).toBe(dir);
    for (const line of lines.filter((l) => /^\d+\. /.test(l))) expect(line.split(/\s+/).length, line).toBeGreaterThanOrEqual(6);
    expect(lines.at(-1)).toBe('Changes: none');
  });
});

describe('check-proposal.mjs on broken copies of the answer block', () => {
  it.each([
    ['no block', r1.replaceOrFail(ANSWER, '<section class="sec" id="answer">\n  <h2>Your answer</h2>\n  <p class="ask">Answer with a letter: <a href="#answer">your answer</a>.</p>\n</section>'), 'no answer block'],
    ['an unlinked ask', edit(r1, ' and answer the three open questions: <a href="#answer">your answer</a>.', ' and answer the three open questions.'), 'does not link to the answer block'],
    ['an option missing', r1.replaceOrFail(/<label class="pick pick--card"><input type="radio" name="option" value="C"[\s\S]*?<\/label>\n/, ''), 'differ from the page\'s'],
    ['an option renamed', edit(r1, '<b>B. Cards</b>', '<b>B. Tiles</b>'), 'differ from the page\'s'],
    ['an option with another letter', edit(r1, 'value="C" data-say="Board by status"', 'value="D" data-say="Board by status"'), 'differ from the page\'s'],
    ['one design without its two cards', edit(r2, '<b>Change it first</b>', '<b>Something else</b>'), 'differ from the page\'s'],
    ['a question missing from the block', r1.replaceOrFail(/<fieldset class="ans-q" data-q="3">[\s\S]*?<\/fieldset>\n/, ''), 'open question 3 is not in the answer block'],
    ['a question the page has not', r1.replaceOrFail(/<li id="q-3">[\s\S]*?<\/li>/, ''), 'which the open questions do not have'],
    ['one ready answer', r1.replaceOrFail(Q2_WRONG, ''), 'question 2 has 1 ready answer(s)'],
    ['no suggested answer', edit(r1, '<span>Only on request <span class="tag">suggested</span></span>', '<span>Only on request</span>'), 'question 2 marks 0 answers suggested'],
    ['two suggested answers', edit(r1, '<span>Under All, with the rest</span>', '<span>Under All, with the rest <span class="tag">suggested</span></span>'), 'question 2 marks 2 answers suggested'],
    ['the suggested answer not checked', edit(r1, 'data-say="Done tasks are hidden under All and show only when someone asks for them." checked', 'data-say="Done tasks are hidden under All and show only when someone asks for them."'), 'the suggested answer of question 2 is not the one checked'],
    ['another answer checked too', edit(r1, 'data-say="Done tasks show under All together with the open tasks."', 'data-say="Done tasks show under All together with the open tasks." checked'), 'the suggested answer of question 2 is not the one checked'],
    ['the recommended option not checked', edit(edit(r1, 'value="A" data-say="Table" checked', 'value="A" data-say="Table"'), 'value="B" data-say="Cards"', 'value="B" data-say="Cards" checked'), 'the suggested option A is not the one checked'],
    ['the suggested option not the recommended one', edit(edit(edit(edit(r1, 'value="A" data-say="Table" checked', 'value="A" data-say="Table"'), '<b>A. Table</b> <span class="tag">suggested</span>', '<b>A. Table</b>'), 'value="B" data-say="Cards"', 'value="B" data-say="Cards" checked'), '<b>B. Cards</b>', '<b>B. Cards</b> <span class="tag">suggested</span>'), 'is not the recommended option A'],
    ['no data-say', edit(r1, ' data-say="Done tasks show under All together with the open tasks."', ''), 'has no data-say'],
    ['a short data-say', edit(r1, 'data-say="Done tasks show under All together with the open tasks."', 'data-say="Under All."'), 'a data-say of fewer than five words'],
    ['a "not decided" answer', edit(r1, Q2_WRONG, Q2_WRONG.replaceAllOrFail('Under All, with the rest', 'Not decided yet')), 'is a "not decided" placeholder'],
    ['no reason for the suggested answer', r1.replaceOrFail(/(<li id="q-2">[\s\S]*?)<span class="small why">[\s\S]*?<\/span><\/li>/, '$1</li>'), 'open question 2 gives no reason'],
    ['a subject without the revision', edit(r1, '(page team-tasks, revision r1)', '(page team-tasks)'), 'does not name page team-tasks and revision r1'],
    ['no changes field', r1.replaceOrFail(/<label class="ans-q ans-note">[\s\S]*?<\/label>\n/, ''), 'no "Anything to change?" textarea'],
    ['no Copy button', edit(r1, ' id="answer-copy"', ''), 'has no #answer-copy'],
    ['a changed answer script', edit(r1, "'Changes: {changes}'", "'Change: {changes}'"), 'the answer-js block differs'],
  ])('reports %s', (_, html, message) => {
    const found = check.checkPage(html).findings;
    expect(found.some((f) => f.includes(message)), found.join('\n')).toBe(true);
  });

  it('reports five ready answers, one past the four allowed', () => {
    const extra = (label) => Q2_WRONG.replaceAllOrFail('Under All, with the rest', label);
    const five = edit(r1, Q2_WRONG, Q2_WRONG + extra('Under a Done tab') + extra('Hidden after a week') + extra('In a second list'));
    expect(check.checkPage(five).findings).toContain('[answer] question 2 has 5 ready answer(s) (radios named q2); two to four');
  });

  it('reads "Skip" alone as not decided, and a ready answer that starts with Skip as a real one', () => {
    const as = (label) => check.checkPage(edit(r1, Q2_WRONG, Q2_WRONG.replaceAllOrFail('Under All, with the rest', label))).findings;
    expect(as('Skip the Done tab entirely')).toEqual([]);
    expect(as('Skip')).toContain('[answer] the answer "Skip" of question 2 is a "not decided" placeholder; offer real answers and pick the suggested one');
  });

  it('keeps four ready answers and a full sentence with "not" in it clean', () => {
    const four = edit(r1, Q2_WRONG, Q2_WRONG + Q2_WRONG.replaceAllOrFail('Under All, with the rest', 'Under a Done tab').replaceOrFail('Done tasks show under All together with the open tasks.', 'Done tasks show under their own Done tab only.')
      + Q2_WRONG.replaceAllOrFail('Under All, with the rest', 'Hidden after a week').replaceOrFail('Done tasks show under All together with the open tasks.', 'Done tasks show under All for a week, then are not shown.'));
    expect(check.checkPage(four).findings).toEqual([]);
  });
});

describe('the Ready answers field of CHOICE.md', () => {
  it('is required', () => {
    const choice = readFileSync(path.join(proposals, 'team-tasks/r2/CHOICE.md'), 'utf8');
    expect(check.checkChoice(choice, { options: [] })).toEqual([]);
    expect(check.checkChoice(choice.replaceOrFail(/^- Ready answers: .*\n/m, ''), { options: [] })).toContain('[choice] field "Ready answers" is missing');
  });

  it('records the text pasted from r2\'s answer block word for word as the person\'s words', () => {
    const selected = readFileSync(path.join(proposals, 'team-tasks/CHOICE.selected.md'), 'utf8');
    const pasted = defaultAnswer(readFileSync(path.join(proposals, 'team-tasks/r2/proposal.html'), 'utf8')).filter(Boolean).join(' / ');
    expect(/^- Person's words: (.*)$/m.exec(selected)[1]).toBe(`"${pasted}"`);
  });
});
