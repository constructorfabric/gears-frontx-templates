/**
 * Regression test for RM-LIVE2 D2 (issue constructorfabric/gears-frontx#638
 * ledger, row "LIVE2", found by the live browser run): a second entry into
 * Widgets Host within the same page (back/forward, or a fresh in-app Back
 * after leaving) never mounted any widget DOM again — the widget content
 * area stayed permanently blank, with no new mount console line, no matter
 * how long you waited.
 *
 * `lifecycle-widgets-host.test.tsx`'s own `FakeRegistry` cannot reproduce
 * this: its mocked `ExtensionDomainSlot` never calls anything resembling
 * `mounter.detach()` on cleanup at all (no `return () => {...}` in its
 * effect), so the exact real-world defect — `DefaultExtensionMounter.detach()`
 * tearing down each occupant's DOM without ever calling `removeMountedExtension`
 * — has nothing to interact with there (the same class of gap the RM-LIVE1
 * regression test's own doc comment calls out for that fake's stub
 * `typeSystem`). This file instead drives the REAL nested app the way
 * production code does: the REAL `bootstrapWidgetsRuntime` against a REAL
 * `createFrontX().use(microfrontends(...))` app (real `MfeRegistry`, real
 * `DefaultExtensionMounter`, real `ConcurrentMountStrategy`), the REAL
 * `ExtensionDomainSlot` react binding, and the REAL `WidgetsDomainImpl`
 * (`holder.impl`, reached only through `bootstrapWidgetsRuntime`'s exported
 * surface — the class itself is not exported, matching production's own
 * encapsulation) — so the real attach/detach/mounted-set bookkeeping this
 * bug lives in is actually exercised, not stubbed around.
 *
 * Deliberately stops one level below `DemoMfeWidgetsHostLifecycle.mount()`/
 * `unmount()` themselves: driving those needs `WidgetsHostScreen` rendered
 * inside `routedScreen()`'s `EngineProvider` (`@gears-frontx/routing-tanstack`),
 * which in this exact combination (real `microfrontends()` registry + real
 * `ExtensionDomainSlot`, as opposed to every other lifecycle test's `FakeRegistry`
 * + mocked slot) never committed a first render in this vitest/jsdom
 * environment for reasons independent of D2 — confirmed by isolating
 * `bootstrapWidgetsRuntime` (resolves immediately on its own, see
 * `lifecycle-widgets-host.gts-order.test.ts`) and a standalone real
 * `ExtensionDomainSlot` (attaches immediately on its own) as two working
 * halves that do not compose here. `WidgetsDomainImpl.mountThroughChain` and
 * `releaseAll` are the exact two methods `WidgetsHostScreen`'s own
 * `handleAttached` (auto-mount) and `DemoMfeWidgetsHostLifecycle.unmount()`
 * call — driving them directly against the real registry/slot is a faithful
 * proxy for "mount host -> unmount host -> mount host again" without that
 * unrelated render path.
 *
 * The one piece left unreal is `MfeHandlerMF`'s own module-federation network
 * load (fetching a remote's `remoteEntry.js` and evaluating a blob module):
 * infeasible under jsdom without a real dev server, and orthogonal to this
 * bug — D2 lives entirely in the mounter/registry bookkeeping ABOVE that
 * load, never inside it. `TestMfeHandlerMF` below subclasses the REAL
 * `MfeHandlerMF` (same `handledBaseTypeId`, same real `bridgeFactory`, so
 * handler resolution and bridge creation stay real) and overrides only
 * `load()` to resolve immediately to a small lifecycle that stamps a
 * `data-widget-mounted` marker element into its container — the "the
 * widgets are rendered" half of this test's assertion.
 */
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createFrontX,
  effects,
  microfrontends,
  queryCacheShared,
  mock as mockPlugin,
  gtsPlugin,
  ExtensionDomainSlot,
  MfeHandlerMF,
  type ChildMfeBridge,
  type MfeEntryLifecycle,
  type MfeEntryMF,
  type MfManifest,
} from '@gears-frontx/react';
import { bootstrapWidgetsRuntime, type WidgetsRoutingHolder } from './lifecycle-widgets-host';

const FRONTX_MFE_ENTRY_MF = 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~';
const WIDGETS_DOMAIN_ID = 'gts.frontx.mfes.ext.domain.v1~frontx.widgets.area.main.v1';
const ENTRY_ADDRESSES =
  'gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.entry_addresses.v1~';

