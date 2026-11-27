---
name: frontx-template-mfe-add-mfe-package
description: "Scaffold a new microfrontend (MFE) package inside template-mfe — copy the _blank-mfe reference scaffold, assign a port and GTS identifiers that conform to this bundle's naming scheme, and register it with the shell's manifest pipeline."
---

# Add an MFE Package (template-mfe)

**Seeing it first:** when the design guardrails template is installed (check for `.frontx/ai/*/*/skills/frontx-design-proposal/`), its `frontx-design-proposal` skill decides first, by the rule its SKILL.md names, whether a new page is drawn before it is built: at once when the person asked to see the page or options first; otherwise offered once, in one short line in the person's language, when they have neither seen nor described its look. The offer ends the agent's turn: nothing is built in that turn. A reply that declines it, asks to build at once or ignores the offer means build now, with no second ask. When there is a record, the frontx-design-proposal skill's `build.md` in its `references/` ("Find the record") reads it first and is the authority: a record that is `awaiting selection` or `replaced` is never built from.

This skill is specific to **template-mfe**. It relies on template-mfe's concrete
scaffold (`src-app/mfe_packages/_blank-mfe/`) and manifest pipeline
(`scripts/generate-mfe-manifests.ts`, `public/generated-mfe-manifests.json`) — none of
which is base-kit (F15) content, which stays solution-agnostic.

**Precondition:** requires an applied `template-shell` (root `package.json`,
`src-app/app/`, and the build/test/manifest pipeline) already in the project —
`template-mfe` only adds MFE packages into that shell; it does not scaffold a
repository standalone.

## When to use

The Project Developer wants to add a new microfrontend screen to a project that
already has `template-shell` applied (a new screenset entry, a new isolated UI unit
to mount into an extension domain). When the task adds two or more MFE packages,
follow `workflows/add-mfe-packages-parallel.md` in this bundle: it phases this
skill's steps so the per-package work runs concurrently — this skill remains the
authority on each step.

## What template-mfe provides

- A working, disposable MFE scaffold at `src-app/mfe_packages/_blank-mfe/`: Shadow DOM
  isolation, bridge communication (`ChildMfeBridge`), theme/language shared-property
  subscriptions, per-MFE i18n, and a Module Federation `vite.config.ts` already wired.
- An `mfe.json` manifest describing the MFE's Module Federation `manifest`, its
  `entries[]` (exposed modules + required shared properties), and its `extensions[]`
  (domain + presentation metadata for the screen it contributes).
- `npm run generate:mfe-manifests` (`scripts/generate-mfe-manifests.ts`), which reads
  every MFE package's built manifest and aggregates them into
  `public/generated-mfe-manifests.json` — the file every FrontX app instance (host or
  nested) reads at runtime to discover MFEs.
- `npm run dev:all` (`scripts/dev-all.ts`), which auto-discovers any package under
  `src-app/mfe_packages/*/package.json` by reading the port out of its `dev`/`preview`
  script — no manual wiring required once the package exists.
- Packages template-mfe ships as its own worked examples, and the scaffold itself,
  all declare `"templateExample": true` in their `mfe.json`. Manifest generation,
  `dev:all`, and `type-check:mfe` all leave those out, so a project runs and
  type-checks the packages its developer added and nothing else;
  `FRONTX_INCLUDE_TEMPLATE_EXAMPLES=1` puts them back for anyone wanting to see
  the shipped examples run and compile.

## Steps

