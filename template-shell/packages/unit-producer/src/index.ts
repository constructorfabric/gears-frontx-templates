/**
 * `unit-producer` — the shared-dependency producer: built on the
 * producer's own exact-pinned Rollup with its standard plugins
 *  (bundler parity), emitting content-addressed entry-point
 * chunks and flat per-entry fetch lists the manifest's unit table and lists derive
 * from, per the `./unit-format` contract.
 */

export { UnitProducer } from './UnitProducer';
export type {
  UnitProducerOptions,
  ProducedSharedPackage,
  ProducedChunk,
  ResolvedSharedDep,
  SharedDepPackageJson,
} from './UnitProducer';
export { PackageEntrySet } from './PackageEntrySet';
export type { PackageEntrySetResult, BarrelNote } from './PackageEntrySet';
export { PackageCacheReport } from './PackageCacheReport';
export type { CacheOutcome, PackageCacheEntry, PackageCacheSummary } from './PackageCacheReport';
export { OrderedParallelMap } from './OrderedParallelMap';
export { WorkspaceRoot } from './WorkspaceRoot';
export { PackageBuildCache } from './PackageBuildCache';
export type { CachedPackageBuild, CachedChunkRecord } from './PackageBuildCache';
export { UnitFileNaming } from './UnitFileNaming';
export type { OpaqueImportReport, ProducedFetchList } from './ProducedFetchList';
export { ManifestListBuilder } from './ManifestListBuilder';
export { DynamicImportClassifier } from './DynamicImportClassifier';
export type { ClassifiedImport } from './DynamicImportClassifier';
export { SharedSetResolver } from './SharedSetResolver';
export type {
  SharedSetResolverOptions,
  SharedSetResolution,
  SharedPackageLocation,
  ResolvablePackageJson,
} from './SharedSetResolver';
export { SharedSetSelection } from './SharedSetSelection';
export type { SharedSetMode, SharedSetSelectionOptions } from './SharedSetSelection';
export { BuildGraphSharing } from './BuildGraphSharing';
export type { BuildGraphSharingOptions } from './BuildGraphSharing';
export { AliasMap } from './AliasMap';
export { PackageReachClassifier } from './PackageReachClassifier';
export type { PackageReach } from './PackageReachClassifier';
export { PackageBytesEstimator } from './PackageBytesEstimator';
export { SharedSetSummary } from './SharedSetSummary';
export type {
  SharedSetSummaryDocument,
  SharedSetSummaryPackage,
  SharedSetSummaryParams,
} from './SharedSetSummary';
export { PackageJsonResolver } from './PackageJsonResolver';
export { RuntimeEntryDetector } from './RuntimeEntryDetector';
export type { RuntimeEntryFields } from './RuntimeEntryDetector';
export { ContentHasher } from './ContentHasher';
export { BarrelRewritePolicy } from './BarrelRewritePolicy';
export { ModuleLinkageScanner } from './ModuleLinkageScanner';
export type {
  ModuleLinkageLite,
  ClauseSpecifiers,
  LinkageStatement,
} from './ModuleLinkageScanner';
export { BarrelImportRewriter } from './BarrelImportRewriter';
export type { BarrelRedirect } from './BarrelImportRewriter';
export { PackageFileResolver } from './PackageFileResolver';
export { BarrelResolver } from './BarrelResolver';
export { PackageEntryFileResolver } from './PackageEntryFileResolver';
export { ConsumerBarrelResolver } from './ConsumerBarrelResolver';
export type {
  ConsumerBarrelResolverOptions,
  ConsumerBarrelRedirect,
  ConsumerBarrelAnswer,
  ConsumerBarrelClassification,
} from './ConsumerBarrelResolver';
export { ConsumerBarrelRewriteLedger } from './ConsumerBarrelRewriteLedger';
export type {
  ConsumerBarrelPackageRecord,
  ConsumerBarrelRewrite,
} from './ConsumerBarrelRewriteLedger';
export { ConsumerBarrelRewriteTransform } from './ConsumerBarrelRewriteTransform';
export { ConsumerBarrelFallback } from './ConsumerBarrelFallback';
export { SharedStylesheetImports } from './SharedStylesheetImports';
export type { SharedStylesheetImportsOptions } from './SharedStylesheetImports';
export type { ConsumerBarrelProducedPackage } from './ConsumerBarrelFallback';
export { SharedSpecifierMatcher } from './SharedSpecifierMatcher';
export { ForeignPackageInliningGuard } from './ForeignPackageInliningGuard';
export type { ForeignPackageInlining } from './ForeignPackageInliningGuard';
export { BuildReport } from './BuildReport';
export { BuildStageTimer, BUILD_STAGES } from './BuildStageTimer';
export type { BuildStage, BuildStageTimings, BuildStageTimerOptions } from './BuildStageTimer';
export { RollupPackageBundler } from './RollupPackageBundler';
export type { BundledChunk, BundlerBuildResult } from './RollupPackageBundler';
export { ProducerBuildSettings } from './ProducerBuildSettings';
export { ProducerCodeHash } from './ProducerCodeHash';
export { ProducerCacheFingerprint } from './ProducerCacheFingerprint';
export { ReexportResolver } from './ReexportResolver';
export { defaultProducerCacheDir } from './ProducerCacheDir';
export { ExternalChain, FallbackReproduction } from './PluginBuildWiring';
export type {
  ExternalChainConfig,
  ExternalOptionLike,
  FallbackReproductionResult,
} from './PluginBuildWiring';
