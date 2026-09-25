/**
 * Regression test for RM-LIVE1 (issue constructorfabric/gears-frontx#638
 * ledger, row "LIVE1", found by the live browser run): `bootstrapWidgetsRuntime`
 * registered every manifest-declared domain (including the widgets domain,
 * which declares `sharedProperties: [entry_addresses]`) against the real GTS
 * type system BEFORE `entryAddressesSchema` was registered on that same type
 * system. Real GTS validation then throws `Referenced entity ...
 * entry_addresses ... not found in registry`, so `registerDomain(widgetsDomain)`
 * is never reached and Widgets Host is blank on every cold load.
 *
 * `lifecycle-widgets-host.test.tsx` never caught this: its `FakeRegistry`'s
 * `typeSystem` is a hand-rolled stub (`register: vi.fn()`) that performs no
 * GTS validation at all. This file uses the REAL `GtsPlugin` (a fresh
 * instance, per its own doc comment: "Tests that need multiple isolated
 * instances should construct new GtsPlugin() directly") so the assertion is
 * about the real validator's behaviour, not a fake's.
 *
 * `bootstrapWidgetsRuntime` only ever reads `app.mfeRegistry` — it never
 * touches any other part of the `FrontXApp` it's normally passed inside
 * `mount()` — so a minimal registry double (real `typeSystem`, faked
 * `registerDomain`/`registerExtension` bookkeeping) exercises the exact
 * registration-order contract under test without needing a full
 * `createWidgetsHostApp()` / module-federation-loaded `mfes` registry.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GtsPlugin } from '@gears-frontx/gts-plugin';
import type { ExtensionDomain, MfManifest } from '@gears-frontx/react';
import { bootstrapWidgetsRuntime, type WidgetsRoutingHolder } from './lifecycle-widgets-host';

const WIDGETS_DOMAIN_ID = 'gts.frontx.mfes.ext.domain.v1~frontx.widgets.area.main.v1';

/** Copied verbatim from this package's own `mfe.json` (`domains[0]`) — the real fixture, not an invented one. */
const WIDGETS_DOMAIN = {
  id: WIDGETS_DOMAIN_ID,
  route: 'widgets',
  sharedProperties: ['gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.entry_addresses.v1~'],
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
 * `GtsPlugin` — every `register`/`registerSchema` call below runs the real
 * validator. `registerDomain`/`registerExtension`/`getDomain`/`getExtension`
 * are faked bookkeeping only: `bootstrapWidgetsRuntime` never inspects their
 * internals, only whether a domain/extension is already present.
 */
function buildRealTypeSystemRegistry() {
  const typeSystem = new GtsPlugin();
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('bootstrapWidgetsRuntime — GTS registration order (RM-LIVE1)', () => {
  it('registers the entry_addresses schema before registering a manifest domain whose sharedProperties reference it', async () => {
    const registry = buildRealTypeSystemRegistry();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          { manifest: MANIFEST, domains: [WIDGETS_DOMAIN], entries: [], extensions: [], schemas: [] },
        ],
      }),
    );
    const holder: WidgetsRoutingHolder = { routing: undefined, impl: undefined };
    // `bootstrapWidgetsRuntime` only reads `app.mfeRegistry` — see this
    // file's doc comment above for why this double is sufficient.
    const app = { mfeRegistry: registry } as unknown as Parameters<typeof bootstrapWidgetsRuntime>[0];

    await expect(bootstrapWidgetsRuntime(app, holder)).resolves.toBe(WIDGETS_DOMAIN);
  });
});
