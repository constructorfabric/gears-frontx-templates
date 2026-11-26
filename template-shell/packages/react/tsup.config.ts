import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'tsup';

import { SharedPackageTsupConfig } from '../../scripts/lib/SharedPackageTsupConfig';

// ESM preserves modules (one file per source module) so the unit producer
// can split the package; CJS stays bundled per entry. Code splitting keeps
// `dist/mfe.cjs` and `dist/index.cjs` on one FrontXContext, provider and
// query client (the ESM output shares modules by construction).
export default defineConfig((overrides) =>
  new SharedPackageTsupConfig({
    entry: {
      index: 'src/index.ts',
      mfe: 'src/mfe.ts',
      testing: 'src/testing.ts',
      types: 'src/types.ts',
    },
    cjsSplitting: true,
    packageDir: path.dirname(fileURLToPath(import.meta.url)),
    cleanOutDir: overrides.clean !== false,
    external: [
      // All @gears-frontx packages - peer dependencies.
      // The framework is imported via the main barrel and the /mfe subpath
      // (`@gears-frontx/framework`, `@gears-frontx/framework/mfe`); the regex
      // externalizes the package root
      // and every subpath so the bundler never inlines framework code.
      /^@gears-frontx\/framework(?:\/|$)/,
      // React ecosystem
      'react',
      'react-dom',
      'react/jsx-runtime',
      'react-redux',
      '@tanstack/react-query',
      'use-sync-external-store',
      'use-sync-external-store/shim',
      /^use-sync-external-store/,
      // Common utilities that should not be bundled
      'lodash',
      /^lodash\//,
    ],
  }).create()
);
