/**
 * The Dracula palette, shared by the `dracula` and `dracula-large` themes.
 *
 * A deliberate palette, so unlike the light, dark and default themes it does
 * override kit tokens, and then it has to override all of them: every colour
 * token @gears-frontx/ui-kit declares for the dark appearance gets a Dracula
 * value here. A token left out would resolve to the kit's own dark value, and
 * a kit component would paint half in one palette and half in the other.
 * themes.test.ts checks the set against the installed kit's theme.css, so a
 * token the kit adds fails the test until it is mapped here.
 *
 * Official Dracula colours: https://draculatheme.com/contribute
 */

import { cssColor } from './utils';

const dracula = {
  purple: 'hsl(265 89% 78%)',       // #bd93f9
  comment: 'hsl(225 27% 51%)',      // #6272a4
  pink: 'hsl(326 100% 74%)',        // #ff79c6
  background: 'hsl(231 15% 18%)',   // #282a36
  foreground: 'hsl(60 30% 96%)',    // #f8f8f2
  currentLine: 'hsl(232 14% 31%)',  // #44475a
  red: 'hsl(0 100% 67%)',           // #ff5555
  yellow: 'hsl(65 92% 76%)',        // #f1fa8c
  green: 'hsl(135 94% 65%)',        // #50fa7b
  cyan: 'hsl(191 97% 77%)',         // #8be9fd
  backgroundDark: 'hsl(231 15% 14%)', // darker variant
};

/** A status fill: the status colour at 15% over the page, as the kit's dark -soft fills read. */
const soft = (token: string): string => `color-mix(in oklab, var(${token}) 15%, var(--background))`;

/** Every kit colour token, mapped onto the Dracula palette. */
export const draculaKitColors: Record<string, string> = {
  '--background': cssColor(dracula.background),
  '--foreground': cssColor(dracula.foreground),
  '--surface': cssColor(dracula.background),
  '--surface-elevated': cssColor(dracula.background),
  '--card': cssColor(dracula.background),
  '--card-foreground': cssColor(dracula.foreground),
  '--card-hover': 'color-mix(in oklab, var(--card) 96%, var(--foreground))',
  '--popover': cssColor(dracula.background),
  '--popover-foreground': cssColor(dracula.foreground),
  '--primary': cssColor(dracula.purple),
  '--primary-foreground': cssColor(dracula.background),
  '--primary-hover': 'color-mix(in oklab, var(--primary) 90%, var(--background))',
  '--primary-ring': cssColor(dracula.purple),
  '--secondary': cssColor(dracula.comment),
  '--secondary-foreground': cssColor(dracula.foreground),
  '--muted': cssColor(dracula.currentLine),
  '--muted-foreground': cssColor(dracula.foreground),
  '--subtle-foreground': cssColor(dracula.foreground),
  '--accent': cssColor(dracula.pink),
  '--accent-foreground': cssColor(dracula.background),
  '--selection-subtle': cssColor(dracula.currentLine),
  '--destructive': cssColor(dracula.red),
  '--destructive-foreground': cssColor(dracula.foreground),
  '--destructive-hover': 'color-mix(in oklab, var(--destructive) 80%, #000000)',
  '--destructive-ring': cssColor(dracula.red),
  '--link-foreground': cssColor(dracula.cyan),
  '--success': cssColor(dracula.green),
  '--success-soft': soft('--success'),
  '--success-foreground': cssColor(dracula.green),
  '--warning': cssColor(dracula.yellow),
  '--warning-soft': soft('--warning'),
  '--warning-foreground': cssColor(dracula.yellow),
  '--danger': cssColor(dracula.red),
  '--danger-soft': soft('--danger'),
  '--danger-foreground': cssColor(dracula.red),
  '--info': cssColor(dracula.cyan),
  '--info-soft': soft('--info'),
  '--blue': cssColor(dracula.comment),
  '--chart-1': 'oklch(0.714 0.203 313.26)',
  '--chart-2': 'oklch(0.799 0.194 145.19)',
  '--chart-3': 'oklch(0.821 0.173 85.29)',
  '--chart-4': 'oklch(0.71 0.191 349.76)',
  '--chart-5': 'oklch(0.822 0.131 194.77)',
  '--border': cssColor(dracula.currentLine),
  '--border-strong': cssColor(dracula.comment),
  '--input': cssColor(dracula.currentLine),
  '--ring': cssColor(dracula.purple),
  '--sidebar': cssColor(dracula.backgroundDark),
  '--sidebar-foreground': cssColor(dracula.foreground),
  '--sidebar-accent': cssColor(dracula.currentLine),
  '--sidebar-accent-foreground': cssColor(dracula.foreground),
  '--sidebar-border': cssColor(dracula.currentLine),
  '--sidebar-primary': cssColor(dracula.purple),
  '--sidebar-primary-foreground': cssColor(dracula.background),
  '--sidebar-ring': cssColor(dracula.purple),
  '--code-background': cssColor(dracula.backgroundDark),
  '--code-foreground': cssColor(dracula.foreground),
};

/** The shell's own colour tokens in the Dracula palette. */
export const draculaShellColors: Record<string, string> = {
  // State colour the kit has no token for (the kit's red is --destructive)
  '--error': cssColor(dracula.red),

  // Left menu colors
  '--left-menu': cssColor(dracula.backgroundDark),
  '--left-menu-foreground': cssColor(dracula.comment),
  '--left-menu-hover': cssColor(dracula.currentLine),
  '--left-menu-selected': cssColor(dracula.purple),
  '--left-menu-border': cssColor(dracula.currentLine),
};
