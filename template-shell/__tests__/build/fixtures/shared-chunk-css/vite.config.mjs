// Build config for the shared-chunk CSS fixture, run by
// `__tests__/build/shared-chunk-css.test.ts` in a child process: the
// federation plugin turns itself off under Vitest. FIXTURE_EXPOSES picks
// which of the exposes the build declares; `mfe.json` has entries for a and
// b only, so every build declares those two and c to i are exposes without
// an entry. FIXTURE_CSS_CODE_SPLIT=false builds without per-chunk CSS.
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
};
const picked = (process.env.FIXTURE_EXPOSES ?? 'a,b,c').split(',');

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
