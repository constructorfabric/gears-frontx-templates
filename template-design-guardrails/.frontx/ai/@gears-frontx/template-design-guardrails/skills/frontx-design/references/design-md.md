# DESIGN.md

`DESIGN.md` at the project root is the human entry point of this template:
what the app looks like, which rules bind it and where the detail lives. Any
agent can read it as a plain file, with or without this bundle's skills.

## Read it before visual work

Read `DESIGN.md` before building, restyling or reviewing anything visual. It
names the UI base, the order of the contract layers, the required qualities
and what not to do. When it and the installed kit documentation differ on a
component API, the installed documentation wins; when it and this bundle
differ on a rule, the gate in `reference-artifacts/quality-gates.json` wins.

## Change it with care

- `DESIGN.md` is owned by this template; a template upgrade replaces it. Put
  product-specific decisions in the product's own documents and link them,
  rather than editing the template's text.
- Keep it short. It points to rules; it does not restate them.
