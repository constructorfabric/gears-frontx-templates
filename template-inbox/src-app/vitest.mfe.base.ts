import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import {
  COLD_START_TIMEOUT_MS,
  COVERAGE_EXCLUDE,
  COVERAGE_THRESHOLDS,
  DEFAULT_TEST_EXCLUDE,
  SHARED_VITEST_SETUP_FILES,
  TEST_INCLUDE_TSX,
  vitestNodeWorkerExecArgv,
} from '../../template-shell/vitest.shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * The published MFE packages are installed below a shell application's
 * `src-app/`, where this shared config and its test helpers are supplied by
 * the shell template. This repository runs those packages in a separate
 * dev-harness, so local forwarding modules keep the same imports executable
 * without changing the published package layout.
 */
const frontxTestUtilsRoot = path.resolve(__dirname, './__test-utils__');

export const mfeVitestBaseConfig = defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@frontx-test-utils': frontxTestUtilsRoot,
    },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    fs: {
      allow: [
        path.resolve(__dirname, '..'),
        path.resolve(__dirname, '../../template-shell'),
      ],
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    passWithNoTests: false,
    execArgv: vitestNodeWorkerExecArgv(),
    setupFiles: [...SHARED_VITEST_SETUP_FILES],
    testTimeout: COLD_START_TIMEOUT_MS,
    hookTimeout: COLD_START_TIMEOUT_MS,
    include: [...TEST_INCLUDE_TSX],
    exclude: [...DEFAULT_TEST_EXCLUDE],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [...COVERAGE_EXCLUDE],
      thresholds: { ...COVERAGE_THRESHOLDS },
    },
  },
});

export function defineMfeProject(rootDir: string) {
  return mergeConfig(
    mfeVitestBaseConfig,
    defineConfig({
      root: rootDir,
    }),
  );
}
