# Feature: Operator Variants Catalog


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
  - [6.0a Query (abstract base)](#60a-query-abstract-base)
  - [6.0b Operator (abstract base — eighteen inline `oneOf` variants)](#60b-operator-abstract-base--eighteen-inline-oneof-variants)
  - [6.0c Design Note — auto_bucketize placement](#60c-design-note--auto_bucketize-placement)
  - [6.1 Filter (CEL escape hatch)](#61-filter-cel-escape-hatch)
  - [6.2 Project (add field)](#62-project-add-field)
  - [6.3 Group By](#63-group-by)
  - [6.4 Count By Bucket](#64-count-by-bucket)
  - [6.5 Count All](#65-count-all)
  - [6.6 Sum](#66-sum)
  - [6.7 Mean](#67-mean)
  - [6.8 Min](#68-min)
  - [6.9 Max](#69-max)
  - [6.10 Time Bucketize](#610-time-bucketize)
  - [6.11 Join](#611-join)
  - [6.12 Median](#612-median)
  - [6.13 Percentile](#613-percentile)
  - [6.14 Last Non Null](#614-last-non-null)
  - [6.15 Moving Average](#615-moving-average)
  - [6.16 Pivot](#616-pivot)
  - [6.17 Subquery](#617-subquery)
  - [6.18 Auto Bucketize](#618-auto-bucketize)
- [7. Acceptance Criteria](#7-acceptance-criteria)
- [8. Open Questions](#8-open-questions)

<!-- /toc -->

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-featstatus-operator-variants`
## 1. Feature Context

- [ ] `p2` - `cpt-frontx-dashboard-feature-operator-variants`

### 1.1 Overview

This is a **type-catalog feature**, not an actor-flow feature. It enumerates the Query base, the Operator base, and the 18 inline `oneOf` Operator variants of the dashboard template. The FEATURE template's flow, process, and state sections are reduced to stubs; the catalog lives in section 6, Type Catalog.

### 1.2 Purpose

Concrete catalog of the Query and Operator types that DESIGN section 3.1 declares as abstract bases. Lists every Operator variant the Viewer host's Worker recognises at runtime, with the full JSON Schema declaration, ported one-to-one from the prototype with rebased identifiers.

**Declaring package**: `dashboard-viewer`.

**Requirements**: `cpt-frontx-dashboard-fr-type-catalog`, `cpt-frontx-dashboard-fr-widget-catalog`, `cpt-frontx-dashboard-fr-time-bucket-granularity`

**Principles**: `cpt-frontx-dashboard-principle-gts-contracts`

### 1.3 Actors

N/A — type-catalog feature. The catalog is consumed by the runtime type system (Viewer host, Worker, and widget MFEs), not by an end-user actor. No human actor flows are authored.

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md#31-domain-model)
- **Dependencies**: None. Declares `gts.frontx.v.query.query.v1~` and `gts.frontx.v.query.operator.v1~`, which `feature-query-instances`, `feature-widget-catalog`, and `feature-worker-contract-types` reference. The Query base references `gts.frontx.v.filter.filter.v1~` (`feature-filter-catalog`) and `gts.frontx.v.widget_data.<kind>.v1~` (`feature-widget-data-catalog`) by `x-gts-ref` only. Dependency graph: operator-variants has no upstream FEATURE dependency.

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

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-dod-operator-variants-catalog-complete`

The system **MUST** declare the Query base, the Operator base, and all 18 Operator variants in `dashboard-viewer`, and the Worker **MUST** have exactly one handler per `op`.

- Every concrete is authored with a full JSON Schema declaration.
- Every identifier follows the GTS identifier grammar and the ID-form convention of DESIGN section 3.1 (types end with `~`, instances do not).
- Every `x-gts-ref` and `$ref` resolves to a declared type.
- `filter.predicate` is the pipeline-internal CEL predicate; the typed filter system narrows entity collections. The CEL scope of the other expression-typed operator fields is unresolved (see section 8, Open Questions, "Inherited from the prototype").

**Constraints**: `cpt-frontx-dashboard-constraint-gts-id-convention`

## 6. Type Catalog

Variants are inline `oneOf` alternatives: there is no per-variant `$id` and no `~variants` chain suffix. CEL (Common Expression Language) is evaluated only in the `predicate` field of the `filter` operator variant; the other variants carry expression-typed fields that the Worker resolves per its handler, exactly as in the ported prototype schemas below. Each `op` has one Worker handler; an unknown `op` ends the query with `query.error` (DESIGN section 3.1, Operator base). The Query and Operator abstract bases are authored below, followed by the 18 variants.


> **Variants are inline `oneOf` alternatives — there is no per-variant `$id` and no `~variants` chain suffix.** The Query and Operator abstract base schemas are authored below (sections 6.0a and 6.0b); per-variant payload-shape documentation follows.


### 6.0a Query (abstract base)

**GTS ID**: `gts.frontx.v.query.query.v1~`

**Description**: Declarative function definition. A Query consumes ordered normalized entity collections under an active-filter snapshot, walks an Operator pipeline, and produces a Widget Data value typed per `output_widget_data_type`. Specific Queries (PR-status counts, contributor weighted-LOC, action-item roll-ups, etc.) are GTS instances of this type registered by a GTS content package; the widget instance binds to a specific Query via its `query` field.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.v.query.query.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Query",
  "description": "Declarative function definition. A Query consumes ordered normalized entity collections under an active-filter snapshot, walks an Operator pipeline, and produces a Widget Data value typed per output_widget_data_type. Specific Queries (PR-status counts, contributor weighted-LOC, action-item roll-ups, etc.) are GTS instances of this type registered by a GTS content package (DESIGN section 3.1, Instance source); the widget instance binds to a specific Query via its query field.",
  "type": "object",
  "required": ["input_entity_types", "filter_scopes", "output_widget_data_type", "pipeline"],
  "properties": {
    "input_entity_types": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Ordered GTS IDs of normalized entity types this query reads (e.g. gts.frontx.demo.github.pull_request.v1~, gts.frontx.demo.github.commit.v1~). Multi-entity inputs are supported for composite payloads (PR Detail, contributor weighted-LOC across PR + commits + reviews + comments). Validation constrains each entry to a valid `gts.frontx.demo.<entity>.v1~` ID.",
      "x-gts-ref": "gts.*"
    },
    "filter_scopes": {
      "type": "array",
      "items": {
        "type": "string",
        "x-gts-ref": "gts.frontx.v.filter.filter.v1~"
      },
      "description": "GTS IDs of Filter types this query reacts to. Used by the Worker to select which pre-computed indices to apply against the active-filter snapshot (carried by `QueryRequest.filter_state`) before pipeline execution. Each entry is a derivation of the Filter base type (`gts.frontx.v.filter.filter.v1~frontx.demo.filter.<name>.v1~`)."
    },
    "output_widget_data_type": {
      "type": "string",
      "description": "GTS ID of the Widget Data shape produced by this query. MUST equal one of the per-widget-kind chains under gts.frontx.v.widget_data.<kind>.v1~ enumerated in the Widget Data types subsection. Matches the consuming widget kind's declared Widget Data input.",
      "x-gts-ref": "gts.*"
    },
    "pipeline": {
      "type": "array",
      "description": "Ordered list of Operator instances. Each item conforms to one of the oneOf branches of the Operator base schema (discriminated by op). The Worker walks the pipeline in order, dispatches each step to the paired imperative implementation in the Worker bundle, and returns the final value as the typed Widget Data payload.",
      "items": { "$ref": "gts://gts.frontx.v.query.operator.v1~" }
    }
  }
}
```

**Cross-references**:
- Per-dashboard Query instances live in `feature-query-instances` (authored separately; demo instances under `gts.frontx.demo`).
- Conceptual definition: DESIGN.md section 3.1 (Abstract Bases, Query base and Operator base).


### 6.0b Operator (abstract base — eighteen inline `oneOf` variants)

**GTS ID**: `gts.frontx.v.query.operator.v1~`

**Description**: Discriminated-union Operator base type. Every Operator instance is one of the inline `oneOf` branches, discriminated by the `op` field. The branches enumerate the eighteen currently-supported variants (`filter`, `project`, `group_by`, `count_by`, `count_all`, `sum`, `mean`, `min`, `max`, `time_bucketize`, `join`, `median`, `percentile`, `last_non_null`, `moving_average`, `pivot`, `subquery`, `auto_bucketize`); future variants are additive.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.v.query.operator.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Operator",
  "description": "Discriminated-union Operator base type. Every Operator instance is one of the oneOf branches below, discriminated by the op field. The branches enumerate the eighteen currently-supported variants (filter, project, group_by, count_by, count_all, sum, mean, min, max, time_bucketize, join, median, percentile, last_non_null, moving_average, pivot, subquery, auto_bucketize); future variants are additive.",
  "type": "object",
  "required": ["op"],
  "properties": {
    "op": {
      "type": "string",
      "description": "Discriminator. Identifies the variant for both schema validation and Worker dispatch."
    }
  },
  "oneOf": [
    {
      "type": "object",
      "required": ["op", "predicate"],
      "properties": {
        "op": { "const": "filter" },
        "predicate": { "type": "string", "description": "CEL expression evaluated per item in the pipeline's current shape. Pipeline-internal CEL escape hatch ONLY: used at pipeline stages where typed Filter primitives don't apply — namely, post-projection (filter on derived fields added by a prior `project` operator) or post-aggregation (filter aggregated rows; HAVING-style). MUST NOT be used for entity-property narrowing — that is the typed Filter system's responsibility (filter primitives selected by the active-filter snapshot at QueryRequest construction time)." }
      }
    },
    {
      "type": "object",
      "required": ["op", "as", "expr"],
      "properties": {
        "op": { "const": "project" },
        "as": { "type": "string", "description": "Field name to add to each item." },
        "expr": { "type": "string", "description": "CEL expression evaluated against the item; the result is bound to the field named by `as`." }
      }
    },
    {
      "type": "object",
      "required": ["op", "key"],
      "properties": {
        "op": { "const": "group_by" },
        "key": { "type": "string", "description": "CEL expression yielding the grouping key per item; output is a grouped collection that downstream reducers consume." }
      }
    },
    {
      "type": "object",
      "required": ["op", "key", "into"],
      "properties": {
        "op": { "const": "count_by" },
        "key": { "type": "string", "description": "CEL expression yielding the bucket key per item." },
        "into": { "type": "object", "additionalProperties": { "type": "string" }, "description": "Map from result-object field name to expected key-value, declaring the buckets and their output field names." }
      }
    },
    {
      "type": "object",
      "required": ["op", "into"],
      "properties": {
        "op": { "const": "count_all" },
        "into": { "type": "string", "description": "Result-object field name receiving the total count (a number)." }
      }
    },
    {
      "type": "object",
      "required": ["op", "field", "into"],
      "properties": {
        "op": { "const": "sum" },
        "field": { "type": "string", "description": "CEL expression yielding a number per item." },
        "into": { "type": "string", "description": "Result-object field name receiving the sum." }
      }
    },
    {
      "type": "object",
      "required": ["op", "field", "into"],
      "properties": {
        "op": { "const": "mean" },
        "field": { "type": "string", "description": "CEL expression yielding a number per item." },
        "into": { "type": "string", "description": "Result-object field name receiving the arithmetic mean." }
      }
    },
    {
      "type": "object",
      "required": ["op", "field", "into"],
      "properties": {
        "op": { "const": "min" },
        "field": { "type": "string", "description": "CEL expression yielding a number per item." },
        "into": { "type": "string", "description": "Result-object field name receiving the minimum." }
      }
    },
    {
      "type": "object",
      "required": ["op", "field", "into"],
      "properties": {
        "op": { "const": "max" },
        "field": { "type": "string", "description": "CEL expression yielding a number per item." },
        "into": { "type": "string", "description": "Result-object field name receiving the maximum." }
      }
    },
    {
      "type": "object",
      "required": ["op", "time_field", "granularity", "bucket_field"],
      "properties": {
        "op": { "const": "time_bucketize" },
        "time_field": { "type": "string", "description": "CEL expression yielding a timestamp per item." },
        "granularity": { "type": "string", "enum": ["day", "week", "month", "quarter", "year"] },
        "bucket_field": { "type": "string", "description": "Field name on each item receiving the bucket index (ISO date string) according to granularity." }
      }
    },
    {
      "type": "object",
      "required": ["op", "right_input", "left_keys", "right_keys", "embed_field"],
      "properties": {
        "op": { "const": "join" },
        "right_input": {
          "type": "string",
          "description": "GTS ID of the second entity collection to join. The first/left input is the Query's primary `input_entity_types[0]`; this field names the right-side collection (typically another entry in `input_entity_types`). Config-time validation MUST verify the named collection appears in the bound Query's `input_entity_types`.",
          "x-gts-ref": "gts.*"
        },
        "left_keys": {
          "type": "array",
          "items": { "type": "string" },
          "description": "CEL expressions yielding the join key per item in the left collection. MUST have the same length as `right_keys`; the i-th left key joins to the i-th right key (composite-key joins use length > 1)."
        },
        "right_keys": {
          "type": "array",
          "items": { "type": "string" },
          "description": "CEL expressions yielding the join key per item in the right collection. MUST have the same length as `left_keys`."
        },
        "join_type": {
          "type": "string",
          "enum": ["inner", "left"],
          "default": "inner",
          "description": "Join semantics. `inner`: emit only matched pairs. `left`: emit every left item; embed null when no right item matches. Default `inner`."
        },
        "embed_field": {
          "type": "string",
          "description": "Output field name on each emitted record. Each emitted record is the left item with its right-side match (or all matching right-side items, if multiple) embedded under this field. The embedded value is a single object for one-to-one joins or an array for one-to-many joins; the join handler determines cardinality from the data. Composite shape preserved: the left item's fields remain at the top level; only the embedded right-side payload nests under `embed_field`."
        }
      }
    },
    {
      "type": "object",
      "required": ["op", "field", "into"],
      "properties": {
        "op": { "const": "median" },
        "field": { "type": "string", "description": "CEL expression yielding a number per item." },
        "into": { "type": "string", "description": "Result-object field name receiving the median (50th percentile) of the field values across the collection." }
      }
    },
    {
      "type": "object",
      "required": ["op", "field", "p", "into"],
      "properties": {
        "op": { "const": "percentile" },
        "field": { "type": "string", "description": "CEL expression yielding a number per item." },
        "p": {
          "type": "number",
          "exclusiveMinimum": 0,
          "exclusiveMaximum": 1,
          "description": "Percentile to compute, expressed as a fraction in the open interval (0, 1). For example, 0.95 selects the 95th percentile. Bounds enforce strict typing: 0 and 1 are excluded because they would degenerate to min/max, which already have dedicated variants."
        },
        "into": { "type": "string", "description": "Result-object field name receiving the percentile value of the field across the collection." }
      }
    },
    {
      "type": "object",
      "required": ["op", "field", "order_by", "into"],
      "properties": {
        "op": { "const": "last_non_null" },
        "field": { "type": "string", "description": "CEL expression yielding the value to inspect per item. Items whose evaluation yields null are skipped." },
        "order_by": { "type": "string", "description": "CEL expression yielding an orderable scalar per item (typically a timestamp). Items are walked in ascending `order_by` order; the operator emits the most recent non-null `field` value seen so far. Used by time-series widgets to carry the previous observation forward across sparse buckets (gap-fill)." },
        "into": { "type": "string", "description": "Field name added to each emitted item, holding the last non-null `field` value at or before the item's `order_by` position." }
      }
    },
    {
      "type": "object",
      "required": ["op", "field", "order_by", "window", "into"],
      "properties": {
        "op": { "const": "moving_average" },
        "field": { "type": "string", "description": "CEL expression yielding a number per item." },
        "order_by": { "type": "string", "description": "CEL expression yielding an orderable scalar per item (typically a timestamp or bucket index). Items are walked in ascending `order_by` order before the window slides." },
        "window": {
          "type": "integer",
          "minimum": 2,
          "maximum": 365,
          "description": "Trailing window size in items. The operator averages the most recent `window` values of `field` (inclusive of the current item) and emits the result on the current item. Bounds: minimum 2 (a single-item window degenerates to the field value); maximum 365 to cap memory pressure for daily-granularity series spanning at most one year."
        },
        "into": { "type": "string", "description": "Field name added to each emitted item, holding the trailing-window arithmetic mean of `field`." }
      }
    },
    {
      "type": "object",
      "required": ["op", "row_key", "col_key", "value", "into"],
      "properties": {
        "op": { "const": "pivot" },
        "row_key": { "type": "string", "description": "CEL expression yielding the row key per item; distinct values become row labels in the pivoted matrix." },
        "col_key": { "type": "string", "description": "CEL expression yielding the column key per item; distinct values become column labels in the pivoted matrix." },
        "value": {
          "type": "string",
          "description": "CEL expression yielding the cell value (numeric or string) per item. Multiple items sharing the same (row_key, col_key) pair are aggregated by sum if the values are numeric and concatenation is not supported; widgets that need a different aggregation MUST pre-aggregate via `group_by` + reducer before `pivot`."
        },
        "into": { "type": "string", "description": "Result-object field name receiving the pivoted matrix. The matrix shape is a row-keyed map of column-keyed maps of cell values: `{ [row]: { [col]: value } }`. Used by team-by-code-path matrix grids and similar two-axis presentations." }
      }
    },
    {
      "type": "object",
      "required": ["op", "filter", "ops", "into"],
      "properties": {
        "op": { "const": "subquery" },
        "filter": { "type": "string", "description": "CEL expression evaluated per item in the parent pipeline's current shape. Items for which the predicate is true are routed into the sub-pipeline; items for which it is false are passed through unchanged. Used by roll-ups that need a narrowed-then-aggregated view side-by-side with the unfiltered population (e.g., per-user action-items count)." },
        "ops": {
          "type": "array",
          "minItems": 1,
          "description": "Typed array of nested Operator instances forming the depth-1 sub-pipeline. Each element conforms to one of the Operator base's inline oneOf branches (per gts-spec §3.7 instance form: typed references to the same GTS type are resolved against the discriminated-union schema). Depth is limited to 1: nested `subquery` operators are NOT permitted within `ops`. Config-time validation MUST reject any element whose `op` is `subquery`.",
          "items": { "allOf": [{ "$ref": "gts://gts.frontx.v.query.operator.v1~" }, { "not": { "properties": { "op": { "const": "subquery" } }, "required": ["op"] } }] }
        },
        "into": { "type": "string", "description": "Field name added to each emitted parent item, holding the sub-pipeline's output value (typed per the last sub-pipeline operator's emitted shape)." }
      }
    },
    {
      "type": "object",
      "required": ["op", "time_field", "granularity", "bucket_field"],
      "properties": {
        "op": { "const": "auto_bucketize" },
        "time_field": { "type": "string", "description": "CEL expression yielding a timestamp per item." },
        "granularity": {
          "type": "string",
          "const": "auto",
          "description": "Discriminator literal `auto` selecting adaptive binning: the Worker selects a concrete bucket size (one of `day` / `week` / `month` / `quarter` / `year`) at request time from the active filter snapshot's date-range size. Distinct from `time_bucketize`, whose `granularity` is a fixed enum chosen at authoring time."
        },
        "bucket_field": { "type": "string", "description": "Field name on each item receiving the bucket index (ISO date string) at the runner-selected granularity." }
      }
    }
  ]
}
```

**Cross-references**:
- Per-variant payload-shape documentation lives in §6.1–§6.18 below.
- Conceptual definition: DESIGN.md section 3.1 (Abstract Bases, Query base and Operator base).


### 6.0c Design Note — auto_bucketize placement

`auto_bucketize` is authored as a separate inline `oneOf` variant, not folded into `time_bucketize` as a `granularity: "auto"` parameter mode. Justification: keeping the two variants separate preserves `time_bucketize.granularity` as a strict fixed enum (`day` / `week` / `month` / `quarter` / `year`) and lets `auto_bucketize.granularity` be a typed `const "auto"` literal — so each variant's parameter shape is fully and orthogonally typed, with no enum-plus-special-string union. The runtime dispatch is also qualitatively different: `time_bucketize`'s handler reads a fixed enum at compile time, while `auto_bucketize`'s handler inspects the active filter snapshot's date-range size to select the concrete bucket size at request time.


### 6.1 Filter (CEL escape hatch)


**Discriminator**: `op == "filter"`

**Description**: Pipeline-internal CEL escape hatch for post-projection / post-aggregation predicates only. MUST NOT be used for entity-property narrowing — that is the typed Filter system's job (filter primitives selected by the active-filter snapshot at QueryRequest construction time).

**Required fields**:
- `op (const "filter")`
- `predicate (CEL string)`

**Cross-reference**: Operator base — `gts.frontx.v.query.operator.v1~` declared in section 6.0b above.

### 6.2 Project (add field)


**Discriminator**: `op == "project"`

**Description**: Add a new field to each item via a CEL expression.

**Required fields**:
- `op (const "project")`
- `as (field name)`
- `expr (CEL string)`

**Cross-reference**: Operator base — `gts.frontx.v.query.operator.v1~` declared in section 6.0b above.

### 6.3 Group By


**Discriminator**: `op == "group_by"`

**Description**: Group items by CEL key expression. Output consumed by downstream reducers.

**Required fields**:
- `op (const "group_by")`
- `key (CEL string)`

**Cross-reference**: Operator base — `gts.frontx.v.query.operator.v1~` declared in section 6.0b above.

### 6.4 Count By Bucket


**Discriminator**: `op == "count_by"`

**Description**: Count items per bucket key, producing a result object with per-bucket fields.

**Required fields**:
- `op (const "count_by")`
- `key (CEL string)`
- `into (map: result-field-name → expected-key-value)`

**Cross-reference**: Operator base — `gts.frontx.v.query.operator.v1~` declared in section 6.0b above.

### 6.5 Count All


**Discriminator**: `op == "count_all"`

**Description**: Total count over the entire collection.

**Required fields**:
- `op (const "count_all")`
- `into (result-field-name)`

**Cross-reference**: Operator base — `gts.frontx.v.query.operator.v1~` declared in section 6.0b above.

### 6.6 Sum


**Discriminator**: `op == "sum"`

**Description**: Sum a numeric CEL expression over the collection.

**Required fields**:
- `op (const "sum")`
- `field (CEL string)`
- `into (result-field-name)`

**Cross-reference**: Operator base — `gts.frontx.v.query.operator.v1~` declared in section 6.0b above.

### 6.7 Mean


**Discriminator**: `op == "mean"`

**Description**: Arithmetic mean of a numeric CEL expression over the collection.

**Required fields**:
- `op (const "mean")`
- `field (CEL string)`
- `into (result-field-name)`

**Cross-reference**: Operator base — `gts.frontx.v.query.operator.v1~` declared in section 6.0b above.

### 6.8 Min


**Discriminator**: `op == "min"`

**Description**: Minimum of a numeric CEL expression over the collection.

**Required fields**:
- `op (const "min")`
- `field (CEL string)`
- `into (result-field-name)`

**Cross-reference**: Operator base — `gts.frontx.v.query.operator.v1~` declared in section 6.0b above.

### 6.9 Max


**Discriminator**: `op == "max"`

**Description**: Maximum of a numeric CEL expression over the collection.

**Required fields**:
- `op (const "max")`
- `field (CEL string)`
- `into (result-field-name)`

**Cross-reference**: Operator base — `gts.frontx.v.query.operator.v1~` declared in section 6.0b above.

### 6.10 Time Bucketize


**Discriminator**: `op == "time_bucketize"`

**Description**: Bucket each item into day / week / month / quarter / year by a time CEL expression.

**Required fields**:
- `op (const "time_bucketize")`
- `time_field (CEL string)`
- `granularity (enum)`
- `bucket_field (string)`

**Cross-reference**: Operator base — `gts.frontx.v.query.operator.v1~` declared in section 6.0b above.

### 6.11 Join


**Discriminator**: `op == "join"`

**Description**: Join two entity collections by paired key expressions.

**Required fields**:
- `op (const "join")`
- `right_input (GTS ID of right collection)`
- `left_keys / right_keys (CEL string arrays)`
- `join_type (enum: inner | left)`
- `embed_field (string)`

**Cross-reference**: Operator base — `gts.frontx.v.query.operator.v1~` declared in section 6.0b above.

### 6.12 Median


**Discriminator**: `op == "median"`

**Description**: Statistical median (50th percentile) of a numeric CEL expression over the collection. Used by per-author and per-reviewer summary grids that report central-tendency statistics alongside min/max.

**Required fields**:
- `op (const "median")`
- `field (CEL string)`
- `into (result-field-name)`

**Source**: `cpt-frontx-dashboard-fr-widget-catalog`

**Cross-reference**: Operator base — `gts.frontx.v.query.operator.v1~` declared in section 6.0b above.

### 6.13 Percentile


**Discriminator**: `op == "percentile"`

**Description**: Generic percentile of a numeric CEL expression over the collection. The percentile is parameterized by `p` (a number strictly between 0 and 1). Used by summary grids that report tail-latency statistics (for example, p95 review turnaround) and by widgets that need configurable quantile cutoffs.

**Required fields**:
- `op (const "percentile")`
- `field (CEL string)`
- `p (number, 0 < p < 1)`
- `into (result-field-name)`

**Source**: `cpt-frontx-dashboard-fr-widget-catalog`

**Cross-reference**: Operator base — `gts.frontx.v.query.operator.v1~` declared in section 6.0b above.

### 6.14 Last Non Null


**Discriminator**: `op == "last_non_null"`

**Description**: Carry the most recent non-null value of a CEL expression forward across a sequence ordered by `order_by`. Used by time-bucketed widgets to gap-fill sparse series — for instance, a metric that is recorded only on observation days carries its previous value into bucket positions where no observation exists.

**Required fields**:
- `op (const "last_non_null")`
- `field (CEL string)`
- `order_by (CEL string)`
- `into (added-field-name)`

**Source**: `cpt-frontx-dashboard-fr-widget-catalog`

**Cross-reference**: Operator base — `gts.frontx.v.query.operator.v1~` declared in section 6.0b above.

### 6.15 Moving Average


**Discriminator**: `op == "moving_average"`

**Description**: Trailing-window arithmetic mean of a numeric CEL expression, applied per item after items are sorted by `order_by`. The window is a fixed positive integer ≥ 2 and ≤ 365. Used by chart trend-lines (the predefined catalog's "commit activity with moving averages" entry) and by smoothing overlays on time-bucketed series.

**Required fields**:
- `op (const "moving_average")`
- `field (CEL string)`
- `order_by (CEL string)`
- `window (integer, 2 ≤ window ≤ 365)`
- `into (added-field-name)`

**Source**: `cpt-frontx-dashboard-fr-widget-catalog`

**Cross-reference**: Operator base — `gts.frontx.v.query.operator.v1~` declared in section 6.0b above.

### 6.16 Pivot


**Discriminator**: `op == "pivot"`

**Description**: Pivot a flat collection into a two-axis matrix keyed by `row_key` × `col_key`, with `value` populating each cell. Multiple items sharing the same (row, col) pair are aggregated by sum when `value` is numeric; widgets that need a non-sum aggregation MUST pre-aggregate via `group_by` + a reducer before `pivot`. Used by matrix-style grids — the predefined catalog's team × code-path statistics grid is the canonical use case.

**Required fields**:
- `op (const "pivot")`
- `row_key (CEL string)`
- `col_key (CEL string)`
- `value (CEL string)`
- `into (result-field-name; matrix `{[row]: {[col]: value}}`)`

**Source**: `cpt-frontx-dashboard-fr-widget-catalog`

**Cross-reference**: Operator base — `gts.frontx.v.query.operator.v1~` declared in section 6.0b above.

### 6.17 Subquery


**Discriminator**: `op == "subquery"`

**Description**: Run a typed sub-pipeline against the items selected by `filter`, embedding the sub-pipeline's output under the `into` field on each emitted parent item. Items for which `filter` is false are passed through unchanged. Used by roll-up widgets that compute a narrowed-then-aggregated view on top of the parent stream — the predefined catalog's per-user Action Items grid is the canonical use case (per-user counts of items matching specific status filters). Depth is strictly limited to 1: a `subquery` MUST NOT contain another `subquery` in its `ops` array; the type system validation enforces this.

**Required fields**:
- `op (const "subquery")`
- `filter (CEL string)`
- `ops (typed array of Operator instances; depth-1, no nested `subquery`)`
- `into (added-field-name)`

**Source**: `cpt-frontx-dashboard-fr-widget-catalog`

**Cross-reference**: Operator base — `gts.frontx.v.query.operator.v1~` declared in section 6.0b above.

### 6.18 Auto Bucketize


**Discriminator**: `op == "auto_bucketize"`

**Description**: Time-bucketize each item where the bucket size is selected at request time by the Worker from the active filter snapshot's date-range size, rather than fixed at authoring time. The `granularity` discriminator is the literal `"auto"`; the resolved concrete granularity (day / week / month / quarter / year) is chosen by the Worker per request. Used by adaptive time-series widgets that respect the user-selectable bucket-granularity FR's default-when-unset clause. See the §"Design Note — auto_bucketize placement" in section 6.0c for the rationale on why this is a separate variant rather than a `granularity: "auto"` parameter of `time_bucketize`.

**Required fields**:
- `op (const "auto_bucketize")`
- `time_field (CEL string)`
- `granularity (const "auto")`
- `bucket_field (string)`

**Source**: `cpt-frontx-dashboard-fr-time-bucket-granularity`

**Cross-reference**: Operator base — `gts.frontx.v.query.operator.v1~` declared in section 6.0b above.

## 7. Acceptance Criteria

- [ ] Every concrete listed in this catalog is authored with its full schema
- [ ] Every concrete passes GTS identifier grammar and `x-gts-ref` validation
- [ ] Every type identifier ends with `~`, every instance identifier does not, and every identifier carries `v1`
- [ ] `cfs validate --artifact` on this file reports PASS

## 8. Open Questions

- **Inherited from the prototype**: operator fields other than `filter.predicate` (`project.expr`, `group_by.key`, `count_by.key`, aggregate `field`, `order_by`, `join` keys, `pivot` keys/value, `subquery.filter`, `time_field`) are described as CEL/expression strings, while ADR-0013 says CEL is used only in `filter.predicate`. Open: either ADR-0013 is amended to allow expressions in these fields, or the fields become field paths or typed forms.
