# Feature: Entity Aspect Catalog


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
  - [6.1 EntityAspectHasAuthor](#61-entityaspecthasauthor)
  - [6.2 EntityAspectHasTeam](#62-entityaspecthasteam)
  - [6.3 EntityAspectHasRepo](#63-entityaspecthasrepo)
  - [6.4 EntityAspectHasCreatedAt](#64-entityaspecthascreatedat)
  - [6.5 EntityAspectHasUpdatedAt](#65-entityaspecthasupdatedat)
  - [6.6 EntityAspectHasClosedAt](#66-entityaspecthasclosedat)
  - [6.7 EntityAspectHasMergedAt](#67-entityaspecthasmergedat)
  - [6.8 EntityAspectHasCommittedAt](#68-entityaspecthascommittedat)
  - [6.9 EntityAspectHasTitle](#69-entityaspecthastitle)
  - [6.10 EntityAspectHasState](#610-entityaspecthasstate)
  - [6.11 EntityAspectHasWipSignal](#611-entityaspecthaswipsignal)
  - [6.12 EntityAspectHasAssignees](#612-entityaspecthasassignees)
  - [6.13 EntityAspectHasLanguage](#613-entityaspecthaslanguage)
  - [6.14 EntityAspectHasScore](#614-entityaspecthasscore)
  - [6.15 EntityAspectHasCommentFocus](#615-entityaspecthascommentfocus)
  - [6.16 EntityAspectHasCodePath](#616-entityaspecthascodepath)
  - [6.17 EntityAspectHasDerivedMergeStatus](#617-entityaspecthasderivedmergestatus)
- [7. Acceptance Criteria](#7-acceptance-criteria)
- [8. Open Questions](#8-open-questions)

<!-- /toc -->

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-featstatus-aspect-catalog`
## 1. Feature Context

- [ ] `p2` - `cpt-frontx-dashboard-feature-aspect-catalog`

### 1.1 Overview

This is a **type-catalog feature**, not an actor-flow feature. It lists the 17 entity aspects of the `dashboard-demo` package: leaf-level partial schemas that entities compose through `allOf`. The standard actor-flow, process, and state sections are reduced to stubs; the content lives in section 6.

### 1.2 Purpose

Concrete catalog of the entity aspects the demo content declares. A filter declares one aspect in `requires`, and an entity collection is filterable when its entity type composes that aspect (DESIGN section 3.1, Filter base). Derived and denormalized fields (team, display name, merge status, language, code path, comment focus, score) are produced by the consuming backend in deployments; the demo fixtures carry them precomputed (ADR-0009, `cpt-frontx-dashboard-adr-derived-analytics-producer`).

**Requirements**: `cpt-frontx-dashboard-fr-type-catalog`

**Principles**: `cpt-frontx-dashboard-principle-gts-contracts`

### 1.3 Actors

N/A - type-catalog feature. The catalog is consumed by the runtime type system (Viewer host, Data Query Worker, widget MFEs) and by the demo fixtures, not by an end-user actor flow. No actor flows are authored.

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md) (section 3.1 Domain Model)
- **Dependencies**: None - aspects are leaf-level partial schemas; entities (`feature-entity-catalog`) and filters (`feature-filter-catalog`) reference them.

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

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-dod-aspect-catalog-catalog-complete`

The system **MUST** ship every type listed in section 6 in the `dashboard-demo` package (`templateExample: true`), registered through that package's `mfe.json` `schemas`.

- All 17 aspects in section 6 are authored.
- Every aspect is a flat, single-segment chain with no abstract base.
- Every aspect passes GTS identifier grammar validation.

## 6. Type Catalog

All identifiers end in `~` (types) and use `v1`. The package `dashboard-demo` declares this catalog; the base types it extends are owned by other packages as noted in each entry.

### 6.1 EntityAspectHasAuthor

**GTS ID**: `gts.frontx.demo.entity_aspect.has_author.v1~`

**Description**: Entity aspect declaring `{author_login, author_display_name}` — denormalized author identification carried by every entity with an author concept. Composed by PR, Commit, Issue, Review, Comment.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.demo.entity_aspect.has_author.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "EntityAspectHasAuthor",
  "description": "Entity aspect declaring that the entity carries denormalized author identification (`author_login` = GitHub login; `author_display_name` = resolved human-readable name from the admin-managed user mapping, populated at normalization time, falling back to `author_login` when no mapping exists). Composed by PR, Commit, Issue, Review, Comment.",
  "type": "object",
  "required": ["author_login", "author_display_name"],
  "properties": {
    "author_login": { "type": "string", "description": "GitHub login of the actor." },
    "author_display_name": { "type": "string", "description": "Resolved human-readable name of the actor. Populated at normalization time; falls back to `author_login` when no mapping exists." }
  }
}
```

**Cross-references**:
- No abstract base (flat single-segment chain).
- Related types: Filter concretes that declare this aspect as `requires` (in feature-filter-catalog).

### 6.2 EntityAspectHasTeam

**GTS ID**: `gts.frontx.demo.entity_aspect.has_team.v1~`

**Description**: Entity aspect declaring denormalized author-team metadata (`author_team_name`, `author_team_color`). Resolved at normalization time via author lookup against the admin-managed user-team mapping and team palette.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.demo.entity_aspect.has_team.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "EntityAspectHasTeam",
  "description": "Entity aspect declaring denormalized author-team metadata (`author_team_name` = admin-configured team name; `author_team_color` = admin-configured team color hex). Both populated at normalization time via author lookup against the admin-managed user-team mapping and team palette; null when the author is not assigned to any team or the team has no color set. Filterable via `gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_team.v1~`.",
  "type": "object",
  "required": ["author_team_name", "author_team_color"],
  "properties": {
    "author_team_name": { "type": ["string", "null"], "description": "Author's team name; null when the author is not assigned to any team." },
    "author_team_color": { "type": ["string", "null"], "description": "Author's team color (hex); null when no team or team has no color set." }
  }
}
```

**Cross-references**:
- No abstract base (flat single-segment chain).
- Related types: Filter concretes that declare this aspect as `requires` (in feature-filter-catalog).

### 6.3 EntityAspectHasRepo

**GTS ID**: `gts.frontx.demo.entity_aspect.has_repo.v1~`

**Description**: Entity aspect declaring `{repo}` — repository slug `<owner>/<name>`. Composed by PR, Commit, Issue.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.demo.entity_aspect.has_repo.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "EntityAspectHasRepo",
  "description": "Entity aspect declaring that the entity carries a `repo` field (repository slug `<owner>/<name>`). Composed by PR, Commit, Issue.",
  "type": "object",
  "required": ["repo"],
  "properties": {
    "repo": { "type": "string", "description": "Repository slug `<owner>/<name>`." }
  }
}
```

**Cross-references**:
- No abstract base (flat single-segment chain).
- Related types: Filter concretes that declare this aspect as `requires` (in feature-filter-catalog).

### 6.4 EntityAspectHasCreatedAt

**GTS ID**: `gts.frontx.demo.entity_aspect.has_created_at.v1~`

**Description**: Entity aspect declaring an ISO-8601 creation timestamp.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.demo.entity_aspect.has_created_at.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "EntityAspectHasCreatedAt",
  "description": "Entity aspect declaring an ISO-8601 creation timestamp.",
  "type": "object",
  "required": ["created_at"],
  "properties": {
    "created_at": { "type": "string", "format": "date-time", "description": "Creation timestamp (ISO-8601 date-time)." }
  }
}
```

**Cross-references**:
- No abstract base (flat single-segment chain).
- Related types: Filter concretes that declare this aspect as `requires` (in feature-filter-catalog).

### 6.5 EntityAspectHasUpdatedAt

**GTS ID**: `gts.frontx.demo.entity_aspect.has_updated_at.v1~`

**Description**: Entity aspect declaring an ISO-8601 last-update timestamp; nullable for entities never updated.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.demo.entity_aspect.has_updated_at.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "EntityAspectHasUpdatedAt",
  "description": "Entity aspect declaring an ISO-8601 last-update timestamp; nullable for entities never updated since creation.",
  "type": "object",
  "required": ["updated_at"],
  "properties": {
    "updated_at": { "type": ["string", "null"], "format": "date-time", "description": "Last-update timestamp; null when never updated." }
  }
}
```

**Cross-references**:
- No abstract base (flat single-segment chain).
- Related types: Filter concretes that declare this aspect as `requires` (in feature-filter-catalog).

### 6.6 EntityAspectHasClosedAt

**GTS ID**: `gts.frontx.demo.entity_aspect.has_closed_at.v1~`

**Description**: Entity aspect declaring an ISO-8601 close timestamp; nullable for still-open entities.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.demo.entity_aspect.has_closed_at.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "EntityAspectHasClosedAt",
  "description": "Entity aspect declaring an ISO-8601 close timestamp; nullable for still-open entities.",
  "type": "object",
  "required": ["closed_at"],
  "properties": {
    "closed_at": { "type": ["string", "null"], "format": "date-time", "description": "Close timestamp; null while open." }
  }
}
```

**Cross-references**:
- No abstract base (flat single-segment chain).
- Related types: Filter concretes that declare this aspect as `requires` (in feature-filter-catalog).

### 6.7 EntityAspectHasMergedAt

**GTS ID**: `gts.frontx.demo.entity_aspect.has_merged_at.v1~`

**Description**: Entity aspect declaring an ISO-8601 merge timestamp; PR-specific. Nullable until merged.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.demo.entity_aspect.has_merged_at.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "EntityAspectHasMergedAt",
  "description": "Entity aspect declaring an ISO-8601 merge timestamp; nullable until merged. PR-specific.",
  "type": "object",
  "required": ["merged_at"],
  "properties": {
    "merged_at": { "type": ["string", "null"], "format": "date-time", "description": "Merge timestamp; null until merged." }
  }
}
```

**Cross-references**:
- No abstract base (flat single-segment chain).
- Related types: Filter concretes that declare this aspect as `requires` (in feature-filter-catalog).

### 6.8 EntityAspectHasCommittedAt

**GTS ID**: `gts.frontx.demo.entity_aspect.has_committed_at.v1~`

**Description**: Entity aspect declaring an ISO-8601 commit timestamp. Commit-specific.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.demo.entity_aspect.has_committed_at.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "EntityAspectHasCommittedAt",
  "description": "Entity aspect declaring an ISO-8601 commit timestamp. Commit-specific.",
  "type": "object",
  "required": ["committed_at"],
  "properties": {
    "committed_at": { "type": "string", "format": "date-time", "description": "Commit timestamp." }
  }
}
```

**Cross-references**:
- No abstract base (flat single-segment chain).
- Related types: Filter concretes that declare this aspect as `requires` (in feature-filter-catalog).

### 6.9 EntityAspectHasTitle

**GTS ID**: `gts.frontx.demo.entity_aspect.has_title.v1~`

**Description**: Entity aspect declaring a `title` text field.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.demo.entity_aspect.has_title.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "EntityAspectHasTitle",
  "description": "Entity aspect declaring a `title` text field.",
  "type": "object",
  "required": ["title"],
  "properties": {
    "title": { "type": "string", "description": "Display title." }
  }
}
```

**Cross-references**:
- No abstract base (flat single-segment chain).
- Related types: Filter concretes that declare this aspect as `requires` (in feature-filter-catalog).

### 6.10 EntityAspectHasState

**GTS ID**: `gts.frontx.demo.entity_aspect.has_state.v1~`

**Description**: Entity aspect declaring a lifecycle `state` field as a free-form string. Per-entity enum constraints live in the entity's final allOf branch.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.demo.entity_aspect.has_state.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "EntityAspectHasState",
  "description": "Entity aspect declaring a lifecycle `state` field as a free-form string. Per-entity enum constraints (PR: OPEN/MERGED/CLOSED; Issue: OPEN/CLOSED; Review: APPROVED/CHANGES_REQUESTED/COMMENTED/DISMISSED/PENDING) live in the entity's final `allOf` branch — the aspect's contract is broader to admit cross-entity reuse.",
  "type": "object",
  "required": ["state"],
  "properties": {
    "state": { "type": "string", "description": "Lifecycle state (entity-specific enum constrained at entity level)." }
  }
}
```

**Cross-references**:
- No abstract base (flat single-segment chain).
- Related types: Filter concretes that declare this aspect as `requires` (in feature-filter-catalog).

### 6.11 EntityAspectHasWipSignal

**GTS ID**: `gts.frontx.demo.entity_aspect.has_wip_signal.v1~`

**Description**: Entity aspect declaring a PR-style WIP / draft indicator.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.demo.entity_aspect.has_wip_signal.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "EntityAspectHasWipSignal",
  "description": "Entity aspect declaring a PR-style WIP / draft indicator.",
  "type": "object",
  "required": ["is_draft"],
  "properties": {
    "is_draft": { "type": "boolean", "description": "Whether the entity is in draft / WIP state." }
  }
}
```

**Cross-references**:
- No abstract base (flat single-segment chain).
- Related types: Filter concretes that declare this aspect as `requires` (in feature-filter-catalog).

### 6.12 EntityAspectHasAssignees

**GTS ID**: `gts.frontx.demo.entity_aspect.has_assignees.v1~`

**Description**: Entity aspect declaring an array of assignee logins. Issue-specific in v1.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.demo.entity_aspect.has_assignees.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "EntityAspectHasAssignees",
  "description": "Entity aspect declaring an array of assignee logins. Issue-specific in v1.",
  "type": "object",
  "required": ["assignees"],
  "properties": {
    "assignees": { "type": "array", "items": { "type": "string" }, "description": "Assignee logins." }
  }
}
```

**Cross-references**:
- No abstract base (flat single-segment chain).
- Related types: Filter concretes that declare this aspect as `requires` (in feature-filter-catalog).

### 6.13 EntityAspectHasLanguage

**GTS ID**: `gts.frontx.demo.entity_aspect.has_language.v1~`

**Description**: Entity aspect declaring `{language, code}` — programming-language classification pre-computed at normalization. Carrier in v1 is the CommitFile sub-record on Commit.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.demo.entity_aspect.has_language.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "EntityAspectHasLanguage",
  "description": "Entity aspect declaring `{language, code}` — programming-language classification pre-computed at normalization time. Carrier in v1 is the `CommitFile` sub-record on `Commit` (per-file granularity); aggregated forms (per-commit primary language, per-PR language split) are emitted by Query pipelines using this aspect's per-file values. Configuration of the language-mapping table lives in normalization-pipeline code (out of scope for this DESIGN).",
  "type": "object",
  "required": ["language", "code"],
  "properties": {
    "language": { "type": "string", "description": "Resolved language name (e.g. `TypeScript`, `Python`)." },
    "code": { "type": "boolean", "description": "True iff the language is classified as 'code' (vs documentation/binary/data)." }
  }
}
```

**Cross-references**:
- No abstract base (flat single-segment chain).
- Related types: Filter concretes that declare this aspect as `requires` (in feature-filter-catalog).

### 6.14 EntityAspectHasScore

**GTS ID**: `gts.frontx.demo.entity_aspect.has_score.v1~`

**Description**: Entity aspect declaring `{score}` — a numeric activity / weight value pre-computed at normalization. Carrier in v1 is the contributor entity (out-of-design).

**Schema**:

```json
{
  "$id": "gts://gts.frontx.demo.entity_aspect.has_score.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "EntityAspectHasScore",
  "description": "Entity aspect declaring `{score}` — a numeric activity / weight value pre-computed at normalization time using the admin-managed scoring configuration. Carrier in v1 is the contributor entity (authored in the derived catalog) and any other scored entity that opts into per-instance scoring. The configuration of weights and thresholds lives in normalization-pipeline code (out of scope for this DESIGN); the viewer reads only the pre-computed `score` field.",
  "type": "object",
  "required": ["score"],
  "properties": {
    "score": { "type": "number", "description": "Pre-computed activity / weight score (typically non-negative; semantic range determined by the normalization-time scoring configuration)." }
  }
}
```

**Cross-references**:
- No abstract base (flat single-segment chain).
- Related types: Filter concretes that declare this aspect as `requires` (in feature-filter-catalog).

### 6.15 EntityAspectHasCommentFocus

**GTS ID**: `gts.frontx.demo.entity_aspect.has_comment_focus.v1~`

**Description**: Entity aspect declaring `{comment_focus}` — semantic classification of comment authorship pre-computed at normalization time. Values: `human` (human contributor), `bot_critical` (bot whose login matches admin-managed bot-keyword rules flagged critical, e.g. CI-failure bots), `bot_other` (any other bot). Carrier in v1 is the comment entity hierarchy (`comment`, `pr_comment`, `thread_comment`). Bot-keyword rules and critical-flag mapping live in normalization-pipeline code (out of scope for this DESIGN); the viewer reads only the pre-computed field.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.demo.entity_aspect.has_comment_focus.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "EntityAspectHasCommentFocus",
  "description": "Entity aspect declaring `{comment_focus}` — semantic classification of comment authorship pre-computed at normalization time. Values: `human` (human contributor), `bot_critical` (bot whose login matches admin-managed bot-keyword rules flagged critical, e.g. CI-failure bots), `bot_other` (any other bot). Carrier in v1 is the comment entity hierarchy (`comment`, `pr_comment`, `thread_comment`). Bot-keyword rules and critical-flag mapping live in normalization-pipeline code (out of scope for this DESIGN); the viewer reads only the pre-computed field.",
  "type": "object",
  "required": ["comment_focus"],
  "properties": {
    "comment_focus": {
      "type": "string",
      "enum": ["human", "bot_critical", "bot_other"],
      "description": "Pre-computed comment-focus classification."
    }
  }
}
```

**Cross-references**:
- No abstract base (flat single-segment chain).
- Related types: Filter concretes that declare this aspect as `requires` (in feature-filter-catalog).

### 6.16 EntityAspectHasCodePath

**GTS ID**: `gts.frontx.demo.entity_aspect.has_code_path.v1~`

**Description**: Entity aspect declaring `{code_path}` — a resolved code-path label pre-computed at normalization time by matching the source file path against admin-managed code-path glob patterns. The matched label (e.g. `frontend`, `backend`, `tests`, `docs`) is stored as `code_path`; files matching no pattern receive an implementation-defined fallback label. Carrier in v1 is `CommitFile` on `Commit`. Code-path patterns live in normalization-pipeline code (out of scope for this DESIGN); the viewer reads only the pre-computed field.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.demo.entity_aspect.has_code_path.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "EntityAspectHasCodePath",
  "description": "Entity aspect declaring `{code_path}` — a resolved code-path label pre-computed at normalization time by matching the source file path against admin-managed code-path glob patterns. The matched label (e.g. `frontend`, `backend`, `tests`, `docs`) is stored as `code_path`; files matching no pattern receive an implementation-defined fallback label. Carrier in v1 is `CommitFile` on `Commit`. Code-path patterns live in normalization-pipeline code (out of scope for this DESIGN); the viewer reads only the pre-computed field.",
  "type": "object",
  "required": ["code_path"],
  "properties": {
    "code_path": {
      "type": "string",
      "description": "Resolved code-path label matched at normalization time."
    }
  }
}
```

**Cross-references**:
- No abstract base (flat single-segment chain).
- Related types: Filter concretes that declare this aspect as `requires` (in feature-filter-catalog).

### 6.17 EntityAspectHasDerivedMergeStatus

**GTS ID**: `gts.frontx.demo.entity_aspect.has_derived_merge_status.v1~`

**Description**: Entity aspect declaring `{derived_merge_status}` — a single semantic merge-status label pre-computed at normalization time by combining raw GitHub PR fields (`state`, `draft`, `mergeable`, `merged_at`) into: `READY` (open, non-draft, mergeable), `IN_REVIEW` (open, non-draft, awaiting review), `CONFLICT` (open, non-draft, has merge conflicts), `DRAFT` (open, draft), `MERGED` (closed and merged), `CLOSED` (closed without merge). Carrier in v1 is `pull_request`. The combination rule lives in normalization-pipeline code (out of scope for this DESIGN); the viewer reads only the pre-computed field.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.demo.entity_aspect.has_derived_merge_status.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "EntityAspectHasDerivedMergeStatus",
  "description": "Entity aspect declaring `{derived_merge_status}` — a single semantic merge-status label pre-computed at normalization time by combining raw GitHub PR fields (`state`, `draft`, `mergeable`, `merged_at`) into: `READY` (open, non-draft, mergeable), `IN_REVIEW` (open, non-draft, awaiting review), `CONFLICT` (open, non-draft, has merge conflicts), `DRAFT` (open, draft), `MERGED` (closed and merged), `CLOSED` (closed without merge). Carrier in v1 is `pull_request`. The combination rule lives in normalization-pipeline code (out of scope for this DESIGN); the viewer reads only the pre-computed field.",
  "type": "object",
  "required": ["derived_merge_status"],
  "properties": {
    "derived_merge_status": {
      "type": "string",
      "enum": ["READY", "IN_REVIEW", "CONFLICT", "DRAFT", "MERGED", "CLOSED"],
      "description": "Pre-computed semantic merge-status label."
    }
  }
}
```

**Cross-references**:
- No abstract base (flat single-segment chain).
- Related types: Filter concretes that declare this aspect as `requires` (in feature-filter-catalog).


## 7. Acceptance Criteria

- [ ] All 17 aspects (`has_author` through `has_derived_merge_status`) are declared in section 6.
- [ ] Every type in section 6 passes GTS identifier grammar validation and uses the `gts.frontx.demo.*` or `gts.frontx.v.filter.*` namespace; no `gts.de.*` identifier remains.
- [ ] Every `$ref` and `x-gts-ref` target resolves inside the catalog or to a base owned by another package.
- [ ] `cfs validate --artifact` passes for this file.

## 8. Open Questions

- None. The port is rename-only: `gts.de.m.entity_aspect.*` became `gts.frontx.demo.entity_aspect.*`. The prototype's PRD requirement-coverage cross-references were dropped because FrontX PRD has no matching requirements.
- **Inherited from the prototype**: `has_comment_focus` names the comment hierarchy as carrier but no comment schema composes it (see the entity catalog open question).
