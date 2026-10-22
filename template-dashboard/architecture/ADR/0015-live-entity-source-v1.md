---
status: accepted
date: 2026-10-05
decision-makers: template-dashboard architecture maintainers
---

# ADR-0015: Live entity source

<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Keep a baked report](#keep-a-baked-report)
  - [TS-internal `EntitySource` loaded in the Worker](#ts-internal-entitysource-loaded-in-the-worker)
  - [Remote query executor](#remote-query-executor)
  - [Typed GTS `EntitySource` contract](#typed-gts-entitysource-contract)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-dashboard-adr-live-entity-source`

## Context and Problem Statement

The Data Query Worker needs entity collections to run queries over. In the reference prototype the data came from a baked report: a payload of entities and pre-computed indices produced ahead of time by a generation worker and downloaded from a CDN. That payload could reach 100 MB including its pre-computed indices, within a 2 GB client memory ceiling. It was parsed in the Worker and made the viewer independent of runtime API calls. The in-browser Worker with indices and these sizing figures are the starting point for this template; the baked report and its generation worker are not carried over.

A template for cloud projects cannot assume a generation pipeline and a CDN. Consumers have their own backend, their own authentication through the shell session, and data that changes. The template needs a way to get entities into the Worker that a consumer can connect to a backend, that a demo can satisfy without a network, and that keeps the query model of ADR-0013 and the lifecycle of ADR-0014 unchanged.

How do entity collections reach the Worker, and what contract does a consumer implement to supply them?

## Decision Drivers

* A consumer connects a backend by implementing one small contract.
* Live data: a dashboard reflects current data for its time window, not a prebuilt snapshot.
* Fast filtering: filter changes other than the time window must run in memory without a new load (`cpt-frontx-dashboard-nfr-filter-latency`).
* Reuse of the shell's same-origin cookie session for the built-in HTTP source, with no credentials handled by the viewer.
* No build-time dependency from the viewer on the opt-in demo package.
* Demo without a backend: fixtures must show loading and error states.
* Simple port: keep the Worker, indices and query execution as they are, and avoid new wire contracts in this stage.

## Considered Options

1. **Keep a baked report** — a prebuilt payload with pre-computed indices, downloaded from a CDN.
2. **TS-internal `EntitySource` loaded in the Worker** — a source loads collections for the dashboard's time window; the Worker builds indices in the browser.
3. **Remote query executor** — a backend endpoint runs queries and returns widget data; the browser holds no entity collections.
4. **Typed GTS `EntitySource` contract** — the source is a GTS-typed contract with a wire format that other runtimes can implement.

## Decision Outcome

Chosen option: "TS-internal `EntitySource` loaded in the Worker", because it replaces the baked report with live loading while keeping the in-browser executor, the query model and the filter latency model unchanged.

The decision:

* `EntitySource.load(entityTypeIds, timeWindow)` returns entity collections. It is a TypeScript interface internal to the viewer; it is not a GTS type.
* On initialization the Worker loads the union of the `input_entity_types` of the dashboard's queries within the dashboard time window (`data_start` and `data_end`), and builds its indices in the browser.
* The Worker reloads only when the global time window changes. Every other filter change runs in memory over the loaded collections.
* Entities returned by a source must carry every derived field their aspects declare. The backend computes derived fields in deployments; fixtures carry them precomputed. No operators are added for this.
* **Selection.** `EntitySource` implementations register by key in a registry compiled into the Worker bundle. The `http` implementation is built in. The Worker's `init` message carries the key of the implementation to use plus its configuration, such as the endpoint, and the Worker resolves the implementation from its registry.
* **HTTP implementation.** It ships with the viewer, runs inside the Worker and supports cookie sessions on the same origin only: the Worker's same-origin requests carry the shell's session cookie, so the Viewer host passes no credential to the Worker. The viewer reads, stores and forwards no credential, and none is placed in Worker messages. Bearer tokens and other session kinds are not supported by the built-in source; a consumer whose shell uses them supplies its own `EntitySource`. Cross-origin cookie sessions are out of scope.
* **Fixture implementation.** It reads bundled seeded JSON, adds a 400 ms default delay, supports `?demoFail=entities` failure injection, and ships with the opt-in demo package. The demo package contributes a separate Worker entry that registers `fixture` in the registry, and it registers the demo GTS instances through its own `mfe.json` schemas, so `dashboard-viewer` has no build-time dependency on `dashboard-demo`.
* A load failure becomes `query.error` with the new code `entity_fetch_failed`; the viewer shows an error state with retry. Authentication failures (HTTP 401 or an expired session) and every other fetch failure map to this code. A partial load counts as failed: the Worker does not run queries over a partly loaded set. A retry repeats the load with the session cookie the browser holds at that moment.
* **Memory ceiling.** Up to 100 MB of entity data as loaded, measured before in-browser indexing, per Viewer host instance; 2 GB of memory for the whole client, covering every open Viewer host with its indices, query buffers and rendered widgets (`cpt-frontx-dashboard-nfr-memory-ceiling`). During a time-window reload the old and new collections briefly coexist, so peak memory is above the steady state.
* A typed wire contract or a remote executor is a later stage and is not part of this decision.

### Consequences

* Good, because consumers connect a backend by implementing one method.
* Good, because data is live for the chosen time window and no generation pipeline or CDN is needed.
* Good, because the Worker, indices and operators of ADR-0013 need no change for live loading.
* Good, because the fixture source exercises loading, delay and failure paths without a backend.
* Bad, because all loaded data must fit in browser memory: up to 100 MB of entity data per Viewer host and 2 GB for the whole client, with a higher peak during a reload (`cpt-frontx-dashboard-nfr-memory-ceiling`).
* Bad, because indices are built in the browser at load time, so initial render depends on load and indexing time (`cpt-frontx-dashboard-nfr-initial-render`).
* Bad, because the contract is TypeScript only; a non-TypeScript backend cannot be checked against a typed schema in this stage.
* Bad, because a time-window change triggers a full reload of the loaded types.
* Neutral, because `entity_fetch_failed` adds one error code to the Worker envelope.
* Bad, because the built-in HTTP source works only with same-origin cookie sessions; a shell that uses bearer tokens or another session kind, or a backend that needs cross-origin cookies, requires a consumer `EntitySource`.
* Good, because the viewer handles no credential at all, so no credential can leak into Worker messages or viewer state.
* Neutral, because selection by key keeps fixture code out of the viewer's Worker bundle at the cost of a second Worker entry in the demo package.

### Confirmation

Confirmed when:

* The Worker's `init` carries an `EntitySource` key and its configuration, the Worker resolves the implementation from its registry, and it requests exactly the union of the dashboard queries' `input_entity_types` for the dashboard time window.
* A test changes a non-time filter and observes no source call, then changes the time window and observes one reload.
* A failing source yields `query.error` with code `entity_fetch_failed` and the viewer shows a retry action; this holds for a 401 response, an expired session and a load that fails part-way.
* The viewer handles no credential: neither the Viewer host nor the Worker reads, receives or keeps one, the HTTP implementation's requests rely on the same-origin session cookie, and no credential appears in `init`, `reload`, `query.request`, `query.response` or `query.error`.
* Peak memory, including a time-window reload, and time to first render are measured on a generated fixture at the ceiling (100 MB of entity data) and recorded against `cpt-frontx-dashboard-nfr-memory-ceiling` and `cpt-frontx-dashboard-nfr-initial-render`.
* The HTTP implementation is in the viewer package and the fixture implementation is only in the demo package; a normal install contains no fixture code.
* `dashboard-viewer` builds without `dashboard-demo`, and only the demo package's Worker entry registers the `fixture` key.
* The fixture source honors the time window, the delay and `?demoFail=entities`.

## Pros and Cons of the Options

### Keep a baked report

* Good, because the viewer needs no runtime API and indices are pre-computed.
* Good, because load time is predictable for a given payload.
* Bad, because it needs a generation pipeline and a CDN that consumers of the template do not have.
* Bad, because data is a snapshot, not live.
* Bad, because the payload format becomes a contract that no consumer backend owns.

### TS-internal `EntitySource` loaded in the Worker

* Good, because a single method connects a backend and the rest of the engine is unchanged.
* Good, because filters other than the time window remain in memory.
* Neutral, because loaded data is bounded by the in-memory ceiling.
* Bad, because indices are built at load time in the browser, and the contract is not language-neutral.

### Remote query executor

A backend endpoint runs queries and returns widget data.

* Good, because the browser would hold no large collections and the memory ceiling would disappear.
* Good, because one backend could serve many clients.
* Bad, because it needs a backend query endpoint the template cannot provide.
* Bad, because a second executor needs a conformance contract with the Worker (ADR-0013 defines a single executor).
* Bad, because every filter change becomes a network round trip.

### Typed GTS `EntitySource` contract

* Good, because any runtime could implement the source against a typed wire format.
* Bad, because it adds a wire contract and versioning before a second implementation exists.
* Bad, because it enlarges the first release beyond the simple port.

## More Information

* A typed wire contract or remote executor can be adopted later by a new ADR that supersedes the TS-internal scope of this one.
* ADR-0014 defines how filter state and the time window drive reloads and re-queries.
* **Review trigger:** revisit if measured peak memory or time to first render at the ceiling misses its budget, if consumers need a non-TypeScript backend checked against a typed contract, or if consumers need bearer-token or cross-origin cookie sessions in the built-in HTTP source.
* **Scope:** how entity collections reach the Worker, the `EntitySource` contract, its two implementations and how one is selected, authentication of the HTTP source and the memory ceiling for loaded data. The query model is in ADR-0013; re-query policy is in ADR-0014.
* **Checklist applicability:** ARCH applicable and addressed above. PERF applicable: load and indexing sit on the initial render path, and the ceiling is measured in Confirmation. SEC applicable: the HTTP source relies on the shell's same-origin cookie session and the viewer handles no credential. REL applicable: failures, including authentication and partial loads, map to `entity_fetch_failed` with retry. DATA applicable at contract level: entities carry their derived fields. INT applicable: the consumer backend connects through `EntitySource`. TEST applicable: fixture failure injection and the ceiling measurement. MAINT applicable: one small TypeScript contract. UX applicable: loading and error states with retry. OPS, COMPL and BIZ not applicable because the template runs no service and processes no data beyond what the consuming backend returns.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements or design elements:

* `cpt-frontx-dashboard-fr-entity-source` — defines the contract, the union load, the two implementations, their selection by key and the cookie-only authentication of the HTTP source.
* `cpt-frontx-dashboard-fr-time-window-reload` — reload happens only on time-window change.
* `cpt-frontx-dashboard-fr-loading-error-states` — loading, `entity_fetch_failed` and retry.
* `cpt-frontx-dashboard-fr-fixture-source` — time window, delay and failure injection.
* `cpt-frontx-dashboard-interface-entity-source` — the interface this decision shapes.
* `cpt-frontx-dashboard-contract-entity-data` — entities carry derived fields.
* `cpt-frontx-dashboard-nfr-memory-ceiling` — 100 MB of loaded entity data per Viewer host and 2 GB for the whole client bound the loaded collections.
* `cpt-frontx-dashboard-nfr-initial-render` — load and indexing sit on the initial render path.