1. **Copy the scaffold, rename the copy and strip its example flag**: one step,
   because a copy that keeps the flag registers nothing and nothing fails to say
   so, and because a copy that waits for its rename in a later step is a second
   workspace under the scaffold's name. Name the new directory after the
   screenset/screen being added, copy the scaffold, and rename the copied
   package at once:

   ```bash
   NEW=src-app/mfe_packages/{name}-mfe
   cp -r src-app/mfe_packages/_blank-mfe "$NEW"
   node -e 'const f=process.argv[1],fs=require("fs"),m=JSON.parse(fs.readFileSync(f,"utf8"));m.name="@gears-frontx/{name}-mfe";fs.writeFileSync(f,JSON.stringify(m,null,2)+"\n")' "$NEW/package.json"
   node -e 'const f=process.argv[1],fs=require("fs"),m=JSON.parse(fs.readFileSync(f,"utf8"));delete m.templateExample;fs.writeFileSync(f,JSON.stringify(m,null,2)+"\n")' "$NEW/mfe.json"
   ```

   The rename runs directly after the copy, and no npm command at the project
   root runs between the copy and the rename. Until the name changes, the copy
   is a second workspace named `@gears-frontx/blank-mfe`, and any npm workspace
   command at the project root exits 1 with `npm error code EDUPLICATEWORKSPACE`,
   `npm error must not have multiple workspaces with the same name`, and
   `npm error package '@gears-frontx/blank-mfe' has conflicts in the following
   paths: .../_blank-mfe and .../<new>`.

   `_blank-mfe/mfe.json` declares `"templateExample": true`, which is what keeps
   the scaffold itself out of the running application; a copy that keeps it is
   invisible the same way. Such a copy still installs and still runs its own
   tests, and `type-check:mfe` skips it by default too, so it compiles only when
   the run sets `FRONTX_INCLUDE_TEMPLATE_EXAMPLES=1`. The only report is one line
   in the `generate:mfe-manifests` / `dev:all` / `type-check:mfe` output naming
   what was left out - nothing fails, and the new screen is simply absent from
   the menu. Verify the rename and the strip before moving on:

   ```bash
   grep -q '"name": "@gears-frontx/{name}-mfe"' "$NEW/package.json" && echo "package renamed" || echo "PACKAGE NAME NOT RENAMED"
   grep -q templateExample "$NEW/mfe.json" && echo "FLAG STILL PRESENT - remove it" || echo "flag stripped"
   ```
2. **Pick a free port**: read the ports the project's MFE packages already use (the
   `--port <N>` in the `dev` and `preview` scripts of every
   `src-app/mfe_packages/*/package.json`, which `dev:all` also reads), and pick the
   next free port in the range the project already uses. Only when the project has
   no MFE package of its own yet (only the template's examples: `demo-mfe` on
   `3001`, `_blank-mfe` on `3099`, the widgets fixtures on `3201`/`3202`), use the
   default slots `3010`, `3020`, and so on. Set it in both the `dev`
   (`vite --port {port}`) and `preview` (`vite preview --port {port}`) scripts of the
   copied package's `package.json`. The same port also goes into the copied
   `mfe.json` `manifest.remoteEntry` URL
   (`http://localhost:<port>/assets/remoteEntry.js`; the `_blank-mfe` copy points at
   `3099`). `dev:all` needs `--port <N>` literally in those scripts.
3. **Rename the Module Federation identity**: set `name` in the copied
   `vite.config.ts` (camelCase, the camelCase of the package name from step 1,
   so the two agree), and keep `@gears-frontx/routing` in `sharedDeps` there and
   pinned in `package.json`, as the scaffold has it (add
   `@gears-frontx/routing-tanstack` to both, under `dependencies`, only when the
   MFE uses `<ExtensionRouter>` or `navigation()`).
4. **Link the new workspace** - run `npm install` once at the project root (the
   applied shell), after the copy and its rename:

   ```bash
   npm install
   ```

   The rename makes the package a workspace of the shell, but nothing links it
   under `node_modules/@gears-frontx/` or records it in `package-lock.json`
   until an install runs. Without that install, `npm ls` exits 1 with an
   `UNMET DEPENDENCY <new name>@file:...` line and a `missing: <new name>,
   required by @gears-frontx/frontx-template-shell` line, and no link appears
   under `node_modules/@gears-frontx/`. `npm ci` exits 1 with:

   > npm ci can only install packages when your package.json and
   > package-lock.json ... are in sync ... Missing: <new name>@<version> from
   > lock file

   Scoped checks do not prove the link: `npm run type-check -w <new name>`,
   the package's own vitest, and `npm run build -w <new name>` all exit 0 on an
   unlinked workspace. Commit the `package-lock.json` change together with the
   package.
