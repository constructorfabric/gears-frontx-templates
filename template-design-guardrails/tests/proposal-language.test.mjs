/**
 * check-proposal.mjs on a page written in the person's own language. The
 * page's <html lang> names that language; on a page that is not in English
 * the labels the agent writes (the title's word for a proposal, the option
 * fields, the suggested tag, the chips, the design picks, the "Changed since"
 * line, the storyboard's width heading, the table columns) are found by
 * their place and class, not by English words. Each worked example is
 * relabelled in German and must stay clean; a page in English keeps its
 * English labels, and a relabelled page still breaks on a missing part.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import './replace-or-fail.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const skill = path.join(here, '../.frontx/ai/@gears-frontx/template-design-guardrails/skills/frontx-design-proposal');
const check = await import(pathToFileURL(path.join(skill, 'scripts/check-proposal.mjs')).href);
const examples = ['account-settings/r1', 'docs-redesign/r1', 'invite-teammate/r1', 'team-tasks/r1', 'team-tasks/r2'];
const read = (rev) => readFileSync(path.join(skill, 'assets/proposals', rev, 'proposal.html'), 'utf8');
const findings = (html) => check.checkPage(html).findings;

const CHIPS = { accepted: 'angenommen', proposed: 'vorgeschlagen', open: 'offen' };
const COLUMNS = { Part: 'Teil', Today: 'Heute', Proposed: 'Vorschlag', Screen: 'Bildschirm', Address: 'Adresse', 'Today the same link opens': 'Heute öffnet derselbe Link' };

/** The page with every label the check used to read in English written in German. */
const german = (html) => html
  .replaceOrFail('<html lang="en">', '<html lang="de">')
  .replace(/Proposal: /g, 'Vorschlag: ')
  .replaceOrFail('<span>Page <code>', '<span>Seite <code>')
  .replaceOrFail(', revision <code>', ', Version <code>')
  .replace('These are drawings for deciding.', 'Das sind Skizzen zum Entscheiden.')
  .replace(/<dt>Best for<\/dt>/g, '<dt>Am besten für</dt>')
  .replace(/<dt>Trade-off<\/dt>/g, '<dt>Nachteil</dt>')
  .replace(/<span class="tag">suggested<\/span>/g, '<span class="tag">empfohlen</span>')
  .replace('<b>Build it as drawn</b>', '<b>So bauen</b>')
  .replace('<b>Change it first</b>', '<b>Erst ändern</b>')
  .replace(/\(page ([a-z0-9-]+), revision (r\d+)\)/, '(Seite $1, Version $2)')
  .replace(/(class="chip[^"]*"[^>]*data-state="(\w+)"[^>]*>)\2</g, (_, open, state) => `${open}${CHIPS[state]}<`)
  .replace(/Changed since (r\d+):/, 'Geändert seit $1:')
  .replace('Sending, step by step, on a phone', 'Senden, Schritt für Schritt, am Telefon')
  .replace(/<th>(Part|Today|Proposed|Screen|Address|Today the same link opens)<\/th>/g, (_, h) => `<th>${COLUMNS[h]}</th>`)
  .replace(/ data-start="Start"/g, ' data-start="Beginn"')
  .replaceOrFail(/ data-phrase-choose="[^"]*"[^>]*>/, ` ${PHRASES}>`);

/** The words the page's scripts write, in German, as the answer form carries them. */
const PHRASES = [
  'data-phrase-choose="Für {subject} wähle ich Option {letter}, &quot;{name}&quot;."',
  'data-phrase-answer="Für {subject} antworte ich: {answer}."',
  'data-phrase-questions="Meine Antworten auf die offenen Fragen:"',
  'data-phrase-changes="Änderungen: {changes}"',
  'data-phrase-none="keine"',
  'data-phrase-copied="Kopiert. Füge es in den Chat ein."',
  'data-phrase-failed="Kopieren ging nicht: der Text ist markiert, kopiere ihn von Hand."',
  'data-phrase-wide-part="Breiter Teil"',
].join(' ');

describe('a page in the person\'s own language', () => {
  it.each(examples)('%s relabelled in German reads clean', (rev) => {
    const page = german(read(rev));
    expect(page).not.toMatch(/Proposal: |<dt>Best for|class="tag">suggested|Changed since|<th>Today|data-start="Start"|data-phrase-choose="For/);
    expect(findings(page)).toEqual([]);
  });

  it('keeps the English labels on a page in English', () => {
    const page = read('team-tasks/r1').replaceOrFail('<dt>Best for</dt>', '<dt>Am besten für</dt>');
    expect(findings(page)).toContain('[options] option #option-a has no "Best for"');
  });

  it('asks for the language of the page on <html>', () => {
    expect(findings(read('account-settings/r1').replaceOrFail('<html lang="en">', '<html>'))).toContain('[head] the page has no lang on <html>: the language the page is written in, the person\'s own');
  });

  it.each(['English', 'en_US'])('reads a lang that is not a language tag (%s) as a finding and keeps the English labels', (lang) => {
    const found = findings(read('team-tasks/r1').replaceOrFail('<html lang="en">', `<html lang="${lang}">`).replaceOrFail('<dt>Best for</dt>', '<dt>Am besten für</dt>'));
    expect(found).toContain(`[head] the lang on <html> is not a language tag: "${lang}" (two or three letters, then optional parts joined by hyphens, as de or pt-BR)`);
    expect(found).toContain('[options] option #option-a has no "Best for"');
  });

  it.each(['EN', 'en-GB', ' en', ''])('keeps the English labels for the lang "%s"', (lang) => {
    const found = findings(read('team-tasks/r1').replaceOrFail('<html lang="en">', `<html lang="${lang}">`).replaceOrFail('<dt>Best for</dt>', '<dt>Am besten für</dt>'));
    expect(found).toContain('[options] option #option-a has no "Best for"');
    expect(found.filter((f) => f.includes('not a language tag'))).toEqual([]);
  });

  it.each([
    ['paths', '<th>Step 3</th><th>Heute</th>', '<th>Step 3</th><th></th>'],
    ['addresses', '<th>Heute öffnet derselbe Link</th>', '<th></th>'],
    ['mapping', '<th>Heute</th><th>Vorschlag</th>', '<th>Heute</th><th></th>'],
  ])('finds an empty column heading in the %s table of a page not in English', (table, heading, emptied) => {
    const found = findings(german(read('docs-redesign/r1')).replaceOrFail(heading, emptied));
    expect(found.filter((f) => f.startsWith(`[${table}]`) && f.includes('column without a heading')), found.join('\n')).toHaveLength(1);
  });

  it('finds a removed column heading in the paths table of a page not in English', () => {
    const found = findings(german(read('docs-redesign/r1')).replaceOrFail('<th>Step 3</th><th>Heute</th>', '<th>Step 3</th>'));
    expect(found.filter((f) => f.startsWith('[paths]') && f.includes('column without a heading')), found.join('\n')).toHaveLength(1);
  });

  it.each(['choose', 'answer', 'questions', 'changes', 'none', 'copied', 'failed', 'wide-part'])('asks a page not in English for the words data-phrase-%s', (key) => {
    const page = german(read('team-tasks/r1'));
    for (const broken of [page.replaceOrFail(new RegExp(` data-phrase-${key}="[^"]*"`), ''), page.replaceOrFail(new RegExp(` data-phrase-${key}="[^"]*"`), ` data-phrase-${key}=""`)]) {
      expect(findings(broken).filter((f) => f.startsWith(`[answer] the answer form has no words in data-phrase-${key}`))).toHaveLength(1);
    }
  });

  it('lets a page in English leave the words to the scripts\' English', () => {
    const page = read('team-tasks/r1').replaceOrFail(/ data-phrase-choose="[^"]*"[^>]*>/, '>').replace(/ data-start="Start"/g, ' data-start');
    expect(findings(page)).toEqual([]);
  });

  it.each([
    ['choose', '{letter}', 'Für {subject} wähle ich Option {letter}, &quot;{name}&quot;.', 'Für {subject} wähle ich &quot;{name}&quot;.'],
    ['answer', '{answer}', 'Für {subject} antworte ich: {answer}.', 'Für {subject} antworte ich.'],
    ['changes', '{changes}', 'Änderungen: {changes}', 'Änderungen'],
  ])('finds data-phrase-%s without its place %s', (key, place, from, to) => {
    const found = findings(german(read('team-tasks/r1')).replaceOrFail(`data-phrase-${key}="${from}"`, `data-phrase-${key}="${to}"`));
    expect(found).toContain(`[answer] data-phrase-${key} leaves out ${place}, the place the script fills in`);
  });

  it('asks a page not in English for the word above a flow\'s start', () => {
    const page = german(read('invite-teammate/r1'));
    expect(page).toContain(' data-start="Beginn"');
    expect(findings(page.replaceOrFail(' data-start="Beginn"', ' data-start'))).toContain('[flow] the start has no word in data-start: the word shown above it, "Start" in the page\'s language');
  });

  it.each([
    ['options', 'option #option-a has fewer than two fields (dl.fields: what it is best for, its trade-off)', () => german(read('team-tasks/r1')).replaceOrFail('<dt>Nachteil</dt>', '')],
    ['answer', 'question 1 marks 0 answers suggested', () => german(read('team-tasks/r1')).replaceOrFail(/(data-q="1">[\s\S]*?)<span class="tag">empfohlen<\/span>/, '$1')],
    ['paths', 'the paths table needs a Today column', () => german(read('docs-redesign/r1')).replace(/<td class="today"[^>]*>[\s\S]*?<\/td>/g, '')],
    ['revision', 'revision r2 needs the line "Changed since r1: ..."', () => german(read('team-tasks/r2')).replaceOrFail('Geändert seit r1:', 'Geändert:')],
    ['head', 'the title must read', () => german(read('account-settings/r1')).replaceOrFail('<h1 class="topbar-title">Vorschlag: ', '<h1 class="topbar-title">')],
  ])('still finds a missing %s part: %s', (kind, message, make) => {
    const found = findings(make());
    expect(found.filter((f) => f.startsWith(`[${kind}]`) && f.includes(message)), found.join('\n')).toHaveLength(1);
  });
});
