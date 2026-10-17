---
status: accepted
date: 2026-10-05
decision-makers: template-dashboard architecture maintainers
---

# ADR-0014: Viewer-host-orchestrated query lifecycle

<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Widget-orchestrated lifecycle](#widget-orchestrated-lifecycle)
  - [Viewer-host-orchestrated lifecycle](#viewer-host-orchestrated-lifecycle)
  - [Hybrid](#hybrid)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-dashboard-adr-viewer-host-query-lifecycle`

## Context and Problem Statement

The Viewer host mounts widget microfrontends into the `layout_cells` domain it registers. Each widget needs two inputs: its placement configuration (title, labels, formatting, the query to use) and the data a query produced for it. The data changes when the user edits a filter. The domain mechanism offers shared properties, which are single values seen by every occupant, and actions addressed to one extension. Per-widget data cannot travel as a shared property, so it has to be delivered by action.

Two designs are possible. Each widget could watch the filters, build its own query request and call the Worker. Or the Viewer host could own the filters and the query lifecycle and hand finished data to passive widgets. The prototype chose the second design with its shell as orchestrator; in this template the orchestrator is the Viewer host, a nested host inside a FrontX shell.

Drill-down adds a second case. A modal opened from a widget shows further widgets, and the host modal domain declares no custom actions, so widgets mounted there cannot receive `set_subject` or `set_data` from the Viewer host directly.

Who owns filter state and the query lifecycle, how does data reach widgets, and how does modal drill-down fit the same model?

## Decision Drivers

* Small widget surface: 13 widget kinds should contain rendering code only, not Worker choreography or error handling for the data path.
* One source of truth for filters, so all visible widgets reflect the same snapshot.
* Respect the domain mechanism: shared properties are domain-wide, per-extension data travels by action (FrontX ADR-0007).
* Predictable author contract: receive `set_subject` once, receive `set_data` whenever data is ready, render.
* Central re-query policy: re-query only the widgets a filter change affects, and allow debounce and de-duplication in one place.
* Modal widgets must work although the host modal domain accepts no custom actions (`cpt-frontx-dashboard-fr-drilldown-modal`).

## Considered Options

1. **Widget-orchestrated lifecycle** — each widget watches filters, builds requests and calls the Worker.
2. **Viewer-host-orchestrated lifecycle** — the Viewer host owns filter state, requests and delivery; widgets are passive.
3. **Hybrid** — the Viewer host announces filter changes; widgets build and send their own requests.

## Decision Outcome

Chosen option: "Viewer-host-orchestrated lifecycle", because it keeps widgets minimal, makes the filter snapshot a structural property and fits the action-based delivery the domain mechanism requires.

The decision:

* **Filter state.** The Viewer host owns the filter state. It is a TS-internal Zustand store that lives on the main thread in the Viewer host; it is not a GTS type and is not broadcast as a shared property. The store is not shared with the Worker: each `query.request` carries a snapshot of the filter values to the Worker. The dashboard's `data_start` and `data_end` seed the time window in that state.
* **Query lifecycle.** The Viewer host builds each `gts.frontx.v.query.request.v1~`, posts it to the Worker, unwraps the response and delivers the result. Widgets never hold the Worker handle and never read filter state.
* **Delivery.** Every widget realization receives the `set_subject` action first, carrying its widget instance, then the `set_data` action, carrying typed widget data. `set_data` is also the only signal that data changed.
* **Mount and unmount.** The Viewer host registers the `layout_cells` and `detail_panel` widget extensions when it resolves the dashboard instance from its GTS content package (the demo package or a consumer instance package) (ADR-0010); mounting never registers an extension. Extensions are never registered on Prev or Next: the modal container registers a drill-down's `modal_panel` widget extensions only when that drill-down opens, from the widget list in `set_drilldown_context`, which is the union of all widgets any peer of that origin can show (PRD Q5, resolved in the DESIGN (§4)). The Viewer host uses the FrontX actions `gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.mount_ext.v1~` and `gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.unmount_ext.v1~` to mount a widget into its `layout_cells` cell and to unmount it. `unmount_ext` is used on dashboard teardown.
* **Re-query.** A change of the global time window makes the Worker reload entities (ADR-0015); after the reload completes, the Viewer host re-queries every mounted widget and delivers fresh `set_data`. Any other filter change re-queries only the widgets whose query lists the changed filter in `filter_scopes`; widgets with no matching scope are not touched and are the non-reactive ones for that filter. For each widget the latest request wins: a response to an older request is discarded, so a slow earlier response never replaces newer data.
* **Modal drill-down.** Every drill-down request reaches the Viewer host as `mount_widget` on `detail_panel`, and the Viewer host reads from the source widget's drill-down declaration whether the target is the panel or the modal. For a modal it resolves `widget_data` for the modal widgets with the same Worker, the global filters, the local filter overlay and the subject. It opens the modal with one `mount_ext` of the static modal container (ADR-0010) into the host modal domain; the container stays mounted until the user closes the modal, and its fields carry no data. The Viewer host then sends `set_drilldown_context` to `modal_panel` with the origin cell, the peer position, the dashboard palette and mode and the drill-down's widget list, and the container registers the listed widget extensions it does not hold yet. The Viewer host itself drives the container's inner domain `gts.frontx.mfes.ext.domain.v1~frontx.v.layout.modal_panel.v1`: it mounts the modal widgets there with `mount_ext` and delivers `set_subject` and `set_data` to them. These actions reach the container's registry through FrontX forwarding: they escalate from the Viewer host's registry to the shell and are handed down along the forwarding entries that the container's registry advertised (FrontX ADR-0007, ADR-0008). A modal query that fails is delivered with `set_data` to that widget's slot as an error, while the other modal widgets render. On each Prev or Next step the originator moves its cursor and the Viewer host resolves the next item. The `mount_widget` that answers `navigate_peer` carries a peer-step marker; a `mount_widget` without the marker is a new drill-down, and if the container is still mounted its opening `mount_ext` completes at once (FrontX ADR-0009). The Viewer host sends `set_drilldown_context` with the new peer position and no widget list: the list is carried only at drill-down open, and peer and theme updates carry none. When the next item shows the same widgets, the Viewer host sends only `set_subject` and `set_data`; when the widgets differ, it first runs `unmount_ext` of the current nested extensions and `mount_ext` of the next ones in `modal_panel`. No extension is registered on Prev or Next, and the host modal domain receives no action during navigation, so the modal stays open between steps. The registration of the `modal_panel` widget extensions (PRD Q5), the drill-down context the container receives from the Viewer host (PRD Q6) and the construction order of both registries (PRD Q3) are resolved in the DESIGN (§4). The modal also needs the host to render the host modal domain through a domain slot with modal chrome, focus trap and dismissal; current `template-shell` renders no slot for it, so this is a prerequisite `template-shell` change tracked outside the template (ADR-0016). Alternatives considered for this sub-decision:
  * Container in the host modal domain, whose `modal_panel` the Viewer host drives through forwarded actions — chosen, because ADR-0016 allows only add-only changes to the host and the host modal domain declares no extension actions, while forwarded actions reach widgets inside the container's own domain without any change to the host modal domain's contract.
  * Change the host modal domain to declare the widget actions — rejected, because it modifies `template-shell`.
  * A template-owned modal domain registered by the Viewer host — rejected, because the template owners decided to rely on the host modal domain; a second modal surface would duplicate the host's modal chrome, focus trap and dismissal.

### Consequences

* Good, because widget authors write rendering code only, with one small contract for every kind.
* Good, because filter changes converge: one owner decides which widgets re-query.
* Good, because errors from the data path reach the Viewer host, which decides how to show them; widgets never receive the Worker's `query.error` response.
* Good, because modal widgets need no custom actions on the host modal domain; they receive `set_subject` and `set_data` in the container's `modal_panel` like widgets in any other surface.
* Good, because a peer step acts only on `modal_panel`: no host modal mount or unmount and no container remount per step.
* Bad, because the Viewer host grows into the central coordinator and needs thorough tests.
* Bad, because delivery by action adds a hop compared with a widget fetching its own data; the cost is an in-tab dispatch.
* Bad, because every widget kind must support `set_subject` and `set_data`; a kind without them cannot mount.
* Bad, because modal delivery depends on FrontX forwarding across two nested hosts: each action for a modal widget escalates to the shell and is handed down to the container, so it fails if either registry is not linked to the shell.
* Bad, because modal drill-down can be shown only on a host that renders the host modal domain through a slot, a `template-shell` change tracked outside the template.
* Neutral, because per-widget query strategies, such as a chart debouncing its own requests, are not available by design.

### Confirmation

Confirmed when:

* Only the Viewer host's orchestration component posts to the Worker; a dependency rule forbids widget packages from importing the Worker handle or the filter store.
* Every `frontx.v.mfe.entry` instance for a widget kind declares support for `set_subject` and `set_data`.
* A filter change other than the time window triggers requests only for widgets whose query declares the changed scope in `filter_scopes`.
* A time-window change triggers one entity reload and, only after it completes, one request for every mounted widget.
* A test that delays a widget's earlier response until after a newer request for the same widget shows that the earlier response is discarded.
* Worker code imports no filter store; each `query.request` carries its own filter snapshot.
* The modal container extension carries no resolved data in its fields, and a Prev or Next step produces no host modal `mount_ext` or `unmount_ext` and registers no extension.
* Opening a modal drill-down sends one `set_drilldown_context` whose widget list is the union of all widgets any peer of that origin can show.
* A `set_data` sent by the Viewer host reaches a widget mounted in the container's `modal_panel` through forwarding.
* A failing modal query is delivered with `set_data` to that widget's slot inside `modal_panel`, which shows the error while the other modal widgets render.
* Widget data never enters the Zustand store.

## Pros and Cons of the Options

### Widget-orchestrated lifecycle

Each widget reads filters, builds a request, calls the Worker and handles the response.

* Good, because each widget can choose its own debounce and retry strategy.
* Good, because the host has less to coordinate.
* Bad, because every widget duplicates filter observation, request building and error handling.
* Bad, because widgets issue independent requests, so races and partial updates are the default failure mode.
* Bad, because modal widgets would need access to filters and the Worker across a boundary with no custom actions.

### Viewer-host-orchestrated lifecycle

The Viewer host owns filters and queries; widgets receive `set_subject` and `set_data`.

* Good, because the widget surface is minimal and uniform.
* Good, because re-query policy is central.
* Good, because it works through the action mechanism and the container for modals.
* Neutral, because the contract can be enforced at registration.
* Bad, because the Viewer host carries more responsibility and an extra dispatch hop.

### Hybrid

The Viewer host announces a filter change; widgets build and send requests themselves.

* Good, because the Viewer host stays smaller than in the full orchestration option.
* Bad, because a filter-snapshot shared property is possible, but request building, races and error handling would still sit in every widget.
* Bad, because widgets still need the Worker handle, including modal widgets behind the host modal domain.

## More Information

* Per-instance Worker and store: each open dashboard has its own Viewer host state, so two dashboards never share filters. One Viewer host is mounted per application tree (`cpt-frontx-dashboard-constraint-one-viewer-per-tree`), so dashboards open at the same time run in separate application instances, such as two browser tabs.
* FrontX ADR-0007 defines action dispatch and chaining, including forwarding across nested hosts, which the Viewer host relies on to drive the container's `modal_panel` and the container relies on for peer navigation.
* Related: ADR-0010 (extension domains, including the container's inner domain), ADR-0013 (query model), ADR-0015 (data loading), ADR-0016 (host modal domain by role).
* **Review trigger:** revisit if widget kinds need their own query strategies, if the Viewer host coordinator misses the filter-latency or peer-navigation budgets, if the host modal domain starts to declare extension actions, or if the host modal-domain slot does not land in `template-shell`.
* **Scope:** ownership of filter state, the query lifecycle, data delivery to widgets, re-query policy and modal drill-down data flow. The query model is in ADR-0013 and entity loading in ADR-0015.
* **Checklist applicability:** ARCH applicable and addressed above. PERF applicable: selective re-query, latest-request-wins and peer steps without a container remount serve the latency budgets. REL applicable: stale responses are discarded and failed modal queries reach the widget's slot through `set_data`. INT applicable: delivery uses FrontX actions and forwarding, and the host modal domain contract, including its rendered slot. MAINT applicable: one uniform widget contract. TEST applicable: dependency rules and lifecycle tests in Confirmation. UX applicable: errors appear in the affected widget's slot. SEC not applicable because no credential or authorization path is decided here (see ADR-0015). DATA not applicable because no persistent store is involved. OPS, COMPL and BIZ not applicable.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements or design elements:

* `cpt-frontx-dashboard-fr-viewer-host` — the Viewer host owns the filter state and the data worker per open dashboard.
* `cpt-frontx-dashboard-fr-filter-panel` — filter edits update the Viewer host's store.
* `cpt-frontx-dashboard-fr-time-window-reload` — a time-window change reloads entities and then re-queries every mounted widget.
* `cpt-frontx-dashboard-fr-local-filter-overlay` — the overlay is applied before modal data is resolved.
* `cpt-frontx-dashboard-fr-drilldown-panel` — panel widgets are mounted with `mount_ext` and receive `set_subject` and `set_data`.
* `cpt-frontx-dashboard-fr-drilldown-modal` — the Viewer host resolves modal data and delivers it to the container's `modal_panel` through forwarded `set_subject` and `set_data`.
* `cpt-frontx-dashboard-fr-peer-navigation` — each step updates `modal_panel` with newly resolved data without remounting the container.
* `cpt-frontx-dashboard-nfr-filter-latency` — selective re-query keeps filter changes within budget.
* `cpt-frontx-dashboard-nfr-peer-navigation-latency` — a peer step adds no host modal mount or unmount after data is resolved.
* `cpt-frontx-dashboard-usecase-drilldown-peers` — the use case runs on this lifecycle.
