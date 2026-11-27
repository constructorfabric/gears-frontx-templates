# Proposal record: Account settings

The hand-off between the proposal and the build (references/record.md). Fill every field before the page is shown; a field with nothing to say gets `none`. Until the person answers, every field under "Selection" and "Build hand-off" reads `none yet`. Check it with `scripts/check-proposal.mjs <revision-dir>`.

## Revision

- Page id: account-settings
- Revision: r1
- Replaces: none
- Status: awaiting selection
- Created: 2026-11-20
- Proposal: proposal.html

## Request

- Request: "Add an account settings page where I can change my display name, my language and which emails I get. One page is enough, no options needed."
- Purpose: let a person change their own display name, language and email choices
- Users: every signed-in person
- Main task: change a setting and save it
- Assumptions: the person changes only their own account; the email address comes from sign-in and is shown, not changed here; security alerts cannot be turned off; changes apply when saved
- Non-goals: password, sign-in methods and deleting the account; settings of other people or of the whole team

## Proposal

- Design: one
- Recommended: none (one design)
- Open questions: should the email address be changeable here, or only through sign-in (the Email field)
- Ready answers: 1. only through sign-in (suggested), changeable here
- Decisions: one page for name, language and emails, no options (the request): accepted; the language changes every page after saving (the request): accepted; one switch per kind of email, security alerts always on (the request and our assumption): accepted; one Save for the whole page (our proposal): proposed; changing the email address here (our proposal): open q-1
- Reuses: the page head (as on Docs); two cards with fields (Card, Field, FieldLabel, Input, as on Home); the language select (Select, as on Home); the email switches (Switch, Label, as on Home); the save button (Button, as on Home). New: none
- Optional parts: flow: not added, one page and no step order or decision; storyboard: not added, saving is one press whose states the States section draws; guarantees: not added, the one promise (a shared link opens the reader's own settings) is now said as its mechanism, an address with no account in it; position cue: added, 10 sections after the head

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
