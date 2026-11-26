# Workflow: Add an MFE Package (template-mfe)

Ordered execution procedure for the `add-mfe-package` skill in this same bundle. Use
this workflow when actually performing the addition (not just reasoning about it);
each step names the concrete command or file template-mfe ships.

## Preconditions

- An applied `template-shell` is already in the project (root `package.json`,
  `src-app/app/`, build/test/manifest pipeline) — `template-mfe` adds MFE packages
  into that shell and does not scaffold a repository on its own.
- The screenset/screen the new MFE will contribute to is already decided.

## Steps

1. **Choose a name and port**
   - Name: `{screenset}-mfe` (kebab-case), placed at `src-app/mfe_packages/{screenset}-mfe/`.
   - Port: next free `30N0` slot after the reserved `3001` (`demo-mfe`).

2. **Copy the scaffold, rename the copy and strip its example flag**: together,
   so the flag cannot outlive the copy and the copy never exists under the
   scaffold's package name. A copy that keeps the flag registers nothing; a copy
   that keeps the name breaks every npm workspace command at the project root.
   ```bash
   NEW=src-app/mfe_packages/{screenset}-mfe
   cp -r src-app/mfe_packages/_blank-mfe "$NEW"
   node -e 'const f=process.argv[1],fs=require("fs"),m=JSON.parse(fs.readFileSync(f,"utf8"));m.name="@gears-frontx/{screenset}-mfe";fs.writeFileSync(f,JSON.stringify(m,null,2)+"\n")' "$NEW/package.json"
   node -e 'const f=process.argv[1],fs=require("fs"),m=JSON.parse(fs.readFileSync(f,"utf8"));delete m.templateExample;fs.writeFileSync(f,JSON.stringify(m,null,2)+"\n")' "$NEW/mfe.json"
   grep -q '"name": "@gears-frontx/{screenset}-mfe"' "$NEW/package.json" && echo "package renamed" || echo "PACKAGE NAME NOT RENAMED"
   grep -q templateExample "$NEW/mfe.json" && echo "FLAG STILL PRESENT - remove it" || echo "flag stripped"
   ```
   The rename runs directly after the copy: until the name changes, the copy is
   a second workspace named `@gears-frontx/blank-mfe`, and every npm workspace
   command at the project root exits 1 with `npm error code EDUPLICATEWORKSPACE`
   and `package '@gears-frontx/blank-mfe' has conflicts in the following paths`,
   so no npm command at the project root runs between the copy and the rename.
   `"templateExample": true` is what keeps the scaffold out of the running
   application: a package carrying it is left out by manifest generation, by
   `dev:all`, and by `type-check:mfe`, and its screen never reaches the menu.

3. **Edit package metadata**
   - `src-app/mfe_packages/{screenset}-mfe/package.json`:
     - `dev`: `vite --port {port}`
     - `preview`: `vite preview --port {port}`
   - `src-app/mfe_packages/{screenset}-mfe/vite.config.ts`:
     - No federation `name` to set — `vitePluginMfeGts` derives it from
       `package.json`'s `name` (`@gears-frontx/{screenset}-mfe` → `{screenset}Mfe`).
       Only the `exposes` map passed to `vitePluginMfeGts({ exposes })` is
       the MFE's own.

4. **Link the workspace**
   ```bash
   npm install
   ```
   Run once at the project root, after the copy and its rename. Until it runs
   the package is a declared workspace but not a linked one: `npm ls` exits 1
   with an `UNMET DEPENDENCY <package-name>@file:...` line, a `missing:` line
   naming the package, and no link
   under `node_modules/@gears-frontx/`; `npm ci` exits 1 with
   `Missing: <package-name>@<version> from lock file`. The scoped checks pass
   on the unlinked workspace, so they are no evidence of the link. Commit the
   `package-lock.json` change.

5. **Rewrite `mfe.json`**
   - Replace the manifest ID, every entry ID, and every extension ID using
     template-mfe's ID taxonomy (`gts-id-conventions` guideline; worked examples in
     `gts-id-patterns-reference`).
   - Label dictionaries under `public/labels/`, if the MFE translates its menu
     labels, use the same extension IDs.
   - Update `remoteEntry` to `http://localhost:{port}/assets/remoteEntry.js`.

