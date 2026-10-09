# Feature: Query Instances


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
  - [6.1 PR Status Counts](#61-pr-status-counts)
  - [6.2 Unreplied Comments Summary](#62-unreplied-comments-summary)
  - [6.3 Contributors Summary](#63-contributors-summary)
  - [6.4 Contributor Snapshot Summary](#64-contributor-snapshot-summary)
  - [6.5 Issue Category Counts](#65-issue-category-counts)
  - [6.6 LOC Summary](#66-loc-summary)
  - [6.7 Top Contributor](#67-top-contributor)
  - [6.8 Contributor Scores](#68-contributor-scores)
  - [6.9 Milestone Summary](#69-milestone-summary)
  - [6.10 Action Item Grid](#610-action-item-grid)
  - [6.11 PR Grid](#611-pr-grid)
  - [6.12 PR Summary Grid](#612-pr-summary-grid)
  - [6.13 Review Turnaround Grid](#613-review-turnaround-grid)
  - [6.14 Issues Created Grid](#614-issues-created-grid)
  - [6.15 Open Issues Grid](#615-open-issues-grid)
  - [6.16 Team Stats Grid](#616-team-stats-grid)
  - [6.17 Contributor Grid](#617-contributor-grid)
  - [6.18 Commit Drilldown Grid](#618-commit-drilldown-grid)
  - [6.19 LOC Metrics Drilldown Grid](#619-loc-metrics-drilldown-grid)
  - [6.20 Comments-To-Reply Drilldown Grid](#620-comments-to-reply-drilldown-grid)
  - [6.21 Latency Drilldown Grid](#621-latency-drilldown-grid)
  - [6.22 PR Status Buckets Chart](#622-pr-status-buckets-chart)
  - [6.23 PRs Opened Over Time Chart](#623-prs-opened-over-time-chart)
  - [6.24 Latency Over Time Chart](#624-latency-over-time-chart)
  - [6.25 LOC Over Time Chart](#625-loc-over-time-chart)
  - [6.26 Comment Category Over Time Chart](#626-comment-category-over-time-chart)
  - [6.27 Commit Over Time Chart](#627-commit-over-time-chart)
  - [6.28 Issue Type Over Time Chart](#628-issue-type-over-time-chart)
  - [6.29 Contributor Activity Heatmap](#629-contributor-activity-heatmap)
  - [6.30 Contributor Activity Pie](#630-contributor-activity-pie)
  - [6.31 Action Items Per User Grid](#631-action-items-per-user-grid)
  - [6.32 PR Summary Grid With Median](#632-pr-summary-grid-with-median)
  - [6.33 Review Turnaround Grid With Median](#633-review-turnaround-grid-with-median)
  - [6.34 Team Stats Pivot Grid](#634-team-stats-pivot-grid)
  - [6.35 Commit Over Time With Moving Average](#635-commit-over-time-with-moving-average)
  - [6.36 Contributor Grid With Score](#636-contributor-grid-with-score)
- [7. Acceptance Criteria](#7-acceptance-criteria)
- [Open Questions](#open-questions)

<!-- /toc -->

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-featstatus-query-instances`
## 1. Feature Context

- [ ] `p2` - `cpt-frontx-dashboard-feature-query-instances`

### 1.1 Overview

This feature is a **type-catalog feature**, not an actor-flow feature. It enumerates the 36 demo **Query instances** of the Query base type `gts.frontx.v.query.query.v1~` (declared in DESIGN section 3.1 and specified in the `operator-variants` FEATURE, section 6.0a), one instance per widget-driving demo insight. The standard FEATURE sections for actor flows, processes, and states are reduced to short stubs below; the catalog content lives in section 6 Type Catalog. The instances are declared by the `dashboard-demo` package.

### 1.2 Purpose

Catalog of Query instances of the Query type (`gts.frontx.v.query.query.v1~`). Each instance declares the entity types it reads, the filter scopes it reacts to, the widget data shape it produces, and the ordered Operator pipeline that produces it. A widget instance binds to a Query instance by its identifier through the widget base field `query`; the Viewer host sends the query's typed widget data with the `set_data` host action (`gts.frontx.mfes.comm.action.v1~frontx.v.mfe.set_data.v1~`, FEATURE `extension-domain`). The 36 queries cover 7 of the 13 widget kinds. The other 6 kinds (`metric_card`, `markdown_card`, `code_diff`, `thread_list`, `event_timeline`, `metadata_strip`) have no demo query; this is a known gap listed in the PRD limitations.

**Requirements**: `cpt-frontx-dashboard-fr-type-catalog`, `cpt-frontx-dashboard-fr-widget-catalog`, `cpt-frontx-dashboard-fr-demo-opt-in`

**Principles**: `cpt-frontx-dashboard-principle-gts-contracts`

### 1.3 Actors

N/A: type-catalog feature. The catalog is consumed by the runtime type system (Viewer host, Data Query Worker, and widgets), not by an end-user actor. No actor flows are authored.

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md) (section 3.1 Domain Model, Abstract Bases, ID-form convention)
- **ADR**: [ADR-0013](../../ADR/0013-query-operator-cel-v1.md) (CEL only in the `filter` operator `predicate`)
- **Dependencies**: [feature-operator-variants](../feature-operator-variants/FEATURE.md) (Query type schema and operator variants), [feature-widget-data-catalog](../feature-widget-data-catalog/FEATURE.md) (output widget data shapes), [feature-filter-catalog](../feature-filter-catalog/FEATURE.md) (filter scopes), [feature-entity-catalog](../feature-entity-catalog/FEATURE.md) (input entity types), [feature-aspect-catalog](../feature-aspect-catalog/FEATURE.md) (aspect cross-references for filter applicability)

## 2. Actor Flows (CDSL)

### Type-Catalog Feature: No Actor Flows

N/A: type-catalog feature. The catalog content is consumed at runtime by the Viewer host and the Worker, not by an actor flow. The full content is in section 6 Type Catalog.

## 3. Processes / Business Logic (CDSL)

### Type-Catalog Feature: No Processes

N/A: type-catalog feature. The catalog declares static GTS instances; pipeline execution lives in the Data Query Worker, not in this catalog.

## 4. States (CDSL)

### Type-Catalog Feature: No State Machines

N/A: type-catalog feature. Instance declarations are stateless.

## 5. Definitions of Done

### Type Catalog Definition of Done

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-dod-query-instances-catalog-complete`

The system **MUST** provide the 36 Query instances of section 6, held in the `dashboard-demo` package and registered through its own `mfe.json`.

- One Query instance is authored per widget-driving demo insight (36 in total, covering 7 of the 13 widget kinds).
- Every instance validates against the Query schema (`gts.frontx.v.query.query.v1~`): all four required fields populated, no invented fields.
- Every instance `id` has the form `gts.frontx.v.query.query.v1~frontx.demo.query.<name>.v1` with no trailing `~`.
- Every `output_widget_data_type` references a widget data shape `gts.frontx.v.widget_data.<kind>.v1~` from the `widget-data` FEATURE.
- Every `input_entity_types` entry references an entity type `gts.frontx.demo.github.<name>.v1~` from the `entity` FEATURE.
- Every `filter_scopes` entry (when non-empty) references a filter concrete `gts.frontx.v.filter.filter.v1~frontx.demo.filter.<name>.v1~` from the `filter` FEATURE.
- Every `pipeline` is an ordered array of Operator instances per the 18 variants of the `operator-variants` FEATURE, section 6.0b.
- CEL scope across operator fields is an open question (see Open Questions, "Inherited from the prototype"; ADR-0013).

**Implements**:
- N/A: type-catalog feature, no flows

**Constraints**: `cpt-frontx-dashboard-principle-gts-contracts`

**Touches**:
- API: N/A
- DB: N/A
- Entities: `Query`, `Operator`

## 6. Type Catalog

### 6.1 PR Status Counts

**GTS instance ID**: `gts.frontx.v.query.query.v1~frontx.demo.query.pr_status_counts.v1`

**Description**: Counts pull requests by derived merge status, producing a SummaryCard with one row per status bucket (ready, in_review, approved, draft, merged, closed).

**Instance**:

```json
{
  "id": "gts.frontx.v.query.query.v1~frontx.demo.query.pr_status_counts.v1",
  "input_entity_types": [
    "gts.frontx.demo.github.pull_request.v1~"
  ],
  "filter_scopes": [
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_author.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_repo.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_team.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_created_at_range.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.exclude_wip.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.bot_inclusion.v1~"
  ],
  "output_widget_data_type": "gts.frontx.v.widget_data.summary_card.v1~",
  "pipeline": [
    {
      "op": "count_by",
      "key": "derived_merge_status",
      "into": {
        "ready": "ready",
        "in_review": "in_review",
        "approved": "approved",
        "draft": "draft",
        "merged": "merged",
        "closed": "closed"
      }
    }
  ]
}
```

**Cross-references**:

- Query base type: `gts.frontx.v.query.query.v1~` (feature-operator-variants §6.0a).
- Output Widget Data: `gts.frontx.v.widget_data.summary_card.v1~` (feature-widget-data §6.1).

### 6.2 Unreplied Comments Summary

**GTS instance ID**: `gts.frontx.v.query.query.v1~frontx.demo.query.unreplied_comments_summary.v1`

**Description**: Counts unreplied review-thread / PR comments, producing a SummaryCard with totals split by author kind (human, bot_critical, bot_non_critical).

**Instance**:

```json
{
  "id": "gts.frontx.v.query.query.v1~frontx.demo.query.unreplied_comments_summary.v1",
  "input_entity_types": [
    "gts.frontx.demo.github.pr_comment.v1~",
    "gts.frontx.demo.github.thread_comment.v1~"
  ],
  "filter_scopes": [
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_author.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_repo.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_team.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.unreplied_only.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_comment_source.v1~"
  ],
  "output_widget_data_type": "gts.frontx.v.widget_data.summary_card.v1~",
  "pipeline": [
    {
      "op": "count_by",
      "key": "comment_focus",
      "into": {
        "human": "human",
        "bot_critical": "bot_critical",
        "bot_non_critical": "bot_non_critical"
      }
    }
  ]
}
```

**Cross-references**:

- Query base type: `gts.frontx.v.query.query.v1~` (feature-operator-variants §6.0a).
- Output Widget Data: `gts.frontx.v.widget_data.summary_card.v1~` (feature-widget-data §6.1).

### 6.3 Contributors Summary

**GTS instance ID**: `gts.frontx.v.query.query.v1~frontx.demo.query.contributors_summary.v1`

**Description**: Counts active vs total distinct contributors over the active filter window, producing a SummaryCard with two rows.

**Instance**:

```json
{
  "id": "gts.frontx.v.query.query.v1~frontx.demo.query.contributors_summary.v1",
  "input_entity_types": [
    "gts.frontx.demo.github.pull_request.v1~",
    "gts.frontx.demo.github.commit.v1~"
  ],
  "filter_scopes": [
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_team.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_repo.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_created_at_range.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.bot_inclusion.v1~"
  ],
  "output_widget_data_type": "gts.frontx.v.widget_data.summary_card.v1~",
  "pipeline": [
    {
      "op": "group_by",
      "key": "author_login"
    },
    {
      "op": "count_all",
      "into": "total"
    }
  ]
}
```

**Cross-references**:

- Query base type: `gts.frontx.v.query.query.v1~` (feature-operator-variants §6.0a).
- Output Widget Data: `gts.frontx.v.widget_data.summary_card.v1~` (feature-widget-data §6.1).

### 6.4 Contributor Snapshot Summary

**GTS instance ID**: `gts.frontx.v.query.query.v1~frontx.demo.query.contributor_snapshot_summary.v1`

**Description**: Per-contributor activity snapshot — total PRs merged, KLOC delta, comments written/replied — producing a SummaryCard with one row per metric.

**Instance**:

```json
{
  "id": "gts.frontx.v.query.query.v1~frontx.demo.query.contributor_snapshot_summary.v1",
  "input_entity_types": [
    "gts.frontx.demo.github.pull_request.v1~"
  ],
  "filter_scopes": [
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_author.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_repo.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_team.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_merged_at_range.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_min_prs_merged.v1~"
  ],
  "output_widget_data_type": "gts.frontx.v.widget_data.summary_card.v1~",
  "pipeline": [
    {
      "op": "filter",
      "predicate": "state == 'MERGED'"
    },
    {
      "op": "count_all",
      "into": "prs_merged"
    }
  ]
}
```

**Cross-references**:

- Query base type: `gts.frontx.v.query.query.v1~` (feature-operator-variants §6.0a).
- Output Widget Data: `gts.frontx.v.widget_data.summary_card.v1~` (feature-widget-data §6.1).

### 6.5 Issue Category Counts

**GTS instance ID**: `gts.frontx.v.query.query.v1~frontx.demo.query.issue_category_counts.v1`

**Description**: Counts issues by issue type (Task, Bug, Feature, etc.), producing a SummaryCard with one row per issue category.

**Instance**:

```json
{
  "id": "gts.frontx.v.query.query.v1~frontx.demo.query.issue_category_counts.v1",
  "input_entity_types": [
    "gts.frontx.demo.github.issue.v1~"
  ],
  "filter_scopes": [
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_repo.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_team.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_state.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_issue_types.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_labels.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_milestones.v1~"
  ],
  "output_widget_data_type": "gts.frontx.v.widget_data.summary_card.v1~",
  "pipeline": [
    {
      "op": "count_by",
      "key": "issue_type",
      "into": {
        "task": "Task",
        "bug": "Bug",
        "feature": "Feature",
        "other": "Other"
      }
    }
  ]
}
```

**Cross-references**:

- Query base type: `gts.frontx.v.query.query.v1~` (feature-operator-variants §6.0a).
- Output Widget Data: `gts.frontx.v.widget_data.summary_card.v1~` (feature-widget-data §6.1).

### 6.6 LOC Summary

**GTS instance ID**: `gts.frontx.v.query.query.v1~frontx.demo.query.loc_summary.v1`

**Description**: Total lines-of-code added/removed/net over the active filter window, producing a SummaryCard with three rows.

**Instance**:

```json
{
  "id": "gts.frontx.v.query.query.v1~frontx.demo.query.loc_summary.v1",
  "input_entity_types": [
    "gts.frontx.demo.github.commit.v1~"
  ],
  "filter_scopes": [
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_author.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_repo.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_team.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_committed_at_range.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_language.v1~"
  ],
  "output_widget_data_type": "gts.frontx.v.widget_data.summary_card.v1~",
  "pipeline": [
    {
      "op": "sum",
      "field": "additions",
      "into": "added"
    },
    {
      "op": "sum",
      "field": "deletions",
      "into": "removed"
    }
  ]
}
```

**Cross-references**:

- Query base type: `gts.frontx.v.query.query.v1~` (feature-operator-variants §6.0a).
- Output Widget Data: `gts.frontx.v.widget_data.summary_card.v1~` (feature-widget-data §6.1).

### 6.7 Top Contributor

**GTS instance ID**: `gts.frontx.v.query.query.v1~frontx.demo.query.top_contributor.v1`

**Description**: Ranked list of top contributors by score, producing a RankedListCard with rank/login/score rows.

**Instance**:

```json
{
  "id": "gts.frontx.v.query.query.v1~frontx.demo.query.top_contributor.v1",
  "input_entity_types": [
    "gts.frontx.demo.github.pull_request.v1~"
  ],
  "filter_scopes": [
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_team.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_repo.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_merged_at_range.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.bot_inclusion.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_score_threshold.v1~"
  ],
  "output_widget_data_type": "gts.frontx.v.widget_data.ranked_list_card.v1~",
  "pipeline": [
    {
      "op": "group_by",
      "key": "author_login"
    },
    {
      "op": "sum",
      "field": "author_score",
      "into": "score"
    }
  ]
}
```

**Cross-references**:

- Query base type: `gts.frontx.v.query.query.v1~` (feature-operator-variants §6.0a).
- Output Widget Data: `gts.frontx.v.widget_data.ranked_list_card.v1~` (feature-widget-data §6.3).

### 6.8 Contributor Scores

**GTS instance ID**: `gts.frontx.v.query.query.v1~frontx.demo.query.contributor_scores.v1`

**Description**: Ranked list of contributors with their pre-computed activity scores, producing a RankedListCard.

**Instance**:

```json
{
  "id": "gts.frontx.v.query.query.v1~frontx.demo.query.contributor_scores.v1",
  "input_entity_types": [
    "gts.frontx.demo.github.user.v1~"
  ],
  "filter_scopes": [
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_team.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_score_threshold.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.bot_inclusion.v1~"
  ],
  "output_widget_data_type": "gts.frontx.v.widget_data.ranked_list_card.v1~",
  "pipeline": [
    {
      "op": "project",
      "as": "rank_value",
      "expr": "score"
    }
  ]
}
```

**Cross-references**:

- Query base type: `gts.frontx.v.query.query.v1~` (feature-operator-variants §6.0a).
- Output Widget Data: `gts.frontx.v.widget_data.ranked_list_card.v1~` (feature-widget-data §6.3).

### 6.9 Milestone Summary

**GTS instance ID**: `gts.frontx.v.query.query.v1~frontx.demo.query.milestone_summary.v1`

**Description**: Milestone progress (closed-vs-total issues per milestone), producing a ProgressListCard.

**Instance**:

```json
{
  "id": "gts.frontx.v.query.query.v1~frontx.demo.query.milestone_summary.v1",
  "input_entity_types": [
    "gts.frontx.demo.github.issue.v1~"
  ],
  "filter_scopes": [
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_repo.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_milestones.v1~"
  ],
  "output_widget_data_type": "gts.frontx.v.widget_data.progress_list_card.v1~",
  "pipeline": [
    {
      "op": "group_by",
      "key": "milestone"
    },
    {
      "op": "count_by",
      "key": "state",
      "into": {
        "closed": "CLOSED",
        "open": "OPEN"
      }
    }
  ]
}
```

**Cross-references**:

- Query base type: `gts.frontx.v.query.query.v1~` (feature-operator-variants §6.0a).
- Output Widget Data: `gts.frontx.v.widget_data.progress_list_card.v1~` (feature-widget-data §6.4).

### 6.10 Action Item Grid

**GTS instance ID**: `gts.frontx.v.query.query.v1~frontx.demo.query.action_item_grid.v1`

**Description**: Per-author action-items grid (PRs needing review, comments to reply, merge conflicts, no reviewers), producing a Grid with one row per action.

**Instance**:

```json
{
  "id": "gts.frontx.v.query.query.v1~frontx.demo.query.action_item_grid.v1",
  "input_entity_types": [
    "gts.frontx.demo.github.pull_request.v1~"
  ],
  "filter_scopes": [
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_author.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_team.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_repo.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.exclude_wip.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.has_pending_reviewers.v1~"
  ],
  "output_widget_data_type": "gts.frontx.v.widget_data.grid.v1~",
  "pipeline": [
    {
      "op": "filter",
      "predicate": "state == 'OPEN'"
    }
  ]
}
```

**Cross-references**:

- Query base type: `gts.frontx.v.query.query.v1~` (feature-operator-variants §6.0a).
- Output Widget Data: `gts.frontx.v.widget_data.grid.v1~` (feature-widget-data §6.5).

### 6.11 PR Grid

**GTS instance ID**: `gts.frontx.v.query.query.v1~frontx.demo.query.pr_grid.v1`

**Description**: Per-PR grid with PR metadata, status, LOC delta, comments, reviewers — producing a Grid.

**Instance**:

```json
{
  "id": "gts.frontx.v.query.query.v1~frontx.demo.query.pr_grid.v1",
  "input_entity_types": [
    "gts.frontx.demo.github.pull_request.v1~"
  ],
  "filter_scopes": [
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_author.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_repo.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_team.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_state.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_created_at_range.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_loc_changed_range.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.exclude_wip.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.bot_inclusion.v1~"
  ],
  "output_widget_data_type": "gts.frontx.v.widget_data.grid.v1~",
  "pipeline": [
    {
      "op": "project",
      "as": "loc_changed",
      "expr": "additions + deletions"
    }
  ]
}
```

**Cross-references**:

- Query base type: `gts.frontx.v.query.query.v1~` (feature-operator-variants §6.0a).
- Output Widget Data: `gts.frontx.v.widget_data.grid.v1~` (feature-widget-data §6.5).

### 6.12 PR Summary Grid

**GTS instance ID**: `gts.frontx.v.query.query.v1~frontx.demo.query.pr_summary_grid.v1`

**Description**: Per-PR summary grid with aggregated time-stats and review counts, producing a Grid.

**Instance**:

```json
{
  "id": "gts.frontx.v.query.query.v1~frontx.demo.query.pr_summary_grid.v1",
  "input_entity_types": [
    "gts.frontx.demo.github.pull_request.v1~",
    "gts.frontx.demo.github.review.v1~"
  ],
  "filter_scopes": [
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_author.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_repo.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_team.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_merged_at_range.v1~"
  ],
  "output_widget_data_type": "gts.frontx.v.widget_data.grid.v1~",
  "pipeline": [
    {
      "op": "join",
      "right_input": "gts.frontx.demo.github.review.v1~",
      "left_keys": ["id"],
      "right_keys": ["pr_id"],
      "join_type": "left",
      "embed_field": "reviews"
    }
  ]
}
```

**Cross-references**:

- Query base type: `gts.frontx.v.query.query.v1~` (feature-operator-variants §6.0a).
- Output Widget Data: `gts.frontx.v.widget_data.grid.v1~` (feature-widget-data §6.5).

### 6.13 Review Turnaround Grid

**GTS instance ID**: `gts.frontx.v.query.query.v1~frontx.demo.query.review_turnaround_grid.v1`

**Description**: Per-PR review turnaround grid with median/mean/min/max latency stats, producing a Grid.

**Instance**:

```json
{
  "id": "gts.frontx.v.query.query.v1~frontx.demo.query.review_turnaround_grid.v1",
  "input_entity_types": [
    "gts.frontx.demo.github.pull_request.v1~",
    "gts.frontx.demo.github.review.v1~"
  ],
  "filter_scopes": [
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_author.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_repo.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_team.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_created_at_range.v1~"
  ],
  "output_widget_data_type": "gts.frontx.v.widget_data.grid.v1~",
  "pipeline": [
    {
      "op": "join",
      "right_input": "gts.frontx.demo.github.review.v1~",
      "left_keys": ["id"],
      "right_keys": ["pr_id"],
      "join_type": "inner",
      "embed_field": "reviews"
    },
    {
      "op": "project",
      "as": "review_latency_seconds",
      "expr": "duration_between(created_at, reviews[0].submitted_at)"
    }
  ]
}
```

**Cross-references**:

- Query base type: `gts.frontx.v.query.query.v1~` (feature-operator-variants §6.0a).
- Output Widget Data: `gts.frontx.v.widget_data.grid.v1~` (feature-widget-data §6.5).

### 6.14 Issues Created Grid

**GTS instance ID**: `gts.frontx.v.query.query.v1~frontx.demo.query.issues_created_grid.v1`

**Description**: Issues created over the filter window grid, producing a Grid with per-issue rows.

**Instance**:

```json
{
  "id": "gts.frontx.v.query.query.v1~frontx.demo.query.issues_created_grid.v1",
  "input_entity_types": [
    "gts.frontx.demo.github.issue.v1~"
  ],
  "filter_scopes": [
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_repo.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_team.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_created_at_range.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_issue_types.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_labels.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_assignees.v1~"
  ],
  "output_widget_data_type": "gts.frontx.v.widget_data.grid.v1~",
  "pipeline": []
}
```

**Cross-references**:

- Query base type: `gts.frontx.v.query.query.v1~` (feature-operator-variants §6.0a).
- Output Widget Data: `gts.frontx.v.widget_data.grid.v1~` (feature-widget-data §6.5).

### 6.15 Open Issues Grid

**GTS instance ID**: `gts.frontx.v.query.query.v1~frontx.demo.query.open_issues_grid.v1`

**Description**: Currently-open issues grid with assignee, milestone, project, label info, producing a Grid.

**Instance**:

```json
{
  "id": "gts.frontx.v.query.query.v1~frontx.demo.query.open_issues_grid.v1",
  "input_entity_types": [
    "gts.frontx.demo.github.issue.v1~"
  ],
  "filter_scopes": [
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_repo.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_team.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_assignees.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_state.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_labels.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_projects.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_milestones.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_issue_numbers.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_issue_types.v1~"
  ],
  "output_widget_data_type": "gts.frontx.v.widget_data.grid.v1~",
  "pipeline": [
    {
      "op": "filter",
      "predicate": "state == 'OPEN'"
    }
  ]
}
```

**Cross-references**:

- Query base type: `gts.frontx.v.query.query.v1~` (feature-operator-variants §6.0a).
- Output Widget Data: `gts.frontx.v.widget_data.grid.v1~` (feature-widget-data §6.5).

### 6.16 Team Stats Grid

**GTS instance ID**: `gts.frontx.v.query.query.v1~frontx.demo.query.team_stats_grid.v1`

**Description**: Per-team aggregated stats grid (PR count, merged count, LOC totals), producing a Grid with one row per team.

**Instance**:

```json
{
  "id": "gts.frontx.v.query.query.v1~frontx.demo.query.team_stats_grid.v1",
  "input_entity_types": [
    "gts.frontx.demo.github.pull_request.v1~",
    "gts.frontx.demo.github.commit.v1~"
  ],
  "filter_scopes": [
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_team.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_repo.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_created_at_range.v1~"
  ],
  "output_widget_data_type": "gts.frontx.v.widget_data.grid.v1~",
  "pipeline": [
    {
      "op": "group_by",
      "key": "author_team_name"
    },
    {
      "op": "count_all",
      "into": "pr_count"
    },
    {
      "op": "sum",
      "field": "additions + deletions",
      "into": "loc_changed"
    }
  ]
}
```

**Cross-references**:

- Query base type: `gts.frontx.v.query.query.v1~` (feature-operator-variants §6.0a).
- Output Widget Data: `gts.frontx.v.widget_data.grid.v1~` (feature-widget-data §6.5).

### 6.17 Contributor Grid

**GTS instance ID**: `gts.frontx.v.query.query.v1~frontx.demo.query.contributor_grid.v1`

**Description**: Per-contributor activity grid (PRs merged, comments written, score, reward tier), producing a Grid.

**Instance**:

```json
{
  "id": "gts.frontx.v.query.query.v1~frontx.demo.query.contributor_grid.v1",
  "input_entity_types": [
    "gts.frontx.demo.github.user.v1~"
  ],
  "filter_scopes": [
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_team.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.bot_inclusion.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_score_threshold.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_min_prs_merged.v1~"
  ],
  "output_widget_data_type": "gts.frontx.v.widget_data.grid.v1~",
  "pipeline": []
}
```

**Cross-references**:

- Query base type: `gts.frontx.v.query.query.v1~` (feature-operator-variants §6.0a).
- Output Widget Data: `gts.frontx.v.widget_data.grid.v1~` (feature-widget-data §6.5).

### 6.18 Commit Drilldown Grid

**GTS instance ID**: `gts.frontx.v.query.query.v1~frontx.demo.query.commit_drilldown_grid.v1`

**Description**: Per-commit drilldown grid (within a PR or chart bucket context), producing a Grid with one row per commit.

**Instance**:

```json
{
  "id": "gts.frontx.v.query.query.v1~frontx.demo.query.commit_drilldown_grid.v1",
  "input_entity_types": [
    "gts.frontx.demo.github.commit.v1~"
  ],
  "filter_scopes": [
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_author.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_repo.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_team.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_committed_at_range.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_message_contains.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_pr_numbers.v1~"
  ],
  "output_widget_data_type": "gts.frontx.v.widget_data.grid.v1~",
  "pipeline": []
}
```

**Cross-references**:

- Query base type: `gts.frontx.v.query.query.v1~` (feature-operator-variants §6.0a).
- Output Widget Data: `gts.frontx.v.widget_data.grid.v1~` (feature-widget-data §6.5).

### 6.19 LOC Metrics Drilldown Grid

**GTS instance ID**: `gts.frontx.v.query.query.v1~frontx.demo.query.loc_metrics_drilldown_grid.v1`

**Description**: Per-PR LOC drilldown grid with per-language breakdown, producing a Grid.

**Instance**:

```json
{
  "id": "gts.frontx.v.query.query.v1~frontx.demo.query.loc_metrics_drilldown_grid.v1",
  "input_entity_types": [
    "gts.frontx.demo.github.commit.v1~"
  ],
  "filter_scopes": [
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_author.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_repo.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_committed_at_range.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_language.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_pr_numbers.v1~"
  ],
  "output_widget_data_type": "gts.frontx.v.widget_data.grid.v1~",
  "pipeline": [
    {
      "op": "group_by",
      "key": "language"
    },
    {
      "op": "sum",
      "field": "additions",
      "into": "added"
    },
    {
      "op": "sum",
      "field": "deletions",
      "into": "removed"
    }
  ]
}
```

**Cross-references**:

- Query base type: `gts.frontx.v.query.query.v1~` (feature-operator-variants §6.0a).
- Output Widget Data: `gts.frontx.v.widget_data.grid.v1~` (feature-widget-data §6.5).

### 6.20 Comments-To-Reply Drilldown Grid

**GTS instance ID**: `gts.frontx.v.query.query.v1~frontx.demo.query.comments_to_reply_drilldown_grid.v1`

**Description**: Per-comment drilldown grid for unreplied / important-bot comments needing response, producing a Grid.

**Instance**:

```json
{
  "id": "gts.frontx.v.query.query.v1~frontx.demo.query.comments_to_reply_drilldown_grid.v1",
  "input_entity_types": [
    "gts.frontx.demo.github.pr_comment.v1~",
    "gts.frontx.demo.github.thread_comment.v1~"
  ],
  "filter_scopes": [
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_author.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_repo.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.unreplied_only.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.important_bots_only.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_pr_numbers.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_comment_source.v1~"
  ],
  "output_widget_data_type": "gts.frontx.v.widget_data.grid.v1~",
  "pipeline": []
}
```

**Cross-references**:

- Query base type: `gts.frontx.v.query.query.v1~` (feature-operator-variants §6.0a).
- Output Widget Data: `gts.frontx.v.widget_data.grid.v1~` (feature-widget-data §6.5).

### 6.21 Latency Drilldown Grid

**GTS instance ID**: `gts.frontx.v.query.query.v1~frontx.demo.query.latency_drilldown_grid.v1`

**Description**: Per-PR latency drilldown grid (review latency, comment latency, time-to-merge), producing a Grid.

**Instance**:

```json
{
  "id": "gts.frontx.v.query.query.v1~frontx.demo.query.latency_drilldown_grid.v1",
  "input_entity_types": [
    "gts.frontx.demo.github.pull_request.v1~",
    "gts.frontx.demo.github.review.v1~"
  ],
  "filter_scopes": [
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_author.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_repo.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_created_at_range.v1~"
  ],
  "output_widget_data_type": "gts.frontx.v.widget_data.grid.v1~",
  "pipeline": [
    {
      "op": "join",
      "right_input": "gts.frontx.demo.github.review.v1~",
      "left_keys": ["id"],
      "right_keys": ["pr_id"],
      "join_type": "left",
      "embed_field": "reviews"
    }
  ]
}
```

**Cross-references**:

- Query base type: `gts.frontx.v.query.query.v1~` (feature-operator-variants §6.0a).
- Output Widget Data: `gts.frontx.v.widget_data.grid.v1~` (feature-widget-data §6.5).

### 6.22 PR Status Buckets Chart

**GTS instance ID**: `gts.frontx.v.query.query.v1~frontx.demo.query.pr_status_buckets_chart.v1`

**Description**: PR-status counts bucketed over time (week/month/quarter), producing a CartesianChart with one stacked-bar series per status.

**Instance**:

```json
{
  "id": "gts.frontx.v.query.query.v1~frontx.demo.query.pr_status_buckets_chart.v1",
  "input_entity_types": [
    "gts.frontx.demo.github.pull_request.v1~"
  ],
  "filter_scopes": [
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_author.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_repo.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_team.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_created_at_range.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.exclude_wip.v1~"
  ],
  "output_widget_data_type": "gts.frontx.v.widget_data.cartesian_chart.v1~",
  "pipeline": [
    {
      "op": "time_bucketize",
      "time_field": "created_at",
      "granularity": "week",
      "bucket_field": "bucket"
    },
    {
      "op": "group_by",
      "key": "bucket"
    },
    {
      "op": "count_by",
      "key": "derived_merge_status",
      "into": {
        "ready": "ready",
        "in_review": "in_review",
        "merged": "merged",
        "closed": "closed"
      }
    }
  ]
}
```

**Cross-references**:

- Query base type: `gts.frontx.v.query.query.v1~` (feature-operator-variants §6.0a).
- Output Widget Data: `gts.frontx.v.widget_data.cartesian_chart.v1~` (feature-widget-data §6.6).

### 6.23 PRs Opened Over Time Chart

**GTS instance ID**: `gts.frontx.v.query.query.v1~frontx.demo.query.prs_opened_over_time_chart.v1`

**Description**: Count of PRs opened per time bucket, producing a CartesianChart with a single bar series.

**Instance**:

```json
{
  "id": "gts.frontx.v.query.query.v1~frontx.demo.query.prs_opened_over_time_chart.v1",
  "input_entity_types": [
    "gts.frontx.demo.github.pull_request.v1~"
  ],
  "filter_scopes": [
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_author.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_repo.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_team.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_created_at_range.v1~"
  ],
  "output_widget_data_type": "gts.frontx.v.widget_data.cartesian_chart.v1~",
  "pipeline": [
    {
      "op": "time_bucketize",
      "time_field": "created_at",
      "granularity": "week",
      "bucket_field": "bucket"
    },
    {
      "op": "group_by",
      "key": "bucket"
    },
    {
      "op": "count_all",
      "into": "count"
    }
  ]
}
```

**Cross-references**:

- Query base type: `gts.frontx.v.query.query.v1~` (feature-operator-variants §6.0a).
- Output Widget Data: `gts.frontx.v.widget_data.cartesian_chart.v1~` (feature-widget-data §6.6).

### 6.24 Latency Over Time Chart

**GTS instance ID**: `gts.frontx.v.query.query.v1~frontx.demo.query.latency_over_time_chart.v1`

**Description**: Mean review latency per time bucket, producing a CartesianChart with a single line series.

**Instance**:

```json
{
  "id": "gts.frontx.v.query.query.v1~frontx.demo.query.latency_over_time_chart.v1",
  "input_entity_types": [
    "gts.frontx.demo.github.pull_request.v1~",
    "gts.frontx.demo.github.review.v1~"
  ],
  "filter_scopes": [
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_author.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_repo.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_team.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_created_at_range.v1~"
  ],
  "output_widget_data_type": "gts.frontx.v.widget_data.cartesian_chart.v1~",
  "pipeline": [
    {
      "op": "join",
      "right_input": "gts.frontx.demo.github.review.v1~",
      "left_keys": ["id"],
      "right_keys": ["pr_id"],
      "join_type": "inner",
      "embed_field": "reviews"
    },
    {
      "op": "time_bucketize",
      "time_field": "created_at",
      "granularity": "week",
      "bucket_field": "bucket"
    },
    {
      "op": "group_by",
      "key": "bucket"
    },
    {
      "op": "mean",
      "field": "review_latency_seconds",
      "into": "mean_latency"
    }
  ]
}
```

**Cross-references**:

- Query base type: `gts.frontx.v.query.query.v1~` (feature-operator-variants §6.0a).
- Output Widget Data: `gts.frontx.v.widget_data.cartesian_chart.v1~` (feature-widget-data §6.6).

### 6.25 LOC Over Time Chart

**GTS instance ID**: `gts.frontx.v.query.query.v1~frontx.demo.query.loc_over_time_chart.v1`

**Description**: LOC added/removed/net per time bucket, producing a CartesianChart with multiple stacked series.

**Instance**:

```json
{
  "id": "gts.frontx.v.query.query.v1~frontx.demo.query.loc_over_time_chart.v1",
  "input_entity_types": [
    "gts.frontx.demo.github.commit.v1~"
  ],
  "filter_scopes": [
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_author.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_repo.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_team.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_committed_at_range.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_language.v1~"
  ],
  "output_widget_data_type": "gts.frontx.v.widget_data.cartesian_chart.v1~",
  "pipeline": [
    {
      "op": "time_bucketize",
      "time_field": "committed_at",
      "granularity": "week",
      "bucket_field": "bucket"
    },
    {
      "op": "group_by",
      "key": "bucket"
    },
    {
      "op": "sum",
      "field": "additions",
      "into": "added"
    },
    {
      "op": "sum",
      "field": "deletions",
      "into": "removed"
    }
  ]
}
```

**Cross-references**:

- Query base type: `gts.frontx.v.query.query.v1~` (feature-operator-variants §6.0a).
- Output Widget Data: `gts.frontx.v.widget_data.cartesian_chart.v1~` (feature-widget-data §6.6).

### 6.26 Comment Category Over Time Chart

**GTS instance ID**: `gts.frontx.v.query.query.v1~frontx.demo.query.comment_category_over_time_chart.v1`

**Description**: Comment counts split by author kind (human / bot_critical / bot_non_critical) per time bucket, producing a CartesianChart with one series per category.

**Instance**:

```json
{
  "id": "gts.frontx.v.query.query.v1~frontx.demo.query.comment_category_over_time_chart.v1",
  "input_entity_types": [
    "gts.frontx.demo.github.pr_comment.v1~",
    "gts.frontx.demo.github.thread_comment.v1~"
  ],
  "filter_scopes": [
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_author.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_repo.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_created_at_range.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_comment_source.v1~"
  ],
  "output_widget_data_type": "gts.frontx.v.widget_data.cartesian_chart.v1~",
  "pipeline": [
    {
      "op": "time_bucketize",
      "time_field": "created_at",
      "granularity": "week",
      "bucket_field": "bucket"
    },
    {
      "op": "group_by",
      "key": "bucket"
    },
    {
      "op": "count_by",
      "key": "comment_focus",
      "into": {
        "human": "human",
        "bot_critical": "bot_critical",
        "bot_non_critical": "bot_non_critical"
      }
    }
  ]
}
```

**Cross-references**:

- Query base type: `gts.frontx.v.query.query.v1~` (feature-operator-variants §6.0a).
- Output Widget Data: `gts.frontx.v.widget_data.cartesian_chart.v1~` (feature-widget-data §6.6).

### 6.27 Commit Over Time Chart

**GTS instance ID**: `gts.frontx.v.query.query.v1~frontx.demo.query.commit_over_time_chart.v1`

**Description**: Commit count per time bucket, producing a CartesianChart with a single bar series.

**Instance**:

```json
{
  "id": "gts.frontx.v.query.query.v1~frontx.demo.query.commit_over_time_chart.v1",
  "input_entity_types": [
    "gts.frontx.demo.github.commit.v1~"
  ],
  "filter_scopes": [
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_author.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_repo.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_team.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_committed_at_range.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_message_contains.v1~"
  ],
  "output_widget_data_type": "gts.frontx.v.widget_data.cartesian_chart.v1~",
  "pipeline": [
    {
      "op": "time_bucketize",
      "time_field": "committed_at",
      "granularity": "week",
      "bucket_field": "bucket"
    },
    {
      "op": "group_by",
      "key": "bucket"
    },
    {
      "op": "count_all",
      "into": "count"
    }
  ]
}
```

**Cross-references**:

- Query base type: `gts.frontx.v.query.query.v1~` (feature-operator-variants §6.0a).
- Output Widget Data: `gts.frontx.v.widget_data.cartesian_chart.v1~` (feature-widget-data §6.6).

### 6.28 Issue Type Over Time Chart

**GTS instance ID**: `gts.frontx.v.query.query.v1~frontx.demo.query.issue_type_over_time_chart.v1`

**Description**: Issue counts split by issue type per time bucket, producing a CartesianChart with one series per type.

**Instance**:

```json
{
  "id": "gts.frontx.v.query.query.v1~frontx.demo.query.issue_type_over_time_chart.v1",
  "input_entity_types": [
    "gts.frontx.demo.github.issue.v1~"
  ],
  "filter_scopes": [
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_repo.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_team.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_created_at_range.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_issue_types.v1~"
  ],
  "output_widget_data_type": "gts.frontx.v.widget_data.cartesian_chart.v1~",
  "pipeline": [
    {
      "op": "time_bucketize",
      "time_field": "created_at",
      "granularity": "week",
      "bucket_field": "bucket"
    },
    {
      "op": "group_by",
      "key": "bucket"
    },
    {
      "op": "count_by",
      "key": "issue_type",
      "into": {
        "task": "Task",
        "bug": "Bug",
        "feature": "Feature"
      }
    }
  ]
}
```

**Cross-references**:

- Query base type: `gts.frontx.v.query.query.v1~` (feature-operator-variants §6.0a).
- Output Widget Data: `gts.frontx.v.widget_data.cartesian_chart.v1~` (feature-widget-data §6.6).

### 6.29 Contributor Activity Heatmap

**GTS instance ID**: `gts.frontx.v.query.query.v1~frontx.demo.query.contributor_activity_heatmap.v1`

**Description**: Two-axis contributor-activity heatmap (contributor x time bucket), producing a Heatmap.

**Instance**:

```json
{
  "id": "gts.frontx.v.query.query.v1~frontx.demo.query.contributor_activity_heatmap.v1",
  "input_entity_types": [
    "gts.frontx.demo.github.commit.v1~"
  ],
  "filter_scopes": [
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_team.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_repo.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_committed_at_range.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.bot_inclusion.v1~"
  ],
  "output_widget_data_type": "gts.frontx.v.widget_data.heatmap.v1~",
  "pipeline": [
    {
      "op": "time_bucketize",
      "time_field": "committed_at",
      "granularity": "week",
      "bucket_field": "bucket"
    },
    {
      "op": "project",
      "as": "x",
      "expr": "bucket"
    },
    {
      "op": "project",
      "as": "y",
      "expr": "author_login"
    },
    {
      "op": "group_by",
      "key": "x + '|' + y"
    },
    {
      "op": "count_all",
      "into": "value"
    }
  ]
}
```

**Cross-references**:

- Query base type: `gts.frontx.v.query.query.v1~` (feature-operator-variants §6.0a).
- Output Widget Data: `gts.frontx.v.widget_data.heatmap.v1~` (feature-widget-data §6.8).

### 6.30 Contributor Activity Pie

**GTS instance ID**: `gts.frontx.v.query.query.v1~frontx.demo.query.contributor_activity_pie.v1`

**Description**: Per-team or per-bucket contribution share, producing a PieChart with one segment per category.

**Instance**:

```json
{
  "id": "gts.frontx.v.query.query.v1~frontx.demo.query.contributor_activity_pie.v1",
  "input_entity_types": [
    "gts.frontx.demo.github.pull_request.v1~"
  ],
  "filter_scopes": [
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_team.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_repo.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_merged_at_range.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.bot_inclusion.v1~"
  ],
  "output_widget_data_type": "gts.frontx.v.widget_data.pie_chart.v1~",
  "pipeline": [
    {
      "op": "group_by",
      "key": "author_team_name"
    },
    {
      "op": "count_all",
      "into": "value"
    }
  ]
}
```

**Cross-references**:

- Query base type: `gts.frontx.v.query.query.v1~` (feature-operator-variants §6.0a).
- Output Widget Data: `gts.frontx.v.widget_data.pie_chart.v1~` (feature-widget-data §6.7).

### 6.31 Action Items Per User Grid

**GTS instance ID**: `gts.frontx.v.query.query.v1~frontx.demo.query.action_items_per_user_grid.v1`

**Description**: Per-user Action Items grid producing one row per user with subquery-driven roll-ups (PRs needing review, comments to reply, merge conflicts, no reviewers) plus median time-to-action statistics.

**Instance**:

```json
{
  "id": "gts.frontx.v.query.query.v1~frontx.demo.query.action_items_per_user_grid.v1",
  "input_entity_types": [
    "gts.frontx.demo.github.pull_request.v1~"
  ],
  "filter_scopes": [
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_team.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_repo.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_created_at_range.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.exclude_wip.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.bot_inclusion.v1~"
  ],
  "output_widget_data_type": "gts.frontx.v.widget_data.grid.v1~",
  "pipeline": [
    {
      "op": "filter",
      "predicate": "state == 'OPEN'"
    },
    {
      "op": "group_by",
      "key": "author_login"
    },
    {
      "op": "subquery",
      "filter": "has_pending_reviewers == true",
      "ops": [
        { "op": "count_all", "into": "reviews_needed" },
        { "op": "median", "field": "duration_since(created_at)", "into": "reviews_needed_age_median" }
      ],
      "into": "reviews_needed_rollup"
    },
    {
      "op": "subquery",
      "filter": "unreplied_human_count > 0",
      "ops": [
        { "op": "count_all", "into": "comments_to_reply" },
        { "op": "median", "field": "oldest_unreplied_age_seconds", "into": "comments_to_reply_age_median" }
      ],
      "into": "comments_to_reply_rollup"
    },
    {
      "op": "subquery",
      "filter": "derived_merge_status == 'CONFLICT'",
      "ops": [
        { "op": "count_all", "into": "merge_conflicts" }
      ],
      "into": "merge_conflicts_rollup"
    },
    {
      "op": "subquery",
      "filter": "requested_reviewers_count == 0",
      "ops": [
        { "op": "count_all", "into": "prs_no_reviewers" }
      ],
      "into": "prs_no_reviewers_rollup"
    }
  ]
}
```

**Cross-references**:

- Query base type: `gts.frontx.v.query.query.v1~` (feature-operator-variants §6.0a).
- Output Widget Data: `gts.frontx.v.widget_data.grid.v1~` (feature-widget-data §6.5).
- Operators: `subquery` (feature-operator-variants §6.17), `median` (feature-operator-variants §6.12), `group_by` (feature-operator-variants §6.3), `count_all` (feature-operator-variants §6.5), `filter` (feature-operator-variants §6.1).
- Aspects: `gts.frontx.demo.entity_aspect.has_derived_merge_status.v1~` (feature-aspect §6.17 — predicate over `derived_merge_status`).
- Requirement coverage: `cpt-frontx-dashboard-fr-widget-catalog`.

### 6.32 PR Summary Grid With Median

**GTS instance ID**: `gts.frontx.v.query.query.v1~frontx.demo.query.pr_summary_grid_with_median.v1`

**Description**: Per-author PR Summary grid producing one row per author with PR-size and PR-lifetime median statistics in addition to mean / min / max time stats.

**Instance**:

```json
{
  "id": "gts.frontx.v.query.query.v1~frontx.demo.query.pr_summary_grid_with_median.v1",
  "input_entity_types": [
    "gts.frontx.demo.github.pull_request.v1~",
    "gts.frontx.demo.github.review.v1~"
  ],
  "filter_scopes": [
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_author.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_repo.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_team.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_merged_at_range.v1~"
  ],
  "output_widget_data_type": "gts.frontx.v.widget_data.grid.v1~",
  "pipeline": [
    {
      "op": "join",
      "right_input": "gts.frontx.demo.github.review.v1~",
      "left_keys": ["id"],
      "right_keys": ["pr_id"],
      "join_type": "left",
      "embed_field": "reviews"
    },
    {
      "op": "group_by",
      "key": "author_login"
    },
    {
      "op": "count_all",
      "into": "prs_total"
    },
    {
      "op": "median",
      "field": "additions + deletions",
      "into": "loc_changed_median"
    },
    {
      "op": "median",
      "field": "duration_between(created_at, merged_at)",
      "into": "merge_time_median"
    },
    {
      "op": "mean",
      "field": "duration_between(created_at, merged_at)",
      "into": "merge_time_mean"
    },
    {
      "op": "min",
      "field": "duration_between(created_at, merged_at)",
      "into": "merge_time_min"
    },
    {
      "op": "max",
      "field": "duration_between(created_at, merged_at)",
      "into": "merge_time_max"
    }
  ]
}
```

**Cross-references**:

- Query base type: `gts.frontx.v.query.query.v1~` (feature-operator-variants §6.0a).
- Output Widget Data: `gts.frontx.v.widget_data.grid.v1~` (feature-widget-data §6.5).
- Operators: `join` (feature-operator-variants §6.11), `group_by` (feature-operator-variants §6.3), `count_all` (feature-operator-variants §6.5), `median` (feature-operator-variants §6.12), `mean` (feature-operator-variants §6.7), `min` (feature-operator-variants §6.8), `max` (feature-operator-variants §6.9).
- Requirement coverage: `cpt-frontx-dashboard-fr-widget-catalog`.

### 6.33 Review Turnaround Grid With Median

**GTS instance ID**: `gts.frontx.v.query.query.v1~frontx.demo.query.review_turnaround_grid_with_median.v1`

**Description**: Per-reviewer Review Turnaround grid with median + p95 percentile turnaround statistics in addition to mean / min / max latency.

**Instance**:

```json
{
  "id": "gts.frontx.v.query.query.v1~frontx.demo.query.review_turnaround_grid_with_median.v1",
  "input_entity_types": [
    "gts.frontx.demo.github.pull_request.v1~",
    "gts.frontx.demo.github.review.v1~"
  ],
  "filter_scopes": [
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_author.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_repo.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_team.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_created_at_range.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.bot_inclusion.v1~"
  ],
  "output_widget_data_type": "gts.frontx.v.widget_data.grid.v1~",
  "pipeline": [
    {
      "op": "join",
      "right_input": "gts.frontx.demo.github.review.v1~",
      "left_keys": ["id"],
      "right_keys": ["pr_id"],
      "join_type": "inner",
      "embed_field": "reviews"
    },
    {
      "op": "project",
      "as": "review_latency_seconds",
      "expr": "duration_between(created_at, reviews[0].submitted_at)"
    },
    {
      "op": "group_by",
      "key": "reviews[0].reviewer_login"
    },
    {
      "op": "count_all",
      "into": "prs_reviewed"
    },
    {
      "op": "median",
      "field": "review_latency_seconds",
      "into": "review_latency_median"
    },
    {
      "op": "percentile",
      "field": "review_latency_seconds",
      "p": 0.95,
      "into": "review_latency_p95"
    },
    {
      "op": "mean",
      "field": "review_latency_seconds",
      "into": "review_latency_mean"
    },
    {
      "op": "min",
      "field": "review_latency_seconds",
      "into": "review_latency_min"
    },
    {
      "op": "max",
      "field": "review_latency_seconds",
      "into": "review_latency_max"
    }
  ]
}
```

**Cross-references**:

- Query base type: `gts.frontx.v.query.query.v1~` (feature-operator-variants §6.0a).
- Output Widget Data: `gts.frontx.v.widget_data.grid.v1~` (feature-widget-data §6.5).
- Operators: `join` (feature-operator-variants §6.11), `project` (feature-operator-variants §6.2), `group_by` (feature-operator-variants §6.3), `count_all` (feature-operator-variants §6.5), `median` (feature-operator-variants §6.12), `percentile` (feature-operator-variants §6.13), `mean` (feature-operator-variants §6.7), `min` (feature-operator-variants §6.8), `max` (feature-operator-variants §6.9).
- Requirement coverage: `cpt-frontx-dashboard-fr-widget-catalog`.

### 6.34 Team Stats Pivot Grid

**GTS instance ID**: `gts.frontx.v.query.query.v1~frontx.demo.query.team_stats_pivot_grid.v1`

**Description**: Team × code-path LOC matrix grid (rows = code paths, columns = teams) produced by the pivot operator.

**Instance**:

```json
{
  "id": "gts.frontx.v.query.query.v1~frontx.demo.query.team_stats_pivot_grid.v1",
  "input_entity_types": [
    "gts.frontx.demo.github.commit.v1~"
  ],
  "filter_scopes": [
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_team.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_repo.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_committed_at_range.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_language.v1~"
  ],
  "output_widget_data_type": "gts.frontx.v.widget_data.grid.v1~",
  "pipeline": [
    {
      "op": "project",
      "as": "loc_changed",
      "expr": "additions + deletions"
    },
    {
      "op": "pivot",
      "row_key": "code_path",
      "col_key": "author_team_name",
      "value": "loc_changed",
      "into": "team_code_path_matrix"
    }
  ]
}
```

**Cross-references**:

- Query base type: `gts.frontx.v.query.query.v1~` (feature-operator-variants §6.0a).
- Output Widget Data: `gts.frontx.v.widget_data.grid.v1~` (feature-widget-data §6.5).
- Operators: `project` (feature-operator-variants §6.2), `pivot` (feature-operator-variants §6.16).
- Aspects: `gts.frontx.demo.entity_aspect.has_code_path.v1~` (feature-aspect §6.16 — `code_path` row key); `gts.frontx.demo.entity_aspect.has_team.v1~` (feature-aspect §6.2 — `author_team_name` col key).
- Requirement coverage: `cpt-frontx-dashboard-fr-widget-catalog`.

### 6.35 Commit Over Time With Moving Average

**GTS instance ID**: `gts.frontx.v.query.query.v1~frontx.demo.query.commit_over_time_with_moving_average.v1`

**Description**: Commit count per time bucket with a trailing-window moving-average overlay series, producing a CartesianChart with a bar series and a smoothed line series. Bucket size is selected at request time by the Worker via auto_bucketize from the active filter snapshot's date-range size.

**Instance**:

```json
{
  "id": "gts.frontx.v.query.query.v1~frontx.demo.query.commit_over_time_with_moving_average.v1",
  "input_entity_types": [
    "gts.frontx.demo.github.commit.v1~"
  ],
  "filter_scopes": [
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_author.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_repo.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_team.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_committed_at_range.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_message_contains.v1~"
  ],
  "output_widget_data_type": "gts.frontx.v.widget_data.cartesian_chart.v1~",
  "pipeline": [
    {
      "op": "auto_bucketize",
      "time_field": "committed_at",
      "granularity": "auto",
      "bucket_field": "bucket"
    },
    {
      "op": "group_by",
      "key": "bucket"
    },
    {
      "op": "count_all",
      "into": "count"
    },
    {
      "op": "moving_average",
      "field": "count",
      "order_by": "bucket",
      "window": 4,
      "into": "count_moving_avg"
    }
  ]
}
```

**Cross-references**:

- Query base type: `gts.frontx.v.query.query.v1~` (feature-operator-variants §6.0a).
- Output Widget Data: `gts.frontx.v.widget_data.cartesian_chart.v1~` (feature-widget-data §6.6).
- Operators: `auto_bucketize` (feature-operator-variants §6.18), `group_by` (feature-operator-variants §6.3), `count_all` (feature-operator-variants §6.5), `moving_average` (feature-operator-variants §6.15).
- Aspects: `gts.frontx.demo.entity_aspect.has_committed_at.v1~` (feature-aspect §6.8 — `committed_at` time field).
- Requirement coverage: `cpt-frontx-dashboard-fr-widget-catalog`; `cpt-frontx-dashboard-fr-time-bucket-granularity`.

### 6.36 Contributor Grid With Score

**GTS instance ID**: `gts.frontx.v.query.query.v1~frontx.demo.query.contributor_grid_with_score.v1`

**Description**: Per-contributor activity grid producing one row per contributor with a `score` column read from the `has_score` aspect, plus a numeric ordering stable enough to drive the contributor ranking surface.

**Instance**:

```json
{
  "id": "gts.frontx.v.query.query.v1~frontx.demo.query.contributor_grid_with_score.v1",
  "input_entity_types": [
    "gts.frontx.demo.github.user.v1~"
  ],
  "filter_scopes": [
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_team.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.bot_inclusion.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_score_threshold.v1~",
    "gts.frontx.v.filter.filter.v1~frontx.demo.filter.by_min_prs_merged.v1~"
  ],
  "output_widget_data_type": "gts.frontx.v.widget_data.grid.v1~",
  "pipeline": [
    {
      "op": "project",
      "as": "score",
      "expr": "score"
    }
  ]
}
```

**Cross-references**:

- Query base type: `gts.frontx.v.query.query.v1~` (feature-operator-variants §6.0a).
- Output Widget Data: `gts.frontx.v.widget_data.grid.v1~` (feature-widget-data §6.5).
- Operators: `project` (feature-operator-variants §6.2).
- Aspects: `gts.frontx.demo.entity_aspect.has_score.v1~` (feature-aspect §6.14 — `score` field carrier).
- Requirement coverage: `cpt-frontx-dashboard-fr-widget-catalog`.

## 7. Acceptance Criteria

- [ ] All 36 Query instances are authored, one per widget-driving demo insight, and held in the `dashboard-demo` package
- [ ] Every instance conforms to the Query type schema (`gts.frontx.v.query.query.v1~`): required fields populated, no invented fields
- [ ] Every instance `id` follows the instance form `gts.frontx.v.query.query.v1~frontx.demo.query.<name>.v1` (no trailing `~`)
- [ ] Every instance `output_widget_data_type` references a widget data shape from the `widget-data` FEATURE
- [ ] Every instance `input_entity_types` references entity types from the `entity` FEATURE
- [ ] Every instance `filter_scopes` (when non-empty) references filter concretes from the `filter` FEATURE
- [ ] Every pipeline step is an Operator instance of one of the 18 variants in the `operator-variants` FEATURE, section 6.0b
- [ ] The CEL-scope open question ("Inherited from the prototype", see Open Questions) is recorded and referenced by the operator-variants catalog
- [ ] The 36 queries cover 7 of the 13 widget kinds; the 6 uncovered kinds are documented as a known gap

## Open Questions

- Aspect identifiers are rebased to `gts.frontx.demo.entity_aspect.<name>.v1~`; DESIGN section 3.1 fixes only the `gts.frontx.demo.*` prefix, so the `aspect` FEATURE must confirm this form.
- The prototype requirement `contributor-activity-scoring-and-reward-tiers` has no FrontX counterpart; the Contributor Grid With Score query is mapped to `cpt-frontx-dashboard-fr-widget-catalog`.
- The prototype "Parity recheck" and "Domain-model category" cross-reference lines were dropped because they point to prototype-only documents.
- Whether the 6 uncovered widget kinds receive demo queries is open (PRD limitations); this port adds none.
- **Inherited from the prototype**: (1) CEL scope: the operator-variants catalog describes expression fields beyond `filter.predicate` as CEL while ADR-0013 limits CEL to `filter.predicate`; see the `operator-variants` open question. (2) Several queries offer filters whose required aspects their input entities do not compose: comment-based queries with `by_repo` / `by_pr_numbers`, and user-based queries with `by_team`, `bot_inclusion`, `by_min_prs_merged`, `by_score_threshold`. (3) The `count_by` mapping on `derived_merge_status` (Pull Request Status Counts and related instances) uses lowercase buckets and `approved`, while the aspect enum is uppercase `READY, IN_REVIEW, CONFLICT, DRAFT, MERGED, CLOSED`. Comment queries also map `bot_non_critical` while the aspect enum defines `bot_other`. (4) `contributors_summary`, `contributor_snapshot_summary` and `loc_summary` pipelines do not produce all metrics their descriptions promise (`loc_summary` omits `net`). (5) `top_contributor` reads `author_score`, which `PullRequest` does not declare, and has no ranking stage. (6) Joins use `id` on `PullRequest` and `pr_id` on `Review`, which the entity schemas do not declare (review summary and latency queries). (7) `team_stats_grid` counts the mixed `PullRequest`+`Commit` collection into `pr_count`. (8) `loc_metrics_drilldown_grid` and `team_stats_pivot_grid` group `Commit` by `language` / `code_path`, which live on `CommitFile` under `Commit.files[]` (needs flattening).
