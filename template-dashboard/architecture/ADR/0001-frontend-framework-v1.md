---
status: accepted
date: 2026-10-05
decision-makers: template-dashboard architecture maintainers
---

# ADR-0001: Frontend framework

**ID**: `cpt-frontx-dashboard-adr-frontend-framework`

<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [FrontX (develop) with TypeScript and MFE packaging](#frontx-develop-with-typescript-and-mfe-packaging)
  - [A single plain React component mounted as one FrontX extension](#a-single-plain-react-component-mounted-as-one-frontx-extension)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

## Context and Problem Statement

`template-dashboard` adds a declarative dashboard viewer to a FrontX application that already uses `template-shell`. FrontX is given: the host application runs it, so the template cannot pick another host framework. What remains to decide is how the template adopts FrontX: with which language, and whether the dashboard uses the FrontX MFE (micro-frontend) packaging model or lives inside the host as ordinary React code.

The earlier DevExpert prototype targeted hai3, the framework that was later rebranded to FrontX. It used Module Federation (a bundler feature that loads code from separately built applications) to share libraries between widgets. It also shipped a separate viewer application and an Admin Panel for authoring. FrontX works differently. Each MFE load gets its own module graph, so MFE instances share no singletons (FrontX ADR-0011). Templates are add-only overlays applied to an existing project (FrontX ADR-0018 and ADR-0020).

## Decision Drivers

* FrontX is given by the host application. The viewer must run inside that application, not as a second deployable application.
* Consumers must be able to add their own widget kinds as separately built packages.
* Strong typing is needed for the shared data types and for host-to-widget messages.
* The design must follow FrontX isolation rules and not depend on libraries shared between MFE instances.
* The template must be consumable through `frontx add`, with a dependency on `template-shell` only (`cpt-frontx-dashboard-fr-overlay-install`).
* The template must stay buildable while FrontX evolves on its `develop` line.

## Considered Options

* FrontX (develop) with TypeScript and MFE packaging
* A single plain React component mounted as one FrontX extension

## Decision Outcome

Chosen option: "FrontX (develop) with TypeScript and MFE packaging", because FrontX is given by the host, and its MFE packaging is the only option that lets consumers add widget kinds as separately built packages with typed messages routed by the framework.

The decision has these parts:

* FrontX from the `develop` line of gears-frontx, with TypeScript in strict mode, is the sole framework. No second UI framework is used.
* The dashboard is packaged as FrontX MFEs. The FrontX runtime loads and isolates them. Each MFE load gets its own module graph (FrontX ADR-0011), so no library is shared as a singleton between instances.
* Template assumption: FrontX uses Module Federation only as a bundling format and resolves dependencies itself. This assumption comes from the template product owner. FrontX ADR-0006 covers how the runtime selects the handler that loads such bundles.

This ADR does not restate the related decisions. ADR-0008 decides theme delivery. ADR-0010 decides the extension domains. ADR-0011 decides widget realization, including the choice between one MFE per widget kind and widgets bundled into the viewer MFE. ADR-0016 decides the overlay packaging and the placement of the viewer in the host.

### Consequences

* Good, because the viewer reuses the host application's authentication, navigation, and screen domains.
* Good, because per-instance isolation means widgets cannot couple through shared module state.
* Good, because consumers add widget kinds as separate MFE packages without changing the template.
* Bad, because every MFE instance evaluates its own copy of heavy libraries, which raises bundle and memory cost (see ADR-0004 and ADR-0005).
* Bad, because isolation does not contain main-thread faults. A widget that blocks the main thread or leaks memory still slows the viewer and its neighbours.
* Bad, because the template is tied to FrontX conventions and to the `template-shell` host contract.
* Bad, because the template depends on the moving `develop` line of gears-frontx, so a FrontX change can break the template between releases. Mitigation: the template pins the FrontX ecosystem packages to exact published registry versions, as the repository pin policy requires, and moves a pin only after the template validates against the new version.

### Confirmation

Compliance is confirmed by code review and by build checks. The review confirms that no widget code imports module state from another MFE instance. The build check confirms that the template overlay applies with `frontx add` on a `template-shell` project and that it references no other template. CI confirms that every pinned FrontX package version exists in the registry.

## Pros and Cons of the Options

### FrontX (develop) with TypeScript and MFE packaging

The viewer and the widgets are FrontX MFEs. The viewer resolves widget MFEs at run time and hosts them in its own registry.

* Good, because it uses the loading, actions, and domains that the host framework already provides.
* Good, because TypeScript types and the shared data types line up with FrontX base types.
* Good, because consumers can ship widget kinds as separately built packages.
* Neutral, because the split between one MFE per widget kind and widgets bundled into the viewer MFE is decided separately in ADR-0011.
* Bad, because per-instance isolation duplicates library code across instances.
* Bad, because each widget needs MFE entries, a manifest, and typed action contracts.

### A single plain React component mounted as one FrontX extension

The host still runs FrontX. The template would ship one FrontX extension whose content is a plain React tree. The viewer would import widget components directly and pass data through props. There would be no widget MFEs, no nested host, and no FrontX actions inside the dashboard.

* Good, because the build is simple: one bundle, and the chart and grid libraries are evaluated once per dashboard, not once per widget instance.
* Good, because there are no widget MFE entries, manifests, or action types to maintain.
* Bad, because consumers cannot add widget kinds as separately built packages. A new kind needs a rebuild of the template's component.
* Bad, because widgets can couple through shared module state.
* Bad, because widget contracts would be TypeScript props only, which cannot be validated as data (see ADR-0003).
* Bad, because the host modal domain holds FrontX extensions, so modal drill-down (`cpt-frontx-dashboard-fr-drilldown-modal`) would still need a separate MFE outside this model.

## More Information

* **Review trigger**: revisit this decision when a FrontX release changes MFE load isolation or the template contracts (the overlay format or the `template-shell` host contract).
* **Scope**: this decision covers the framework, the language, and the MFE packaging model. It does not cover theme delivery (ADR-0008), extension domains (ADR-0010), widget realization (ADR-0011), overlay packaging and viewer placement (ADR-0016), or the chart and grid libraries (ADR-0004 and ADR-0005). Authoring is out of scope for this template, so there is no authoring interface and dashboards are written as data.
* **Checklist applicability**: ARCH applicable (sets the framework and packaging model); PERF applicable (per-instance library cost); SEC applicable (per-instance isolation between independently built widgets); REL applicable (fault containment limits and the `develop` line dependency); DATA N/A (data types are decided in ADR-0003); INT applicable (FrontX packages and the `template-shell` host contract); OPS N/A (the template is applied into the consumer's build and has no deployment of its own); MAINT applicable (pin policy for the moving `develop` line); TEST applicable (build checks and review confirm compliance); COMPL N/A (no regulated data or new license is introduced); UX N/A (no user-facing behavior is decided here); BIZ applicable (consumers adopt through `frontx add` and add their own widget kinds).
* Related decisions: FrontX ADR-0006 (MFE handler resolution), FrontX ADR-0011 (load isolation), FrontX ADR-0018, ADR-0020, and ADR-0030 (templates), and FrontX ADR-0036 (extension routing).

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements or design elements:

* `cpt-frontx-dashboard-fr-overlay-install` — the template is a FrontX overlay applied with `frontx add` and depends on `template-shell` only.
* `cpt-frontx-dashboard-fr-viewer-host` — the viewer is a FrontX MFE inside the host application, not a separate application.
* `cpt-frontx-dashboard-fr-widget-catalog` — widgets are FrontX MFEs, and consumers add kinds as separate packages.
* `cpt-frontx-dashboard-fr-theme` — the FrontX shared-property channel is what ADR-0008 uses to deliver the theme.
* `cpt-frontx-dashboard-nfr-compatibility` — the framework choice and the pin policy set the supported FrontX baseline.
