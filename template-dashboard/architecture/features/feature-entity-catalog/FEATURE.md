# Feature: Entity Catalog


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
  - [6.1 User](#61-user)
  - [6.2 PullRequest](#62-pullrequest)
  - [6.3 Commit](#63-commit)
  - [6.4 Issue](#64-issue)
  - [6.5 Review](#65-review)
  - [6.6 Comment](#66-comment)
  - [6.7 PrComment](#67-prcomment)
  - [6.8 ThreadComment](#68-threadcomment)
  - [6.9 CommitFile (sub-record)](#69-commitfile-sub-record)
  - [6.10 CIStatus (sub-record)](#610-cistatus-sub-record)
  - [6.11 CICheck (sub-record)](#611-cicheck-sub-record)
  - [6.12 ReviewThread (sub-record)](#612-reviewthread-sub-record)
  - [6.13 CodeContextMeta (sub-record)](#613-codecontextmeta-sub-record)
- [7. Acceptance Criteria](#7-acceptance-criteria)
- [8. Open Questions](#8-open-questions)

<!-- /toc -->

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-featstatus-entity-catalog`
## 1. Feature Context

- [ ] `p2` - `cpt-frontx-dashboard-feature-entity-catalog`

### 1.1 Overview

This is a **type-catalog feature**, not an actor-flow feature. It declares the demo GitHub entity catalog of the `dashboard-demo` package: 8 entities (`User`, `PullRequest`, `Commit`, `Issue`, `Review`, `Comment`, `PrComment`, `ThreadComment`) and their sub-records (`CommitFile`, `CIStatus`, `CICheck`, plus `ReviewThread` and `CodeContextMeta` that the PullRequest schema references). The prototype feature only indexed the entities; here the schemas are ported from the prototype backend DESIGN section 3.1.

### 1.2 Purpose

Concrete catalog of the entity types the demo queries read through `input_entity_types`. Each entity composes aspects from `feature-aspect-catalog` through `allOf`, which makes the filters of `feature-filter-catalog` applicable to it. In deployments the consuming backend produces these entities and their derived fields; in the demo the fixtures are precomputed and served through the EntitySource (ADR-0009, ADR-0015).

**Requirements**: `cpt-frontx-dashboard-fr-type-catalog`

**Principles**: `cpt-frontx-dashboard-principle-gts-contracts`

### 1.3 Actors

N/A - type-catalog feature. The catalog is consumed by the runtime type system (Viewer host, Data Query Worker, widget MFEs) and by the demo fixtures, not by an end-user actor flow. No actor flows are authored.

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md) (section 3.1 Domain Model)
- **Dependencies**: [feature-aspect-catalog](../feature-aspect-catalog/FEATURE.md) (entities compose aspects through `allOf`).

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

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-dod-entity-catalog-catalog-complete`

The system **MUST** ship every type listed in section 6 in the `dashboard-demo` package (`templateExample: true`), registered through that package's `mfe.json` `schemas`.

- All 8 entities and all sub-records in section 6 are authored.
- Each entity composes the aspects named in its entry.
- Sub-records are independent types referenced by `$ref`, as in the prototype backend DESIGN.

## 6. Type Catalog

All identifiers end in `~` (types) and use `v1`. The package `dashboard-demo` declares this catalog; the base types it extends are owned by other packages as noted in each entry.

### 6.1 User

**GTS ID**: `gts.frontx.demo.github.user.v1~`

**Description**: GitHub user / contributor entity (login, display name, team affiliation).

**Schema**:

```json
{
  "$id": "gts://gts.frontx.demo.github.user.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "User",
  "description": "GitHub user / contributor. Composes `has_author`-style identification fields (`login`, `display_name`) plus team affiliation.",
  "type": "object",
  "required": ["login", "display_name"],
  "properties": {
    "login": { "type": "string", "description": "GitHub login." },
    "display_name": { "type": "string", "description": "Resolved human-readable name; falls back to `login` when no mapping exists." },
    "team_name": { "type": ["string", "null"], "description": "Team name; null when the user is not assigned to any team." },
    "team_color": { "type": ["string", "null"], "description": "Team color (hex); null when no team or no color is set." }
  }
}
```

**Cross-references**:
- Authoring carrier for the user identity shown in contributor-oriented demo views. Not defined by the prototype backend DESIGN; see Open questions.
- Aspect composition: see feature-aspect-catalog; filter applicability: see feature-filter-catalog.

### 6.2 PullRequest

**GTS ID**: `gts.frontx.demo.github.pull_request.v1~`

**Description**: Full pull request including enrichment data (reviews, comments, threads, commits, CI); source for all PR-centric widgets.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.demo.github.pull_request.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "PullRequest",
  "description": "Full pull request including enrichment data. Composes `has_author`, `has_team`, `has_repo`, `has_created_at`, `has_updated_at`, `has_closed_at`, `has_merged_at`, `has_title`, `has_state`, `has_wip_signal`, `has_derived_merge_status` so the per-aspect filter concretes apply (FilterByAuthor, FilterByTeam, FilterByRepo, FilterByCreatedAtRange, FilterByMergedAtRange, FilterByTitleContains, FilterByState, FilterExcludeWip, etc.).",
  "allOf": [
    { "$ref": "gts://gts.frontx.demo.entity_aspect.has_author.v1~" },
    { "$ref": "gts://gts.frontx.demo.entity_aspect.has_team.v1~" },
    { "$ref": "gts://gts.frontx.demo.entity_aspect.has_repo.v1~" },
    { "$ref": "gts://gts.frontx.demo.entity_aspect.has_created_at.v1~" },
    { "$ref": "gts://gts.frontx.demo.entity_aspect.has_updated_at.v1~" },
    { "$ref": "gts://gts.frontx.demo.entity_aspect.has_closed_at.v1~" },
    { "$ref": "gts://gts.frontx.demo.entity_aspect.has_merged_at.v1~" },
    { "$ref": "gts://gts.frontx.demo.entity_aspect.has_title.v1~" },
    { "$ref": "gts://gts.frontx.demo.entity_aspect.has_state.v1~" },
    { "$ref": "gts://gts.frontx.demo.entity_aspect.has_wip_signal.v1~" },
    { "$ref": "gts://gts.frontx.demo.entity_aspect.has_derived_merge_status.v1~" },
    {
      "type": "object",
      "required": ["number", "repo", "title", "author_login", "author_display_name", "state", "created_at", "url", "derived_merge_status"],
      "properties": {
        "number": { "type": "integer", "description": "PR number within repository." },
        "repo": { "type": "string", "description": "Repository slug." },
        "title": { "type": "string", "description": "PR title." },
        "body": { "type": "string", "default": "", "description": "PR description body." },
        "author_login": { "type": "string", "description": "PR author GitHub login." },
        "author_display_name": { "type": "string", "description": "Resolved human-readable author name; populated at normalization time from the admin-managed user mapping. Falls back to `author_login` if no mapping exists." },
        "author_team_name": { "type": ["string", "null"], "description": "Author's team name; populated at normalization time from the admin-managed user-team mapping. Null when the author is not assigned to any team." },
        "author_team_color": { "type": ["string", "null"], "description": "Author's team color (hex); populated at normalization time from the admin-managed team palette. Null when no team or team has no color set." },
        "state": { "type": "string", "enum": ["OPEN", "MERGED", "CLOSED"], "description": "PR lifecycle state." },
        "created_at": { "type": "string", "format": "date-time", "description": "Creation timestamp." },
        "url": { "type": "string", "format": "uri", "description": "HTML URL to the PR on GitHub." },
        "additions": { "type": "integer", "default": 0, "description": "Lines added." },
        "deletions": { "type": "integer", "default": 0, "description": "Lines deleted." },
        "changed_files": { "type": "integer", "default": 0, "description": "Number of files changed." },
        "merged_at": { "type": ["string", "null"], "format": "date-time", "description": "Merge timestamp; null until merged." },
        "merged_by": { "type": "string", "default": "", "description": "Login of merger." },
        "closed_at": { "type": ["string", "null"], "format": "date-time", "description": "Close timestamp; null while open." },
        "updated_at": { "type": ["string", "null"], "format": "date-time", "description": "Last-update timestamp." },
        "is_draft": { "type": "boolean", "default": false, "description": "Whether PR is in draft state." },
        "requested_reviewers": { "type": "array", "items": { "type": "string" }, "default": [], "description": "Logins of requested reviewers." },
        "reviews": { "type": "array", "items": { "$ref": "gts://gts.frontx.demo.github.review.v1~" }, "default": [], "description": "Review submissions." },
        "pr_comments": { "type": "array", "items": { "$ref": "gts://gts.frontx.demo.github.pr_comment.v1~" }, "default": [], "description": "Issue-level (non-inline) comments." },
        "review_threads": { "type": "array", "items": { "$ref": "gts://gts.frontx.demo.github.review_thread.v1~" }, "default": [], "description": "Inline review threads." },
        "commits": { "type": "array", "items": { "$ref": "gts://gts.frontx.demo.github.commit.v1~" }, "default": [], "description": "Commits belonging to this PR." },
        "ci_status": { "anyOf": [{ "$ref": "gts://gts.frontx.demo.github.ci_status.v1~" }, { "type": "null" }], "description": "Aggregated CI status; null when unavailable." },
        "derived_merge_status": { "type": "string", "enum": ["READY", "IN_REVIEW", "CONFLICT", "DRAFT", "MERGED", "CLOSED"], "description": "Pre-computed semantic merge-status label (aspect `has_derived_merge_status`); precomputed in the demo fixtures." },
        "mergeable": { "type": ["string", "null"], "enum": ["MERGEABLE", "CONFLICTING", "UNKNOWN", null], "description": "Null until GitHub resolves mergeability." },
        "merge_state_status": { "type": ["string", "null"], "enum": ["CLEAN", "DIRTY", "BLOCKED", "UNKNOWN", null], "description": "Detailed merge state; null when unknown." }
      }
    }
  ]
}
```

**Cross-references**:
- Composes ten aspects plus `has_derived_merge_status`. Embeds Review, PRComment, ReviewThread, Commit, and CIStatus records.
- Aspect composition: see feature-aspect-catalog; filter applicability: see feature-filter-catalog.

### 6.3 Commit

**GTS ID**: `gts.frontx.demo.github.commit.v1~`

**Description**: Individual git commit with diff stats and per-file breakdown, stored immutably and keyed by SHA.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.demo.github.commit.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Commit",
  "description": "Individual git commit with diff stats and per-file breakdown. Composes `has_author`, `has_team`, `has_repo`, `has_committed_at` aspects (per DESIGN-frontend.md §3.1 Entity aspects) so author / team / repo / committed_at filters apply.",
  "allOf": [
    { "$ref": "gts://gts.frontx.demo.entity_aspect.has_author.v1~" },
    { "$ref": "gts://gts.frontx.demo.entity_aspect.has_team.v1~" },
    { "$ref": "gts://gts.frontx.demo.entity_aspect.has_repo.v1~" },
    { "$ref": "gts://gts.frontx.demo.entity_aspect.has_committed_at.v1~" },
    {
      "type": "object",
      "required": ["sha", "repo", "message", "author_login", "author_display_name", "committed_at"],
      "properties": {
        "sha": { "type": "string", "description": "Full commit SHA (40-char hex); cache key." },
        "repo": { "type": "string", "description": "Repository slug (`<owner>/<name>`) the commit belongs to. Enables repo-scoped filtering via `FilterByRepo`." },
        "message": { "type": "string", "description": "First line of the commit message." },
        "author_login": { "type": "string", "description": "Commit author GitHub login." },
        "author_display_name": { "type": "string", "description": "Resolved human-readable author name; populated at normalization time from the admin-managed user mapping. Falls back to `author_login` if no mapping exists." },
        "author_team_name": { "type": ["string", "null"], "description": "Author's team name; populated at normalization time from the admin-managed user-team mapping. Null when the author is not assigned to any team." },
        "author_team_color": { "type": ["string", "null"], "description": "Author's team color (hex); populated at normalization time from the admin-managed team palette. Null when no team or team has no color set." },
        "committed_at": { "type": "string", "format": "date-time", "description": "Commit timestamp." },
        "authored_at": { "type": "string", "format": "date-time", "description": "Author timestamp (TS-level; separate from `committed_at`)." },
        "additions": { "type": "integer", "default": 0, "description": "Lines added in this commit." },
        "deletions": { "type": "integer", "default": 0, "description": "Lines deleted in this commit." },
        "changed_files": { "type": "integer", "default": 0, "description": "Number of files changed." },
        "files": {
          "type": "array",
          "items": { "$ref": "gts://gts.frontx.demo.github.commit_file.v1~" },
          "default": [],
          "description": "Per-file diff breakdown."
        }
      }
    }
  ]
}
```

**Cross-references**:
- Embeds CommitFile records; composes `has_author`, `has_team`, `has_repo`, `has_committed_at`.
- Aspect composition: see feature-aspect-catalog; filter applicability: see feature-filter-catalog.

### 6.4 Issue

**GTS ID**: `gts.frontx.demo.github.issue.v1~`

**Description**: GitHub issue with lifecycle metadata; source for issue grids, Action Items, and label-based exclusion filtering.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.demo.github.issue.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Issue",
  "description": "GitHub issue. Composes `has_author`, `has_team`, `has_repo`, `has_created_at`, `has_updated_at`, `has_closed_at`, `has_title`, `has_state`, `has_assignees` so the per-aspect filter concretes apply.",
  "allOf": [
    { "$ref": "gts://gts.frontx.demo.entity_aspect.has_author.v1~" },
    { "$ref": "gts://gts.frontx.demo.entity_aspect.has_team.v1~" },
    { "$ref": "gts://gts.frontx.demo.entity_aspect.has_repo.v1~" },
    { "$ref": "gts://gts.frontx.demo.entity_aspect.has_created_at.v1~" },
    { "$ref": "gts://gts.frontx.demo.entity_aspect.has_updated_at.v1~" },
    { "$ref": "gts://gts.frontx.demo.entity_aspect.has_closed_at.v1~" },
    { "$ref": "gts://gts.frontx.demo.entity_aspect.has_title.v1~" },
    { "$ref": "gts://gts.frontx.demo.entity_aspect.has_state.v1~" },
    { "$ref": "gts://gts.frontx.demo.entity_aspect.has_assignees.v1~" },
    {
      "type": "object",
      "required": ["number", "title", "author_login", "author_display_name", "created_at", "body"],
      "properties": {
        "number": { "type": "integer", "description": "Issue number within repository." },
        "title": { "type": "string", "description": "Issue title." },
        "author_login": { "type": "string", "description": "Issue creator GitHub login." },
        "author_display_name": { "type": "string", "description": "Resolved human-readable creator name; populated at normalization time from the admin-managed user mapping. Falls back to `author_login` if no mapping exists." },
        "author_team_name": { "type": ["string", "null"], "description": "Creator's team name; populated at normalization time from the admin-managed user-team mapping. Null when the creator is not assigned to any team." },
        "author_team_color": { "type": ["string", "null"], "description": "Creator's team color (hex); populated at normalization time from the admin-managed team palette. Null when no team or team has no color set." },
        "created_at": { "type": "string", "format": "date-time", "description": "Creation timestamp." },
        "updated_at": { "type": ["string", "null"], "format": "date-time", "description": "Last-update timestamp." },
        "body": { "type": "string", "default": "", "description": "Issue body text." },
        "byte_length": { "type": "integer", "default": 0, "description": "UTF-8 byte length of `body`." },
        "url": { "type": "string", "default": "", "description": "HTML URL of the issue." },
        "state": { "type": "string", "enum": ["OPEN", "CLOSED"], "default": "OPEN", "description": "Issue lifecycle state." },
        "state_reason": { "type": "string", "default": "", "description": "E.g. `COMPLETED`, `NOT_PLANNED`." },
        "closed_at": { "type": ["string", "null"], "format": "date-time", "description": "Close timestamp." },
        "labels": { "type": "array", "items": { "type": "string" }, "default": [], "description": "Label names." },
        "assignees": { "type": "array", "items": { "type": "string" }, "default": [], "description": "Assignee logins." },
        "milestone": { "type": ["string", "null"], "description": "Milestone title (e.g. `26.04`)." },
        "milestone_due": { "type": ["string", "null"], "format": "date-time", "description": "Milestone due date." },
        "projects": { "type": "array", "items": { "type": "string" }, "default": [], "description": "Project board titles." },
        "issue_type": { "type": ["string", "null"], "description": "GitHub issue type (e.g. `Task`, `Bug`)." }
      }
    }
  ]
}
```

**Cross-references**:
- Composes `has_author`, `has_team`, `has_repo`, `has_created_at`, `has_updated_at`, `has_closed_at`, `has_title`, `has_state`, `has_assignees`.
- Aspect composition: see feature-aspect-catalog; filter applicability: see feature-filter-catalog.

### 6.5 Review

**GTS ID**: `gts.frontx.demo.github.review.v1~`

**Description**: Single review submission on a PR, used for approved/pending detection, review turnaround, and contributor scoring.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.demo.github.review.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Review",
  "description": "Single review submission on a PR. Composes `has_author`, `has_team`, `has_state` aspects; review-specific submission timestamp tracked via the entity-specific `submitted_at` field rather than a generic created_at aspect.",
  "allOf": [
    { "$ref": "gts://gts.frontx.demo.entity_aspect.has_author.v1~" },
    { "$ref": "gts://gts.frontx.demo.entity_aspect.has_team.v1~" },
    { "$ref": "gts://gts.frontx.demo.entity_aspect.has_state.v1~" },
    {
      "type": "object",
      "required": ["author_login", "author_display_name", "submitted_at", "state", "is_bot"],
      "properties": {
        "author_login": { "type": "string", "description": "Reviewer GitHub login." },
        "author_display_name": { "type": "string", "description": "Resolved human-readable reviewer name; populated at normalization time from the admin-managed user mapping. Falls back to `author_login` if no mapping exists." },
        "author_team_name": { "type": ["string", "null"], "description": "Reviewer's team name; populated at normalization time from the admin-managed user-team mapping. Null when the reviewer is not assigned to any team." },
        "author_team_color": { "type": ["string", "null"], "description": "Reviewer's team color (hex); populated at normalization time from the admin-managed team palette. Null when no team or team has no color set." },
        "submitted_at": { "type": "string", "format": "date-time", "description": "Submission timestamp." },
        "state": { "type": "string", "enum": ["APPROVED", "CHANGES_REQUESTED", "COMMENTED", "DISMISSED", "PENDING"], "description": "Review state." },
        "body": { "type": "string", "default": "", "description": "Review body." },
        "url": { "type": ["string", "null"], "description": "HTML URL of the review." },
        "is_bot": { "type": "boolean", "description": "Bot classification; present in TS contract, absent from the source JSON Schema — required in GTS definition." }
      }
    }
  ]
}
```

**Cross-references**:
- Composes `has_author`, `has_team`, `has_state`.
- Aspect composition: see feature-aspect-catalog; filter applicability: see feature-filter-catalog.

### 6.6 Comment

**GTS ID**: `gts.frontx.demo.github.comment.v1~`

**Description**: Generic GitHub comment entity: the common shape shared by PR-level and inline thread comments.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.demo.github.comment.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Comment",
  "description": "Generic GitHub comment. Composes `has_author`, `has_team`, `has_created_at`; carries the fields common to PRComment and ThreadComment.",
  "allOf": [
    { "$ref": "gts://gts.frontx.demo.entity_aspect.has_author.v1~" },
    { "$ref": "gts://gts.frontx.demo.entity_aspect.has_team.v1~" },
    { "$ref": "gts://gts.frontx.demo.entity_aspect.has_created_at.v1~" },
    {
      "type": "object",
      "required": ["author_login", "author_display_name", "created_at", "body", "is_bot"],
      "properties": {
        "author_login": { "type": "string", "description": "Comment author GitHub login." },
        "author_display_name": { "type": "string", "description": "Resolved human-readable author name; falls back to `author_login` if no mapping exists." },
        "author_team_name": { "type": ["string", "null"], "description": "Author's team name; null when the author is not assigned to any team." },
        "author_team_color": { "type": ["string", "null"], "description": "Author's team color (hex); null when no team or team has no color set." },
        "created_at": { "type": "string", "format": "date-time", "description": "Creation timestamp." },
        "body": { "type": "string", "description": "Comment body." },
        "is_bot": { "type": "boolean", "description": "Bot classification." },
        "url": { "type": ["string", "null"], "description": "HTML URL of the comment." }
      }
    }
  ]
}
```

**Cross-references**:
- Generic comment shape. Not defined by the prototype backend DESIGN; see Open questions.
- Aspect composition: see feature-aspect-catalog; filter applicability: see feature-filter-catalog.

### 6.7 PrComment

**GTS ID**: `gts.frontx.demo.github.pr_comment.v1~`

**Description**: PR-level (non-inline) comment; includes synthetic entries promoted from non-empty review bodies.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.demo.github.pr_comment.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "PRComment",
  "description": "PR-level (non-inline) comment. Composes `has_author`, `has_team`, `has_created_at`.",
  "allOf": [
    { "$ref": "gts://gts.frontx.demo.entity_aspect.has_author.v1~" },
    { "$ref": "gts://gts.frontx.demo.entity_aspect.has_team.v1~" },
    { "$ref": "gts://gts.frontx.demo.entity_aspect.has_created_at.v1~" },
    {
      "type": "object",
      "required": ["author_login", "author_display_name", "created_at", "body", "is_bot"],
      "properties": {
        "author_login": { "type": "string", "description": "Comment author GitHub login." },
        "author_display_name": { "type": "string", "description": "Resolved human-readable author name; populated at normalization time from the admin-managed user mapping. Falls back to `author_login` if no mapping exists." },
        "author_team_name": { "type": ["string", "null"], "description": "Author's team name; populated at normalization time from the admin-managed user-team mapping. Null when the author is not assigned to any team." },
        "author_team_color": { "type": ["string", "null"], "description": "Author's team color (hex); populated at normalization time from the admin-managed team palette. Null when no team or team has no color set." },
        "created_at": { "type": "string", "format": "date-time", "description": "Creation timestamp." },
        "body": { "type": "string", "description": "Comment body." },
        "reply_to": { "type": ["string", "null"], "description": "ID or URL of parent comment if this is a reply." },
        "is_bot": { "type": "boolean", "description": "Bot classification." },
        "url": { "type": ["string", "null"], "description": "HTML URL of the comment." }
      }
    }
  ]
}
```

**Cross-references**:
- PR-level (non-inline) comment; composes `has_author`, `has_team`, `has_created_at`.
- Aspect composition: see feature-aspect-catalog; filter applicability: see feature-filter-catalog.

### 6.8 ThreadComment

**GTS ID**: `gts.frontx.demo.github.thread_comment.v1~`

**Description**: Nested inline comment within a review thread.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.demo.github.thread_comment.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "ThreadComment",
  "description": "Nested inline comment within a review thread. Composes `has_author`, `has_team`, `has_created_at`.",
  "allOf": [
    { "$ref": "gts://gts.frontx.demo.entity_aspect.has_author.v1~" },
    { "$ref": "gts://gts.frontx.demo.entity_aspect.has_team.v1~" },
    { "$ref": "gts://gts.frontx.demo.entity_aspect.has_created_at.v1~" },
    {
      "type": "object",
      "required": ["author_login", "author_display_name", "created_at", "body", "byte_length", "is_bot"],
      "properties": {
        "author_login": { "type": "string", "description": "Comment author GitHub login." },
        "author_display_name": { "type": "string", "description": "Resolved human-readable author name; populated at normalization time from the admin-managed user mapping. Falls back to `author_login` if no mapping exists." },
        "author_team_name": { "type": ["string", "null"], "description": "Author's team name; populated at normalization time from the admin-managed user-team mapping. Null when the author is not assigned to any team." },
        "author_team_color": { "type": ["string", "null"], "description": "Author's team color (hex); populated at normalization time from the admin-managed team palette. Null when no team or team has no color set." },
        "created_at": { "type": "string", "format": "date-time", "description": "Creation timestamp." },
        "body": { "type": "string", "description": "Comment body." },
        "byte_length": { "type": "integer", "default": 0, "description": "UTF-8 byte length of `body`." },
        "is_bot": { "type": "boolean", "description": "Bot classification." },
        "url": { "type": ["string", "null"], "description": "HTML URL of the comment." }
      }
    }
  ]
}
```

**Cross-references**:
- Inline review-thread comment; composes `has_author`, `has_team`, `has_created_at`.
- Aspect composition: see feature-aspect-catalog; filter applicability: see feature-filter-catalog.

### 6.9 CommitFile (sub-record)

**GTS ID**: `gts.frontx.demo.github.commit_file.v1~`

**Description**: Per-file change record nested inside a `Commit`, used for team-stats code-path attribution and language-weighted LOC analytics. Carries the `has_language` aspect (`{language, code}`) populated at normalization time using the normalization-pipeline language-mapping configuration (configuration is normalization-pipeline-only; out of scope for viewer DESIGN).

**Schema**:

```json
{
  "$id": "gts://gts.frontx.demo.github.commit_file.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "CommitFile",
  "description": "Per-file change record. Composes `has_language` so language-weighted analytics and the `FilterByLanguage` filter apply at the per-file granularity.",
  "allOf": [
    { "$ref": "gts://gts.frontx.demo.entity_aspect.has_language.v1~" },
    {
      "type": "object",
      "required": ["filename", "language", "code"],
      "properties": {
        "filename": { "type": "string", "description": "Full path relative to repo root." },
        "additions": { "type": "integer", "default": 0, "description": "Lines added in this file." },
        "deletions": { "type": "integer", "default": 0, "description": "Lines deleted in this file." },
        "language": { "type": "string", "description": "Resolved language name (e.g. `TypeScript`). Populated at normalization time by the language-classification utility using the admin-configured language-mapping (out of scope for viewer DESIGN)." },
        "code": { "type": "boolean", "description": "True iff the language is classified as 'code' per the normalization-pipeline code-language allowlist." }
      }
    }
  ]
}
```

**Cross-references**:
- Sub-record of Commit (`Commit.files[]`); composes `has_language`.
- Aspect composition: see feature-aspect-catalog; filter applicability: see feature-filter-catalog.

### 6.10 CIStatus (sub-record)

**GTS ID**: `gts.frontx.demo.github.ci_status.v1~`

**Description**: Aggregate CI status for a PR, composed of per-check records.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.demo.github.ci_status.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "CIStatus",
  "description": "Aggregate CI status for a PR.",
  "type": "object",
  "required": ["overall_state"],
  "properties": {
    "overall_state": { "type": "string", "enum": ["SUCCESS", "FAILURE", "PENDING", "ERROR"], "description": "Overall CI state." },
    "checks": { "type": "array", "items": { "$ref": "gts://gts.frontx.demo.github.ci_check.v1~" }, "default": [], "description": "Individual CI check results." }
  }
}
```

**Cross-references**:
- Sub-record of PullRequest (`ci_status`); owns CICheck records in `checks[]`.
- Aspect composition: see feature-aspect-catalog; filter applicability: see feature-filter-catalog.

### 6.11 CICheck (sub-record)

**GTS ID**: `gts.frontx.demo.github.ci_check.v1~`

**Description**: Per-check CI record, displayed in CI status expansions.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.demo.github.ci_check.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "CICheck",
  "description": "Per-check CI record.",
  "type": "object",
  "required": ["name", "status", "url"],
  "properties": {
    "name": { "type": "string", "description": "Check or context name." },
    "status": { "type": "string", "description": "Conclusion or status string." },
    "url": { "type": "string", "description": "Details URL for the check run." }
  }
}
```

**Cross-references**:
- Sub-record of CIStatus (`CIStatus.checks[]`).
- Aspect composition: see feature-aspect-catalog; filter applicability: see feature-filter-catalog.

### 6.12 ReviewThread (sub-record)

**GTS ID**: `gts.frontx.demo.github.review_thread.v1~`

**Description**: Inline review thread with resolution status and ordered comments; core data for unreplied-human/bot counts and open/resolved thread metrics.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.demo.github.review_thread.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "ReviewThread",
  "description": "Inline review thread on a PR. Does not compose author / state aspects (the thread itself has neither — comments inside the thread carry author).",
  "type": "object",
  "required": ["is_resolved"],
  "properties": {
    "is_resolved": { "type": "boolean", "description": "Whether the thread is resolved." },
    "file_path": { "type": "string", "default": "", "description": "File path the thread is attached to." },
    "line_range": { "type": ["string", "null"], "description": "Line range (e.g. `216-221` or `275`)." },
    "code_context": { "type": ["string", "null"], "description": "Surrounding source snippet for display." },
    "code_context_meta": { "$ref": "gts://gts.frontx.demo.github.code_context_meta.v1~", "default": {}, "description": "Navigation metadata for `code_context`." },
    "comments": { "type": "array", "items": { "$ref": "gts://gts.frontx.demo.github.thread_comment.v1~" }, "default": [], "description": "Ordered comments within this thread." }
  }
}
```

**Cross-references**:
- Sub-record of PullRequest (`review_threads[]`); owns ThreadComment records in `comments[]`. Needed by the PullRequest schema.
- Aspect composition: see feature-aspect-catalog; filter applicability: see feature-filter-catalog.

### 6.13 CodeContextMeta (sub-record)

**GTS ID**: `gts.frontx.demo.github.code_context_meta.v1~`

**Description**: Code-snippet navigation metadata attached to a review thread's `code_context`; drives expand/collapse affordances in the review thread toast.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.demo.github.code_context_meta.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "CodeContextMeta",
  "description": "Code-snippet navigation metadata.",
  "type": "object",
  "properties": {
    "mode": { "type": "string", "description": "Rendering mode (e.g. `focus`, `full`)." },
    "focus_start": { "type": "integer", "description": "First focused line number." },
    "focus_end": { "type": "integer", "description": "Last focused line number." },
    "preview_start": { "type": "integer", "description": "First preview line number." },
    "preview_end": { "type": "integer", "description": "Last preview line number." },
    "total_lines": { "type": "integer", "description": "Total lines in the underlying file." },
    "has_more_before": { "type": "boolean", "description": "Whether context exists before the preview window." },
    "has_more_after": { "type": "boolean", "description": "Whether context exists after the preview window." },
    "expand_chunk": { "type": "string", "description": "Token identifying the next expansion chunk." }
  }
}
```

**Cross-references**:
- Sub-record of ReviewThread (`code_context_meta`). Needed by the ReviewThread schema.
- Aspect composition: see feature-aspect-catalog; filter applicability: see feature-filter-catalog.

## 7. Acceptance Criteria

- [ ] All 8 entities and their sub-records are declared in section 6.
- [ ] Every aspect composed by an entity exists in `feature-aspect-catalog`.
- [ ] Every type in section 6 passes GTS identifier grammar validation and uses the `gts.frontx.demo.*` or `gts.frontx.v.filter.*` namespace; no `gts.de.*` identifier remains.
- [ ] Every `$ref` and `x-gts-ref` target resolves inside the catalog or to a base owned by another package.
- [ ] `cfs validate --artifact` passes for this file.

## 8. Open Questions

- `User` and `Comment` have no schema in the prototype backend DESIGN (the prototype feature indexed them by name only). Their schemas in section 6 are minimal and derived from the prototype descriptions ("login + display_name + team affiliation" and "generic comment"). Confirm or replace.
- `PullRequest` composes `has_derived_merge_status` (named in the prototype entity feature) although the prototype backend DESIGN schema omits it; the aspect and the `derived_merge_status` field were added.
- The prototype entity feature described `CommitFile`, `CIStatus`, and `CICheck` as `$defs` sub-records without identity; the prototype backend DESIGN declares them as independent GTS types. This port follows the backend DESIGN.
- `PrComment` and `ThreadComment` do not chain from `Comment` in the source schemas; they stay flat.
- **Inherited from the prototype**: `Comment`, `PRComment`, and `ThreadComment` compose no `has_repo`; `User` composes no aspects (`team_name` vs `author_team_name`); `has_comment_focus` is not composed by any comment entity although queries group by `comment_focus`. `PullRequest` declares no `id`, and `Review` declares no PR relation (`pr_id`), although queries join on them.
