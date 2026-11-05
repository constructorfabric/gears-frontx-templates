# DESIGN.md

`DESIGN.md` at the project root is the human entry point of this template:
what the app looks like, which rules bind it and where the detail lives. Any
agent can read it as a plain file, with or without this skill.

## Format

Two parts:

- **YAML front matter**, naming the kit's design tokens:
  - `name`, `version` (the kit version the names were taken from) and a
    `description` that says what it holds and how to check it;
  - token maps: `colors`, `typography` (one entry per kit type role with
    `fontFamily`, `fontSize`, `lineHeight`, `fontWeight`, `letterSpacing`),
    `rounded`, `spacing`, `motion`, `controls` (control heights, icon sizes,
    border widths, disabled opacity) and `elevation`. Every value is exactly
    one `var(--name)`, naming a custom property the kit theme declares; one
    name covers the light and the dark theme;
  - `components`: the kit components a screen most often pairs, each value
    exactly one reference such as `{colors.primary}` or `{typography.label}`,
    which resolves to a key in the token maps (or one `var(--name)`), never a
    literal.
- **Markdown body**, written by people: the guardrails, then Do's and
  Don'ts, Responsive, Iteration Guide and Known Gaps. Prose names tokens by
  reference (`{colors.primary}`) and describes their role, not their value.

The front matter holds names only. The values live in the installed kit
theme (`@gears-frontx/ui-kit/theme.css`) and in the product theme
(`references/theme.md`), so a product theme never needs a `DESIGN.md` edit.
The names change only when the kit adds, renames or drops a token.

## Read it before visual work

Read `DESIGN.md` before building, restyling or reviewing anything visual. It
names the UI base, the required qualities, the token vocabulary and what not
to do. When it and the installed kit documentation differ on a component
API, the installed documentation wins; when it and this skill differ on a
rule, the gate in `rules/quality-gates.json` wins. For the value a token has
in this app, read the rendered app, not this file.

## Check it

From the project root, with the kit installed:

```sh
node .frontx/ai/@gears-frontx/template-design-guardrails/skills/frontx-design/scripts/check-design-md.mjs
```

It reads `DESIGN.md` in the current directory (or the file `--design <path>`
names) and the custom property names the installed kit theme declares (or the
file `--theme <path>` names), as `--name:` declarations or `@property --name`
registrations, and reports, one line each:

- a token map value that is not exactly one `var(--name)`;
- a `components` value that is not exactly one `{group.key}` or one
  `var(--name)`;
- a `var()` in a token map or in a `components` value naming a property the
  theme does not declare;
- a `{group.key}` reference in `components` or in the body (with its line
  number) with no such map key;
- a kit property the token maps do not name.

In the body the `{group.key}` shape (a lowercase group `[a-z][a-z0-9-]*`, a
dot, key characters, no spaces) is reserved for token references on every
line, fenced code and inline code spans included: write `{colors.primary}`
only to name a token, and give an example that must show braces in another
notation.

Exit 0 is clean, 1 means findings, 2 means a usage or input error: a missing
file or a directory, front matter missing, unclosed or outside the supported
YAML subset, `name`, `version` or `description` missing or holding a map, any
other top-level key that is not a map or not a lowercase group name
(`[a-z][a-z0-9-]*`, the shape body references use), a key off the shape of its
group (a `typography` or `components` key that is not a map of scalars, a key
in any other token map that is not a scalar), a reserved key (`__proto__`,
`constructor`, `prototype`) at any level, or a kit theme it cannot resolve.
It never reads values.

After a kit upgrade, run it, add or drop the names it reports, and bump
`version` to the new kit version.

## Review a change

After any change to the front matter:

- The check script exits 0.
- A new name sits in the map of its job and, when a screen often pairs it,
  in the `components` entry that uses it.
- Real values and contrast come from the rendered app, in both themes, from
  the verify runner (`references/verify.md`). A text and fill pair below the
  WCAG 4.5:1 text contrast on a kit token is a finding for the kit owner;
  record it under Known Gaps with the kit version it was measured on.

## Change it with care

- `DESIGN.md` is owned by this template; a template upgrade replaces it. Put
  product-specific decisions in the product's own documents and link them,
  rather than editing the template's text.
- Keep the body short. It points to rules; it does not restate them.
