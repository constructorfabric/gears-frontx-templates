# Proposal record: Team tasks

The hand-off between the proposal and the build (references/record.md). Fill every field before the page is shown; a field with nothing to say gets `none`. Until the person answers, every field under "Selection" and "Build hand-off" reads `none yet`. Check it with `scripts/check-proposal.mjs <revision-dir>`.

## Revision

- Page id: team-tasks
- Revision: r2
- Replaces: r1
- Status: selected
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

- Person's words: "For the Team tasks proposal (page team-tasks, revision r2) I answer: build it as drawn. / My answers to the open questions: / 1. Anyone on the team may change a task's status, not only its assignee. / 2. No tasks data service is planned yet: the first version runs on mock data and the service is agreed later. / Changes: none"
- Chosen: design
- Answers: 1. anyone on the team may change a status (the suggested answer, sent by the person); 2. no tasks service yet: build on mock data, the service to be agreed later (the suggested answer, sent by the person)
- Requested changes: none
- Selected on: 2026-11-21

## Build hand-off

- Route: /tasks, one screen extension of a new team-tasks package; the task details are its in-screen /<id> sub-route, a sub-route with a back path, not a second menu entry; search, filters and Show done kept in the address of /tasks
- Menu place: third, after Home (10) and Docs (20): order 30, label Tasks; the details screen has no menu entry
- Regions: list at 1440 and 768: page head, counters row, filter row (search, assignee and priority selects, Show done switch), status tabs, table with Due first; list at 390: page head, the four counters in two rows, search, the status select instead of tabs with Show done beside it, list rows led by the due date instead of the table; details at 1440: back link, page head with Edit and Mark as done, description and activity on the left, the details card on the right; at 768 and 390 the details card moves above the description
- Blocks: page head = the title and one primary Button, as on Home; counters = a row of Cards with one number each; search = Input; filters = Select; Show done = Switch; status tabs = Tabs with a count Badge per tab; table block = kit Table inside a bordered Card, as on Docs; status and overdue = Badge; owner initials = Avatar; details fields = Field with Select and Input; activity = rows in a bordered Card
- Data fields: title, status, due date, priority, task id, description, activity: needs a new data request, to be agreed (mock data for now); assignee names exist today in AccountsApiService; counts are counted in the page from the list
- States to build: loading (skeleton rows under the head and filters), empty (no tasks, New task), error (message and Try again), full, nothing matches (clear search and filters), task not found (link back to the list)
- Kit gaps: none
