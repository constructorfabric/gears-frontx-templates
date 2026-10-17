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
  `<ExtensionDomainSlot>`
- `src/gts/schemas/extension_screen.v1.json` — the derived screen extension type
- `packages/framework/src/plugins/microfrontends/gts/frontx.screensets/instances/domains/` —
  the four well-known domain instances
- `scripts/generate-mfe-manifests.ts`, `src/build/mf-gts.ts` — the build-time
  pipeline

## The menu is registry-driven

`Menu.tsx` renders exactly what
`mfeRegistry.getExtensionsForDomain(FRONTX_SCREEN_DOMAIN)` returns, sorted by
`presentation.order` (a missing `order` defaults to `999`, i.e. last). The list
is read once, after bootstrap.

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

Route composition is invisible to shell and MFE developers. A menu click
leaves a real entry in the address bar, and browser back/forward, reloads and
bookmarks resolve to the same screens; the FrontX router from
`@gears-frontx/routing` does that work, and neither shell code nor MFE code
reads or composes route state outside its own private subroute. The framework's only routing code is in
`microfrontends()`: it passes that `router` to the MFE registry it builds
(`build({ typeSystem, mfeHandlers, router })`) and does nothing else for
routing. A screen is selected by dispatching a mount action against the screen
domain, and the screen domain is Exclusive: one occupant, and a new mount
replaces it.

Every runtime reads and changes only its own private subroute. The shell's
private subroute is the pathname: shell code that needs to navigate does so
only within it, using `@gears-frontx/routing-tanstack` (`navigation()`, or
`<ExtensionRouter>` over a route tree) as an MFE does. This template's shell
application code ships no such navigation, and a shell adds that dependency
only when its code needs it. An MFE whose extension declares a `route`, in a domain that declares one too,
has a private subroute of its own; an MFE with routes renders
`<ExtensionRouter routeTree={routeTree} />` from `@gears-frontx/routing-tanstack`
in its own content, and code outside the rendered tree (an `ActionHandler`,
for instance) calls `navigation()` from the same package. Everything outside a
runtime's private subroute, including which screen is shown, changes through
actions (`mount_ext`, `unmount_ext`), never through navigation.

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

1. `microfrontends()` builds the MFE registry. `bootstrapMFE()` then registers
   the shell's chrome action schemas.
2. Register the four well-known domains — `screen` (with
   `ExclusiveMountStrategy`: one mounted screen at a time; the domain declares
   no `unmount_ext` and registers no handler for it), `sidebar`, `popup`,
   `overlay`.
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
makes a screen extension menu-renderable — it requires the extension's
top-level `route` and its `presentation`:

| Field | Required | Meaning |
|---|---|---|
| `label` | yes | menu item text (raw display string — no i18n key today) |
| `route` (top level, beside `id`/`domain`/`entry`) | yes | route value the FrontX router finds the extension by |
| `icon` | no | Iconify icon name (e.g. `lucide:user`) |
| `order` | no | sort key, lower = earlier; missing = `999` |

The screen domain instance
(`…/instances/domains/screen.v1.json`) pins that type via `extensionsTypeId`,
declares its own `route`, the shared properties (`theme`, `language`) and actions (`load_ext`,
`mount_ext`) it supports, a 30 s default action timeout, and the lifecycle
stages it drives. Each well-known domain instance declares its own `route`;
an extension is part of the route only when it and its domain both declare
one, and a domain's route must be a valid name, unique among the routed
domains live in the page.

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
  set.
