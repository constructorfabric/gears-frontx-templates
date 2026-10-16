#!/usr/bin/env node

/**
 * Production layout of `dist/`, the last step of `npm run build`.
 *
 * `vite build` leaves the shell in `dist/` together with a copy of
 * `public/generated-mfe-manifests.json`, while every screen package stays in
 * its own `src-app/mfe_packages/<package>/dist/`. This step copies each screen
 * the aggregate carries into `dist/mfe/<package>/` and rewrites the aggregate in
 * `dist/` so each screen's `publicPath` is that folder, relative to the
 * aggregate itself (`mfe/<package>/`). The shell reads the aggregate from its
 * own folder (`src-app/app/mfe/bootstrap.ts`) and the MFE loader resolves the
 * relative address against the shell's page, served from that same folder, so
 * the same `dist/` works at the root of a domain and under any sub-path. The dev
 * aggregate in `public/` keeps the preview-server addresses.
 *
 * The packages come from the same discovery as manifest generation, and each
 * aggregate config is matched to its package by the manifest id the package's
 * enriched `dist/mfe-manifest.json` carries.
 */

import { cpSync, existsSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isNonPackageDirectory, isTemplateExamplePackage, templateExamplesIncluded } from './lib/mfe-tools.js';

/** The aggregate the shell reads at runtime, copied into `dist/` by `vite build`. */
export const AGGREGATE_FILE = 'generated-mfe-manifests.json';

/** The folder of `dist/` that holds one sub-folder per screen package. */
export const MFE_DIR = 'mfe';

/** The enriched manifest each package build writes; its manifest id ties an aggregate config to its package. */
const ENRICHED_MANIFEST = 'mfe-manifest.json';

/**
 * Top-level entries of a package's `dist/` the shell never reads: the
 * standalone preview page, the build statistics, and the enriched manifest,
 * whose content the aggregate already carries. Every federation type bundle
 * (a top-level name starting with `@mf-types`) is left out as well.
 */
const LEFT_OUT = new Set([
  'index.html',
  'mf-stats.json',
  ENRICHED_MANIFEST,
]);

/** The `publicPath` a screen package gets in the production aggregate: its folder, relative to the aggregate. */
export function remotePublicPath(packageDir: string): string {
  return `${MFE_DIR}/${packageDir}/`;
}

interface AggregateManifest {
  id?: unknown;
  metaData?: { publicPath?: unknown };
}

interface AggregateConfig {
  manifest?: AggregateManifest;
  entries?: Array<{ manifest?: unknown }>;
}

function readJson(file: string, projectDir: string): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf-8'));
  } catch (err) {
    throw new Error(
      `Cannot parse ${relative(projectDir, file)}: ${err instanceof Error ? err.message : String(err)}. Rebuild it.`,
    );
  }
}

function readManifestId(enrichedFile: string, projectDir: string): string | undefined {
  const parsed = readJson(enrichedFile, projectDir);
  if (typeof parsed !== 'object' || parsed === null || !('manifest' in parsed)) return undefined;
  const manifest = parsed.manifest;
  if (typeof manifest !== 'object' || manifest === null || !('id' in manifest)) return undefined;
  return typeof manifest.id === 'string' ? manifest.id : undefined;
}

/**
 * Built packages by the manifest id their enriched manifest carries, found by
 * the same rules manifest generation uses (`generate-mfe-manifests.ts`): not a
 * non-package directory, an `mfe.json` present, template examples only when
 * they are included. Every package that can reach the aggregate can therefore
 * be laid out, and the ids are indexed with every package declaring them so a
 * duplicate is refused rather than resolved to one of them.
 */
function builtPackagesById(mfePackagesDir: string, projectDir: string): Map<string, string[]> {
  const byId = new Map<string, string[]>();
  if (!existsSync(mfePackagesDir)) return byId;
  const includeExamples = templateExamplesIncluded();
  for (const name of readdirSync(mfePackagesDir)) {
    if (isNonPackageDirectory(name)) continue;
    const packagePath = join(mfePackagesDir, name);
    if (!existsSync(join(packagePath, 'mfe.json'))) continue;
    if (!includeExamples && isTemplateExamplePackage(packagePath)) continue;
    const enriched = join(packagePath, 'dist', ENRICHED_MANIFEST);
    if (!existsSync(enriched)) continue;
    const id = readManifestId(enriched, projectDir);
    if (id !== undefined) byId.set(id, [...(byId.get(id) ?? []), name]);
  }
  return byId;
}

