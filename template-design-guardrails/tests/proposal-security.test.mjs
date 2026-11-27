/**
 * The frontx-design-proposal skill treats the surveyed project and the
 * person's words as untrusted:
 * - survey-app.mjs copies a value into the page only when it fits its kind
 *   (colour, length, font family list, weight, text case) and lists the rest
 *   as dropped; it embeds a logo only from a regular file inside the project
 *   whose first bytes match its extension; it reads no file and lists no
 *   folder through a link out of the project, and names nothing in such a
 *   folder; its folder walk does not follow symbolic links and lists one that
 *   leads to a folder; it counts only a text id of the list of registered
 *   screens; it judges an svg
 *   value with its character references decoded; it lists every file it
 *   meant to read and did not (over its cap, a link to nothing, a file where
 *   a folder is expected, a folder out of the project, an empty manifest, a
 *   manifest that does not parse or has the wrong shape) as skipped and
 *   unresolved, never stopping;
 *   it counts a screen with no label or no folder as unresolved, lists only
 *   the CSS it read as a look source, says when --out cannot be written,
 *   cleans an SVG in linear time with at most SVG_ATTR_CAP attributes a tag
 *   and at most SVG_USE_CAP <use> elements, whose nested expansion no page
 *   needs; it resolves a value's var() references once per name in one
 *   resolution and resolves no value over RESOLVE_CAP characters, so a theme
 *   of var() fan-out costs bounded work and a huge value is unknown;
 *   it decodes the app name once, reports a project root it cannot list as
 *   an input error and lists an unreadable file or folder under skipped;
 * - check-proposal.mjs refuses what would load or run anything: addresses out
 *   of the page in any attribute (a link that navigates, downloads or opens
 *   another program included), an attribute that moves the base of addresses
 *   (xml:base), event handlers, javascript:, CSS that loads
 *   in any case or through escapes, embedding and animation elements, a meta
 *   refresh, a style block closed in upper case, and a missing, doubled,
 *   misplaced or changed Content-Security-Policy; it reads CSS only where a
 *   browser does (style blocks and attributes, svg presentation attributes); it
 *   compares id, name, class and data-* values with their character references
 *   decoded, as the browser and the page script read them; it
 *   checks the page id, the revision and the size of each record file, and
 *   reads no survey.json or CHOICE.md that is a symbolic link;
 * - the skeleton's Content-Security-Policy allows exactly its two scripts.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, cpSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import './replace-or-fail.mjs';
import { writeProposalApp, writeTopApp } from './proposal-fixture.mjs';
import { expectLinear } from './linear-time.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const skill = path.join(here, '../.frontx/ai/@gears-frontx/template-design-guardrails/skills/frontx-design-proposal');
const survey = await import(pathToFileURL(path.join(skill, 'scripts/survey-app.mjs')).href);
const check = await import(pathToFileURL(path.join(skill, 'scripts/check-proposal.mjs')).href);

const temps = [];
const locked = [];
const tempDir = () => { const dir = mkdtempSync(path.join(tmpdir(), 'fx-proposal-sec-')); temps.push(dir); return dir; };
// Removing every project written below can take long on a loaded machine.
afterAll(() => {
  for (const dir of locked) chmodSync(dir, 0o755);
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
}, 120_000);
const edit = (root, rel, change) => {
  const file = path.join(root, rel);
  writeFileSync(file, typeof change === 'function' ? change(readFileSync(file, 'utf8')) : change);
  return root;
};
const silent = () => { const out = []; return { out, io: { log: (l) => out.push(l), error: (l) => out.push(l) } }; };
// Each case below writes a project or a record folder and runs a script on it: about a second when the machine is idle,
// many more on a loaded runner, so these blocks wait longer than the default five seconds. The cases at the size caps
// and the scaling cases do more work and wait longer still (CAP_TIMEOUT, SCALE_TIMEOUT).
const SURVEY_TIMEOUT = 60_000;
const CAP_TIMEOUT = 180_000;
const SCALE_TIMEOUT = 600_000;
const HOME_CSS = 'src-app/mfe_packages/home-mfe/src/screens/home/HomeScreen.module.css';
const HEADER = 'src-app/app/layout/Header.tsx';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// The characters no terminal output of the survey may carry raw: controls, bidirectional controls, separators.
const RAW = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\u2028\u2029\ufeff]/;
const withLogo = (root, spec) => edit(root, HEADER, (t) => t.replaceOrFail("import { AppLogoIcon } from '@/app/icons/AppLogoIcon';", `import logo from '${spec}';`).replaceOrFail('<AppLogoIcon className={styles.mark} />', '<img className={styles.mark} src={logo} alt="" />'));

describe('survey-app.mjs copies only values that fit their kind', { timeout: SURVEY_TIMEOUT }, () => {
  it('drops a page value that would close the style block, and says so', () => {
    const root = edit(writeTopApp(tempDir()), HOME_CSS, (t) => t.replaceOrFail('background-color: #ffffff;', 'background-color: </style><script>alert(document.domain)</script>;'));
    const result = survey.survey(root);
    expect(result.look).not.toHaveProperty('bg');
    expect(result.dropped).toContainEqual(expect.objectContaining({ key: 'look.bg', why: 'not a colour the drawing can take' }));
    expect(result.appLookCss).not.toMatch(/[<>]/);
    expect(result.unresolved).toContain('look.bg');
    expect(survey.readable(result)).toContain('Dropped, not written to the page: look.bg');
  });

  it('drops a theme value that would open a new rule and load from the network', () => {
    const root = edit(writeProposalApp(tempDir()), 'src-app/app/themes/default.ts', (t) => t.replaceOrFail("'--left-menu': 'var(--foreground)'", "'--left-menu': 'red} .d-app{background:url(https://attacker.example/p.png)'"));
    const result = survey.survey(root);
    expect(result.look).not.toHaveProperty('nav-bg');
    expect(result.dropped.map((d) => d.key)).toEqual(['look.nav-bg']);
    for (const line of result.appLookCss.split('\n').slice(1, -1)) expect(line).toMatch(/^ {2}--d-[\w-]+: [^;{}<>]+;$/);
  });

  it('drops a band whose colour is not a colour, keeping the other band', () => {
    const root = edit(writeTopApp(tempDir()), HOME_CSS, (t) => t.replaceOrFail('.closing { background-color: #1d2433;', '.closing { background-color: expression(alert(1));'));
    const result = survey.survey(root);
    expect(result.screenLooks[0].bands.map((b) => b.name)).toEqual(['.hero']);
    expect(result.dropped).toContainEqual(expect.objectContaining({ key: 'screenLooks.Home.band', why: 'not a colour the drawing can take' }));
  });

  it.each([
    ['colour', 'accent', ['#2f6fd6', '#fff', '#ffff', '#2f6fd680', 'rebeccapurple', 'transparent', 'currentColor', 'color-mix(in oklab, #ffffff 70%, #1d2433)', 'rgb(0 0 0 / 50%)', 'color(display-p3 1 0 0 / 0.5)', 'hsl(210deg 40% 50%)', 'oklch(0.7 0.1 200 / 0.5)', 'color-mix(in srgb, red 40%, #fff)', 'rgba(0,0,0,.5)', 'color-mix(in oklch longer hue, oklch(0.7 0.1 200) 30%, white)'],
      ['url(x)', 'red;}', 'image-set(a 1x)', 'rgb(0,0,0', 'etc/passwd', 'a.b/c', 'secretword', 'Highlight', 'color(/Users/owner/secrets.txt)', 'rgb(a.b/c)', 'color(srgb etc/passwd)', 'color-mix(in srgb, secret-word, red)', 'rgb(0 0 0 / / 1)', 'rgb(1px2)', 'rgb(192.168.0.1)', 'rgb(1%2 0 0)', 'color-mix(in srgb, #fff#000 50%, red)', 'rgb(in 0 0 0)', 'color(srgb 1 0 0 /)', '#12345', '#1234567', 'color-mix(in srgb, #12345 50%, red)', 'rgb()', 'rgb(,1,,)', 'rgb(1,,2)', 'rgb(1,2,)', 'rgb(,1 2 3)', `rgb(${'1 '.repeat(100)})`]],
    ['length', 'h1', ['37px', '1.25rem', '-0.02em', '0', 'normal'], ['37px;', 'calc(1px)', '10vw', '1e3px', `${'1'.repeat(500)}.5`]],
    ['font family list', 'font', ["'Inter', ui-sans-serif, sans-serif", `${'a,'.repeat(149)}ab`], ["'Inter", 'a; b', 'url(x)', `${'a,'.repeat(150)}a`]],
    ['weight', 'h1-weight', ['600', 'bold'], ['650', '600 !important']],
    ['text case', 'th-case', ['uppercase', 'none'], ['upper']],
  ])('takes a %s only in its allowed forms', (_, key, good, bad) => {
    for (const v of good) expect(survey.lookValueFits(key, v), v).toBe(true);
    for (const v of bad) expect(survey.lookValueFits(key, v), v).toBe(false);
  });

  it('decodes the app name once, so the page shows one &amp;', () => {
    const root = edit(writeProposalApp(tempDir()), 'index.html', '<title>Tom &amp; Jerry &lt;3</title>');
    const result = survey.survey(root);
    expect(result.appName).toBe('Tom & Jerry <3');
    expect(result.brandHtml).toContain('Tom &amp; Jerry &lt;3</span>');
  });
});

describe('survey-app.mjs resolves var() values in bounded time and size', { timeout: SURVEY_TIMEOUT }, () => {
  const cpuMs = () => { const { user, system } = process.cpuUsage(); return (user + system) / 1000; };
  // A theme under a kilobyte: each value holds k var() calls of the next value, 9 levels deep (under the depth cap),
  // the leaf a length. The .root bridge of the page CSS carries it into the look through --primary (the accent token,
  // which no page rule of its own overrides).
  const fanRoot = (k, levels) => {
    const decls = ['--primary: var(--v0);'];
    for (let l = 0; l < levels - 1; l += 1) decls.push(`--v${l}: ${Array.from({ length: k }, () => `var(--v${l + 1})`).join(' ')};`);
    decls.push(`--v${levels - 1}: 1px;`);
    return edit(writeTopApp(tempDir()), HOME_CSS, (t) => `.root {\n  ${decls.join('\n  ')}\n}\n${t}`);
  };

  it('resolves a small fan-out as before: the value comes out and is refused only for its kind', () => {
    const result = survey.survey(fanRoot(2, 9));
    expect(result.dropped).toContainEqual(expect.objectContaining({ key: 'look.accent', why: 'not a colour the drawing can take' }));
    expect(result.unresolved).toContain('look.accent');
  });

  it('surveys a fan-out of 8 var() calls per value, 9 levels deep, in bounded time', () => {
    const root = fanRoot(8, 9);
    const start = cpuMs();
    const result = survey.survey(root);
    const spent = cpuMs() - start;
    expect(result.unresolved).toContain('look.accent');
    // The old resolution redid every var() once per appearance: several seconds of CPU time here. A name is now
    // resolved once and a value is refused over RESOLVE_CAP characters, so the same input stays far under the bound.
    expect(spent, `the survey took ${spent.toFixed(0)} ms of CPU time on a 9 level, 8 wide var() fan-out`).toBeLessThan(500);
  });

  // A null the depth cap produced deep in one value must not stick to the name: the same name may still resolve in a
  // shallower frame of the same resolution, as it did at e3d6621. The chain runs one name shorter than the deepest
  // one the survey resolves: the survey reads the token one frame deeper than a bare resolution of the value does.
  it('resolves a name the depth cap refused deeper in the same value when a shallower frame reaches it', () => {
    const decls = ['--a: var(--x1);', ...Array.from({ length: 9 }, (_, i) => `--x${i + 1}: var(--x${i + 2});`), '--x10: var(--b);', '--b: var(--leaf);', '--leaf: #ff0000;', '--primary: var(--a, 1px) var(--b);'];
    const root = edit(writeTopApp(tempDir()), HOME_CSS, (t) => `.root {\n  ${decls.join('\n  ')}\n}\n${t}`);
    const result = survey.survey(root);
    expect(result.dropped).toContainEqual(expect.objectContaining({ key: 'look.accent', value: '1px #ff0000' }));
    expect(result.unresolved).toContain('look.accent');
  });

  // The leaf resolves to the empty string, so RESOLVE_CAP never fires: only the per-name cache keeps the fan-out
  // from being resolved once per path through it.
  it('surveys a fan-out whose leaf resolves to the empty string in bounded time', () => {
    const decls = ['--primary: var(--v0);', ...Array.from({ length: 8 }, (_, l) => `--v${l}: ${Array.from({ length: 8 }, () => `var(--v${l + 1})`).join(' ')};`), '--v8: var(--nothing, );'];
    const root = edit(writeTopApp(tempDir()), HOME_CSS, (t) => `.root {\n  ${decls.join('\n  ')}\n}\n${t}`);
    const start = cpuMs();
    const result = survey.survey(root);
    const spent = cpuMs() - start;
    expect(result.unresolved).toContain('look.accent');
    expect(spent, `the survey took ${spent.toFixed(0)} ms of CPU time on a 9 level, 8 wide fan-out with an empty leaf`).toBeLessThan(500);
  });

  // A leaf no lookup resolves leaves every level null: caching only resolved values would redo the whole fan-out
  // once per path, so a null is cached too, for the depth it failed at. Each level holds the same next name eight
  // times with an empty fallback and one bare var(--gone): the level still resolves to null, but the empty fallback
  // keeps the resolution walking down, so the fixture really fans out eight wide per level.
  it('surveys a fan-out whose leaves no lookup resolves in bounded time', () => {
    const decls = ['--primary: var(--u0);', ...Array.from({ length: 8 }, (_, l) => `--u${l}: ${Array.from({ length: 8 }, () => `var(--u${l + 1}, )`).join(' ')} var(--gone);`)];
    const root = edit(writeTopApp(tempDir()), HOME_CSS, (t) => `.root {\n  ${decls.join('\n  ')}\n}\n${t}`);
    const start = cpuMs();
    const result = survey.survey(root);
    const spent = cpuMs() - start;
    expect(result.unresolved).toContain('look.accent');
    expect(spent, `the survey took ${spent.toFixed(0)} ms of CPU time on an 8 level, 8 wide fan-out whose every level is null`).toBeLessThan(500);
  });

  it('resolves no value over the output cap: it is unknown, not a refused value', () => {
    const root = edit(writeTopApp(tempDir()), HOME_CSS, (t) => `.root { --primary: ${'1px '.repeat(2000)}; }\n${t}`);
    const result = survey.survey(root);
    expect(result.unresolved).toContain('look.accent');
    expect(result.dropped.map((d) => d.key)).not.toContain('look.accent');
  });
});

describe('survey-app.mjs embeds a logo only from inside the project', { timeout: SURVEY_TIMEOUT }, () => {
  // A symbolic link needs extra rights on Windows; the chmod tests below skip it for the same kind of reason.
  it.skipIf(process.platform === 'win32')('refuses a logo that is a link to a file outside the project, and embeds none of it', () => {
    const outside = path.join(tempDir(), 'secret.png');
    writeFileSync(outside, Buffer.concat([PNG, Buffer.from('TOP SECRET token=abc123')]));
    const root = withLogo(writeTopApp(tempDir()), './logo.png');
    symlinkSync(outside, path.join(root, 'src-app/app/layout/logo.png'));
    const result = survey.survey(root);
    expect(result.brandMark.kind).toBe('logo');
    expect(result.brandMark.why).toMatch(/is a link to a file outside the project: drawn as the accent square$/);
    expect(JSON.stringify(result)).not.toContain('data:image');
  });

  it.skipIf(process.platform === 'win32')('refuses a logo with more than one hard link, and embeds none of it', () => {
    const outside = path.join(tempDir(), 'secret.png');
    writeFileSync(outside, Buffer.concat([PNG, Buffer.from('TOP SECRET token=abc123')]));
    const root = withLogo(writeTopApp(tempDir()), './logo.png');
    linkSync(outside, path.join(root, 'src-app/app/layout/logo.png'));
    const result = survey.survey(root);
    expect(result.brandMark.kind).toBe('logo');
    expect(result.brandMark.why).toMatch(/is a file with more than one hard link, which the survey does not read: drawn as the accent square$/);
    expect(JSON.stringify(result)).not.toContain('data:image');
  });

  it.each([
    ['a .png that is text', './logo.png', 'logo.png', Buffer.from('not an image at all'), /is not a png image: its first bytes say otherwise/],
    ['an .svg that is no SVG', './logo.svg', 'logo.svg', Buffer.from('<html><script>x</script></html>'), /is named \.svg but does not start with an <svg> element/],
  ])('refuses %s', (_, spec, name, bytes, why) => {
    const root = withLogo(writeTopApp(tempDir()), spec);
    writeFileSync(path.join(root, 'src-app/app/layout', name), bytes);
    const result = survey.survey(root);
    expect(result.brandMark.kind).toBe('logo');
    expect(result.brandMark.why).toMatch(why);
  });

  it('embeds an image of exactly the cap and refuses one byte more, before reading it', () => {
    const at = (bytes) => {
      const root = withLogo(writeTopApp(tempDir()), './logo.png');
      writeFileSync(path.join(root, 'src-app/app/layout/logo.png'), Buffer.concat([PNG, Buffer.alloc(bytes - PNG.length, 1)]));
      return survey.survey(root).brandMark;
    };
    expect(at(survey.RASTER_CAP).kind).toBe('raster');
    expect(at(survey.RASTER_CAP + 1).why).toMatch(/is a 16385 byte image, over the 16384 byte cap/);
  }, CAP_TIMEOUT);

  it('gives the logo definition the one id brand-mark', () => {
    const defs = survey.brandDefs({ kind: 'svg', svg: '<svg id="logo" viewBox="0 0 1 1" aria-hidden="true"><path d="M0 0h1v1z"/></svg>' });
    expect(defs).toBe('<svg class="brand-defs" aria-hidden="true"><symbol id="brand-mark" viewBox="0 0 1 1"><path d="M0 0h1v1z"/></symbol></svg>');
  });

  it.each([
    ['url( behind a decimal reference', 'fill', 'u&#114;l(//host/x#a)'],
    ['url( behind a hexadecimal reference', 'fill', '&#x75;rl(https://host/x)'],
    ['an address behind a reference', 'href', '&#104;ttps://host/x'],
    ['a reference the survey does not decode', 'fill', 'url&lpar;//host/x)'],
    ['a reference written twice', 'fill', 'u&amp;#114;l(//host/x)'],
    // A presentation attribute is read as CSS, where a backslash escape spells any name. The escapes before a "(" are
    // also refused by the function look-back; the escape with no "(" only by the backslash rule.
    ['a CSS escape with no function', 'fill', 'r\\65 d'],
    ['url( spelled with a hexadecimal CSS escape', 'fill', 'u\\72 l(https://h/x)'],
    ['url( spelled with an escape at its start', 'fill', '\\75 rl(https://h/x)'],
    ['url( spelled with an escaped letter', 'fill', 'u\\rl(https://h/x)'],
    ['url( spelled with a long escape', 'clip-path', '\\000075rl(https://h/x#a)'],
    ['a mask behind a CSS escape', 'mask', 'u\\72 l(https://h/x.png)'],
    ['a mask from image-set()', 'mask', 'image-set(&quot;https://h/x.png&quot; 1x)'],
    ['url( behind a CSS escape to a host', 'fill', 'u\\72 l(//host/x)'],
    ['a function the attribute does not take', 'clip-path', 'var(--x)'],
    ['a custom property with a fallback that loads', 'fill', 'var(--x, url(//h/x))'],
    ['a custom property with a fallback', 'stroke', 'var(--x,red)'],
    ['a custom property without its dashes', 'fill', 'var(x)'],
    ['an address with a space after the fragment', 'href', '#zoom '],
    ['an address with a control character after the fragment', 'href', '#zoom&#1;'],
    ['an address with a tab inside the fragment', 'href', '#zo\tom'],
    // A browser percent-decodes a fragment before it looks the id up.
    ['an address with a percent-encoded fragment', 'href', '#%7Aoom'],
    ['a fragment reference with a percent-encoded name', 'fill', 'url(#%7Aoom)'],
    ['a fragment reference in quotes with a percent-encoded name', 'clip-path', "url('#zo%6Fm')"],
    ['a colour function in a clip path', 'clip-path', 'rgb(0, 0, 0)'],
    ['a transform in a fill', 'fill', 'rotate(45)'],
    ['url( to an address in quotes', 'fill', "url('https://h/x')"],
  ])('reads an svg value as a browser does and refuses %s', (_, name, value) => {
    expect(survey.safeSvgValue(name, value)).toBe(false);
    const clean = survey.sanitizeSvg(`<svg viewBox="0 0 1 1"><path d="M0 0" ${name}="${value}"/></svg>`);
    expect(clean.svg).toBe('<svg viewBox="0 0 1 1" aria-hidden="true"><path d="M0 0"/></svg>');
    expect(clean.removed).toEqual([`${name}="${value}"`]);
  });

  it('drops xml:base and the namespace attributes from a logo without naming them, so they never reach brandDefs', () => {
    const clean = survey.sanitizeSvg('<svg viewBox="0 0 1 1" xml:base="https://attacker.example/" xmlns:foo="http://www.w3.org/XML/1998/namespace"><use XML:BASE="https://attacker.example/b" href="#p"/><path id="p" d="M0 0" foo:base="https://attacker.example/c"/></svg>');
    expect(clean.svg).toBe('<svg viewBox="0 0 1 1" aria-hidden="true"><use href="#p"/><path id="p" d="M0 0"/></svg>');
    expect(clean.removed).toEqual(['foo:base']);
  });

  it('keeps an svg value with a fragment written through a reference', () => {
    expect(survey.safeSvgValue('fill', 'url(&#35;g)')).toBe(true);
    expect(survey.safeSvgValue('fill', 'url(#g)')).toBe(true);
  });

  it('keeps the functions a logo honestly uses: a gradient reference, a colour, a transform', () => {
    const logo = '<svg viewBox="0 0 10 10"><defs><linearGradient id="g" gradientTransform="rotate(90)"><stop offset="0" stop-color="rgba(0, 0, 0, 0.5)"/></linearGradient></defs>'
      + '<path d="M0 0h10v10z" fill="url(#g)" stroke="rgb(1, 2, 3)" transform="translate(1 2) scale(0.5) skewX(3)"/><circle r="1" fill="hsl(10 20% 30%)" clip-path="url( \'#g\')"/></svg>';
    const clean = survey.sanitizeSvg(logo);
    expect(clean.removed).toEqual([]);
    expect(clean.svg).toBe(logo.replace('viewBox="0 0 10 10">', 'viewBox="0 0 10 10" aria-hidden="true">'));
  });

  it('keeps a custom property of the app in a fill, a stroke or a stop colour', () => {
    const logo = '<svg viewBox="0 0 10 10"><defs><linearGradient id="g"><stop offset="0" stop-color="var(--color-y)"/></linearGradient></defs>'
      + '<path d="M0 0h10v10z" fill="var(--brand)" stroke="var( --muted-foreground )"/></svg>';
    const clean = survey.sanitizeSvg(logo);
    expect(clean.removed).toEqual([]);
    expect(clean.svg).toBe(logo.replace('viewBox="0 0 10 10">', 'viewBox="0 0 10 10" aria-hidden="true">'));
  });

  it('drops a reference to an id of the page that the logo does not define, and says why', () => {
    const why = '(it names an element of the page, which the logo does not define)';
    const clean = survey.sanitizeSvg('<svg viewBox="0 0 1 1"><path d="M0 0" fill="url(#zoom)"/><use href="#answer-form"/><path d="M1 1" stroke="url(#mine)"/><linearGradient id="mine"/></svg>');
    expect(clean.svg).toBe('<svg viewBox="0 0 1 1" aria-hidden="true"><path d="M0 0"/><use/><path d="M1 1" stroke="url(#mine)"/><linearGradient id="mine"/></svg>');
    expect(clean.removed).toEqual([`fill="url(#zoom)" ${why}`, `href="#answer-form" ${why}`]);
    // A use whose address is dropped draws nothing.
    expect(survey.sanitizeSvg('<svg viewBox="0 0 1 1"><use href="#tip-0"/></svg>')).toEqual({ error: 'the SVG draws no shape' });
  });

  it('counts a use as a shape only when the logo itself defines what it points to', () => {
    expect(survey.sanitizeSvg('<svg viewBox="0 0 32 32"><use href="#page-thing"/></svg>')).toEqual({ error: 'the SVG draws no shape' });
    expect(survey.sanitizeSvg('<svg viewBox="0 0 1 1"><g id="mine"><path d="M0 0h1v1z"/></g><use href="#mine"/></svg>').svg).toBe('<svg viewBox="0 0 1 1" aria-hidden="true"><g id="mine"><path d="M0 0h1v1z"/></g><use href="#mine"/></svg>');
  });

  it.each([
    ['the root svg', '<svg id="a" viewBox="0 0 1 1"><use href="#a"/></svg>'],
    ['the use itself', '<svg viewBox="0 0 1 1"><use id="u" href="#u"/></svg>'],
    ['a group holding the use', '<svg viewBox="0 0 1 1"><g id="g"><use href="#g"/></g></svg>'],
    ['an empty group', '<svg viewBox="0 0 1 1"><defs><g id="g"/></defs><use href="#g"/></svg>'],
    ['an empty defs', '<svg viewBox="0 0 1 1"><defs id="d"></defs><use href="#d"/></svg>'],
  ])('counts no shape for a use of %s', (_, source) => {
    expect(survey.sanitizeSvg(source)).toEqual({ error: 'the SVG draws no shape' });
  });

  it('refuses an SVG with more uses than the cap holds, however small its source, and keeps a few uses', () => {
    // Each level is a group the level above draws 10 times: a browser expands level 3 into a thousand elements
    // and 10 levels into ten billion, while the source itself stays under the byte cap.
    const nested = (levels) => {
      let inner = '<g id="g0"><path d="M0 0h1v1z"/></g>';
      for (let l = 1; l <= levels; l += 1) inner = `${inner}<g id="g${l}">${Array.from({ length: 10 }, () => `<use href="#g${l - 1}"/>`).join('')}</g>`;
      return `<svg viewBox="0 0 1 1">${inner}</svg>`;
    };
    expect(survey.sanitizeSvg(nested(3)).error).toBe('the SVG holds more than 16 <use> elements');
    const at = (n) => `<svg viewBox="0 0 1 1"><defs><g id="g"><path d="M0 0h1v1z"/></g></defs>${'<use href="#g"/>'.repeat(n)}</svg>`;
    expect(survey.sanitizeSvg(at(16)).svg).toBe(at(16).replace('viewBox="0 0 1 1">', 'viewBox="0 0 1 1" aria-hidden="true">'));
    expect(survey.sanitizeSvg(at(17)).error).toBe('the SVG holds more than 16 <use> elements');
    const few = '<svg viewBox="0 0 1 1"><defs><g id="g"><path d="M0 0h1v1z"/></g></defs><use href="#g"/><use href="#g"/></svg>';
    expect(survey.sanitizeSvg(few).svg).toBe(few.replace('viewBox="0 0 1 1">', 'viewBox="0 0 1 1" aria-hidden="true">'));
  });

  // The path is a shape of its own; the use row proves the use of a group or symbol that holds one is not refused.
  it.each([
    ['a group holding a path', '<svg viewBox="0 0 1 1"><defs><g id="g"><path d="M0 0h1v1z"/></g></defs><use href="#g"/></svg>'],
    ['a symbol holding a path', '<svg viewBox="0 0 1 1"><symbol id="s" viewBox="0 0 1 1"><path d="M0 0h1v1z"/></symbol><use href="#s"/></svg>'],
  ])('keeps the use of %s', (_, source) => {
    expect(survey.sanitizeSvg(source).svg).toBe(source.replace('viewBox="0 0 1 1">', 'viewBox="0 0 1 1" aria-hidden="true">'));
  });

  it('names the class, style and event handler attributes it drops, and drops the rest of its list quietly', () => {
    const clean = survey.sanitizeSvg('<svg viewBox="0 0 1 1" class="logo" role="img" onload="x()"><path d="M0 0" style="fill:red" className={styles.mark} data-part="a"/></svg>');
    expect(clean.svg).toBe('<svg viewBox="0 0 1 1" aria-hidden="true"><path d="M0 0"/></svg>');
    expect([...clean.removed].sort()).toEqual(['class', 'onload', 'style']);
    // The same names when each comes only from code.
    const coded = survey.sanitizeSvg('<svg viewBox="0 0 1 1"><path d="M0 0" className={styles.mark} style={{ fill: color }} onClick={go}/></svg>');
    expect(coded.svg).toBe('<svg viewBox="0 0 1 1" aria-hidden="true"><path d="M0 0"/></svg>');
    expect([...coded.removed].sort()).toEqual(['class', 'onclick', 'style']);
  });

  // A copy of the script beside a changed skeleton: an id that starts with a filled part, or one whose family takes
  // every renamed name, must not keep the rename looking for a free name. The copy runs in a child process that is
  // ended after 10 s, so a rename that never ends fails here with a message and leaves no process behind.
  it.each([
    ['an id that starts with a filled part', '<i id="{{X}}"></i>', { svg: '<svg viewBox="0 0 1 1" aria-hidden="true"><clipPath id="mine"><rect width="1" height="1"/></clipPath><path d="M0 0" clip-path="url(#mine)"/></svg>', removed: [] }],
    ['a family that takes every renamed name', '<i id="logo-a"></i>', { error: 'an id of the SVG cannot be renamed apart from the ids of the page' }],
  ])('ends the rename on a skeleton with %s', async (_, extra, expected) => {
    const copy = tempDir();
    mkdirSync(path.join(copy, 'scripts'));
    mkdirSync(path.join(copy, 'templates'));
    cpSync(path.join(skill, 'scripts/survey-app.mjs'), path.join(copy, 'scripts/survey-app.mjs'));
    writeFileSync(path.join(copy, 'templates/proposal.html'), `${readFileSync(path.join(skill, 'templates/proposal.html'), 'utf8')}\n${extra}\n`);
    const id = expected.error ? 'zoom' : 'mine';
    const svg = `<svg viewBox="0 0 1 1"><clipPath id="${id}"><rect width="1" height="1"/></clipPath><path d="M0 0" clip-path="url(#${id})"/></svg>`;
    const code = `const m = await import(${JSON.stringify(pathToFileURL(path.join(copy, 'scripts/survey-app.mjs')).href)});\n`
      + `process.stdout.write(JSON.stringify(m.sanitizeSvg(${JSON.stringify(svg)})));`;
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', timeout: 30_000 });
    expect(run.signal, 'the rename did not end within 30 s').toBe(null);
    expect([run.status, run.stderr]).toEqual([0, '']);
    expect(JSON.parse(run.stdout)).toEqual(expected);
  });

  it('refuses a CSS escape in a JSX literal too', () => {
    const clean = survey.sanitizeSvg('<svg viewBox="0 0 1 1"><path d="M0 0" clipPath={"u\\72 l(https://h/x#a)"}/></svg>');
    expect(clean.svg).toBe('<svg viewBox="0 0 1 1" aria-hidden="true"><path d="M0 0"/></svg>');
    expect(clean.removed).toEqual(['clip-path="u\\72 l(https://h/x#a)"']);
  });

  it('renames an id of the logo that the page itself uses, and the references to it, so the logo cannot stand in for a page element', () => {
    const skeleton = readFileSync(path.join(skill, 'templates/proposal.html'), 'utf8');
    const pageIds = [...skeleton.matchAll(/\sid="([^"{.]+)"/g)].map((m) => m[1]);
    expect(pageIds).toEqual(expect.arrayContaining(['answer-form', 'answer-text', 'zoom', 'head']));
    for (const id of [...pageIds, 'brand-mark', 'option-c', 'q-7', 'draw-b-phone', 'screen-home', 'f-step', 'term-api', 'tip-0']) {
      const clean = survey.sanitizeSvg(`<svg viewBox="0 0 1 1"><clipPath id="${id}"><rect width="1" height="1"/></clipPath><path d="M0 0" clip-path="url(#${id})"/><use href="#${id}"/></svg>`);
      expect(clean.svg, id).toBe(`<svg viewBox="0 0 1 1" aria-hidden="true"><clipPath id="logo-${id}"><rect width="1" height="1"/></clipPath><path d="M0 0" clip-path="url(#logo-${id})"/><use href="#logo-${id}"/></svg>`);
    }
    // A reference written through a character reference follows the rename; an id the page does not use stays, and a
    // new name the logo already holds is not taken twice.
    const clean = survey.sanitizeSvg('<svg viewBox="0 0 1 1"><linearGradient id="answer&#45;form"/><linearGradient id="logo-answer-form"/><linearGradient id="mine"/>'
      + '<path d="M0 0" fill="url(&#35;answer-form)" stroke="url(#mine)"/><path d="M1 1" fill="url(#logo-answer-form)"/></svg>');
    expect(clean.svg).toBe('<svg viewBox="0 0 1 1" aria-hidden="true"><linearGradient id="logo-answer-form-2"/><linearGradient id="logo-answer-form"/><linearGradient id="mine"/>'
      + '<path d="M0 0" fill="url(#logo-answer-form-2)" stroke="url(#mine)"/><path d="M1 1" fill="url(#logo-answer-form)"/></svg>');
  });

  // Each file is a component that renders an image imported from the next one; the header imports the first.
  const LAYOUT = 'src-app/app/layout';
  const logoChain = (files) => {
    const root = withLogo(writeTopApp(tempDir()), `./${files[0][0]}`);
    for (const [name, next] of files) writeFileSync(path.join(root, LAYOUT, name), `import B from './${next}';\nconst x = <img src={B} />;\n`);
    return root;
  };
  it.each([
    ['a file that imports itself', [['A.txt', 'A.txt']], `${LAYOUT}/A.txt (imported by ${LAYOUT}/A.txt) is imported again in a loop of imports`],
    ['two files that import each other', [['A.txt', 'B.txt'], ['B.txt', 'A.txt']], `${LAYOUT}/A.txt (imported by ${LAYOUT}/B.txt) is imported again in a loop of imports`],
    ['a chain one file longer than the cap', Array.from({ length: 9 }, (_, i) => [`F${i}.txt`, `F${i + 1}.txt`]), `${LAYOUT}/F8.txt (imported by ${LAYOUT}/F7.txt) is reached through more than 8 files`],
  ])('draws a logo reached through %s as the accent square, with the reason', (_, files, why) => {
    expect(survey.survey(logoChain(files)).brandMark).toEqual({ kind: 'logo', file: null, why: `the logo ${why}: drawn as the accent square` });
  });

  it('follows a logo through a chain of files up to the cap', () => {
    // Seven component files and the image: eight files, the most the survey follows.
    const root = logoChain([...Array.from({ length: 6 }, (_, i) => [`F${i}.txt`, `F${i + 1}.txt`]), ['F6.txt', 'F7.png']]);
    writeFileSync(path.join(root, LAYOUT, 'F7.png'), Buffer.concat([PNG, Buffer.from('IHDR')]));
    expect(survey.survey(root).brandMark).toMatchObject({ kind: 'raster', file: `${LAYOUT}/F7.png` });
  });

  it('prints a control character of the project as a visible escape, never raw to the terminal', () => {
    const root = edit(writeTopApp(tempDir()), 'index.html', '<title>Red\u001b[31m App\u009b2J\u0007\u202e</title>\n');
    const result = survey.survey(root);
    expect(result.appName).toBe('Red\u001b[31m App\u009b2J\u0007\u202e');
    const text = survey.readable(result);
    expect(text).toContain('App: Red\\x1b[31m App\\x9b2J\\x07\\u202e,');
    expect(text).not.toMatch(RAW);
    for (const flags of [[], ['--json']]) {
      const out = silent();
      survey.main(['--project', root, ...flags], out.io);
      const printed = out.out.join('\n');
      expect(printed).not.toMatch(RAW);
      if (flags.length) expect(JSON.parse(printed).appName).toBe(result.appName);
    }
  });

  it('shows the bidirectional controls and the line and paragraph separators as escapes', () => {
    expect(survey.visible('a\u061cb\u200ec\u200fd\u202ae\u202ef\u2066g\u2069h\u2028i\u2029j\ufeffk\u0007l')).toBe('a\\u061cb\\u200ec\\u200fd\\u202ae\\u202ef\\u2066g\\u2069h\\u2028i\\u2029j\\ufeffk\\x07l');
  });
});

describe('survey-app.mjs walks the project safely', { timeout: SURVEY_TIMEOUT }, () => {
  it.skipIf(process.platform === 'win32')('survives a folder link loop and a broken link, follows neither, and lists both and a folder link out of the project', () => {
    const root = writeTopApp(tempDir());
    const home = path.join(root, 'src-app/mfe_packages/home-mfe/src/screens/home');
    const outside = tempDir();
    writeFileSync(path.join(outside, 'Outside.module.css'), '.x { color: red; }\n');
    symlinkSync('..', path.join(home, 'loop'));
    symlinkSync(outside, path.join(home, 'linked'));
    symlinkSync(path.join(root, 'nowhere'), path.join(home, 'broken.module.css'));
    const result = survey.survey(root);
    expect(result.screens.map((s) => s.label)).toEqual(['Home', 'Docs']);
    expect(result.lookSources.pageCss.every((f) => !f.includes('loop') && !f.includes('linked'))).toBe(true);
    const at = 'src-app/mfe_packages/home-mfe/src/screens/home';
    expect(result.skipped.filter((x) => x.file.startsWith(at)).sort((x, y) => (x.file < y.file ? -1 : 1))).toEqual([
      { file: `${at}/broken.module.css`, why: 'cannot be read: no such file, or a link to nothing' },
      { file: `${at}/linked`, why: 'a link to a folder outside the project' },
      { file: `${at}/loop`, why: 'a symbolic link to a folder, which the survey does not walk' },
    ]);
  });

  // references/propose.md lets the agent read by hand only a link with the "inside the project" reason.
  it.skipIf(process.platform === 'win32')('says whether a skipped file link leads to a regular file inside the project, out of it, or to a file with two hard links', () => {
    const root = writeTopApp(tempDir());
    const home = path.join(root, 'src-app/mfe_packages/home-mfe/src/screens/home');
    const outside = path.join(tempDir(), 'Outside.module.css');
    writeFileSync(outside, '.x { color: red; }\n');
    writeFileSync(path.join(root, 'shared.css'), '.x { color: red; }\n');
    writeFileSync(path.join(root, 'twice.css'), '.x { color: red; }\n');
    linkSync(path.join(root, 'twice.css'), path.join(tempDir(), 'twice.css'));
    symlinkSync(path.join(root, 'shared.css'), path.join(home, 'inside.module.css'));
    symlinkSync(outside, path.join(home, 'outside.module.css'));
    symlinkSync(path.join(root, 'twice.css'), path.join(home, 'twice.module.css'));
    const at = 'src-app/mfe_packages/home-mfe/src/screens/home';
    expect(survey.survey(root).skipped.filter((x) => x.file.startsWith(at)).sort((x, y) => (x.file < y.file ? -1 : 1))).toEqual([
      { file: `${at}/inside.module.css`, why: 'a symbolic link to a file inside the project, which the survey does not follow' },
      { file: `${at}/outside.module.css`, why: 'a link to a file outside the project' },
      { file: `${at}/twice.module.css`, why: 'a symbolic link, which the survey does not follow' },
    ]);
  });

  it('counts only a text id of the list of registered screens', () => {
    const root = writeTopApp(tempDir());
    edit(root, 'src-app/mfe_packages/drafts-mfe/mfe.json', (t) => { const data = JSON.parse(t); data.extensions[0].id = 5; return JSON.stringify(data); });
    edit(root, 'public/generated-mfe-manifests.json', (t) => JSON.stringify([...JSON.parse(t), { extensions: [{ id: 5 }] }]));
    const result = survey.survey(root);
    expect(result.screens.map((x) => x.route)).not.toContain('/drafts');
    expect(result.notShown).toContainEqual(expect.objectContaining({ route: '/drafts', reason: 'not in public/generated-mfe-manifests.json' }));
  });

  it.skipIf(process.platform === 'win32')('reads no file through a link out of the project, and says so', () => {
    const root = writeProposalApp(tempDir());
    const outside = path.join(tempDir(), 'outside.html');
    writeFileSync(outside, '<title>Outside Title</title>\n');
    rmSync(path.join(root, 'index.html'));
    symlinkSync(outside, path.join(root, 'index.html'));
    const result = survey.survey(root);
    expect(result.appName).toBe('unresolved');
    expect(result.skipped).toEqual([{ file: 'index.html', why: 'a link to a file outside the project' }]);
    expect(result.unresolved).toEqual(expect.arrayContaining(['appName', 'skipped index.html']));
  });

  // An archive can deliver a hard link to a file outside the folder it is extracted into: the path passes the containment check.
  it.skipIf(process.platform === 'win32')('reads no project file with more than one hard link, and says so', () => {
    const root = writeProposalApp(tempDir());
    const outside = path.join(tempDir(), 'outside.html');
    writeFileSync(outside, '<title>Outside Title</title>\n');
    rmSync(path.join(root, 'index.html'));
    linkSync(outside, path.join(root, 'index.html'));
    const out = silent();
    expect(survey.main(['--project', root, '--json'], out.io)).toBe(1);
    const text = out.out.join('\n');
    const result = JSON.parse(text);
    expect(result.appName).toBe('unresolved');
    expect(result.skipped).toEqual([{ file: 'index.html', why: 'a file with more than one hard link, which the survey does not read' }]);
    expect(result.unresolved).toEqual(expect.arrayContaining(['appName', 'skipped index.html']));
    expect(text).not.toContain('Outside Title');
  });

  it.skipIf(process.platform === 'win32')('reads a kit file with more than one hard link, as package stores install them', () => {
    const plain = survey.survey(writeTopApp(tempDir()));
    const root = writeTopApp(tempDir());
    linkSync(path.join(root, 'node_modules/@gears-frontx/ui-kit/dist/theme.css'), path.join(tempDir(), 'store-theme.css'));
    const result = survey.survey(root);
    expect(result.skipped).toEqual(plain.skipped);
    expect(result.look).toEqual(plain.look);
    expect(result.lookFrom).toEqual(plain.lookFrom);
    expect(JSON.stringify(result.lookFrom)).toContain('kit theme.css --');
  });

  // The project can make a kit style file a hard link to any CSS file; the survey still reads it, as package stores install
  // so, and so it writes from it only names and values that fit their shapes.
  it.skipIf(process.platform === 'win32')('writes nothing from a hard-linked kit style file but values that fit a look kind', () => {
    const root = writeTopApp(tempDir());
    const dist = path.join(root, 'node_modules/@gears-frontx/ui-kit/dist');
    const longName = `--${'KITSECRETNAME'.repeat(6)}`;
    const theme = path.join(tempDir(), 'outside-theme.css');
    writeFileSync(theme, `/* KITSECRET-COMMENT */\n${readFileSync(path.join(dist, 'theme.css'), 'utf8')}\n`
      + `:root, [data-theme='light'], [data-theme='dark'], .KITSECRET-SELECTOR { ${longName}: 1px; --background: KITSECRET.VALUE/x; --radius: KITSECRET!RADIUS 1px; --border: KITSECRET words here; --font-sans: 'Fitting Font', sans-serif; }\n`);
    const chunk = path.join(tempDir(), 'outside-chunk.css');
    writeFileSync(chunk, '._tableHead_a1.KITSECRET-CHUNK { text-transform: KITSECRET_CASE/x; }\n');
    rmSync(path.join(dist, 'theme.css'));
    linkSync(theme, path.join(dist, 'theme.css'));
    rmSync(path.join(dist, 'chunks/table.css'));
    linkSync(chunk, path.join(dist, 'chunks/table.css'));
    const out = silent();
    survey.main(['--project', root], out.io);
    const result = survey.survey(root);
    const text = `${out.out.join('\n')}\n${JSON.stringify(result)}`;
    expect(text).not.toContain('KITSECRET');
    // Plain words fit the font family list shape, so only the kind of the key keeps them off the kit side of appOverKit.
    expect(result.appOverKit.every((d) => survey.lookValueFits(d.key, d.kit))).toBe(true);
    expect(result.look.font).toBe("'Fitting Font', sans-serif");
    expect(result.lookFrom.font).toBe('kit theme.css --font-sans');
    expect(result.dropped).toContainEqual(expect.objectContaining({ key: 'look.th-case', value: survey.KIT_HIDDEN }));
    expect(survey.kitValueFits('calc(var(--radius) - 2px)')).toBe(true);
    // Every kind has a length cap read before its shape, a calc of lengths included, and it is read on the value as written,
    // before a var() is read as 0; a var() counts only with a name of the property shape and cap.
    const longCalc = `calc(${Array.from({ length: 10 }, (_, i) => `var(--${'n'.repeat(60)}${i})`).join(' + ')})`;
    for (const v of ['url(https://example.com/a.png)', 'a.b/c', '</style>', 'KITSECRET!RADIUS 1px', `${'1'.repeat(500)}.5`, `calc(${'1'.repeat(300)}px)`, longCalc, `var(--${'n'.repeat(63)})`, 'var(--a, 1px)']) expect(survey.kitValueFits(v), v.slice(0, 40)).toBe(false);
  });

  // A kit value that fits no look kind is never written, not even in Dropped: a var() name is text of the file too.
  it.skipIf(process.platform === 'win32')('writes no var() name from a hard-linked kit chunk, not even in Dropped', () => {
    const root = writeTopApp(tempDir());
    const chunk = path.join(tempDir(), 'outside-chunk.css');
    writeFileSync(chunk, '._tableHead_a1 { text-transform: var(--OUTSECRET_a); }\n');
    rmSync(path.join(root, 'node_modules/@gears-frontx/ui-kit/dist/chunks/table.css'));
    linkSync(chunk, path.join(root, 'node_modules/@gears-frontx/ui-kit/dist/chunks/table.css'));
    const out = silent();
    survey.main(['--project', root], out.io);
    const result = survey.survey(root);
    expect(`${out.out.join('\n')}\n${JSON.stringify(result)}`).not.toContain('OUTSECRET');
    expect(result.dropped).toContainEqual(expect.objectContaining({ key: 'look.th-case', value: survey.KIT_HIDDEN }));
  });

  // The kit read takes a hard-linked kit style file; when it then skips one for a cap, the reason says the file has more than
  // one hard link, so references/propose.md keeps the agent from opening it by hand.
  it.skipIf(process.platform === 'win32').each([
    ['theme.css', 'over the byte cap', `OUTSECRET ${'x'.repeat(1_100_000)}`, /^\d+ bytes, over the \d+ byte cap, and it has more than one hard link$/],
    ['chunks/table.css', 'with @media nested past the depth cap', `${'@media x{'.repeat(40)} OUTSECRET`, /^block at-rules \(@media, @supports, @layer, \.\.\.\) nested more than \d+ deep: the rest of the file is not read, and it has more than one hard link$/],
  ])('says a hard-linked kit %s skipped %s has more than one hard link', (file, _, content, why) => {
    const root = writeTopApp(tempDir());
    const outside = path.join(tempDir(), 'outside.css');
    writeFileSync(outside, content);
    const kitFile = path.join(root, 'node_modules/@gears-frontx/ui-kit/dist', file);
    rmSync(kitFile);
    linkSync(outside, kitFile);
    const result = survey.survey(root);
    expect(result.skipped).toContainEqual({ file: `node_modules/@gears-frontx/ui-kit/dist/${file}`, why: expect.stringMatching(why) });
    expect(JSON.stringify(result)).not.toContain('OUTSECRET');
  });

  // The kit read skips the hard link rule only for a file whose real path lies in the kit folder: a kit theme.css that is a
  // symbolic link to a project file is read as a project file.
  it.skipIf(process.platform === 'win32')('reads no kit theme.css that is a link to a project file hard-linked outside', () => {
    const root = writeTopApp(tempDir());
    const theme = path.join(root, 'node_modules/@gears-frontx/ui-kit/dist/theme.css');
    const shared = path.join(root, 'shared.css');
    writeFileSync(shared, `${readFileSync(theme, 'utf8')}\n:root { --font-sans: 'Kitlinksecret', sans-serif; }\n`);
    linkSync(shared, path.join(tempDir(), 'outside.css'));
    rmSync(theme);
    symlinkSync(shared, theme);
    const result = survey.survey(root);
    expect(result.skipped).toContainEqual({ file: 'node_modules/@gears-frontx/ui-kit/dist/theme.css', why: 'a file with more than one hard link, which the survey does not read' });
    expect(JSON.stringify(result)).not.toContain('Kitlinksecret');
  });

  // A colour function's arguments are read as colour syntax, so a kit value cannot carry a path inside color().
  it.skipIf(process.platform === 'win32')('copies no path from a hard-linked kit style file inside a colour function', () => {
    const root = writeTopApp(tempDir());
    const dist = path.join(root, 'node_modules/@gears-frontx/ui-kit/dist');
    const theme = path.join(tempDir(), 'outside-theme.css');
    writeFileSync(theme, `${readFileSync(path.join(dist, 'theme.css'), 'utf8')}\n:root, [data-theme='light'], [data-theme='dark'] { --background: color(/Users/owner/KITSECRET.txt); --border: color-mix(in srgb, KITSECRET-word, red); }\n`);
    rmSync(path.join(dist, 'theme.css'));
    linkSync(theme, path.join(dist, 'theme.css'));
    const out = silent();
    survey.main(['--project', root], out.io);
    expect(`${out.out.join('\n')}\n${JSON.stringify(survey.survey(root))}`).not.toContain('KITSECRET');
    for (const v of ['color(/Users/owner/secrets.txt)', 'rgb(a.b/c)', 'color(srgb etc/passwd)', 'color-mix(in srgb, secret-word, red)']) expect(survey.kitValueFits(v), v).toBe(false);
    for (const v of ['color(display-p3 1 0 0 / 0.5)', 'rgb(0 0 0 / 50%)', 'hsl(210deg 40% 50%)', 'oklch(0.7 0.1 200 / 0.5)', 'color-mix(in srgb, red 40%, #fff)', 'color-mix(in oklab, var(--primary) 40%, transparent)']) expect(survey.kitValueFits(v), v).toBe(true);
  });

  // The project chooses where node_modules/@gears-frontx/ui-kit leads: a kit link to the project root must not make the
  // project's own files count as kit files.
  it.skipIf(process.platform === 'win32')('refuses a kit folder that is the project root, reads no hard-linked logo and gives a link to it no manual-read reason', () => {
    const outside = path.join(tempDir(), 'secret.png');
    writeFileSync(outside, Buffer.concat([PNG, Buffer.from('TOP SECRET token=abc123')]));
    const root = withLogo(writeTopApp(tempDir()), './logo.png');
    const dist = path.join(root, 'node_modules/@gears-frontx/ui-kit/dist');
    cpSync(path.join(dist, 'theme.css'), path.join(root, 'theme.css'));
    rmSync(dist, { recursive: true });
    symlinkSync(root, dist);
    linkSync(outside, path.join(root, 'src-app/app/layout/logo.png'));
    const at = 'src-app/mfe_packages/home-mfe/src/screens/home';
    symlinkSync(path.join(root, 'src-app/app/layout/logo.png'), path.join(root, at, 'logo.module.css'));
    const result = survey.survey(root);
    expect(result.brandMark.kind).toBe('logo');
    expect(result.brandMark.why).toMatch(/is a file with more than one hard link, which the survey does not read: drawn as the accent square$/);
    expect(JSON.stringify(result)).not.toContain('data:image');
    expect(result.skipped).toContainEqual({ file: `${at}/logo.module.css`, why: 'a symbolic link, which the survey does not follow' });
    expect(result.skipped).toContainEqual({ file: 'node_modules/@gears-frontx/ui-kit/dist', why: expect.stringMatching(/^the kit folder is the project root/) });
    expect(result.unresolved).toContain('skipped node_modules/@gears-frontx/ui-kit/dist');
  });

  it.skipIf(process.platform === 'win32')('refuses a kit folder that is an ancestor of the project or lies inside it outside node_modules', () => {
    for (const [where, why] of [['up', /^the kit folder is the project root or a folder above it/], ['vendor/kit', /^the kit folder lies inside the project outside its node_modules/]]) {
      const top = tempDir();
      const root = path.join(top, 'app');
      writeTopApp(root);
      const dist = path.join(root, 'node_modules/@gears-frontx/ui-kit/dist');
      const target = where === 'up' ? top : path.join(root, where);
      mkdirSync(target, { recursive: true });
      cpSync(path.join(dist, 'theme.css'), path.join(target, 'theme.css'));
      rmSync(dist, { recursive: true });
      symlinkSync(target, dist);
      const result = survey.survey(root);
      expect(result.skipped, where).toContainEqual({ file: 'node_modules/@gears-frontx/ui-kit/dist', why: expect.stringMatching(why) });
      expect(result.lookSources.kitCss, where).toBe('unresolved');
    }
  });

  // The kit folder lies outside the project; only the look reading of its own style files may read there. A project link
  // into it is a link out of the project like any other.
  it.skipIf(process.platform === 'win32')('reads no project file through a link into an outside kit folder, and still reads the kit look', () => {
    const top = tempDir();
    const root = path.join(top, 'app');
    writeTopApp(root);
    const sibling = path.join(top, 'sibling');
    mkdirSync(sibling);
    const dist = path.join(root, 'node_modules/@gears-frontx/ui-kit/dist');
    cpSync(path.join(dist, 'theme.css'), path.join(sibling, 'theme.css'));
    writeFileSync(path.join(sibling, 'Layout.tsx'), "// SIBLING-LAYOUT-SECRET\nimport { Header } from './Header';\nexport const Layout = () => (<div><Header /><main /></div>);\n");
    rmSync(dist, { recursive: true });
    symlinkSync(sibling, dist);
    const layout = path.join(root, 'src-app/app/layout');
    rmSync(layout, { recursive: true });
    symlinkSync(sibling, layout);
    const out = silent();
    survey.main(['--project', root], out.io);
    const text = out.out.join('\n');
    const result = survey.survey(root);
    expect(result.chrome.nav).toBe('unresolved');
    expect(result.skipped).toContainEqual({ file: 'src-app/app/layout', why: 'a link to a folder outside the project' });
    expect(result.skipped).toContainEqual({ file: 'src-app/app/layout/Layout.tsx', why: 'a link to a file outside the project' });
    expect(text + JSON.stringify(result)).not.toContain('SIBLING-LAYOUT-SECRET');
    expect(result.lookSources.kitCss).toBe('node_modules/@gears-frontx/ui-kit/dist/theme.css');
    expect(JSON.stringify(result.lookFrom)).toContain('kit theme.css --');
  });

  it.skipIf(process.platform === 'win32')('refuses a logo imported from the kit folder when it has more than one hard link', () => {
    const outside = path.join(tempDir(), 'secret.png');
    writeFileSync(outside, Buffer.concat([PNG, Buffer.from('TOP SECRET token=abc123')]));
    const root = withLogo(writeTopApp(tempDir()), '../../../node_modules/@gears-frontx/ui-kit/dist/logo.png');
    linkSync(outside, path.join(root, 'node_modules/@gears-frontx/ui-kit/dist/logo.png'));
    const result = survey.survey(root);
    expect(result.brandMark.kind).toBe('logo');
    expect(result.brandMark.why).toMatch(/is a file with more than one hard link, which the survey does not read: drawn as the accent square$/);
    expect(JSON.stringify(result)).not.toContain('data:image');
  });

  it.skipIf(process.platform === 'win32')('walks no folder linked out of the project and names nothing in it: .frontx and a screen folder are skipped by name', () => {
    const root = writeTopApp(tempDir());
    const outside = tempDir();
    writeFileSync(path.join(outside, 'design-contract.md'), '# Rules of another project\n');
    writeFileSync(path.join(outside, 'OtherScreen.tsx'), "import { Dialog } from '@gears-frontx/ui-kit';\n");
    writeFileSync(path.join(outside, 'Other.module.css'), '.root { background-color: #000000; }\n');
    symlinkSync(outside, path.join(root, '.frontx'));
    const home = path.join(root, 'src-app/mfe_packages/home-mfe/src/screens/home');
    rmSync(home, { recursive: true });
    symlinkSync(outside, home);
    const out = silent();
    expect(survey.main(['--project', root, '--json'], out.io)).toBe(1);
    const text = out.out.join('\n');
    const result = JSON.parse(text);
    expect(result.designFiles).toEqual(['DESIGN-RULES.md', 'DESIGN.md']);
    expect(result.skipped).toHaveLength(2);
    expect(result.skipped).toContainEqual({ file: '.frontx', why: 'a link to a folder outside the project' });
    expect(result.skipped).toContainEqual({ file: 'src-app/mfe_packages/home-mfe/src/screens/home', why: 'a link to a folder outside the project' });
    expect(result.unresolved).toEqual(expect.arrayContaining(['skipped .frontx', 'skipped src-app/mfe_packages/home-mfe/src/screens/home']));
    for (const name of ['design-contract', 'OtherScreen', 'Other.module', 'Dialog', path.basename(outside)]) expect(text).not.toContain(name);
  });

  it.skipIf(process.platform === 'win32').each([
    ['the themes folder', 'src-app/app/themes', 'leak-marker.ts'],
    ['the packages folder', 'src-app/mfe_packages', 'leak-mfe/mfe.json'],
    ['a global stylesheet folder', 'src-app/app', 'leak-marker.css'],
  ])('lists nothing in %s when it is a link out of the project, and skips it by name', (_, rel, marker) => {
    const root = writeTopApp(tempDir());
    const outside = path.join(tempDir(), 'moved');
    cpSync(path.join(root, rel), outside, { recursive: true });
    // A file the survey never asks for by name: it shows up in the output only if the folder is listed.
    mkdirSync(path.join(outside, path.dirname(marker)), { recursive: true });
    writeFileSync(path.join(outside, marker), marker.endsWith('.json') ? '{"entries":[],"extensions":[]}\n' : '.leak { color: #000000; }\n');
    rmSync(path.join(root, rel), { recursive: true });
    symlinkSync(outside, path.join(root, rel));
    const out = silent();
    expect(survey.main(['--project', root, '--json'], out.io)).toBe(1);
    const text = out.out.join('\n');
    const result = JSON.parse(text);
    expect(result.skipped).toContainEqual({ file: rel, why: 'a link to a folder outside the project' });
    expect(text).not.toContain('leak-');
    // A file under it the survey asks for by name is refused too: nothing is read from it.
    expect(result.skipped.filter((x) => x.file.startsWith(`${rel}/`) && !/^a link to a (file|folder) outside the project$/.test(x.why))).toEqual([]);
  });

  it.skipIf(process.platform === 'win32')('lists the app page that is a link to nothing as skipped and unresolved', () => {
    const root = writeTopApp(tempDir());
    rmSync(path.join(root, 'index.html'));
    symlinkSync('no-such-page.html', path.join(root, 'index.html'));
    const result = survey.survey(root);
    expect(result.appName).toBe('unresolved');
    expect(result.skipped).toEqual([{ file: 'index.html', why: 'a link to a file that does not exist' }]);
    expect(result.unresolved).toEqual(expect.arrayContaining(['appName', 'skipped index.html']));
  });

  it.each([
    ['empty', '', 'an empty file, not the list of registered screens; every screen is taken as shown'],
    ['of the wrong shape', '{"manifests":[{"extensions":5}]}', 'cannot be read as the list of registered screens (not a list of manifests, each with a list of extensions); every screen is taken as shown'],
  ])('skips a list of registered screens that is %s, with its reason, and takes every screen as shown', (_, text, why) => {
    const file = 'public/generated-mfe-manifests.json';
    expect(survey.survey(writeTopApp(tempDir())).screens.map((x) => x.route)).not.toContain('/drafts');
    const root = edit(writeTopApp(tempDir()), file, text);
    const out = silent();
    expect(survey.main(['--project', root, '--json'], out.io)).toBe(1);
    const result = JSON.parse(out.out.join('\n'));
    expect(result.skipped).toEqual([{ file, why }]);
    expect(result.screens.map((x) => x.route)).toContain('/drafts');
    expect(result.unresolved).toContain(`skipped ${file}`);
  });

  it.skipIf(process.platform === 'win32')('lists a design file that is a link to nothing as skipped and unresolved, and goes on', () => {
    const root = writeProposalApp(tempDir());
    symlinkSync('no-such-file', path.join(root, 'DESIGN-notes.md'));
    const out = silent();
    expect(survey.main(['--project', root, '--json'], out.io)).toBe(1);
    const result = JSON.parse(out.out.join('\n'));
    expect(result.designFiles).toEqual(['DESIGN.md']);
    expect(result.skipped).toEqual([{ file: 'DESIGN-notes.md', why: 'cannot be read: no such file, or a link to nothing' }]);
  });

  it.skipIf(process.platform === 'win32').each(['DESIGN.md', '.frontx/design-contract.md'])('skips a design file %s with more than one hard link and does not list it as a design file', (file) => {
    const root = writeProposalApp(tempDir());
    const outside = path.join(tempDir(), 'outside.md');
    writeFileSync(outside, '# Rules of another project\n');
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    rmSync(path.join(root, file), { force: true });
    linkSync(outside, path.join(root, file));
    const result = survey.survey(root);
    expect(result.skipped).toContainEqual({ file, why: 'a file with more than one hard link, which the survey does not read' });
    expect(result.designFiles).not.toContain(file);
    expect(result.unresolved).toContain(`skipped ${file}`);
  });

  it('reads every DESIGN*.md at the root, with or without a mark after DESIGN, and nothing else', () => {
    const root = writeProposalApp(tempDir());
    for (const name of ['DESIGNnotes.md', 'DESIGN-a.md', 'design_b.md', 'DESIGN.c.md', 'DESIGN.txt', 'MYDESIGN.md']) writeFileSync(path.join(root, name), '# notes\n');
    expect(survey.survey(root).designFiles).toEqual(['DESIGN-a.md', 'DESIGN.c.md', 'DESIGN.md', 'DESIGNnotes.md', 'design_b.md']);
  });

  it('lists a file where the packages folder should be as skipped, and goes on', () => {
    const root = writeProposalApp(tempDir());
    rmSync(path.join(root, 'src-app/mfe_packages'), { recursive: true });
    writeFileSync(path.join(root, 'src-app/mfe_packages'), 'x\n');
    const out = silent();
    expect(survey.main(['--project', root, '--json'], out.io)).toBe(1);
    const result = JSON.parse(out.out.join('\n'));
    expect(result.screens).toEqual([]);
    expect(result.skipped).toEqual([{ file: 'src-app/mfe_packages', why: 'not a folder: the survey expected a folder here' }]);
  });

  it.each([
    ['{"entries":', /^not valid JSON \(.+\): its screens are not listed$/],
    ['[1]', /^is not a JSON object: its screens are not listed$/],
    ['{"entries":[],"extensions":[null]}', /^an item of "extensions" is not an object: its screens are not listed$/],
    ['{"entries":5,"extensions":[]}', /^"entries" is not a list: its screens are not listed$/],
    ['{"entries":[],"extensions":{"a":1}}', /^"extensions" is not a list: its screens are not listed$/],
    ['{"entries":[],"extensions":[{"id":"a","route":5,"domain":"layout.screen"},{"id":"b","route":6,"domain":"layout.screen"}]}', /^an extension's route is not a text: its screens are not listed$/],
    ['{"entries":[],"extensions":[{"id":"a","route":"/a","domain":"layout.screen","presentation":{"order":"1"}}]}', /^an extension's order is not a number: its screens are not listed$/],
    ['{"entries":[],"extensions":[{"id":"a","route":"/a","domain":"layout.screen","presentation":{"label":5}}]}', /^an extension's label is not a text: its screens are not listed$/],
    ['{"entries":[],"extensions":[{"id":"a","route":"/a","domain":"layout.screen","presentation":5}]}', /^an extension's presentation is not an object: its screens are not listed$/],
    ['{"entries":[{"id":"e","exposedModule":5}],"extensions":[]}', /^an entry's exposedModule is not a text: its screens are not listed$/],
    ['{"entries":[],"extensions":[{"route":"/x","domain":{"toString":null}}]}', /^an extension's domain is not a text \(route "\/x"\): its screens are not listed$/],
    ['{"entries":[],"extensions":[{"id":"a","route":"/a"}]}', /^an extension's domain is not a text \(route "\/a"\): its screens are not listed$/],
    ['{"entries":[],"extensions":[{"id":"a"}]}', /^an extension's domain is not a text \(no route\): its screens are not listed$/],
    ['', /^an empty file: its screens are not listed$/],
    [' \n', /^an empty file: its screens are not listed$/],
  ])('skips the manifest %s with its reason, lists the other screens and exits 1', (manifest, why) => {
    const root = writeTopApp(tempDir());
    edit(root, 'src-app/mfe_packages/home-mfe/mfe.json', manifest);
    const out = silent();
    expect(survey.main(['--project', root, '--json'], out.io)).toBe(1);
    const result = JSON.parse(out.out.join('\n'));
    expect(result.screens.map((x) => x.route)).toEqual(['/docs']);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].file).toBe('src-app/mfe_packages/home-mfe/mfe.json');
    expect(result.skipped[0].why).toMatch(why);
    expect(result.unresolved).toContain('skipped src-app/mfe_packages/home-mfe/mfe.json');
  });

  it('counts a screen with no label and no screen folder as unresolved', () => {
    const root = writeProposalApp(tempDir());
    edit(root, 'src-app/mfe_packages/team-mfe/mfe.json', (t) => {
      const m = JSON.parse(t);
      const home = m.extensions.find((x) => x.route === '/home');
      delete home.presentation;
      home.entry = 'no-such-entry';
      return JSON.stringify(m);
    });
    const result = survey.survey(root);
    expect(result.screens.find((x) => x.route === '/home')).toMatchObject({ label: 'unresolved', source: ['unresolved'] });
    expect(result.unresolved).toEqual(expect.arrayContaining(['screens./home.label', 'screens./home.source']));
  });

  it('lists only the CSS files it read as look sources', () => {
    const root = writeTopApp(tempDir());
    const docs = 'src-app/mfe_packages/docs-mfe/src/screens/docs/DocsScreen.module.css';
    edit(root, docs, '.x { color: #fff; }\n'.repeat(Math.ceil((survey.TEXT_CAP + 1) / 20)));
    const result = survey.survey(root);
    expect(result.skipped.map((x) => x.file)).toEqual([docs]);
    expect(result.lookSources.pageCss).toEqual([HOME_CSS]);
  });

  it('says it cannot write --out and exits 2, with no stack trace', () => {
    const root = writeProposalApp(tempDir());
    const out = silent();
    expect(survey.main(['--project', root, '--out', path.join(root, 'index.html/survey.json')], out.io)).toBe(2);
    expect(out.out).toHaveLength(1);
    expect(out.out[0]).toMatch(/^cannot write .+index\.html\/survey\.json: /);
  });

  it.skipIf(process.platform === 'win32')('refuses to write --out through a symbolic link, the file or its folder, and exits 2', () => {
    const root = writeProposalApp(tempDir());
    const outside = tempDir();
    const target = path.join(outside, 'kept.json');
    writeFileSync(target, 'kept\n');
    mkdirSync(path.join(root, 'out'));
    symlinkSync(target, path.join(root, 'out/survey.json'));
    symlinkSync(outside, path.join(root, 'linked'));
    for (const [rel, what] of [['out/survey.json', 'it is a symbolic link'], ['linked/survey.json', 'its folder is a symbolic link']]) {
      const out = silent();
      expect(survey.main(['--project', root, '--out', path.join(root, rel)], out.io)).toBe(2);
      expect(out.out).toEqual([`cannot write ${path.join(root, rel)}: ${what}`]);
    }
    expect(readFileSync(target, 'utf8')).toBe('kept\n');
    expect(readdirSync(outside)).toEqual(['kept.json']);
  });

  // The documented path is .frontx/proposals/<page-id>/r1/survey.json inside the project, whose folders are untrusted.
  const PROPOSAL_OUT = '.frontx/proposals/team/r1/survey.json';
  it.skipIf(process.platform === 'win32').each([
    ['the proposals folder', '.frontx/proposals', []],
    ['the .frontx folder, with the folders already made outside', '.frontx', ['proposals', 'proposals/team', 'proposals/team/r1']],
    ['the page folder', '.frontx/proposals/team', []],
  ])('refuses --out when %s is a link out of the project, and writes nothing outside', (_, rel, made) => {
    const root = writeProposalApp(tempDir());
    const outside = tempDir();
    for (const dir of made) mkdirSync(path.join(outside, dir));
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    symlinkSync(outside, path.join(root, rel));
    const out = silent();
    expect(survey.main(['--project', root, '--out', path.join(root, PROPOSAL_OUT)], out.io)).toBe(2);
    expect(out.out).toEqual([`cannot write ${path.join(root, PROPOSAL_OUT)}: its folder is a symbolic link`]);
    expect(readdirSync(outside, { recursive: true }).sort()).toEqual(made);
  });

  it('writes --out as a new file over a hard link, leaving the file it shared unchanged, and overwrites its own file on a second run', () => {
    const root = writeProposalApp(tempDir());
    const target = path.join(tempDir(), 'kept.json');
    writeFileSync(target, 'kept\n');
    const file = path.join(root, PROPOSAL_OUT);
    mkdirSync(path.dirname(file), { recursive: true });
    linkSync(target, file);
    for (let run = 0; run < 2; run += 1) {
      expect(survey.main(['--project', root, '--out', file], silent().io)).toBe(0);
      expect(JSON.parse(readFileSync(file, 'utf8')).project).toBe('.');
      expect(readdirSync(path.dirname(file))).toEqual(['survey.json']);
    }
    expect(readFileSync(target, 'utf8')).toBe('kept\n');
  });

  it('writes --out outside the project as a new file too: a hard link there leaves the file it shared unchanged, and a plain file is overwritten on each run', () => {
    const root = writeProposalApp(tempDir());
    const outside = tempDir();
    const kept = path.join(outside, 'kept.json');
    writeFileSync(kept, 'kept\n');
    mkdirSync(path.join(outside, 'out'));
    const linked = path.join(outside, 'out/linked.json');
    linkSync(kept, linked);
    const plain = path.join(outside, 'out/plain.json');
    writeFileSync(plain, 'old\n');
    for (let run = 0; run < 2; run += 1) {
      for (const file of [linked, plain]) {
        expect(survey.main(['--project', root, '--out', file], silent().io)).toBe(0);
        expect(JSON.parse(readFileSync(file, 'utf8')).project).toBe('.');
      }
      expect(readdirSync(path.join(outside, 'out')).sort()).toEqual(['linked.json', 'plain.json']);
    }
    expect(readFileSync(kept, 'utf8')).toBe('kept\n');
  });

  it.skipIf(process.platform === 'win32')('keeps the mode of an existing --out file, inside and outside the project, and gives a new one the default mode', () => {
    const root = writeProposalApp(tempDir());
    const inside = path.join(root, PROPOSAL_OUT);
    const outside = path.join(tempDir(), 'survey.json');
    const mode = (file) => statSync(file).mode & 0o7777;
    for (const file of [inside, outside]) {
      expect(survey.main(['--project', root, '--out', file], silent().io)).toBe(0);
      // A new target: the mode any file made here gets.
      const plain = path.join(path.dirname(file), 'plain.txt');
      writeFileSync(plain, '');
      expect(mode(file)).toBe(mode(plain));
      // Not 0o600, the mode the new file is written with: only a copied mode shows that the bits were set.
      chmodSync(file, 0o640);
      expect(survey.main(['--project', root, '--out', file], silent().io)).toBe(0);
      expect(mode(file)).toBe(0o640);
      expect(JSON.parse(readFileSync(file, 'utf8')).project).toBe('.');
    }
  });

  it.skipIf(process.platform === 'win32')('copies only the permission bits of an existing --out file, never setuid, setgid or sticky', (ctx) => {
    const root = writeProposalApp(tempDir());
    const file = path.join(tempDir(), 'survey.json');
    writeFileSync(file, '{}\n');
    chmodSync(file, 0o2644);
    // A system that does not let the owner set the setgid bit here has nothing to copy.
    if ((statSync(file).mode & 0o7777) !== 0o2644) ctx.skip();
    expect(survey.main(['--project', root, '--out', file], silent().io)).toBe(0);
    expect(statSync(file).mode & 0o7777).toBe(0o644);
  });

  it.skipIf(process.platform === 'win32')('refuses an --out target that is a FIFO, and leaves it in place', (ctx) => {
    const root = writeProposalApp(tempDir());
    const file = path.join(tempDir(), 'survey.json');
    // Node has no call that makes a FIFO; a system without mkfifo skips the row.
    if (spawnSync('mkfifo', [file]).status !== 0) ctx.skip();
    // A child process with a time-out: opening a FIFO for writing blocks until a reader comes, so a write in place would
    // hang this process where no test time-out can fire.
    const code = `const m = await import(${JSON.stringify(pathToFileURL(path.join(skill, 'scripts/survey-app.mjs')).href)});\n`
      + `const out = []; const status = m.main(['--project', ${JSON.stringify(root)}, '--out', ${JSON.stringify(file)}], { log: (l) => out.push(l), error: (l) => out.push(l) });\n`
      + 'process.stdout.write(JSON.stringify({ status, out }));';
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', timeout: 30_000 });
    expect(run.signal, 'the survey did not end within 30 s').toBe(null);
    expect([run.status, run.stderr]).toEqual([0, '']);
    expect(JSON.parse(run.stdout)).toEqual({ status: 2, out: [`cannot write ${file}: it is not a regular file`] });
    expect(lstatSync(file).isFIFO()).toBe(true);
    expect(readdirSync(path.dirname(file))).toEqual(['survey.json']);
  });

  it('makes the folders of --out inside the project and writes the file', () => {
    const root = writeProposalApp(tempDir());
    expect(survey.main(['--project', root, '--out', path.join(root, PROPOSAL_OUT)], silent().io)).toBe(0);
    expect(JSON.parse(readFileSync(path.join(root, PROPOSAL_OUT), 'utf8')).project).toBe('.');
    expect(readdirSync(path.join(root, '.frontx/proposals/team/r1'))).toEqual(['survey.json']);
  });

  // Only a case-insensitive volume (the macOS default) opens the same folder under another spelling; found once.
  const caseRoot = (() => {
    const dir = path.join(tempDir(), 'App');
    mkdirSync(dir);
    return existsSync(path.join(path.dirname(dir), 'app')) ? dir : null;
  })();
  it.skipIf(process.platform === 'win32' || !caseRoot)('finds the project on --out spelled in another case, and refuses a linked proposals folder', () => {
    const root = writeProposalApp(caseRoot);
    const outside = tempDir();
    mkdirSync(path.join(root, '.frontx'));
    symlinkSync(outside, path.join(root, '.frontx/proposals'));
    const file = path.join(path.dirname(root), 'app', PROPOSAL_OUT);
    const out = silent();
    expect(survey.main(['--project', root, '--out', file], out.io)).toBe(2);
    expect(out.out).toEqual([`cannot write ${file}: its folder is a symbolic link`]);
    expect(readdirSync(outside)).toEqual([]);
  });

  it.skipIf(process.platform === 'win32')('refuses --out through an outside link that leads back into the project, and writes nothing', () => {
    const root = writeProposalApp(tempDir());
    const outside = tempDir();
    mkdirSync(path.join(root, '.frontx'));
    symlinkSync(path.join(root, '.frontx'), path.join(outside, 'in'));
    const file = path.join(outside, 'in/proposals/team/r1/survey.json');
    const out = silent();
    expect(survey.main(['--project', root, '--out', file], out.io)).toBe(2);
    expect(out.out).toEqual([`cannot write ${file}: it lies inside the project, but the project folder is not on its path`]);
    expect(readdirSync(path.join(root, '.frontx'))).toEqual([]);
  });

  it('lists the folders of a Windows path with its drive intact', () => {
    expect(survey.foldersOf('C:\\proj\\.frontx\\proposals\\team\\r1\\survey.json', path.win32)).toEqual([
      'C:\\', 'C:\\proj', 'C:\\proj\\.frontx', 'C:\\proj\\.frontx\\proposals', 'C:\\proj\\.frontx\\proposals\\team', 'C:\\proj\\.frontx\\proposals\\team\\r1',
    ]);
    expect(survey.foldersOf('/proj/out/survey.json', path.posix)).toEqual(['/', '/proj', '/proj/out']);
  });

  it('leaves no temporary file when --out is a folder, and reports the rename error', () => {
    const root = writeProposalApp(tempDir());
    const file = path.join(root, PROPOSAL_OUT);
    mkdirSync(file, { recursive: true });
    const out = silent();
    expect(survey.main(['--project', root, '--out', file], out.io)).toBe(2);
    // The codes a rename onto a folder gives on macOS, Linux and Windows: the accepted set, not one platform's.
    expect(out.out[0]).toMatch(/^cannot write .+: E(ISDIR|PERM|NOTEMPTY|EXIST|ACCES).*rename/);
    expect(readdirSync(path.dirname(file))).toEqual(['survey.json']);
  });

  it.each([
    ['a logo name', 5000, HEADER, (t, n) => `const x = <A${'Brand'.repeat(n)};\n${t}`],
    ['image tags', 5000, HEADER, (t, n) => t.replaceOrFail('<AppLogoIcon className={styles.mark} />', `${'<img '.repeat(n)}`)],
    ['svg openers', 10000, HEADER, (t, n) => t.replaceOrFail('<AppLogoIcon className={styles.mark} />', `<svg className="logo" ${'<svg '.repeat(n)}`)],
    ['an import list with no from', 5000, HEADER, (t, n) => `import {${' AppLogoIcon'.repeat(n)} } x;\n${t}`],
    ['link constants', 5000, 'src-app/mfe_packages/home-mfe/src/screens/home/HomeScreen.tsx', (t, n) => `${t}const ${'HREF'.repeat(n)} = 1;\n`],
    ['route templates after a link helper', 1000, 'src-app/app/layout/Menu.tsx', (t, n) => `${t}${'const hrefFor = (route: string | undefined): string =>\n  route ? `/?screen=${route}` : \'/\';\n'.repeat(n)}`],
    ['link helper openers with no template', 3000, 'src-app/app/layout/Menu.tsx', (t, n) => `${t}${'const hrefFor = (route) => href={'.repeat(n)}\n`],
    ['object link keys with no value read', 3000, 'src-app/app/layout/Menu.tsx', (t, n) => `${t}${'{ href: a.b.c, to: `x${'.repeat(n)}\n`],
    ['link calls beside a link helper', 1000, 'src-app/app/layout/Menu.tsx', (t, n) => `${t}const hrefFor = (route) => \`/?screen=\${route}\`;\n${'<a href={makeHref(x)}>a</a>{ to: other.make(x) }\n'.repeat(n)}`],
    ['white space after a link key', 15000, 'src-app/app/layout/Menu.tsx', (t, n) => `${t}const x = { to:${' '.repeat(n)}y };\n`],
    ['a declaration name', 5000, HOME_CSS, (t, n) => `${t}.x { ${'a'.repeat(n)} }\n`],
    ['a padding value', 5000, HOME_CSS, (t, n) => t.replaceOrFail('.column { max-width: 1240px; padding: 0 20px; }', `.column { max-width: 1240px; padding: ${'1px '.repeat(n)}); }`)],
    ['an import list with no closing brace', 5000, 'src-app/mfe_packages/home-mfe/src/screens/home/HomeScreen.tsx', (t, n) => `${t}${'import {a '.repeat(n)}\n`],
    ['a calc() of digits', 5000, HOME_CSS, (t, n) => t.replaceOrFail('.column { max-width: 1240px; padding: 0 20px; }', `.column { max-width: 1240px; padding: 0 calc(${'1'.repeat(n)}px); }`)],
    // Nesting grows only up to MEDIA_DEPTH_CAP: these rows grow the work inside a nest at the cap.
    ['rules inside @media rules nested to the depth cap', 4000, HOME_CSS, (t, n) => `${t}${'@media (min-width: 600px) {'.repeat(survey.MEDIA_DEPTH_CAP)}${' .x { color: red; }'.repeat(n)}${'}'.repeat(survey.MEDIA_DEPTH_CAP)}\n`],
    ['@media nests at the depth cap side by side', 100, HOME_CSS, (t, n) => `${t}${`${'@media (min-width: 600px) {'.repeat(survey.MEDIA_DEPTH_CAP)} .x { color: red; }${'}'.repeat(survey.MEDIA_DEPTH_CAP)}\n`.repeat(n)}`],
    ['@media rules nested side by side in one', 2000, HOME_CSS, (t, n) => `${t}@media (min-width: 600px) {${' @media (min-width: 700px) { .x { color: red; } }'.repeat(n)} }\n`],
    ['at-statements whose url() holds a semicolon', 2000, HOME_CSS, (t, n) => `${t}${'@import url("a;b.css");'.repeat(n)}.x { color: red; }\n`],
  ])('surveys a project in time linear in the size of %s', (what, size, rel, grow) => {
    const roots = new Map();
    const at = (n) => {
      if (!roots.has(n)) { const root = mkdtempSync(path.join(tmpdir(), 'fx-proposal-sec-')); writeTopApp(root); edit(root, rel, (t) => grow(t, n)); roots.set(n, root); }
      return roots.get(n);
    };
    // The larger input must be read whole, not skipped over TEXT_CAP or cut at the @media depth cap, or the row would time nothing.
    try { expect(survey.survey(at(8 * size)).skipped.filter((s) => s.why.includes('byte cap') || s.why.includes('nested more than'))).toEqual([]); expectLinear((n) => survey.survey(at(n)), size, what); } finally { for (const root of roots.values()) rmSync(root, { recursive: true, force: true }); }
  }, SCALE_TIMEOUT);

  // The survey tests LINK_BUILT only on a short window before a template, so the regexes are timed on their own too,
  // read from the script's source: one that backtracks over a white space run is quadratic in it on any input.
  it.each(['LINK_BUILT', 'LINK_CALL'])('matches %s in time linear in a white space run after href = or to:', (name) => {
    const literal = readFileSync(path.join(skill, 'scripts/survey-app.mjs'), 'utf8').match(new RegExp(`^const ${name} = (/.+/[a-z]*);$`, 'm'))?.[1];
    if (!literal) throw new Error(`survey-app.mjs: ${name} not found`);
    const rx = new Function(`return ${literal};`)();
    for (const lead of ['to:', 'href =']) expectLinear((n) => [...`${lead}${' '.repeat(n)}x`.matchAll(new RegExp(rx.source, 'g'))], 4000, `${name} after ${lead}`);
  }, SCALE_TIMEOUT);

  // Not a scaling row: past the cap the parser stops at the first @media too deep, so the work is the same at any depth.
  it('stops at the @media depth cap however deep the nesting goes, saying so', () => {
    for (const depth of [500, 4000, 30000]) {
      const result = survey.survey(edit(writeTopApp(tempDir()), HOME_CSS, (t) => `${t}${'@media (min-width: 600px) {'.repeat(depth)}.x { color: red; }${'}'.repeat(depth)}\n`));
      expect(result.skipped, String(depth)).toEqual([{ file: HOME_CSS, why: `block at-rules (@media, @supports, @layer, ...) nested more than ${survey.MEDIA_DEPTH_CAP} deep: the rest of the file is not read` }]);
    }
  });

  it('skips the rest of a CSS file at a "}" with no rule open, saying so', () => {
    const result = survey.survey(edit(writeTopApp(tempDir()), HOME_CSS, (t) => `}\n${t}`));
    expect(result.skipped).toEqual([{ file: HOME_CSS, why: 'a closing brace with no rule open: the rest of the file is not read' }]);
    expect(result.unresolved).toContain(`skipped ${HOME_CSS}`);
  });

  it('reads @media rules nested up to the cap, and past it skips the rest of the file, saying so', () => {
    const nested = (depth) => survey.survey(edit(writeTopApp(tempDir()), HOME_CSS, (t) => `${t}${'@media (min-width: 600px) {'.repeat(depth)}.column { max-width: 900px; }${'}'.repeat(depth)}\n`));
    const at = nested(survey.MEDIA_DEPTH_CAP);
    expect(at.lookFrom.max).toBe(`${HOME_CSS} .column (from 600 px) max-width`);
    expect(at.skipped).toEqual([]);
    const over = nested(survey.MEDIA_DEPTH_CAP + 1);
    expect(over.lookFrom.max).toBe(`${HOME_CSS} .column max-width`);
    expect(over.skipped).toEqual([{ file: HOME_CSS, why: `block at-rules (@media, @supports, @layer, ...) nested more than ${survey.MEDIA_DEPTH_CAP} deep: the rest of the file is not read` }]);
    expect(over.unresolved).toContain(`skipped ${HOME_CSS}`);
  });

  it('cleans an SVG in time linear in its length, and refuses a tag with too many attributes', { timeout: SCALE_TIMEOUT }, () => {
    expect(survey.sanitizeSvg(`<svg ${'a="b" '.repeat(40)}!`).error).toBe('the <svg> element is not closed');
    expect(survey.sanitizeSvg(`<svg ${'a="b" '.repeat(20000)}!`).error).toBe(`a <svg> tag holds more than ${survey.SVG_ATTR_CAP} attributes`);
    const svg = `<svg viewBox="0 0 1 1">${'<path d="M0 0" a="b"/>'.repeat(survey.SVG_ATTR_CAP)}`;
    expect(survey.sanitizeSvg(`<svg ${'a="b" '.repeat(survey.SVG_ATTR_CAP)}viewBox="0 0 1 1"><path d="M0 0"/></svg>`).error).toBe(`a <svg> tag holds more than ${survey.SVG_ATTR_CAP} attributes`);
    expect(survey.sanitizeSvg(`<svg ${'a="b" '.repeat(survey.SVG_ATTR_CAP - 1)}viewBox="0 0 1 1"><path d="M0 0"/></svg>`).svg).toBe('<svg viewBox="0 0 1 1" aria-hidden="true"><path d="M0 0"/></svg>');
    for (const [what, build] of [
      ['many tags, the last one cut off', (n) => `${svg}${'<path d="M0 0" a="b"/>'.repeat(n)}<path a="b" c="d" `],
      ['comment openers', (n) => `${'<!-- '.repeat(n)}${svg}`],
      ['code comment openers', (n) => `${'{/* '.repeat(n)}${svg}`],
    ]) expectLinear((n) => survey.sanitizeSvg(build(n)), 10000, what);
  });

  it('reads a file of exactly the text cap and skips one byte more, saying so', () => {
    const sized = (bytes) => {
      const root = writeTopApp(tempDir());
      const css = readFileSync(path.join(root, HOME_CSS), 'utf8');
      edit(root, HOME_CSS, `${css}/*${'x'.repeat(bytes - css.length - 4)}*/`);
      return survey.survey(root);
    };
    expect(sized(survey.TEXT_CAP).skipped).toEqual([]);
    const over = sized(survey.TEXT_CAP + 1);
    expect(over.skipped).toEqual([{ file: HOME_CSS, why: `${survey.TEXT_CAP + 1} bytes, over the ${survey.TEXT_CAP} byte cap` }]);
    expect(over.look).not.toHaveProperty('band-bg');
  }, CAP_TIMEOUT);

  // chmod 000 keeps a file or folder from a user who is not root on a POSIX system; root reads it anyway and Windows ignores it.
  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('reports a project root it cannot list as an input error, not as something unresolved', () => {
    const root = writeTopApp(tempDir());
    chmodSync(root, 0o000);
    locked.push(root);
    const out = silent();
    expect(survey.main(['--project', root], out.io)).toBe(2);
    expect(out.out.join('\n')).toMatch(/^the survey could not read the project: /);
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0).each([
    ['a file it reads', HOME_CSS, 'cannot be read (EACCES)'],
    ['the app page', 'index.html', 'cannot be read (EACCES)'],
    ['a folder it lists', 'src-app/mfe_packages', 'cannot be listed (EACCES)'],
    ['the themes folder', 'src-app/app/themes', 'cannot be listed (EACCES)'],
  ])('lists %s without read permission as skipped and unresolved, and goes on', (_, rel, why) => {
    const root = writeTopApp(tempDir());
    chmodSync(path.join(root, rel), 0o000);
    locked.push(path.join(root, rel));
    const out = silent();
    expect(survey.main(['--project', root, '--json'], out.io)).toBe(1);
    const result = JSON.parse(out.out.join('\n'));
    expect(result.skipped).toEqual([{ file: rel, why }]);
    expect(result.unresolved).toContain(`skipped ${rel}`);
  });

  // The logo is not listed under skipped: like every other logo that cannot be used, it becomes the accent square, named on the Brand line.
  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0).each([
    ['a logo component', (root) => root, 'src-app/app/icons/AppLogoIcon.tsx', 'the logo src-app/app/icons/AppLogoIcon.tsx (AppLogoIcon, imported by src-app/app/layout/Header.tsx)'],
    ['a logo image', (root) => {
      withLogo(root, './logo.png');
      writeFileSync(path.join(root, 'src-app/app/layout/logo.png'), PNG);
      return root;
    }, 'src-app/app/layout/logo.png', 'the logo src-app/app/layout/logo.png (the image in src-app/app/layout/Header.tsx)'],
  ])('draws %s without read permission as the accent square and goes on', (_, prepare, rel, named) => {
    const root = prepare(writeTopApp(tempDir()));
    chmodSync(path.join(root, rel), 0o000);
    locked.push(path.join(root, rel));
    const out = silent();
    expect(survey.main(['--project', root, '--json'], out.io)).toBe(0);
    const result = JSON.parse(out.out.join('\n'));
    expect(result.brandMark).toEqual({ kind: 'logo', file: null, why: `${named} cannot be read (EACCES): drawn as the accent square` });
    expect(result.skipped).toEqual([]);
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('prints a control character in the error of an unreadable project as a visible escape', () => {
    const root = writeTopApp(path.join(tempDir(), 'app\u001b[31m\u202e'));
    chmodSync(root, 0o000);
    locked.push(root);
    const out = silent();
    expect(survey.main(['--project', root], out.io)).toBe(2);
    const printed = out.out.join('\n');
    expect(printed).toContain('app\\x1b[31m\\u202e');
    expect(printed).not.toMatch(RAW);
  });
});

