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

describe('survey-app.mjs on the stock shell', () => {
  it('gives the address the shell\'s router writes, /?screen=<route without the slash>, when the menu builds no link', () => {
    const { links } = survey.survey(realApp());
    expect(links.screens.map((x) => [x.route, x.link])).toEqual([['/blank-home', '/?screen=blank-home']]);
    expect(links.screens[0].source).toMatch(/router/);
    expect(links.mismatch).toBe(true);
  });
});
