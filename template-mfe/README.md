# FrontX MFE Packages

Microfrontend (MFE) packages for a FrontX application: `demo-mfe` (Hello World,
Profile, Current Theme, UIKit Elements, Widgets Host), `_blank-mfe` (a minimal
scaffold to copy for a new MFE), and two widget fixtures (`widgets-fixture-a`,
`widgets-fixture-b`).

All four declare `"templateExample": true` and so stay out of the application a
project builds on this template **by default**;
`FRONTX_INCLUDE_TEMPLATE_EXAMPLES=1` puts them back. See
[`src-app/mfe_packages/README.md`](src-app/mfe_packages/README.md), the
package-level reference for that rule. They cannot be run from this monorepo
either way: the shell template holds no `src-app/mfe_packages/` of its own, so
these packages first reach a runnable shell when `frontx add` puts them into one.

## Add-only — requires `template-shell`

This template is **add-only**. It claims ownership of no root `package.json`, no
build/test/lint tooling, and no `src-app/app/` host — those are owned by
[`frontx-template-shell`](../template-shell/README.md). Seeding this template into
an empty directory produces a repository with no host to mount its MFEs into.

Each MFE pins its `@gears-frontx/*` dependencies to exact published versions, so a
seeded project installs them from the registry like any other dependency.

The `package.json` next to this README is **not part of the template**: it is a
monorepo dev harness, deliberately absent from `frontx-template.json`'s
`ownershipBoundaries`, so `frontx add` never copies it anywhere. Inside this
monorepo the pins above would fetch registry tarballs instead of resolving to
local source, so the harness redirects each pinned name to its local source
via `overrides`. It redirects rather than re-declares, so the installed
versions still satisfy the pins.

This makes local edits to `template-shell/packages/*` (`react`, `auth`,
`framework`, `i18n`, `state`) visible immediately, since the MFE packages
import those names directly and the override resolves straight to that
source. It does the same for direct imports of `packages/api`,
`packages/gts-plugin`, and `packages/mfes`. **It does not** reach the
`@gears-frontx/vite-plugin-mfe-gts` and `@gears-frontx/unit-producer` that
`template-shell` builds with: `template-shell/package.json` pins
`gts-plugin`/`mfes`/`api` to their own published versions with no local
override of its own, so whatever `vitePluginMfeGts` produces at
`template-shell`'s build time reflects those registry versions, not edits made
here, until `template-shell` is rebuilt. An MFE declares the shell contract
ids it uses itself, like an independent repository, and never imports shell
code. The same not-part-of-the-template status applies
to `frontx-template.json` and this README — a template directory holds
shipped payload *and* authoring machinery, and the manifest's boundaries are
what separate the two.

Bootstrap order for working in this monorepo. Installing the harness alone is
**not** sufficient: an MFE's `vite.config.ts` loads `vitePluginMfeGts`, which
reaches into shared-package code, and each of those resolves through a `dist/`
that does not exist until built.

```bash
# 1. ecosystem packages this repo owns (api, mfes, gts-plugin, …)
npm ci && npm run build:packages

# 2. the shell, whole — `build` composes the steps in the order they depend on
#    each other
cd template-shell && npm install && npm run build

# 3. the MFEs
cd ../template-mfe && npm install
```

Use `template-shell`'s own `npm run build` to build the whole shell: it
sequences the subpackages, the MFEs, and the manifest step. Calling
`npm run build:packages` by hand is safe too: it builds only the subpackages.

For a seeded project (not this monorepo), the shell arrives as source: its
subpackages (`@gears-frontx/react` and the rest) carry no `dist/` until they
are built, so run `npm run build:packages` once before checking an MFE package
on its own (`type-check`, `test:unit` or `build` of that workspace).
`npm run build:mfes` and `npm run dev:all` build those packages themselves, so
they need no separate step.

```bash
frontx seed frontx-template-shell ./my-app
frontx add frontx-template-mfe ./my-app
cd my-app && npm install    # required after every `add` - the shell's lock is
                            # regenerated without MFE workspaces (see the
                            # shell's own README)
npm run build:packages      # once, before a scoped MFE package check
```

## What it contributes

- `src-app/mfe_packages/*` — one directory per MFE package, each with its own
  `package.json` (port in `dev`/`preview` via `--port <N>`), `mfe.json` manifest,
  and `vite.config.ts` wired for Module Federation + `vitePluginMfeGts`
  (from `@gears-frontx/vite-plugin-mfe-gts`). See the shell's `mfe-package-contract` AI guideline for the full
  contract every package here conforms to.
- An AI-extension bundle (`.frontx/ai/@gears-frontx/frontx-template-mfe/`) with
  the `add-mfe-package` skill, its workflow, a GTS ID conventions guideline, and
  a GTS ID patterns reference artifact — for scaffolding additional MFE
  packages that follow the same shape.
- `src-app/mfe_packages/README.md` — lands in the seeded project alongside the
  MFE packages, documenting the add-only precondition and how to add a new
  package from inside that project.

## Not covered here

Host application, build/test/lint tooling, root configs, and the `packages/`
solution libraries (`react`, `framework`, `state`, `i18n`, `studio`, `auth`) all
live in `template-shell`.
