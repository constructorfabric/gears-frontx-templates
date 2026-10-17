# Feature: Cell Renderer Catalog


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
  - [6.1 LinkRenderer](#61-linkrenderer)
  - [6.2 BadgeRenderer](#62-badgerenderer)
  - [6.3 AvatarRenderer](#63-avatarrenderer)
  - [6.4 ProgressRenderer](#64-progressrenderer)
  - [6.5 SparklineRenderer](#65-sparklinerenderer)
  - [6.6 MarkdownRenderer](#66-markdownrenderer)
  - [6.7 CodeDiffRenderer](#67-codediffrenderer)
  - [6.8 ConditionalBadgeRenderer](#68-conditionalbadgerenderer)
  - [6.9 HumanizedAgeRenderer](#69-humanizedagerenderer)
- [7. Acceptance Criteria](#7-acceptance-criteria)

<!-- /toc -->

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-featstatus-renderer-catalog`
## 1. Feature Context

- [ ] `p2` - `cpt-frontx-dashboard-feature-renderer-catalog`

### 1.1 Overview

This feature is a **type-catalog feature**, not an actor-flow feature, declared in package `dashboard-viewer`. It enumerates the 9 standalone cell renderers `gts.frontx.m.renderer.<name>.v1~`, with no abstract base. Its structural prose lives in DESIGN section 3.1; the content lives in section 6 Type Catalog. The sections for flows, processes, and states are reduced to short not-applicable notes. The catalog is ported one-to-one from the prototype, rebased to the FrontX vendor (`gts.de.*` to `gts.frontx.*`).

### 1.2 Purpose

Concrete catalog of the cell renderers that `grid` columns name, each with its full GTS-typed JSON Schema. It addresses conditional cell formatting and the type catalog of the PRD and the Renderer entity of DESIGN section 3.1.

**Requirements**: `cpt-frontx-dashboard-fr-cell-formatting`, `cpt-frontx-dashboard-fr-type-catalog`

**Principles**: `cpt-frontx-dashboard-principle-gts-contracts`

### 1.3 Actors

N/A. This is a type-catalog feature. The catalog is consumed by the runtime type system (the Viewer host, the Data Query Worker, and the widget MFEs), not by an end-user actor, so no actor flows are authored.

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md) section 3.1 (Domain Model)
- **ADRs**: [ADR-0005](../../ADR/0005-data-grid-library-v1.md), [ADR-0012](../../ADR/0012-subject-agnostic-widget-catalog-v1.md)
- **Declaring package**: `dashboard-viewer` (`src-app/mfe_packages/dashboard-viewer/`)
- **Dependencies**: None (standalone single-segment chains, no abstract base). Consumed by [feature-widget-catalog](../feature-widget-catalog/FEATURE.md) through the `renderer` field of grid columns.

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

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-dod-renderer-catalog-catalog-complete`

The system **MUST** author every concrete type of this catalog, ported one-to-one from the prototype and rebased to the FrontX vendor.

- Every concrete passes GTS identifier grammar and `x-gts-ref` validation.
- Every concrete keeps its prototype schema; only the vendor, namespace, and version form are rebased.

## 6. Type Catalog

### 6.1 LinkRenderer

**GTS ID**: `gts.frontx.m.renderer.link.v1~`

**Description**: Renders cell value as a clickable link with URL template.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.m.renderer.link.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "LinkRenderer",
  "description": "Renders cell value as a clickable link.",
  "type": "object",
  "properties": {
    "url_template": { "type": "string", "description": "URL template with {value} placeholder for the cell value." },
    "label_field": { "type": ["string", "null"], "description": "Alternative field to use as link label instead of the cell value." }
  },
  "required": ["url_template"]
}
```

**Cross-references**:
- No abstract base (flat single-segment chain).
- Related types: Consumed by Grid widget columns via the `renderer` field on `gts.frontx.m.widget.widget.v1~frontx.m.widget.grid.v1~`.

### 6.2 BadgeRenderer

**GTS ID**: `gts.frontx.m.renderer.badge.v1~`

**Description**: Renders cell value as a colored badge/tag.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.m.renderer.badge.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "BadgeRenderer",
  "description": "Renders cell value as a colored badge/tag.",
  "type": "object",
  "properties": {
    "color_mapping": { "type": "object", "description": "Maps cell values to badge colors. Keys are cell values, values are color identifiers from the theme palette.", "additionalProperties": { "type": "string" } }
  },
  "required": ["color_mapping"]
}
```

**Cross-references**:
- No abstract base (flat single-segment chain).
- Related types: Consumed by Grid widget columns via the `renderer` field on `gts.frontx.m.widget.widget.v1~frontx.m.widget.grid.v1~`.

### 6.3 AvatarRenderer

**GTS ID**: `gts.frontx.m.renderer.avatar.v1~`

**Description**: Renders cell value as a user avatar image.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.m.renderer.avatar.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "AvatarRenderer",
  "description": "Renders cell value as a user avatar image.",
  "type": "object",
  "properties": {
    "image_field": { "type": "string", "description": "Field containing the avatar image URL." },
    "fallback": { "type": ["string", "null"], "description": "Fallback text or initials when image is unavailable." }
  },
  "required": ["image_field"]
}
```

**Cross-references**:
- No abstract base (flat single-segment chain).
- Related types: Consumed by Grid widget columns via the `renderer` field on `gts.frontx.m.widget.widget.v1~frontx.m.widget.grid.v1~`.

### 6.4 ProgressRenderer

**GTS ID**: `gts.frontx.m.renderer.progress.v1~`

**Description**: Renders cell value as a progress bar.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.m.renderer.progress.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "ProgressRenderer",
  "description": "Renders cell value as a progress bar.",
  "type": "object",
  "properties": {
    "max_value": { "type": "number", "description": "Maximum value for 100% progress." }
  },
  "required": ["max_value"]
}
```

**Cross-references**:
- No abstract base (flat single-segment chain).
- Related types: Consumed by Grid widget columns via the `renderer` field on `gts.frontx.m.widget.widget.v1~frontx.m.widget.grid.v1~`.

### 6.5 SparklineRenderer

**GTS ID**: `gts.frontx.m.renderer.sparkline.v1~`

**Description**: Renders cell value as a tiny inline SVG sparkline chart.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.m.renderer.sparkline.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "SparklineRenderer",
  "description": "Renders cell value as a tiny inline SVG sparkline chart.",
  "type": "object",
  "properties": {
    "values_field": { "type": "string", "description": "Field containing the array of numeric values for the sparkline." }
  },
  "required": ["values_field"]
}
```

**Cross-references**:
- No abstract base (flat single-segment chain).
- Related types: Consumed by Grid widget columns via the `renderer` field on `gts.frontx.m.widget.widget.v1~frontx.m.widget.grid.v1~`.

### 6.6 MarkdownRenderer

**GTS ID**: `gts.frontx.m.renderer.markdown.v1~`

**Description**: Renders the named Widget Data string field as sanitised Markdown using the selected dialect / sanitisation profile.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.m.renderer.markdown.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "MarkdownRenderer",
  "description": "Renders the named Widget Data string field as sanitised Markdown. The dialect / sanitisation profile is selected by the profile enum.",
  "type": "object",
  "required": ["source_field"],
  "properties": {
    "source_field": { "type": "string", "description": "Widget Data field carrying the markdown source string to render." },
    "profile": { "type": "string", "enum": ["strict", "github_flavored"], "description": "Markdown dialect and sanitisation profile applied to the source." }
  }
}
```

**Cross-references**:
- No abstract base (flat single-segment chain).
- Related types: Consumed by the MarkdownCard widget kind `gts.frontx.m.widget.widget.v1~frontx.m.widget.markdown_card.v1~` (in feature-widget-catalog §6.9) and by Grid widget columns via the `renderer` field on `gts.frontx.m.widget.widget.v1~frontx.m.widget.grid.v1~` whenever a column carries markdown source strings.
- Source: `cpt-frontx-dashboard-fr-cell-formatting` (PRD §5.3 — humanized rendering for durations and ages, signed-delta rendering, and tier-driven rendering of cell values; markdown body presentation belongs to the same value-formatting-by-renderer family) and `cpt-frontx-dashboard-fr-widget-catalog` (PRD §5.3 — pull-request detail modal markdown body context consumed by the MarkdownCard widget kind).

### 6.7 CodeDiffRenderer

**GTS ID**: `gts.frontx.m.renderer.code_diff.v1~`

**Description**: Renders a unified file diff with hunks (context / addition / deletion lines) and optional inline annotations bound to specific lines.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.m.renderer.code_diff.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "CodeDiffRenderer",
  "description": "Renders a unified file diff sourced from named Widget Data fields: a file path / identifier, an ordered hunks array, and an optional per-line annotations array surfaced inline.",
  "type": "object",
  "required": ["file_field", "hunks_field"],
  "properties": {
    "file_field": { "type": "string", "description": "Widget Data field carrying the file path or identifier rendered in the diff header." },
    "hunks_field": { "type": "string", "description": "Widget Data field carrying the ordered diff-hunks array consumed by the renderer." },
    "annotations_field": { "type": "string", "description": "Widget Data field carrying the optional per-line annotations array surfaced inline against specific hunk lines." },
    "show_line_numbers": { "type": "boolean", "description": "Whether the renderer surfaces old-side and new-side line numbers in the gutter." }
  }
}
```

**Cross-references**:
- No abstract base (flat single-segment chain).
- Related types: Consumed by the CodeDiff widget kind `gts.frontx.m.widget.widget.v1~frontx.m.widget.code_diff.v1~` (in feature-widget-catalog §6.10).
- Source: `cpt-frontx-dashboard-fr-widget-catalog` (PRD §5.3 — inline code context inside the pull-request detail modal consumed by the CodeDiff widget kind).

### 6.8 ConditionalBadgeRenderer

**GTS ID**: `gts.frontx.m.renderer.conditional_badge.v1~`

**Description**: Renders a numeric Widget Data field as a coloured badge whose label / colour are selected by ascending-threshold lookup. Distinct from BadgeRenderer (§6.2) which selects by exact-value map.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.m.renderer.conditional_badge.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "ConditionalBadgeRenderer",
  "description": "Renders a numeric Widget Data field as a coloured badge selected by ascending-threshold lookup. The renderer scans thresholds in ascending order and selects the first band whose at value is greater than or equal to the field value.",
  "type": "object",
  "required": ["value_field", "thresholds"],
  "properties": {
    "value_field": { "type": "string", "description": "Widget Data field carrying the numeric value used for threshold lookup." },
    "thresholds": {
      "type": "array",
      "description": "Ordered ascending threshold bands. Each band declares an at value, a label, and a colour. The renderer selects the first band whose at value satisfies the lookup against the field value.",
      "items": {
"type": "object",
"required": ["at", "label", "color"],
"properties": {
  "at": { "type": "number", "description": "Ascending threshold boundary for this band." },
  "label": { "type": "string", "description": "Badge label rendered when this band is selected." },
  "color": { "type": "string", "description": "Theme-resolvable badge colour rendered when this band is selected." }
}
      }
    },
    "palette": { "type": "string", "enum": ["severity", "status", "generic"], "description": "Palette family used to resolve band colours." }
  }
}
```

**Cross-references**:
- No abstract base (flat single-segment chain).
- Related types: Consumed by Grid widget columns via the `renderer` field on `gts.frontx.m.widget.widget.v1~frontx.m.widget.grid.v1~` for cells whose colour emphasis is driven by numeric thresholds (e.g., reward-tier ranking, severity bands).
- Source: `cpt-frontx-dashboard-fr-cell-formatting` (PRD §5.3 — value-driven color emphasis and tier-driven badge rendering for ranked values).

### 6.9 HumanizedAgeRenderer

**GTS ID**: `gts.frontx.m.renderer.humanized_age.v1~`

**Description**: Renders the named Widget Data ISO-8601 timestamp field as a humanised age (relative or absolute) per the selected format mode.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.m.renderer.humanized_age.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "HumanizedAgeRenderer",
  "description": "Renders the named Widget Data ISO-8601 timestamp field as a humanised age. The format mode selects between short relative (e.g., '3d'), long relative (e.g., '3 days ago'), and absolute (ISO-8601 verbatim) output.",
  "type": "object",
  "required": ["timestamp_field", "format_mode"],
  "properties": {
    "timestamp_field": { "type": "string", "description": "Widget Data field carrying the ISO-8601 timestamp consumed by the renderer." },
    "format_mode": { "type": "string", "enum": ["relative_short", "relative_long", "absolute"], "description": "Output format applied to the timestamp." }
  }
}
```

**Cross-references**:
- No abstract base (flat single-segment chain).
- Related types: Consumed by Grid widget columns via the `renderer` field on `gts.frontx.m.widget.widget.v1~frontx.m.widget.grid.v1~` for cells surfacing timestamps (e.g., oldest-unprocessed-comment age) and by widget kinds whose paired Widget Data exposes ISO-8601 timestamp fields.
- Source: `cpt-frontx-dashboard-fr-cell-formatting` (PRD §5.3 — humanized rendering for durations and ages).

## 7. Acceptance Criteria

- [ ] Every concrete listed in section 6 is authored with its full JSON Schema.
- [ ] Every identifier follows GTS grammar and every `x-gts-ref` resolves to a registered type.
- [ ] No identifier uses the prototype vendor `de` or the `hai3` namespace.
- [ ] `cfs validate --artifact` reports no structural errors for this document.
- [ ] Exactly 9 renderers are authored: `link`, `badge`, `avatar`, `progress`, `sparkline`, `markdown`, `code_diff`, `conditional_badge`, `humanized_age`.
