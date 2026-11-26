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
- `src-app/app/layout/menuIcons.ts` - the bundled menu icons: fetch of
  `public/generated-menu-icons.json`, registration with
  `@iconify/react/offline`, the unknown-icon dev warning
- `src-app/app/mfe/bootstrap.ts` - manifest ingestion, after the domains the
  host implements are registered
- `src-app/app/mfe/menuLabels.ts` - loads each MFE's label dictionary for the
  current language and maps extension ids to menu labels
- `src-app/app/mfe/screenDomain.ts` - the screen domain's implementation and
  its registration, the screen extension type included
- `src-app/app/mfe/MfeScreenContainer.tsx` - starts the bootstrap with the
  screen domain and renders the screen domain's own `<ExtensionDomainSlot>`
- `src-app/app/mfe/defaultScreen.ts` - the default screen, the menu's first
  item by `presentation.order`, and the address entry the router reads
- `src-app/app/mfe/modalDomain.ts` - the popup domain's implementation, the
  modal extension domain (see the `sign-in` guideline in this bundle)
- `src-app/app/i18n/languagePersistence.ts` - the language the shell reads
  from storage at startup
- `src/gts/schemas/extension_screen.v1.json` — the derived screen extension type
- `src/gts/instances/domains/screen.v1.json` -
  the screen domain instance
- `scripts/generate-mfe-manifests.ts`, `scripts/generate-menu-icons.ts` and the
  MFE-side `vitePluginMfeGts()` (`@gears-frontx/vite-plugin-mfe-gts`) — the
  build-time pipeline

## The menu is registry-driven

`Menu.tsx` renders exactly what
`mfeRegistry.getExtensionsForDomain(FRONTX_SCREEN_DOMAIN)` returns, sorted by
`presentation.order` (a missing `order` defaults to `999`, i.e. last). The list
is read once, after bootstrap. The active item carries `aria-current="page"`.
For the current language, the menu loads each MFE's declared `labelDictionaries` file and uses its screen extension labels for text and tooltip. It falls back to the required `presentation.label` when no dictionary label is available.

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

An address that names no screen opens the default screen. At page load the
router mounts only a screen the address names by a registered `route`, and an
unknown name is dropped and the address rewritten without it, so a stale
bookmark still opens the shell with an empty content area and no menu item
active. An address that names no screen at all is a different case: once the
bootstrap has settled, `MfeScreenContainer` mounts the menu's first item, the
screen with the lowest `presentation.order` (a missing order counts as
`999`), and writes it into the address with the `replace` history intent, so
the visit gains no history entry and the address reads as if that screen had
been opened all along. `firstScreenId` and `screensInMenuOrder` in
`src-app/app/mfe/defaultScreen.ts` select it with the same sort the menu
renders, so the default screen is by definition the first menu item, and a
deep link, a screen already mounted and a failed bootstrap all win over it.
`MfeScreenContainer` shows no "no screen matches" message: it renders the
screen domain's slot and, for a screen or bootstrap that failed to load, the
`LoadFailed` error state, and nothing else. A shell that wants an empty state
of its own renders it once bootstrap has settled while `screenState` (in
`src-app/app/mfe/screenState.ts`) names no screen and no load failure is
reported; it needs no route state for that.

## The language

The shell may read `localStorage` to decide the language at startup:
`applyPersistedLanguage` (`src-app/app/i18n/languagePersistence.ts`) reads the
key `frontx:shell:language` before the first render and applies a language the
project lists. A screen never reads storage. It takes the language from the
`language` shared property its entry requires, and it sends a change upward
with the `set_language` action of the screen domain, as the example settings
screen does (`demo-mfe`, `src/screens/settings/SettingsScreen.tsx`).

## From `mfe.json` to the browser

```text
src-app/mfe_packages/<pkg>/mfe.json        # hand-written; source of truth
  → <pkg>/dist/mfe-manifest.json           # build: vitePluginMfeGts() merges mfe.json
                                           #   with Module Federation's mf-manifest.json
  → public/generated-mfe-manifests.json    # npm run generate:mfe-manifests aggregates all MFEs
  → fetch('/generated-mfe-manifests.json') # runtime: bootstrap.ts
  → GTS registration (see order below)
  → Menu.tsx reads the registry
```

