/**
 * Vitest project for this repo's root `scripts/` toolchain - the guards that
 * validate the templates (manifest + content self-containment, pin-drift,
 * lockfile self-links, token format, version-bump-on-change) - plus the
 * design-guardrails template's own tests in `template-design-guardrails/tests/`
 * (the design skill map and the skill's `check-design-md.mjs` script). That
 * template's root has no Vitest config, so the root project runs
 * `template-design-guardrails/tests/`. The template's design-verify package
 * (`src-app/verify_packages/design-verify/`) keeps its own Vitest config and
 * suite, which the root project does not collect.
 *
 * Anchored at those two folders rather than an unanchored `**` glob: the other
 * template directories (`template-shell/`, `template-mfe/`) own their own
 * Vitest configs and test suites, and an unanchored glob here would
 * additionally collect (and double-report) whatever those configs already
 * cover. The `exclude` keeps every `template-*` folder out except
 * `template-design-guardrails/tests/`.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/**/*.test.mjs', 'template-design-guardrails/tests/**/*.test.mjs'],
    exclude: ['**/node_modules/**', '**/dist/**', 'template-!(design-guardrails)/**'],
    passWithNoTests: false,
  },
});
