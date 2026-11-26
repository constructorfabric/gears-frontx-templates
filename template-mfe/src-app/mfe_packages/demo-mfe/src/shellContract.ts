/**
 * Shell contract ids this MFE uses, declared here.
 *
 * An MFE is an independent unit: it never imports shell code. The values
 * below mirror the shell's ids and schemas, written out so the MFE
 * builds and tests without the shell source.
 */

import type { JSONSchema } from '@gears-frontx/gts-plugin';
import type { ExtensionDomain } from '@gears-frontx/mfes';

/** Screen domain instance id. */
export const FRONTX_SCREEN_DOMAIN = 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.screen.v1';

/** MfeEntryMF schema type id (Module Federation variant). */
export const FRONTX_MFE_ENTRY_MF = 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~';

/** Theme shared property type id. */
export const FRONTX_SHARED_PROPERTY_THEME = 'gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.theme.v1~';

/** Language shared property type id. */
export const FRONTX_SHARED_PROPERTY_LANGUAGE = 'gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.language.v1~';

export const themeSchema = {
  "$id": "gts://gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.theme.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "allOf": [
    {
      "$ref": "gts://gts.frontx.mfes.comm.shared_property.v1~"
    }
  ],
  "properties": {
    "value": {
      "type": "string",
      "minLength": 1
    }
  }
} as JSONSchema;

export const languageCodeSchema = {
  "$id": "gts://gts.frontx.i18n.lang.code.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "string",
  "enum": [
    "en",
    "es",
    "fr",
    "de",
    "it",
    "pt",
    "nl",
    "ru",
    "pl",
    "uk",
    "cs",
    "ar",
    "he",
    "fa",
    "ur",
    "tr",
    "zh",
    "zh-TW",
    "ja",
    "ko",
    "vi",
    "th",
    "id",
    "hi",
    "bn",
    "sv",
    "da",
    "no",
    "fi",
    "el",
    "ro",
    "hu",
    "ms",
    "tl",
    "ta",
    "sw"
  ]
} as JSONSchema;

export const languageSchema = {
  "$id": "gts://gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.language.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "allOf": [
    {
      "$ref": "gts://gts.frontx.mfes.comm.shared_property.v1~"
    }
  ],
  "properties": {
    "value": {
      "$ref": "gts://gts.frontx.i18n.lang.code.v1~"
    }
  }
} as JSONSchema;

export const extensionScreenSchema = {
  "$id": "gts://gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$comment": "Screen Extension Schema (Derived). A derived Extension type for the screen domain that adds presentation metadata for navigation menu integration.",
  "allOf": [
    {
      "$ref": "gts://gts.frontx.mfes.ext.extension.v1~"
    }
  ],
  "properties": {
    "presentation": {
      "type": "object",
      "properties": {
        "label": {
          "type": "string",
          "$comment": "Display label for the extension in host UI (e.g., nav menu item text)"
        },
        "icon": {
          "type": "string",
          "$comment": "Icon identifier for the extension in host UI (e.g., Iconify icon name with prefix)"
        },
        "order": {
          "type": "number",
          "$comment": "Sort order for the extension in host UI lists (lower = higher priority)"
        }
      },
      "required": [
        "label"
      ],
      "$comment": "Presentation metadata for screen domain extensions. Drives nav menu auto-population."
    }
  },
  "required": [
    "presentation",
    "route"
  ]
} as JSONSchema;

/** The shell's screen domain declaration. */
export const screenDomain: ExtensionDomain = {
  "id": "gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.screen.v1",
  "route": "screen",
  "sharedProperties": [
    "gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.theme.v1~",
    "gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.language.v1~"
  ],
  "actions": [
    "gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.load_ext.v1~",
    "gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.mount_ext.v1~"
  ],
  "extensionsActions": [],
  "extensionsTypeId": "gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~",
  "defaultActionTimeout": 30000,
  "lifecycleStages": [
    "gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1"
  ],
  "extensionsLifecycleStages": [
    "gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1",
    "gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.activated.v1",
    "gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.deactivated.v1",
    "gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.destroyed.v1"
  ]
};
