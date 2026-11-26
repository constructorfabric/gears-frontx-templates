/**
 * The screen host carries the theme host attribute, end to end through the
 * real runtime: the same harness the deep link test and the default screen
 * test use (the framework's `microfrontends()` plugin, the real
 * `bootstrapMFE`, the screen domain the container implements). Only the
 * loading of a remote is stubbed, answering an inline lifecycle instead of
 * fetching a Module Federation bundle.
 *
 * The theme registry's managed rule names the attribute its second selector,
 * because inside a mounted screen the kit's sheet is re-anchored to `:host`
 * and that declaration beats one inherited from the document tree; the rule
 * can only reach the screen through the element the screen domain's container
 * hooks hand to it. That marking is what this file pins.
 *
 * One case per file, like `defaultScreenDeepLink.test.tsx`: `bootstrapOnce`
 * bootstraps one app per module instance, so a file simulates one page load.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import type { ChildMfeBridge, MfeEntryLifecycle, MfeEntryMF } from '@gears-frontx/react/mfe';

const SCREEN_DOMAIN = 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.screen.v1';
const MANIFEST_ID = 'gts.frontx.mfes.mfe.mf_manifest.v1~frontx.themehost.mfe.manifest.v1';
const THEME = 'gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.theme.v1~';
const LANGUAGE = 'gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.language.v1~';

const entryId = (name: string) =>
  `gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.themehost.mfe.${name}.v1`;
const extensionId = (name: string) =>
  `gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~frontx.themehost.screens.${name}.v1`;

const manifest = {
  id: MANIFEST_ID,
  metaData: {
    publicPath: 'http://localhost:3999/',
  },
  shared: [],
};

const aggregate = [
  {
    manifest,
    entries: [
      {
        id: entryId('overview'),
        requiredProperties: [THEME, LANGUAGE],
        actions: [],
        domainActions: [],
        manifest: manifest.id,
        exposedModule: './overview',
        exposeAssets: { js: { sync: ['assets/screen.js'] }, css: { sync: [], async: [] } },
      },
    ],
    extensions: [
      {
        id: extensionId('overview'),
        domain: SCREEN_DOMAIN,
        entry: entryId('overview'),
        route: '/overview',
        presentation: { label: 'Overview', icon: 'lucide:home', order: 0 },
      },
    ],
  },
];

async function buildApp() {
  const react = await import('@gears-frontx/react');
  const mfe = await import('@gears-frontx/react/mfe');
  const { gtsPlugin } = await import('@gears-frontx/gts-plugin');
  const { themeSchema, languageCodeSchema, languageSchema, screenLabelsSchema, FRONTX_MFE_ENTRY_MF } =
    await import('../../../src/index');
  gtsPlugin.registerSchema(themeSchema);
  gtsPlugin.registerSchema(languageCodeSchema);
  gtsPlugin.registerSchema(languageSchema);
  gtsPlugin.registerSchema(screenLabelsSchema);

  class InlineMfeHandler extends mfe.MfeHandlerMF {
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
      mfe.microfrontends({
        typeSystem: gtsPlugin,
        mfeHandlers: [new InlineMfeHandler(FRONTX_MFE_ENTRY_MF)],
      }),
    )
    .build();
  const registry = app.mfeRegistry;
  if (!registry) throw new Error('the microfrontends plugin built no registry');
  return { react, app, registry };
}

describe('the screen host the container hooks create', () => {
  let registry: Awaited<ReturnType<typeof buildApp>>['registry'] | undefined;

  beforeEach(() => {
    registry = undefined;
    vi.resetModules();
    // URL-aware: the icons file must not be answered with the MFE aggregate,
    // which menuIcons.ts would reject entry-by-entry, sending the test down
    // the icons failure path (silently, under the warn mock below).
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) =>
      Promise.resolve(
        String(input).includes('generated-menu-icons.json')
          ? new Response('[]', { status: 200 })
          : new Response(JSON.stringify(aggregate), { status: 200 }),
      ),
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

  it('carries the theme host attribute the managed theme rule selects', async () => {
    const built = await buildApp();
    registry = built.registry;
    const { FRONTX_THEME_HOST_ATTRIBUTE } = built.react;
    const { MfeScreenContainer } = await import('./MfeScreenContainer');
    const { screenState } = await import('./screenState');

    const { container } = render(
      <built.react.FrontXProvider app={built.app}>
        <MfeScreenContainer />
      </built.react.FrontXProvider>,
    );

    await waitFor(() => expect(screenState.getSnapshot()).toBe(extensionId('overview')));

    // The host element is the div the container hooks create and the shadow
    // root is attached to; the mounted screen below it proves the mount
    // reached the element this file asserts on.
    const host = container.querySelector(`[data-extension-id="${extensionId('overview')}"]`);
    if (!host) throw new Error('the mounted screen left no host element in the slot');
    // The gutter rule `.slot > [data-extension-id]` selects the host with the
    // child combinator, so the padding contract holds only while the host is
    // a DIRECT child of the slot root; jsdom runs no cascade, so this
    // structural fact is what has to pin it.
    expect(host.parentElement).toBe(container.querySelector('[data-domain-id]'));
    expect(host.hasAttribute(FRONTX_THEME_HOST_ATTRIBUTE)).toBe(true);
    expect([...host.shadowRoot?.querySelectorAll('p') ?? []].map((p) => p.textContent)).toEqual([
      'screen ./overview',
    ]);
  });
});
