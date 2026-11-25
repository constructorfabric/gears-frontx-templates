/**
 * survey-app.mjs on a project made from the real templates: the shell's own
 * files (template-shell) and a copy of the screen scaffold every screen is
 * made from (template-mfe's _blank-mfe), copied into a temp folder, never
 * written inside the repository. Only the files the survey reads are copied
 * (SHELL_FILES); the kit is the fixture's cut-down theme.css, as the kit is
 * not installed in the repository.
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import './replace-or-fail.mjs';
import { FILES, writeTopApp } from './proposal-fixture.mjs';
import { expectLinear } from './linear-time.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, '../..');
const skill = path.join(here, '../.frontx/ai/@gears-frontx/template-design-guardrails/skills/frontx-design-proposal');
const survey = await import(pathToFileURL(path.join(skill, 'scripts/survey-app.mjs')).href);

/**
 * The shell files the survey reads for the look, the nav and the links: the app name (index.html), the layout, the
 * themes, the logo, the menu's own CSS (components/ui), the global CSS. The rest of src-app (api, mfe, actions, i18n)
 * changes only the services and mocks lists, which these tests do not assert.
 */
const SHELL_FILES = [
  'index.html',
  'src-app/app/layout',
  'src-app/app/themes',
  'src-app/app/icons',
  'src-app/app/components/ui',
  'src-app/app/globals.css',
  'src-app/app/font.css',
];
const SCAFFOLD = path.join(repo, 'template-mfe/src-app/mfe_packages/_blank-mfe');
const SCREEN_CSS = 'src-app/mfe_packages/blank-mfe/src/screens/home/HomeScreen.module.css';

const temps = [];
afterAll(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true }); });

/**
 * The stock shell plus a copy of _blank-mfe as blank-mfe, with templateExample deleted from its mfe.json as the shell's
 * empty menu hint says, so it reaches the menu.
 */
const realApp = () => {
  const root = mkdtempSync(path.join(tmpdir(), 'fx-proposal-real-'));
  temps.push(root);
  for (const rel of SHELL_FILES) cpSync(path.join(repo, 'template-shell', rel), path.join(root, rel), { recursive: true });
  const blank = path.join(root, 'src-app/mfe_packages/blank-mfe');
  cpSync(SCAFFOLD, blank, { recursive: true, filter: (src) => !src.split(path.sep).includes('node_modules') });
  const manifest = JSON.parse(readFileSync(path.join(blank, 'mfe.json'), 'utf8'));
  delete manifest.templateExample;
  writeFileSync(path.join(blank, 'mfe.json'), JSON.stringify(manifest, null, 2));
  const kit = path.join(root, 'node_modules/@gears-frontx/ui-kit/dist');
  mkdirSync(kit, { recursive: true });
  writeFileSync(path.join(kit, 'theme.css'), FILES['node_modules/@gears-frontx/ui-kit/dist/theme.css']);
  return root;
};
const edit = (root, rel, from, to) => {
  const file = path.join(root, rel);
  writeFileSync(file, readFileSync(file, 'utf8').replaceOrFail(from, to));
  return root;
};

