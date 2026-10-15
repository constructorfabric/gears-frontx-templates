/**
 * Regression test for RM-LIVE1 (issue constructorfabric/gears-frontx#638
 * ledger, row "LIVE1", found by the live browser run): `bootstrapWidgetsRuntime`
 * must register a domain against the real GTS type system only after the
 * schemas its `sharedProperties` reference — real GTS validation throws
 * `Referenced entity ... not found in registry` otherwise, and
 * `registerDomain(widgetsDomain)` is never reached, leaving Widgets Host
 * blank on every cold load.
 *
 * That is the order this file can observe: the application-layer derived
 * schemas (theme, language, extension_screen) before the framework
 * `screenDomain` and before any manifest-declared domain that references
 * them. It cannot observe where the manifest goes. A domain does not
 * reference the manifest, and the real validator does not resolve an
 * entry's `manifest` reference (an `mf_manifest.v1~*` pattern) to a
 * registered manifest, so a domain or entry registered before its manifest,
 * or with none at all, still passes.
 *
 * `lifecycle-widgets-host.test.tsx` never caught this: its `FakeRegistry`'s
 * `typeSystem` is a hand-rolled stub (`register: vi.fn()`) that performs no
 * GTS validation at all. This file uses the REAL `GtsPlugin`, built with
 * `{ isolated: true }`: a plain `new GtsPlugin()` joins the realm-wide store
 * every copy shares, so an earlier registration in the same worker would turn
 * the "referenced entity not found" ordering check into a pass for the wrong
 * reason. The assertion is about the real validator's behaviour on a store
 * that holds only the built-in types, not a fake's.
 *
 * `bootstrapWidgetsRuntime` only ever reads `app.mfeRegistry` — it never
 * touches any other part of the `FrontXApp` it's normally passed inside
 * `mount()` — so a minimal registry double (real `typeSystem`, faked
 * `registerDomain`/`registerExtension` bookkeeping) exercises the exact
 * registration-order contract under test without needing a full
 * real app built with `createFrontX()` / module-federation-loaded `mfes` registry.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GtsPlugin } from '@gears-frontx/gts-plugin';
import {
  FRONTX_ACTION_UNMOUNT_EXT,
  FRONTX_SHARED_PROPERTY_LANGUAGE,
  FRONTX_SHARED_PROPERTY_THEME,
  screenDomain,
} from '@gears-frontx/react';
import type { ExtensionDomain, MfManifest } from '@gears-frontx/react';
import {
  themeSchema,
  languageSchema,
  extensionScreenSchema,
} from '@gears-frontx/frontx-template-shell';
import { bootstrapWidgetsRuntime } from './lifecycle-widgets-host';

const WIDGETS_DOMAIN_ID = 'gts.frontx.mfes.ext.domain.v1~frontx.widgets.area.main.v1';

/** Copied verbatim from this package's own `mfe.json` (`domains[0]`) — the real fixture, not an invented one. */
const WIDGETS_DOMAIN = {
  id: WIDGETS_DOMAIN_ID,
  route: 'widgets',
  sharedProperties: [],
  actions: [
    'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.load_ext.v1~',
    'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.mount_ext.v1~',
    'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.unmount_ext.v1~',
  ],
  extensionsActions: [],
  defaultActionTimeout: 5000,
  lifecycleStages: [
    'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1',
    'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.activated.v1',
    'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.deactivated.v1',
    'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.destroyed.v1',
  ],
  extensionsLifecycleStages: [
    'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1',
    'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.activated.v1',
    'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.deactivated.v1',
    'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.destroyed.v1',
  ],
} as unknown as ExtensionDomain;

/**
 * Shaped to satisfy the real `mf_manifest.v1~` GTS schema (required:
 * id/name/metaData/shared, with metaData itself requiring
 * name/type/buildInfo/remoteEntry/publicPath) — the lean `{id, remoteEntry}`
 * shape in `demo-mfe/mfe.json` is only the pre-generation authoring form;
 * `scripts/generate-mfe-manifests.ts` enriches it to this shape before the
 * runtime ever registers it, and the schema validates the enriched shape.
 */
const MANIFEST: MfManifest = {
  id: 'gts.frontx.mfes.mfe.mf_manifest.v1~frontx.demo.mfe.manifest.v1',
  name: 'demo-mfe',
  metaData: {
    name: 'demo-mfe',
    type: 'module',
    buildInfo: { buildVersion: '0.0.0-test', buildName: 'demo-mfe' },
    remoteEntry: { name: 'demo-mfe', path: '/assets/remoteEntry.js', type: 'module' },
    publicPath: 'http://localhost:3001/assets/',
  },
  shared: [],
} as unknown as MfManifest;

