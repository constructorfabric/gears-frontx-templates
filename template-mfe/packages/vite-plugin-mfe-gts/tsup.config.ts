import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  // `import.meta.url` needs the CJS shim.
  shims: true,
  external: [
    'esbuild',
    'vite',
    '@module-federation/vite',
    '@gears-frontx/unit-producer',
    '@gears-frontx/gts-plugin',
    '@gears-frontx/mfes',
    '@gears-frontx/mfes/unit-format',
  ],
});
