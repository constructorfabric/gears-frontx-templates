# Proposal record: <page title>

The hand-off between the proposal and the build (references/record.md). Fill every field before the page is shown; a field with nothing to say gets `none`. Until the person answers, every field under "Selection" and "Build hand-off" reads `none yet`. Check it with `scripts/check-proposal.mjs <revision-dir>`.

## Revision

- Page id: <page-id, the folder name>
- Revision: <r1, r2, ...>
- Replaces: <none in r1; the previous revision, r1, r2, ...>
- Status: awaiting selection
- Created: <YYYY-MM-DD>
- Proposal: proposal.html

## Request

- Request: "<the request in the person's own words>"
- Purpose: <what the page is for>
- Users: <who uses it>
- Main task: <the one thing they do there>
- Assumptions: <each assumption; separate with "; ">
- Non-goals: <what the page does not do>

## Proposal

- Design: <one | options>
- Option a: <name>. Best for: <...>. Trade-off: <...>.
- Option b: <name>. Best for: <...>. Trade-off: <...>.
- Recommended: <option letter and the concrete reason | none (one design)>
- Open questions: <each question with the part it touches; separate with "; ">
- Ready answers: <for each open question its number, then its ready answers as the answer block shows them, the suggested one marked "(suggested)"; separate the answers with ", " and the questions with "; ">
- Decisions: <each choice the page draws, with its source and state: "<choice> (<the request | the survey | your feedback | our proposal>): <accepted | proposed | open q-n>"; separate with "; ">
- Reuses: <each part reused, in plain words, with its kit component and the existing screen that uses it; then "New:" and each new part with its kit component or "a kit gap">
- Optional parts: <for each of flow, storyboard, guarantees and position cue: "added" or "not added", then why, from its rule in references/page-parts.md; separated by semicolons>

Delete the Option lines with one design.

## Versions and survey

- Kit version: <@gears-frontx/ui-kit version from node_modules/@gears-frontx/ui-kit/package.json>
- Template versions: <each applied template and its version, then "frontx-design-proposal skill" and the version in this skill's SKILL.md>
- Survey: <app name, navigation, screens with routes, services, theme id; from scripts/survey-app.mjs>

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
