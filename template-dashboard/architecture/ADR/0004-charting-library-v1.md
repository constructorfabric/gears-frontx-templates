---
status: accepted
version: 1
priority: p1
date: 2026-10-31
decision-makers: template-dashboard architecture maintainers
description: "Decision record for the charting library of the catalog chart widget types: Apache ECharts through echarts/core, with a per-instance frontx-dashboard theme built from ui-kit tokens of the scope the host theme id maps to, rebuilt on every theme change, counted by the DESIGN budget rule."
---

# ADR-0004: Charting library

**ID**: `cpt-frontx-dashboard-adr-charting-library`

<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Apache ECharts with `echarts/core`](#apache-echarts-with-echartscore)
  - [Chart.js with `react-chartjs-2`](#chartjs-with-react-chartjs-2)
  - [Recharts](#recharts)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

## Context and Problem Statement

The catalog chart widget types `cartesian_chart`, `pie_chart` and `heatmap` draw cartesian charts (bar, line, area, scatter), pie charts and heatmaps from the typed data the dashboard root passes through `render_widget` ([ADR-0009](0009-subject-agnostic-widget-catalog-v1.md)). A widget is a passive renderer: it renders the `render_widget {render, value_format?, data}` action, including its own empty state, and makes no requests. Which charting library should the catalog chart widgets use, and how do charts take the host's light or dark look?

The template has no theme of its own. Its only theme input is the host theme id, a shared property the dashboard root publishes, and every widget maps that id to the light or dark scope of `@gears-frontx/ui-kit` ([ADR-0006](0006-theme-distribution-v1.md)). Charts must take their colors and typography from the kit tokens of that scope.

FrontX isolates every widget instance: each evaluates its own copy of its code (FrontX ADR-0011). Every chart widget instance therefore evaluates its own copy of the charting library. For scale, the full Apache ECharts library is about 300 KB gzipped.

## Decision Drivers

* Charts must follow the ui-kit tokens of the light or dark scope the host theme id maps to, with no per-widget manual styling (`cpt-frontx-dashboard-nfr-visual-quality`).
* A chart option should be a JSON object, which fits a widget configured as data.
* The library must cover cartesian (including scatter), pie and heatmap without extra plugins.
* The library must take theme values built from ui-kit tokens in one place, and take them again when the host theme changes.
* Download and evaluation cost must be understood under per-instance isolation.
* Charts must meet the accessibility requirement (`cpt-frontx-dashboard-fr-accessibility`): a localized accessible name, a text alternative of the delivered values, and colour never the only signal.

## Considered Options

* Apache ECharts with `echarts/core`
* Chart.js with `react-chartjs-2`
* Recharts

## Decision Outcome

Chosen option: "Apache ECharts with `echarts/core`", because it covers cartesian (including scatter), pie and heatmap natively, takes a JSON option object, and applies one registered theme to every chart type, which keeps token-driven light and dark theming in one place.

**Chart theme.** Each chart widget instance maps the host theme id to the light or dark scope of ui-kit and builds the ECharts theme `frontx-dashboard` from the kit tokens of that scope: colors, typography, axes and tooltips. It registers that theme in its own ECharts copy, and builds and registers it again on every theme change, without any new request. The mapping effort is one theme builder that turns kit tokens into an ECharts theme for all chart types.

**Size and cost.** Chart widgets import only the chart types and components they need through `echarts/core`. ECharts is listed in the manifest's `shared` array, so it is a shared dependency. Under the counting rule of the DESIGN, the budget measures transferred gzipped bytes on a cold load of the reference dashboard. Each widget entry counts only its own code against the per-widget figure. Shared dependencies such as ECharts are counted once, in an uncapped page total: their source text is fetched once only when every template widget publishes the same `contentHash` for it (FrontX ADR-0034), with realm-wide reach (FrontX ADR-0035). That reuse does not lower the evaluation cost: each chart instance evaluates its own copy (FrontX ADR-0011), and that cost counts against the initial-render budget. The figures of the DESIGN are provisional and confirmed by measurement.

**Accessibility.** Each chart has a localized accessible name and a text alternative of the delivered values. Legends, tooltips and the heatmap's numeric scale name what each colour stands for, so colour is never the only signal (`cpt-frontx-dashboard-fr-accessibility`). The widget catalog states these rules per chart type.

### Consequences

* Good, because one ECharts theme carries the kit colors and typography to every chart type in both scopes.
* Good, because one JSON option object describes a chart, which suits a widget configured as data.
* Good, because one library covers all required chart types.
* Good, because a theme switch only rebuilds and re-registers the theme in each chart widget, with no request.
* Bad, because ECharts is large, and every chart instance evaluates it again.
* Bad, because the per-instance cost of a chart widget is confirmed by measurement only, so the figures it counts against are provisional.

### Confirmation

Confirmed by rendering each chart widget type in the light and the dark kit scope, by inspecting them against the ui-kit tokens, by switching the host theme and checking that every chart re-themes without a request, and by measuring the chart widget entries under the counting rule of the DESIGN: transferred gzipped bytes of each entry's own code, ECharts counted once in the page total, and per-instance evaluation within the initial-render budget.

## Pros and Cons of the Options

### Apache ECharts with `echarts/core`

A canvas-based library with a declarative option object, imported selectively.

* Good, because one registered theme object styles colors, typography, axes and tooltips for every chart type, so token mapping is done once.
* Good, because the option-as-JSON API suits charts described as data.
* Good, because it supports heatmap natively.
* Neutral, because selective `echarts/core` imports reduce size but not to the level of small libraries.
* Neutral, because for accessibility its canvas output needs the accessible name and text alternative the widget adds, and its legends, tooltips and visual map can name what each colour stands for.
* Bad, because it is large to evaluate per instance.

### Chart.js with `react-chartjs-2`

A smaller canvas library with a configuration object.

* Good, because it is smaller.
* Bad, because heatmaps need a third-party plugin.
* Bad, because theming is split between global defaults and per-dataset colors, so token mapping touches each chart type, and the heatmap plugin is styled separately.
* Neutral, because for accessibility its canvas output needs the same accessible name and text alternative the widget adds.

### Recharts

A React component library built on SVG.

* Good, because it is composed from React components.
* Good, because its SVG elements can take kit token values directly as styles.
* Bad, because styling is set per component, so token mapping repeats across each chart type.
* Bad, because the component model is less suited to charts described as data.
* Bad, because it has no native heatmap and renders slowly with many points.
* Neutral, because for accessibility its SVG output is in the DOM, but the widget still adds the accessible name and text alternative.

## More Information

* **Review trigger**: if the measured cost of a chart widget exceeds the per-widget figure or the initial-render budget of the DESIGN, whose figures are provisional and confirmed by measurement, reconsider Chart.js.
* **Isolation**: isolation is per instance, not a sandbox (FrontX ADR-0011).
* **Scope**: this decision covers the charting library and how charts build their theme from ui-kit tokens. It does not cover the budget figures (the DESIGN), how the host theme id reaches widgets (ADR-0006), the data shapes of the chart widget types ([ADR-0009](0009-subject-agnostic-widget-catalog-v1.md)), or the data grid ([ADR-0005](0005-data-grid-library-v1.md)).
* **Checklist applicability**: ARCH applicable; PERF applicable (download counted once as a shared dependency, evaluation per instance, and the `echarts/core` mitigation); SEC N/A; REL N/A; DATA N/A; INT applicable (host theme id from the shared property, ADR-0006, and ui-kit tokens); OPS N/A; MAINT applicable; TEST applicable; COMPL applicable (ECharts is Apache-2.0); UX applicable (token-driven visual quality in light and dark); BIZ N/A.
* Related decisions: FrontX ADR-0011 (instance isolation), FrontX ADR-0034 (shared dependency source-text reuse by content hash), FrontX ADR-0035 (realm-wide reach of that reuse). ADR-0006 decides how the theme reaches widgets.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements or design elements:

* `cpt-frontx-dashboard-nfr-visual-quality` — one ECharts theme built from ui-kit tokens applies the kit look to every chart type, in light and dark, with no per-widget styling.
* `cpt-frontx-dashboard-fr-theme` — chart styling follows the host theme id through the kit scope it maps to, and a theme switch re-themes every chart without a request.
* `cpt-frontx-dashboard-nfr-bundle-budget` — chart widget entries and the shared ECharts dependency are counted by the rule of the DESIGN.
* `cpt-frontx-dashboard-nfr-initial-render` — the per-instance evaluation cost of ECharts counts against the initial-render budget.
* `cpt-frontx-dashboard-fr-widget-catalog` — the chart widget types `cartesian_chart`, `pie_chart` and `heatmap` use this library.
