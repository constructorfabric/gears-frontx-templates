import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    types: 'src/types.ts',
    testing: 'src/testing.ts',
    internal: 'src/internal.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  // Share modules across entries so `dist/testing.js`/`dist/internal.js` do not
  // duplicate plugin singletons (globalThis + WeakMaps, e.g. `routersByRegistry`)
  // relative to `dist/index.js`.
  splitting: true,
  external: [
    '@gears-frontx/state',
    '@gears-frontx/mfes',
    '@gears-frontx/gts-plugin',
    '@gears-frontx/frontx-template-shell',
    '@gears-frontx/api',
    '@gears-frontx/i18n',
    '@reduxjs/toolkit',
    'react',
    'vitest',
  ],
});
