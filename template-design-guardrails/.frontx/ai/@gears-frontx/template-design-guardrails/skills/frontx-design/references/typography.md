# Typography, content and icons

## Type roles

Use the kit's type ramp through roles, never arbitrary sizes: display (rare
product or empty-state emphasis), page title, section title, component
title, body, label, supporting metadata, code and machine data. The kit's
`--text-*-size` tokens (body, label, meta, mono, the heading and display
steps) are the only text sizes. Floors, stated as roles so they cannot drift
from the tokens:

- body copy: the body role, never label or smaller;
- controls, actions, navigation items and form labels: the label role or
  larger;
- supporting metadata: the meta role, never for primary actions or essential
  explanations;
- code and machine data: the mono role; nothing visible is smaller;
- line height at least 1.4 for body and 1.2 for headings; prose about 45 to
  75 characters per line.

Roles do not step down at narrow widths: a narrow viewport is met with
layout (stacking, wrapping, collapsing auxiliary regions), never smaller
text (TYP-001). The checker enforces the last two floors at every swept
width (`tiny-text`, `small-control-text` in `references/verify.md`).
Hierarchy comes from a few roles, not many unrelated sizes and weights.

## Information order

Write entity or result, then state or consequence, then evidence or scope,
then next action. Do not open with implementation detail when the user needs
a decision.

## Headings, labels and copy

- One page title. Section headings name content, not layout: `Source
  health`, not `Widget 3`.
- Control labels name the value: `Status`, not `Choose an option`. Button
  labels name the effect: `Reconnect source`, `Save policy` (TYP-003).
- Sentence case unless the product says otherwise. No eyebrow, title and
  subtitle stack; an eyebrow only when it adds scope found nowhere else.
- Supporting text explains consequence, provenance or recovery, and sits
  near the action it explains; remove text that restates a heading, a count,
  a selected tab or obvious behavior (TYP-002). Raw metrics and diagnostics
  go behind progressive disclosure. No marketing adjectives in operational
  UI.
- Errors and confirmations name the object, the consequence and the next
  safe action, and keep trustworthy context and entered data. Better: `The
  product repository could not be refreshed. The previous snapshot is still
  available. Reconnect the source.` Worse: `Something went wrong. Try
  again.`

## Numbers, dates and machine data

- Tabular numerals in comparable columns and KPI sets; units and comparison
  basis always visible.
- Locale-aware dates and numbers; relative time shows the exact timestamp on
  hover and focus when precision matters.
- IDs, commits, paths and code use the mono role; ordinary labels do not.
- A number never breaks from its unit across lines.

## Truncation

- Never truncate the only primary action or state; prefer wrapping a title
  to shrinking it.
- Paths and hashes may truncate in the middle when both ends matter.
- A truncated value **MUST** have a keyboard-reachable way to reveal or copy
  the full value.

## Icons

- One installed icon family (lucide); sizes are the kit's `--icon-size-*`
  tokens: `sm` for compact controls, `md` for ordinary controls, `lg` for
  navigation and standalone actions. Stroke and fill stay consistent within
  a region (SYS-003).
- Text characters, emoji and improvised SVGs never replace standard icons
  (no `V` for a chevron).
- Icons reinforce text; an icon-only control needs a strong convention, an
  accessible name and, when its meaning is not universal, a tooltip
  (`references/accessibility.md`).
- Status lists use a small dot plus a label, not a unique icon per row.
- Sort indicators are the ones the kit's sortable table header draws, on
  every sortable column, with `aria-sort` on the sorted header; never a
  second sort glyph, never the sort glyph for disclosure.
- External-link icons are small and sit beside their link. The same action
  has the same icon and label on every screen.

## Reject

`Learn more`, `Click here`, `Open`, `Next` when the result is known; three
lines of helper copy under every title; status labels that wrap in narrow
columns; unexplained acronyms in primary UI; decorative icons in tables.
