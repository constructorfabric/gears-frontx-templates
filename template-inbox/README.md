# FrontX Inbox Template

A complete, runnable **workspace application**: a plain Vite + React single-page app built on `@gears-frontx/ui-kit`, with its own navigation rail and four screens (dashboard, chat inbox, mail and contacts). Seed it into an empty repository, install, and `npm run dev` gives you a running product.

It does not use the FrontX runtime. There is no `@gears-frontx/react`, no microfrontend and no shell: the app has its own hash router, its own UI-string catalogue and its own theme switch, and reads its data through `@gears-frontx/api` services directly. It is a separate starting point, not a variant of the shell template.

From here on, the seeded repository is **your application**.

## Requirements

- Node.js 24+
- npm 10+

## Getting it

This template establishes a whole repository on its own: the app entry, the Vite build, the TypeScript, lint and test configuration, and the dependency set. There is no shell to apply first. The FrontX CLI addresses it as a subtree of the `constructorfabric/gears-frontx-templates` repository, and seeds it by the name its manifest declares:

```bash
frontx install github:constructorfabric/gears-frontx-templates//template-inbox@<ref>
frontx seed @gears-frontx/frontx-template-inbox ./my-app
cd my-app
npm ci
npm run dev
```

`<ref>` is a tag, branch or commit; pin it in anything meant to be reproducible.

## Running it

The app is a self-contained npm project, whether this directory is the template itself or a project seeded from it. It installs its `@gears-frontx` dependencies from the npm registry at the exact versions its `package.json` pins, so nothing needs building underneath it. The committed `package-lock.json` makes `npm ci` reproducible in CI and in a freshly seeded project alike. From this directory:

```bash
npm ci
npm run dev
```

The dev server prints the local address. To serve a production build from a sub-path, set `VITE_BASE` for the build (`VITE_BASE=/previews/inbox/ npm run build`); routing lives in the URL fragment, so any static host serves every deep link.

## Scripts

| Script | What it does |
|--------|--------------|
| `npm run dev` | Vite dev server |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run type-check` | Type-check the app, the tests and the build config (three programs) |
| `npm run lint` | ESLint across the project, zero warnings allowed |
| `npm run arch:deps` | Dependency-boundary rules over `src/` |
| `npm test` | Unit tests (Vitest, jsdom) |
| `npm run test:unit:watch` | Unit tests in watch mode |

`arch:deps` is a dependency-cruiser check: no runtime import cycles, no screen importing another screen, and no import from `src/api/`, `src/shared/` or the test utilities up into a screen or into `src/app/`.

## Project structure

| Path | What it holds |
|------|---------------|
| `src/main.tsx` | Entry: kit theme CSS, API registration, stored theme, first render |
| `src/app/` | The chrome: `App`, the icon rail, the hash router, the UI-string lookup, the theme switch |
| `src/screens/<screen>/` | One vertical slice per screen: `dashboard`, `inbox`, `mail`, `contacts` |
| `src/api/` | The API services, their mock maps and seed datasets, the response types and the query hooks |
| `src/shared/` | Formatting helpers, avatars and the media-query hook every screen uses |
| `src/i18n/en.json` | The UI-string catalogue |
| `src/styles/` | The document frame (`app.css`) and the CSS modules the screens use |
| `src/__test-utils__/` | The test renderer and the query-layer stand-in the screen tests use |
| `public/` | Static assets served as they are |

## Screens

- **Dashboard** (`#/dashboard`, the default landing screen) - KPI cards, charts, team workload, a stage funnel and a sortable, paginated recent-activity table.
- **Inbox** (`#/chat`) - channels, a searchable conversation list, the thread with a reply-and-note composer, and the customer-details panel.
- **Mail** (`#/mail`) - mailboxes, an all-mail and unread list with instant search, and a reading pane with collapsible history and a reply composer.
- **Contacts** (`#/contacts`) - a filterable, sortable directory and a contact page at an address you can reload or share (`#/contacts/<id>`).

## Data and mocks

Every conversation, message, mail, mailbox, contact, dashboard metric and identity comes from the seed datasets in `src/api/`, served by the app's own `@gears-frontx/api` services (`InboxApiService`, `MailApiService`, `DashboardApiService`) through the app's `RestMockPlugin`. Each service registers the plugin without switching it on; `setMockMode(true)` in `src/api/registry.ts` switches every service's mock plugin on at boot. Passing `false` there, or dropping the call, sends every request to the real backend at the service's base URL, with the endpoints, the response types and the screens unchanged.

While mocks are on, a route the mock map does not know answers 404 instead of reaching the network, and `POST /api/inbox/messages` answers 400 to a body without a conversation or text. A posted reply or note is kept in the mock store, so it is still in the thread after the screen remounts, until the page reloads. All seed email addresses use reserved example domains, and all seed phone numbers use the fictional `555 01xx` range.

## Theming

Layout is CSS Modules over the kit's semantic tokens; there is no CSS framework and no second component library. The kit's `theme.css` paints light or dark from `data-theme` on the root element and follows the system's `prefers-color-scheme` while none is set, which is how the app boots. The rail's theme toggle sets and stores an explicit choice.

## AI bundle

The template installs an AI bundle at `.frontx/ai/@gears-frontx/frontx-template-inbox/`:

- the `add-inbox-screen` skill and its workflow, which carry adding a further screen to the app (not applying this template again);
- guidelines for the scope (what the app deliberately does not ship), the chrome (rail, panes and shared layout) and the data contract (services, mocks and datasets);
- a reference artifact mapping each pane of the shipped screens to the kit component that renders it.

## Upgrading

This project records its template provenance under `.frontx/`. When a newer template version is released, upgrade with the FrontX CLI - changes are shown as a reviewable change set before anything is written:

```bash
frontx upgrade . <targetVersion>
```
