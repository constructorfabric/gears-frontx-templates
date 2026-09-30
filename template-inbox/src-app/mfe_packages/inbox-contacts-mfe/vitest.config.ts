/// <reference types="node" />
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vitest/config';
import { defineMfeProject } from '../../vitest.mfe.base';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default mergeConfig(
  defineMfeProject(__dirname),
  defineConfig({
    resolve: {
      alias: {
        '@inbox-shared': path.resolve(__dirname, '../shared/inbox'),
      },
      // The same reason as the build config: the shared folder must take this
      // package's kit and icons, not a copy hoisted above it.
      dedupe: ['@gears-frontx/ui-kit', 'lucide-react', 'recharts'],
    },
    test: {
      // The inbox's own browser surface and per-test resets, after the shell's.
      setupFiles: ['./src/__test-utils__/setup.ts'],
      /*
       * Without CSS processing a stylesheet import resolves to an empty
       * string, and the tests that read the kit's real theme.css (the token
       * re-anchoring, the lifecycle's shadow-root styles) would assert
       * against nothing.
       */
      css: true,
      server: {
        deps: {
          /*
           * The kit ships one CSS Module per component, imported from its
           * emitted chunks. Left external, those imports reach Node's ESM
           * loader, which cannot load `.css`; inlining hands them to Vite.
           */
          inline: ['@gears-frontx/ui-kit'],
        },
      },
    },
  })
);
