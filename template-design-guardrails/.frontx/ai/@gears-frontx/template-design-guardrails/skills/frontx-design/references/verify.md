# Verify in the browser

Turn "unverified" into "observed". Building and review reason from source;
this step reads what the browser rendered, through the runtime design-defect
checker in `src-app/verify_packages/design-verify/` (`@gears-frontx/design-verify`).
It observes and does not fix: hand findings back to the build
(`references/generate.md`). Advisory by default: findings never fail the run.
When a person asks for a gate, set one up as "Gate a build" below describes.

## Preconditions

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

## Run

One runner call sweeps every screen, theme and width and writes
`design-verify-report/findings.json`:

```
npm run verify:ui --workspace=@gears-frontx/design-verify -- \
  --menu "Login,Tasks" --widths 1440,768,390,320 --themes light,dark \
  [--start-server "npm run dev:all"]
```

- Navigation flag: reach each screen by its menu label (`--menu "A,B"`, the
  user's path) or by its composed address (`--routes "/?screen=orders"`).
  Never pass the bare route value (`/orders`) or an address that names no
  registered screen: the shell leaves the content area empty and the sweep
  reads as clean.
- Checks the sweep could not decide sit in each state's `needsReview` list;
  a state with any is not clean.
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

Every finding carries exactly one gate id, with the `level` and `waiver`
that `rules/quality-gates.json` gives it:

| Checker rule | Gate | Note |
|---|---|---|
| `axe/color-contrast` | COL-001 | The one axe rule the jsdom suite cannot run: new evidence. |
| `axe-incomplete/color-contrast` (`needs review`) | COL-001 unverified | Axe could not decide (gradient, image, overlap; the detail says why). Not a pass and not a finding: list it as unverified, never count its state clean, check the painted colours by hand. |
| `axe/label`, `axe/form-field-multiple-labels`, `axe/label-title-only`, `axe/select-name`, `axe/aria-input-field-name`, `axe/aria-toggle-field-name` | A11Y-001 | Field labels. |
| `axe/button-name`, `axe/input-button-name`, `axe/link-name`, `axe/image-alt`, `axe/input-image-alt`, `axe/svg-img-alt`, `axe/role-img-alt`, `axe/area-alt`, `axe/object-alt`, `axe/frame-title`, `axe/summary-name`, `axe/aria-command-name`, `axe/aria-dialog-name`, `axe/aria-meter-name`, `axe/aria-progressbar-name`, `axe/aria-tooltip-name`, `axe/aria-treeitem-name` | A11Y-001 | Accessible names. |
| `axe/landmark-banner-is-top-level`, `axe/landmark-contentinfo-is-top-level`, `axe/landmark-main-is-top-level`, `axe/landmark-no-duplicate-banner`, `axe/landmark-no-duplicate-contentinfo`, `axe/landmark-no-duplicate-main`, `axe/landmark-one-main`, `axe/landmark-unique`, `axe/region` | A11Y-001 | Landmarks. |
| `axe/list`, `axe/listitem`, `axe/definition-list`, `axe/dlitem` | A11Y-001 | Lists. |
| `axe/page-has-heading-one`, `skipped-heading` | A11Y-001 | Headings. |
| `axe/aria-roles`, `axe/aria-allowed-role`, `axe/aria-required-children`, `axe/aria-required-parent`, `axe/aria-allowed-attr`, `axe/aria-required-attr`, `axe/aria-valid-attr`, `axe/aria-valid-attr-value`, `axe/aria-prohibited-attr`, `axe/aria-conditional-attr`, `axe/aria-hidden-focus`, `axe/presentation-role-conflict`, `axe/nested-interactive` | A11Y-001 | ARIA roles and attributes. |
| `axe/target-size` | A11Y-002 | Major, not a blocker. Off in axe-core 4.13's default rule set, which the checker runs; the row holds if a later axe enables it. |
| `page-horizontal-scroll` | LAY-002 | Blocker at 320 CSS px. |
| `card-content-overflow` | LAY-002 | Wide content scrolls or wraps inside its own box (`overflow-x: auto`, truncation, `overflow-wrap: anywhere`). Content inside an `auto` or `scroll` box is measured at that box. |
| `tiny-text`, `small-control-text`, `clipped-text` | TYP-001 | Floors are the kit's `--text-mono-size` and `--text-label-size`; the fix is the kit role, never a literal size. |
| `control-height-mismatch` | LAY-005 | Fix with matching kit size variants, never spacers or margins. |
| `card-missing-padding` | LAY-005 | Padding floor and range in `references/layout.md`; the full-bleed media card is already exempt. |
| `dead-spacing-class` | SYS-004 | A class no CSS rule defines: replace it with a CSS Module rule on a `--space-*` token, never with inline styles. |

A rule id with no row here (any other `axe/*` rule included, such as
`axe/heading-order`, `axe/tabindex` or `axe/scrollable-region-focusable`)
keeps its id and is reported with gate `unmapped`, the checker's own
severity, and the closest gate named in the note; never fold it into
A11Y-001 and never invent a gate.

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

## Gate a build

Only when a person asks for a gate, and only in the place they name (a CI
step or a script): add the sweep from "Run" with `--fail-on-findings`.
Nothing else in this skill fails a build, and no gate is added unasked.

```
npm run verify:ui --workspace=@gears-frontx/design-verify -- \
  --menu "Login,Tasks" --widths 1440,768,390,320 --themes light,dark \
  --start-server "npm run dev:all" --server-cwd "$PWD" \
  --fail-on-findings [--baseline "$PWD/design-verify-baseline.json"]
```

- Exit 0: nothing gates. Exit 1: a finding gates; with `--baseline` only a
  finding the baseline lacks (a new one, or more of one) gates, and the
  findings it already had stay advisory. Exit 2: environment unavailable, a
  bad flag or unreadable baseline, or a screenshot asked for and not written;
  the gate fails on it too, since an unswept state is not a pass.
- `needsReview` entries never gate; they stay unverified in the report.
- npm runs the runner in the package directory, so a relative `--out`,
  `--baseline` or `--server-cwd` resolves there: pass absolute paths.
- The baseline is a `findings.json` from an earlier run, kept where the person
  says; it changes only when they accept its findings.
- The gate needs what a manual run needs: the dev server and a Chrome or
  Chromium executable on the CI machine.

## Report

In the finding shape of `rules/quality-gates.json`:

- confirmed findings first; evidence is the verbatim `[design-defects]` line
  or the raw `window.__frontxDesignDefects()` entry, never a paraphrase;
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
