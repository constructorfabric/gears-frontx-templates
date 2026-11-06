# Verify

Turn "unverified" into "observed". Two checks, both in
`src-app/verify_packages/design-verify/` (`@gears-frontx/design-verify`): the
static check reads the screen's source with no browser; the browser check
reads what the runtime design-defect checker sees in the rendered app. Both
observe and do not fix: hand findings back to the build
(`references/generate.md`). Both are advisory by default (findings never
fail the run) and both honour the waiver file ("Waivers"). When a person
asks for a gate, set one up as "Gate a build" below describes.

## Static check

From the project root, on the screen's own source:

```
npm run verify:static --workspace=@gears-frontx/design-verify -- \
  --src src-app/mfe_packages/<package> [--src <dir or file>...]
```

- It reads `*.module.css`, `*.tsx` and `*.ts` under `--src` (tests and
  stories excluded) and reports each finding with its gate,
  `file:line:column`, what it found and the fix:
  - SYS-002: a literal colour, spacing, radius, font size, shadow, duration
    or easing where `DESIGN.md` names a kit token of that kind, in a CSS
    Module or an inline `style`; values inside `var()` and `0` pass, a colour
    in a local custom property does not; a colour derived from a token
    passes: a relative colour (`rgb(from var(--x) r g b / 50%)`) is checked
    by its origin, and `color-mix()` by each colour it mixes;
  - SYS-001: a native element or role the kit ships a component for, and an
    `<a>` with `onClick` and no link target.
- What counts and what to use instead is data: `rules/static-check.json`.
- It writes `design-verify-report/static-findings.json`. `--baseline`,
  `--fail-on-findings` and the exit codes work as in the browser runner
  ("Gate a build"); a source file that does not parse is exit 2, and so is
  a `--src` that selects no file. It follows symbolic links. It lists as
  `SKIPPED`: an entry that cannot be read (a broken link, no access) unless
  an exclude glob covers it, since what it points to is unknown; a link
  cycle or a directory it cannot list, unless excluded; a file the globs
  select that is not a regular file; and a second path to a file already
  read. Only an exclude glob ending in `/**` (`**/dist/**`) excludes a
  directory. Directories named `node_modules` or `.git` are never entered
  and never listed.
- It sees source, not composition: a clean static check is not a rendered
  pass. Run it first, fix what it reports, then run the browser check.

## Browser preconditions

1. The assembled project runs in dev mode (`import.meta.env.DEV`); the shell
   loads the checker only there, and production builds drop it.
2. A way to observe: the package's runner
   (`npm run verify:ui --workspace=@gears-frontx/design-verify -- --help`),
   which drives a headless Chrome over CDP and needs a Chrome or Chromium
   executable, or a running one through `--cdp-url`. Fallback: a way to read
   the app's console (for example a DevTools connection). No other
   browser-automation framework or home-made driver script.

When a precondition fails, report `environment unavailable` with the missing
piece and how to supply it, and return: that report is a complete result.
Never simulate findings. Never wait open-endedly or start a dev server as an
unbounded foreground command: after two settle-and-read attempts with no
output, the environment is unavailable. `--start-server "npm run dev:all"`
is the sanctioned way to bring a server up (bounded waits, stopped at the
end); it runs the command from the directory npm was invoked in, so run the
runner from the project root or pass `--server-cwd <project root>`. Runner
exit code 2 is the `environment unavailable` report: relay its message. The
same exit code fires when a screenshot asked for with `--screenshots` could
not be captured or written (listed as `SCREENSHOT <route> <theme> <width>px`):
that screen is not verified until the capture succeeds.

The shell logs the checker's status in dev; trust the lines:

