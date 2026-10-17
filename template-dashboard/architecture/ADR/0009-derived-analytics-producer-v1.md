---
status: accepted
date: 2026-10-05
decision-makers: template-dashboard architecture maintainers
---

# ADR-0009: Derived analytics producer


<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Producer outside the viewer](#producer-outside-the-viewer)
  - [New Worker operators](#new-worker-operators)
  - [Derivation in the Viewer host after load](#derivation-in-the-viewer-host-after-load)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-dashboard-adr-derived-analytics-producer`
## Context and Problem Statement

The dashboard aspects declare derived and denormalized entity fields: author login and display name, team name and color, derived merge status, CI status, contributor score and file language. Filters and queries read these fields as stored values. Someone has to produce them, and the viewer's Data Query Worker is a read-only in-browser executor.

In the DevExpert report-dashboard prototype a backend normalization pipeline pre-computed these fields into a regenerated report that the viewer loaded. The template has no report. The Viewer host loads entities live through `EntitySource` (`cpt-frontx-dashboard-fr-entity-source`), so the question is where derivation happens now and what the `EntitySource` contract promises.

## Decision Drivers

* The Worker must stay read-only: no scoring or classification logic that depends on admin configuration the viewer never sees.
* The template is a simple port; the operator set (18 `oneOf` variants keyed by `op`) must not grow.
* The consuming project's backend already owns identity, team mapping and CI data, so it is the natural producer.
* The demo must run with no network and no backend, so fixtures must be self-sufficient.
* Filters over derived fields must work through aspects without re-deriving anything at viewer runtime.

## Considered Options

* **Producer outside the viewer** — `EntitySource` returns entities that already carry every derived field their aspects declare.
* **New Worker operators** — add `classify_language` and `apply_scoring` operators so the Worker derives fields in the browser.
* **Derivation in the Viewer host after load** — a TypeScript step in the Viewer host enriches entities between `EntitySource.load` and the Worker.

## Decision Outcome

Chosen option: "Producer outside the viewer", because it keeps the Worker read-only and the operator set unchanged, and it places derivation next to the data and configuration that determine it.

The `EntitySource` contract requires that every entity it returns carries all derived fields declared by the aspects that entity composes. In deployments the consuming project's backend computes them. The demo fixtures carry them precomputed: the committed fixture generator computes them with a fixed seed and writes them into the JSON files. The viewer neither validates how the fields were produced nor recomputes them.

**Missing-field mitigation.** A missing derived field would otherwise show up only as empty filters and groupings. Two measures address this. First, in development builds the Worker checks each loaded entity against the fields its declared aspects require and logs a warning naming the entity, the aspect and the missing field; production builds skip the check. Second, the `EntitySource` guide documents the derived-field obligation for consuming backends as part of the consumer documentation (`cpt-frontx-dashboard-nfr-consumer-docs`).

### Consequences

* Good, because the Worker has no scoring or language-classification code and stays a pure read-only executor.
* Good, because the operator catalog is unchanged, so no new operator needs specification or testing.
* Good, because the demo needs no backend; the fixture implementation of `EntitySource` returns the entities as stored.
* Bad, because every consuming backend must implement the derivations itself and keep them consistent with the aspect definitions.
* Bad, because a backend that omits a declared derived field produces empty filters and groupings in production; the development-time Worker warning and the `EntitySource` guide reduce this risk but do not remove it.
* Bad, because changing a scoring rule means regenerating fixtures or changing backend code, never a dashboard configuration edit.

### Confirmation

* Design review confirms that the `EntitySource` interface documentation states the derived-field requirement and that no operator or Worker code performs scoring, classification or team lookup.
* The fixture generator is reviewed for computing every derived field declared by the demo aspects; a fixture check compares entity fields with aspect declarations.
* A Worker test in a development build loads an entity that lacks a field required by one of its aspects and checks that a warning names the entity, the aspect and the field; the same test in a production build checks that no check runs.
* Documentation review confirms that the `EntitySource` guide states the derived-field obligation and lists the derived fields of the demo aspects.

## Pros and Cons of the Options

### Producer outside the viewer

Derived fields arrive on the entities; the viewer only reads them.

* Good, because the Worker stays read-only and the operator set unchanged.
* Good, because derivation lives with the data owner.
* Neutral, because the shape of each derived field is still declared by the aspect, so the contract is machine-readable.
* Bad, because each consuming backend carries an implementation burden.

### New Worker operators

Add `classify_language` and `apply_scoring` operators executed in the Worker.

* Good, because derivation is uniform regardless of backend.
* Bad, because it needs admin configuration (weights, extension maps, team mapping) inside the browser.
* Bad, because it enlarges the operator catalog beyond a simple port and breaks the read-only Worker rule.

### Derivation in the Viewer host after load

The Viewer host enriches entities before indexing.

* Good, because the Worker stays unchanged.
* Bad, because the same configuration problem appears in the Viewer host, and the logic duplicates what the backend already knows.
* Bad, because every load pays the enrichment cost in the browser against the memory ceiling.

## More Information

**Review trigger.** Revisit if a derived field needs configuration that the consuming backend cannot supply, for example a dashboard-level setting that only the viewer knows.

**Scope.** This record decides who produces derived and denormalized entity fields and what the `EntitySource` contract promises about them. It does not decide how entities are loaded (ADR-0015), which operators the Worker runs (ADR-0013), or the field shapes, which the aspects own.

**Checklist applicability.** ARCH applicable and addressed above. PERF applicable in one respect: derivation cost stays outside the browser, and the missing-field check runs only in development builds. SEC not applicable because no secret, credential or authorization mechanism is decided here. REL applicable in one respect: a missing derived field degrades filters and groupings silently in production, mitigated by the development-time warning. DATA applicable at the contract level: the field shapes are owned by the aspects, not by this record. INT applicable: the derived-field obligation is part of the `EntitySource` integration contract with consuming backends. OPS not applicable because no operational procedure is governed. MAINT applicable: consuming backends must keep derivations consistent with aspect definitions. TEST applicable: the fixture check and the Worker warning test confirm the contract. COMPL not applicable because no regulatory or licensing obligation is involved. UX not applicable because no user-facing interaction is decided. BIZ not applicable because no business rule is decided beyond moving derivation to its data owner.

**Related decisions.**

* [ADR-0015](0015-live-entity-source-v1.md) (live `EntitySource`) — defines how entities are loaded; this record adds the derived-field obligation to that contract.
* [ADR-0013](0013-query-operator-cel-v1.md) (query operators) — keeps the operator set unchanged, which is why derivation cannot move into the Worker.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements or design elements:

* `cpt-frontx-dashboard-fr-entity-source` — `EntitySource.load` must return entities with all declared derived fields.
* `cpt-frontx-dashboard-fr-fixture-source` — fixtures carry generator-computed derived fields.
* `cpt-frontx-dashboard-contract-entity-data` — the entity data contract includes the derived-field obligation.
* `cpt-frontx-dashboard-interface-entity-source` — the interface documents the producer responsibility for consuming backends.
* `cpt-frontx-dashboard-actor-consuming-backend` — the consuming backend is the deployment producer of derived fields.
