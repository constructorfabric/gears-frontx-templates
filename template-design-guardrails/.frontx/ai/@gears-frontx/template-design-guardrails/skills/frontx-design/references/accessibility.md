# Accessibility

## Baseline

Target WCAG 2.2 AA; the product **MAY** be stricter. Native semantic HTML and
kit components come before ARIA; composite widgets follow the WAI-ARIA
Authoring Practices keyboard model (INT-002). Accessibility is part of the
anatomy, not a final annotation pass.

## Structure and names (A11Y-001)

- One page `h1` (the screen owns it, `references/frontx-context.md`);
  headings form a meaningful hierarchy.
- Landmarks name navigation, main content and complementary regions.
- Every field has a persistent programmatic label.
- Every icon-only control has an accessible name and, when its meaning is not
  universal, a visible tooltip. Decorative icons are hidden from assistive
  technology.
- Link and button labels name their result outside the surrounding copy
  (TYP-003).

## Keyboard and focus

Kit components bring their own keyboard mechanics while used unmodified
(`kitGuaranteed` in `rules/component-state-matrix.json`). The screen owns:

- every action works without a pointer, app-composed ones included (INT-001);
- focus order follows visual and task order;
- dismissal never discards work silently;
- focus stays visible and is never hidden by sticky or floating UI
  (A11Y-003);
- the focus indicator **SHOULD** meet the WCAG 2.2 Focus Appearance size and
  3:1 contrast, although that criterion is AAA.

## Contrast and non-colour cues

- Normal text 4.5:1; large text 3:1; component boundaries, states and focus
  indicators 3:1 against adjacent colours (COL-001).
- Status, severity, selection and validation combine colour with text, shape
  or an icon (COL-002).
- A disabled state stays understandable even where contrast rules exempt it.

## Reflow, zoom and targets

- Text resizes to 200% without loss of content or function; 320 CSS px
  reflow is LAY-002 (`references/layout.md`).
- Targets meet 24 by 24 CSS px or the WCAG spacing exception (A11Y-002).
- Dragging has a single-pointer alternative unless dragging is essential.
- Hover-only information also appears on focus and is dismissible, hoverable
  and persistent.

## Motion and sensory safety

Reduced motion keeps state understanding and task completion
(`references/motion.md`). No flashing, continuous parallax or scroll-driven
motion as the only explanation of a change. Movement that autoplays for more
than five seconds can be paused, stopped or hidden.

## Forms

- Required state is exposed programmatically and visibly.
- Validate at a useful moment without clearing input or moving focus
  unexpectedly.
- Field errors are tied to their field; long forms **SHOULD** have a
  focusable error summary, which takes focus only on explicit submission.
- A recoverable server error keeps the entered values.
- A disabled submit has an adjacent reason, or is enabled and followed by
  clear validation.
- Sign-in supports password managers, paste, autocomplete and accessible
  error recovery.

## Limits of automation

Automated scans catch only part of accessibility. A full check combines them
with keyboard review, zoom and reflow review and a manual look at names,
order, context and recovery.
