# Motion and feedback

## Purpose

Motion **MUST** do a job (MOT-001): show where an element came from or went,
keep continuity between states, confirm an action, draw attention to a
consequential change, or show progress without blocking. Motion with no job
goes.

## Kit motion tokens

Durations and easing are the kit's `--duration-*` and `--ease-*` tokens (the
`motion` map in `DESIGN.md` mirrors them). This file maps roles to them by
name and sets no values; never write a token's value as a literal (MOT-002).

| Role | Token |
|---|---|
| Reduced-motion substitutes, direct state changes | none: no transition |
| Hover, focus, press, colour swaps, small opacity changes | `--duration-micro` |
| A state change that moves something: menus, tooltips, compact disclosures | `--duration-standard` |
| A surface sliding in or out: sheets, dialogs, inspectors | `--duration-panel` |
| The travelling tab indicator | `--duration-tab` |
| Enter, exit and move | `--ease-standard` |
| Continuous progress or time | `linear` |

A transition that needs a step the kit lacks (a separate enter or exit
curve, a long layout transition) uses the nearest kit token and records a
kit gap; it never adds a local duration or `cubic-bezier()`.

## Properties

- Animate `opacity` and `transform`; avoid animating layout across large
  subtrees, and never scale text directly (scale a wrapper).
- Late content follows the geometry reservation in `references/layout.md`;
  do not animate layout to hide it.
- Infinite animation only for real ongoing progress, and it stops when the
  operation ends.

## Feedback

- Press feedback is immediate. Hover is never the only sign that something
  is interactive.
- Pending actions show progress in the action region and block duplicates
  (STA-003). Optimistic updates have a rollback or a clear error path.
- A toast never carries the only copy of a consequential failure; success
  confirms the changed entity without blocking the next task.

## Space

Menus and popovers grow from their trigger; inspectors enter from their own
edge. Reordering keeps object continuity: one changed row never flashes or
reloads the whole surface. Route changes do not animate unrelated regions.

## Reduced motion

Respect `prefers-reduced-motion: reduce`: replace travel with a short
opacity change or an immediate update; keep progress, state and focus cues;
drop parallax, bounce, overshoot and decorative loops.

## Reject

Staggered entrances on every table row; bouncing buttons; a different easing
per component; a spinner without an accessible status; motion that delays
input; an inspector sliding over focused content without moving focus;
large travel left on under reduced motion.