describe('check-proposal.mjs refuses what would load or run anything', () => {
  const page = readFileSync(path.join(skill, 'assets/proposals/team-tasks/r1/proposal.html'), 'utf8');
  const swap = (from, to) => { expect(page.includes(from), from).toBe(true); return page.replaceOrFail(from, to); };
  const atEnd = (html) => swap('</main>', `${html}</main>`);
  const findings = (html) => check.checkPage(html).findings;

  it.each([
    ['frame', 'an extra <script> block', swap('  --d-bg: #f1f5f9;', '  --d-bg: #f1f5f9; </STYLE><script>alert(document.domain)</script><style>')],
    ['external', 'url(https://attacker.example/a.png) points outside the page', atEnd('<span style="background: URL(https://attacker.example/a.png)"></span>')],
    ['external', 'url(https://attacker.example/a.png) points outside the page', atEnd('<span style="background: \\75 rl(https://attacker.example/a.png)"></span>')],
    ['external', 'url(https://attacker.example/a.png) points outside the page', atEnd('<span style="background: &#117;rl(https://attacker.example/a.png)"></span>')],
    ['external', 'image-set() is not allowed', atEnd('<span style="background: image-set(&quot;https://attacker.example/a.png&quot; 1x)"></span>')],
    ['external', 'image-set() is not allowed', atEnd('<span style="background: -webkit-image-set(&quot;a.png&quot; 1x)"></span>')],
    ['external', 'expression() is not allowed', atEnd('<span style="width: expression(alert(1))"></span>')],
    ['external', '@import is not allowed', swap('<style id="app-look">', '<style id="app-look">\n@IMPORT "https://attacker.example/a.css";')],
    ['external', '@font-face is not allowed', swap('<style id="app-look">', '<style id="app-look">\n@Font-Face { font-family: x; }')],
    ['external', '<image xlink:href="https://attacker.example/a.png"> points outside the page', atEnd('<svg><image xlink:href="https://attacker.example/a.png"/></svg>')],
    ['external', '<meta http-equiv="refresh"> is not allowed', swap('<meta name="viewport"', '<meta http-equiv="refresh" content="0;url=https://attacker.example/">\n<meta name="viewport"')],
    ['external', '<b onmouseover> is an event handler', swap('<p class="request">"I need', '<p class="request"><b onmouseover="alert(1)">x</b>"I need')],
    ['external', '<svg onload> is an event handler', atEnd('<svg onload="alert(2)"></svg>')],
    ['external', '<img onerror> is an event handler', atEnd('<img src="data:image/png;base64,AA" onerror="fetch(\'https://x.example/\')">')],
    ['external', 'runs code', atEnd('<a href="JaVaScRiPt:alert(1)">x</a>')],
    ['external', 'runs code', atEnd('<a href=" java&#9;script:alert(1)">x</a>')],
    ['external', 'points outside the page', atEnd('<a href="data:text/html,hi">x</a>')],
    ['external', '<button formaction="https://attacker.example/"> points outside the page', atEnd('<button formaction="https://attacker.example/">x</button>')],
    ['external', '<a ping> holds a list of addresses', atEnd('<a href="#how" ping="https://attacker.example/">x</a>')],
    ['external', 'points outside the page', atEnd('<a href="#how" href="https://attacker.example/">x</a>')],
    ['external', 'srcdoc> embeds another page', atEnd('<div srcdoc="x"></div>')],
    ['external', '<base> is not allowed', atEnd('<base href="#x">')],
    ['external', '<set> is not allowed', atEnd('<svg><a><set attributeName="href" to="#x"/></a></svg>')],
    ['external', 'points outside the page', atEnd('<a href="https://tracker.example/issues/1">the issue</a>')],
  ])('reports %s: %s', (kind, message, html) => {
    const found = findings(html);
    expect(found.filter((f) => f.startsWith(`[${kind}]`) && f.includes(message)), found.join('\n')).toHaveLength(1);
  });

  it.each(['iframe', 'object', 'embed', 'link', 'base', 'frame', 'frameset', 'applet', 'portal', 'template', 'set', 'animate', 'animateMotion', 'animateTransform', 'discard', 'handler', 'listener'])('reports the element <%s>', (tag) => {
    const found = findings(atEnd(`<${tag}></${tag}>`));
    expect(found.filter((f) => f === `[external] <${tag.toLowerCase()}> is not allowed`), found.join('\n')).toHaveLength(1);
  });

  it.each(['href', 'src', 'xlink:href', 'poster', 'data', 'action', 'formaction', 'background', 'lowsrc', 'dynsrc', 'longdesc', 'cite', 'codebase', 'classid', 'manifest', 'icon', 'usemap'])('reports an address out of the page in the attribute %s', (name) => {
    const found = findings(atEnd(`<span ${name}="https://attacker.example/a.png">x</span>`));
    expect(found.filter((f) => f === `[external] <span ${name}="https://attacker.example/a.png"> points outside the page`), found.join('\n')).toHaveLength(1);
  });

  // A browser reads these as lists: the check of what an address starts with would read only the first entry.
  const LIST = (tag, name) => `[external] <${tag} ${name}> holds a list of addresses, which a proposal page does not need; drop it (a logo is an img src with a data image)`;
  it.each([
    ['srcset on img', 'img', 'srcset', '<img srcset="#g 1x, https://attacker.example/a.png 2x" alt="">'],
    ['ping on a', 'a', 'ping', '<a href="#answer" ping="#answer https://attacker.example/p">x</a>'],
    ['srcset on source', 'source', 'srcset', '<picture><source srcset="#g"><img src="data:image/png;base64,AA" alt=""></picture>'],
    ...['srcset', 'imagesrcset', 'ping', 'itemtype', 'profile', 'attributionsrc', 'archive'].map((name) => [`${name} holding only a fragment`, 'span', name, `<span ${name}="#how">x</span>`]),
  ])('refuses an attribute that holds a list of addresses, whatever it holds: %s', (_, tag, name, html) => {
    const found = findings(atEnd(html));
    expect(found.filter((f) => f.startsWith(`[external] <${tag} `)), found.join('\n')).toEqual([LIST(tag, name)]);
  });

  // XML Base moves the base a relative address or a fragment resolves against: <use href="#g"> under it can load an outside file.
  const BASE = (tag, name) => `[external] <${tag} ${name}> changes the base the page's addresses resolve against, which a proposal page does not need; drop it`;
  it.each([
    ['xml:base on svg over a fragment use', 'svg', 'xml:base', '<svg xml:base="https://attacker.example/a.svg"><use href="#g"/></svg>'],
    ['xml:base on an html element', 'span', 'xml:base', '<span xml:base="https://attacker.example/">x</span>'],
    ['xml:base written in upper case', 'svg', 'xml:base', '<svg XML:BASE="https://attacker.example/"></svg>'],
    ['xml:base holding only a fragment', 'svg', 'xml:base', '<svg xml:base="#how"></svg>'],
    ['another prefix bound to the XML namespace', 'svg', 'foo:base', '<svg xmlns:foo="http://www.w3.org/XML/1998/namespace" foo:base="https://attacker.example/"></svg>'],
  ])('refuses an attribute that changes the base of the page\'s addresses, whatever it holds: %s', (_, tag, name, html) => {
    const found = findings(atEnd(html));
    expect(found.filter((f) => f.startsWith(`[external] <${tag} `)), found.join('\n')).toEqual([BASE(tag, name)]);
  });

  it.each([
    ['the base element', '<base href="https://attacker.example/">', ['[external] <base> is not allowed', '[external] <base href="https://attacker.example/"> points outside the page']],
    ['codebase on object', '<object codebase="https://attacker.example/"></object>', ['[external] <object> is not allowed', '[external] <object codebase="https://attacker.example/"> points outside the page']],
    ['codebase on applet', '<applet codebase="https://attacker.example/"></applet>', ['[external] <applet> is not allowed', '[external] <applet codebase="https://attacker.example/"> points outside the page']],
  ])('refuses %s, which moves the base of addresses', (_, html, expected) => {
    const found = findings(atEnd(html));
    expect(found.filter((f) => f.startsWith('[external]')), found.join('\n')).toEqual(expected);
  });

  // The page's Content-Security-Policy does not stop a link: only #fragment links and the one https facts link may stand.
  it.each([
    ['a link that navigates outside', '<a href="https://example.org">x</a>', 'https://example.org'],
    ['a download link', '<a href="data:text/plain,x" download>x</a>', 'data:text/plain,x'],
    ['a mail link', '<a href="mailto:a@example.org">x</a>', 'mailto:a@example.org'],
    ['a phone link', '<a href="tel:+15550100">x</a>', 'tel:+15550100'],
    ['a message link', '<a href="sms:+15550100">x</a>', 'sms:+15550100'],
    ['a custom scheme', '<a href="foo:bar">x</a>', 'foo:bar'],
  ])('refuses %s outside the page facts', (_, html, address) => {
    const found = findings(atEnd(html));
    expect(found.filter((f) => f.startsWith('[external]')), found.join('\n')).toEqual([`[external] <a href="${address}"> points outside the page`]);
  });

  it.each([
    ['url()', 'url(https://attacker.example/a.png)', 'url(https://attacker.example/a.png) points outside the page'],
    ['image-set()', 'image-set(&quot;a.png&quot; 1x)', 'image-set() is not allowed'],
    ['-webkit-image-set()', '-webkit-image-set(&quot;a.png&quot; 1x)', 'image-set() is not allowed'],
    ['image()', 'image(&quot;a.png&quot;)', 'image() is not allowed'],
    ['cross-fade()', 'cross-fade(red, blue 50%)', 'cross-fade() is not allowed'],
    ['element()', 'element(#how)', 'element() is not allowed'],
    ['expression()', 'expression(alert(1))', 'expression() is not allowed'],
  ])('reports the CSS function %s in a style attribute', (_, value, message) => {
    const found = findings(atEnd(`<span style="background: ${value}">x</span>`));
    expect(found.filter((f) => f === `[external] ${message}`), found.join('\n')).toHaveLength(1);
  });

  it.each(['@import', '@font-face'])('reports %s in the app-look block', (rule) => {
    const found = findings(swap('<style id="app-look">', `<style id="app-look">\n${rule} x;`));
    expect(found.filter((f) => f === `[external] ${rule} is not allowed`), found.join('\n')).toHaveLength(1);
  });

  const WHY = '/* why: old url(https://example.com/a) was removed */';
  it.each([
    ['a why: comment that names a url() in the app-look block', swap('<style id="app-look">', `<style id="app-look">\n${WHY}`), ['[external] url(https://example.com/a) points outside the page (comments are read as CSS)']],
    ['the same comment in a style attribute', atEnd(`<span style="${WHY} color: red"></span>`), ['[external] url(https://example.com/a) points outside the page (comments are read as CSS)']],
    ['a real url() beside the comment', swap('<style id="app-look">', `<style id="app-look">\n${WHY} .x { background: url(https://example.com/b); }`), ['[external] url(https://example.com/a) points outside the page (comments are read as CSS)', '[external] url(https://example.com/b) points outside the page']],
    ['a comment left open', swap('<style id="app-look">', '<style id="app-look">\n.x { color: red; } /* url(https://example.com/e)'), ['[external] url(https://example.com/e) points outside the page (comments are read as CSS)']],
    // A browser reads "/*" inside a string or a url() token as text: the url() between is real.
    ['a url() between "/*" and "*/" in strings', swap('<style id="app-look">', '<style id="app-look">\n.a { content: "/*"; } .b { background: url(https://example.com/c); } .c { content: "*/"; }'), ['[external] url(https://example.com/c) points outside the page']],
    ['a url() after a url() token that holds "/*"', swap('<style id="app-look">', '<style id="app-look">\n.a { background: url(/*); } .b { background: url(https://example.com/d); } .c { content: "*/"; }'), ['[external] url(/*) points outside the page', '[external] url(https://example.com/d) points outside the page']],
    // A backslash before CRLF in a string is one escaped newline: the "/*" after it stays in the string.
    ['a url() after an escaped CRLF in a string that holds "/*"', swap('<style id="app-look">', `<style id="app-look">\n.a{content:"\\\r\n/*";background:url(https://example.com/x);/* end */}`), ['[external] url(https://example.com/x) points outside the page']],
  ])('reads CSS comments as CSS in the load checks: %s', (_, html, expected) => {
    expect(findings(html).filter((f) => f.startsWith('[external]'))).toEqual(expected);
  });

  it.each(['javascript', 'vbscript'])('reports a %s: address', (scheme) => {
    const found = findings(atEnd(`<a href="${scheme}:x">x</a>`));
    expect(found.filter((f) => f === `[external] <a href="${scheme}:x"> runs code`), found.join('\n')).toHaveLength(1);
  });

  it.each([
    ['in a style block', '<svg><style>.x { fill: url(https://attacker.example/a.png) }</style></svg>'],
    ['in an svg presentation attribute', '<svg><rect fill="url(https://attacker.example/a.png)"/></svg>'],
  ])('reads CSS %s', (_, html) => {
    const found = findings(atEnd(html));
    expect(found.filter((f) => f === '[external] url(https://attacker.example/a.png) points outside the page'), found.join('\n')).toHaveLength(1);
  });

  it.each(['fill', 'stroke', 'filter', 'mask', 'clip-path', 'marker', 'marker-start', 'marker-mid', 'marker-end', 'cursor'])('reads the presentation attribute %s as CSS on an HTML element too, so a url() there is seen whatever namespace the element has', (name) => {
    const found = findings(atEnd(`<span ${name}="url(https://attacker.example/a.png)">x</span>`));
    expect(found.filter((f) => f === '[external] url(https://attacker.example/a.png) points outside the page'), found.join('\n')).toHaveLength(1);
  });

  it('reads src() as a CSS loader', () => {
    const found = findings(atEnd('<span style="background-image: src(&quot;https://attacker.example/a.png&quot;)">x</span>'));
    expect(found.filter((f) => f === '[external] src() is not allowed'), found.join('\n')).toHaveLength(1);
  });

  it.each([
    ['DEL before a fragment, which a browser keeps as a path', '<a href="&#127;#how">x</a>', 2],
    ['a C0 control inside a fragment', '<a href="#ho&#1;w">x</a>', 1],
    ['a form feed inside a fragment', '<a href="#ho&#12;w">x</a>', 1],
  ])('reports a control character a browser keeps in an address: %s', (_, html, count) => {
    const found = findings(atEnd(html)).filter((f) => f.startsWith('[external] <a href'));
    expect(found.filter((f) => f.includes('holds a control character'))).toHaveLength(1);
    expect(found).toHaveLength(count);
  });

  it.each([
    ['xlink:href', '<svg><use xlink:href="#ho&#1;w"/></svg>'],
    ['src', '<span src="#ho&#1;w">x</span>'],
  ])('reports a control character a browser keeps in the address attribute %s', (name, html) => {
    const found = findings(atEnd(html));
    expect(found, found.join('\n')).toEqual([`[external] <${html.match(/<(use|span)/)[1]} ${name}> holds a control character, which a browser keeps in the address; write the address without it`]);
  });

  it('strips only what a browser strips from an address: tab, LF and CR anywhere, spaces at the ends', () => {
    expect(findings(atEnd('<a href=" #h&#9;o&#10;w&#13; ">x</a>'))).toEqual([]);
  });

  // A URL keeps a no-break space and other non-ASCII spaces as path characters, where JavaScript trim() and \s drop them.
  it.each([
    ['a no-break space before a fragment in a quoted url()', '<span style="background:url(&quot;&#160;#outside&quot;)"></span>'],
    ['a no-break space before a data image in a quoted url()', '<span style="background:url(&quot;&#160;data:image/png;base64,AA&quot;)"></span>'],
    // A CSS hex escape ends with one CSS whitespace: the no-break space after "\20" stays in the address.
    ['a no-break space after a CSS escape of a space', '<span style="background:url(&quot;\\20&#160;#g&quot;)"></span>'],
    ...[['no-break space', '&#160;'], ['U+2028', '&#x2028;'], ['U+FEFF', '&#xfeff;'], ['U+3000', '&#x3000;']].flatMap(([name, ref]) => [
      [`a ${name} before "#" in a quoted url()`, `<span style="background:url('${ref}#g')"></span>`],
      [`a ${name} before "#" in an unquoted url()`, `<span style="background:url(${ref}#g)"></span>`],
    ]),
  ])('reports a url() whose address starts with a character a URL keeps: %s', (_, html) => {
    const found = findings(atEnd(html));
    expect(found.filter((f) => f.startsWith('[external] url(') && f.endsWith(') points outside the page')), found.join('\n')).toHaveLength(1);
  });

  // HTML and CSS turn a raw NUL into U+FFFD, or drop it, by where it stands: the check reports it before reading anything.
  const NUL_FINDING = /^\[frame\] the page holds a raw NUL character \(U\+0000\) on line \d+; a browser rewrites it by where it stands/;
  it('reports a raw NUL before a fragment in the app-look url(), and the address as outside the page', () => {
    const at = page.indexOf('<style id="app-look">');
    const look = /--d-bg:[^;]*;/.exec(page.slice(at))[0];
    const found = findings(page.slice(0, at) + page.slice(at).replaceOrFail(look, '--d-bg: url(\u0000#g);'));
    expect(found[0], found.join('\n')).toMatch(NUL_FINDING);
    expect(found).toContain('[external] url(\u0000#g) points outside the page');
  });

  it.each([
    ['a style block', swap('<style id="app-look">', '<style id="app-look">\n/* a\u0000b */')],
    ['an attribute value', atEnd('<p title="a\u0000b">x</p>')],
    ['a comment', atEnd('<!-- a\u0000b -->')],
    ['text', atEnd('<p>a\u0000b</p>')],
  ])('reports a raw NUL in %s as a finding of its own, first', (_, html) => {
    const found = findings(html);
    expect(found[0], found.join('\n')).toMatch(NUL_FINDING);
    expect(found.filter((f) => NUL_FINDING.test(f))).toHaveLength(1);
  });

  it.each([
    ['a no-break space before a data image in an img src', '<img src="&#160;data:image/png;base64,AA" alt="">', '<img src='],
    ['a no-break space before an https facts link', null, '<a href='],
  ])('reports an address that starts with a character a URL keeps: %s', (_, html, start) => {
    const page = html === null ? swap('revision <code>r1</code>, 2026-11-20</span>', 'revision <code>r1</code>, 2026-11-20, <a href="&#160;https://tracker.example/issues/1">issue 1</a></span>') : atEnd(html);
    const found = findings(page);
    expect(found.filter((f) => f.startsWith(`[external] ${start}`) && f.endsWith('points outside the page')), found.join('\n')).toHaveLength(1);
  });

  it.each([
    ['url(#g)', '<svg><rect fill="url(#g)"/></svg>'],
    ['url( "#g" )', '<span style="background:url( &quot;#g&quot; )"></span>'],
    ['a data image in url()', '<span style="background:url(&quot;data:image/png;base64,AA&quot;)"></span>'],
    ['a tab and a space around a fragment', '<span style="background:url(&quot;&#9; #g &quot;)"></span>'],
  ])('keeps clean a url() that points into the page: %s', (_, html) => {
    expect(findings(atEnd(html))).toEqual([]);
  });

  it('keeps a legacy reference without ";" before "=" as it is, as a browser does in an attribute', () => {
    const facts = swap('revision <code>r1</code>, 2026-11-20</span>', 'revision <code>r1</code>, 2026-11-20, <a href="https://tracker.example/issues?q&lt=1">issue 1</a></span>');
    expect(findings(facts)).toEqual([]);
  });

  it('reads ordinary text attributes as text, not as CSS', () => {
    expect(findings(atEnd('<p alt="Upload image(s)" title="element(s) of url(s)" aria-label="cross-fade(s)" data-note="image-set(x)">x</p>'))).toEqual([]);
  });

  it('reads an id with a character reference as the browser does: a hidden form#answer&#45;form doubles the answer form id', () => {
    expect(findings(swap('<main', '<form id="answer&#45;form" hidden></form><main'))).toEqual(['[ids] id "answer-form" is used 2 times']);
  });

  it('reads a radio name with a character reference as the browser does: name="q&#49;" is a second checked answer of question 1', () => {
    const extra = '<label class="pick"><input type="radio" name="q&#49;" value="Third" data-say="A third answer that nobody suggested here." checked><span>Third</span></label>';
    const found = findings(swap('<label class="pick"><input type="radio" name="q1" value="Only the assignee"', `${extra}<label class="pick"><input type="radio" name="q1" value="Only the assignee"`));
    expect(found).toEqual(['[answer] the suggested answer of question 1 is not the one checked']);
  });

  it('reads a class with a character reference as the browser does: class="answe&#114;" and "answer&#32;x" hold answer, "answer&#45;x" does not', () => {
    const form = '<form class="answer" id="answer-form"';
    expect(findings(swap(form, '<form class="answe&#114;" id="answer-form"'))).toEqual([]);
    expect(findings(swap(form, '<form class="answer&#32;x" id="answer-form"'))).toEqual([]);
    expect(findings(swap(form, '<form class="answer&#45;x" id="answer-form"'))).toContain('[answer] no answer block (form#answer-form.answer in #answer) with the option, the open questions, the changes and Copy answer');
  });

  it('compares a link\'s fragment with the ids as the browser does, both decoded once', () => {
    expect(findings(atEnd('<p><span id="answer&#45;note">x</span><a href="#answer&#45;note">note</a> <a href="#answer&#45;form">answer</a></p>'))).toEqual([]);
    expect(findings(atEnd('<p><a href="#answer&#45;nothing">nowhere</a></p>'))).toEqual(['[links] a link to #answer&#45;nothing, which the page does not have']);
  });

  // The browser's id is the attribute decoded once: id="&amp;#97;" is the literal &#97;, which a mark may not carry.
  // The &amp;amp;#97; row is no double-decoding row: it decodes to the literal &amp;#97;, still refused, and checks
  // that the message's value repeats the id as written, escapes and all.
  it.each([
    ['decoded once, as the browser reads it', '&amp;#97;'],
    ['repeated as written in the message\'s value', '&amp;amp;#97;'],
  ])('judges the id of the logo definition %s: %s', (_, id) => {
    const logoPage = readFileSync(path.join(skill, 'assets/proposals/docs-redesign/r1/proposal.html'), 'utf8');
    const html = logoPage.replaceOrFail('<path d="M10 10h12v12H10z"/></symbol>', `<path id="${id}" d="M10 10h12v12H10z"/></symbol>`);
    expect(findings(html)).toEqual([`[mark] the logo definition (svg.brand-defs) carries id="${id}", which points outside the page or runs code`]);
  });

  it('accepts an https link to the tracker issue in the top bar\'s page facts only', () => {
    const facts = swap('revision <code>r1</code>, 2026-11-20</span>', 'revision <code>r1</code>, 2026-11-20, <a href="https://tracker.example/issues/1">issue 1</a></span>');
    expect(findings(facts)).toEqual([]);
    expect(findings(facts.replaceOrFail('https://tracker.example', 'http://tracker.example'))).toEqual(['[external] <a href="http://tracker.example/issues/1"> points outside the page']);
  });

  it.each([
    ['closed by its span, so a browser keeps it open and copies it into later blocks', '<a href="https://tracker.example/issues/1">issue 1</span>'],
    ['with an element inside it', '<a href="https://tracker.example/issues/1"><b>issue 1</b></a></span>'],
    ['in facts that hold a block a browser would close them at', '<a href="https://tracker.example/issues/1">issue 1</a><div></div></span>'],
  ])('reports a facts link %s', (_, link) => {
    const found = findings(swap('revision <code>r1</code>, 2026-11-20</span>', `revision <code>r1</code>, 2026-11-20, ${link}`));
    expect(found.filter((f) => f.startsWith('[external] <a href="https://tracker.example/issues/1"> points outside the page')), found.join('\n')).toHaveLength(1);
  });

  it.each([
    ['a second .topbar-meta outside the top bar', '<p class="topbar-meta"><span><a href="https://tracker.example/issues/1">issue 1</a></span></p>'],
    ['a second whole top bar', '<div class="topbar"><div class="topbar-in"><p class="topbar-meta"><span><a href="https://tracker.example/issues/1">issue 1</a></span></p></div></div>'],
  ])('reports an https link in %s', (_, html) => {
    const found = findings(atEnd(html));
    expect(found.filter((f) => f.startsWith('[external] <a href="https://tracker.example/issues/1"> points outside the page')), found.join('\n')).toHaveLength(1);
  });

  it.each([
    ['missing', (h) => h.replaceOrFail(/<meta http-equiv="Content-Security-Policy"[^>]*>\n/, '')],
    ['loosened', (h) => h.replaceOrFail("default-src 'none'", "default-src *")],
    ['after a style', (h) => h.replaceOrFail(/(<meta http-equiv="Content-Security-Policy"[^>]*>)\n/, '').replaceOrFail('</head>', `${/<meta http-equiv="Content-Security-Policy"[^>]*>/.exec(h)[0]}\n</head>`)],
    ['in the body', (h) => h.replaceOrFail(/(<meta http-equiv="Content-Security-Policy"[^>]*>)\n/, '').replaceOrFail('</main>', `${/<meta http-equiv="Content-Security-Policy"[^>]*>/.exec(h)[0]}</main>`)],
    ['outside a head element, though first', (h) => h.replaceOrFail('<head>\n', '').replaceOrFail('</head>\n', '')],
    ['twice', (h) => h.replaceOrFail(/(<meta http-equiv="Content-Security-Policy"[^>]*>)/, '$1$1')],
    ['after a paragraph, which closes the head', (h) => h.replaceOrFail(/(<meta http-equiv="Content-Security-Policy")/, '<p>x</p>$1')],
    ['after plain text, which closes the head', (h) => h.replaceOrFail(/(<meta http-equiv="Content-Security-Policy")/, 'text $1')],
    ['after a div, which closes the head', (h) => h.replaceOrFail(/(<meta http-equiv="Content-Security-Policy")/, '<div></div>$1')],
    ['after the end of the head', (h) => h.replaceOrFail(/(<meta http-equiv="Content-Security-Policy"[^>]*>)\n/, '').replaceOrFail('<body>', `${/<meta http-equiv="Content-Security-Policy"[^>]*>/.exec(h)[0]}\n<body>`)],
  ])('requires the skeleton\'s Content-Security-Policy meta: %s', (_, change) => {
    const found = findings(change(page));
    expect(found.filter((f) => f.startsWith('[frame] the Content-Security-Policy meta')), found.join('\n')).toHaveLength(1);
  });

  it('accepts a title before the Content-Security-Policy meta, which a browser keeps in the head', () => {
    const title = /<title>[^<]*<\/title>\n/.exec(page)[0];
    expect(findings(page.replaceOrFail(title, '').replaceOrFail(/(<meta http-equiv="Content-Security-Policy")/, `${title}$1`))).toEqual([]);
  });

  it('requires both page scripts byte for byte, since the policy allows them by hash', () => {
    const found = findings(swap('// Frame script of the proposal page:', '//  Frame script of the proposal page:'));
    expect(found.filter((f) => f.startsWith('[frame] the frame-js block differs'))).toHaveLength(1);
  });

});