describe('survey-app.mjs on the scaffold\'s own class names and breakpoints', () => {
  it('reads the title from .title and the page background from .screen, naming the scaffold file', () => {
    const root = edit(realApp(), SCREEN_CSS, '.title {\n  font-size: var(--text-heading-1-size);', '.title {\n  font-size: 2.5rem;');
    edit(root, SCREEN_CSS, '.screen {\n', '.screen {\n  background: #fdf6e3;\n');
    const result = survey.survey(root);
    // 40 px is drawn at round(40 * 1120 / 1440) = 31 px by the scale rule.
    expect([result.look.h1, result.lookReal.h1, result.look.bg]).toEqual(['31px', '40px', '#fdf6e3']);
    expect(result.lookFrom.h1).toBe(`${SCREEN_CSS} .title font-size`);
    expect(result.lookFrom.bg).toBe(`${SCREEN_CSS} .screen background (screen)`);
  });

  it('reads a kit token .screen re-declares as the screen\'s own, naming .screen', () => {
    const result = survey.survey(edit(realApp(), SCREEN_CSS, '.screen {\n', '.screen {\n  --primary: #123456;\n'));
    expect([result.look.accent, result.lookFrom.accent]).toEqual(['#123456', `${SCREEN_CSS} .screen --primary`]);
  });

  it('reads @media (min-width: 40rem) as a frame of 640 px', () => {
    const root = edit(realApp(), SCREEN_CSS, '.title {\n  font-size: var(--text-heading-1-size);', '.title {\n  font-size: 2rem;\n}\n@media (min-width: 40rem) {\n  .title { font-size: 3rem; }\n}\n.unused {');
    const result = survey.survey(root);
    expect([result.lookReal.h1, result.look['h1-phone']]).toEqual(['48px', '32px']);
    expect(result.lookFrom.h1).toBe(`${SCREEN_CSS} .title (from 640 px) font-size`);
  });

  it('lists the title role as unresolved, with the file it looked in, when the screen has no title rule', () => {
    const root = edit(realApp(), SCREEN_CSS, /\.title \{[^}]*\}/, '');
    const result = survey.survey(root);
    expect(result.unresolved).toEqual(expect.arrayContaining(['look.h1', 'look.h1-phone', 'look.h1-weight', 'look.h1-track']));
    expect(result.look.h1).toBe(survey.UNRESOLVED);
    expect(result.lookFrom.h1).toContain(SCREEN_CSS);
  });
});

/** Moves default: true from the stock default theme to the given theme file. */
const withDefault = (root, theme) => {
  edit(root, 'src-app/app/themes/default.ts', '  default: true,\n', '');
  return edit(root, `src-app/app/themes/${theme}`, "  appearance: 'dark',\n", "  appearance: 'dark',\n  default: true,\n");
};
const COLOUR_ROLES = ['bg', 'surface', 'text', 'accent', 'nav-bg', 'nav-text'];

describe('survey-app.mjs on a theme built from spreads', () => {
  it('leaves the colour keys of the real Dracula default unresolved, naming the palette file, never the kit palette', () => {
    const result = survey.survey(withDefault(realApp(), 'dracula.ts'));
    expect(result.lookSources.theme).toBe('src-app/app/themes/dracula.ts');
    expect(COLOUR_ROLES.map((k) => result.look[k])).toEqual(COLOUR_ROLES.map(() => survey.UNRESOLVED));
    expect(result.unresolved).toEqual(expect.arrayContaining(COLOUR_ROLES.map((k) => `look.${k}`)));
    // The scaffold's .screen sets no background; the shell's .screen takes --background, which the palette builds in code.
    expect(result.lookFrom.bg).toMatch(/^src-app\/app\/layout\/Screen\.module\.css \.screen background-color \(shell\): src-app\/app\/themes\/dracula\.ts spreads draculaKitColors from src-app\/app\/themes\/draculaPalette\.ts, which builds --background in code/);
    expect(result.lookFrom.accent).toMatch(/^src-app\/app\/themes\/dracula\.ts spreads draculaKitColors from src-app\/app\/themes\/draculaPalette\.ts, which builds --primary in code/);
    expect(result.lookFrom['nav-bg']).toMatch(/^src-app\/app\/themes\/dracula\.ts spreads draculaShellColors from src-app\/app\/themes\/draculaPalette\.ts, which builds --left-menu in code/);
  });

  it('leaves the colour keys unresolved when the theme spreads an object from a package', () => {
    const root = realApp();
    writeFileSync(path.join(root, 'src-app/app/themes/default.ts'), "import { brand } from '@acme/palette';\nexport const defaultTheme = { id: 'default', appearance: 'light', default: true, variables: { ...brand, '--left-menu': '#000000' } };\n");
    const result = survey.survey(root);
    expect(COLOUR_ROLES.map((k) => result.look[k])).toEqual(COLOUR_ROLES.map(() => survey.UNRESOLVED));
    expect(result.lookFrom.accent).toBe('src-app/app/themes/default.ts spreads brand from @acme/palette, which the survey does not read: the colours of the theme are not known');
  });

  it('follows a spread of literal pairs from the same file and from a file of the themes folder', () => {
    const root = realApp();
    writeFileSync(path.join(root, 'src-app/app/themes/palette.ts'), "export const shell = {\n  '--left-menu': '#202020',\n  '--left-menu-foreground': '#eeeeee',\n};\n");
    writeFileSync(path.join(root, 'src-app/app/themes/default.ts'), "import { shell } from './palette';\nconst base = { '--background': '#101010', '--primary': '#ff0066' };\nexport const defaultTheme = { id: 'default', appearance: 'light', default: true, variables: { ...base, ...shell } };\n");
    const result = survey.survey(root);
    expect([result.look.accent, result.look['nav-bg'], result.look['nav-text']]).toEqual(['#ff0066', '#202020', '#eeeeee']);
    expect([result.lookFrom.accent, result.lookFrom['nav-bg']]).toEqual(['src-app/app/themes/default.ts --primary', 'src-app/app/themes/palette.ts --left-menu']);
  });
});

