---
status: accepted
date: 2026-10-05
decision-makers: template-dashboard architecture maintainers
---

# ADR-0005: Data grid library

**ID**: `cpt-frontx-dashboard-adr-data-grid-library`

<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [TanStack Table (headless)](#tanstack-table-headless)
  - [AG Grid Community Edition](#ag-grid-community-edition)
  - [MUI DataGrid (free tier)](#mui-datagrid-free-tier)
  - [Mantine DataTable](#mantine-datatable)
  - [Glide Data Grid (canvas-based)](#glide-data-grid-canvas-based)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

## Context and Problem Statement

The `grid` widget kind shows tabular entity data such as pull requests, reviews, and commits. It needs client-side sorting, filtering, row grouping, pagination, column resizing, and custom cell renderers. The data arrives from the Data Query Worker as a result set already loaded in the browser, so the grid never fetches data itself. The earlier DevExpert prototype made this choice for widgets that were built as separate bundles; the template keeps the choice and has to restate it for FrontX, where each MFE instance is isolated.

Which library renders the `grid` widget kind?

Constraints that apply to every option:

- Row grouping is required, so a library that puts grouping behind a commercial license is out.
- Expected volume is 500 to 5,000 rows per grid widget. Above 10,000 rows is not a target.
- Cell renderers come from the renderer catalog and are React components (status badges, avatars, links). Canvas cell drawing cannot host them.
- The design system owns visual appearance. The library must not impose its own CSS.

## Decision Drivers

* Strict TypeScript support with generic column definitions typed against the data shape.
* MIT license with sorting, filtering, grouping, and pagination all included.
* Headless rendering, so column renderers from the renderer catalog plug in directly and the design system styles the grid.
* Small bundle size, because FrontX loads the library once per MFE instance and does not share it between instances (FrontX ADR-0011).
* Reliable AI code generation for the library's API.
* Client-side performance with 500 to 5,000 rows.

## Considered Options

* TanStack Table (headless)
* AG Grid Community Edition
* MUI DataGrid (free tier)
* Mantine DataTable
* Glide Data Grid (canvas-based)

## Decision Outcome

Chosen option: "TanStack Table (headless)", because it is the only option that combines MIT-licensed row grouping, full rendering control for React column renderers, strict TypeScript generics on column definitions, and a bundle small enough to be paid once per MFE instance.

The `grid` widget kind uses TanStack Table for table state (sorting, filtering, grouping, pagination, column sizing). The widget renders the table itself. Each column's cell is rendered by a renderer from the renderer catalog, selected by the column configuration. The widget keeps the library behind its own typed props, so widget configuration does not depend on library types.

### Consequences

* Good, because column definitions are typed against the row shape under `strict: true`, so a wrong data key fails at compile time.
* Good, because every feature the widget needs is MIT-licensed, with no commercial tier.
* Good, because the headless design lets catalog renderers produce the cell content and keeps the design system in charge of appearance, with no style conflicts.
* Good, because the library is small (about 15 KB gzipped). FrontX isolates each MFE instance and shares no singletons (FrontX ADR-0011), so every grid widget instance loads its own copy. A small library keeps that repeated cost low. Source-text reuse by content hash (FrontX ADR-0034) may reduce parsing further. This does not remove the per-instance cost.
* Bad, because headless means the sort indicators, filter inputs, group headers, resize handles, and pagination controls must be built once. Mitigation: they live in one grid shell component that all grid configurations share.
* Bad, because accessibility (ARIA attributes, keyboard navigation) must be implemented in that shell by hand.
* Bad, because AI tools sometimes produce the old React Table v7 API. Mitigation: AI guidance for the template names version 8.

### Confirmation

Confirmed by code review and by checks on the `grid` widget:

* The widget builds its table with TanStack Table and no other grid library appears in the dependency list of the widget package.
* Column renderers resolve from the renderer catalog, and a column configuration with an unknown renderer is rejected.
* Sorting, filtering, and grouping on a loaded result set run without network requests.
* The measured gzipped size of the `grid` widget, library included and counted once per instance, is recorded. Until open question Q1 sets the budget in `cpt-frontx-dashboard-nfr-bundle-budget`, the check confirms that the grid library stays in the low tens of KB gzipped. Once Q1 is resolved, the recorded size is checked against that budget. Source-text reuse by content hash (FrontX ADR-0034) is a mitigation for repeated fetches and is not counted as a reduction of the per-instance size.
* The grid shell exposes ARIA grid semantics and is keyboard-operable for sort, filter, group and paginate, checked by an automated accessibility check and a keyboard test (traces `cpt-frontx-dashboard-nfr-accessibility`).

## Pros and Cons of the Options

### TanStack Table (headless)

The headless table library with full rendering control.

* Good, because column definition generics are strong under strict TypeScript.
* Good, because row grouping and all other features are MIT-licensed.
* Good, because its small size suits a library that each isolated instance loads separately.
* Good, because rendering is fully ours, so renderer-catalog cells are plain React components.
* Good, because virtual rows through `@tanstack/react-virtual` cover larger sets if needed later.
* Bad, because all grid UI must be built.
* Bad, because there is no built-in accessibility.

### AG Grid Community Edition

A complete grid with built-in UI.

* Good, because sorting, filtering, pagination, and accessibility come built in.
* Good, because performance is high on very large sets.
* Bad, because row grouping needs a paid Enterprise license.
* Bad, because the bundle is about 300 KB gzipped, which would be paid again by every isolated instance.
* Bad, because its own CSS conflicts with the design system.

### MUI DataGrid (free tier)

The Material UI data grid.

* Good, because UI and accessibility come built in.
* Bad, because row grouping is behind the paid Pro license.
* Bad, because it pulls in the MUI ecosystem, which conflicts with the design system.

### Mantine DataTable

The Mantine data table component.

* Good, because it is MIT-licensed with a simple API.
* Bad, because it has no row grouping.
* Bad, because it has no virtualization and needs the Mantine ecosystem.

### Glide Data Grid (canvas-based)

A canvas-rendered grid for very large datasets.

* Good, because canvas rendering is fast on very large sets.
* Bad, because cells are canvas draw calls, so React column renderers from the catalog cannot be used.
* Bad, because canvas output has no DOM for screen readers.

## More Information

* This ADR covers the grid library only. Chart rendering and state management are separate decisions (see [ADR-0006](0006-viewer-state-management-v1.md) for state).
* Evolution path: the grid shell hides TanStack Table behind typed props. If the library changes or is replaced, only the shell changes, and grid widget configurations stay the same.
* Review trigger: row grouping stops being required (AG Grid Community becomes viable); data sets regularly exceed 10,000 rows; a TanStack Table major version forces a large shell rewrite; the measured per-instance size exceeds the budget set by Q1.
* Scope: changes the `grid` widget kind and its grid shell. Does not change other widget kinds, the renderer catalog contract, the query layer, or widget configuration types.
* Checklist applicability:
  * ARCH: applicable, addressed by the decision and options.
  * PERF: applicable, per-instance bundle cost and client-side work on 500 to 5,000 rows.
  * SEC: N/A, because the grid renders result sets already in browser memory, with no network, auth, or storage.
  * REL: N/A, because the grid has no external dependency; query failures are handled by the Viewer host (ADR-0014).
  * DATA: N/A, because the grid reads result sets and persists nothing.
  * INT: applicable, the grid consumes catalog renderers and Worker result sets through its own typed props; no external API.
  * OPS: N/A, because the template is a source overlay with no deployed service; the consuming application owns operations.
  * MAINT: applicable, the shell hides the library, and AI guidance names version 8.
  * TEST: applicable, see Confirmation.
  * COMPL: applicable, every used feature must be MIT-licensed, which excludes options with paid grouping.
  * UX: applicable, accessibility and grid controls are built in the shell.
  * BIZ: N/A, because this is a technical decision.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements or design elements:

* `cpt-frontx-dashboard-fr-grid-presentation` — the grid shell built on TanStack Table provides the grid presentation behavior.
* `cpt-frontx-dashboard-fr-grid-search-filters` — in-grid search and column filters run on the headless table state.
* `cpt-frontx-dashboard-fr-cell-formatting` — column renderers from the renderer catalog produce the formatted cells.
* `cpt-frontx-dashboard-fr-widget-catalog` — the `grid` widget kind is one of the catalog kinds this decision implements.
* `cpt-frontx-dashboard-nfr-bundle-budget` — the per-instance library cost counts against the bundle budget.
* `cpt-frontx-dashboard-nfr-accessibility` — accessibility of the grid is delivered by the grid shell.
