/**
 * The shared harness of the four modal suites (`modalDomain.test.tsx`,
 * `modalDomainDeepLink.test.tsx`, `modalSignIn.test.tsx`,
 * `modalSignInDeepLink.test.tsx`): the manifest and aggregate builders, the
 * inline Module Federation handler and the app it builds, the container
 * render, the detach settle, the auth provider stub, and the teardown that
 * hands the routed routes back. One copy keeps the four files from drifting
 * apart.
 *
 * The dynamic `import()` calls stay inside the helper functions on purpose: a
 * case calls `vi.resetModules()` first, and only an import made after that
 * reset sees the fresh module graph the case means to test.
 */
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { expect, vi } from 'vitest';
import type {
  AuthProvider,
  AuthSession,
  ChildMfeBridge,
  FrontXApp,
  FrontXPlugin,
  MfeEntryLifecycle,
  MfeEntryMF,
} from '@gears-frontx/react';
import { POPUP_DOMAIN, releaseRoutedDomains, SCREEN_DOMAIN } from './releaseRoutedDomains';

// The domain ids live with the release helper, so the modal and default-screen
// suites name the same two domains. Re-exported here because the modal suites
// import them from this harness.
export { POPUP_DOMAIN, SCREEN_DOMAIN };

const THEME = 'gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.theme.v1~';
const LANGUAGE = 'gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.language.v1~';

/** The entry id the demo and modal manifests name, for the prefix and entry name. */
function entryId(name: string, prefix: string): string {
  return `gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.${prefix}.mfe.${name}.v1`;
}

/** The modal extension type the modal container (`modalDomain.ts`) registers. */
const MODAL_TYPE = 'gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.popup.v1~';

/** The modal extension id the demo and modal manifests declare, for the modal name. */
export function extensionId(name: string): string {
  return `${MODAL_TYPE}frontx.modal.modals.${name}.v1`;
}

/** The manifest of one MFE, the way the aggregate endpoint answers it. */
function makeManifest(prefix: string) {
  const name = `${prefix}Mfe`;
  return {
    id: `gts.frontx.mfes.mfe.mf_manifest.v1~frontx.${prefix}.mfe.manifest.v1`,
    name,
    metaData: {
      name,
      type: 'app',
      buildInfo: { buildVersion: '1.0.0', buildName: name },
      remoteEntry: { name: 'remoteEntry.js', path: '', type: 'module' },
      globalName: name,
      publicPath: 'http://localhost:3999/',
    },
    shared: [],
  };
}

/** One cancelable modal at full size, one the user cannot close, at medium. */
const modals = [
  { name: 'terms', label: 'Terms of use', size: 'full', cancelable: true },
  { name: 'locked', label: 'Session locked', size: 'medium', cancelable: false },
] as const;

/** The aggregate the modal suites' cases load: two modal extensions, terms and locked. */
export function makeModalAggregate() {
  const manifest = makeManifest('modal');
  return [
    {
      manifest,
      entries: modals.map(({ name }) => ({
        id: entryId(name, 'modal'),
        requiredProperties: [THEME, LANGUAGE],
        actions: [],
        domainActions: [],
        manifest,
        exposedModule: `./${name}`,
        exposeAssets: { js: { sync: [], async: [] }, css: { sync: [], async: [] } },
      })),
      extensions: modals.map(({ name, label, size, cancelable }) => ({
        id: extensionId(name),
        domain: POPUP_DOMAIN,
        entry: entryId(name, 'modal'),
        route: `/${name}`,
        presentation: { label, size, cancelable },
      })),
    },
  ];
}

/**
 * The aggregate the sign-in suites' cases load: the one modal extension the
 * sign-in flow mounts, declared under the id `app/auth/signIn.ts` names, which
 * the caller passes.
 */
export function makeSignInAggregate(signInExtensionId: string) {
  const manifest = makeManifest('demo');
  return [
    {
      manifest,
      entries: [
        {
          id: entryId('signin', 'demo'),
          requiredProperties: [THEME, LANGUAGE],
          actions: [],
          domainActions: [],
          manifest,
          exposedModule: './signin',
          exposeAssets: { js: { sync: [], async: [] }, css: { sync: [], async: [] } },
        },
      ],
      extensions: [
        {
          id: signInExtensionId,
          domain: POPUP_DOMAIN,
          entry: entryId('signin', 'demo'),
          route: '/sign-in',
          presentation: { label: 'Sign in', size: 'full', cancelable: false },
        },
      ],
    },
  ];
}

/**
 * The auth provider the sign-in cases sign in through: the same shape the dev
 * provider has, kept in a local variable so a case decides the session.
 */
export function stubAuthProvider() {
  const state: { session: AuthSession | null } = { session: null };
  const provider: AuthProvider = {
    async getSession() {
      return state.session;
    },
    async checkAuth() {
      return state.session
        ? { authenticated: true, session: state.session }
        : { authenticated: false };
    },
    async logout() {
      state.session = null;
      return { type: 'none' as const };
    },
    async login() {
      state.session = { kind: 'bearer', token: 'sign-in-e2e' };
      return { type: 'none' as const };
    },
  };
  return { provider, state };
}

