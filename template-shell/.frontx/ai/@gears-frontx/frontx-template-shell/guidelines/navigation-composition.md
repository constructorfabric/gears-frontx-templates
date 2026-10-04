# Guideline: How the Shell Composes Navigation

The host shell holds no list of screens. The left menu, and everything behind
it, is derived at runtime from the MFE registry: whatever is registered in the
*screen* extension domain appears in the menu, in declared order, and mounts on
click. This guideline is a code-verified snapshot of that mechanism — the
consumer side of the contract whose producer side is each MFE package's
`mfe.json` (see the `template-mfe` AI bundle's `navigation-contribution`
guideline). If the files named below change, this file must be updated to
match.

Authoritative files:

- `src-app/app/layout/Menu.tsx` — menu rendering and mount dispatch
- `src-app/app/mfe/bootstrap.ts` — domain registration and manifest ingestion
- `src-app/app/mfe/MfeScreenContainer.tsx` — renders the screen domain's own
  `<ExtensionDomainSlot>` (which owns that domain's own URL observer,
  starting/stopping it from its own attach/detach) and the unresolved-route
  fallback
- `packages/framework/src/plugins/microfrontends/router.ts` — `FrameworkRouter`,
  the concrete implementation of the `mfes` runtime's router port, injected
  into every registry `microfrontends()` builds
- `src/gts/schemas/extension_screen.v1.json` — the derived screen extension type
- `packages/framework/src/plugins/microfrontends/gts/frontx.screensets/instances/domains/` —
  the four well-known domain instances
- `scripts/generate-mfe-manifests.ts`, `src/build/mf-gts.ts` — the build-time
  pipeline

## The menu is registry-driven

`Menu.tsx` renders exactly what
`mfeRegistry.getExtensionsForDomain(FRONTX_SCREEN_DOMAIN)` returns, sorted by
`presentation.order` (a missing `order` defaults to `999`, i.e. last). The list
is re-read on a 500 ms interval, so extensions registered after first paint
appear without a reload — this is why a fresh boot may briefly show an empty
menu.

A click does **not** navigate. It dispatches a mount action:

```ts
mfeRegistry.executeActionsChain({
  action: {
    type: FRONTX_ACTION_MOUNT_EXT,
    target: FRONTX_SCREEN_DOMAIN,
    payload: { subject: extensionId },
  },
});
```

`executeActionsChain` is acceptance-only: it returns `void`, never throws, and
yields nothing to await for the chain's own execution. A caller that genuinely
needs to react to a chain's outcome expresses that dependency **inside the
chain itself**, as a terminal action targeting the extension whose mount it
depends on, via a `next` continuation — never by awaiting this call.

Switching screens is still a mount action against a domain, not a direct route
transition — but the shell closes the loop between that action and the
address bar through `FrameworkRouter`, the concrete router every `createFrontX()`
app's `microfrontends()` plugin injects into the `mfes` runtime's router port
(`packages/framework/src/plugins/microfrontends/router.ts`). Each routed
domain (`screen`, `sidebar`, `popup`, `overlay` in the shell) is admitted by
this router at registration — its own declared `route`, checked against every
other routed domain live in the page — and its own URL-entry observer starts
once that domain's own `<ExtensionDomainSlot>` attaches a DOM root, and stops
on that same slot's own detach (`ExtensionDomainSlot` reaches the router
through `@gears-frontx/framework`'s `./internal` subpath — never through
`app.mfeRouter`, which exposes only the extension-local navigation facade).
After a `mount_ext`/`unmount_ext` execution settles in a domain, the runtime
reports it to the router, which reflects it into the URL by comparing the
domain's current mounted set against its current URL entries — no domain
implementation calls anything to make this happen. A menu click still leaves a
real entry in the address bar, and browser back/forward and bookmarking still
work against it; the router's own observer runs the other direction too: on
every URL change it dispatches the `mount_ext`/`unmount_ext` chains needed to
bring the mounts to what the URL now says, each carrying the intent that
restoring a URL-driven state writes nothing further. An entry whose token
resolves to nothing registered is left in the URL rather than dropped; the
screen domain's own fallback (`MfeScreenContainer`) renders "No screen matches
this address." whenever every entry in the screen domain is unresolved and
nothing is mounted.

No occupant address is broadcast through a shared property. An
occupant that declares its own route learns its own address privately, from
the runtime's occupant-value rendezvous — an MFE that wants to build its own
internal route tree supplies it to its own `microfrontends()`-bearing
`createFrontX()` app and renders `@gears-frontx/react`'s `<ExtensionRouter>`
over it; an MFE that only needs to read or change its own pathname/search
imperatively (outside the rendered tree — an `ActionHandler`, for instance)
calls that same app's own `mfeRouter.navigation()`. Neither path ever goes
through the action-chain payload or a bridge property, and `app.mfeRouter`
itself never exposes the occupant value, the router instance, or raw
history — only the navigation facade.

