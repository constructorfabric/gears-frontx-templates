# Colour, themes and chart palettes

## Colour has a job

Every non-neutral colour **MUST** do one of these: action or selection;
semantic status; informational category; data-series difference; brand
identity in a bounded area. A colour with no job goes. On application
screens colour sits on data, not chrome (APP-001).

## Semantic hierarchy

- Primary text carries essential meaning; secondary text carries supporting
  metadata. Muted text **MUST NOT** hold the only explanation of an error,
  action or state.
- Adjacent surfaces in one hierarchy differ by at most one step of the kit's
  surface tokens (for example `background`, then `card`, then `popover`); no
  patchwork of tinted cards.
- Borders are quieter than text but meet non-text contrast where they define
  a control or a state.
- Accent is scarce: one selected item plus one primary action, not five
  competing accent regions.

## Status

- success: completed, passed, synced or healthy; not merely enabled;
- warning: degraded, waiting or needs review;
- danger: failed, blocked, destructive or unsafe;
- info: detected, neutral progress or an outside observation;
- neutral: open, unchanged, not started, ordinary metadata, borders and the
  disabled look when no risk is implied.

An open state **MUST NOT** look like a warning unless being open is itself
risky. Status colour comes with concise text or a familiar icon (COL-002).
The brand or accent colour is never reused as an error or warning colour.

## Selection versus status

Selection uses the accent surface, border and text tokens; accent means
primary action, active selection and authored emphasis. Status uses the
semantic tokens. A selected failed row has a quiet selection surface and a
small danger cue; never a full red or accent row. Hover, selected, focused
and status stay distinguishable in combination (COL-003, INT-003).

## Light and dark

- A theme keeps semantic roles, not literal RGB relationships; check text,
  non-text and focus contrast in each theme (COL-001).
- A dark theme sets `color-scheme: dark` so browser controls match.
- Saturated colours usually need less area and adjusted luminance in dark.
- Images, charts, shadows, disabled states and code blocks are reviewed in
  both themes when both exist.

## Charts

- Semantic colours only for semantic series; other categories use a
  colour-blind-safe categorical palette; one palette and order per metric
  family across screens (COL-004).
- A chart never relies on colour alone: labels, direct annotation, shape,
  pattern or a usable legend (DAT-003). Never red against green as the only
  difference between two series.
- Lines and points stay visible against plot and grid. Ordered data uses a
  sequential or diverging scale with a named midpoint, never a rainbow.

## Reject

Gradients without a product role; saturated chips for every ordinary state;
decorative coloured icons competing with data; a second link colour beside
the product's link token; grey text below the contrast floor; opaque chart
fills that dominate; colours picked per widget.
