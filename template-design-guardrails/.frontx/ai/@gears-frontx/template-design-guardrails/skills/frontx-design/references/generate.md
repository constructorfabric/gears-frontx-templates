# Build or revise a screen

Create a usable product screen from the installed system. The prompt is not
permission to invent a second design system. Load order, essentials and the
closing report are in `SKILL.md`; this file is the procedure.

## Before coding

1. Inspect the applied FrontX templates and the existing app structure
   (`references/frontx-context.md` for where the screen lives).
2. Read the installed `@gears-frontx/ui-kit/llms.txt` and the docs of the
   components in use; when they are large, read the headings first and pull
   only the sections for those components. The visual reference is the kit
   only: its installed components, `llms.txt` and component docs. Match
   them; import no look from anywhere else.
3. Name the primary user job, the dominant action, the data dependencies and
   the failure states.
4. Reuse the nearest existing screen: the one serving the same job, or else
   the one sharing the most kit components and layout. With none, pick a
   composition from `references/patterns.md` or say why a new one is needed.

Then state a short plan:

- screen job and primary action; composition pattern;
- a component map: every visible pattern paired with the kit component or
  composition that renders it; what the map cannot place is a kit gap
  (SYS-005), not guessed at and not rebuilt locally;
- grid and the shared alignment lines; the wide, medium and narrow
  transformation of each region (LAY-001, APP-005);
- the data regions and their states (`references/state-completeness.md`);
- keyboard and focus, motion, non-goals;
- the topic references loaded and skipped, with the reason, so wrong routing
  is visible;
- the gate ids from `rules/quality-gates.json` that apply.

Stop and ask for product input when an open decision changes permissions,
persistence, navigation, or an action that deletes data, sends a message or
cannot be undone. Give the recommended conservative default and the
alternative so one reply settles it; on an unclear reply ask one follow-up,
then apply the conservative default and flag it. For any other gap, state the
conservative visual assumption and go on (for example, hide a feature rather
than guess its enabled state).

## Delegation

The contract binds whoever writes the screen code. A delegated prompt names
the concrete paths of `SKILL.md`, this file and the references loaded,
tells the implementer to read them first, and restates inline: kit components
only, kit tokens only, CSS Modules, the chosen composition. An implementer
that has not read them is unqualified: redo the delegation, and after two
failed attempts stop and report it. Dispatch every delegation in the
foreground, as a blocking call whose result returns into your turn; in a
headless run a background agent is orphaned when your turn ends.

## Implement

Each gate's `waiver` decides whether a deviation can stand. Words such as
"avoid" and "prefer" in the references are strong defaults that yield only to
a recorded product reason.

- Import `@gears-frontx/ui-kit/theme.css` once at the application entry.
- Compose with kit components and native semantic elements; never override
  kit internals (SYS-001).
- Build semantic structure and interaction first, visual polish after.
- Write every visual value in a CSS Module as a kit token (`var(--space-4)`,
  `var(--foreground)`) (SYS-002, SYS-004), on the spacing scale of
  `rules/layout-contract.json`.
- One page heading; one primary-styled action per region; at most one
  non-neutral status colour per region unless each maps to a distinct state.
  Chart series use the categorical palette (`references/color.md`).
- Copy: at most one sentence per label or help text; no subtitle that repeats
  visible structure (TYP-002).
- Express each spacing intent once. No margin beside a container gap, no
  `min-height` reservation plus a margin for the same slot, no spacer element.
  When spacing does not show in the render, find out why the styles do not
  apply instead of adding more.
- Controls sharing a row use the size variant with the same control height,
  aligned to the input element itself, not to the field block with its label
  and error. Alignment comes from the row's layout. A control that wraps by
  accident rather than by the responsive pattern is a defect.
- Keep across every state: keyboard order, labels, visible focus, errors tied
  by `aria-describedby`, 24 by 24 CSS px targets, reduced motion, 200% zoom,
  320 CSS px reflow. These eight hold whatever the list order.
- Implement the real states, not only the populated path.

```css
/* FormRow.module.css */
.row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.rowWithoutGap {
  display: flex;
  align-items: center;
}
```

```tsx
// Correct: Input's height matches Button's default size
<div className={styles.row}>
  <Input />
  <Button>Save</Button>
</div>

// Wrong: a size variant that breaks the shared height, a spacer, an eyeballed margin
<div className={styles.rowWithoutGap}>
  <Input />
  <div style={{ width: '13px' }} />
  <Button size="lg" style={{ marginTop: '3px' }}>Save</Button>
</div>
```

## Self-review

1. Component reuse, token use, component-state coverage (APP-004).
2. Hierarchy, alignment lines, spacing rhythm, density, redundant copy.
3. Each width in `references/app-screens.md`; without inventing a mobile
   information architecture.
4. The eight accessibility items above. Contrast comes from the browser check
   (`axe/color-contrast` in `references/verify.md`), never from token names.
5. Motion purpose and reduced motion where motion exists.
6. Kit gaps and gates still unverified; never hide a gap behind a custom
   control.
7. Every item of the plan is in the result, or flagged as dropped.

While iterating, run the narrowest type-check and tests that cover the
changed files (`npm run type-check --workspace=<name>`,
`npm run test:unit --workspace=<name>`); run the full project suite once,
when the screen is complete.

## Rendered check and fix loop

A change not seen rendered is a hypothesis. Source review shows that values
exist, not that they compose. When the app can run (a dev server is reachable,
or the runner can start one with `--start-server`), hand the screen to
`references/verify.md` and measure the composition before calling it done;
never start a dev server as your own unbounded foreground command. When it
cannot run, report the composition as unverified.

A fix for a browser finding counts only after a fresh check of that finding.
Per finding: two fix attempts; if the second re-run still reports it, carry
it into the report as open with both attempts. Per screen: after ten attempts
in total, or when a fix makes a clean state report a finding twice in a row,
run the closing full pass and report what is still open.

## Report

Changed files; a pass or gap line for each Implement rule (each of the eight
accessibility items on its own line); the result of each self-review check;
states; responsive behavior; and every open or unverified gate with the
surface or state it concerns and why. The review is advisory: asked to gate
a build or block a merge, decline, say so, and still return the findings.
