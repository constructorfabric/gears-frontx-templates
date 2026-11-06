---
name: frontx-design
version: 0.2.0
description: Use for any visual task in a FrontX app - build, restyle, review or verify a screen or page, author or fix a theme, read or update DESIGN.md. Kit-first rules, the gate registry, references and templates for application, marketing and documentation surfaces.
---

# FrontX design

The one skill for everything visual in a FrontX app. This file is the map; the detail sits in the files it names. Paths are relative to `<project>/.frontx/ai/@gears-frontx/template-design-guardrails/skills/frontx-design/`; a copy found elsewhere has no siblings, so read the installed one.

## Binding essentials

- Kit first: components and tokens from `@gears-frontx/ui-kit` (read its installed `llms.txt`).
- The visual reference is the kit only: its installed components, `llms.txt` and component docs. Match them; import no look from anywhere else.
- Style outside kit components with CSS Modules on kit tokens. No Tailwind, no other utility-class framework, no home-made utility classes; the kit's own `utilities.css` classes are allowed.
- A pattern the kit lacks is a recorded kit gap, never a local look-alike.
- Values (colour, type, radius, spacing, elevation, motion) come only from kit tokens.
- A gate whose `waiver` is `never` binds whatever the sources say: an approved requirement that conflicts with one goes into the handoff and to the owner, it does not waive the gate. `sourcePrecedence` in `rules/design-contract.json` orders sources only for what those gates leave open; no other file orders them.
- Claim only what was observed: a width, theme or state not seen rendered is unverified.
- A missing file of this skill stops the task as `contract unavailable`; a missing app, kit doc or browser as `environment unavailable`.

## Tasks

| Task | Load, in order |
|---|---|
| Author or fix a theme | `references/theme.md`, `references/color.md`, then `references/verify.md` |
| Build or revise a screen | `references/generate.md`, `references/app-screens.md`, `references/state-completeness.md`, then the topic references below that match the screen |
| Place a screen in FrontX | `references/frontx-context.md` |
| Review a screen | `references/review.md`, run in a fresh context: a separate agent that sees screenshots and source, not the builder's reasoning; its report opens with a one-word verdict: `blocked`, `revise`, `unverified` or `pass` |
| Verify in the browser | `references/verify.md` |
| Read or update DESIGN.md | `references/design-md.md` |
| Close any task | `templates/handoff.md`, plus `templates/state-inventory.md` for a screen |

A request that spans rows runs them in this order: place, theme, build, verify, review, DESIGN.md, close. The theme, build and review rows read `DESIGN.md` at the project root first. Surface: application screens by default. On marketing and documentation pages every gate binds except APP-001 and APP-002, which only advise; documentation pages also load `references/typography.md`.

## Map

`references/`, task files:
- `references/generate.md` - plan, implement, self-review and fix loop for a screen; delegation; the build report.
- `references/review.md` - the fresh-context review: verdict, review order, rubric scoring, finding shape.
- `references/verify.md` - the runtime checker in a browser: runner, manual protocol, checker rule to gate map, a build gate on request, report.
- `references/theme.md` - a shell theme on the kit token contract: value format, register, verify.
- `references/frontx-context.md` - where a screen lives: MFE package, menu entry, sub-routes, shell chrome, shadow-root styles.
- `references/app-screens.md` - APP-001 to APP-005 on a FrontX screen and how to check each.
- `references/state-completeness.md` - loading, empty, error and full per data region; the other states; how to force and check them.
- `references/design-md.md` - the DESIGN.md format, when to read it, how to review a change to it.

`references/`, topic files (foundations, layout and accessibility for every screen; the others when the screen has that content; all of them when unsure):
- `references/foundations.md` - token policy, hierarchy, density, radius, borders and elevation, definition of done.
- `references/layout.md` - spacing use, regions, alignment, wide/medium/narrow transformations, overflow.
- `references/accessibility.md` - WCAG 2.2 AA baseline, names, keyboard, contrast, reflow, forms.
- `references/typography.md` - type roles and floors, copy and labels, numbers, truncation, icons.
- `references/color.md` - colour jobs, status and selection, light and dark themes, chart palettes.
- `references/motion.md` - motion jobs, kit motion tokens, reduced motion, interaction feedback.
- `references/components.md` - anatomy of buttons, fields, overlays, tabs, tables and cards.
- `references/patterns.md` - fallback compositions: sign-in, form, table, dashboard, inspector, log, timeline.
- `references/data.md` - metrics, KPI anatomy, charts, distributions, tables, dashboard grid, data honesty.

`rules/` (machine-readable; references cite gate ids, never restate rules):
- `rules/quality-gates.json` - the one rule registry: gate id, severity `level`, `waiver` (never, with-reason, finish), evidence, fix, finding shape.
- `rules/design-contract.json` - UI base, `sourcePrecedence`, required qualities, fallback policy, prohibitions.
- `rules/layout-contract.json` - spacing scale, fallback grid, regions, alignment and responsive order.
- `rules/component-state-matrix.json` - states per component family (a component owes those it can reach), what the kit guarantees, state combinations.
- `rules/review-rubric.json` - review categories, points, blocker gate ids, deductions, score bands.
- `rules/source-registry.json` - the public standards the rules draw on; research only, never a visual theme.

`templates/` (blanks to fill):
- `templates/state-inventory.md` - one row per data region with each state's outcome, widths and themes seen.
- `templates/handoff.md` - built, checked (gate id and outcome), not checked, known gaps.

`scripts/` (run from the project root):
- `scripts/check-design-md.mjs` - checks the `DESIGN.md` front matter token names against the installed kit theme; exit 0 clean, 1 findings, 2 input error.

Outside this directory:
- `DESIGN.md` at the project root - kit token names in its front matter (the kit version is its `version`) and the human summary.
- `src-app/verify_packages/design-verify/` - the runtime design-defect checker the shell loads in dev, and its headless runner `npm run verify:ui --workspace=@gears-frontx/design-verify`.

## Every task ends with

Each gate id that applies with its outcome (pass, open, waived with the quoted reason, or unverified), the filled `templates/handoff.md`, and for a screen the filled `templates/state-inventory.md`.
