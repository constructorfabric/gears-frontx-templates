/**
 * Dark theme for FrontX.
 *
 * Colour, radius and type tokens come from @gears-frontx/ui-kit's theme.css,
 * resolved for the `appearance` below. This theme declares only the shell's
 * own tokens (left menu, spacing, shadows, transitions, `--radius-none`) and
 * re-declares no kit token, so the kit stays the one palette. themes.test.ts
 * enforces both halves.
 *
 * The left menu stays on the kit's dark surfaces rather than inverting to a
 * light panel: the panel reads the sidebar family the kit keeps for
 * navigation chrome, its hover the card hover step, its text a wash of the
 * sidebar foreground over the panel.
 */

import type { ThemeConfig } from '@gears-frontx/react';

/**
 * Dark theme ID
 */
export const DARK_THEME_ID = 'dark' as const;

export const darkTheme: ThemeConfig = {
  id: DARK_THEME_ID,
  name: 'Dark',
  appearance: 'dark',
  variables: {
    // Left menu colors: the kit's dark sidebar surfaces. Text is the sidebar
    // foreground washed toward the panel, which keeps the muted tone of the
    // old literal while clearing 4.5:1 on the panel.
    '--left-menu': 'var(--sidebar)',
    '--left-menu-foreground': 'color-mix(in oklab, var(--sidebar-foreground) 70%, var(--sidebar))',
    '--left-menu-hover': 'var(--card-hover)',
    '--left-menu-selected': 'var(--primary)',
    '--left-menu-selected-foreground': 'var(--primary-foreground)',
    '--left-menu-border': 'color-mix(in oklab, var(--sidebar-border) 45%, var(--sidebar))',

    // Spacing
    '--spacing-xs': '0.25rem',
    '--spacing-sm': '0.5rem',
    '--spacing-md': '1rem',
    '--spacing-lg': '1.5rem',
    '--spacing-xl': '2rem',
    '--spacing-2xl': '3rem',
    '--spacing-3xl': '4rem',

    // Border radius the kit has no step for; every other step derives from
    // the kit's --radius
    '--radius-none': '0',

    // Shadows
    '--shadow-sm': '0 1px 2px 0 rgba(0, 0, 0, 0.3)',
    '--shadow-md': '0 4px 6px -1px rgba(0, 0, 0, 0.4)',
    '--shadow-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
    '--shadow-xl': '0 20px 25px -5px rgba(0, 0, 0, 0.6)',

    // Transitions
    '--transition-fast': '150ms',
    '--transition-base': '200ms',
    '--transition-slow': '300ms',
    '--transition-slower': '500ms',
  },
};
