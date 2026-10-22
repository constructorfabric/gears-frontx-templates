# Feature: Filter Catalog


<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Type-Catalog Feature - No Actor Flows](#type-catalog-feature---no-actor-flows)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Type-Catalog Feature - No Processes](#type-catalog-feature---no-processes)
- [4. States (CDSL)](#4-states-cdsl)
  - [Type-Catalog Feature - No State Machines](#type-catalog-feature---no-state-machines)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Type Catalog Definition of Done](#type-catalog-definition-of-done)
- [6. Type Catalog](#6-type-catalog)
  - [6.1 FilterByAuthor](#61-filterbyauthor)
  - [6.2 FilterByRepo](#62-filterbyrepo)
  - [6.3 FilterByTeam](#63-filterbyteam)
  - [6.4 FilterByCreatedAtRange](#64-filterbycreatedatrange)
  - [6.5 FilterByMergedAtRange](#65-filterbymergedatrange)
  - [6.6 FilterByCommittedAtRange](#66-filterbycommittedatrange)
  - [6.7 FilterByTitleContains](#67-filterbytitlecontains)
  - [6.8 FilterByTitleExcludesWords](#68-filterbytitleexcludeswords)
  - [6.9 FilterByState](#69-filterbystate)
  - [6.10 FilterExcludeWip](#610-filterexcludewip)
  - [6.11 FilterBotInclusion](#611-filterbotinclusion)
  - [6.12 FilterByLanguage](#612-filterbylanguage)
  - [6.13 FilterByAssignees](#613-filterbyassignees)
  - [6.14 FilterByPrNumbers](#614-filterbyprnumbers)
  - [6.15 FilterByIssueNumbers](#615-filterbyissuenumbers)
  - [6.16 FilterHasPendingReviewers](#616-filterhaspendingreviewers)
  - [6.17 FilterHasApprovedReviewers](#617-filterhasapprovedreviewers)
  - [6.18 FilterHasUnrepliedComments](#618-filterhasunrepliedcomments)
  - [6.19 FilterByLocChangedRange](#619-filterbylocchangedrange)
  - [6.20 FilterByMessageContains](#620-filterbymessagecontains)
  - [6.21 FilterByCommentSource](#621-filterbycommentsource)
  - [6.22 FilterUnrepliedOnly](#622-filterunrepliedonly)
  - [6.23 FilterImportantBotsOnly](#623-filterimportantbotsonly)
  - [6.24 FilterByMinPoints](#624-filterbyminpoints)
  - [6.25 FilterByMinPrsMerged](#625-filterbyminprsmerged)
  - [6.26 FilterByScoreThreshold](#626-filterbyscorethreshold)
  - [6.27 FilterByLabels](#627-filterbylabels)
  - [6.28 FilterByProjects](#628-filterbyprojects)
  - [6.29 FilterByMilestones](#629-filterbymilestones)
  - [6.30 FilterByIssueTypes](#630-filterbyissuetypes)
  - [6.31 FilterByTimeFieldSelector](#631-filterbytimefieldselector)
- [7. Acceptance Criteria](#7-acceptance-criteria)
- [8. Open Questions](#8-open-questions)

<!-- /toc -->

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-featstatus-filter-catalog`
## 1. Feature Context

- [ ] `p2` - `cpt-frontx-dashboard-feature-filter-catalog`

### 1.1 Overview

This is a **type-catalog feature**, not an actor-flow feature. It lists the 31 concrete filters of the `dashboard-demo` package. Each extends the Filter base `gts.frontx.v.filter.filter.v1~`, which is owned by `dashboard-viewer` and defined in DESIGN section 3.1; the base is referenced here, not redefined.

### 1.2 Purpose

Concrete catalog of the filters the demo queries list in `filter_scopes`. Each filter declares the entity aspect it requires, a fixed `predicate` keyword, and a narrowed `parameter` shape; applicability to an entity follows from aspect composition, not from per-entity coupling. Filter ids follow the pattern `gts.frontx.v.filter.filter.v1~frontx.demo.filter.<name>.v1~`.

**Requirements**: `cpt-frontx-dashboard-fr-type-catalog`

**Principles**: `cpt-frontx-dashboard-principle-gts-contracts`

### 1.3 Actors

N/A - type-catalog feature. The catalog is consumed by the runtime type system (Viewer host, Data Query Worker, widget MFEs) and by the demo fixtures, not by an end-user actor flow. No actor flows are authored.

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md) (section 3.1 Domain Model)
- **Dependencies**: [feature-aspect-catalog](../feature-aspect-catalog/FEATURE.md) (each filter declares an aspect through `requires`).

## 2. Actor Flows (CDSL)

### Type-Catalog Feature - No Actor Flows

N/A - type-catalog feature. Catalog content is consumed at runtime by the type system, not by an actor flow. The catalog lives in section 6 Type Catalog.

## 3. Processes / Business Logic (CDSL)

### Type-Catalog Feature - No Processes

N/A - type-catalog feature. The catalog declares static GTS schemas; runtime validation logic lives in the Viewer host, the Worker, and the MFE bundles, not in this file.

## 4. States (CDSL)

### Type-Catalog Feature - No State Machines

N/A - type-catalog feature. Type declarations are stateless.

## 5. Definitions of Done

### Type Catalog Definition of Done

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-dod-filter-catalog-catalog-complete`

The system **MUST** ship every type listed in section 6 in the `dashboard-demo` package (`templateExample: true`), registered through that package's `mfe.json` `schemas`.

- All 31 concrete filters in section 6 are authored.
- Every filter extends the Filter base through `allOf` and `$ref`.
- Every `requires` value names an aspect declared in `feature-aspect-catalog`.

## 6. Type Catalog

All identifiers end in `~` (types) and use `v1`. The package `dashboard-demo` declares this catalog; the base types it extends are owned by other packages as noted in each entry.

### 6.1 FilterByAuthor

**GTS ID**: `gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_author.v1~`

**Description**: Narrows a collection of has_author entities to/from a set of author logins; the predicate operates on `author_login` (the GitHub login carried by the denormalized has_author aspect).

**Schema**:

```json
{
  "$id": "gts://gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_author.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "FilterByAuthor",
  "description": "Narrows a collection of has_author entities to/from a set of author logins. The predicate operates on `author_login` (the GitHub login carried by the denormalized has_author aspect).",
  "allOf": [
    { "$ref": "gts://gts.frontx.v.filter.filter.v1~" },
    {
      "type": "object",
      "properties": {
"requires": { "const": "gts.frontx.demo.entity_aspect.has_author.v1~" },
"predicate": { "enum": ["in", "not_in"] },
"parameter": {
  "type": "object",
  "required": ["include", "exclude"],
  "properties": {
    "include": { "type": ["array", "null"], "items": { "type": "string" }, "description": "author_login values to include; null means 'all'." },
    "exclude": { "type": ["array", "null"], "items": { "type": "string" }, "description": "author_login values to exclude." }
  }
}
      }
    }
  ]
}
```

**Cross-references**:
- Abstract base: `gts.frontx.v.filter.filter.v1~` owned by `dashboard-viewer` and defined in DESIGN §3.1.
- Related types: Required entity aspect declared in feature-aspect-catalog via the `requires` field.

### 6.2 FilterByRepo

**GTS ID**: `gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_repo.v1~`

**Description**: Narrows a collection of has_repo entities by repository slug.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_repo.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "FilterByRepo",
  "description": "Narrows a collection of has_repo entities by repository slug.",
  "allOf": [
    { "$ref": "gts://gts.frontx.v.filter.filter.v1~" },
    {
      "type": "object",
      "properties": {
"requires": { "const": "gts.frontx.demo.entity_aspect.has_repo.v1~" },
"predicate": { "enum": ["in", "not_in"] },
"parameter": {
  "type": "object",
  "required": ["include", "exclude"],
  "properties": {
    "include": { "type": ["array", "null"], "items": { "type": "string" }, "description": "Repository slugs to include; null means 'all'." },
    "exclude": { "type": ["array", "null"], "items": { "type": "string" }, "description": "Repository slugs to exclude." }
  }
}
      }
    }
  ]
}
```

**Cross-references**:
- Abstract base: `gts.frontx.v.filter.filter.v1~` owned by `dashboard-viewer` and defined in DESIGN §3.1.
- Related types: Required entity aspect declared in feature-aspect-catalog via the `requires` field.

### 6.3 FilterByTeam

**GTS ID**: `gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_team.v1~`

**Description**: Narrows a collection of has_team entities by team name; the predicate operates on `author_team_name` (the denormalized team-name field carried by the has_team aspect).

**Schema**:

```json
{
  "$id": "gts://gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_team.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "FilterByTeam",
  "description": "Narrows a collection of has_team entities by team name. The predicate operates on `author_team_name` (the denormalized team-name field carried by the has_team aspect).",
  "allOf": [
    { "$ref": "gts://gts.frontx.v.filter.filter.v1~" },
    {
      "type": "object",
      "properties": {
"requires": { "const": "gts.frontx.demo.entity_aspect.has_team.v1~" },
"predicate": { "enum": ["in", "not_in"] },
"parameter": {
  "type": "object",
  "required": ["include", "exclude"],
  "properties": {
    "include": { "type": ["array", "null"], "items": { "type": "string" }, "description": "author_team_name values to include." },
    "exclude": { "type": ["array", "null"], "items": { "type": "string" }, "description": "author_team_name values to exclude." }
  }
}
      }
    }
  ]
}
```

**Cross-references**:
- Abstract base: `gts.frontx.v.filter.filter.v1~` owned by `dashboard-viewer` and defined in DESIGN §3.1.
- Related types: Required entity aspect declared in feature-aspect-catalog via the `requires` field.

### 6.4 FilterByCreatedAtRange

**GTS ID**: `gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_created_at_range.v1~`

**Description**: Narrows entities to a created_at range.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_created_at_range.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "FilterByCreatedAtRange",
  "description": "Date-range filter on `created_at`. Per the strict 'one narrowing property per filter' principle, a separate per-timestamp filter exists for each timestamp aspect (created_at, updated_at, merged_at, closed_at, committed_at); UI selects which is active.",
  "allOf": [
    { "$ref": "gts://gts.frontx.v.filter.filter.v1~" },
    {
      "type": "object",
      "properties": {
"requires": { "const": "gts.frontx.demo.entity_aspect.has_created_at.v1~" },
"predicate": { "const": "range" },
"parameter": {
  "type": "object",
  "required": ["from", "until"],
  "properties": {
    "from": { "type": ["string", "null"], "format": "date-time", "description": "Inclusive start; null means no lower bound." },
    "until": { "type": ["string", "null"], "format": "date-time", "description": "Inclusive end; null means no upper bound." }
  }
}
      }
    }
  ]
}
```

**Cross-references**:
- Abstract base: `gts.frontx.v.filter.filter.v1~` owned by `dashboard-viewer` and defined in DESIGN §3.1.
- Related types: Required entity aspect declared in feature-aspect-catalog via the `requires` field.

### 6.5 FilterByMergedAtRange

**GTS ID**: `gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_merged_at_range.v1~`

**Description**: Narrows entities to a merged_at range. PR-specific.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_merged_at_range.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "FilterByMergedAtRange",
  "description": "Date-range filter on PR `merged_at`.",
  "allOf": [
    { "$ref": "gts://gts.frontx.v.filter.filter.v1~" },
    {
      "type": "object",
      "properties": {
"requires": { "const": "gts.frontx.demo.entity_aspect.has_merged_at.v1~" },
"predicate": { "const": "range" },
"parameter": {
  "type": "object",
  "required": ["from", "until"],
  "properties": {
    "from": { "type": ["string", "null"], "format": "date-time" },
    "until": { "type": ["string", "null"], "format": "date-time" }
  }
}
      }
    }
  ]
}
```

**Cross-references**:
- Abstract base: `gts.frontx.v.filter.filter.v1~` owned by `dashboard-viewer` and defined in DESIGN §3.1.
- Related types: Required entity aspect declared in feature-aspect-catalog via the `requires` field.

### 6.6 FilterByCommittedAtRange

**GTS ID**: `gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_committed_at_range.v1~`

**Description**: Narrows entities to a committed_at range. Commit-specific.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_committed_at_range.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "FilterByCommittedAtRange",
  "description": "Date-range filter on commit `committed_at`.",
  "allOf": [
    { "$ref": "gts://gts.frontx.v.filter.filter.v1~" },
    {
      "type": "object",
      "properties": {
"requires": { "const": "gts.frontx.demo.entity_aspect.has_committed_at.v1~" },
"predicate": { "const": "range" },
"parameter": {
  "type": "object",
  "required": ["from", "until"],
  "properties": {
    "from": { "type": ["string", "null"], "format": "date-time" },
    "until": { "type": ["string", "null"], "format": "date-time" }
  }
}
      }
    }
  ]
}
```

**Cross-references**:
- Abstract base: `gts.frontx.v.filter.filter.v1~` owned by `dashboard-viewer` and defined in DESIGN §3.1.
- Related types: Required entity aspect declared in feature-aspect-catalog via the `requires` field.

### 6.7 FilterByTitleContains

**GTS ID**: `gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_title_contains.v1~`

**Description**: Narrows entities by title substring.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_title_contains.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "FilterByTitleContains",
  "description": "Substring match on `title` (case-insensitive).",
  "allOf": [
    { "$ref": "gts://gts.frontx.v.filter.filter.v1~" },
    {
      "type": "object",
      "properties": {
"requires": { "const": "gts.frontx.demo.entity_aspect.has_title.v1~" },
"predicate": { "const": "contains" },
"parameter": {
  "type": "object",
  "required": ["substring"],
  "properties": {
    "substring": { "type": "string", "description": "Substring to match (case-insensitive)." }
  }
}
      }
    }
  ]
}
```

**Cross-references**:
- Abstract base: `gts.frontx.v.filter.filter.v1~` owned by `dashboard-viewer` and defined in DESIGN §3.1.
- Related types: Required entity aspect declared in feature-aspect-catalog via the `requires` field.

### 6.8 FilterByTitleExcludesWords

**GTS ID**: `gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_title_excludes_words.v1~`

**Description**: Excludes entities whose title contains certain tokens.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_title_excludes_words.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "FilterByTitleExcludesWords",
  "description": "Excludes entities whose title contains any of a token blocklist.",
  "allOf": [
    { "$ref": "gts://gts.frontx.v.filter.filter.v1~" },
    {
      "type": "object",
      "properties": {
"requires": { "const": "gts.frontx.demo.entity_aspect.has_title.v1~" },
"predicate": { "const": "not_in" },
"parameter": {
  "type": "object",
  "required": ["tokens"],
  "properties": {
    "tokens": { "type": "array", "items": { "type": "string" }, "description": "Title tokens whose presence excludes the entity." }
  }
}
      }
    }
  ]
}
```

**Cross-references**:
- Abstract base: `gts.frontx.v.filter.filter.v1~` owned by `dashboard-viewer` and defined in DESIGN §3.1.
- Related types: Required entity aspect declared in feature-aspect-catalog via the `requires` field.

### 6.9 FilterByState

**GTS ID**: `gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_state.v1~`

**Description**: Narrows entities by state enum values.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_state.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "FilterByState",
  "description": "Lifecycle-state inclusion filter. Per-entity state enums (PR: OPEN/MERGED/CLOSED; Issue: OPEN/CLOSED; Review: APPROVED/CHANGES_REQUESTED/COMMENTED/DISMISSED/PENDING) are constrained at the entity level, not the filter level.",
  "allOf": [
    { "$ref": "gts://gts.frontx.v.filter.filter.v1~" },
    {
      "type": "object",
      "properties": {
"requires": { "const": "gts.frontx.demo.entity_aspect.has_state.v1~" },
"predicate": { "const": "in" },
"parameter": {
  "type": "object",
  "required": ["values"],
  "properties": {
    "values": { "type": "array", "items": { "type": "string" }, "description": "Allowed state values; the entity-level enum constrains validity." }
  }
}
      }
    }
  ]
}
```

**Cross-references**:
- Abstract base: `gts.frontx.v.filter.filter.v1~` owned by `dashboard-viewer` and defined in DESIGN §3.1.
- Related types: Required entity aspect declared in feature-aspect-catalog via the `requires` field.

### 6.10 FilterExcludeWip

**GTS ID**: `gts.frontx.v.filter.filter.v1~frontx.demo.filter.exclude_wip.v1~`

**Description**: Excludes WIP/draft entities.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.v.filter.filter.v1~frontx.demo.filter.exclude_wip.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "FilterExcludeWip",
  "description": "Removes draft / WIP-flagged entities.",
  "allOf": [
    { "$ref": "gts://gts.frontx.v.filter.filter.v1~" },
    {
      "type": "object",
      "properties": {
"requires": { "const": "gts.frontx.demo.entity_aspect.has_wip_signal.v1~" },
"predicate": { "const": "equals" },
"parameter": {
  "type": "object",
  "required": ["is_draft"],
  "properties": {
    "is_draft": { "type": "boolean", "description": "Match value (typically false to exclude WIPs)." }
  }
}
      }
    }
  ]
}
```

**Cross-references**:
- Abstract base: `gts.frontx.v.filter.filter.v1~` owned by `dashboard-viewer` and defined in DESIGN §3.1.
- Related types: Required entity aspect declared in feature-aspect-catalog via the `requires` field.

### 6.11 FilterBotInclusion

**GTS ID**: `gts.frontx.v.filter.filter.v1~frontx.demo.filter.bot_inclusion.v1~`

**Description**: Filters bot vs human authors with optional bot exclusion list.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.v.filter.filter.v1~frontx.demo.filter.bot_inclusion.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "FilterBotInclusion",
  "description": "Bot inclusion / exclusion. Bot-ness is derived at runtime from `author` against the admin-managed bot list.",
  "allOf": [
    { "$ref": "gts://gts.frontx.v.filter.filter.v1~" },
    {
      "type": "object",
      "properties": {
"requires": { "const": "gts.frontx.demo.entity_aspect.has_author.v1~" },
"predicate": { "enum": ["equals", "in"] },
"parameter": {
  "type": "object",
  "required": ["include_bots", "exclude_excluded_bots"],
  "properties": {
    "include_bots": { "type": "boolean", "description": "Whether bot authors are included at all." },
    "exclude_excluded_bots": { "type": "boolean", "description": "When include_bots is true, removes bots present in the org's excluded-bots admin list." }
  }
}
      }
    }
  ]
}
```

**Cross-references**:
- Abstract base: `gts.frontx.v.filter.filter.v1~` owned by `dashboard-viewer` and defined in DESIGN §3.1.
- Related types: Required entity aspect declared in feature-aspect-catalog via the `requires` field.

### 6.12 FilterByLanguage

**GTS ID**: `gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_language.v1~`

**Description**: Narrows entities by language.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_language.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "FilterByLanguage",
  "description": "Language-mode helper.",
  "allOf": [
    { "$ref": "gts://gts.frontx.v.filter.filter.v1~" },
    {
      "type": "object",
      "properties": {
"requires": { "const": "gts.frontx.demo.entity_aspect.has_language.v1~" },
"predicate": { "enum": ["equals", "not_in"] },
"parameter": {
  "type": "object",
  "required": ["mode", "excluded"],
  "properties": {
    "mode": { "type": "string", "enum": ["all", "custom"], "description": "`all` ignores `excluded`; `custom` applies it." },
    "excluded": { "type": "array", "items": { "type": "string" }, "description": "Language names excluded when mode = custom." }
  }
}
      }
    }
  ]
}
```

**Cross-references**:
- Abstract base: `gts.frontx.v.filter.filter.v1~` owned by `dashboard-viewer` and defined in DESIGN §3.1.
- Related types: Required entity aspect declared in feature-aspect-catalog via the `requires` field.

### 6.13 FilterByAssignees

**GTS ID**: `gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_assignees.v1~`

**Description**: Narrows entities by assignee logins.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_assignees.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "FilterByAssignees",
  "description": "Issue-assignee inclusion filter.",
  "allOf": [
    { "$ref": "gts://gts.frontx.v.filter.filter.v1~" },
    {
      "type": "object",
      "properties": {
"requires": { "const": "gts.frontx.demo.entity_aspect.has_assignees.v1~" },
"predicate": { "const": "in" },
"parameter": {
  "type": "object",
  "required": ["include"],
  "properties": {
    "include": { "type": "array", "items": { "type": "string" }, "description": "Assignee logins; matches if at least one is in the entity's assignees array." }
  }
}
      }
    }
  ]
}
```

**Cross-references**:
- Abstract base: `gts.frontx.v.filter.filter.v1~` owned by `dashboard-viewer` and defined in DESIGN §3.1.
- Related types: Required entity aspect declared in feature-aspect-catalog via the `requires` field.

### 6.14 FilterByPrNumbers

**GTS ID**: `gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_pr_numbers.v1~`

**Description**: Narrows entities to a set of PR numbers.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_pr_numbers.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "FilterByPrNumbers",
  "description": "Restricts to specific PR numbers. Requires a PR-numbering aspect — composed by entities carrying `pr_number` (PR itself, plus PR-scoped commits/comments via cross-reference).",
  "allOf": [
    { "$ref": "gts://gts.frontx.v.filter.filter.v1~" },
    {
      "type": "object",
      "properties": {
"requires": { "const": "gts.frontx.demo.entity_aspect.has_repo.v1~" },
"predicate": { "const": "in" },
"parameter": {
  "type": "object",
  "required": ["numbers"],
  "properties": {
    "numbers": { "type": "array", "items": { "type": "integer" }, "description": "PR numbers." }
  }
}
      }
    }
  ]
}
```

**Cross-references**:
- Abstract base: `gts.frontx.v.filter.filter.v1~` owned by `dashboard-viewer` and defined in DESIGN §3.1.
- Related types: Required entity aspect declared in feature-aspect-catalog via the `requires` field.

### 6.15 FilterByIssueNumbers

**GTS ID**: `gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_issue_numbers.v1~`

**Description**: Narrows entities to a set of Issue numbers.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_issue_numbers.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "FilterByIssueNumbers",
  "description": "Restricts to specific issue numbers.",
  "allOf": [
    { "$ref": "gts://gts.frontx.v.filter.filter.v1~" },
    {
      "type": "object",
      "properties": {
"requires": { "const": "gts.frontx.demo.entity_aspect.has_repo.v1~" },
"predicate": { "const": "in" },
"parameter": {
  "type": "object",
  "required": ["numbers"],
  "properties": {
    "numbers": { "type": "array", "items": { "type": "integer" }, "description": "Issue numbers." }
  }
}
      }
    }
  ]
}
```

**Cross-references**:
- Abstract base: `gts.frontx.v.filter.filter.v1~` owned by `dashboard-viewer` and defined in DESIGN §3.1.
- Related types: Required entity aspect declared in feature-aspect-catalog via the `requires` field.

### 6.16 FilterHasPendingReviewers

**GTS ID**: `gts.frontx.v.filter.filter.v1~frontx.demo.filter.has_pending_reviewers.v1~`

**Description**: Narrows PRs by pending-reviewer presence.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.v.filter.filter.v1~frontx.demo.filter.has_pending_reviewers.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "FilterHasPendingReviewers",
  "description": "PR filter on presence of pending requested reviewers.",
  "allOf": [
    { "$ref": "gts://gts.frontx.v.filter.filter.v1~" },
    {
      "type": "object",
      "properties": {
"requires": { "const": "gts.frontx.demo.entity_aspect.has_state.v1~" },
"predicate": { "const": "equals" },
"parameter": {
  "type": "object",
  "required": ["has_pending"],
  "properties": {
    "has_pending": { "type": ["boolean", "null"], "description": "true / false / any (null)." }
  }
}
      }
    }
  ]
}
```

**Cross-references**:
- Abstract base: `gts.frontx.v.filter.filter.v1~` owned by `dashboard-viewer` and defined in DESIGN §3.1.
- Related types: Required entity aspect declared in feature-aspect-catalog via the `requires` field.

### 6.17 FilterHasApprovedReviewers

**GTS ID**: `gts.frontx.v.filter.filter.v1~frontx.demo.filter.has_approved_reviewers.v1~`

**Description**: Narrows PRs by approved-reviewer presence.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.v.filter.filter.v1~frontx.demo.filter.has_approved_reviewers.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "FilterHasApprovedReviewers",
  "description": "PR filter on presence of at least one approved review.",
  "allOf": [
    { "$ref": "gts://gts.frontx.v.filter.filter.v1~" },
    {
      "type": "object",
      "properties": {
"requires": { "const": "gts.frontx.demo.entity_aspect.has_state.v1~" },
"predicate": { "const": "equals" },
"parameter": {
  "type": "object",
  "required": ["has_approved"],
  "properties": {
    "has_approved": { "type": ["boolean", "null"] }
  }
}
      }
    }
  ]
}
```

**Cross-references**:
- Abstract base: `gts.frontx.v.filter.filter.v1~` owned by `dashboard-viewer` and defined in DESIGN §3.1.
- Related types: Required entity aspect declared in feature-aspect-catalog via the `requires` field.

### 6.18 FilterHasUnrepliedComments

**GTS ID**: `gts.frontx.v.filter.filter.v1~frontx.demo.filter.has_unreplied_comments.v1~`

**Description**: Narrows PRs by unreplied-comment presence.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.v.filter.filter.v1~frontx.demo.filter.has_unreplied_comments.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "FilterHasUnrepliedComments",
  "description": "PR filter on presence of unresolved review-thread comments.",
  "allOf": [
    { "$ref": "gts://gts.frontx.v.filter.filter.v1~" },
    {
      "type": "object",
      "properties": {
"requires": { "const": "gts.frontx.demo.entity_aspect.has_state.v1~" },
"predicate": { "const": "equals" },
"parameter": {
  "type": "object",
  "required": ["has_unreplied"],
  "properties": {
    "has_unreplied": { "type": ["boolean", "null"] }
  }
}
      }
    }
  ]
}
```

**Cross-references**:
- Abstract base: `gts.frontx.v.filter.filter.v1~` owned by `dashboard-viewer` and defined in DESIGN §3.1.
- Related types: Required entity aspect declared in feature-aspect-catalog via the `requires` field.

### 6.19 FilterByLocChangedRange

**GTS ID**: `gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_loc_changed_range.v1~`

**Description**: Narrows PRs by LOC bounds.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_loc_changed_range.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "FilterByLocChangedRange",
  "description": "PR LOC-bound filter (additions + deletions).",
  "allOf": [
    { "$ref": "gts://gts.frontx.v.filter.filter.v1~" },
    {
      "type": "object",
      "properties": {
"requires": { "const": "gts.frontx.demo.entity_aspect.has_state.v1~" },
"predicate": { "const": "range" },
"parameter": {
  "type": "object",
  "required": ["min", "max"],
  "properties": {
    "min": { "type": ["integer", "null"], "description": "Minimum additions + deletions; null disables." },
    "max": { "type": ["integer", "null"], "description": "Maximum additions + deletions; null disables." }
  }
}
      }
    }
  ]
}
```

**Cross-references**:
- Abstract base: `gts.frontx.v.filter.filter.v1~` owned by `dashboard-viewer` and defined in DESIGN §3.1.
- Related types: Required entity aspect declared in feature-aspect-catalog via the `requires` field.

### 6.20 FilterByMessageContains

**GTS ID**: `gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_message_contains.v1~`

**Description**: Narrows commits by message substring.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_message_contains.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "FilterByMessageContains",
  "description": "Commit-message substring match.",
  "allOf": [
    { "$ref": "gts://gts.frontx.v.filter.filter.v1~" },
    {
      "type": "object",
      "properties": {
"requires": { "const": "gts.frontx.demo.entity_aspect.has_committed_at.v1~" },
"predicate": { "const": "contains" },
"parameter": {
  "type": "object",
  "required": ["substring"],
  "properties": {
    "substring": { "type": "string", "description": "Substring to match in commit message (first line)." }
  }
}
      }
    }
  ]
}
```

**Cross-references**:
- Abstract base: `gts.frontx.v.filter.filter.v1~` owned by `dashboard-viewer` and defined in DESIGN §3.1.
- Related types: Required entity aspect declared in feature-aspect-catalog via the `requires` field.

### 6.21 FilterByCommentSource

**GTS ID**: `gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_comment_source.v1~`

**Description**: Toggles inclusion of review-thread vs PR comments.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_comment_source.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "FilterByCommentSource",
  "description": "PR-comment source toggle.",
  "allOf": [
    { "$ref": "gts://gts.frontx.v.filter.filter.v1~" },
    {
      "type": "object",
      "properties": {
"requires": { "const": "gts.frontx.demo.entity_aspect.has_author.v1~" },
"predicate": { "const": "equals" },
"parameter": {
  "type": "object",
  "required": ["include_review_thread_comments", "include_pr_comments"],
  "properties": {
    "include_review_thread_comments": { "type": "boolean" },
    "include_pr_comments": { "type": "boolean" }
  }
}
      }
    }
  ]
}
```

**Cross-references**:
- Abstract base: `gts.frontx.v.filter.filter.v1~` owned by `dashboard-viewer` and defined in DESIGN §3.1.
- Related types: Required entity aspect declared in feature-aspect-catalog via the `requires` field.

### 6.22 FilterUnrepliedOnly

**GTS ID**: `gts.frontx.v.filter.filter.v1~frontx.demo.filter.unreplied_only.v1~`

**Description**: Restricts comments to unreplied.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.v.filter.filter.v1~frontx.demo.filter.unreplied_only.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "FilterUnrepliedOnly",
  "description": "Restricts comments to those without a reply.",
  "allOf": [
    { "$ref": "gts://gts.frontx.v.filter.filter.v1~" },
    {
      "type": "object",
      "properties": {
"requires": { "const": "gts.frontx.demo.entity_aspect.has_author.v1~" },
"predicate": { "const": "equals" },
"parameter": {
  "type": "object",
  "required": ["unreplied_only"],
  "properties": {
    "unreplied_only": { "type": ["boolean", "null"] }
  }
}
      }
    }
  ]
}
```

**Cross-references**:
- Abstract base: `gts.frontx.v.filter.filter.v1~` owned by `dashboard-viewer` and defined in DESIGN §3.1.
- Related types: Required entity aspect declared in feature-aspect-catalog via the `requires` field.

### 6.23 FilterImportantBotsOnly

**GTS ID**: `gts.frontx.v.filter.filter.v1~frontx.demo.filter.important_bots_only.v1~`

**Description**: Restricts comments to critical-bot authors.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.v.filter.filter.v1~frontx.demo.filter.important_bots_only.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "FilterImportantBotsOnly",
  "description": "Restricts comments to bot authors classified as critical (`CommentFocus.critical_bot`).",
  "allOf": [
    { "$ref": "gts://gts.frontx.v.filter.filter.v1~" },
    {
      "type": "object",
      "properties": {
"requires": { "const": "gts.frontx.demo.entity_aspect.has_author.v1~" },
"predicate": { "const": "equals" },
"parameter": {
  "type": "object",
  "required": ["important_bots_only"],
  "properties": {
    "important_bots_only": { "type": "boolean" }
  }
}
      }
    }
  ]
}
```

**Cross-references**:
- Abstract base: `gts.frontx.v.filter.filter.v1~` owned by `dashboard-viewer` and defined in DESIGN §3.1.
- Related types: Required entity aspect declared in feature-aspect-catalog via the `requires` field.

### 6.24 FilterByMinPoints

**GTS ID**: `gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_min_points.v1~`

**Description**: Filters contributors by min-points threshold.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_min_points.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "FilterByMinPoints",
  "description": "Contributor min-points threshold compared against the pre-computed scoring output stored on the contributor entity via the has_score aspect composition.",
  "allOf": [
    { "$ref": "gts://gts.frontx.v.filter.filter.v1~" },
    {
      "type": "object",
      "properties": {
"requires": { "const": "gts.frontx.demo.entity_aspect.has_author.v1~" },
"predicate": { "const": "range" },
"parameter": {
  "type": "object",
  "required": ["min_points"],
  "properties": {
    "min_points": { "type": ["number", "null"] }
  }
}
      }
    }
  ]
}
```

**Cross-references**:
- Abstract base: `gts.frontx.v.filter.filter.v1~` owned by `dashboard-viewer` and defined in DESIGN §3.1.
- Related types: Required entity aspect declared in feature-aspect-catalog via the `requires` field.

### 6.25 FilterByMinPrsMerged

**GTS ID**: `gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_min_prs_merged.v1~`

**Description**: Filters contributors by min-PRs-merged threshold.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_min_prs_merged.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "FilterByMinPrsMerged",
  "description": "Contributor min-merged-PR-count threshold.",
  "allOf": [
    { "$ref": "gts://gts.frontx.v.filter.filter.v1~" },
    {
      "type": "object",
      "properties": {
"requires": { "const": "gts.frontx.demo.entity_aspect.has_author.v1~" },
"predicate": { "const": "range" },
"parameter": {
  "type": "object",
  "required": ["min_prs_merged"],
  "properties": {
    "min_prs_merged": { "type": ["integer", "null"] }
  }
}
      }
    }
  ]
}
```

**Cross-references**:
- Abstract base: `gts.frontx.v.filter.filter.v1~` owned by `dashboard-viewer` and defined in DESIGN §3.1.
- Related types: Required entity aspect declared in feature-aspect-catalog via the `requires` field.

### 6.26 FilterByScoreThreshold

**GTS ID**: `gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_score_threshold.v1~`

**Description**: Filters by pre-computed score range.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_score_threshold.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "FilterByScoreThreshold",
  "description": "Score-threshold range filter requiring `has_score`. Operates on the pre-computed `score` field on any entity composing the `has_score` aspect (typically the contributor entity authored in the derived catalog).",
  "allOf": [
    { "$ref": "gts://gts.frontx.v.filter.filter.v1~" },
    {
      "type": "object",
      "properties": {
"requires": { "const": "gts.frontx.demo.entity_aspect.has_score.v1~" },
"predicate": { "const": "range" },
"parameter": {
  "type": "object",
  "required": ["from", "until"],
  "properties": {
    "from": { "type": ["number", "null"], "description": "Inclusive lower bound; null means no lower bound." },
    "until": { "type": ["number", "null"], "description": "Inclusive upper bound; null means no upper bound." }
  }
}
      }
    }
  ]
}
```

**Cross-references**:
- Abstract base: `gts.frontx.v.filter.filter.v1~` owned by `dashboard-viewer` and defined in DESIGN §3.1.
- Related types: Required entity aspect declared in feature-aspect-catalog via the `requires` field.

### 6.27 FilterByLabels

**GTS ID**: `gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_labels.v1~`

**Description**: Filters issues by label include/exclude.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_labels.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "FilterByLabels",
  "description": "Issue label include/exclude.",
  "allOf": [
    { "$ref": "gts://gts.frontx.v.filter.filter.v1~" },
    {
      "type": "object",
      "properties": {
"requires": { "const": "gts.frontx.demo.entity_aspect.has_state.v1~" },
"predicate": { "enum": ["in", "not_in"] },
"parameter": {
  "type": "object",
  "required": ["include", "exclude"],
  "properties": {
    "include": { "type": ["array", "null"], "items": { "type": "string" } },
    "exclude": { "type": ["array", "null"], "items": { "type": "string" } }
  }
}
      }
    }
  ]
}
```

**Cross-references**:
- Abstract base: `gts.frontx.v.filter.filter.v1~` owned by `dashboard-viewer` and defined in DESIGN §3.1.
- Related types: Required entity aspect declared in feature-aspect-catalog via the `requires` field.

### 6.28 FilterByProjects

**GTS ID**: `gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_projects.v1~`

**Description**: Filters issues by project board.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_projects.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "FilterByProjects",
  "description": "Issue project-board inclusion.",
  "allOf": [
    { "$ref": "gts://gts.frontx.v.filter.filter.v1~" },
    {
      "type": "object",
      "properties": {
"requires": { "const": "gts.frontx.demo.entity_aspect.has_state.v1~" },
"predicate": { "const": "in" },
"parameter": {
  "type": "object",
  "required": ["include"],
  "properties": {
    "include": { "type": "array", "items": { "type": "string" } }
  }
}
      }
    }
  ]
}
```

**Cross-references**:
- Abstract base: `gts.frontx.v.filter.filter.v1~` owned by `dashboard-viewer` and defined in DESIGN §3.1.
- Related types: Required entity aspect declared in feature-aspect-catalog via the `requires` field.

### 6.29 FilterByMilestones

**GTS ID**: `gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_milestones.v1~`

**Description**: Filters issues by milestone.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_milestones.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "FilterByMilestones",
  "description": "Issue milestone inclusion.",
  "allOf": [
    { "$ref": "gts://gts.frontx.v.filter.filter.v1~" },
    {
      "type": "object",
      "properties": {
"requires": { "const": "gts.frontx.demo.entity_aspect.has_state.v1~" },
"predicate": { "const": "in" },
"parameter": {
  "type": "object",
  "required": ["include"],
  "properties": {
    "include": { "type": "array", "items": { "type": "string" } }
  }
}
      }
    }
  ]
}
```

**Cross-references**:
- Abstract base: `gts.frontx.v.filter.filter.v1~` owned by `dashboard-viewer` and defined in DESIGN §3.1.
- Related types: Required entity aspect declared in feature-aspect-catalog via the `requires` field.

### 6.30 FilterByIssueTypes

**GTS ID**: `gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_issue_types.v1~`

**Description**: Filters issues by GitHub issue type.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_issue_types.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "FilterByIssueTypes",
  "description": "Issue type inclusion (`Task`, `Bug`, ...).",
  "allOf": [
    { "$ref": "gts://gts.frontx.v.filter.filter.v1~" },
    {
      "type": "object",
      "properties": {
"requires": { "const": "gts.frontx.demo.entity_aspect.has_state.v1~" },
"predicate": { "const": "in" },
"parameter": {
  "type": "object",
  "required": ["include"],
  "properties": {
    "include": { "type": "array", "items": { "type": "string" } }
  }
}
      }
    }
  ]
}
```

**Cross-references**:
- Abstract base: `gts.frontx.v.filter.filter.v1~` owned by `dashboard-viewer` and defined in DESIGN §3.1.
- Related types: Required entity aspect declared in feature-aspect-catalog via the `requires` field.

### 6.31 FilterByTimeFieldSelector

**GTS ID**: `gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_time_field_selector.v1~`

**Description**: Selects which timestamp the active date filter targets.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_time_field_selector.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "FilterByTimeFieldSelector",
  "description": "Selects which timestamp on the source entity the active date filter targets (`created`, `updated`, `merged`, `closed`, `report`, `any`). Routing concern, not entity narrowing — Worker uses this to dispatch the active date range to the correct date-range filter concrete.",
  "allOf": [
    { "$ref": "gts://gts.frontx.v.filter.filter.v1~" },
    {
      "type": "object",
      "properties": {
"requires": { "const": "gts.frontx.demo.entity_aspect.has_created_at.v1~" },
"predicate": { "const": "equals" },
"parameter": {
  "type": "object",
  "required": ["time_field"],
  "properties": {
    "time_field": { "type": "string", "enum": ["report", "created", "updated", "merged", "closed", "any"] }
  }
}
      }
    }
  ]
}
```

**Cross-references**:
- Abstract base: `gts.frontx.v.filter.filter.v1~` owned by `dashboard-viewer` and defined in DESIGN §3.1.
- Related types: Required entity aspect declared in feature-aspect-catalog via the `requires` field.


## 7. Acceptance Criteria

- [ ] All 31 concrete filters (`by_author` through the last entry) are declared in section 6.
- [ ] Every `requires` value resolves to an aspect in `feature-aspect-catalog`.
- [ ] Every type in section 6 passes GTS identifier grammar validation and uses the `gts.frontx.demo.*` or `gts.frontx.v.filter.*` namespace; no `gts.de.*` identifier remains.
- [ ] Every `$ref` and `x-gts-ref` target resolves inside the catalog or to a base owned by another package.
- [ ] `cfs validate --artifact` passes for this file.

## 8. Open Questions

- No port-level questions. The port is rename-only: concrete filter ids moved to `gts.frontx.v.filter.filter.v1~frontx.demo.filter.<name>.v1~` and aspect references to `gts.frontx.demo.entity_aspect.*`. The prototype's "Subsumes PoC ..." sentences were dropped from descriptions, and the base entry (6.0) was removed because the base is defined in DESIGN section 3.1.

- **Inherited from the prototype**: `FilterByPrNumbers` and `FilterByIssueNumbers` require `has_repo` rather than an aspect that carries the filtered number, so applicability depends on repository presence.
