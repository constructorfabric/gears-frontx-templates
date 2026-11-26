# Workflow: Add multiple MFE packages in parallel

Use with the `add-mfe-package` skill when a task needs two or more new MFE
packages. That skill stays the authority on every per-package step; this
workflow adds the phase structure that lets the per-package work run
concurrently. It exists because MFE packages are disjoint directories: once
scaffolding has touched the shared files, one agent per package can fill its
own directory without ever contending with the others, and total wall-clock
approaches the slowest single package instead of the sum.

The structural rule the whole workflow enforces: **every write to a shared
file happens in a serial phase; the parallel phase writes only inside each
agent's own package directory.** Shared files are the root `package.json` and
lockfile, `public/generated-mfe-manifests.json`, and anything under
`src-app/app/` — nothing else on this list should ever need touching for a
new MFE.

## Phase 1 — Scaffold serially (orchestrator)

1. **Build the shell's packages before any copy** - run `npm run
   build:packages` once at the project root (the applied shell). The lead runs
   it here, and it must finish before any subagent starts its copy: a copy that
   lands while this build runs is a second workspace named
   `@gears-frontx/blank-mfe`, and the build exits 1 with
   `npm error code EDUPLICATEWORKSPACE`. In this workflow the lead makes every
   copy in step 2, before dispatching, so no subagent can start one. The build
   reads only the shell's own packages, so running it first costs nothing. The
   per-package `type-check`, `test:unit` and `build` in Phase 2 resolve
   `@gears-frontx/react` through its built output (`dist/`), which a fresh
   seed does not carry, so a package check before this build stops on
   `TS2307: Cannot find module '@gears-frontx/react'`. The lead runs it once;
   subagents do not run it themselves. `npm run build:mfes` and
   `npm run dev:all` build the shell packages themselves, so this explicit
   step only matters for the package checks run before them - the Phase 2
   scoped checks.
2. **Copy and rename every new MFE, serially** - for each new MFE, run the
   skill's steps 1-3 and step 5: copy `_blank-mfe`, rename the copied package
   in the same step, strip `templateExample`, assign the port, rename the
   federation identity, and assign the GTS IDs. Make each copy and its rename
   one move: no npm command at the project root runs between the copy and its
   rename, or the whole tree fails with `EDUPLICATEWORKSPACE`. Keep the copies
   with the lead for the same reason: a copy that lands beside another agent's
   scoped npm command is the same duplicate workspace, seen from that command.
   Assign all ports from one central list, chosen the way the skill's port step
   says (the project's own range first, `3010`, `3020`, ... only as the
   default), in this phase. Two parallel agents choosing their own ports
   collide; `dev:all` stops on a port two packages declare, but only after the
   parallel work is done.
3. **Declare each package's full dependency set, then link every workspace with
   one `npm install`** - the scaffold already carries `@gears-frontx/ui-kit`
   and the framework packages; add anything the screen's plan calls for, then
   run `npm install` once at the project root (the skill's step 4). The lead
   runs it, once, after every copy and rename has landed: the install links
   each new workspace under `node_modules/@gears-frontx/` and records it in
   `package-lock.json`, and without it `npm ci` exits 1 with
   `Missing: <new name>@<version> from lock file`. Never let two agents
   install at once: npm writes one `node_modules` tree and one lockfile for the
   whole project, and two concurrent installs can leave a half-linked tree with
   a lockfile that matches neither. The lockfile is a shared file: after this
   step, no agent installs anything.
4. **Confirm each scaffold** with the skill's flag-strip and rename checks
   before dispatching; a package that kept `templateExample` fails silently and
   the parallel phase would build a screen nothing will ever load.

## Phase 2 — Fill in parallel (one agent per MFE)

Dispatch one implementation agent per package using your environment's
subagent mechanism (the Task/Agent tool in Claude Code and compatible
harnesses), issuing every dispatch in a single message so they actually run
concurrently. Dispatch in the FOREGROUND — blocking calls whose results
return into your turn. Never dispatch as background tasks and end your turn
to wait for notifications: in headless runs the session exits with your turn
and orphans every background agent mid-write. This phase is a dispatch, not a description: when a subagent
mechanism exists, performing the per-package fill inline in your own context
is not following this workflow. Only if your environment truly has no way to
run agents does Phase 2 fall back to filling the packages one at a time under
the same per-package contract and boundaries — and then your final report
must say the parallel phase ran serially and why, because a silent fallback
reads as parallel execution that never happened.

Each dispatch prompt must carry, explicitly:

- the single package directory the agent owns — the only place it may write;
- skill steps 6-7 (lifecycle, screen from the installed ui-kit and the
  scaffold residue) as its contract, plus the skill's Boundaries section;
- when a design-contract bundle is installed (any AI bundle shipping a
  `frontx-design` skill; check for
  `.frontx/ai/*/*/skills/frontx-design/`),
  the full contract handover that skill's `references/generate.md` requires:
  the concrete paths of its `SKILL.md`, `references/generate.md` and the
  references it loads, and the
  instruction to read them first — the contract does not transfer by
  implication, and per-agent dispatch is exactly the delegation case that
  rule exists for;
- the iteration-scoped check commands: `npm run type-check
  --workspace=<package-name>`, `npm run test:unit --workspace=<package-name>`,
  `npm run build --workspace=<package-name>`. Scoped checks are what make the
  parallelism safe — a full sweep run mid-fill would judge another agent's
  half-finished package and fail on defects that are not this agent's to fix.

Hard boundaries for every parallel agent, stated in the dispatch prompt:

- no writes outside its own package directory;
- no `npm run build:packages` - the lead builds the shell's packages once in
  Phase 1, and every check resolves them from that build;
- no `npm install`, no lockfile or root-manifest edits — a mid-fill
  dependency need is a blocking return to the orchestrator, which applies it
  serially and re-dispatches that one agent;
- no `generate:mfe-manifests`, no full type-check/test/build sweeps, no dev
  server — rendered verification belongs to Phase 3.

Each agent returns its changed files, the states it implemented, and its
unresolved or unverified gaps (the report shape of `references/generate.md`
in the `frontx-design` skill when the guardrails bundle governs).

## Phase 3 — Integrate serially (orchestrator)

1. `npm run build:mfes`, then `npm run generate:mfe-manifests` — once, after
   every agent has returned.
2. The full gate, once: `npm run type-check`, `npm run test:unit`,
   `npm run arch:deps`.
3. `npm run dev:all`; confirm every new screen mounts with zero console
   errors. When the guardrails bundle is installed, run its `frontx-design`
   skill's `references/verify.md` flow once across all new screens: one
   closing pass, not one per package. Reach each screen by its menu label
   (`--menu "A,B"`) or its composed address (`--routes "/?screen=orders"`),
   never by the bare route value (`/orders`), which leaves the content area
   empty and reads as clean.
4. Review the new screens against each other: parallel agents never saw each
   other's output, so cross-screen consistency (shared terminology, matching
   list/detail conventions, consistent density and action placement) is the
   one defect class this workflow structurally cannot catch earlier and must
   check here.

If any Phase 3 step fails inside one package, hand the failure back to that
package's agent (or a fresh one) with the same Phase 2 contract and re-run
only the affected integration steps — the other packages' results stand.
