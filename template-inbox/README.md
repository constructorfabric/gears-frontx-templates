# FrontX Inbox Template

A workspace product for a FrontX application: helpdesk-style screens (contacts, dashboard, chat and mail) built from `@gears-frontx/ui-kit`, each its own microfrontend package with its own Module Federation build, its own routes inside the shell's screen domain, its own UI strings, and mocked `@gears-frontx/api` services that share one mock dataset across the screens. Applied onto a shell, the screens appear in the shell's menu without further wiring.

## Add-only - requires `template-shell`

This template is an overlay, like `template-mfe`. It claims no root `package.json`, no build, test or lint tooling and no host: those belong to [`frontx-template-shell`](../template-shell/README.md), which mounts the screens. It contributes only what `frontx-template.json` claims:

| Path | What it holds |
|------|---------------|
| `src-app/mfe_packages/inbox-contacts-mfe/` | The contacts screen: a filterable, sortable directory and each person's page (`?screen=contacts;route=<id>`) |
| `src-app/mfe_packages/inbox-dashboard-mfe/` | The dashboard screen: KPI cards, charts, team workload, a stage funnel and the recent-activity table, with its own overview service and seed (`src/api/`) |
| `src-app/mfe_packages/shared/inbox/` | What every inbox screen shares, imported as `@inbox-shared/*` and bundled into each package: the API services, the page-wide mock store and the query hooks (`api/`), the UI-string rules and shared catalogue (`i18n/`), the screen lifecycle and frame (`lifecycle/`), cross-screen navigation (`navigation/`) and shared components (`ui/`) |
| `.frontx/ai/@gears-frontx/frontx-template-inbox/` | The AI bundle |

The screens move into packages one at a time; contacts and dashboard have landed. Until the last one has, the former standalone application stays in this directory (`src/`, `public/`, `index.html` and its configs), unclaimed, as the reference the packages are checked against.

The `package.json` next to this README is not part of the template: it is the in-repository dev harness, as in `template-mfe`, deliberately absent from the manifest's boundaries so `frontx add` never copies it. Its workspaces are this template's packages, and its `overrides` point the shell's own packages at `../template-shell`.

## Working on it in this repository

Unit tests run in place, from the harness. Build the shell first, because the packages' vite and vitest configs load its build plugin and test utilities:

```bash
cd template-shell && npm ci && npm run build
cd ../template-inbox && npm ci
npm test                   # every package's unit tests
npm run type-check         # every package's type-check
```

To see the screens in the shell, compose the shell with both overlays the way CI does and run it (`live-run/README.md` step L0, with one more `tar` for this template):

```bash
export COMPOSED="${TMPDIR:-/tmp}/frontx-inbox-composed"
rm -rf "$COMPOSED" && mkdir -p "$COMPOSED/src-app/mfe_packages"
tar -C template-shell --exclude=node_modules -cf - . | tar -C "$COMPOSED" -xf -
tar -C template-mfe/src-app/mfe_packages --exclude=node_modules -cf - . | tar -C "$COMPOSED/src-app/mfe_packages" -xf -
tar -C template-inbox/src-app/mfe_packages --exclude=node_modules -cf - . | tar -C "$COMPOSED/src-app/mfe_packages" -xf -
find "$COMPOSED/src-app/mfe_packages" -not -path '*/node_modules/*' -name package-lock.json -delete
cd "$COMPOSED" && npm install && npm run dev:all
```

The shell runs on `http://localhost:5173`; the contacts remote previews on port 3010 and the dashboard remote on 3020. After editing a package, rebuild it and regenerate the manifests in the composed tree (`npm run build --workspace=@gears-frontx/inbox-contacts-mfe && npm run generate:mfe-manifests`); a package rebuilt without the second step fails to mount.

The former standalone application runs beside it for side-by-side checks: `npm run dev:reference` in this directory.

## Screens

In the shell menu the screens take the orders 100 (contacts), 200 (dashboard), 300 (chat) and 400 (mail); only screens that have landed as packages appear there. The others are listed with the address the reference application gives them.

- **Inbox** (`#/chat` in the reference application) - channels, a searchable conversation list, the thread with a reply-and-note composer, and the customer-details panel.
- **Mail** (`#/mail` in the reference application) - mailboxes, an all-mail and unread list with instant search, and a reading pane with collapsible history and a reply composer.
- **Contacts** (`inbox-contacts-mfe`, `/?screen=contacts`) - a filterable, sortable directory and a contact page at an address you can reload or share (`/?screen=contacts;route=<id>`).
- **Dashboard** (`inbox-dashboard-mfe`, `/?screen=dashboard`) - KPI cards, charts with text alternatives, team workload, a stage funnel and a sortable, paginated recent-activity table whose rows name the directory's contacts.

## Data and mocks

Every conversation, message, contact and identity comes from the seed dataset in `shared/inbox/api/`, served by `InboxApiService` through the template's own `RestMockPlugin`. The dashboard's overview comes from `DashboardApiService` and its seed in `inbox-dashboard-mfe/src/api/`, which no other screen reads (the reference application still serves mail data from `src/api/`). Each package registers only the services it reads and switches their mock plugins on with the framework's `mock({ enabledByDefault: true })` in its `init.ts`. Passing `false` there sends every request to the real backend at the service's base URL, with the endpoints, the response types and the screens unchanged.

Each screen is its own module graph, so the state screens share lives once per page instead of once per package: a realm-global store (`shared/inbox/api/mockStore.ts`, under `Symbol.for('@gears-frontx/frontx-template-inbox/mock-state/v1')`) that every screen reads, with a revision every accepted write moves. It holds the contacts, the conversations and the transcript; the dashboard's activity rows are built from the store's contacts on each request, so every row names a person the directory lists. A screen whose query cache is older than the revision reads again.

While mocks are on, a route the mock map does not know answers 404 instead of reaching the network. `POST /api/inbox/messages` answers 400 to a body without a conversation, text or a `reply`/`note` kind and 404 for a conversation that does not exist; `POST /api/inbox/conversations` starts a conversation with an existing contact. A posted reply or note and a started conversation are kept in the mock store, so they are still there after the screen remounts, until the page reloads. What the user selects, types and changes on a screen is kept in that screen's store, so leaving a section and coming back finds it as it was. All seed email addresses use reserved example domains, and all seed phone numbers use the fictional `555 01xx` range.

## Theming

Layout is CSS Modules over the kit's semantic tokens; there is no CSS framework and no second component library. Each screen renders in a shadow root: its lifecycle anchors the kit's tokens on the shadow host, and its frame sets `data-theme` from the shell's theme property, so a theme switch in the shell repaints every screen. Popups (sheets, dialogs, selects) portal into a node inside the shadow root.

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
