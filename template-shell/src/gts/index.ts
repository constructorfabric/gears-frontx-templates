/**
 * GTS vocabulary of the FrontX standard template.
 *
 * Everything GTS this template ships: the application-specific derived
 * schemas that extend the core GTS type system (constraining property values
 * to the set a standard FrontX application supports: registered themes,
 * supported languages, screen extension type), the template's GTS type and
 * instance IDs, and the base layout domain declarations. The framework and
 * React packages are type-system agnostic and name none of it.
 *
 * @packageDocumentation
 */

import type { JSONSchema } from '@gears-frontx/gts-plugin';
import themeSchemaJson from './schemas/theme.v1.json';
import languageSchemaJson from './schemas/language.v1.json';
import languageCodeSchemaJson from './schemas/language_code.v1.json';
import screenLabelsSchemaJson from './schemas/screen_labels.v1.json';
import extensionScreenSchemaJson from './schemas/extension_screen.v1.json';
import extensionModalSchemaJson from './schemas/extension_modal.v1.json';

export const themeSchema = themeSchemaJson as JSONSchema;
export const languageSchema = languageSchemaJson as JSONSchema;
export const languageCodeSchema = languageCodeSchemaJson as JSONSchema;
export const screenLabelsSchema = screenLabelsSchemaJson as JSONSchema;
export const extensionScreenSchema = extensionScreenSchemaJson as JSONSchema;
export const extensionModalSchema = extensionModalSchemaJson as JSONSchema;

export {
  FRONTX_POPUP_DOMAIN,
  FRONTX_SIDEBAR_DOMAIN,
  FRONTX_SCREEN_DOMAIN,
  FRONTX_OVERLAY_DOMAIN,
  FRONTX_MFE_ENTRY_MF,
  FRONTX_SCREEN_EXTENSION_TYPE,
  FRONTX_SHARED_PROPERTY_THEME,
  FRONTX_SHARED_PROPERTY_LANGUAGE,
} from './constants';

export { screenDomain, sidebarDomain, popupDomain, overlayDomain } from './domains';

export type { ScreenExtension, ExtensionPresentation } from './screen-extension';
