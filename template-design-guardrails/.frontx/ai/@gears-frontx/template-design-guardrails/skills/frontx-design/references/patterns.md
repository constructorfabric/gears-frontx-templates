# Screen compositions

Take the nearest existing product composition first. Use these only when
the app has no approved equivalent.

## Sign-in

Order: product identity; task heading; persistent field labels; primary
submit; needed recovery routes; service or security context only when
required.

- One focused card or bounded region; no decorative marketing panel unless
  asked for.
- Meets the sign-in rules in `references/accessibility.md` and submits from
  the keyboard.
- States: initial, invalid field, invalid credentials, service unavailable,
  submitting, recovered.
- Never invent social sign-in, passwordless sign-in, registration,
  testimonials or product claims.

## Form or settings page

- Fields in the order of the user's decisions, not the storage schema;
  related fields under a short section heading.
- One primary save action and a stable unsaved, saving, saved, failed model.
- Destructive settings in a separate low-emphasis region; a review step only
  when the consequence warrants it.
- Disabled fields are not a read-only presentation.

## Table or list workbench

Order: page title and primary action; search and filters; result count when
useful; table or list; pagination; optional persistent inspector.

- Table rules are in `references/components.md`.
- The selected-row look is shared across screens and does not change row
  size.
- The inspector reflects the selected row; different rows open their own
  content.
- Browser Back restores the list context when the host routes.
- At narrow widths the primary entity, its state and the main action come
  before secondary metadata.

## Dashboard

Order by decision: status or goal only when it changes the reading; the
highest-priority action; comparable KPI or health widgets; trends or
distributions; a needs-attention list; the route to evidence or activity.

- Widget widths and anatomy follow the dashboard grid in
  `references/data.md`; every chart names timeframe, unit and basis.
- A metric without evidence or action is not a widget; empty widget space
  means a smaller span or better information, never decoration.
- Editing mode is explicit, and its instructions disappear outside it.

## Master-detail or inspector

- The list stays the navigation context; the inspector shows the selected
  object, with entity, state and close and overflow controls in its header.
- The most consequential action comes before provenance and diagnostics; raw
  analysis and verbose evidence sit behind progressive disclosure.
- Wide, medium and narrow behavior follows the inspector row in
  `references/layout.md`. Closing returns focus to the selected row.

## Repository or artifact browser

- Three regions only when each is needed: project navigation, tree, content
  and details.
- The tree follows the WAI-ARIA Authoring Practices tree pattern with compact
  repeated rows; the selected node has a quiet full-width surface, not a
  detached accent bar.
- Title, path, classification and source revision appear once each; review
  issues and next actions lead, raw metrics stay collapsed.

## Activity or audit log

- A table when actor, source, type, result and time are compared.
- A simple semantic dot and explicit result text; type is secondary, not a
  heavy chip. Sort direction sits in the time column header.
- The detail inspector shows result, input, provenance and run timeline
  without repeating the row. Paginate when not every event is shown.

## Timeline or roadmap

- A time scale, a today marker, milestones and a state legend; rows for
  workstreams, bars for durations, markers for point events.
- Blocked work names its blocker and owner.
- Drag has keyboard and button alternatives; a list or table view exists
  when exact dates and ownership matter more than spatial comparison.

## Empty, error, restricted

State content is in `references/state-completeness.md`. Explain what is
absent or failed before offering the action; an illustration is optional and
never replaces recovery information.