## From `mfe.json` to the browser

```text
src-app/mfe_packages/<pkg>/mfe.json        # hand-written; source of truth
  → <pkg>/dist/mfe-manifest.json           # build: frontxMfGts() merges mfe.json
                                           #   with Module Federation's mf-manifest.json
  → public/generated-mfe-manifests.json    # npm run generate:mfe-manifests aggregates all MFEs
  → fetch('/generated-mfe-manifests.json') # runtime: bootstrap.ts
  → GTS registration (see order below)
  → Menu.tsx reads the registry
```

No service and no database sit anywhere in this chain — between build and
browser the declarations live in one static JSON file served as a public
asset. A deployment that sources declarations elsewhere (e.g. a type
registry service) replaces exactly that link: `bootstrap.ts` needs a different
URL returning the same shape, and nothing downstream changes. That shape, per
package (`MfeManifestConfig` in `bootstrap.ts`):

```ts
{ manifest, entries, extensions?, domains?, schemas? }
```

`domains` is present only when the package itself owns an extension domain;
`extensions` is optional because a package may declare only loadable entries.

## Registration order and ownership

`bootstrapMFE()` proceeds in a fixed order:

1. `microfrontends()` constructs the shared `FrameworkRouter` and builds the
   MFE registry with it injected. `bootstrapMFE()` then registers the shell's
   chrome action schemas.
2. Register the four well-known domains — `screen` (with
   `ExclusiveMountStrategy`: one mounted screen at a time), `sidebar`, `popup`,
   `overlay` — each admitted by the router automatically as it registers.
3. Broadcast initial shared properties (`theme`, `language`).
4. Fetch the manifest aggregate.
5. First pass over **all** packages: register every non-action schema (derived
   extension/domain types), so later validation can chain through them
   regardless of package order in the aggregate.
6. Per package: scoped action schemas → `manifest` → `domains` → `entries` →
   `extensions`.

Two outcomes at the `extensions` step are deliberately different:

- **Rejection.** `register()` validates each instance against the extension
  type its target domain pins (`extensionsTypeId`) and throws on mismatch. A
  screen-domain extension without `presentation` is a malformed contribution
  and fails here, at registration — not silently later in the UI.
- **Skip.** An extension whose target domain the host does not own (checked via
  `hostOwnsDomain()`) is skipped without validation and reaches the owning
  runtime instead — e.g. widget extensions targeting a domain a nested MFE
  app declares itself. Rejection means "malformed contribution to my slot";
  skipping means "not my slot". Composition is recursive, not just
  shell → MFE.

## The type contract

Base types (`extension.v1`, `domain.v1`, entries, actions, shared properties,
lifecycle) are owned by `@gears-frontx/gts-plugin` and never redefined here.
The shell owns one derived type, `extension_screen.v1.json`, which is what
makes a screen extension menu-renderable — it requires `presentation`:

| Field | Required | Meaning |
|---|---|---|
| `label` | yes | menu item text (raw display string — no i18n key today) |
| `route` | yes | route path; back-projected into the URL after mount and resolved from it on every transition (see above) |
| `icon` | no | Iconify icon name (e.g. `lucide:user`) |
| `order` | no | sort key, lower = earlier; missing = `999` |

The screen domain instance
(`…/instances/domains/screen.v1.json`) pins that type via `extensionsTypeId`,
declares the shared properties (`theme`, `language`) and actions (`load_ext`,
`mount_ext`) it supports, a 30 s default action timeout, and the lifecycle
stages it drives.

## Mounting and isolation

On mount, `MfeHandlerMF` (`@gears-frontx/mfes`) loads the MFE's federated
module and mounts it **into a Shadow DOM**, so MFE styles cannot leak into the
shell or vice versa. Shared dependencies are isolated per runtime by rewriting
their imports to per-load blob URLs — no shared mutable module state between
host and MFEs.

## Boundaries

- What a directory under `src-app/mfe_packages/` must look like to enter this
  pipeline at all is the `mfe-package-contract` guideline in this bundle.
- The ID taxonomy used in every declaration is the `gts-id-conventions`
  guideline in the `template-mfe` AI bundle.
- Known limitations (no menu i18n, no audience targeting, flat `order`) are
  properties of the current schemas, tracked upstream in the platform's
  navigation-service planning — not bugs in this shell. Routing itself has its
  own known limitations, tracked against issue #638 rather than this schema
  set. Observer-originated mounts acknowledge their current URL only: a late
  mount after Back cannot restore a stale entry.
