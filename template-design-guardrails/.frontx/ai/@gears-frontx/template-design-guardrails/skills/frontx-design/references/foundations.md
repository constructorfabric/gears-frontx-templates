# Foundations

Requirement words (`MUST`, `MUST NOT`, `SHOULD`, `MAY`) carry the meaning
`normativeLanguage` in `rules/design-contract.json` gives them.

## System ownership

- Generated UI **MUST** reuse the installed shell, navigation, components,
  icon family, typography and tokens (SYS-001, SYS-003).
- Local code **MUST NOT** override kit internals or rebuild a kit primitive
  from styled `div` elements. A missing primitive is a kit gap (SYS-005); a
  native semantic element plus local composition beats a fake component.
- Styling outside kit components follows SYS-004; no arbitrary values and no
  parallel colour, radius or type scale.

## Tokens

- The installed kit tokens are the only token source; this skill ships no
  fallback set. Every visual value **MUST** be a kit token or derived from
  one (for example with `color-mix`) (SYS-002). A missing role is a gap to
  raise with the kit owner, not a licence to invent a value. Layout
  constraints come from `rules/layout-contract.json`.
- Screen code references tokens such as `var(--foreground)` from a CSS
  Module, never literals or palette steps. Palette values **MAY** exist
  inside a theme; application code **MUST NOT** depend on them.
- Three layers: foundation (raw colour, dimension, font, radius, shadow,
  motion), semantic (text, surface, border, action, focus, status, layout),
  component (only for a stable role the semantic layer cannot express). Do
  not add component tokens to keep accidental CSS values.
- A theme change **MUST NOT** require changing component markup.

## Radius, borders and elevation

- Radii are the kit's steps; the largest is for large containers. Nested
  radii are concentric: a child's radius never exceeds its parent's and
  accounts for the parent's padding. Full radius only for tags, status
  chips, avatars and compact segmented controls; not every control is a pill.
- Borders group; elevation shows overlap or hierarchy; not both at maximum
  contrast. One surface owns the boundary between adjacent regions.
- Shadows come from the kit's elevation tokens; ordinary in-flow cards carry
  none as decoration (APP-003).
- Dark themes use their own surface, border and shadow tokens; never invert
  light colours mechanically.

## Hierarchy

- Every page **MUST** show scope, primary job and current state before
  secondary detail.
- Each region **MUST** have at most one dominant action.
- A consequential conclusion **MUST** expose its provenance, evidence or a
  route to it.
- Status, selection and severity **MUST NOT** rely on colour alone (COL-002).
- Remove helper text that repeats the title, the visible structure, the
  selected state or a control label (TYP-002).
- Charts, cards, scores and illustrations **MUST NOT** be added to fill
  space.

## Density

One explicit density per surface: `comfortable` for forms, onboarding,
confirmation and rare settings; `compact` for tables, workbenches, trees and
monitoring. Density changes through kit variants or tokens, never local
one-off sizes. Acceptance is in `references/layout.md`.

## Definition of done

A screen is ready for review when it has real kit components, token-backed
styling, declared wide, medium and narrow behavior, its applicable states,
keyboard and focus behavior, meaningful content rather than filler, and a
self-review against the gate ids.

## Reject

- `#7c3aed`, `18px`, `13px`, `border-radius: 11px` scattered through feature
  code;
- semantic statuses mapped straight to brand colours;
- a second shadow or radius system brought by one page;
- inline styles that cannot follow a theme or density change.