- `[verify-packages] none installed`, followed by "no dev-time verification
  will run": the missing piece; the remedy is
  `frontx add` for this template, then `npm install` (not `npm ci`: the
  shell's lockfile predates the package). Name it; do not run it.
- `[verify-packages] ... failed to load: ...`: a blocking environment
  finding with the logged cause.
- `[design-defects] clean: no objective design defects detected`, or
  `[design-defects]` finding or `needs review` lines: the checker runs.

## Run the browser check

One runner call sweeps every screen, theme and width and writes
`design-verify-report/findings.json`. The default widths are 1440, 768 and
390 CSS px (APP-005) and the 320 CSS px floor (LAY-002); the default themes
are light and dark:

```
npm run verify:ui --workspace=@gears-frontx/design-verify -- \
  --menu "Login,Tasks" [--design-md DESIGN.md] [--start-server "npm run dev:all"]
```

- Navigation flag: reach each screen by its menu label (`--menu "A,B"`, the
  user's path) or by its composed address (`--routes "/?screen=orders"`).
  Never pass the bare route value (`/orders`) or an address that names no
  registered screen: the shell leaves the content area empty and the sweep
  reads as clean.
- Themes: the runner stores each theme id where the shell restores it at boot
  (`localStorage` key `frontx:theme`, a raw id; `--theme-key` for an app
  that reads another key; Studio's key is refused there) and in FrontX
  Studio's own key (`frontx:studio:theme`), because a dev build with Studio
  applies Studio's stored theme over the shell's after mount. Every state,
  the `DESIGN.md` contrast states included, then checks that the page took
  the theme. After boot the shell's key always holds the id of the applied
  theme (the shell writes back its `default` fallback in place of an
  unregistered id), so for every theme id the id stored under the key must
  be the requested one, and a `light` or `dark` request must also show that
  `data-theme` on the document element. A page in another theme, an id the
  app has not registered (`--themes drakula` boots `default`) included, is an
  environment failure for that state (the run exits 2), naming the requested
  theme, the `data-theme` it shows and the stored id, never a clean state.
- Checks the sweep could not decide sit in each state's `needsReview` list;
  a state with any is not clean.
- `--design-md DESIGN.md` also measures the text contrast of the `DESIGN.md`
  pairs in each theme, as a state named `DESIGN.md`
  (`references/design-md.md`, "Measure its contrast"). Token contrast does
  not depend on the width, so that state is keyed by theme alone (the width
  it was probed at is `probedWidth`), and a baseline from a run with other
  `--widths` still matches it.
- The runner does not switch data states. States behind user actions or
  mocks (`references/state-completeness.md`) need the manual protocol; name
  them unverified if neither path reached them.
- The checker skips the FrontX Studio dev panel, so every finding belongs to
  the app. Never explain a finding away as the dev panel; a locator you
  cannot place is investigated.

Manual protocol (no Chrome, or states reached by hand):

1. Open the screen and let it settle: MFEs mount asynchronously, so wait for
   the first `[design-defects]` line.
2. Read the automatic sweep: every line starts with `[design-defects]`; a
   clean run prints exactly one line.
3. In each reachable state (theme, width, data state) re-run with
   `window.__frontxDesignDefects()` and read its return or the new lines. If
   the function is missing or throws despite a clean load line, that is a
   blocking environment finding.
4. Exercise the widths on purpose, including 320 CSS px. The horizontal
   scroll rule measures the document and every box the main landmark's
   content scrolls in; the FrontX shell scrolls the screen in its own
   container, so the finding names that container. A box holding only a
   table or grid is that grid's own scroll and is not measured.

## Phases

- First pass and closing pass: every width, both themes, populated and empty
  data.
- Fix loop: re-run only the render state where the finding was seen (its
  width, theme, data state) and judge only that finding; note other findings
  for the closing pass.
- Closing pass: save the first pass's `findings.json` under another name (the
  runner overwrites it), then run with `--baseline <that file>` and
  `--screenshots`; the summary splits findings into new, resolved and carried
  over.

Screenshots stay off until the closing pass, and their files are not read
back during the fix loop. The checker measures only what it can measure; it
does not judge hierarchy, density, component choice or overall quality, so a
clean sweep is not yet a correct screen. On the closing pass look at the
PNGs once (every screen, both themes, at least the widest width and 320 CSS
px) against `rules/review-rubric.json` and report what you see as visual
findings with gate id, screen, theme and width. A defect finding and a visual
finding are different kinds; neither replaces the other. Outside the closing
pass, `--screenshots` is only for a person who asks for images.

## Checker rule to gate

The runner writes `gate` on every finding and `needsReview` entry: the gate
`rules/render-check.json` gives its rule id (that file's `note` per row says
how to read the rule), with the `level` and `waiver` `rules/quality-gates.json`
gives the gate. An `axe-incomplete/*` entry is never a finding: list it as
its gate unverified, never count its state clean, and check the painted
colours by hand. A rule id with no row (any other `axe/*` rule included, such
as `axe/heading-order`, `axe/tabindex` or `axe/scrollable-region-focusable`)
reports gate `unmapped`: keep its id, the checker's own severity and the
closest gate in your note; never fold it into A11Y-001, never invent a gate.

Worked trace: console line `[design-defects] page-horizontal-scroll: the
page's scroll container scrolls horizontally (900px content in 273px box) ...
div.flex-1.overflow-auto` becomes `LAY-002 (blocker, never) ·
page-horizontal-scroll at 320 CSS px · evidence: that line · location:
div.flex-1.overflow-auto (the shell's screen container)`.

The checker walks open shadow roots. An axe locator inside one names each
shadow host and then the element, joined by `>>>` (`my-widget >>> p`). That
is for reading, not CSS: query each part through the previous host's
`shadowRoot` (`document.querySelector('my-widget').shadowRoot.querySelector('p')`).
Attribute the finding to the owning surface.

## Waivers

One file at the project root, `design-waivers.json`, is the one record of
every accepted deviation from a `with-reason` gate, for named screens: the
gates the checks report and the gates only the review judges (such as
LAY-001 or STA-002). Both checks read it (or the file `--waivers <path>`
names), and so does the review (`references/review.md`):

```json
{"waivers": [
  {"gate": "SYS-001",
   "screen": {"route": "/?screen=orders", "menu": "Orders", "source": "src-app/mfe_packages/orders/**"},
   "reason": "The kit has no tree grid; kit gap recorded in the handoff.",
   "until": "2026-12-31"}
]}
```

- `gate`: a gate whose `waiver` is `with-reason`. A `never` or `finish`
  gate, a gate not in the registry, an unknown key, an empty `reason` or an
  `until` that is not `YYYY-MM-DD` stops the run with exit 2.
- `screen`: at least one of `route` (an exact `--routes` entry), `menu` (an
  exact `--menu` label) and `source` (a glob on the path from the project
  root). The static check matches `source`. The render runner matches
  `route` in a `--routes` run and `menu` in a `--menu` run, so an entry with
  both matches in either; give `source` too to waive one screen in both
  checks.
- `until` (optional): the last day the entry holds. After it the entry waives
  nothing and the report lists it as expired.
- A covered finding moves to `waived` with the entry's index and reason; it
  never gates and never enters the baseline comparison.
- Each check knows the gates it can report (`rules/static-check.json`,
  `rules/render-check.json`) and lists every other entry once:
  - `RECORDED`: a gate this check never reports. The entry stays: another
    check or the review uses it.
  - `not applicable to this run`: a gate this check reports, but the run
    never exercised the screen: the screen has no key this run matches, or
    no file the static check read matches `source`, or no measured state of
    the render run has that `route` or `menu`. The line says what would
    exercise it, for example `needs --menu`, `needs --routes /orders` or
    `needs a file matching src/billing/** under --src`. Not a reason to
    remove the entry.
  - `EXPIRED`: past `until`. A `RECORDED` or `not applicable` line of an
    entry past `until` ends with `expired after <until>`.
  - `UNUSED`: a gate this check reports, a screen the run exercised, and no
    finding matched. Remove it or correct its screen, since the deviation it
    names is gone or the screen is wrong.
- Add an entry only when the person accepts the deviation and gives the
  reason, never to make a check pass.

## Gate a build

Only when a person asks for a gate, and only in the place they name (a CI
step or a script): add the static check, the browser sweep from "Run the
browser check", or both, with `--fail-on-findings`. Nothing else in this
skill fails a build, and no gate is added unasked.

```
npm run verify:static --workspace=@gears-frontx/design-verify -- \
  --src src-app/mfe_packages/<package> \
  --fail-on-findings [--baseline design-verify-static-baseline.json]
npm run verify:ui --workspace=@gears-frontx/design-verify -- \
  --menu "Login,Tasks" --start-server "npm run dev:all" \
  --fail-on-findings [--baseline design-verify-baseline.json]
```

- Exit 0: nothing gates. Exit 1: a finding gates; with `--baseline` only a
  finding the baseline lacks (a new one, or more of one) gates, and the
  findings it already had stay advisory. Exit 2: environment unavailable, an
  input the run cannot honour (a bad flag, an unreadable baseline, a waiver
  file with an error, a source file that does not parse), or a screenshot
  asked for and not written; the gate fails on it too, since an unchecked
  state is not a pass.
- `needsReview` entries never gate; they stay unverified in the report.
  Waived findings never gate either ("Waivers").
- Run it from the project root: relative `--out`, `--baseline`,
  `--waivers` and `--server-cwd` paths resolve there (`$INIT_CWD`, which npm
  sets to the directory it was invoked in).
- The baseline is the report of an earlier run of the same check
  (`findings.json` or `static-findings.json`), kept where the person says;
  it changes only when they accept its findings.
- The browser gate needs what a manual run needs: the dev server and a
  Chrome or Chromium executable on the CI machine. The static gate needs only
  the installed project.

## Report

In the finding shape of `rules/quality-gates.json`:

- confirmed findings first; evidence is the verbatim `[design-defects]` line,
  the raw `window.__frontxDesignDefects()` entry or the static check's
  finding with its `file:line:column`, never a paraphrase;
- waived findings with the quoted reason, and unused or expired waivers;
- the states and widths that came back clean; a clean claim quotes the
  `[design-defects] clean:` line;
- the closing visual review: its findings, or that it found none, naming the
  screens, themes and widths whose PNGs were reviewed; without it the
  verification is not complete;
- states not reached, as unverified, and every `axe-incomplete` entry with
  its state and reason;
- whether the automatic sweep and at least one on-demand re-run both ran.

A completion claim needs the closing full pass; a fix-loop re-run verifies
only its own finding. Results hold only for the render state observed in
this run: a later session re-runs before claiming clean.
