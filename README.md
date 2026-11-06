# gears-frontx-templates

The FrontX templates, split out of the `gears-frontx` monorepo into their own repository. This repo holds nothing but templates, the CI guards that keep them consistent with the FrontX ecosystem, and the tooling those guards need. It is not a workspace over the templates - each template is a standalone npm project with its own `package.json` and lockfile - and it has no `packages/*` of its own.

## What's here

```
template-shell/                 self-contained template: a full FrontX host app, its own toolchain
template-mfe/                   add-only overlay: MFE example packages composed onto a shell
template-design-guardrails/     manifest-only overlay: a design-review AI bundle, no runtime screen
scripts/                        CI guards + the in-monorepo dev loop for developing templates
```

Each template directory carries a `frontx-template.json` manifest - that is what makes it a template (ADR-0018: manifest presence, never a `template-*` name guess). `scripts/template-discovery.mjs` is the one place that rule lives; every guard here (`validate-templates.mjs`, `template-pin-drift-check.mjs`, `version-bump-on-change-check.mjs`, ...) discovers templates through it, so a renamed or relocated template, or a fourth template added later, needs no change to any of them.

## Consuming a template

The FrontX CLI addresses a template here by subtree, not by cloning the whole repo (ADR-0017, subtree addressing):

```
frontx seed shell --source github:constructorfabric/gears-frontx-templates//template-shell@<ref>
frontx add mfe    --source github:constructorfabric/gears-frontx-templates//template-mfe@<ref>
```

`<ref>` is a tag, branch, or commit. Pin it in anything meant to be reproducible - a floating branch ref (`@main`) will move under you.

## Package passports: `frontx.gdl`

Every FrontX package here carries a passport: a `frontx.gdl` beside its `package.json`, the way a gear has its `gear.gdl`. It is the one file a tool that assembles a product from FrontX packages (Gearbox, Constructor Studio) reads the package from: who it is, how it is built and served, what it reads at start, what it calls and mounts. It is GDL 1.5: declarative, one call per file, literal values only.

The passport deliberately restates what `package.json` and `mfe.json` already say, so one file holds everything. Those tools check each restated fact against the manifest it restates, so the two copies cannot drift unnoticed (see "Keeping it in step" below). Every field but a shell's `signs_in` is optional: one left out is read from the manifests, as without a passport.

```python
# template-shell/frontx.gdl (abridged; the real file comments every field)
gdl_version = "1.5"
shell(
    name = "@gears-frontx/frontx-template-shell",   # = package.json
    version = "0.1.0-alpha.7",                      # = package.json
    description = "...",                            # = package.json
    node = ">=24.14.0",                             # the Node.js it builds with (engines)
    package_manager = "npm",                        # the one whose lock it keeps
    build = "npm run build",                        # the build step, after the install
    output = "dist",                                # where the build writes the site
    base = "/",                                     # the path it is served under
    api_prefix = "/cf/",                            # where its screens call the backend
    runtime_env = None,                             # or "public/env.js": addresses read at start
    env = {},                                       # keys read from it -> what fills them
    build_env = [],                                 # variables needed at build
    signs_in = False,                               # required
    sign_in_redirect = None,                        # or the redirect path(s), with signs_in = True
    carries = {"@gears-frontx/react": "0.2.0-alpha.15", ...},  # every FrontX package it gives what it mounts
)

# src-app/mfe_packages/<name>/frontx.gdl
gdl_version = "1.5"
mfe(
    name = "@gears-frontx/demo-mfe", version = "0.2.0-alpha.0",  # = package.json
    requires = [],                          # backend gears its screens call, by id; [] calls none
    screens = ["Hello World", ...],         # = mfe.json extensions' presentation.label, in order
    mounts = ["/hello-world", ...],         # = mfe.json extensions' route, in order
    frontx = "0.2.0-alpha.15",              # = its @gears-frontx/react pin
    roles = [],                             # permissions its screens need
    preview = ["/hello-world"],             # routes worth a screenshot
    fixtures = "src/api/mocks.ts",          # mock data for them
)
```

