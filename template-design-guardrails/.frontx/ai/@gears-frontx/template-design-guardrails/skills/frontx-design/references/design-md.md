# DESIGN.md

`DESIGN.md` at the project root is the human entry point of this template:
what the app looks like, which rules bind it and where the detail lives. Any
agent can read it as a plain file, with or without this bundle's skills.

## Format

Two parts:

- **YAML front matter**, taken from the kit's `theme.css`:
  - `name`, `version` (the kit version it was taken from) and a
    `description` that says where it came from;
  - token maps: `colors` (light theme), `colors-dark` (dark theme, same
    names), `typography` (one entry per kit type role with `fontFamily`,
    `fontSize`, `lineHeight`, `fontWeight`, `letterSpacing`), `fonts`,
    `rounded`, `spacing`, `motion`, `controls` (control heights, icon sizes,
    border widths, disabled opacity) and `elevation`;
  - `components`: the kit components a screen most often pairs, each naming
    its tokens as references such as `{colors.primary}` or
    `{typography.label}`. A `{colors.<name>}` reference resolves in
    `colors` for the light theme and in `colors-dark` for the dark theme.
- **Markdown body**, written by people: the guardrails, then Do's and
  Don'ts, Responsive, Iteration Guide and Known Gaps. Prose names tokens by
  reference (`{colors.primary}`), not by value.

The kit is the source and `DESIGN.md` mirrors it, never the reverse. Values
change in the kit or in a theme, then the front matter follows. The shipped
front matter was generated once from `@gears-frontx/ui-kit` 0.4.1; until a
tool ships, a kit upgrade means updating it by hand against the installed
`theme.css` and the kit docs.

A generator and a drift check are planned for a later step.

## Read it before visual work

Read `DESIGN.md` before building, restyling or reviewing anything visual. It
names the UI base, the order of the contract layers, the required qualities,
the token vocabulary and what not to do. When it and the installed kit
documentation differ on a component API, the installed documentation wins;
when it and this bundle differ on a rule, the gate in
`reference-artifacts/quality-gates.json` wins.

## Review it by hand

After any change to the front matter:

- Every value matches the installed `theme.css` for its theme: `colors`
  against the light blocks, `colors-dark` against the dark ones, the other
  maps against values shared by both themes.
- Every `{group.token}` reference in `components` and in the body resolves to
  an entry in the front matter; a `{colors.<name>}` reference resolves in
  both `colors` and `colors-dark`.
- Every colour name exists in both `colors` and `colors-dark`.
- Each component's text and fill pair (foreground on background) reaches the
  WCAG 4.5:1 text contrast in both themes. A pair below it on a kit token is
  a finding for the kit owner; record it under Known Gaps until the kit
  changes.

## Change it with care

- `DESIGN.md` is owned by this template; a template upgrade replaces it. Put
  product-specific decisions in the product's own documents and link them,
  rather than editing the template's text.
- Keep the body short. It points to rules; it does not restate them.
