---
status: accepted
date: 2026-10-05
decision-makers: template-dashboard architecture maintainers
---

# ADR-0006: Viewer state management

**ID**: `cpt-frontx-dashboard-adr-viewer-state-management`

<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Zustand](#zustand)
  - [Jotai](#jotai)
  - [Redux Toolkit](#redux-toolkit)
  - [Valtio](#valtio)
  - [MobX](#mobx)
  - [Nanostores](#nanostores)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

## Context and Problem Statement

The Viewer host holds interactive UI state: the global filter state (including the time window seeded from the dashboard instance), view settings, and the selection that drives drill-down. The filter panel and other Viewer-host components subscribe to this state, and a filter change must reach only the parts that depend on it. Widgets never subscribe to the store. They receive query results from the Viewer host (see [ADR-0014](0014-viewer-host-orchestrated-query-lifecycle-v1.md)). The earlier DevExpert prototype used Zustand for the same job and sized it for a large preloaded payload held in the store. In the template that framing no longer applies: entity data is loaded through `EntitySource` into the Data Query Worker (see [ADR-0007](0007-viewer-data-query-layer-v1.md)), and the store holds UI state only.

FrontX isolates each MFE instance and shares no singletons (FrontX ADR-0011). Every Viewer host instance therefore needs its own state, and two open viewers must never see each other's filters.

Which state library holds Viewer host UI state, and how is it scoped?

## Decision Drivers

* Strict TypeScript inference on store state, selectors, and middleware.
* No global singleton and no required Provider, so state can be scoped to one Viewer host instance.
* Fine-grained selector subscriptions, so a filter change re-renders only the affected components.
* Small bundle, because the library is loaded once per instance.
* Reliable AI code generation for standard store and selector patterns.
* Development tooling for action logging and state diffing.

## Considered Options

* Zustand
* Jotai
* Redux Toolkit
* Valtio
* MobX
* Nanostores

## Decision Outcome

Chosen option: "Zustand", because it is small, needs no Provider, types well under strict mode, and lets the Viewer host create one store per instance as a plain vanilla store.

The store holds Viewer host UI state only: filter state, the global time window, view settings, and drill-down selection. It holds no entity data. Entity collections, indices, and query results stay in the Data Query Worker. The store is created when a Viewer host instance mounts and is discarded when it unmounts, so no state is shared between instances. A change to the global time window is the one store change that triggers an entity reload (see ADR-0007). Other filter changes are sent to the Worker as in-memory queries.

Filter state is TS-internal and is not a GTS contract. The store lives on the main thread. Each query request the Viewer host sends to the Worker carries a snapshot of the filter state, so the Worker never reads the store. Widgets do not import or subscribe to the store; the Viewer host delivers their results (ADR-0014).

### Consequences

* Good, because the library is about 1.1 KB gzipped, so loading it per instance costs little.
* Good, because a store is a plain module-level factory. One store per Viewer host instance fits FrontX isolation without a Provider tree or a shared singleton.
* Good, because selectors with equality checks keep re-renders limited to components that read the changed slice.
* Good, because the store never wraps loaded data, so no proxying or copying cost is added to the data path.
* Bad, because there is no built-in derived-state caching. Mitigation: memoize derivations with `useMemo` or shared memoized selector functions.
* Bad, because a single store makes it harder to trace which change caused which re-render. Mitigation: named actions for filter changes and the DevTools middleware in development builds only.

### Confirmation

Confirmed by code review and by tests:

* Entity data is never stored in the Zustand store. Only filter state, view settings, and selection are.
* Two Viewer host instances in separate application instances (for example two browser tabs) keep independent filter state, and each store is created on mount and discarded on unmount. One application tree mounts one Viewer host (DESIGN constraint `cpt-frontx-dashboard-constraint-one-viewer-per-tree`).
* Changing one filter value re-renders only the components that read it, checked with a hook test.
* No module-level store singleton exists in the Viewer host package. Stores come from a factory called at mount.
* No widget package imports the store, and each query request sent to the Worker carries a filter snapshot.

## Pros and Cons of the Options

### Zustand

The hook-based store library with selector subscriptions.

* Good, because it is the smallest full-featured option.
* Good, because vanilla stores need no Provider and can be created per instance.
* Good, because TypeScript inference is strong and AI coverage is high.
* Good, because DevTools middleware is available.
* Bad, because there is no derived-state caching.

### Jotai

The atomic state library with derived atoms.

* Good, because derived atoms cache automatically.
* Good, because it is small and well typed.
* Bad, because atoms use a default global store unless every host adds its own Provider, which adds ceremony for per-instance scoping.
* Bad, because a large atom graph is harder to debug.

### Redux Toolkit

The established store with memoized selectors.

* Good, because memoized selectors and DevTools are mature.
* Bad, because the Provider plus singleton store pattern works against per-instance scoping.
* Bad, because it is much larger (11 KB+), and the action and reducer ceremony is more than UI state needs.

### Valtio

The proxy-based reactive state library.

* Good, because property-level tracking removes manual selectors.
* Bad, because proxy overhead and hidden cost grow with state size, and the proxy model offers little for a small UI state.

### MobX

The observable-based reactive library.

* Good, because computed values are cached and tracked automatically.
* Bad, because it is the largest option (about 16 KB gzipped) and is loaded again by each instance.
* Bad, because class-based observable patterns are heavier than the UI state needs.

### Nanostores

A minimal framework-agnostic atom library.

* Good, because it is the smallest option and has no Provider.
* Bad, because derived stores have no structural equality, so re-renders happen when output is unchanged.
* Bad, because AI coverage is limited and the ecosystem is small.

## More Information

* This ADR covers Viewer host UI state only. Data loading and querying belong to ADR-0007. Ownership of filter state and the query lifecycle belongs to [ADR-0014](0014-viewer-host-orchestrated-query-lifecycle-v1.md).
* Evolution path: if derived state grows, the store can be split by concern (filter state, view settings, selection) without changing how components subscribe.
* Scope: changes the Viewer host UI state (filter state, time window, view settings, drill-down selection) and its per-instance lifetime. Does not change widgets, the Worker, or any GTS contract.
* Checklist applicability:
  * ARCH: applicable, addressed by the decision and options.
  * PERF: applicable, small per-instance bundle and selector-scoped re-renders.
  * SEC: N/A, because the store holds UI state only, with no credentials and no entity data.
  * REL: N/A, because the store is in-memory UI state with no external dependency; load failures are handled in ADR-0007 and ADR-0015.
  * DATA: N/A, because nothing is persisted; the store is discarded when the Viewer host instance unmounts.
  * INT: applicable, the filter snapshot in each query request is the internal seam to the Worker (ADR-0014); it is not a GTS contract.
  * OPS: N/A, because the template is a source overlay with no deployed service; the consuming application owns operations.
  * MAINT: applicable, see the evolution path.
  * TEST: applicable, see Confirmation.
  * COMPL: N/A, because UI state contains no regulated data.
  * UX: applicable, filter changes stay responsive and two open viewers keep independent filters.
  * BIZ: N/A, because this is a technical decision.
* Review trigger: memoization of derived slices becomes unmanageable; interdependent filter graphs, undo and redo, or optimistic updates outgrow a single store; the data layer needs state integration beyond UI state.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements or design elements:

* `cpt-frontx-dashboard-fr-viewer-host` — the Viewer host owns one Zustand store per instance for its UI state.
* `cpt-frontx-dashboard-fr-filter-panel` — filter panel state lives in the store and is updated through named actions.
* `cpt-frontx-dashboard-fr-time-window-reload` — a time-window change in the store is the only store change that triggers an entity reload.
* `cpt-frontx-dashboard-fr-local-filter-overlay` — local overlays are layered on top of the global filter state held in the store.
* `cpt-frontx-dashboard-nfr-filter-latency` — selector subscriptions keep re-render work small when a filter changes.
