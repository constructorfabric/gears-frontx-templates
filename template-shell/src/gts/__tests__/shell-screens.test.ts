/**
 * The project's say over the screen extension type, checked against a real
 * GTS store: which schema stands under the screen type id, what a derived
 * screen type admits, and what the menu reader gets from it.
 */

import { describe, expect, it } from 'vitest';
import { GtsPlugin, type JSONSchema } from '@gears-frontx/gts-plugin';
import type { Extension } from '@gears-frontx/mfes';
import {
  extensionScreenSchema,
  readFlatScreenMenuItem,
  registerShellScreenSchemas,
  resolveShellScreens,
  type ShellScreensConfig,
} from '../../index';

const SCREEN_TYPE = 'gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~';
const SITE_SCREEN_TYPE = `${SCREEN_TYPE}acme.site.layout.screen.v1~`;

/** A replacement that drops the required flat label for a per-language map. */
const labelsScreenSchema: JSONSchema = {
  $id: `gts://${SCREEN_TYPE}`,
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  allOf: [{ $ref: 'gts://gts.frontx.mfes.ext.extension.v1~' }],
  properties: {
    presentation: {
      type: 'object',
      properties: { labels: { type: 'object', additionalProperties: { type: 'string' } } },
      required: ['labels'],
    },
  },
  required: ['presentation', 'route'],
};

/** A derived type that adds a required menu group to the default presentation. */
const groupedScreenSchema: JSONSchema = {
  $id: `gts://${SITE_SCREEN_TYPE}`,
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  allOf: [{ $ref: `gts://${SCREEN_TYPE}` }],
  properties: {
    presentation: {
      type: 'object',
      properties: { group: { type: 'string' } },
      required: ['group'],
    },
  },
};

/** A private store with the project's screen schemas registered the way `main.tsx` does it. */
function storeFor(config?: ShellScreensConfig): GtsPlugin {
  const plugin = new GtsPlugin({ isolated: true });
  registerShellScreenSchemas(plugin, resolveShellScreens(config));
  return plugin;
}

function screen(typeId: string, name: string, presentation: Record<string, unknown>): Extension {
  return {
    id: `${typeId}acme.site.screens.${name}.v1`,
    domain: 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.screen.v1',
    entry: 'gts.frontx.mfes.mfe.entry.v1~acme.site.entries.main.v1',
    route: `/${name}`,
    presentation,
  } as Extension;
}

describe('shell screens', () => {
  describe('without a project config', () => {
    it('registers only the shell default schema, pins the screen type and reads the flat presentation', () => {
      const screens = resolveShellScreens();

      expect(screens.enabled).toBe(true);
      expect(screens.schemas).toEqual([extensionScreenSchema]);
      expect(screens.extensionsTypeId).toBe(SCREEN_TYPE);
      expect(screens.readMenuItem).toBe(readFlatScreenMenuItem);
    });

    it('refuses a screen without the flat label', () => {
      const plugin = storeFor();

      expect(() => plugin.register(screen(SCREEN_TYPE, 'inbox', { labels: { en: 'Inbox' } }))).toThrow(
        /GTS validation failed/,
      );
    });
  });

  describe('a project schema under the screen type id', () => {
    it('is registered instead of the default, not beside it', () => {
      expect(resolveShellScreens({ schemas: [labelsScreenSchema] }).schemas).toEqual([labelsScreenSchema]);
    });

    it('stands instead of the default, so a screen with only a label map is admitted', () => {
      const plugin = storeFor({ schemas: [labelsScreenSchema] });

      expect(() => plugin.register(screen(SCREEN_TYPE, 'inbox', { labels: { en: 'Inbox' } }))).not.toThrow();
      expect(plugin.getSchema(SCREEN_TYPE)?.properties?.presentation).toEqual(
        labelsScreenSchema.properties?.presentation,
      );
    });

    it('is refused when it drops the required route', () => {
      const withoutRoute = { ...labelsScreenSchema, required: ['presentation'] };

      expect(() => resolveShellScreens({ schemas: [withoutRoute] })).toThrow(/keep 'route'/);
    });
  });

  describe('a project-derived screen type', () => {
    const config: ShellScreensConfig = {
      schemas: [groupedScreenSchema],
      extensionsTypeId: SITE_SCREEN_TYPE,
      readMenuItem: (extension) => {
        const presentation = (extension as { presentation?: { label: string; group: string } }).presentation;
        return presentation && { label: `${presentation.group} / ${presentation.label}` };
      },
    };

    it('admits a screen carrying the added field and hands that field to the menu reader', () => {
      const plugin = storeFor(config);
      const inbox = screen(SITE_SCREEN_TYPE, 'inbox', { label: 'Inbox', group: 'Mail' });

      expect(() => plugin.register(inbox)).not.toThrow();
      expect(resolveShellScreens(config).readMenuItem(inbox)).toEqual({ label: 'Mail / Inbox' });
    });

    it('still holds the base schema under it: a screen without the base label is refused', () => {
      const plugin = storeFor(config);

      expect(() => plugin.register(screen(SITE_SCREEN_TYPE, 'inbox', { group: 'Mail' }))).toThrow(
        /GTS validation failed/,
      );
    });

    it('pins the derived type for the screen domain', () => {
      expect(resolveShellScreens(config).extensionsTypeId).toBe(SITE_SCREEN_TYPE);
    });
  });

  it('refuses a schema that is not a screen type', () => {
    const notAScreen = { ...groupedScreenSchema, $id: 'gts://gts.frontx.mfes.ext.extension.v1~acme.site.widget.v1~' };

    expect(() => resolveShellScreens({ schemas: [notAScreen] })).toThrow(/is not a screen type/);
  });

  it('refuses an extensionsTypeId that none of the configured schemas declares', () => {
    expect(() => resolveShellScreens({ extensionsTypeId: SITE_SCREEN_TYPE })).toThrow(/extensionsTypeId/);
  });

  it('keeps the default schema registered when the screen domain is off', () => {
    const screens = resolveShellScreens({ enabled: false });

    expect(screens.enabled).toBe(false);
    expect(screens.schemas).toEqual([extensionScreenSchema]);
  });

  describe('the flat reader', () => {
    it('reads label, icon and order', () => {
      expect(readFlatScreenMenuItem(screen(SCREEN_TYPE, 'a', { label: 'A', icon: 'lucide:a', order: 3 }))).toEqual({
        label: 'A',
        icon: 'lucide:a',
        order: 3,
      });
    });

    it('leaves out an extension with no string label', () => {
      expect(readFlatScreenMenuItem({ id: 'x', domain: 'd', entry: 'e' } as Extension)).toBeUndefined();
    });
  });
});
