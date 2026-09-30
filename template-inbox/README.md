# FrontX Inbox Template

Four helpdesk-style screens for a FrontX application - contacts, dashboard, chat and mail - each a microfrontend package the shell mounts in its screen domain, built from `@gears-frontx/ui-kit` with mocked `@gears-frontx/api` services. This template is an overlay onto [`template-shell`](../template-shell/README.md): it claims no root `package.json`, no host and no tooling, only what `frontx-template.json` lists.

## Packages

All paths are under `src-app/mfe_packages/`. The shell runs on `http://localhost:5173`; `npm run dev:all` previews each package on its port.

| Package | Screen | Address | Menu order | Port |
|---|---|---|---|---|
| `inbox-contacts-mfe` | a filterable, sortable directory and each person's page | `/?screen=contacts`, `/?screen=contacts;route=<id>` | 100 | 3010 |
| `inbox-dashboard-mfe` | KPI cards, charts, team workload, a stage funnel, conversion by source and the recent-activity table | `/?screen=dashboard` | 200 | 3020 |
| `inbox-chat-mfe` | channels, the conversation list, the thread with a reply-and-note composer, the customer-details panel and "View contact" | `/?screen=chat` | 300 | 3030 |
| `inbox-mail-mfe` | mailboxes, the mail list with search, the reading pane with history and reply, and compose | `/?screen=mail` | 400 | 3040 |

`shared/inbox/` holds what the four share, imported as `@inbox-shared/*` and bundled into each package: the API services, mock store and query hooks (`api/`), the shared catalogue (`i18n/`), the screen lifecycle and frame (`lifecycle/`), cross-screen navigation (`navigation/`), shared components (`ui/`), the common build and test configuration (`build/`) and test platform (`test-support/`). It has no `package.json` and is not a workspace. Packages never import one another.

## Data and mocks

Contacts, dashboard and chat read `InboxApiService` (`/api/inbox`) from the page-wide inbox mock store in `shared/inbox/api/mockStore.ts`, so a reply posted in chat shows on the contact's page, with its conversation's latest message and time. The dashboard's overview service (`/api/dashboard`) and the mail service (`/api/mail`, with its own page-wide mock state) live in their packages. Each package switches its mocks on with `mock({ enabledByDefault: true })` in `src/init.ts`; `false` sends every request to a real backend with the endpoints and screens unchanged. The AI bundle's `inbox-data-contract` guideline has the endpoints, the cache epoch and the backend switch; `inbox-chrome-contract` has what the shell owns and what each screen keeps.

## Running it in this repository

Unit tests and type-check run in place from the harness (`package.json` here is a monorepo-only harness, never copied by `frontx add`). Build the shell first; the packages' configs load its build plugin and test utilities:

```bash
cd template-shell && npm ci && npm run build
cd ../template-inbox && npm ci
npm test
npm run type-check
```

To see the screens in the shell, compose the overlays onto the shell as CI does and run the dev loop:

```bash
export COMPOSED="${TMPDIR:-/tmp}/frontx-inbox-composed"
rm -rf "$COMPOSED" && mkdir -p "$COMPOSED/src-app/mfe_packages"
tar -C template-shell --exclude=node_modules -cf - . | tar -C "$COMPOSED" -xf -
tar -C template-mfe/src-app/mfe_packages --exclude=node_modules -cf - . | tar -C "$COMPOSED/src-app/mfe_packages" -xf -
tar -C template-inbox/src-app/mfe_packages --exclude=node_modules -cf - . | tar -C "$COMPOSED/src-app/mfe_packages" -xf -
find "$COMPOSED/src-app/mfe_packages" -not -path '*/node_modules/*' -name package-lock.json -delete
cd "$COMPOSED" && npm install && npm run dev:all
```

After editing a package, re-sync it, rebuild it and regenerate the manifests in the composed tree (`npm run build --workspace=@gears-frontx/inbox-contacts-mfe && npm run generate:mfe-manifests`); a package rebuilt without the second step fails to mount.

## Kit gaps

- The packages pin `@gears-frontx/ui-kit` 0.4.0-alpha.6 (they need `StatusDot`, `EmptyActions`, `Toggle` with `iconOnly`, `--radius-full` and `--overlay-modal`), while the shell's chrome renders from 0.4.0-alpha.3; each package's `resolve.dedupe` keeps its own kit copy.
- In the light theme the `success` (3.43:1) and `danger` (4.28:1) badge tones stay under the 4.5:1 text contrast the design guardrails ask for; the badge text carries the meaning.
- The design guardrails report `aria-required-children` on the kit's `ItemGroup` and a control-height mismatch (36 px controls beside 65 px rows) on the mail lists.
- `Bubble` has no variant with the tail corner at the bottom; chat overrides its corner radii.
- No tokens for the dashboard's big-number type scale and icon-chip size, or for a softer border and muted fill (mail's history cards mix `--border` and `--muted` into transparency).

## Moving into a project repository

The four packages and the shared folder are product code; a product repository takes them as its own:

1. Seed the shell and add the MFE and guardrails templates:

   ```bash
   frontx install github:constructorfabric/gears-frontx-templates//template-shell@<ref>
   frontx seed @gears-frontx/frontx-template-shell ./my-product
   frontx install github:constructorfabric/gears-frontx-templates//template-mfe@<ref>
   frontx add @gears-frontx/frontx-template-mfe ./my-product
   frontx install github:constructorfabric/gears-frontx-templates//template-design-guardrails@<ref>
   frontx add @gears-frontx/template-design-guardrails ./my-product
   ```

2. Copy the code, without `node_modules` or `dist`, from the root of this repository:

   ```bash
   for dir in shared/inbox inbox-contacts-mfe inbox-dashboard-mfe inbox-chat-mfe inbox-mail-mfe; do
     mkdir -p "my-product/src-app/mfe_packages/$dir"
     tar -C "template-inbox/src-app/mfe_packages/$dir" --exclude=node_modules --exclude=dist -cf - . \
       | tar -C "my-product/src-app/mfe_packages/$dir" -xf -
   done
   ```

3. The project's root `package.json` already lists `src-app/mfe_packages/*` in `workspaces`, which picks up the four packages; `shared/` has no `package.json` and needs no entry. Each package declares its own dependencies, so `npm install` at the project root is the whole install. The project's `.frontx/` provenance records the shell and the two added templates only: the inbox is the project's own code, not a template it tracks.
4. Copy the two guidelines under `.frontx/ai/@gears-frontx/frontx-template-inbox/guidelines/` into the project's own AI bundle and list them in its `extension.json`; they cite only paths under `src-app/mfe_packages/`.
5. Leave behind what only serves this repository: this README, `frontx-template.json`, the harness `package.json` and `package-lock.json`, and `src-app/vitest.mfe.base.ts` and `src-app/__test-utils__/`, whose forwarders the shell's own files replace in a project.

Then `npm run build`, `npm run type-check`, `npm run lint`, `npm run arch:deps` and `npm run test:unit` at the project root check the screens with the rest of the application.
