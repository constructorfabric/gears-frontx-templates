---
name: frontx-template-inbox-add-inbox-screen
description: "Add a screen to the workspace application this template establishes - a new screen directory, a route, a rail button, wired to the app's existing API services and chrome."
---

# Add a Screen to the Inbox App (template-inbox)

**Precondition:** this template has been applied, so the project *is* the app - `src/app/`, `src/api/` and `src/screens/` all exist. This skill adds a screen inside that app. It does not create a package and it does not apply a template.

## When to use

The project wants another section: a queue, a report over the same data, a directory of another kind of record. Check the `inbox-scope-inventory` guideline first - several plausible-sounding screens are deliberately not part of this product.

## What the app already gives you

- **A service and a dataset per domain**: `InboxApiService` (five reads, two writes) behind the chat and contacts screens, `MailApiService` (three reads) behind the mail screen, and `DashboardApiService` (one read, the whole dashboard snapshot together) behind the dashboard, each read through `useApiQuery`. A screen whose domain does not overlap with any of the three gets its own sibling service, registered in `src/api/registry.ts`, the same way mail and the dashboard did; `setMockMode` covers its mock plugin with no further change. See the `inbox-data-contract` guideline.
- **Chrome**: the icon rail, hash routing, the screen and root error boundaries, the theme, the copy catalogue, the avatars, the formatters, the media-query hook and the first-paint gate (`firstPaintOf`, `LoadingPane`, `LoadErrorPane`), in `src/app/` and `src/shared/`. See the `inbox-chrome-contract` guideline.
- **A composition to copy**: `src/screens/inbox/` is the nearest existing screen for a list-and-detail layout, `src/screens/dashboard/` for a single scrollable pane of cards. The `inbox-screen-inventory` reference artifact in this bundle maps each pane and each part of all four shipped screens to the kit component that renders it.

## Steps

1. **Read the three guidelines in this bundle before writing anything.** Scope first: if the request is on the not-to-build list, say so and stop.

2. **Add the screen directory** at `src/screens/{screen}/`, with the screen component and any parts of its own. The screen renders its panes as siblings: the rail and the app frame are already around it, so it needs no wrapper of its own. It takes `t` as a prop, and takes any route input (an id, a filter) as a prop too, rather than reading the URL itself. It gates its first paint on every query it needs with `firstPaintOf`, and renders `LoadErrorPane` and `LoadingPane` for the failed and pending cases.

3. **Compose from `@gears-frontx/ui-kit` and its semantic tokens.** Consult the installed kit's `llms.txt` for the inventory and the reference artifact in this bundle for what this app already uses for each part. Hand-rolling a look-alike of a kit component is a defect, not a style choice. A control whose action the screen does not ship renders disabled.

   If `.frontx/ai/@gears-frontx/template-design-guardrails/` exists in the project, that bundle's `generate-interface` skill and its design contract govern how the screen is generated - follow them, and load the contract once for the whole screen rather than re-reading it per file. If it is not installed, state in the plan that the screen is being generated without a design contract.

   Layout on kit tokens: the screen's own CSS module beside it (`src/screens/{screen}/{screen}.module.css`), plus `src/shared/shared.module.css` for the pane, header, sidebar and row shapes every screen shares. Never another screen's module. Kit tokens for every colour, space step and radius, no CSS framework.

4. **Give it a route** in `src/app/routing.ts`: a variant in the `Route` union, a branch in `parseRoute`, a case in `hashOf`, and a `{SCREEN}_ROUTE` constant (for example `DASHBOARD_ROUTE`) - or, for a route that carries an id, a camelCase builder like `contactRoute(id)`. Extend `routing.test.ts` in the same edit - the parser is the one place a wrong address turns into a wrong screen silently.

5. **Render it** from `src/app/App.tsx`, on that route.

6. **Put it in the rail** in `src/app/IconRail.tsx`: one `Button` with a `lucide-react` icon, `aria-label`, `aria-current` when active, and an `onClick` that navigates. Extend `sectionOf` so the button lights up for every route that belongs to the section, including sub-routes.

7. **Add its copy** to `src/i18n/en.json`, including the rail button's label.

8. **Check.**

   ```bash
   npm run type-check
   npm run lint
   npm run arch:deps
   npm run test:unit
   npm run build
   ```

   Then `npm run dev`, open the new screen from the rail, reload on its own address to confirm the route resolves, toggle the theme, and confirm the console is clean.

## Boundaries

- No global store. A screen keeps what must survive leaving it (selection, search, drafts) in its own small store built with `createStore` beside the screen, and everything else in local React state; server state comes through `useApiQuery` against the app's own services.
- No new service for a screen whose domain already overlaps with `InboxApiService`, `MailApiService` or `DashboardApiService` - read from the one that already owns it. Seed data lives in the owning service's dataset module, never in a fixture file or in a screen.
- No import from one screen into another; `npm run arch:deps` enforces it. What two screens share moves to `src/shared/`.
- No router dependency. A handful of routes and a parser are the whole mechanism; if a screen genuinely needs nested layouts or loaders, say so and let the project decide to adopt a router, rather than adding one inside a screen.
- No CSS framework and no second component library.
