# Component anatomy and interaction

## Every interactive component

It has a semantic role and accessible name, a stable anatomy, the global
states, its family's states, keyboard behavior, token mapping, and density
and responsive behavior. The minimum per family, what the kit guarantees and
the combinations to check are in `rules/component-state-matrix.json`
(APP-004, INT-003). Do not restate or rebuild the kit's keyboard and focus
mechanics; the browser check observes the result.

## Buttons and links

- A button acts; a link navigates.
- At most one primary button per region.
- Destructive actions use danger semantics and a confirmation in proportion
  to the consequence.
- A loading button keeps its width, accessible name and status.
- A disabled control **SHOULD** say why when the reason is not obvious.

## Fields

- Labels stay visible after input; a placeholder is an example, not a label.
- Error, help and character count share one reserved message area.
- Search fields use search semantics and a clear control when clearing helps.

## Menus, popovers, dialogs and inspectors

- A dialog is for a bounded decision, not a stand-in for a page.
- An inspector keeps the list context and shows the selected entity; its
  selection **SHOULD** be in the URL when routing exists.
- Overflow menus hold tertiary actions, never the only path to a common task.

## Tabs and navigation

Tabs switch views within one scope; navigation changes location or level.
The selected tab is distinct visually and programmatically. The same
destination is not in both tabs and local navigation without a recorded
reason.

## Tables and grids

- A semantic table for read-oriented data; an interactive grid only when
  cell-level keyboard navigation is really needed.
- Sorting sits in the column header with the kit's sort indicator and
  `aria-sort` on the sorted header (`references/typography.md`); column
  controls sit in the table header region, not as a page action (DAT-002).
- Pagination sits in the table footer and states range, total and current
  page; it is required when the shown range is smaller than the result set.
- Selection, hover, focus and status stay distinguishable.
- Row actions use one overflow pattern; frequent primary actions may be
  visible.

## Cards and widgets

- A card exists only when its boundary makes a meaningful group or target;
  never nested for decoration.
- Cards in a family share title, value, supporting content and action
  baselines.
- A widget declares title, metric basis, timeframe, state, visualization and
  drill-down as they apply (`references/data.md`).

## Feedback components

Inline validation stays with its field; banners carry page or section
consequences; toasts confirm transient, non-blocking outcomes; progress
indicators name the operation and show completion or failure.