/** A default theme whose variables object is `variables`, after `head` (imports, consts), with `tail` after it. */
const themeWith = (root, variables, head = '', tail = '') => {
  writeFileSync(path.join(root, 'src-app/app/themes/default.ts'), `${head}export const defaultTheme = { id: 'default', appearance: 'light', default: true, variables: { ${variables} } };\n${tail}`);
  return root;
};
const accentOf = (root) => { const result = survey.survey(root); return [result.look.accent, result.lookFrom.accent]; };

describe('survey-app.mjs reads the spreads and pairs of the theme\'s own variables object, in source order', () => {
  it.each([
    ['a "..." in a string', "export const hint = 'Loading...';\n"],
    ['a rest parameter', 'const f = (...args) => args;\n'],
    ['an array spread', "const list = [...['a']];\n"],
  ])('ignores %s outside the variables object', (what, head) => {
    expect(accentOf(themeWith(realApp(), "'--primary': '#ff0066'", head))).toEqual(['#ff0066', 'src-app/app/themes/default.ts --primary']);
  });

  it.each([
    ['a theme without default: true written before it', "export const lightTheme = { id: 'light', appearance: 'light', variables: { '--primary': '#111111' } };\n"],
    ['a type alias with a variables object', "type Shape = { variables: { [name: string]: string } };\n"],
  ])('reads the variables of the object that says default: true, not of %s', (what, head) => {
    expect(accentOf(themeWith(realApp(), "'--primary': '#ff0066'", head))).toEqual(['#ff0066', 'src-app/app/themes/default.ts --primary']);
  });

  it('leaves the colours unresolved when default: true is said only by a type', () => {
    const root = realApp();
    writeFileSync(path.join(root, 'src-app/app/themes/default.ts'), "interface Shape { default: true }\nexport const defaultTheme = { id: 'default', appearance: 'light', variables: { '--primary': '#ff0066' } };\n");
    expect(accentOf(root)).toEqual([survey.UNRESOLVED, 'src-app/app/themes/default.ts says default: true in a type or interface declaration, so the survey cannot tell which object is the theme: the colours of the theme are not known']);
  });

  const THEME = "export const t = { id:'dark', appearance:'dark', default: true, variables:{'--primary':'#ff0066'} };\n";
  it.each([
    ['a type declaration with a default type parameter', "type Theme<T = string> = { default: true; variables: {'--primary':'#00ff00'} };\n" + THEME, 'a type or interface declaration'],
    ['an interface whose variables hold a pair', "interface Shape { default: true; variables: { '--primary': '#00ff00' } }\n" + THEME, 'a type or interface declaration'],
    ['an object nested in another object', "export const t = { id:'d', variables:{'--primary':'#ff0066'}, meta:{ default: true } };\n", 'an object nested in another object'],
    ['two top-level objects', THEME + "export const u = { id:'u', appearance:'dark', default: true, variables:{'--primary':'#00ff00'} };\n", 'more than one top-level object'],
    ['an object passed to a call', "export const t = defineTheme({ id:'d', default: true, variables:{'--primary':'#ff0066'} });\n", 'an object that is not a top-level const literal'],
  ])('leaves every colour key unresolved, naming the file and the case, for default: true in %s', (what, source, why) => {
    const root = realApp();
    writeFileSync(path.join(root, 'src-app/app/themes/default.ts'), source);
    const result = survey.survey(root);
    expect(COLOUR_ROLES.map((k) => result.look[k])).toEqual(COLOUR_ROLES.map(() => survey.UNRESOLVED));
    expect(result.lookFrom.accent).toBe(`src-app/app/themes/default.ts says default: true in ${why}, so the survey cannot tell which object is the theme: the colours of the theme are not known`);
    expect(result.lookSources.themeId).toBe(survey.UNRESOLVED);
  });

  it('takes the theme id and appearance from the object the colours come from, not from a theme written before it', () => {
    const root = realApp();
    writeFileSync(path.join(root, 'src-app/app/themes/default.ts'), "export const light = { id:'light', appearance:'light', variables:{'--primary':'#111111'} };\n"
      + "export const t = { id:'dark', appearance:'dark', default: true, variables:{'--primary':'#ff0066'} };\n");
    const result = survey.survey(root);
    expect([result.look.accent, result.lookSources.themeId, result.lookSources.appearance]).toEqual(['#ff0066', 'dark', 'dark']);
  });

  it('ignores a commented-out pair', () => {
    expect(accentOf(themeWith(realApp(), "'--primary': '#ff0066',\n    // '--primary': '#00ff00',\n"))[0]).toBe('#ff0066');
  });

  it('lets a later entry win, as JS does: a spread after a pair, and a pair after a spread', () => {
    const base = "const base = { '--primary': '#aa0000' };\n";
    expect(accentOf(themeWith(realApp(), "'--primary': '#00ff00', ...base", base))).toEqual(['#aa0000', 'src-app/app/themes/default.ts --primary']);
    expect(accentOf(themeWith(realApp(), "...base, '--primary': '#00ff00'", base))[0]).toBe('#00ff00');
  });

  it('marks a pair the theme itself builds in code after a spread as built in code, not the spread\'s value', () => {
    const [accent, from] = accentOf(themeWith(realApp(), "...base, '--primary': mk('#f00')", "const base = { '--primary': '#aa0000' };\n"));
    expect(accent).toBe(survey.UNRESOLVED);
    expect(from).toMatch(/^src-app\/app\/themes\/default\.ts builds --primary in code/);
  });

  it('finds an imported name that holds a $', () => {
    const root = realApp();
    writeFileSync(path.join(root, 'src-app/app/themes/pal.ts'), "export const $tokens = { '--primary': '#abcdef' };\n");
    expect(accentOf(themeWith(root, '...$tokens', "import { $tokens } from './pal';\n"))).toEqual(['#abcdef', 'src-app/app/themes/pal.ts --primary']);
  });

  it('leaves the colour keys unresolved for a spread of a spread: the survey follows one level', () => {
    const result = survey.survey(themeWith(realApp(), '...outer', "const inner = { '--primary': '#aa0000' };\nconst outer = { ...inner, '--card': '#ffffff' };\n"));
    expect(COLOUR_ROLES.map((k) => result.look[k])).toEqual(COLOUR_ROLES.map(() => survey.UNRESOLVED));
    expect(result.lookFrom.accent).toBe('src-app/app/themes/default.ts spreads outer from src-app/app/themes/default.ts, which spreads another object: the survey follows one level, so the colours of the theme are not known');
  });
});

