# Guideline: What the Shell Owns and What Each Inbox Screen Keeps

Each inbox screen is a microfrontend package the application shell mounts into a shadow root in its screen domain. The shell draws the chrome; the screen keeps everything a page would otherwise get from its own document. Paths below are relative to `src-app/mfe_packages/`.

## The shell owns

- **The menu.** A screen appears there through the screen extension in its package's `mfe.json` (`presentation.label`, `icon`, `route`, `order`); there is no menu list to edit. The label in `mfe.json` is the menu's; the screen's own name for itself is `nav_label` in its catalogue.
- **The page address.** The shell writes a screen's token into the URL (`/?screen=contacts`) and resolves it back on load, Back and Forward. The token equals `presentation.route` without its slash and is listed in `shared/inbox/navigation/screens.ts` (`INBOX_SCREENS`); `inbox-contacts-mfe/src/shared-inbox/screens.test.ts` holds every package's manifest to that list.
- **Layout, theme and language.** The sidebar, header and the area a screen fills are the shell's. The theme and the language reach a screen as shared properties on its bridge (`FRONTX_SHARED_PROPERTY_THEME`, `FRONTX_SHARED_PROPERTY_LANGUAGE`).
- **The host stylesheets.** `ThemeAwareReactLifecycle` adopts them into the shadow root and paints `:host` from `var(--foreground)` and `var(--background)`.

## Each screen keeps

The package's `src/lifecycle.tsx` exports a subclass of `InboxScreenLifecycle` (`shared/inbox/lifecycle/InboxScreenLifecycle.tsx`) passing its app, catalogues and route tree. The base class puts the kit's tokens on the shadow host once per shadow root (`anchorKitThemeOnShadowHost`, a style node marked `data-inbox-kit-theme`) and renders the screen inside `InboxScreenFrame` (`shared/inbox/lifecycle/InboxScreenFrame.tsx`), which keeps:

- **`data-theme`** on the frame, from the shell's theme through `kitThemeScopeFor` (`kitThemeScope.ts`). Without it kit tokens inherit the shell's `:host` colours or the system scheme. A dark host theme the shell adds must join `DARK_HOST_THEMES` there.
- **`dir`** on the frame and on the shadow host, from the language (`useHostDirection.ts`). Package CSS uses logical properties only (`inset-inline-end`, `margin-inline-start`, `border-inline-end`, `text-align: end`).
- **The portal container**, the frame's first child (`data-inbox-portal`), handed out by `usePortalContainer()` from `screenContext.ts`. Every popup (sheet, dialog, select, menu, combobox) passes it as `container`, so it renders inside the shadow root, styled and focus-trapped.
- **`document.title`**, set on mount to `document_title` from the shared catalogue (`{section} - Workspace`) with the screen's `nav_label`. The shell never sets it.
- **Heading focus.** Every screen renders exactly one `h1` through `ScreenHeading` (`shared/inbox/ui/ScreenHeading.tsx`). A mount after a navigation (a menu click, another screen before it) asks that heading to take focus; the first screen of a page load moves nothing. Inside a screen, the root route component calls `useRouteFocus(pageKey)` so a change of page (directory to a person and back) moves focus too.
- **The error boundary.** `ScreenErrorBoundary` wraps the route tree, keyed on the path inside the screen: a render failure shows a kit `Alert` with "try again" and reload while the shell and its menu keep working, and leaving the broken page clears it. A failed query is not an error for it; the screen shows `LoadErrorPane`.
- **The router.** `EngineProvider` from `@gears-frontx/routing-tanstack` over the page history, composed into the entry the shell addressed for the screen, so the screen's own paths live in the `route=` parameter of its segment (`/?screen=contacts;route=r-42` opens the contacts route `$contactId`). An address the route tree does not match renders the screen's own not-found page, `ScreenNotFound` from `shared/inbox/ui/ScreenRoutes.tsx` as the root route's `notFoundComponent`. The routing packages are deduped like the kit (`shared/inbox/build/inboxRemote.config.ts`, and each package's `tsconfig.json` `paths`), so the frame's router and a screen's `useNavigate` are one copy.
- **Translations.** `useInboxTranslate` merges the package's catalogues over `shared/inbox/i18n/en.json` for the shell's language, falling back to `en`; components read `useInboxT()`.

