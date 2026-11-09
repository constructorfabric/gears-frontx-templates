/**
 * Light theme for FrontX.
 *
 * Colour, radius and type tokens come from @gears-frontx/ui-kit's theme.css,
 * resolved for the `appearance` below. This theme declares only the shell's
 * own tokens (left menu, spacing, shadows, transitions, `--error`,
 * `--radius-none`) and re-declares no kit token, so the kit stays the one
 * palette. themes.test.ts enforces both halves.
 */

import type { ThemeConfig } from '@gears-frontx/react';
import { cssColor } from './utils';

/**
 * Light theme ID
 */
export const LIGHT_THEME_ID = 'light' as const;

export const lightTheme: ThemeConfig = {
  id: LIGHT_THEME_ID,
  name: 'Light',
  appearance: 'light',
  variables: {
    // State colour the kit has no token for (the kit's red is --destructive)
    '--error': cssColor('hsl(0 84% 60%)'),

    // Left menu colors
    '--left-menu': cssColor('hsl(240 5% 96%)'),
    '--left-menu-foreground': cssColor('hsl(240 4% 46%)'),
    '--left-menu-hover': cssColor('hsl(240 6% 90%)'),
    '--left-menu-selected': cssColor('hsl(221 83% 53%)'),
    '--left-menu-border': cssColor('hsl(240 6% 90%)'),

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
