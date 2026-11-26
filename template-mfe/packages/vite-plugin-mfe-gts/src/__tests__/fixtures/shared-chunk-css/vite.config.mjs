// Build config for the shared-chunk CSS fixture, run by
// `src/__tests__/shared-chunk-css.test.ts` in a child process: the
// federation plugin turns itself off under Vitest. FIXTURE_EXPOSES picks
// which of the exposes the build declares; `mfe.json` has entries for a and
// b only, so every build declares those two and c to z are exposes without
// an entry. lifecycle-u.js and lifecycle-v.js are byte-identical on purpose:
// one importer would let Vite fold the empty stylesheet into that expose's
// own chunk, while two importers make it land in a shared CSS-only chunk,
// the shape the empty-stylesheet tests assert. FIXTURE_CSS_CODE_SPLIT=false
// asks for a build without per-chunk CSS, which vitePluginMfeGts overrides
// (it owns build.cssCodeSplit) with a warning. FIXTURE_SKEW_LAZY_PANEL adds
// a plugin that, before vite-plugin-mfe-gts sees the bundle, deletes the
// lazy-panel chunk and changes how many dynamic imports its importer lists:
// `keep-call` leaves the importer's call to the deleted file and lists one
// import more, `drop-call` replaces that call with an empty promise and
// lists one import less. FIXTURE_LATE_CSS_APPENDER=true turns on a plugin
// listed after vitePluginMfeGts() that appends a rule to the empty kit
// stylesheet, so its compiled CSS is no longer the empty string by the time
// Vite stores it. FIXTURE_IMPORT_EDIT adds a plugin that, between
// renderChunk and vite-plugin-mfe-gts's generateBundle, edits the static
// import list of a rendered chunk the way a later plugin could: `replace`
// swaps lifecycle-w's import of the shared chunk for the kit-toaster chunk,
// `reorder` moves lifecycle-y's kit-toaster import ahead of its shared
// import. FIXTURE_HIDE_CSS_POST=true turns on a plugin listed before
// vitePluginMfeGts() whose configResolved renames the resolved vite:css-post plugin,
// so the recorder cannot find it by name and cannot be placed before it.
// The late appender and the hider are always listed and read their
// variable when their hook runs, so `reused-plugin-builds.mjs` can build
// twice from one loaded config and turn them on for its second build only.
//
// `sonner` and `fixture-shared-kit` are stand-in packages the test writes
// into this fixture's own node_modules before building: `sonner/dist/styles.css`
// is a node_modules stylesheet the fixture's code imports itself, and
// `fixture-shared-kit` a shared package (in the shared set) whose component
// modules import their own stylesheets.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { vitePluginMfeGts } from '../../../index.ts';

const root = fileURLToPath(new URL('.', import.meta.url));

const allExposes = Object.fromEntries(
  'abcdefghijklmnopqrstuvwxyz'
    .split('')
    .map((letter) => [`./lifecycle-${letter}`, `./src/lifecycle-${letter}.js`])
);
const picked = (process.env.FIXTURE_EXPOSES ?? 'a,b,c').split(',');
// FIXTURE_EXPOSE_PATHS picks how the picked exposes name their modules:
// `extensionless` drops the `.js` suffix, `missing` adds an expose naming a
// module that does not exist.
const exposePaths = process.env.FIXTURE_EXPOSE_PATHS;
const pickedExposes = Object.fromEntries(
  Object.entries(allExposes)
    .filter(([key]) => picked.includes(key.slice(-1)))
    .map(([key, modulePath]) => [key, exposePaths === 'extensionless' ? modulePath.replace(/\.js$/, '') : modulePath])
);
if (exposePaths === 'missing') pickedExposes['./lifecycle-absent'] = './src/lifecycle-absent.js';

const skewMode = process.env.FIXTURE_SKEW_LAZY_PANEL;
if (skewMode && skewMode !== 'keep-call' && skewMode !== 'drop-call') {
  throw new Error(`fixture: unknown FIXTURE_SKEW_LAZY_PANEL '${skewMode}'`);
}
const skewLazyPanel = {
  name: 'fixture-skew-lazy-panel',
  enforce: 'post',
  generateBundle(_options, bundle) {
    const removed = Object.keys(bundle).find((f) => /lazy-panel-[A-Za-z0-9_-]{8}\.js$/.test(f));
    if (removed === undefined) throw new Error('fixture: no lazy-panel chunk to remove');
    delete bundle[removed];
    const base = removed.split('/').pop();
    let importers = 0;
    for (const output of Object.values(bundle)) {
      if (output.type !== 'chunk' || !output.dynamicImports.includes(removed)) continue;
      importers++;
      if (skewMode === 'keep-call') {
        output.dynamicImports.push('assets/fixture-extra.js');
      } else {
        const call = new RegExp(`__frontx_lazy\\(\\s*['"]\\./${base.replace(/[.-]/g, '\\$&')}['"]\\s*\\)`);
        if (!call.test(output.code)) throw new Error(`fixture: no call to ${base} in ${output.fileName}`);
        output.code = output.code.replace(call, 'Promise.resolve({})');
        output.dynamicImports = output.dynamicImports.filter((f) => f !== removed);
      }
    }
    if (importers === 0) throw new Error(`fixture: no chunk imports ${removed}`);
  },
};

