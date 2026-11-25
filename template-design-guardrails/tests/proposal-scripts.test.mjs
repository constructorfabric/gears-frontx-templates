/**
 * The two scripts of the frontx-design-proposal skill and the hover of its page:
 * - survey-app.mjs against a small app with Home and Docs written into a temp
 *   folder (tests/proposal-fixture.mjs), whose survey is the worked example's
 *   survey.json;
 * - survey-app.mjs against a top header app that styles itself
 *   (tests/proposal-fixture.mjs): the screens it shows, its chrome and its
 *   own page values over the kit's; screens with the same presentation order
 *   come out in the UTF-16 code unit order of their routes, not the locale's;
 * - check-proposal.mjs on the worked example (r1 replaced, r2 awaiting, the
 *   r2 record selected) and on broken copies, one per finding kind, a pin
 *   number that is not digits included; the page parts have their own file,
 *   proposal-parts.test.mjs;
 * - the hover of the skeleton's frame script on a pin numbered 1": its
 *   selectors escape the number, so the pin and its note light up.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import './replace-or-fail.mjs';
import { writeProposalApp, writeTopApp } from './proposal-fixture.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const skill = path.join(here, '../.frontx/ai/@gears-frontx/template-design-guardrails/skills/frontx-design-proposal');
const example = path.join(skill, 'assets/proposals/team-tasks');
const survey = await import(pathToFileURL(path.join(skill, 'scripts/survey-app.mjs')).href);
const check = await import(pathToFileURL(path.join(skill, 'scripts/check-proposal.mjs')).href);

const temps = [];
const tempDir = () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'fx-proposal-'));
  temps.push(dir);
  return dir;
};
afterAll(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true }); });

const silent = () => {
  const out = [];
  return { out, io: { log: (line) => out.push(line), error: (line) => out.push(line) } };
};

// Gives both screens of a top header app the same presentation order, so the route tie-break decides.
const withRoutes = (root, edits) => {
  for (const [rel, route] of Object.entries(edits)) {
    const file = path.join(root, rel);
    const data = JSON.parse(readFileSync(file, 'utf8'));
    data.extensions = data.extensions.map((x) => ({ ...x, route, presentation: { ...x.presentation, order: 10 } }));
    writeFileSync(file, JSON.stringify(data, null, 2));
  }
  return root;
};

describe('survey-app.mjs', () => {
  const app = writeProposalApp(tempDir());

  it('finds the screens in menu order with their kit components, skipping blanks and tests', () => {
    const result = survey.survey(app);
    expect(result.screens.map((s) => [s.order, s.label, s.route])).toEqual([[10, 'Home', '/home'], [20, 'Docs', '/docs']]);
    expect(result.screens[0].kitComponents).toEqual(['Button', 'Card', 'CardContent', 'CardHeader', 'CardTitle']);
    expect(result.screens[1].kitComponents).not.toContain('Dialog');
    expect(result.screens[1].source).toEqual(['src-app/mfe_packages/team-mfe/src/screens/docs/']);
  });

  // The routes here are upper and lower case letters on purpose: localeCompare sorts 'a' before 'B',
  // UTF-16 code units sort 'B' (U+0042) before 'a' (U+0061), whichever screen holds which route.
  it('orders screens with the same order by the UTF-16 code units of their routes, not by the locale', () => {
    const result = survey.survey(withRoutes(writeTopApp(tempDir()), {
      'src-app/mfe_packages/home-mfe/mfe.json': '/a',
      'src-app/mfe_packages/docs-mfe/mfe.json': '/B',
    }));
    expect(result.screens.map((s) => s.route)).toEqual(['/B', '/a']);
  });

  it('orders screens with the same order by their routes whichever package holds which route', () => {
    const result = survey.survey(withRoutes(writeTopApp(tempDir()), {
      'src-app/mfe_packages/home-mfe/mfe.json': '/B',
      'src-app/mfe_packages/docs-mfe/mfe.json': '/a',
    }));
    expect(result.screens.map((s) => s.route)).toEqual(['/B', '/a']);
  });

  it('reports services, mocks, design files, navigation and the app name', () => {
    const result = survey.survey(app);
    expect(result.services.map((s) => s.name)).toEqual(['AccountsApiService', 'DocsApiService']);
    expect(result.mocks).toHaveLength(2);
    expect(result.designFiles).toEqual(['DESIGN.md']);
    expect([result.nav, result.appName]).toEqual(['side', 'Team Hub']);
  });

  it('resolves the look through the theme first, then the kit scope of its appearance', () => {
    const { look, lookSources, unresolved } = survey.survey(app);
    expect(lookSources.themeId).toBe('default');
    expect(look.bg).toBe('#f1f5f9');
    expect(look['nav-bg']).toBe('#0f172a');
    expect(look['nav-text']).toBe('color-mix(in oklab, #f1f5f9 70%, #0f172a)');
    // Kit sizes in rem become drawn pixels by the scale rule: 20 px is drawn at 16, 10 and 12 px stay.
    expect([look.radius, look.h1, look.small]).toEqual(['10px', '16px', '12px']);
    expect(unresolved).toEqual([]);
  });

  it('matches the worked example survey.json', () => {
    const saved = JSON.parse(readFileSync(path.join(example, 'r1/survey.json'), 'utf8'));
    expect({ ...survey.survey(app), project: '.' }).toEqual(saved);
  });

  it('prints "unresolved" and exits 1 when a value cannot be found', () => {
    const bare = tempDir();
    writeFileSync(path.join(bare, 'index.html'), '<title>Bare</title>');
    const { out, io } = silent();
    expect(survey.main(['--project', bare, '--json'], io)).toBe(1);
    const result = JSON.parse(out.join('\n'));
    expect(result.look.bg).toBe(survey.UNRESOLVED);
    expect(result.appLookCss).toContain('/* --d-bg: unresolved, read ');
  });

  it('exits 0 on the full app, prints --help, and exits 2 on a bad flag or folder', () => {
    expect(survey.main(['--project', app], silent().io)).toBe(0);
    const help = silent();
    expect(survey.main(['--help'], help.io)).toBe(0);
    expect(help.out.join('\n')).toContain('usage: node survey-app.mjs');
    expect(survey.main(['--nope'], silent().io)).toBe(2);
    expect(survey.main(['--project', path.join(app, 'missing')], silent().io)).toBe(2);
  });
});

describe('check-proposal.mjs on the worked examples', () => {
  it.each(['team-tasks/r1', 'team-tasks/r2', 'account-settings/r1', 'docs-redesign/r1', 'invite-teammate/r1'])('finds the revision folder %s clean: page, survey and record', (dir) => {
    expect(check.checkTarget(path.join(skill, 'assets/proposals', dir))).toEqual([]);
  });

  it('keeps r1 as replaced and r2 as awaiting selection, naming r1', () => {
    expect(readFileSync(path.join(example, 'r1/CHOICE.md'), 'utf8')).toMatch(/^- Status: replaced$/m);
    const r2 = readFileSync(path.join(example, 'r2/CHOICE.md'), 'utf8');
    expect(r2).toMatch(/^- Status: awaiting selection$/m);
    expect(r2).toMatch(/^- Replaces: r1$/m);
  });

  it('keeps the survey of both revisions the same', () => {
    expect(readFileSync(path.join(example, 'r2/survey.json'), 'utf8')).toBe(readFileSync(path.join(example, 'r1/survey.json'), 'utf8'));
  });

  it('finds the selected record clean', () => {
    const text = readFileSync(path.join(example, 'CHOICE.selected.md'), 'utf8');
    expect(text).toMatch(/^- Status: selected$/m);
    expect(check.checkChoice(text, { options: [], pageId: 'team-tasks', revision: 'r2' })).toEqual([]);
  });

  it('flags the unfilled CHOICE.md template', () => {
    const findings = check.checkChoice(readFileSync(path.join(skill, 'templates/CHOICE.md'), 'utf8'));
    expect(findings.some((f) => f.includes('placeholder'))).toBe(true);
  });

  it('runs as a command: the check prints its last line and exits 0, the survey prints its usage', () => {
    const run = (script, args) => spawnSync(process.execPath, [path.join(skill, 'scripts', script), ...args], { encoding: 'utf8' });
    const checked = run('check-proposal.mjs', [path.join(example, 'r1')]);
    expect([checked.status, checked.stdout.trim().split('\n').at(-1)]).toEqual([0, 'clean: 0 findings']);
    const help = run('survey-app.mjs', ['--help']);
    expect([help.status, help.stdout.split('\n')[0]]).toEqual([0, 'usage: node survey-app.mjs [--project <root>] [--json] [--out <file>]']);
  });

  it('exits 0 clean, 1 with findings, 2 on bad input', () => {
    expect(check.main([path.join(example, 'r1')], silent().io)).toBe(0);
    expect(check.main([path.join(skill, 'templates/proposal.html')], silent().io)).toBe(1);
    expect(check.main([], silent().io)).toBe(2);
    expect(check.main(['--x', 'y'], silent().io)).toBe(2);
    expect(check.main([path.join(example, 'nope')], silent().io)).toBe(2);
  });
});

describe('check-proposal.mjs on broken copies', () => {
  const page = readFileSync(path.join(example, 'r1/proposal.html'), 'utf8');
  const choice = readFileSync(path.join(example, 'r1/CHOICE.md'), 'utf8');
  const kinds = (html) => check.checkPage(html).findings;
  const swap = (from, to) => {
    expect(page.includes(from), from).toBe(true);
    return page.replaceOrFail(from, to);
  };

  it.each([
    ['external', 'points outside the page', swap('</main>', '<img src="https://example.org/x.png"></main>')],
    ['external', 'url(x.png)', swap('</main>', '<span style="background: url(x.png)"></span></main>')],
    ['frame', 'the draw block differs', swap('.d-app, .d-app * { box-sizing: border-box; }', '.d-app, .d-app * { box-sizing: content-box; }')],
    ['frame', 'only --d-* properties', swap('--d-nav-text: color-mix(in oklab, #f1f5f9 70%, #0f172a);', '--d-nav-text: color-mix(in oklab, #f1f5f9 70%, #0f172a); color: red;')],
    ['sections', 'required section #asked is missing', swap('<section class="sec" id="asked">', '<section class="sec" id="asked-x">')],
    ['sections', 'sections out of order', page.replaceOrFail(/(<section class="sec" id="place">[\s\S]*?<\/section>\n\n)(<section class="sec" id="how">)/, '$2').replaceOrFail('<section class="sec" id="built">', (m) => `${page.match(/<section class="sec" id="place">[\s\S]*?<\/section>\n\n/)[0]}${m}`)],
    ['head', 'one sentence', swap('opens its details.</p>', 'opens its details. It is quick.</p>')],
    ['head', 'drawings for deciding', swap('<p class="disclaimer">These are drawings for deciding.', '<p class="note-x">These are')],
    ['pins', 'pin 9 has no note', swap('<li data-n="9"><b>Missing values</b>', '<li data-n="10"><b>Missing values</b>')],
    ['pins', 'note 10 has no pin', swap('<li data-n="9"><b>Missing values</b>', '<li data-n="10"><b>Missing values</b>')],
    ['overview', 'link to #option-x, which does not exist', swap('<a class="opt-link" href="#option-b"><span class="mini" data-mini-of="draw-b"></span>', '<a class="opt-link" href="#option-x"><span class="mini" data-mini-of="draw-b"></span>')],
    ['overview', 'holds no thumbnail', swap('<span class="mini" data-mini-of="draw-c"></span>', '')],
    ['drawing', 'class "fancy" is not in the drawing kit', swap('<span class="d-h1">Tasks</span><span class="d-muted">10 tasks across the team</span></div><span class="d-btn d-btn--primary" data-note="1">', '<span class="d-h1 fancy">Tasks</span><span class="d-muted">10 tasks across the team</span></div><span class="d-btn d-btn--primary" data-note="1">')],
    ['drawing', 'only --cols, --w and --h', swap('<div class="d-grid" style="--cols: 3">', '<div class="d-grid" style="--cols: 3; color: #ff0000">')],
    ['drawing', '<p> inside a drawing', swap('<span class="d-skel" style="--w: 80%"></span>', '<p>The loading state shows grey lines where the tasks will be while the list loads from the server.</p>')],
    ['options', 'has no "Trade-off"', swap('<dt>Trade-off</dt><dd>about half', '<dt>Cost</dt><dd>about half')],
    ['text', 'longer than five words', swap('<b>Status select</b>', '<b>The select that replaces the status tabs</b>')],
    ['text', 'placeholder {{PAGE_TITLE}}', swap('<h1 class="topbar-title">Proposal: Team tasks</h1>', '<h1 class="topbar-title">Proposal: {{PAGE_TITLE}}</h1>')],
  ])('reports %s: %s', (kind, message, html) => {
    const found = kinds(html);
    expect(found.filter((f) => f.startsWith(`[${kind}]`) && f.includes(message)), found.join('\n')).toHaveLength(1);
  });

  it('reports a pin and its note numbered 1&quot; though they match: the hover finds a note by a number of digits only', () => {
    const html = swap(' data-note="1">Tasks <span class="d-new">', ' data-note="1&quot;">Tasks <span class="d-new">')
      .replaceOrFail('<ol class="notes" data-for="draw-place">\n<li data-n="1">', '<ol class="notes" data-for="draw-place">\n<li data-n="1&quot;">');
    expect(kinds(html)).toEqual(['[pins] <span data-note="1\\"">: a pin or note number is digits only', '[pins] <li data-n="1\\"">: a pin or note number is digits only']);
  });

  it('reports a recommendation and option fields on a one-design page', () => {
    const one = page
      .replaceOrFail(/<section class="option" id="option-b"[\s\S]*?<\/section>\n\n  <section class="option" id="option-c"[\s\S]*?<\/section>\n/, '')
      .replaceOrFail('<section class="option" id="option-a" data-option="a">', '<section class="option" id="design">');
    const found = kinds(one);
    expect(found).toContain('[sections] with one design there is no recommendation section');
    expect(found).toContain('[options] one design has no option fields (Best for, Trade-off)');
  });

  it('reports a selected record without the person\'s words and an unknown option', () => {
    const selected = choice.replaceOrFail('- Status: replaced', '- Status: selected').replaceOrFail('- Chosen: a', '- Chosen: d').replaceOrFail(/^- Person's words: .*$/m, "- Person's words: none yet");
    const found = check.checkChoice(selected, { options: ['a', 'b', 'c'] });
    expect(found).toContain('[choice] "Person\'s words" must be filled once selected');
    expect(found).toContain('[choice] Chosen "d" is not one of a, b, c');
  });

  it.each([
    ['without its page', (dir) => rmSync(path.join(dir, 'proposal.html')), ['proposal.html: [record] missing']],
    ['without its record', (dir) => rmSync(path.join(dir, 'CHOICE.md')), ['CHOICE.md: [record] missing']],
    ['with a broken survey.json', (dir) => writeFileSync(path.join(dir, 'survey.json'), '{'), ['survey.json: [record] not valid JSON']],
  ])('reports a revision folder %s', (_, breakIt, want) => {
    const dir = path.join(tempDir(), 'team-tasks', 'r1');
    cpSync(path.join(example, 'r1'), dir, { recursive: true });
    breakIt(dir);
    expect(check.checkTarget(dir)).toEqual(want);
  });

  it('reports a record whose options differ from the page and a folder name mismatch', () => {
    const dir = path.join(tempDir(), 'other-page', 'r2');
    cpSync(path.join(example, 'r1'), dir, { recursive: true });
    writeFileSync(path.join(dir, 'CHOICE.md'), choice.replaceOrFail(/^- Option c: .*\n/m, ''));
    const found = check.checkTarget(dir);
    expect(found).toContain('CHOICE.md: [choice] options a, b differ from the page\'s a, b, c');
    expect(found).toContain('CHOICE.md: [choice] Page id "team-tasks" is not the folder\'s "other-page"');
    expect(found).toContain('CHOICE.md: [choice] Revision "r1" is not the folder\'s "r2"');
  });
});

describe('survey-app.mjs on a top header app that styles itself', () => {
  const app = writeTopApp(tempDir());
  const result = survey.survey(app);

  it('lists only the screens the app registers, the rest apart as not shown', () => {
    expect(result.screens.map((s) => [s.label, s.route])).toEqual([['Home', '/home'], ['Docs', '/docs']]);
    expect(result.registry).toBe('public/generated-mfe-manifests.json');
    expect(result.notShown.map((s) => [s.label, s.reason])).toEqual([
      ['Blank Home', 'a blank scaffold (its folder name starts with "_")'],
      ['Hello World', 'a template example (templateExample: true in its mfe.json)'],
      ['Profile', 'a template example (templateExample: true in its mfe.json)'],
      ['Drafts', 'not in public/generated-mfe-manifests.json'],
    ]);
  });

  it('reads the chrome: a top header, links at the far end, an underlined active link, a second row of links on a phone', () => {
    expect([result.nav, result.chrome.links, result.chrome.active, result.chrome.phone]).toEqual(['top', 'end', 'underline', 'rows']);
    expect(result.look['toplink-active']).toBe('#2f6fd6');
    expect(result.variants).toEqual({ window: 'd-app d-app--top', nav: 'd-top d-top--end d-active--underline', phone: 'd-top d-top--rows d-active--underline', brand: 'd-brand d-brand--logo' });
    expect(result.chrome.sources.active).toMatch(/^src-app\/app\/layout\/Menu\.module\.css /);
  });

  it('takes the app\'s own values over the kit\'s, scaled to the drawing window, each with its source', () => {
    const { look, lookReal: real, lookFrom: from } = result;
    expect(look.bg).toBe('#ffffff');
    expect([real.h1, look.h1, look['h1-weight'], look['h1-track']]).toEqual(['48px', '37px', '600', '-0.02em']);
    expect([real.gutter, look.gutter, real.max]).toEqual(['64px', '50px', '1112px']);
    expect([look.radius, look['th-case'], real['btn-h'], look['btn-radius']]).toEqual(['12px', 'uppercase', '44px', '8px']);
    expect([real['nav-h'], look['nav-h']]).toEqual(['68px', '53px']);
    expect([look['gutter-phone'], look['navrow-h-phone']]).toEqual(['20px', '44px']);
    expect(from.h1).toMatch(/DocsScreen\.module\.css \.pageTitle \(from 1024 px\) font-size$/);
    expect(result.appOverKit.find((d) => d.key === 'bg')).toEqual(expect.objectContaining({ app: '#ffffff', kit: '#f1f5f9' }));
    expect(result.designFiles).toEqual(['DESIGN-RULES.md', 'DESIGN.md']);
    expect(result.unresolved).toEqual([]);
  });

  it('is the survey of the account-settings and docs-redesign examples', () => {
    const saved = JSON.parse(readFileSync(path.join(skill, 'assets/proposals/account-settings/r1/survey.json'), 'utf8'));
    expect({ ...result, project: '.' }).toEqual(saved);
    expect(readFileSync(path.join(skill, 'assets/proposals/docs-redesign/r1/survey.json'), 'utf8')).toBe(readFileSync(path.join(skill, 'assets/proposals/account-settings/r1/survey.json'), 'utf8'));
  });

  it('applies one scale rule to desktop pixels, never below the real size up to 16 px', () => {
    expect([52, 68, 72, 22, 12, 16, 18].map(survey.scalePx)).toEqual([40, 53, 56, 17, 12, 16, 16]);
  });

  it('prints only JSON with --json, writes it with --out, and exits 1 on a look value it cannot resolve', () => {
    const json = silent();
    expect(survey.main(['--project', app, '--json'], json.io)).toBe(0);
    expect(JSON.parse(json.out.join('\n')).screens).toHaveLength(2);
    const file = path.join(tempDir(), 'r1', 'survey.json');
    const saved = silent();
    expect(survey.main(['--project', app, '--out', file], saved.io)).toBe(0);
    expect(JSON.parse(readFileSync(file, 'utf8')).project).toBe('.');
    expect(saved.out.join('\n')).not.toContain('"appLookCss"');
    const broken = writeTopApp(tempDir());
    const css = path.join(broken, 'src-app/mfe_packages/docs-mfe/src/screens/docs/DocsScreen.module.css');
    writeFileSync(css, readFileSync(css, 'utf8').replaceOrFail(/(\.pageTitle \{[^}]*?font-size:)[^;]+;/, '$1 var(--app-missing);'));
    const out = silent();
    expect(survey.main(['--project', broken], out.io)).toBe(1);
    expect(out.out.join('\n')).toMatch(/--d-h1-phone: unresolved/);
  });
});

describe('check-proposal.mjs against the survey beside the page', () => {
  const page = readFileSync(path.join(example, 'r1/proposal.html'), 'utf8');
  const saved = JSON.parse(readFileSync(path.join(example, 'r1/survey.json'), 'utf8'));
  const findings = (html, surveyJson = saved) => check.checkPage(html, { survey: surveyJson }).findings;
  const swap = (from, to) => {
    expect(page.includes(from), from).toBe(true);
    return page.replaceOrFail(from, to);
  };

  it('finds the worked example clean against its survey', () => {
    expect(findings(page)).toEqual([]);
  });

  it.each([
    ['app-look', '--d-radius is 14px but survey.json gives 10px', swap('  --d-radius: 10px;\n', '  --d-radius: 14px;\n')],
    ['app-look', '--d-radius is missing', swap('  --d-radius: 10px;\n', '')],
    ['app-look', '--d-glow is not in survey.json', swap('  --d-radius: 10px;\n', '  --d-radius: 10px;\n  --d-glow: 4px;\n')],
    ['app-look', '--d-radius is 14px', swap('  --d-radius: 10px;\n', '  --d-radius: 14px; /* why: */\n')],
    ['variants', 'the navigation lacks d-active--filled', swap('<nav class="d-side d-active--filled"><span class="d-brand d-brand--initials"><span class="d-mark">TH</span>Team Hub</span><span class="d-navlink">Home</span><span class="d-navlink">Docs</span><span class="d-navlink d-navlink--active">Tasks</span></nav>', '<nav class="d-side"><span class="d-brand d-brand--initials"><span class="d-mark">TH</span>Team Hub</span><span class="d-navlink">Home</span><span class="d-navlink">Docs</span><span class="d-navlink d-navlink--active">Tasks</span></nav>')],
    ['strip', 'starts with a side-by-side strip', page.replaceOrFail(/ {2}<div class="strip">[\s\S]*?<\/div>\n/, '')],
    ['strip', 'option #option-c has 0 strip cells', swap('data-strip-of="draw-c"', 'data-strip-of="draw-a"')],
    ['built', 'one short line', swap('in C, board columns.</p>', 'in C, board columns.</p><ul><li>Table</li></ul>')],
  ])('reports %s: %s', (kind, message, html) => {
    const found = findings(html);
    expect(found.filter((f) => f.startsWith(`[${kind}]`) && f.includes(message)), found.join('\n')).toHaveLength(1);
  });

  it('accepts a value that differs from the survey with its reason beside it, and data-why on a variant', () => {
    expect(findings(swap('  --d-radius: 10px;\n', '  --d-radius: 14px; /* why: DESIGN.md rounds cards at 14 px */\n'))).toEqual([]);
    const plain = swap('<nav class="d-side d-active--filled"><span class="d-brand d-brand--initials"><span class="d-mark">TH</span>Team Hub</span><span class="d-navlink">Home</span><span class="d-navlink">Docs</span><span class="d-navlink d-navlink--active">Tasks</span></nav>', '<nav class="d-side" data-why="the menu of this screen hides the active mark"><span class="d-brand d-brand--initials"><span class="d-mark">TH</span>Team Hub</span><span class="d-navlink">Home</span><span class="d-navlink">Docs</span><span class="d-navlink d-navlink--active">Tasks</span></nav>');
    expect(findings(plain)).toEqual([]);
  });

  it('reads a survey.json that lacks the variants it would compare, without failing', () => {
    expect(findings(page, { ...saved, variants: {} })).toEqual([]);
  });

  it('reads survey.json beside the page in a folder check', () => {
    const dir = path.join(tempDir(), 'team-tasks', 'r1');
    cpSync(path.join(example, 'r1'), dir, { recursive: true });
    writeFileSync(path.join(dir, 'survey.json'), JSON.stringify({ ...saved, look: { ...saved.look, radius: '4px' } }));
    expect(check.checkTarget(dir)).toEqual(['proposal.html: [app-look] --d-radius is 10px but survey.json gives 4px; use the survey value or give the reason in a comment beside it (/* why: ... */)']);
  });
});

