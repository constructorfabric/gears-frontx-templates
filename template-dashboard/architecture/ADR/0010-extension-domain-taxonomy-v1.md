---
status: accepted
date: 2026-10-05
decision-makers: template-dashboard architecture maintainers
---

# ADR-0010: Extension domain taxonomy


<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Own modal domain](#own-modal-domain)
  - [Change the host modal domain contract](#change-the-host-modal-domain-contract)
  - [Modal container](#modal-container)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-dashboard-adr-extension-domain-taxonomy`
## Context and Problem Statement

The Viewer host mounts widget microfrontends into extension domains. Three mount surfaces recur: the multi-cell widget canvas, a non-blocking detail panel, and a focus-trapped modal drill-down with peer navigation (previous/next). The DevExpert prototype defined three template-owned domains: `layout_cells`, `detail_panel` and its own `modal`.

On FrontX the host application already owns a modal domain. The template's host is `template-shell`, whose host modal domain declares `extensionsActions: []`, so an extension mounted there cannot receive any action such as `set_subject` or `set_data`. `template-shell` registers this domain but today renders no slot for it, so nothing mounted there is visible until the host renders it. Domains also have occupancy semantics: FrontX ADR-0009 requires each domain to select a mount strategy, and its cardinality matrix fixes which lifecycle actions the domain must or must not declare. The question is which domains the template defines, how each occupies, and how modal drill-down reaches widgets.

## Decision Drivers

* A bounded, enumerable set of mount surfaces that authors can reason about.
* Compliance with FrontX ADR-0009: strategy and declared lifecycle actions must agree at domain registration.
* Widgets stay unchanged: every widget receives `set_subject` and `set_data` identically in every surface.
* The template changes no `template-shell` file and is an add-only overlay; what it needs from the host is stated as a host requirement.
* Peer navigation from the modal back to the originating cell must work across host boundaries.
* No extension is created on Prev or Next, and the modal does not close between peer steps.
* Theme is the only shared property of the template's own domains (`layout_cells`, `detail_panel`, `modal_panel`); widget entries require theme only.

## Considered Options

* **Own modal domain** — keep the prototype's three-domain taxonomy: `layout_cells`, `detail_panel` and a template-owned `modal` domain.
* **Change the host modal domain contract** — amend the host modal domain so that it declares the widget actions.
* **Modal container** — two Viewer host domains, and a template-shipped static modal container extension that occupies the host modal domain and hosts the widgets in its own inner domain.

## Decision Outcome

Chosen option: "Modal container", because it is the only option that gives modal drill-down widgets their actions without the template changing `template-shell` files and without a second, template-owned modal surface that would compete with the host's. Its one host prerequisite, a rendered slot for the host modal domain, is stated below.

**Domains.** The Viewer host registers two domains, both with the concurrent mount strategy of FrontX ADR-0009 and the lifecycle actions `load_ext`, `mount_ext` and `unmount_ext` (the cardinality matrix requires unmount for a concurrent domain). The modal container registers a third domain of the same shape, described under modal drill-down below:

* `gts.frontx.mfes.ext.domain.v1~frontx.v.layout.layout_cells.v1` — one domain per dashboard, and one Viewer host per application tree (`cpt-frontx-dashboard-constraint-one-viewer-per-tree`), because the domain identifier is fixed and the FrontX collision guard is tree-global; each cell is an occupying extension; `unmount_ext` is used only on dashboard teardown.
* `gts.frontx.mfes.ext.domain.v1~frontx.v.layout.detail_panel.v1` — the panel is open while it has occupants. The Viewer host enforces "zero or one panel". `mount_widget` becomes a chain: `unmount_ext` of the current occupant, `mount_ext` of the new one, then `set_subject` and `set_data`.

**Host actions.** The template defines six host actions `gts.frontx.mfes.comm.action.v1~frontx.v.mfe.{set_subject,set_data,mount_widget,navigate_peer,set_local_filter,set_drilldown_context}.v1~`. `set_subject` and `set_data` are extension actions of all three template domains, and `navigate_peer` is an extension action of `layout_cells`. `mount_widget` is a domain action of `detail_panel` only: every drill-down request, for the panel or the modal, targets `detail_panel`, and the Viewer host reads the target surface from the source widget's drill-down declaration; `modal_panel` does not declare `mount_widget`. `set_local_filter` is a domain action of `detail_panel` and `modal_panel`. `set_drilldown_context` is declared on `modal_panel` only. Theme is the only shared property of these domains, so widget entries require theme only. The `frontx.widgets.area.*` types are not used.

**Extension registration.** Extensions are never registered on Prev or Next. The Viewer host registers a dashboard's widget extensions in its own registry when the Viewer host resolves the dashboard instance from its GTS content package (the demo package or a consumer instance package): the cells for `layout_cells` and the drill-down widgets for `detail_panel`. The widget extensions for the container's `modal_panel` belong to the container's registry, which exists only after the container's first mount (FrontX ADR-0008), and FrontX has no action that registers an extension in another registry. The modal container therefore registers a drill-down's widget extensions only when that drill-down opens, from the widget list in `set_drilldown_context`, which is the union of all widgets any peer of that origin can show. This question (PRD Q5) is resolved in the DESIGN (§4). A peer step only mounts, unmounts and feeds extensions that are already registered. The collision guard of FrontX ADR-0007 covers extensions as well as domains, so every extension identifier is unique in the tree.

**Modal drill-down.** The modal container is a static extension declared in the `dashboard-viewer` manifest for the host modal domain. It declares no custom actions, and its fields carry no per-step data: no subject, no widget data, no peer position. The container entry requires theme and language, because the host modal domain shares both. The container learns the drill-down context, that is the originating cell, the peer position, the dashboard palette and mode and the widget list, from the domain action `set_drilldown_context`, which the Viewer host sends to `modal_panel` when the drill-down opens and again with each peer update. This question (PRD Q6) is resolved in the DESIGN (§4), and it adds no per-step data to the container's fields. The container is a nested host: in its own registry it registers the inner domain `gts.frontx.mfes.ext.domain.v1~frontx.v.layout.modal_panel.v1`. Like `detail_panel`, this domain is an instance of the FrontX domain base with the concurrent strategy, the same lifecycle actions, the extension actions `set_subject` and `set_data`, the domain action `set_local_filter` and the `detail_panel` extension type; it adds the domain action `set_drilldown_context` and does not declare `mount_widget`, so no new domain type is introduced.

**Host requirement.** The modal is visible only if the host renders the host modal domain through a domain slot with modal chrome, focus trap and dismissal. Current `template-shell` registers the host modal domain but renders no slot for it, so this slot is a prerequisite `template-shell` change tracked outside the template and is part of the host contract (ADR-0016). The template itself renders no modal chrome around the host modal domain.

Opening a drill-down is one `mount_ext` of the container into the host modal domain. The Viewer host then sends `set_drilldown_context` to `modal_panel`, and the container registers the drill-down's widget extensions that it does not hold yet. The Viewer host then mounts the widgets of the opened item into `modal_panel` with `mount_ext` and feeds them with `set_subject` and `set_data`, as in any other surface; how it resolves their data is decided in ADR-0014. The container stays mounted until the user closes the modal, which runs `unmount_ext` of the container.

The container does not reuse the `detail_panel` identifier. Under FrontX ADR-0007 every admitted domain is advertised upward to the shell, and the collision guard is tree-global: an ancestor that already holds the identifier, locally or through another edge, rejects the advertisement and logs a diagnostic. A second `detail_panel` would therefore be rejected by the shell.

**Reaching `modal_panel`.** The Viewer host's actions for `modal_panel` and its widgets travel by FrontX forwarding. When the container's registry admits `modal_panel` and its extensions, it advertises these targets upward through the container's inbound bridge, so the shell holds a downward forwarding entry for each of them (FrontX ADR-0007). An action that the Viewer host sends to such a target finds no handler in the Viewer host's registry, escalates through the Viewer host's inbound bridge to the shell and is handed down to the container's registry. There it is admitted because `modal_panel` declares it. Like the Viewer host, the container builds its registry and registers `modal_panel` synchronously inside its first mount, so the registry is linked and advertises its targets (FrontX ADR-0008). Closing the modal deactivates the container's bridge and keeps the forwarding entries; the next opening reactivates the same bridge, and targets re-stated over that live edge do not trigger the collision guard.

**Peer navigation.** The Prev and Next controls belong to the container. They send `navigate_peer` targeted at the origin extension, a cell in the Viewer host's `layout_cells`. The container knows the origin cell and the current peer position from the latest `set_drilldown_context` (PRD Q6, resolved in the DESIGN (§4)). The container's registry has no handler for the origin, so the chain escalates upward through the container's inbound bridge to the shell (FrontX ADR-0007). The shell holds a downward forwarding entry for the origin, advertised by the Viewer host's registry, and hands the action down to that registry (FrontX ADR-0008). There the action is admitted because `layout_cells` declares `navigate_peer`. The `mount_widget` that answers `navigate_peer` carries a peer-step marker. A `mount_widget` without the marker is a new drill-down: if the container is still mounted, its opening `mount_ext` completes at once (FrontX ADR-0009). `set_drilldown_context` carries the widget list only at drill-down open; peer and theme updates carry none. If the hand-over is refused, the container falls back to `unmount_ext` of itself.

This path has one prerequisite: the Viewer host builds its nested registry synchronously inside its first mount. Only then is the registry linked to the shell, so its targets, including the origin cell, are advertised (FrontX ADR-0008). A registry built after `mount` returns behaves as a root registry and the hand-over finds no forwarding entry. This construction order (PRD Q3) is resolved in the DESIGN (§4), as are the registration of the `modal_panel` widget extensions (Q5) and the drill-down context that the container receives from the Viewer host (Q6). The modal flow has one further prerequisite outside the template: the host renders the host modal domain through a slot, as stated in the host requirement above.

**Peer step.** The origin moves its cursor, and the Viewer host resolves the next item and updates the container's `modal_panel`. When the next item shows the same widgets, the step is only `set_subject` and `set_data` to these widgets. When the widgets differ, the Viewer host first runs `unmount_ext` of the current nested extensions and `mount_ext` of the next ones in `modal_panel`, then `set_subject` and `set_data`. A modal query that fails reaches the widget's slot through `set_data` (ADR-0014). No extension is registered or unregistered during navigation, because the widget list registered when the drill-down opened already covers every widget a peer of that origin can show, and the host modal domain receives no action, so the container is not remounted and the modal never closes between steps. The container disables Prev and Next while the next item resolves, and the next step is visible within `cpt-frontx-dashboard-nfr-peer-navigation-latency` after its data is resolved.

### Consequences

* Good, because the template owns no second modal surface and changes no `template-shell` file; modal chrome, focus trap and dismissal are a host requirement on the rendered modal-domain slot.
* Good, because widgets are identical across `layout_cells`, `detail_panel` and the container's `modal_panel`.
* Good, because all three template domains are consistent with the FrontX ADR-0009 matrix and pass admission, and their identifiers are unique in the tree.
* Good, because peer navigation needs no new action and no shell change.
* Good, because no extension is registered on Prev or Next and the container is one static extension: a peer step registers nothing, the modal stays open, and every opening reuses the container's runtime and registry (FrontX ADR-0008).
* Neutral, because a step to an item with different widgets runs nested `unmount_ext` and `mount_ext` in `modal_panel` before `set_subject` and `set_data`, so it costs more than a step with the same widgets.
* Bad, because the container is an extra nested-host layer: every action for a modal widget escalates from the Viewer host to the shell and is handed down into the container's registry.
* Bad, because peer navigation depends on the Viewer host building its registry synchronously in its first mount, and delivery to `modal_panel` depends on the container doing the same; a later refactoring that makes either asynchronous breaks the hand-over.
* Bad, because modal drill-down depends on a host prerequisite: current `template-shell` registers the host modal domain but renders no slot for it, so the slot with modal chrome, focus trap and dismissal is a `template-shell` change tracked outside the template, and the modal cannot be shown until it exists.
* Neutral, because the container registers, when a drill-down opens, the union of all widgets any peer of that origin can show, so it may hold extensions for widgets that no visited peer shows.
* Bad, because the replacement order of `detail_panel` (unmount, mount, set data) is a chain with more steps than a single action, and its failure handling must be specified.
* Bad, because the container's dependence on the host modal domain's role makes the host contract a documented coupling that follows `template-shell` changes.

### Confirmation

* Domain registration tests verify that `layout_cells`, `detail_panel` and `modal_panel` are accepted with the concurrent strategy and that omitting `unmount_ext` is rejected, that `mount_widget` is declared on `detail_panel` only, and that `set_drilldown_context` is declared on `modal_panel` only.
* A test opens a modal drill-down, closes it and opens it again, checking each time that no registry logs a collision diagnostic and that `modal_panel` is advertised to the shell.
* A test checks that a `set_data` sent by the Viewer host is forwarded through the shell and reaches a widget mounted in the container's `modal_panel`, after the container registered that widget's extension from the widget list in `set_drilldown_context`.
* A test opens a modal drill-down and steps through peers, checking that `navigate_peer` escalates to the shell and reaches the Viewer host through downward forwarding, and that a refused hand-over unmounts the container.
* A test checks that the `mount_widget` answering `navigate_peer` carries the peer-step marker and that a `mount_widget` without it opens a new drill-down.
* A test opens a modal drill-down whose peers show different widgets and checks that the widget list in `set_drilldown_context` is the union of all widgets any peer of that origin can show.
* A test steps through peers, including a step to an item with different widgets, and checks that no extension is registered or unregistered on Prev or Next, that the host modal domain receives no `mount_ext` or `unmount_ext` during navigation, and that each step is visible within `cpt-frontx-dashboard-nfr-peer-navigation-latency`.
* An integration test checks that the Viewer host's and the container's registries are built synchronously in their first mount, so their targets are advertised to the shell before the first drill-down and before the first nested `mount_ext`.
* Design review confirms that the container is declared statically in the `dashboard-viewer` manifest with no per-step data fields, that no `frontx.widgets.area.*` type and no template-owned domain with modal chrome exists, and that the template changes no `template-shell` file.
* On a host that renders the host modal-domain slot, an integration test checks that the open modal shows the host's modal chrome, traps focus and, on dismissal, runs `unmount_ext` of the container.

## Pros and Cons of the Options

### Own modal domain

Three template domains, the third with its own modal chrome.

* Good, because widgets receive their actions directly and the taxonomy mirrors the prototype.
* Bad, because the template would own a second modal surface next to the host's, duplicating focus-trap, dismissal and z-ordering behavior.
* Bad, because it bypasses the host's modal role.

### Change the host modal domain contract

Amend `template-shell` so the host modal domain declares `extensionsActions`.

* Good, because widgets would mount directly into the host modal.
* Bad, because the template stops being an add-only overlay and every host must adopt the change.
* Bad, because the modal domain would need to know dashboard-specific actions, contrary to substrate neutrality.

### Modal container

A template-shipped static extension occupies the host modal domain and hosts widgets in its own `modal_panel` domain, which the Viewer host drives through forwarded actions.

* Good, because the template changes no `template-shell` file and owns no modal surface; modal chrome, focus trap and dismissal stay with the host.
* Good, because the container is a regular entry in the viewer package and is declared once, so no extension is registered on Prev or Next.
* Good, because peer steps change only `modal_panel`, so the modal stays open between steps.
* Neutral, because the container entry requires theme and language, since the host modal domain shares both, while widget entries require theme only.
* Bad, because it adds a nested host, and every action for a modal widget depends on forwarding across it.
* Bad, because it requires the host to render its modal domain through a slot, which current `template-shell` does not do yet.

## More Information

**Review trigger.** Revisit if the host modal domain gains widget actions in its `extensionsActions`, which would allow widgets to mount there directly, if the FrontX ADR-0009 occupancy matrix changes, if FrontX forwarding (FrontX ADR-0007, ADR-0008) stops reaching targets registered in a nested host's registry, or if the `template-shell` change that renders the host modal-domain slot is rejected or takes a different form.

**Scope.** This record decides which extension domains the template defines, how each occupies, when widget extensions are registered, and how modal drill-down and peer navigation reach widgets. It does not decide the action dispatch mechanism (FrontX ADR-0007), the bridge and registry linking (FrontX ADR-0008), the occupancy model (FrontX ADR-0009), entry compatibility (FrontX ADR-0010) or load isolation (FrontX ADR-0011).

**Checklist applicability.** ARCH applicable and addressed above. PERF applicable: a peer step acts on `modal_panel` only, with nested `unmount_ext` and `mount_ext` only when the widgets differ, and no container remount. SEC not applicable because no admission or authorization mechanism is decided; isolation is decided in FrontX ADR-0011. REL applicable: the fallback `unmount_ext` covers a refused hand-over, and the synchronous registry construction in the Viewer host and the container (Q3), the registration of `modal_panel` widget extensions (Q5) and the container's drill-down context (Q6) are resolved in the DESIGN (§4). DATA not applicable because no persistent store or schema is involved. INT applicable: the contract with the host modal domain (its actions, shared properties, optional strategy and the rendered slot that is a host prerequisite) is a documented coupling with `template-shell`. OPS not applicable because no operational procedure is governed. MAINT applicable: the host contract must be re-checked when `template-shell` changes. TEST applicable: the Confirmation tests cover registration, collision, forwarding into `modal_panel`, and navigation without registration and without host modal actions. COMPL not applicable because no regulatory obligation is involved. UX applicable: modal chrome, focus trap and dismissal are a host requirement on the rendered modal-domain slot, the modal never closes between peer steps, and Prev and Next are disabled while the next item resolves. BIZ not applicable because no business rule is decided.

**Related FrontX decisions.** FrontX ADR-0007 (action dispatch and chaining), ADR-0008 (child MFE host access), ADR-0009 (extension domain occupancy), ADR-0010 (domain-extension compatibility), ADR-0011 (MFE load isolation).

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements or design elements:

* `cpt-frontx-dashboard-fr-drilldown-panel` — the `detail_panel` domain hosts single-subject inspection.
* `cpt-frontx-dashboard-fr-drilldown-modal` — the modal container delivers modal drill-down in the host modal domain.
* `cpt-frontx-dashboard-fr-peer-navigation` — `navigate_peer` from the container reaches the originating extension.
* `cpt-frontx-dashboard-fr-local-filter-overlay` — `set_local_filter` is one of the six host actions.
* `cpt-frontx-dashboard-fr-viewer-host` — the Viewer host registers the template domains and the dashboard's `layout_cells` and `detail_panel` widget extensions when it resolves the dashboard instance, and enforces zero or one panel; one Viewer host is mounted per application tree.
* `cpt-frontx-dashboard-contract-host-domains` — the host screen domain and host modal domain roles are the contract with the host, including the rendered modal-domain slot.
* `cpt-frontx-dashboard-nfr-peer-navigation-latency` — a peer step updates `modal_panel` only, with no container remount and no host modal action.
* `cpt-frontx-dashboard-usecase-drilldown-peers` — the use case traverses this domain and container flow.
