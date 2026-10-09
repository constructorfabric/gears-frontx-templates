---
status: accepted
date: 2026-10-05
decision-makers: template-dashboard architecture maintainers
---

# ADR-0013: Query, operator and CEL

<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Per-aggregate TypeScript producers](#per-aggregate-typescript-producers)
  - [First-class Query and Operator types with CEL inside operators](#first-class-query-and-operator-types-with-cel-inside-operators)
  - [First-class Query and Operator types with another expression language](#first-class-query-and-operator-types-with-another-expression-language)
  - [Query type with opaque imperative bodies](#query-type-with-opaque-imperative-bodies)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-dashboard-adr-query-operator-cel`

## Context and Problem Statement

A dashboard shows many analytics: counts, groupings, time series, joins across entity types, rankings. Each widget needs a value shaped for its kind from the entity collections and the active filters. The same primitives (filter, project, group, count, sum, bucket by time) recur in nearly every analytic. If every analytic is its own TypeScript producer, the code grows with the analytic count, queries cannot be addressed by ID, and a new analytic needs a rebuild of the code that runs it.

The reference prototype computes widget values with one producer module per aggregate type. The template needs a model where an analytic is data, widgets reference it by ID, and the code that runs it stays small and stable. The model must run in a browser Web Worker, so the expression language used for predicates and keys must be pure, terminating and safe for author-controlled strings.

Which model describes analytics so they are declarative, typed and reusable, and which expression language goes inside them?

## Decision Drivers

* Composition over duplication: a small, stable set of primitives that analytics compose by reference.
* Addressability: each query is a typed instance with a stable ID, declaring the entity types it reads, the filter scopes it reacts to and the widget data type it returns, so the runtime validates and routes without reading code.
* Queries are data: a consumer adds an analytic by shipping a query instance, without rebuilding the Worker bundle.
* Embedded-safe expressions: terminating, pure, mature, evaluable in a Web Worker, easy for people and AI assistants to author.
* Compatibility with the FrontX type system: new types are GTS-typed, carry frozen `v1~` suffixes and fit the `frontx.v.*` naming used by the template (`cpt-frontx-dashboard-fr-type-catalog`).

## Considered Options

1. **Per-aggregate TypeScript producers** — one module per aggregate type, no query or operator types.
2. **First-class Query and Operator types with CEL inside operators** — a query is a declarative pipeline of operator instances; each operator kind has a schema and a paired implementation in the Worker bundle.
3. **First-class Query and Operator types with another expression language** — same decomposition with JSONata, JsonLogic or a custom mini-DSL for expressions.
4. **Query type with opaque imperative bodies** — each query references a TypeScript function, with no operator type and no expression language.

## Decision Outcome

Chosen option: "First-class Query and Operator types with CEL inside operators", because it is the only option that makes analytics addressable, typed and shippable as data (drivers 1 to 3) while giving the Worker a safe, mature expression language (driver 4).

The decision:

* `gts.frontx.v.query.query.v1~` is the Query type. An instance declares `input_entity_types`, `filter_scopes`, `output_widget_data_type` and an ordered `pipeline` of operator instances. Widgets reference a query by its instance ID.
* `gts.frontx.v.query.operator.v1~` is the Operator type: one type with 18 inline `oneOf` variants keyed by `op` — `filter`, `project`, `group_by`, `count_by`, `count_all`, `sum`, `mean`, `min`, `max`, `time_bucketize`, `join`, `median`, `percentile`, `last_non_null`, `moving_average`, `pivot`, `subquery`, `auto_bucketize`. The catalog is adopted as one fixed set.
* CEL is used only in `op=filter.predicate`. No other operator field evaluates an expression string. A predicate that fails to compile or to evaluate ends the query with `query.error`, code `cel_evaluation_error`, an inherited `query.error` code. Expressions see only the values the `filter` handler binds for the entity under test; no host object, such as Worker globals, network or storage access, is exposed to them.
* Operator schemas are data inside query instances. Operator implementations are code in the Worker bundle, keyed by `op`. Adding a query that composes existing operators ships as data. Adding an operator kind needs a schema variant and a Worker handler.
* The envelopes `gts.frontx.v.query.request.v1~`, `gts.frontx.v.query.response.v1~` and `gts.frontx.v.query.error.v1~` remain the messages between the Viewer host and the Worker. `query.error.code` keeps its inherited values `query_not_registered`, `operator_not_registered`, `entity_data_missing` and `cel_evaluation_error`, and gains one new value, `entity_fetch_failed`, raised when the Worker cannot load entity collections (see ADR-0015).
* The Worker runs queries over entity collections loaded through `EntitySource` (ADR-0015). There is a single executor, so no cross-executor conformance contract is defined.

### Consequences

* Good, because the per-aggregate producer surface is replaced by 18 operator handlers and a query catalog that grows as data.
* Good, because queries are addressable and typed; a build-time check can validate each query against its widget kind's data shape.
* Good, because CEL is a mature, pure and terminating language already used for admission policies and access conditions.
* Good, because one executor keeps the contract small; there is nothing to keep in step across implementations.
* Bad, because CEL adds a compiler to the Worker bundle, loaded lazily on first use; its size must be measured against `cpt-frontx-dashboard-nfr-bundle-budget`.
* Bad, because every `oneOf` variant needs a matching Worker handler; the registry must reject unknown operators with a `query.error`.
* Bad, because a new operator kind is a first-party change touching schema and Worker code; consumers extend through queries only.
* Neutral, because per-step dispatch replaces one producer call per analytic; the work done is the same.

### Confirmation

Confirmed when:

* Both types exist under `gts.frontx.v.query.*` with the declared fields, and the operator type has exactly the 18 `op` variants listed.
* Every `op` variant has a registered Worker handler; a query naming an unregistered operator yields `query.error` instead of a skipped step.
* CEL evaluation appears only in the `filter` handler; code review rejects expression evaluation in other handlers.
* The Worker returns `query.error` with code `entity_fetch_failed` when entity loading fails.
* A test with a malformed predicate (a syntax error, and an expression that fails at evaluation time, such as a type mismatch) gets `query.error` with code `cel_evaluation_error`, and the Worker keeps serving other queries.
* The gzipped size of the Worker's lazily loaded CEL chunk is recorded and checked against `cpt-frontx-dashboard-nfr-bundle-budget` once open question Q1 sets the figure.
* Filter-latency tests at the memory ceiling include at least one query with a CEL predicate (`cpt-frontx-dashboard-nfr-filter-latency`).
* The type catalog validates every demo query instance against its `output_widget_data_type`.

## Pros and Cons of the Options

### Per-aggregate TypeScript producers

One producer per aggregate type; the Worker dispatches a request to the matching producer.

* Good, because there is no indirection and a producer can be tuned for its own shape.
* Bad, because every analytic re-implements the same primitives.
* Bad, because analytics are not addressable, so widgets lose a typed anchor on the data side.
* Bad, because adding an analytic needs a Worker rebuild.

### First-class Query and Operator types with CEL inside operators

Queries are instances; operators are a discriminated union; CEL covers the one predicate position.

* Good, because analytics compose primitives by reference and ship as data.
* Good, because the expression language is safe to run on author-controlled strings in a Worker.
* Neutral, because schema and handler are paired and need a completeness check.
* Bad, because of the CEL bundle cost and the two-part operator change.

### First-class Query and Operator types with another expression language

The same decomposition using JSONata, JsonLogic or a custom DSL.

* Good, because JSONata is smaller than CEL and JsonLogic is smaller still.
* Neutral, because both express the predicates needed here.
* Bad, because JsonLogic is awkward for non-trivial predicates and has weak typing.
* Bad, because a custom DSL adds a language to design, document and maintain.
* Bad, because JSONata is less established for sandboxed evaluation of author-supplied strings.

### Query type with opaque imperative bodies

Each query points at a TypeScript function; there is no per-step composition.

* Good, because queries are addressable.
* Bad, because the body is opaque: no composition, no static validation, no reuse of primitives.
* Bad, because new analytics are code, so they cannot ship as data.

## More Information

* The operator catalog is fixed at 18 variants for this template; changing membership is a new decision.
* ADR-0014 defines who builds and sends query requests; ADR-0015 defines where the entity collections come from.
* Field-level schemas of each operator belong in the DESIGN and the type-catalog feature, not in this record.
* **Review trigger:** revisit if the CEL chunk cannot fit the bundle budget set for open question Q1, if predicates with CEL miss the filter-latency budget at the ceiling, or if analytics need expressions outside `filter.predicate`.
* **Scope:** the query and operator model and the expression language inside it. Request delivery is in ADR-0014; entity loading is in ADR-0015.
* **Checklist applicability:** ARCH applicable and addressed above. PERF applicable: CEL chunk size and predicate cost are checked in Confirmation. SEC applicable: expressions are author-controlled strings, CEL is pure and terminating, and no host object is exposed. REL applicable: compile and evaluation failures return `query.error`. DATA applicable at contract level: queries and operators are GTS-typed data. INT applicable: the request, response and error envelopes are the Viewer host to Worker contract. MAINT applicable: each operator kind pairs a schema variant with a Worker handler. TEST applicable: handler completeness and malformed predicates are tested. OPS, COMPL, UX and BIZ not applicable because no operational procedure, regulated data, user-facing flow or business rule is decided here.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements or design elements:

* `cpt-frontx-dashboard-fr-type-catalog` — defines the query and operator types in the shipped catalog.
* `cpt-frontx-dashboard-fr-time-bucket-granularity` — `time_bucketize` and `auto_bucketize` are operator variants.
* `cpt-frontx-dashboard-fr-entity-source` — the Worker runs queries over collections loaded through `EntitySource`.
* `cpt-frontx-dashboard-fr-loading-error-states` — `entity_fetch_failed` is a `query.error` code the viewer surfaces.
* `cpt-frontx-dashboard-nfr-bundle-budget` — the CEL compiler in the Worker bundle counts against the budget.
* `cpt-frontx-dashboard-nfr-filter-latency` — filter-latency tests at the ceiling include a CEL predicate.
* `cpt-frontx-dashboard-interface-type-catalog` — the types are part of the type catalog interface.
