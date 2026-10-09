---
status: accepted
date: 2026-10-05
decision-makers: template-dashboard architecture maintainers
---

# ADR-0012: Subject-agnostic widget catalog


<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Subject-specific catalog](#subject-specific-catalog)
  - [Subject-agnostic kinds with per-kind widget data and addressable Query instances](#subject-agnostic-kinds-with-per-kind-widget-data-and-addressable-query-instances)
  - [Single generic widget with a render discriminator](#single-generic-widget-with-a-render-discriminator)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-dashboard-adr-subject-agnostic-widget-catalog`
## Context and Problem Statement

A widget kind says how a placement renders; widget data is what it renders. A catalog can be cut along subject lines (one kind per subject and rendering shape, as in the first version of the DevExpert prototype, around 30 leaves) or along rendering shapes. The first grows with every new metric. The question is what the template's catalog contains and where the subject of a widget comes from.

## Decision Drivers

* A small catalog whose size is bounded by rendering shapes, not by shape times subject.
* The same rendering must be reusable across many analytics without forking the catalog.
* New analytics should be added as data and configuration, not as new widget code.
* The widget instance in dashboard config is the single record of a placement.
* The model composes with the GTS type system without new identifier grammar.

## Considered Options

* **Subject-specific catalog** — one widget kind per subject and rendering shape combination.
* **Subject-agnostic kinds with per-kind widget data and addressable Query instances** — rendering-primitive kinds, each paired with one widget data shape; Query instances supply the subject.
* **Single generic widget with a render discriminator** — one widget type whose MFE branches on `render_as`.

## Decision Outcome

Chosen option: "Subject-agnostic kinds with per-kind widget data and addressable Query instances", because the catalog stays bounded by rendering shapes and new analytics need no new widget code.

The catalog has 13 rendering-primitive widget kinds: `summary_card`, `metric_card`, `ranked_list_card`, `progress_list_card`, `grid`, `cartesian_chart`, `pie_chart`, `heatmap`, `markdown_card`, `code_diff`, `thread_list`, `event_timeline` and `metadata_strip`. Each kind has one paired `gts.frontx.v.widget_data.*` shape. Externally addressable Query instances supply the subject: a Query declares its output widget data type, and a widget instance names the Query it reads. The widget instance carries all placement configuration inline.

Data flow in the template: dashboard configuration is a set of GTS instances; entity data is loaded live through `EntitySource`; operators ship as Worker code. There is no pre-generated payload that merges configuration and data.

Known gap: six kinds have no demo queries (`metric_card`, `markdown_card`, `code_diff`, `thread_list`, `event_timeline`, `metadata_strip`). They are part of the catalog and have MFE entries, but the demo dashboard does not exercise them.

### Consequences

* Good, because adding an analytic is a Query plus widget data change, not a catalog change.
* Good, because the same kind serves many analytics, for example a `summary_card` for pull request counts and for contributor counts.
* Good, because widgets are passive renderers that receive `set_subject` and `set_data` and carry no subject branching.
* Good, because configuration, data and operators are separated: GTS instances, live entities and Worker code.
* Bad, because authors must think in two layers, rendering shape and data subject.
* Bad, because a Query's output must match the kind's widget data type, a cross-record check validated at the GTS level.
* Bad, because six kinds lack demo coverage, so their rendering is not exercised by the demo and relies on kind-level tests.

### Confirmation

* Schema validation confirms each of the 13 kinds has exactly one paired `widget_data` shape and each demo Query's output type matches its consuming kind.
* Design review confirms that no widget kind name carries a subject and that the demo queries cover the seven kinds outside the known gap.
* The gap list is reviewed when new demo queries are added.

## Pros and Cons of the Options

### Subject-specific catalog

One kind per subject and shape.

* Good, because each leaf is fully specific.
* Bad, because the catalog grows with every metric and prevents reuse.
* Bad, because adding an analytic requires new widget code.

### Subject-agnostic kinds with per-kind widget data and addressable Query instances

Rendering primitives plus Query instances.

* Good, because the catalog is bounded by rendering shapes.
* Good, because analytics are added as Queries.
* Neutral, because authors learn two layers.
* Bad, because the Query-to-kind match is a cross-record check.

### Single generic widget with a render discriminator

One type; the MFE chooses a rendering at runtime.

* Good, because the catalog is a single type.
* Bad, because the type system no longer says what a placement consumes.
* Bad, because one MFE carries every rendering branch, inflating its bundle.

## More Information

**Review trigger.** Revisit if a needed analytic cannot be expressed with the 13 rendering shapes and their widget data types, so that a new kind or a subject-specific kind would be required.

**Scope.** This record decides what the widget catalog contains and where a widget's subject comes from. It does not decide how kinds map to MFE entries (ADR-0011), where derived fields come from (ADR-0009), or the query operators (ADR-0013).

**Checklist applicability.** ARCH applicable and addressed above. PERF applicable only through the bundle size effect of one MFE per kind. SEC not applicable because no security mechanism is decided. REL not applicable because no failure-handling mechanism is decided. DATA applicable at contract level: widget data shapes are GTS types, and a Query's output type must match its consuming kind. INT applicable: consumers add analytics as Query instances against the published widget data types. OPS not applicable because no operational procedure is governed. MAINT applicable: the catalog stays bounded by rendering shapes, and the known gap list must be maintained. TEST applicable: schema validation covers the kind-to-data pairing, and kind-level tests cover the six kinds without demo queries. COMPL not applicable because no regulatory obligation is involved. UX applicable in one respect: the set of rendering shapes bounds what a dashboard can show. BIZ not applicable because no business rule is decided.

**Related decisions.** ADR-0011 defines how kinds relate to MFE entries; ADR-0009 defines where derived fields come from.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements or design elements:

* `cpt-frontx-dashboard-fr-widget-catalog` — defines the 13 rendering-primitive kinds.
* `cpt-frontx-dashboard-fr-type-catalog` — each kind has a paired `widget_data` type.
* `cpt-frontx-dashboard-fr-entity-source` — entity data is loaded live, separate from configuration.
* `cpt-frontx-dashboard-fr-grid-presentation` — the grid kind is one of the rendering primitives.
* `cpt-frontx-dashboard-usecase-explore-dashboard` — the dashboard is composed of these widget instances.