5. **Assign GTS IDs**: rewrite every placeholder ID in `mfe.json` following
   template-mfe's ID taxonomy (see the `gts-id-conventions` guideline and the
   `gts-id-patterns-reference` reference artifact in this same bundle): a manifest ID,
   one entry ID per exposed module, and one extension ID per screen contributed to a
   domain (typically `gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.screen.v1`
   for a screen-domain contribution). `presentation.label` is the English menu
   label; a menu label in another language goes in a label dictionary under
   `public/labels/` (the `navigation-contribution` guideline), whose
   `labels[].extension` is the screen extension's own `id`
   (`gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~...`),
   not the domain ID.
   `presentation.icon` is an Iconify name (`lucide:home`); its data is bundled
   at build time from the installed `@iconify-json/<prefix>` packages, so a new
   prefix needs that package added as a devDependency of the shell. A prefix
   package that is not installed, or a set that does not carry the name, fails
   the shell's build step (`generate:mfe-manifests`, and so `dev` and `build`)
   with an error naming the icon and the package to install - the generator
   validates every declared icon and removes the half-written bundle. An icon
   missing only from a stale bundled file (the shell's
   `generated-menu-icons.json` older than the package) renders no icon and one
   dev console warning; nothing is fetched from the network for icons.
6. **Implement the lifecycle**: `src/lifecycle.tsx` extends `ThemeAwareReactLifecycle`
   from `@gears-frontx/react`; the MFE's own `init.ts` builds its app instance with
   `createFrontX().use(effects()).use(queryCacheShared()).use(mock()).build()` so it
   joins the host's shared `QueryClient` without owning a second one. Each API
   service gets one service-level test beside its mock-map test, modelled on
   `_blank-mfe/src/api/_BlankApiService.test.ts`: `attachRegisteredRestMocks(service)`,
   then each endpoint's `fetch()`, asserting the mocked payload. A map test only
   calls the factory, so a key that misses the URL the service really sends
   passes it while the screen renders empty.
