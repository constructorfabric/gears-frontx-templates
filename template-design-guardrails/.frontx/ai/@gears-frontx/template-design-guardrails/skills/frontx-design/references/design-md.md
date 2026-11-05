# DESIGN.md

`DESIGN.md` at the project root is the human entry point of this template:
what the app looks like, which rules bind it and where the detail lives. Any
agent can read it as a plain file, with or without this bundle's skills.

## Format

Two parts:

- **YAML front matter**, generated from the installed kit's `theme.css`:
  - `name`, `version` (the kit version it was generated from) and a
    `description` that says how it was generated;
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
change in the kit or in a theme, then the front matter is regenerated.

## Read it before visual work

Read `DESIGN.md` before building, restyling or reviewing anything visual. It
names the UI base, the order of the contract layers, the required qualities,
the token vocabulary and what not to do. When it and the installed kit
documentation differ on a component API, the installed documentation wins;
when it and this bundle differ on a rule, the gate in
`reference-artifacts/quality-gates.json` wins.

## Regenerate, check, lint

The script is `scripts/design-md.mjs` in this skill (Node, no dependencies).
Run it from the project root:

```sh
node .frontx/ai/@gears-frontx/template-design-guardrails/skills/frontx-design/scripts/design-md.mjs generate
node .frontx/ai/@gears-frontx/template-design-guardrails/skills/frontx-design/scripts/design-md.mjs check
node .frontx/ai/@gears-frontx/template-design-guardrails/skills/frontx-design/scripts/design-md.mjs lint
```

- `generate` reads `node_modules/@gears-frontx/ui-kit/dist/theme.css`
  (override with `--theme <path>`), rewrites the front matter of `DESIGN.md`
  (override with `--design <path>`) and keeps the body as it is. The `name`
  already in the file is kept; `--name` sets it. Each theme is resolved as
  the browser resolves the root element with `data-theme` set to it: every
  top-level rule whose selector list matches that root (`:root`, `html`,
  `[data-theme=...]`, `:root[data-theme=...]`) applies in source order and
  the later declaration wins; rules nested in `@media`, `@supports` or
  `@layer` are skipped. Every token is then placed by its name, never by the
  rule it came from: a colour goes to `colors` (light) and `colors-dark`
  (dark), and any other token (radius, spacing, type, motion, controls) has
  one value, so a value that differs between the themes stops `generate` and
  `check` with exit 2 and a message naming the token and both values. A
  `var()` chain is resolved per theme before the token is placed or
  converted: a name the script does not know is placed by its final value
  (an alias to a colour is a colour and keeps its `{ref}`), and font weights,
  opacities, line heights and sizes are converted from the final value. The
  script fails closed: an alias to a missing token, a `var()` cycle or
  fallback, or a final value that is not a number or length where one is
  needed stops `generate` and `check` with exit 2 and writes nothing. Run it
  after every kit upgrade and every theme change that touches kit tokens.
- `check` exits 1 when the front matter differs from what `generate` would
  write: the kit moved and `DESIGN.md` did not, or someone edited the front
  matter by hand.
- `lint` checks the front matter on its own: references that do not resolve
  (`broken-ref`), references that loop back on themselves (`ref-cycle`),
  colours defined for one theme only (`orphaned-token`), and component text
  and fill pairs below the WCAG 4.5:1 text contrast in either theme
  (`contrast`). It reads hex, `rgb()` and `hsl()` colours (comma or space
  syntax). A pair it cannot compute (another colour syntax such as `oklch()`
  or `color-mix()`, a translucent colour, a cycle or a broken chain) is a
  `contrast-unchecked` finding and counts toward exit 1: use a supported
  syntax or check the pair by hand. A contrast finding on a kit pair is a
  token finding for the kit owner; record it under Known Gaps until the kit
  changes.

Every finding is one line with a `fix:`. Exit codes: 0 clean, 1 findings,
2 usage or input error (unknown mode or flag, missing `theme.css`, no
front matter to lint).

## Change it with care

- `DESIGN.md` is owned by this template; a template upgrade replaces it. Put
  product-specific decisions in the product's own documents and link them,
  rather than editing the template's text.
- Keep the body short. It points to rules; it does not restate them.
