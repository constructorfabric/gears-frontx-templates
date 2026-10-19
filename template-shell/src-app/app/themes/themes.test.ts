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
  name === '--error' ||
  name === '--radius-none' ||
  /^--(left-menu|spacing|shadow|transition)(-|$)/.test(name);

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

  it('scales dracula-large through --radius, which every kit radius step derives from', () => {
    expect(byId('dracula-large').variables['--radius']).toBeDefined();
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
});
