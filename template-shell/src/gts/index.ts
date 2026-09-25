/**
 * GTS Solution Schemas — FrontX Standard Template
 *
 * Application-specific derived schemas that extend the core GTS type system.
 * These schemas constrain property values to the set of values a standard
 * FrontX application supports (registered themes, supported languages,
 * screen extension type).
 *
 * Relocated from @gears-frontx/framework in Phase 4 (F3 GTS extraction).
 * The framework re-exports these via its own gts/index.ts redirect.
 *
 * @packageDocumentation
 */

import type { JSONSchema } from '@gears-frontx/gts-plugin';
import themeSchemaJson from './schemas/theme.v1.json';
import languageSchemaJson from './schemas/language.v1.json';
import extensionScreenSchemaJson from './schemas/extension_screen.v1.json';
import entryAddressesSchemaJson from './schemas/entry_addresses.v1.json';

export const themeSchema = themeSchemaJson as JSONSchema;
export const languageSchema = languageSchemaJson as JSONSchema;
export const extensionScreenSchema = extensionScreenSchemaJson as JSONSchema;
export const entryAddressesSchema = entryAddressesSchemaJson as JSONSchema;

/**
 * The same value `@gears-frontx/framework` declares in `src/mfe/constants.ts`
 * (`FRONTX_SHARED_PROPERTY_ENTRY_ADDRESSES`). Kept in both because the
 * published framework must not import this private package (#601); a
 * framework test pins the two copies equal.
 */
export const FRONTX_SHARED_PROPERTY_ENTRY_ADDRESSES =
  'gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.entry_addresses.v1~';
