# Microfrontends — `frontx-template-mfe` territory

> **TARGET AUDIENCE:** Project developers adding or maintaining an MFE package
> **PURPOSE:** What lives under this directory and how to add a new package to it

Everything under `src-app/mfe_packages/` belongs to the `frontx-template-mfe`
template — the shell scans this directory but never names a package inside it
(see the shell's `mfe-package-contract` AI guideline for the exact contract a
package here must satisfy).

## Precondition: requires an applied `template-shell`

This directory is **add-only**. It ships with `frontx-template-mfe`, which has
no root `package.json`, no build/test/lint tooling, and no host application —
those are owned by `frontx-template-shell`. A package here declares exact
published versions of its FrontX dependencies (`@gears-frontx/react`,
`@gears-frontx/framework`, …)
alongside its ordinary third-party ones, and installs them all from the
registry — there are no `file:` paths to dangle.
A package never imports shell code. Like an independent repository, it declares
the shell contract ids it uses itself (the shared-property and domain ids, and
the GTS schemas it registers) in its own `src/shellContract.ts`.
What an applied shell actually supplies is the **runtime host**: the
`src-app/app/` shell that mounts these MFEs. The `vitePluginMfeGts` plugin a
package builds with is not shell-supplied — each package declares
`@gears-frontx/vite-plugin-mfe-gts` as its own dependency and loads it from
there.
Without an applied shell there is no host to mount into,
even though `npm install` alone would succeed.

```bash
frontx seed frontx-template-shell ./my-app
frontx add frontx-template-mfe ./my-app
cd my-app && npm install   # required after every `add` — the workspace glob
                            # picks up the new packages, so the lock must be
                            # regenerated
```

**Upgrade is not supported yet in a multi-template repository.** `frontx
upgrade` reads a single provenance record; once both `frontx-template-shell`
and `frontx-template-mfe` are applied to the same repo, upgrading either one
is not yet safe — treat the repo as pinned to its current versions until this
lands.

## Add your own MFE

Copy the blank scaffold, rename the copy and adjust it. There is no registry
file to edit; `generate:mfe-manifests` / `dev:all` (shell scripts) discover
packages by scanning this directory. The copy, the rename and the strip of the
scaffold's example flag are one move, since a copy that keeps the flag is
invisible to the shell and nothing fails to tell you so:

```bash
NEW=src-app/mfe_packages/my-mfe
cp -r src-app/mfe_packages/_blank-mfe "$NEW"
node -e 'const f=process.argv[1],fs=require("fs"),m=JSON.parse(fs.readFileSync(f,"utf8"));m.name="@gears-frontx/my-mfe";fs.writeFileSync(f,JSON.stringify(m,null,2)+"\n")' "$NEW/package.json"
node -e 'const f=process.argv[1],fs=require("fs"),m=JSON.parse(fs.readFileSync(f,"utf8"));delete m.templateExample;fs.writeFileSync(f,JSON.stringify(m,null,2)+"\n")' "$NEW/mfe.json"
```

The rename runs directly after the copy, with no npm command at the project
root in between. Until the name changes the copy is a second workspace still
called `@gears-frontx/blank-mfe`, and any npm workspace command there exits 1
with `EDUPLICATEWORKSPACE`.

Then link the new workspace with one install at the project root:

```bash
npm install
```

Only that install creates the link under `node_modules/@gears-frontx/` and
records the package in `package-lock.json`; a scoped `type-check`, `test:unit`
or `build` exits 0 on an unlinked workspace, so it proves nothing about the
link. Commit the `package-lock.json` change with the package.

Then, inside `my-mfe/`:

1. **`package.json`**: point the `dev` and `preview` scripts at a port no other
   package here already uses (the copy above already set `name`).
2. **`mfe.json`** — declare your entries and extensions (screen, sidebar, popup,
   or overlay) with GTS IDs following this template's ID conventions guideline.
3. **`vite.config.ts`** — keep the `vitePluginMfeGts` build plugin wired, and add
   your lifecycle modules to its `exposes` map (or `mfe.json`'s `exposes`) so
   the shell can load them at runtime. Module Federation itself is the
   plugin's: the federation name derives from `package.json`'s `name`,
   `remoteEntry.js`, `shared: {}` and the manifest are fixed, and the
   `build.target`/`modulePreload`/`minify`/`cssCodeSplit` settings are
   enforced — wiring `federation()` by hand is a build error. Sharing
   follows the build graph: every bare package the code imports, whichever
   `package.json` section declares it, is shared — emitted as
   content-addressed units the enriched manifest lists. Keep
   `@gears-frontx/routing` pinned in `package.json`, as the scaffold has it.
   An MFE that uses `<ExtensionRouter>` or `navigation()` adds
   `@gears-frontx/routing-tanstack` there too, under `dependencies`. Opt out per package with `share.exclude`
   in `mfe.json` (never by hand-editing an externals list — there is none).

The `add-mfe-package` skill carries the full list, from the port through the
manifests and the final gate.

Existing packages here for reference: `demo-mfe` (`:3001`, a full worked
example — Hello World, Profile, Theme, UIKit, Widgets Host), `_blank-mfe`
(`:3099`, the copy-from scaffold), and `widgets-fixture-a` / `widgets-fixture-b`
(`:3201` / `:3202`, widgets mounting into `demo-mfe`'s widgets domain).

## Reference packages do not run in your application

**This section is the package-level reference for this rule** - it ships next to
the packages it governs, and the human-facing surfaces (both template READMEs and
QUICK_START) point here rather than restating it.

Three agent-facing surfaces carry their own copy, because each is read on its own
with nothing else loaded, so a pointer in one of them would be a dead end:
[the `add-mfe-package` skill](../../.frontx/ai/@gears-frontx/frontx-template-mfe/skills/add-mfe-package/SKILL.md),
[its workflow](../../.frontx/ai/@gears-frontx/frontx-template-mfe/workflows/add-mfe-package-workflow.md),
and the shell's own
`.frontx/ai/@gears-frontx/frontx-template-shell/guidelines/mfe-package-contract.md`
(under `template-shell/` in the template monorepo), which is the snapshot of what
the scanners check. A change to the behaviour has to reach all of them.

Every package listed above declares `"templateExample": true` in its `mfe.json`.
They ship to be read and copied, so the shell's three package scanners leave
them out: `generate:mfe-manifests` keeps them out of the aggregate the host
registers from, `dev:all` neither builds nor serves them, and `type-check:mfe`
skips them too. Your application's menu holds the screens you added and
nothing else.

To run them anyway - to watch a worked example rather than read it - set
`FRONTX_INCLUDE_TEMPLATE_EXAMPLES` to `1` for the command:

```bash
FRONTX_INCLUDE_TEMPLATE_EXAMPLES=1 npm run dev:all
```

That flag is why the copy command above strips it, and a copy that keeps
it still installs and still runs its own tests, because it is the thing new
packages are copied from and has to stay usable. Type-checking is the
exception: `type-check:mfe` skips a flagged package by default, the same as
the other two scanners, so it type-checks only when the run sets
`FRONTX_INCLUDE_TEMPLATE_EXAMPLES=1`. What reports the skip is a single line in
the `generate:mfe-manifests` / `dev:all` / `type-check:mfe` output naming the
packages left out. Inside the running application there is no sign of it at
all - the screen is simply not in the menu.
