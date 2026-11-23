/**
 * The rules of the frontx-design-proposal skill for a change to an existing
 * page, and the parts of the drawing kit that draw today's page as it looks:
 * - one wording for Paths on a single page that changes, and the check that
 *   requires them with a mapping and refuses them on a new single page;
 * - the problem section's condition, sample data counts, the flow and
 *   storyboard rules, said the same way in propose.md and page-parts.md;
 * - the survey prints what today's screens use beyond the shared values
 *   (their own heading, the section heading, the coloured bands) and the
 *   addresses the app's links really carry;
 * - draw.css draws a checked box's tick, and draw.css and drawing-kit.md name
 *   the band and section heading properties;
 * - the texts and the kit agree: one default share for the section heading,
 *   a hand-read value drawn by the scale rule, the style="" properties the
 *   kit's blocks use, the logo as the one img or svg in a drawing, the open
 *   command for each system;
 * - the mapping's "renamed" mark, the flow step named by its drawing without
 *   a map, a storyboard in one option only when it is the same in all;
 * - every worked example records the skill's current version: the examples
 *   are drawn again with each version.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import './replace-or-fail.mjs';
import { writeProposalApp, writeTopApp } from './proposal-fixture.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const skill = path.join(here, '../.frontx/ai/@gears-frontx/template-design-guardrails/skills/frontx-design-proposal');
const survey = await import(pathToFileURL(path.join(skill, 'scripts/survey-app.mjs')).href);
const check = await import(pathToFileURL(path.join(skill, 'scripts/check-proposal.mjs')).href);
const read = (rel) => readFileSync(path.join(skill, rel), 'utf8');
const temps = [];
const tempDir = () => { const dir = mkdtempSync(path.join(tmpdir(), 'fx-proposal-changed-')); temps.push(dir); return dir; };
afterAll(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true }); });

const page = (name) => read(`assets/proposals/${name}/proposal.html`);
const findingsOf = (html) => check.checkPage(html).findings;
const swapIn = (html, from, to) => { const out = html.replaceOrFail(from, to); expect(out, String(from).slice(0, 60)).not.toBe(html); return out; };
const section = (html, id) => new RegExp(`\\n<section class="sec" id="${id}">[\\s\\S]*?\\n</section>`).exec(html)[0];

describe('the survey of a screen that changes: its own heading, section heading and bands', () => {
  const result = survey.survey(writeTopApp(tempDir()));
  const home = result.screenLooks.find((e) => e.label === 'Home');

  it('prints Home\'s 60 px hero headline beside the shared 48 px heading, scaled, with its source', () => {
    expect(home.heading).toEqual(expect.objectContaining({ size: '47px', real: '60px', phone: '40px', weight: '700' }));
    expect(home.heading.source).toMatch(/HomeScreen\.module\.css \.heroTitle \(from 1024 px\) font-size$/);
    expect(result.screenLooks.find((e) => e.label === 'Docs').heading).toBeUndefined();
  });

  it('prints the 40 px section heading and the hero and closing bands from the app\'s tokens', () => {
    expect(home.section).toEqual(expect.objectContaining({ size: '31px', real: '40px', phone: '28px' }));
    expect(home.bands.map((b) => [b.name, b.bg, b.text])).toEqual([['.hero', '#2f6fd6', '#ffffff'], ['.closing', '#1d2433', '#ffffff']]);
    const { look } = result;
    expect([look['band-bg'], look['band-text'], look['band-alt-bg'], look['band-alt-text']]).toEqual(['#2f6fd6', '#ffffff', '#1d2433', '#ffffff']);
    expect([look['band-title'], look['band-title-phone'], look['band-title-weight'], look.section, look['section-phone']]).toEqual(['47px', '40px', '700', '31px', '28px']);
    expect(result.lookFrom['band-alt-bg']).toBe('src-app/mfe_packages/home-mfe/src/screens/home/HomeScreen.module.css .closing background-color');
    expect(result.appLookCss).toContain('  --d-band-alt-bg: #1d2433;');
    expect(survey.readable(result)).toContain('Home: band .closing background #1d2433, text #ffffff');
  });

  it('adds nothing for an app without bands or section headings', () => {
    const plain = survey.survey(writeProposalApp(tempDir()));
    expect(Object.keys(plain.look).filter((k) => /^(band|section)/.test(k))).toEqual([]);
  });
});

describe('the addresses the app\'s links carry', () => {
  it('reads the menu\'s link template and the screens\' literal links, and says when they disagree with the routes', () => {
    const root = writeTopApp(tempDir());
    // A screen that links to Docs through a constant.
    writeFileSync(path.join(root, 'src-app/mfe_packages/home-mfe/src/screens/home/docsNavigation.tsx'), "export const DOCS_HREF = '/?screen=docs';\n");
    const { links } = survey.survey(root);
    expect(links.screens.map((x) => [x.label, x.route, x.link])).toEqual([['Home', '/home', '/?screen=home'], ['Docs', '/docs', '/?screen=docs']]);
    expect(links.screens[0].source).toMatch(/^src-app\/app\/layout\/Menu\.tsx `\/\?screen=\$\{route\.replace/);
    expect(links.inCode).toContainEqual({ href: '/?screen=docs', file: 'src-app/mfe_packages/home-mfe/src/screens/home/docsNavigation.tsx' });
    expect(links.mismatch).toBe(true);
  });

  it('keeps the route when the shell builds no link from it', () => {
    const { links } = survey.survey(writeProposalApp(tempDir()));
    expect(links.mismatch).toBe(false);
    expect(links.screens.every((x) => x.link === x.route)).toBe(true);
  });
});

describe('the drawing kit for today\'s page', () => {
  const css = read('templates/draw/draw.css');
  const kit = read('references/drawing-kit.md');

  it('draw.css draws a checked box\'s tick, and draw.css and drawing-kit.md name the band and section heading properties', () => {
    expect(css).toMatch(/\.d-check--on::after \{[^}]*border-width: 0 2px 2px 0;[^}]*rotate\(45deg\)/);
    for (const prop of ['--d-band-bg', '--d-band-text', '--d-band-alt-bg', '--d-band-alt-text', '--d-band-title', '--d-section']) {
      expect(css).toContain(`${prop}:`);
      expect(kit).toContain(`\`${prop}\``);
    }
  });
});

describe('the check on the rules of a changed page', () => {
  const docs = page('docs-redesign/r1');
  const short = page('account-settings/r1');

  it('requires Paths when the page has a mapping, and refuses them on a new single page', () => {
    expect(findingsOf(docs.replaceOrFail(section(docs, 'paths'), ''))).toContain('[paths] the page changes an existing screen (a mapping section): it needs Paths with the Today column, two or three typical tasks, steps named by their pins');
    const withPaths = swapIn(short, '\n<section class="sec" id="addresses">', `${section(docs, 'paths')}\n<section class="sec" id="addresses">`);
    expect(findingsOf(withPaths)).toContain('[paths] a new single page has no Paths; they are for several screens or for a change to an existing page');
  });

  it('accepts the "renamed" mark with its legend entry, and asks for the entry when it is missing', () => {
    const row = '<tr data-change="renamed"><th scope="row">Header link Docs</th><td>Docs</td><td>Renamed: Guides, same place</td></tr>\n    </tbody>';
    const renamed = swapIn(docs, /\n {4}<\/tbody>/, `\n    ${row}`);
    const found = findingsOf(renamed);
    expect(found).toContain('[mapping] the legend (.legend) does not name the mark "renamed" the table uses');
    const legend = swapIn(renamed, '<p class="legend">', '<p class="legend"><span><span class="swatch" data-change="renamed"></span>renamed, same place</span>');
    expect(findingsOf(legend).filter((f) => f.startsWith('[mapping]'))).toEqual([]);
    expect(read('templates/proposal.html')).toContain('.legend .swatch[data-change="renamed"]');
  });

  it('names a flow step on a page without a map by the caption of the drawing it links', () => {
    const flow = (name) => `\n<section class="sec" id="flow">\n  <h2>How it goes</h2>\n  <p class="takeaway">Three settings are saved in a fixed order across the page.</p>\n  <figure class="flow-fig"><div class="flow" data-cols="2">
    <a class="flow-step" id="f-a" href="#draw-design" data-row="1" data-col="1" data-start><span class="flow-name">${name}</span><span class="flow-what">opens it</span></a>
    <a class="flow-step" id="f-b" href="#draw-design" data-row="2" data-col="1"><span class="flow-name">${name}</span><span class="flow-what">changes it</span></a>
    <a class="flow-step" id="f-c" href="#draw-design" data-row="3" data-col="1"><span class="flow-name">${name}</span><span class="flow-what">saves it</span></a>
    <span class="flow-end" id="f-d" data-end="done" data-row="4" data-col="1">Saved</span>
    <span class="flow-edge" data-from="f-a" data-to="f-b"></span><span class="flow-edge" data-from="f-b" data-to="f-c"></span><span class="flow-edge" data-from="f-c" data-to="f-d"></span>
  </div><figcaption>A box is the screen.</figcaption></figure>\n</section>`;
    const at = '\n<section class="sec" id="overview">';
    const named = (name) => findingsOf(swapIn(short, at, `${flow(name)}${at}`)).filter((f) => f.startsWith('[flow]'));
    expect(named('Desktop')).toEqual([]);
    expect(named('Account page')).toContain('[flow] the step "Account page" is not the name of the drawing it links (#draw-design\'s caption); a page without a map names a step by its screen\'s drawing');
  });

  it('keeps one storyboard in the recommended option only with the line that it is the same in the others', () => {
    const tasks = page('team-tasks/r1');
    const story = '\n<h4 class="view-name">Done, step by step, on a phone</h4>\n<ol class="story" data-width="phone" aria-label="Marking a task done">'
      + [1, 2, 3].map((n) => `<li class="story-frame"><figure class="drawing" id="draw-s${n}" data-zoom-of="draw-a-phone"><div class="scroll"><div class="canvas"><div class="d-app d-app--zoom"><span class="d-badge">Open</span></div></div></div></figure><p class="story-cap"><span class="story-no">${n}</span>The task changes state.</p></li>`).join('')
      + '</ol>';
    const into = (id, extra = '') => swapIn(tasks, new RegExp(`(<section class="option" id="${id}"[\\s\\S]*?)(\\n\\s*</section>)`), `$1${story}${extra}$2`);
    const stories = (html) => findingsOf(html).filter((f) => f.startsWith('[storyboard]'));
    expect(stories(into('option-b'))).toContain('[storyboard] storyboards in #option-b but not in every option: one storyboard sits in the recommended option when the interaction is the same in all, else one per option');
    expect(stories(into('option-a'))).toContain('[storyboard] the storyboard in #option-a is the only one: add the line (p.story-same) saying it is the same in the other options');
    expect(stories(into('option-a', '\n<p class="small story-same">Marking done works the same in options B and C.</p>'))).toEqual([]);
  });
});

describe('the texts and the kit say the same', () => {
  const css = read('templates/draw/draw.css');
  const kit = read('references/drawing-kit.md');
  const propose = read('references/propose.md');

  it('gives the section heading one default share of the page heading, on a desktop and on a phone, in draw.css and drawing-kit.md', () => {
    const desktop = /--d-section: calc\(var\(--d-h1\) \* ([\d.]+)\)/.exec(css)?.[1];
    const phone = /--d-section-phone: calc\(var\(--d-h1-phone\) \* ([\d.]+)\)/.exec(css)?.[1];
    const said = /`--d-section`, `--d-section-phone` \|[^|]*default ([\d.]+) of the page heading \|/.exec(kit)?.[1];
    expect([desktop, phone]).toEqual([said, said]);
  });

  it('shows a value read by hand drawn by the scale rule, as the survey draws it', () => {
    const m = /`--d-h1: (\d+)px; \/\* why: DESIGN\.md sets the page heading at (\d+) px, drawn at round\(\2 \* 1120 \/ 1440\) \*\/`/.exec(kit);
    expect(m).not.toBeNull();
    expect(Number(m[1])).toBe(Math.max(Math.min(Number(m[2]), 16), Math.round((Number(m[2]) * 1120) / 1440)));
    expect(kit).not.toContain('the agent never computes it');
  });

  it('allows in a drawing\'s style="" every property the kit\'s blocks set there, for the blocks that set it', () => {
    const blocks = read('templates/draw/blocks.html');
    const uses = new Set([...blocks.matchAll(/class="(d-[\w-]+)[^"]*" style="(--\w+):/g)].map((m) => `${m[1]} ${m[2]}`));
    expect([...uses].sort()).toEqual(['d-bar --h', 'd-board --cols', 'd-grid --cols', 'd-progress --w', 'd-skel --w', 'd-stats --cols']);
    const rule = /`style=""` may set (.*), nothing else\./.exec(propose)?.[1] ?? '';
    for (const [prop, words] of [['--cols', 'counters'], ['--w', 'progress bar'], ['--h', 'bar']]) expect(rule).toMatch(new RegExp(`\`${prop}\` \\([^)]*${words}`));
  });

  it('names the logo as the one img or svg a drawing may hold, as the check allows it', () => {
    expect(propose).toContain('No `p`, heading, `img` or `svg` inside a drawing, except the app\'s own logo in `.d-logo`, which `brandHtml` carries;');
  });

  it('gives the open command for macOS, Linux and Windows in the block an agent copies', () => {
    const block = /## 8\. Open and ask[\s\S]*?```bash\n([\s\S]*?)```/.exec(propose)[1];
    expect(block.split('\n').filter(Boolean).map((l) => l.split(' ')[0])).toEqual(['open', 'xdg-open', 'Start-Process']);
  });
});

describe('one wording in SKILL.md, propose.md and page-parts.md', () => {
  const docs = { skill: read('SKILL.md'), propose: read('references/propose.md'), parts: read('references/page-parts.md') };

  it('gives Paths with the Today column to a single page that changes an existing page, and none to a new single page', () => {
    expect(docs.skill).toMatch(/Paths with the Today column, even on a single page; a new single page has no Paths/);
    expect(docs.propose).toMatch(/for several screens, and for a single page that changes an existing page[\s\S]*?A new single page has none\./);
    expect(docs.parts).toMatch(/For a feature of several screens, and for a single page that changes an existing page[\s\S]*?a new single page, with or without options, has none/);
  });

  it('says the problem section, sample data, flow and storyboard rules the same way', () => {
    expect(docs.propose).toContain('when an existing screen changes or the person asks the page to open on the problem');
    expect(docs.parts).toContain('when an existing screen changes, or the person asks the page to open on the problem');
    for (const text of [docs.propose, docs.parts]) {
      expect(text).toContain('as many rows as the real thing has');
      expect(text).toMatch(/single choice made in one press on one screen \(do it or skip it\) is a state change/);
      expect(text).toMatch(/one storyboard (in|sits in) the recommended option/);
    }
    expect(docs.parts).toContain('your reading of today\'s page');
    expect(docs.propose).toMatch(/contradicts a rule of the project's design files[\s\S]*?follow the request and change the rule; keep the rule and adjust the request/);
  });
});

describe('the recorded skill version, since the worked examples are drawn again with each version', () => {
  const version = /^version: (\S+)$/m.exec(read('SKILL.md'))[1];
  const records = ['account-settings/r1/CHOICE.md', 'docs-redesign/r1/CHOICE.md', 'invite-teammate/r1/CHOICE.md', 'team-tasks/r1/CHOICE.md', 'team-tasks/r2/CHOICE.md', 'team-tasks/CHOICE.selected.md'];

  it.each(records)('%s records the skill\'s own version', (rel) => {
    const said = /frontx-design-proposal skill (\d+\.\d+\.\d+)/.exec(read(`assets/proposals/${rel}`));
    expect(said?.[1], rel).toBe(version);
  });

  it('names no skill version number in the references or the record template', () => {
    for (const rel of ['references/record.md', 'references/propose.md', 'references/page-parts.md', 'templates/CHOICE.md']) expect(read(rel)).not.toMatch(/frontx-design-proposal skill \d/);
  });
});
