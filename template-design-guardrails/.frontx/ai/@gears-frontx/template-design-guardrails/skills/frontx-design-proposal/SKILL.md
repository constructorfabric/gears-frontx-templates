---
name: frontx-design-proposal
version: 0.8.0
description: Use BEFORE a new page or screen is built when the person says "show me first", "how could it look", "give me options" or "before you build" - draw it on one local HTML page in the app's own look, ask, record the answer, then build from the record.
---

# FrontX design proposal

Explain a new page or feature before anything is built: one self-contained HTML page draws it, screen by screen and with options where a real choice exists, in the app's own colours and shapes, with numbered notes on what each part does, the map of its screens, the person's typical paths through them, the data each screen reads and the state of every decision. The person answers; the record of the answer is what a later build starts from. Paths are relative to `<project>/.frontx/ai/@gears-frontx/template-design-guardrails/skills/frontx-design-proposal/`; the sibling skill is `../frontx-design/`.

## Binding essentials

- Drawn, not built: no MFE package, no dev server, no build, no screenshot of a running app and no browser are needed to make the proposal. Real code is written only after the person has chosen, by `../frontx-design/SKILL.md`.
- One design by default. Two or three options only for a part with a real trade-off (how a list is laid out, where an action lives); never options for decoration.
- Drawings are composed only from the drawing kit, `templates/draw/`, in the app's values that `scripts/survey-app.mjs` prints. A pattern with no block is drawn from the nearest blocks and named as a kit gap in the open questions.
- Mobile first: every option and screen is drawn on a phone, then on a desktop, both in full and with their own notes; a phone drawing is never hidden in a disclosure, and every option shows the same views (`references/page-parts.md`, "Phone and desktop").
- Every option and screen shows the same dense, believable sample data, inside the app window with its navigation.
- Fast and complete: a part of the page appears only when it has something true to say, so a one-screen request gives a short page. Budget, to be measured: about 7 to 10 minutes for one page, 10 to 15 for several screens; blocks are composed, thumbnails are copies, the scripts survey and check.
- Framing is short: restate the request, ask at most three questions that change the drawing, or none when the request answers them or nobody can; then list the assumptions on the page.
- Every drawn choice is accepted, proposed or open, marked where it acts; open ones are also open questions; CHOICE.md lists each with its source.
- Every section but the head, the glossary and the answer opens with one takeaway sentence under its heading; read in order, the takeaways tell the proposal.
- A change to an existing page is shown against today: where each part goes (the mapping), each task's steps then and now (Paths with the Today column, even on a single page; a new single page has no Paths), what an already shared link opens.
- A request that contradicts the project's design files (DESIGN.md, a design contract) is drawn as asked and raised as an open question naming the rule and the file; the agent never settles it silently (`references/propose.md`, step 2).
- The agent shows the page and asks. It does not choose for the person, and it does not summarise the page instead of opening it.
- Optional parts are considered every time and added whenever their rule matches: a flow of steps and decisions when a decision leads to different screens or outcomes, or three ordered steps run across screens (a one-press choice on one screen is a state change, not a flow), a storyboard when one screen changes through an interaction the states do not show (one per option only when the options differ in it), a guarantee (only, never, always, cannot) drawn as the pin of what makes it true, and a position cue past seven sections or three screens. CHOICE.md says for each whether it was added and why (`references/page-parts.md`, "Optional parts").
- The page ends in an answer block: the recommended option and a suggested answer to each open question are picked in advance, and Copy answer gives a full reply the person pastes into the chat. Only what the person sends selects.
- A recommendation is a suggestion. Only the person's own words select.
- A drawing is a sketch: when the build meets the real kit, the kit wins and the difference is reported.
- Nothing is uploaded or published: the page is a local file.

## Tasks

| Task | Load |
|---|---|
| Propose a page or feature | `references/propose.md`; parts in `references/page-parts.md`; blocks in `references/drawing-kit.md` |
| Record the answer | `references/record.md` |
| Change the proposal after feedback | `references/revise.md` |
| Build from the record | `references/build.md`, then `../frontx-design/SKILL.md` |

## Map

- `references/propose.md` - the fast path with commands and the budget: an existing proposal, survey, frame, draw, annotate, assemble, check (text, rendered, a fresh reader), open, ask.
- `references/page-parts.md` - the rules of each part: top bar, section takeaways, the problem, phone and desktop, map, thumbnails, zooms, data lines, tips, chips, disclosures, mapping, paths, addresses, glossary, answer block, the optional parts (flow, storyboard, guarantees, position cue) with when each applies, words on the page, wide parts and the rendered check, "Changed since", and why the page is shaped this way.
- `references/revise.md` - the next revision after feedback, edited by sections.
- `references/drawing-kit.md` - every block, the kit component it stands for, the custom properties.
- `references/record.md` - the record folder, revisions, CHOICE.md, recording the answer.
- `references/build.md` - from the record to a built and verified page.
- `templates/proposal.html` - the page skeleton: the top bar with the FrontX mark, the frame, one light theme on a white page with neutral greys, so only the drawings carry the app's colours, the drawing kit, the script (pins and leader lines, thumbnails, tips, named scroll boxes, a flow's connectors, the position cue, the rendered layout check), sections, the optional parts commented where they go.
- `templates/draw/draw.css` and `templates/draw/blocks.html` - the drawing kit.
- `templates/CHOICE.md` - the record.
- `scripts/survey-app.mjs` - screens, kit use, services, design files and the app's look; `--help` prints the flags.
- `scripts/check-proposal.mjs` - checks a page or a revision folder; exit 0 clean, 1 findings, 2 input error.
- `assets/proposals/team-tasks/` - worked example 1, a side menu app: a Tasks feature of two screens, the list in three options and the task details; `r1/` (replaced after feedback), `r2/` (the table chosen, due date first, awaiting selection) and `CHOICE.selected.md`, the r2 record once selected.
- `assets/proposals/account-settings/` - worked example 2, a top header app: one page in one design, the short page.
- `assets/proposals/docs-redesign/` - worked example 3, the same app: a change to the existing Docs page in one design, two screens, with the problem, the mapping, today's paths and today's links.
- `assets/proposals/invite-teammate/` - worked example 4, the side menu app again: inviting a teammate by email over three screens in one design, with every optional part: the flow with its two refusal branches, the storyboard of sending, two guarantees drawn as their pins, and the position cue. The examples show markup, not the answer to a request.

## Every task ends with

The revision folder path and the last line of `scripts/check-proposal.mjs` on it; for a build, the closing items of `../frontx-design/SKILL.md`.
