import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * A worker's first test file pays for jsdom and the kit's transform, which on
 * a cold cache (CI, a fresh clone) can outrun Vitest's 5-second default; the
 * same allowance template-shell's shared config gives.
 */
const COLD_START_TIMEOUT_MS = 30_000;

/**
 * Node 25 turns on its own global Web Storage, and without a
 * `--localstorage-file` every worker warns whenever anything touches
 * `localStorage`. The tests use jsdom's storage, so Node's is switched off on
 * the workers; older Node releases do not know the flag. The same rule as
 * template-shell's `vitestNodeWorkerExecArgv`.
 */
const workerExecArgv = (): string[] => {
  const major = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);
  return major < 25 ? [] : ['--no-experimental-webstorage'];
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Same reason as the build config: kit components are Base UI primitives
    // that call hooks, and two React copies in one tree throw on the first
    // `useRef`.
    dedupe: ['react', 'react-dom'],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    execArgv: workerExecArgv(),
    testTimeout: COLD_START_TIMEOUT_MS,
    hookTimeout: COLD_START_TIMEOUT_MS,
    server: {
      deps: {
        /*
         * Kit components carry their own CSS, and Vitest hands node_modules
         * imports to Node untouched - which has no idea what a `.css` file is
         * and throws before a single test runs. Inlining the kit routes it
         * through Vite's transform instead, the same one the app build uses.
         */
        inline: ['@gears-frontx/ui-kit'],
      },
    },
    passWithNoTests: false,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
