/// <reference types="vite/client" />
/**
 * The project's screens config, resolved once.
 *
 * `src-app/shell-config/screens.ts` belongs to the project: the template does
 * not ship it and never overwrites it. A glob rather than an import because
 * the file is optional; without it the glob is empty and every default
 * applies (the shell's own screen schema, the flat menu reader, the screen
 * domain on).
 */

import { resolveShellScreens, type ShellScreensConfig } from '@gears-frontx/frontx-template-shell';

const projectModules = import.meta.glob<{ default: ShellScreensConfig }>('../../shell-config/screens.ts', {
  eager: true,
});

export const shellScreens = resolveShellScreens(Object.values(projectModules)[0]?.default);
