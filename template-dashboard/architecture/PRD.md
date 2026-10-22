# PRD — FrontX Dashboard Template

<!-- toc -->

- [1. Overview](#1-overview)
  - [1.1 Purpose](#11-purpose)
  - [1.2 Background / Problem Statement](#12-background--problem-statement)
  - [1.3 Goals (Business Outcomes)](#13-goals-business-outcomes)
  - [1.4 Glossary](#14-glossary)
- [2. Actors](#2-actors)
  - [2.1 Human Actors](#21-human-actors)
  - [2.2 System Actors](#22-system-actors)
- [3. Operational Concept & Environment](#3-operational-concept--environment)
  - [3.1 Module-Specific Environment Constraints](#31-module-specific-environment-constraints)
- [4. Scope](#4-scope)
  - [4.1 In Scope](#41-in-scope)
  - [4.2 Out of Scope](#42-out-of-scope)
- [5. Functional Requirements](#5-functional-requirements)
  - [5.1 Template Installation and Content](#51-template-installation-and-content)
  - [5.2 Data Loading](#52-data-loading)
  - [5.3 Dashboard Content and Widgets](#53-dashboard-content-and-widgets)
- [6. Non-Functional Requirements](#6-non-functional-requirements)
  - [6.1 NFR Inclusions](#61-nfr-inclusions)
  - [6.2 NFR Exclusions](#62-nfr-exclusions)
  - [6.3 Limitations and Known Gaps](#63-limitations-and-known-gaps)
- [7. Public Library Interfaces](#7-public-library-interfaces)
  - [7.1 Public API Surface](#71-public-api-surface)
  - [7.2 External Integration Contracts](#72-external-integration-contracts)
- [8. Use Cases](#8-use-cases)
- [9. Acceptance Criteria](#9-acceptance-criteria)
- [10. Dependencies](#10-dependencies)
- [11. Assumptions](#11-assumptions)
- [12. Risks](#12-risks)

<!-- /toc -->

## 1. Overview

### 1.1 Purpose

`template-dashboard` is a FrontX template. It adds a declarative dashboard viewer to a FrontX application that already uses `template-shell`. A dashboard is described as data: a layout, a theme, a set of widgets, and the queries behind them. The viewer reads that description and renders it. The application developer does not write chart or grid code for each dashboard.

The template ships four things. The first is the dashboard viewer, called the **Viewer host**. The second is a widget library with 13 widget kinds. The third is a demo package with example content. The fourth is a catalog of dashboard types, rebased from the earlier prototype to the FrontX vendor and namespace.

The template is a **simple port** of an earlier report-dashboard prototype, the DevExpert report-dashboard prototype (vendor `de`). Anything that is internal in the prototype stays internal here. Changes come in later stages.

### 1.2 Background / Problem Statement

Teams that build cloud-project applications on FrontX often need dashboards: summary cards, grids, and charts that show how a project is doing. Each team builds these screens from scratch. The result is many one-off dashboards with different filters, different drill-down behavior, and different visual quality.

The DevExpert report-dashboard prototype solved this for GitHub engineering analytics. It has a declarative dashboard model, a library of widgets, a shared filter panel, and drill-down into detail views. In the prototype, a generation pipeline pre-computes a report, and the viewer reads that report. The prototype runs outside FrontX, so teams cannot reuse it directly in a FrontX application.

This template brings the viewer side of the prototype to FrontX. Instead of a pre-computed report, the viewer loads entity data live from the consuming project's backend. GitHub engineering analytics is kept only as the demo domain. It shows what a real dashboard looks like and is not the goal of the template.

### 1.3 Goals (Business Outcomes)

- A FrontX application developer can add a working dashboard viewer to an application built on `template-shell` with one template command, and the template changes no `template-shell` file. Modal drill-down also needs the host to render its modal domain, which is a prerequisite `template-shell` change tracked outside the template (section 11).
- A dashboard viewer can explore a dashboard (filter, drill down, change time granularity) with every interaction visible within the latency budgets in section 6.
- A consuming project can show its own data by implementing one data contract (`EntitySource`), without changing the viewer or the widget library.
- Teams that do not want example content get a clean install; teams that want it get a complete working demo with one opt-in switch.
- The port keeps the prototype's behavior, so later stages start from a known and tested baseline.

### 1.4 Glossary

| Term | Definition |
|------|------------|
| FrontX | The micro-frontend framework (MFE: an independently built and mounted UI unit) that applications and templates in this repository target. |
| Template | A reusable add-only overlay of files that a developer applies to a project with `frontx add`. |
| `template-shell` | The FrontX host application template. It provides the host screen domain and the host modal domain. |
| Host screen domain | The area of the host application where full screens (extensions) are mounted. The Viewer host lives here. |
| Host modal domain | The area of the host application where modals are mounted. Drill-down into a modal uses it. |
| Viewer host | The MFE that renders a dashboard. It owns the filter panel, the data worker, the data loading, and the mounting of widgets. It is the prototype's "Dashboard Viewer Shell". |
| Widget | A single dashboard element such as a card, a grid, or a chart. The template has 13 widget kinds. |
| Widget library | The set of widget kinds, delivered as MFE entries. |
| Entity | A record of one domain type, such as a pull request or a contributor. |
| Aspect | A reusable set of fields that an entity type has, such as author, team, or created-at. Filters work on aspects, so an entity type can be filtered only by the aspects it has. |
| Renderer | A reusable display type for a cell or field, used by grid columns, such as a badge, a link, or a sparkline. |
| Data worker | The background worker in the browser that indexes the loaded entity data and runs the dashboard queries, so the page stays responsive. |
| Module Federation | The bundling format used to package MFEs. Per the assumption in section 11, FrontX uses it only for bundling and resolves dependencies itself, so it does not share library instances between MFEs. |
| p95 | The 95th percentile: 95% of measured cases are at or below the stated value. |
| `templateExample` | A marker in a template package manifest that keeps an example package out of a normal install. |
| Derived field | A field computed from other data, such as a team, a score, or a merge status. The backend or the fixture data supplies it. |
| `EntitySource` | The pluggable contract that loads entity collections for a time window. The viewer ships an HTTP implementation, and the opt-in demo package ships a fixture implementation. |
| Global filter | A filter that applies to every widget on the dashboard. |
| Local filter overlay | A filter that applies to one widget only, on top of the global filter. |
| Drill-down | Clicking an element of one widget to open a related, pre-filtered widget in a detail panel or modal. |
| Peer navigation | Moving to the previous or next item of the filtered list that produced the open modal. |
| GTS | Global Type System. It is the identifier and schema system that names dashboard types and instances. |
| Demo package | The opt-in package `dashboard-demo` with example entities, aspects, filters, queries, a sample dashboard, and the fixture `EntitySource`. |
| Prototype | The DevExpert report-dashboard prototype (vendor `de`), the source of this port. |

## 2. Actors

> **Note**: Stakeholder needs are managed at project/task level by steering committee. Document **actors** (users, systems) that interact with this module.

### 2.1 Human Actors

#### Template Consumer

**ID**: `cpt-frontx-dashboard-actor-template-consumer`

**Role**: A FrontX application developer who applies the template to a project, chooses whether to include the demo content, and connects the viewer to the project's own data.
**Needs**: A one-command install that does not touch `template-shell`. A clear data contract to implement. Demo content that is easy to include or leave out. Widgets and dashboards that work without custom chart code.

#### Dashboard Viewer

**ID**: `cpt-frontx-dashboard-actor-dashboard-viewer`

**Role**: An end user of the consuming application who opens a dashboard to understand the state of a cloud project.
**Needs**: Fast, readable dashboards. Filters that apply the same way everywhere. Drill-down into details without losing context. Clear feedback while data loads or when loading fails. A light or dark theme.

### 2.2 System Actors

#### Consuming Project Backend

**ID**: `cpt-frontx-dashboard-actor-consuming-backend`

**Role**: The backend of the consuming project. It provides entity data through the `EntitySource` contract. The entities it returns carry every derived field that their aspects declare, such as team, score, language, merge status, and CI status. The viewer's built-in HTTP source authenticates to it with the shell's cookie session on same-origin requests. A backend that needs another session kind is connected through a consumer `EntitySource`.

#### Host Application

**ID**: `cpt-frontx-dashboard-actor-host-application`

**Role**: `template-shell`, or an application built from it. It provides the host screen domain where the Viewer host is mounted and the host modal domain where drill-down modals are shown. It also provides the auth session. This template does not modify it. For modal drill-down, the host must render its modal domain through a domain slot with modal chrome, focus trap, and dismissal. Current `template-shell` registers the host modal domain but renders no slot for it, so this slot is a prerequisite `template-shell` change tracked outside the template.

## 3. Operational Concept & Environment

> **Note**: Project-wide runtime, OS, architecture, lifecycle policy, and integration patterns defined in root PRD. Document only module-specific deviations here. **Delete this section if no special constraints.**

### 3.1 Module-Specific Environment Constraints

- The template runs only in a FrontX application that already contains `template-shell`. It has no other template dependency; nothing from `template-mfe` or the demo MFE is required.
- All data processing runs in the user's browser. There is no server-side query execution.
- FrontX isolates every MFE instance and allows no shared singletons between instances. Each instance loads its own copy of heavy libraries. Module Federation serves only as the bundling format, as stated in the assumptions in section 11.
- The target FrontX ecosystem is the `develop` line of `gears-frontx`.
- The template documentation under `template-dashboard/architecture/` is not shipped to consumers.

## 4. Scope

### 4.1 In Scope

The rule for this release is **simple port**: prototype internals stay internal, and changes come in later stages.

- The dashboard viewer: the Viewer host, mounted in the host screen domain, with its filter panel, data worker, and drill-down surfaces.
- The widget library: 13 subject-agnostic widget kinds, each delivered as an MFE entry.
- The demo package: opt-in example content, with GitHub engineering analytics as the demo domain. It ports the full prototype GitHub scope: 8 entities, 17 aspects, 31 filters, 36 queries, and a sample dashboard.
- A modal container that the template ships and that occupies the host modal domain, so drill-down widgets can be shown in a modal. The template requires the host to render the host modal domain through a domain slot with modal chrome, focus trap, and dismissal. Current `template-shell` registers the host modal domain but renders no slot for it, so this is a prerequisite `template-shell` change tracked outside the template.
- The GTS type catalog, rebased from the prototype vendor and namespace to FrontX.
- The template packaging: an add-only overlay on `template-shell`.
- Live entity loading through the pluggable `EntitySource` contract, with loading and error states.

### 4.2 Out of Scope

- Dashboard authoring and the Admin Panel.
- The generation pipeline and report download.
- The frontend gateway.
- Remote or server-side query execution.
- A typed filter-state wire contract. Filter state stays internal to the viewer.
- Behavior-level FEATURE documents and the DECOMPOSITION document. They come in later stages.
- Changes to `template-shell` files by this template. The host modal-domain slot that modal drill-down needs is a `template-shell` change tracked outside the template.
- Bearer-token and cross-origin cookie sessions in the built-in HTTP `EntitySource`. They need a consumer `EntitySource`.
- Dashboard visibility, publication, sharing, and audience settings from the prototype.

## 5. Functional Requirements

> **Testing strategy**: All requirements verified via automated tests (unit, integration, e2e) targeting 90%+ code coverage unless otherwise specified. Document verification method only for non-test approaches (analysis, inspection, demonstration).

Functional requirements define WHAT the system must do. They are grouped by feature area.

### 5.1 Template Installation and Content

#### Add-Only Overlay Installation

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-fr-overlay-install`

The template **MUST** install onto a project that contains `template-shell` through `frontx add`, as an add-only overlay. The install **MUST NOT** change or remove existing `template-shell` files, and **MUST** depend on `template-shell` only.

**Rationale**: Developers need to adopt the dashboard without forking or editing the shell.

**Actors**: `cpt-frontx-dashboard-actor-template-consumer`, `cpt-frontx-dashboard-actor-host-application`

#### Opt-In Demo Content

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-fr-demo-opt-in`

The template **MUST** keep the demo package out of a normal install. The demo package **MUST** be included only when the consumer opts in, either through the `templateExample` marker (a manifest marker that keeps example packages out of a normal install) or by setting `FRONTX_INCLUDE_TEMPLATE_EXAMPLES=1`. The demo package **MUST** include the full prototype GitHub scope, ported one-to-one: 8 example entities, 17 aspects, 31 filters, 36 queries, and a sample dashboard. It **MUST** also include the fixture `EntitySource`, so that the viewer works without a backend.

**Rationale**: Consumers who bring their own data should not receive example code. Consumers who evaluate the template need a working dashboard at once.

**Actors**: `cpt-frontx-dashboard-actor-template-consumer`

#### Viewer Host in the Host Screen Domain

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-fr-viewer-host`

The system **MUST** provide the Viewer host as a routed screen in the host screen domain. The route **MUST** carry the dashboard instance to show. Each open dashboard **MUST** have its own filter state and its own data worker, so two dashboards never share state.

**Rationale**: The viewer is the entry point to everything else in the template, and per-dashboard isolation matches how FrontX isolates MFE instances. One Viewer host is mounted per application tree (see the DESIGN constraint on one Viewer host per application tree), so independent dashboards open at the same time run in separate application instances, such as two browser tabs.

**Actors**: `cpt-frontx-dashboard-actor-dashboard-viewer`, `cpt-frontx-dashboard-actor-host-application`

### 5.2 Data Loading

#### Pluggable Entity Source

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-fr-entity-source`

The system **MUST** load the entity data for a dashboard through a pluggable `EntitySource` contract. Given the entity types a dashboard needs and a time window, the source **MUST** return the matching collections. The entities **MUST** carry every derived field that their aspects declare. The viewer **MUST** ship an HTTP implementation that uses the shell's cookie session on same-origin requests. The built-in HTTP implementation does not cover bearer-token or other session kinds, or cross-origin cookie sessions; a consumer connects those through its own `EntitySource`. The opt-in demo package (`dashboard-demo`, marked `templateExample`) **MUST** ship a fixture implementation that needs no network and no authentication, so a clean install does not contain the fixture.

**Rationale**: Consumers connect their own backend by implementing one contract. Derived fields are produced by the backend, so the viewer needs no new operators.

**Actors**: `cpt-frontx-dashboard-actor-template-consumer`, `cpt-frontx-dashboard-actor-consuming-backend`, `cpt-frontx-dashboard-actor-host-application`

#### Reload on Time-Window Change

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-fr-time-window-reload`

The system **MUST** reload entity data when the global time window changes. All other filter changes **MUST** be applied to the data already loaded, without a new load.

**Rationale**: The time window decides which data exists in the browser. Other filters only narrow it, so they can stay fast.

**Actors**: `cpt-frontx-dashboard-actor-dashboard-viewer`

#### Loading and Error States

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-fr-loading-error-states`

The system **MUST** show a visible loading state during the first entity load and during any reload. When loading fails, the system **MUST** show an error state that reports the `entity_fetch_failed` error and offers a retry action. A successful retry **MUST** return the dashboard to its normal state.

**Rationale**: Live loading can be slow or can fail. Users must always know which of the two is happening and what they can do about it.

**Actors**: `cpt-frontx-dashboard-actor-dashboard-viewer`, `cpt-frontx-dashboard-actor-consuming-backend`

#### Fixture Source Behavior

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-fr-fixture-source`

The fixture implementation **MUST** honor the requested time window, **MUST** support a configurable delay (400 ms by default), and **MUST** support development-time failure injection that produces `entity_fetch_failed` so the retry flow can be tried.

**Rationale**: A fixture that behaves like a live source lets developers see loading and error states without a backend.

**Actors**: `cpt-frontx-dashboard-actor-template-consumer`

### 5.3 Dashboard Content and Widgets

#### Widget Catalog Coverage

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-fr-widget-catalog`

The system **MUST** provide a widget library with the following 13 subject-agnostic widget kinds, grouped by purpose. Kinds marked with an asterisk (\*) have no demo query (see section 6.3).

- Cards: `summary_card`, `metric_card`\*, `ranked_list_card`, `progress_list_card`, `markdown_card`\*, `metadata_strip`\*.
- Data: `grid`.
- Charts: `cartesian_chart`, `pie_chart`, `heatmap`.
- Detail and activity: `code_diff`\*, `thread_list`\*, `event_timeline`\*.

Each kind **MUST** be delivered as its own MFE entry. A widget kind **MUST NOT** depend on the demo domain, so a consumer can use the kinds with any entity data.

**Rationale**: A complete, domain-neutral catalog lets consumers build dashboards without writing chart or grid code.

**Actors**: `cpt-frontx-dashboard-actor-template-consumer`, `cpt-frontx-dashboard-actor-dashboard-viewer`

#### Dashboard Filter Panel

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-fr-filter-panel`

The system **MUST** present a filter panel with global filters, including a configurable time-range field and a time window, plus the domain filters that the dashboard declares. A filter selection **MUST** apply consistently to every widget that uses the filtered data.

**Rationale**: One filter surface gives users one coherent view of the dashboard.

**Actors**: `cpt-frontx-dashboard-actor-dashboard-viewer`

#### Filter Option Enumeration

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-fr-filter-options`

The system **MUST** fill the selectable options of multiselect filters from the data that was actually loaded for the dashboard. Users **MUST** see only options that exist in that data.

**Rationale**: Fixed option lists go stale and let users pick choices that give empty results.

**Actors**: `cpt-frontx-dashboard-actor-dashboard-viewer`

#### Drill-Down Into a Detail Panel

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-fr-drilldown-panel`

The system **MUST** let a user click an interactive element of a widget (a card cell, a grid cell, a chart segment, or a badge) and open a target widget in a detail panel, pre-filtered to the subset that the clicked element implies. The panel **MUST** hold at most one open widget. Opening a new one **MUST** replace the current one. The user **MUST NOT** have to re-enter any filter value.

**Rationale**: Compact widgets are only useful if users can reach the detail behind them in one click.

**Actors**: `cpt-frontx-dashboard-actor-dashboard-viewer`

#### Drill-Down Into a Modal

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-fr-drilldown-modal`

The system **MUST** also let a user open the drill-down target in a modal shown in the host modal domain. The template **MUST** ship its own modal container that occupies the host modal domain, and **MUST NOT** change `template-shell` files. The template **MUST** require the host to render the host modal domain through a domain slot with modal chrome, focus trap, and dismissal. Current `template-shell` registers the host modal domain but renders no slot for it, so this slot is a prerequisite `template-shell` change tracked outside the template. The modal **MUST** show data scoped by the global filters, the widget's local filter overlay, and the clicked subject. When the data for the modal cannot be loaded, the error **MUST** appear in the widget's place inside the modal.

**Rationale**: Items such as a single pull request or a contributor need more room than a side panel gives.

**Actors**: `cpt-frontx-dashboard-actor-dashboard-viewer`, `cpt-frontx-dashboard-actor-host-application`

#### Peer Navigation in the Modal

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-fr-peer-navigation`

The system **MUST** let a user who has opened an item in the modal move to the previous or next item of the source widget's filtered list, without closing the modal and without losing the filter context. The order of items **MUST** match the source widget's displayed order. The previous and next controls **MUST** be disabled while a step is being resolved.

**Rationale**: Dashboard viewers often review items in sequence. Closing and re-clicking for each item breaks that flow.

**Actors**: `cpt-frontx-dashboard-actor-dashboard-viewer`

#### Per-Widget Local Filter Overlay

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-fr-local-filter-overlay`

The system **MUST** let a user apply extra filters that scope one widget only. The widget **MUST** show the intersection of the global filters and its local overlay. The overlay **MUST NOT** change the global filter state and **MUST NOT** affect other widgets.

**Rationale**: Users refine one chart or grid without disturbing the rest of the dashboard.

**Actors**: `cpt-frontx-dashboard-actor-dashboard-viewer`

#### Time-Bucket Granularity

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-fr-time-bucket-granularity`

The system **MUST** let a user choose the time bucket for a time-bucketed widget from day, week, month, and quarter, and **MUST** re-bucket the data without leaving the dashboard. When the user has made no choice, the system **MUST** apply a default bucket derived from the dashboard time range.

**Rationale**: A single fixed bucket hides patterns at other timescales.

**Actors**: `cpt-frontx-dashboard-actor-dashboard-viewer`

#### Inline Grid Search and Column Filters

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-fr-grid-search-filters`

The system **MUST** let a user narrow the rows of a data grid with a free-text search and with per-column filters for columns that the grid declares as filterable. Both **MUST** apply on top of the global filters and **MUST NOT** change the global filter state.

**Rationale**: Wide grids exceed one screen, and users need fast narrowing without leaving the grid.

**Actors**: `cpt-frontx-dashboard-actor-dashboard-viewer`

#### Conditional Cell Formatting and Hover Detail

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-fr-cell-formatting`

The system **MUST** format grid cells to match their meaning: value-driven color emphasis, readable durations and ages, signed deltas for additions and deletions, and badges for ranked values. The system **MUST** show hover detail for cells whose short form hides useful context.

**Rationale**: Formatted cells let users scan wide grids quickly and still reach the underlying values.

**Actors**: `cpt-frontx-dashboard-actor-dashboard-viewer`

#### Grid Frozen Columns, Column Groups, and Row Coloring

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-fr-grid-presentation`

The system **MUST** support, on the grid widget kinds, columns that stay visible during horizontal scroll, grouped column headers, and row background coloring driven by a row classifier such as the team.

**Rationale**: Grids with many columns are unreadable without these controls.

**Actors**: `cpt-frontx-dashboard-actor-dashboard-viewer`

#### Light and Dark Theme

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-fr-theme`

The system **MUST** render the viewer, the widgets, and the modal in a light theme and in a dark theme, taken from the theme that the dashboard declares and the host theme. A theme change **MUST** reach every mounted widget without a reload of the dashboard.

**Rationale**: Consistent theming keeps dashboards inside the look of the host application.

**Actors**: `cpt-frontx-dashboard-actor-dashboard-viewer`, `cpt-frontx-dashboard-actor-host-application`

#### Rebased Type Catalog

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-fr-type-catalog`

The system **MUST** provide the dashboard type catalog under the FrontX vendor and namespace, replacing the prototype vendor `de`. The catalog **MUST** cover the widget kinds, renderers, layout, theme, and a trimmed dashboard root that keeps its name, description, theme, layout, and default time window. The prototype's visibility, sharing, publication, and audience properties **MUST NOT** be part of it. The generic types **MUST** stay separate from the demo types.

**Rationale**: Consumers need FrontX-native identifiers, and a clean split lets them reuse the generic types with their own domain.

**Actors**: `cpt-frontx-dashboard-actor-template-consumer`

## 6. Non-Functional Requirements

### 6.1 NFR Inclusions

#### Visual Quality

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-nfr-visual-quality`

The system **MUST** give all chart and data display types one consistent look, in both light and dark themes, as measured by the threshold below.

**Threshold**: In design review, 100% of the 13 widget kinds follow the host design-system tokens (colors, typography, spacing) with no per-widget manual styling.

**Rationale**: Dashboards are decision tools, and visual quality shapes trust in the data.

**Verification Method**: Inspection against the design-system reference, in both themes.

#### Initial Render Latency

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-nfr-initial-render`

The system **MUST** show the first fully rendered dashboard within the threshold below, measured from the moment its data has been requested.

**Threshold**: **Provisional.** Under 3 seconds at p95 for the largest supported data volume, covering data fetch, index build, layout rendering, and the first widget queries. The budget is carried from the prototype, which read a precomputed payload; this template fetches entity data live and indexes it in the browser. The entity fetch is inside the measured time (request to first rendered dashboard). The reference conditions (reference device and network profile) are fixed in DESIGN section 3.9. The budget will be re-measured under those conditions and confirmed or revised.

**Rationale**: A slow first view undermines the value of live data.

#### Filter Interaction Latency

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-nfr-filter-latency`

The system **MUST** update the affected widgets within the threshold below after a filter or search change that does not reload data, and **MUST** keep the page responsive while it does so.

**Threshold**: Under 200 ms at p95 for the largest supported data volume. The budget is carried from the prototype.

**Rationale**: Exploration only works when answers arrive as fast as the questions.

#### Peer Navigation Latency

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-nfr-peer-navigation-latency`

The system **MUST** show the next item within the threshold below when a user steps to a previous or next peer in the modal.

**Threshold**: The next step is visible in under 200 ms at p95, measured from the moment its data has been resolved.

**Rationale**: Sequential review needs a step to feel instant. Prev and Next are disabled while a step resolves, and the modal does not close between steps.

#### In-Memory Data Ceiling

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-nfr-memory-ceiling`

The system **MUST** work within the browser memory limit inherited from the prototype, and **MUST** release dashboard data when the dashboard is closed.

**Threshold**: Up to 100 MB of loaded data per Viewer host instance, measured before in-browser indexing, within a 2 GB whole-client memory ceiling. This is the largest supported data volume that the latency thresholds in this section refer to. Data above this volume is outside the supported range. See the limitation in section 6.3.

**Rationale**: All data is processed in the browser, so memory is the hard limit of the product.

#### Compatibility

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-nfr-compatibility`

The template **MUST** work with the FrontX ecosystem from the `develop` line of `gears-frontx`, and **MUST** depend on `template-shell` only.

**Threshold**: A clean install on a project with `template-shell` builds with no changes to `template-shell` files. An install with the demo opt-in also builds and opens the demo dashboard. Modal drill-down additionally needs the host modal-domain slot with modal chrome, focus trap, and dismissal, a prerequisite `template-shell` change tracked outside the template.

**Rationale**: A narrow dependency keeps adoption cheap and upgrades predictable.

#### Bundle Size Budget (Provisional)

- [ ] `p3` - **ID**: `cpt-frontx-dashboard-nfr-bundle-budget`

The system **MUST** stay within a bundle size budget for the Viewer host and for each widget MFE. The figures are provisional; see DESIGN §3.9 and question Q1 in section 12. The prototype budgets were under 500 KB gzipped for the viewer and under 100 KB gzipped per widget, with the charting library shared between widgets.

**Threshold**: **Provisional, see DESIGN §3.9.** The Viewer host MFE is under 500 KB gzipped, and each widget MFE is under 100 KB gzipped without the charting and table libraries, which are counted separately per instance. The modal container entry is counted separately from the Viewer host MFE. FrontX isolates each MFE instance and allows no shared singletons, so each instance loads heavy libraries again; every figure is re-measured on production builds and confirmed or revised.

**Rationale**: A budget protects first-load time, but a figure copied from a shared-library design would be misleading.

**Verification Method**: Analysis of measured production bundle sizes per instance.

#### Accessibility

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-nfr-accessibility`

The system **MUST** follow the host application's accessibility policy in every widget and control. The filter panel, drill-down, and modal navigation, including the previous and next controls, **MUST** be operable with the keyboard alone.

**Threshold**: 100% of the 13 widget kinds, the filter panel, the detail panel, and the modal pass the host application's accessibility checks in both themes. Every filter, drill-down, and peer-navigation action in the demo dashboard can be completed with the keyboard alone.

**Rationale**: Dashboards are part of the host application, so they must be usable by the same people, including keyboard and assistive-technology users.

**Verification Method**: Inspection against the host accessibility policy, plus a keyboard-only walkthrough of the demo dashboard.

#### Consumer Documentation

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-nfr-consumer-docs`

The template **MUST** ship a consumer guide that explains how to implement `EntitySource` against a project backend and how to enable the demo content.

**Threshold**: A developer who follows only the shipped guide can enable the demo and connect a custom `EntitySource` implementation without reading the template source code.

**Rationale**: The data contract is the main adoption step, and the documentation under `template-dashboard/architecture/` is not shipped to consumers.

**Verification Method**: Inspection of the shipped guide, plus a walkthrough by a developer who did not build the template.

### 6.2 NFR Exclusions

- Multi-tenant isolation, role-based administration, and dashboard-delivery availability or recovery targets: the template has no server component. Authentication and tenancy belong to the host application and the consuming backend.
- Authoring usability: dashboard authoring is out of scope.
- Regeneration and report-pipeline performance: there is no generation pipeline in this template.
- On-prem and edge deployment portability: the template ships as source files and has no delivery edge.
- Safety and regulatory compliance: not applicable. The template is a read-only information UI that stores nothing.
- Privacy: no separate privacy NFR. Entity data stays in browser memory and is released when the viewer closes (see `cpt-frontx-dashboard-nfr-memory-ceiling`). Demo data is synthetic. The template adds no processing of personal data beyond what the consuming backend returns.
- Audit logging: not applicable at template level. The consuming application owns audit.
- Accessibility: covered as a requirement in `cpt-frontx-dashboard-nfr-accessibility`, which inherits the host application's policy.
- Internationalization and regional formats: inherited from the host. The template follows the host language shared property, and number and date formatting follow the host locale.
- Supported browsers: inherited from the `template-shell` support matrix.
- Consumer documentation: covered as a requirement in `cpt-frontx-dashboard-nfr-consumer-docs`.
- Data retention and persistence: none. Nothing is stored beyond the browser session.
- Release, operations, and monitoring: not applicable. The template is a source overlay with no runtime service; the consuming application owns release and monitoring.

### 6.3 Limitations and Known Gaps

- **No demo query for six widget kinds.** `metric_card`, `markdown_card`, `code_diff`, `thread_list`, `event_timeline`, and `metadata_strip` exist in the widget library (marked with an asterisk in `cpt-frontx-dashboard-fr-widget-catalog`) but have no demo query. The demo dashboard does not show them.
- **In-memory ceiling.** All entity data is held and queried in the browser. Datasets above the ceiling in `cpt-frontx-dashboard-nfr-memory-ceiling` are not supported, and there is no server-side fallback.
- **No server-side query execution.** Every query runs in the browser on the loaded collections.
- **Cookie sessions only in the built-in HTTP source.** The HTTP `EntitySource` supports the shell's cookie session on same-origin requests only. A project whose shell uses bearer tokens or another session kind, or whose backend needs cross-origin cookies, implements its own `EntitySource`.
- **Modal drill-down needs a host change.** Current `template-shell` renders no slot for the host modal domain. Until the host renders it with modal chrome, focus trap, and dismissal, drill-down into a modal and peer navigation cannot be shown; the detail panel works without it.

## 7. Public Library Interfaces

The template exposes two contracts to the consumer. The technical form of each belongs in the DESIGN.

### 7.1 Public API Surface

#### Entity Source Contract

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-interface-entity-source`

**Type**: TypeScript contract inside the viewer package

**Stability**: experimental

**Description**: The contract that a consumer implements to feed the viewer. It takes the entity types a dashboard needs and a time window, and returns the entity collections. It reports failure as `entity_fetch_failed`. The HTTP implementation ships with the viewer. The fixture implementation ships only with the opt-in demo package (`dashboard-demo`, marked `templateExample`), so a clean install does not contain it.

**Breaking Change Policy**: While the template is in alpha, changes are allowed and are listed in the template release notes. After the first stable release, a change needs a major version bump.

#### Dashboard Type Catalog

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-interface-type-catalog`

**Type**: Data format (GTS types and instances under the FrontX vendor)

**Stability**: experimental

**Description**: The types that describe dashboards, layouts, widgets, renderers, themes, queries, and filters. Consumers write dashboards and queries against it.

**Breaking Change Policy**: Every identifier starts at version 1 and is frozen from the first non-alpha release. A change that is not backward compatible ships as a new version of the type.

### 7.2 External Integration Contracts

#### Entity Data From the Consuming Backend

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-contract-entity-data`

**Direction**: required from client

**Protocol/Format**: Entity collections with derived fields filled in, returned through the entity source contract.

**Compatibility**: The backend decides how to supply derived fields. The viewer does not compute them. Adding a new derived field to an aspect requires the backend to return it.

#### Host Screen and Modal Domains

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-contract-host-domains`

**Direction**: required from client

**Protocol/Format**: Host screen domain and host modal domain, as provided by `template-shell`. The host must render the host modal domain through a domain slot with modal chrome, focus trap, and dismissal; current `template-shell` registers that domain but renders no slot for it, so this is a prerequisite `template-shell` change tracked outside the template.

**Compatibility**: The template refers to these domains by role. A change to the host's own identifiers is handled in one place and does not change the product behavior.

## 8. Use Cases

#### Explore a Dashboard With Live Data

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-usecase-explore-dashboard`

**Actor**: `cpt-frontx-dashboard-actor-dashboard-viewer`

**Preconditions**:
- The template is installed and a dashboard instance is available.
- The entity source can reach the consuming backend, or the fixture source is selected.

**Main Flow**:
1. The viewer opens the dashboard route.
2. The system shows a loading state and loads the entities for the default time window.
3. The system renders the layout and the widgets.
4. The viewer changes a filter, and the widgets update from the loaded data.
5. The viewer changes the time window, and the system reloads the data.

**Postconditions**:
- The dashboard shows data for the chosen filters and time window.

**Alternative Flows**:
- **Loading fails**: The system shows the `entity_fetch_failed` error with a retry action. After a successful retry, step 3 continues.

#### Drill Down and Step Through Peers

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-usecase-drilldown-peers`

**Actor**: `cpt-frontx-dashboard-actor-dashboard-viewer`

**Preconditions**:
- A dashboard is open with a grid that supports drill-down into a modal.

**Main Flow**:
1. The viewer clicks a grid row.
2. The system resolves the data and opens the modal in the host modal domain.
3. The viewer applies a local filter in the modal widget.
4. The viewer chooses "next". The system shows the next item of the grid's filtered list.

**Postconditions**:
- The modal shows the chosen peer, and the global filter state is unchanged.

**Alternative Flows**:
- **Data for a step cannot be loaded**: The error appears in the widget's place inside the modal, and the viewer can go to another peer.
- **The dashboard is no longer available**: The system closes the modal.

#### Adopt the Template

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-usecase-adopt-template`

**Actor**: `cpt-frontx-dashboard-actor-template-consumer`

**Preconditions**:
- The project contains `template-shell`.

**Main Flow**:
1. The consumer applies the template with `frontx add`.
2. The consumer optionally includes the demo content with the opt-in switch.
3. The consumer opens the demo dashboard and checks that it works.
4. The consumer implements the entity source contract against the project backend and selects it.

**Postconditions**:
- The application shows dashboards from the project's own data.

**Alternative Flows**:
- **No demo content wanted**: The consumer skips step 2 and writes a dashboard against the generic types.

## 9. Acceptance Criteria

- [ ] A project with `template-shell` accepts the template through `frontx add`, and no `template-shell` file is changed.
- [ ] A normal install contains no demo content. An opted-in install contains the demo package and shows a working demo dashboard with no backend.
- [ ] All 13 widget kinds are available as MFE entries, and a dashboard can use them with entity data from outside the demo domain.
- [ ] Global filters, filter option enumeration, drill-down into a panel and a modal, peer navigation, local overlays, time buckets, grid search, and column filters work in the demo dashboard. Drill-down into a modal and peer navigation are checked on a host that renders the host modal-domain slot with modal chrome, focus trap, and dismissal.
- [ ] Changing the time window reloads data, and changing any other filter does not.
- [ ] A forced loading failure shows the `entity_fetch_failed` state, and retry restores the dashboard.
- [ ] Initial render, filter latency, and peer navigation meet the budgets in section 6. The initial render budget is checked under the reference conditions fixed in the DESIGN.
- [ ] Switching between the light and dark theme updates the viewer, every mounted widget, and the modal without a reload of the dashboard.
- [ ] In the demo, the fixture source applies its configurable delay, and with development-time failure injection enabled the dashboard shows the `entity_fetch_failed` state with a working retry.
- [ ] The generic dashboard types can be used to write a dashboard without the demo package installed.
- [ ] Two viewers open at the same time in separate application instances (for example two browser tabs) do not share filter state or loaded data: a filter change in one leaves the other unchanged. One application tree mounts one Viewer host (see the DESIGN constraint on one viewer per tree).
- [ ] The demo dashboard shows conditional cell formatting, hover detail, frozen columns, grouped column headers, and row coloring in its grids.
- [ ] The memory held for dashboard data is released when the viewer closes.
- [ ] A clean install on a project with `template-shell` builds with no changes to `template-shell` files, and an install with the demo opt-in also builds and opens the demo dashboard. Modal drill-down additionally works once the host renders the host modal-domain slot, a prerequisite `template-shell` change tracked outside the template.
- [ ] The filter panel, drill-down, and modal peer navigation in the demo dashboard can be operated with the keyboard alone and pass the host accessibility checks.
- [ ] The template ships a consumer guide that covers implementing `EntitySource` and enabling the demo content.
- [ ] The limitations in section 6.3 are visible in the documentation.

## 10. Dependencies

| Dependency | Description | Criticality |
|------------|-------------|-------------|
| `template-shell` | Provides the host screen domain, the host modal domain, the cookie auth session, and the base application. The only template dependency. Modal drill-down also needs a rendered host modal-domain slot, a `template-shell` change tracked outside the template. | p1 |
| FrontX ecosystem (`gears-frontx` develop) | The MFE framework, extension model, and design-system theme tokens. | p1 |
| Consuming project backend | Supplies entity data with derived fields in real deployments. Not needed with the fixture source. | p2 |
| DevExpert report-dashboard prototype | The source of the ported model, widgets, and budgets. | p3 |

## 11. Assumptions

- Consumers apply the template to a project that already uses `template-shell`.
- The `develop` line of `gears-frontx` offers what the viewer needs: routed screens, concurrent extension domains, and per-instance MFE isolation.
- The consuming backend can compute derived fields and return them with each entity.
- A browser can hold the supported data volume, within the memory ceiling.
- FrontX uses Module Federation only as a bundling format and resolves dependencies itself (template assumption from the product owner).
- `template-shell` will render the host modal domain through a domain slot with modal chrome, focus trap, and dismissal, through a change tracked outside this template, before modal drill-down is released to consumers.
- The consuming project's shell authenticates the backend with a cookie session on the same origin, or the project supplies its own `EntitySource`.
- The performance budgets from the prototype remain a valid starting point for this template. The prototype read a precomputed payload, so the initial render budget is provisional and will be re-measured with live loading under the reference conditions fixed in the DESIGN.

## 12. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| The bundle budget under per-instance isolation is provisional (Q1, provisional figures in DESIGN §3.9) | Heavy libraries load again in each MFE instance, so first-load time may exceed the provisional figures | Measure per-instance sizes on production builds early. Check whether FrontX shared-dependency reuse helps. Confirm or revise the figures from the measurements. |
| Loading states for live data prove unclear in use (Q2, resolved in DESIGN §4) | Users may see unclear states during first load, reload, and failure | The DESIGN defines the visible states and their default wording, using the requirements in this PRD as the baseline. Review them in the demo dashboard and refine them in the feature documents. |
| Data above the in-memory ceiling | The browser slows down or runs out of memory | State the limit clearly. A server-side option is a later-stage decision. |
| The Viewer host must build its nested registry synchronously during its first mount so that requests from the modal container reach it, and the modal container must build its own registry synchronously during its first mount so that actions from the Viewer host reach its modal widgets (Q3, resolved in DESIGN §4) | Peer navigation from the modal back to the source widget, or delivery of data to the modal widgets, could fail if a later change makes either construction asynchronous | The DESIGN fixes the construction order of both registries. Cover it with an integration test. |
| The host modal-domain slot is a `template-shell` change outside this template, and current `template-shell` renders no slot for the host modal domain | Until the host renders the slot with modal chrome, focus trap, and dismissal, drill-down into a modal and peer navigation cannot be shown | Track the slot as a prerequisite `template-shell` change. State it in the consumer guide and in the host contract. The detail panel covers drill-down until the slot exists. |
| Six widget kinds have no demo query | Defects in these kinds can go unnoticed in demo testing | Test them with unit fixtures. Add demo queries in a later stage. |

**Open questions**:

- **Q1 — Bundle budget under per-instance isolation.** What bundle size budget applies to the Viewer host and to each widget MFE when every instance loads its own copy of heavy libraries? Owner: template architect. Resolved (provisional) in DESIGN §4: the provisional figures are in DESIGN §3.9 and are re-measured on production builds.
- **Q2 — Live-data UX states.** What exactly do users see, and with what wording, during the first load, a time-window reload, and a failed load? Owner: template product owner. Resolved in DESIGN §4.
- **Q3 — Viewer registry construction.** The Viewer host must build its nested registry synchronously during its first mount, so that peer-navigation requests from the modal container can be forwarded to it. The forwarding path is decided, and how the container learns the origin and dashboard context is answered by Q6. Owner: template architect. Resolved in DESIGN §4: the Viewer host and the modal container both build their registries synchronously in their first mount.
- **Q4 — ADR numbering.** Resolved: ADR-0015 (live entity source) and ADR-0016 (template packaging and host contract).
- **Q5 — Registration of `modal_panel` widget extensions.** The container's registry exists only after its first mount (FrontX ADR-0008), and FrontX has no action that registers an extension in another registry. Define how the nested widget extensions get registered, never on Prev or Next. Owner: template architect. Resolved in DESIGN §4: the container registers a drill-down's widget extensions only when that drill-down opens.
- **Q6 — Drill-down context for the modal container.** The static container's fields carry no per-step data, and the host modal domain gives it no actions and only the host's theme and language. Define how the container receives drill-down context from the Viewer host: the originating cell and peer position for `navigate_peer`, and the dashboard palette and mode so `modal_panel` widgets follow the dashboard theme. Owner: template architect. Resolved in DESIGN §4: the Viewer host sends this context to the container when the drill-down opens.
