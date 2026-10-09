---
status: accepted
date: 2026-10-05
decision-makers: template-dashboard architecture maintainers
---

# ADR-0007: Viewer data query layer

**ID**: `cpt-frontx-dashboard-adr-viewer-data-query-layer`

<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Web Worker with in-browser index building](#web-worker-with-in-browser-index-building)
  - [DuckDB-WASM](#duckdb-wasm)
  - [Main-thread filtering with memoization only](#main-thread-filtering-with-memoization-only)
  - [IndexedDB-backed storage with Worker queries](#indexeddb-backed-storage-with-worker-queries)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

## Context and Problem Statement

The Viewer host must filter, group, and aggregate entity collections for many widgets, and a filter change must update the widgets quickly. The data is tabular and relational (pull requests, reviews, commits, and similar entities). Parsing and querying it on the main thread would block the UI.

The earlier DevExpert prototype received a generated report: one payload that already carried pre-computed indices and aggregations, produced by a generation pipeline, and the Viewer made no runtime API calls. The template has no generation pipeline and no report. Entities come from a TS-internal `EntitySource` contract (`load(entityTypeIds, timeWindow)`, see [ADR-0015](0015-live-entity-source-v1.md)), so indices that the prototype computed at generation time must now be built in the browser after loading. The executor remains a single in-browser Worker, as in the prototype.

How does the Viewer host load entity data and answer queries without blocking the main thread?

Constraints and assumptions:

* The query and operator model, and the `query.request`, `query.response`, `query.error` messages, stay as in the prototype (see [ADR-0013](0013-query-operator-cel-v1.md)). The one added error code is `entity_fetch_failed`, for a failed load (defined in ADR-0015).
* `filter_state` and `enumerate_options` stay TS-internal. The Worker computes option lists from the loaded collections.
* FrontX isolates each MFE instance (FrontX ADR-0011), so each Viewer host instance owns its own Worker and its own loaded data.
* The in-memory ceiling is inherited from the prototype and stated in `cpt-frontx-dashboard-nfr-memory-ceiling`: up to 100 MB of loaded data per Viewer host instance, within a 2 GB whole-client memory ceiling. Remote execution, where a backend answers queries, is a later stage and is not part of this decision.

## Decision Drivers

* The main thread stays responsive during loading, parsing, and querying.
* Filter changes produce widget-ready results quickly (see the latency NFR).
* Simplicity: prefer the simplest architecture that meets the requirements.
* Small bundle, because the query layer ships with the Viewer host and is loaded per instance.
* A typed, stable query interface that widgets consume without knowing the storage implementation.
* A consuming backend plugs in through one `EntitySource` contract.

## Considered Options

* Web Worker with in-browser index building
* DuckDB-WASM (in-browser columnar database)
* Main-thread filtering with memoization only
* IndexedDB-backed storage with Worker queries

## Decision Outcome

Chosen option: "Web Worker with in-browser index building", because it removes main-thread blocking with the simplest architecture and no heavy runtime dependency, while leaving the typed query API free to change its backing later.

The decision has these parts:

1. **Load through `EntitySource`.** On init the Worker calls `EntitySource.load` for the union of entity types needed by the dashboard queries, within the dashboard's time window. The `EntitySource` contract, its implementations, credential handling, and the failure code are decided in [ADR-0015](0015-live-entity-source-v1.md); this ADR decides the Worker executor and in-browser indexing. No credentials enter `query.request` or `query.response` messages.
2. **Build indices in the browser.** The Worker builds filter indices and lookup structures after the load completes. No offline step precomputes them, so the cost is paid in the browser on each load.
3. **Query through a thin typed API.** The main thread sends typed `query.request` messages and receives `query.response` or `query.error` messages with small result sets. Widgets reach the API through the Viewer host and do not know about the Worker.
4. **Reload only on time-window change.** A global time-window change triggers a new `EntitySource.load` and an index rebuild. All other filter changes run in memory over the loaded data, with no load.
5. **Failure handling.** A failed load returns `query.error` with `entity_fetch_failed` (ADR-0015). The Viewer host can offer a retry.

The Worker holds all loaded data in memory. The inherited ceiling applies: up to 100 MB of loaded data per Viewer host instance, within a 2 GB whole-client memory ceiling. The 100 MB measures entity data as loaded from `EntitySource`, before in-browser indexing. Parsed objects and indices add to it and count against the 2 GB ceiling. During a time-window reload, peak memory may briefly hold both the old and the new collections, until the new indices are built and the old data is released. Several open viewers share the 2 GB ceiling; their combined use beyond it is outside the supported range. Datasets above the ceiling are not supported, and there is no server-side fallback in this stage. Remote execution is a later stage.

### Consequences

* Good, because loading, parsing, index building, and querying run in the Worker, so the main thread stays responsive.
* Good, because indices turn most filter operations into lookups or small-set intersections.
* Good, because the Worker depends only on the `EntitySource` contract (ADR-0015), so a consumer connects a backend, or runs the template on fixtures, without changing the executor.
* Good, because the Worker is a browser primitive, so no heavy runtime dependency is added.
* Good, because the typed query API can move to DuckDB-WASM or a remote executor later without changing widget code.
* Bad, because the index-building cost moves from an offline pipeline into the browser. It adds load time, and it recurs on each time-window reload.
* Bad, because the live load adds loading, error, and reload states that a precomputed payload would not need. They are handled by the Viewer host UI.
* Bad, because every Viewer host instance has its own Worker and its own copy of loaded data, since FrontX isolates instances. Memory use grows with the number of open viewers, and all of them share the 2 GB whole-client ceiling.
* Bad, because the dataset must fit in browser memory. The inherited ceiling is a hard product limit until remote execution exists.
* Bad, because Worker debugging is less convenient than main-thread debugging. Mitigation: the query API can be tested in isolation.

### Confirmation

Confirmed by code review and by tests:

* Loading and querying run in the Worker, and the main thread is not blocked beyond the budget in `cpt-frontx-dashboard-nfr-initial-render`.
* A filter change that does not touch the time window produces updated results without calling `EntitySource.load`.
* A time-window change calls `EntitySource.load` once and rebuilds indices.
* A failing `EntitySource` yields `entity_fetch_failed` and a retry path, tested with the fixture implementation's failure injection.
* Widgets reach data only through the typed query API.
* `query.request` and `query.response` messages carry no credentials.
* One Viewer host instance loaded with 100 MB of entity data, including one time-window reload, stays within the 2 GB whole-client ceiling.

## Pros and Cons of the Options

### Web Worker with in-browser index building

A Worker that loads through `EntitySource`, builds indices, and serves typed queries.

* Good, because it removes main-thread blocking with the simplest design.
* Good, because it needs no extra runtime dependency.
* Good, because the typed query API is a stable seam for later backends.
* Neutral, because index building happens in the browser on each load.
* Bad, because ad hoc queries not covered by indices may need a scan inside the Worker, which blocks the Worker and not the UI.

### DuckDB-WASM

An in-browser columnar SQL database.

* Good, because ad hoc queries work without hand-built indices.
* Good, because columnar storage can use less memory than JS objects.
* Bad, because the WASM bundle is about 2.5 MB and is loaded per instance.
* Bad, because it adds a complex dependency and its own data format and initialization cost.
* Neutral, because it can be added later behind the same query API.

### Main-thread filtering with memoization only

Selectors and memoization with no Worker.

* Good, because it is the simplest implementation.
* Bad, because parsing and filtering large collections block the UI on every change.
* Bad, because it fails at the data volumes the product targets.

### IndexedDB-backed storage with Worker queries

Persistent browser storage plus Worker queries.

* Good, because data survives reloads and the Worker keeps the UI free.
* Bad, because data is loaded live and does not need persistence, so IndexedDB adds latency and an awkward API for no benefit.

## More Information

* This ADR covers the data query layer. State management is in [ADR-0006](0006-viewer-state-management-v1.md).
* Related ADRs:
  * [ADR-0015](0015-live-entity-source-v1.md): the `EntitySource` contract, its HTTP and fixture implementations, credential handling, and `entity_fetch_failed`; this ADR only consumes the contract.
  * [ADR-0013](0013-query-operator-cel-v1.md): the query and operator model and the `query.request`, `query.response`, `query.error` messages the Worker serves.
  * [ADR-0014](0014-viewer-host-orchestrated-query-lifecycle-v1.md): the Viewer host owns the query lifecycle and is the only caller of the Worker.
* Memory pressure: parsed data can use several times its raw size as JavaScript objects, plus indices. This overhead counts against the 2 GB whole-client ceiling, not against the 100 MB of loaded data. The ceiling is stated as an NFR so that it is visible to consumers.
* Worker failure: if the Worker crashes, the Viewer host detects the failure and offers a reload, in the same way as `entity_fetch_failed`.
* Review trigger: indices cannot cover enough filter operations and scans dominate; data volumes exceed the ceiling and call for remote execution; ad hoc query needs justify DuckDB-WASM.
* Scope: changes the Data Query Worker inside the Viewer host (loading through `EntitySource`, index building, query execution, reload policy). Does not change the `EntitySource` contract, the query message shapes, widget code, or the filter store.
* Checklist applicability:
  * ARCH: applicable, addressed by the decision parts and options.
  * PERF: applicable, main-thread responsiveness, filter latency, index build cost, and the memory ceiling.
  * SEC: applicable, no credentials enter query messages; credential handling is in ADR-0015; data stays in browser memory.
  * REL: applicable, `entity_fetch_failed` with retry and Worker crash recovery.
  * DATA: applicable, data is held in memory only, not persisted, and released when the Viewer host instance unmounts.
  * INT: applicable, the Worker consumes the `EntitySource` seam (ADR-0015) and serves the query messages (ADR-0013).
  * OPS: N/A, because the template is a source overlay with no deployed service; the consuming application owns operations.
  * MAINT: applicable, the typed query API lets the executor move to DuckDB-WASM or remote execution without widget changes.
  * TEST: applicable, see Confirmation, including fixture failure injection.
  * COMPL: N/A, because the template adds no processing of personal data beyond what the consuming backend returns; the consumer owns compliance.
  * UX: applicable, loading, error, and reload states, and a responsive main thread.
  * BIZ: N/A, because this is a technical decision; the memory limit is a product limitation recorded in the PRD.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements or design elements:

* `cpt-frontx-dashboard-fr-entity-source` — the Worker loads entity data through the `EntitySource` contract.
* `cpt-frontx-dashboard-fr-fixture-source` — the fixture implementation of `EntitySource` ships with the opt-in demo.
* `cpt-frontx-dashboard-fr-time-window-reload` — only a global time-window change reloads data.
* `cpt-frontx-dashboard-fr-loading-error-states` — the live load introduces loading, error, and retry states, including `entity_fetch_failed`.
* `cpt-frontx-dashboard-fr-filter-options` — filter options are computed by the Worker from loaded collections.
* `cpt-frontx-dashboard-nfr-memory-ceiling` — the inherited limit of 100 MB of loaded data per Viewer host instance, within a 2 GB whole-client memory ceiling.
* `cpt-frontx-dashboard-nfr-filter-latency` — in-memory queries over built indices serve filter changes.
* `cpt-frontx-dashboard-nfr-initial-render` — loading and parsing in the Worker keep the main thread free during initial render.
* `cpt-frontx-dashboard-interface-entity-source` — the typed seam between the Worker and the consuming backend.