6. **Implement the screen**
   - Rename/replace `src/screens/home/HomeScreen.tsx` with the real screen.
   - Build the UI from `@gears-frontx/ui-kit` components and semantic tokens —
     the kit is the only component source: no other component library, and no
     shadcn components or APIs (the kit follows shadcn conventions, so shadcn
     patterns may guide which kit component maps to a UI pattern, nothing more).
     Confirm the package declares `@gears-frontx/ui-kit` in its dependencies (add
     it if the scaffold copy predates the kit migration and lacks it) and read the
     installed kit's `llms.txt` for the component inventory before writing markup.
     Plan before markup: map every visible UI pattern to a concrete kit
     component or approved composition from that inventory, and record the
     screen's grid columns, alignment anchors, and responsive breakpoints; a
     pattern with no kit mapping is reported as a gap, never guessed at.
     Hand-rolling a look-alike of an existing kit component is a defect.
   - If a design-contract bundle is installed (any AI bundle that ships a
     `frontx-design` skill; check for
     `.frontx/ai/*/*/skills/frontx-design/`), that skill's
     `references/generate.md` and its design contract govern the screen's
     generation: follow them. If none is
     installed, state in the plan that the screen is generated without a
     design contract.
   - Update `src/screens/home/i18n/*.json` (or rename the directory) with real copy
     for every locale the template ships.
   - Keep `src/lifecycle.tsx` extending `ThemeAwareReactLifecycle`; keep `init.ts`'s
     plugin chain (`effects()`, `queryCacheShared()`, `mock()`) unless the new MFE has
     a documented reason to diverge.
   - Give each API service one service-level test beside its mock-map test,
     modelled on `_blank-mfe/src/api/_BlankApiService.test.ts`
     (`attachRegisteredRestMocks(service)`, then each endpoint's `fetch()`,
     asserting the mocked payload). A map test only calls the factory, so a key
     that misses the URL the service really sends passes it while the screen
     renders empty.

7. **Build the shell's packages before the first package check**
   Run this once at the project root (the applied shell), before the first
   `type-check`, `test:unit` or `build` of the new MFE:
   ```bash
   npm run build:packages
   ```
   The MFE's `type-check`, `test:unit` and `build` resolve
   `@gears-frontx/react` through its built output (`dist/`), which a fresh
   seed does not carry until these packages are built. Without this step they stop on
   `TS2307: Cannot find module '@gears-frontx/react'` before they read any of the
   screen's code. The command builds the shell's own packages only; the MFE
   package keeps its own `build` script. `npm run build:mfes` and
   `npm run dev:all` build the shell's packages themselves, so this explicit
   step only matters for the package checks run before them. The copy and its
   rename (step 2) and the install (step 4) are complete before it runs, so it
   cannot overlap a copy.

8. **Regenerate manifests**
   ```bash
   npm run build:mfes
   npm run generate:mfe-manifests
   ```
   While iterating after this first full pass, rebuild only the changed MFE
   (`npm run build --workspace=<package-name>`) before regenerating manifests;
   `build:mfes` rebuilds every MFE and belongs in the final gate.

9. **Validate**
   While iterating, scope to the MFE's workspace:
   ```bash
   npm run type-check --workspace=<package-name>
   npm run test:unit --workspace=<package-name>
   ```
   Once the MFE is complete, run the full gate exactly once:
   ```bash
   npm run type-check
   npm run test:unit
   npm run arch:deps
   ```

10. **Run and confirm**
   ```bash
   npm run dev:all
   ```
   - Open the app, confirm the new screen mounts, and confirm zero console errors.
   - When the installed design-contract bundle ships a `frontx-design`
     skill (check for `.frontx/ai/*/*/skills/frontx-design/`), run its
     `references/verify.md` flow on the new screen, by its menu label
     (`--menu "<label>"`) or its composed address
     (`--routes "/?screen=<route>"`), never by the bare route value, which
     leaves the content area empty and reads as clean, and review the screenshots it
     produces: the same closing pass `add-mfe-packages-parallel.md` requires. When no such bundle is installed, complete a manual visual
     review instead — look at the rendered screen at its target widths and
     themes and check layout alignment, overflow, and each visual state —
     and state in the hand-off that the screen was reviewed by eye because
     no design contract exists.

## Rollback

If the addition is abandoned before being committed: delete
`src-app/mfe_packages/{screenset}-mfe/`, re-run `npm run generate:mfe-manifests` to
drop it from `public/generated-mfe-manifests.json`, revert any workspace/script
edits made in step 3, and run `npm install` again so `package-lock.json` drops
the entry the step 4 install recorded.
