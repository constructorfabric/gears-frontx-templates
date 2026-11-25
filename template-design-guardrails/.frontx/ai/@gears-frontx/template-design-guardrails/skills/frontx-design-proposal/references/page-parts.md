# Page parts

The rules for each part of the proposal page beyond the drawings and their notes. Every part appears only when it has something true to say; a one-screen request with no existing screen to change gets a short page: the top bar, then head, asked, overview, place, how, addresses, built, data, states, questions, answer. `scripts/check-proposal.mjs` checks every rule marked "(checked)". The Tasks example uses every part of a new feature (`assets/proposals/team-tasks/r1/proposal.html`, `r2/proposal.html`); the account settings example is the short page (`assets/proposals/account-settings/r1/proposal.html`); the Docs example changes an existing page and shows the problem, the mapping, the Today column of the paths and what today's same link opens (`assets/proposals/docs-redesign/r1/proposal.html`); the invitation example uses every optional part (`assets/proposals/invite-teammate/r1/proposal.html`).

## Top bar

Before `main`, the skeleton's `<div class="topbar">`: the FrontX mark with the word FrontX, a vertical line, the page title as the page's only `h1` (`.topbar-title`, "Proposal: <title>", with "Proposal" in the page's language, see "The page's language"), and at the far end two lines of page facts (`.topbar-meta`): the page id, revision and date, then "Everything here is proposed unless marked" with its scope chip (checked: the page facts are there, and the answer block names the page id and revision they show; in a folder check both name the folder's page id and revision exactly; the date is not checked). The mark is the product mark of the proposal tool, the same on every proposal page, never the surveyed app's logo; it lives in the skeleton and stays as it is (checked). The bar is sticky, white, with a line below; no menu, no theme switch; on a narrow screen the two lines go under the title. When the request names a tracker issue, the first line of page facts links it, after the date, with a plain https address: the one address on the page that leaves it (checked). The document's `<title>` is the same text as the h1 (checked). The `head` section then starts with the takeaway: one sentence of thirty words at most (checked), in names the person brings, never a description of the page.

## Section takeaways

Every section but the head, the glossary and the answer opens with its heading, then one sentence right under it (checked); the answer opens with its hint instead:

```html
<section class="sec" id="paths">
  <h2>Paths</h2>
  <p class="takeaway">Finding a guide gets shorter, but reading one API heading takes one step more than today.</p>
```

The takeaway says what the section settles, the conclusion a person who reads only the headings and takeaways carries away: one sentence, thirty words at most, no tip in it, never the heading again in other words (checked). A sentence ends at `.`, `!` or `?` before more text; the period of a common abbreviation (e.g., etc., Dr.) does not end it, and an ellipsis ends it only before a capital letter. Read in order, the takeaways tell the proposal as a story; on a page that changes an existing screen, a takeaway names what today lacks before the answer: in the person's words where they gave them, else as your reading of today's page ("As we read today's Home, it ..."), never as words the person did not say.

## What today's page lacks

Section `problem`, right after "What you asked for": when an existing screen changes, or the person asks the page to open on the problem. Two or three lines, each naming the part of today's page it is about (`<span class="small">Today: the tabs</span>`); the drawing of today's page sits in the mapping's disclosure.

- When the request says what is wrong, the lines say it in the person's words.
- When it does not (it asks for a change without saying why), the lines are your reading of today's page: what it does not do for the request, each naming the part, and the section says so once, in its takeaway or a line under it ("Our reading of today's Home; the request does not say what is wrong with it."). Never present that reading as the person's words.

## Phone and desktop

The apps FrontX builds are mobile first, so a phone drawing is never secondary. Every option, every screen without options and the one design shows two full drawings, the phone first (checked):

```html
<h4 class="view-name">On a phone</h4>
<div class="pair"><figure class="drawing" id="draw-a-phone"> one .d-app.d-app--phone window </figure>
<ol class="notes" data-for="draw-a-phone"> ... </ol></div>
<h4 class="view-name">On a desktop</h4>
<figure class="drawing" id="draw-a"> ... </figure>
<ol class="notes" data-for="draw-a"> ... </ol>
```

- Each has a phone drawing of its own, a `.d-app--phone` figure, and a desktop drawing (checked); the phone comes first (checked); a phone drawing is never inside a disclosure (checked).
- All options show the same views: if one option has a phone drawing, all have (checked).
- The phone drawing shows how the design really behaves at 390 px, with its own notes: counters wrap, a table becomes rows, tabs scroll or become a select, a board shows one column and says what it loses. It is never the desktop drawing squeezed.
- The map, the strip, the thumbnails and the states are built from the desktop drawings.

## Full drawings and zooms

- A full drawing is the page inside the app window with its navigation (`.d-side` or `.d-top`) (checked), filled with believable sample data, as many rows as the real thing has: six to ten for a list that grows, the exact count for a fixed short list the person named (three steps of a checklist are three); real-looking names, dates and numbers, one long value, one missing value shown in words, one state that stands out (overdue, failed), where the list can have them. The check counts no rows.
- Today's page is drawn as it looks, in the survey's values for that screen: a coloured band as `d-band` (the second band colour `d-band--alt`) with its `d-band-title`, a section heading as `d-section-title` (`references/drawing-kit.md`).
- A bare part without the app around it is a zoom: `<figure class="drawing" id="draw-x-zoom" data-zoom-of="draw-x">` holding one `d-app d-app--zoom` window, for a part already shown in that full drawing, larger or opened (checked). A zoom is never a thumbnail (checked).

## Thumbnails

The map and the overview never draw a screen twice. `<span class="mini" data-mini-of="draw-x"></span>` names the desktop drawing and is filled by the page script with a scaled copy of the first app window of that full drawing, so a thumbnail cannot drift from its section. It points at a full drawing that exists and is not inside a disclosure (checked).

## Side-by-side strip

With options, the overview starts with the same three or four sample rows in every option, at one scale and one height, so the difference is read at a glance (checked). Every cell shows its region's full width: side by side when the widest region still reads at a scale of 0.6 or more, otherwise stacked in one column at the strip's full width (`references/drawing-kit.md`, "The strip rule"). Each cell is cut by the page script from the option's full drawing, from the region marked `data-strip`; nothing is drawn again:

```html
<div class="strip">
  <figure class="strip-cell"><figcaption class="strip-name">A. Table</figcaption><span class="strip-clip" data-strip-of="draw-a"></span></figure>
  ...
</div>
```

One cell per option, each naming a full drawing of that option that marks a region (checked); the strip sits above the option links (checked); with one design there is none (checked).

Choose the region the options differ in: the list, the table, the board, the strip of steps with the card it leads to. When that part is two blocks, wrap both in one `d-stack` and mark it. Never mark a part every option shares (the page head, the counters), and look at the strip in a screenshot: a cell that does not show the difference is marked on the wrong region.

## Map of the screens

For a feature of more than one screen (checked), section `map`, before the overview:

- one `map-col` per main screen in click order; in it a `map-node` link to the screen's `.screen` section holding the thumbnail and the screen's name (`map-name`), one node per screen (checked);
- between two columns a `map-arrow` labelled with the main click that leads on ("Row click");
- a secondary screen (a dialog, an edit form) as a `map-node map-sub` under the node of the screen that opens it;
- one line under the map (`map-key`) saying what the arrows mean (checked).

With options, the node of the screen that has them shows the suggested option's drawing.

## Screens in "How it works"

With more than one screen, each is a `<section class="screen" id="screen-<name>">` with an `<h3>`, holding its drawing and notes, or its options. Options exist for one screen at most; the rest is drawn once.

## Data lines

When the page has a data section, every screen ends with one line (checked):

```html
<p class="reads">Reads: <span class="mark">exists today</span> people's names, from AccountsApiService; <span class="mark mark--new">needs a new data request</span> the tasks.</p>
```

The same marks label each field of "Data it needs". A field has one of three sources: "exists today" (a service the app has), "sample data in the project" (where the project's own design files say the data comes from a sample-data module in the project, with no request; mark it `<span class="mark">sample data in the project</span>`), or "needs a new data request". Never invent an endpoint. Where the project's design files say how data is supplied (sample data, no network calls), the data section says so, and the states section lists only the states that data can produce.

## Tips

A number or a claim may carry its source on hover and keyboard focus: `<span data-tip="Counted on the drawings: 10 rows in A, 6 cards in B">about half as many</span>`. Sources are the request, the survey (`survey.json`), a project file or a count on the drawings. A tip is never needed to understand a takeaway, and a takeaway holds none (checked); a tip is never empty (checked). Put a tip on the exact words it is about, never on the paragraph around them. The page script shows one note at a time in one box beside its mark, above it unless there is no room, and always inside the window, so neither a scroll box nor the window's edge cuts it; a tip opens on hover and on keyboard focus, closes on Escape, and a screen reader hears it through `aria-describedby`.

## Decision state chips

Each choice the page draws has one state:

- `accepted`: the person decided or agreed (their request said it, or their feedback settled it);
- `proposed`: the agent decided for them;
- `open`: nobody has; also listed in "Open questions".

```html
<span class="chip" data-state="accepted">accepted</span>
<a class="chip" data-state="open" href="#q-2">open</a>
```

A chip sits where the choice acts: in a note, a data line, a field. The top bar's page facts or a heading can give one state to everything under it (`chip chip--scope`); the top bar's covers the page ("Everything here is proposed unless marked"). A chip that repeats the state of its scope is a finding (checked). The text of a chip is its state, in the page's language; an open chip links to its question, `<li id="q-n">` in "Open questions" (checked).

## Disclosures

What is secondary (the current page full size, the long tail of a list) goes in one disclosure next to what it explains. A phone drawing is never secondary and never goes in one (checked; "Phone and desktop"):

```html
<details class="more"><summary>Today's Tasks page, full size</summary> ... </details>
```

The summary says what it hides in three words or more (checked). Two levels at most: the page, then one disclosure; never one inside another (checked). With every disclosure closed the page is complete for the decision: no recommendation, open question or thumbnail lives only inside one (checked for a thumbnail: one that points into a disclosure is a finding).

## Where each part of today's page goes

Only when the proposal changes or replaces an existing screen, section `mapping`: one table, Part, Today and Proposed (checked), one row per part of today's page with its change mark on the row (checked):

```html
<div class="tbl-wrap"><table class="tbl mapping" aria-label="Where each part of today's Docs page goes">
  <thead><tr><th>Part</th><th>Today</th><th>Proposed</th></tr></thead>
  <tbody>
    <tr data-change="moved"><th scope="row">Tabs Guides, API, Changelog</th><td>above the table</td><td>the Section filter beside search</td></tr>
    <tr data-change="removed"><th scope="row">Download all</th><td>top right</td><td>Removed: documents are read in the app now, <a href="#q-1">question 1</a></td></tr>
  </tbody>
</table></div>
<p class="legend"><span><span class="swatch" data-change="moved"></span>moves to a new place</span><span><span class="swatch" data-change="removed"></span>removed, with the reason</span></p>
<details class="more"><summary>Today's Docs page, full size</summary> today's page, drawn </details>
```

- The marks are `moved` (its new place in the info blue), `removed` (the part struck through in the danger red), `kept` (greyed), `renamed` (the same place, a new name, in amber; its Proposed cell gives the new name) and `added` (a part today's page lacks, in green). The frame draws them; never colour a cell by hand.
- A removed part says why in its Proposed cell, three words or more (checked), and links the open question when its removal is not settled.
- The legend under the table names every mark the table uses, and nothing else (checked).
- Today's page is drawn, full size and with its navigation, in a disclosure in this section, with notes on the parts the table names (checked). It is a drawing like the others, from the same survey: today as it is, never a screenshot.

## Built from what the app already has

One short line, forty words at most and no list (checked): what is reused, in plain words, and what is new. The full list with kit components and the screens that use them goes to CHOICE.md, Reuses; it serves the build, not the decision.

## Paths

For a feature of several screens, and for a single page that changes an existing page (checked: a page with a mapping has Paths); a new single page, with or without options, has none (checked). On a single page every step is on the one screen, named by its pins, and the Today column says how the task goes on today's page. Two or three typical tasks of the person, one table, a row per task and a numbered cell per step (checked):

```html
<div class="tbl-wrap"><table class="tbl paths-tbl" aria-label="Typical tasks, step by step, and how they go today">
  <thead><tr><th>Task</th><th>Step 1</th><th>Step 2</th><th>Step 3</th><th>Today</th></tr></thead>
  <tbody><tr>
    <th scope="row">Read the API rate limits<a class="longer" href="#q-2" aria-label="Longer than today, see open question 2">!</a></th>
    <td class="step"><span class="step-no">1</span><span class="step-screen">Docs list</span><a class="pinref" href="#draw-list" data-n="2">2</a><span class="step-what">Section: API</span></td>
    ...
    <td class="today" data-steps="2">API tab, then Open and scroll the file</td>
  </tr></tbody>
</table></div>
<p class="note"><span class="longer" aria-hidden="true">!</span> A path longer than today: <a href="#q-2">open question 2</a> asks ...</p>
```

- Each step cell shows its number in order, the screen, the pin of the control used there and what is used, in a few words (checked: two steps or more, every part present, the pin exists). Hovering or focusing a pin reference lights up its pin.
- When the proposal changes an existing screen, a Today column says how the task goes today, with its count of steps in `data-steps` (checked). A path that takes more steps than today carries the "!" mark linked to the open question that asks whether it may, and a line under the table says what the mark means; a path that is not longer carries none (checked). A task that cannot be done today says so with `data-steps="0"`.
- The "!" mark has no word of its own, so it carries an `aria-label` (checked).
- When the page serves more than one role, a task's name says whose task it is ("A team lead: reassign a task").

## Addresses

One table, a row per screen (checked), then one closing note (checked):

```html
<div class="bases"><div><span class="base-tag">in the app today</span><code>https://app.example/</code></div><div><span class="base-tag">inside the shell</span><code>https://shell.example/apps/team/</code></div></div>
<div class="tbl-wrap"><table class="tbl addresses" aria-label="Each screen's address">
  <thead><tr><th>Screen</th><th>Address</th><th>Reached from</th><th>What the link keeps</th><th>Today the same link opens</th></tr></thead>
  <tbody><tr><th scope="row">Docs list</th><td><code>/docs?section=api&amp;q=limits</code></td><td>the header</td><td>section and search</td><td class="today-opens">Docs on its Guides tab</td></tr></tbody>
</table></div>
<p class="note">A file link shared before keeps opening the file; Back returns to the list as it was left.</p>
```

- The address is the one the app's links carry (the survey's links: `/?screen=docs` when the menu builds its links that way), not only the registered route; when the two disagree, say which one a shared link carries. The form may be written with its named part in angle brackets, `/?screen=<route>` or `/tasks/<id>` (escaped as `&lt;route&gt;` on the page): one word in brackets inside an address that starts with "/" is the address form, not text left from the template (checked).
- The address shows what a link keeps: search and filters in the address, one item by its id.
- When addresses start with more than one base (the app on its own and inside a shell, today's and after a move), one line per base with its tag sits above the table and the table gives the part after the base; with one base there are no base lines (checked).
- When the proposal changes an existing screen, the column "Today the same link opens" says what each address opens today, so a link someone already shared is accounted for (checked).
- The closing note says what a shared link keeps and what Back does.

## Glossary

Only when the page coins names a person would not know (several screens, a new word for a new thing); a single page whose names explain themselves has none. At the end, before "Your answer": names the page coins or uses in its own sense, each `<dt id="term-<key>">` with a few words of meaning, one example the reader already knows ("Like a library book kept past its return date") and, when a section draws the thing, a link to it (`<a href="#screen-doc">Drawn in Document</a>`). Where a section first uses a term it is marked `<span class="term" data-term="<key>">`, and the page shows its entry on hover and focus. Every term has an entry, every entry is used, a term is marked once per section (checked). The map and the overview say the thing in plain words and mark no term (checked); before the section an entry links to, the page says the thing in plain words, except in a link to that section, the strip's option names and the person's quoted request (checked). One name per thing everywhere on the page; after a rename, search the page for the old name.

## Answer block

The page ends with section `answer`, heading "Your answer", where the person answers without typing it all: the suggested answers are already picked, the person changes what they disagree with, presses Copy answer and pastes the text into the chat. The markup is the template's (`templates/proposal.html`); its look is the frame's and its script is `answer-js`, both compared with the template (checked).

- The hint under the heading (`p.ans-hint`), as the template has it: the suggested answers are already picked; change what you disagree with, press Copy answer and paste it into the chat; you can also write the answer in your own words.
- The form `form#answer-form.answer`, its `data-subject` naming the proposal, its page id and its revision as the top bar does: `the Tasks proposal (page team-tasks, revision r1)` (checked, each as a whole word: `team-tasks-v2` or `r12` does not name `team-tasks` or `r1`).
- "Which option?" (`fieldset.ans-q[data-q="option"]` with its legend): one radio card per option (`name="option"`, `value` the capital letter, `data-say` the option's name), the label "A. Name" as the option's heading, then its "Best for" line; the recommended option carries the `suggested` tag and is the one checked. With one design instead of options, two cards: "Build it as drawn" (suggested, checked) and "Change it first", each with its `data-say` (`build it as drawn`, `change it first, as written under Changes`, in the page's language). The cards match the page's options, letters, names and `data-say` (checked): Copy answer writes the checked card's `data-say`.
- Each open question of the page, and no other, in its own `fieldset.ans-q[data-q="<n>"]` with the legend "n. " and the question, which may be shortened: two to four ready answers as radio pills (`name="q<n>"`), exactly one of them suggested, tagged and checked (checked: two at least, four at most). There is no "not decided" answer anywhere ("not decided", "decide later", "not sure", "no preference", "skip": checked): the person who has not decided keeps the suggested one or writes their own words.
- Each ready answer carries `data-say`, the full sentence the copied answer gives for it, five words or more (checked): it carries the meaning of the question, so a model with no context can act on it ("A task's status cannot be changed on the Task details screen in this first version: the screen is only for reading.", never "No").
- The reason for each suggested answer is one short sentence beside its question in the open questions section: `<span class="small why">Suggested: only on request, because the list is for what is open and late.</span>` (checked).
- "Anything to change?": one textarea (`name="changes"`) inside its label (checked).
- The live answer text (`pre#answer-text`), the Copy answer button (`#answer-copy`) and the state line (`#answer-state`) (checked). The text reads, line by line: `For the Tasks proposal (page team-tasks, revision r1) I choose option A, "Status tabs over a table".` (with one design: `... I answer: build it as drawn.`); then `My answers to the open questions:` and one numbered `data-say` sentence per question; then `Changes: none` or the person's text. These connecting words and the state lines are the answer form's `data-phrase-*` ("The page's language"). Copy puts it on the clipboard and says so; when copying is refused, the text is selected and the state line says to copy it by hand.
- Every ask (`.ask`), in the head and anywhere else, ends in a link to the block: `<a href="#answer">your answer</a>` (checked).

The block works by keyboard (radios, the textarea and the button are native controls), needs no server and fetches nothing.

## Optional parts

Four parts are never padding and never left out by habit: for every proposal the agent goes through the list below, adds each part whose rule matches, and writes in CHOICE.md, Optional parts, whether each was added and why (checked: all four named, each with a reason of three words or more, and "added" only when the page has it; the page has the guarantees when a promising sentence links a pin). When a part's rule matches, adding it is the default; leaving it out needs a reason the person would accept.

| Part | Add it when | Leave it out when |
|---|---|---|
| Flow | a decision leads to different screens or outcomes the person does not see at once, or three steps or more run in a fixed order across screens: a wizard, a checkout, sign-up with a check, an approval with accept and reject, an import with an error branch, an invitation | the screens are one click apart with no decision; the map already says it; a single choice made in one press on one screen (do it or skip it) is a state change, shown by a storyboard or the notes |
| Storyboard | one screen changes through an interaction the States section does not cover: a drag, an edit in place, a dialog of several steps, an upload with progress, a change shown at once that may be undone | the change is one press between two states the States section draws |
| Guarantee drawn as its mechanism | a sentence of the proposal promises only, never, always or cannot | the page promises nothing of the kind |
| Position cue | the page has more than seven sections after the head, or more than three screens (checked both ways) | a shorter page |

### Flow

Section `flow`, right after the map: the feature's own logic, its steps and decisions, start to every end. It is not the paths: the paths are a person's typical tasks with the controls used, the flow is what the feature does with every case, the refusal and the error included.

```html
<figure class="flow-fig"><div class="flow" data-cols="3">
  <a class="flow-step" id="f-invite" href="#draw-invite" data-row="2" data-col="2"><span class="flow-name">Invite a teammate</span><span class="flow-what">types the address, presses Send</span></a>
  <span class="flow-decision" id="f-member" data-row="3" data-col="2">Already in the team?</span>
  <span class="flow-end" id="f-refused" data-end="stop" data-row="4" data-col="3">Refused, says who it is</span>
  <span class="flow-step flow-step--outside" id="f-mail" data-outside data-row="5" data-col="2"><span class="flow-name">Email</span><span class="flow-what">outside the app</span></span>
  <span class="flow-edge" data-from="f-member" data-to="f-refused">Yes</span>
</div><figcaption>A box is a screen and links to its drawing; the dashed box is outside the app; a six-sided box is a decision.</figcaption></figure>
```

- Boxes sit on a grid of two, three or four columns (`data-cols`), by `data-row` (1 to 10) and `data-col`, one box per cell (checked). The main line runs down one column; a branch steps one column aside and one row down, so its label sits above an empty cell. The page script draws every connector from the `.flow-edge` list and places its label where the line leaves the box.
- A step is named by its screen, the name the map uses, or on a page without a map the name in the caption of the drawing the step links (checked), with what happens there in a few words, and links to the drawing that shows it (checked); a step outside the app (an email, another system) is a dashed box marked `data-outside` with no link (checked).
- One start, `data-start` on a step, its value the word shown above it in the page's language, `data-start="Start"` in English (checked). Every box but the start has a way in, every box but an end a way out, and an end has none (checked).
- A decision is the six-sided box with two ways out or more, each with its label: "Yes", "No: used or expired" (checked, five words at most).
- Every branch reaches an end; an end says how it finishes, `data-end="done"` (green, a tick) or `data-end="stop"` (red, a cross); a flow with a decision draws its refusal or error branch to a stop end (checked).
- A flow of fewer than three steps with no decision is left out (checked).
- Rendered (`checkProposalLayout()`): no box or label on top of another (`flow-overlap`), no connector through a box or a label other than its own two ends (`flow-crosses`). At 390 px the grid keeps its columns with smaller type; a fourth column is for a wide page only.

### Storyboard

One screen in three to six consecutive states, still drawings in a row, a numbered caption under each and an arrow between them; on a narrow screen they stack with the arrow pointing down. It sits inside the screen, the option or the design it belongs to, never in a disclosure (checked), after its drawings:

```html
<h4 class="view-name">Sending, step by step, on a phone</h4>
<ol class="story" data-width="phone" aria-label="Sending an invitation, step by step">
  <li class="story-frame"><figure class="drawing" id="draw-send-1" data-zoom-of="draw-invite-phone"> one .d-app.d-app--zoom window </figure><p class="story-cap"><span class="story-no">1</span>The address is typed; Send invitation is ready.</p></li>
  ...
</ol>
```

- Each frame holds one drawing, usually a zoom on the part that changes, and a caption numbered in order, sixteen words at most, that says what changed (checked).
- The storyboard is drawn at the width where the interaction matters, phone or desktop, not both: `data-width` and the heading right before it name it (checked).
- It belongs to the interaction, not to an option. When every option has the same interaction, one storyboard sits in the recommended option, followed by one line saying so (`<p class="small story-same">Skipping works the same in option B.</p>`); when the options differ in that interaction, each option has its own (checked: a storyboard in some options but not all is in the recommended option alone, with that line).
- Pictures, not motion: nothing plays, so the page's motion guard covers it. A frame may carry pins and notes like any drawing; the pin of a guarantee often sits on one.

### A guarantee is drawn as its mechanism

A sentence of the proposal that promises never, always, cannot, can only, only once or only ... can is a guarantee, and the page shows what makes it true: the control that is absent or inactive for the other role, the confirmation, the autosave mark, the button that locks after the first press, the page a used link opens. That thing carries a pin with a note on a drawing or a storyboard frame, and the sentence links the pin with a pin reference, placed before its full stop:

```html
<p>An invitation can be used only once: after Join, the same link opens this page, with no Join button <a class="pinref" href="#draw-join-used" data-n="1">1</a>.</p>
```

- Checked in the visible text of every section but What you asked for (the person's words, the assumptions and the non-goals), the open questions, the glossary and the answer, outside drawings, flows, storyboards and notes (a note already sits at its pin). A sentence with such a word and no pin reference fails, unless it links its open question; a promise that is only assumed goes under What we assumed.
- When nothing on the page can show the mechanism, say the mechanism in words instead of the promise ("The address holds no account, so a shared link opens the reader's own settings"), or ask it as an open question.

### Position cue

Past seven sections after the head or three screens, a `nav.cue` right after the head lists every section after the head, in the page's order, each a link with a short name (checked both ways: every entry points at a section, every section has an entry, none on a shorter page):

```html
<nav class="cue" aria-label="On this page"><span class="cue-title">On this page</span><ol><li><a href="#asked">Request</a></li><li><a href="#map">Screens</a></li> ... </ol></nav>
```

On a wide screen the cue sticks under the top bar and the page script marks the section in view (`aria-current`); on a narrow one it is a plain list of links under the head. Without the script it stays a list of links.

## The page's language

The page is in the person's own language, the one they write in. `<html lang>` names it with a language tag (`de`, `pt-BR`; checked: the page has one, in the shape of a tag, two or three letters and then optional parts joined by hyphens; a value of another shape, such as `English` or `en_US`, is a finding and the page is judged as English), and every text the agent writes is in it: the title and its word for "Proposal", the page facts, the takeaways, the ask, headings, prose, option names and their two fields, notes, sample data, chips, the data marks, the suggested tag, the open questions, their ready answers and `data-say` sentences, the hint, legends, the button's label, `data-subject`, the zoom dialog's Close. On a page in English the check reads the English labels this file names ("Proposal:", "Best for", "Trade-off", "suggested", a chip's state, "Changed since r<n>:", "on a phone", the table columns, the overview's "The same in every option"); on a page in another language it finds the same parts by place and class (the overview's comparison is its `dl` with two terms or more), so write them in that language (checked), and give every column of the mapping, paths and addresses tables its heading (checked).

The words the frame writes itself come from the page too, so write them in the page's language. The answer form carries them, one attribute per phrase: `data-phrase-choose` (`For {subject} I choose option {letter}, "{name}".`), `data-phrase-answer` (`For {subject} I answer: {answer}.`, with one design), `data-phrase-questions` (`My answers to the open questions:`), `data-phrase-changes` (`Changes: {changes}`), `data-phrase-none` (`none`), `data-phrase-copied` and `data-phrase-failed` (the Copy state lines), and `data-phrase-wide-part` (the name of a scroll box with no caption). The script fills each `{place}` with the text it stands for, so keep every place in the phrase (checked). The flow's start carries the word shown above it: `data-start="Start"`. The skeleton gives all of them in English; English is only the default, used where a page leaves a phrase out, so on a page not in English each phrase and the start's word are required (checked). The check finds a guarantee sentence and a "not decided" answer by English words, and counts words between spaces; in another language apply those rules yourself. The record keeps fixed English names: CHOICE.md's field names and status values (`references/record.md`), `survey.json` keys, and the page's classes, ids and `data-*` values. The person's own words quoted in CHOICE.md stay as they said them.

## Words on the page

- A section shows at most 120 words of prose beside its drawings, notes and tables; a screen and an option count on their own (checked). A paragraph that lists parts or steps is a drawing or a table not made yet.
- A table cell of the mapping, the paths or the addresses is a label of twelve words at most (checked); a note's label five, a note thirty-six.
- No arrow written as text in a drawing, a note, the map or a table (checked): order is a column, a step number or the map's drawn arrow.
- Template text left behind (`{{...}}`, TODO, REPLACE, `<what goes here>`), garbled characters and a control character (C0, DEL or C1) in the text or an attribute value other than tab, line feed, form feed and carriage return are findings (checked); so are an id used twice and an in-page link to an id the page lacks (checked).
- Every text taken from the person or the project (the quoted request and feedback, an app name, a screen label, a route, a sample value read from the app) is HTML-escaped before it goes into the page: `&` as `&amp;`, `<` as `&lt;`, `>` as `&gt;`, `"` as `&quot;` inside an attribute. Paste `brandHtml`, `brandDefs` and `appLookCss` as the survey prints them; they are already safe.

## A self-contained, locked page

The page fetches nothing and runs only the skeleton's two scripts. Its `<meta http-equiv="Content-Security-Policy">`, right after the charset, allows no network at all, images only as `data:`, the page's inline styles, and the two scripts by their hashes; keep the meta and both scripts byte for byte as the skeleton has them, or the browser stops the scripts (checked). No address leaves the page but an https link to the tracker issue in the top bar's page facts; no event handler attribute, no `javascript:`, no CSS that loads anything, no embedded page (checked).

The check reads the page as a browser does and reports any markup it could read differently (checked). So the page keeps the skeleton's plain shape: one `<html>`, `<head>` and `<body>`, the Content-Security-Policy meta right after the charset, with only the doctype, `<html>`, `<head>`, meta tags, the title and comments before it, the one `<title>` in the head, and no `<template>`. Tag and attribute names are plain ASCII, and an address holds no control character (checked).

An svg on the page (an icon, a small chart, the logo) holds only drawing elements: `svg`, `symbol`, `defs`, `g`, `use`, `path`, `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`, `linearGradient`, `radialGradient`, `stop`, `clipPath` and `mask`, the same list the survey keeps in a logo; each is closed by its own end tag or by `/>` (checked). An svg holds no `title`, `desc`, `foreignObject`, `text`, `a`, `style`, `script` or other element, and the page has no `<math>` (checked). Name an icon with `aria-label` on the `svg` (or `aria-hidden="true"` when the text beside it already says it), never with a `title` inside it; put labels, links and formulas in HTML outside the svg. A paint or clip reference points into the page (`fill="url(#grad)"`); attributes such as `fill`, `stroke`, `filter`, `mask`, `clip-path`, `marker` and `cursor` are read as CSS on every element, so none of them loads anything (checked). Write no `<` followed by a letter, `/`, `!` or `?` inside a style block (its comments included) or inside a comment: name a component as Header or the Header component, never `<Header>`. The skeleton's own comments may stay as they are. Prose may name `http-equiv`; only an attribute counts.

## Wide parts and the rendered check

A drawing, the map and every table sit in their own scroll box (`.scroll`, `.map`, `.tbl-wrap`); the page itself never scrolls sideways. The page script gives every box that scrolls a keyboard stop, the role region and a name from its caption, its table's label or its heading. Nothing moves for a reader who asked for less motion, and the page prints with the top bar once at the top. The frame script also offers `checkProposalLayout()`, the rendered check a session with a headless browser runs (`references/propose.md`, step 6); it reports a badge or chip stretched across its row, or a badge a `d-stack` stretches to the width of a wider one (`stretched`: wrap it in a `d-row`), and on a page with a flow boxes on top of each other and connectors through a box or a label.

## Changed since

From r2 on, the head carries one line before the takeaway (checked): `<p class="changed">Changed since r1: <a href="#screen-list">the list is the table you chose</a>; ...</p>`, each link to a changed section that exists (checked); on a page in another language the line is in that language and names the previous revision, `r1:` (checked). r1 has none (checked). `references/revise.md` is the procedure.

## Why the page is shaped this way

- The person decides from the page alone, often later and without the conversation, so every name, mark and number makes sense on the page.
- A person reads the headings and the first sentence under each and stops; the takeaways carry the proposal for that reader, the drawings and notes carry it for the one who looks closer.
- Mobile first is how the apps are built, so a phone drawing is never secondary, and every option is shown the same way or the options cannot be compared.
- Drawing in the app's own look, from the survey, shows the proposal as it will be without a build; a screenshot would need a built and served app, and a generic wireframe would hide what the app's look decides.
- A change to an existing page is judged against today: what each part becomes, what each task costs in steps, what an already shared link opens. A step longer than today is a cost the person decides, never one the page hides.
- The page is light, on white, with neutral greys, so the only colour is the app's own in its drawings and the few marks that carry a meaning.
- A feature's branches, an interaction's steps and a promise are where a person most often misreads a proposal, so each gets a picture when it exists: the flow shows every branch to its end, the storyboard shows the states between two drawings, the pin shows what keeps a promise true. A long page gets a cue so the reader knows where they are.

Shapes that do not work, and why: a screenshot of a built app (needs a build and a server, and shows one state only); a phone drawing in a disclosure (read as secondary, so the phone layout went undecided); a dark frame around the drawings (fought the app's own colours); a row of boxes with arrows for each path (no room for what is used at each step, and no column to compare with today); a two-column mapping (could not say what was removed and why at a glance).
