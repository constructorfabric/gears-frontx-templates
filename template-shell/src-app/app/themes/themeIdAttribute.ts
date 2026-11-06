/**
 * The id of the applied theme, stamped on the document element.
 *
 * The theme registry stamps only the appearance (`data-theme`, light or dark),
 * which several themes share, so nothing on the page says which registered
 * theme is applied. This attribute does: tools that look at the page (the
 * design-verify render runner) read it to confirm the theme they asked for
 * took, rather than trusting the storage they wrote themselves.
 */
import type { ThemeRegistry } from '@gears-frontx/react';

/** Attribute on `<html>` holding the registry id of the applied theme. */
export const THEME_ID_ATTRIBUTE = 'data-theme-id';

function stamp(registry: ThemeRegistry): void {
  const current = registry.getCurrent();
  if (current) document.documentElement.setAttribute(THEME_ID_ATTRIBUTE, current.id);
  else document.documentElement.removeAttribute(THEME_ID_ATTRIBUTE);
}

/**
 * Stamps the applied theme's id now and again on every later apply (Studio, a
 * screen's set_theme action, `app.actions.changeTheme`), all of which go
 * through the registry. Call it once, right after the boot theme is applied.
 */
export function stampAppliedThemeId(registry: ThemeRegistry): void {
  stamp(registry);
  registry.subscribe(() => stamp(registry));
}