const BLOCKED = 'src-app/app/themes/default.ts spreads brand from @acme/palette, which the survey does not read: the colours of the theme are not known';
/** A theme whose colours are not known: it spreads an object from a package. */
const blockedTheme = (root, more = '') => themeWith(root, `...brand${more}`, "import { brand } from '@acme/palette';\n");
const addCss = (root, rel, css) => edit(root, rel, /$/, `\n${css}\n`);

describe('survey-app.mjs matches class names whole', () => {
  it('does not take .screen-header for the page root', () => {
    const result = survey.survey(addCss(realApp(), SCREEN_CSS, '.screen-header { background-color: #abcdef; --primary: #ff00ff; }'));
    expect([result.look.bg, result.lookFrom.bg]).toEqual(['#f1f5f9', 'src-app/app/layout/Screen.module.css .screen background-color (shell)']);
    expect([result.look.accent, result.lookFrom.accent]).toEqual(['#0065e3', 'kit theme.css --primary']);
  });

  it('does not take .menu-item for the menu the logo inherits its colour from', () => {
    const result = survey.survey(edit(realApp(), 'src-app/app/components/ui/sidebar.module.css', /^/, '.menu-item { color: #ff0000; }\n'));
    expect([result.look['mark-color'], result.lookFrom['mark-color']]).toEqual(['color-mix(in oklab, #f1f5f9 70%, #0f172a)', 'src-app/app/components/ui/sidebar.module.css .sidebar color']);
  });

  it('does not take .title-bar for the title or .description-x for the lead', () => {
    const result = survey.survey(edit(realApp(), SCREEN_CSS, '.intro {', '.title-bar { font-size: 3rem; }\n.description-x { font-size: 3rem; }\n.intro {'));
    expect([result.lookFrom.h1, result.lookFrom.lead]).toEqual([`${SCREEN_CSS} .title font-size`, `${SCREEN_CSS} .description font-size`]);
  });

  it('resolves the shell\'s page background without the screen\'s own token bridge: the shell is outside the screen', () => {
    const result = survey.survey(edit(realApp(), SCREEN_CSS, '.screen {\n', '.screen {\n  --background: #123456;\n'));
    expect([result.look.bg, result.lookFrom.bg]).toEqual(['#f1f5f9', 'src-app/app/layout/Screen.module.css .screen background-color (shell)']);
  });

  it('leaves a role the kit answers unresolved, with the theme\'s reason, when the theme builds its kit token in code', () => {
    const result = survey.survey(themeWith(realApp(), "'--text-meta-size': mk('12px')"));
    expect([result.look.small, result.lookFrom.small]).toEqual([survey.UNRESOLVED, 'src-app/app/themes/default.ts builds --text-meta-size in code (a call or a template, not a literal): the survey does not run it']);
  });

  it('names the page background rule whose value it cannot resolve', () => {
    const result = survey.survey(addCss(realApp(), SCREEN_CSS, '.root { background-color: var(--nope); }'));
    expect([result.look.bg, result.lookFrom.bg]).toEqual([survey.UNRESOLVED, `${SCREEN_CSS} .root background-color (screen): a value the survey cannot resolve`]);
  });
});

