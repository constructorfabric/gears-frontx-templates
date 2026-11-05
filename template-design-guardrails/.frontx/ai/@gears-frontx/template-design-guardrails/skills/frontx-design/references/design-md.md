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
  is the `:root` and light blocks, dark the `:root`, light and dark blocks,
  each in source order, the later declaration winning, as the browser
  resolves them (a token declared only in the light block is inherited by
  dark). Every token is then placed by
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

The script does not emulate the CSS cascade. The whole file must have the
shape the kit ships; after comments are removed it may hold only these
top-level blocks, in this order:

```css
:root { ... }                         /* one or more: tokens for both themes */
:root, [data-theme='light'] { ... }   /* one or more: light tokens, color-scheme: light */
[data-theme='dark'] { ... }           /* one or more: dark tokens, color-scheme: dark */
@media (prefers-color-scheme: dark) { /* optional, once */
  :root:not([data-theme='light']) { ... }
}
body, [data-theme] { ... }            /* optional, once */
```

- Anything else is exit 2 naming it: another rule (`html`, `.card`, even
  empty), any other at-rule (`@property`, `@import`, `@font-face`,
  `@keyframes`, `@layer`, `@supports`, `@container`, another `@media`), text
  outside a block, a nested rule, a block out of this order.
- Selector lists are compared item by item. Whitespace may sit only between
  list items and around commas; an attribute value is exactly `light` or
  `dark`, quoted with `'` or `"` or unquoted. `[data-theme='d ark']`,
  `[data-theme='Dark']` and `[ data-theme = dark ]` are exit 2.
- A backslash anywhere in the file is exit 2: CSS escapes (`f\6f nt-size`,
  `--sp\61 ce-4`) are outside the shape. So is a quoted string that runs past
  the end of its line.
- Light is the `:root` and light blocks, dark the `:root`, light and dark
  blocks; in this order the browser result is exact. The fallback is not
  used for output, but every token it declares must resolve to its dark
  value.
- Beside the tokens only `color-scheme` may sit: `light` in the light block,
  `dark` in the dark and fallback blocks, nothing in `:root`. So nothing
  changes the root font size and `rem` values are converted at 16 px.
- `body, [data-theme]` may set only `background-color`, `color` and
  `font-family`, each to one `var(--name)`; it is not read for output.
- Each token maps to its own output path, and no path segment is
  `__proto__`, `prototype` or `constructor`.

Values follow the kit's value grammar. After comments are stripped and
whitespace outside quotes is collapsed, a token value is exactly one of:

- hex: `#` and 3, 4, 6 or 8 hex digits;
- a number with an optional unit from `px`, `rem`, `em`, `%`, `ms`, `s`,
  `deg`;
- `var(--name)`, no fallback and no inner spaces;
- `calc(A + B)` or `calc(A - B)`, each side a `var(--name)` or a number;
- `color-mix(in oklab, C P, transparent)`, C a hex or `var(--name)`, P a
  percentage;
- `rgb()`, `rgba()`, `hsl()`, `hsla()`;
- for `--font-*` tokens: a comma list of quoted names (no `var(` inside) or
  bare family identifiers such as `system-ui` or `-apple-system`;
- for tokens named `*shadow*`: four lengths and a `var(--name)` or a
  `color-mix()` as above;
- for `--ease-*` tokens: `cubic-bezier()` of four plain numbers.

A colour token (by value, or by name when a component reads it as a colour)
must resolve to hex, `rgb()`, `hsl()` or such a `color-mix()`; a shadow's
colour must resolve to one too. Anything else is exit 2 naming the token and
the value. Declarations split on `;` outside
quotes and parentheses; quoted text is kept exactly, comments are removed
only outside quotes, and `var()` is resolved and rewritten only outside
quotes.

## Known gaps

These forms stop `generate` and `check` with exit 2 instead of being
converted; extend the script when the kit starts using one:

- any value outside the grammar: `lab()`, `lch()`, `oklch()`, `oklab()`,
  `light-dark()`, `color()`, named colours, an empty value, `var()` with a
  fallback or with spaces inside, `calc()` with `*` or `/` or more than two
  terms, other units (`ch`, `vw`, ...), named font weights (`bold`), a quoted
  font name holding `var(`, an unquoted family name with a space, a shadow
  list or a shadow in another order, other easing functions;
- nested `calc()` and non-px units inside `calc()` after `var()` resolution;
- percentage opacity (`50%`);
- `!important` on any declaration in a token block (any case or spacing,
  outside quotes; the kit does not use it);
- any construct outside the file shape: another selector (`html`,
  `:root[data-theme='dark']`, a list such as `[data-theme='dark'], .dark`,
  spaces or another case inside an attribute selector), with or without
  tokens; any other at-rule (`@property`, `@import`, `@font-face`,
  `@keyframes`, `@layer`, `@supports`, `@container`, `@media` of another
  kind); a nested rule; text outside a block;
- blocks out of the kit's order (a `:root` or light block after a dark block,
  a dark block after the fallback, any block after `body, [data-theme]`), and
  a second fallback or `body, [data-theme]` block;
- CSS escapes (a backslash anywhere, quoted text included);
- a plain property in a token block other than the block's own
  `color-scheme` (so `font-size` and `font` are out), and in
  `body, [data-theme]` anything but `background-color`, `color` and
  `font-family` as one `var(--name)`;
- two tokens that map to one path (`--radius` and `--radius-base`), and a
  token name that maps to a `__proto__`, `prototype` or `constructor` path
  segment.

## Change it with care

- `DESIGN.md` is owned by this template; a template upgrade replaces it. Put
  product-specific decisions in the product's own documents and link them,
  rather than editing the template's text.
- Keep the body short. It points to rules; it does not restate them.
