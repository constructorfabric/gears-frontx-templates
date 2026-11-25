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
import { FILES } from './proposal-fixture.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, '../..');
const skill = path.join(here, '../.frontx/ai/@gears-frontx/template-design-guardrails/skills/frontx-design-proposal');
const survey = await import(pathToFileURL(path.join(skill, 'scripts/survey-app.mjs')).href);

/** The shell files the survey reads: the app name, the layout, the themes, the logo, the menu's own CSS, the global CSS. */
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
    expect(result.lookFrom.bg).toBe(`${SCREEN_CSS} .screen background`);
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
    // The background is unresolved by the scaffold's rule first: its .screen sets none.
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

describe('survey-app.mjs on the stock shell', () => {
  it('colours the logo from the menu\'s own CSS module, --left-menu-foreground, not the accent', () => {
    const result = survey.survey(realApp());
    expect(result.brandMark.kind).toBe('svg');
    expect(result.look['mark-color']).toBe('color-mix(in oklab, #f1f5f9 70%, #0f172a)');
    expect(result.lookFrom['mark-color']).toBe('src-app/app/components/ui/sidebar.module.css .sidebar color');
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
