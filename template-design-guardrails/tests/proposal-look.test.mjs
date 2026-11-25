/**
 * The parts of the frontx-design-proposal drawing that follow the app:
 * - the brand mark: the survey finds the shell's logo (an SVG in a component
 *   the header imports, an SVG or raster file), cleans or embeds it, or falls
 *   back to the accent square or initials and says why (the logo found
 *   through a named or a default import, an import read up to 2000
 *   characters); an SVG logo is
 *   defined once per page (brandDefs) and every brand refers to it; the check
 *   accepts only a clean mark, the survey's own when survey.json is known,
 *   and never the logo inlined again where the survey defines it once;
 *   An SVG is kept up to SVG_CAP bytes once cleaned, and a use whose
 *   address was dropped draws nothing;
 * - the rules a stylesheet yields: an at-statement at the top level (@import,
 *   @charset, @layer a;, @namespace, @value) ends at its semicolon and the
 *   rule after it is read as its own rule; the rules inside a rule-holding
 *   block at-rule (@layer a { ... }, @supports, @container) are read as
 *   conditional and never reach the look, while a block at-rule that holds
 *   no style rules (@keyframes, @font-face) is read on;
 * - the app name from the index title, the content column's width by the
 *   app's own box-sizing (its global reset at the top level of a stylesheet
 *   in src-app or src-app/app, unless the column opts out), and the link
 *   addresses from a route template only where a link is built from it (an
 *   href or to, a navigate, push, assign, open or redirect call, a location
 *   assignment; templates that disagree are unresolved);
 *   a length the survey cannot read (two dots, a number that never fits) is
 *   unknown, the same as any other unreadable length;
 * - the active tab's text colour, read from the app, the kit's when the app
 *   sets none;
 * - the side-by-side strip: stripFit in the skeleton's page script never
 *   crops a region's width, and stacks to one column when cells would be
 *   too small to read.
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

const temps = [];
const tempDir = () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'fx-proposal-look-'));
  temps.push(dir);
  return dir;
};
afterAll(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true }); });

const HEADER = 'src-app/app/layout/Header.tsx';
// A file that starts like a PNG, padded to the given size.
const png = (bytes) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(bytes - 8, 1)]);
const ICON = 'src-app/app/icons/AppLogoIcon.tsx';
const topApp = (edit = {}) => {
  const root = writeTopApp(tempDir());
  for (const [rel, change] of Object.entries(edit)) {
    const file = path.join(root, rel);
    writeFileSync(file, typeof change === 'function' ? change(readFileSync(file, 'utf8')) : change);
  }
  return root;
};

describe('the brand mark', () => {
  const result = survey.survey(topApp());

  it('inlines the logo the header imports, cleaned, at the surveyed size and colour', () => {
    expect(result.brandMark.kind).toBe('svg');
    expect(result.brandMark.file).toBe(ICON);
    expect(result.brandMark.svg).toBe('<svg viewBox="0 0 32 32" fill="currentColor" aria-hidden="true"><path d="M4 4h24v24H4z" opacity="0.3"/><path d="M10 10h12v12H10z"/></svg>');
    expect(result.brandMark.svg).not.toMatch(/class|\{/);
    expect(result.variants.brand).toBe('d-brand d-brand--logo');
    expect(result.brandHtml).toBe('<span class="d-brand d-brand--logo"><span class="d-logo"><svg aria-hidden="true"><use href="#brand-mark"/></svg></span>Example App</span>');
    expect(result.brandDefs).toBe(`<svg class="brand-defs" aria-hidden="true"><symbol id="brand-mark" viewBox="0 0 32 32" fill="currentColor">${result.brandMark.svg.replaceOrFail(/^<svg[^>]*>|<\/svg>$/g, '')}</symbol></svg>`);
    expect([result.lookReal.mark, result.look.mark]).toEqual(['26px', '20px']);
    expect(result.look['mark-color']).toBe('#2f6fd6');
    expect(result.lookFrom['mark-color']).toBe('src-app/app/layout/Header.module.css .mark color');
  });

  it('never carries xml:base of the logo into brandDefs', () => {
    const based = survey.survey(topApp({ [ICON]: (t) => t.replaceOrFail('viewBox="0 0 32 32"', 'viewBox="0 0 32 32" xml:base="https://attacker.example/"') }));
    expect(based.brandMark.kind).toBe('svg');
    expect(based.brandDefs).toBe(result.brandDefs);
    expect(JSON.stringify(based)).not.toContain('attacker.example');
  });

  it('drops scripts, handlers and outside references from an SVG, and refuses one whose values come from code', () => {
    const dirty = '<svg width="24" height="24" onload="x()"><script>alert(1)</script><foreignObject><div>hi</div></foreignObject><image href="https://example.com/a.png"/><use href="https://example.com/s.svg#a"/><path d="M0 0h24v24z" style="fill:red" fill="url(https://example.com/p)"/><use href="#a"/></svg>';
    const clean = survey.sanitizeSvg(dirty);
    expect(clean.svg).toBe('<svg viewBox="0 0 24 24" aria-hidden="true"><use/><path d="M0 0h24v24z"/><use href="#a"/></svg>');
    expect(clean.removed).toEqual(expect.arrayContaining(['<script>', '<foreignobject>', '<image>', 'href="https://example.com/s.svg#a"', 'fill="url(https://example.com/p)"']));
    expect(survey.sanitizeSvg('<svg viewBox="0 0 1 1"><path d={shape} /></svg>').error).toBe('the SVG takes d from code');
    expect(survey.sanitizeSvg('<svg viewBox="0 0 1 1"><title>x</title></svg>').error).toBe('the SVG draws no shape');
  });

  it('embeds a small raster logo, and falls back to the square over the cap, from a package, or without a readable SVG', () => {
    const withImage = (bytes) => topApp({
      [HEADER]: (t) => t.replaceOrFail("import { AppLogoIcon } from '@/app/icons/AppLogoIcon';", "import logo from './logo.png';").replaceOrFail('<AppLogoIcon className={styles.mark} />', '<img className={styles.mark} src={logo} alt="" />'),
      'src-app/app/layout/logo.png': png(bytes),
    });
    const small = survey.survey(withImage(200));
    expect(small.brandMark.kind).toBe('raster');
    expect(small.brandMark.src).toMatch(/^data:image\/png;base64,/);
    expect(small.brandHtml).toContain(`<span class="d-logo"><img src="${small.brandMark.src}" alt=""></span>Example App`);
    const big = survey.survey(withImage(survey.RASTER_CAP + 1));
    expect([big.brandMark.kind, big.variants.brand]).toEqual(['logo', 'd-brand']);
    expect(big.brandMark.why).toMatch(/over the 16384 byte cap for an embedded image: drawn as the accent square$/);
    const pkg = survey.survey(topApp({ [HEADER]: (t) => t.replaceOrFail("'@/app/icons/AppLogoIcon'", "'@example/brand'") }));
    expect(pkg.brandMark.why).toMatch(/from @example\/brand, outside the app: drawn as the accent square$/);
    const coded = survey.survey(topApp({ [ICON]: (t) => t.replaceOrFail('viewBox="0 0 32 32"', 'viewBox={box}') }));
    expect(coded.brandMark).toEqual(expect.objectContaining({ kind: 'logo' }));
    expect(coded.brandMark.why).toMatch(/cannot be inlined \(the SVG takes viewBox from code\): drawn as the accent square$/);
    expect(coded.look).not.toHaveProperty('mark-color');
  });

  it('finds the logo through a default import, and through an import of 2000 characters but not one longer', () => {
    const byDefault = survey.survey(topApp({
      [HEADER]: (t) => t.replaceOrFail("import { AppLogoIcon } from '@/app/icons/AppLogoIcon';", "import AppLogoIcon from '@/app/icons/AppLogoIcon';"),
      [ICON]: (t) => t.replaceOrFail('export const AppLogoIcon =', 'const AppLogoIcon =') + 'export default AppLogoIcon;\n',
    }));
    expect([byDefault.brandMark.kind, byDefault.brandMark.file]).toEqual(['svg', ICON]);
    // The import is read from after "import " for IMPORT_SPAN (2000) characters, up to the closing quote of its source.
    const tail = " } from '@/app/icons/AppLogoIcon'";
    const longImport = (span) => survey.survey(topApp({ [HEADER]: (t) => t.replaceOrFail("import { AppLogoIcon } from '@/app/icons/AppLogoIcon';", `import { AppLogoIcon,${' '.repeat(span - '{ AppLogoIcon,'.length - tail.length)}${tail};`) }));
    expect(longImport(2000).brandMark.kind).toBe('svg');
    expect(longImport(2001).brandMark).toEqual(expect.objectContaining({ kind: 'logo' }));
  });

  it('keeps a cleaned SVG of exactly the cap and refuses one byte more, an unclosed one and one with no size', () => {
    const shell = '<svg viewBox="0 0 1 1" aria-hidden="true"><path d=""/></svg>';
    const sized = (bytes) => survey.sanitizeSvg(`<svg viewBox="0 0 1 1"><path d="${'M'.repeat(bytes - shell.length)}"/></svg>`);
    expect(sized(survey.SVG_CAP).svg).toHaveLength(survey.SVG_CAP);
    expect(sized(survey.SVG_CAP + 1).error).toBe(`the cleaned SVG is ${survey.SVG_CAP + 1} bytes, over the ${survey.SVG_CAP} byte cap`);
    expect(survey.sanitizeSvg('<svg viewBox="0 0 1 1"><path d="M0 0"/>').error).toBe('the <svg> element is not closed');
    expect(survey.sanitizeSvg('<svg><path d="M0 0"/></svg>').error).toBe('the SVG has no viewBox and no width and height to make one');
    expect(survey.sanitizeSvg('<svg width={24} height="24"><path d="M0 0"/></svg>').svg).toBe('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M0 0"/></svg>');
    expect(survey.sanitizeSvg('<p>no drawing</p>').error).toBe('no <svg> element');
  });

  it('draws the accent square for a logo whose only drawing is a use of an address outside the page', () => {
    const hostile = survey.survey(topApp({ [ICON]: 'export const AppLogoIcon = () => (<svg viewBox="0 0 10 10"><a href="https://example.org"><rect onload="x()" width="1" height="1"/></a><use href="https://example.org/y"/></svg>);\n' }));
    expect(hostile.brandMark.kind).toBe('logo');
    expect(hostile.brandMark.why).toMatch(/cannot be inlined \(the SVG draws no shape\): drawn as the accent square$/);
    expect(survey.sanitizeSvg('<svg viewBox="0 0 1 1"><defs><path id="p" d="M0 0"/></defs><use href="#p"/></svg>').svg).toBe('<svg viewBox="0 0 1 1" aria-hidden="true"><defs><path id="p" d="M0 0"/></defs><use href="#p"/></svg>');
  });

  it('draws initials when the shell has no logo', () => {
    const plain = survey.survey(writeProposalApp(tempDir()));
    expect([plain.brandMark.kind, plain.brandMark.why, plain.brandHtml]).toEqual(['initials', 'no logo in src-app/app/layout: drawn as initials', '<span class="d-brand d-brand--initials"><span class="d-mark">TH</span>Team Hub</span>']);
  });
});

describe('the check on the logo, defined once', () => {
  const dir = path.join(skill, 'assets/proposals/account-settings/r1');
  const page = readFileSync(path.join(dir, 'proposal.html'), 'utf8');
  const saved = JSON.parse(readFileSync(path.join(dir, 'survey.json'), 'utf8'));
  const findings = (html, surveyJson = saved) => check.checkPage(html, { survey: surveyJson }).findings;
  const svg = saved.brandMark.svg;
  const inner = svg.replaceOrFail(/^<svg[^>]*>|<\/svg>$/g, '');
  const use = survey.BRAND_USE;
  const swapDefs = (from, to) => { expect(page.includes(from), from.slice(0, 60)).toBe(true); return page.replaceOrFail(from, to); };

  it('carries the logo once: one definition, every brand a use of it, with and without the survey', () => {
    expect(page.split(saved.brandDefs).length - 1).toBe(1);
    expect(page.split(use).length - 1).toBe(3);
    expect(page.split(inner).length - 1).toBe(1);
    expect(findings(page)).toEqual([]);
    expect(check.checkPage(page).findings).toEqual([]);
  });

  it.each([
    ['a script', '<path', '<script>alert(1)</script><path', 'holds <script>'],
    ['a handler', 'id="brand-mark"', 'id="brand-mark" onload="x()"', 'carries the attribute onload'],
    ['an outside reference', 'symbol id="brand-mark" viewBox="0 0 32 32" fill="currentColor"', 'symbol id="brand-mark" viewBox="0 0 32 32" fill="url(https://example.com/p)"', 'points outside the page or runs code'],
  ])('reports a definition with %s', (_, from, to, message) => {
    const defs = saved.brandDefs.replaceOrFail(from, to);
    const found = check.checkPage(page.replaceOrFail(saved.brandDefs, defs)).findings;
    expect(found.some((f) => f.startsWith('[mark]') && f.includes(message)), found.join('\n')).toBe(true);
  });

  it('reports a definition that is not the survey\'s, a use with no definition, the logo inlined again, a logo brand without it, and an image over the cap', () => {
    expect(findings(swapDefs(saved.brandDefs, saved.brandDefs.replaceOrFail('M10 10', 'M11 10')))).toContain('[mark] the logo definition differs from survey.json brandDefs; paste it as it is');
    expect(findings(swapDefs(saved.brandDefs, ''))).toContain('[mark] #draw-place: the logo (.d-logo) refers to #brand-mark, but the page does not define it; paste survey.json brandDefs once right after <body>');
    expect(findings(page.replaceOrFail(use, svg))).toContain('[mark] #draw-place: the logo (.d-logo) inlines the logo again; define it once (brandDefs) and paste brandHtml, which refers to it');
    expect(findings(page.replaceOrFail(use, use.replaceOrFail('#brand-mark', '#other')))).toContain('[mark] #draw-place: the logo (.d-logo) refers to something other than the logo defined once; paste brandHtml as it is');
    expect(findings(page.replaceOrFail(`<span class="d-logo">${use}</span>`, ''))).toContain('[mark] #draw-place: the brand has no logo (.d-logo); paste survey.json brandHtml as it is');
    const big = `<img src="data:image/png;base64,${Buffer.alloc(survey.RASTER_CAP + 3, 1).toString('base64')}" alt="">`;
    expect(check.checkPage(page.replaceOrFail(use, big)).findings).toContain(`[mark] #draw-place: the logo (.d-logo) image is over the ${survey.RASTER_CAP} byte cap; draw the accent square instead`);
  });

  it('still accepts an inlined logo checked against brandMark when the survey defines none', () => {
    const old = { ...saved, brandDefs: undefined };
    delete old.brandDefs;
    const inline = page.replaceOrFail(saved.brandDefs, '').split(use).join(svg);
    expect(findings(inline, old)).toEqual([]);
    expect(findings(inline.replaceOrFail(`<span class="d-logo">${svg}`, `<span class="d-logo">${svg.replaceOrFail('M10 10', 'M11 10')}`), old)).toContain('[mark] #draw-place: the logo (.d-logo) differs from the mark survey.json gives (brandMark); paste its brandHtml as it is');
  });
});

describe('the app name, the content column and the link addresses', () => {
  it('names the app from a title that holds "<"', () => {
    expect(survey.survey(topApp({ 'index.html': '<!doctype html><html><head><title>A < B &lt;X&gt;</title></head></html>\n' })).appName).toBe('A < B <X>');
  });

  it('names the app from its title when a character before it changes length in lower case', () => {
    expect(survey.survey(topApp({ 'index.html': '<!doctype html><html><head><!-- \u0130stanbul office --><title>My App</title></head></html>\n' })).appName).toBe('My App');
  });

  it('reads the content column as border-box from the app\'s global reset, and as content-box without one or when the column says so', () => {
    const column = (edit) => { const r = survey.survey(topApp(edit)); return [r.look.max, r.lookReal.max]; };
    expect(column({})).toEqual(['865px', '1112px']);
    expect(column({ 'src-app/app/globals.css': 'body { margin: 0; }\n' })).toEqual(['964px', '1240px']);
    expect(column({ 'src-app/app/globals.css': '.card { box-sizing: border-box; }\n' })).toEqual(['964px', '1240px']);
    // A reset inside @media, or in a stylesheet outside src-app and src-app/app, is not the app's global one.
    expect(column({ 'src-app/app/globals.css': '@media (min-width: 800px) { * { box-sizing: border-box; } }\n' })).toEqual(['964px', '1240px']);
    expect(column({ 'src-app/app/globals.css': 'body { margin: 0; }\n', 'src-app/mfe_packages/home-mfe/src/global.css': '* { box-sizing: border-box; }\n' })).toEqual(['964px', '1240px']);
    expect(column({ 'src-app/mfe_packages/home-mfe/src/screens/home/HomeScreen.module.css': (t) => t.replaceOrFail('.column { max-width: 1240px;', '.column { box-sizing: content-box; max-width: 1240px;') })).toEqual(['964px', '1240px']);
  });

  it('takes a route template as the link builder only where a link is built from it', () => {
    const side = (files) => {
      const root = writeProposalApp(tempDir());
      for (const [rel, text] of Object.entries(files)) writeFileSync(path.join(root, rel), text);
      return survey.survey(root);
    };
    const analytics = side({ 'src-app/app/layout/Analytics.tsx': 'export const track = (route: string) => `viewed:${route}`;\n' });
    expect(analytics.links.screens.map((x) => x.link)).toEqual(['/home', '/docs']);
    expect(analytics.links.mismatch).toBe(false);
    const nav = side({ 'src-app/app/layout/Go.tsx': 'export const go = (route: string) => navigate(`/app${route}`);\n' });
    expect(nav.links.screens.map((x) => x.link)).toEqual(['/app/home', '/app/docs']);
    const two = side({
      'src-app/app/layout/A.tsx': 'export const A = ({ route }) => <a href={`/a${route}`}>a</a>;\n',
      'src-app/app/layout/B.tsx': 'export const B = ({ route }) => <Link to={`/b${route}`}>b</Link>;\n',
    });
    expect(two.links.screens.map((x) => x.link)).toEqual(['unresolved', 'unresolved']);
    expect(two.links.templates).toEqual(['src-app/app/layout/A.tsx `/a${route}`', 'src-app/app/layout/B.tsx `/b${route}`']);
    expect(two.unresolved).toContain('links');
    const items = side({ 'src-app/app/layout/Items.tsx': 'export const items = (routes: string[]) => routes.map((route) => ({ href: `/?screen=${route}` }));\n' });
    expect(items.links.screens.map((x) => x.link)).toEqual(['/?screen=/home', '/?screen=/docs']);
    expect(items.links.mismatch).toBe(true);
    const to = side({ 'src-app/app/layout/Tabs.tsx': 'export const tabs = (route: string) => ({ to : `/t${route}` });\n' });
    expect(to.links.screens.map((x) => x.link)).toEqual(['/t/home', '/t/docs']);
    for (const [call, prefix] of [['history.push(', '/p'], ['location.assign(', '/s'], ['window.open(', '/o'], ['redirect(', '/r'], ['location.href = ', '/l'], ['window.location = ', '/w']]) {
      const built = side({ 'src-app/app/layout/Go.tsx': `export const go = (route: string) => ${call}\`${prefix}\${route}\`${call.endsWith('(') ? ')' : ''};\n` });
      expect(built.links.screens.map((x) => x.link), call).toEqual([`${prefix}/home`, `${prefix}/docs`]);
    }
  });

  it('reads a link template from a small helper named for addresses, and leaves a link form it cannot read unresolved', () => {
    const side = (files) => {
      const root = writeProposalApp(tempDir());
      for (const [rel, text] of Object.entries(files)) writeFileSync(path.join(root, rel), text);
      return survey.survey(root);
    };
    const helper = side({
      'src-app/app/layout/Menu.tsx': [
        'export const Menu = ({ items }) => {',
        '  const hrefFor = (route: string | undefined): string =>',
        "    route ? `/?screen=${route.replace(/^\\//, '')}` : '/';",
        '  return items.map((x) => <a href={hrefFor(x.route)}>{x.label}</a>);',
        '};',
        '',
      ].join('\n'),
    });
    expect(helper.links.screens.map((x) => x.link)).toEqual(['/?screen=home', '/?screen=docs']);
    expect(helper.links.mismatch).toBe(true);
    expect(helper.unresolved).not.toContain('links');
    const fn = side({ 'src-app/app/layout/Menu.tsx': 'function linkTo(route) { return `/app${route}`; }\nexport const Menu = ({ items }) => items.map((x) => <a href={linkTo(x.route)}>{x.label}</a>);\n' });
    expect(fn.links.screens.map((x) => x.link)).toEqual(['/app/home', '/app/docs']);
    // A helper whose name says nothing about addresses is not taken as the link form.
    const other = side({ 'src-app/app/layout/Menu.tsx': 'const labelFor = (route) => `screen ${route}`;\nexport const Menu = ({ items }) => items.map((x) => <a href={pick(x)} title={labelFor(x.route)}>{x.label}</a>);\n' });
    expect(other.links.screens.map((x) => x.link)).toEqual(['unresolved', 'unresolved']);
    expect(other.links.screens[0].source).toBe('link form not detected, check the menu code by hand: src-app/app/layout/Menu.tsx builds a link from code the survey does not read');
    expect(other.links.mismatch).toBe(false);
    expect(other.unresolved).toContain('links');
    const printed = survey.readable(other);
    expect(printed).toContain('Addresses the app\'s links carry (link form not detected, check the menu code by hand');
    expect(printed).not.toMatch(/^ {2}Home {2}\/home$/m);
    // A literal address is not a link form to read.
    expect(side({ 'src-app/app/layout/Logo.tsx': "export const Logo = () => <a href={'/'}>Home</a>;\n" }).links.screens.map((x) => x.link)).toEqual(['/home', '/docs']);
  });

  it('leaves menu entries built as objects from code unresolved, and a plain string in the object as it was', () => {
    const side = (files) => {
      const root = writeProposalApp(tempDir());
      for (const [rel, text] of Object.entries(files)) writeFileSync(path.join(root, rel), text);
      return survey.survey(root);
    };
    const notDetected = 'link form not detected, check the menu code by hand: src-app/app/layout/Items.tsx builds a link from code the survey does not read';
    for (const entry of ['{ label: route, href: makeHref(route) }', '{ label: route, to: makeHref(route) }', '{ label: route, href: `${base}/${route.slice(1)}` }']) {
      const built = side({ 'src-app/app/layout/Items.tsx': `export const items = (routes: string[]) => routes.map((route) => (${entry}));\n` });
      expect(built.links.screens.map((x) => x.link), entry).toEqual(['unresolved', 'unresolved']);
      expect(built.links.screens[0].source, entry).toBe(notDetected);
      expect(built.unresolved, entry).toContain('links');
    }
    const plain = side({ 'src-app/app/layout/Items.tsx': "export const items = [{ label: 'Home', href: '/home' }, { label: 'Docs', to: '/docs' }];\n" });
    expect(plain.links.screens.map((x) => x.link)).toEqual(['/home', '/docs']);
    expect(plain.unresolved).not.toContain('links');
  });

  it('does not let a readable link helper stand for a menu link built by another function', () => {
    const side = (files) => {
      const root = writeProposalApp(tempDir());
      for (const [rel, text] of Object.entries(files)) writeFileSync(path.join(root, rel), text);
      return survey.survey(root);
    };
    const masked = side({
      'src-app/app/layout/Menu.tsx': [
        'const hrefFor = (route) => `/old${route}`;',
        'export const Back = ({ route }) => <a href={hrefFor(route)}>Back</a>;',
        'export const Menu = ({ items }) => items.map((x) => <a href={makeMenuHref(x.route)}>{x.label}</a>);',
        '',
      ].join('\n'),
    });
    expect(masked.links.screens.map((x) => x.link)).toEqual(['unresolved', 'unresolved']);
    expect(masked.links.screens[0].source).toBe('link form not detected, check the menu code by hand: src-app/app/layout/Menu.tsx builds a link from code the survey does not read');
    expect(masked.unresolved).toContain('links');
    expect(survey.readable(masked)).not.toContain('/old/home');
    const objects = side({
      'src-app/app/layout/Menu.tsx': 'function linkTo(route) { return `/app${route}`; }\nexport const items = (routes) => routes.map((route) => ({ to: makeMenuHref(route) }));\n',
    });
    expect(objects.links.screens.map((x) => x.link)).toEqual(['unresolved', 'unresolved']);
  });
});

describe('the rules a stylesheet yields', () => {
  const HOME_CSS = 'src-app/mfe_packages/home-mfe/src/screens/home/HomeScreen.module.css';
  it.each([
    ['@import', '@import "a.css";'],
    ['@charset', '@charset "utf-8";'],
    ['@layer a;', '@layer a;'],
    ['@namespace', '@namespace x url(http://www.w3.org/2000/svg);'],
    ['@value', '@value x: 1px;'],
    ['url( in any case', '@import URL(a;b.css);'],
  ])('reads the .root rule after the at-statement %s as its own rule', (_, statement) => {
    const result = survey.survey(topApp({ [HOME_CSS]: (t) => `${statement}\n${t}` }));
    expect(result.lookFrom.bg).toBe(`${HOME_CSS} .root background-color`);
    expect(result.look.bg).toBe('#ffffff');
    expect(result.skipped).toEqual([]);
    expect(result.unresolved).not.toContain(`skipped ${HOME_CSS}`);
  });

  // The statement and the rule after it are read apart wherever they stand: a ';' inside the quoted string or the
  // url() of an at-statement is no end, an at-statement inside a @media block ends at its own ';', and a stray ';'
  // between rules is no rule either. .kpi is a selector no rule of the fixture holds, so the rule read is the one
  // the look takes.
  it.each([
    ['an at-statement inside a @media block', '@media (min-width: 600px) { @layer base; .kpi { font-size: 33px; } }', 'stat', `${HOME_CSS} .kpi (from 600 px) font-size`, '26px'],
    ['a ";" inside the url() of an at-statement', '@import url("a;b.css"); .kpi { font-size: 33px; }', 'stat', `${HOME_CSS} .kpi font-size`, '26px'],
    ['a ";" inside the string of an at-statement', '@supports (content: ";.root") { .root { background-color: #000000; } }', 'bg', `${HOME_CSS} .root background-color`, '#ffffff'],
    ['a stray ";" between rules', '.kpi {} ; @import "x"; .kpi { font-size: 33px; }', 'stat', `${HOME_CSS} .kpi font-size`, '26px'],
  ])('reads the rules around %s as their own rules', (_, before, key, from, value) => {
    const result = survey.survey(topApp({ [HOME_CSS]: (t) => `${before}\n${t}` }));
    expect(result.skipped).toEqual([]);
    expect(result.unresolved).not.toContain(`skipped ${HOME_CSS}`);
    expect(result.lookFrom[key], before).toBe(from);
    expect(result.look[key], before).toBe(value);
  });

  // A quoted string of an at-statement also ends at an unescaped newline, as a bad string: the file reads on from
  // there. A quote inside the unquoted url() of an at-statement opens no string, so the ")" ends it and the statement
  // ends at its ";". A file that ends inside a string or url() of an at-statement is listed under skipped.
  it.each([
    ['an at-statement whose string no newline closes', '@import "a.css\n; .x{color:red} .y{color:blue}'],
    ['an at-statement whose unquoted url() holds a quote', '@import url(a"b); .x{color:red} .y{color:blue}'],
  ])('reads the rules after %s as their own rules', (_, before) => {
    const result = survey.survey(topApp({ [HOME_CSS]: (t) => `${before}\n${t}` }));
    expect(result.skipped).toEqual([]);
    expect(result.unresolved).not.toContain(`skipped ${HOME_CSS}`);
    expect(result.lookFrom.bg, before).toBe(`${HOME_CSS} .root background-color`);
    expect(result.look.bg, before).toBe('#ffffff');
  });

  it('lists a file that ends inside the url() of an at-statement under skipped with the reason', () => {
    const result = survey.survey(topApp({ [HOME_CSS]: '@import url(a.css' }));
    expect(result.skipped).toContainEqual(expect.objectContaining({
      file: HOME_CSS,
      why: expect.stringMatching(/^an unterminated string or url\(\) in an at-rule: the rest of the file is not read/),
    }));
    expect(result.unresolved).toContain(`skipped ${HOME_CSS}`);
  });

  it('keeps the rules of a @supports block out of the look where the string of the condition would have made a made-up rule of them', () => {
    const result = survey.survey(topApp({ [HOME_CSS]: (t) => `@supports (content: ";.kpi") { .kpi { font-size: 33px; } }\n${t}` }));
    expect(result.lookFrom.stat).toBe('kit --text-kpi-size (the app sets none)');
    expect(result.skipped).toEqual([]);
  });

  it('reads a kit chunk of rule-holding block at-rules whole: nothing is skipped or unresolved for it', () => {
    const root = writeTopApp(tempDir());
    const chunk = 'node_modules/@gears-frontx/ui-kit/dist/chunks/box.css';
    writeFileSync(path.join(root, chunk), '@container (min-width: 1px) { .a { color: red } }\n@supports (display: grid) { .b { color: blue } }\n');
    const result = survey.survey(root);
    expect(result.skipped).not.toContainEqual(expect.objectContaining({ file: chunk }));
    expect(result.unresolved).not.toContain(`skipped ${chunk}`);
  });

  it('reads the rules inside a rule-holding block at-rule as conditional: the top-level rule wins the look', () => {
    const result = survey.survey(topApp({ [HOME_CSS]: (t) => `@layer a { .root { background-color: #000000; } }\n${t}` }));
    expect(result.skipped).toEqual([]);
    expect(result.unresolved).not.toContain(`skipped ${HOME_CSS}`);
    expect(result.look.bg).toBe('#ffffff');
    expect(result.lookFrom.bg).toBe(`${HOME_CSS} .root background-color`);
  });

  it.each([
    ['@supports with no space before the condition', '@supports(display:grid){ .root { background-color: #000000; } }'],
    ['@SUPPORTS in upper case', '@SUPPORTS (display: grid) { .root { background-color: #000000; } }'],
  ])('reads %s as a rule-holding block at-rule: its .root stays out of the look', (_, block) => {
    const result = survey.survey(topApp({ [HOME_CSS]: (t) => `${block}\n${t}` }));
    expect(result.skipped).toEqual([]);
    expect(result.unresolved).not.toContain(`skipped ${HOME_CSS}`);
    expect(result.look.bg).toBe('#ffffff');
    expect(result.lookFrom.bg).toBe(`${HOME_CSS} .root background-color`);
  });

  it('lists no skipped entry for a block at-rule that holds no style rules, and reads the rule after it', () => {
    const result = survey.survey(topApp({
      [HOME_CSS]: (t) => `@keyframes pulse { from { opacity: 0 } to { opacity: 1 } }\n@font-face { font-family: X; src: local(X); }\n${t}`,
    }));
    expect(result.skipped).not.toContainEqual(expect.objectContaining({ file: HOME_CSS }));
    expect(result.unresolved).not.toContain(`skipped ${HOME_CSS}`);
    expect(result.lookFrom.bg).toBe(`${HOME_CSS} .root background-color`);
    expect(result.look.bg).toBe('#ffffff');
  });

  it('reads a length it cannot parse as unknown, like any other unreadable length', () => {
    const at = (value) => survey.survey(topApp({ [HOME_CSS]: (t) => t.replaceOrFail('.column { max-width: 1240px;', `.column { max-width: ${value};`) }));
    for (const value of ['1.2.3px', '1.2.3rem', '..5px', `${'9'.repeat(400)}px`]) {
      const result = at(value);
      expect(result.look.max, value).toBe('unresolved');
      // A malformed number is not a number that is not a length: it is unknown, and the source says so once.
      expect(result.lookFrom.max, value).toBe(`${HOME_CSS} .column max-width: a value the survey cannot resolve`);
    }
  });
});

describe('the active tab text', () => {
  it('takes the app\'s colour for the active tab, and the kit\'s when the app sets none', () => {
    const result = survey.survey(topApp());
    expect(result.look['tab-active']).toBe('#2f6fd6');
    expect(result.lookFrom['tab-active']).toMatch(/DocsScreen\.module\.css \.tabsList \.tabTrigger\[data-active\] color$/);
    expect(result.appOverKit).toContainEqual(expect.objectContaining({ key: 'tab-active', app: '#2f6fd6', kit: '#0f172a' }));
    const css = 'src-app/mfe_packages/docs-mfe/src/screens/docs/DocsScreen.module.css';
    const plain = survey.survey(topApp({ [css]: (t) => t.replaceOrFail(/\.tabsList \.tabTrigger\[data-active\] \{[^}]*\}/, '') }));
    expect([plain.look['tab-active'], plain.lookFrom['tab-active']]).toEqual(['#0f172a', 'kit --secondary-foreground (the app sets none)']);
  });

  it('draw.css colours the active tab with --d-tab-active, the kit text colour by default', () => {
    const css = readFileSync(path.join(skill, 'templates/draw/draw.css'), 'utf8');
    expect(css).toMatch(/\.d-tab--active \{ color: var\(--d-tab-active\);/);
    expect(css).toMatch(/--d-tab-active: #0f172a;/);
  });
});

describe('the side-by-side strip', () => {
  const html = readFileSync(path.join(skill, 'templates/proposal.html'), 'utf8');
  const source = html.match(/ {2}const STRIP_MIN_SCALE = [\d.]+;\n[\s\S]*?\n {2}function stripFit[\s\S]*?\n {2}\}\n/)?.[0];
  if (!source) throw new Error('templates/proposal.html: STRIP_MIN_SCALE and stripFit() not found in the frame script');
  const MIN = Number(/const STRIP_MIN_SCALE = ([\d.]+);/.exec(source)[1]);
  const stripFit = new Function(`${source}; return stripFit;`)();

  it('keeps the cells side by side at one scale when the widest region fits readably', () => {
    expect(stripFit(1192, 12, 2, [300, 360, 320])).toEqual({ stacked: false, scale: 1, cell: (1192 - 24) / 3 - 2 });
    const fit = stripFit(1192, 12, 2, [500, 600, 560]);
    expect(fit.stacked).toBe(false);
    expect(fit.scale).toBeCloseTo(387.33 / 600, 3);
  });

  it('stacks to one column when the cells would be too small to read, fitted to the strip width', () => {
    expect(stripFit(1192, 12, 2, [1012, 1012, 1012])).toEqual({ stacked: true, scale: 1, cell: 1190 });
    const narrow = stripFit(700, 12, 2, [1012, 640]);
    expect(narrow.stacked).toBe(true);
    expect(narrow.scale).toBeCloseTo(698 / 1012, 5);
  });

  it('never crops a region horizontally', () => {
    for (const width of [480, 700, 900, 1192, 1400]) {
      for (const regions of [[1012, 1012, 1012], [300, 1012], [200, 260, 240], [640, 980, 400], [1500]]) {
        const fit = stripFit(width, 12, 2, regions);
        for (const r of regions) expect(r * fit.scale).toBeLessThanOrEqual(fit.cell + 1e-9);
        expect(fit.stacked || fit.scale >= MIN || regions.length === 1).toBe(true);
      }
    }
  });
});
