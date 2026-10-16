# FrontX Standard Template

A complete, runnable **FrontX application** — a host shell wired to the FrontX
microfrontend runtime, a set of demo microfrontends, solution packages
(theming, i18n, state, auth, a development Studio), and the build/test tooling
to develop and ship it.

You are (typically) reading this inside a project that was scaffolded from this
template with the FrontX CLI:

```bash
frontx seed frontx-template-shell ./my-app
```

From here on, this repository is **your application**. This template gives you a
working starting point; what you build on top is yours.

## What you get

- **A host application** (`src-app/app`) — the shell that boots the FrontX
  runtime, renders the layout (menu, header, footer, screen container), and
  mounts microfrontends on demand.
- **The MFE runtime, pre-wired** — screens are contributed by microfrontends and
  appear in the menu automatically; no central screen registry to maintain.
- **Demo microfrontends** (`src-app/mfe_packages`, added separately via
  [`frontx-template-mfe`](../template-mfe/README.md)) — `demo-mfe` (Hello World,
  Profile, Current Theme, UIKit Elements, Widgets Host), a minimal `_blank-mfe`
  to copy from, and two widget fixtures. A shell-only seed has zero MFEs; the
  host, build, and manifest pipeline all work with none present. These ship to be
  read and copied and stay out of your running app; `src-app/mfe_packages/README.md`
  says how, and how to run them anyway.
- **Solution packages** (`packages/`) — `react`, `framework`, `state`, `i18n`,
  `studio`, `auth`: the application-layer libraries the FrontX ecosystem
  deliberately does not bundle.
- **Theming, i18n, and a dev Studio** — CSS-variable theme tokens, translation
  scaffolding, and an in-app FrontX Studio panel for toggling mock APIs, themes,
  and language during development.

## Who it's for

Applications built from this template target teams delivering modern SaaS
control panels:

- **Cloud SaaS providers** needing multitenant architectures with tenant isolation and customization
- **Service vendors** building white-label solutions with per-customer branding and feature sets
- **Corporate software vendors** building control panels for complex business applications
- **System integrators** creating pluggable control panels with third-party integrations
- **Platform/IT teams** building internal tools and admin portals with role-based access control

## What you can build with it

This template is designed for the hard problems of modern control-panel UIs and
gives you a foundation for:

- **Multitenancy** — isolated data, configuration, and branding per customer/organization
- **Role-based access control** — permissions that show/hide/disable UI by user role
- **White-label support** — per-tenant branding and themes via the theme registry
- **Plugin ecosystems** — runtime-composable microfrontends without core code changes
- **Global enablement** — multi-language, RTL/LTR, locale-aware formatting
- **Flexible builds** — web today, with room to grow to desktop / on-prem / cloud
- **High customization** — configurable views, dashboards, and workflows

Its aim is to make powerful in-product UI development approachable — as capable
as hand-rolled control-panel engineering, but structured so AI agents and humans
can build and evolve screens together.

## Capabilities

- **Human-configurable UI core** — layout, styles, and build targets
- **Layout-safe screen generation** — AI/human code separation
- **Component & style consistency** — design-system enforcement
- **Modular screen architecture** — composable building blocks
- **Pluggable UI microfrontends** — a secure plugin ecosystem
- **Shared/private store & global/local state** — performance and offline-first
- **Unified API layer** — typed contracts and observability
- **Security, multitenancy & RBAC** — enterprise SSO and compliance foundations
- **Internationalization & localization** — global-deployment ready
- **Testing & quality gates** — an automated QA pipeline

## Building UI with AI

This template is optimized for AI + human co-creation of UI, in three stages:

1. **Drafts (AI-driven)** — an AI agent generates initial screen layouts from
   prompts, requirements, and any existing API specs. Multiple variants can be
   generated and compared; drafts stay isolated from production code.
2. **Mockups (AI-assisted, human-refined)** — designers and PMs refine drafts
   with visual and interaction detail, with the agent assisting on component
   selection and style consistency.
