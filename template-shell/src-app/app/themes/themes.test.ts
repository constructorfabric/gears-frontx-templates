import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import type { ThemeConfig } from '@gears-frontx/react';
import { frontxThemes } from './index';

/*
 * The shell's themes sit on top of the kit's theme.css, which is the one
 * palette. These checks read the installed kit's stylesheet, so a kit release
 * that adds or renames a token fails here instead of in a screen.
 */

// Read from disk, not through a `?raw` import: Vitest hands CSS imports back
// empty, which would let every check below pass on nothing.
const resolveFromHere = createRequire(import.meta.url);
const kitThemeCss = readFileSync(resolveFromHere.resolve('@gears-frontx/ui-kit/theme.css'), 'utf8');
const kitCss = kitThemeCss.replace(/\/\*[\s\S]*?\*\//g, '');

const declaredNames = (css: string): Set<string> =>
  new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]));

/** Every custom property the kit declares, in any block. */
const kitTokens = declaredNames(kitCss);

/**
 * The colour tokens the kit declares per appearance: every block whose
 * selector names `data-theme` light or dark, in any quoting. A `:not(...)`
 * selector (the kit's prefers-color-scheme fallback) names the opposite of
 * what it sets, so it is skipped.
 */
const kitAppearanceTokens = (appearance: 'light' | 'dark'): Set<string> => {
  const tokens = new Set<string>();
  const selectorPattern = new RegExp(`\\[data-theme=['"]?${appearance}['"]?\\]`);
  for (const [, selector, body] of kitCss.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    if (selector.includes(':not(') || !selectorPattern.test(selector)) continue;
    for (const name of declaredNames(body)) tokens.add(name);
  }
  return tokens;
};

const kitTokensByAppearance = { light: kitAppearanceTokens('light'), dark: kitAppearanceTokens('dark') };

/** The first family a kit font token names, unquoted. */
const kitFirstFamily = (token: string): string | undefined =>
  new RegExp(`${token}\\s*:\\s*['"]?([^'",;]+)`).exec(kitCss)?.[1]?.trim();

/** Names the shell owns: the kit declares none of them. */
const isShellToken = (name: string): boolean =>
  name === '--radius-none' ||
  /^--(left-menu|spacing|shadow|transition)(-|$)/.test(name);

/**
 * The left menu family a kit-palette theme declares, selected label token
 * included. The set is pinned so a member dropped or added by hand is caught.
 */
const leftMenuTokens = [
  '--left-menu',
  '--left-menu-border',
  '--left-menu-foreground',
  '--left-menu-hover',
  '--left-menu-selected',
  '--left-menu-selected-foreground',
];

/**
 * Every name the shell's own themes declare: the shell tokens as they exist.
 * A reference that points at a shell token must point at one of these, so a
 * typo in the shell namespace fails here as well as a kit rename does.
 */
const shellTokens = new Set(frontxThemes.flatMap((theme) => Object.keys(theme.variables)));

/** The custom property names a value references through `var()`, in order. */
const referencedTokens = (value: string): string[] =>
  [...value.matchAll(/var\((--[\w-]+)\)/g)].map((match) => match[1]);

/**
 * True when a colour value is built only from token references: var() and
 * color-mix() of var(). After the wrappers are stripped, a literal colour
 * always leaves its function name or hex digits behind.
 */
