# Extension-domain routing remediation plan

> **Execution note:** work in `/Users/virtuozzo/gears-frontx-templates` on the
> existing PR branch. The rejected-teardown repair is a separately versioned
> `@gears-frontx/mfes` follow-up and templates must wait for that alpha release.

## Scope and acceptance criteria

Resolve the six blocking review comments on templates PR #3 while retaining the
published SDK boundary: MFES owns route identity and validation; framework owns
routing/lifecycle integration; applications only compose it.

1. Add failing regression tests for duplicate/in-flight observer mounts,
   Back-before-mount settlement, and stale stop/start lifecycle callbacks.
2. Move the generic coordinator and entry-address utilities/schema from private
   shell code to `@gears-frontx/framework`, using `getExtensionRouteToken`.
3. Register and export the entry-address schema from the framework plugin.
4. Add failing lifecycle-host tests, then make teardown await in-flight mounts,
   isolate release failures, and always call the base unmount. Keep mounted-set
   cleanup in the MFE runtime, which owns that state.
5. Correct navigation guidance and adjust package metadata/lockfile for the
   framework routing peer dependency.
6. Run focused tests, package type/lint checks, full relevant workspace tests,
   and inspect the final diff against the PR base.

## File-level sequence

1. Add regressions in `template-shell/src/routing/__tests__` and framework
   plugin tests; run them to prove current failures.
2. Add lifecycle-host teardown regressions and prove them failing.
3. Relocate implementation to
   `template-shell/packages/framework/src/plugins/microfrontends/`, export it,
   and make shell imports consume the public framework API.
4. Update the demo MFE lifecycle host and its tests.
5. Remove obsolete shell-private routing/schema exports, update documentation,
   dependency metadata and lockfile.
6. Verify every blocker and classify non-blocking comments as resolved or
   follow-up without posting external review replies.

## Risks and guardrails

- Keep MFES free of `@gears-frontx/routing` imports and preserve its canonical
  token helper as the single semantic source.
- Use lifecycle epochs plus in-flight ownership tracking so old callbacks cannot
  mutate a newer session.
- Do not use `npm install` unless needed for the lockfile; inspect any generated
  lockfile change for local `file:` self-links.
- No commit or PR mutation is part of this pass.
