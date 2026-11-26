import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'tsup';

import { SharedPackageTsupConfig } from '../../scripts/lib/SharedPackageTsupConfig';

// ESM preserves modules (one file per source module) so the unit producer
// can split the package; CJS stays bundled per entry.
export default defineConfig((overrides) =>
  new SharedPackageTsupConfig({
    entry: {
      index: 'src/index.ts',
      types: 'src/types.ts',
    },
    packageDir: path.dirname(fileURLToPath(import.meta.url)),
    cleanOutDir: overrides.clean !== false,
  }).create()
);