const ALPHA_ID = 'gts.frontx.mfes.ext.extension.v1~frontx.widgets.fixture_a.widget_alpha.v1';
const BETA_ID = 'gts.frontx.mfes.ext.extension.v1~frontx.widgets.fixture_a.widget_beta.v1';
const GAMMA_ID = 'gts.frontx.mfes.ext.extension.v1~frontx.widgets.fixture_b.widget.v1';
const WIDGET_IDS = [ALPHA_ID, BETA_ID, GAMMA_ID];

/** Every extension id whose test lifecycle's own `mount()` actually ran, in call order — the assertion that matters: the real `ConcurrentMountStrategy.mount()` reaching all the way down to a real per-extension mount, not short-circuited by `WidgetsDomainImpl`'s "already mounted" guard. */
let mountCalls: string[] = [];
/**
 * The exact container/`ShadowRoot` each mount call received, by extension id
 * (overwritten on a remount) — `DefaultMountManager` wraps the container
 * `ConcurrentMountStrategy.mount()` created in a `ShadowRoot` before handing
 * it to the lifecycle (see `MfeEntryLifecycle.mount()`'s own doc comment:
 * "With the default handler (MfeHandlerMF), the container parameter will be
 * a ShadowRoot"), so the marker this test stamps lives behind a shadow
 * boundary `querySelectorAll` from an ancestor of the shadow HOST cannot
 * pierce. Asserting against this captured reference, rather than the outer
 * slot container, is what makes the marker visible to the test at all.
 */
let mountedRoots = new Map<string, Element | ShadowRoot>();

/**
 * Subclasses the REAL `MfeHandlerMF` (real `handledBaseTypeId`, real
 * `bridgeFactory` inherited unmodified via `super()`) and overrides only the
 * module-federation network `load()` — see this file's own doc comment.
 */
class TestMfeHandlerMF extends MfeHandlerMF {
  async load(_entry: MfeEntryMF, extensionId: string): Promise<MfeEntryLifecycle<ChildMfeBridge>> {
    return {
      mount(container: Element | ShadowRoot) {
        mountCalls.push(extensionId);
        mountedRoots.set(extensionId, container);
        const marker = document.createElement('div');
        marker.setAttribute('data-widget-mounted', extensionId);
        container.appendChild(marker);
      },
      unmount(_container: Element | ShadowRoot) {
        // no-op: this test asserts on `mountCalls` and real DOM markers only.
      },
    };
  }
}

function buildManifest(id: string, name: string): MfManifest {
  return {
    id,
    name,
    metaData: {
      name,
      type: 'module',
      buildInfo: { buildVersion: '0.0.0-test', buildName: name },
      remoteEntry: { name, path: `/assets/${name}/remoteEntry.js`, type: 'module' },
      publicPath: `http://localhost:0/${name}/assets/`,
    },
    shared: [],
  } as unknown as MfManifest;
}

const DEMO_MANIFEST = buildManifest(
  'gts.frontx.mfes.mfe.mf_manifest.v1~frontx.demo.mfe.manifest.v1',
  'demo-mfe',
);
const FIXTURE_A_MANIFEST = buildManifest(
  'gts.frontx.mfes.mfe.mf_manifest.v1~frontx.widgets.fixture_a.manifest.v1',
  'widgets-fixture-a',
);
const FIXTURE_B_MANIFEST = buildManifest(
  'gts.frontx.mfes.mfe.mf_manifest.v1~frontx.widgets.fixture_b.manifest.v1',
  'widgets-fixture-b',
);

const EXPOSE_ASSETS = { js: { sync: ['assets/lifecycle.js'], async: [] }, css: { sync: [], async: [] } };

/** Copied verbatim (field-for-field) from `demo-mfe/mfe.json`'s own `domains[0]` — the same real fixture `lifecycle-widgets-host.gts-order.test.ts` uses, for the same reason. */
const WIDGETS_DOMAIN = {
  id: WIDGETS_DOMAIN_ID,
  route: 'widgets',
  sharedProperties: [ENTRY_ADDRESSES],
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
} as unknown as import('@gears-frontx/react').ExtensionDomain;

/** Copied field-for-field from `widgets-fixture-a/mfe.json`, enriched with the `exposeAssets` field `scripts/generate-mfe-manifests.ts` adds before publishing (this file stands in for that generated output, the same way `bootstrapWidgetsRuntime`'s own regression test fixture does). */
const FIXTURE_A_ENTRY = {
  id: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.widgets.fixture_a.entry.v1',
  requiredProperties: [],
  actions: [],
  domainActions: [
    'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.mount_ext.v1~',
    'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.unmount_ext.v1~',
  ],
  manifest: FIXTURE_A_MANIFEST.id,
  exposedModule: './lifecycle',
  exposeAssets: EXPOSE_ASSETS,
} as unknown as MfeEntryMF;

