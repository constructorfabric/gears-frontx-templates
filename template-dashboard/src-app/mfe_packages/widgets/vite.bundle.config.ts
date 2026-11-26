import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, normalizePath, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
// The FrontX MFE build plugin, from the MFE template of this repository: the same plugin template-mfe builds its MFEs
// with (it owns Module Federation and the FrontX manifest pipeline), not yet published to npm.
import { vitePluginMfeGts } from '../../../../template-mfe/packages/vite-plugin-mfe-gts/src/index';

/*
 * One widget bundle: a Module Federation remote built the way template-mfe
 * builds its MFEs, for the FrontX MF handler (shared: {} for MF itself, the
 * shared dependencies kept as bare imports and delivered as shared units by
 * the FrontX manifest pipeline). Run through build-bundles.mjs, which sets
 * WIDGET_TYPE and the directories.
 */

const type = process.env.WIDGET_TYPE;
if (!type) throw new Error('WIDGET_TYPE is not set: build the widget bundles with build-bundles.mjs');
const bundlesDir = process.env.WIDGET_BUNDLES_DIR ?? path.join(import.meta.dirname, 'bundles');
const outDir = process.env.WIDGET_BUNDLES_OUT ?? path.join(import.meta.dirname, 'dist');
const base = (process.env.WIDGET_BUNDLE_BASE ?? '/widgets/').replace(/\/?$/, '/');
const source = path.join(bundlesDir, type);

/*
 * The plugin builds an MFE package: a directory holding the package's
 * package.json (its name, version and the dependency set it is built
 * against) and its mfe.json. A bundle directory holds only its mfe.json and
 * lifecycle.tsx, so each build stages one in this package's node_modules
 * cache, where packages still resolve through this package's node_modules:
 * the bundle's mfe.json, and a package.json named after the bundle that
 * carries this package's version and pinned dependencies.
 */
const widgetsPackage = JSON.parse(readFileSync(path.join(import.meta.dirname, 'package.json'), 'utf-8')) as {
  version: string;
  dependencies?: Record<string, string>;
};
const root = path.join(import.meta.dirname, 'node_modules', '.cache', 'frontx-widget-build', type);
mkdirSync(root, { recursive: true });
writeFileSync(
  path.join(root, 'package.json'),
  `${JSON.stringify(
    { name: `widget_${type}`, version: widgetsPackage.version, private: true, type: 'module', dependencies: widgetsPackage.dependencies ?? {} },
    null,
    2
  )}\n`
);
writeFileSync(path.join(root, 'mfe.json'), readFileSync(path.join(source, 'mfe.json')));

// Vite builds from an HTML page; a bundle has nothing to show on its own, so every bundle gets the same placeholder
// page from here instead of an index.html file of its own.
// Vite compares module ids with forward slashes, on Windows too.
const indexHtml = normalizePath(path.join(root, 'index.html'));
const PLACEHOLDER_PAGE = '<!DOCTYPE html><html><body>Widget bundle, not meant to be opened directly.</body></html>\n';
function placeholderPage(): Plugin {
  return {
    name: 'frontx-widget-placeholder-page',
    resolveId: (id) => (id === indexHtml ? indexHtml : null),
    load: (id) => (id === indexHtml ? PLACEHOLDER_PAGE : null),
  };
}

// Shared with every other bundle: the browser fetches one copy of each for all bundles whose builds agree on its
// content hash. recharts is shared only by the bundles that draw with it, so a bundle without charts never fetches
// it; a bundle that imports recharts without being listed here still works and carries its own copy. Each shared
// package's runtime dependencies are shared with it.
const CHART_BUNDLES = new Set(['metric_card', 'cartesian_chart', 'pie_chart', 'radar_chart', 'waterfall_chart', ...(process.env.WIDGET_CHART_BUNDLES ?? '').split(',')]);
const REACT = ['react', 'react-dom'];
const shared = CHART_BUNDLES.has(type) ? [...REACT, 'recharts'] : REACT;

export default defineConfig({
  root,
  // The bundle's address: its chunks load from <base><widget_type>/, which the manifest carries as its publicPath.
  base: `${base}${type}/`,
  plugins: [
    placeholderPage(),
    react(),
    // Federation is configured by the plugin: its name comes from the staged package.json, `shared` is {}, the
    // manifest is emitted, and the build settings a remote needs (esnext, no modulePreload, minify, per-chunk CSS)
    // are enforced.
    vitePluginMfeGts({
      root,
      exposes: { [`./${type}`]: normalizePath(path.join(source, 'lifecycle.tsx')) },
      include: shared,
    }),
  ],
  build: {
    outDir: path.join(outDir, type),
    emptyOutDir: true,
    rollupOptions: { input: indexHtml },
  },
});
