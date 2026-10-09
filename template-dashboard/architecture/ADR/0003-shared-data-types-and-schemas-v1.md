---
status: accepted
date: 2026-10-05
decision-makers: template-dashboard architecture maintainers
---

# ADR-0003: Shared data types and schemas

**ID**: `cpt-frontx-dashboard-adr-shared-data-types-and-schemas`

<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [GTS (gts-spec) rebased onto FrontX base types](#gts-gts-spec-rebased-onto-frontx-base-types)
  - [Hand-maintained TypeScript interfaces](#hand-maintained-typescript-interfaces)
  - [Plain JSON Schema or OpenAPI documents without a type system](#plain-json-schema-or-openapi-documents-without-a-type-system)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

## Context and Problem Statement

The viewer, the Data Query Worker, the widgets, and consumer code exchange dashboards, queries, widget data, and messages. They need one governed set of types and schemas, so that contracts do not drift. Which type system should define them?

The earlier DevExpert prototype used GTS (the Global Type System, specified by gts-spec) with identifiers in a `de` vendor namespace on hai3 base types. FrontX already builds its micro-frontend contracts on GTS, with base types under `gts.frontx.mfes.*`. The template must reuse that system and rebase its own types onto the FrontX base types.

## Decision Drivers

* The types must integrate with FrontX base types for extensions, domains, entries, and actions.
* Identifiers must be readable and must encode vendor, package, and version.
* Schema evolution must be safe, so that published identifiers never change meaning.
* Consumers must be able to extend widget and dashboard types without editing the template.
* The sample content must be clearly separate from the reusable engine types.
* Identifiers from this template must not collide with FrontX identifiers or with identifiers from other templates.

## Considered Options

* GTS (gts-spec) rebased onto FrontX base types
* Hand-maintained TypeScript interfaces
* Plain JSON Schema or OpenAPI documents without a type system

## Decision Outcome

Chosen option: "GTS (gts-spec) rebased onto FrontX base types", because FrontX already uses it for its own contracts, so the template types compose with extension, domain, entry, and action types.

The conventions are:

* Vendor is `frontx`. Package `v` holds the view runtime types and package `m` holds the model types. Identifiers look like `gts.frontx.v.*` and `gts.frontx.m.*`.
* Namespace ownership: the FrontX project owns the `frontx` vendor and all of `gts.frontx.*`. Under it, this template reserves the packages `v`, `m`, and `demo`. The `mfes` package (`gts.frontx.mfes.*`) stays owned by the FrontX mfes package.
* Base types come from `gts.frontx.mfes.*`. Derived types are chained after a base, for example an action type derived from the base action type.
* Sample content lives under `gts.frontx.demo.*`, separate from the engine types.
* ID form: type identifiers end with `~`, and instance identifiers do not.
* Every rebased identifier starts at `v1`. Identifiers are frozen from the first non-alpha release of the template. Alpha releases may still change them. After the freeze, a change to a published identifier creates a new version.
* Types that stay inside TypeScript, such as `filter_state` and the entity source interface, are not given GTS identifiers.

### Consequences

* Good, because widget, domain, and action types compose with FrontX types through chaining.
* Good, because identifiers make vendor, package, and version visible to readers and tools.
* Good, because the frozen `v1` rule gives consumers stable contracts from the first non-alpha release.
* Good, because separating `demo` content lets consumers remove the sample without touching the engine.
* Bad, because contributors must learn GTS syntax and its reference annotations.
* Bad, because frozen identifiers mean mistakes in `v1` that survive the alpha releases can only be fixed by a new version.
* Bad, because all FrontX templates share one vendor namespace, so collisions are prevented by a rule and by review, not by the type system. The rule: no template may define a type or instance whose own (last) chain segment is in the `mfes` package or in a package that another template reserves.

### Confirmation

Confirmed by validating all type and instance files against the GTS rules in CI, and by a review check that every new identifier uses the `frontx` vendor, one of the reserved packages `v`, `m`, or `demo` for its own segment, a `v1` start, and the correct `~` form.

## Pros and Cons of the Options

### GTS (gts-spec) rebased onto FrontX base types

Types and instances are JSON files with GTS identifiers, chained from FrontX bases.

* Good, because it matches the FrontX platform.
* Good, because it supports inheritance chains and version compatibility rules.
* Good, because it validates both schemas and instances.
* Neutral, because it needs governance discipline for versions.
* Bad, because it adds a toolchain and conventions to learn.

### Hand-maintained TypeScript interfaces

Types are written only as TypeScript interfaces.

* Good, because there is no extra tooling.
* Bad, because the interfaces cannot validate JSON dashboard data at run time.
* Bad, because they do not compose with the FrontX type chain.

### Plain JSON Schema or OpenAPI documents without a type system

Schemas are standalone documents without identifiers or chaining.

* Good, because the formats are widely understood.
* Bad, because there is no shared identifier or inheritance model.
* Bad, because it would sit beside, not on, the FrontX contracts.

## More Information

* **Review trigger**: revisit this decision when gts-spec or the FrontX mfes package changes its base types or chaining rules, and confirm the identifiers before the first non-alpha release freezes them.
* **Scope**: this decision covers the type system, the vendor and package namespace, identifier form, and versioning. It does not cover the content of the type catalog, which the DESIGN describes, or the types that stay inside TypeScript.
* **Checklist applicability**: ARCH applicable (one type system for all contracts); PERF N/A (validation cost is not decided here); SEC N/A (no trust boundary or credentials are introduced; run-time validation is covered under DATA); REL N/A (no run-time failure mode is decided here); DATA applicable (schemas, identifiers, versioning, and the freeze point); INT applicable (composition with FrontX base types and consumer extensions); OPS N/A (no deployment or operational change); MAINT applicable (namespace ownership, collision rule, and version governance); TEST applicable (GTS validation in CI); COMPL N/A (no regulated data or new license); UX N/A (no user-facing behavior); BIZ applicable (consumers extend types without editing the template, and the demo can be removed).
* Related decision: FrontX ADR-0007 (action dispatch) routes actions by target and action type, which is how the template's host actions reach their targets. It does not define the action base type. That base type is the `gts.frontx.mfes.comm.action.v1~` schema of the FrontX mfes package, and the template's host actions are derived from it.
* The full type catalog is described in the DESIGN, not here.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements or design elements:

* `cpt-frontx-dashboard-fr-type-catalog` — the catalog is published as GTS types and instances under the `frontx` vendor.
* `cpt-frontx-dashboard-interface-type-catalog` — consumers extend the catalog through GTS chaining.
* `cpt-frontx-dashboard-fr-demo-opt-in` — sample content sits under `gts.frontx.demo.*`.
* `cpt-frontx-dashboard-fr-widget-catalog` — widget kinds are typed through the chain from the widget base.