describe('survey-app.mjs never puts the kit palette under an app file\'s name when the theme is blocked or builds a token in code', () => {
  it('leaves a screen\'s colours unresolved when they come through the kit, naming the rule and the theme reason', () => {
    const result = survey.survey(addCss(blockedTheme(realApp()), SCREEN_CSS, '.root { background-color: var(--background); --primary: var(--info); }'));
    expect([result.look.bg, result.look.accent]).toEqual([survey.UNRESOLVED, survey.UNRESOLVED]);
    expect(result.lookFrom.bg).toBe(`${SCREEN_CSS} .root background-color (screen): ${BLOCKED}`);
    expect(result.lookFrom.accent).toBe(BLOCKED);
  });

  it('keeps the screen\'s own literal values when the theme is blocked', () => {
    const result = survey.survey(addCss(blockedTheme(realApp()), SCREEN_CSS, '.root { background-color: #fafafa; --primary: #123456; }'));
    expect([result.look.bg, result.look.accent]).toEqual(['#fafafa', '#123456']);
    expect([result.lookFrom.bg, result.lookFrom.accent]).toEqual([`${SCREEN_CSS} .root background-color (screen)`, `${SCREEN_CSS} .root --primary`]);
  });

  it('leaves the logo colour unresolved when the menu\'s rule resolves it through the kit', () => {
    const result = survey.survey(blockedTheme(realApp(), ", '--left-menu-foreground': 'var(--foreground)'"));
    expect(result.look['mark-color']).toBe(survey.UNRESOLVED);
    expect(result.lookFrom['mark-color']).toBe(`src-app/app/components/ui/sidebar.module.css .sidebar color: ${BLOCKED}`);
  });

  it('leaves the header link and band colours unresolved when they come through the kit, and keeps a band the screen colours itself', () => {
    const root = writeTopApp(mkdtempSync(path.join(tmpdir(), 'fx-proposal-real-')));
    temps.push(root);
    edit(root, 'src-app/app/themes/default.ts', /variables: \{/, 'variables: {\n    ...mystery(),');
    edit(root, 'src-app/app/layout/Menu.module.css', 'font-size: 14px; color: #1d2433;', 'font-size: 14px; color: var(--danger-foreground);');
    const home = 'src-app/mfe_packages/home-mfe/src/screens/home/HomeScreen.module.css';
    const why = 'src-app/app/themes/default.ts spreads mystery(), which the survey does not read: the colours of the theme are not known';
    let result = survey.survey(root);
    expect([result.look.toplink, result.lookFrom.toplink]).toEqual([survey.UNRESOLVED, `src-app/app/layout/Menu.module.css .link color: ${why}`]);
    // .hero takes --primary from the screen's own .root: it stands.
    expect([result.look['band-bg'], result.lookFrom['band-bg']]).toEqual(['#2f6fd6', `${home} .hero background-color`]);
    result = survey.survey(edit(root, home, '.hero { background-color: var(--primary);', '.hero { background-color: var(--info);'));
    expect([result.look['band-bg'], result.lookFrom['band-bg']]).toEqual([survey.UNRESOLVED, `${home} .hero background-color: ${why}`]);
  });

  it('keeps the screen\'s own value of a token the theme builds in code', () => {
    const root = themeWith(realApp(), '...base', "const base = { '--primary': mk('#f00') };\n");
    expect(accentOf(addCss(root, SCREEN_CSS, '.root { --primary: #123456; }'))).toEqual(['#123456', `${SCREEN_CSS} .root --primary`]);
  });

  it('does not let the next token of the list stand for one the theme builds in code', () => {
    const result = survey.survey(themeWith(realApp(), "'--success': '#00aa00', '--success-foreground': mk('#0a0')"));
    expect(result.look.ok).toBe(survey.UNRESOLVED);
    expect(result.lookFrom.ok).toMatch(/^src-app\/app\/themes\/default\.ts builds --success-foreground in code/);
  });

  it('gives a rule\'s own reason, not that of a kit token the theme builds in code', () => {
    const root = themeWith(realApp(), '...base', "const base = { '--text-heading-1-size': mk('2rem') };\n");
    const result = survey.survey(addCss(root, SCREEN_CSS, '.pageTitle { font-size: var(--zzz); }'));
    expect(result.lookFrom.h1).toBe(`${SCREEN_CSS} .pageTitle font-size: a value the survey cannot resolve`);
  });
});

describe('survey-app.mjs reads theme spreads in time linear in their number', { timeout: 600_000 }, () => {
  const rows = (build) => {
    const roots = new Map();
    const at = (n) => { if (!roots.has(n)) roots.set(n, build(n)); return roots.get(n); };
    return { at, done: () => { for (const root of roots.values()) rmSync(root, { recursive: true, force: true }); } };
  };

  it('a theme of many spreads of one const declared after it, whose object grows with them', () => {
    // n spreads of one const that grows with them (80 characters a spread, in an entry that is no pair): reading the const
    // once per spread, not once per name, would grow as their square.
    const { at, done } = rows((n) => themeWith(realApp(), `${'...base, '.repeat(n)}'--card': '#ffffff'`, '', `const base = { '--primary': '#aa0000', pad: '${'x'.repeat(80 * n)}' };\n`));
    try { expect(accentOf(at(500))[0]).toBe('#aa0000'); expectLinear((n) => survey.survey(at(n)), 500, 'theme spreads of one local const'); } finally { done(); }
  });

  it('a theme of spreads of many names imported from one large file', () => {
    // n distinct names exported by one file of n consts: reading the file once per name, not once, would grow as their square.
    const names = (n) => Array.from({ length: n }, (_, i) => `c${i}`);
    const { at, done } = rows((n) => {
      const root = realApp();
      writeFileSync(path.join(root, 'src-app/app/themes/pal.ts'), `${names(n).map((c, i) => `export const ${c} = { '--p${i}': '#000000' };\n`).join('')}export const big = { '--primary': '#abcdef' };\n`);
      return themeWith(root, `${names(n).map((c) => `...${c}, `).join('')}...big, '--card': '#ffffff'`, [...names(n), 'big'].map((c) => `import { ${c} } from './pal';\n`).join(''));
    });
    try { expect(accentOf(at(1000))[0]).toBe('#abcdef'); expectLinear((n) => survey.survey(at(n)), 1000, 'theme spreads of many imported names'); } finally { done(); }
  });

  it('a menu that imports one large file many times', () => {
    // The imported file grows with the imports (40 characters an import), so reading it once per import would grow as their square.
    const { at, done } = rows((n) => {
      const root = realApp();
      writeFileSync(path.join(root, 'src-app/app/components/ui/big.tsx'), `export const big = 1;\nexport const pad = '${'x'.repeat(40 * n)}';\n`);
      return edit(root, 'src-app/app/layout/Menu.tsx', /^/, "import big from '../components/ui/big';\n".repeat(n));
    });
    try { expect(survey.survey(at(2000)).lookFrom['mark-color']).toBe('src-app/app/components/ui/sidebar.module.css .sidebar color'); expectLinear((n) => survey.survey(at(n)), 2000, 'menu imports of one file'); } finally { done(); }
  });
});

describe('survey-app.mjs on the stock shell', () => {
  // Each fact of the unchanged stock shell has one owner test: the title and the background here, then the logo colour,
  // the nav and the router address, each in its own test below.
  it('reads the unchanged stock shell and scaffold: the title from .title, the background from the shell, and exits 0', () => {
    const root = realApp();
    const result = survey.survey(root);
    // The scaffold's .title is the title; its .screen sets no background, so the page shows the shell's own .screen
    // background, var(--background), which the stock default theme leaves to the kit.
    expect([result.lookFrom.h1, result.lookFrom['h1-weight'], result.lookFrom.lead]).toEqual([`${SCREEN_CSS} .title font-size`, `${SCREEN_CSS} .title font-weight`, `${SCREEN_CSS} .description font-size`]);
    expect([result.look.bg, result.lookFrom.bg, result.unresolved]).toEqual(['#f1f5f9', 'src-app/app/layout/Screen.module.css .screen background-color (shell)', []]);
    expect(survey.main(['--project', root], { log: () => {}, error: () => {} })).toBe(0);
  });
  it('takes the shell\'s global body background when its layout .screen sets none', () => {
    const root = edit(realApp(), 'src-app/app/layout/Screen.module.css', '  background-color: var(--background);\n', '');
    const result = survey.survey(addCss(root, 'src-app/app/globals.css', 'body { background-color: #222222; }'));
    expect([result.look.bg, result.lookFrom.bg]).toEqual(['#222222', 'src-app/app/globals.css body background-color (shell)']);
  });
  it('takes the active theme\'s --background when neither the screen nor the shell sets a page background', () => {
    const root = edit(themeWith(realApp(), "'--background': '#101010'"), 'src-app/app/layout/Screen.module.css', '  background-color: var(--background);\n', '');
    const result = survey.survey(root);
    expect([result.look.bg, result.lookFrom.bg]).toEqual(['#101010', 'src-app/app/themes/default.ts --background (theme)']);
  });
  const SHELL_BG = '  background-color: var(--background);\n';
  it('takes the last of two shell rules for the same element, as CSS does', () => {
    const root = edit(realApp(), 'src-app/app/layout/Screen.module.css', SHELL_BG, '');
    const result = survey.survey(addCss(root, 'src-app/app/globals.css', 'body {background-color:#111111}\nbody {background-color:#eeeeee}'));
    expect([result.look.bg, result.lookFrom.bg]).toEqual(['#eeeeee', 'src-app/app/globals.css body background-color (shell)']);
  });
  it('shows the body behind a shell .screen whose background is transparent', () => {
    const root = edit(realApp(), 'src-app/app/layout/Screen.module.css', SHELL_BG, '  background: transparent;\n');
    const result = survey.survey(addCss(root, 'src-app/app/globals.css', 'body {background-color:#222222}'));
    expect([result.look.bg, result.lookFrom.bg]).toEqual(['#222222', 'src-app/app/globals.css body background-color (shell)']);
  });
  it('names where --background is found when neither the screen nor the shell paints: the kit, or the screen\'s own bridge', () => {
    const kit = survey.survey(edit(realApp(), 'src-app/app/layout/Screen.module.css', SHELL_BG, ''));
    expect([kit.look.bg, kit.lookFrom.bg]).toEqual(['#f1f5f9', 'kit theme.css --background (kit)']);
    const bridged = survey.survey(edit(edit(realApp(), 'src-app/app/layout/Screen.module.css', SHELL_BG, ''), SCREEN_CSS, '.screen {\n', '.screen {\n  --background: #123456;\n'));
    expect([bridged.look.bg, bridged.lookFrom.bg]).toEqual(['#123456', `${SCREEN_CSS} .screen --background (screen)`]);
  });
  it('leaves the logo colour unresolved, naming the rule, when the shell\'s .logo colour cannot be resolved', () => {
    const result = survey.survey(edit(realApp(), 'src-app/app/components/ui/sidebar.module.css', /^/, '.logo { color: var(--nope); }\n'));
    expect([result.look['mark-color'], result.lookFrom['mark-color']]).toEqual([survey.UNRESOLVED, 'src-app/app/components/ui/sidebar.module.css .logo color: a value the survey cannot resolve']);
  });
  it('colours the logo from the menu\'s own CSS module, --left-menu-foreground, not the accent', () => {
    const result = survey.survey(realApp());
    expect(result.brandMark.kind).toBe('svg');
    // The SVG logo takes --left-menu-foreground from the menu's own CSS module: the colour of the menu's text.
    expect([result.look['mark-color'], result.look['nav-text']]).toEqual(['color-mix(in oklab, #f1f5f9 70%, #0f172a)', 'color-mix(in oklab, #f1f5f9 70%, #0f172a)']);
    expect(result.lookFrom['mark-color']).toBe('src-app/app/components/ui/sidebar.module.css .sidebar color');
  });
  it('reads nav from <Menu />, not from the right-hand <Sidebar />: without the menu the header is the nav', () => {
    expect(survey.survey(realApp()).nav).toBe('side');
    const result = survey.survey(edit(realApp(), 'src-app/app/layout/Layout.tsx', '<Menu />', ''));
    expect([result.nav, result.chrome.sources.nav]).toEqual(['top', 'src-app/app/layout/Layout.tsx']);
  });
  it('sorts a screen without an order at 999, as the shell does, so one at 1000 comes after it', () => {
    const root = realApp();
    const file = path.join(root, 'src-app/mfe_packages/blank-mfe/mfe.json');
    const manifest = JSON.parse(readFileSync(file, 'utf8'));
    const screen = manifest.extensions.find((x) => x.route);
    delete screen.presentation.order;
    manifest.extensions.push({ ...screen, id: `${screen.id}-late`, route: '/late', presentation: { ...screen.presentation, label: 'Late', order: 1000 } });
    writeFileSync(file, JSON.stringify(manifest, null, 2));
    expect(survey.survey(root).screens.map((s) => [s.route, s.order])).toEqual([['/blank-home', null], ['/late', 1000]]);
  });

  it('gives the address the shell\'s router writes, /?screen=<route without the slash>, when the menu builds no link', () => {
    const { links } = survey.survey(realApp());
    expect(links.screens.map((x) => [x.route, x.link])).toEqual([['/blank-home', '/?screen=blank-home']]);
    expect(links.screens[0].source).toMatch(/router/);
    expect(links.mismatch).toBe(true);
  });
});
