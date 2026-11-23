# Build from the record

A later session, often with no memory of the request, builds the chosen page. Everything it needs is in the record; the build itself is the normal FrontX build, with every gate in full.

## 1. Find the record

```bash
ls .frontx/proposals/
ls ".frontx/proposals/<page-id>/" | sort -t r -k 2 -n | tail -n 1
```

Read CHOICE.md of the highest revision of the page. Revisions compare by the number after `r` (`r10` after `r9`), never as text, where `r10` sorts before `r2`; the second line prints the highest one on macOS and Linux alike. Its Status decides:

- `selected`: go on with that revision.
- `replaced`: do not build. The next revision either exists (go to it) or was not made yet: continue with `references/revise.md` from its step 2, or ask the person.
- `awaiting selection` with the person's answer in hand (it often comes with the request to build, as a text copied from the page's answer block or in their own words): record it first as `references/record.md`, "Record the answer", says, run the check below on the folder, and build only when it is clean and Status reads `selected`. A reply that is not a choice is answered there, not built.
- `awaiting selection` with no answer from the person: stop. Nothing is chosen; give the person the absolute path of that revision's `proposal.html`, open it if the session can, and ask for the answer. A recommendation is not a choice.
- no record: this skill has not run for the page; build with `../frontx-design/SKILL.md`, or propose first.

Check the record before building on it; a finding is a broken record, reported and asked about, not built around:

```bash
S=.frontx/ai/@gears-frontx/template-design-guardrails/skills/frontx-design-proposal
node "$S/scripts/check-proposal.mjs" ".frontx/proposals/<page-id>/<revision>"
```

## 2. The package

When "Route" names a new package, create it with the MFE template's `add-mfe-package` skill (`.frontx/ai/@gears-frontx/frontx-template-mfe/skills/add-mfe-package/SKILL.md`), every step of it: the route and the menu label and order from "Route" and "Menu place", the data from "Data fields" as below, the scaffold residue and its tests. When it names an existing package, add the screen to that package as `../frontx-design/references/frontx-context.md` describes: a new screen extension in the package's `mfe.json` `extensions[]` on the shared screen domain, with its route and its menu label and order from "Route" and "Menu place"; the screen's folder under the package's `src/screens/` and its entry in the package's lifecycle; the data as below; then regenerate the manifests as the add-mfe-package skill's step that regenerates them does (`npm run generate:mfe-manifests`), and verify the package as its verify step does. Name those steps by what they do, never by their number: the other skill may renumber them.

Data: the project's own design files (DESIGN.md and any design contract beside it, which the survey listed) decide how a screen gets its data. Where they say (no network calls, sample data in a module of the screen, no data service), follow them, and remove what the scaffold brings against them. Where they say nothing, a field that "needs a new data request" gets a data service that returns mock data, and the hand-off says no API is agreed; never invent an endpoint.

A state the data cannot produce is not built: a "could not load" state on a page that makes no request, an empty state for a fixed list that is never empty. Mark it not applicable in the hand-off's state inventory, with the reason ("no request is made, so loading cannot fail"). Every other state in "States to build" is built.

## 3. Build and verify

Run the build and verify rows of `../frontx-design/SKILL.md`, every gate in full: `../frontx-design/references/generate.md` (states, every width, self-review), `../frontx-design/references/verify.md` (static check, the browser check at every width and both themes, the closing pass) and `../frontx-design/references/review.md`. Build from the hand-off:

- "Regions" gives the layout at each width; "Blocks" gives the kit component of each part; "States to build" gives the state inventory (`../frontx-design/templates/state-inventory.md`); "Requested changes" and "Answers" apply on top of the drawing.
- Each "Kit gaps" item is built from the kit's tokens and components as `../frontx-design/references/components.md` says, and named in the hand-off.

A drawing is a sketch. Where the real kit differs from it (a component's size, spacing, a variant the kit does not have, a phone layout the shell handles itself), the kit wins: build the kit's way and list each difference in the build's hand-off (`../frontx-design/templates/handoff.md`) under what differs from the proposal. Never restyle a kit component to match a drawing, and never hide a difference.

The proposal's drawings are not evidence for the built page; only the verify row's checks are.

## 4. Close

The record stays as it is. The build's hand-off names the record folder it was built from and the differences from the drawing. Finish with the closing items of `../frontx-design/SKILL.md`.
