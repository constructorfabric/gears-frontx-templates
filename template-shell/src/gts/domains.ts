// @cpt-dod:cpt-frontx-dod-framework-composition-mfe-plugin:p1

/**
 * Base ExtensionDomain declarations of the FrontX standard template.
 *
 * The 4 layout domains a host registers via `registerDomain()` without
 * hand-authoring JSON. Each declaration is the domain's GTS instance under
 * `./instances/domains/`, so its action, shared-property and lifecycle-stage
 * IDs are written once, in GTS notation, in the instance itself; importing a
 * declaration reaches neither the GTS plugin nor the MFE runtime.
 *
 * Relationship to the ID constants:
 * - FRONTX_SCREEN_DOMAIN, FRONTX_SIDEBAR_DOMAIN, etc. (in ./constants) are
 *   domain ID strings used as action targets in executeActionsChain() calls.
 * - screenDomain, sidebarDomain, etc. (here) are full ExtensionDomain objects
 *   whose .id fields are the same domain ID strings.
 * - Consumers use FRONTX_SCREEN_DOMAIN for action targets and screenDomain
 *   for registerDomain().
 *
 * Domain Action Support Matrix:
 * - screen: 2 actions (load_ext, mount_ext) -- NO unmount_ext (Exclusive strategy)
 * - sidebar/popup/overlay: 3 actions (load_ext, mount_ext, unmount_ext) -- toggle semantics
 *
 * Lifecycle stages: the screen domain is a permanent fixture -- always
 * visible, never destroyed during the application lifespan -- so it declares
 * the init stage only; its extensions still go through all 4 stages. Sidebar,
 * popup and overlay can be shown/hidden/destroyed and declare all 4.
 *
 * @packageDocumentation
 */

import type { ExtensionDomain } from '@gears-frontx/mfes';
import screenDomainInstance from './instances/domains/screen.v1.json';
import sidebarDomainInstance from './instances/domains/sidebar.v1.json';
import popupDomainInstance from './instances/domains/popup.v1.json';
import overlayDomainInstance from './instances/domains/overlay.v1.json';

// @cpt-begin:cpt-frontx-dod-framework-composition-mfe-plugin:p1:inst-1
/**
 * Screen domain declaration.
 *
 * Extension domain for main content area screens.
 * Uses the Exclusive strategy: one occupant; a new mount replaces the occupant.
 * Actions: load_ext, mount_ext (NO unmount_ext).
 * Extensions must use the extension_screen.v1~ derived type (adds presentation metadata).
 */
export const screenDomain: ExtensionDomain = screenDomainInstance;

/**
 * Sidebar domain declaration.
 *
 * Extension domain for collapsible side panels.
 * Uses toggle semantics: extensions can be explicitly mounted and unmounted.
 */
export const sidebarDomain: ExtensionDomain = sidebarDomainInstance;

/**
 * Popup domain declaration.
 *
 * Extension domain for popup/modal dialogs.
 * Uses toggle semantics: extensions can be explicitly mounted and unmounted.
 */
export const popupDomain: ExtensionDomain = popupDomainInstance;

/**
 * Overlay domain declaration.
 *
 * Extension domain for full-screen overlays.
 * Uses toggle semantics: extensions can be explicitly mounted and unmounted.
 */
export const overlayDomain: ExtensionDomain = overlayDomainInstance;
// @cpt-end:cpt-frontx-dod-framework-composition-mfe-plugin:p1:inst-1
