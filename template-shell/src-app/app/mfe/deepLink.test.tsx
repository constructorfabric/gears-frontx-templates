/**
 * A deep link mounts the screen it names, end to end through the real
 * runtime: the framework's `microfrontends()` plugin builds the registry with
 * the router of `@gears-frontx/routing`, `bootstrapMFE` registers the screen
 * domain the container implements and the extensions of the manifest
 * aggregate, and `MfeScreenContainer` renders the screen domain's slot, whose
 * attach starts the routed domain. Nothing routing-related is stubbed. Only the loading of a
 * remote is: the handler is the real `MfeHandlerMF` with `load` answering an
 * inline lifecycle instead of fetching a Module Federation bundle.
 *
 * `bootstrapOnce` bootstraps one app per module instance, so the whole
 * sequence runs against one app in one case.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import {
  FrontXProvider,
  createFrontX,
  presets,
  microfrontends,
  gtsPlugin,
  MfeHandlerMF,
  FRONTX_MFE_ENTRY_MF,
  FRONTX_ACTION_MOUNT_EXT,
  type ChildMfeBridge,
  type MfeEntryLifecycle,
  type MfeEntryMF,
} from '@gears-frontx/react';
import { themeSchema, languageSchema } from '@gears-frontx/frontx-template-shell';
import { MfeScreenContainer } from './MfeScreenContainer';
import { screenState } from './screenState';

const SCREEN_DOMAIN = 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.screen.v1';
const MANIFEST_ID = 'gts.frontx.mfes.mfe.mf_manifest.v1~frontx.deeplink.mfe.manifest.v1';
const THEME = 'gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.theme.v1~';
const LANGUAGE = 'gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.language.v1~';

const entryId = (name: string) => `gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.deeplink.mfe.${name}.v1`;
const extensionId = (name: string) =>
  `gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~frontx.deeplink.screens.${name}.v1`;

const manifest = {
  id: MANIFEST_ID,
  name: 'deeplinkMfe',
  metaData: {
    name: 'deeplinkMfe',
    type: 'app',
    buildInfo: { buildVersion: '1.0.0', buildName: 'deeplinkMfe' },
    remoteEntry: { name: 'remoteEntry.js', path: '', type: 'module' },
    globalName: 'deeplinkMfe',
    publicPath: 'http://localhost:3999/',
  },
  shared: [],
};

const screens = ['overview', 'orders'] as const;

const aggregate = [
  {
    manifest,
    entries: screens.map((name) => ({
      id: entryId(name),
      requiredProperties: [THEME, LANGUAGE],
      actions: [],
      domainActions: [],
      manifest,
      exposedModule: `./${name}`,
      exposeAssets: { js: { sync: [], async: [] }, css: { sync: [], async: [] } },
    })),
    extensions: screens.map((name, index) => ({
      id: extensionId(name),
      domain: SCREEN_DOMAIN,
      entry: entryId(name),
      route: `/${name}`,
      presentation: { label: name, icon: 'lucide:home', order: index },
    })),
  },
];

/** The real Module Federation handler, except that a load answers a lifecycle that renders the entry's own name. */
class InlineMfeHandler extends MfeHandlerMF {
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

/** The text every mounted screen rendered, read through the shadow roots the host mounts into. */
function mountedScreenText(root: ParentNode): string[] {
  return [...root.querySelectorAll('*')].flatMap((element) =>
    element.shadowRoot ? [...element.shadowRoot.querySelectorAll('p')].map((p) => p.textContent ?? '') : [],
  );
}

describe('a deep link through the real router', () => {
  beforeEach(() => {
    // The application schemas `main.tsx` registers before it builds the app;
    // the screen extension type is the screen container's to register.
    gtsPlugin.registerSchema(themeSchema);
    gtsPlugin.registerSchema(languageSchema);
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(new Response(JSON.stringify(aggregate))));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '/');
  });

  it('mounts the screen the address names; a later mount adds an entry, and a back step returns to the first screen', async () => {
    window.history.replaceState(null, '', '/?screen=orders');
    const app = createFrontX()
      .useAll(presets.full())
      .use(microfrontends({ typeSystem: gtsPlugin, mfeHandlers: [new InlineMfeHandler(FRONTX_MFE_ENTRY_MF)] }))
      .build();

    const { container } = render(
      <FrontXProvider app={app}>
        <MfeScreenContainer />
      </FrontXProvider>,
    );

    await waitFor(() => expect(screenState.getSnapshot()).toBe(extensionId('orders')));
    await waitFor(() => expect(mountedScreenText(container)).toEqual(['screen ./orders']));
    expect(new URLSearchParams(window.location.search).get('screen')).toBe('orders');

    // A menu click: a mount action, which the router writes as a new entry.
    const registry = app.mfeRegistry;
    if (!registry) throw new Error('the microfrontends plugin built no registry');
    const entries = window.history.length;
    act(() => {
      registry.executeActionsChain({
        action: { type: FRONTX_ACTION_MOUNT_EXT, target: SCREEN_DOMAIN, payload: { subject: extensionId('overview') } },
      });
    });
    await waitFor(() => expect(screenState.getSnapshot()).toBe(extensionId('overview')));
    await waitFor(() => expect(new URLSearchParams(window.location.search).get('screen')).toBe('overview'));
    expect(window.history.length).toBe(entries + 1);
    expect(mountedScreenText(container)).toEqual(['screen ./overview']);

    // Back: the router reads the previous address and mounts what it names.
    act(() => window.history.back());
    await waitFor(() => expect(screenState.getSnapshot()).toBe(extensionId('orders')));
    await waitFor(() => expect(mountedScreenText(container)).toEqual(['screen ./orders']));
    expect(new URLSearchParams(window.location.search).get('screen')).toBe('orders');
  });
});
