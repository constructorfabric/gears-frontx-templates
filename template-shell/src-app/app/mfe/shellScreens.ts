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

const PROJECT_FILE = 'src-app/shell-config/screens.ts';

function loadProjectScreens(): ShellScreensConfig | undefined {
  const [projectModule] = Object.values(projectModules);
  if (!projectModule) return undefined;
  if (projectModule.default === undefined) {
    throw new Error(`[shell screens] ${PROJECT_FILE} has no default export; export the config with \`export default defineShellScreens({...})\``);
  }
  return projectModule.default;
}

/**
 * Resolved when the module loads, so a config mistake stops the shell before
 * it renders, with the file named in the error.
 */
export const shellScreens = (() => {
  try {
    return resolveShellScreens(loadProjectScreens());
  } catch (error) {
    throw new Error(`${PROJECT_FILE}: ${error instanceof Error ? error.message : String(error)}`);
  }
})();
