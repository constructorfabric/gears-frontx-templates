/**
 * Default theme for FrontX: the kit's light palette with a dark left menu.
 *
 * Colour, radius and type tokens come from @gears-frontx/ui-kit's theme.css,
 * resolved for the `appearance` below. This theme declares only the shell's
 * own tokens (left menu, spacing, shadows, transitions, `--radius-none`) and
 * re-declares no kit token, so the kit stays the one palette. themes.test.ts
 * enforces both halves.
 *
 * The left menu is the page inverted: the panel takes --foreground, its text
 * a wash of --background over it, and hover, border and selection mix or read
 * the same pair, so the panel follows the kit's light values by construction.
 */

import type { ThemeConfig } from '@gears-frontx/react';

/**
 * Default theme ID
 */
export const DEFAULT_THEME_ID = 'default' as const;

export const defaultTheme: ThemeConfig = {
  id: DEFAULT_THEME_ID,
  name: 'Default',
  appearance: 'light',
  default: true,
  variables: {
    // Left menu colors: the page pair inverted. Panel text is background
    // lightened toward foreground, which keeps the muted grey of the old
    // literal while clearing 4.5:1 on the panel.
    '--left-menu': 'var(--foreground)',
    '--left-menu-foreground': 'color-mix(in oklab, var(--background) 70%, var(--foreground))',
    '--left-menu-hover': 'color-mix(in oklab, var(--foreground) 82%, var(--background))',
    '--left-menu-selected': 'var(--primary)',
    '--left-menu-selected-foreground': 'var(--primary-foreground)',
    '--left-menu-border': 'color-mix(in oklab, var(--foreground) 82%, var(--background))',

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
    '--shadow-sm': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    '--shadow-md': '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    '--shadow-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
    '--shadow-xl': '0 20px 25px -5px rgba(0, 0, 0, 0.1)',

    // Transitions
    '--transition-fast': '150ms',
    '--transition-base': '200ms',
    '--transition-slow': '300ms',
    '--transition-slower': '500ms',
  },
};
