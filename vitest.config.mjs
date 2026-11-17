/**
 * Vitest project for this repo's root `scripts/` toolchain - the guards that
 * validate the templates (manifest + content self-containment, pin-drift,
 * lockfile self-links, token format, version-bump-on-change) - plus the
 * design-guardrails bundle's tests in `tooling/tests/design-guardrails/`.
 * The design-verify package keeps its own suite, run in the composed project.
 * Anchored includes avoid collecting the template packages a second time.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/**/*.test.mjs', 'tooling/**/*.test.mjs'],
    exclude: ['**/node_modules/**', '**/dist/**', 'template-*/**'],
    passWithNoTests: false,
  },
});
