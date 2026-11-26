/**
 * Extension ids of the fixture screens the browser specs and the load gates
 * drive, as declared in each fixture's `mfe.json` (`extensions[].id`). A spec
 * addresses a menu item by this id, through the host's stable `data-testid`
 * (`menu-item-<extension id>`), never by the item's display text, which a
 * translation or a copy edit changes.
 */

const SCREEN = 'gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~';

/** `_blank-mfe`: the screen at route `/blank-home`. */
export const BLANK_HOME_EXTENSION_ID = `${SCREEN}frontx.blank.screens.home.v1`;
/** `demo-mfe`: the widgets host screen, a nested host of widget MFEs. */
export const WIDGETS_HOST_EXTENSION_ID = `${SCREEN}frontx.widgets.host.screen.v1`;
/** `demo-mfe`: the hello-world screen. */
export const HELLO_WORLD_EXTENSION_ID = `${SCREEN}frontx.demo.screens.helloworld.v1`;
/** `demo-mfe`: the profile screen. */
export const PROFILE_EXTENSION_ID = `${SCREEN}frontx.demo.screens.profile.v1`;
/** `demo-mfe`: the current-theme screen. */
export const CURRENT_THEME_EXTENSION_ID = `${SCREEN}frontx.demo.screens.theme.v1`;
/** `demo-mfe`: the UI-kit elements screen, which loads lazy element chunks. */
export const UIKIT_ELEMENTS_EXTENSION_ID = `${SCREEN}frontx.demo.screens.uikit.v1`;
/** `lazy-import-fixture`: the screen whose triggers lazily import shared packages by bare specifier. */
export const LAZY_IMPORT_EXTENSION_ID = `${SCREEN}frontx.lazyimport.screens.home.v1`;

/** The test id the host stamps on the menu item that mounts `extensionId`. */
export function menuItemTestId(extensionId) {
  return `menu-item-${extensionId}`;
}
