---
status: accepted
date: 2026-10-05
decision-makers: template-dashboard architecture maintainers
---

# ADR-0016: Template packaging and host contract

<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Add-only overlay with its own manifest, three packages](#add-only-overlay-with-its-own-manifest-three-packages)
  - [Preset bundling shell and dashboard](#preset-bundling-shell-and-dashboard)
  - [Dependency on `template-mfe`](#dependency-on-template-mfe)
  - [Own host application](#own-host-application)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-dashboard-adr-template-packaging-host-contract`

## Context and Problem Statement

The dashboard must reach a consumer's project as a FrontX template. The consumer already has a FrontX application shell from `template-shell` and wants the dashboard added without forking or editing the shell. The dashboard also has parts with different audiences: the engine and viewer every consumer needs, a widget library, and demo content that only evaluators want. The prototype viewer ran in a host application of its own; here the viewer is a nested host in a consumer's shell, so its packaging and host requirements are new decisions.

The dashboard has to mount inside the shell's existing extension domains: a screen domain for the Viewer host and a modal domain for drill-down. Those domains belong to the shell and their identifiers may change. The shell registers both, but today it renders only the screen domain through a slot; the modal domain has no rendered slot. Docs and code need a stable way to refer to these domains, and the template needs a stated list of what it requires from the host.

How is the template packaged and applied, what does it depend on, and what does it require from the host?

## Decision Drivers

* Add-only installation: nothing in `template-shell` is changed or removed (`cpt-frontx-dashboard-fr-overlay-install`).
* Conformance with FrontX template mechanics: a template is a directory with a manifest; ownership is declared by exclusive subtrees (FrontX ADR-0018, ADR-0020, ADR-0030).
* Minimal dependencies: the template depends on the shell only and takes nothing from `template-mfe`.
* Demo content stays out of a normal install (`cpt-frontx-dashboard-fr-demo-opt-in`).
* Stability against shell changes: host domain IDs are resolved from shell constants, never typed as literals.
* Isolation of widgets: each widget MFE instance is isolated by FrontX (FrontX ADR-0011), so packaging must not rely on shared singletons.

## Considered Options

1. **Add-only overlay with its own manifest, three packages** — `template-dashboard/` applied onto a project with `template-shell`.
2. **Preset bundling shell and dashboard** — one template referencing `template-shell` and the dashboard parts.
3. **Dependency on `template-mfe`** — build the dashboard on the reference MFE scaffold.
4. **Own host application** — the dashboard ships its own shell.

## Decision Outcome

Chosen option: "Add-only overlay with its own manifest, three packages", because it installs onto an existing shell without changing it, follows the FrontX manifest rules and keeps the dependency set to the shell alone.

The decision:

* **Manifest.** `template-dashboard/` is an add-only overlay with its own `frontx-template.json` and no references. It is discovered by the presence of the manifest, as for other templates (FrontX ADR-0018, ADR-0020, ADR-0030), and applied with `frontx add` onto a project that has `template-shell`. `template-dashboard/frontx-template.json` is authoritative for the template name, version and exclusive subtrees.
* **Dependencies.** It depends on `template-shell` only. It takes nothing from `template-mfe`.
* **Ownership.** The template declares exclusive subtrees for its three packages and its AI guidance, and writes nothing outside them.
* **Packages, split by audience.**
  * `dashboard-viewer`: the engine schemas (`frontx.v.*` and `frontx.m.*`), the viewer entry with its routed extension in the host screen domain through `Extension.route` (FrontX ADR-0036), the modal-container entry, and the Worker bundle with the `EntitySource` registry and the built-in `http` implementation (ADR-0015).
  * `dashboard-widgets`: one `mf_manifest` and 13 widget entries.
  * `dashboard-demo`: marked `templateExample: true`; holds the `gts.frontx.demo.*` content and fixtures. It contributes a separate Worker entry that registers the `fixture` `EntitySource` in the Worker's registry, and it registers its GTS instances through its own `mfe.json` schemas, so `dashboard-viewer` has no build-time dependency on `dashboard-demo` (ADR-0015). It is included only when the consumer opts in with `FRONTX_INCLUDE_TEMPLATE_EXAMPLES=1`.
* **Host contract.** The template names host domains by role: the host screen domain and the host modal domain. Their current `template-shell` IDs are resolved from shell framework constants and never written as literals. Requirements on the host:
  * The host screen domain accepts routed extensions of the shell screen extension type and mounts one screen at a time.
  * The host modal domain accepts plain extensions and uses the optional mount strategy (zero or one occupant).
  * The host renders the host modal domain through a domain slot with modal chrome, focus trap and dismissal. Current `template-shell` registers this domain but renders no slot for it, so the slot is a prerequisite `template-shell` change tracked outside `template-dashboard`. Without it the template installs and builds and the dashboard and its detail panel work, but modal drill-down cannot be shown.
  * The shell serves the aggregated MFE manifest that the Viewer host's registry reads.
  * The theme shared property carries the host theme id, and only the id; the template derives light or dark mode from it through its own theme-id map (ADR-0008). The language shared property is provided.
* **Not done now.** A shell-plus-dashboard preset is a later option.

### Consequences

* Good, because the template changes no shell file and the dashboard can be added to any shell-based project; modal drill-down additionally needs the host modal-domain slot.
* Good, because ownership is declared and checked by the existing manifest mechanics.
* Good, because a normal install carries no demo code, fixtures or sample content.
* Good, because role-based references survive a rename of shell domain IDs; only the constant lookup tracks it.
* Bad, because a consumer runs two steps, seed the shell and add the dashboard, until a preset exists.
* Bad, because the contract with the host is by role and depends on the shell exposing its domain constants and accepting plain extensions in its modal domain.
* Bad, because modal drill-down depends on a host prerequisite that current `template-shell` does not meet: a rendered modal-domain slot with modal chrome, focus trap and dismissal, delivered by a shell change outside this template.
* Neutral, because the demo package carries its own Worker entry, so fixture code never enters the viewer's Worker bundle.
* Bad, because widgets cannot share module singletons; each widget instance loads its own dependencies, which affects bundle size (`cpt-frontx-dashboard-nfr-bundle-budget`). Mitigation: FrontX ADR-0034 reuses shared-dependency source text across MFEs when content hashes match, which saves repeated fetches but not repeated evaluation; ADR-0004 records the per-instance cost of the charting library for the budget.
* Neutral, because the 13 widget entries share one manifest and one package, so consumer widget kinds ship as separate packages.

### Confirmation

Confirmed when:

* `frontx validate` passes for `template-dashboard/` and the repository's template discovery lists it by manifest.
* Applying the template onto a shell project adds files only under the exclusive subtrees and changes no `template-shell` file.
* A grep over template code finds no literal host domain IDs; they come from shell framework constants.
* A normal install contains no `dashboard-demo` content; setting `FRONTX_INCLUDE_TEMPLATE_EXAMPLES=1` adds it.
* The viewer mounts in the host screen domain through `Extension.route`, and the modal container mounts in the host modal domain with theme and language shared properties.
* On a host that renders the modal-domain slot, the open modal shows modal chrome, traps focus and closes on dismissal.
* `dashboard-viewer` builds without `dashboard-demo`, and the `fixture` `EntitySource` is registered only by the demo package's Worker entry.
* Bundle sizes are measured and checked against the provisional figures of `cpt-frontx-dashboard-nfr-bundle-budget` in the DESIGN (§3.9), with the modal container entry counted separately from the Viewer host MFE.

## Pros and Cons of the Options

### Add-only overlay with its own manifest, three packages

* Good, because it matches how FrontX composes templates and changes no shell file.
* Good, because audiences are split: viewer, widgets, optional demo.
* Neutral, because the install is two commands.
* Bad, because it relies on the host contract holding.

### Preset bundling shell and dashboard

* Good, because a consumer would get a running dashboard application in one step.
* Bad, because the preset would reference templates that change on their own schedule and create a pinning burden.
* Bad, because it is not needed to prove the overlay; it can be added later without changing the overlay.

### Dependency on `template-mfe`

* Good, because it provides a working MFE scaffold to copy from.
* Bad, because the dashboard would require consumers to install an example package set they do not need.
* Bad, because it ties the dashboard's release to the scaffold's version and ownership.

### Own host application

* Good, because the dashboard controls its domains and has no host contract.
* Bad, because consumers already have a shell and would have to run two applications or migrate.
* Bad, because it duplicates what `template-shell` provides.

## More Information

* ADR-0014 relies on the host modal domain accepting plain extensions and being rendered through a slot; the container is how modal widgets receive data.
* Related FrontX records: ADR-0011 (per-load isolation), ADR-0018 (manifest), ADR-0020 (composed template resolution), ADR-0030 (template classification), ADR-0034 (shared-dependency source-text reuse by content hash), ADR-0036 (extension routing port).
* **Review trigger:** revisit if `template-shell` stops exposing its domain constants or stops accepting plain extensions in its modal domain, if the shell change that renders the modal-domain slot is rejected or takes a different form, if measured per-widget sizes cannot meet the bundle budget, or if a shell-plus-dashboard preset is requested.
* **Scope:** how the template is packaged and applied, what it depends on and what it requires from the host. Domain taxonomy is in ADR-0010; the query lifecycle that uses the host modal domain is in ADR-0014.
* **Checklist applicability:** ARCH applicable and addressed above. INT applicable: the host contract by role and the FrontX manifest mechanics. MAINT applicable: one dependency and declared ownership. PERF applicable: per-instance isolation affects bundle size, checked in Confirmation. TEST applicable: install and grep checks in Confirmation. OPS applicable in one respect: installation is two commands until a preset exists. UX applicable in one respect: modal chrome, focus trap and dismissal are a host requirement on the rendered modal-domain slot. SEC not applicable because isolation is decided in FrontX ADR-0011 and no credential is involved. REL, DATA, COMPL and BIZ not applicable because packaging decides no runtime failure handling, stored data, regulated processing or business rule.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements or design elements:

* `cpt-frontx-dashboard-fr-overlay-install` — the overlay and its dependency on the shell only.
* `cpt-frontx-dashboard-fr-demo-opt-in` — the demo package and its opt-in.
* `cpt-frontx-dashboard-fr-viewer-host` — the routed viewer in the host screen domain.
* `cpt-frontx-dashboard-fr-widget-catalog` — the widgets package with 13 entries.
* `cpt-frontx-dashboard-contract-host-domains` — the host contract by role, including the rendered modal-domain slot.
* `cpt-frontx-dashboard-fr-drilldown-modal` — modal drill-down requires the host modal-domain slot.
* `cpt-frontx-dashboard-fr-fixture-source` — the demo package's Worker entry registers the fixture source.
* `cpt-frontx-dashboard-nfr-compatibility` — compatibility with the shell and FrontX.
* `cpt-frontx-dashboard-nfr-bundle-budget` — isolation without shared singletons affects size.
* `cpt-frontx-dashboard-actor-host-application` — the host that must meet the listed requirements.
