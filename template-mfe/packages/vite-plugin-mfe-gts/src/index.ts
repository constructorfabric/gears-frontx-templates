/**
 * `@gears-frontx/vite-plugin-mfe-gts` — the type-system-dependent MFE
 * Vite plugin: shared-set derivation and unit production via
 * `@gears-frontx/unit-producer`, the closed served
 * manifest and entry assets, the `__frontx_lazy` transform, CSS
 * attribution, lazy/dynamic-import checks, entity validation through
 * `@gears-frontx/gts-plugin`, and the per-MFE build report.
 */

export { default, default as vitePluginMfeGts } from './vitePluginMfeGts';
export { MfeFederationSetup } from './MfeFederationSetup';
export type { MfeFederationSettings } from './MfeFederationSetup';
export { MfeGtsPlugin } from './MfeGtsPlugin';
export type { VitePluginMfeGtsOptions } from './MfeGtsPlugin';
export { MfeManifestEnricher } from './MfeManifestEnricher';
export { SpecifiersDeriver } from './SpecifiersDeriver';
export { ExposeListComposer } from './ExposeListComposer';
export { CssAttributor } from './CssAttributor';
export { LazyImportTransformer } from './LazyImportTransformer';
export type { AstNode } from './LazyImportTransformer';
export { FederationChunkFilter } from './FederationChunkFilter';
export { GtsEntityValidator } from './GtsEntityValidator';
export type { EntityTypeSystem } from './GtsEntityValidator';
export { MfeBuildReport } from './MfeBuildReport';
export type { MfeBuildReportDocument } from './MfeBuildReport';
