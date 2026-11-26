/**
 * `vitePluginMfeGts` — the plugin factory: the package's single function
 * export. Everything else is a class.
 *
 * The factory returns the plugin array a MFE's `vite.config.ts` needs,
 * whole: the `@module-federation/vite` plugins configured by
 * `MfeFederationSetup` (name from `package.json`, `remoteEntry.js`,
 * exposes from the options or `mfe.json`, `shared: {}`, `manifest:
 * true`), then the `MfeGtsPlugin` itself. An MFE's config is just its
 * framework plugin plus `vitePluginMfeGts({ exposes })`.
 */

import * as path from 'node:path';

import type { PluginOption } from 'vite';

import { MfeFederationSetup } from './MfeFederationSetup';
import { MfeGtsPlugin, type VitePluginMfeGtsOptions } from './MfeGtsPlugin';

export default function vitePluginMfeGts(
  options?: VitePluginMfeGtsOptions
): PluginOption[] {
  // One package root for everything the plugin reads from the package:
  // federation settings, the shared set, `mfe.json` and the exposes.
  const root = path.resolve(options?.root ?? process.cwd());
  const setup = new MfeFederationSetup(root, options?.exposes);
  return [
    ...setup.plugins(),
    new MfeGtsPlugin({
      ...options,
      root,
      exposes: setup.getSettings().exposes,
      ownedFederationPlugins: new Set(setup.plugins()),
    }).toVitePlugin(),
  ];
}
