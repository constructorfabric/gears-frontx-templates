# How a screen lives in a FrontX app

What a design task has to know about where a screen sits, so its layout and
styles fit the shell. This is a map, not the contract: the detail lives in the
guidelines of the shell and MFE templates, installed beside this bundle when
those templates are applied:

- `.frontx/ai/@gears-frontx/frontx-template-shell/guidelines/mfe-package-contract.md`
  (package shape, CSS delivery into shadow roots, page chrome)
- `.frontx/ai/@gears-frontx/frontx-template-shell/guidelines/navigation-composition.md`
  (how the shell builds the menu and mounts screens)
- `.frontx/ai/@gears-frontx/frontx-template-mfe/guidelines/navigation-contribution.md`
  (what an MFE declares to appear in the menu, and its own routes)

When a statement here and one of those files differ, the file wins.

## A screen is part of an MFE package

- An MFE package lives in `src-app/mfe_packages/<name>/` with its own
  `package.json`, `mfe.json` and `vite.config.ts`.
- A new package is copied from the blank scaffold
  `src-app/mfe_packages/_blank-mfe/` by the MFE template's `add-mfe-package`
  skill; do not hand-build one.
- Screens sit in `src/screens/<screen>/` as a component plus its CSS Module
  (`HomeScreen.tsx` and `HomeScreen.module.css` in the scaffold). The
  scaffold's stylesheet is the reference for screen styling: kit tokens only,
  and a comment wherever a literal is unavoidable.
- A screen receives the bridge from its lifecycle and reads the current theme
  and language through it.

## Registration and the menu

- A screen appears in the menu through one entry in its package's
  `mfe.json` `extensions[]`, targeting the shared screen domain, with a
  top-level `route` and a `presentation` block: `label` (required, English
  fallback text), `icon` (optional, `lucide:<name>`), `order` (optional sort
  key across the whole menu, lower first, default last).
- The menu is built from the registry, not hand-written; a click mounts the
  screen into the screen domain.
- A translated menu label comes from a label dictionary declared in
  `mfe.json`, not from the screen.
- Design consequence: the label is short and names the screen's job; the icon
  comes from the kit's icon family (lucide); `order` places the screen among
  the others and is coordinated across packages.

## Routes inside a screen

- An extension with a `route` gets a private sub-route. The MFE renders
  `<ExtensionRouter routeTree={routeTree} />` from
  `@gears-frontx/routing-tanstack` for its own pages (list, detail, edit) and
  calls `navigation()` from the same package outside the rendered tree.
- Anything outside that sub-route, such as which screen the domain shows,
  changes through actions, never through navigation.
- Design consequence: a list-to-detail flow inside one screen is sub-routes
  with a back path, not a second menu entry.

## What the shell chrome owns

- Header, menu and the scroll container belong to the shell. A screen draws
  none of them.
- One `h1` per page, and the screen owns it: the shell keeps a visually
  hidden `h1` only while the screen renders none. A screen renders exactly one
  visible page heading.
- Below 768 px the menu starts collapsed to a 56 px icon rail; an expanded
  menu lies over the screen behind a backdrop. The screen lays itself out for
  the width left beside the rail.
- The shell scrolls the screen in a container of its own, not the document.
  Wide content scrolls inside its own region (LAY-002).

## How styles reach the shadow root

- MFE screens render inside open shadow roots, which do not see the host
  document's stylesheets on their own.
- The kit declares its tokens on `:root`, which matches nothing in a shadow
  tree. The scaffold's lifecycle re-anchors the kit theme onto the shadow host
  (`src/shared/anchorKitThemeOnShadowHost.ts`) and maps the host theme to the
  kit's light or dark scope (`src/shared/kitThemeScope.ts`). A new dark host
  theme must be added to that mapping, or its screens paint a light kit
  surface inside dark chrome.
- A CSS Module imported plainly is delivered by the host into the shadow root
  from the package's build manifest. This is the path for screen styles.
- Kit component styles reach the shadow root through the host's stylesheet
  copy at mount. Utility classes from the host are not a styling path for a
  screen: their colour utilities break against the kit's full-colour tokens,
  and a class no rule defines renders as nothing (SYS-004, `dead-spacing-class`
  in `verify-interface`).
- Package CSS never carries a CSS reset of its own; the lifecycle already
  provides the box-model resets a shadow root needs.

## Check

- The screen renders inside the shell with `npm run dev:all`; an MFE has no
  standalone preview.
- Theme switching is verified in a host screen and inside an MFE shadow root:
  they are separate code paths (`create-theme`, Register and verify).
