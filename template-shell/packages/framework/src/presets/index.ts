/**
 * Presets - Pre-configured plugin combinations
 *
 * Framework Layer: L2
 */

// @cpt-flow:cpt-frontx-flow-framework-composition-full-preset:p1
// @cpt-dod:cpt-frontx-dod-framework-composition-presets:p1

import type { FrontXPlugin, Presets } from '../types';
import { themes } from '../plugins/themes';
import { i18n } from '../plugins/i18n';
import { effects } from '../plugins/effects';
import { queryCache } from '../plugins/queryCache';
import { mock } from '../plugins/mock';
import { auth, type AuthPluginConfig } from '../plugins/auth';

/**
 * Full preset configuration.
 */
export interface FullPresetConfig {
  /** Optional auth plugin config. When provided, `auth()` is added to the preset. */
  auth?: AuthPluginConfig;
}

/**
 * Full preset - All plugins for the complete FrontX experience.
 * This is the default for `frontx create` projects.
 *
 * Includes:
 * - themes (theme registry, changeTheme action)
 * - i18n (i18n registry, setLanguage action)
 * - effects (effect coordination)
 * - mock (mock mode control for API services)
 * - auth (only when `config.auth` is provided)
 *
 * The MFE host plugin is not part of the preset: it lives on
 * `@gears-frontx/framework/mfe`, so an app that hosts MFEs adds
 * `microfrontends()` itself and an app that hosts none never reaches the MFE
 * runtime through this preset. Layout state (header, menu, sidebar, popup,
 * overlay) is the application's own business, so the preset composes no
 * layout plugin; the application adds its own.
 *
 * @param config - Optional preset configuration
 *
 * @example
 * ```typescript
 * import { createFrontX, full } from '@gears-frontx/framework';
 * import { microfrontends, MfeHandlerMF } from '@gears-frontx/framework/mfe';
 *
 * // `myTypeSystem` implements the TypeSystemPlugin contract; `MY_ENTRY_TYPE`
 * // is the host's own MFE entry type ID.
 * const app = createFrontX()
 *   .useAll(full())
 *   .use(microfrontends({ typeSystem: myTypeSystem, mfeHandlers: [new MfeHandlerMF(MY_ENTRY_TYPE)] }))
 *   .build();
 * ```
 */
// @cpt-begin:cpt-frontx-flow-framework-composition-full-preset:p1:inst-1
// @cpt-begin:cpt-frontx-dod-framework-composition-presets:p1:inst-1
export function full(config?: FullPresetConfig): FrontXPlugin[] {
  const plugins: FrontXPlugin[] = [
    effects(),
    themes(),
    i18n(),
    queryCache(),
    mock(),
  ];
  if (config?.auth) {
    plugins.push(auth(config.auth));
  }
  return plugins;
}
// @cpt-end:cpt-frontx-flow-framework-composition-full-preset:p1:inst-1

/**
 * Minimal preset - Themes only.
 * For users who want basic FrontX patterns only.
 *
 * Includes:
 * - themes (theme registry, changeTheme action)
 */
export function minimal(): FrontXPlugin[] {
  return [
    themes(),
  ];
}
// @cpt-end:cpt-frontx-dod-framework-composition-presets:p1:inst-1

/**
 * Presets collection
 */
export const presets: Presets = {
  full,
  minimal,
};
