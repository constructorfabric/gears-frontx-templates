# Proposal record: Team tasks

The hand-off between the proposal and the build (references/record.md). Fill every field before the page is shown; a field with nothing to say gets `none`. Until the person answers, every field under "Selection" and "Build hand-off" reads `none yet`. Check it with `scripts/check-proposal.mjs <revision-dir>`.

## Revision

- Page id: team-tasks
- Revision: r2
- Replaces: r1
- Status: awaiting selection
- Created: 2026-11-20
- Proposal: proposal.html

## Request

- Request: "I need a page where the team sees all our tasks: who has what, what is late, and what is done."
- Purpose: one place where the team sees every task with its owner, status and due date, and opens a task's details
- Users: team members and the team lead
- Main task: find who has what and what is late
- Assumptions: everyone on the team sees every task; a task has a title, one assignee or none, a status, a due date or none, and a priority; the statuses are To do, In progress, In review and Done; up to about 100 open tasks
- Non-goals: comments, attachments and notifications; reports and charts; creating a task (New task opens the existing form)

## Proposal

- Design: one
- Recommended: none (one design: the table chosen on r1, due date first, Done behind a Show done switch, and the task details screen)
- Open questions: who may change a task's status (the Status select on task details); is a tasks data service planned or to be agreed (data)
- Ready answers: 1. anyone on the team (suggested), only the assignee; 2. mock data for now, agree the service later (suggested), agree the service now
- Decisions: the table layout (your feedback on r1): accepted; due date first (your feedback on r1): accepted; Done tasks behind a switch, off by default (your answer to q-2 on r1): accepted; who may change a status (our proposal): open q-1; a new tasks data request (the survey found none): open q-2
- Reuses: the page head with a title and one main button (Card, Button, as on Home); a table in a bordered card (Table in Card, as on Docs); status and overdue labels (Badge, as on Docs); the search field (Input, as on Docs). New: the counters, status tabs and filters (Tabs, Select, in the kit, used by no screen yet); owner initials (Avatar, in the kit, used by no screen yet); the Show done switch (Switch, in the kit, used by no screen yet)
- Optional parts: flow: not added, two screens one row click apart and no decision, which the map shows; storyboard: not added, no screen changes through an interaction the states leave out; guarantees: not added, the page promises nothing with only, never, always or cannot; position cue: added, 12 sections after the head

## Versions and survey

- Kit version: @gears-frontx/ui-kit 0.5.0
- Template versions: template-shell 0.1.0-alpha.9, template-mfe 0.1.0-alpha.8, template-design-guardrails 0.1.0-alpha.9 (applied), frontx-design-proposal skill 0.8.0
- Survey: Team Hub, side menu; screens Home /home (order 10) and Docs /docs (order 20) in team-mfe; services AccountsApiService and DocsApiService, no tasks service; theme default, light; DESIGN.md present; full output in survey.json

## Selection

- Person's words: none yet
- Chosen: none yet
- Answers: none yet
- Requested changes: none yet
- Selected on: none yet

## Build hand-off

- Route: none yet
- Menu place: none yet
- Regions: none yet
- Blocks: none yet
- Data fields: none yet
- States to build: none yet
- Kit gaps: none yet
