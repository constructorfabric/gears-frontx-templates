---
name: frontx-design
version: 0.1.0
description: Use first for any visual task in a FrontX app (build, restyle, review or verify a screen or page, author a theme, write or update DESIGN.md). Routes to the bundle's verb skills and references and sets precedence, kit first, CSS Modules on kit tokens, no Tailwind.
---

# FrontX design

The entry point for everything visual in a FrontX app. This file routes; it
does not restate rules. Rules live in `reference-artifacts/quality-gates.json`
and are cited here by gate id; each gate carries its severity (`level`) and
whether it can be waived (`waiver`: `never`, `with-reason`, `finish`).

In an app this template is installed into, the bundle root is
`<project>/.frontx/ai/@gears-frontx/template-design-guardrails/`. Paths below
are relative to it; `references/` and `templates/` are relative to this
skill's own directory, `skills/frontx-design/`. A copy of this file found
elsewhere (for example `.claude/skills/`) has no siblings: read the installed
bundle.

## Precedence

When sources disagree, the higher one wins:

1. The owner's or the product's explicit decision.
2. The bundle rules: `quality-gates.json`, `design-contract.json`, the
   guidelines under `guidelines/`.
3. The kit: `@gears-frontx/ui-kit`, its components and its tokens. The kit
   binds identity: colour, type, radius, spacing, elevation and motion come
   from it and nowhere else.
4. Outside design skills, galleries and references. They only advise; they
   never bring a palette, a font, a component set or a styling stack.

An explicit decision outranks the bundle on what to build. It does not waive
a gate whose `waiver` is `never`: record the conflict in the handoff and
raise it with the owner instead of shipping around it.

## Kit first

- Compose from ui-kit components and tokens (SYS-001, SYS-002). Read the
  installed `@gears-frontx/ui-kit/llms.txt` and the docs of the components in
  use before writing markup.
- Style anything outside kit components with CSS Modules on kit tokens
  (SYS-004). No Tailwind anywhere: not in screens, not in examples, not as a
  quick fix; no home-made utility classes either. Global classes the kit
  itself ships and documents (`utilities.css`) are kit surface and allowed.
- A pattern the kit lacks is a recorded kit gap, never a local look-alike of
  a kit component (SYS-005). Compose it from kit parts and native elements
  and list the gap in the handoff.
- Visual reference: the kit itself and the FrontX showcase site
  (https://frontx.constructor.rocks/), whose UI Kit screen shows every kit
  component and token page live. Match them; do not import a look from
  anywhere else.

## Route by task

| Task | Go to |
|---|---|
| Author or change a theme, fix wrong colours after a theme change | `skills/create-theme/SKILL.md` |
| Build or substantially revise a screen | `skills/generate-interface/SKILL.md` with `workflows/generate-interface.md`, plus `references/app-screens.md` and `references/state-completeness.md` |
| Place a screen: MFE package, menu entry, route, sub-routes, styles in the shadow root | `references/frontx-context.md` |
| Review a built screen against the rules | `skills/review-interface/SKILL.md` with `workflows/review-interface.md` |
| Observe the rendered result (contrast, widths, live states) | `skills/verify-interface/SKILL.md` |
| Read, write or update DESIGN.md | `references/design-md.md` |
| Close any of the above | `templates/handoff.md` |

A request that spans several rows runs them in this order: context, theme,
build, verify, review, document, handoff. Load only the rows the request
needs.

## Route by surface

Decide the surface before loading guidelines. When unsure, it is an
application screen.

- **Application screens (default).** Work surfaces inside the shell: lists,
  tables, forms, detail views, dashboards, settings. Apply
  `references/app-screens.md` (APP-001 to APP-005) and
  `references/state-completeness.md` (STA-004 to STA-008), and keep a state
  inventory with `templates/state-inventory.md`.
- **Marketing pages.** Product or landing pages built as FrontX screens.
  Same kit-first rules and every gate except APP-001 and APP-002, which only
  advise here. Use the kit's display and heading type roles for hierarchy;
  motion stays functional (MOT-001).
- **Documentation pages.** Long-form reading surfaces. Same kit-first rules;
  APP-001 and APP-002 only advise. Load
  `guidelines/typography-content-and-iconography.md` for reading order and
  copy, and keep code samples on the kit's mono role and code tokens.

The guideline load for any surface goes through
`reference-artifacts/guideline-index.json` as the verb skills describe.

## Every task ends with

- the gate ids that apply, each with its outcome: pass, open, waived with the
  quoted reason, or unverified;
- a filled `templates/handoff.md`: what was built, what was checked, what was
  not checked, known gaps;
- for a screen, the filled `templates/state-inventory.md`.

Claim only what was observed. A width, theme or state not seen rendered is
unverified, not a pass.