- **`shell(...)`**: who the shell is; how it is built (`node`, `package_manager`, `build`, `output`) and served (`base`, and `api_prefix`, the path its screens call the backend under, which the server proxies to the product's API Gateway); what it reads at start (`runtime_env`, the file, and `env`, its keys) or at build (`build_env`); whether it signs users in (`signs_in`, and `sign_in_redirect`); and `carries`, the FrontX packages it gives every micro-frontend it mounts: its `packages/*`, its exact `@gears-frontx/*` dependencies, and itself. The stock `template-shell` signs nobody in and fixes its addresses at build, so it says `signs_in = False, runtime_env = None`. A fork that adds sign-in or a `public/env.js` updates its passport.
- **`mfe(...)`**: who the micro-frontend is; `requires`, the backend gears its screens call by id (the `<gear>` in a `/cf/<gear>/v1/...` base URL); `screens` and `mounts`, as its `mfe.json` has them; `frontx`, the `@gears-frontx/react` it pins; `roles`; and `preview` and `fixtures` for screenshots. The reference packages call no gear, so they declare `requires = []`. A package copied from `_blank-mfe` carries the file along: rename it and name what it calls.
- **`library(name = ..., version = ..., description = ...)`**: a package micro-frontends share that is not one itself; it says only who it is.

### Keeping it in step

When a release bumps a version, a pin, or a screen, update the passport in the same change. At generation Gearbox reports a passport that disagrees with its manifests:

- **GBX0722, an error**: `name` or `version` other than `package.json`'s, `frontx` other than its `@gears-frontx/react` pin, `carries` other than what the shell's workspace carries, or `screens` / `mounts` other than `mfe.json`'s.
- **GBX0723, a warning**: `description` other than `package.json`'s, `node` other than its `engines.node`, a `package_manager` without its lock file, a `build` running a script `package.json` lacks, a `preview` route it does not mount, or a `fixtures` file it lacks.

Constructor Studio reports the same disagreements in its catalogue as a warning and still reads the passport. A fact the manifest does not state has nothing to disagree with.

`template-shell`'s `frontx.gdl` is in its `ownershipBoundaries`, so `frontx seed` brings it; `template-mfe`'s are inside the package subtrees it already owns. The language reference is Gearbox's `docs/gdl.md`, section "A package's passport: `frontx.gdl`".

## Relationship to the FrontX ecosystem

The templates pin the FrontX ecosystem packages they consume (`@gears-frontx/api`, `@gears-frontx/mfes`, `@gears-frontx/gts-plugin`, ...) to exact registry versions, published from [`gears-frontx`](https://github.com/constructorfabric/gears-frontx). This repo never builds those packages from source - it only verifies that a pinned version is real (see "Validating locally" below). `template-mfe`'s six overrides into `../template-shell` are the one exception: `template-shell` lives in this same repo, one level up, so its packages resolve locally without a publish round-trip - see the leading comment in `template-mfe/package.json`.

## Validating locally

```bash
npm ci
npm test                              # scripts/**/*.test.mjs (no network), including the design skill map check
npm run validate:templates            # frontx validate (manifest + content self-containment) per template
npm run policy:template-pin-drift     # every exact ecosystem pin is a real published version (registry mode)
npm run policy:template-lockfile-selflink
npm run policy:token-format
npm run policy:template-mfes-import-boundary  # ADR-0003 consumer half - no template may import a concrete @gears-frontx/mfes name
```

The design-guardrails bundle has no generated index: its one skill's `SKILL.md` map is the index, and `template-design-guardrails/tests/design-skill.test.mjs` (part of `npm test`) checks that the map names every file of the skill, that every gate id the skill cites exists, and that `SKILL.md` stays within 80 lines.

`policy:template-pin-drift` runs in one of two modes, for TEMPLATE pin sites:

- **registry mode** (default - no `FRONTX_ECOSYSTEM_DIR`): looks up every pinned ecosystem package directly on the npm registry and fails if the pinned version does not exist there. This is what CI runs on every push and PR.
- **sibling-checkout mode** (`FRONTX_ECOSYSTEM_DIR` set to a `gears-frontx` checkout): compares every pin against that checkout's actual `packages/*` versions instead - the same comparison this repo's tooling made back when the templates and the ecosystem shared one tree. The [Template Drift workflow](.github/workflows/template-drift.yml) and the dev loop below both use this mode.

This repo's own root `package.json` is a separate case, checked the same way regardless of mode: its `@gears-frontx/cli` devDependency installs the *published* CLI (so `validate:templates` can run it), not a template dependency, so it is always verified directly against the npm registry - never against a sibling checkout, which may well have an unpublished, in-development version of the CLI that this repo's `npm ci` could never install.

Inside each template, its own scripts are self-contained:

```bash
cd template-shell
npm ci
npm run build
npm run type-check
npm run lint
npm run test:unit
```

## Dev loop against a sibling gears-frontx checkout

Working on both a template and the ecosystem packages it pins at once needs a sibling checkout - templates resolve their pins from the registry by default, so a local ecosystem edit is otherwise invisible here until it is published:

```bash
git clone https://github.com/constructorfabric/gears-frontx.git ../gears-frontx
cd ../gears-frontx && npm ci && npm run build:packages && cd -

export FRONTX_ECOSYSTEM_DIR=../gears-frontx   # or rely on the default: the sibling is found automatically
npm run dev:template:link                      # repoints template-shell's installed pins at ../gears-frontx/packages/*/dist
cd template-shell && npm run dev
```

`dev:template:link` ([`scripts/link-template-ecosystem.mjs`](scripts/link-template-ecosystem.mjs)) only repoints the directories inside `template-shell/node_modules` that the template pins to the registry - it reads the template's own manifests to find out which those are, so a newly pinned package is linked without editing the script. It never writes `package.json` or `package-lock.json`. Run `npm ci` inside `template-shell` to go back to the pinned registry versions - there is no `--unlink`.

**Forgetting to relink is silent**: the template builds, type-checks, and tests green against the published pins on its own, so a missing relink produces no error - it just means the ecosystem edits you're testing aren't the code being run. If a template-side result contradicts a change you just made in the sibling checkout, suspect the link first.

`FRONTX_ECOSYSTEM_DIR` defaults to the `../gears-frontx` sibling shown above if unset, for both `dev:template:link` and `scripts/pin-template-ecosystem-to-local.mjs`. `policy:template-pin-drift` makes the opposite choice on purpose: it only switches to sibling mode when `FRONTX_ECOSYSTEM_DIR` is explicitly set, so a plain `npm run policy:template-pin-drift` on a machine that happens to have an unrelated `../gears-frontx` checkout still runs the registry check CI runs, rather than silently trusting whatever is sitting next to this repo.

## CI

- **`main.yml`** - the guards above (`validate:templates`, `policy:template-pin-drift` in registry mode, `policy:template-lockfile-selflink`, `policy:token-format`, `policy:template-mfes-import-boundary`, `policy:version-bump-on-change` on pull requests) plus two jobs: `template-validate` (each self-contained template installed and checked standalone; overlays composed onto `template-shell` and checked as a seeded project would see them) and `studio-validate` (Studio Validate Artifacts: `python3 .cf-studio/.core/skills/studio/scripts/studio.py validate` over the catalogue's `architecture/`, each registered template's `<template>/architecture` and any code paths a template registers for itself, after a bootstrap that also validates the installed sdlc kit).
- **`template-drift.yml`** - checks out `gears-frontx`'s `main` branch into a sibling path, builds its packages, then runs the same pin-to-local + install + link + build/type-check sequence a developer runs locally. Last, it runs `policy:template-pin-drift` in sibling mode against that checkout as a non-blocking signal (`continue-on-error`), since the checkout is expected to run ahead of the pins until the next publish and pin bump; registry mode is what `main.yml` runs instead, with no sibling checkout available there. Push/PR to this repo can't see a `gears-frontx` change, so this also runs on a daily schedule and via `workflow_dispatch`.
- **`publish-packages.yml`** - publishes the six `template-shell/packages/*` workspace subpackages, version-gated, in dependency order. `template-shell` itself is `"private": true` and is never published. Must run after the ecosystem packages a version bump here pins are themselves published on `gears-frontx` - a template publish that races ahead installs nothing until that lands.

## License

See [LICENSE](LICENSE) and [NOTICE](NOTICE).
