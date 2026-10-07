import type React from 'react';
import { ThemeAwareReactLifecycle, type ChildMfeBridge, type FrontXApp } from '@gears-frontx/react';
import kitThemeCss from '@gears-frontx/ui-kit/theme.css?inline';
import type { InboxCatalogues } from '../i18n/useInboxTranslate';
import { anchorKitThemeOnShadowHost } from './anchorKitThemeOnShadowHost';
import { InboxScreenFrame, type InboxRouteTree } from './InboxScreenFrame';

/**
 * `@gears-frontx/ui-kit`'s design tokens, scoped to a shadow root.
 *
 * Rewritten once at module load rather than per mount: the source never
 * changes, and every mounted instance appends the same text. The tokens are
 * not loaded into the host document instead, because the host document's
 * token declarations belong to the shell, which may pin another kit version
 * than the inbox packages do.
 */
const kitThemeCssForShadowRoot = anchorKitThemeOnShadowHost(kitThemeCss);

/** Marks the style node that carries the kit's tokens in a shadow root. */
export const KIT_THEME_STYLE_ATTRIBUTE = 'data-inbox-kit-theme';

export type InboxScreenDefinition = {
  /** The package's own catalogues, by language code. */
  catalogues: InboxCatalogues;
  /** The package's route tree. */
  routeTree: InboxRouteTree;
};

/**
 * The lifecycle every inbox screen package exports, one subclass per package
 * (`ContactsLifecycle`, ...), each passing its app, catalogues and routes.
 *
 * The base class adopts the host document's stylesheets into the shadow root
 * and paints `:host` from `var(--foreground)` and `var(--background)`; this
 * class adds the kit's tokens on the same `:host` (the hook the base class
 * documents for exactly that gap) and renders the screen inside
 * `InboxScreenFrame`. Kit component CSS reaches the shadow root with the
 * package's own build: the package bundles the kit and its component CSS is
 * attributed to the package's expose chunk.
 */
export abstract class InboxScreenLifecycle extends ThemeAwareReactLifecycle {
  protected constructor(
    app: FrontXApp,
    private readonly screen: InboxScreenDefinition
  ) {
    super(app);
  }

  /**
   * The shell keeps a screen's shadow root across unmount and mount, and
   * calls this on every mount; the tokens go in once, into the one style node
   * they own, rather than one more copy per visit.
   */
  protected override initializeStyles(container: Element | ShadowRoot): void {
    const existing = container.querySelector(`style[${KIT_THEME_STYLE_ATTRIBUTE}]`);
    if (existing !== null) {
      existing.textContent = kitThemeCssForShadowRoot;
      return;
    }
    const style = document.createElement('style');
    style.setAttribute(KIT_THEME_STYLE_ATTRIBUTE, '');
    style.textContent = kitThemeCssForShadowRoot;
    container.appendChild(style);
  }

  protected renderContent(bridge: ChildMfeBridge): React.ReactNode {
    return <InboxScreenFrame bridge={bridge} catalogues={this.screen.catalogues} routeTree={this.screen.routeTree} />;
  }
}
