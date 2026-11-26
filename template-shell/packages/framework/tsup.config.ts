import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'tsup';

import { SharedPackageTsupConfig } from '../../scripts/lib/SharedPackageTsupConfig';

// ESM preserves modules (one file per source module) so the unit producer
// can split the package; CJS stays bundled per entry. Code splitting keeps
// `dist/testing.cjs` from duplicating plugin singletons relative to
// `dist/index.cjs` (the ESM output shares modules by construction).
export default defineConfig((overrides) =>
  new SharedPackageTsupConfig({
    entry: {
      index: 'src/index.ts',
      mfe: 'src/mfe.ts',
      types: 'src/types.ts',
      testing: 'src/testing.ts',
    },
    cjsSplitting: true,
    packageDir: path.dirname(fileURLToPath(import.meta.url)),
    cleanOutDir: overrides.clean !== false,
    external: [
      '@gears-frontx/state',
      '@gears-frontx/mfes',
      '@gears-frontx/api',
      '@gears-frontx/i18n',
      '@reduxjs/toolkit',
      'react',
      'vitest',
    ],
  }).create()
);
