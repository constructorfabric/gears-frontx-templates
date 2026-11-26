/**
 * Plugin-internal structural types: the `@module-federation/vite`
 * `mf-manifest.json` shape and the MFE's own `mfe.json` shape. These are
 * producer-side descriptions of files the plugin reads and writes, not
 * contract re-declarations — the manifest fields the plugin emits are
 * typed through `@gears-frontx/mfes` type-only imports where a contract
 * type exists (`MfManifest`, `MfeEntryMF`).
 */

import type { MfManifest, MfeEntryMF } from '@gears-frontx/mfes';

/** Assets of one expose or shared entry in `mf-manifest.json`. */
export interface FederationAssets {
  js: { async: string[]; sync: string[] };
  css: { async: string[]; sync: string[] };
}

/** One expose in the federation manifest. */
export interface FederationExpose {
  id: string;
  name: string;
  assets: FederationAssets;
  path: string;
}

/** `metaData` of the federation manifest (read fields only). */
export interface FederationMetaData {
  name: string;
  type: string;
  buildInfo: { buildVersion: string; buildName: string };
  remoteEntry: { name: string; path: string; type: string };
  globalName: string;
  pluginVersion?: string;
  publicPath: string;
  sharedBase?: string;
}

/** The `mf-manifest.json` `@module-federation/vite` emits. */
export interface FederationManifest {
  id: string;
  name: string;
  metaData: FederationMetaData;
  shared: Array<{ name: string; version: string }>;
  remotes: unknown[];
  exposes: FederationExpose[];
}

/** One entry declared in `mfe.json`. */
export interface MfeJsonEntry {
  id: string;
  requiredProperties?: string[];
  actions?: string[];
  domainActions?: string[];
  manifest: string;
  exposedModule: string;
  [key: string]: unknown;
}

/** One extension declared in `mfe.json`. */
export interface MfeJsonExtension {
  id: string;
  domain: string;
  entry: string;
  route?: string;
  presentation?: Record<string, unknown>;
  [key: string]: unknown;
}

/** One domain declared in `mfe.json`. */
export interface MfeJsonDomain {
  id: string;
  [key: string]: unknown;
}

/** One JSON schema declared in `mfe.json`. */
export interface MfeJsonSchema {
  $id: string;
  [key: string]: unknown;
}

/** The `share` section of `mfe.json`. */
export interface MfeJsonShare {
  exclude?: string[];
  barrelRewrite?: { exclude?: string[] };
}

/** The `mfe.json` of an MFE package. */
export interface MfeJson {
  templateExample?: boolean;
  /** Federation exposes (`'./name'` → module path) when not passed via options. */
  exposes?: Record<string, string>;
  manifest: { id: string; remoteEntry: string };
  domains?: MfeJsonDomain[];
  entries: MfeJsonEntry[];
  extensions?: MfeJsonExtension[];
  schemas?: MfeJsonSchema[];
  share?: MfeJsonShare;
}

/** One enriched entry: the declared entry plus its expose assets. */
export type EnrichedMfeJsonEntry = MfeJsonEntry & {
  exposeAssets: MfeEntryMF['exposeAssets'];
};

/** The `dist/mfe-manifest.json` document the plugin writes. */
export type EnrichedMfeJson = Omit<MfeJson, 'manifest' | 'entries'> & {
  manifest: MfManifest;
  entries: EnrichedMfeJsonEntry[];
};

/**
 * One emitted chunk's captured linkage, taken in `generateBundle` while
 * Rollup's output graph is still visible. `cssAssets` holds the emitted
 * CSS files the chunk delivers (`viteMetadata.importedCss`): files Vite
 * merged in from CSS-only chunks it removed first, then the chunk's own
 * file — every file the chunk reaches, `node_modules`-only ones
 * included. `cssModules` holds the module ids of every stylesheet the
 * chunk owns that Vite extracts into a CSS file and whose compiled CSS
 * is not empty, `node_modules` ones included: it feeds the CSS-delivery
 * guard.
 */
export interface CapturedChunk {
  fileName: string;
  /** CSS files the chunk delivers, dependencies first. */
  cssAssets: string[];
  /** Static chunk imports (file names or bare shared specifiers). */
  imports: string[];
  /** Dynamic-import targets (final file names). */
  dynamicImports: string[];
  /** Deliverable stylesheet module ids, for the undeclared-CSS guard. */
  cssModules: string[];
  /**
   * Set on the entry recorded for a CSS-only chunk Vite removed: it
   * carries the chunk's CSS linkage but no JavaScript file was emitted
   * for it, so it is never an own chunk to fetch.
   */
  noEmittedFile?: true;
}

/** One emitted chunk's imported bindings, captured for the barrel ledger. */
export interface ImportingChunk {
  fileName: string;
  imports: Record<string, string[]>;
}
