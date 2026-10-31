---
status: accepted
version: 1
date: 2026-10-31
decision-makers: template-dashboard architecture maintainers
description: "Decision record for how template-dashboard packages its widgets: each widget type is its own FrontX MFE entry, loaded at runtime, so a widget author can add or fix a widget type without a product redeploy. FrontX and TypeScript in strict mode are given inputs."
---

# ADR-0001: One FrontX MFE entry per widget type

**ID**: `cpt-frontx-dashboard-adr-frontend-framework`

<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [One FrontX MFE entry per widget type](#one-frontx-mfe-entry-per-widget-type)
  - [One FrontX MFE entry for the whole widget library](#one-frontx-mfe-entry-for-the-whole-widget-library)
  - [A single plain React component mounted as one FrontX extension](#a-single-plain-react-component-mounted-as-one-frontx-extension)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

## Context and Problem Statement

`template-dashboard` is a declarative, backend-agnostic dashboard template a product copies into a host application. Two inputs are given, not decided here. The host runs FrontX, so the dashboard root and its widgets are FrontX code. The template uses TypeScript in strict mode, as FrontX does. What remains to decide is how the widgets are packaged: each widget type as its own FrontX MFE entry loaded at runtime, one entry for the whole widget library, or ordinary React code inside the dashboard root.

A widget author must be able to add a new widget type, or fix an existing one, at runtime, without a product redeploy; a fix released under the same widget type takes effect on the next page load ([ADR-0009](0009-subject-agnostic-widget-catalog-v1.md)).

## Decision Drivers

* FrontX is given by the host application; the dashboard root runs inside it, not as a second deployable application.
* A widget author adds or fixes a widget type at runtime, without a product redeploy (`cpt-frontx-dashboard-fr-add-fix-widget`). A fix under the same widget type shows on the next page load.
* Every widget instance evaluates its own copy of its code, so a cell should evaluate only the code of its own widget type.
* Strong typing is needed for the shared widget contract and the `render_widget` action the dashboard root sends to each widget.
* The template must follow FrontX isolation rules and not depend on state held in common across widget instances.
* The template must depend on its own runtime packages only, never on a host or shell template (`cpt-frontx-dashboard-contract-host`).
* The template must stay buildable while FrontX evolves.

## Considered Options

* One FrontX MFE entry per widget type
* One FrontX MFE entry for the whole widget library
* A single plain React component mounted as one FrontX extension

## Decision Outcome

Chosen option: "One FrontX MFE entry per widget type", because it is the only option in which each widget type ships, is fixed and is rolled back on its own as separately loaded code that the dashboard root mounts at runtime, so a fix or a new type needs no product redeploy, and each cell evaluates only the code of its own widget type.

The decision has these parts:

* The template uses FrontX and TypeScript in strict mode, the given inputs. No second UI framework is used.
* Each widget type is a FrontX MFE entry. The dashboard root generates one extension per cell (and per larger view) from the entry the widget type's trait names, and mounts it. FrontX caches each extension's evaluated code for the page's lifetime, keeps the first manifest it resolved for a manifest reference, and reuses an entry object still held by a registered extension. So a fix released under the same entry id takes effect on the next page load, and a reload of the same dashboard reuses the same extensions.
* The dashboard root and each widget exchange one typed action, `render_widget`, through the FrontX actions chain. The framework routes it, and the types are checked as data (`cpt-frontx-dashboard-interface-contract`).

This ADR does not restate the related decisions. ADR-0006 decides theme delivery. ADR-0007 decides the `widgets` domain and the `render_widget` action. ADR-0008 decides how a widget type points to its entry through a trait. ADR-0010 decides the packages and the host contract.

### Consequences

* Good, because a widget author ships a fix or a new widget type as separately loaded code, with no product redeploy, and a fix shows on the next page load.
* Good, because per-instance isolation means widgets cannot couple through module state; each widget instance evaluates its own copy of its code.
* Good, because the dashboard root reuses the same extension for the same widget on a reload, so the page does not pile up extensions.
* Bad, because every widget instance evaluates its own copy of heavy libraries, which raises bundle and memory cost (see ADR-0004 and ADR-0005).
* Bad, because isolation is per instance and is not a sandbox, and it does not contain main-thread faults. A widget that blocks the main thread or leaks memory slows the dashboard root and its neighbours (`cpt-frontx-dashboard-fr-isolation`).
* Bad, because each widget is loaded at runtime, so its entry, manifest or code can fail to load or mount on its own. The failure is contained to its cell or larger view, which shows the cannot-be-shown state (`cpt-frontx-dashboard-fr-per-cell-failure`). Recovery is a page reload, or a rollback of a bad release (see More Information).
* Bad, because widget code runs in the host page, in the host origin, with no sandbox, and the served file decides which widget code loads. The rules that a widget sends no request and loads nothing from another origin are obligations on widget code, checked by review. Widget authors and the served file are trusted (DESIGN section 4.2).
* Bad, because a new FrontX release can break the template. Mitigation: the template pins the FrontX ecosystem packages to exact published registry versions and moves a pin only after it validates against the new release.

### Confirmation

Compliance is confirmed by code review, build checks and integration tests:

* The review confirms that no widget code imports state from another widget instance, and that no widget code sends a request.
* A build check confirms that TypeScript strict mode is on for every template package.
* The build check confirms the template builds against its pinned FrontX packages. CI confirms every pinned FrontX package version exists in the registry.
* An integration test releases changed widget code under the same entry id and confirms the change shows on the next page load, with no product redeploy.
* An integration test opens the same dashboard again and confirms the dashboard root reuses the same extensions.
* An integration test sends a `render_widget` payload that does not fit the action type and confirms FrontX rejects it as data.
* An integration test makes one widget entry fail to load and confirms that only its cell shows the cannot-be-shown state.

## Pros and Cons of the Options

### One FrontX MFE entry per widget type

The dashboard root and the widgets are FrontX MFEs. Each widget type has its own entry. The dashboard root generates one extension per cell (and per larger view) from the entry the widget type's trait names, and mounts it.

* Good, because it uses the loading, actions, and domains the host framework already provides.
* Good, because a widget author ships a fix or a new type as separately loaded code, with no product redeploy, and releases or rolls back one widget type without touching the others.
* Good, because each cell evaluates only the code of its own widget type.
* Good, because TypeScript types and the shared widget contract line up with FrontX base types.
* Bad, because per-instance isolation duplicates library code across widget instances.
* Bad, because each widget needs an entry, a manifest, and a typed action contract.
* Bad, because a widget's entry or code can fail to load or mount on its own; the failure stays in its cell or larger view.

### One FrontX MFE entry for the whole widget library

One entry holds every widget type. The dashboard root still generates one extension per cell from that entry, and the entry picks the widget type to draw.

* Good, because there is one entry to maintain.
* Good, because a fix or a new type still ships as separately loaded code, with no product redeploy.
* Bad, because each widget instance evaluates its own copy of the one entry, which carries the code of every widget type, including the chart and grid libraries, unless the entry splits its code per type itself.
* Bad, because no widget type can be released or rolled back on its own; every fix or new type releases the whole library again.
* Bad, because the entry would need the widget type in its payload, which `render_widget` does not carry.

### A single plain React component mounted as one FrontX extension

This option is listed to record why it is rejected: it fails the main driver. The host runs FrontX. The template would ship one FrontX extension whose content is a plain React tree. The dashboard root would import widget components directly and pass data through props. There would be no widget MFEs.

* Good, because the build is simple: one bundle, and chart and grid libraries are evaluated once, not once per widget instance.
* Good, because there are no widget entries or manifests to maintain.
* Bad, because a widget author cannot add or fix a widget type at runtime; every change needs a rebuild of the template's component.
* Bad, because widgets could couple through state held in common by the plain components.
* Bad, because the widget contract would be TypeScript props only, which cannot be validated as data (see ADR-0003).

## More Information

* **Review trigger**: revisit when a FrontX release changes MFE instance isolation or the host contract.
* **Release and rollback**: the widget author owns the MFE build, and the product owns the served file. A widget release deploys the MFE build, then adds the types, the entry and the manifest to the served file. A bad widget release is rolled back by restoring the previous types, entry and manifest in the served file, or by redeploying the previous MFE build. Either change shows on the next page load, with no product redeploy. A product rolls back by shipping its previous build (DESIGN section 4.2).
* **Scope**: this decision covers how widgets are packaged and loaded. FrontX and TypeScript in strict mode are given inputs. It does not cover theme delivery (ADR-0006), the `widgets` domain and `render_widget` (ADR-0007), how a widget type points to its entry (ADR-0008), the packages and the host contract (ADR-0010), or the chart and grid libraries (ADR-0004 and ADR-0005).
* **Checklist applicability**: ARCH applicable; PERF applicable (per-instance library cost); SEC applicable (isolation is per instance, not a sandbox; widget code runs unsandboxed in the host origin; the served file decides which code loads; the no-request and same-origin rules are obligations on widget code, checked by review; widget authors and the served file are trusted, DESIGN section 4.2); REL applicable (a widget load or mount failure is contained to its cell or larger view); DATA N/A; INT applicable (FrontX packages and the host contract); OPS N/A; MAINT applicable (pin policy); TEST applicable; COMPL N/A; UX N/A; BIZ applicable (add or fix a widget type without a redeploy).
* **Security review**: the trust points above (isolation per instance, not a sandbox; widget code in the host origin; the served file choosing which code loads) are reviewed as part of this decision by its decision makers; no separate security sign-off is recorded. Required abuse-case tests: a `render_widget` payload that does not fit the action type, and a widget entry that fails to load, which stays contained to its cell (see Confirmation). Security monitoring: not applicable, because the template runs no service (DESIGN §4.2).
* Related decision: FrontX ADR-0011 (load isolation).

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements or design elements:

* `cpt-frontx-dashboard-fr-add-fix-widget` — a widget author ships a fix or a new widget type as a FrontX MFE, with no product redeploy; a fix shows on the next page load.
* `cpt-frontx-dashboard-fr-isolation` — each widget instance runs in its own isolated code.
* `cpt-frontx-dashboard-contract-host` — the pin policy sets the supported FrontX baseline, and the template depends on its own runtime packages only, never on a host or shell template.