/**
 * A minimal registry double whose `typeSystem` is a REAL, freshly-constructed
 * `GtsPlugin` with a private store — every `register`/`registerSchema` call
 * below runs the real validator.
 * `registerDomain`/`registerExtension`/`getDomain`/`getExtension` are faked
 * bookkeeping only: `bootstrapWidgetsRuntime` never inspects their internals,
 * only whether a domain/extension is already present.
 */
function buildRealTypeSystemRegistry() {
  const typeSystem = new GtsPlugin({ isolated: true });
  const domains = new Map<string, ExtensionDomain>();
  const extensions = new Map<string, unknown>();
  return {
    typeSystem,
    getDomain: (id: string) => domains.get(id),
    getExtension: (id: string) => extensions.get(id),
    registerDomain: (domain: ExtensionDomain, factory: { build: (ctx: unknown) => unknown }) => {
      domains.set(domain.id, domain);
      factory.build({
        mounter: {},
        lifecycleTrigger: { fire: () => {} },
        registerHandler: () => {},
      });
    },
    registerExtension: async (extension: { id: string }) => {
      extensions.set(extension.id, extension);
    },
  };
}

/** Serves `domains` as the one fetched manifest's domain declarations. */
function stubManifestFetch(domains: readonly ExtensionDomain[]): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { manifest: MANIFEST, domains, entries: [], extensions: [], schemas: [] },
      ],
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('bootstrapWidgetsRuntime — GTS registration order (RM-LIVE1)', () => {
  it('registers the derived schemas before the screen domain that references them', async () => {
    const registry = buildRealTypeSystemRegistry();
    stubManifestFetch([WIDGETS_DOMAIN]);
    // `bootstrapWidgetsRuntime` only reads `app.mfeRegistry` — see this
    // file's doc comment above for why this double is sufficient.
    const app = { mfeRegistry: registry } as unknown as Parameters<typeof bootstrapWidgetsRuntime>[0];

    await expect(bootstrapWidgetsRuntime(app)).resolves.toBe(WIDGETS_DOMAIN);
  });

  it('registers the derived schemas before a manifest-declared domain that references them', async () => {
    const registry = buildRealTypeSystemRegistry();
    // The widgets domain as `mfe.json` declares it references no schema, so
    // this variant gives it the theme and language properties a manifest
    // domain may declare. Registered ahead of the derived schemas, it would
    // be refused with "Referenced entity ... not found".
    const referencingDomain = {
      ...WIDGETS_DOMAIN,
      sharedProperties: [FRONTX_SHARED_PROPERTY_THEME, FRONTX_SHARED_PROPERTY_LANGUAGE],
    } as unknown as ExtensionDomain;
    stubManifestFetch([referencingDomain]);
    const app = { mfeRegistry: registry } as unknown as Parameters<typeof bootstrapWidgetsRuntime>[0];

    await expect(bootstrapWidgetsRuntime(app)).resolves.toBe(referencingDomain);
  });

  it('registers the framework screen domain on a store that does not hold it yet (standalone mount)', async () => {
    const registry = buildRealTypeSystemRegistry();
    stubManifestFetch([WIDGETS_DOMAIN]);
    const app = { mfeRegistry: registry } as unknown as Parameters<typeof bootstrapWidgetsRuntime>[0];
    expect(registry.typeSystem.validateInstance(screenDomain.id).valid).toBe(false);

    await bootstrapWidgetsRuntime(app);

    expect(registry.typeSystem.validateInstance(screenDomain.id).valid).toBe(true);
  });

  it('leaves a screen domain the shell already registered as it is', async () => {
    const registry = buildRealTypeSystemRegistry();
    // The shell runs first: its derived schemas, then its own screen domain
    // declaration, the framework one plus extra actions (its chrome actions
    // in the real shell; any extra action tells the two records apart here).
    registry.typeSystem.registerSchema(themeSchema);
    registry.typeSystem.registerSchema(languageSchema);
    registry.typeSystem.registerSchema(extensionScreenSchema);
    registry.typeSystem.register({
      ...screenDomain,
      actions: [...screenDomain.actions, FRONTX_ACTION_UNMOUNT_EXT],
    });
    const register = vi.spyOn(registry.typeSystem, 'register');
    stubManifestFetch([WIDGETS_DOMAIN]);
    const app = { mfeRegistry: registry } as unknown as Parameters<typeof bootstrapWidgetsRuntime>[0];

    await bootstrapWidgetsRuntime(app);

    expect(register).not.toHaveBeenCalledWith(expect.objectContaining({ id: screenDomain.id }));
    expect(registry.typeSystem.getSchema(screenDomain.id)?.actions).toContain(FRONTX_ACTION_UNMOUNT_EXT);
  });
});
