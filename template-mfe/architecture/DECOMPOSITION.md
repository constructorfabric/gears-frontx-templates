---
status: accepted
version: 1
date: 2026-11-20
description: "Decomposition of the template-mfe architecture into features; one entry so far, the build plugin's fetch-list assembly."
---

# Decomposition: Template MFE

<!-- toc -->

- [1. Overview](#1-overview)
- [2. Entries](#2-entries)
  - [2.1 MFE Fetch-List Assembly - HIGH](#21-mfe-fetch-list-assembly---high)
- [3. Feature Dependencies](#3-feature-dependencies)

<!-- /toc -->

## 1. Overview

The template-mfe architecture holds the behaviour of the MFE build plugin that the microfrontend template ships. The fetch-list assembly is its first feature; other template-mfe behaviour has no artifact yet.

## 2. Entries

**Overall implementation status:**

- [x] `p1` - **ID**: `cpt-template-mfe-status-overall`

### 2.1 MFE Fetch-List Assembly - HIGH

- [x] `p1` - **ID**: `cpt-template-mfe-feature-mfe-fetch-list-assembly`

- **Purpose**: Assemble a microfrontend's `units` and `lists` for its manifest from the unit producer's output and the build's own chunk graph, so the runtime loads each exposed module and lazy target in one round.

- **Depends On**: `cpt-template-shell-feature-unit-producer-output`

- **Scope**:
  - One list per exposed module and per lazy target, a lazy own chunk keyed by emitted chunk location and a shared package imported dynamically keyed by its bare specifier, with the union for a target two parents reach.
  - The check that every name an own chunk imports from a shared specifier is exported by the unit answering it.
  - `ownChunks` per list.
  - The lazy-import call for every literal and pattern dynamic import in the microfrontend's own code, and no list for a pattern import.
  - The opaque-import report with file and line.

- **Out of scope**:
  - The chunks, the unit table and the shared-package fetch lists (`cpt-template-shell-feature-unit-producer-output`).
  - The format contract and the runtime (FrontX).

## 3. Feature Dependencies

```text
cpt-template-shell-feature-unit-producer-output
  -> cpt-template-mfe-feature-mfe-fetch-list-assembly
```
