# The drawing kit

Blocks that mirror the FrontX UI Kit's components and the app's chrome, in plain HTML and CSS: `templates/draw/draw.css` styles them, `templates/draw/blocks.html` holds one fragment per block to copy. `templates/proposal.html` carries `draw.css` unchanged, and `scripts/check-proposal.mjs` rejects a page whose copy differs, so a drawing never gets a look of its own. The app's shapes come in two ways only: custom properties (values) and block variants (classes). The agent writes no CSS of its own.

## Custom properties

Every colour, size and spacing of a block comes from a `--d-*` property on `.d-app`. The survey prints each value with the file it was read from, and per screen what it uses beyond the shared values (its own heading, section heading and bands, `screenLooks`), in the order the app uses them: the CSS Modules of the screens the app shows (and the kit tokens their root re-declares), the shell's header and menu styles, the active theme's own variables, and only then the installed kit. The defaults in `draw.css` are the kit's light values.

| Property | Read from (app first, kit last) | Used for |
|---|---|---|
| `--d-bg` | what the page shows, with the kind of its source (screen, shell, theme): the shown screen root's background, else the shell's page background behind the screen (`.screen` of `layout/Screen.module.css`, then `html`, `body` or `#root` of `globals.css`), else the active theme's `--background` | the page area |
| `--d-surface`, `--d-text`, `--d-muted`, `--d-subtle`, `--d-line` | `--card`, `--foreground`, `--muted-foreground`, `--muted`, `--border` | cards, text, secondary text, quiet fills, lines |
| `--d-accent`, `--d-accent-text` | `--primary`, `--primary-foreground` | primary button, active tab, underline, bars |
| `--d-ok`, `--d-warn`, `--d-danger`, `--d-info` and their `-soft` | the kit's status tokens | status badges and alerts |
| `--d-nav-bg`, `--d-nav-text`, `--d-nav-active`, `--d-nav-active-text` | `--left-menu*` (else the sidebar tokens) | side menu |
| `--d-toplink`, `--d-toplink-active` | the header link's colour, plain and active | top header links |
| `--d-nav-h`, `--d-nav-pad`, `--d-nav-gap`, `--d-nav-size` | the header bar's height and side padding, the gap between links, the link size | top header |
| `--d-brand-size`, `--d-mark`, `--d-mark-color` | the app name's size, the logo's size, the colour an inlined SVG logo draws in (the shell's colour for the mark, else the colour the menu's own CSS module gives the logo or the menu, else the accent; set only when the logo is an SVG) | brand |
| `--d-tab-active` | the active tab's text colour: the app's own (the colour a screen's CSS gives its active tab trigger), else the kit's `--secondary-foreground` | `d-tab--active` |
| `--d-radius` | the cards' radius, else `--radius` | cards, inputs, lists |
| `--d-font` | `--font-sans` | all text |
| `--d-h1`, `--d-h1-weight`, `--d-h1-track` | the page heading's size, weight and letter spacing | page title |
| `--d-lead` | the line under the heading | `d-lead` |
| `--d-h2`, `--d-body`, `--d-small` | card title, body text, labels | section title, body, small text |
| `--d-stat` | the counter number's size (its own value, not derived from the heading) | `d-stat__value` |
| `--d-gutter`, `--d-max`, `--d-top` | the content column's side padding, its maximum content width, the space above the heading | `d-main` |
| `--d-btn-h`, `--d-btn-radius` | the main button's height and radius | `d-btn` |
| `--d-th-case` | the table header's text case (`uppercase` or `none`) | `d-table th` |
| `--d-h1-phone`, `--d-gutter-phone`, `--d-top-phone`, `--d-nav-h-phone`, `--d-navrow-h-phone` | the same values below the app's first breakpoint | `d-app--phone` |
| `--d-section`, `--d-section-phone` | a screen's section heading (`.sectionTitle`, `.sectionHeading`), desktop and phone; default 0.8 of the page heading | `d-section-title` |
| `--d-band-bg`, `--d-band-text`, `--d-band-alt-bg`, `--d-band-alt-text` | the first and second coloured band of a screen (a rule named hero, band, banner, closing, promo and the like that sets a background and a text colour), from the app's own tokens; default the accent with its text, and the text colour with the surface | `d-band`, `d-band--alt` |
| `--d-band-title`, `--d-band-title-phone`, `--d-band-title-weight` | the page heading of the screen holding the bands, when it differs from the shared one (a landing screen's larger hero headline beside the page heading the other screens share); default the page heading | `d-band-title` |

### The scale rule

The drawing window is 1120 px wide and stands for a 1440 px desktop screen, so a desktop size in pixels is drawn at `round(px * 1120 / 1440)`, never below `min(px, 16)` px so text stays readable (52 px becomes 40, 68 px becomes 53, 72 px becomes 56, 12 px stays 12). The phone window is 390 px like a phone, so phone sizes are drawn as they are. Letter spacing in `em`, weights and colours are not scaled. The survey applies the rule and prints the real value beside each scaled one (`--d-h1: 40px (52px in the app)`), so the agent computes it only for a value it reads by hand (below).

### Overriding a value

The app-look block holds the survey's values as printed. Values are written without double quotes or backslashes; single quotes stand only in `--d-font`, in pairs around a font name, as in `--d-font: 'Inter', sans-serif;`, a `(` closes within its own declaration, and no value holds a `[` or a `{` (checked). When a value is wrong or `unresolved`, the agent reads the file the survey names and writes the value with its reason on the same line. A desktop size read by hand is drawn by the scale rule like the survey's, and the reason names the app's own value: `--d-h1: 36px; /* why: DESIGN.md sets the page heading at 46 px, drawn at round(46 * 1120 / 1440) */`. With `survey.json` beside the page, `scripts/check-proposal.mjs` fails a value that differs from the survey, is missing, or is not in it, unless such a comment (three words or more) stands beside it. A comment does not name url() or @import: the check reads comments as CSS.

## Variants

The survey names the classes under `variants` in `survey.json`; the check fails an app window, navigation, phone header or brand without them, unless the element says why in `data-why`. The window's classes are checked on the desktop window only: a phone window takes `d-app d-app--phone` and the phone header's classes.

| Variant | Classes | Shape |
|---|---|---|
| Active link | `d-active--underline`, `d-active--pill`, `d-active--filled` on `d-side` or `d-top` | the active link underlined in the accent, on a grey pill, or filled |
| Header links | `d-top--end` on `d-top` (else right after the brand) | links pushed to the far end |
| Phone header, two rows | `d-top d-top--rows` with `d-toplinks` | the brand row, then a row of links that scrolls sideways inside itself; no menu button |
| Phone header, menu button | `d-top` with `d-burger` | the menu folded into a button |
| Brand mark | `d-brand d-brand--logo` with `d-logo` (the app's own logo), `d-brand` (a square in the accent), `d-brand d-brand--initials` with `d-mark` | the app's logo inlined; the square when there is a logo the survey cannot use; a letter or initials when there is no logo |
| Counters | `d-stats--plain` | counters without a card around each |
| Selected | `d-card--selected`, `d-stat--selected` | a card or a counter that is the current choice or filter |

### The brand mark

The page carries an SVG logo once: `survey.json` gives `brandDefs`, a hidden `<svg class="brand-defs">` holding the logo as `<symbol id="brand-mark">`, pasted once right after `<body>`, and `brandHtml`, whose `d-logo` holds only `<svg aria-hidden="true"><use href="#brand-mark"/></svg>`. Thumbnails, the strip and the enlarged view copy the `use`, so they draw the same logo; the page stays one self-contained file. A small image logo is embedded in each brand as before.

The survey looks for the shell's logo in `src-app/app/layout` (the header, menu or sidebar component): a component whose name holds Logo or Mark that the shell imports from the app (its `<svg>`), an inline `<svg>` beside the brand, or an image file the shell imports (`.svg`, `.png`, `.jpg`, `.gif`, `.webp`). It prints what it found under `brandMark` with the file, and the brand as the drawing writes it under `brandHtml`; every drawn header pastes `brandHtml` as it is.

- An SVG is cleaned and inlined in `d-logo` at `--d-mark` (the logo's surveyed size, scaled) in `--d-mark-color`: only shape elements (`svg`, `symbol`, `g`, `path`, `circle`, `ellipse`, `rect`, `line`, `polyline`, `polygon`, `defs`, gradients, `stop`, `clipPath`, `mask`, `use`) and their drawing attributes stay; scripts, `foreignObject`, `image`, `style`, classes, event handlers and any reference outside the page (a `url()` or `href` not starting with `#`) are removed. The survey names every element it removes, the class, style and event handler attributes, any attribute it does not know, and the values and references it drops; the bookkeeping attributes (`aria-*` but `aria-hidden`, `role`, `focusable`, `tabindex`, `data-*`, `xmlns:*`, `xml:*`, `version`, `key`, `ref`) go quietly. A value may call only `url(#id)`, a colour function (`rgb()`, `rgba()`, `hsl()`, `hsla()`), a transform or `var(--name)` in a colour; any other function, `color-mix()` included, is removed with its attribute. A `use` counts as drawing only when the logo itself defines what it points to. A reference to an element of the page that the logo does not define is removed with its reason too; an id of the logo that the page also uses is renamed `logo-<id>`, with every reference to it, and a logo whose ids cannot be renamed apart from the page's is not inlined. A cleaned SVG over 64 KB is not inlined.
- An image file of at most 16 KB (16384 bytes) is embedded as a `data:` URI in an `img` inside `d-logo`.
- Fallback: when the shell has a logo the survey cannot use (it comes from a package, its SVG takes a value from code, the image is over the cap, the file cannot be found) the drawing keeps the accent square (`d-brand`); when the shell has no logo at all it draws initials (`d-brand d-brand--initials` with `d-mark`). In both cases `brandMark.why` says which and why, and the survey's list prints it on the Brand line.

The check accepts an `svg` or `img` only as the one child of `d-logo`: the `use` of `#brand-mark` when the page defines it once (one `svg.brand-defs` outside `main`, clean elements and attributes, the survey's own `brandDefs`), an inlined svg with the cleaned elements and attributes only (when the survey gives no `brandDefs`), an image only as a `data:` URI under the cap, and with `survey.json` beside the page only the survey's own mark; a logo inlined again where the survey defines it once, and a `d-brand--logo` brand without its `d-logo`, are findings.

## Blocks

The right column is what a builder needs later: the kit component and the facts the gates of `../frontx-design/` check.

| Block | Classes | Stands for |
|---|---|---|
| App window, side menu | `d-app`, `d-side`, `d-brand`, `d-navlink`, `d-navlink--active`, `d-navlink--new`, `d-new`, `d-main` | The shell layout: left menu, then the screen. The new page is a screen extension with a menu label and order in its package's `mfe.json`; the shell draws the menu. |
| App window, top header | `d-app d-app--top`, `d-top`, `d-topend` | The shell header; same extension facts. `d-topend` holds what sits at the far end (an avatar). |
| Phone window | `d-app d-app--phone`, `d-burger` or `d-top--rows` with `d-toplinks` | The same screen at 390 px, with the app's own phone header; drawn for every option and screen, before the desktop window (`references/page-parts.md`, "Phone and desktop"). |
| Short window | `d-app d-app--mini` | Any window without the minimum height: navigation and state drawings. |
| Zoom | `d-app d-app--zoom` | A part already shown in a full drawing, larger or opened (an open select, a dense cell), without the navigation; only in a figure with `data-zoom-of`. Never a thumbnail. |
| Page head | `d-pagehead`, `d-pagehead__text`, `d-h1`, `d-lead`, `d-muted` | The screen's title, the line under it and one primary `Button`; one primary action per view. |
| Card | `d-card`, `d-card--flush`, `d-card--selected`, `d-h2` | `Card` with `CardHeader`, `CardTitle`, `CardContent`. |
| Coloured band | `d-band`, `d-band--alt`, `d-band-title` | A full-width section on one of the app's band colours (a hero, a closing band), text in the column, light or dark text from the survey (`--d-band-*`); first or last in `d-main` it meets the header or the window's foot. Built from the app's own section markup and tokens, no kit component. |
| Section heading | `d-section-title` | A long page's section heading (`Text` with the app's section size), bigger than `d-h2`, its size from the survey (`--d-section`). |
| Stepper | `d-steps`, `d-step`, `d-step--done`, `d-step--current` | Numbered steps in a row: done (a tick), current (filled), to do. In a phone window the row becomes a vertical list; or draw a `d-select` for the current step. No kit component: name it as a kit gap. |
| Progress bar | `d-progress` (share done in `--w`) | `Progress`, where the kit has one; else a kit gap. |
| Counters row | `d-stats`, `d-stats--plain`, `d-stat`, `d-stat--selected`, `d-stat__value`, `d-stat__label` | A row of `Card`s with one number and a label each, or the numbers alone (`Text` with the kpi typography). |
| Table | `d-table`, `d-num`, `d-clip`, inside `d-card d-card--flush` | Table block = kit `Table` (`TableHeader`, `TableRow`, `TableHead`, `TableBody`, `TableCell`) inside a bordered `Card`; numbers right-aligned; a long text cut to one line keeps its full text reachable. |
| Badge | `d-badge`, `d-badge--ok`, `--warn`, `--danger`, `--info` | `Badge`; status is never colour alone, the word is always there. |
| Avatar | `d-avatar` | `Avatar` with `AvatarFallback` initials. |
| Tabs | `d-tabs`, `d-tab`, `d-tab--active` | `Tabs`, `TabsList`, `TabsTrigger`. |
| Buttons | `d-btn`, `d-btn--primary`, `--outline`, `--ghost`, `--sm` | `Button` variants default, outline, ghost; size sm. |
| Input | `d-input`, `d-input--search`, `d-field`, `d-label` | `Input` in a `Field` with `FieldLabel`. |
| Select | `d-select` | `Select` with `SelectTrigger` and `SelectValue`. |
| Checkbox, switch | `d-check`, `d-check--on` (a tick), `d-switch`, `d-switch--on` | `Checkbox`, `Switch`, each with a `Label`. |
| Alert | `d-alert`, `d-alert--info`, `--warn`, `--danger`, `--ok` | An inline message; no kit component of its own, built from the kit's status tokens. Name it as a kit gap. |
| Empty state | `d-empty` inside `d-card` | An empty state: what is missing and one action. |
| Loading | `d-skel` (width `--w`) | `Skeleton`. |
| List rows | `d-list`, `d-listrow` | Rows in a bordered `Card`, or the kit's list pattern where the kit has one. |
| Board column | `d-board`, `d-col`, `d-colhead`, `d-tile` | No kit component: columns of `Card`s; dragging is new behaviour. Name it as a kit gap. |
| Chart placeholder | `d-chart`, `d-bar` (height `--h`) | A chart; the drawing shows only its place and size. Charts follow `../frontx-design/references/data.md` when built. |
| Layout helpers | `d-row`, `d-row--between`, `d-stack`, `d-grid` (`--cols`), `d-grow`, `d-strong`, `d-small` | Layout only; the build uses the kit's layout and the app's spacing tokens. |

The strip of the overview is not a block: mark the region of each option's drawing that the options differ in with `data-strip` (a table card, a list, a grid, a board, a strip of steps with its card, two blocks wrapped in one `d-stack`), and the page script cuts it out (`references/page-parts.md`, "Side-by-side strip").

### The strip rule

Every strip cell shows the full width of its region; a cell never crops it sideways. The page script (`stripFit`) fits by width first, at one scale for all cells: the widest region is fitted to a cell (at most 1, never enlarged). When that scale falls below 0.6, the cells would be too small to read, so the strip stacks to one column and the scale is fitted to the full strip width instead. All cells share one height (the shortest region at that scale, at most 280 px), so the same top rows of every option are read at the same size; the region may be cut at the bottom, never at a side. A region of full page width (a table card across the column) therefore stacks the strip; regions narrow enough to fit three across at 0.6 stay side by side. `tests/proposal-look.test.mjs` asserts that a region times the scale never exceeds its cell.
