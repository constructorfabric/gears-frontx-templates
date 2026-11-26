/**
 * The framework's MFE host plugin wired to the template's GTS vocabulary.
 *
 * `@gears-frontx/framework` is type-system agnostic and tests itself against a
 * stand-in type system; this suite covers what only holds for the template's
 * own composition: `microfrontends()` running on `gtsPlugin` with the
 * template's derived schemas, the core GTS schemas served through the
 * registry, and the template's base domain declarations registering with the
 * mount strategy the shell gives each (screen Exclusive; sidebar, popup and
 * overlay Optional).
 *
 * One app per runtime: the suite builds a single app and registers every
 * domain on its registry.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ExclusiveMountStrategy,
  OptionalMountStrategy,
  type ContainerHooks,
  type DomainContext,
} from '@gears-frontx/mfes';
import { gtsPlugin, type JSONSchema } from '@gears-frontx/gts-plugin';
import { createFrontX, type FrontXApp } from '@gears-frontx/framework';
import { microfrontends, type MfeRegistry } from '@gears-frontx/framework/mfe';
import { TestContainerProvider } from '@gears-frontx/framework/testing';
import {
  extensionScreenSchema,
  languageCodeSchema,
  languageSchema,
  overlayDomain,
  popupDomain,
  screenDomain,
  sidebarDomain,
  themeSchema,
} from '../../src';

const exclusive = () => (ctx: DomainContext, hooks: ContainerHooks) =>
  new ExclusiveMountStrategy(ctx.mounter, hooks);
const optional = () => (ctx: DomainContext, hooks: ContainerHooks) =>
  new OptionalMountStrategy(ctx.mounter, hooks);

const SHARED_PROPERTIES = [
  'gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.theme.v1~',
  'gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.language.v1~',
];
const LOAD_EXT = 'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.load_ext.v1~';
const MOUNT_EXT = 'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.mount_ext.v1~';
const UNMOUNT_EXT = 'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.unmount_ext.v1~';

describe('microfrontends() on the template GTS vocabulary', () => {
  let app: FrontXApp;
  let registry: MfeRegistry;

  beforeAll(() => {
    gtsPlugin.registerSchema(themeSchema);
    gtsPlugin.registerSchema(languageCodeSchema);
    gtsPlugin.registerSchema(languageSchema);
    gtsPlugin.registerSchema(extensionScreenSchema);
    app = createFrontX()
      .use(microfrontends({ typeSystem: gtsPlugin }))
      .build();
    const built = app.mfeRegistry;
    if (!built) throw new Error('expected mfeRegistry on app');
    registry = built;
  });

  afterAll(() => {
    app.destroy();
  });

  it('propagates the GTS plugin instance to the registry', () => {
    expect(registry.typeSystem).toBe(gtsPlugin);
    expect(registry.typeSystem.name).toBe('gts');
    expect(registry.typeSystem.version).toBe('1.0.0');
  });

  it('serves the core GTS schemas through the registry', () => {
    const coreSchemas = [
      'gts.frontx.mfes.mfe.entry.v1~',
      'gts.frontx.mfes.ext.domain.v1~',
      'gts.frontx.mfes.ext.extension.v1~',
      'gts.frontx.mfes.comm.shared_property.v1~',
      'gts.frontx.mfes.comm.action.v1~',
      'gts.frontx.mfes.comm.actions_chain.v1~',
      'gts.frontx.mfes.lifecycle.stage.v1~',
      'gts.frontx.mfes.lifecycle.hook.v1~',
    ];
    for (const schemaId of coreSchemas) {
      const schema = registry.typeSystem.getSchema(schemaId) as JSONSchema | undefined;
      expect(schema, schemaId).toBeDefined();
      expect(schema?.$id).toContain(schemaId);
    }
  });

  it('answers undefined for a schema it does not hold', () => {
    expect(registry.typeSystem.getSchema('gts.nonexistent.schema.v1~')).toBeUndefined();
  });

  it.each([
    ['sidebar', sidebarDomain, optional],
    ['popup', popupDomain, optional],
    ['screen', screenDomain, exclusive],
    ['overlay', overlayDomain, optional],
  ])('registers the %s base domain and exposes it via getDomain', (_name, domain, strategy) => {
    registry.registerDomain(domain, new TestContainerProvider().prepareForDomain(domain, strategy()));

    expect(registry.getDomain(domain.id)?.id).toBe(domain.id);
  });

  it('returns undefined for an unregistered domain', () => {
    expect(registry.getDomain('gts.frontx.mfes.ext.domain.v1~unknown.domain.v1')).toBeUndefined();
  });
});

describe('template base domain declarations', () => {
  it.each([
    ['sidebar', sidebarDomain],
    ['popup', popupDomain],
    ['overlay', overlayDomain],
  ])('declares the Optional %s domain with all three lifecycle actions and four stages', (name, domain) => {
    expect(domain).toMatchObject({
      id: `gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.${name}.v1`,
      sharedProperties: SHARED_PROPERTIES,
      actions: [LOAD_EXT, MOUNT_EXT, UNMOUNT_EXT],
      extensionsActions: [],
      defaultActionTimeout: 30000,
    });
    expect(domain.lifecycleStages).toHaveLength(4);
    expect(domain.extensionsLifecycleStages).toHaveLength(4);
  });

  it('declares the Exclusive screen domain with load_ext and mount_ext only', () => {
    expect(screenDomain).toMatchObject({
      id: 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.screen.v1',
      sharedProperties: SHARED_PROPERTIES,
      actions: [LOAD_EXT, MOUNT_EXT],
      extensionsActions: [],
      defaultActionTimeout: 30000,
    });
    expect(screenDomain.actions).toHaveLength(2);
    expect(screenDomain.lifecycleStages).toHaveLength(1);
    expect(screenDomain.extensionsLifecycleStages).toHaveLength(4);
  });

  it('declares the four lifecycle stages by their GTS IDs', () => {
    expect(sidebarDomain.lifecycleStages).toEqual(
      expect.arrayContaining([
        'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1',
        'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.activated.v1',
        'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.deactivated.v1',
        'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.destroyed.v1',
      ]),
    );
  });
});
