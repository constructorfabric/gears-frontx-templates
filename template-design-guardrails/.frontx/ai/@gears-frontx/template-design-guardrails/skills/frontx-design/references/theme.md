# Author or fix a theme

Use when adding a brand or product theme, porting a palette, or when kit
components render unstyled, transparent or with light surfaces in a dark
theme after a theme change.

A theme is a `ThemeConfig` object registered with the shell, not a
stylesheet. The kit's `theme.css` is the palette every theme starts from: it
declares every colour, radius and type token for both appearances. A theme's
variables apply on top of it on the document root and the kit consumes them
as they are, so the value format is a contract. A theme repaints kit tokens;
it never brings a parallel token set.

## Decide the kind

1. **On the kit palette.** The theme declares the shell's own tokens (left
   menu, spacing, shadows, transitions, `--error`, `--radius-none`) and at
   most a few kit tokens it overrides on purpose, such as a brand
   `--primary`. The shell's `light`, `dark` and `default` override none.
2. **A palette of its own.** A theme that repaints the page surface
   (`--background`), like the shell's Dracula themes
   (`src-app/app/themes/draculaPalette.ts`), overrides every colour token the
   kit declares for its appearance. A token left out resolves to the kit's
   value, and a kit component then paints in two palettes.

Shape is one knob: override `--radius`, never the derived `--radius-*` steps.
Start from the existing theme of the same kind in `src-app/app/themes/`, and
list a new theme in `frontxThemes` (`src-app/app/themes/index.ts`) as well as
registering it: the shell's `themes.test.ts` checks every theme there
against the installed kit.

The kit is the only token source. When a kit-consumed token cannot be mapped
from the context, ask for its value before finishing; if no answer comes,
leave the kit value and flag it.

## Value format

Each failure below renders as "the kit looks broken", never as an error:

1. **Every colour token is a full CSS colour**: `hsl(240 10% 3.9%)`, a hex
   value, `oklch(...)`.
2. **No HSL fragments** such as `240 10% 3.9%`: the kit reads `var(--x)`
   directly, so a fragment is an invalid value and the component loses its
   colour. The repository's token-format check bans the matching consumer
   form `hsl(var(--x))`.
3. **`appearance: 'light' | 'dark'` is declared.** The shell stamps it as
   `data-theme` on the document element and the kit's dark surfaces switch on
   it; a dark theme without it gets light kit surfaces.
4. **Hover and alpha tokens are derived.** A theme that overrides neither
   `--primary` nor `--card` inherits the kit's hover tokens and declares
   none. One that overrides either sets `--primary-hover` / `--card-hover`
   from the base, for example
   `color-mix(in oklab, var(--primary) 90%, var(--background))`, so they
   follow palette edits. A correct-looking hardcoded value still fails.
5. **No re-wrapping a token.** Alpha goes through `color-mix`, for example
   `color-mix(in oklab, var(--border) 50%, transparent)`. A fallback goes
   inside `var()`: `var(--x, hsl(0 0% 100%))`.

## Register and verify

1. Register the theme where the app's themes are registered (the themes index
   feeding the theme registry).
2. In dev mode, switch to it and inspect a host screen and a screen inside an
   MFE shadow root: shadow-root propagation is a separate code path.
3. Toggle against a theme of the other appearance and confirm through
   computed styles that the kit's card, overlay and background tokens follow
   the appearance in the host document and in one shadow root.
4. Run `npm run policy:token-format` where the repository has it. It sees
   only the consumer form, so also search the theme's own values for bare
   fragments and hardcoded hover values.
5. Run the browser check (`references/verify.md`) with the theme active:
   `axe/color-contrast` is the objective check on the palette, and an
   `axe-incomplete/color-contrast` entry leaves that contrast unverified.

Without dev mode or shadow-root access, report `environment unavailable` and
the theme as registered but unverified.

## Report

Pass or fail for each of the five value-format rules, read from the theme's
declared values (rule 4 has nothing to check for a theme that overrides
neither `--primary` nor `--card`); a theme with any rule unchecked is not
done. Then: theme id and appearance; the kit tokens it overrides and why; any
kit-consumed token left at the kit value; the evidence (host and shadow-root
screens seen, contrast findings); the states not switched to, as unverified.
