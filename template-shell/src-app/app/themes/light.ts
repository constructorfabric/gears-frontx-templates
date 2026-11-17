/**
 * Light theme for FrontX.
 *
 * Colour, radius and type tokens come from @gears-frontx/ui-kit's theme.css,
 * resolved for the `appearance` below. This theme declares only the shell's
 * own tokens (left menu, spacing, shadows, transitions, `--radius-none`) and
 * re-declares no kit token, so the kit stays the one palette. themes.test.ts
 * enforces both halves.
 *
 * The left menu uses the kit's light sidebar surfaces, --sidebar,
 * --sidebar-foreground and --sidebar-border, so Light keeps a light panel and
 * differs from the dark panel of the default theme.
 */

import type { ThemeConfig } from '@gears-frontx/react';

/**
 * Light theme ID
 */
export const LIGHT_THEME_ID = 'light' as const;

export const lightTheme: ThemeConfig = {
  id: LIGHT_THEME_ID,
  name: 'Light',
  appearance: 'light',
  variables: {
    // Left menu colors: the kit's light sidebar surfaces. The panel takes
    // --sidebar, its text --sidebar-foreground and its hairline --sidebar-border.
    // Hover mixes the sidebar foreground into the panel: --card-hover is only
    // a hair lighter than this panel and would not read as a state, while a
    // 12% mix stays visible and keeps the text above 4.5:1.
    '--left-menu': 'var(--sidebar)',
    '--left-menu-foreground': 'var(--sidebar-foreground)',
    '--left-menu-hover': 'color-mix(in oklab, var(--sidebar-foreground) 12%, var(--sidebar))',
    '--left-menu-selected': 'var(--primary)',
    '--left-menu-selected-foreground': 'var(--primary-foreground)',
    '--left-menu-border': 'var(--sidebar-border)',

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
