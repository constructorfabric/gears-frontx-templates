/**
 * Base Extension Domain Constants Tests
 *
 * Tests for the template's 4 base extension domain declarations: their shared
 * properties, routes, and the lifecycle-action IDs they declare in GTS
 * notation, which must be the ones `@gears-frontx/gts-plugin` resolves.
 */

import { describe, it, expect } from 'vitest';
import { parseGrammar } from '@gears-frontx/routing';
import {
  screenDomain,
  sidebarDomain,
  popupDomain,
  overlayDomain,
  FRONTX_SHARED_PROPERTY_THEME,
  FRONTX_SHARED_PROPERTY_LANGUAGE,
  FRONTX_SCREEN_EXTENSION_TYPE,
  FRONTX_SCREEN_DOMAIN,
  FRONTX_SIDEBAR_DOMAIN,
  FRONTX_POPUP_DOMAIN,
  FRONTX_OVERLAY_DOMAIN,
} from '../../src';
import {
  gtsPlugin,
  FRONTX_ACTION_LOAD_EXT,
  FRONTX_ACTION_MOUNT_EXT,
  FRONTX_ACTION_UNMOUNT_EXT,
} from '@gears-frontx/gts-plugin';

describe('Base Extension Domain Constants - Shared Properties', () => {
  describe('screenDomain sharedProperties', () => {
    it('contains FRONTX_SHARED_PROPERTY_THEME', () => {
      expect(screenDomain.sharedProperties).toContain(FRONTX_SHARED_PROPERTY_THEME);
    });

    it('contains FRONTX_SHARED_PROPERTY_LANGUAGE', () => {
      expect(screenDomain.sharedProperties).toContain(FRONTX_SHARED_PROPERTY_LANGUAGE);
    });
  });

  describe('sidebarDomain sharedProperties', () => {
    it('contains FRONTX_SHARED_PROPERTY_THEME', () => {
      expect(sidebarDomain.sharedProperties).toContain(FRONTX_SHARED_PROPERTY_THEME);
    });

    it('contains FRONTX_SHARED_PROPERTY_LANGUAGE', () => {
      expect(sidebarDomain.sharedProperties).toContain(FRONTX_SHARED_PROPERTY_LANGUAGE);
    });
  });

  describe('popupDomain sharedProperties', () => {
    it('contains FRONTX_SHARED_PROPERTY_THEME', () => {
      expect(popupDomain.sharedProperties).toContain(FRONTX_SHARED_PROPERTY_THEME);
    });

    it('contains FRONTX_SHARED_PROPERTY_LANGUAGE', () => {
      expect(popupDomain.sharedProperties).toContain(FRONTX_SHARED_PROPERTY_LANGUAGE);
    });
  });

  describe('overlayDomain sharedProperties', () => {
    it('contains FRONTX_SHARED_PROPERTY_THEME', () => {
      expect(overlayDomain.sharedProperties).toContain(FRONTX_SHARED_PROPERTY_THEME);
    });

    it('contains FRONTX_SHARED_PROPERTY_LANGUAGE', () => {
      expect(overlayDomain.sharedProperties).toContain(FRONTX_SHARED_PROPERTY_LANGUAGE);
    });
  });

  describe('Verify all domains include shared properties', () => {
    it('all 4 domains have FRONTX_SHARED_PROPERTY_THEME', () => {
      expect(screenDomain.sharedProperties).toContain(FRONTX_SHARED_PROPERTY_THEME);
      expect(sidebarDomain.sharedProperties).toContain(FRONTX_SHARED_PROPERTY_THEME);
      expect(popupDomain.sharedProperties).toContain(FRONTX_SHARED_PROPERTY_THEME);
      expect(overlayDomain.sharedProperties).toContain(FRONTX_SHARED_PROPERTY_THEME);
    });

    it('all 4 domains have FRONTX_SHARED_PROPERTY_LANGUAGE', () => {
      expect(screenDomain.sharedProperties).toContain(FRONTX_SHARED_PROPERTY_LANGUAGE);
      expect(sidebarDomain.sharedProperties).toContain(FRONTX_SHARED_PROPERTY_LANGUAGE);
      expect(popupDomain.sharedProperties).toContain(FRONTX_SHARED_PROPERTY_LANGUAGE);
      expect(overlayDomain.sharedProperties).toContain(FRONTX_SHARED_PROPERTY_LANGUAGE);
    });
  });

  describe('Contract validation with shared properties', () => {
    it('domain provides all required properties when entry requires theme and language', () => {
      // Simulate an entry requiring theme and language
      const requiredProperties = [FRONTX_SHARED_PROPERTY_THEME, FRONTX_SHARED_PROPERTY_LANGUAGE];

      // Verify domain provides all required properties
      const domainProperties = screenDomain.sharedProperties;
      const allPropertiesProvided = requiredProperties.every((prop) =>
        domainProperties.includes(prop)
      );

      expect(allPropertiesProvided).toBe(true);
    });

    it('domain does NOT provide arbitrary properties not in sharedProperties', () => {
      // Simulate an entry requiring a property not in the domain
      const nonexistentProperty = 'gts.frontx.mfes.comm.shared_property.v1~nonexistent.property.v1';
      const requiredProperties = [
        FRONTX_SHARED_PROPERTY_THEME,
        FRONTX_SHARED_PROPERTY_LANGUAGE,
        nonexistentProperty,
      ];

      // Verify domain does NOT provide all required properties
      const domainProperties = screenDomain.sharedProperties;
      const allPropertiesProvided = requiredProperties.every((prop) =>
        domainProperties.includes(prop)
      );

      expect(allPropertiesProvided).toBe(false);
      expect(domainProperties).not.toContain(nonexistentProperty);
    });
  });

  describe('Screen Domain - extensionsTypeId Configuration', () => {
    it('screenDomain has extensionsTypeId set to FRONTX_SCREEN_EXTENSION_TYPE', () => {
      expect(screenDomain.extensionsTypeId).toBe(FRONTX_SCREEN_EXTENSION_TYPE);
      expect(screenDomain.extensionsTypeId).toBe(
        'gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~'
      );
    });

    it('screenDomain actions array contains only load_ext and mount_ext (Exclusive: no unmount_ext, ADR 0009)', () => {
      expect(screenDomain.actions).toEqual([FRONTX_ACTION_LOAD_EXT, FRONTX_ACTION_MOUNT_EXT]);
      expect(screenDomain.actions).toHaveLength(2);
      expect(screenDomain.actions).not.toContain(FRONTX_ACTION_UNMOUNT_EXT);
    });

    it('sidebarDomain does NOT have extensionsTypeId', () => {
      expect(sidebarDomain.extensionsTypeId).toBeUndefined();
    });

    it('popupDomain does NOT have extensionsTypeId', () => {
      expect(popupDomain.extensionsTypeId).toBeUndefined();
    });

    it('overlayDomain does NOT have extensionsTypeId', () => {
      expect(overlayDomain.extensionsTypeId).toBeUndefined();
    });
  });
});

