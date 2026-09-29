# Guideline: The App's Chrome, and What a New Screen Plugs Into

This application owns its whole document. It is a plain Vite + React app on `@gears-frontx/ui-kit` without the FrontX runtime: there is no host to ask for anything, so every mechanism below is a module in `src/app/` or `src/shared/` that a screen simply calls. Reuse them; do not write a second copy of any of them.

## The icon rail is the navigation

`src/app/IconRail.tsx` is the app's fixed narrow left edge: the product mark at the top, one button per section (Dashboard, Chat, Mail, Contacts) with the section's name as its accessible label and its tooltip, a flexible spacer, then the theme toggle and the profile-menu popover at the bottom. Adding a section means adding an entry to its `RAIL_SECTIONS`, extending its `sectionOf`, and adding a branch in `src/app/App.tsx` - there is no manifest, no extension declaration and no id taxonomy.

The rail never collapses. It is the edge the rest of the layout is measured from; the channel, mailbox and filter columns beside it are the ones that collapse. Each of those takes its open state from `useSidebarToggle` in `src/shared/`, which starts it open on a wide viewport and folded below the compact width, and a `PanelLeftIcon` toggle with `aria-expanded` in the screen's list header flips it. A folded column stays in the tree for its width transition, with `inert` and `aria-hidden` so nothing in it is focusable or read.

Every screen renders exactly one `h1`, through `ScreenHeading` in `src/shared/`, in the place its pane header puts its title. On a route change `App.tsx` names the document after the section (`document_title`) and asks the new screen's heading to take focus; the first load moves no focus.

The dashboard is the one screen with no folder or filter column at all - a single full-width, scrollable pane straight after the rail. Not every screen needs a secondary sidebar; add one only when the screen has a folder or filter concept to hold, the way chat, mail and contacts do.

## Routing is the URL fragment

`src/app/routing.ts` owns five routes, their constants and the parser for them:

| Route | Constant or builder | Screen |
|---|---|---|
| `#/dashboard` | `DASHBOARD_ROUTE` | the dashboard, and the fallback for any unrecognised address |
| `#/chat` | `INBOX_ROUTE` | the chat screen; `#/inbox` opens it too |
| `#/mail` | `MAIL_ROUTE` | the mail screen |
| `#/contacts` | `CONTACTS_ROUTE` | the contacts directory, and the fallback for a contact id that does not decode |
| `#/contacts/{id}` | `contactRoute(id)` | one contact's page |

`useRoute()` reads the fragment and corrects the address bar to the canonical fragment of what it opened (an unknown path, `#/inbox`, an undecodable contact id) with `history.replaceState`, so the address a visitor copies always opens what they see and no history entry is added. `hashOf(route)` is the inverse of `parseRoute`; `navigate(fragment)` is how a screen moves.

Two properties are load-bearing:

- **A section's own sub-state that a visitor could want to return to belongs in the route, not in screen state.** A contact's page is a route for exactly that reason: "View contact" in a thread is `navigate(contactRoute(id))`, and the address it produces reloads, bookmarks and shares.
- **The fragment, not the path.** A fragment needs no server rewrite, so the built `index.html` deep-links correctly from any static host, including one serving it from a sub-path (`VITE_BASE`). Adding a route means extending `Route`, `parseRoute`, `hashOf` and `routing.test.ts`, not adding a router.

## Errors are caught at the root

`src/app/ErrorBoundary.tsx` wraps `App` in `src/main.tsx`. A render error anywhere replaces the app with a kit `Alert` and a reload button instead of a blank window. A screen's own failed query is not an error for the boundary: it renders `LoadErrorPane` from `src/shared/QueryStates.tsx` (see the `inbox-data-contract` guideline).

## Theme follows the system until the visitor chooses

`@gears-frontx/ui-kit/theme.css` paints every token from `data-theme` on the document root, and with no attribute it follows the system's `prefers-color-scheme`. `index.html` sets no `data-theme`, so the first paint is already in the visitor's system theme. `src/app/theme.ts` is the one writer: `applyStoredTheme()` in `src/main.tsx` restores a choice stored on an earlier visit before the first render, and `useTheme().toggleTheme` sets and stores a new one. A visitor who never toggles keeps following the system.

A screen never reads or writes the theme. `useTheme` exists for the one toggle in the rail.

## Copy

`src/shared/i18n.ts` exports `t`, the `Translate` type and `locale`, reading `src/i18n/en.json` (in `shared/` because the formatters read `locale` and the layer rules keep `shared/` below `app/`). `t(key, params)` fills `{name}` parameters and picks a plural form (`<key>_one`, `<key>_other`, by `Intl.PluralRules`) from a numeric `count`. Screens take `t` as a prop rather than importing it, and their tests pass the real `t` and query by `t(key)`. Add a screen's strings, separators and sentence templates included, to that one file; every `Intl` formatter reads `locale`, and a number, a percent or a unit is written by `Intl`, never spelled out. A missing key returns the key itself and logs one console warning per key.

## Shared parts

`src/shared/` holds what more than one screen uses: `PresenceAvatar` and `IdentityAvatar` (initials and a tone hashed from the name, so one person keeps one circle everywhere), the formatters in `format.ts` (relative times, initials, email domain, `labelOf` for the fixed vocabularies), `useMediaQuery` with the `COMPACT_QUERY` and `SINGLE_PANE_QUERY` breakpoints, `useSidebarToggle`, `ScreenHeading`, `QueryStates.tsx`, `submitShortcut.tsx`, and `cx`. A new screen reuses these rather than writing its own.

## Kit overlays need nothing

The kit's overlays - Select, Combobox, Popover, Dialog, DropdownMenu - portal to `<body>`, which is this app's own document. Pass no `container`.

## Styles

Kit component CSS travels with each component the bundler pulls in; there is nothing to import. The app's own layout is CSS Modules over the kit's semantic tokens, each beside the components that use it: `src/app/App.module.css` holds the frame and the rail, `src/shared/shared.module.css` what several screens draw (pane chrome, side columns, list rows, the thread and composer frames, field rows, the presence badge), and each screen's folder its own module (`inbox.module.css`, `mail.module.css`, `contacts.module.css`, `dashboard.module.css`). Colours, space steps, radii and type sizes come from kit tokens (a tint is a `color-mix` over one), and a literal is left only where the kit has no token, with a comment saying so; there is no CSS framework and no second component library. `src/styles/app.css` is the document frame alone (full height, no page scroll) and should not grow.

A screen reads the shared shapes from `src/shared/shared.module.css` and keeps its own classes in its own module. It never imports another screen's module; `arch:deps` rejects that the same way it rejects a cross-screen component import.

## Chrome as shipped

A screen added later should keep these as they are.

1. The rail's mark is a neutral glyph.
2. Only the sections this app ships appear in the rail; the out-of-scope ones are absent (see the `inbox-scope-inventory` guideline).
3. The palette is the kit's tokens.
4. The rail's bottom cluster is the theme toggle and the profile menu, nothing else: no command palette, messenger settings, settings or theme customiser.
5. Profile, Settings and Log out in the profile menu render as disabled buttons.
6. A control whose action this template does not ship renders disabled, never enabled with no handler.
7. The side columns start folded at the compact width and open from their toggle, and below the single-pane width a list and its detail take turns; the rail keeps its shape at every width.
8. A chart carries `role="img"` and a `chartSummary` label that lists what it plots; a sparkline or a donut whose numbers the card already prints in text is `aria-hidden`.
