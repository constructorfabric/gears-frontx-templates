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

import {
  resolveShellScreens,
  type ResolvedShellScreens,
  type ShellScreensConfig,
} from '@gears-frontx/frontx-template-shell';

const projectModules = import.meta.glob<{ default: ShellScreensConfig }>('../../shell-config/screens.ts', {
  eager: true,
});

const PROJECT_FILE = 'src-app/shell-config/screens.ts';

function loadProjectScreens(): ShellScreensConfig | undefined {
  const [projectModule] = Object.values(projectModules);
  if (!projectModule) return undefined;
  if (projectModule.default === undefined) {
    throw new Error(`${PROJECT_FILE} has no default export; export the config with \`export default defineShellScreens({...})\``);
  }
  return projectModule.default;
}

function resolveProjectScreens(config: ShellScreensConfig | undefined): ResolvedShellScreens {
  try {
    return resolveShellScreens(config);
  } catch (error) {
    // Name the file the mistake is in; the message keeps the rule it broke.
    throw new Error(`${PROJECT_FILE}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Resolved when the module loads, so a config the checks in
 * `resolveShellScreens` refuse stops the shell before it renders.
 */
export const shellScreens = resolveProjectScreens(loadProjectScreens());
