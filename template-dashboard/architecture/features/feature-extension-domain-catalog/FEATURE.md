---
status: proposed
version: 1
date: 2026-10-07
description: Type catalog of the template's six host actions, three extension domains, two extension types, the modal container extension, the template theme payload, and the widget extension identifier rule, declared by dashboard-viewer.
---

# Feature: Extension Domain Catalog


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
  - [Drill-Down Contract Definition of Done](#drill-down-contract-definition-of-done)
- [6. Type Catalog](#6-type-catalog)
  - [6.1 Host Action: set_subject](#61-host-action-set_subject)
  - [6.2 Host Action: set_data](#62-host-action-set_data)
  - [6.3 Host Action: mount_widget](#63-host-action-mount_widget)
  - [6.4 Host Action: navigate_peer](#64-host-action-navigate_peer)
  - [6.5 Host Action: set_local_filter](#65-host-action-set_local_filter)
  - [6.6 Host Action: set_drilldown_context](#66-host-action-set_drilldown_context)
  - [6.7 Layout Cells Extension Domain](#67-layout-cells-extension-domain)
  - [6.8 Detail Panel Extension Domain](#68-detail-panel-extension-domain)
  - [6.9 Modal Panel Extension Domain](#69-modal-panel-extension-domain)
  - [6.10 Layout Cells Extension Type](#610-layout-cells-extension-type)
  - [6.11 Detail Panel Extension Type](#611-detail-panel-extension-type)
  - [6.12 Modal Container Extension](#612-modal-container-extension)
  - [6.13 Template Theme Payload](#613-template-theme-payload)
  - [6.14 Widget Extension Identifier Rule](#614-widget-extension-identifier-rule)
  - [6.15 Domain-scoped FilterState companion (Viewer-host-internal)](#615-domain-scoped-filterstate-companion-viewer-host-internal)
  - [6.16 Action Chain Patterns](#616-action-chain-patterns)
  - [6.17 Open Questions](#617-open-questions)
- [7. Acceptance Criteria](#7-acceptance-criteria)

<!-- /toc -->

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-featstatus-extension-domain-catalog`
## 1. Feature Context

- [ ] `p2` - `cpt-frontx-dashboard-feature-extension-domain-catalog`

### 1.1 Overview

This is a **type-catalog feature**, not an actor-flow feature. It enumerates the template's host actions, extension domains, extension types, the modal container extension, and the template theme payload. Their abstract bases and structural prose live in DESIGN section 3.1 and section 3.3. The flow, process, and state sections of the FEATURE template are reduced to short not-applicable notes; the catalog content lives in section 6 Type Catalog.

### 1.2 Purpose

Concrete catalog of the "host actions and extension domains" family of DESIGN section 3.1, ported from the prototype with rebased identifiers (`gts.hai3.mfes.*` to `gts.frontx.mfes.*`, `gts.de.v.*` to `gts.frontx.v.*`, `gts.de.m.*` to `gts.frontx.m.*`, every identifier at `v1`). DESIGN section 3.1 delegates the field-level schemas of these types to this document, so section 6 carries them. The host actions are template-authored types derived from the FrontX action base `gts.frontx.mfes.comm.action.v1~`; they add no new GTS namespace.

Deltas against the prototype, all decided in the DESIGN and ADR-0010:

- Three concurrent template domains: `layout_cells` and `detail_panel` in the Viewer host registry, `modal_panel` in the modal container registry. The prototype's own `modal` domain and `modal` extension type are dropped.
- Six host actions: the prototype's five plus `set_drilldown_context`, which is declared on `modal_panel` only.
- `mount_widget` always targets `detail_panel` and carries the clicked subject, the origin cell, the peer position, and the peer-step marker.
- `navigate_peer` is sent by the modal container, not by the shell, and is declared as an extension action of `layout_cells`.
- The modal container is a static instance of the FrontX extension base in the host modal domain; it has no derived type.
- The template theme payload of the theme shared property, and the widget extension identifier rule.

**Declaring package**: `dashboard-viewer` (`src-app/mfe_packages/dashboard-viewer/`). Every type and instance in this catalog is registered through the `mfe.json` of that package.

**Requirements**: `cpt-frontx-dashboard-fr-type-catalog`, `cpt-frontx-dashboard-fr-drilldown-panel`, `cpt-frontx-dashboard-fr-drilldown-modal`, `cpt-frontx-dashboard-fr-peer-navigation`, `cpt-frontx-dashboard-fr-local-filter-overlay`, `cpt-frontx-dashboard-fr-theme`, `cpt-frontx-dashboard-nfr-peer-navigation-latency`

**Principles**: `cpt-frontx-dashboard-principle-no-extension-on-click`, `cpt-frontx-dashboard-principle-viewer-host-orchestration`, `cpt-frontx-dashboard-principle-gts-contracts`, `cpt-frontx-dashboard-principle-per-instance-isolation`

### 1.3 Actors

N/A. This is a type-catalog feature. The catalog is consumed by the runtime type system (the Viewer host registry, the modal container registry, the shell registry, and the widget MFEs), not by an end-user actor, so no actor flows are authored. The actors of the drill-down use cases are defined in the PRD and appear in the DESIGN sequences listed in section 1.4.

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md) section 3.1 (Domain Model), section 3.3 (Host Actions, Template Extension Domains), section 3.5 (Host contract), section 3.6 (Interactions and Sequences), section 4 (handoffs and open items)
- **ADRs**: [ADR-0006](../../ADR/0006-viewer-state-management-v1.md), [ADR-0008](../../ADR/0008-theme-distribution-v1.md), [ADR-0010](../../ADR/0010-extension-domain-taxonomy-v1.md), [ADR-0011](../../ADR/0011-widget-kind-and-mfe-realization-v1.md), [ADR-0014](../../ADR/0014-viewer-host-orchestrated-query-lifecycle-v1.md), [ADR-0016](../../ADR/0016-template-packaging-and-host-contract-v1.md)
- **Design elements**: `cpt-frontx-dashboard-interface-host-actions`, `cpt-frontx-dashboard-interface-template-domains`, `cpt-frontx-dashboard-component-viewer-host`, `cpt-frontx-dashboard-component-modal-container`
- **Dependencies**: `feature-widget-catalog` (widget base carried by `set_subject` and `mount_widget`; drill-down declaration), `feature-widget-data-catalog` (shapes carried by `set_data`), `feature-filter-catalog` (filters carried by `set_local_filter`), `feature-worker-contract-types` (error codes carried by `set_data`), `feature-dashboard-root-types` (palette shape of the theme payload), `feature-mfe-entries` (entries mounted into these domains, and the modal container entry)

## 2. Actor Flows (CDSL)

**Use cases**: `cpt-frontx-dashboard-usecase-explore-dashboard`, `cpt-frontx-dashboard-usecase-drilldown-peers`

### Type-Catalog Feature: No Actor Flows

Not applicable because this feature declares static GTS types and instances that the runtime consumes; no actor interacts with the catalog itself. The runtime flows that use these types are the DESIGN sequences `cpt-frontx-dashboard-seq-initial-load`, `cpt-frontx-dashboard-seq-detail-panel-drilldown`, `cpt-frontx-dashboard-seq-modal-drilldown-open`, `cpt-frontx-dashboard-seq-peer-navigation`, `cpt-frontx-dashboard-seq-theme-switch`, and `cpt-frontx-dashboard-seq-teardown`. Section 6.16 summarizes the action chains by reference to them.

## 3. Processes / Business Logic (CDSL)

### Type-Catalog Feature: No Processes

Not applicable because the catalog declares schemas and instances only. Validation and admission are performed by the FrontX type system and registries (FrontX ADR-0009, ADR-0010); the chain logic lives in the Viewer host and the modal container, as described in DESIGN section 3.2 and section 3.6.

## 4. States (CDSL)

### Type-Catalog Feature: No State Machines

Not applicable because type declarations are stateless. Extension lifecycle stages are FrontX stages declared per domain in sections 6.7 to 6.9; the drill-down state of the Viewer host is TS-internal and described in section 6.15.

## 5. Definitions of Done

### Type Catalog Definition of Done

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-dod-extension-domain-catalog-catalog-complete`

The system **MUST** register every type and instance of section 6 through the `dashboard-viewer` `mfe.json`, ported from the prototype with rebased identifiers and the deltas listed in section 1.2.

- The six host action types, the two extension types, and the three domain instances validate against their FrontX bases.
- Every identifier follows `cpt-frontx-dashboard-constraint-gts-id-convention`: types end with `~`, instances do not, every segment starts at `v1`.
- The three domains are admitted with the concurrent mount strategy and pass the FrontX ADR-0009 cardinality matrix.
- The modal container extension is an instance of the FrontX extension base declared for the host modal domain, with no derived type and no per-step data fields.
- Theme is the only shared property of the three template domains, and its value follows the template theme payload of section 6.13.

**Covers (PRD)**: `cpt-frontx-dashboard-fr-type-catalog`, `cpt-frontx-dashboard-fr-theme`

**Covers (DESIGN)**: `cpt-frontx-dashboard-interface-host-actions`, `cpt-frontx-dashboard-interface-template-domains`, `cpt-frontx-dashboard-component-modal-container`

**Constraints**: `cpt-frontx-dashboard-constraint-gts-id-convention`, `cpt-frontx-dashboard-constraint-role-based-host-ids`, `cpt-frontx-dashboard-constraint-one-viewer-per-tree`

**Touches**:
- Entities: host actions, extension domains, extension types, modal container extension, template theme payload

### Drill-Down Contract Definition of Done

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-dod-extension-domain-catalog-drilldown-contract`

The system **MUST** use the drill-down actions of this catalog exactly as the DESIGN sequences describe them, and **MUST** generate widget extension identifiers by the rule of section 6.14.

- Every drill-down request is `mount_widget` to `detail_panel`; a request that answers `navigate_peer` carries the peer-step marker.
- `set_drilldown_context` carries the widget list only at drill-down open; peer and theme updates carry no list.
- No extension is registered on Prev or Next; the container registers widget extensions only when a drill-down opens.
- Every modal chain step carries the fallback `unmount_ext` of the modal container.

**Covers (PRD)**: `cpt-frontx-dashboard-fr-drilldown-panel`, `cpt-frontx-dashboard-fr-drilldown-modal`, `cpt-frontx-dashboard-fr-peer-navigation`, `cpt-frontx-dashboard-fr-local-filter-overlay`, `cpt-frontx-dashboard-nfr-peer-navigation-latency`

**Covers (DESIGN)**: `cpt-frontx-dashboard-seq-detail-panel-drilldown`, `cpt-frontx-dashboard-seq-modal-drilldown-open`, `cpt-frontx-dashboard-seq-peer-navigation`, `cpt-frontx-dashboard-seq-theme-switch`, `cpt-frontx-dashboard-principle-no-extension-on-click`

**Constraints**: `cpt-frontx-dashboard-constraint-one-viewer-per-tree`

**Touches**:
- Entities: `mount_widget`, `navigate_peer`, `set_drilldown_context`, `set_local_filter`, widget extension identifiers

## 6. Type Catalog

All lifecycle actions referenced below are the FrontX actions `gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.load_ext.v1~`, `gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.mount_ext.v1~`, and `gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.unmount_ext.v1~`; code takes them from the FrontX constants. Every action is a type derived from the FrontX action base; a chain carries an action, an optional `next`, and an optional `fallback`, and nothing comes back to the sender (FrontX ADR-0007).

### 6.1 Host Action: set_subject

**GTS ID**: `gts.frontx.mfes.comm.action.v1~frontx.v.mfe.set_subject.v1~`

**Description**: Viewer host to widget. Delivers the widget instance, which is the widget's whole placement configuration, to a mounted widget extension. The widget stores it as its configuration. Extension action of all three template domains.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.mfes.comm.action.v1~frontx.v.mfe.set_subject.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "set_subject",
  "description": "Host-to-widget action that delivers the widget instance to a mounted widget extension.",
  "allOf": [
    { "$ref": "gts://gts.frontx.mfes.comm.action.v1~" },
    {
      "required": ["payload"],
      "properties": {
        "target": {
          "x-gts-ref": "gts.frontx.mfes.ext.extension.v1~*",
          "description": "Narrows the inherited target to a mounted widget extension."
        },
        "payload": {
          "type": "object",
          "required": ["subject"],
          "properties": {
            "subject": {
              "$ref": "gts://gts.frontx.m.widget.widget.v1~",
              "description": "The widget instance of one concrete widget kind, carried inline as it appears in the layout cell or in the drill-down declaration."
            }
          }
        }
      }
    }
  ]
}
```

**Inheritance notes**:
- `type` and `target` are inherited and already required by the base; this schema adds `payload` to `required`.
- Delta: the prototype typed `subject` as an instance identifier. DESIGN section 3.3 fixes the payload as the widget instance, and cell widgets are inline instances (DESIGN section 3.1), so the payload carries the instance itself. The receiving widget kind validates it at its own boundary.

**Cross-references**: DESIGN `cpt-frontx-dashboard-interface-host-actions`; widget base in `feature-widget-catalog`; used by sections 6.7, 6.8, 6.9.

### 6.2 Host Action: set_data

**GTS ID**: `gts.frontx.mfes.comm.action.v1~frontx.v.mfe.set_data.v1~`

**Description**: Viewer host to widget. Delivers the resolved widget data, or the query error, to a mounted widget extension. On data the widget renders; on an error it renders the error in its own slot. Extension action of all three template domains.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.mfes.comm.action.v1~frontx.v.mfe.set_data.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "set_data",
  "description": "Host-to-widget action that delivers typed widget data, or a query error, to a mounted widget extension.",
  "allOf": [
    { "$ref": "gts://gts.frontx.mfes.comm.action.v1~" },
    {
      "required": ["payload"],
      "properties": {
        "target": {
          "x-gts-ref": "gts.frontx.mfes.ext.extension.v1~*",
          "description": "Narrows the inherited target to a mounted widget extension."
        },
        "payload": {
          "type": "object",
          "oneOf": [
            { "required": ["data"] },
            { "required": ["error"] }
          ],
          "properties": {
            "data": {
              "type": "object",
              "description": "Widget data of the shape paired with the receiving widget's kind (gts.frontx.v.widget_data.<kind>.v1~). The receiving widget validates the shape at its own boundary."
            },
            "error": {
              "type": "object",
              "required": ["code", "message"],
              "properties": {
                "code": {
                  "type": "string",
                  "enum": ["query_not_registered", "operator_not_registered", "entity_data_missing", "cel_evaluation_error", "entity_fetch_failed"],
                  "description": "The code of the query.error that failed this widget's query."
                },
                "message": {
                  "type": "string",
                  "description": "The message of that query.error."
                }
              }
            }
          }
        }
      }
    }
  ]
}
```

**Inheritance notes**:
- `type` and `target` are inherited; this schema adds `payload` to `required`.
- Delta: the prototype typed `data` as an instance identifier. DESIGN section 3.3 fixes the payload as typed widget data or an error with the `query.error` code and message, so both forms are carried inline. The widget data kinds have no shared base, so the shape is checked against the kind's paired type at the receiving boundary.

**Cross-references**: `feature-widget-data-catalog` (the 13 shapes); `feature-worker-contract-types` (`query.error` and its codes); DESIGN `cpt-frontx-dashboard-seq-failure-handling`.

### 6.3 Host Action: mount_widget

**GTS ID**: `gts.frontx.mfes.comm.action.v1~frontx.v.mfe.mount_widget.v1~`

**Description**: Source widget to Viewer host. Every drill-down request, for the detail panel or the modal, is a `mount_widget` targeted at `detail_panel`, because that domain lives in the Viewer host's own registry and always exists. The Viewer host reads the target surface from the source widget instance's drill-down declaration and runs either the panel chain or the modal flow. FrontX tracks no chain origin (FrontX ADR-0007), so the source widget names itself as the origin, using the extension identifier its bridge exposes (FrontX ADR-0008). Domain action of `detail_panel` only.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.mfes.comm.action.v1~frontx.v.mfe.mount_widget.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "mount_widget",
  "description": "Drill-down request from a source widget to the Viewer host, always targeted at the detail_panel domain.",
  "allOf": [
    { "$ref": "gts://gts.frontx.mfes.comm.action.v1~" },
    {
      "required": ["payload"],
      "properties": {
        "target": {
          "const": "gts.frontx.mfes.ext.domain.v1~frontx.v.layout.detail_panel.v1",
          "description": "Always the detail_panel domain instance, also for modal drill-downs."
        },
        "payload": {
          "type": "object",
          "required": ["widgets", "subject", "origin"],
          "properties": {
            "widgets": {
              "type": "array",
              "minItems": 1,
              "items": { "$ref": "gts://gts.frontx.m.widget.widget.v1~" },
              "description": "The drill-down's widget instances for the clicked item, taken from the source widget's drill-down declaration."
            },
            "subject": {
              "type": "string",
              "x-gts-ref": "gts.*",
              "description": "The clicked subject. Kept as the universal gts.* reference, as in the prototype, so this contract does not depend on the entity catalog. The Viewer host scopes the drill-down queries and the surface overlay with it."
            },
            "origin": {
              "type": "string",
              "x-gts-ref": "gts.frontx.mfes.ext.extension.v1~frontx.v.layout.layout_cells.v1~*",
              "description": "Extension identifier of the source widget's cell, as exposed by its bridge."
            },
            "peer": {
              "type": "object",
              "required": ["index", "count"],
              "properties": {
                "index": { "type": "integer", "minimum": 0, "description": "Position of the clicked item in the source widget's displayed order." },
                "count": { "type": "integer", "minimum": 1, "description": "Number of items in that displayed order." }
              },
              "description": "Peer position. Present for modal drill-downs; absent for detail-panel drill-downs."
            },
            "peer_step": {
              "type": "boolean",
              "default": false,
              "description": "Peer-step marker. True only on a mount_widget that answers navigate_peer; without it the request is a new drill-down."
            }
          }
        }
      }
    }
  ]
}
```

**Inheritance notes**:
- `type` and `target` are inherited; `target` is narrowed from the base's domain-or-extension choice to the single `detail_panel` instance.
- Delta: the prototype carried only `widgets` and allowed any domain as target. The added fields are fixed by DESIGN section 3.3 and the `peer_step_marker` decision.
- Whether `peer` is required follows from the source widget's drill-down declaration, so the Viewer host checks it, not the schema.

**Cross-references**: DESIGN `cpt-frontx-dashboard-seq-detail-panel-drilldown`, `cpt-frontx-dashboard-seq-modal-drilldown-open`, `cpt-frontx-dashboard-seq-peer-navigation`; drill-down declaration in `feature-widget-catalog` (see section 6.17).

### 6.4 Host Action: navigate_peer

**GTS ID**: `gts.frontx.mfes.comm.action.v1~frontx.v.mfe.navigate_peer.v1~`

**Description**: Modal container to origin widget. Prev and Next in the container send `navigate_peer` targeted at the origin cell, with the fallback `unmount_ext` of the container. The chain escalates from the container's registry to the shell and is handed down to the Viewer host's registry through the downward forwarding entry the Viewer host advertised (FrontX ADR-0007, ADR-0008). It is admitted because `layout_cells` declares `navigate_peer` as an extension action. The origin widget moves its cursor in its displayed order and answers with `mount_widget` carrying the peer-step marker.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.mfes.comm.action.v1~frontx.v.mfe.navigate_peer.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "navigate_peer",
  "description": "Modal-container-to-origin-cell action that asks the origin widget to step its cursor to the next or previous peer.",
  "allOf": [
    { "$ref": "gts://gts.frontx.mfes.comm.action.v1~" },
    {
      "required": ["payload"],
      "properties": {
        "target": {
          "x-gts-ref": "gts.frontx.mfes.ext.extension.v1~frontx.v.layout.layout_cells.v1~*",
          "description": "The origin cell extension, as kept by the container from the latest set_drilldown_context."
        },
        "payload": {
          "type": "object",
          "required": ["direction"],
          "properties": {
            "direction": {
              "type": "string",
              "enum": ["next", "prev"],
              "description": "Direction of the peer step from the current peer."
            }
          }
        }
      }
    }
  ]
}
```

**Inheritance notes**:
- `target` is narrowed to the extension branch and further to the `layout_cells` extension type.
- Delta: in the prototype the shell sent `navigate_peer` using chain-origin metadata. FrontX tracks no chain origin, so the container sends it to the origin it received in `set_drilldown_context`. The payload is unchanged.

**Cross-references**: DESIGN `cpt-frontx-dashboard-seq-peer-navigation`, `cpt-frontx-dashboard-seq-failure-handling` (refused hand-over); declared in section 6.7.

### 6.5 Host Action: set_local_filter

**GTS ID**: `gts.frontx.mfes.comm.action.v1~frontx.v.mfe.set_local_filter.v1~`

**Description**: Viewer host to surface. Delivers the surface's local filter overlay to the `detail_panel` or `modal_panel` domain when an overlay applies. The Viewer host applies the overlay before it resolves data and keeps it in its TS-internal companion (section 6.15). Domain action of `detail_panel` and `modal_panel`; `layout_cells` does not declare it, because cell overlays travel inside each cell's filter snapshot.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.mfes.comm.action.v1~frontx.v.mfe.set_local_filter.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "set_local_filter",
  "description": "Host-to-domain action that delivers the local filter overlay of a detail_panel or modal_panel surface.",
  "allOf": [
    { "$ref": "gts://gts.frontx.mfes.comm.action.v1~" },
    {
      "required": ["payload"],
      "properties": {
        "target": {
          "enum": [
            "gts.frontx.mfes.ext.domain.v1~frontx.v.layout.detail_panel.v1",
            "gts.frontx.mfes.ext.domain.v1~frontx.v.layout.modal_panel.v1"
          ],
          "description": "The detail_panel or modal_panel domain instance."
        },
        "payload": {
          "type": "object",
          "required": ["filter_state"],
          "properties": {
            "filter_state": {
              "type": "array",
              "items": {
                "type": "string",
                "x-gts-ref": "gts.frontx.v.filter.filter.v1~*"
              },
              "description": "Filter instances composing the overlay, in order. Overlapping filters follow the Filter base contract."
            }
          }
        }
      }
    }
  ]
}
```

**Inheritance notes**:
- `target` is narrowed to the two surfaces that declare the action.
- `filter_state` keeps the prototype's array of Filter instance references (rebased); adding a concrete filter does not change this contract.

**Cross-references**: `feature-filter-catalog`; DESIGN `cpt-frontx-dashboard-interface-host-actions`; section 6.15.

### 6.6 Host Action: set_drilldown_context

**GTS ID**: `gts.frontx.mfes.comm.action.v1~frontx.v.mfe.set_drilldown_context.v1~`

**Description**: Viewer host to modal container. New in the template. Gives the static container the drill-down context that its fields never carry: the origin cell, the peer position, the dashboard palette and mode, and, at drill-down open only, the widget list. Domain action of `modal_panel` only. It has two forms:

| Form | When | Carries `widgets` | Container behavior |
|------|------|-------------------|--------------------|
| Open | Drill-down open, after the container's `mount_ext` | yes: the union of all widgets any peer of the origin can show | Keeps origin and peer, applies palette and mode, registers the listed extensions it does not hold yet or holds for a different widget, and reports success only after registration completes |
| Update | Last step of a peer step; theme switch | no | Keeps origin and peer, applies palette and mode, re-enables Prev and Next within the range; registers nothing |

**Schema**:

```json
{
  "$id": "gts://gts.frontx.mfes.comm.action.v1~frontx.v.mfe.set_drilldown_context.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "set_drilldown_context",
  "description": "Host-to-container action that delivers the drill-down context to the modal_panel domain.",
  "allOf": [
    { "$ref": "gts://gts.frontx.mfes.comm.action.v1~" },
    {
      "required": ["payload"],
      "properties": {
        "target": {
          "const": "gts.frontx.mfes.ext.domain.v1~frontx.v.layout.modal_panel.v1",
          "description": "The modal_panel domain instance in the container registry."
        },
        "payload": {
          "type": "object",
          "required": ["origin", "peer", "palette", "mode"],
          "properties": {
            "origin": {
              "type": "string",
              "x-gts-ref": "gts.frontx.mfes.ext.extension.v1~frontx.v.layout.layout_cells.v1~*",
              "description": "The origin cell extension; navigate_peer is sent to it."
            },
            "peer": {
              "type": "object",
              "required": ["index", "count"],
              "properties": {
                "index": { "type": "integer", "minimum": 0 },
                "count": { "type": "integer", "minimum": 1 }
              },
              "description": "Current peer position; Prev and Next are disabled at the ends of the range."
            },
            "palette": {
              "type": "object",
              "description": "Active dashboard palette for the mode, in the shape of light_palette and dark_palette of gts.frontx.m.dashboard.theme.v1~."
            },
            "mode": {
              "type": "string",
              "enum": ["light", "dark"],
              "description": "Mode from the template's theme-mode map."
            },
            "widgets": {
              "type": "array",
              "minItems": 1,
              "items": {
                "type": "object",
                "required": ["extension", "entry"],
                "properties": {
                  "extension": {
                    "type": "string",
                    "x-gts-ref": "gts.frontx.mfes.ext.extension.v1~frontx.v.layout.detail_panel.v1~*",
                    "description": "Nested extension identifier, generated by the rule of section 6.14."
                  },
                  "entry": {
                    "type": "string",
                    "x-gts-ref": "gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.v.mfe.entry.v1~*",
                    "description": "MFE entry resolved through realizes: for the widget's kind."
                  }
                }
              },
              "description": "Open form only: the union of all widgets any peer of the origin can show. Absent in peer and theme updates."
            }
          }
        }
      }
    }
  ]
}
```

**Inheritance notes**:
- `target` is narrowed to the single `modal_panel` instance.
- The container's extension fields stay free of per-step data; all per-step context arrives through this action.

**Cross-references**: DESIGN `cpt-frontx-dashboard-component-modal-container`, `cpt-frontx-dashboard-seq-modal-drilldown-open`, `cpt-frontx-dashboard-seq-peer-navigation`, `cpt-frontx-dashboard-seq-theme-switch`; ADR-0010 (Q5, Q6 resolutions).

### 6.7 Layout Cells Extension Domain

**GTS instance ID**: `gts.frontx.mfes.ext.domain.v1~frontx.v.layout.layout_cells.v1`

**Description**: Multi-instance widget canvas registered by the Viewer host in its own registry during its first mount. Each cell is one occupying extension that hosts exactly one widget; cells are unmounted only on dashboard teardown. Theme is the only shared property. One Viewer host per application tree (`cpt-frontx-dashboard-constraint-one-viewer-per-tree`) keeps this fixed identifier unique.

**Mount strategy**: concurrent (FrontX ADR-0009, given at registration).

**Instance**:

```json
{
  "id": "gts.frontx.mfes.ext.domain.v1~frontx.v.layout.layout_cells.v1",
  "sharedProperties": [
    "gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.theme.v1~"
  ],
  "actions": [
    "gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.load_ext.v1~",
    "gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.mount_ext.v1~",
    "gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.unmount_ext.v1~"
  ],
  "extensionsActions": [
    "gts.frontx.mfes.comm.action.v1~frontx.v.mfe.set_subject.v1~",
    "gts.frontx.mfes.comm.action.v1~frontx.v.mfe.set_data.v1~",
    "gts.frontx.mfes.comm.action.v1~frontx.v.mfe.navigate_peer.v1~"
  ],
  "extensionsTypeId": "gts.frontx.mfes.ext.extension.v1~frontx.v.layout.layout_cells.v1~",
  "defaultActionTimeout": 30000,
  "lifecycleStages": [
    "gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1"
  ],
  "extensionsLifecycleStages": [
    "gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1",
    "gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.activated.v1",
    "gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.deactivated.v1",
    "gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.destroyed.v1"
  ]
}
```

**Deltas**: `unmount_ext` added (the concurrent strategy requires it); `navigate_peer` moved from the prototype's per-subtype incoming-action list into `extensionsActions`, so it is admitted when forwarded down; extension stages add `destroyed`.

**Cross-references**: extension type section 6.10; chains section 6.16; DESIGN `cpt-frontx-dashboard-interface-template-domains`.

### 6.8 Detail Panel Extension Domain

**GTS instance ID**: `gts.frontx.mfes.ext.domain.v1~frontx.v.layout.detail_panel.v1`

**Description**: Non-blocking, edge-anchored inspection panel registered by the Viewer host in its own registry during its first mount. The panel is open while it has occupants; the Viewer host enforces zero or one panel and hosts an ordered list of widget extensions in it. It is the single receiver of drill-down requests (`mount_widget`) for both surfaces. Theme is the only shared property.

**Mount strategy**: concurrent (FrontX ADR-0009, given at registration).

**Instance**:

```json
{
  "id": "gts.frontx.mfes.ext.domain.v1~frontx.v.layout.detail_panel.v1",
  "sharedProperties": [
    "gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.theme.v1~"
  ],
  "actions": [
    "gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.load_ext.v1~",
    "gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.mount_ext.v1~",
    "gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.unmount_ext.v1~",
    "gts.frontx.mfes.comm.action.v1~frontx.v.mfe.mount_widget.v1~",
    "gts.frontx.mfes.comm.action.v1~frontx.v.mfe.set_local_filter.v1~"
  ],
  "extensionsActions": [
    "gts.frontx.mfes.comm.action.v1~frontx.v.mfe.set_subject.v1~",
    "gts.frontx.mfes.comm.action.v1~frontx.v.mfe.set_data.v1~"
  ],
  "extensionsTypeId": "gts.frontx.mfes.ext.extension.v1~frontx.v.layout.detail_panel.v1~",
  "defaultActionTimeout": 30000,
  "lifecycleStages": [
    "gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1"
  ],
  "extensionsLifecycleStages": [
    "gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1",
    "gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.activated.v1",
    "gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.deactivated.v1",
    "gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.destroyed.v1"
  ]
}
```

**Deltas**: identifier and stage rebasing; `destroyed` added to the extension stages. The action lists are unchanged from the prototype.

**Cross-references**: extension type section 6.11; DESIGN `cpt-frontx-dashboard-seq-detail-panel-drilldown`.

### 6.9 Modal Panel Extension Domain

**GTS instance ID**: `gts.frontx.mfes.ext.domain.v1~frontx.v.layout.modal_panel.v1`

**Description**: Inner domain of the modal container, registered by the container in its own registry synchronously during its first mount (FrontX ADR-0008) and advertised to the shell. It holds the widgets of the current peer of the open drill-down. It has the same shape as `detail_panel` and reuses the `detail_panel` extension type, so it adds no domain type and no extension type. It does not reuse the `detail_panel` identifier, because the FrontX collision guard is tree-global (FrontX ADR-0007). It replaces the prototype's `modal` domain. Theme is the only shared property; the container publishes it from the palette and mode of the latest `set_drilldown_context`.

**Mount strategy**: concurrent (FrontX ADR-0009, given at registration).

**Instance**:

```json
{
  "id": "gts.frontx.mfes.ext.domain.v1~frontx.v.layout.modal_panel.v1",
  "sharedProperties": [
    "gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.theme.v1~"
  ],
  "actions": [
    "gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.load_ext.v1~",
    "gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.mount_ext.v1~",
    "gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.unmount_ext.v1~",
    "gts.frontx.mfes.comm.action.v1~frontx.v.mfe.set_local_filter.v1~",
    "gts.frontx.mfes.comm.action.v1~frontx.v.mfe.set_drilldown_context.v1~"
  ],
  "extensionsActions": [
    "gts.frontx.mfes.comm.action.v1~frontx.v.mfe.set_subject.v1~",
    "gts.frontx.mfes.comm.action.v1~frontx.v.mfe.set_data.v1~"
  ],
  "extensionsTypeId": "gts.frontx.mfes.ext.extension.v1~frontx.v.layout.detail_panel.v1~",
  "defaultActionTimeout": 30000,
  "lifecycleStages": [
    "gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1"
  ],
  "extensionsLifecycleStages": [
    "gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1",
    "gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.activated.v1",
    "gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.deactivated.v1",
    "gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.destroyed.v1"
  ]
}
```

**Action membership notes**:
- `actions`: no `mount_widget`, because drill-down requests always go to `detail_panel`; `set_drilldown_context` is declared here and nowhere else.
- `extensionsActions`: `set_subject` and `set_data` only. `navigate_peer` is sent by the container itself to the origin cell and never targets this domain.

**Cross-references**: modal container section 6.12; DESIGN `cpt-frontx-dashboard-component-modal-container`, `cpt-frontx-dashboard-seq-modal-drilldown-open`.

### 6.10 Layout Cells Extension Type

**GTS ID**: `gts.frontx.mfes.ext.extension.v1~frontx.v.layout.layout_cells.v1~`

**Description**: Extension type of the cells in `layout_cells`. Adds no fields beyond the FrontX extension base. Entries mounted with it support `set_subject`, `set_data`, and `navigate_peer`, as the domain requires.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.mfes.ext.extension.v1~frontx.v.layout.layout_cells.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Layout Cells Extension",
  "description": "Derived extension type for the layout_cells domain. Adds no fields beyond the FrontX extension base.",
  "allOf": [
    { "$ref": "gts://gts.frontx.mfes.ext.extension.v1~" },
    {
      "type": "object",
      "required": ["id", "domain", "entry"],
      "properties": {
        "id": {
          "type": "string",
          "x-gts-ref": "gts.frontx.mfes.ext.extension.v1~frontx.v.layout.layout_cells.v1~",
          "description": "Identifier of the concrete cell extension."
        },
        "domain": {
          "type": "string",
          "const": "gts.frontx.mfes.ext.domain.v1~frontx.v.layout.layout_cells.v1",
          "description": "Domain instance this extension mounts into."
        },
        "entry": {
          "type": "string",
          "x-gts-ref": "gts.*",
          "description": "MFE entry to load, resolved through realizes: for the cell widget's kind."
        }
      }
    }
  ]
}
```

**Deltas**: the `domain` constant uses the instance form without a trailing `~` (`cpt-frontx-dashboard-constraint-gts-id-convention`); `navigate_peer` is admitted through the domain's `extensionsActions` (section 6.7) instead of a per-subtype list.

**Cross-references**: domain section 6.7; entries in `feature-mfe-entries`; ADR-0011.

### 6.11 Detail Panel Extension Type

**GTS ID**: `gts.frontx.mfes.ext.extension.v1~frontx.v.layout.detail_panel.v1~`

**Description**: Extension type of the drill-down widgets in `detail_panel` and in the container's `modal_panel`. Adds no fields beyond the FrontX extension base. The prototype's separate modal extension type is dropped, because `modal_panel` reuses this type.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.mfes.ext.extension.v1~frontx.v.layout.detail_panel.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Detail Panel Extension",
  "description": "Derived extension type for the detail_panel and modal_panel domains. Adds no fields beyond the FrontX extension base.",
  "allOf": [
    { "$ref": "gts://gts.frontx.mfes.ext.extension.v1~" },
    {
      "type": "object",
      "required": ["id", "domain", "entry"],
      "properties": {
        "id": {
          "type": "string",
          "x-gts-ref": "gts.frontx.mfes.ext.extension.v1~frontx.v.layout.detail_panel.v1~",
          "description": "Identifier of the concrete drill-down widget extension."
        },
        "domain": {
          "type": "string",
          "enum": [
            "gts.frontx.mfes.ext.domain.v1~frontx.v.layout.detail_panel.v1",
            "gts.frontx.mfes.ext.domain.v1~frontx.v.layout.modal_panel.v1"
          ],
          "description": "Domain instance this extension mounts into."
        },
        "entry": {
          "type": "string",
          "x-gts-ref": "gts.*",
          "description": "MFE entry to load, resolved through realizes: for the widget's kind."
        }
      }
    }
  ]
}
```

**Deltas**: `domain` widened from one constant to the two domains that use this type; instance form without a trailing `~`.

**Cross-references**: domains sections 6.8 and 6.9; identifier rule section 6.14; ADR-0011.

### 6.12 Modal Container Extension

**GTS instance ID**: `gts.frontx.mfes.ext.extension.v1~frontx.v.layout.modal_container.v1`

**Description**: Static extension of the host modal domain, declared in the `dashboard-viewer` manifest and registered by the host bootstrap from the manifest channel. It is an instance of the FrontX extension base with no derived type, because it carries no fields of its own: no subject, no widget data, and no peer position. Its entry requires theme and language, which the host modal domain shares, and declares no custom actions (entry owned by `feature-mfe-entries`). The container is a nested host for `modal_panel` (section 6.9). It replaces the prototype's `modal` domain and `modal` extension type.

**Instance**:

```json
{
  "id": "gts.frontx.mfes.ext.extension.v1~frontx.v.layout.modal_container.v1",
  "domain": "gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.popup.v1",
  "entry": "gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.v.mfe.modal_container.v1"
}
```

**Host contract notes**:
- `domain` is the host modal domain by role. As a manifest-declared extension it carries the current `template-shell` identifier from the DESIGN host contract table, or is generated from the shell constant at build time (`cpt-frontx-dashboard-constraint-role-based-host-ids`).
- The host modal domain has no extension type constraint, uses the optional mount strategy (zero or one occupant), and requires no extension actions, so this plain extension is admitted (FrontX ADR-0010).
- Host prerequisite: the host must render the host modal domain through a domain slot with modal chrome, focus trap, and dismissal. Current `template-shell` does not, and this change is tracked outside the template (DESIGN section 3.5 and section 4). Until it exists the container mounts but is not visible; the detail panel and the rest of the dashboard work.

**Cross-references**: DESIGN `cpt-frontx-dashboard-component-modal-container`, `cpt-frontx-dashboard-contract-host-domains`; ADR-0010, ADR-0016.

### 6.13 Template Theme Payload

**Description**: Value of the FrontX theme shared property `gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.theme.v1~` as published by the template into its own domains. Theme is the only shared property of the three template domains. The payload adds no GTS type: it is the stable value shape that the template publishes, and widgets read only this payload; they never map a host theme id themselves.

| Publisher | Domains | Value |
|-----------|---------|-------|
| Host | host screen and modal domains | the host theme id only (host contract, not template-owned) |
| Viewer host | `layout_cells`, `detail_panel` | template payload below |
| Modal container | `modal_panel` | template payload below, filled from the palette and mode of the latest `set_drilldown_context` and the host theme id the container receives from the host modal domain |

**Template payload fields**:

| Field | Required | Meaning |
|-------|----------|---------|
| `theme_id` | yes | The host theme id, as received from the host. |
| `mode` | yes | `light` or `dark`, from the template's theme-mode map; an unmapped id resolves to `light` with a diagnostic. |
| `palette` | yes | The active dashboard palette for that mode, in the shape of `light_palette` and `dark_palette` of `gts.frontx.m.dashboard.theme.v1~`; the built-in default palette when the theme reference is missing or invalid. |

**Cross-references**: DESIGN section 3.1 (theme shared-property payload table), `cpt-frontx-dashboard-seq-theme-switch`; palette shape in `feature-dashboard-root-types`; ADR-0008.

### 6.14 Widget Extension Identifier Rule

**Description**: The Viewer host generates widget extension identifiers deterministically from the surface, the cell index, and the widget position, under the template's `frontx.v.layout` namespace (DESIGN section 3.3, Identifier uniqueness). This section fixes the form, as handed off by DESIGN section 4. Each identifier is an instance of the surface's extension type.

| Surface | Registered by | Identifier form |
|---------|---------------|-----------------|
| `layout_cells` | Viewer host, at dashboard resolution | `gts.frontx.mfes.ext.extension.v1~frontx.v.layout.layout_cells.v1~frontx.v.layout.cell_<c>.v1` |
| `detail_panel` | Viewer host, at dashboard resolution | `gts.frontx.mfes.ext.extension.v1~frontx.v.layout.detail_panel.v1~frontx.v.layout.panel_<c>_<p>.v1` |
| `modal_panel` | modal container, at drill-down open | `gts.frontx.mfes.ext.extension.v1~frontx.v.layout.detail_panel.v1~frontx.v.layout.modal_<c>_<p>.v1` |

- `<c>` is the zero-based index of the cell in the layout's ordered `cells`; for drill-down widgets it is the origin cell.
- `<p>` is the zero-based position of the widget in the origin cell widget's drill-down declaration. For `modal_panel` this list is the origin's widget union, so a peer step addresses the same extension for the same widget.
- The `panel_` and `modal_` prefixes keep the `detail_panel` and `modal_panel` sets disjoint, so no advertisement trips the tree-global collision guard (FrontX ADR-0007).
- Across drill-downs from different dashboards the same `modal_` identifier can name a different widget; the container registers it again at that drill-down's open.
- The rule itself is TS-internal (DESIGN section 3.3, API Stability Classification); the identifiers it produces are not persisted.

**Cross-references**: `cpt-frontx-dashboard-interface-template-domains`; `cpt-frontx-dashboard-principle-no-extension-on-click`; section 6.17 (ordering of the drill-down list).

### 6.15 Domain-scoped FilterState companion (Viewer-host-internal)

**Description**: Runtime behavior, not a GTS type. The Viewer host keeps one **TS-internal** local filter overlay per surface, conceptually a map from surface to FilterState, parallel to the global filter state that the filter panel writes. The companion is the mechanism behind `cpt-frontx-dashboard-fr-local-filter-overlay`. It is kept in the catalog, as in the prototype, because the chains of section 6.16 read correctly only with it in mind. The prototype's "Shell" role is the Viewer host here.

**Explicit non-introductions**:
- No GTS type, instance, or namespace is added; the filter state and the overlays stay TS-internal (ADR-0014, DESIGN section 3.3 Internal classification).
- No shared property is added to any domain; theme stays the only one.
- No peer-navigation fields on any extension type. The origin and peer position travel in `mount_widget` and `set_drilldown_context` and are kept by the Viewer host's drill-down state and the container; the prototype's chain-origin metadata is not used, because FrontX tracks no chain origin (FrontX ADR-0007).

**How the runtime uses it**:
- Cells: each cell's overlay and time bucket live in the Viewer host store and travel inside that cell's filter snapshot in `query.request`; `layout_cells` receives no `set_local_filter`.
- Detail panel: on a panel drill-down the Viewer host sets the panel overlay from the source cell's overlay and the clicked subject and delivers it with `set_local_filter` when an overlay applies.
- Modal: on a modal drill-down the overlay is seeded the same way, applied before the modal data is resolved, and delivered to `modal_panel` with `set_local_filter` when an overlay applies.
- A global filter change updates the global filter state and does not rewrite the surface overlays; which widgets re-query follows `cpt-frontx-dashboard-seq-filter-change`.
- Closing a surface drops its overlay; teardown discards the store with all overlays.

**Cross-references**: section 6.5; DESIGN `cpt-frontx-dashboard-component-viewer-host`; ADR-0006, ADR-0014.

### 6.16 Action Chain Patterns

**Description**: Summary of the chains that use this catalog. The authoritative step lists are the DESIGN sequences named in each row; this table is for orientation only. Per-widget data flows only through `set_subject` and `set_data`, overlays only through `set_local_filter` or the cell snapshot, and drill-down context only through `set_drilldown_context`; nothing travels through shared properties except the theme payload.

| Chain | Trigger | Steps, in order | DESIGN sequence |
|-------|---------|-----------------|-----------------|
| Cell mount | Dashboard resolved | `load_ext`, `mount_ext`, `set_subject` per cell; `set_data` per result or error | `cpt-frontx-dashboard-seq-initial-load` |
| Panel drill-down | `mount_widget`, target surface panel | `unmount_ext` of the current occupant if any, `set_local_filter` if an overlay applies, `mount_ext` of each panel widget, `set_subject` each; `set_data` per result or error | `cpt-frontx-dashboard-seq-detail-panel-drilldown` |
| Modal open | `mount_widget` without peer-step marker, target surface modal | Data resolved first; then one escalated chain, every step with fallback `unmount_ext` of the container: `mount_ext` of the container in the host modal domain, `set_drilldown_context` (open form), `set_local_filter` if an overlay applies, `mount_ext` of each widget of the clicked item in `modal_panel`, `set_subject` and `set_data` each | `cpt-frontx-dashboard-seq-modal-drilldown-open` |
| Peer step | Prev or Next in the container | `navigate_peer` to the origin cell (fallback `unmount_ext` of the container); origin answers `mount_widget` with peer-step marker; data resolved; one escalated chain, every step with the same fallback: nested `unmount_ext` and `mount_ext` only when the widgets differ, `set_subject` and `set_data` each, `set_drilldown_context` (update form) last | `cpt-frontx-dashboard-seq-peer-navigation` |
| Theme switch | Host theme id changes | Viewer host updates the theme payload of `layout_cells` and `detail_panel`; when it has opened the modal, `set_drilldown_context` (update form) to `modal_panel` | `cpt-frontx-dashboard-seq-theme-switch` |
| Close and teardown | Close, host dismissal, or dashboard close | `unmount_ext` of the container in the host modal domain; on teardown also `unmount_ext` of the panel and every cell | `cpt-frontx-dashboard-seq-teardown` |

**Invariants**:
- A widget receives `set_subject` before `set_data`, and only after it is mounted.
- No extension is registered or unregistered on Prev or Next; the host modal domain receives no action during a peer step.
- Prev and Next stay disabled until the update form of `set_drilldown_context` arrives as the last step, so peer steps cannot overlap; Close is never disabled.
- The detail panel holds zero or one panel, and the latest drill-down request wins (see section 6.17).

### 6.17 Open Questions

- **Panel-change serialization** (DESIGN section 4). FrontX chains report no completion, so the mechanism that releases one panel chain before the next starts is not chosen yet. The catalog adds no action for it; if the chosen mechanism needs a terminal internal action, it is added here as a new host action type.
- **Drill-down declaration semantics** (owned by `feature-widget-catalog`). The working assumption is a static declared widget list from which each clicked item shows a subset. Its final form decides whether `mount_widget.widgets` items are inline instances or references, the form of the clicked `subject`, and the ordering that fixes `<p>` in section 6.14.

## 7. Acceptance Criteria

- [ ] All six host action types, the two extension types, the three domain instances, and the modal container extension of section 6 are registered through the `dashboard-viewer` `mfe.json` and validate against their FrontX bases.
- [ ] Every identifier in this catalog follows the template ID-form convention: types end with `~`, instances do not, and every template segment is at `v1`.
- [ ] `layout_cells`, `detail_panel`, and `modal_panel` are admitted with the concurrent strategy; registering any of them without `unmount_ext` is rejected.
- [ ] `mount_widget` is declared on `detail_panel` only, `set_drilldown_context` on `modal_panel` only, and `navigate_peer` among the extension actions of `layout_cells` only.
- [ ] A `mount_widget` that answers `navigate_peer` carries `peer_step: true`; a `mount_widget` without it opens a new drill-down.
- [ ] The open form of `set_drilldown_context` carries the widget union; peer and theme updates carry no `widgets`.
- [ ] Widgets in all three template domains receive the template theme payload with `theme_id`, `mode`, and `palette`, and no other shared property.
- [ ] Widget extension identifiers follow section 6.14, and opening, closing, and reopening a modal drill-down logs no collision diagnostic in any registry.
- [ ] The modal container extension carries only `id`, `domain`, and `entry`.