const isDerivedFromTokens = (value: string): boolean =>
  value
    .replace(/var\(--[\w-]+\)/g, '')
    .replace(/color-mix\(\s*in\s+oklab\s*,/g, '')
    .replace(/[\s(),%/.0-9]/g, '') === '';

const byId = (id: string): ThemeConfig => {
  const theme = frontxThemes.find((candidate) => candidate.id === id);
  if (!theme) throw new Error(`theme "${id}" is not registered`);
  return theme;
};

const names = (theme: ThemeConfig): string[] => Object.keys(theme.variables);

/**
 * A theme with a palette of its own repaints the page surface. Overriding
 * --background is the mark of one; a theme on the kit's palette leaves it to
 * the kit and may still override a few tokens on purpose.
 */
const hasOwnPalette = (theme: ThemeConfig): boolean => '--background' in theme.variables;

describe('shell themes over the ui-kit palette', () => {
  it('reads the token set, both appearances and the font stacks from the installed kit', () => {
    expect(kitTokens.size).toBeGreaterThan(50);
    for (const tokens of Object.values(kitTokensByAppearance)) {
      expect(tokens.has('--background')).toBe(true);
      expect(tokens.has('--primary')).toBe(true);
    }
    expect(kitFirstFamily('--font-sans')).toBeTruthy();
  });

  it('gives every theme an appearance, so the kit resolves the matching palette', () => {
    for (const theme of frontxThemes) {
      expect(theme.appearance, theme.id).toMatch(/^(light|dark)$/);
    }
  });

  it('lets every theme override only tokens the kit or the shell declares', () => {
    for (const theme of frontxThemes) {
      expect(names(theme).filter((name) => !kitTokens.has(name) && !isShellToken(name)), theme.id).toEqual([]);
    }
  });

  it('makes a theme with its own palette map every colour token of its appearance', () => {
    const ownPalettes = frontxThemes.filter(hasOwnPalette);
    expect(ownPalettes.map((theme) => theme.id)).toEqual(expect.arrayContaining(['dracula', 'dracula-large']));
    for (const theme of ownPalettes) {
      const kitSet = kitTokensByAppearance[theme.appearance ?? 'light'];
      expect([...kitSet].filter((name) => !(name in theme.variables)), theme.id).toEqual([]);
    }
  });

  it.each(['default', 'light', 'dark'])('keeps %s on the kit palette, re-declaring no kit token', (id) => {
    expect(names(byId(id)).filter((name) => kitTokens.has(name))).toEqual([]);
  });

  it.each(['default', 'light', 'dark'])('builds every %s left menu colour from theme tokens, with no literal', (id) => {
    const theme = byId(id);
    const family = names(theme).filter((name) => /^--left-menu(-|$)/.test(name)).sort();
    expect(family, theme.id).toEqual(leftMenuTokens);
    for (const name of family) {
      const value = theme.variables[name] ?? '';
      // A missing or empty value references nothing, and would otherwise pass
      // the no-literal check below.
      const referenced = referencedTokens(value);
      expect(referenced.length, `${theme.id} ${name} = "${value}" references no token`).toBeGreaterThan(0);
      expect(isDerivedFromTokens(value), `${theme.id} ${name} = ${value}`).toBe(true);
      // The wrappers above are stripped before the literal check, so the names
      // inside them have to be checked separately: a renamed kit token or a
      // misspelled shell token resolves to nothing in the browser.
      for (const token of referenced) {
        expect(kitTokens.has(token) || shellTokens.has(token), `${theme.id} ${name} -> ${token}`).toBe(true);
      }
    }
  });

  it('scales dracula-large to 1.5x the kit --radius, which every kit radius step derives from', () => {
    const kitRadius = Number.parseFloat(kitCss.match(/--radius\s*:\s*([\d.]+)rem\s*;/)?.[1] ?? '');
    expect(kitRadius).toBeGreaterThan(0);
    expect(Number.parseFloat(byId('dracula-large').variables['--radius'])).toBeCloseTo(kitRadius * 1.5, 5);
    for (const step of ['--radius-sm', '--radius-md', '--radius-lg', '--radius-xl']) {
      expect(kitCss, step).toMatch(new RegExp(`${step}\\s*:[^;]*var\\(--radius\\)`));
    }
  });

  it('leaves the kit palette alone in globals.css', () => {
    const globalsCss = readFileSync(resolveFromHere.resolve('../globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect([...declaredNames(globalsCss)].filter((name) => kitTokens.has(name))).toEqual([]);
  });

  it('registers fonts under the family the kit names first for body and headings', () => {
    const fontCss = readFileSync(resolveFromHere.resolve('../font.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const families = new Set([...fontCss.matchAll(/font-family:\s*['"]?([^'";]+)/g)].map((match) => match[1].trim()));
    expect([...families]).toEqual([kitFirstFamily('--font-sans')]);
    expect(kitFirstFamily('--font-heading')).toBe(kitFirstFamily('--font-sans'));
  });

  it('points every font src in font.css at a file that resolves', () => {
    const fontCss = readFileSync(resolveFromHere.resolve('../font.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const urls = [...fontCss.matchAll(/url\(\s*['"]([^'"]+)['"]\s*\)/g)].map((match) => match[1]);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(() => resolveFromHere.resolve(url), url).not.toThrow();
    }
  });
});
