---
status: accepted
date: 2026-10-05
decision-makers: template-dashboard architecture maintainers
---

# ADR-0011: Widget kind and MFE realization hierarchy


<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Unified single hierarchy](#unified-single-hierarchy)
  - [Parallel hierarchies linked by `realizes:`](#parallel-hierarchies-linked-by-realizes)
  - [MFE hierarchy derived mechanically from the widget-kind hierarchy](#mfe-hierarchy-derived-mechanically-from-the-widget-kind-hierarchy)
  - [One MFE per widget kind, one package with 13 entries](#one-mfe-per-widget-kind-one-package-with-13-entries)
  - [Widgets bundled inside the viewer MFE](#widgets-bundled-inside-the-viewer-mfe)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-dashboard-adr-widget-kind-and-mfe-realization`
## Context and Problem Statement

Two artifact families describe a widget: the widget kind, a design-time GTS type that says what the placement configuration looks like and which widget data shape it consumes, and the MFE entry, the runtime manifest that the Viewer host loads and mounts. The question is whether they form one hierarchy or two linked by an explicit pointer, and whether widgets ship as their own MFEs at all or inside the viewer MFE.

In the DevExpert prototype the split was driven by four consumers, one of them a Node backend report generator that had to produce widget data without loading any MFE bundle. That driver does not exist in the template: there is no generator and no report. Dashboards still outlive MFE bundles, and a widget kind can have zero, one or several realizations.

## Decision Drivers

* Dashboard configuration references an identifier that outlives MFE re-releases.
* A widget kind may have zero, one or many MFE realizations.
* FrontX MFE entries are contract-plus-entrypoint manifests with no widget-internal logic, so design-time schemas belong elsewhere.
* Consumer packages may add widget kinds and realizations without rebuilding the Viewer host.
* FrontX isolates every MFE instance, so the packaging must not rely on shared singletons.

## Considered Options

* **Unified single hierarchy** — one GTS tree where widget kind and MFE entry are the same type.
* **Parallel hierarchies linked by `realizes:`** — widget kinds in the `m` package, MFE entries in the `v` package, each entry pointing to its kind.
* **MFE hierarchy derived mechanically from the widget-kind hierarchy** — same structure and segment names, no explicit pointer.
* **One MFE per widget kind, one package with 13 entries** — packaging option: a widget-library package ships one manifest and one MFE entry per kind.
* **Widgets bundled inside the viewer MFE** — packaging option: no widget MFEs; the viewer MFE renders every widget kind as an internal component.

## Decision Outcome

Chosen option: "Parallel hierarchies linked by `realizes:`", because it keeps dashboard configuration stable across MFE re-releases and expresses the many-to-one realization with no extra machinery. For packaging, chosen option: "One MFE per widget kind, one package with 13 entries", because it lets widgets mount into every extension domain as MFEs and lets consumers add kinds as separate packages.

Design-time widget kinds are `gts.frontx.m.widget.widget.v1~frontx.m.widget.<kind>.v1~`. Runtime MFE entries are instances of `gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.v.mfe.entry.v1~`, each carrying `realizes:` that points to a widget kind. Dashboard configuration persists widget instances, never MFE entry identifiers. The Viewer host resolves a kind to an entry through `realizes:`.

The `.m` to `.v` references are kept deliberately: `widget.query` refers to `v.query`, a widget kind pairs with its `v.widget_data` shape, and `v.mfe.entry.realizes` refers to `m.widget`. The generator driver of the prototype no longer applies; the split is kept for faithfulness to the prototype and so that MFE re-releases can happen independently of dashboard configurations.

**Packaging.** One widget-library package ships one `mf_manifest` and 13 MFE entries, each exposing its own module. FrontX ADR-0011 isolates every MFE instance in its own module graph, so the package declares no shared singletons. The template also assumes, as a product-owner decision, that Module Federation is used only for bundling and that FrontX resolves dependencies itself; this is a template assumption, not a statement of FrontX ADR-0011. Consumer widget kinds come as separate packages.

### Consequences

* Good, because saved dashboards keep loading after an MFE entry is re-released or replaced.
* Good, because several realizations of one kind, or a kind without a realization yet, are representable.
* Good, because consumers can add a kind or a realization as a separate package.
* Good, because one manifest keeps the widget package simple to build and version.
* Bad, because two hierarchies must be maintained, and an unrealized kind or an orphan entry are possible states needing catalog reporting.
* Bad, because the Viewer host performs a kind-to-entry lookup on every mount.
* Bad, because the main prototype justification is gone, so the split is a deliberate cost carried for continuity and independent releases, not for a present consumer requirement.
* Bad, because every MFE instance loads its own copy of heavy libraries under isolation, which weighs on the bundle budget.

### Confirmation

* Schema review confirms that widget instances in dashboard config reference kinds only, and that each MFE entry has a valid `realizes:`.
* A catalog check verifies that every one of the 13 kinds has an entry in the single manifest.
* Build review confirms that the widgets package declares no shared singletons.

## Pros and Cons of the Options

### Unified single hierarchy

Widget kind and MFE entry collapse into one type.

* Good, because there is one tree to maintain.
* Bad, because multiple realizations and unrealized kinds are not expressible.
* Bad, because dashboard configs would be tied to MFE identifiers.

### Parallel hierarchies linked by `realizes:`

Design-time kinds and runtime entries are separate types linked by a pointer.

* Good, because configs are stable across MFE re-releases.
* Good, because many-to-one realization is expressed directly.
* Neutral, because it adds one manifest field and no new identifier grammar.
* Bad, because of the lookup and the orphan or unrealized states.

### MFE hierarchy derived mechanically from the widget-kind hierarchy

The entry for a kind is found by matching structure and names.

* Good, because no explicit pointer is stored.
* Bad, because the implicit mapping breaks as soon as a kind has several realizations or different names.
* Bad, because the coupling between two hierarchies is hidden in naming conventions.

### One MFE per widget kind, one package with 13 entries

The widget library is one package with one manifest and 13 entries, one per kind.

* Good, because widgets mount into `layout_cells`, `detail_panel` and the modal container's inner domain through the same MFE lifecycle.
* Good, because widgets can be released independently of the viewer, and consumers can add kinds as separate packages.
* Good, because one manifest keeps the widget package simple to build and version.
* Bad, because every widget instance loads its own module graph under isolation, including heavy libraries, which weighs on the bundle budget.
* Bad, because it needs the `realizes:` indirection and a kind-to-entry lookup on every mount.

### Widgets bundled inside the viewer MFE

The viewer MFE contains every widget kind as an internal component; there are no widget MFEs.

* Good, because the browser fetches less: one bundle, and heavy libraries are evaluated once in the viewer's module graph instead of once per widget instance.
* Good, because there is no `realizes:` indirection, no catalog of entries and no orphan or unrealized states.
* Bad, because widgets cannot be released independently of the viewer.
* Bad, because consumers cannot add widget kinds as separate packages; every new kind means rebuilding the viewer.
* Bad, because the viewer bundle grows with every kind, and widgets no longer mount into extension domains as MFEs, so detail panel and modal drill-down need a second, non-MFE rendering path.

## More Information

**Review trigger.** Revisit if no consumer adds a second realization of a kind, or a kind as a separate package, after several releases, or if releasing MFEs independently of dashboard configuration stops mattering. In either case the bundled alternative may become cheaper.

**Scope.** This record decides how widget kinds relate to MFE entries and how widget MFEs are packaged. It does not decide which kinds exist (ADR-0012), the extension domains widgets mount into (ADR-0010), or the isolation behavior (FrontX ADR-0011).

**Checklist applicability.** ARCH applicable and addressed above. PERF applicable: the lookup cost is a map access, and per-instance isolation affects bundle size, tracked by `cpt-frontx-dashboard-nfr-bundle-budget`. SEC not applicable here; isolation is decided in FrontX ADR-0011. REL not applicable because no failure-handling mechanism is decided; an unrealized kind is a catalog state reported by the catalog check. DATA applicable at the contract level: dashboard configuration persists widget kinds, never MFE entry identifiers. INT applicable: consumer packages integrate by adding kinds and entries with `realizes:`. OPS not applicable because no operational procedure is governed. MAINT applicable: two hierarchies and one manifest must be maintained. TEST applicable: the schema review and catalog check confirm the decision. COMPL not applicable because no regulatory or licensing obligation is involved. UX not applicable because no user-facing interaction is decided. BIZ not applicable because no business rule is decided.

**Related decisions.** The subject-agnostic widget catalog (ADR-0012) defines which 13 kinds exist. FrontX ADR-0011 defines the per-instance isolation behavior. The Module Federation bundling-only point is a template assumption recorded above.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements or design elements:

* `cpt-frontx-dashboard-fr-widget-catalog` — the catalog of widget kinds and their MFE realizations.
* `cpt-frontx-dashboard-fr-type-catalog` — the `m` and `v` type families and their cross-references.
* `cpt-frontx-dashboard-fr-viewer-host` — the Viewer host resolves entries through `realizes:`.
* `cpt-frontx-dashboard-nfr-bundle-budget` — one package and isolation shape the bundle size.
* `cpt-frontx-dashboard-actor-template-consumer` — consumers add kinds as separate packages.
