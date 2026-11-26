// Build config for the lazy shared-package fixture, run by
// `src/__tests__/lazy-shared-package.test.ts` in a child process: the
// federation plugin turns itself off under Vitest. `lazy-kit` is a
// stand-in shared package the test writes into this fixture's own
// node_modules before building. The config file is loaded from the
// plugin package directory, so the plugin's `root` option, not the
// working directory, names this package.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { vitePluginMfeGts } from '../../../index.ts';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root,
  plugins: [
    vitePluginMfeGts({
      root,
      exposes: { './lifecycle': './src/lifecycle.js' },
      cacheDir: process.env.FIXTURE_CACHE_DIR,
      // The fixture's entities are not GTS-typed: the type system accepts them.
      typeSystem: { registerSchema() {}, register() {} },
    }),
  ],
  build: { emptyOutDir: true },
});
