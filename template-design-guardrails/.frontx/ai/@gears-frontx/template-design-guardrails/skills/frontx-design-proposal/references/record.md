# The record

What the person was shown and what they chose, kept in the project so a later session with no memory builds the right page.

## Where it lives

```
.frontx/proposals/<page-id>/<revision>/
  proposal.html   the page the person saw
  survey.json     the survey it was drawn from
  CHOICE.md       the record (templates/CHOICE.md)
```

Revisions are `r1`, `r2`, and so on, compared by number (`r10` comes after `r9`); the page id is lower-case letters, digits and single hyphens (checked). The record is project documentation: it may be committed, it sits outside `src-app/` and no build includes it. The worked example is `assets/proposals/team-tasks/`: `r1/` replaced after feedback, `r2/` awaiting selection, and `CHOICE.selected.md`, the r2 record once selected.

## Revisions

A revision is what the person was shown, and it does not change after it is shown, except the fields under "Selection" and "Build hand-off" in CHOICE.md (and Status), filled once when the person answers. A new revision when the request changes, when the person asks to see changed drawings before choosing, or when an assumption the drawings rest on turns out wrong: `references/revise.md` is the procedure. The old revision's Status becomes `replaced` with the feedback quoted; the new one names it under Replaces; both folders stay. Small changes the person asks for together with a choice ("A, but due date first") need no new revision: they go into "Requested changes".

## Fill CHOICE.md before showing

Copy `templates/CHOICE.md` into the revision folder and fill every field from steps 1 and 2 of `references/propose.md`: Status `awaiting selection`, Replaces (`none` in r1, else the previous revision), the request quoted, purpose, users, main task, assumptions, non-goals; Design `one` or `options`, one `- Option <letter>:` line per option with its name, best for and trade-off (none with one design); Recommended; Open questions; Ready answers, for each open question its ready answers as the answer block shows them, the suggested one marked `(suggested)` (`1. only on request (suggested), under All, with the rest; 2. ...`), `none` without open questions; Decisions, each choice the page draws with its source (the request, the survey, the person's feedback, our proposal) and its state, as the page's chips show it (`one list with search instead of tabs (the request): accepted; Download all removed (our proposal): open q-1`); Reuses, the full list the page's "Built from what the app already has" line sums up: each reused part in plain words with its kit component and the screen that uses it, then "New:" and each new part with its kit component or "a kit gap"; Optional parts, for each of flow, storyboard, guarantees and position cue "added" or "not added" and why, separated by semicolons (`flow: added, the invitation branches on an existing member and a used link; storyboard: not added, no screen changes through an interaction the states leave out; ...`), matching the page; Kit version (from `node_modules/@gears-frontx/ui-kit/package.json`); Template versions, each applied template with the version of the files this proposal actually used; Survey, a one-line summary of `survey.json`. A field with nothing to say gets `none`. Every field under "Selection" and "Build hand-off" stays `none yet`.

Template versions: each template's `scaffoldedFromVersion` in `.frontx/provenance.json`. The AI bundle under `.frontx/ai/` carries no version of its own and may have been updated after the template was applied, so for this guardrails template add `frontx-design-proposal skill` followed by the `version:` in the front matter of this skill's `SKILL.md` as it is when the page is made (never a number copied from an example): `template-design-guardrails 0.1.0-alpha.9 (applied), frontx-design-proposal skill <version>`. With no `provenance.json`, write the skill version and `applied version unknown`.

Check the folder, with `S` set as in `references/propose.md`; the last line must read `clean: 0 findings`.

```bash
node "$S/scripts/check-proposal.mjs" ".frontx/proposals/<page-id>/<revision>"
```

The check also compares the options of CHOICE.md with the page's options.

## Record the answer

Only the person's own reply selects. A recommendation, an answer the page picked in advance, a silence, or an agent's reading of the person's mood selects nothing.

1. Quote the reply word for word under "Person's words", in double quotes. A text copied from the page's answer block is the person's reply like any other: quote it word for word on one line, its line breaks written as ` / `. The answers the page had picked in advance select nothing on their own: only a text the person sends, or their own words, does.
2. A clear choice ("B", "ok", "the table, but due date first"): set Status `selected`; Chosen to the option letter (either case), or `design` with one design; Answers to the answer to each open question, saying when it was the suggested one the person sent, or `not answered` for one left open; Requested changes to each change asked for, or `none`; Selected on to the date. A reply that leaves the choice to the agent ("whichever you think") selects the recommended option; quote it as it is.
3. A reply that is not a choice (a question, "both", a request for something else): answer it and ask one short question that settles the choice. A request to see something else is a new revision.
4. Fill the build hand-off from the chosen drawing and the answers:
   - Route: the address and the package, new or existing.
   - Menu place: label and order among the existing screens.
   - Regions: the page's regions at each width (1440, 768, 390): what sits where, and what changes on a phone.
   - Blocks: each drawn block of the chosen option with its kit component, from `references/drawing-kit.md` ("table block = kit Table inside a bordered Card").
   - Data fields: each field and its source, one of three: "exists today: <service>" (a service the app has); "sample data in the project: <module>, no request" (where the project's own design files say the data comes from a sample-data module in the project, with no request); or "needs a new data request, to be agreed".
   - States to build: every state from the page's States section; a state the data cannot produce ("could not load" with no request) is not listed.
   - Kit gaps: each pattern drawn without a kit component, or `none`.
5. Check the folder again; a selected record is clean only with the person's words, a known option, a date and every hand-off field filled.

The proposal page is not changed after the answer: it records what was shown.