Menu icons ride the same command: `npm run generate:mfe-manifests` also writes
`public/generated-menu-icons.json`, one Iconify collection per prefix holding
the `presentation.icon` names the packages declare (plus the parents an alias
chains through, so the alias still resolves offline), read from the
installed `@iconify-json/<prefix>` packages (a new prefix needs that package as
a shell devDependency). At run time bootstrap starts the icons fetch beside the
aggregate fetch, and `Menu.tsx` renders icons from those registered
collections through `@iconify/react/offline`: an icon the build did not see
renders no icon and one dev console warning, and no icon is ever fetched from
an external host.

No service and no database sit anywhere in this chain — between build and
browser the declarations live in one static JSON file served as a public
asset. A deployment that sources declarations elsewhere (e.g. a type
registry service) replaces exactly that link: `bootstrap.ts` needs a different
URL returning the same shape, and nothing downstream changes. That shape, per
package (`MfeManifestConfig` in `bootstrap.ts`):

```ts
{ manifest, entries, extensions?, domains?, schemas?, labelDictionaries? }
```

`domains` is present only when the package itself owns an extension domain;
`extensions` is optional because a package may declare only loadable entries.

## Registration order and ownership

A domain exists because something implements it. The shell implements two,
the screen domain and the popup domain, the second as its modal extension
domain: `MfeScreenContainer` starts the bootstrap
(`bootstrapOnce(app, [registerScreenDomain, registerModalDomain])`), and the
menu only waits for that bootstrap to settle. A shell that renders no screen
container runs no bootstrap and has no screen domain, and its menu stays
blank. The popup domain exists because the container also renders the modal
layer, and the sign-in flow mounts into it (the `sign-in` guideline in this
bundle). The shell registers no `sidebar` or `overlay` domain: nothing in it
renders one.

`bootstrapMFE()` proceeds in a fixed order:

1. `microfrontends()` builds the MFE registry.
2. Run the registration of each domain the host implements, before anything
   else. `registerScreenDomain` registers the screen extension type
   (`extension_screen.v1.json`) and the shell's chrome action schemas, then
   the `screen` domain (with `ExclusiveMountStrategy`: one mounted screen at a
   time; the domain declares no `unmount_ext` and registers no handler for
   it). `registerModalDomain` does the same for the popup domain in the same
   step: the modal extension type (`extension_modal.v1.json`), the `sign_in`
   action schema, then the domain with `OptionalMountStrategy`. The walk
   decides per extension whether this host admits it by checking which domains
   are registered, so this step comes before the manifests are walked.
3. Broadcast initial shared properties (`theme`, `language`).
4. Fetch the manifest aggregate. An empty aggregate ends the bootstrap here
   with a warning.
5. Walk the aggregate in three passes, each over **every** package, so a
   reference to a type, a manifest, a domain or an entry does not depend on
   package order in the aggregate (a lifecycle hook's action `target` aside,
   see pass 3 below):
   1. **Schemas.** Every schema with an `$id` that a package ships (its
      action types and any derived extension or domain type) goes to
      `registerSchema`, which resolves no reference and keeps the first
      definition of an id.
   2. **Entities.** Per package: `manifest`, then `domains`, then `entries`,
      each through `register()`, which validates the instance against its
      type and checks every type and instance it references.
   3. **Extensions.** Per package, every extension in declared order (see
      below). Extensions are checked one by one as they are registered, so
      an extension whose type references another extension needs that
      extension earlier in the walk: an earlier package or earlier in its
      own list. A lifecycle hook's action `target` (unlike its `payload`) is
      checked when its domain or extension registers, so it must be itself
      or an instance registered before it (a host domain from step 2
      included): a domain's hook can target itself or a domain registered
      before it, never an extension the manifests declare, since every
      domain registers before any extension. No template declares such a
      reference or a lifecycle hook.
6. Hand all packages to the menu labels:
   `menuLabels.configure(manifests, aggregateUrl, registry.typeSystem)`. The
   menu then loads the current language's dictionaries on its own.

Every failure in the walk is thrown: a failed manifest fetch, an instance
that does not match its type, or a reference to a type or instance that is
not registered. The bootstrap stops at the first one, nothing after it is
registered, and `MfeScreenContainer` shows the `LoadFailed` state.

The extensions pass treats each extension in one of two ways:

- **Admitted.** An extension whose target domain this host registered
  (checked via `hostOwnsDomain()`) goes to `registerExtension`, which
  validates it against the extension type the domain pins
  (`extensionsTypeId`). A screen-domain extension without `presentation` is a
  malformed contribution and fails here, at registration, not later in the UI.
