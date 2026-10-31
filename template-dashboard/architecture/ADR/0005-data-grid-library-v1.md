---
status: accepted
version: 1
priority: p1
date: 2026-10-31
decision-makers: template-dashboard architecture maintainers
description: "Decision record for the library behind the grid widget type: TanStack Table v8 with the virtualizer and ARIA grid semantics, rendering one client-side page at a time of the rows the transform delivered, up to the row cap; the grid holds all rows up to the cap, sorts and pages client-side, and never sends a request."
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
  - [TanStack Table v8 (headless) with the virtualizer](#tanstack-table-v8-headless-with-the-virtualizer)
  - [AG Grid Community Edition](#ag-grid-community-edition)
  - [MUI DataGrid (free tier)](#mui-datagrid-free-tier)
  - [Mantine DataTable](#mantine-datatable)
  - [Glide Data Grid (canvas-based)](#glide-data-grid-canvas-based)
  - [No library: semantic HTML table rendered by the widget](#no-library-semantic-html-table-rendered-by-the-widget)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

## Context and Problem Statement

The `grid` widget type shows tabular data. Its data is the grid's data shape, delivered through `render_widget` from the rows the binding's transform produced ([ADR-0009](0009-subject-agnostic-widget-catalog-v1.md), [ADR-0011](0011-widget-data-binding-v1.md)). The transform output has a row cap. The grid is a passive renderer: it receives its data and renders it, and makes no requests.

The grid sorts and pages client-side over the rows it received. The browser holds the rows the transform delivered, up to the row cap; the grid renders one page at a time. Column resizing is the only interaction that redraws locally and is never saved. In FrontX each widget instance is isolated, so every grid instance evaluates its own copy of whatever library the grid uses.

Which library, if any, renders the `grid` widget type?

## Decision Drivers

* The grid sorts and pages client-side over the rows the transform delivered; the library must not fetch, filter or page from a backend.
* Strict TypeScript support with generic column definitions.
* MIT license for every feature the widget uses.
* Headless rendering, so the widget owns the markup and ui-kit tokens style the grid.
* Small library size, because every grid instance evaluates its own copy (FrontX ADR-0011).
* Rendering performance with one page of up to the row cap, so only the visible rows of a page may be rendered.
* Accessibility: ARIA grid semantics, including row counts and positions for virtualized rows and sort state on headers.
* Reliable AI code generation for the library's API.

## Considered Options

* TanStack Table v8 (headless) with the virtualizer
* AG Grid Community Edition
* MUI DataGrid (free tier)
* Mantine DataTable
* Glide Data Grid (canvas-based)
* No library: semantic HTML table rendered by the widget

## Decision Outcome

Chosen option: "TanStack Table v8 (headless) with the virtualizer", because it combines full rendering control, strict TypeScript generics, an MIT license, a column sizing feature for local resizing, and a library small enough to be evaluated once per instance. It spares the widget a hand-built column and row model, and it pairs with a virtualizer from the same project for one page of up to the row cap.

**Data and columns.** The `grid` widget type uses TanStack Table v8 as a typed column and row model for rendering. The widget builds one column definition per displayed column. Each definition reads its value from the row in the data shape. The widget keeps the rows in the delivered order. The widget uses the library's column model, its sorting and pagination row models, and its column sizing feature. The grid sorts and pages client-side over the rows it already has, which is what these row models do, so the widget does not build them by hand. Sorting uses the widget's own sort function, which follows the grid's sort rule in the widget catalog. Column sizing is used for resizing only. The library's filtering and grouping features and its manual (server-side) sorting and pagination modes are not used, because the grid filters nothing and already holds every row it shows.

**Client-side sort and page.** A click on a sortable column header sorts the rows the widget holds, in place. A page control moves between pages of the row cap. A new page size changes the page size. None of these sends a request or re-runs the binding: the grid works only on the rows the transform delivered, up to the row cap. The pager shows the position in the result, the number of rows on the page and the total. A page size is always offered. The larger view of a grid is its own grid widget with its own data, and it sorts and pages the same way.

**Presentation features keyed by column.** Frozen leading columns that stay visible during horizontal scroll, grouped column headings, column alignment, and row colouring keyed by a column whose value names a ui-kit row-colour token, which adapts to the light or dark scope. A coloured row also shows an icon with an accessible name, so meaning is never conveyed by colour alone (`cpt-frontx-dashboard-fr-accessibility`).

**Virtualized rows per page.** The widget uses the TanStack virtualizer: it renders only the rows in view, so one page of up to the row cap renders and scrolls smoothly. The widget renders the table itself, and each cell shows its value as text. The widget keeps the library behind its own typed props, so the grid configuration does not depend on library types.

**Grid checks.** The widget type's schema closes its presentation fields (`unevaluatedProperties: false`), so a misspelled field fails validation and the widget gets the cannot-be-shown state ([ADR-0003](0003-shared-data-types-and-schemas-v1.md)). [ADR-0009](0009-subject-agnostic-widget-catalog-v1.md) owns the row cap of 500: it counts every row the transform delivers, not the rows on one page. The page size is a separate render choice, decided in the widget catalog. Grid columns are keyed by position: data rows stay positional arrays, `render.columns[i]` describes position `i` and has a required `key` (unique, `^[a-z][a-z0-9_]{0,63}$`), and `column_groups[].members` and `row_color` refer to column keys. The consistency checks are based on keys: there is exactly one column per data position, group members are columns, groups are contiguous, there are no repeats inside a group, no column belongs to two groups, and `row_color` names a column. A failure of a consistency check gives the cannot-be-shown state.

### Consequences

* Good, because column definitions are typed against the grid's row model under `strict: true`.
* Good, because every feature the widget uses is MIT-licensed, with no commercial tier.
* Good, because the headless design keeps ui-kit in charge of appearance, and row colours follow the light or dark kit scope.
* Good, because virtualized rows keep a page of up to the row cap responsive, and the rows stay DOM elements.
* Good, because the grid holds all rows up to the cap and renders one page at a time, so a result of any size up to the cap shows with the same grid.
* Good, because the library is small (about 15 KB gzipped), so the repeated per-instance cost stays low.
* Bad, because headless means the header and row markup, including frozen columns, grouped headings, alignment and the pager, must be built once. Mitigation: it lives in one grid component all grid configurations share.
* Bad, because accessibility (ARIA grid semantics, including row counts and positions for virtualized rows, and sort state on headers) must be implemented in that component by hand.
* Bad, because virtualization adds a second small library, and off-screen rows are not in the DOM. Mitigation: it is the TanStack virtualizer, used only inside the grid component.
* Bad, because the library ships filtering, grouping and manual-mode code the grid does not use, a small size cost. Mitigation: the grid component exposes no props for them, and code review rejects their use.

### Confirmation

Confirmed by code review and by checks on the `grid` widget:

* The widget builds its table with TanStack Table v8, and no other grid library appears in the dependency list of the widget package.
* Cells show their value as text, and no column configuration selects a cell renderer.
* A page of up to the row cap renders only the rows in view and scrolls smoothly in the light and the dark kit scope.
* A click on a sortable header sorts the rows in place and sends no request. A page control moves between pages and sends no request. A new page size changes the page size and sends no request. Resizing a column redraws the grid and sends no request.
* A row with a colour shows an icon with an accessible name, and no row meaning rests on colour alone.
* Frozen columns, grouped column headings, alignment and row colours render as configured.
* A test confirms the grid cross-checks: there is exactly one column per data position, group members are columns, groups are contiguous, there are no repeats inside a group, no column belongs to two groups, and `row_color` names a column. A failure of each check gives the cannot-be-shown state.
* The component exposes ARIA grid semantics, including row counts and positions for virtualized rows and the sort state of headers, checked by an automated accessibility check and a keyboard test (`cpt-frontx-dashboard-fr-accessibility`).
* The transferred gzipped size of each `grid` widget entry is measured on a cold load of the reference dashboard under the counting rule of the DESIGN. TanStack Table and the virtualizer are listed in the manifest's `shared` array and counted once in the page total, not double-counted per entry.

## Pros and Cons of the Options

### TanStack Table v8 (headless) with the virtualizer

The headless table library with full rendering control.

* Good, because column definition generics are strong under strict TypeScript.
* Good, because all features are MIT-licensed.
* Good, because its small size suits a library that each isolated instance evaluates separately.
* Good, because rendering is fully ours, including frozen columns, grouped headings and row colours.
* Good, because virtualized rows through `@tanstack/react-virtual` cover a page of up to the row cap.
* Good, because its column sizing feature covers local resizing.
* Bad, because all grid markup must be built, including the pager.
* Bad, because its filtering and grouping features and its manual modes are unused weight, since the grid filters nothing and holds every row it shows.
* Bad, because there is no built-in accessibility.

### AG Grid Community Edition

A complete grid with built-in UI.

* Good, because rendering and accessibility come built in.
* Bad, because much of its weight is built-in UI the grid does not use, such as filtering, grouping and editing; the library is overkill here.
* Bad, because the library is about 300 KB gzipped, which every isolated instance would evaluate again.
* Bad, because its own CSS conflicts with ui-kit.

### MUI DataGrid (free tier)

The Material UI data grid.

* Good, because UI and accessibility come built in.
* Bad, because it pulls in the MUI ecosystem, which conflicts with ui-kit, and it is large to evaluate per instance.

### Mantine DataTable

The Mantine data table component.

* Good, because it is MIT-licensed with a simple API.
* Bad, because it has no virtualization and needs the Mantine ecosystem, which conflicts with ui-kit.

### Glide Data Grid (canvas-based)

A canvas-rendered grid for very large datasets.

* Good, because canvas rendering is fast on very large sets.
* Bad, because cells are canvas draw calls, outside ui-kit's components and tokens.
* Bad, because canvas output has no DOM for screen readers.

### No library: semantic HTML table rendered by the widget

The widget renders a plain `<table>` from its configuration and its page of rows.

* Good, because it adds no library cost to any instance.
* Good, because rendering and styling are fully ours.
* Bad, because the typed column model, the row model, virtualization of a page of up to the row cap, and column resizing would be built and maintained by hand.

## More Information

* Evolution path: the grid component hides TanStack Table behind typed props. If the library changes, only the component changes, and grid configurations stay the same.
* Review trigger: the measured benefit of the typed column model does not outweigh the library cost (the no-library option becomes preferable); the row cap is raised above what virtualized rendering handles smoothly; a TanStack Table major version forces a large component rewrite.
* Row order is the delivered order of the rows, and the grid sorts in place. Grouped column headings only label contiguous columns in the header.
* Scope: the `grid` widget type and its grid component. Does not change other widget types or the binding runner.
* Checklist applicability: ARCH applicable; PERF applicable (per-instance evaluation cost, virtualized rendering); SEC applicable (cells show untrusted API values as text only, with no cell renderers); REL N/A because the template is source code with no service, no availability target and no runbook (DESIGN section 4.2); DATA N/A (the grid reads its data and persists nothing); INT N/A because the library is internal to the widget entry, and the render and data contract is owned by ADR-0009; OPS N/A because the template is source code with no service, no availability target and no runbook (DESIGN section 4.2); MAINT applicable (the component hides the library, and the repository's agent guidance pins TanStack Table to version 8); TEST applicable; COMPL applicable (every used feature must be MIT-licensed); UX applicable (accessibility is built in the component; the viewer sorts, pages and resizes; no migration, because v1 has no prior users; changes are communicated in release notes; the author guides of DESIGN section 5 document the grid); BIZ applicable (the hand-built markup and accessibility are a one-time build cost, see Consequences).

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements or design elements:

* `cpt-frontx-dashboard-fr-grid-sort-page` — the grid sorts and pages client-side over the rows the transform delivered, never sends a request, and renders one page at a time.
* `cpt-frontx-dashboard-nfr-large-table` — virtualized rows keep a page of up to the row cap responsive.
* `cpt-frontx-dashboard-fr-accessibility` — the grid component exposes ARIA grid semantics, and no row meaning rests on colour alone.
* `cpt-frontx-dashboard-nfr-bundle-budget` — the grid library is small; its shared dependency source text is fetched once.
* `cpt-frontx-dashboard-fr-widget-catalog` — the `grid` widget type uses this library.
