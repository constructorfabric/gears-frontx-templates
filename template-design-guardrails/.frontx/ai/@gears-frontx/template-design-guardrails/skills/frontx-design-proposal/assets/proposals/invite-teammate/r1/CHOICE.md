# Proposal record: Invite a teammate

The hand-off between the proposal and the build (references/record.md). Fill every field before the page is shown; a field with nothing to say gets `none`. Until the person answers, every field under "Selection" and "Build hand-off" reads `none yet`. Check it with `scripts/check-proposal.mjs <revision-dir>`.

## Revision

- Page id: invite-teammate
- Revision: r1
- Replaces: none
- Status: awaiting selection
- Created: 2026-11-20
- Proposal: proposal.html

## Request

- Request: "Let a team lead invite a teammate by email. If the address is already in the team, say so. An invitation link should work only once, and expire after a while."
- Purpose: a team lead brings a new person into the team by email, and the invitee joins from the link
- Users: the team lead who invites, and the invited person
- Main task: invite an address and see that it is on its way
- Assumptions: only a team lead invites (open question 1); the invitee already has a company sign-in; a link works once and for seven days (open question 2); an invitation gives the role Member or Team lead
- Non-goals: removing a member or changing a role; inviting several addresses at once; the words of the email

## Proposal

- Design: one
- Recommended: none (one design)
- Open questions: who may invite (Invite a teammate on Team members); how long a link works (the last day, Expired on the list); building Sending with the kit's disabled button (Send invitation while sending)
- Ready answers: 1. only a team lead (suggested), anyone in the team; 2. seven days (suggested), thirty days; 3. the kit's disabled button (suggested), hide the button while sending
- Decisions: inviting by one email address (the request): accepted; an address already in the team is refused with the member's name (the request): accepted; a link works once (the request): accepted; a separate invite page instead of a dialog (our proposal): proposed; Expired rows with Send again on the list (our proposal): proposed; only a team lead invites (our assumption): open q-1; seven days (our assumption): open q-2; Sending drawn from the nearest blocks (a kit gap): open q-3
- Reuses: the page head and its main button (Button, as on Home); cards (Card, as on Home and Docs); role and state badges (Badge, as on Docs); the email field (Input, as on Docs). New: list rows with avatars (List, Avatar, in the kit, used by no screen yet); the role select in its field (Select, Field, in the kit, used by no screen yet); the sent, refused and dead-link messages (no kit component, a kit gap); the invite page and the join page (composed from the same components); the Invited and Expired marks (Badge variants); Sending as a disabled button (Button disabled; the drawing kit has no block, a kit gap)
- Optional parts: flow: added, the invitation branches twice, on an address already in the team and on a used or expired link, across three screens; storyboard: added, sending changes one screen in three steps the states do not show, and step 2 is where Send locks; guarantees: added, two promises are drawn as their mechanism, Send locked after one press and the page a used or expired link opens; position cue: added, 12 sections after the head

## Versions and survey

- Kit version: @gears-frontx/ui-kit 0.5.0
- Template versions: template-shell 0.1.0-alpha.9, template-mfe 0.1.0-alpha.8, template-design-guardrails 0.1.0-alpha.9 (applied), frontx-design-proposal skill 0.8.0
- Survey: Team Hub, side menu; screens Home /home (order 10) and Docs /docs (order 20) in team-mfe; services AccountsApiService and DocsApiService, no team or invitation service; theme default, light; DESIGN.md present; full output in survey.json

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
