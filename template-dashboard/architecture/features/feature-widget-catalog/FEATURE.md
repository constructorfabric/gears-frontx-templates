# Feature: Widget Catalog


<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Type-Catalog Feature: No Actor Flows](#type-catalog-feature-no-actor-flows)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Type-Catalog Feature: No Processes](#type-catalog-feature-no-processes)
- [4. States (CDSL)](#4-states-cdsl)
  - [Type-Catalog Feature: No State Machines](#type-catalog-feature-no-state-machines)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Type Catalog Definition of Done](#type-catalog-definition-of-done)
- [6. Type Catalog](#6-type-catalog)
  - [6.0 Widget (abstract base)](#60-widget-abstract-base)
  - [6.1 SummaryCard](#61-summarycard)
  - [6.2 MetricCard](#62-metriccard)
  - [6.3 RankedListCard](#63-rankedlistcard)
  - [6.4 ProgressListCard](#64-progresslistcard)
  - [6.5 Grid](#65-grid)
  - [6.6 CartesianChart](#66-cartesianchart)
  - [6.7 PieChart](#67-piechart)
  - [6.8 Heatmap](#68-heatmap)
  - [6.9 MarkdownCard](#69-markdowncard)
  - [6.10 CodeDiff](#610-codediff)
  - [6.11 ThreadList](#611-threadlist)
  - [6.12 EventTimeline](#612-eventtimeline)
  - [6.13 MetadataStrip](#613-metadatastrip)
- [7. Acceptance Criteria](#7-acceptance-criteria)

<!-- /toc -->

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-featstatus-widget-catalog`
## 1. Feature Context

- [ ] `p2` - `cpt-frontx-dashboard-feature-widget-catalog`

### 1.1 Overview

This feature is a **type-catalog feature**, not an actor-flow feature, declared in package `dashboard-viewer`. It enumerates the Widget base and the 13 concrete widget kinds `gts.frontx.m.widget.widget.v1~frontx.m.widget.<kind>.v1~`. Its structural prose lives in DESIGN section 3.1; the content lives in section 6 Type Catalog. The sections for flows, processes, and states are reduced to short not-applicable notes. The catalog is ported one-to-one from the prototype, rebased to the FrontX vendor (`gts.de.*` to `gts.frontx.*`).

### 1.2 Purpose

Concrete catalog of the widget kinds the Viewer host recognises at runtime, each with its full GTS-typed JSON Schema, plus the Widget base with `title`, `query`, and the optional drill-down declaration (target surface and a static list of target widget instances). It addresses the widget library and the type catalog of the PRD and the Widget entity of DESIGN section 3.1. Six kinds have no demo coverage (see section 6).

**Requirements**: `cpt-frontx-dashboard-fr-widget-catalog`, `cpt-frontx-dashboard-fr-type-catalog`, `cpt-frontx-dashboard-fr-grid-presentation`, `cpt-frontx-dashboard-fr-drilldown-panel`, `cpt-frontx-dashboard-fr-drilldown-modal`

**Principles**: `cpt-frontx-dashboard-principle-gts-contracts`, `cpt-frontx-dashboard-principle-per-instance-isolation`

### 1.3 Actors

N/A. This is a type-catalog feature. The catalog is consumed by the runtime type system (the Viewer host, the Data Query Worker, and the widget MFEs), not by an end-user actor, so no actor flows are authored.

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md) section 3.1 (Domain Model)
- **ADRs**: [ADR-0004](../../ADR/0004-charting-library-v1.md), [ADR-0005](../../ADR/0005-data-grid-library-v1.md), [ADR-0011](../../ADR/0011-widget-kind-and-mfe-realization-v1.md), [ADR-0012](../../ADR/0012-subject-agnostic-widget-catalog-v1.md)
- **Declaring package**: `dashboard-viewer` (`src-app/mfe_packages/dashboard-viewer/`)
- **Dependencies**: [feature-widget-data-catalog](../feature-widget-data-catalog/FEATURE.md) (each widget kind consumes a paired widget data shape); [feature-renderer-catalog](../feature-renderer-catalog/FEATURE.md) (grid columns name a renderer). Consumed by the layout and extension-domain features, which embed widget instances and realize kinds through `realizes:`.

## 2. Actor Flows (CDSL)

### Type-Catalog Feature: No Actor Flows

N/A. Type catalog content is consumed at runtime by the type system, not by an actor flow. The catalog lives in section 6.

## 3. Processes / Business Logic (CDSL)

### Type-Catalog Feature: No Processes

N/A. The catalog declares static GTS schemas. Runtime validation logic lives in the Viewer host, the Worker, and the widget MFE bundles, not in this catalog.

## 4. States (CDSL)

### Type-Catalog Feature: No State Machines

N/A. Type declarations are stateless.

## 5. Definitions of Done

### Type Catalog Definition of Done

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-dod-widget-catalog-catalog-complete`

The system **MUST** author every concrete type of this catalog, ported one-to-one from the prototype and rebased to the FrontX vendor.

- Every concrete passes GTS identifier grammar and `x-gts-ref` validation.
- Every concrete keeps its prototype schema; only the vendor, namespace, and version form are rebased.
- The Widget base declares the optional `drilldown` field with a target surface (`detail_panel` or `modal`) and a static list of target widget instances.
- The six kinds without demo queries are marked "no demo coverage".

## 6. Type Catalog

Demo coverage of the 13 kinds (PRD section 6.3): `summary_card`, `ranked_list_card`, `progress_list_card`, `grid`, `cartesian_chart`, `pie_chart`, and `heatmap` have demo queries. The six kinds `metric_card`, `markdown_card`, `code_diff`, `thread_list`, `event_timeline`, and `metadata_strip` are marked **no demo coverage**.

**Open questions**:

- Drill-down shape (DESIGN open item, working assumption kept): `drilldown.widgets` is a static declared list of widget instances, and the widgets mounted for a clicked item are a subset of that list. Confirm or revise: whether the per-item subset is chosen by the source widget at click time or declared per item, whether `widgets` holds inline instances or references to instances, and the ordering rule that fixes the widget position used in the identifier form (the `extension-domain` feature owns the identifier form).

### 6.0 Widget (abstract base)

**GTS ID**: `gts.frontx.m.widget.widget.v1~`

**Description**: Abstract base type for every subject-agnostic rendering-primitive widget kind. Declares the placement-configuration fields shared by every kind: `title`, `query`, and the optional `drilldown` declaration. Never instantiated directly; every concrete widget kind derives from this base.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.m.widget.widget.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Widget",
  "description": "Abstract base type for every subject-agnostic rendering-primitive widget kind. Declares the placement-configuration fields shared by every kind: the display title, the query binding, and the optional drill-down declaration. The query binding resolves to a Query instance whose output Widget Data shape matches the paired widget-data type.",
  "type": "object",
  "required": ["title", "query"],
  "properties": {
    "title": {
      "type": "string",
      "description": "Display title rendered in the widget header."
    },
    "query": {
      "type": "string",
      "description": "GTS ID of the Query instance whose Widget Data this widget consumes. Resolved by the Viewer host at mount; the Viewer host delivers the Widget Data via the `set_data` host action (a template host action declared as `gts.frontx.mfes.comm.action.v1~frontx.v.mfe.set_data.v1~` in the `extension-domain` feature).",
      "x-gts-ref": "gts.frontx.v.query.query.v1~"
    },
    "drilldown": {
      "type": "object",
      "description": "Optional drill-down declaration. A widget without it offers no drill-down. Names one target surface and a static list of target widget instances; the Viewer host derives the detail-panel extensions it registers and the modal widget union it sends at drill-down open from these declarations.",
      "required": ["surface", "widgets"],
      "properties": {
        "surface": {
          "type": "string",
          "enum": ["detail_panel", "modal"],
          "description": "Target surface of the drill-down: the Viewer host detail panel or the template modal container."
        },
        "widgets": {
          "type": "array",
          "minItems": 1,
          "description": "Static declared list of target widget instances, each a complete inline widget instance of one concrete kind. The widgets a single clicked item mounts are a subset of this list. For a modal drill-down this list is the source of the union of widgets any peer of the origin can show.",
          "items": { "oneOf": [{ "$ref": "gts://gts.frontx.m.widget.widget.v1~frontx.m.widget.summary_card.v1~" }, { "$ref": "gts://gts.frontx.m.widget.widget.v1~frontx.m.widget.metric_card.v1~" }, { "$ref": "gts://gts.frontx.m.widget.widget.v1~frontx.m.widget.ranked_list_card.v1~" }, { "$ref": "gts://gts.frontx.m.widget.widget.v1~frontx.m.widget.progress_list_card.v1~" }, { "$ref": "gts://gts.frontx.m.widget.widget.v1~frontx.m.widget.grid.v1~" }, { "$ref": "gts://gts.frontx.m.widget.widget.v1~frontx.m.widget.cartesian_chart.v1~" }, { "$ref": "gts://gts.frontx.m.widget.widget.v1~frontx.m.widget.pie_chart.v1~" }, { "$ref": "gts://gts.frontx.m.widget.widget.v1~frontx.m.widget.heatmap.v1~" }, { "$ref": "gts://gts.frontx.m.widget.widget.v1~frontx.m.widget.markdown_card.v1~" }, { "$ref": "gts://gts.frontx.m.widget.widget.v1~frontx.m.widget.code_diff.v1~" }, { "$ref": "gts://gts.frontx.m.widget.widget.v1~frontx.m.widget.thread_list.v1~" }, { "$ref": "gts://gts.frontx.m.widget.widget.v1~frontx.m.widget.event_timeline.v1~" }, { "$ref": "gts://gts.frontx.m.widget.widget.v1~frontx.m.widget.metadata_strip.v1~" }] }
        }
      }
    }
  }
}
```

**Cross-references**:
- Concrete widget kinds extend this base via `allOf` `$ref` to `gts://gts.frontx.m.widget.widget.v1~`; see entries below.
- Conceptual definition: DESIGN section 3.1 (Core Entities and Abstract Bases).
- Drill-down: `drilldown.widgets` items are widget instances of any concrete kind in this catalog; `drilldown` is a Widget-base field, so every kind below inherits it.

### 6.1 SummaryCard

**GTS ID**: `gts.frontx.m.widget.widget.v1~frontx.m.widget.summary_card.v1~`

**Description**: Subject-agnostic rendering primitive: a card with a title and an ordered list of label/value rows.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.m.widget.widget.v1~frontx.m.widget.summary_card.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "SummaryCard",
  "description": "Subject-agnostic rendering primitive: a card with a title and an ordered list of label/value rows, each row optionally formatted and optionally tagged with a trend indicator. Consumes Widget Data of shape gts.frontx.v.widget_data.summary_card.v1~. Subject specificity (PR status counts, contributors summary, LOC summary, ...) is supplied by the bound Query, not by the widget kind.",
  "allOf": [
    { "$ref": "gts://gts.frontx.m.widget.widget.v1~" },
    {
      "type": "object",
      "properties": {
"row_order": {
  "type": "array",
  "items": { "type": "string" },
  "description": "Ordered list of row keys; the renderer renders rows in this order. Each key MUST be present in the Widget Data row set."
},
"row_labels": {
  "type": "object",
  "additionalProperties": { "type": "string" },
  "description": "Per-row presentation label keyed by row key. Independent of the Query's row keys so the same Query can drive different label sets across placements."
}
      }
    }
  ]
}
```

**Cross-references**:
- Abstract base: `gts.frontx.m.widget.widget.v1~` declared in §6.0 above.
- Related types: Paired Widget Data: `gts.frontx.v.widget_data.summary_card.v1~` (in feature-widget-data-catalog)

### 6.2 MetricCard

**GTS ID**: `gts.frontx.m.widget.widget.v1~frontx.m.widget.metric_card.v1~`

**Description**: Subject-agnostic rendering primitive: a card with a single headline value, optional trend, optional sparkline.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.m.widget.widget.v1~frontx.m.widget.metric_card.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "MetricCard",
  "description": "Subject-agnostic rendering primitive: a card displaying a single headline value with optional formatting hint, optional trend indicator, and optional inline sparkline series. Consumes Widget Data of shape gts.frontx.v.widget_data.metric_card.v1~.",
  "allOf": [
    { "$ref": "gts://gts.frontx.m.widget.widget.v1~" },
    {
      "type": "object",
      "properties": {
"value_label": {
  "type": "string",
  "description": "Caption rendered next to the headline value (e.g., 'PRs merged', 'LOC delta')."
},
"format": {
  "type": "string",
  "description": "Number-format hint passed to the renderer (e.g., 'integer', 'percent_1', 'compact_loc')."
},
"show_trend": {
  "type": "boolean",
  "description": "Whether to render the optional trend indicator from the Widget Data."
},
"show_sparkline": {
  "type": "boolean",
  "description": "Whether to render the optional sparkline series from the Widget Data."
}
      }
    }
  ]
}
```

**Cross-references**:
- Abstract base: `gts.frontx.m.widget.widget.v1~` declared in §6.0 above.
- Related types: Paired Widget Data: `gts.frontx.v.widget_data.metric_card.v1~` (in feature-widget-data-catalog)
- Demo coverage: none. No demo query targets `metric_card`; the kind exists in the widget library but the demo dashboard does not show it (PRD section 6.3).

### 6.3 RankedListCard

**GTS ID**: `gts.frontx.m.widget.widget.v1~frontx.m.widget.ranked_list_card.v1~`

**Description**: Subject-agnostic rendering primitive: a card showing a ranked list of items (rank + label + value).

**Schema**:

```json
{
  "$id": "gts://gts.frontx.m.widget.widget.v1~frontx.m.widget.ranked_list_card.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "RankedListCard",
  "description": "Subject-agnostic rendering primitive: a card showing a ranked list of items (rank + label + value, optional secondary value). Consumes Widget Data of shape gts.frontx.v.widget_data.ranked_list_card.v1~.",
  "allOf": [
    { "$ref": "gts://gts.frontx.m.widget.widget.v1~" },
    {
      "type": "object",
      "properties": {
"max_items": {
  "type": "integer",
  "description": "Cap on the number of ranked items rendered; the Widget Data may contain more, the renderer truncates."
},
"value_label": {
  "type": "string",
  "description": "Header label for the primary value column."
},
"secondary_label": {
  "type": "string",
  "description": "Header label for the optional secondary value column (omitted when secondary is unused)."
}
      }
    }
  ]
}
```

**Cross-references**:
- Abstract base: `gts.frontx.m.widget.widget.v1~` declared in §6.0 above.
- Related types: Paired Widget Data: `gts.frontx.v.widget_data.ranked_list_card.v1~` (in feature-widget-data-catalog)

### 6.4 ProgressListCard

**GTS ID**: `gts.frontx.m.widget.widget.v1~frontx.m.widget.progress_list_card.v1~`

**Description**: Subject-agnostic rendering primitive: a card showing a list of items with progress bars (current vs target).

**Schema**:

```json
{
  "$id": "gts://gts.frontx.m.widget.widget.v1~frontx.m.widget.progress_list_card.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "ProgressListCard",
  "description": "Subject-agnostic rendering primitive: a card showing a list of items with progress bars (current vs target, optional unit). Consumes Widget Data of shape gts.frontx.v.widget_data.progress_list_card.v1~.",
  "allOf": [
    { "$ref": "gts://gts.frontx.m.widget.widget.v1~" },
    {
      "type": "object",
      "properties": {
"show_percentage": {
  "type": "boolean",
  "description": "Whether to render the percent-of-target value alongside each bar."
},
"color_scheme": {
  "type": "string",
  "description": "Theme-driven color palette applied to the progress bars."
}
      }
    }
  ]
}
```

**Cross-references**:
- Abstract base: `gts.frontx.m.widget.widget.v1~` declared in §6.0 above.
- Related types: Paired Widget Data: `gts.frontx.v.widget_data.progress_list_card.v1~` (in feature-widget-data-catalog)

### 6.5 Grid

**GTS ID**: `gts.frontx.m.widget.widget.v1~frontx.m.widget.grid.v1~`

**Description**: Subject-agnostic rendering primitive: a tabular grid (TanStack-Table) over an arbitrary row schema.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.m.widget.widget.v1~frontx.m.widget.grid.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Grid",
  "description": "Subject-agnostic rendering primitive: a tabular grid (TanStack-Table) over an arbitrary row schema declared by the Widget Data. Consumes Widget Data of shape gts.frontx.v.widget_data.grid.v1~. Subject specificity (PR rows, contributor rows, action items, ...) is supplied by the bound Query.",
  "allOf": [
    { "$ref": "gts://gts.frontx.m.widget.widget.v1~" },
    {
      "type": "object",
      "required": ["columns"],
      "properties": {
"columns": {
  "type": "array",
  "description": "Ordered presentation column descriptors. Each column references a Widget Data column key and adds presentation-only attributes (label, width, align, renderer).",
  "items": {
    "type": "object",
    "required": ["key", "label"],
    "properties": {
      "key": { "type": "string", "description": "Column key — MUST match a key declared in the Widget Data columns." },
      "label": { "type": "string", "description": "Header label rendered for this column." },
      "width": { "type": "string", "description": "Optional CSS width hint (e.g., '120px', '1fr')." },
      "align": { "type": "string", "enum": ["left", "right", "center"], "description": "Text alignment for the column body." },
      "renderer": { "type": "string", "description": "Cell renderer GTS ID; MUST be one of the standalone single-segment cell-renderer types in `gts.frontx.m.renderer.*` (link, badge, avatar, progress, sparkline, markdown, code_diff, conditional_badge, humanized_age). Per the subject-agnostic widget catalog convention, cell renderer types do not derive from a common base — each is a flat single-segment chain authored in `feature-renderer-catalog` under `gts.frontx.m.renderer.*`. Config-time validation via `cfs list-ids` constrains each value to a registered renderer ID.", "x-gts-ref": "gts.*" }
    }
  }
},
"default_sort": {
  "type": "object",
  "description": "Default sort applied at mount.",
  "properties": {
    "column_key": { "type": "string" },
    "direction": { "type": "string", "enum": ["asc", "desc"] }
  }
},
"page_size": {
  "type": "integer",
  "description": "Default page size for grid pagination."
},
"frozen_columns": {
  "type": "integer",
  "minimum": 0,
  "description": "Number of leading columns frozen against horizontal scroll. 0 means no columns are frozen."
},
"column_groups": {
  "type": "array",
  "description": "Ordered groups stacking a header label above contiguous columns. Each group references existing column keys declared in columns[].",
  "items": {
    "type": "object",
    "required": ["label", "column_keys"],
    "properties": {
      "label": { "type": "string", "description": "Group header label rendered above the contiguous columns." },
      "column_keys": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Keys of columns participating in this group; each key must match a key declared in columns[]."
      }
    }
  }
},
"row_color_by_field": {
  "type": "object",
  "required": ["field", "palette"],
  "description": "Tints each row by the value of a Widget Data field, looked up against a named palette family.",
  "properties": {
    "field": { "type": "string", "description": "Widget Data field whose value selects the row tint." },
    "palette": { "type": "string", "enum": ["severity", "status", "generic"], "description": "Palette family used to resolve the row tint colour." }
  }
}
      }
    }
  ]
}
```

**Cross-references**:
- Abstract base: `gts.frontx.m.widget.widget.v1~` declared in §6.0 above.
- Related types: Paired Widget Data: `gts.frontx.v.widget_data.grid.v1~` (in feature-widget-data-catalog)
- Source: `cpt-frontx-dashboard-fr-grid-presentation` (PRD §5.3 — frozen columns, grouped column headers, and row background coloring driven by a row-level classifier on the predefined grid widget kinds) anchors `frozen_columns`, `column_groups`, and `row_color_by_field`.

### 6.6 CartesianChart

**GTS ID**: `gts.frontx.m.widget.widget.v1~frontx.m.widget.cartesian_chart.v1~`

**Description**: Subject-agnostic Cartesian rendering primitive (Apache ECharts). Per-series rendering type (bar | line | area | scatter) carried by Widget Data via series[].type.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.m.widget.widget.v1~frontx.m.widget.cartesian_chart.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "CartesianChart",
  "description": "Subject-agnostic Cartesian rendering primitive (Apache ECharts). Per-series rendering type (bar | line | area | scatter) is carried by the Widget Data via series[].type; this widget kind contains no per-chart series-type discriminator. Consumes Widget Data of shape gts.frontx.v.widget_data.cartesian_chart.v1~.",
  "allOf": [
    { "$ref": "gts://gts.frontx.m.widget.widget.v1~" },
    {
      "type": "object",
      "required": ["x_axis", "y_axis"],
      "properties": {
"x_axis": {
  "type": "object",
  "description": "Primary x-axis configuration.",
  "properties": {
    "type": { "type": "string", "enum": ["category", "value", "time"] },
    "label": { "type": "string" },
    "format": { "type": "string", "description": "Format hint passed to the renderer (e.g., 'date_short', 'number_compact')." }
  }
},
"y_axis": {
  "type": "object",
  "description": "Primary y-axis configuration.",
  "properties": {
    "type": { "type": "string", "enum": ["value", "log"] },
    "label": { "type": "string" },
    "format": { "type": "string" }
  }
},
"y_axis_secondary": {
  "type": "object",
  "description": "Optional secondary y-axis configuration. When present, Widget Data series MAY set series[].y_axis_index = 1 to bind to this axis.",
  "properties": {
    "type": { "type": "string", "enum": ["value", "log"] },
    "label": { "type": "string" },
    "format": { "type": "string" }
  }
},
"legend": {
  "type": "object",
  "description": "Legend presentation configuration.",
  "properties": {
    "visible": { "type": "boolean" },
    "position": { "type": "string", "enum": ["top", "right", "bottom", "left"] }
  }
},
"show_tooltip": { "type": "boolean" },
"series_overrides": {
  "type": "object",
  "description": "Per-series presentation overrides keyed by series name. Each override applies on top of Widget Data values for that series. Series whose name is not present here render with theme defaults.",
  "additionalProperties": {
    "type": "object",
    "properties": {
      "color": { "type": "string", "description": "Theme-resolvable color override for the series." },
      "label": { "type": "string", "description": "Display label override for the series (replaces Widget Data series[].name in legend / tooltip)." },
      "stack_group": { "type": "string", "description": "Stack-group identifier; series sharing a stack_group are stacked together." }
    }
  }
},
"hidden_series": {
  "type": "array",
  "items": { "type": "string" },
  "description": "Series names hidden by default; users can toggle interactively."
}
      }
    }
  ]
}
```

**Cross-references**:
- Abstract base: `gts.frontx.m.widget.widget.v1~` declared in §6.0 above.
- Related types: Paired Widget Data: `gts.frontx.v.widget_data.cartesian_chart.v1~` (in feature-widget-data-catalog)

### 6.7 PieChart

**GTS ID**: `gts.frontx.m.widget.widget.v1~frontx.m.widget.pie_chart.v1~`

**Description**: Subject-agnostic rendering primitive: a pie / donut chart (Apache ECharts).

**Schema**:

```json
{
  "$id": "gts://gts.frontx.m.widget.widget.v1~frontx.m.widget.pie_chart.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "PieChart",
  "description": "Subject-agnostic rendering primitive: a pie / donut chart (Apache ECharts). Consumes Widget Data of shape gts.frontx.v.widget_data.pie_chart.v1~.",
  "allOf": [
    { "$ref": "gts://gts.frontx.m.widget.widget.v1~" },
    {
      "type": "object",
      "properties": {
"radius": {
  "type": "array",
  "items": { "type": "string" },
  "description": "ECharts radius pair (inner, outer) controlling donut thickness."
},
"rose_type": { "type": "string", "enum": ["radius", "area", "none"] },
"show_legend": { "type": "boolean" },
"show_tooltip": { "type": "boolean" },
"show_segment_labels": { "type": "boolean" },
"hidden_segments": {
  "type": "array",
  "items": { "type": "string" },
  "description": "Segment labels hidden by default; users can toggle interactively."
}
      }
    }
  ]
}
```

**Cross-references**:
- Abstract base: `gts.frontx.m.widget.widget.v1~` declared in §6.0 above.
- Related types: Paired Widget Data: `gts.frontx.v.widget_data.pie_chart.v1~` (in feature-widget-data-catalog)

### 6.8 Heatmap

**GTS ID**: `gts.frontx.m.widget.widget.v1~frontx.m.widget.heatmap.v1~`

**Description**: Subject-agnostic rendering primitive: a two-axis cell-intensity heatmap.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.m.widget.widget.v1~frontx.m.widget.heatmap.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Heatmap",
  "description": "Subject-agnostic rendering primitive: a two-axis cell-intensity heatmap. Consumes Widget Data of shape gts.frontx.v.widget_data.heatmap.v1~.",
  "allOf": [
    { "$ref": "gts://gts.frontx.m.widget.widget.v1~" },
    {
      "type": "object",
      "properties": {
"x_axis_label": { "type": "string" },
"y_axis_label": { "type": "string" },
"color_scale": {
  "type": "string",
  "description": "Theme-driven color scale applied to cell intensity (e.g., 'sequential_blue', 'diverging_red_green')."
},
"min_value": { "type": ["number", "null"], "description": "Optional lower bound clamping the color scale; null means auto-detect from data." },
"max_value": { "type": ["number", "null"], "description": "Optional upper bound clamping the color scale; null means auto-detect from data." },
"show_cell_values": { "type": "boolean", "description": "Whether to render the numeric value inside each cell." }
      }
    }
  ]
}
```

**Cross-references**:
- Abstract base: `gts.frontx.m.widget.widget.v1~` declared in §6.0 above.
- Related types: Paired Widget Data: `gts.frontx.v.widget_data.heatmap.v1~` (in feature-widget-data-catalog)

### 6.9 MarkdownCard

**GTS ID**: `gts.frontx.m.widget.widget.v1~frontx.m.widget.markdown_card.v1~`

**Description**: Subject-agnostic rendering primitive: a card that renders a markdown body with optional truncation. The body content is delivered by the paired Widget Data; the widget kind makes no assumption about whose markdown is rendered.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.m.widget.widget.v1~frontx.m.widget.markdown_card.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "MarkdownCard",
  "description": "Subject-agnostic rendering primitive: a card that renders a markdown body delivered by the paired Widget Data. Subject specificity (pull-request body, issue body, release notes, ...) is supplied by the bound Query. Consumes Widget Data of shape gts.frontx.v.widget_data.markdown_card.v1~.",
  "allOf": [
    { "$ref": "gts://gts.frontx.m.widget.widget.v1~" },
    {
      "type": "object",
      "properties": {
"truncate_at_lines": {
  "type": "integer",
  "minimum": 1,
  "description": "Optional cap on rendered markdown line count; when set, the renderer collapses the body beyond this line count behind an expand control. Omit to render the full body."
},
"show_metadata_header": {
  "type": "boolean",
  "description": "Whether to render the optional metadata sub-shape (author label, age) carried by the Widget Data above the markdown body."
}
      }
    }
  ]
}
```

**Cross-references**:
- Abstract base: `gts.frontx.m.widget.widget.v1~` declared in §6.0 above.
- Related types: Paired Widget Data: `gts.frontx.v.widget_data.markdown_card.v1~` (in feature-widget-data-catalog)
- Source: `cpt-frontx-dashboard-fr-widget-catalog` (PRD §5.3 — pull-request detail modal with combined thread, commit, and review waterfall plus inline code context).
- Demo coverage: none. No demo query targets `markdown_card`; the kind exists in the widget library but the demo dashboard does not show it (PRD section 6.3).

### 6.10 CodeDiff

**GTS ID**: `gts.frontx.m.widget.widget.v1~frontx.m.widget.code_diff.v1~`

**Description**: Subject-agnostic rendering primitive: a code-diff card showing a single file's diff hunks with optional inline annotations. Subject specificity (pull-request file diff, commit file diff, ...) is supplied by the bound Query.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.m.widget.widget.v1~frontx.m.widget.code_diff.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "CodeDiff",
  "description": "Subject-agnostic rendering primitive: a code-diff card showing one file's diff hunks (context / addition / deletion lines) with optional inline annotations bound to specific lines. Consumes Widget Data of shape gts.frontx.v.widget_data.code_diff.v1~.",
  "allOf": [
    { "$ref": "gts://gts.frontx.m.widget.widget.v1~" },
    {
      "type": "object",
      "properties": {
"default_collapsed_state": {
  "type": "string",
  "enum": ["expanded", "collapsed"],
  "description": "Default expand/collapse state for hunks at mount; users may toggle interactively."
},
"show_line_numbers": {
  "type": "boolean",
  "description": "Whether to render old-side and new-side line numbers alongside each line."
},
"wrap_long_lines": {
  "type": "boolean",
  "description": "Whether long lines are soft-wrapped (true) or rendered with a horizontal scrollbar (false)."
}
      }
    }
  ]
}
```

**Cross-references**:
- Abstract base: `gts.frontx.m.widget.widget.v1~` declared in §6.0 above.
- Related types: Paired Widget Data: `gts.frontx.v.widget_data.code_diff.v1~` (in feature-widget-data-catalog)
- Source: `cpt-frontx-dashboard-fr-widget-catalog` (PRD §5.3 — inline code context inside the pull-request detail modal).
- Demo coverage: none. No demo query targets `code_diff`; the kind exists in the widget library but the demo dashboard does not show it (PRD section 6.3).

### 6.11 ThreadList

**GTS ID**: `gts.frontx.m.widget.widget.v1~frontx.m.widget.thread_list.v1~`

**Description**: Subject-agnostic rendering primitive: a card showing a nested list of threaded entries (parent entries with recursive replies). Subject specificity (review threads, issue comments, generic discussions) is supplied by the bound Query.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.m.widget.widget.v1~frontx.m.widget.thread_list.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "ThreadList",
  "description": "Subject-agnostic rendering primitive: a card showing a nested list of threaded entries with recursive replies. Each entry carries an author label, a timestamp, and a markdown body delivered by the paired Widget Data. Consumes Widget Data of shape gts.frontx.v.widget_data.thread_list.v1~.",
  "allOf": [
    { "$ref": "gts://gts.frontx.m.widget.widget.v1~" },
    {
      "type": "object",
      "properties": {
"default_collapse_depth": {
  "type": "integer",
  "minimum": 0,
  "description": "Depth (zero-based) at which replies are collapsed by default; 0 collapses all replies, higher values progressively expand deeper levels at mount."
},
"show_timestamps_relative": {
  "type": "boolean",
  "description": "Whether timestamps render as humanized relative ages (true) or as absolute ISO-8601 strings (false)."
},
"max_depth_rendered": {
  "type": "integer",
  "minimum": 1,
  "description": "Cap on the deepest reply level the renderer expands; replies beyond this depth are surfaced behind an expand control."
}
      }
    }
  ]
}
```

**Cross-references**:
- Abstract base: `gts.frontx.m.widget.widget.v1~` declared in §6.0 above.
- Related types: Paired Widget Data: `gts.frontx.v.widget_data.thread_list.v1~` (in feature-widget-data-catalog)
- Source: `cpt-frontx-dashboard-fr-widget-catalog` (PRD §5.3 — pull-request detail modal with combined thread context).
- Demo coverage: none. No demo query targets `thread_list`; the kind exists in the widget library but the demo dashboard does not show it (PRD section 6.3).

### 6.12 EventTimeline

**GTS ID**: `gts.frontx.m.widget.widget.v1~frontx.m.widget.event_timeline.v1~`

**Description**: Subject-agnostic rendering primitive: a time-axis waterfall of typed events (kind + label + timestamp tuples). Subject specificity (pull-request lifecycle events, issue lifecycle events, deployment events, ...) is supplied by the bound Query.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.m.widget.widget.v1~frontx.m.widget.event_timeline.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "EventTimeline",
  "description": "Subject-agnostic rendering primitive: a time-axis waterfall of typed events. Each event carries a kind classifier (free-form string the renderer styles by lookup), a label, a timestamp, and an optional actor label and payload. Consumes Widget Data of shape gts.frontx.v.widget_data.event_timeline.v1~.",
  "allOf": [
    { "$ref": "gts://gts.frontx.m.widget.widget.v1~" },
    {
      "type": "object",
      "properties": {
"time_axis_orientation": {
  "type": "string",
  "enum": ["vertical", "horizontal"],
  "description": "Orientation of the time axis."
},
"show_actor_labels": {
  "type": "boolean",
  "description": "Whether to render the optional actor label alongside each event."
},
"kind_styles": {
  "type": "object",
  "description": "Per-event-kind presentation overrides keyed by event kind classifier. Each override applies on top of the renderer's default style for that kind. Kinds whose classifier is not present here render with theme defaults — keeping the widget kind subject-agnostic while allowing the placement to opt into specific event-kind styling.",
  "additionalProperties": {
    "type": "object",
    "properties": {
      "color": { "type": "string", "description": "Theme-resolvable color override for events of this kind." },
      "icon": { "type": "string", "description": "Optional icon glyph identifier resolved by the renderer's icon set." }
    }
  }
}
      }
    }
  ]
}
```

**Cross-references**:
- Abstract base: `gts.frontx.m.widget.widget.v1~` declared in §6.0 above.
- Related types: Paired Widget Data: `gts.frontx.v.widget_data.event_timeline.v1~` (in feature-widget-data-catalog)
- Source: `cpt-frontx-dashboard-fr-widget-catalog` (PRD §5.3 — pull-request detail modal with combined review waterfall).
- Demo coverage: none. No demo query targets `event_timeline`; the kind exists in the widget library but the demo dashboard does not show it (PRD section 6.3).

### 6.13 MetadataStrip

**GTS ID**: `gts.frontx.m.widget.widget.v1~frontx.m.widget.metadata_strip.v1~`

**Description**: Subject-agnostic rendering primitive: a horizontal strip of label/value tuples (each tuple typed: text, badge, link, humanized-age, or score). Subject specificity (pull-request header strip, issue header strip, release header strip, ...) is supplied by the bound Query.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.m.widget.widget.v1~frontx.m.widget.metadata_strip.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "MetadataStrip",
  "description": "Subject-agnostic rendering primitive: a strip of label/value tuples where each tuple's value rendering is driven by a typed kind discriminator (text | badge | link | humanized_age | score). Consumes Widget Data of shape gts.frontx.v.widget_data.metadata_strip.v1~.",
  "allOf": [
    { "$ref": "gts://gts.frontx.m.widget.widget.v1~" },
    {
      "type": "object",
      "properties": {
"layout": {
  "type": "string",
  "enum": ["horizontal", "wrap"],
  "description": "Layout for the strip: horizontal renders all items on a single row with overflow scrolling; wrap renders items left-to-right and wraps to subsequent rows when width is exceeded."
},
"max_items_visible": {
  "type": "integer",
  "minimum": 1,
  "description": "Cap on the number of items rendered before the renderer collapses overflow behind a more-control. Items beyond the cap are surfaced via the more-control."
},
"label_position": {
  "type": "string",
  "enum": ["above", "inline"],
  "description": "Where the item label renders relative to the value: above the value (stacked) or inline with it (label: value)."
}
      }
    }
  ]
}
```

**Cross-references**:
- Abstract base: `gts.frontx.m.widget.widget.v1~` declared in §6.0 above.
- Related types: Paired Widget Data: `gts.frontx.v.widget_data.metadata_strip.v1~` (in feature-widget-data-catalog)
- Source: `cpt-frontx-dashboard-fr-widget-catalog` (PRD §5.3 — pull-request detail modal header summary).
- Demo coverage: none. No demo query targets `metadata_strip`; the kind exists in the widget library but the demo dashboard does not show it (PRD section 6.3).

## 7. Acceptance Criteria

- [ ] Every concrete listed in section 6 is authored with its full JSON Schema.
- [ ] Every identifier follows GTS grammar and every `x-gts-ref` resolves to a registered type.
- [ ] No identifier uses the prototype vendor `de` or the `hai3` namespace.
- [ ] `cfs validate --artifact` reports no structural errors for this document.
- [ ] The Widget base declares `drilldown` as optional, with `surface` limited to `detail_panel` and `modal` and at least one target widget instance.
- [ ] The six kinds `metric_card`, `markdown_card`, `code_diff`, `thread_list`, `event_timeline`, and `metadata_strip` are marked "no demo coverage".
- [ ] All 13 kinds chain from `gts.frontx.m.widget.widget.v1~` and name their paired `gts.frontx.v.widget_data.<kind>.v1~` shape.
