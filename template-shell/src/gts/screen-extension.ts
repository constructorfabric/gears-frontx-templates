/**
 * TypeScript shapes of the template's screen extension type, the
 * `extension_screen` derived schema (`./schemas/extension_screen.v1.json`).
 *
 * Type-only: importing this module reaches no runtime code.
 */

import type { Extension } from '@gears-frontx/mfes';

/**
 * Presentation metadata for extensions.
 * Used by the host to build navigation menus and other UI elements.
 */
export interface ExtensionPresentation {
  /** Human-readable label for the extension */
  label: string;
  /** Optional icon identifier (e.g., "user", "settings") */
  icon?: string;
  /** Optional sort order for menu items (lower numbers first) */
  order?: number;
}

/**
 * Screen Extension (derived from Extension)
 * GTS Type: gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~
 *
 * Extends the base Extension type with a required declared route and the
 * presentation metadata required for screen domain. Screen domain sets
 * extensionsTypeId to reference this derived type, so all screen extensions
 * must declare a route and include presentation metadata.
 */
export interface ScreenExtension extends Extension {
  /** Declared route for screen domain extensions (required) */
  route: string;
  /** Presentation metadata for screen domain extensions (required) */
  presentation: ExtensionPresentation;
}
