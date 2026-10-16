# Guideline: How an MFE Contributes to Navigation

An MFE package appears in the host's menu by declaring a *screen extension* in
its own `mfe.json` — there is no central menu list to edit, no shell code to
touch, and no registration call to make. This guideline is a code-verified
snapshot of the producer side of that contract; the consumer side (how the
shell discovers, validates, and renders these declarations) is the
`navigation-composition` guideline in the `template-shell` AI bundle. If the
declarations in this template's packages change shape, this file must be
updated to match.

## The whole contract for "appear in the menu"

One entry in the package's `mfe.json` `extensions[]` array, targeting the
shared screen domain - from `demo-mfe`, with its `labels` map cut to two languages:

```json
{
  "id": "gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~frontx.widgets.host.screen.v1",
  "domain": "gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.screen.v1",
  "entry": "gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.demo.mfe.widgets_host.v1",
  "route": "/widgets-host",
  "presentation": {
    "label": "Widgets Host",
    "labels": { "de": "Widget-Host", "ja": "ウィジェットホスト" },
    "icon": "lucide:layout-grid",
    "order": 200
  }
}
```

- `id` — this extension's own identity, derived from the screen extension
  type. Author the instance segment per the `gts-id-conventions` guideline in
  this bundle.
- `domain` — always the fixed shared screen domain for menu entries; never a
  domain you invent.
- `entry` — must reference an entry declared in the same package's
  `entries[]`, whose `exposedModule` names the lifecycle module your
  `vite.config.ts` exposes through Module Federation.

## `route` and `presentation` semantics

The screen domain pins a derived extension type that **requires** the
extension's top-level `route` and its `presentation` — the host validates every screen-domain extension against it
at registration and rejects mismatches outright (your screen will not appear,
with a thrown registration error, not a silent skip):

| Field (on the extension) | Required | Meaning |
|---|---|---|
| `label` | yes | menu item text, shown for any language `labels` does not name |
| `labels` | no | menu item text per language code of the shell's i18n (`de`, `zh-TW`, ...), each a string. The menu shows the entry for the current language and follows a language switch without a reload; a missing entry falls back to `label` |
| `route` (top level, beside `id`/`domain`/`entry`) | yes | route token (e.g. `/widgets-host`), one leading `/` stripped before use. The shell's own injected router reads this to admit the extension as a deep-linkable occupant of the screen domain and to reflect its mount/unmount into the URL — keep it unique within the domain and stable across releases |
| `icon` | no | Iconify name with prefix (e.g. `lucide:user`); omitted = no icon |
| `order` | no | sort key across the whole menu, lower = earlier; omitted = `999` (last) |

`order` is a flat number per domain — there is no grouping or nesting, so
coordinate values across packages if relative position matters.

This table is the shell's default. A project may replace the screen schema,
derive its own screen type with more `presentation` fields, read the menu item
differently, or turn the screen domain off, in its
`src-app/shell-config/screens.ts` (the shell bundle's `navigation-composition`
guideline). When that file exists, declare what its schema requires, use its
derived type id as your extension id prefix when it pins one, and check that it
does not set `enabled: false`: then no screen is mounted or listed, though each
is still validated, and a malformed one fails MFE bootstrap (the error is
logged and the packages after it are not registered).

## Beyond the menu: extensions that do not target the screen domain

A package may also *own* a domain (declared in its `mfe.json` `domains[]`) and
accept extensions from other packages into it. In this template, `demo-mfe`
owns the widgets domain (`…ext.domain.v1~frontx.widgets.area.main.v1`), and
`widgets-fixture-a` / `widgets-fixture-b` declare extensions targeting it —
without any `presentation`, since they render inside the Widgets Host screen,
not in the menu. The host deliberately skips extensions whose domain it does
not own and delivers them to the owning runtime: composition is recursive, and
"my screen hosts contributions from other packages" needs no shell
involvement.

## Where declarations travel

`mfe.json` is read at build time by the shell's `frontxMfGts()` plugin, merged
into `dist/mfe-manifest.json`, aggregated into
`public/generated-mfe-manifests.json`, and registered by the host at runtime.
Nothing else reads it — a change to `mfe.json` takes effect after the package
is rebuilt and manifests are regenerated (`npm run generate:mfe-manifests`, or
any script that runs it, e.g. `dev:all`).

## Boundaries

- The full directory/build shape a package must satisfy to be discovered at
  all — `package.json` port flag, `vite.config.ts` plugin order, build
  outputs — is the shell's `mfe-package-contract` guideline.
- ID authoring rules for every field above are this bundle's
  `gts-id-conventions` guideline; the `add-mfe-package` skill walks the whole
  flow.
