/**
 * A deep link wins over the default screen, end to end through the real
 * runtime: the same harness the deep link test and the default screen test use
 * (the framework's `microfrontends()` plugin, the real `bootstrapMFE`, the
 * screen domain the container implements, the router of
 * `@gears-frontx/routing`). Nothing routing-related is stubbed; only the
 * loading of a remote is, answering an inline lifecycle instead of fetching a
 * Module Federation bundle.
 *
 * The page load carries a screen entry, so the container must open the screen
 * it names and not the menu's first one.
 *
 * One case per file, like `deepLink.test.tsx`: `bootstrapOnce` bootstraps one
 * app per module instance, and the page-load record is a realm slot the module
 * reset cannot clear, so a file simulates one page load.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
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

/** Registration order: alpha, zulu, mid; the menu's first item is zulu's. */
const screens = [
  { name: 'alpha', order: 3 },
  { name: 'zulu', order: 1 },
  { name: 'mid', order: 2 },
] as const;

const aggregate = () => [
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

  class InlineMfeHandler extends react.MfeHandlerMF {
    override load(entry: MfeEntryMF): Promise<MfeEntryLifecycle<ChildMfeBridge>> {
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
  return { react, app, registry };
}

/** The text every mounted screen rendered, read through the shadow roots the host mounts into. */
function mountedScreenText(root: ParentNode): string[] {
  return [...root.querySelectorAll('*')].flatMap((element) =>
    element.shadowRoot ? [...element.shadowRoot.querySelectorAll('p')].map((p) => p.textContent ?? '') : [],
  );
}

describe('the default screen against a deep link', () => {
  let registry: Awaited<ReturnType<typeof buildApp>>['registry'] | undefined;

  beforeEach(() => {
    registry = undefined;
    vi.resetModules();
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(aggregate()))),
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(async () => {
    // Hands the page's routed `screen` route back: the routed-route registry
    // is a realm slot, so it survives the module reset (this file runs one
    // case, and the route must be free for the next file).
    await registry?.unregisterDomain(SCREEN_DOMAIN);
    cleanup();
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '/');
  });

  it('opens the screen the address names instead of the menu\u2019s first one', async () => {
    window.history.replaceState(null, '', '/?screen=mid');
    const built = await buildApp();
    registry = built.registry;
    const { MfeScreenContainer } = await import('./MfeScreenContainer');
    const { screenState } = await import('./screenState');

    const { container } = render(
      <built.react.FrontXProvider app={built.app}>
        <MfeScreenContainer />
      </built.react.FrontXProvider>,
    );

    await waitFor(() => expect(screenState.getSnapshot()).toBe(extensionId('mid')));
    await waitFor(() => expect(mountedScreenText(container)).toEqual(['screen ./mid']));
    await waitFor(() => expect(new URLSearchParams(window.location.search).get('screen')).toBe('mid'));
  });
});