function setPublicPath(manifest: unknown, publicPath: string): void {
  if (typeof manifest !== 'object' || manifest === null || !('metaData' in manifest)) return;
  const { metaData } = manifest as AggregateManifest;
  if (typeof metaData === 'object' && metaData !== null) metaData.publicPath = publicPath;
}

function copyPackageDist(from: string, to: string): void {
  cpSync(from, to, {
    recursive: true,
    filter: (source) => {
      if (source === from) return true;
      const topLevel = relative(from, source).split(sep)[0];
      return !topLevel.startsWith('@mf-types') && !LEFT_OUT.has(topLevel);
    },
  });
}

/**
 * Lay out every screen the aggregate in `<projectDir>/dist` carries and
 * rewrite that aggregate with relative screen addresses. Fails before writing
 * anything when `dist/` has no aggregate, or when an aggregate config names a
 * manifest no discovered, built package declares.
 *
 * @param projectDir - The shell project directory (the one holding `dist/` and `src-app/`)
 * @param mfePackagesDir - The packages directory; defaults to `<projectDir>/src-app/mfe_packages`
 * @returns The package directories laid out, in aggregate order
 */
export function layoutDist(
  projectDir: string,
  mfePackagesDir: string = join(projectDir, 'src-app', 'mfe_packages'),
): string[] {
  const distDir = join(projectDir, 'dist');
  const aggregateFile = join(distDir, AGGREGATE_FILE);
  if (!existsSync(aggregateFile)) {
    throw new Error(
      `${relative(projectDir, aggregateFile)} does not exist. Run \`vite build\` first: it copies the aggregate from public/.`,
    );
  }

  const parsed = readJson(aggregateFile, projectDir);
  if (!Array.isArray(parsed)) {
    throw new Error(`${relative(projectDir, aggregateFile)} is not an array of manifest configs. Rebuild the project.`);
  }
  if (!parsed.every((config) => typeof config === 'object' && config !== null)) {
    throw new Error(`${relative(projectDir, aggregateFile)} carries an entry that is not a manifest config. Rebuild the project.`);
  }
  const configs = parsed as AggregateConfig[];
  const byId = builtPackagesById(mfePackagesDir, projectDir);
  const layout = configs.map((config) => {
    const id = config.manifest?.id;
    const packageDirs = typeof id === 'string' ? (byId.get(id) ?? []) : [];
    if (packageDirs.length === 0) {
      throw new Error(
        `The aggregate carries manifest ${String(id)}, which no built package under ` +
          `${relative(projectDir, mfePackagesDir)}/*/dist/${ENRICHED_MANIFEST} declares. Rebuild the MFE packages.`,
      );
    }
    if (packageDirs.length > 1) {
      throw new Error(
        `Manifest ${String(id)} is declared by more than one package: ${packageDirs.join(', ')}. ` +
          `Give each package its own manifest id in its mfe.json and rebuild.`,
      );
    }
    return { config, packageDir: packageDirs[0] };
  });

  const mfeDir = join(distDir, MFE_DIR);
  rmSync(mfeDir, { recursive: true, force: true });
  for (const { config, packageDir } of layout) {
    copyPackageDist(join(mfePackagesDir, packageDir, 'dist'), join(mfeDir, packageDir));
    const publicPath = remotePublicPath(packageDir);
    // The generator inlines the manifest into every entry, and JSON gives each
    // entry its own copy, so every copy is rewritten.
    setPublicPath(config.manifest, publicPath);
    for (const entry of config.entries ?? []) setPublicPath(entry.manifest, publicPath);
  }

  writeFileSync(aggregateFile, `${JSON.stringify(configs, null, 2)}\n`, 'utf-8');
  return layout.map(({ packageDir }) => packageDir);
}

/** A path with symlinks resolved, or the path itself when it cannot be resolved (same rule as `generate-mfe-manifests.ts`). */
function realPathOrSelf(target: string): string {
  try {
    return realpathSync(target);
  } catch {
    return target;
  }
}

// Laying out is what running this file does; a test that imports `layoutDist`
// must not touch the real project's dist/.
const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  realPathOrSelf(resolve(invokedPath)) === realPathOrSelf(fileURLToPath(import.meta.url))
) {
  try {
    const laidOut = layoutDist(process.cwd());
    console.log(`Laid out ${laidOut.length} MFE package(s) in dist/${MFE_DIR}/: ${laidOut.join(', ') || '(none)'}`);
  } catch (err) {
    console.error(`❌ ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
