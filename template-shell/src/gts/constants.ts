/**
 * GTS type and instance IDs of the FrontX standard template.
 *
 * These IDs encode the `frontx.mfes.*` / `frontx.screensets.*` derived-schema
 * vocabulary this template chose for its GTS type system. They are template
 * vocabulary, not part of the MFE runtime contract: `@gears-frontx/framework`
 * and `@gears-frontx/react` stay type-system agnostic and never name them. A
 * project that needs another shared property or domain declares its own IDs
 * next to these. The `FRONTX_ACTION_*` lifecycle-action IDs are not here: they
 * are owned by `@gears-frontx/gts-plugin`, which resolves them for the runtime
 * through `TypeSystemPlugin.resolve*ActionId()`.
 *
 * Every value is a plain string, so importing one reaches neither the GTS
 * plugin nor the MFE runtime.
 *
 * @packageDocumentation
 */

// ============================================================================
// Layout Domain Instance IDs
// ============================================================================

/**
 * Popup domain instance ID.
 * Extension domain for popup/modal dialogs.
 */
export const FRONTX_POPUP_DOMAIN = 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.popup.v1';

/**
 * Sidebar domain instance ID.
 * Extension domain for collapsible side panels.
 */
export const FRONTX_SIDEBAR_DOMAIN = 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.sidebar.v1';

/**
 * Screen domain instance ID.
 * Extension domain for main content area screens.
 */
export const FRONTX_SCREEN_DOMAIN = 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.screen.v1';

/**
 * Overlay domain instance ID.
 * Extension domain for full-screen overlays.
 */
export const FRONTX_OVERLAY_DOMAIN = 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.overlay.v1';

// ============================================================================
// Type IDs
// ============================================================================

/**
 * MfeEntryMF schema type ID (Module Federation variant).
 * Derives from MfeEntry and adds Module Federation-specific properties.
 */
export const FRONTX_MFE_ENTRY_MF = 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~';

/**
 * Screen Extension schema type ID (derived extension type for screen domain).
 * Derives from Extension and adds presentation metadata for navigation menu integration.
 */
export const FRONTX_SCREEN_EXTENSION_TYPE = 'gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~';

// ============================================================================
// Shared Property Type IDs
// ============================================================================

/**
 * Theme shared property type ID (GTS schema ID).
 * Shared property type for theme information (light/dark).
 */
export const FRONTX_SHARED_PROPERTY_THEME = 'gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.theme.v1~';

/**
 * Language shared property type ID (GTS schema ID).
 * Shared property type for language/locale information (en/es/etc).
 */
export const FRONTX_SHARED_PROPERTY_LANGUAGE = 'gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.language.v1~';
