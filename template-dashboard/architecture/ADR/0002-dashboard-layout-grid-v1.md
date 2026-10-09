---
status: accepted
date: 2026-10-05
decision-makers: template-dashboard architecture maintainers
---

# ADR-0002: Dashboard layout grid

**ID**: `cpt-frontx-dashboard-adr-dashboard-layout-grid`

<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [60-column `{x, y, w, h}` cells rendered with CSS Grid](#60-column-x-y-w-h-cells-rendered-with-css-grid)
  - [12- or 24-column `{x, y, w, h}` cells rendered with CSS Grid](#12--or-24-column-x-y-w-h-cells-rendered-with-css-grid)
  - [A layout library at run time (react-grid-layout) in the viewer](#a-layout-library-at-run-time-react-grid-layout-in-the-viewer)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

## Context and Problem Statement

A dashboard places widgets in cells. The viewer needs a layout model that is easy to store as data and easy to render. How should layout be represented and rendered in the viewer?

The earlier DevExpert prototype used a 60-column grid. Each cell is stored as integer `{x, y, w, h}` coordinates, with one widget per cell. Its authoring editor used react-grid-layout (a React drag-and-resize grid component). Its viewer rendered the same coordinates with plain CSS Grid and no layout library. This template ports the viewer half only. Authoring is a later stage.

## Decision Drivers

* The stored layout must be independent of any rendering library, so that it can be validated and reused.
* The viewer must not carry a layout library, to keep widget and viewer bundles small under per-instance isolation.
* Layout must render the same way for every dashboard, with no hidden collision logic at run time.
* Common row splits, including five equal widgets in a row, must fit without remainders, while coordinates stay easy to write by hand.
* The rendered layout must work inside the Shadow DOM boundary of the layout domain without document-level stylesheets.

## Considered Options

* 60-column `{x, y, w, h}` cells rendered with CSS Grid
* 12- or 24-column `{x, y, w, h}` cells rendered with CSS Grid
* A layout library at run time (react-grid-layout) in the viewer

## Decision Outcome

Chosen option: "60-column `{x, y, w, h}` cells rendered with CSS Grid", because it keeps the stored model library-independent, renders with browser-native layout at no bundle cost, and fits more common splits than a coarser grid.

The layout-to-CSS mapping is direct. The container is a grid with 60 equal columns. A cell with `x`, `y`, `w`, `h` occupies the column range starting at `x + 1` and spanning `w` columns, and the row range starting at `y + 1` and spanning `h` rows. Each cell holds one widget. The viewer trusts valid coordinates and does not move cells to resolve collisions.

Invalid layouts are caught in two places. Schema validation of the layout cell type checks the bounds of each coordinate (non-negative integers, `x` below 60, `w` from 1 to 60, `h` at least 1). A viewer-side layout check runs when the Viewer host opens a dashboard. It rejects cells that overlap or that extend past column 60 (`x + w` greater than 60), and the Viewer host shows a diagnostic instead of rendering the dashboard.

The authoring editor, including react-grid-layout, is a non-goal for this template. It may be added in a later stage, because the stored format does not depend on it.

### Consequences

* Good, because the viewer has no layout dependency, so there is no extra code to load in each instance.
* Good, because the same stored coordinates can later feed an editor without a format change.
* Good, because 60 columns divide evenly into halves, thirds, quarters, fifths, sixths, tenths, and twelfths.
* Bad, because overlapping or out-of-range cells are not repaired at run time. Schema validation and the viewer-side layout check reject them, so one bad cell blocks the whole dashboard until its data is fixed.
* Bad, because coordinates on 60 columns are larger numbers than on 12 columns, so hand-written layouts are more prone to small gaps.
* Bad, because there is no visual editor, so layouts are written as data.

### Confirmation

Confirmed by rendering the sample dashboard and checking that each cell lands on the column and row range given by its coordinates. Two fixtures confirm rejection: an overlapping fixture, where two cells share a grid area, and an out-of-range fixture, where a cell has `x + w` greater than 60. For each fixture the viewer renders no cells and shows a diagnostic. A review confirms that the viewer package has no layout library dependency.

## Pros and Cons of the Options

### 60-column `{x, y, w, h}` cells rendered with CSS Grid

Cells are integer coordinates on a fixed 60-column grid, mapped to CSS grid lines.

* Good, because it uses browser-native layout.
* Good, because the grid styles live in the viewer's own shadow root and need no document-level stylesheet.
* Good, because the stored model is simple and library-independent.
* Good, because 60 is divisible by 2, 3, 4, 5, 6, 10, 12, 15, 20, and 30, so five equal widgets in a row fit exactly.
* Neutral, because the editing experience is deferred.
* Bad, because collisions are not resolved at run time and need a separate layout check.
* Bad, because the larger coordinates are harder to write by hand.

### 12- or 24-column `{x, y, w, h}` cells rendered with CSS Grid

The same model and rendering, with a coarser grid.

* Good, because it uses browser-native layout and works inside the shadow root, like the 60-column option.
* Good, because 12 columns is a familiar convention, and small coordinates are easy to write by hand.
* Neutral, because 24 columns adds eighths but still gives fewer splits than 60.
* Bad, because neither 12 nor 24 is divisible by 5, so five equal widgets in a row cannot fit.
* Bad, because it gives coarser placement for small widgets such as metric cards.
* Bad, because collisions are still not resolved at run time.

### A layout library at run time (react-grid-layout) in the viewer

The viewer would render and position cells through a drag-and-resize grid library.

* Good, because collision handling is built in.
* Bad, because the viewer would load an editing library only to display fixed layouts.
* Bad, because each isolated instance would pay for that code.
* Bad, because the library ships document-level stylesheets that would have to be injected into each shadow root.

## More Information

* **Review trigger**: revisit this decision when an authoring editor is taken up, or when responsive layouts for narrow screens become a requirement.
* **Scope**: this decision covers the stored cell model, the column count, the rendering technique, and where invalid layouts are caught. It does not cover an authoring editor, responsive reflow for narrow screens, or the layout domain and cell types, which the DESIGN specifies.
* **Checklist applicability**: ARCH applicable (layout model and rendering technique); PERF applicable (no layout library per instance, native layout at first render); SEC N/A (coordinates are validated integers and add no trust boundary); REL applicable (invalid layouts are rejected with a diagnostic); DATA applicable (stored coordinate format and its validation); INT N/A (no external system is involved); OPS N/A (no deployment or operational change); MAINT applicable (no layout library to upgrade, and the format is independent of a future editor); TEST applicable (overlapping and out-of-range fixtures); COMPL N/A (no regulated data or new license); UX applicable (placement precision and the missing visual editor); BIZ N/A (the deferred editor is recorded in Scope, with no other business trade-off).
* The decision about an authoring editor is deferred and needs its own ADR if it is taken up.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements or design elements:

* `cpt-frontx-dashboard-fr-type-catalog` — the layout and cell types in the catalog store integer `{x, y, w, h}` coordinates on the 60-column grid.
* `cpt-frontx-dashboard-fr-widget-catalog` — each cell holds one widget of the catalog.
* `cpt-frontx-dashboard-nfr-bundle-budget` — the viewer carries no layout library.
* `cpt-frontx-dashboard-nfr-initial-render` — native CSS Grid keeps layout cost low at first render.
