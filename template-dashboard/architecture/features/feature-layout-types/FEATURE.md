# Feature: Layout Types Catalog


<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Type-Catalog Feature — No Actor Flows](#type-catalog-feature--no-actor-flows)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Type-Catalog Feature — No Processes](#type-catalog-feature--no-processes)
- [4. States (CDSL)](#4-states-cdsl)
  - [Type-Catalog Feature — No State Machines](#type-catalog-feature--no-state-machines)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Type Catalog Definition of Done](#type-catalog-definition-of-done)
- [6. Type Catalog](#6-type-catalog)
  - [6.1 Layout](#61-layout)
  - [6.2 LayoutCell](#62-layoutcell)
- [7. Acceptance Criteria](#7-acceptance-criteria)

<!-- /toc -->

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-featstatus-layout-types`
## 1. Feature Context

- [ ] `p2` - `cpt-frontx-dashboard-feature-layout-types`

### 1.1 Overview

This is a **type-catalog feature**, not an actor-flow feature. It enumerates the Layout and LayoutCell types of the 60-column grid. The FEATURE template's flow, process, and state sections are reduced to stubs; the catalog lives in section 6, Type Catalog.

### 1.2 Purpose

Concrete catalog of the layout structural types the Viewer host recognises at runtime, with the full JSON Schema declaration and cross-references to the widget base (DESIGN section 3.1, Layout and cell). Schema validation checks each coordinate; the Viewer host checks overlaps and `x + w` greater than 60.

**Declaring package**: `dashboard-viewer`.

**Requirements**: `cpt-frontx-dashboard-fr-type-catalog`

**Principles**: `cpt-frontx-dashboard-principle-gts-contracts`

### 1.3 Actors

N/A — type-catalog feature. The catalog is consumed by the runtime type system (Viewer host, Worker, and widget MFEs), not by an end-user actor. No human actor flows are authored.

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md#31-domain-model)
- **Dependencies**: None for authoring. `LayoutCell.widget` references `gts.frontx.m.widget.widget.v1~` (`feature-widget-catalog`) by `x-gts-ref`. `gts.frontx.m.dashboard.dashboard.v1~` (`feature-dashboard-root-types`) references the Layout. Dependency graph: layout-types depends on widget-catalog (reference only); dashboard-root-types depends on layout-types.

## 2. Actor Flows (CDSL)

### Type-Catalog Feature — No Actor Flows

N/A — type-catalog feature. Catalog content is consumed at runtime by the type system, not by an actor flow. The full catalog lives in section 6, Type Catalog.

## 3. Processes / Business Logic (CDSL)

### Type-Catalog Feature — No Processes

N/A — type-catalog feature. The catalog declares static GTS schemas; runtime validation and execution logic lives in the Viewer host and Worker bundles of `dashboard-viewer`, not in this catalog file.

## 4. States (CDSL)

### Type-Catalog Feature — No State Machines

N/A — type-catalog feature. Type declarations are stateless.

## 5. Definitions of Done

### Type Catalog Definition of Done

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-dod-layout-types-catalog-complete`

The system **MUST** declare `gts.frontx.m.layout.layout.v1~` with `columns` fixed at 60 and `gts.frontx.m.layout.cell.v1~` with bounded `x`, `y`, `w`, `h`, in `dashboard-viewer`.

- Every concrete is authored with a full JSON Schema declaration.
- Every identifier follows the GTS identifier grammar and the ID-form convention of DESIGN section 3.1 (types end with `~`, instances do not).
- Every `x-gts-ref` and `$ref` resolves to a declared type.

**Constraints**: `cpt-frontx-dashboard-constraint-sixty-column-grid`

## 6. Type Catalog


### 6.1 Layout

**GTS ID**: `gts.frontx.m.layout.layout.v1~`

**Description**: Reusable grid layout with a 60-column model containing an ordered array of positioned cells.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.m.layout.layout.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Layout",
  "description": "Reusable grid layout with a 60-column model containing an ordered array of positioned cells.",
  "type": "object",
  "required": ["name", "columns", "cells"],
  "properties": {
    "name": {
      "type": "string",
      "description": "Human-readable layout name."
    },
    "columns": {
      "type": "integer",
      "const": 60,
      "description": "Number of grid columns. Fixed at 60 for all layouts."
    },
    "cells": {
      "type": "array",
      "description": "Ordered array of layout cells defining widget positions within the grid.",
      "items": {
"$ref": "gts://gts.frontx.m.layout.cell.v1~"
      }
    }
  }
}
```

**Cross-references**:
- No abstract base (flat single-segment chain).
- Related types: `gts.frontx.m.layout.cell.v1~`

### 6.2 LayoutCell

**GTS ID**: `gts.frontx.m.layout.cell.v1~`

**Description**: Embedded cell within a Layout specifying grid position, size, and the widget it renders. Each cell is an occupant of the `layout_cells` extension domain; the Viewer host derives the extension instances from the cells.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.m.layout.cell.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "LayoutCell",
  "description": "Embedded cell within a Layout specifying grid position, size, and the widget it renders. Not independently addressable; always embedded in a Layout.",
  "type": "object",
  "required": ["x", "y", "w", "h", "widget"],
  "properties": {
    "x": {
      "type": "integer",
      "minimum": 0,
      "maximum": 59,
      "description": "Horizontal grid position (column index, 0-based)."
    },
    "y": {
      "type": "integer",
      "minimum": 0,
      "description": "Vertical grid position (row index, 0-based)."
    },
    "w": {
      "type": "integer",
      "minimum": 1,
      "maximum": 60,
      "description": "Width of the cell in grid columns."
    },
    "h": {
      "type": "integer",
      "minimum": 1,
      "description": "Height of the cell in grid rows."
    },
    "widget": {
      "type": "string",
      "description": "Inline widget instance rendered in this cell (the widget instance is embedded in the cell, so the reference stays inside package `m`).",
      "x-gts-ref": "gts.frontx.m.widget.widget.v1~"
    }
  }
}
```

**Cross-references**:
- No abstract base (flat single-segment chain).
- Related types: `gts.frontx.m.widget.widget.v1~`

## 7. Acceptance Criteria

- [ ] Every concrete listed in this catalog is authored with its full schema
- [ ] Every concrete passes GTS identifier grammar and `x-gts-ref` validation
- [ ] Every type identifier ends with `~`, every instance identifier does not, and every identifier carries `v1`
- [ ] `cfs validate --artifact` on this file reports PASS
