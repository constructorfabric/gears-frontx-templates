// Build config for the exposes-from-root fixture, run by
// `__tests__/build/exposes-from-root.test.ts` in a child process: the
// federation plugin turns itself off under Vitest. The `exposes` path is
// relative, as in every MFE package, and the tests run the build from
// another working directory.
import { defineConfig } from 'vite';
import { federation } from '@module-federation/vite';
import { frontxMfGts } from '../../../../src/build/mf-gts.ts';

export default defineConfig({
  plugins: [
    federation({
      name: 'exposesFromRootFixture',
      filename: 'remoteEntry.js',
      exposes: {
        './lifecycle': './src/lifecycle.js',
      },
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
  },
});
