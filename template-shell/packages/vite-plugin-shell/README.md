# @gears-frontx/vite-plugin-shell

A generic, framework- and type-system-agnostic Vite plugin for any host
build that participates in the FrontX shared-dependency unit mechanism
— the **native boot model**: the shell loads natively from its own
`dist`, like a Module Federation host. It lives in template territory (`template-shell/packages/`): it is
shipped as part of the FrontX templates and is specified by this
package's own documentation — it carries no ecosystem `@cpt-`
traceability markers and makes no claim of upstream specification.

The plugin's only inputs are the host's `package.json`, the build
output and the options below. It contains nothing specific to any
template or framework — it works for any shell implementation on any
frontend framework.

## What it does

- Derives the host's shared set with `SharedSetResolver` from
  `@gears-frontx/unit-producer`. Sharing follows the build graph: every
  bare package the build imports (npm-installed, workspace-linked or
  aliased) is shared, and the host's `dependencies` plus non-optional
  `peerDependencies` seed the set. The `include` / `exclude` options are
  mutually exclusive. There is no curated externals list and no name
  list. The build report's `sharedSet` section lists the effective set,
  how each package was reached, imported-but-undeclared warnings and,
  for `include` / `exclude`, the estimated duplicate bytes.
- Marks the shared set external to the host bundle (merged with any
  existing `rollupOptions.external`), so the emitted host chunks keep
  bare specifiers the import map resolves to the shared chunks.
- Rewrites the host's own named and default imports from a shared
  package's barrel to the modules that define them
  (`<pkg>/<module-path>`), for packages declaring side-effect freedom;
  namespace, side-effect and dynamic imports keep the barrel. A rewrite
  no produced unit answers goes back to the barrel in the emitted
  chunks, and the units, lists and import map then follow the
  specifiers the chunks import. Each barrel outcome is logged.
- Imports, where the host's code imports a shared module, the
  stylesheets that module's static import graph loads (a shared unit
  loads none), so the host's own CSS carries the kit CSS of the kit
  components the host uses, in import order.
- In `closeBundle`, produces content-addressed units and fetch lists
  with `UnitProducer` into `<outDir>/<unitsDir>` (default
  `shared/`) — the shell's own `dist`, where MFE-emitted identical units
  dedupe with it by content identity through the realm cache. Shared
  packages and subpaths the host chunks import only dynamically are
  produced too, but stay lazy.
- Generates an import map from every fetch list the producer returned and injects
  it inline into the emitted `index.html`, pointing only into the
  host's own `dist`, with a `sha256-…` CSP source.
- Stamps a nonce (`importMapNonce`, else Vite's `html.cspNonce`) on every
  tag the plugin injects: the import map, the modulepreload links and the
  fill chunk's script.
- The emitted HTML keeps its native module scripts and
  modulepreload links flatten the shared-chunk fetches into one round,
  so the shell boots natively like a Module Federation host.
- Emits a small fill chunk that refills the realm content-identity
  text cache from the boot list by re-fetching the same URLs (under the
  units base the import map uses) through
  `SharedUnitFetcher` from `@gears-frontx/mfes/unit-loader`. The fill
  starts when the fill chunk has loaded, which is after the shell entry
  has run (document order) and after the MFE handler has published the
  realm cache; it does not wait for window load.
- The fill's re-fetch runs at low priority with cache `'force-cache'`, so
  the boot's HTTP-cache copies serve it when `dist/` is served with
  cacheable headers.
- Fill and MFE loads join each other's in-flight entries, whichever
  publishes first, so a unit is downloaded once, and an MFE waits only
  for the units it needs, never the whole fill. MFE loads reuse the cached
  sources and mint their own instances.
- The fill chunk's file name carries a hash of its final text, data
  included, so it can be cached as immutable. The runtime trusts the
  declared content identity and computes no hash.
- A failed fill is reported on the console and never crashes the page.

The unit path applies to production builds only (`vite build`); `vite
dev` is untouched and stays native.

## Options

All optional; nothing is hardcoded to any particular host layout.

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `include` | `string[]` | unset | The packages to share; their runtime dependencies are shared too and reported. `[]` shares nothing (the shell boots fully natively). Mutually exclusive with `exclude` — both set fails the build. |
| `exclude` | `string[]` | `[]` | Packages removed from the shared set (closure opt-out; rejected when a still-shared package depends on them). |
| `unitsDir` | `string` | `'shared'` | Directory under the build output dir where units are emitted; the import map, the preloads and the fill resolve shared-file locations under it, below the base the host's own chunks are served under. |
| `barrelRewriteExclude` | `string[]` | `[]` | Packages whose barrel the host's imports keep (escape hatch from the consumer barrel rewrite). |
| `importMapNonce` | `string` | Vite's `html.cspNonce` | CSP nonce stamped on every tag the plugin injects (import map, modulepreload links, fill script); must match `[A-Za-z0-9+/=_-]+`. |
| `cacheDir` | `string` | workspace `node_modules/.cache/frontx-unit-producer` | Build-machine cache directory for the producer computation. |

## Usage

```ts
import { defineConfig } from 'vite';
import { vitePluginShell } from '@gears-frontx/vite-plugin-shell';

export default defineConfig({
  plugins: [vitePluginShell({ exclude: ['asset-only-pkg'] })],
});
```

The plugin is bundler-internal for the host build only. Manifest
aggregation (the catalog a deployment serves to consumers) is not part
of it and stays with the host's own scripts.
