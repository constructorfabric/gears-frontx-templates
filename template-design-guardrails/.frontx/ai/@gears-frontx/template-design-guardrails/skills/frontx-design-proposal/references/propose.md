# Propose a page

From a request in plain words to an opened proposal page and one question to the person, once `references/offer.md` says the step runs. Nothing is installed, built or served. Speak to the person in their own language and write the page in it (`references/page-parts.md`, "The page's language"). Every path below is relative to the project root (the folder with `package.json` and `.frontx/`), and every command runs there, with:

```bash
S=.frontx/ai/@gears-frontx/template-design-guardrails/skills/frontx-design-proposal
```

In a workspace where the project is a subfolder, `cd` into it first, or put the subfolder in front of every path.

Four worked examples show the markup of every step, not the answer to a request: `assets/proposals/team-tasks/` (a side menu app; a feature of two screens, the list in three options; `r2/` is the round after feedback, `references/revise.md`), `assets/proposals/account-settings/` (a top header app; one page, one design, the short page), `assets/proposals/docs-redesign/` (the same top header app; a change to an existing page, with the problem, the mapping, today's paths and today's links) and `assets/proposals/invite-teammate/` (the side menu app; three screens with every optional part: a flow, a storyboard, guarantees drawn as their pins, the position cue). Draw what the request and the app call for, never the example's screens, options or data. When the request is about the same subject as one of the examples (a task list, a settings page, a docs page, an invitation), learn the markup from an example on a different subject and draw the options from the request and the survey; leave the matching example closed.

## Budget

Targets to be measured, not promises: about 7 to 10 minutes for one page, with or without options; 10 to 15 for a feature of several screens. Write the time taken in the report.

| Step | One page | Several screens |
|---|---|---|
| 1. Survey | 1 min | 1 min |
| 2. Frame | 1 min, plus the person's answers | 1 to 2 min |
| 3. Draw | 3 to 4 min | 5 to 7 min, plus 1 to 2 for a flow or a storyboard |
| 4. Annotate | 1 min | 1 to 2 min |
| 5. Assemble | 1 to 2 min | 2 to 3 min |
| 6 and 7. Check and record | 1 min | 1 min |

What keeps it fast: blocks are composed, not invented (`templates/draw/blocks.html`); thumbnails and the map are copies the page script makes, never drawn twice; a part with nothing true to say is left out, never padded; the scripts do the survey and the check. Over budget at a step: cut options or secondary drawings, never a phone drawing and never the check.

## 0. Look for an existing proposal

```bash
ls .frontx/proposals/ 2>/dev/null
```

When a folder for the same page exists, read its highest revision's CHOICE.md first (the highest number after `r`, as `references/build.md` finds it). Awaiting selection: ask the person whether this request changes that proposal (a new revision, `references/revise.md`) or starts a new one. Selected: the new request is a change to a chosen design; say so and ask the same question. Never start a second page id for the same page without the person's word.

## 1. Survey the app

One command surveys the app and saves `survey.json` in the revision folder. Pick the page id first (`team-tasks`): lower-case letters and digits in words joined by single hyphens, nothing else, so it is safe in a path and a shell line (checked); step 2 refers back to it:

```bash
node "$S/scripts/survey-app.mjs" --project . --out ".frontx/proposals/<page-id>/r1/survey.json"
```

It prints a short list (`--json` prints only the JSON instead); `--out` refuses to write through a symbolic link:

- the screens the app shows: registered in `public/generated-mfe-manifests.json`, in menu order, with route, label, source folder and the kit components each imports. Template examples, blank scaffolds and unregistered packages are listed apart as "not shown": never draw them;
- the chrome: side menu or top header, where the header links sit, how the active link is marked (underline, pill or filled), the brand mark (the app's own logo, cleaned and ready to inline, which `brandHtml` carries with the app name, or the square or initials with the reason), and the phone header (a second row of links or a menu button), each with the file it was read from;
- the drawing kit classes for the window, the navigation, the phone header and the brand (`variants`);
- the look: every `--d-*` value with its source file, read in the order the app uses it (the shown screens' CSS Modules, the shell's header and menu styles, the active theme, the kit last), desktop pixel sizes already scaled to the drawing window by the scale rule (`references/drawing-kit.md`), the real value beside each scaled one, and where the app's own value beats the kit's;
- the addresses each screen's links carry as the app renders them (the shell's menu links, literal links in the screens' code; when the menu builds no link, as the stock shell's does not, the address the shell's router writes, `/?screen=<route without the leading slash>`), beside the registered route, and a line when the two disagree: the addresses table states what a shared link really carries and opens; when the shell builds its links in code the survey does not read, every link prints `unresolved` with "link form not detected, check the menu code by hand": read the file it names and write the form you find on the page;
- what each screen uses beyond the shared values: its own page heading when it differs from the shared one, its section heading, its coloured bands with their background and text colours; the first screen with bands fills `--d-band-*`, the first with a section heading `--d-section`, so today's page is drawn as it looks;
- the brand mark defined once (`brandDefs`) when the logo is an SVG, and `brandHtml`, which refers to it;
- services, mocks, and the design files (DESIGN.md, any other DESIGN*.md at the root, a design contract under `.frontx/`): read them; their rules bind the drawing too;
- the app-look CSS for the page.

Exit 1 means something printed `unresolved`: read the file named beside it and fill the value in the app-look block with a `/* why: ... */` comment saying where it was read. The list also names under Skipped each file the survey meant to read and did not, with the reason (over its cap, a link, a file with more than one hard link, a file or folder it has no permission to read, an unreadable or wrong-shaped manifest), and under Dropped each value that did not fit its kind. A skipped file is read by hand, when the page needs the values it holds, only when its reason is a size cap or a shape problem (over the byte cap or the depth cap for nested `@media` rules; an unterminated string or url() in an at-rule; a block at-rule the file never closes; an empty, unparsable or wrong-shaped manifest or list of registered screens; a file where a folder is expected) and the file lies inside the project: its real path (`realpath`) is inside the project root. A file skipped with the reason "a symbolic link to a file inside the project, which the survey does not follow" may be read by hand too, through its real path: the survey found a regular file there, inside the project root, with one hard link. Before you open any skipped file by hand, check its hard links yourself: `stat -f %l "<file>"` on macOS or `stat -c %h "<file>"` on Linux, the path quoted, must print 1; any other number means the file is never opened by hand. Every other link (to a file or folder outside the project, to nothing, or any other link the survey does not follow), a file with more than one hard link (a reason that names it, alone or at its end after a cap, as "..., and it has more than one hard link"), a kit folder the survey refused (the project root, a folder above it, or a project folder outside node_modules), a file skipped as not a regular file, or for lack of permission is never opened by hand, not even to look: it becomes an open question on the page, naming the file and what the drawing lacks without it. A skipped file you may read but cannot is named in the page's open questions too. Write a dropped value only in a form that fits, each with its reason. A value that printed but is wrong (the design contract says otherwise) is overridden the same way, never silently.

The survey reads CSS approximately: it does not track quotes inside declaration bodies or selectors (so a `}` or `{` inside such a string can make a rule up or lose one), an unclosed `/*` comment cuts the rest of the file without a Skipped entry, layered rules (`@layer`) and other conditional blocks do not feed the look, a rule the file never closes at the top level is dropped without a Skipped entry, parentheses of functions other than `url()` in an at-statement (`supports(...)`, `layer(...)`) are not tracked (so a `;` or brace inside them can end the statement early), the page root is matched by its whole class name (`.root`, `.screen`, not `.screen-header`) but a descendant selector such as `.screen .x` is still read as the page root, and the SVG `<use>` cap does not bound `mask` and `clipPath` chains. It reads the theme approximately too: an entry with a computed key (`[NAME]: '#...'`) in a theme object is skipped, an import renamed with `as` (`import { p as palette }`) is followed by the exported name it shadows, and consts nested inside method bodies, each spread by name, make the theme reading slower than linear. The check does not find a leftover glued after a `/` in an address (`/docs/<id>/TODO`). When a value looks wrong, read the file it names, under the rules above.

## 2. Frame the request

Restate the request to the person in one or two sentences. Then ask at most three questions, and only those whose answers change the drawing: who uses it, the one thing they do there, what must be on the screen. When the request already answers them, or nobody can answer (a run without a person), ask nothing: draw, and list the assumptions on the page. Never a questionnaire.

Write down, in the person's words where possible:

- the request, quoted word for word; on the page it is HTML-escaped like every text taken from the person or the project (`references/page-parts.md`, "Words on the page");
- what the page is for, who uses it, the one thing they do there;
- assumptions (each one a sentence the person can say no to) and non-goals;
- open questions only the person can answer, each naming the part it touches, each with two to four ready answers the person can pick: real answers, never a "not decided" one; mark one as suggested and give its reason in one short sentence; for each ready answer write the full sentence the copied answer carries (`data-say`), one that says what the question was about and reads on its own ("Done tasks count and show under All as well as under Done.", not "Yes");
- the name of each new thing the page will show (a screen, a filter, a mark), in the person's words, else a name the app already uses for something like it; a name you coin gets an example the person already knows, for the glossary;
- when an existing screen changes: what is wrong with it today, in the person's words, for the problem section and the takeaways; when the request does not say, your own reading of today's page, each point naming the part it is about, marked as your reading on the page.

When the request contradicts a rule of the project's design files (DESIGN.md, a design contract: "no persistence" against "the page remembers what is done"), do not choose silently. Draw the request as asked, and raise an open question that names the rule and the file ("DESIGN.md, section 7, says page state resets on reload"), with ready answers: follow the request and change the rule; keep the rule and adjust the request (say how). Mark the suggested one and give its reason in one sentence. The drawing marks the part with an open chip linked to that question.

List the screens: one, or several in click order (a list and the details a row opens), with the secondary ones (a dialog) under the screen that opens them. Then decide where a real choice exists. Default is one design. Two or three options only for a part with a real trade-off, each option best for a different use; the rest of the page is the same in every option and drawn the same. Never offer options for colour, decoration or wording. Keep the page id picked in step 1 (lower-case letters and digits in words joined by single hyphens, nothing else, checked). Pick the routes next to the existing routes the survey listed: one screen extension per menu entry (`/tasks`), and a list-to-detail flow one screen with the details as its in-screen `/<id>` sub-route (`frontx-context.md`, "Routes inside a screen"). Under the default router (the engine provider `@gears-frontx/routing-tanstack`) the in-screen sub-route is written into the same `screen` entry of the query, `/?screen=<token>;route=<in-screen pathname without its leading slash>`: the list at the screen's root carries no `route` (`/?screen=tasks`), and the detail of one task under the in-screen route `/<id>` is `/?screen=tasks;route=<id>`, written with pushState, so Back and deep links work.

Then go through the optional parts (`references/page-parts.md`, "Optional parts") and decide each one now, from the request and the screens, before drawing:

- Flow: does a decision lead to different screens or outcomes the person does not see at once, or do three steps or more run in a fixed order across screens? Write its steps, decisions and ends, the refusal or error branch included. A single choice made in one press on one screen (do it or skip it) is a state change: show it with a storyboard or the notes, not a flow.
- Storyboard: does one screen change through an interaction the states will not show (a drag, an edit in place, a dialog of several steps, an upload with progress, a change shown at once that may be undone)? Write its three to six frames and the width where it matters. The storyboard belongs to the interaction: when every option has the same interaction, one storyboard in the recommended option with a line saying it is the same in the others; when the options differ in it, one per option.
- Guarantees: does the request or the design promise only, never, always or cannot? For each, name the thing on a drawing that makes it true (the missing control, the confirmation, the lock after the first press); with no such thing, it is an assumption or an open question.
- Position cue: count the sections the page will have; past seven after the head, or past three screens, it gets the cue.

Add every part whose rule matches; a part left out has a reason the person would accept. Note each decision and its reason for CHOICE.md, Optional parts.

Sample data: one set, used by every option and every screen, with as many rows as the real thing has: six to ten for a list that grows (tasks, documents, people), the exact count for a fixed short list the person named (a checklist of three steps has three). Believable: real-looking names, dates and numbers, a long value, a missing value (no owner, no date), a state that stands out (overdue, failed), where the list can have them.

## 3. Draw

Copy the skeleton into a new revision folder:

```bash
mkdir -p ".frontx/proposals/<page-id>/r1"
cp "$S/templates/proposal.html" ".frontx/proposals/<page-id>/r1/proposal.html"
```

Set `<html lang>` to the person's language, and write the answer form's `data-phrase-*` and a flow start's `data-start` in it (`references/page-parts.md`, "The page's language"). Replace the content of the `app-look` style block with the app-look CSS from step 1 (`appLookCss` in `survey.json`). Compose every drawing from the fragments of `templates/draw/blocks.html`; `references/drawing-kit.md` lists each block, the kit component it stands for, the properties and the variants. Rules:

- A drawing is the app window: the side menu or top header as the survey found it, with the screens the app shows in their order and the new page's link active, then the page inside it with the sample data. A bare part is allowed only as a zoom on a part already shown (`references/page-parts.md`).
- The window, the navigation, the phone header and the brand carry the classes under `variants` in `survey.json` (`d-top d-top--end d-active--underline`, `d-brand d-brand--initials` with a `d-mark` holding the initials); every drawn brand is `brandHtml` from `survey.json` pasted as it is; when `survey.json` gives `brandDefs` (an SVG logo), paste it once right after `<body>`, where the skeleton's comment says, so the page carries the logo once and every brand refers to it (`references/drawing-kit.md`, "The brand mark"); the check fails a drawing without them unless the element says why in `data-why`.
- The app's shapes come only through the app-look values and these classes; never add CSS. A shape the kit cannot take is a kit gap in the open questions.
- With options, mark the region of each option's desktop drawing with `data-strip` for the overview's strip: the part the options differ in (the table card, the list, the grid, the board, a strip of steps with the card it leads to), wrapped in one `d-stack` when it is two blocks. Never a part every option shares.
- Two full drawings per screen (per option on the screen that has options): the phone, then the desktop. The map, the strip, the thumbnails and the states copy the desktop drawing, so never draw a thumbnail.
- Use only `d-*` classes and change only the words. `style=""` may set `--cols` (grid, board and counters columns), `--w` (a loading line's width or a progress bar's share done) or `--h` (a bar's height), nothing else.
- No `p`, heading, `img` or `svg` inside a drawing, except the app's own logo in `.d-logo`, which `brandHtml` carries; text in a drawing is labels and sample values, never a paragraph.
- Today's page, when it changes, is drawn as it looks: its coloured bands with `d-band` (and `d-band--alt`) and a `d-band-title`, its section headings with `d-section-title`, in the values the survey printed for that screen. A stepper is `d-steps`, a progress bar `d-progress`, a checked box `d-check--on` (a tick).
- A pattern with no block: draw it from the nearest blocks and add a kit gap to the open questions.
- Mobile first. The apps FrontX builds are mobile first, so a phone drawing is never secondary: every option, every screen and the one design has a phone drawing (`d-app d-app--phone`, 390 px) and a desktop drawing, in that order, under the headings "On a phone" and "On a desktop" (`references/page-parts.md`, "Phone and desktop"). If one option has a phone drawing, all have: every option is shown the same way.
- The phone drawing shows how the design really behaves at 390 px, with its own notes: counters wrap onto two rows, a table becomes rows, tabs scroll sideways or become a select, a board shows one column and says what it loses, a side panel moves below. It is never the desktop drawing squeezed, and never inside a disclosure.

## 4. Annotate

Mark each element the page explains with `data-note="n"`, numbered in reading order: top to bottom, left to right within a row. After the drawing's `figure`, one notes list with the same numbers:

```html
<ol class="notes" data-for="draw-a">
  <li data-n="1"><b>Status tabs</b> Show one status at a time; each tab counts its tasks.</li>
</ol>
```

A drawing has one notes list; a second list for the same drawing is a finding (checked).

A label is a few words; the line says what the element is or what happens on a click. Notes about behaviour come before notes about looks. What every option shares is explained once, on the first option.

Pins are placed by the page's own script, not by hand: each pin sits at its element's top right corner, or just outside the element, wherever it covers no text, no control and no other noted element; only when no such place exists does it go to the drawing's right margin, joined to the element by a thin leader line run where it crosses no text. The element carries a thin dashed outline in the note colour; hovering a pin, an element or a note lights up all of them. The script re-places pins on every resize and fetches nothing.

Mark each choice the drawing makes with its state where it acts, in the note: `accepted`, `proposed` or `open` (`references/page-parts.md`, "Decision state chips"); the head already makes everything `proposed`, so mark only the others.

## 5. Assemble

Fill the skeleton's sections in this order. A part with nothing true to say is left out, never padded; `references/page-parts.md` has the rules of each part.

Every section but the head, the glossary and the answer opens with its heading and one takeaway sentence under it, thirty words at most, saying what the section settles (`references/page-parts.md`, "Section takeaways").

1. The top bar before `main` (`references/page-parts.md`, "Top bar"): fill its title (the same text in `<title>`), page id, revision and date, and the tracker issue when the request names one; keep its FrontX mark as the skeleton has it. Then `head`, which starts with the takeaway: one sentence of takeaway, thirty words at most; the ask (choose a letter with options; build it as drawn or say what to change with one design; plus the open questions), ending in a link to the answer block (`<a href="#answer">your answer</a>`); the line that these are drawings.
2. `asked`: the request quoted, assumptions, non-goals. Then `problem`, when an existing screen changes or the person asks the page to open on the problem: two or three lines, each naming the part of today's page it is about; when the request does not say what is wrong, the lines are your reading of today's page, marked as such (`references/page-parts.md`, "What today's page lacks").
3. `map`: only for more than one screen: the screens as thumbnails in click order with arrows, and the line saying what the arrows mean. Right after the head, the position cue when the page has more than seven sections after the head or more than three screens.
4. `flow`: only when its rule matches: the steps named by their screens (the map's name, or without a map the name in the caption of the drawing the step links) and linked to their drawings, the decisions with a label on every way out, an end for every branch, the refusal or error branch drawn.
5. `overview`: with options, first the side-by-side strip (the same rows of every option at one height, cut from the drawings; `references/page-parts.md`), then one link per option holding its thumbnail and name, the suggested one marked (`.opt-link.recommended`, exactly one; checked), then "The same in every option" and "What differs"; with one design and no map, one link to `#design`.
6. `place`: the navigation drawn with the existing pages and the new link (`d-navlink--new`), links in and out.
7. `how`: one screen: its options (`<section class="option" id="option-a" data-option="a">` with "Best for", "Trade-off", the drawing and its notes; what they share explained once, on the first) or one `<section class="option" id="design">`. Several screens: one `<section class="screen">` each. Each option, screen or design shows "On a phone" first, then "On a desktop", each drawing with its notes. After a screen's drawings, its storyboard when its rule matches (with options: in the recommended option with a `p.story-same` line when the interaction is the same in all, else one per option). A sentence that promises only, never, always or cannot links the pin of what makes it true. Under each screen its data line; secondary drawings (the current page full size, the long tail of a list) in one disclosure, never a phone drawing.
8. `mapping`: only when an existing screen changes: Part, Today, Proposed, a change mark per row (moved, removed, kept, renamed, added), the reason for each removal, the legend, today's page drawn in a disclosure.
9. `paths`: for several screens, and for a single page that changes an existing page: two or three typical tasks in one table, numbered step cells with the screen, the pin and what is used (on a single page every step is on the one screen, named by its pins); when an existing screen changes, the Today column and the "!" mark on a path longer than today. A new single page has none.
10. `addresses`: a row per screen with its address as the app's links carry it (the survey's links, not only the registered route), how it is reached and what the link keeps; base lines when there is more than one base; what today's same link opens when an existing screen changes; a closing note.
11. `built`: one short line in plain words, what is reused and what is new ("The table, tabs and badges the Docs page already uses; new: the status counters"). The full list with kit components goes to CHOICE.md, Reuses.
12. `data`: each field, what it means and its mark, "exists today" with the service or "needs a new data request". Never invent an endpoint.
13. `states`: loading, empty, error, full and any other, one line each, saying which are drawn. List only the states the page's data can produce: a page whose data the project's design files supply with no request (sample data, no network calls) has no "could not load" state; say so in one line instead of listing it.
14. `recommendation` (only with options): which, the concrete reason, marked as a suggestion, and one linked card per option, the recommended one marked as in the overview (`.opt-link.recommended`, exactly one, the same option; checked).
15. `questions`: one `<li id="q-n">` each, naming the part it touches, with the reason for its suggested answer in one short sentence (`<span class="small why">Suggested: ..., because ....</span>`).
16. `glossary`: only when the page coins names a person would not know (several screens, a new word for a new thing); never for a single page with options whose names explain themselves.
17. `answer`: the answer block (`references/page-parts.md`, "Answer block"): "Which option?" with a card per option, or the two cards with one design; each open question with its ready answers, the suggested one tagged and checked, the recommended option checked; the changes field; the live answer text and Copy answer.

Write for a person who is not a developer: plain words, one name per thing, at most 120 words of prose in a section (`references/page-parts.md`, "Words on the page"). A number appears only when it changes what the person decides, says what it was counted on (a tip) and has something to compare with (today's count, the other option, a limit). People are named by what they do ("a team lead", "whoever reviews the guide"), never judged. Do not touch the frame, draw or frame-js blocks.

## 6. Check

```bash
node "$S/scripts/check-proposal.mjs" ".frontx/proposals/<page-id>/r1/proposal.html"
```

It reads the page as text, no browser: self-contained, frame and the top bar's mark unchanged, the top bar with the title as the only `h1` and the same `<title>`, a phone drawing before the desktop one for every option and screen and never in a disclosure, every option showing the same views, sections present, headed and in order, a takeaway under every heading, every pin with a note and every note with a pin, overview and map links and their targets, every in-page link and every id, thumbnails of full drawings only, navigation in every full drawing, only drawing kit classes, no raw colour, text limits (takeaways, notes, table cells, prose per section, no arrows written as text, no template text left), option fields, chip states, disclosure depth, glossary terms and where they first appear, tips, the paths table, the addresses, data lines, the mapping table, the "Changed since" line, and the optional parts: the flow's grid, links, start, ways in and out, labels and ends, the storyboard's frames and captions, every guarantee sentence's pin, and the position cue past seven sections or three screens. Fix every finding; the last line must read `clean: 0 findings`.

When the session can run a headless browser, also render the page at 1280 and at 390 px wide and evaluate `checkProposalLayout()` in it (the frame script defines it): it reports anything past the window's edge, text cut by its box, two pins on one spot, a scroll box no keyboard reaches, and in a flow two boxes or labels on top of each other or a connector through a box or a label; fix until it returns `ok: true`. It also reports a badge or chip stretched across its row, or a badge a `d-stack` stretches to the width of a wider one (`stretched`): wrap it in a `d-row`. Then look at a screenshot of each section the round adds or changes: the checks measure, they do not read. A flow must be followed from the picture alone, start to every end, by someone who has not seen the feature. When the session has no browser, say so when you hand the page over; the text check stays the gate.

On a page of several screens, and on a revision that adds, moves or merges a section, give the page's visible text, with a screenshot of each new or changed drawing when the session can take one, to one fresh agent when the host can start one, as the person would read it, with no word on what it should find. Ask it to tell the proposal back in two sentences from the headings and takeaways alone, to say what each section settles, to name a section that settles the same thing as another, to explain each name the page coins with an example from the page, and to list every word it did not understand. Fix what it points at on the page; what it says about the person's intent goes to the person as a question. One fresh reader per round, never a second one to check the first. When the host cannot start one, skip it and say so.

## 7. Record

Copy `templates/CHOICE.md` into the revision folder and fill it as `references/record.md` says (status `awaiting selection`). Check the whole folder; the last line must read `clean: 0 findings`:

```bash
node "$S/scripts/check-proposal.mjs" ".frontx/proposals/<page-id>/r1"
```

## 8. Open and ask

Open the page for the person with the system's open command, the one line for the system the session runs on:

```bash
open ".frontx/proposals/<page-id>/r1/proposal.html"            # macOS
xdg-open ".frontx/proposals/<page-id>/r1/proposal.html"        # Linux
Start-Process ".frontx/proposals/<page-id>/r1/proposal.html"   # Windows PowerShell
```

When the session cannot open a window, give the absolute path and say that it could not be opened. Then ask. When the session has a tool that asks the person a question with options to pick (a choice dialog), ask with it: first the option, the recommended one first and marked as recommended (with one design: build it as drawn, or change it first), then each open question with the same ready answers as the page's answer block, the suggested one first and marked as suggested; the person can always type their own text instead. Without such a tool, ask in one short message: the ask from the head and the open questions with their suggested answers, and say that the page's Copy answer gives a ready reply. Every question and message is in the person's language, and so is the text Copy answer gives: its connecting words come from the page's `data-phrase-*`. Do not choose, do not describe the drawings instead of showing them, and do not start building. When the person answers, go to `references/record.md`, "Record the answer"; when they ask to see changes first, to `references/revise.md`.
