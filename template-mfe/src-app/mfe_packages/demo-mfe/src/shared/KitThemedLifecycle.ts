/**
 * Lifecycle base for demo-mfe screens built from `@gears-frontx/ui-kit`.
 *
 * Three of this package's five entries render kit components and therefore
 * need the kit's design tokens inside their own shadow root; they extend this
 * class instead of `ThemeAwareReactLifecycle` directly. The other two,
 * `lifecycle-theme` and `lifecycle-widgets-host`, deliberately do not: their
 * CSS Modules paint from the shell's tokens alone, they render no kit
 * components, and so they need no kit CSS inside their shadow root.
 *
 * Mounting also puts the shell's kit scope on the shadow host, so the host
 * follows the shell theme and not the OS colour scheme; the screens keep
 * scoping their own roots through their own data-theme on top of that.
 */

import type { ChildMfeBridge, MfeMountContext } from '@gears-frontx/react';
import { FRONTX_SHARED_PROPERTY_THEME, ThemeAwareReactLifecycle } from '@gears-frontx/react';
import kitThemeCss from '@gears-frontx/ui-kit/theme.css?inline';
import { anchorKitThemeOnShadowHost } from './anchorKitThemeOnShadowHost';
import { kitThemeScopeFor } from './kitThemeScope';
import { DEFAULT_THEME_ID, readBridgeProperty } from './readBridgeProperty';

/**
 * `@gears-frontx/ui-kit`'s design tokens, scoped to a shadow root.
 *
 * Rewritten once at module load rather than per mount: the source never
 * changes, and every mounted instance appends the same text.
 *
 * The alternative — loading `theme.css` into the host document instead — is
 * rejected on purpose: the host document's token declarations belong to the
 * shell (which imports the kit's CSS at its own entry), and this MFE cannot
 * assume which shell build hosts it. Anchoring the kit's tokens on the
 * shadow host keeps the screens correct in any host.
 */
const kitThemeCssForShadowRoot = anchorKitThemeOnShadowHost(kitThemeCss);

/**
 * A `ThemeAwareReactLifecycle` whose shadow root carries the kit's tokens.
 */
export abstract class KitThemedLifecycle extends ThemeAwareReactLifecycle {
  /*
   * The base class keeps one React root per instance, so one subscription is
   * kept: every mount cancels the previous one, so a remount (same or another
   * container) never leaks a listener.
   */
  private unsubscribeFromTheme: (() => void) | null = null;

  /**
   * The host itself carries the shell's kit scope, so it follows the shell
   * theme and not the OS colour scheme: the kit's dark block is rewritten onto
   * `:host` (anchorKitThemeOnShadowHost), and a featureless host matches its
   * `prefers-color-scheme` fallback, which is how an OS set to dark painted
   * the host dark inside a light shell. Reading the current theme and
   * subscribing here mirrors the screens, and unmount cancels the subscription.
   */
  override mount(
    container: Element | ShadowRoot,
    bridge: ChildMfeBridge,
    mountContext?: MfeMountContext
  ): void {
    // Every mount cancels the previous subscription first, so a stale listener
    // cannot keep stamping a host the new subscription owns.
    this.unsubscribeFromTheme?.();
    this.unsubscribeFromTheme = null;

    super.mount(container, bridge, mountContext);

    const host = container instanceof ShadowRoot ? container.host : container;
    host.setAttribute(
      'data-theme',
      kitThemeScopeFor(readBridgeProperty(bridge, FRONTX_SHARED_PROPERTY_THEME, DEFAULT_THEME_ID))
    );
    this.unsubscribeFromTheme = bridge.subscribeToProperty(
      FRONTX_SHARED_PROPERTY_THEME,
      (property) => {
        if (typeof property.value === 'string') {
          host.setAttribute('data-theme', kitThemeScopeFor(property.value));
        }
      }
    );
  }

  /**
   * Cancels the theme subscription before the base teardown. The attribute is
   * left in place on purpose: the host belongs to the shell's domain slot,
   * where the last scope is harmless.
   */
  override async unmount(container: Element | ShadowRoot): Promise<void> {
    this.unsubscribeFromTheme?.();
    this.unsubscribeFromTheme = null;
    return super.unmount(container);
  }

  /**
   * The base class adopts the host document's stylesheets into the shadow root;
   * the kit's tokens are not among them, and this is the hook the base class
   * documents for exactly that gap.
   *
   * These tokens compose with the base resets the same base class injects:
   * `injectBaseResets` paints `:host` with `var(--foreground)` and
   * `var(--background)` (full CSS colours since the shell's token migration),
   * and the kit declares those same names as complete colours on the same
   * `:host`, so the host paints in the kit's palette for the active theme.
   * Every kit-themed screen here still paints its own root through its
   * `.screen` rule; a screen that leaves part of the host uncovered has to
   * paint the host itself.
   */
  protected override initializeStyles(container: Element | ShadowRoot): void {
    const style = document.createElement('style');
    style.textContent = kitThemeCssForShadowRoot;
    container.appendChild(style);
  }
}