/**
 * Builds one app per case, the way `main.tsx` does in development: the
 * application schemas go on the type system first, the auth config rides on
 * the builder rather than the preset (the exported `Presets` type declares
 * `full` without arguments, and `auth()` is the same plugin `full({ auth })`
 * would append), and the microfrontends plugin builds the registry with the
 * real router. The modal and screen domains are the container's to register,
 * so they are not here. `options.failSignInLoad` makes the sign-in entry's
 * load reject, the deterministic mount failure the reload guard's cases drive
 * the chain's fallback with. `options.joinAuth` builds the app with `auth()`
 * alone, joining the provider another app of the realm passed.
 */
/**
 * The auth plugin of the case's app and the app it was built into. The plugin
 * holds the page-wide auth realm, which outlives the module reset between
 * cases, so the teardown releases it: otherwise the next case's provider
 * would replace this one instead of starting a realm of its own.
 */
let heldAuth: { plugin: FrontXPlugin; app: FrontXApp } | undefined;

export async function buildApp(options?: {
  provider?: AuthProvider;
  joinAuth?: boolean;
  failSignInLoad?: () => boolean;
}) {
  const react = await import('@gears-frontx/react');
  const { themeSchema, languageCodeSchema, languageSchema, screenLabelsSchema } = await import(
    '@gears-frontx/frontx-template-shell',
  );
  react.gtsPlugin.registerSchema(themeSchema);
  react.gtsPlugin.registerSchema(languageCodeSchema);
  react.gtsPlugin.registerSchema(languageSchema);
  react.gtsPlugin.registerSchema(screenLabelsSchema);

  /** The real Module Federation handler, except that a load answers a lifecycle that renders the entry's own name. */
  class InlineMfeHandler extends react.MfeHandlerMF {
    override load(entry: MfeEntryMF): Promise<MfeEntryLifecycle<ChildMfeBridge>> {
      if (options?.failSignInLoad?.() && entry.exposedModule === './signin') {
        return Promise.reject(new Error('the sign-in remote failed to load'));
      }
      return Promise.resolve({
        mount: (container: Element | ShadowRoot) => {
          const modal = document.createElement('p');
          modal.textContent = `modal ${entry.exposedModule}`;
          container.appendChild(modal);
        },
        unmount: (container: Element | ShadowRoot) => {
          container.replaceChildren();
        },
      });
    }
  }

  const authPlugin = options?.provider
    ? react.auth({ provider: options.provider })
    : options?.joinAuth
      ? react.auth()
      : undefined;
  const app = react
    .createFrontX()
    .useAll(react.presets.full())
    .use(authPlugin ? [authPlugin] : [])
    .use(
      react.microfrontends({
        typeSystem: react.gtsPlugin,
        mfeHandlers: [new InlineMfeHandler(react.FRONTX_MFE_ENTRY_MF)],
      }),
    )
    .build();
  if (authPlugin) heldAuth = { plugin: authPlugin, app };
  const registry = app.mfeRegistry;
  if (!registry) throw new Error('the microfrontends plugin built no registry');
  return { react, app, registry };
}

/** Renders the container, and waits until its dialog layer is on the page. */
export async function renderContainer(
  react: Awaited<ReturnType<typeof buildApp>>['react'],
  app: Awaited<ReturnType<typeof buildApp>>['app'],
) {
  const { MfeScreenContainer } = await import('../MfeScreenContainer');
  const { container } = render(
    <react.FrontXProvider app={app}>
      <MfeScreenContainer />
    </react.FrontXProvider>,
  );
  await waitFor(() => expect(document.querySelector('[data-modal-layer]')).not.toBeNull());
  return { container };
}

/** The text every mounted modal rendered, read through the shadow roots the host mounts into. */
export function mountedModalText(root: ParentNode): string[] {
  return [...root.querySelectorAll('*')].flatMap((element) =>
    element.shadowRoot ? [...element.shadowRoot.querySelectorAll('p')].map((p) => p.textContent ?? '') : [],
  );
}

/**
 * Lets the slots' detach settle before the routes are handed back: a routed
 * route is released only through its domain's unregistration, and the
 * unregistration that follows a real detach must not race a detach still in
 * flight.
 */
export async function settleDetach(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

/**
 * The teardown the four suites share. Lets the slots' detach settle, hands the
 * popup and screen routes back (the container registers both routed domains,
 * and the routed-route registry is a realm slot the module reset cannot clear,
 * so the next case or file must find both free), unmounts what the case
 * rendered, restores the mocks, and resets the address to a plain page load.
 * `releaseRoutedDomains` releases both routes even when one of them rejects.
 * A release that rejects still fails the case, but the restoration below runs
 * in a `finally`, so the next case does not inherit the failed one's tree,
 * spies or address on top of the teardown error.
 */
export async function teardownModalSuite(
  registry: Awaited<ReturnType<typeof buildApp>>['registry'] | undefined,
): Promise<void> {
  try {
    await settleDetach();
    if (registry) await releaseRoutedDomains(registry);
  } finally {
    cleanup();
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '/');
    heldAuth?.plugin.onDestroy?.(heldAuth.app);
    heldAuth = undefined;
  }
}
