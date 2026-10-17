---
status: proposed
version: 1
date: 2026-10-07
description: Type catalog of the template MFE entry type with realizes, the widget manifest, and the 13 widget entries declared by dashboard-widgets, plus the viewer manifest, viewer and modal container entries, and the Viewer host routed extension declared by dashboard-viewer.
---

# Feature: MFE Entries


<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Type-Catalog Feature: No Actor Flows](#type-catalog-feature-no-actor-flows)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Type-Catalog Feature: No Processes](#type-catalog-feature-no-processes)
- [4. States (CDSL)](#4-states-cdsl)
  - [Type-Catalog Feature: No State Machines](#type-catalog-feature-no-state-machines)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Type Catalog Definition of Done](#type-catalog-definition-of-done)
- [6. Type Catalog](#6-type-catalog)
  - [6.1 Template MFE Entry Type](#61-template-mfe-entry-type)
  - [6.2 Widget Manifest](#62-widget-manifest)
  - [6.3 Widget Entries](#63-widget-entries)
  - [6.4 Viewer Package Entries (declared by `dashboard-viewer`)](#64-viewer-package-entries-declared-by-dashboard-viewer)
  - [6.5 Admission Summary](#65-admission-summary)
  - [6.6 Isolation and Packaging Notes](#66-isolation-and-packaging-notes)
  - [6.7 Open Questions](#67-open-questions)
- [7. Acceptance Criteria](#7-acceptance-criteria)

<!-- /toc -->

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-featstatus-mfe-entries`
## 1. Feature Context

- [ ] `p2` - `cpt-frontx-dashboard-feature-mfe-entries`

### 1.1 Overview

This is a **type-catalog feature**, not an actor-flow feature. It defines the template MFE entry type, which extends the FrontX Module Federation entry with one pointer to the widget kind the entry realizes, and it enumerates the entry and manifest instances the template ships. The flow, process, and state sections of the FEATURE template are reduced to short not-applicable notes; the catalog content lives in section 6 Type Catalog.

### 1.2 Purpose

Concrete catalog of the "MFE entry" family of DESIGN section 3.1, ported from the prototype with rebased identifiers (`gts.hai3.mfes.*` to `gts.frontx.mfes.*`, `gts.de.v.*` to `gts.frontx.v.*`, `gts.de.m.*` to `gts.frontx.m.*`, every identifier at `v1`). DESIGN section 3.1 delegates the field-level schemas of these types and instances to this document, so section 6 carries them.

Deltas against the prototype, all decided in the DESIGN and ADR-0011:

- One widget manifest `gts.frontx.mfes.mfe.mf_manifest.v1~frontx.v.widgets.manifest.v1` is defined here, and all 13 widget entries point to it. The prototype pointed each entry to its own manifest.
- Every widget entry lists `navigate_peer` in its `actions`, next to `set_subject` and `set_data`, because `layout_cells` declares it as an extension action.
- The `dashboard-viewer` package entries are listed here as well: the viewer manifest, the viewer entry, the modal container entry, and the Viewer host routed extension. The prototype had no such entries, because its viewer was an application of its own.
- Per-instance isolation; Module Federation is used for bundling only, as a template assumption.

**Declaring packages**:
- `dashboard-widgets` (`src-app/mfe_packages/dashboard-widgets/`) declares the widget manifest and the 13 widget entries through its own `mfe.json`.
- `dashboard-viewer` (`src-app/mfe_packages/dashboard-viewer/`) declares the template MFE entry type schema, as an engine `frontx.v` type (DESIGN section 3.1, Location), and the viewer manifest, the viewer entry, the modal container entry, and the Viewer host routed extension (section 6.4).

**Requirements**: `cpt-frontx-dashboard-fr-widget-catalog`, `cpt-frontx-dashboard-fr-type-catalog`, `cpt-frontx-dashboard-fr-viewer-host`, `cpt-frontx-dashboard-fr-drilldown-modal`, `cpt-frontx-dashboard-fr-peer-navigation`, `cpt-frontx-dashboard-nfr-bundle-budget`

**Principles**: `cpt-frontx-dashboard-principle-per-instance-isolation`, `cpt-frontx-dashboard-principle-gts-contracts`

### 1.3 Actors

N/A. This is a type-catalog feature. The catalog is consumed by the runtime type system and by the registration path of the host and the Viewer host (the manifest channel), not by an end-user actor, so no actor flows are authored.

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md) section 3.1 (Domain Model, MFE entry, ID-form convention), section 3.2 (Widget Library, Modal Container), section 3.3 (Admission of entries), section 3.5 (Host contract, Manifest channel), section 3.9 (Bundle budget)
- **ADRs**: [ADR-0010](../../ADR/0010-extension-domain-taxonomy-v1.md), [ADR-0011](../../ADR/0011-widget-kind-and-mfe-realization-v1.md), [ADR-0016](../../ADR/0016-template-packaging-and-host-contract-v1.md)
- **Design elements**: `cpt-frontx-dashboard-component-widget-library`, `cpt-frontx-dashboard-component-viewer-host`, `cpt-frontx-dashboard-component-modal-container`, `cpt-frontx-dashboard-topology-overlay-packages`
- **Dependencies**: `feature-widget-catalog` (every widget entry realizes one widget kind), `feature-extension-domain-catalog` (the host action types listed in `actions`, the domains the entries are admitted to, and the modal container extension that uses the container entry)

## 2. Actor Flows (CDSL)

**Use cases**: `cpt-frontx-dashboard-usecase-explore-dashboard`, `cpt-frontx-dashboard-usecase-adopt-template`

### Type-Catalog Feature: No Actor Flows

Not applicable because this feature declares static GTS types and instances; no actor interacts with the catalog itself. The runtime paths that use these instances are the manifest channel registration (DESIGN section 3.5) and the kind-to-entry lookup in `cpt-frontx-dashboard-seq-initial-load`.

## 3. Processes / Business Logic (CDSL)

### Type-Catalog Feature: No Processes

Not applicable because the catalog declares schemas and instances only. Registration is done by the shell bootstrap and the Viewer host from the manifest channel, and the kind-to-entry lookup through `realizes:` is part of the Viewer host (DESIGN `cpt-frontx-dashboard-component-viewer-host`).

## 4. States (CDSL)

### Type-Catalog Feature: No State Machines

Not applicable because type and instance declarations are stateless. The extension lifecycle stages are declared by the domains in `feature-extension-domain-catalog`.

## 5. Definitions of Done

### Type Catalog Definition of Done

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-dod-mfe-entries-catalog-complete`

The system **MUST** register the entry type, the two manifests, the 15 entry instances, and the Viewer host routed extension of section 6 through the `mfe.json` of their declaring packages.

- The template MFE entry type extends the FrontX `entry_mf` type and adds exactly one required field, `realizes`.
- Each of the 13 widget entries validates against the entry type, points to the single widget manifest, requires theme only, lists `set_subject`, `set_data`, and `navigate_peer`, and realizes exactly one of the 13 widget kinds.
- The viewer and container entries are plain FrontX `entry_mf` instances that realize no widget kind.
- No package declares shared singletons.

**Covers (PRD)**: `cpt-frontx-dashboard-fr-widget-catalog`, `cpt-frontx-dashboard-fr-type-catalog`, `cpt-frontx-dashboard-fr-viewer-host`, `cpt-frontx-dashboard-nfr-bundle-budget`

**Covers (DESIGN)**: `cpt-frontx-dashboard-component-widget-library`, `cpt-frontx-dashboard-component-modal-container`, `cpt-frontx-dashboard-topology-overlay-packages`, `cpt-frontx-dashboard-principle-per-instance-isolation`

**Constraints**: `cpt-frontx-dashboard-constraint-gts-id-convention`, `cpt-frontx-dashboard-constraint-role-based-host-ids`, `cpt-frontx-dashboard-constraint-shell-only-dependency`

**Touches**:
- Entities: template MFE entry type, widget manifest, viewer manifest, widget entries, viewer entry, modal container entry, Viewer host routed extension

## 6. Type Catalog

### 6.1 Template MFE Entry Type

**GTS ID**: `gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.v.mfe.entry.v1~`

**Description**: The MFE entry type of widget entries. It extends the FrontX Module Federation entry `gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~` with one required field, `realizes:`, which names the widget kind the entry realizes. The Viewer host resolves a widget kind to an entry through this field; dashboards persist widget instances, never entry identifiers (ADR-0011).

**Schema**:

```json
{
  "$id": "gts://gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.v.mfe.entry.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Template MfeEntry",
  "description": "Module Federation entry of a widget MFE that names the widget kind it realizes.",
  "allOf": [
    { "$ref": "gts://gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~" }
  ],
  "properties": {
    "realizes": {
      "type": "string",
      "x-gts-ref": "gts.frontx.m.widget.widget.v1~*",
      "description": "GTS ID of the widget kind this entry realizes."
    }
  },
  "required": ["realizes"]
}
```

**Inheritance notes**:
- Inherited FrontX fields: `id`, `requiredProperties`, optional `optionalProperties`, `actions`, `domainActions` (entry base), and `manifest`, `exposedModule`, `exposeAssets` (`entry_mf`). They are not redeclared.
- `realizes` uses the base-type-prefix form `gts.frontx.m.widget.widget.v1~*`, so it accepts every concrete kind derived from the widget base. The prototype's form named the base type itself, which no concrete kind identifier matches; this is a correction made with the rebase.

**Cross-references**: DESIGN section 3.1 (MFE entry, `m` and `v` split); widget kinds in `feature-widget-catalog`; ADR-0011.

### 6.2 Widget Manifest

**GTS instance ID**: `gts.frontx.mfes.mfe.mf_manifest.v1~frontx.v.widgets.manifest.v1`

**Description**: The single FrontX Module Federation manifest of the `dashboard-widgets` package. All 13 widget entries point to it. It is new in the template; the prototype had one manifest per entry.

| Field | Source | Content |
|-------|--------|---------|
| `id` | authored in `dashboard-widgets/mfe.json` | `gts.frontx.mfes.mfe.mf_manifest.v1~frontx.v.widgets.manifest.v1` |
| `remoteEntry` | authored in `dashboard-widgets/mfe.json` | location of the remote entry of the `dashboard-widgets` build |
| `name`, `metaData`, `shared` | produced by the manifest pipeline (`scripts/generate-mfe-manifests.ts`) from the build | the FrontX `mf_manifest` fields: package name, public path and remote entry descriptor, and shared dependency declarations |

The aggregate reaches every registry through the manifest channel; the shell bootstrap and the Viewer host register the manifest before the entries that point to it (DESIGN section 3.5).

### 6.3 Widget Entries

**Description**: 13 instances of the template MFE entry type, one per subject-agnostic widget kind, all in `dashboard-widgets`. Every entry has the same shape and differs only in its identifier, its exposed module, and its `realizes` value. The common shape, shown for `summary_card`:

```json
{
  "id": "gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.v.mfe.entry.v1~frontx.v.summary_card.v1",
  "requiredProperties": [
    "gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.theme.v1~"
  ],
  "actions": [
    "gts.frontx.mfes.comm.action.v1~frontx.v.mfe.set_subject.v1~",
    "gts.frontx.mfes.comm.action.v1~frontx.v.mfe.set_data.v1~",
    "gts.frontx.mfes.comm.action.v1~frontx.v.mfe.navigate_peer.v1~"
  ],
  "domainActions": [],
  "manifest": "gts.frontx.mfes.mfe.mf_manifest.v1~frontx.v.widgets.manifest.v1",
  "exposedModule": "./summary_card",
  "realizes": "gts.frontx.m.widget.widget.v1~frontx.m.widget.summary_card.v1~"
}
```

**Field notes**:
- `requiredProperties`: theme only, which every template domain provides. The value widgets read is the template theme payload (`feature-extension-domain-catalog`, section 6.13).
- `actions`: `set_subject`, `set_data`, and `navigate_peer`. This covers the extension actions of all three template domains, so every entry is admitted to `layout_cells`, `detail_panel`, and `modal_panel` (FrontX ADR-0010).
- `domainActions`: empty; an entry requires no domain action.
- `exposeAssets` is not authored: the host manifest pipeline populates it at registration time (FrontX `entry_mf`). The prototype listed it with empty arrays.

**Entry instances** (identifier prefix `gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.v.mfe.entry.v1~`; `realizes` prefix `gts.frontx.m.widget.widget.v1~`):

| # | Kind | Instance segment | `exposedModule` | `realizes` segment |
|---|------|------------------|-----------------|--------------------|
| 1 | `summary_card` | `frontx.v.summary_card.v1` | `./summary_card` | `frontx.m.widget.summary_card.v1~` |
| 2 | `metric_card` | `frontx.v.metric_card.v1` | `./metric_card` | `frontx.m.widget.metric_card.v1~` |
| 3 | `ranked_list_card` | `frontx.v.ranked_list_card.v1` | `./ranked_list_card` | `frontx.m.widget.ranked_list_card.v1~` |
| 4 | `progress_list_card` | `frontx.v.progress_list_card.v1` | `./progress_list_card` | `frontx.m.widget.progress_list_card.v1~` |
| 5 | `grid` | `frontx.v.grid.v1` | `./grid` | `frontx.m.widget.grid.v1~` |
| 6 | `cartesian_chart` | `frontx.v.cartesian_chart.v1` | `./cartesian_chart` | `frontx.m.widget.cartesian_chart.v1~` |
| 7 | `pie_chart` | `frontx.v.pie_chart.v1` | `./pie_chart` | `frontx.m.widget.pie_chart.v1~` |
| 8 | `heatmap` | `frontx.v.heatmap.v1` | `./heatmap` | `frontx.m.widget.heatmap.v1~` |
| 9 | `markdown_card` | `frontx.v.markdown_card.v1` | `./markdown_card` | `frontx.m.widget.markdown_card.v1~` |
| 10 | `code_diff` | `frontx.v.code_diff.v1` | `./code_diff` | `frontx.m.widget.code_diff.v1~` |
| 11 | `thread_list` | `frontx.v.thread_list.v1` | `./thread_list` | `frontx.m.widget.thread_list.v1~` |
| 12 | `event_timeline` | `frontx.v.event_timeline.v1` | `./event_timeline` | `frontx.m.widget.event_timeline.v1~` |
| 13 | `metadata_strip` | `frontx.v.metadata_strip.v1` | `./metadata_strip` | `frontx.m.widget.metadata_strip.v1~` |

For example, row 5 is the instance `gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.v.mfe.entry.v1~frontx.v.grid.v1`, which realizes `gts.frontx.m.widget.widget.v1~frontx.m.widget.grid.v1~`.

**Cross-references**: DESIGN `cpt-frontx-dashboard-component-widget-library`; widget kinds in `feature-widget-catalog` (six kinds have no demo coverage there, which does not affect their entries).

### 6.4 Viewer Package Entries (declared by `dashboard-viewer`)

**Description**: The entries and manifest of the `dashboard-viewer` package and the Viewer host's routed extension. The viewer and container entries realize no widget kind, so they are plain instances of the FrontX `entry_mf` type and carry no `realizes`. The modal container's static extension itself is owned by `feature-extension-domain-catalog` (section 6.12 there).

**Viewer manifest**: `gts.frontx.mfes.mfe.mf_manifest.v1~frontx.v.viewer.manifest.v1`. The single manifest of `dashboard-viewer`, used by the viewer entry and the container entry. Authored fields are `id` and `remoteEntry`; the manifest pipeline produces the rest, as for the widget manifest in section 6.2.

**Viewer entry**:

```json
{
  "id": "gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.v.mfe.viewer.v1",
  "requiredProperties": [
    "gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.theme.v1~",
    "gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.language.v1~"
  ],
  "actions": [],
  "domainActions": [],
  "manifest": "gts.frontx.mfes.mfe.mf_manifest.v1~frontx.v.viewer.manifest.v1",
  "exposedModule": "./viewer"
}
```

The Viewer host reads the host theme id, which it maps to a mode, and the host language, which it formats text for; the host screen domain shares both. It declares no custom actions, because the host screen domain requires no extension actions.

**Modal container entry**:

```json
{
  "id": "gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.v.mfe.modal_container.v1",
  "requiredProperties": [
    "gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.theme.v1~",
    "gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.language.v1~"
  ],
  "actions": [],
  "domainActions": [],
  "manifest": "gts.frontx.mfes.mfe.mf_manifest.v1~frontx.v.viewer.manifest.v1",
  "exposedModule": "./modal-container"
}
```

It requires theme and language, which the host modal domain shares, and declares no custom actions, because the host modal domain requires none. All drill-down context reaches the container through `set_drilldown_context` on its own `modal_panel` domain, not through entry actions.

**Viewer host routed extension**: `gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~frontx.v.screens.viewer.v1`, an instance of the shell screen extension type, declared in the `dashboard-viewer` manifest and registered by the host bootstrap from the manifest channel.

| Field | Value |
|-------|-------|
| `id` | `gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~frontx.v.screens.viewer.v1` |
| `domain` | the host screen domain by role; as a manifest-declared extension it carries the current `template-shell` identifier `gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.screen.v1`, or is generated from the shell constant at build time |
| `entry` | `gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.v.mfe.viewer.v1` |
| `route` | a route (`Extension.route`, FrontX ADR-0036) that carries the dashboard instance identifier; required by the screen extension type |
| `presentation` | a `label`, required by the screen extension type |

**Cross-references**: DESIGN section 3.1 (ID-form convention), `cpt-frontx-dashboard-component-viewer-host`, `cpt-frontx-dashboard-component-modal-container`, host contract in section 3.5 (`cpt-frontx-dashboard-constraint-role-based-host-ids`); ADR-0016.

### 6.5 Admission Summary

**Description**: How each entry passes FrontX ADR-0010 admission in the domains it is mounted into, restated from DESIGN section 3.3 for the instances above.

| Entry | Domain | Domain provides | Domain requires of extensions | Result |
|-------|--------|-----------------|-------------------------------|--------|
| 13 widget entries | `layout_cells` | theme | `set_subject`, `set_data`, `navigate_peer` | admitted |
| 13 widget entries | `detail_panel`, `modal_panel` | theme | `set_subject`, `set_data` | admitted |
| modal container entry | host modal domain | theme, language | none | admitted |
| viewer entry | host screen domain | theme, language | none | admitted |

### 6.6 Isolation and Packaging Notes

**Description**: Packaging rules that apply to every entry in this catalog.

- FrontX gives every MFE load its own module graph (FrontX ADR-0011), so no library, store, or theme object is shared between MFE instances, and no package declares shared singletons (`cpt-frontx-dashboard-principle-per-instance-isolation`).
- Module Federation is used only as the bundling format, and FrontX resolves dependencies itself. This is a template assumption from the product owner, not a statement of FrontX ADR-0011.
- Each chart widget instance loads and evaluates its own ECharts, and each `grid` instance its own TanStack Table; the bundle budget counts them per instance (DESIGN section 3.9). FrontX ADR-0034 source reuse saves repeated fetches, not repeated evaluation.
- Consumer widget kinds ship as separate packages with their own manifest and entries of the template entry type.
- `dashboard-widgets` depends on `dashboard-viewer` only for GTS identifiers; `dashboard-viewer` reaches the widget entries only at run time through `realizes:` (DESIGN section 3.4).

### 6.7 Open Questions

- **Routed extension route and label.** The DESIGN fixes that the route carries the dashboard instance identifier but not the route pattern or the presentation label of the Viewer host routed extension; both are fixed with the routing setup of `dashboard-viewer`.
- **Viewer entry module name.** The DESIGN names the container's exposed module (`./modal-container`) but not the viewer entry's; this catalog uses `./viewer`, to be confirmed at implementation.

## 7. Acceptance Criteria

- [ ] The template MFE entry type `gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.v.mfe.entry.v1~` extends the FrontX `entry_mf` type and adds exactly one required field, `realizes`, constrained to widget kind identifiers.
- [ ] `dashboard-widgets` declares exactly one manifest, `gts.frontx.mfes.mfe.mf_manifest.v1~frontx.v.widgets.manifest.v1`, and all 13 widget entries point to it.
- [ ] Every one of the 13 widget kinds has exactly one entry in that manifest, and each entry's `realizes` names that kind.
- [ ] Every widget entry requires only the theme shared property, lists `set_subject`, `set_data`, and `navigate_peer` in `actions`, has an empty `domainActions`, and is admitted to `layout_cells`, `detail_panel`, and `modal_panel`.
- [ ] The viewer entry and the modal container entry are FrontX `entry_mf` instances without `realizes`, point to the viewer manifest, require theme and language, and declare no custom actions.
- [ ] The Viewer host routed extension is an instance of the shell screen extension type in the host screen domain with a route that carries the dashboard instance identifier.
- [ ] Every identifier in this catalog follows the template ID-form convention: types end with `~`, instances do not, and every template segment is at `v1`.
- [ ] Build review confirms that no package declares shared singletons.
