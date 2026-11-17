# Guideline: The Verification Axes This Shell Declares

The kit's verification walk is shaped by two caller-declared axes and assumes
neither: a **checkpoint axis** naming the points the walk visits and how each one
is reached, and a **variant axis** naming one UI dimension the coverage is
repeated across. The kit's driver knows nothing about what either stands for.
**In a project built on this shell, the points are the registered screen
extensions and the variant axis is the theme registry**, and this file is what a
run reads to fill the driver's flags in. It is a code-verified snapshot: if the
files named below change, this file must be updated to match.

Authoritative files:

- `src-app/mfe_packages/*/mfe.json` - each screen extension's top-level `route`
  and its `presentation.label`
- `src-app/app/layout/Menu.tsx` - `menuItemTestId`, the handle each menu item carries
- `src-app/app/main.tsx` - where the themes are registered and the stored or default one applied
- `src-app/app/themes/` - one module per theme, each exporting its id and `name`
- `packages/studio/src/testIds.ts` - the overlay's verification handles
- `packages/studio/src/sections/ThemeSelector.tsx` - the switcher the walk drives

## The checkpoint axis: this shell's screens

This shell mounts one screen extension at a time into the screen domain it
declares, each addressable at its own address, `/?screen=<route without its leading slash>` (below), and
its menu is the chrome that moves between them. That is what makes the kit's checkpoint axis expressible here at
all - it is a property of this shell, not of FrontX. **A host that mounts several
extensions into one domain concurrently has no one active point to walk to**, and
`src-app/mfe_packages/widgets-fixture-a/mfe.json` in template-mfe is exactly such
a case: its two widget extensions share `frontx.widgets.area.main.v1` and are
mounted together. A run against a surface like that declares no checkpoint axis
and lets the walk cover whatever `--host` opens.

**The set comes from the manifests, not from the menu.** Read each realized
screen extension's `route` out of the `mfe.json` that declares it.
The `route` sits at the extension's top level, beside `id`, `domain` and
`entry`, not inside `presentation`. The menu enumerates what the menu chose to offer, which is a
different question, and a set taken from it is a set nothing confirmed.

**A checkpoint's destination is `/?screen=<route without its leading slash>`,
never the bare `route`.** The router names the mounted screen in the `screen`
query parameter; the pathname is the shell's own and selects no screen, so
`<host>/hello-world` loads the shell with an empty content area and the
checkpoint times out on its ready testid.

demo-mfe's shipped extensions declare, for example:

| Checkpoint name | `route` | Destination | Extension id (the `{handle}` value) |
|---|---|---|---|
| `helloworld` | `/hello-world` | `/?screen=hello-world` | `gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~frontx.demo.screens.helloworld.v1` |
| `profile` | `/profile` | `/?screen=profile` | `...~frontx.demo.screens.profile.v1` |
| `uikit` | `/uikit-elements` | `/?screen=uikit-elements` | `...~frontx.demo.screens.uikit.v1` |

**The reaching control is keyed by the whole extension id.** `menuItemTestId`
builds each item's handle as `menu-item-<extension id>`, and a short name cannot
spell one, so this shell's invocation uses `{handle}` rather than
`{checkpoint}`:

| Driver flag | Value | Declared as |
|---|---|---|
| `--checkpoint-selector` | `menu-item-{handle}` | `menuItemTestId(extensionId)` |

Left as the fourth `--checkpoints` field, the extension id costs no page read.
Omitted, the driver reads the page's ids back and keeps the menu item whose id
carries the checkpoint's short name as a whole segment - which is unambiguous
here as long as no two realized screens share a name segment.

Declaring `--checkpoint-selector` is what makes the walk click its way between
the screens. **Leave it out to have each screen loaded at its destination
(`/?screen=<route without its leading slash>`) instead** -
useful when the run wants every point reached by a full load rather than through
the menu.

## The overlay: this shell's Studio panel

The Studio overlay is host chrome drawn over the screens under verification, and
it also holds the theme switcher, so the walk opens it to reach the switcher and
closes it before capturing. `packages/studio/src/testIds.ts` is a verification API
rather than a styling hook, and its values are what the driver is given:

| Driver flag | Value | Declared as |
|---|---|---|
| `--overlay-open` | `studio-expand` | `STUDIO_EXPAND_TESTID` |
| `--overlay-close` | `studio-collapse` | `STUDIO_COLLAPSE_TESTID` |

The two ids are deliberately different rather than one id on whichever control is
mounted, which is what lets the driver confirm the close: `studio-expand` is in
the document only while the panel is collapsed.

**A project that removed the Studio overlay declares neither flag**, and the
walk then operates no such control. The kit's checklist reports its host-chrome
category as not applicable in that case, naming this declaration as the reason.

## The variant axis: this shell's theme registry

`main.tsx` registers the shell's themes one call at a time and then applies the
one the user chose last:

```ts
app.themeRegistry.register(defaultTheme);
app.themeRegistry.register(lightTheme);
app.themeRegistry.register(darkTheme);
app.themeRegistry.register(draculaTheme);
app.themeRegistry.register(draculaLargeTheme);
applyPersistedTheme(app.themeRegistry, DEFAULT_THEME_ID);
stampAppliedThemeId(app.themeRegistry);
```

`applyPersistedTheme` (`src-app/app/themes/themePersistence.ts`) applies the
theme id stored under the `localStorage` key `frontx:theme`, and `default` when
nothing is stored or the stored id is not registered. At boot it writes
`frontx:theme` only to replace an unregistered id with the fallback (a first
visit stores nothing, so a later change of the default still applies); after
that it stores every theme applied. In dev, Studio then restores its own stored theme from
`frontx:studio:theme` after mount; when that id is registered, it decides the
starting theme (and is written back to `frontx:theme`). Otherwise a walk starts
on whatever theme the browser profile applied last, not necessarily `default`. Select every variant through the
switcher, as the driver does, rather than assuming the first capture shows the
default theme.

Storage is what the next boot reads, not proof of what is applied.
`stampAppliedThemeId` (`src-app/app/themes/themeIdAttribute.ts`) stamps the
applied theme's registry id as `data-theme-id` on `<html>` at boot and on every
switch, next to the `data-theme` appearance. Read the theme a capture shows
from `data-theme-id`; the design-verify render runner measures a state only
when it equals the requested id.

Those five calls are the set: ids `default`, `light`, `dark`, `dracula` and
`dracula-large`, each declared beside its `name` in its own module under
`src-app/app/themes/`. Read the set from there. The switcher's dropdown
enumerates what the switcher chose to offer, which is a different question, and a
set taken from it is a set nothing confirmed.

A project that added or removed a theme changed this list, and the count of
registered ids is the count the walk covers.

| Driver flag | Value | Declared as |
|---|---|---|
| `--variant-switcher` | `studio-theme-trigger` | `STUDIO_THEME_TRIGGER_TESTID` |
| `--variant-option` | `studio-theme-option-{variant}` | `studioThemeOptionTestId(themeId)` |

The option id is keyed on the theme's **registry id**, not its display name, so
`{variant}` substitutes the same strings the registration above lists and no
label map is needed to reach an option.

The trigger's own text is the active theme's `name` with each hyphen-separated
word capitalised - `dracula-large` reads back as `Dracula Large`. `ThemeSelector`
resolves that text through the registry list on purpose, so the trigger reads
back the same label the option carried and the driver's whole-word confirmation
has something to agree with.

## Prepare the walk before the driver runs

Two steps stand between this file and a walk invocation:

1. Start it in the background, with its own log, and keep its pid:

   ```bash
   npm run verify:preflight > .frontx/verify-preflight.log 2>&1 &
   PREFLIGHT=$!
   ```

   It is ready when the log has the line that starts with
   `[verify-preflight] READY`. Wait for that line, then take `--host` and
   `--cdp-port` for the driver from it. The wait below also ends when the
   process is gone: it then prints the log, which says why it exited.

   ```bash
   until grep -q '^\[verify-preflight\] READY' .frontx/verify-preflight.log; do
     kill -0 "$PREFLIGHT" 2>/dev/null || { cat .frontx/verify-preflight.log; break; }
     sleep 2
   done
   ```

   The pid on the READY line says what is left to stop. `READY pid=<n>` means
   preflight is supervising what it started: stop it with `kill -TERM <n>` when
   the walk is done. `READY pid=none` means it started nothing and has already
   exited, so there is nothing to stop. It stops only what it started and
   removes its own browser profile. If the supervisor itself was killed hard
   after READY, the summary lists each started process group, and only then is
   that list complete: a kill before READY leaves no group list to read. Run
   `pgrep -g <pgid>` for each group before you signal it. The probe proves only
   that some group with that id exists right now, not that it is this run's:
   once the supervisor is gone nothing keeps its leaders unreaped, so a group
   id can be reused by an unrelated group. Look at what the probe lists, with
   `ps -o pid,pgid,command -p <pids>`, and run `kill -- -<pgid>` for that group,
   with the placeholder replaced by its id, only when the processes it lists
   are recognisable as this project's dev servers or the preflight browser
   (its user data dir `frontx-verify-*`). A group whose members you cannot
   recognise as this run's belongs to something else now: do not signal it.
   The summary never prints a ready-made kill line, because the group ids it
   names are not safe to signal on their own.
2. Read the walk driver's flags with its `--help` instead of its source: it
   prints the whole flag surface.

The first browser launch keeps Chrome's sandbox on. Only if it fails does
verify-preflight retry once, adding only `--no-sandbox`, and it says so in its
output, because some sandboxed agent environments cannot start Chrome with its
own sandbox.

## `dracula` and `dracula-large` are walked in two invocations

The driver confirms a value from the switcher label by requiring the value's name
to occupy a whole run of the label's words. `Dracula Large` satisfies that test
for `dracula` as well as for `dracula-large`, so a label reading `Dracula Large`
cannot say which of the two is applied. The driver refuses the pair on the
arguments, before a browser is reached:

```
variants "dracula" and "dracula-large" cannot be told apart from a switcher
label: a label reading "dracula-large" names "dracula" as well
```

`--variant-labels` does not resolve it here, because the labels the trigger
actually prints stand in the same relation to each other. **Walk the two in
separate invocations instead**, each with a capture directory of its own and both
appending to the same coverage file:

```bash
DRIVER=<installed kit root>/skills/project-scaffolding/scripts/verify-walk.mjs

node "$DRIVER" \
  --host <dev server origin> \
  --cdp-port <the port preflight printed> \
  --browser-cmd 'npx --yes agent-browser@<the version this run pinned>' \
  --capdir "$CAPDIR/pass-1" \
  --checkpoints '<name>:/?screen=<route without its leading slash>:<that screen's ready testid>:<its extension id>,...' \
  --checkpoint-selector 'menu-item-{handle}' \
  --variants default,light,dark,dracula \
  --variant-switcher studio-theme-trigger \
  --variant-option 'studio-theme-option-{variant}' \
  --overlay-open studio-expand \
  --overlay-close studio-collapse \
  --coverage <targetDir>/.frontx/verification-coverage.md

node "$DRIVER" \
  --host <dev server origin> \
  --cdp-port <the port preflight printed> \
  --browser-cmd 'npx --yes agent-browser@<the version this run pinned>' \
  --capdir "$CAPDIR/pass-2" \
  --checkpoints '<name>:/?screen=<route without its leading slash>:<that screen's ready testid>:<its extension id>,...' \
  --checkpoint-selector 'menu-item-{handle}' \
  --variants dracula-large \
  --variant-switcher studio-theme-trigger \
  --variant-option 'studio-theme-option-{variant}' \
  --overlay-open studio-expand \
  --overlay-close studio-collapse \
  --coverage <targetDir>/.frontx/verification-coverage.md
```

Both invocations pin the browser CLI with the same `--browser-cmd`. Left out, the
driver falls back to `npx --yes agent-browser`, which resolves whatever version
is newest at the moment each run asks - so the two passes above, which exist to
be compared against each other, could be driven by two different browsers.

The two runs land their rows in one coverage file under one header - one row per
theme per screen. **The second run's rows read `first variant` in the
distinctness cell**, because `dracula-large` has no predecessor inside its own
invocation - which is true of that run and is not a claim that the theme was
never compared. Say so in the report, and compare that pair's captures across the
two capture directories by hand if the comparison is wanted: the two runs are
separate walks, and the driver compares only within one.

Splitting the walk this way is a property of these two theme names, not of the
shell. A project whose registered ids are all distinguishable by label walks them
in one invocation.