describe('Base Extension Domain Constants - routing', () => {
  it.each([
    ['screen', screenDomain],
    ['sidebar', sidebarDomain],
    ['popup', popupDomain],
    ['overlay', overlayDomain],
  ])('%s declares its own valid route', (route, domain) => {
    expect(domain.route).toBe(route);
    // A valid route is one the URL grammar of `@gears-frontx/routing` reads as a domain key.
    const parsed = parseGrammar(`/?${domain.route!}=probe`);
    expect(parsed.entries.map((entry) => entry.domainKey)).toEqual([route]);
    expect(parsed.foreignSegments).toEqual([]);
    expect(parsed.warnings).toEqual([]);
  });

});

describe('Base Extension Domain Constants - GTS notation', () => {
  it('each declaration carries its domain ID constant', () => {
    expect(screenDomain.id).toBe(FRONTX_SCREEN_DOMAIN);
    expect(sidebarDomain.id).toBe(FRONTX_SIDEBAR_DOMAIN);
    expect(popupDomain.id).toBe(FRONTX_POPUP_DOMAIN);
    expect(overlayDomain.id).toBe(FRONTX_OVERLAY_DOMAIN);
  });

  it('the lifecycle-action IDs written in the instances are the ones the GTS plugin resolves', () => {
    expect(screenDomain.actions).toEqual([gtsPlugin.resolveLoadExtActionId(), gtsPlugin.resolveMountExtActionId()]);
    for (const domain of [sidebarDomain, popupDomain, overlayDomain]) {
      expect(domain.actions).toEqual([
        gtsPlugin.resolveLoadExtActionId(),
        gtsPlugin.resolveMountExtActionId(),
        gtsPlugin.resolveUnmountExtActionId(),
      ]);
    }
  });

  it('the lifecycle-stage IDs written in the instances are the ones the GTS plugin resolves', () => {
    const allStages = [
      gtsPlugin.resolveLifecycleStageInitId(),
      gtsPlugin.resolveLifecycleStageActivatedId(),
      gtsPlugin.resolveLifecycleStageDeactivatedId(),
      gtsPlugin.resolveLifecycleStageDestroyedId(),
    ];
    expect(screenDomain.lifecycleStages).toEqual([gtsPlugin.resolveLifecycleStageInitId()]);
    expect(screenDomain.extensionsLifecycleStages).toEqual(allStages);
    for (const domain of [sidebarDomain, popupDomain, overlayDomain]) {
      expect(domain.lifecycleStages).toEqual(allStages);
      expect(domain.extensionsLifecycleStages).toEqual(allStages);
    }
  });
});
