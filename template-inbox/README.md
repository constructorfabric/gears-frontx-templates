# FrontX Inbox Template

A complete, runnable workspace application built on `@gears-frontx/ui-kit`: a Vite + React single-page app with its own navigation rail and four screens. Seed it into an empty repository, install, and `npm run dev` gives you a running product.

## Screens

- **Dashboard** (`#/dashboard`, the default landing screen) - KPI cards with area, bar, line and radial charts, a labeled bar chart, a combo hero chart, workload progress strips, a ranked agents list and a sortable, paginated recent-activity table.
- **Inbox** (`#/chat`) - message channels with unread counts, a searchable and sortable conversation list, the message thread with a reply-and-note composer, and the customer-details panel.
- **Mail** (`#/mail`) - mailboxes (Inbox, Drafts, Sent, Archive, Trash), an all-mail and unread list with instant search, and a reading pane with collapsible message history and a reply composer.
- **Contacts** (`#/contacts`) - a directory with filters, a sortable table paged 25 rows at a time, and a contact detail page at an address you can reload or share (`#/contacts/<id>`).

All four sit beside the app's icon rail: the product mark, one button per screen, and at the bottom the theme toggle and the profile menu.

## Seeding a project from it

This template establishes a whole repository on its own: the app entry, the Vite build, the TypeScript, lint and test configuration, and the dependency set. There is no shell to apply first. The FrontX CLI addresses it as a subtree of the `constructorfabric/gears-frontx-templates` repository, and seeds it by the name its manifest declares:

```bash
frontx install github:constructorfabric/gears-frontx-templates//template-inbox@<ref>
frontx seed @gears-frontx/frontx-template-inbox ./my-app
cd my-app
npm ci
npm run dev
```

`<ref>` is a tag, branch or commit; pin it in anything meant to be reproducible. From here on, the seeded repository is your application.

## Running it

The app is a self-contained npm project, whether this directory is the template itself or a project seeded from it. It installs its `@gears-frontx` dependencies from the npm registry at the exact versions its `package.json` pins, so nothing needs building underneath it. From this directory:

```bash
npm ci
npm run dev          # Vite dev server
npm test             # unit tests (vitest)
npm run build        # production build into dist/
```

`npm run type-check`, `npm run lint` and `npm run arch:deps` complete the check set. `arch:deps` is a dependency-cruiser check over `src/`: no runtime import cycles, no screen importing another screen, and no import from `src/api/`, `src/shared/` or the test utilities up into a screen or into `src/app/`.

The template commits its `package-lock.json`, so `npm ci` is reproducible, in CI and in a freshly seeded project alike.

## What it is built on

| Concern | Package |
|---|---|
| Every visual, and the theme tokens the layout is written in | [`@gears-frontx/ui-kit`](https://www.npmjs.com/package/@gears-frontx/ui-kit) |
| The data layer - service, protocols, endpoint descriptors | [`@gears-frontx/api`](https://www.npmjs.com/package/@gears-frontx/api) |
| Dashboard charts | `recharts`, at the version ui-kit's chart components use |
| Icons | `lucide-react`, imported directly |

Layout is CSS Modules over kit tokens; no raw colour or metric is written down in `src/styles/`. There is no CSS framework and no second component library.

Every conversation, message, mail, mailbox, contact, dashboard metric and identity comes from the datasets in `src/api/`, served by the app's own `@gears-frontx/api` services (`InboxApiService`, `MailApiService`, `DashboardApiService`) through its `RestMockPlugin`. Mocks are switched on in `src/api/registry.ts`; pointing the app at a real backend is passing `useMocks(false)` there, or dropping the three `useMocks(true)` calls. All seed email addresses use reserved example domains.

## AI bundle

The template installs an AI bundle at `.frontx/ai/@gears-frontx/frontx-template-inbox/`:

- the `add-inbox-screen` skill and its workflow, which carry adding a further screen to the app (not applying this template again);
- guidelines for the scope (what the app deliberately does not ship), the chrome (rail, panes and shared layout) and the data contract (services, mocks and datasets);
- a reference artifact mapping each pane of the shipped screens to the kit component that renders it.

## Status

This template is imported as a monolith: one app and one package with four screens and its own hash router. The workspace template family is split from it, and FrontX routing and microfrontend wiring follow once the shell's routing work lands.