describe('the record lookup in references/build.md', () => {
  const block = /```bash\n([\s\S]*?)```/.exec(readFileSync(path.join(skill, 'references/build.md'), 'utf8'))?.[1] ?? '';
  const lookup = block.split('\n').find((line) => line.includes('<page-id>')) ?? '';

  it.skipIf(process.platform === 'win32')('prints the highest revision by its number, r10 after r9, with the shell tools of macOS and Linux', () => {
    const root = tempDir();
    for (const r of ['r1', 'r2', 'r9', 'r10']) cpSync(path.join(example, 'r1'), path.join(root, '.frontx/proposals/team-tasks', r), { recursive: true });
    const run = spawnSync('sh', ['-c', lookup.replaceAll('<page-id>', 'team-tasks')], { cwd: root, encoding: 'utf8' });
    expect(run.stderr).toBe('');
    expect(run.stdout).toBe('r10\n');
  });

  it('names no GNU-only listing option in SKILL.md or any reference', () => {
    const docs = ['SKILL.md', ...readdirSync(path.join(skill, 'references')).filter((f) => f.endsWith('.md')).map((f) => `references/${f}`)];
    expect(docs.length).toBeGreaterThan(6);
    for (const doc of docs) expect(readFileSync(path.join(skill, doc), 'utf8'), doc).not.toMatch(/\bls -\w*v/);
  });

  it('names another skill\'s steps by what they do, never by a number that can go stale', () => {
    const docs = ['SKILL.md', ...readdirSync(path.join(skill, 'references')).filter((f) => f.endsWith('.md')).map((f) => `references/${f}`)];
    for (const doc of docs) expect(readFileSync(path.join(skill, doc), 'utf8'), doc).not.toMatch(/add-mfe-package[^.]*\bsteps? \d/i);
  });
});