- **The layout width.** The frame root is the `inbox-screen` size container, and `useContainerMeasure` measures it, so the panes follow the room the shell leaves beside its sidebar, never the viewport. The frame renders the routes only after that first read, in the layout effect before the first paint, so a screen never mounts in a layout its width does not have. JavaScript decisions (single pane, the side column as a sheet) read `useScreenLayout()`; stylesheets use `@container inbox-screen (width < Nrem)` rules on the widths in `SCREEN_BREAKPOINTS_REM` (`shared/inbox/ui/screenLayout.ts`), and no pane rule is a width media query.

Layout inside the screen uses the shared pieces in `shared/inbox/ui/` (`SideColumn`, `useSidebarToggle`, `screenLayout.ts`, `shared.module.css`), CSS modules on kit tokens, and components from `@gears-frontx/ui-kit` only.

## Opening another screen

`openScreen(bridge, { screen, route })` in `shared/inbox/navigation/openScreen.ts` replaces the caller's entry in its domain with the target screen and its route and pushes one history entry; the shell mounts the target and Back returns to the caller as it was. Chat's "View contact" is `openScreen(bridge, { screen: INBOX_SCREENS.contacts, route: encodeURIComponent(contactId) })` (`inbox-chat-mfe/src/screen/chat/chatNavigation.ts`): a route segment is encoded by the caller, so an id carrying `/` or `?` stays one segment. It returns `undefined` when the caller has no entry address (not composed into a shell domain), and the caller then does not offer the link. Screens never import each other's code; only `shared/inbox/` is shared.

## Menu order bands

| Screen | Package | Token | Order |
|---|---|---|---|
| Contacts | `inbox-contacts-mfe` | `contacts` | 100 |
| Dashboard | `inbox-dashboard-mfe` | `dashboard` | 200 |
| Chat | `inbox-chat-mfe` | `chat` | 300 |
| Mail | `inbox-mail-mfe` | `mail` | 400 |

The inbox takes the hundreds. A screen added beside them takes a free hundred (500 and up) or a value between two neighbours; packages from other templates may use the same values, and a tie orders by the shell's own rule, which is harmless but worth avoiding in a product menu.

## Adding a screen

Scaffold the package with the MFE template's `add-mfe-package` skill, then make it an inbox screen: a lifecycle subclass of `InboxScreenLifecycle`, the `@inbox-shared` alias and dedupe through `shared/inbox/build/inboxRemote.config.ts` in its `vite.config.ts` and `vitest.config.ts`, its token in `INBOX_SCREENS`, its registrars in `src/init.ts` (see the inbox data contract guideline), and the setup in `src/test-support/setup.ts` calling `registerInboxTestSetup` from `shared/inbox/test-support/setup.ts`. A one-page screen's root route is `SinglePageRoot` and its `notFoundComponent` renders `ScreenNotFound` (`shared/inbox/ui/ScreenRoutes.tsx`); its screen suites stand in for the query layer through `createApiMocks` (`shared/inbox/test-support/apiMocks.ts`) over its own endpoint map, and `src/i18n/catalogue.test.ts` calls `describeScreenCatalogue` (`shared/inbox/test-support/describeScreenCatalogue.ts`).

## Where the shared tests run

`shared/inbox/` has no `package.json`, so its tests run in a package: `inbox-contacts-mfe/src/shared-inbox/`. Two of them read the sibling packages through `import.meta.glob`: `screenLayout.test.tsx` reads every `inbox-*-mfe/src/**/*.module.css` to hold the container rules to the breakpoint table, and `screens.test.ts` reads every `inbox-*-mfe/mfe.json` to hold the manifests to `INBOX_SCREENS`. A project that drops the contacts screen moves that folder into a package it keeps, or the shared folder loses its coverage.