3. **Production (human-polished)** — engineers integrate mockups with business
   logic and APIs, then review, test, and ship. Production screens inherit the
   template's theming, i18n, and access-control capabilities.

The result: up to 10x faster UI development with maintainable, enterprise-grade
code.

## Requirements

- Node.js 24+
- npm 10+

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Build the solution packages (the library builds first, via prebuild:packages)
npm run build:packages

# 3. Start everything — host + any MFE dev servers present
npm run dev:all

# 4. Open the app
#    Host:  http://localhost:5173
```

A shell-only seed has no MFEs yet, so `dev:all` just runs the host, and
`generate:mfe-manifests` writes an empty manifest set — both expected, not
errors. Add MFE packages with `frontx add frontx-template-mfe` (see
[`template-mfe`](../template-mfe/README.md)), then run `npm install` again —
`add` changes what the workspace glob matches, so the lock must be
regenerated — before their preview ports (`:3001` demo, `:3099` blank,
`:3201`/`:3202` widget fixtures) come up alongside the host. Each preview
server runs on exactly the port its package declares, because the dev manifest
points the host there: when two packages declare the same port or a declared
port is taken, `dev:all` stops before building any screen package and names the
port and the packages.

The FrontX ecosystem packages (`@gears-frontx/mfes`, `@gears-frontx/gts-plugin`,
`@gears-frontx/api`) resolve from the npm registry at exact pinned versions.

See **[QUICK_START.md](QUICK_START.md)** for the hands-on development workflow —
creating screens and microfrontends, layout, state, styling, and commands.

## Project structure

```text
my-app/
├── src-app/                 # Host application
│   ├── app/                 # Shell: App, providers, wiring
│   │   ├── components/ui/   # App-owned UI primitives (shadcn)
│   │   ├── layout/          # CoreLayout: menu, header, footer, screen slot
│   │   ├── mfe/             # MFE bootstrap + generated manifests
│   │   ├── themes/          # Theme tokens and registries
│   │   └── globals.css      # Tailwind entry + theme CSS variables
│   └── mfe_packages/        # Microfrontends (empty until `frontx add frontx-template-mfe`)
├── src/                     # Shared solution lib (api, build, gts)
├── packages/                # Solution packages: react, framework, state, i18n, studio, auth
├── public/                  # Static assets + generated-mfe-manifests.json
├── scripts/                 # dev-all, build-mfes, manifest generation, dist layout
├── tailwind.config.ts       # TailwindCSS configuration
├── vite.config.ts           # Host Vite + Module Federation config
└── .frontx/                 # Template provenance (managed by the frontx CLI)
```

## Scripts

| Script | What it does |
|--------|--------------|
| `npm run dev:all` | Build MFEs, then run the host + every MFE preview server together |
| `npm run dev` | Host only (rebuilds packages + MFEs, then Vite dev server) |
| `npm run build` | Production build: the shell and every screen in `dist/`, deployable as one folder (see [Deploying the build](#deploying-the-build)) |
| `npm run build:packages` | Build the solution workspace packages |
| `npm run build:mfes` | Build all microfrontend packages |
| `npm run generate:mfe-manifests` | Regenerate the host's MFE manifest index |
| `npm run layout:dist` | Copy the built screens into `dist/mfe/` and address them relative to `dist/` (the last step of `build`) |
| `npm run preview` | Preview a production build |
| `npm run type-check` | Type-check the host app, packages, and MFEs |
| `npm run lint` | ESLint across the project |
| `npm run arch:deps` | Dependency-boundary rules check |
| `npm run test:unit` | Unit tests (package + host app + workspace MFEs) |

## Deploying the build

`npm run build` writes one self-contained folder, `dist/`:

```text
dist/
├── index.html                    # the shell
├── assets/                       # the shell's modules and styles, hashed names
├── generated-mfe-manifests.json  # every screen, addressed as mfe/<package>/
└── mfe/<package>/                # one folder per screen package
    ├── remoteEntry.js
    ├── mf-manifest.json
    ├── assets/                   # hashed names
    └── shared/                   # shared dependencies, names without a hash
