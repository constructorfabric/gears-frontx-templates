/**
 * The default screen when the address names no screen, end to end through the
 * real runtime: the same harness the deep link test uses (the framework's
 * `microfrontends()` plugin, the real `bootstrapMFE`, the screen domain the
 * container implements, the router of `@gears-frontx/routing`). Nothing
 * routing-related is stubbed; only the loading of a remote is, answering an
 * inline lifecycle instead of fetching a Module Federation bundle.
 *
 * When the address carries no screen entry, the shell opens the menu's first
 * screen in its place and writes it into the address with the `replace`
 * history intent, so the visit gains no history entry.
 *
 * `bootstrapOnce` bootstraps one app per module instance and the page-load
 * record is a realm slot the module reset cannot clear, so a file simulates
 * one page load: the two cases here both load an address that names no screen,
 * and every case hands the screen domain's `screen` route back at the end,
 * since the routed-route registry is a realm slot too. The deep-link case,
 * whose page load does carry an entry, lives in `defaultScreenDeepLink.test.tsx`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import type { ChildMfeBridge, MfeEntryLifecycle, MfeEntryMF } from '@gears-frontx/react';

const SCREEN_DOMAIN = 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.screen.v1';
const MANIFEST_ID = 'gts.frontx.mfes.mfe.mf_manifest.v1~frontx.defaultscreen.mfe.manifest.v1';
const THEME = 'gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.theme.v1~';
const LANGUAGE = 'gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.language.v1~';

const entryId = (name: string) =>
  `gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.defaultscreen.mfe.${name}.v1`;
const extensionId = (name: string) =>
  `gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~frontx.defaultscreen.screens.${name}.v1`;

const manifest = {
  id: MANIFEST_ID,
  name: 'defaultscreenMfe',
  metaData: {
    name: 'defaultscreenMfe',
    type: 'app',
    buildInfo: { buildVersion: '1.0.0', buildName: 'defaultscreenMfe' },
    remoteEntry: { name: 'remoteEntry.js', path: '', type: 'module' },
    globalName: 'defaultscreenMfe',
    publicPath: 'http://localhost:3999/',
  },
  shared: [],
};

/**
 * Registration order: alpha, zulu, mid. The lowest `presentation.order` is
 * zulu's, which is neither the first registered nor the alphabetically first,
 * so a default screen picked either other way fails the first case.
 */
const screens = [
  { name: 'alpha', order: 3 },
  { name: 'zulu', order: 1 },
  { name: 'mid', order: 2 },
] as const;

const aggregateWithScreens = () => [
  {
    manifest,
    entries: screens.map((screen) => ({
      id: entryId(screen.name),
      requiredProperties: [THEME, LANGUAGE],
      actions: [],
      domainActions: [],
      manifest,
      exposedModule: `./${screen.name}`,
      exposeAssets: { js: { sync: [], async: [] }, css: { sync: [], async: [] } },
    })),
    extensions: screens.map((screen) => ({
      id: extensionId(screen.name),
      domain: SCREEN_DOMAIN,
      entry: entryId(screen.name),
      route: `/${screen.name}`,
      presentation: { label: screen.name, icon: 'lucide:home', order: screen.order },
    })),
  },
];

const aggregateWithoutScreens = () => [
  {
    manifest,
    entries: [
      {
        id: entryId('alpha'),
        requiredProperties: [THEME, LANGUAGE],
        actions: [],
        domainActions: [],
        manifest,
        exposedModule: './alpha',
        exposeAssets: { js: { sync: [], async: [] }, css: { sync: [], async: [] } },
      },
    ],
    extensions: [],
  },
];

// Reassigned by the case that needs an aggregate without screens, before it
// renders anything: the fetch mock below reads it at call time.
let aggregate = aggregateWithScreens();

/**
 * The real Module Federation handler, except that a load answers a lifecycle
 * that renders the entry's own name. Every load is recorded, so a case can
 * assert that no mount reached the handler at all.
 */
