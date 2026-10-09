# Feature: Widget Data Catalog


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
  - [6.1 SummaryCardData](#61-summarycarddata)
  - [6.2 MetricCardData](#62-metriccarddata)
  - [6.3 RankedListCardData](#63-rankedlistcarddata)
  - [6.4 ProgressListCardData](#64-progresslistcarddata)
  - [6.5 GridData](#65-griddata)
  - [6.6 CartesianChartData](#66-cartesianchartdata)
  - [6.7 PieChartData](#67-piechartdata)
  - [6.8 HeatmapData](#68-heatmapdata)
  - [6.9 MarkdownCardData](#69-markdowncarddata)
  - [6.10 CodeDiffData](#610-codediffdata)
  - [6.11 ThreadListData](#611-threadlistdata)
  - [6.12 EventTimelineData](#612-eventtimelinedata)
  - [6.13 MetadataStripData](#613-metadatastripdata)
- [7. Acceptance Criteria](#7-acceptance-criteria)

<!-- /toc -->

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-featstatus-widget-data-catalog`
## 1. Feature Context

- [ ] `p2` - `cpt-frontx-dashboard-feature-widget-data-catalog`

### 1.1 Overview

This feature is a **type-catalog feature**, not an actor-flow feature, declared in package `dashboard-viewer`. It enumerates the 13 widget data shapes `gts.frontx.v.widget_data.<kind>.v1~`, one per widget kind, with no abstract base. Its structural prose lives in DESIGN section 3.1; the content lives in section 6 Type Catalog. The sections for flows, processes, and states are reduced to short not-applicable notes. The catalog is ported one-to-one from the prototype, rebased to the FrontX vendor (`gts.de.*` to `gts.frontx.*`).

### 1.2 Purpose

Concrete catalog of the payload shapes a query pipeline returns and a widget renders, each with its full GTS-typed JSON Schema. It addresses the type catalog and widget catalog of the PRD and the Widget data entity of DESIGN section 3.1. Six kinds have no demo coverage (see section 6).

**Requirements**: `cpt-frontx-dashboard-fr-type-catalog`, `cpt-frontx-dashboard-fr-widget-catalog`

**Principles**: `cpt-frontx-dashboard-principle-gts-contracts`

### 1.3 Actors

N/A. This is a type-catalog feature. The catalog is consumed by the runtime type system (the Viewer host, the Data Query Worker, and the widget MFEs), not by an end-user actor, so no actor flows are authored.

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md) section 3.1 (Domain Model)
- **ADRs**: [ADR-0003](../../ADR/0003-shared-data-types-and-schemas-v1.md), [ADR-0011](../../ADR/0011-widget-kind-and-mfe-realization-v1.md), [ADR-0012](../../ADR/0012-subject-agnostic-widget-catalog-v1.md)
- **Declaring package**: `dashboard-viewer` (`src-app/mfe_packages/dashboard-viewer/`)
- **Dependencies**: None for the shapes themselves (flat single-segment chains, no abstract base). Paired with [feature-widget-catalog](../feature-widget-catalog/FEATURE.md); a query's `output_widget_data_type` must equal the paired shape.

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

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-dod-widget-data-catalog-catalog-complete`

The system **MUST** author every concrete type of this catalog, ported one-to-one from the prototype and rebased to the FrontX vendor.

- Every concrete passes GTS identifier grammar and `x-gts-ref` validation.
- Every concrete keeps its prototype schema; only the vendor, namespace, and version form are rebased.
- The six kinds without demo queries are marked "no demo coverage".

## 6. Type Catalog

Demo coverage of the 13 kinds (PRD section 6.3): `summary_card`, `ranked_list_card`, `progress_list_card`, `grid`, `cartesian_chart`, `pie_chart`, and `heatmap` have demo queries. The six kinds `metric_card`, `markdown_card`, `code_diff`, `thread_list`, `event_timeline`, and `metadata_strip` are marked **no demo coverage**.

### 6.1 SummaryCardData

**GTS ID**: `gts.frontx.v.widget_data.summary_card.v1~`

**Description**: Widget Data for `summary_card`: ordered list of label/value rows.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.v.widget_data.summary_card.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "SummaryCardData",
  "description": "Paired Widget Data shape for the summary_card widget kind: an ordered list of label/value rows produced by a Query (e.g. PR-status counts, contributor-bucket counts, LOC-by-language counts).",
  "type": "object",
  "required": ["rows"],
  "properties": {
    "rows": {
      "type": "array",
      "description": "Ordered row records. The widget kind's row_order references each row's key.",
      "items": {
"type": "object",
"required": ["key", "value"],
"properties": {
  "key": { "type": "string", "description": "Stable row key (e.g., ready, in_review, human, bot_critical); independent of presentation labels." },
  "value": { "type": "number", "description": "Numeric value rendered for the row." },
  "format": { "type": ["string", "null"], "description": "Optional format hint (e.g., integer, percent_1); falls back to a default when null." },
  "trend": { "type": ["string", "null"], "enum": ["up", "down", "flat", null], "description": "Optional trend indicator the renderer surfaces alongside the value." }
}
      }
    }
  }
}
```

**Cross-references**:
- No abstract base (flat single-segment chain).
- Related types: Paired widget kind: `gts.frontx.m.widget.widget.v1~frontx.m.widget.summary_card.v1~` (in feature-widget-catalog)

### 6.2 MetricCardData

**GTS ID**: `gts.frontx.v.widget_data.metric_card.v1~`

**Description**: Widget Data for `metric_card`: single headline value with optional trend and optional sparkline series.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.v.widget_data.metric_card.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "MetricCardData",
  "description": "Paired Widget Data shape for the metric_card widget kind: a single headline value with optional trend and optional sparkline.",
  "type": "object",
  "required": ["value"],
  "properties": {
    "value": { "type": "number", "description": "Headline value rendered as the primary KPI." },
    "format": { "type": ["string", "null"], "description": "Optional format hint (integer, percent_1, compact_loc, etc.); the widget kind's format field overrides this when both are present." },
    "trend": {
      "type": ["object", "null"],
      "description": "Optional trend descriptor.",
      "required": ["direction", "delta"],
      "properties": {
"direction": { "type": "string", "enum": ["up", "down", "flat"], "description": "Trend direction." },
"delta": { "type": "number", "description": "Magnitude of the trend (signed)." }
      }
    },
    "sparkline": { "type": ["array", "null"], "items": { "type": "number" }, "description": "Optional inline sparkline series (chronologically ordered)." }
  }
}
```

**Cross-references**:
- No abstract base (flat single-segment chain).
- Related types: Paired widget kind: `gts.frontx.m.widget.widget.v1~frontx.m.widget.metric_card.v1~` (in feature-widget-catalog)
- Demo coverage: none. No demo query outputs this shape; the paired widget kind `metric_card` has no demo coverage (PRD section 6.3).

### 6.3 RankedListCardData

**GTS ID**: `gts.frontx.v.widget_data.ranked_list_card.v1~`

**Description**: Widget Data for `ranked_list_card`: ordered ranked items (rank, label, value, optional secondary).

**Schema**:

```json
{
  "$id": "gts://gts.frontx.v.widget_data.ranked_list_card.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "RankedListCardData",
  "description": "Paired Widget Data shape for the ranked_list_card widget kind: a ranked list of items with primary value and optional secondary value.",
  "type": "object",
  "required": ["items"],
  "properties": {
    "items": {
      "type": "array",
      "description": "Ordered ranked items (rank ascending).",
      "items": {
"type": "object",
"required": ["rank", "label", "value"],
"properties": {
  "rank": { "type": "integer", "description": "One-based rank within the list." },
  "label": { "type": "string", "description": "Display label of the ranked item (e.g., contributor name, repo slug)." },
  "value": { "type": "number", "description": "Primary value driving the rank." },
  "secondary": { "type": ["number", "null"], "description": "Optional secondary value rendered alongside the primary." }
}
      }
    }
  }
}
```

**Cross-references**:
- No abstract base (flat single-segment chain).
- Related types: Paired widget kind: `gts.frontx.m.widget.widget.v1~frontx.m.widget.ranked_list_card.v1~` (in feature-widget-catalog)

### 6.4 ProgressListCardData

**GTS ID**: `gts.frontx.v.widget_data.progress_list_card.v1~`

**Description**: Widget Data for `progress_list_card`: list of items with current/target progress.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.v.widget_data.progress_list_card.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "ProgressListCardData",
  "description": "Paired Widget Data shape for the progress_list_card widget kind: a list of items with current/target progress.",
  "type": "object",
  "required": ["items"],
  "properties": {
    "items": {
      "type": "array",
      "description": "Ordered progress items.",
      "items": {
"type": "object",
"required": ["label", "current", "target"],
"properties": {
  "label": { "type": "string", "description": "Display label (e.g., milestone name, contributor display name)." },
  "current": { "type": "number", "description": "Progress value achieved so far." },
  "target": { "type": "number", "description": "Target value defining 100%." },
  "unit": { "type": ["string", "null"], "description": "Optional unit hint (e.g., LOC, prs, points); rendered next to the value." }
}
      }
    }
  }
}
```

**Cross-references**:
- No abstract base (flat single-segment chain).
- Related types: Paired widget kind: `gts.frontx.m.widget.widget.v1~frontx.m.widget.progress_list_card.v1~` (in feature-widget-catalog)

### 6.5 GridData

**GTS ID**: `gts.frontx.v.widget_data.grid.v1~`

**Description**: Widget Data for `grid`: declared columns + tabular rows.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.v.widget_data.grid.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "GridData",
  "description": "Paired Widget Data shape for the grid widget kind: tabular data with declared columns and rows.",
  "type": "object",
  "required": ["columns", "rows"],
  "properties": {
    "columns": {
      "type": "array",
      "description": "Column descriptors. The widget kind's columns references each column's key and adds presentation-only attributes.",
      "items": {
"type": "object",
"required": ["key", "label", "type"],
"properties": {
  "key": { "type": "string", "description": "Stable column key." },
  "label": { "type": "string", "description": "Default header label (the widget kind's columns[].label may override)." },
  "type": { "type": "string", "enum": ["string", "number", "integer", "boolean", "date", "enum"], "description": "Column value type; drives default formatting and sort ordering." }
}
      }
    },
    "rows": {
      "type": "array",
      "description": "Tabular row records keyed by column key.",
      "items": { "type": "object" }
    }
  }
}
```

**Cross-references**:
- No abstract base (flat single-segment chain).
- Related types: Paired widget kind: `gts.frontx.m.widget.widget.v1~frontx.m.widget.grid.v1~` (in feature-widget-catalog)

### 6.6 CartesianChartData

**GTS ID**: `gts.frontx.v.widget_data.cartesian_chart.v1~`

**Description**: Widget Data for `cartesian_chart`: shared x_values plus a list of named series with per-series type ∈ {bar, line, area, scatter}.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.v.widget_data.cartesian_chart.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "CartesianChartData",
  "description": "Paired Widget Data shape for the cartesian_chart widget kind. Carries a shared x_values axis and a list of named series; each series declares its own rendering type via series[].type. Current enum values are bar | line | area | scatter; future Cartesian rendering shapes extend this enum without changing the widget kind.",
  "type": "object",
  "required": ["x_values", "series"],
  "properties": {
    "x_values": {
      "type": "array",
      "items": { "type": ["string", "number"] },
      "description": "Shared x-axis values (categorical strings, numeric values, or epoch-millisecond timestamps). All series align positionally to this array."
    },
    "series": {
      "type": "array",
      "description": "One or more named series. Each series declares its own rendering shape.",
      "items": {
"type": "object",
"required": ["type", "name", "data"],
"properties": {
  "type": { "type": "string", "enum": ["bar", "line", "area", "scatter"], "description": "Per-series rendering shape; drives the rendering library's series-type axis." },
  "name": { "type": "string", "description": "Series display name; surfaced in legend and tooltips." },
  "data": { "type": "array", "items": { "type": ["number", "null"] }, "description": "Series y-values, indexed positionally against x_values; null indicates a missing point." },
  "y_axis_index": { "type": ["integer", "null"], "enum": [0, 1, null], "description": "Which y-axis the series binds to; 0 primary, 1 optional secondary axis. Null when only the primary axis is in use." },
  "color": { "type": ["string", "null"], "description": "Optional theme-resolvable color override; falls back to the widget kind's series_overrides[name].color and then to the theme palette." },
  "stack_group": { "type": ["string", "null"], "description": "Optional stack-group identifier; series sharing a stack_group are stacked together. Null when unstacked." }
}
      }
    }
  }
}
```

**Cross-references**:
- No abstract base (flat single-segment chain).
- Related types: Paired widget kind: `gts.frontx.m.widget.widget.v1~frontx.m.widget.cartesian_chart.v1~` (in feature-widget-catalog)

### 6.7 PieChartData

**GTS ID**: `gts.frontx.v.widget_data.pie_chart.v1~`

**Description**: Widget Data for `pie_chart`: ordered segments (label, value, optional color).

**Schema**:

```json
{
  "$id": "gts://gts.frontx.v.widget_data.pie_chart.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "PieChartData",
  "description": "Paired Widget Data shape for the pie_chart widget kind: an ordered list of segments.",
  "type": "object",
  "required": ["segments"],
  "properties": {
    "segments": {
      "type": "array",
      "description": "Ordered pie segments.",
      "items": {
"type": "object",
"required": ["label", "value"],
"properties": {
  "label": { "type": "string", "description": "Segment display label (legend + tooltip)." },
  "value": { "type": "number", "description": "Numeric value driving the segment angle." },
  "color": { "type": ["string", "null"], "description": "Optional theme-resolvable color override; falls back to the widget kind's color_scheme palette when null." }
}
      }
    }
  }
}
```

**Cross-references**:
- No abstract base (flat single-segment chain).
- Related types: Paired widget kind: `gts.frontx.m.widget.widget.v1~frontx.m.widget.pie_chart.v1~` (in feature-widget-catalog)

### 6.8 HeatmapData

**GTS ID**: `gts.frontx.v.widget_data.heatmap.v1~`

**Description**: Widget Data for `heatmap`: sparse cells with (x, y, value) plus optional axis label arrays.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.v.widget_data.heatmap.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "HeatmapData",
  "description": "Paired Widget Data shape for the heatmap widget kind: a sparse cell collection plus optional axis label arrays.",
  "type": "object",
  "required": ["cells"],
  "properties": {
    "cells": {
      "type": "array",
      "description": "Sparse list of cells (cells with no value MAY be omitted).",
      "items": {
"type": "object",
"required": ["x", "y", "value"],
"properties": {
  "x": { "type": ["string", "number"], "description": "X-axis coordinate (category or numeric)." },
  "y": { "type": ["string", "number"], "description": "Y-axis coordinate (category or numeric)." },
  "value": { "type": "number", "description": "Cell intensity value driving the color scale." }
}
      }
    },
    "x_labels": { "type": ["array", "null"], "items": { "type": "string" }, "description": "Optional ordered x-axis category labels; null when the x-axis is numeric." },
    "y_labels": { "type": ["array", "null"], "items": { "type": "string" }, "description": "Optional ordered y-axis category labels; null when the y-axis is numeric." }
  }
}
```

**Cross-references**:
- No abstract base (flat single-segment chain).
- Related types: Paired widget kind: `gts.frontx.m.widget.widget.v1~frontx.m.widget.heatmap.v1~` (in feature-widget-catalog)

### 6.9 MarkdownCardData

**GTS ID**: `gts.frontx.v.widget_data.markdown_card.v1~`

**Description**: Widget Data for `markdown_card`: a markdown body string with optional metadata sub-shape.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.v.widget_data.markdown_card.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "MarkdownCardData",
  "description": "Paired Widget Data shape for the markdown_card widget kind: a markdown body produced by a Query (e.g., a pull-request body, an issue body, release notes) with optional author/age metadata for an inline header.",
  "type": "object",
  "required": ["markdown"],
  "properties": {
    "markdown": {
      "type": "string",
      "description": "Markdown body rendered by the widget kind. Authoring-time normalization (e.g., GitHub-flavored markdown extensions) is the Query's responsibility; the widget kind treats the value as opaque markdown source."
    },
    "metadata": {
      "type": ["object", "null"],
      "description": "Optional metadata sub-shape rendered above the body when the widget kind's show_metadata_header is true.",
      "properties": {
"author_label": { "type": "string", "description": "Display label of the body's author (e.g., a contributor display name)." },
"age_seconds": { "type": "integer", "minimum": 0, "description": "Age in seconds at the time of dashboard generation; the renderer humanizes it (e.g., '3 days ago')." }
      }
    }
  }
}
```

**Cross-references**:
- No abstract base (flat single-segment chain).
- Related types: Paired widget kind: `gts.frontx.m.widget.widget.v1~frontx.m.widget.markdown_card.v1~` (in feature-widget-catalog)
- Source: `cpt-frontx-dashboard-fr-widget-catalog` (PRD §5.3).
- Demo coverage: none. No demo query outputs this shape; the paired widget kind `markdown_card` has no demo coverage (PRD section 6.3).

### 6.10 CodeDiffData

**GTS ID**: `gts.frontx.v.widget_data.code_diff.v1~`

**Description**: Widget Data for `code_diff`: one file's diff hunks with optional inline annotations.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.v.widget_data.code_diff.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "CodeDiffData",
  "description": "Paired Widget Data shape for the code_diff widget kind: a single file with its diff hunks (context / addition / deletion lines), optional per-hunk header text, and optional line-bound annotations the renderer surfaces inline.",
  "type": "object",
  "required": ["file", "hunks"],
  "properties": {
    "file": {
      "type": "object",
      "required": ["path"],
      "description": "File descriptor for the diff.",
      "properties": {
"path": { "type": "string", "description": "File path (repository-relative)." },
"language": { "type": ["string", "null"], "description": "Optional language hint (e.g., 'typescript', 'python') driving syntax-highlight selection at render time; null when the language is unknown or not classified." }
      }
    },
    "hunks": {
      "type": "array",
      "description": "Ordered diff hunks. Each hunk groups a contiguous run of lines.",
      "items": {
"type": "object",
"required": ["lines"],
"properties": {
  "header": { "type": ["string", "null"], "description": "Optional hunk header (e.g., the unified-diff '@@ ... @@' line); null when the renderer should compute its own." },
  "lines": {
    "type": "array",
    "description": "Lines composing the hunk in order.",
    "items": {
      "type": "object",
      "required": ["kind", "text"],
      "properties": {
        "kind": { "type": "string", "enum": ["context", "addition", "deletion"], "description": "Diff classification driving line styling." },
        "text": { "type": "string", "description": "Line content (without the leading +/-/space marker)." },
        "line_number_old": { "type": ["integer", "null"], "minimum": 0, "description": "Old-side line number (null on addition lines)." },
        "line_number_new": { "type": ["integer", "null"], "minimum": 0, "description": "New-side line number (null on deletion lines)." }
      }
    }
  }
}
      }
    },
    "annotations": {
      "type": ["array", "null"],
      "description": "Optional inline annotations bound to specific lines (e.g., review comments). Null when no annotations are produced.",
      "items": {
"type": "object",
"required": ["line_number", "side", "payload"],
"properties": {
  "line_number": { "type": "integer", "minimum": 0, "description": "Target line number." },
  "side": { "type": "string", "enum": ["old", "new"], "description": "Diff side the line number belongs to." },
  "payload": { "type": "string", "description": "Annotation body (markdown). The renderer surfaces it inline at the target line." }
}
      }
    }
  }
}
```

**Cross-references**:
- No abstract base (flat single-segment chain).
- Related types: Paired widget kind: `gts.frontx.m.widget.widget.v1~frontx.m.widget.code_diff.v1~` (in feature-widget-catalog)
- Source: `cpt-frontx-dashboard-fr-widget-catalog` (PRD §5.3).
- Demo coverage: none. No demo query outputs this shape; the paired widget kind `code_diff` has no demo coverage (PRD section 6.3).

### 6.11 ThreadListData

**GTS ID**: `gts.frontx.v.widget_data.thread_list.v1~`

**Description**: Widget Data for `thread_list`: a recursive-tree array of threaded entries.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.v.widget_data.thread_list.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "ThreadListData",
  "description": "Paired Widget Data shape for the thread_list widget kind: a recursive-tree array of threaded entries. Each entry carries a stable id, an author label, a timestamp, a markdown body, and a recursive replies array of the same shape.",
  "type": "object",
  "required": ["threads"],
  "$defs": {
    "Thread": {
      "type": "object",
      "required": ["id", "author_label", "timestamp", "body_markdown"],
      "properties": {
"id": { "type": "string", "description": "Stable thread/entry identifier; unique within the dataset." },
"parent_id": { "type": ["string", "null"], "description": "Parent entry's id when this is a reply; null for top-level entries." },
"author_label": { "type": "string", "description": "Display label of the entry's author." },
"timestamp": { "type": "string", "format": "date-time", "description": "ISO-8601 timestamp of when the entry was authored." },
"body_markdown": { "type": "string", "description": "Markdown body of the entry." },
"replies": {
  "type": "array",
  "description": "Ordered nested replies. Empty when there are none.",
  "items": { "$ref": "#/$defs/Thread" }
}
      }
    }
  },
  "properties": {
    "threads": {
      "type": "array",
      "description": "Top-level threaded entries (parent_id is null for these). Order is the renderer's display order.",
      "items": { "$ref": "#/$defs/Thread" }
    }
  }
}
```

**Cross-references**:
- No abstract base (flat single-segment chain).
- Related types: Paired widget kind: `gts.frontx.m.widget.widget.v1~frontx.m.widget.thread_list.v1~` (in feature-widget-catalog)
- Source: `cpt-frontx-dashboard-fr-widget-catalog` (PRD §5.3).
- Demo coverage: none. No demo query outputs this shape; the paired widget kind `thread_list` has no demo coverage (PRD section 6.3).

### 6.12 EventTimelineData

**GTS ID**: `gts.frontx.v.widget_data.event_timeline.v1~`

**Description**: Widget Data for `event_timeline`: a time-ordered events array with typed kind classifiers.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.v.widget_data.event_timeline.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "EventTimelineData",
  "description": "Paired Widget Data shape for the event_timeline widget kind: an array of time-ordered events. Each event carries a kind classifier (free-form string; the renderer styles by lookup against the widget kind's kind_styles map), a label, a timestamp, and an optional actor label and payload.",
  "type": "object",
  "required": ["events"],
  "properties": {
    "events": {
      "type": "array",
      "description": "Time-ordered events.",
      "items": {
"type": "object",
"required": ["kind", "label", "timestamp"],
"properties": {
  "kind": { "type": "string", "description": "Free-form kind classifier (e.g., 'opened', 'commented', 'merged'). The renderer styles by lookup against the widget kind's kind_styles map; the classifier itself is subject-defined and produced by the Query." },
  "label": { "type": "string", "description": "Display label of the event (e.g., 'opened by alice', 'merged into main')." },
  "timestamp": { "type": "string", "format": "date-time", "description": "ISO-8601 timestamp of when the event occurred." },
  "actor_label": { "type": ["string", "null"], "description": "Optional display label of the actor associated with the event; null when the event has no actor." },
  "payload": { "type": ["string", "null"], "description": "Optional secondary detail string surfaced inline (e.g., a commit subject, a comment excerpt); null when not produced." }
}
      }
    }
  }
}
```

**Cross-references**:
- No abstract base (flat single-segment chain).
- Related types: Paired widget kind: `gts.frontx.m.widget.widget.v1~frontx.m.widget.event_timeline.v1~` (in feature-widget-catalog)
- Source: `cpt-frontx-dashboard-fr-widget-catalog` (PRD §5.3).
- Demo coverage: none. No demo query outputs this shape; the paired widget kind `event_timeline` has no demo coverage (PRD section 6.3).

### 6.13 MetadataStripData

**GTS ID**: `gts.frontx.v.widget_data.metadata_strip.v1~`

**Description**: Widget Data for `metadata_strip`: an ordered list of label/value tuples with a typed kind discriminator per item.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.v.widget_data.metadata_strip.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "MetadataStripData",
  "description": "Paired Widget Data shape for the metadata_strip widget kind: an ordered list of label/value tuples. Each tuple carries a typed kind discriminator (text | badge | link | humanized_age | score) that drives the renderer's value formatting; the kind determines which optional fields apply.",
  "type": "object",
  "required": ["items"],
  "properties": {
    "items": {
      "type": "array",
      "description": "Ordered label/value items rendered left-to-right (or top-to-bottom in wrap layout).",
      "items": {
"type": "object",
"required": ["label", "value", "kind"],
"properties": {
  "label": { "type": "string", "description": "Item label rendered by the widget kind per its label_position config." },
  "value": { "type": "string", "description": "Item value as a string. Numeric and time values are stringified by the Query; the kind discriminator drives interpretation (humanized_age expects a numeric epoch-seconds string; score expects a numeric string)." },
  "kind": { "type": "string", "enum": ["text", "badge", "link", "humanized_age", "score"], "description": "Typed renderer discriminator: text renders verbatim; badge renders as a colored chip; link renders as a clickable link using link_url; humanized_age renders the value (epoch seconds) as relative age; score renders with reward-tier styling driven by the value magnitude." },
  "link_url": { "type": ["string", "null"], "description": "Optional URL applied when kind is 'link'; null when not applicable." },
  "badge_color": { "type": ["string", "null"], "description": "Optional theme-resolvable color override applied when kind is 'badge'; null falls back to the renderer's default badge palette." }
}
  ,"if": { "properties": { "kind": { "const": "link" } }, "required": ["kind"] },
  "then": { "properties": { "link_url": { "type": "string" } }, "required": ["link_url"] }
      }
    }
  }
}
```

**Cross-references**:
- No abstract base (flat single-segment chain).
- Related types: Paired widget kind: `gts.frontx.m.widget.widget.v1~frontx.m.widget.metadata_strip.v1~` (in feature-widget-catalog)
- Source: `cpt-frontx-dashboard-fr-widget-catalog` (PRD §5.3).
- Demo coverage: none. No demo query outputs this shape; the paired widget kind `metadata_strip` has no demo coverage (PRD section 6.3).

## 7. Acceptance Criteria

- [ ] Every concrete listed in section 6 is authored with its full JSON Schema.
- [ ] Every identifier follows GTS grammar and every `x-gts-ref` resolves to a registered type.
- [ ] No identifier uses the prototype vendor `de` or the `hai3` namespace.
- [ ] `cfs validate --artifact` reports no structural errors for this document.
- [ ] Exactly 13 shapes are authored, one per widget kind, none with an abstract base.
- [ ] The six shapes for `metric_card`, `markdown_card`, `code_diff`, `thread_list`, `event_timeline`, and `metadata_strip` are marked "no demo coverage".
