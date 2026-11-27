# Proposal record: Docs

The hand-off between the proposal and the build (references/record.md). Fill every field before the page is shown; a field with nothing to say gets `none`. Until the person answers, every field under "Selection" and "Build hand-off" reads `none yet`. Check it with `scripts/check-proposal.mjs <revision-dir>`.

## Revision

- Page id: docs-redesign
- Revision: r1
- Replaces: none
- Status: awaiting selection
- Created: 2026-11-20
- Proposal: proposal.html

## Request

- Request: "Our Docs page is hard to use: everything sits behind three tabs, and Open throws you out to a file in a new tab. Make it one list I can search, where a document opens inside the app with its outline. Show me before you build."
- Purpose: find and read a document without leaving the app
- Users: everyone who reads the app's documentation
- Main task: find a document and read the part they need
- Assumptions: the three sections stay: Guides, API and Changelog; a document has a title, a section, a date or none, and headings; everyone who sees Docs today sees every document
- Non-goals: writing or editing documents; comments and ratings

## Proposal

- Design: one
- Recommended: none (one design)
- Open questions: is Download all still needed (Download all, removed); should an API link open straight at its heading, and are headings in the data (the outline, paths); who marks a guide as needing review (the Needs review badge)
- Ready answers: 1. not needed, remove it (suggested), still needed, keep it; 2. yes, open at the heading (suggested), no, open at the top; 3. its author, by hand (suggested), automatically after six months
- Decisions: one list with search instead of three tabs (the request): accepted; a document opens inside the app with its outline (the request): accepted; the Section filter in place of the tabs (our proposal): proposed; Download all removed (our proposal): open q-1; an API link opening at its heading (our proposal): open q-2; the Needs review badge (our proposal): open q-3
- Reuses: the page head and lead (as on Docs); the documents table in a card (Table in Card, as on Docs); section badges (Badge, as on Home); the section select (Select, as on Home); the back button (Button, as on Home); the search field (Input, as on Home). New: the outline of a document (a kit gap); search across the text (no component, a data request)
- Optional parts: flow: not added, two screens one click apart and no decision, which the map shows; storyboard: not added, no screen changes through an interaction the states leave out; guarantees: not added, the page promises nothing with only, never, always or cannot; position cue: added, 13 sections after the head

## Versions and survey

- Kit version: @gears-frontx/ui-kit 0.5.0
- Template versions: template-shell 0.1.0-alpha.9, template-mfe 0.1.0-alpha.8, template-design-guardrails 0.1.0-alpha.9 (applied), frontx-design-proposal skill 0.8.0
- Survey: Example App, top header with links at the far end and an underlined active link, phone header with a second row of links, its own SVG logo; screens Home /home, Docs /docs, their menu links carry /?screen=home and /?screen=docs (4 template examples, scaffolds and unregistered packages not shown); services AccountsApiService; theme default, light; DESIGN.md and DESIGN-RULES.md present

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