- **Registered, not admitted.** An extension whose target domain this host
  did not register (a domain a nested MFE app declares and owns, for example
  a widgets domain) is registered on the type system only: `register()`
  validates it and its references, and the host neither admits nor mounts it.
  The owning runtime admits it through its own bootstrap. This host still
  needs the declaration, because an action dispatched here may name it.
  Composition is recursive, not just shell to MFE.

Both ways need the target domain on the type system. An extension whose
domain no package declares and no host registration made is disabled
like any other rejected extension, whether the domain would be this host's
or another runtime's, and the shell boots without it: a domain
registered after the walk admits none of the extensions the manifests
declare for it.

## The type contract

Base types (`extension.v1`, `domain.v1`, entries, actions, shared properties,
lifecycle) are owned by `@gears-frontx/gts-plugin` and never redefined here.
The shell owns two derived types. `extension_screen.v1.json` is what makes a
screen extension menu-renderable: it requires the extension's top-level
`route` and its `presentation`. `extension_modal.v1.json` is the modal
domain's, and it requires `presentation.size` and `presentation.cancelable`
beside `label` (the `sign-in` guideline in this bundle covers it). The screen
type's fields:

| Field | Required | Meaning |
|---|---|---|
| `label` | yes | fallback menu item text; the MFE's label dictionary for the current language overrides it (`labelDictionaries`, see `mfe-package-contract`) |
| `route` (top level, beside `id`/`domain`/`entry`) | yes | route value the FrontX router finds the extension by |
| `icon` | no | Iconify icon name (e.g. `lucide:user`) |
| `order` | no | sort key, lower = earlier; missing = `999` |

The screen domain instance
(`…/instances/domains/screen.v1.json`) pins that type via `extensionsTypeId`,
declares its own `route`, the shared properties (`theme`, `language`) and actions (`load_ext`,
`mount_ext`) it supports, a 30 s default action timeout, and the lifecycle
stages it drives. A domain instance declares its own `route`;
an extension is part of the route only when it and its domain both declare
one, and a domain's route must be a valid name, unique among the routed
domains live in the page.

## Mounting and isolation

On mount, `MfeHandlerMF` (`@gears-frontx/mfes`) loads the MFE's federated
module and mounts it **into a Shadow DOM**, so MFE styles cannot leak into the
shell or vice versa. Shared dependencies are isolated per runtime by rewriting
their imports to per-load blob URLs — no shared mutable module state between
host and MFEs.

### Screen inline padding

The shell insets every mounted screen by `var(--space-4)` on both sides: the
padding is declared on the screen's host element (the div
`ScreenContainerHooks.create()` builds, selected by its `data-extension-id`
attribute in `MfeScreenContainer.module.css`), not on the scroll container, so
the scroller's scrollbar stays at the window's edge. A screen that must draw a
band from edge to edge of its slot opts out from inside its own shadow root,
because the host element is the one element a screen's CSS reaches from there:

```css
:host {
  --frontx-screen-inline-padding: 0;
}
```

`--frontx-screen-inline-padding` is the contract: the shell's rule reads it on
the host with the gutter as its fallback, so a screen may also set it to any
other length to widen the gutter. Nothing in the shell needs to change for
either.

The same host element carries the screen's kit theme scope
(`data-theme="light"` or `"dark"`), stamped by the screen package's own
lifecycle, and the screen root carries the same scope inside the shadow root.
The theme registry's rule names the host from the outer document tree, so the
shell's active theme wins on the host, and the tokens of the theme that reach
the screen's contents are the non-colour ones: the kit re-declares its colour
tokens on the screen root's kit scope, so a project theme's colours change the
shell and the screen host, not the screen's own kit surfaces, which follow the
kit's light or dark scope, while the theme's non-colour tokens and its extra
steps inherit in.

## Boundaries

- What a directory under `src-app/mfe_packages/` must look like to enter this
  pipeline at all is the `mfe-package-contract` guideline in this bundle.
- The ID taxonomy used in every declaration is the `gts-id-conventions`
  guideline in the `template-mfe` AI bundle.
- Known limitations (no audience targeting, flat `order`) are
  properties of the current schemas, tracked upstream in the platform's
  navigation-service planning — not bugs in this shell. Routing itself has its
  own known limitations, tracked against issue #638 rather than this schema
  set.
