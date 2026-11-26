---
status: accepted
version: 1
date: 2026-11-20
description: "Decomposition of the template-shell architecture into features; one entry so far, the unit producer output."
---

# Decomposition: Template Shell

<!-- toc -->

- [1. Overview](#1-overview)
- [2. Entries](#2-entries)
  - [2.1 Unit Producer Output - HIGH](#21-unit-producer-output---high)
- [3. Feature Dependencies](#3-feature-dependencies)

<!-- /toc -->

## 1. Overview

The template-shell architecture holds the behaviour of the unit producer package that the shell template ships. The unit producer output is its first feature; other template-shell behaviour has no artifact yet.

## 2. Entries

**Overall implementation status:**

- [x] `p1` - **ID**: `cpt-template-shell-status-overall`

### 2.1 Unit Producer Output - HIGH

- [x] `p1` - **ID**: `cpt-template-shell-feature-unit-producer-output`

- **Purpose**: Emit the shared chunks, the unit table and the fetch lists in the FrontX unit format contract, so the FrontX runtime loads the output with content-keyed reuse.

- **Depends On**: None

- **Scope**:
  - Entry-point chunking and externalization of shared packages.
  - The unit table and the fetch lists, keyed per target, with the union for a target two parents reach.
  - The alias unit for an unhashed cycle location.
  - The opaque-import report.

- **Out of scope**:
  - The format contract and the runtime that reads the output (FrontX).
  - The microfrontend build plugin that assembles the manifest (`cpt-template-mfe-feature-mfe-fetch-list-assembly`).

## 3. Feature Dependencies

```text
cpt-template-shell-feature-unit-producer-output
```
