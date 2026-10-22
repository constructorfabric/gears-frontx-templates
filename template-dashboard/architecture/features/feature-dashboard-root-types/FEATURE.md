# Feature: Dashboard Root Types Catalog


<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Type-Catalog Feature — No Actor Flows](#type-catalog-feature--no-actor-flows)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Type-Catalog Feature — No Processes](#type-catalog-feature--no-processes)
- [4. States (CDSL)](#4-states-cdsl)
  - [Type-Catalog Feature — No State Machines](#type-catalog-feature--no-state-machines)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Type Catalog Definition of Done](#type-catalog-definition-of-done)
- [6. Type Catalog](#6-type-catalog)
  - [6.1 Dashboard](#61-dashboard)
  - [6.2 Theme](#62-theme)
- [7. Acceptance Criteria](#7-acceptance-criteria)

<!-- /toc -->

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-featstatus-dashboard-root-types`
## 1. Feature Context

- [ ] `p2` - `cpt-frontx-dashboard-feature-dashboard-root-types`

### 1.1 Overview

This is a **type-catalog feature**, not an actor-flow feature. It declares the trimmed Dashboard root and the Theme type. The FEATURE template's flow, process, and state sections are reduced to stubs; the catalog lives in section 6, Type Catalog.

### 1.2 Purpose

Concrete catalog of the dashboard root types of DESIGN section 3.1 (Dashboard root, trimmed, and Theme). Delta against the prototype: `report` is removed and `dashboard` is trimmed to `name`, `description`, `theme`, `layout`, `data_start`, and `data_end`; `theme` is unchanged apart from the sentence that referred to the removed report. Instances come from GTS content packages (DESIGN section 3.1, Instance source).

**Declaring package**: `dashboard-viewer`.

**Requirements**: `cpt-frontx-dashboard-fr-type-catalog`, `cpt-frontx-dashboard-fr-theme`, `cpt-frontx-dashboard-fr-time-window-reload`

**Principles**: `cpt-frontx-dashboard-principle-gts-contracts`

### 1.3 Actors

N/A — type-catalog feature. The catalog is consumed by the runtime type system (Viewer host, Worker, and widget MFEs), not by an end-user actor. No human actor flows are authored.

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md#31-domain-model)
- **Dependencies**: `feature-layout-types` (the Dashboard references `gts.frontx.m.layout.layout.v1~`). Dependency graph: dashboard-root-types depends on layout-types; Theme has no dependency.

## 2. Actor Flows (CDSL)

### Type-Catalog Feature — No Actor Flows

N/A — type-catalog feature. Catalog content is consumed at runtime by the type system, not by an actor flow. The full catalog lives in section 6, Type Catalog.

## 3. Processes / Business Logic (CDSL)

### Type-Catalog Feature — No Processes

N/A — type-catalog feature. The catalog declares static GTS schemas; runtime validation and execution logic lives in the Viewer host and Worker bundles of `dashboard-viewer`, not in this catalog file.

## 4. States (CDSL)

### Type-Catalog Feature — No State Machines

N/A — type-catalog feature. Type declarations are stateless.

## 5. Definitions of Done

### Type Catalog Definition of Done

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-dod-dashboard-root-types-catalog-complete`

The system **MUST** declare `gts.frontx.m.dashboard.dashboard.v1~` with only the six trimmed fields and `gts.frontx.m.dashboard.theme.v1~` in `dashboard-viewer`, and **MUST NOT** declare a report type.

- Every concrete is authored with a full JSON Schema declaration.
- Every identifier follows the GTS identifier grammar and the ID-form convention of DESIGN section 3.1 (types end with `~`, instances do not).
- Every `x-gts-ref` and `$ref` resolves to a declared type.
- The dropped prototype fields (`visibility`, `short_link_token`, `publication_state`, `enabled_state`, `audience`) and the report type are not reintroduced.

**Constraints**: `cpt-frontx-dashboard-constraint-gts-id-convention`

## 6. Type Catalog

### 6.1 Dashboard

**GTS ID**: `gts.frontx.m.dashboard.dashboard.v1~`

**Description**: Trimmed top-level container of a dashboard: name, description, the theme and layout it references, and the default time window. Dashboard instances come from GTS content packages (the demo package or a consumer instance package), not from a backend. The prototype's visibility, short link, publication, enablement, and audience fields are dropped; a consumer may derive a subtype that adds them.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.m.dashboard.dashboard.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Dashboard",
  "description": "Trimmed top-level container defining a named dashboard with a theme, a layout, and a default data time window.",
  "type": "object",
  "required": ["name", "theme", "layout"],
  "properties": {
    "name": {
      "type": "string",
      "description": "Human-readable dashboard name."
    },
    "description": {
      "type": "string",
      "description": "Optional longer description of the dashboard purpose."
    },
    "data_start": {
      "type": "string",
      "description": "Relative time expression (e.g., '-90d', '-1y', 'now'). Seeds the default time window."
    },
    "data_end": {
      "type": "string",
      "description": "Relative time expression (e.g., '-90d', '-1y', 'now'). Seeds the default time window."
    },
    "theme": {
      "type": "string",
      "description": "Reference to the theme applied to this dashboard.",
      "x-gts-ref": "gts.frontx.m.dashboard.theme.v1~"
    },
    "layout": {
      "type": "string",
      "description": "Reference to the Layout applied to this dashboard.",
      "x-gts-ref": "gts.frontx.m.layout.layout.v1~"
    }
  }
}
```

**Cross-references**:
- No abstract base (flat single-segment chain).
- Related types: `gts.frontx.m.dashboard.theme.v1~`, `gts.frontx.m.layout.layout.v1~` (`feature-layout-types`)
- The prototype's `report` type is not ported; the Worker is fed by `EntitySource`, not by a report payload.

### 6.2 Theme

**GTS ID**: `gts.frontx.m.dashboard.theme.v1~`

**Description**: Design system theme configuration. Defines all visual styling applied to dashboard widgets — light/dark palettes, typography, chart-type defaults, spacing.

**Schema**:

```json
{
  "$id": "gts.frontx.m.dashboard.theme.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "description": "Design system theme configuration. Defines all visual styling applied to dashboard widgets. Dashboards reference one theme; the theme produces ECharts theme JSON for chart widgets and shadcn CSS variables for UI components. Widget schemas contain only semantic properties — all styling comes from the theme. Both palettes are carried by the theme instance. The active mode follows the host: the Viewer host maps the host theme id to light or dark through its theme-mode map and supplies the matching palette.",
  "type": "object",
  "required": ["light_palette", "dark_palette", "typography", "chart_defaults"],
  "properties": {
    "light_palette": {
      "type": "object",
      "description": "Color palette for light mode. Used to derive ECharts theme colors and shadcn CSS variables in light mode.",
      "properties": {
"primary": { "type": "string", "description": "Primary brand color (HSL or hex)." },
"secondary": { "type": "string" },
"accent": { "type": "string" },
"background": { "type": "string" },
"foreground": { "type": "string" },
"muted": { "type": "string" },
"destructive": { "type": "string" },
"chart_categorical": {
  "type": "array",
  "items": { "type": "string" },
  "description": "Ordered color palette for categorical chart series."
},
"chart_sequential": {
  "type": "array",
  "items": { "type": "string" },
  "description": "Color ramp for sequential/heatmap data."
}
      }
    },
    "dark_palette": {
      "type": "object",
      "description": "Color palette for dark mode. Used to derive ECharts theme colors and shadcn CSS variables in dark mode.",
      "properties": {
"primary": { "type": "string", "description": "Primary brand color (HSL or hex)." },
"secondary": { "type": "string" },
"accent": { "type": "string" },
"background": { "type": "string" },
"foreground": { "type": "string" },
"muted": { "type": "string" },
"destructive": { "type": "string" },
"chart_categorical": {
  "type": "array",
  "items": { "type": "string" },
  "description": "Ordered color palette for categorical chart series."
},
"chart_sequential": {
  "type": "array",
  "items": { "type": "string" },
  "description": "Color ramp for sequential/heatmap data."
}
      }
    },
    "typography": {
      "type": "object",
      "properties": {
"font_family": { "type": "string" },
"title_size": { "type": "integer", "description": "Font size in px for widget titles." },
"label_size": { "type": "integer", "description": "Font size in px for axis labels and legends." },
"value_size": { "type": "integer", "description": "Font size in px for KPI card values." }
      }
    },
    "chart_defaults": {
      "type": "object",
      "description": "Per-chart-type visual defaults applied via ECharts registerTheme(). Controls properties that are styling concerns, not semantic widget configuration.",
      "properties": {
"bar_width": { "type": ["integer", "null"] },
"line_smooth": { "type": "boolean" },
"area_opacity": { "type": "number", "minimum": 0, "maximum": 1 },
"scatter_symbol_size": { "type": "integer" },
"scatter_symbol_shape": { "type": "string", "enum": ["circle", "rect", "triangle"] },
"pie_label_position": { "type": "string", "enum": ["inside", "outside", "center"] },
"animation_enabled": { "type": "boolean" },
"animation_duration_ms": { "type": "integer" }
      }
    },
    "spacing": {
      "type": "object",
      "properties": {
"widget_padding": { "type": "integer", "description": "Inner padding in px for widget containers." },
"grid_gap": { "type": "integer", "description": "Gap in px between layout cells." }
      }
    }
  }
}
```

**Cross-references**:
- No abstract base (flat single-segment chain).

## 7. Acceptance Criteria

- [ ] Every concrete listed in this catalog is authored with its full schema
- [ ] Every concrete passes GTS identifier grammar and `x-gts-ref` validation
- [ ] Every type identifier ends with `~`, every instance identifier does not, and every identifier carries `v1`
- [ ] `cfs validate --artifact` on this file reports PASS
- [ ] The Dashboard schema requires `name`, `theme`, and `layout`, and declares no `report`, `visibility`, `short_link_token`, `publication_state`, `enabled_state`, or `audience` field
