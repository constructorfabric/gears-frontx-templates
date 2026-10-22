# Feature: Worker Contract Types Catalog


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
  - [6.1 QueryRequest](#61-queryrequest)
  - [6.2 QueryResponse](#62-queryresponse)
  - [6.3 QueryError](#63-queryerror)
  - [6.4 enumerate_options (TS-Internal Viewer Host and Worker Method)](#64-enumerate_options-ts-internal-viewer-host-and-worker-method)
- [Open Questions](#open-questions)
- [7. Acceptance Criteria](#7-acceptance-criteria)

<!-- /toc -->

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-featstatus-worker-contract-types`
## 1. Feature Context

- [ ] `p2` - `cpt-frontx-dashboard-feature-worker-contract-types`

### 1.1 Overview

This is a **type-catalog feature**, not an actor-flow feature. It enumerates the GTS-typed Worker message envelopes (`query.request`, `query.response`, `query.error`) and documents the TS-internal `enumerate_options` method. The FEATURE template's flow, process, and state sections are reduced to stubs; the catalog lives in section 6, Type Catalog.

### 1.2 Purpose

Concrete catalog of the Viewer host to Worker boundary contracts of DESIGN section 3.3 (Worker Messages): (a) GTS-typed postMessage envelopes that carry the widget-driving Query mechanism, and (b) the TS-internal `enumerate_options` method whose data never reaches an MFE and therefore carries no GTS ID or schema. Delta against the prototype: `query.error.code` gains `entity_fetch_failed`, `cel_evaluation_error` stays an inherited code, and the Worker is fed by `EntitySource` (ADR-0015), not by a report URL. `filter_state` and `enumerate_options` stay TS-internal.

**Declaring package**: `dashboard-viewer`.

**Requirements**: `cpt-frontx-dashboard-fr-type-catalog`, `cpt-frontx-dashboard-fr-entity-source`, `cpt-frontx-dashboard-fr-filter-options`

**Principles**: `cpt-frontx-dashboard-principle-per-instance-isolation`, `cpt-frontx-dashboard-principle-gts-contracts`

### 1.3 Actors

N/A — type-catalog feature. The catalog is consumed by the runtime type system (Viewer host, Worker, and widget MFEs), not by an end-user actor. No human actor flows are authored.

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md#31-domain-model)
- **Dependencies**: None; the three envelopes are single-segment chains. Related declarations: `gts.frontx.v.query.query.v1~` (`feature-operator-variants`) and `gts.frontx.v.widget_data.<kind>.v1~` (`feature-widget-data-catalog`), referenced by prose and `x-gts-ref` only. Dependency graph: worker-contract-types has no upstream FEATURE dependency.

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

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-dod-worker-contract-types-catalog-complete`

The system **MUST** declare `gts.frontx.v.query.request.v1~`, `gts.frontx.v.query.response.v1~`, and `gts.frontx.v.query.error.v1~` in `dashboard-viewer`, with `query.error.code` limited to the five codes of DESIGN section 3.3, and **MUST NOT** give `filter_state` or `enumerate_options` a GTS ID.

- Every concrete is authored with a full JSON Schema declaration.
- Every identifier follows the GTS identifier grammar and the ID-form convention of DESIGN section 3.1 (types end with `~`, instances do not).
- Every `x-gts-ref` and `$ref` resolves to a declared type.
- `query.error.code` takes exactly one of `query_not_registered`, `operator_not_registered`, `entity_data_missing`, `cel_evaluation_error`, or `entity_fetch_failed`.

**Constraints**: `cpt-frontx-dashboard-constraint-gts-id-convention`

## 6. Type Catalog

### 6.1 QueryRequest

**GTS ID**: `gts.frontx.v.query.request.v1~`

**Description**: Viewer host-to-Worker request envelope. Binds a registered Query GTS ID to an active-filter snapshot. The active-filter snapshot is a TS-internal Viewer host and Worker structure (no GTS type) carried as a loosely-typed `filter_state` object on the request envelope.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.v.query.request.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "QueryRequest",
  "description": "Viewer host-to-Worker request envelope. The Viewer host constructs a QueryRequest by binding a registered Query GTS ID to an active-filter snapshot; the Worker resolves the bound Query, executes its pipeline against the filter-narrowed entity collections, and returns a QueryResponse carrying the typed Widget Data. The contract is internal Viewer host and Worker (postMessage); GTS-typing remains for postMessage validation but the inner filter_state shape is the TypeScript-internal contract.",
  "type": "object",
  "required": ["query", "filter_state"],
  "properties": {
    "query": {
      "type": "string",
      "description": "GTS ID of the registered Query instance to execute. MUST resolve to an instance derived from `gts.frontx.v.query.query.v1~` registered by a GTS content package.",
      "x-gts-ref": "gts.*"
    },
    "filter_state": {
      "type": "object",
      "description": "Active-filter snapshot at the time of query construction. Concrete shape is the Viewer host and Worker TypeScript-internal contract (no GTS type; both share a TS module). The Worker reads the relevant filter values from this object during pipeline execution and uses them to select pre-computed indices per the Query's declared `filter_scopes`."
    }
  }
}
```

**Cross-references**:
- No abstract base (flat single-segment chain).
- Related types: `gts.frontx.v.query.query.v1~` (`feature-operator-variants`, section 6.0a)

### 6.2 QueryResponse

**GTS ID**: `gts.frontx.v.query.response.v1~`

**Description**: Worker-to-Viewer host success envelope. Carries the typed Widget Data instance produced by walking the bound Query's pipeline over the collections loaded by `EntitySource` (ADR-0015).

**Schema**:

```json
{
  "$id": "gts://gts.frontx.v.query.response.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "QueryResponse",
  "description": "Worker-to-Viewer host success envelope. Carries the typed Widget Data instance produced by walking the bound Query's pipeline. The widget_data value is a GTS instance whose type chain equals the bound Query's output_widget_data_type. The Viewer host delivers widget_data to the requesting widget via the `set_data` host action (declared in `feature-extension-domain-catalog`).",
  "type": "object",
  "required": ["widget_data"],
  "properties": {
    "widget_data": {
      "type": "object",
      "description": "Typed Widget Data instance. Schema chain MUST equal the bound Query's output_widget_data_type (one of the per-kind chains under gts.frontx.v.widget_data.<kind>.v1~). The instance carries the data fields declared by the matching Widget Data schema."
    }
  }
}
```

**Cross-references**:
- No abstract base (flat single-segment chain).
- Related types: `gts.frontx.v.widget_data.<kind>.v1~` (`feature-widget-data-catalog`)

### 6.3 QueryError

**GTS ID**: `gts.frontx.v.query.error.v1~`

**Description**: Worker-to-Viewer host failure envelope. Returned in place of a QueryResponse when the Worker cannot produce typed Widget Data. Delta against the prototype: `code` gains `entity_fetch_failed` (the `EntitySource` load failed, including auth failures, partial loads, and an expired load timeout); `cel_evaluation_error` stays an inherited code.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.v.query.error.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "QueryError",
  "description": "Worker-to-Viewer host failure envelope. Returned in place of a QueryResponse when the Worker cannot produce typed Widget Data (Query not registered, operator not registered, CEL evaluation error, entity-data missing, entity fetch failed). References the originating QueryRequest's query and filter_state so the Viewer host can surface diagnostic context to the requesting widget.",
  "type": "object",
  "required": ["query", "filter_state", "code", "message"],
  "properties": {
    "query": {
      "type": "string",
      "description": "GTS ID of the Query the failed request targeted (echo of the request's `query` field).",
      "x-gts-ref": "gts.*"
    },
    "filter_state": {
      "type": "object",
      "description": "Active-filter snapshot from the failed request (echo of the request's `filter_state` field). Concrete shape is the TypeScript-internal contract (no GTS type)."
    },
    "code": {
      "type": "string",
      "enum": ["query_not_registered", "operator_not_registered", "entity_data_missing", "cel_evaluation_error", "entity_fetch_failed"],
      "description": "Machine-readable error code identifying the failure category."
    },
    "message": {
      "type": "string",
      "description": "Human-readable error message describing the failure."
    }
  }
}
```

**Cross-references**:
- No abstract base (flat single-segment chain).
- The Worker is fed by `EntitySource` (ADR-0015), not by a report URL; `entity_fetch_failed` reports a failed `EntitySource.load` (DESIGN section 3.3, EntitySource Load).

### 6.4 enumerate_options (TS-Internal Viewer Host and Worker Method)

**TS-internal contract — NOT GTS-typed by design.** The Viewer host and the Worker share a TypeScript module; this method has no GTS ID, no JSON Schema, and no Widget Data envelope. GTS-typing is reserved for envelopes whose payloads cross the Viewer host to MFE boundary; conversations between the Viewer host and the Worker whose data never reaches an MFE are TS-internal. The precedent is `filter_state`: the active-filter snapshot that QueryRequest (6.1) carries is the same kind of TS-internal contract, and `enumerate_options` follows the same pattern.

**Description**: Worker method the Viewer host calls when populating the option-chip list of a multiselect filter aspect on the Filter Panel (host chrome, not a widget MFE). The Worker reads the requested aspect's fields off the entity collections under the active filter snapshot and returns one row per distinct option with the underlying `value`, the human-readable `label`, and the `count` of records currently matching that option. On selection the chosen `value` is fed into the matching filter predicate's parameter, the filter state rebuilds, and downstream queries re-execute.

**Inputs**:
- `aspect_id` (string) — GTS ID resolving to a `gts.frontx.demo.entity_aspect.<name>.v1~` aspect (`feature-aspect-catalog`).
- `filter_state` (object) — the same TS-internal active-filter snapshot QueryRequest carries (6.1). The Worker uses it to narrow entity collections before counting.

**Output**: `Array<{value: string, label: string, count: integer}>` — one entry per distinct option for the requested aspect under the supplied snapshot. Per-aspect ordering (typically count-descending then label-ascending) is the Worker's responsibility; the Viewer host preserves the array order.

**Explicit non-modeling**:
- **Not a Query instance.** A Query is widget-driving by definition: it requires `output_widget_data_type` pointing at a Widget Data shape, and option enumeration never produces Widget Data.
- **Not a Widget Data shape.** Widget Data is one shape per widget kind and crosses the Viewer host to MFE boundary through `set_data`; the Filter Panel is host chrome, not a widget kind.
- **No postMessage envelope GTS type.** GTS-typed envelopes exist because their payloads originate from or terminate at an MFE; `enumerate_options` is internal to the Viewer host and the Worker.

**Cross-references**:
- No abstract base. No GTS ID — TS-internal contract.
- Parallel TS-internal contract: `filter_state` on QueryRequest (6.1).
- Source requirement: `cpt-frontx-dashboard-fr-filter-options`.

## Open Questions

- The prototype's illustrative TypeScript signature for `enumerate_options` is not ported; the exact TS module shape is left to implementation.

## 7. Acceptance Criteria

- [ ] Every concrete listed in this catalog is authored with its full schema
- [ ] Every concrete passes GTS identifier grammar and `x-gts-ref` validation
- [ ] Every type identifier ends with `~`, every instance identifier does not, and every identifier carries `v1`
- [ ] `cfs validate --artifact` on this file reports PASS
- [ ] `query.error.code` includes `entity_fetch_failed` and keeps `cel_evaluation_error`
- [ ] `filter_state` and `enumerate_options` have no GTS ID or JSON Schema of their own
