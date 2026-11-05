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
  already in the file is kept; `--name` sets it. It reads only the shape of
  the kit's own `theme.css` (see "Accepted theme.css shape" below); light
  is the `:root` and light blocks, dark the `:root` and dark blocks, each in
  source order, the later declaration winning. Every token is then placed by
  its name, never by the rule it came from: a colour goes to `colors` (light) and `colors-dark`
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
2 usage or input error (unknown mode or flag, missing `theme.css`, a
`theme.css` outside the accepted shape, no front matter to lint).

## Accepted theme.css shape

The script does not emulate the CSS cascade. It accepts the shape the kit
ships and nothing else:

- custom properties only in `:root`, `:root, [data-theme='light']` and
  `[data-theme='dark']` blocks (matched on the whole selector list, quote
  style and whitespace ignored); each may repeat and merges in source order;
- `@media (prefers-color-scheme: dark)` holding only
  `:root:not([data-theme='light'])` blocks: not used for output, but every
  token it declares must resolve to its dark value;
- blocks that declare no custom property (such as `body, [data-theme]`) are
  ignored, whatever their selector;
- beside the tokens only `color-scheme`; no other property, so nothing
  changes the root font size and `rem` values are converted at 16 px;
- values: no bare named colour (`white`, `transparent`, `currentcolor`);
  use hex, `rgb()` or `hsl()`;
- each token maps to its own output path.

Anything else that declares a custom property is exit 2 naming the selector
or at-rule and the first token. Declarations split on `;` outside quotes and
parentheses; quoted text is kept exactly, and comments are removed only
outside quotes.

## Known gaps

These forms stop `generate` and `check` with exit 2 instead of being
converted; extend the script when the kit starts using one:

- `var()` with a fallback, and whitespace inside `var( --x )`;
- `calc()` with multiplication or division, nested `calc()`, non-px units
  inside `calc()`;
- named font weights (`bold`) and percentage opacity (`50%`);
- named colours;
- `!important` on any declaration in a token block (any case or spacing,
  outside quotes; the kit does not use it);
- custom properties in any selector other than the three above (`html`,
  `:root[data-theme='dark']`, a list such as `[data-theme='dark'], .dark`),
  in `@media` of another kind, `@supports`, `@layer`, `@container` or a
  nested rule;
- a plain property other than `color-scheme` in a token block;
- two tokens that map to one path (`--radius` and `--radius-base`).

Plain properties outside the token blocks are not read, so a root font size
set elsewhere (for example `html { font-size: 20px }`) is not seen by the
16 px `rem` conversion.

## Change it with care

- `DESIGN.md` is owned by this template; a template upgrade replaces it. Put
  product-specific decisions in the product's own documents and link them,
  rather than editing the template's text.
- Keep the body short. It points to rules; it does not restate them.