7. **Build the screen's UI from `@gears-frontx/ui-kit`**: the shell installs the
   kit, and its installed `llms.txt` is the component inventory. The kit is the
   only component source: no other component library, and no shadcn components
   or APIs — the kit follows shadcn conventions, so shadcn patterns may guide
   which kit component maps to a UI pattern, nothing more. Confirm the copied
   package declares `@gears-frontx/ui-kit` in its dependencies (add it if the
   scaffold copy predates the kit migration and lacks it). Before writing any
   markup, produce an explicit plan: map every visible UI pattern on the
   screen to a concrete kit component or approved composition from the
   inventory, and record the screen's grid columns, alignment anchors, and
   responsive breakpoints. A pattern with no kit mapping is reported in the
   plan as a gap — never guessed at or recreated locally. Then compose from
   kit components and semantic tokens; hand-rolling a
   look-alike of an existing kit component is a defect, not a style choice. If a
   design-contract bundle is installed in the project (any AI bundle that ships a
   `frontx-design` skill; check for `.frontx/ai/*/*/skills/frontx-design/`),
   that skill's `references/generate.md` and its design contract govern how the
   screen is generated: follow them. If none is installed, say so in the plan: the screen is being generated
   without a design contract.
   Replace the scaffold's `HomeScreen` content wholesale: its "Bridge Info"
   card (domain id, instance id, theme, language) is scaffold demo residue,
   the screen equivalent of the `templateExample` flag — a shipped screen
   that still renders it is a defect. Keep the lifecycle wiring the scaffold
   demonstrates; drop the demo markup and its i18n keys, and add the
   replacement keys to every locale file the scaffold ships
   (`src/screens/home/i18n/*.json`) — the key sets must stay identical across
   locales, or non-default locales render missing-translation placeholders.
   One runtime fact to build against: under `dev:all` the MFEs are served
   from a production build (`vite build && vite preview`), so
   `import.meta.env.DEV` is `false` inside MFE code even in development —
   never gate dev-only hooks or debug affordances on it in an MFE package;
   only the host app runs on a true dev server.

   Not all of the scaffold's tests are example content: `HomeScreen.test.tsx`
   and `lifecycle.test.tsx` also cover plumbing that outlives the screen, so
   replace only the cases that assert what is being replaced.
   Replaced with the screen:
   - `HomeScreen.test.tsx`: "renders bridge-provided values and API status
     data", "renders the API error message when the status call fails",
     "announces a busy region instead of bridge values before translations are
     ready", "announces a busy region beside the bridge values while the API
     request is pending".
   - `lifecycle.test.tsx`: "renders the real home screen with the provided
     bridge", and the example status payload its `beforeEach` supplies for it.
   Kept, and they must keep passing:
   - `HomeScreen.test.tsx`: "scopes the screen to the kit dark tokens for
     every dark host theme and to light otherwise", "re-reads current
     properties when the host swaps the bridge instance", "reacts to bridge
     property updates and unsubscribes on unmount", "sets the host direction
     from the primary subtag of a region-tagged language", "%s keeps the cold
     loading frame as tall as the screen slot". The first asserts that the
     screen root's `data-theme` is `dark` for each dark host theme the host
     registers (`dark`, `dracula`, `dracula-large`) and `light` for the light
     themes and for an identifier the host never registers (the lifecycle
     stamps the same kit scope on the shadow host); "re-reads current
     properties when the host swaps the bridge instance" and "sets the host
     direction from the primary subtag of a region-tagged language" query the
     scaffold's `screen-theme` and `screen-language` testids, while "reacts to
     bridge property updates and unsubscribes on unmount" matches the rendered
     theme and language values with `findByText`/`getByText`; all three also
     assert the host direction (`host.dir`), so re-point those queries at the
     new screen rather than deleting the cases. The theme-scope case also
     waits on the scaffold's domain-id text (`findByText(TEST_DOMAIN_ID)`)
     before asserting `data-theme`; re-point that wait at the new screen too
     (for example the `screen-root` testid). The `it.each` case asserts the
     loading root keeps a `min-height` of `100%` of the screen slot; when the
     new screen keeps the hook's loading branch, add it to that table.
   - `lifecycle.test.tsx`: every other case - app binding, token re-anchoring,
     base mount, and the eight host-scope cases (light, dark, theme change after
     unmount, duplicate mount, second container, missing theme, non-string
     theme, plain element container).

   The copy carries the scaffold's own identity outside those cases too.
   Rewrite or delete it with the screen, file by file:
   - `README.md`: the whole file describes the blank template, from its
     `# Blank MFE Template` heading through the copy instructions,
     `@gears-frontx/blank-mfe`, `blankMfe`, the `frontx.blank` ID tokens and
     the `_blank-mfe/` tree listing. Replace it with the new package's README,
     or delete it.
   - `index.html`: `<title>Blank MFE Remote</title>`.
   - `mfe.json`: the `/blank-home` route and the `Blank Home` label; step 5
     rewrites the IDs around them.
   - `src/init.ts`, `src/api/_BlankApiService.test.ts`, `src/api/mocks.test.ts`
     and `src/shared/useScreenTranslations.test.tsx`: the
     `@cpt-dod:...-blank-mfe-tests:p1` marker at the top of each file (point it
     at the new package's own test-generation DOD, or delete it).
   - `src/lifecycle.tsx`: the `BlankMfeLifecycle` class name.
   - `src/lifecycle.test.tsx`: `describe('blank-mfe lifecycle')`, the
     `mfeApp: { id: 'blank-mfe-app' }` fixture and its assertion, the
     `blank-domain`, `blank-instance` and `blank-theme` ids, and the
     `'Blank MFE query example is active.'` message; the kept cases re-point
     them at the new screen.
   - `src/init.test.ts`: `describe('_blank-mfe init')`, `'blank-mfe-app'` and
     `'_blank/home'`.
   - `src/homeFlux.test.ts`: `describe('blank-mfe home flux modules')` and
     `'_blank/home'`.
   - `src/slices/homeSlice.ts`: the `'_blank/home'` slice name and its state key.
   - `src/api/_BlankApiService.ts` and `src/api/_BlankApiService.test.ts`: the
     `_BlankApiService` file and class names, the `'/api/blank'` base URL, and
     the `inst-blank-descriptors` markers around the endpoint descriptors.
     Neither file holds a mock class; the mock classes live in the tests that
     mock the service, below.
   - `src/api/mocks.ts` and `src/api/mocks.test.ts`: `blankMockMap`,
     `GetBlankStatusResponse`, the `'GET /api/blank/status'` mock key, the test
     title that names the blank template, and the query-example message.
   - `src/api/types.ts`: `GetBlankStatusResponse`.
   - `src/init.ts`, `src/screens/home/HomeScreen.tsx` and the tests that mock
     it: the `_BlankApiService` import, `vi.mock` path and service lookup,
     which follow the file rename. Each mock factory names its class itself:
     `MockBlankApiService` in `src/lifecycle.test.tsx` and
     `src/screens/home/HomeScreen.test.tsx`, and `BlankApiService` (no `Mock`
     prefix) in `src/init.test.ts`. Those are the factories' own names, not the
     service's, so rename each with its file.

   Comments that use `blank` as prose (the in-file headers, the shared-module
   duplication notes, the verb to blank a screen) are not identity strings:
   nothing resolves them at build or run time.
8. **Build the shell's packages before the first package check** - run
   `npm run build:packages` once at the project root (the applied shell)
   before the initial `type-check`, `test:unit` or `build` of the new MFE. The
   package checks resolve `@gears-frontx/react` and
   `@gears-frontx/frontx-template-shell` through their built output (`dist/`,
   `dist-lib/`), which a fresh seed does not carry until this build runs;
   without it they stop on `TS2307: Cannot find module '@gears-frontx/react'`
   before they read any of the screen's code. The command builds the shell's
   own packages; the MFE package keeps its own workspace build script. It runs
   after steps 1-4, so the copy, its rename and the install are complete before
   it starts: a copy that lands during this build is a duplicate workspace and
   the build exits 1 with `EDUPLICATEWORKSPACE`.
9. **Regenerate manifests** - run `npm run generate:mfe-manifests` so the host's
   `public/generated-mfe-manifests.json` picks up the new package (the same
   command rewrites the bundled menu icons from the installed `@iconify-json`
   sets); this step is mandatory before the new MFE is discoverable at runtime.
   It is also the command that picks up a package rebuilt by hand (`npm run
   build` in that package) while `dev:all` runs: the manifest gains the new
   hashed asset paths and the next page load finds them, with no restart of
   `dev:all`.
10. **Verify** - while iterating on the MFE, scope checks to its workspace:
   `npm run type-check --workspace=<package-name>` and
   `npm run test:unit --workspace=<package-name>` (a full `type-check` or
   `test:unit` sweep re-checks the shell and every other MFE on each fix —
   repeated minutes that add no evidence about this package). When the MFE is
   complete, run the full gate exactly once: `npm run type-check`,
   `npm run test:unit`, `npm run arch:deps` (dependency-cruiser boundaries,
   shell-owned script), then `npm run dev:all` and confirm the new screen
   mounts with zero console errors. Automated checks passing is not the end
   of verification: complete a final visual review of the screen at its
   target widths and themes before calling the MFE complete — when a
   design-contract bundle is installed, its `frontx-design` skill's
   `references/verify.md` flow is that
   review; without one, look at the rendered screen yourself and check
   layout alignment, overflow, and each visual state.

## Boundaries

- Do not add Redux/host-store imports inside the MFE; MFEs stay isolated and consume
  only bridge-provided shared properties and mock/local state.
- Do not hand-edit `public/generated-mfe-manifests.json`; it is a generated artifact —
  always regenerate via `npm run generate:mfe-manifests`.
- This skill does not cover ecosystem-level MFE runtime concepts (registration,
  cardinality, mount strategies) — those are base-kit (`@gears-frontx/mfes`) fluency,
  already provided by the framework's base AI capabilities.
