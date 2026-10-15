// Build config for the shared-chunk CSS fixture, run by
// `__tests__/build/shared-chunk-css.test.ts` in a child process: the
// federation plugin turns itself off under Vitest. FIXTURE_EXPOSES picks
// which of the exposes the build declares; `mfe.json` has entries for a and
// b only, so every build declares those two and c to o are exposes without
// an entry. FIXTURE_CSS_CODE_SPLIT=false builds without per-chunk CSS.
// FIXTURE_SKEW_LAZY_PANEL=true adds a plugin that, before frontx-mf-gts
// sees the bundle, removes the lazy-panel chunk the way Vite removes a
// CSS-only chunk and gives its importer one more dynamic import than it
// rendered with.
import { defineConfig } from 'vite';
import { federation } from '@module-federation/vite';
import { frontxMfGts } from '../../../../src/build/mf-gts.ts';

const allExposes = {
  './lifecycle-a': './src/lifecycle-a.js',
  './lifecycle-b': './src/lifecycle-b.js',
  './lifecycle-c': './src/lifecycle-c.js',
  './lifecycle-d': './src/lifecycle-d.js',
  './lifecycle-e': './src/lifecycle-e.js',
  './lifecycle-f': './src/lifecycle-f.js',
  './lifecycle-g': './src/lifecycle-g.js',
  './lifecycle-h': './src/lifecycle-h.js',
  './lifecycle-i': './src/lifecycle-i.js',
  './lifecycle-j': './src/lifecycle-j.js',
  './lifecycle-k': './src/lifecycle-k.js',
  './lifecycle-l': './src/lifecycle-l.js',
  './lifecycle-m': './src/lifecycle-m.js',
  './lifecycle-n': './src/lifecycle-n.js',
  './lifecycle-o': './src/lifecycle-o.js',
};
const picked = (process.env.FIXTURE_EXPOSES ?? 'a,b,c').split(',');

const skewLazyPanel = {
  name: 'fixture-skew-lazy-panel',
  enforce: 'post',
  generateBundle(_options, bundle) {
    const removed = Object.keys(bundle).find((f) => /lazy-panel-[A-Za-z0-9_-]{8}\.js$/.test(f));
    if (removed === undefined) throw new Error('fixture: no lazy-panel chunk to remove');
    delete bundle[removed];
    for (const output of Object.values(bundle)) {
      if (output.type === 'chunk' && output.dynamicImports.includes(removed)) {
        output.dynamicImports.push('assets/fixture-extra.js');
      }
    }
  },
};

export default defineConfig({
  plugins: [
    federation({
      name: 'sharedChunkCssFixture',
      filename: 'remoteEntry.js',
      exposes: Object.fromEntries(
        Object.entries(allExposes).filter(([key]) =>
          picked.includes(key.slice(-1))
        )
      ),
      shared: {},
      manifest: true,
      dts: false,
    }),
    ...(process.env.FIXTURE_SKEW_LAZY_PANEL === 'true' ? [skewLazyPanel] : []),
    frontxMfGts(),
  ],
  build: {
    emptyOutDir: true,
    target: 'esnext',
    modulePreload: false,
    minify: false,
    cssCodeSplit: process.env.FIXTURE_CSS_CODE_SPLIT !== 'false',
  },
});
