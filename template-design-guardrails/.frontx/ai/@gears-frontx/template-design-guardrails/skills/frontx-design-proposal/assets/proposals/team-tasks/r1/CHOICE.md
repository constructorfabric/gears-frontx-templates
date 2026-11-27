# Proposal record: Team tasks

The hand-off between the proposal and the build (references/record.md). Fill every field before the page is shown; a field with nothing to say gets `none`. Until the person answers, every field under "Selection" and "Build hand-off" reads `none yet`. Check it with `scripts/check-proposal.mjs <revision-dir>`.

## Revision

- Page id: team-tasks
- Revision: r1
- Replaces: none
- Status: replaced
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

- Design: options
- Option a: Table. Best for: a team lead who scans many tasks at once and compares due dates and owners. Trade-off: dense; long titles are cut to one line, and on a phone the table turns into a list.
- Option b: Cards. Best for: a small team with a few tasks each, often on a tablet or phone. Trade-off: about half as many tasks per screen as the table; comparing dates means reading each card.
- Option c: Board by status. Best for: a team that moves work through stages and talks about what is stuck. Trade-off: the Done column grows without end, and dragging needs a rule on who may change a status.
- Recommended: a, for the task list, because the request is about who has what and what is late, and the table shows owner, status and due date for every task in one view, sorted by due date
- Open questions: who may change a task's status (dragging in c, the Status select on task details); should Done tasks show by default (the tabs in a and b, the Done column in c); is a tasks data service planned or to be agreed (data)
- Ready answers: 1. anyone on the team (suggested), only the assignee; 2. only on request (suggested), under All, with the rest; 3. mock data for now, agree the service later (suggested), agree the service now
- Decisions: one list of every team task with owner, status and due date (the request): accepted; overdue filter (the request, "what is late"): accepted; the list layout, table, cards or board (our proposal): open, the options; Done tasks under All (our proposal): open q-2; status change by dragging in C (our proposal): open q-1; a new tasks data request (the survey found none): open q-3
- Reuses: the page head with a title and one main button (Card, Button, as on Home); a table in a bordered card (Table in Card, as on Docs); status and overdue labels (Badge, as on Docs); the search field (Input, as on Docs). New: status tabs and filters (Tabs, Select, in the kit, used by no screen yet); owner initials (Avatar, in the kit, used by no screen yet); board columns and dragging in c (no kit component; a kit gap)
- Optional parts: flow: not added, two screens one row click apart and no decision, which the map shows; storyboard: not added, the one drag (option C) moves a tile between columns as its drawing shows, and who may drag is open question 1; guarantees: not added, the page promises nothing with only, never, always or cannot; position cue: added, 14 sections after the head

## Versions and survey

- Kit version: @gears-frontx/ui-kit 0.5.0
- Template versions: template-shell 0.1.0-alpha.9, template-mfe 0.1.0-alpha.8, template-design-guardrails 0.1.0-alpha.9 (applied), frontx-design-proposal skill 0.8.0
- Survey: Team Hub, side menu; screens Home /home (order 10) and Docs /docs (order 20) in team-mfe; services AccountsApiService and DocsApiService, no tasks service; theme default, light; DESIGN.md present; full output in survey.json

## Selection

- Person's words: "The table. Put the due date first and hide Done tasks unless I ask for them, and show me that before I say ok."
- Chosen: a
- Answers: 2. Done tasks are hidden unless asked for; 1 and 3 not answered
- Requested changes: the due date as the first column; drawn again as r2
- Selected on: none yet

## Build hand-off

- Route: none yet
- Menu place: none yet
- Regions: none yet
- Blocks: none yet
- Data fields: none yet
- States to build: none yet
- Kit gaps: none yet