// Listed after `vitePluginMfeGts()` so a recorder left where the plugin is
// listed would see the stylesheet before this one.
const lateCssAppender = {
  name: 'fixture-late-css-appender',
  transform(code, id) {
    if (process.env.FIXTURE_LATE_CSS_APPENDER !== 'true' || !id.endsWith('kit-zero.css')) return null;
    return { code: `${code}\n.late-added-rule { color: teal; }\n`, map: null };
  },
};

// Renames only the plugin's name: Vite and federation never look
// `vite:css-post` up by name, so the build itself runs unchanged.
const cssPostHider = {
  name: 'fixture-css-post-hider',
  configResolved(config) {
    if (process.env.FIXTURE_HIDE_CSS_POST !== 'true') return;
    const cssPost = config.plugins.find((plugin) => plugin.name === 'vite:css-post');
    if (!cssPost) throw new Error('fixture: no vite:css-post plugin to hide');
    cssPost.name = 'fixture-hidden-css-post';
  },
};

const importEditMode = process.env.FIXTURE_IMPORT_EDIT;
if (importEditMode && importEditMode !== 'replace' && importEditMode !== 'reorder') {
  throw new Error(`fixture: unknown FIXTURE_IMPORT_EDIT '${importEditMode}'`);
}
// Matches an expose chunk by its facade and a chunk without one (a plain
// shared chunk carries its source in `modules` with a null facade).
const chunkOfSource = (bundle, sourceSuffix) =>
  Object.values(bundle).find(
    (output) =>
      output.type === 'chunk' &&
      ((typeof output.facadeModuleId === 'string' && output.facadeModuleId.endsWith(sourceSuffix)) ||
        Object.keys(output.modules ?? {}).some((id) => id.split('?')[0].endsWith(sourceSuffix)))
  );
// Runs its generateBundle before vite-plugin-mfe-gts's (same `enforce:
// 'post'`, listed ahead of it), so it edits the static import lists after
// Vite's CSS plugin has removed the CSS-only chunks and before the
// attribution reads them: the same window a real later plugin occupies. It
// edits only each chunk's `imports` metadata, never the chunk's code.
const importEditor = importEditMode
  ? {
      name: 'fixture-import-editor',
      enforce: 'post',
      generateBundle(_options, bundle) {
        const sharedChunk = chunkOfSource(bundle, 'src/shared.js');
        const kitToasterChunk = chunkOfSource(bundle, 'src/kit-toaster.js');
        if (!sharedChunk) throw new Error('fixture: no shared chunk in the bundle');
        if (!kitToasterChunk) throw new Error('fixture: no kit-toaster chunk in the bundle');
        if (importEditMode === 'replace') {
          const wChunk = chunkOfSource(bundle, 'src/lifecycle-w.js');
          if (!wChunk) throw new Error('fixture: no lifecycle-w chunk in the bundle');
          let replaced = 0;
          wChunk.imports = wChunk.imports.map((imported) => {
            if (imported !== sharedChunk.fileName) return imported;
            replaced += 1;
            return kitToasterChunk.fileName;
          });
          if (replaced !== 1) {
            throw new Error(`fixture: expected exactly one shared import in ${wChunk.fileName}, found ${replaced}`);
          }
        } else {
          const yChunk = chunkOfSource(bundle, 'src/lifecycle-y.js');
          if (!yChunk) throw new Error('fixture: no lifecycle-y chunk in the bundle');
          const sharedAt = yChunk.imports.indexOf(sharedChunk.fileName);
          const kitToasterAt = yChunk.imports.indexOf(kitToasterChunk.fileName);
          if (sharedAt === -1 || kitToasterAt === -1 || kitToasterAt < sharedAt) {
            throw new Error(
              `fixture: expected the shared import before the kit-toaster import in ${yChunk.fileName}, got [${yChunk.imports.join(', ')}]`
            );
          }
          yChunk.imports = [
            kitToasterChunk.fileName,
            ...yChunk.imports.filter((imported) => imported !== kitToasterChunk.fileName),
          ];
        }
      },
    }
  : null;

// The plugin's own array: the federation plugins first, then the plugin
// itself (which places its empty-stylesheet recorder before vite:css-post
// when the config resolves). The fixture plugins go between the two, where
// upstream's fixture listed them.
const mfePlugins = vitePluginMfeGts({
  root,
  exposes: pickedExposes,
  cacheDir: process.env.FIXTURE_CACHE_DIR,
  // The fixture's entities are not GTS-typed: the type system accepts them.
  typeSystem: { registerSchema() {}, register() {} },
});
const mainAt = mfePlugins.findIndex((plugin) => plugin && plugin.name === 'gears-frontx-vite-plugin-mfe-gts');
if (mainAt === -1) throw new Error('fixture: vitePluginMfeGts() returned no gears-frontx-vite-plugin-mfe-gts plugin');

export default defineConfig({
  root,
  // `zero-kit/zero.css` resolves like a kit import to `src/kit-zero.css`, a
  // stylesheet that compiles to no CSS.
  resolve: {
    alias: {
      'zero-kit/zero.css': fileURLToPath(new URL('./src/kit-zero.css', import.meta.url)),
    },
  },
  plugins: [
    ...mfePlugins.slice(0, mainAt),
    ...(skewMode ? [skewLazyPanel] : []),
    ...(importEditMode ? [importEditor] : []),
    cssPostHider,
    ...mfePlugins.slice(mainAt),
    lateCssAppender,
  ],
  build: {
    emptyOutDir: true,
    ...(process.env.FIXTURE_CSS_CODE_SPLIT === 'false' ? { cssCodeSplit: false } : {}),
  },
});
