/**
 * `@gears-frontx/vite-plugin-shell` — the host-side Vite plugin for the
 * shared-dependency unit mechanism (native boot model): host units and
 * fetch lists emitted into the host's own `dist` via `unit-producer`,
 * an inline import map generated from the produced fetch lists (plus
 * modulepreload links for the boot list) so the shell boots natively,
 * and a small fill chunk importing `@gears-frontx/mfes/unit-loader`
 * that refills the realm content-identity text cache from the shell entry so MFE
 * loads reuse the shell's sources. Framework- and
 * implementation-agnostic; production builds only — `vite dev` stays
 * native.
 */

export { default, default as vitePluginShell } from './vitePluginShell';
export { ShellPlugin } from './ShellPlugin';
export type { VitePluginShellOptions } from './ShellPlugin';
export { HostSharedSetResolver } from './HostSharedSetResolver';
export { RuntimePackageInspector } from './RuntimePackageInspector';
export type {
  InstalledPackageJson,
  RuntimePackageInspection,
} from './RuntimePackageInspector';
export { HostUnitProducer } from './HostUnitProducer';
export type {
  HostUnitProduction,
  HostUnitProducerOptions,
} from './HostUnitProducer';
export { ImportMapComposer } from './ImportMapComposer';
export type { ComposedImportMap } from './ImportMapComposer';
export { ShellBuildReport } from './ShellBuildReport';
export type {
  ShellBuildReportDocument,
  ShellBuildReportPackage,
} from './ShellBuildReport';
