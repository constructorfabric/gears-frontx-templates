# Change the proposal after feedback

The person asked to see changes before choosing ("the table, due date first, and show me that before I say ok"), or an assumption the drawings rest on turned out wrong. The agent edits the same page by sections and shows it again as the next revision. Target: about 5 minutes. The worked example is `assets/proposals/team-tasks/r2/`, the feedback round on `r1/`.

A reply that chooses and asks only for small changes ("A, but due date first") needs no new revision: record it as `references/record.md` says, with the changes under "Requested changes".

## 1. Record the feedback on the old revision

In the old revision's CHOICE.md: Status `replaced`; "Person's words" the reply quoted word for word; Chosen, Answers and Requested changes as far as the reply settles them; every "Build hand-off" field stays `none yet`. The old page is not changed: it records what was shown.

## 2. Copy and edit by sections

```bash
cp -R ".frontx/proposals/<page-id>/r1" ".frontx/proposals/<page-id>/r2"
```

Edit `r2/proposal.html` by whole sections, never by restyling: add, move, replace or delete sections and drawings. Typical moves:

- a chosen option: its drawing becomes the screen's one drawing (`draw-a` becomes `draw-list`), the other options, the overview's option links and the recommendation go;
- a requested change: redraw that drawing only, and renumber its notes in reading order;
- what the feedback settled: its chip becomes `accepted`, on the change itself or as the scope chip of the section it covers; a settled open question leaves "Open questions", and the remaining ones are renumbered with their chips' links;
- paths and data lines follow the new drawings' pin numbers.
- a renamed thing: search the whole page for the old name, the glossary included, and change every use;
- a section added, moved or replaced: its heading and its takeaway are written again, and the takeaways read in order still tell the proposal.
- the optional parts are decided again (`references/page-parts.md`, "Optional parts"): a new branch or step goes into the flow, a new promise gets its pin, a section added or removed changes the position cue and may cross its threshold; CHOICE.md, Optional parts, follows.

Set the revision in the top bar's page facts and add, at the top of the head before the takeaway, one line with links to the changed sections (`references/page-parts.md`, "Changed since"):

```html
<p class="changed">Changed since r1: <a href="#screen-list">the list is the table you chose, due date first</a>; <a href="#questions">the question about Done tasks is answered</a>.</p>
```

Quote the feedback in "What you asked for", under the request, with an `accepted` chip.

## 3. The record of the new revision

In `r2/CHOICE.md`: Revision `r2`, Replaces `r1`, Status `awaiting selection`; Design, options, Recommended, Open questions and Ready answers as the new page shows them; every "Selection" and "Build hand-off" field `none yet`. Keep `survey.json` unless the app changed; then run the survey again.

## 4. Check, open and ask

```bash
S=.frontx/ai/@gears-frontx/template-design-guardrails/skills/frontx-design-proposal
node "$S/scripts/check-proposal.mjs" ".frontx/proposals/<page-id>/r2"
```

The last line must read `clean: 0 findings`. Then open the new page and ask as `references/propose.md`, step 8, says. Both revisions stay in the record.
