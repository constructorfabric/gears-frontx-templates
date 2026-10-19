/**
 * Dracula Large theme for FrontX: the Dracula palette with 1.5x spacing and
 * rounding.
 *
 * Its colours, kit tokens included, live in ./draculaPalette, shared with the
 * other Dracula theme. Tokens named neither there nor below (type, the
 * radius steps) come from @gears-frontx/ui-kit's theme.css.
 */

import type { ThemeConfig } from '@gears-frontx/react';
import { draculaKitColors, draculaShellColors } from './draculaPalette';

/**
 * Dracula Large theme ID
 */
export const DRACULA_LARGE_THEME_ID = 'dracula-large' as const;

export const draculaLargeTheme: ThemeConfig = {
  id: DRACULA_LARGE_THEME_ID,
  name: 'Dracula Large',
  appearance: 'dark',
  variables: {
    ...draculaKitColors,
    ...draculaShellColors,

    // Spacing (1.5x scaled)
    '--spacing-xs': '0.375rem',
    '--spacing-sm': '0.75rem',
    '--spacing-md': '1.5rem',
    '--spacing-lg': '2.25rem',
    '--spacing-xl': '3rem',
    '--spacing-2xl': '4.5rem',
    '--spacing-3xl': '6rem',

    // Border radius: 1.5x the kit's 0.625rem base. The kit derives every
    // step from --radius, so the whole scale follows this one value.
    '--radius': '0.9375rem',
    '--radius-none': '0',

    // Shadows
    '--shadow-sm': '0 1px 2px 0 rgba(0, 0, 0, 0.4)',
    '--shadow-md': '0 4px 6px -1px rgba(0, 0, 0, 0.5)',
    '--shadow-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.6)',
    '--shadow-xl': '0 20px 25px -5px rgba(0, 0, 0, 0.7)',

    // Transitions
    '--transition-fast': '150ms',
    '--transition-base': '200ms',
    '--transition-slow': '300ms',
    '--transition-slower': '500ms',
  },
};