async function buildApp() {
  const react = await import('@gears-frontx/react');
  const { themeSchema, languageCodeSchema, languageSchema, screenLabelsSchema } = await import(
    '@gears-frontx/frontx-template-shell'
  );
  // The application schemas `main.tsx` registers before it builds the app;
  // the screen extension type is the screen container's to register.
  react.gtsPlugin.registerSchema(themeSchema);
  react.gtsPlugin.registerSchema(languageCodeSchema);
  react.gtsPlugin.registerSchema(languageSchema);
  react.gtsPlugin.registerSchema(screenLabelsSchema);

  const loadedEntries: string[] = [];
  class InlineMfeHandler extends react.MfeHandlerMF {
    override load(entry: MfeEntryMF): Promise<MfeEntryLifecycle<ChildMfeBridge>> {
      loadedEntries.push(entry.exposedModule);
      return Promise.resolve({
        mount: (container: Element | ShadowRoot) => {
          const screen = document.createElement('p');
          screen.textContent = `screen ${entry.exposedModule}`;
          container.appendChild(screen);
        },
        unmount: (container: Element | ShadowRoot) => {
          container.replaceChildren();
        },
      });
    }
  }

  const app = react
    .createFrontX()
    .useAll(react.presets.full())
    .use(
      react.microfrontends({
        typeSystem: react.gtsPlugin,
        mfeHandlers: [new InlineMfeHandler(react.FRONTX_MFE_ENTRY_MF)],
      }),
    )
    .build();
  const registry = app.mfeRegistry;
  if (!registry) throw new Error('the microfrontends plugin built no registry');
  return { react, app, registry, loadedEntries };
}

/** The text every mounted screen rendered, read through the shadow roots the host mounts into. */
function mountedScreenText(root: ParentNode): string[] {
  return [...root.querySelectorAll('*')].flatMap((element) =>
    element.shadowRoot ? [...element.shadowRoot.querySelectorAll('p')].map((p) => p.textContent ?? '') : [],
  );
}

describe('the default screen when the address names no screen', () => {
  // Set by every case that bootstraps: the routed-route registry is a realm
  // slot (`Symbol.for` on globalThis), so it survives the module reset and the
  // screen domain's `screen` route must be handed back before the next case.
  let releaseScreenRoute: (() => Promise<void>) | undefined;

  beforeEach(() => {
    releaseScreenRoute = undefined;
    // One app per module instance: the framework refuses a second build in a
    // runtime, so every case starts from an empty module registry.
    vi.resetModules();
    aggregate = aggregateWithScreens();
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(aggregate))),
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(async () => {
    await releaseScreenRoute?.();
    cleanup();
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '/');
  });

  it('opens the lowest-order screen and writes it into the address without a new history entry', async () => {
    window.history.replaceState(null, '', '/');
    const { react, app, registry } = await buildApp();
    releaseScreenRoute = () => registry.unregisterDomain(SCREEN_DOMAIN);
    const { MfeScreenContainer } = await import('./MfeScreenContainer');
    const { screenState } = await import('./screenState');
    const historyEntries = window.history.length;

    const { container } = render(
      <react.FrontXProvider app={app}>
        <MfeScreenContainer />
      </react.FrontXProvider>,
    );

    await waitFor(() => expect(screenState.getSnapshot()).toBe(extensionId('zulu')));
    await waitFor(() => expect(mountedScreenText(container)).toEqual(['screen ./zulu']));
    await waitFor(() => expect(new URLSearchParams(window.location.search).get('screen')).toBe('zulu'));
    // The `replace` intent: the visit gained no history entry.
    expect(window.history.length).toBe(historyEntries);
  });

  it('mounts nothing when no screens are registered', async () => {
    aggregate = aggregateWithoutScreens();
    window.history.replaceState(null, '', '/');
    const { react, app, registry, loadedEntries } = await buildApp();
    releaseScreenRoute = () => registry.unregisterDomain(SCREEN_DOMAIN);
    const { MfeScreenContainer } = await import('./MfeScreenContainer');
    const { screenState } = await import('./screenState');

    const { container } = render(
      <react.FrontXProvider app={app}>
        <MfeScreenContainer />
      </react.FrontXProvider>,
    );

    // The slot is up, so the container's default-screen decision has been made
    // in the same effect pass that attached the domain's root.
    await waitFor(() => expect(container.querySelector('[data-domain-id]')).not.toBeNull());
    expect(registry.getExtensionsForDomain(SCREEN_DOMAIN)).toEqual([]);
    await act(async () => {});
    expect(screenState.getSnapshot()).toBeUndefined();
    expect(mountedScreenText(container)).toEqual([]);
    expect(new URLSearchParams(window.location.search).get('screen')).toBeNull();
    expect(loadedEntries).toEqual([]);
  });
});
