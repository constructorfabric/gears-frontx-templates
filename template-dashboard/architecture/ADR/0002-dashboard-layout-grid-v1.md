---
status: accepted
version: 1
priority: p1
date: 2026-10-31
decision-makers: template-dashboard architecture maintainers
description: "Decision record for the dashboard layout grid: integer {x, y, w, h} cells on a fixed 60-column grid (x 0-59, y 0-9999, w 1-60, h 1-9999), rendered with CSS Grid and no layout library, with cell bounds, overlaps, x+w <= 60 and unique widget ids checked by the dashboard root, and a fixed row track and reading order."
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
  - [A layout library at run time (react-grid-layout) in the dashboard root](#a-layout-library-at-run-time-react-grid-layout-in-the-dashboard-root)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

## Context and Problem Statement

A dashboard places widgets in cells. The dashboard root needs a layout model that is easy to store as data and easy to render. The dashboard is one JSON; the template renders it and does not edit it. How should layout be represented and rendered?

A layout is a set of cells, each stored as integer `{x, y, w, h}` coordinates on a fixed 60-column grid (`x` 0–59, `y` 0–9999, `w` 1–60, `h` 1–9999, static schema bounds). A cell holds one widget and an optional larger-view widget.

## Decision Drivers

* The stored layout must be independent of any rendering library, so it can be validated and reused.
* The dashboard root must not carry a layout library, to keep its bundle small.
* Layout must render the same way for every dashboard, with no hidden collision logic at run time.
* Common row splits, including five equal widgets in a row, must fit without remainders, while coordinates stay easy to write by hand.
* The grid sorts and pages client-side; the layout only places cells.
* The rendered layout must work inside the style scope that the dashboard root owns, with no document-level stylesheets.

## Considered Options

* 60-column `{x, y, w, h}` cells rendered with CSS Grid
* 12- or 24-column `{x, y, w, h}` cells rendered with CSS Grid
* A layout library at run time (react-grid-layout) in the dashboard root

## Decision Outcome

Chosen option: "60-column `{x, y, w, h}` cells rendered with CSS Grid", because it keeps the stored model library-independent, renders with browser-native layout at no bundle cost, and fits more common splits than a coarser grid.

The layout-to-CSS mapping is direct. The container is a grid with 60 equal columns. A cell with `x`, `y`, `w`, `h` occupies the column range starting at `x + 1` and spanning `w` columns, and the row range starting at `y + 1` and spanning `h` rows. Each cell holds one widget and may hold a larger-view widget; when it is absent, the cell hides its larger-view button. The dashboard root trusts valid coordinates and does not move cells to resolve collisions.

**Row track and reading order.** The unit of `h` is one fixed row track, whose height is an open item of the DESIGN. Cells are read and reached by keyboard in row-major order (by `y`, then `x`), which is the order a viewer scans them; the model feature's placement procedure applies it (`cpt-frontx-dashboard-algo-dashboard-model-place-cells`). This settles the row track and the keyboard and reading order of cells.

**Layout checks.** The dashboard root runs the layout checks in its own code when it opens a dashboard. The model feature owns the procedure (`cpt-frontx-dashboard-algo-dashboard-model-layout-checks`); this ADR states its staging. Cell failures come first: a missing `widget` or a coordinate outside its bounds (`0 ≤ x ≤ 59`, `0 ≤ y ≤ 9999`, `1 ≤ w ≤ 60`, `1 ≤ h ≤ 9999`), found by the GTS validation of the dashboard. The `x + w ≤ 60` check, the overlap check and the check for unique widget ids across `widget` and `larger_view` run only when no cell has a cell failure (every GTS instance id is unique, so a dashboard never holds the same widget instance twice). One pass reports together all failures of the stage it reaches, with the dashboard's own validation failures. A failed layout check is a dashboard-level failure: the dashboard area shows the cannot-be-shown state, and no cell is mounted. A widget that fails its own registration gets a failed cell.

### Consequences

* Good, because the dashboard root has no layout dependency, so there is no extra code to load.
* Good, because the same stored coordinates can feed any editor the product uses, without a format change.
* Good, because 60 columns divide evenly into halves, thirds, quarters, fifths, sixths, tenths and twelfths.
* Bad, because overlapping or out-of-range cells and repeated widget ids are not repaired at run time; the layout check rejects them, so one bad cell blocks the whole dashboard, and its JSON must be fixed.
* Bad, because there is no visual editor; layouts are written as data.

### Confirmation

Confirmed by rendering a test dashboard and checking that each cell lands on the column and row range given by its coordinates, read in row-major order. Three fixtures confirm rejection: an overlapping fixture, an out-of-range fixture (`x + w` > 60), and a repeated-widget-id fixture. For each, the dashboard root renders no cells and shows the dashboard-level cannot-be-shown state. A review confirms the dashboard root package has no layout library dependency.

## Pros and Cons of the Options

### 60-column `{x, y, w, h}` cells rendered with CSS Grid

Cells are integer coordinates on a fixed 60-column grid, mapped to CSS grid lines.

* Good, because it uses browser-native layout.
* Good, because the grid styles live in the style scope that the dashboard root owns, with no document-level stylesheets.
* Good, because the stored model is simple and library-independent.
* Good, because 60 is divisible by 2, 3, 4, 5, 6, 10, 12, 15, 20 and 30, so five equal widgets in a row fit exactly.
* Neutral, because authoring is out of scope and left to the product.
* Bad, because collisions are not resolved at run time and need the layout check.

### 12- or 24-column `{x, y, w, h}` cells rendered with CSS Grid

The same model and rendering, with a coarser grid.

* Good, because it uses browser-native layout.
* Good, because 12 columns is a familiar convention, and small coordinates are easy to write by hand.
* Neutral, because 24 columns adds eighths but gives fewer splits than 60.
* Bad, because neither 12 nor 24 is divisible by 5, so five equal widgets in a row cannot fit.
* Bad, because it gives coarser placement for small widgets such as metric cards.

### A layout library at run time (react-grid-layout) in the dashboard root

The dashboard root would render and position cells through a drag-and-resize grid library.

* Good, because collision handling is built in.
* Bad, because the dashboard root would load an editing library only to display fixed layouts.
* Bad, because each isolated instance would pay for that code.
* Bad, because the library imposes its own DOM and document-level stylesheets that would have to be injected into the style scope that the dashboard root owns.

## More Information

* **Review trigger**: revisit when responsive layouts for narrow screens become a requirement.
* **Scope**: this decision covers the stored cell model, the column count, the row track, the reading and keyboard order, the rendering technique, and where invalid layouts are caught. It does not cover authoring or responsive reflow for narrow screens, which the DESIGN specifies.
* **Checklist applicability**: ARCH applicable; PERF applicable (no layout library per instance, native layout); SEC N/A; REL applicable (invalid layouts rejected with the dashboard-level cannot-be-shown state); DATA applicable (stored coordinate format and its validation); INT N/A; OPS N/A; MAINT applicable (no layout library to upgrade); TEST applicable; COMPL N/A; UX applicable (placement precision, the row track, and the reading and keyboard order); BIZ N/A.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements or design elements:

* `cpt-frontx-dashboard-fr-dashboard-as-json` — the layout and cell types store integer `{x, y, w, h}` coordinates on the 60-column grid.
* `cpt-frontx-dashboard-fr-widget-catalog` — each cell holds one widget of the catalog and an optional larger-view widget.
* `cpt-frontx-dashboard-nfr-bundle-budget` — the dashboard root carries no layout library.
* `cpt-frontx-dashboard-nfr-initial-render` — native CSS Grid keeps layout cost low at first render.
