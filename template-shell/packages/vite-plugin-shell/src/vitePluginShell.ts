/**
 * `vitePluginShell` — the plugin factory: the package's single function
 * export. Everything else is a class.
 */

import type { Plugin } from 'vite';

import { ShellPlugin, type VitePluginShellOptions } from './ShellPlugin';

export default function vitePluginShell(
  options?: VitePluginShellOptions
): Plugin {
  return new ShellPlugin(options).toVitePlugin();
}
