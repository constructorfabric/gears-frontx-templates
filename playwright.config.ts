import { defineConfig } from '@playwright/test';

import { SHELL_PORT } from './e2e/ports.mjs';

/**
 * Browser suite for the shared-dependency unit model. Runs against the
 * built `template-shell/dist` host and each built `template-mfe` fixture
 * dist, served from separate origins by `e2e/server.mjs`.
 *
 * Playwright is pinned to an exact version in package.json; browsers are
 * the pinned browser build for that version (`npx playwright install`).
 */

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    browserName: 'chromium',
    // E2E_PROTOCOL=h2 serves over TLS with a self-signed cert (see
    // e2e/server.mjs) — the h2 matrix cell ignores cert errors.
    ignoreHTTPSErrors: process.env.E2E_PROTOCOL === 'h2',
  },
  webServer: {
    command: 'node e2e/server.mjs',
    url: `${process.env.E2E_PROTOCOL === 'h2' ? 'https' : 'http'}://localhost:${SHELL_PORT}/index.html`,
    ignoreHTTPSErrors: process.env.E2E_PROTOCOL === 'h2',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
