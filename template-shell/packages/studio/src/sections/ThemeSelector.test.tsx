import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeSelector } from './ThemeSelector';
import { STUDIO_CSS } from '../styles/studioStyles';

const { setTheme, themeState, studioState } = vi.hoisted(() => ({
  setTheme: vi.fn(),
  // Read at render time rather than baked into the factory, so a case can pick
  // which theme is active and which container the dropdown portals into.
  themeState: { currentTheme: 'default' },
  studioState: { portalContainer: null as HTMLElement | null },
}));

const themes = [
  { id: 'default', name: 'Default' },
  // Name and id diverge on purpose: formatting the id would spell this one
  // "Dracula Large", so any case reading the label off the trigger says whether
  // the trigger resolved the registry name or just reformatted the id.
  { id: 'dracula-large', name: 'Dracula (Large)' },
];

vi.mock('@gears-frontx/react', () => ({
  useTheme: () => ({ currentTheme: themeState.currentTheme, themes, setTheme }),
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../StudioProvider', () => ({
  useStudioContext: () => ({ portalContainer: studioState.portalContainer }),
}));

describe('ThemeSelector', () => {
  afterEach(() => {
    themeState.currentTheme = 'default';
    studioState.portalContainer = null;
    setTheme.mockClear();
    document.querySelectorAll('.studio-portal-container').forEach((el) => el.remove());
  });

  // The switcher is what an unattended browser run applies a theme with and
  // reads the applied theme back from, so both halves of that contract are
  // held here: the trigger's own text is the active theme, and every
  // registered theme is reachable by an id built from the theme's registry id.
  it('offers every registered theme by id and applies the one selected', async () => {
    render(<ThemeSelector />);

    const trigger = screen.getByTestId('studio-theme-trigger');
    expect(trigger.textContent).toContain('Default');

    await userEvent.click(trigger);

    // Spelled out rather than built with `studioThemeOptionTestId`: a helper
    // used on both sides would let the published derivation drift unnoticed.
    expect(screen.getByTestId('studio-theme-option-default')).toBeTruthy();
    await userEvent.click(screen.getByTestId('studio-theme-option-dracula-large'));

    expect(setTheme).toHaveBeenCalledWith('dracula-large');
  });

  it('reads the active theme back as the registry name, not as its reformatted id', () => {
    // The half of the contract a run depends on to confirm what it applied: the
    // trigger's text has to be the label the option carried, so a theme whose
    // name is not its id spelled out still matches. Reformatting the id gives
    // "Dracula Large" here and leaves the two labels disagreeing.
    themeState.currentTheme = 'dracula-large';

    render(<ThemeSelector />);

    expect(screen.getByTestId('studio-theme-trigger').textContent).toContain('Dracula (Large)');
  });

  it('portals the open menu into the studio container, with enter and exit rules on keyframes the sheet defines', async () => {
    // Radix keeps a closed menu mounted until `animationend`, so the menu must
    // carry the class the studio's open/closed animation rules select on, and
    // those rules must name keyframes the studio sheet itself defines: a rule
    // that names undefined keyframes runs no animation, the event never fires,
    // and the closed menu stays visible and clickable over the app.
    const portalContainer = document.createElement('div');
    portalContainer.className = 'studio-portal-container';
    document.body.appendChild(portalContainer);
    studioState.portalContainer = portalContainer;

    render(<ThemeSelector />);
    await userEvent.click(screen.getByTestId('studio-theme-trigger'));

    const menu = screen.getByTestId('studio-theme-option-default').parentElement;
    expect(menu?.closest('.studio-portal-container')).toBe(portalContainer);

    // Read off the stylesheet rather than retyped, so the case fails on either
    // side of the drift: a rule that stops naming the class the menu renders,
    // and a menu that stops rendering the class the rule names.
    const animationRules = STUDIO_CSS.split('\n')
      .map((line) => line.trim())
      .filter((line) => /^\S+\[data-state=(open|closed)\] \{ animation:/.test(line));
    expect(animationRules).toHaveLength(2);

    for (const rule of animationRules) {
      const selector = rule.slice(0, rule.indexOf('{')).trim();
      // Only one of the two states holds at a time; what has to keep matching
      // is the class the menu carries in both.
      expect(document.querySelector(selector.replace(/\[data-state=\w+\]$/, ''))).toBe(menu);
      const animation = rule.match(/animation: ([^;]+);/)?.[1] ?? '';
      const names = animation.split(',').map((part) => part.trim().split(/\s+/)[0]);
      expect(animation).not.toBe('');
      expect(names.every(Boolean)).toBe(true);
      for (const name of names) {
        expect(STUDIO_CSS).toContain(`@keyframes ${name} `);
      }
    }
    // And in full for the state the open menu is actually in.
    const openRule = animationRules.find((rule) => rule.includes('[data-state=open]'));
    if (!openRule) {
      throw new Error('studioStyles.ts declares no open-state animation rule');
    }
    expect(document.querySelector(openRule.slice(0, openRule.indexOf('{')).trim())).toBe(menu);

    // On open the menu also slides in from the side of the trigger it sits on:
    // one rule per Radix side, each keeping the fade and zoom and adding a slide
    // from the opposite edge, on keyframes the sheet defines. Rules are found by
    // selector whatever their line layout, and each slide's start offset is read
    // off its keyframes, so a slide from the wrong edge fails.
    const sheet = STUDIO_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    const rules = [...sheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selectors, body]) => ({
      selectors: selectors.split(',').map((selector) => selector.trim()),
      body,
    }));
    const slideFrom = {
      bottom: { from: 'top', offset: '0 -0.5rem' },
      top: { from: 'bottom', offset: '0 0.5rem' },
      right: { from: 'left', offset: '-0.5rem 0' },
      left: { from: 'right', offset: '0.5rem 0' },
    } as const;
    for (const [side, { from, offset }] of Object.entries(slideFrom)) {
      const sideRule = rules.find(({ selectors }) => selectors.includes(`.studio-menu[data-state=open][data-side=${side}]`));
      expect(sideRule, side).toBeDefined();
      const names = (sideRule?.body.match(/animation:\s*([^;]+);/)?.[1] ?? '').split(',').map((part) => part.trim().split(/\s+/)[0]);
      expect(names, side).toEqual(['frontx-fade-in', 'frontx-zoom-in', `frontx-slide-in-from-${from}`]);
      const start = sheet.match(new RegExp(`@keyframes\\s+frontx-slide-in-from-${from}\\s*\\{\\s*from\\s*\\{([^}]*)\\}`))?.[1];
      expect(start, from).toBeDefined();
      expect(start?.match(/translate:\s*([^;]+);/)?.[1].trim().replace(/\s+/g, ' '), from).toBe(offset);
    }
    // The open menu carries a side, so one of those rules is the one it gets.
    const side = menu?.getAttribute('data-side');
    expect(side && side in slideFrom).toBe(true);
    expect(menu?.matches(`.studio-menu[data-state=open][data-side=${side}]`)).toBe(true);
  });
});
