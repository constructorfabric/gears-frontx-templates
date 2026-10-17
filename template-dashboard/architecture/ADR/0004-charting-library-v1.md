---
status: accepted
date: 2026-10-05
decision-makers: template-dashboard architecture maintainers
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
  - [Apache ECharts with echarts-for-react](#apache-echarts-with-echarts-for-react)
  - [Chart.js with react-chartjs-2](#chartjs-with-react-chartjs-2)
  - [Recharts](#recharts)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

## Context and Problem Statement

Chart widgets must draw cartesian charts (bar, line, area, scatter), pie charts, and heatmaps from a JSON-friendly description. Which charting library should they use, and how does it receive the dashboard theme?

The earlier DevExpert prototype chose Apache ECharts through the echarts-for-react wrapper. It assumed Module Federation would share the library between widgets, which held the widget bundle under 100 KB gzipped. Its size anchor for ECharts itself was about 300 KB minified and gzipped. In FrontX each MFE load gets its own module graph, so MFE instances share no singletons (FrontX ADR-0011), and that assumption no longer holds.

## Decision Drivers

* Charts must follow the host design-system tokens in the light and the dark theme, with no per-widget manual styling (`cpt-frontx-dashboard-nfr-visual-quality`).
* Chart descriptions should be a JSON option object, which fits data-driven dashboards.
* The library must cover cartesian charts, pie, and heatmap without extra plugins.
* The library must accept theme values from the dashboard theme.
* Bundle cost must be understood under per-instance isolation.

## Considered Options

* Apache ECharts with echarts-for-react
* Chart.js with react-chartjs-2
* Recharts

## Decision Outcome

Chosen option: "Apache ECharts with echarts-for-react", because it covers cartesian, pie, and heatmap charts natively, takes a JSON option object, and maps the dashboard theme to every chart kind through one theme object, which keeps token-driven light and dark theming in one place.

Chart theme values come from the dashboard's theme instance, an instance of the type `gts.frontx.m.dashboard.theme.v1~` (ADR-0008). Light or dark mode follows the host theme mode, and the theme instance supplies the palette for that mode. Each chart widget registers its own ECharts theme from the theme shared property. The Viewer host does not register ECharts themes, because under isolation each widget has its own ECharts module. The mapping effort is one theme builder that turns the palette and typography of the theme instance into an ECharts theme for all chart kinds.

Under per-instance isolation, each chart MFE instance evaluates its own copy of ECharts, so the size anchor from the Context (about 300 KB minified and gzipped for the full library) is paid per instance. Two mitigations apply. Chart widgets import only the chart types and components they need through `echarts/core`. FrontX ADR-0034 reuses the source text of a shared dependency when its content hash matches, which reduces network fetches but does not share the evaluated module. The bundle budget for chart widgets is an open question and is resolved in the DESIGN, after measurement.

### Consequences

* Good, because one ECharts theme carries the design-system palette and typography to every chart kind in both modes.
* Good, because one JSON option object describes a chart, which suits dashboards defined as data.
* Good, because one library covers all required chart kinds.
* Bad, because ECharts is large, and every chart MFE instance evaluates it again.
* Bad, because the earlier budgets may not hold, and the new figures are not yet known.
* Bad, because echarts-for-react is a small community wrapper maintained outside the Apache ECharts project, so it may fall behind ECharts or React releases. Fallback: the chart widget calls ECharts directly (initialize, set the option, dispose) inside its own component, and widget configuration is not affected because the library already sits behind the widget's typed props.

### Confirmation

Confirmed by rendering sample charts of each supported kind in the light and the dark theme, by inspecting them against the design-system tokens, and by measuring chart MFE size and memory per instance for the DESIGN budget (`cpt-frontx-dashboard-nfr-bundle-budget`).

## Pros and Cons of the Options

### Apache ECharts with echarts-for-react

A canvas-based library with a declarative option object, wrapped for React.

* Good, because one registered theme object styles palette, typography, axes, and tooltips for every chart kind, so token mapping is done once.
* Good, because the option-as-JSON API suits stored chart descriptions.
* Good, because it supports heatmap natively.
* Neutral, because selective `echarts/core` imports reduce size but not to the level of small libraries.
* Bad, because it is large under per-instance loading.

### Chart.js with react-chartjs-2

A smaller canvas library with a configuration object.

* Good, because it has a smaller bundle.
* Bad, because heatmaps need a third-party plugin.
* Bad, because theming is split between global defaults and per-dataset colors, so token mapping touches each chart kind, and the heatmap plugin is styled separately.

### Recharts

A React component library built on SVG.

* Good, because it is composed from React components.
* Good, because its SVG elements can take the projected CSS variables of the theme directly.
* Bad, because styling is set per component, so token mapping repeats across each chart kind.
* Bad, because the component model is less suited to charts described as data.
* Bad, because it has no native heatmap and renders slowly with many points.

## More Information

* **Review trigger**: if the measured per-instance cost of a chart widget exceeds the budget set in the DESIGN, reconsider Chart.js.
* **Scope**: this decision covers the charting library, its React wrapper, and how charts take the dashboard theme. It does not cover the bundle budget figures (DESIGN), theme distribution (ADR-0008), or the data grid (ADR-0005).
* **Checklist applicability**: ARCH applicable (library choice for all chart widgets); PERF applicable (per-instance library cost and its mitigations); SEC N/A (charts render data already loaded by the Data Query Worker and add no trust boundary); REL N/A (no failure mode beyond the widget's own loading and error states); DATA N/A (chart options are built from existing widget data); INT applicable (theme shared property from ADR-0008); OPS N/A (no deployment or operational change); MAINT applicable (wrapper maintenance risk and the direct-ECharts fallback); TEST applicable (rendering in both themes and size measurement); COMPL applicable (ECharts is Apache-2.0 and echarts-for-react is MIT, both compatible with the template); UX applicable (token-driven visual quality in light and dark); BIZ N/A (no business trade-off beyond the bundle cost).
* Related decisions: FrontX ADR-0011 (each MFE load gets its own module graph) and FrontX ADR-0034 (shared dependency source-text reuse by content hash).
* ADR-0001 explains the isolation model that causes the bundle consequence. ADR-0008 decides how the theme reaches widgets.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements or design elements:

* `cpt-frontx-dashboard-nfr-visual-quality` — one ECharts theme built from the theme instance applies the design-system tokens to every chart kind, in light and dark, with no per-widget styling.
* `cpt-frontx-dashboard-fr-theme` — chart styling comes from the dashboard's theme instance, delivered through the theme shared property (ADR-0008).
* `cpt-frontx-dashboard-nfr-bundle-budget` — the isolation cost is recorded and the budget is set in the DESIGN.
* `cpt-frontx-dashboard-fr-widget-catalog` — chart widget kinds use this library.
