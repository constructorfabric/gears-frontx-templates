/**
 * A private working copy of a fixture MFE for one test run. Builds write
 * into it — stand-in `node_modules`, edited sources, the producer's cache
 * (`cacheDir`) — and nothing of that reaches the shared fixture
 * directory or the workspace's own producer cache; `remove()` deletes it.
 */

import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { put } from './files';

const fixturesDir = fileURLToPath(new URL('../fixtures/', import.meta.url));
const pluginIndex = fileURLToPath(new URL('../../index.ts', import.meta.url));
const viteEntry = path.join(
  path.dirname(createRequire(import.meta.url).resolve('vite/package.json')),
  'dist',
  'node',
  'index.js'
);

export interface FixtureRun {
  /** The working copy's directory. */
  dir: string;
  /** The producer cache of this run: pass it to the plugin as `cacheDir`. */
  cacheDir: string;
  /** The environment the fixture's config reads the cache directory from. */
  env: { FIXTURE_CACHE_DIR: string };
  remove(): void;
}

function newRun(prefix: string): FixtureRun {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `mfe-gts-${prefix}-`)));
  const cacheDir = path.join(dir, '.producer-cache');
  return {
    dir,
    cacheDir,
    env: { FIXTURE_CACHE_DIR: cacheDir },
    remove: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

/**
 * The config and script files of a copy load the plugin from its source
 * and `vite` from the plugin package, whatever directory the copy lives in.
 */
function repointImports(dir: string): void {
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.mjs'))) {
    const full = path.join(dir, file);
    const text = fs
      .readFileSync(full, 'utf-8')
      .replace(/(['"])(?:\.\.\/)+index\.ts\1/g, JSON.stringify(pluginIndex))
      .replace(/from\s+(['"])vite\1/g, `from ${JSON.stringify(pathToFileURL(viteEntry).href)}`);
    fs.writeFileSync(full, text);
  }
}

/** A private copy of `fixtures/<name>`. */
export function copyFixture(name: string): FixtureRun {
  const run = newRun(name);
  fs.cpSync(path.join(fixturesDir, name), run.dir, {
    recursive: true,
    filter: (source) => path.basename(source) !== 'node_modules',
  });
  repointImports(run.dir);
  return run;
}

/**
 * A private project with a stock `vite.config.mjs` building one MFE with
 * the plugin: `exposes` maps each expose key to its module, and the config
 * reads the producer cache from `FIXTURE_CACHE_DIR`.
 */
export function scratchMfe(params: { name: string; exposes: Record<string, string> }): FixtureRun {
  const run = newRun(params.name);
  put(
    path.join(run.dir, 'vite.config.mjs'),
    `import { defineConfig } from ${JSON.stringify(pathToFileURL(viteEntry).href)};
import { vitePluginMfeGts } from ${JSON.stringify(pluginIndex)};

export default defineConfig({
  root: ${JSON.stringify(run.dir)},
  plugins: [
    vitePluginMfeGts({
      root: ${JSON.stringify(run.dir)},
      exposes: ${JSON.stringify(params.exposes)},
      cacheDir: process.env.FIXTURE_CACHE_DIR,
      typeSystem: { registerSchema() {}, register() {} },
    }),
  ],
  build: { emptyOutDir: true },
});
`
  );
  put(path.join(run.dir, 'index.html'), '<!doctype html>\n<html><head><meta charset="utf-8" /></head><body></body></html>\n');
  put(
    path.join(run.dir, 'mfe.json'),
    JSON.stringify({
      manifest: { id: 'fixture.manifest', remoteEntry: 'remoteEntry.js' },
      entries: Object.keys(params.exposes).map((exposedModule, i) => ({
        id: `fixture.entry${i}`,
        requiredProperties: [],
        actions: [],
        domainActions: [],
        manifest: 'fixture.manifest',
        exposedModule,
      })),
      extensions: [],
      schemas: [],
    })
  );
  return run;
}

/** Writes a stand-in installed package under the run's `node_modules`. */
export function installPackage(
  run: FixtureRun,
  name: string,
  packageJson: Record<string, unknown>,
  files: Record<string, string>
): void {
  const dir = path.join(run.dir, 'node_modules', name);
  put(path.join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0', type: 'module', ...packageJson }));
  for (const [file, content] of Object.entries(files)) put(path.join(dir, file), content);
}
