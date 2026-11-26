import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  // `import.meta.url` (ProducerCodeHash) needs the CJS shim.
  shims: true,
  // Runtime dependencies resolved from the consumer's install —
  // never inlined into the producer's dist. `esbuild` drives the
  // entry-file resolver; `cjs-module-lexer` statically detects CJS
  // named exports without executing the source.
  external: ['esbuild', 'cjs-module-lexer'],
});