describe('the hover of the page script (frame-js of templates/proposal.html)', () => {
  const js = /<script id="frame-js">([\s\S]*?)<\/script>/.exec(readFileSync(path.join(skill, 'templates/proposal.html'), 'utf8'))[1];
  // The pattern follows the skeleton's layout (two-space indent, the function closed by "  }").
  const src = /\n {2}function hot\(figure, n, on\) \{[\s\S]*?\n {2}\}\n/.exec(js)?.[0];
  /** CSS.escape as CSSOM defines it. */
  const cssEscape = (s) => [...String(s)].map((ch, i, all) => {
    const c = ch.codePointAt(0);
    if (c === 0) return '\ufffd';
    if ((c >= 1 && c <= 0x1f) || c === 0x7f || (i === 0 && /\d/.test(ch)) || (i === 1 && /\d/.test(ch) && all[0] === '-')) return `\\${c.toString(16)} `;
    if (i === 0 && ch === '-' && all.length === 1) return '\\-';
    return c >= 0x80 || /[-\w]/.test(ch) ? ch : `\\${ch}`;
  }).join('');
  /**
   * querySelectorAll of a stand-in: a list of [name="value"] parts, each with an optional tag or .class before it and
   * the value in CSS string escapes. Anything else throws the SyntaxError a browser throws on a selector it cannot read.
   */
  const select = (els, selector) => {
    const parts = [];
    const part = /\s*(?:([a-z]+)|\.([\w-]+))?\[([\w-]+)="((?:\\[\s\S]|[^"\\])*)"\]\s*(?:,|$)/y;
    while (part.lastIndex < selector.length) {
      const m = part.exec(selector);
      if (!m) throw new SyntaxError(`'${selector}' is not a valid selector`);
      parts.push({ tag: m[1], cls: m[2], name: m[3], value: m[4].replace(/\\([0-9a-fA-F]{1,6})[ \t\n]?|\\([\s\S])/g, (_, hex, ch) => (hex ? String.fromCodePoint(parseInt(hex, 16)) : ch)) });
    }
    return els.filter((el) => parts.some((p) => (!p.tag || el.tag === p.tag) && (!p.cls || el.cls === p.cls) && el.attrs[p.name] === p.value));
  };
  const el = (tag, cls, attrs) => {
    const node = { tag, cls, attrs, hot: false };
    node.classList = { toggle: (name, on) => { if (name === 'is-hot') node.hot = on; } };
    return node;
  };

  it('lights a pin numbered 1" and its note in a figure whose id holds a quote, and nothing else, without a selector error', () => {
    if (!src) throw new Error('the frame script of templates/proposal.html has no function hot');
    const [pin, other, note, otherNote] = [el('span', 'd-btn', { 'data-note': '1"' }), el('span', 'd-btn', { 'data-note': '2' }), el('li', undefined, { 'data-n': '1"' }), el('li', undefined, { 'data-n': '2' })];
    const list = { ...el('ol', 'notes', { 'data-for': 'draw"place' }), querySelectorAll: (s) => select([note, otherNote], s) };
    const figure = { id: 'draw"place', querySelectorAll: (s) => select([pin, other], s) };
    const doc = { querySelector: (s) => select([list], s)[0] ?? null };
    const hot = new Function('document', 'CSS', `${src}\nreturn hot;`)(doc, { escape: cssEscape });
    hot(figure, '1"', true);
    expect([pin.hot, note.hot, other.hot, otherNote.hot]).toEqual([true, true, false, false]);
  });
});