const FIXTURE_B_ENTRY = {
  ...FIXTURE_A_ENTRY,
  id: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.widgets.fixture_b.entry.v1',
  manifest: FIXTURE_B_MANIFEST.id,
} as unknown as MfeEntryMF;

function extension(id: string, entryId: string, route: string) {
  return { id, domain: WIDGETS_DOMAIN_ID, entry: entryId, route };
}

function fakeManifestResponse() {
  return {
    ok: true,
    json: async () => [
      { manifest: DEMO_MANIFEST, domains: [WIDGETS_DOMAIN], entries: [], extensions: [], schemas: [] },
      {
        manifest: FIXTURE_A_MANIFEST,
        domains: [],
        entries: [FIXTURE_A_ENTRY],
        extensions: [
          extension(ALPHA_ID, FIXTURE_A_ENTRY.id, 'widget-alpha'),
          extension(BETA_ID, FIXTURE_A_ENTRY.id, 'widget-beta'),
        ],
        schemas: [],
      },
      {
        manifest: FIXTURE_B_MANIFEST,
        domains: [],
        entries: [FIXTURE_B_ENTRY],
        extensions: [extension(GAMMA_ID, FIXTURE_B_ENTRY.id, 'widget')],
        schemas: [],
      },
    ],
  };
}

/** Renders a fresh, real `ExtensionDomainSlot` bound to `registry` into a fresh container and resolves once its real `mounter.attach(root)` has run — mirrors `WidgetsHostScreen`'s own slot, without the unrelated `EngineProvider`/router tree around it (see this file's doc comment). */
async function attachRealSlot(registry: unknown): Promise<{ root: Root; container: HTMLDivElement }> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await new Promise<void>((resolve) => {
    root.render(
      <ExtensionDomainSlot
        registry={registry as never}
        domainId={WIDGETS_DOMAIN_ID}
        onAttached={() => resolve()}
      />,
    );
  });
  return { root, container };
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('WidgetsDomainImpl — real registry remount (RM-LIVE2 D2)', () => {
  it('mounts real widget DOM again on a second entry, after releaseAll() released the prior occupants (release on unmount)', async () => {
    mountCalls = [];
    mountedRoots = new Map();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeManifestResponse()));

    const app = createFrontX()
      .use(effects())
      .use(microfrontends({ typeSystem: gtsPlugin, mfeHandlers: [new TestMfeHandlerMF(FRONTX_MFE_ENTRY_MF)] }))
      .use(queryCacheShared())
      .use(mockPlugin())
      .build();
    const registry = app.mfeRegistry!;
    const holder: WidgetsRoutingHolder = { routing: undefined, impl: undefined };
    await bootstrapWidgetsRuntime(app, holder);

    // --- First entry into Widgets Host: real slot attaches, auto-mount pass runs ---------
    const first = await attachRealSlot(registry);
    await Promise.allSettled(WIDGET_IDS.map((id) => holder.impl!.mountThroughChain(id, 5000)));

    expect(new Set(mountCalls)).toEqual(new Set(WIDGET_IDS));
    expect(mountCalls).toHaveLength(3);
    for (const id of WIDGET_IDS) {
      expect(mountedRoots.get(id)!.querySelectorAll(`[data-widget-mounted="${id}"]`)).toHaveLength(1);
    }

    // --- Leave Widgets Host: release occupants (the fix), THEN the slot's own real detach ---
    // Mirrors `DemoMfeWidgetsHostLifecycle.unmount()`'s own order exactly:
    // release through the registry's real bookkeeping before the slot's
    // cleanup effect runs its own (registry-bookkeeping-incomplete) mass
    // unmount below.
    await holder.impl!.releaseAll();
    first.root.unmount();

    // --- Second entry into Widgets Host (back/forward within the same page) -------------
    const second = await attachRealSlot(registry);
    await Promise.allSettled(WIDGET_IDS.map((id) => holder.impl!.mountThroughChain(id, 5000)));

    // On d7382ed (no `releaseAll()`), `WidgetsDomainImpl.mount()`'s "already
    // mounted" early-return (fed by `registry.getMountedExtensions()`, never
    // cleared by the real `ExtensionDomainSlot`'s own detach) short-circuits
    // every one of these three mounts: `mountCalls` stays at 3 (not 6) and no
    // marker ever lands in `second.container` — exactly the permanent blank
    // the live run found.
    expect(mountCalls).toHaveLength(6);
    for (const id of WIDGET_IDS) {
      expect(mountedRoots.get(id)!.querySelectorAll(`[data-widget-mounted="${id}"]`)).toHaveLength(1);
    }

    second.root.unmount();
  });
});