describe('check-proposal.mjs on a page it cannot finish', () => {
  // chmod 000 keeps a file from a user who is not root on a POSIX system; root reads it anyway and Windows ignores it.
  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('ends with a finding and exit 1, never an uncaught error', () => {
    const dir = tempDir();
    const file = path.join(dir, 'proposal.html');
    cpSync(path.join(skill, 'assets/proposals/team-tasks/r1/proposal.html'), file);
    chmodSync(file, 0o000);
    locked.push(file);
    const out = silent();
    expect(check.main([file], out.io)).toBe(1);
    expect(out.out[0]).toMatch(/^proposal\.html: \[external\] the check stopped on an unexpected error \(.+\); the page is not clean$/);
  });
});

describe('the skeleton\'s Content-Security-Policy', () => {
  const tpl = readFileSync(path.join(skill, 'templates/proposal.html'), 'utf8');
  const hash = (id) => createHash('sha256').update(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`).exec(tpl)[1]).digest('base64');

  it('allows no network, data: images, inline styles and exactly the two page scripts by their hashes', () => {
    const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(tpl)?.[1];
    expect(csp).toBe(`default-src 'none'; script-src 'sha256-${hash('frame-js')}' 'sha256-${hash('answer-js')}'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'`);
  });
});

describe('check-proposal.mjs on the record folder', { timeout: SURVEY_TIMEOUT }, () => {
  const example = path.join(skill, 'assets/proposals/team-tasks/r1');
  const copy = (pageId, revision) => { const dir = path.join(tempDir(), pageId, revision); mkdirSync(path.dirname(dir), { recursive: true }); cpSync(example, dir, { recursive: true }); return dir; };

  it.each([
    ['Team_Tasks', 'r1', 'Team_Tasks: [record] the page id is lower-case letters, digits and single hyphens'],
    ['team--tasks', 'r1', 'team--tasks: [record] the page id is lower-case letters, digits and single hyphens'],
    ['team-tasks', 'rev1', 'rev1: [record] a revision folder is r1, r2, and so on'],
    ['team-tasks', 'r0', 'r0: [record] a revision folder is r1, r2, and so on'],
  ])('refuses the folder %s/%s', (pageId, revision, finding) => {
    expect(check.checkTarget(copy(pageId, revision))).toContain(finding);
  });

  it.each([
    ['42', ['survey.json: [record] not a JSON object; write it with survey-app.mjs --out']],
    ['{"brandDefs":5}', ['survey.json: [record] brandDefs is neither text nor null; write it with survey-app.mjs --out']],
    ['{"look":{"bg":1}}', ['survey.json: [record] look is not an object of text values; write it with survey-app.mjs --out']],
    ['{"brandMark":{"kind":"svg"}}', ['survey.json: [record] brandMark of kind svg holds no svg text; write it with survey-app.mjs --out']],
    ['{"brandMark":{"kind":"raster"}}', ['survey.json: [record] brandMark of kind raster holds no src text; write it with survey-app.mjs --out']],
    ['{"variants":{"a":1}}', ['survey.json: [record] variants is not an object of text values; write it with survey-app.mjs --out']],
    ['null', ['survey.json: [record] not a JSON object; write it with survey-app.mjs --out']],
  ])('reports a survey.json of the wrong shape (%s) as a record finding and still checks the page and CHOICE.md', (text, want) => {
    const dir = copy('team-tasks', 'r1');
    writeFileSync(path.join(dir, 'survey.json'), text);
    expect(check.checkTarget(dir)).toEqual(want);
  });

  it('reports a mark the survey gives without an element as a mark finding, not a stop', () => {
    const dir = path.join(tempDir(), 'docs-redesign', 'r1');
    mkdirSync(path.dirname(dir), { recursive: true });
    cpSync(path.join(skill, 'assets/proposals/docs-redesign/r1'), dir, { recursive: true });
    const file = path.join(dir, 'survey.json');
    const data = JSON.parse(readFileSync(file, 'utf8'));
    expect(data.brandMark.kind).toBe('svg');
    const page = readFileSync(path.join(dir, 'proposal.html'), 'utf8');
    const use = '<svg aria-hidden="true"><use href="#brand-mark"/></svg>';
    expect(page).toContain(use);
    writeFileSync(path.join(dir, 'proposal.html'), page.replaceAll(use, data.brandMark.svg).replaceOrFail(/<svg class="brand-defs"[\s\S]*?<\/svg>\n?/, ''));
    writeFileSync(file, JSON.stringify({ ...data, brandDefs: null, brandMark: { ...data.brandMark, svg: 'just text no element' } }));
    const found = check.checkTarget(dir);
    expect(found.some((f) => f.includes('unexpected error'))).toBe(false);
    expect(found.filter((f) => f.includes('brandMark holds no element')).length).toBeGreaterThan(0);
  });

  // A link would let the record name a file elsewhere; the check names it and reads nothing through it.
  it.skipIf(process.platform === 'win32').each(['survey.json', 'CHOICE.md'])('refuses %s as a symbolic link, even one to an identical file', (name) => {
    const dir = copy('team-tasks', 'r1');
    const real = path.join(tempDir(), name);
    cpSync(path.join(dir, name), real);
    rmSync(path.join(dir, name));
    symlinkSync(real, path.join(dir, name));
    expect(check.checkTarget(dir)).toEqual([`${name}: [record] a symbolic link, which the check does not follow; keep the file itself in the revision folder`]);
  });

  it('checks Chosen against the options in a replaced revision too', () => {
    const dir = copy('team-tasks', 'r1');
    const file = path.join(dir, 'CHOICE.md');
    const text = readFileSync(file, 'utf8');
    expect(text).toMatch(/^- Status: replaced$/m);
    writeFileSync(file, text.replaceOrFail(/^- Chosen: a$/m, '- Chosen: d'));
    expect(check.checkTarget(dir)).toEqual(['CHOICE.md: [choice] Chosen "d" is not one of a, b, c']);
  });

  it.each([
    ['proposal.html', (dir, size) => { const html = readFileSync(path.join(dir, 'proposal.html'), 'utf8'); writeFileSync(path.join(dir, 'proposal.html'), html.replaceOrFail('</html>', `<!--${'x'.repeat(size - Buffer.byteLength(html) - 7)}--></html>`)); }],
    ['CHOICE.md', (dir, size) => { const text = readFileSync(path.join(dir, 'CHOICE.md'), 'utf8'); writeFileSync(path.join(dir, 'CHOICE.md'), `${text}${'x'.repeat(size - Buffer.byteLength(text))}`); }],
  ])('reads %s of exactly its cap and refuses one byte more', (name, grow) => {
    const atCap = copy('team-tasks', 'r1');
    grow(atCap, check.CAPS[name]);
    expect(check.checkTarget(atCap).filter((f) => f.includes('byte cap'))).toEqual([]);
    const over = copy('team-tasks', 'r1');
    grow(over, check.CAPS[name] + 1);
    expect(check.checkTarget(over)).toContain(`${name}: [record] ${check.CAPS[name] + 1} bytes, over the ${check.CAPS[name]} byte cap; it is not read`);
  }, CAP_TIMEOUT);
});
