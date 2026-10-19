/**
 * Dracula theme for FrontX: the classic Dracula palette over the kit.
 *
 * Its colours, kit tokens included, live in ./draculaPalette, shared with the
 * other Dracula theme. Tokens named neither there nor below (type, the
 * radius steps) come from @gears-frontx/ui-kit's theme.css.
 */

import type { ThemeConfig } from '@gears-frontx/react';
import { draculaKitColors, draculaShellColors } from './draculaPalette';

/**
 * Dracula theme ID
 */
export const DRACULA_THEME_ID = 'dracula' as const;

export const draculaTheme: ThemeConfig = {
  id: DRACULA_THEME_ID,
  name: 'Dracula',
  appearance: 'dark',
  variables: {
    ...draculaKitColors,
    ...draculaShellColors,

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