```

A screen package's preview page, type bundles, build statistics and enriched
`mfe-manifest.json` stay out of `dist/`. The shell is built with base `./`, reads
`generated-mfe-manifests.json` from its own folder, and the MFE loader resolves
each screen's `mfe/<package>/` against the shell's page, which is served from
that same folder; nothing in the shell or the manifest names a domain or a
path. Copy `dist/` to any static host, at the root of a domain or under a
sub-path (`https://example.com/apps/console/`); no build-time URL is needed. The
dev manifest in `public/` keeps the preview-server addresses. A screen package
that writes addresses into its own files (a CSS `url()` to an image or font, an
imported asset URL) builds them against its own Vite `base`, so such a package
sets `base: './'` in its `vite.config.ts`; the `template-mfe` packages write
none.

**Links and reloads.** Open the shell at its folder address with the trailing
slash (`/apps/console/`). Without the slash the page resolves its relative
addresses one folder up, so a host that does not redirect `/apps/console` to
`/apps/console/` needs that redirect. The shell names its screens in the query
string (`/apps/console/?screen=profile`), so every address it
writes is the shell's folder itself, and a reload or a shared link loads the
folder's `index.html` directly with no rewrite. If the host answers unknown
paths with `index.html` (a single-page fallback), use it only for paths below
the shell's folder and answer them with a redirect to the folder that keeps the
query string, not with the file itself: the shell's relative addresses resolve
against the requested path. Never answer a missing file under `assets/` or
`mfe/` with `index.html`: a missing module has to stay a 404, or the browser
reports a wrong content type in place of the missing file.

**Cache headers.** Only the hashed build output may be cached for long:

| Files | `Cache-Control` |
|-------|-----------------|
| `assets/*` and `mfe/*/assets/*` (names carry a content hash) | `public, max-age=31536000, immutable` |
| everything else: `index.html`, `generated-mfe-manifests.json`, `mfe/*/remoteEntry.js`, `mfe/*/mf-manifest.json`, `mfe/*/shared/*`, files copied from a `public/` folder | `no-cache` (revalidate on every request) |

A file without a hash in its name changes content under the same name on every
release, so a long cache on it would keep serving the previous release. Keep
files of your own out of a `public/assets/` folder, which would land under a
path cached as hashed.

**When a screen does not load.** A screen whose files fail to load shows an
error state with a Retry in its place, and navigation and the other screens
keep working. Retry repeats the navigation that failed with its own history
intent: a failed menu click still adds its history entry, a screen the address
opened is mounted without writing one. A manifest that fails to load shows the
same state, and its Retry reloads the page.

A screen that reads the shell's own files by an absolute address (the
`demo-mfe` widgets host fetches `/generated-mfe-manifests.json`) works only at
the root of a domain until screens can learn the shell's address.

## Tech stack

- **React** + **TypeScript** + **Vite** with **Module Federation** for MFEs
- **Tailwind CSS** with CSS-variable theme tokens (shadcn/ui primitives)
- Built on the FrontX ecosystem: `@gears-frontx/mfes` (runtime),
  `@gears-frontx/gts-plugin` (type system), `@gears-frontx/api` (API layer)

## Upgrading

This project records its template provenance under `.frontx/`. When a newer
template version is released, upgrade with the FrontX CLI — changes are shown as
a reviewable change set before anything is written:

```bash
frontx upgrade . <targetVersion>
```

> **Multi-template repositories.** `frontx upgrade` is not yet supported once a
> second template has been added (e.g. after `frontx add frontx-template-mfe`) —
> it currently reads a single provenance record. Upgrading a shell+mfe project
> is not supported in this release.
