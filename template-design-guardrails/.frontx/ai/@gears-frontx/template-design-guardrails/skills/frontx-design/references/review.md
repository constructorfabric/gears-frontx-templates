# Review a screen

Review the implementation and its rendered result with evidence, not taste
language. The review is advisory: it never marks a build failed, changes CI or
acts as a release gate. Asked to block a merge, decline, say why, and still
return the findings for a person to act on. The review changes no files
unless the request asks for fixes.

## Fresh context

The review runs in a separate agent that has not seen the builder's
reasoning. Its brief names: the screen and its route; the source files; the
screenshots of the closing browser pass (`references/verify.md`); the paths
of `SKILL.md`, this file, the topic references for the screen and the files
in `rules/`; and the instruction to read them before judging. A review built
on the builder's own account of the screen, or without those files, is not a
review.

## Basis

1. Read the installed kit docs and `rules/quality-gates.json`,
   `rules/review-rubric.json`, `rules/component-state-matrix.json` and
   `rules/design-contract.json`, then the topic references the screen needs
   (all of them when the surface is unclear or spans several screen types).
   Name what was loaded and skipped in the report.
2. Name the screen's job and expected composition. When neither the request
   nor the code settles them, ask, or mark the assumption unconfirmed in the
   report. When the target or scope is ambiguous in a way that changes what
   is evaluated, ask; otherwise state the assumption.
3. Check real component reuse in the source; looking alike is not reuse.
4. Inspect every available width and state; an absent one is unverified.

For spacing, alignment and size, measure the render (element rects, computed
styles) whenever the app runs: the source shows each spacing intent apart,
the render shows their sum. Such a finding quotes the reading, for example
`getBoundingClientRect: toolbar left=20, title left=24`; without a running
app tag the number `inferred-from-source`.

## Order

1. **Blockers**: the blocker gates of `rules/quality-gates.json`, first.
2. **System**: components, tokens, type, icons, radius, shadow, semantic
   colour (rubric `system-components-tokens`, `color-typography-polish`).
3. **Layout and behavior**: grid, density, responsive transformations,
   interaction states, recovery, motion, accessibility (rubric
   `grid-density-responsive`, `interaction-accessibility`,
   `states-feedback-recovery`).
4. **Hierarchy and data**: primary action, grouping, content order, chart and
   table meaning, evidence, redundant copy (rubric `task-hierarchy-content`,
   `data-display-evidence`).
5. **Polish**: optical alignment, icon size, border ownership, truncation,
   microcopy.

Score each rubric category from observed evidence only; a total never hides a
blocker.

## Report

It opens with a one-word verdict:

- `pass`: no open blocker or major finding, and the primary flow was observed;
- `revise`: open major or minor findings, no open blocker;
- `blocked`: at least one open blocker.

Then one or two sentences on why, and:

- blockers first, then corrections in implementation order, each in the
  finding shape of `rules/quality-gates.json` (`ruleId`, severity, location,
  evidence, impact, correction, verification) with its gate's `waiver`: a
  `never` finding stays open until fixed; a `with-reason` finding is waived
  only with a recorded reason, quoted; `finish` findings come last;
- the score per rubric category;
- the widths and states exercised that came back clean;
- the items still unverified, for `references/verify.md` to observe.

Precise: `LAY-003 · getBoundingClientRect: toolbar left=20, title left=24 · the
toolbar uses a 20 px inset while title and table use 24 px; use the page
inset token`. Not: `spacing feels off`. Precise: `COL-003 · open state uses
the warning colour although nothing is at risk; use neutral state text`.
Not: `colours are ugly`.

When the request includes fixing, a finding is resolved only after the fix
is seen rendered in the same round (re-measured, or re-run through
`references/verify.md`); otherwise it is applied-but-unverified. After two
correction rounds without resolution, stop and report the finding as open
with the evidence of both rounds.
