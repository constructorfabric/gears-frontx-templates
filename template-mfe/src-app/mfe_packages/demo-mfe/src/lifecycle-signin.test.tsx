import { render, screen } from '@testing-library/react';
import type React from 'react';
import type { ChildMfeBridge } from '@gears-frontx/react';
import { createMfeBridgeFixture } from '@frontx-test-utils/createMfeBridgeFixture';
import { mockShadowHost } from '@frontx-test-utils/mockShadowHost';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SIGNIN_MODAL_EXTENSION_ID } from './shared/extension-ids';

/**
 * The sign-in extension's module graph, loaded as one extension load loads
 * it. The framework allows one app build per runtime, so the graph must build
 * exactly one app (its own, joined to the host's auth runtime) and must not
 * pull in `./init`, which builds the other screens' app.
 *
 * The framework double counts builds and runs every plugin's `onRegister`,
 * then every plugin's `onInit` on the built app, as the real `build()` does.
 * The join refuses in `onRegister` when no app passed a provider.
 */
const { builds, initLoaded, join, useScreenTranslationsMock } = vi.hoisted(() => ({
  builds: [] as string[][],
  initLoaded: { value: false },
  join: { error: null as Error | null, login: (() => Promise.resolve({ type: 'none' })) as () => Promise<unknown> },
  useScreenTranslationsMock: (() => ({ t: (key: string) => key, loading: false })) as () => unknown,
}));

type TestPlugin = {
  name: string;
  onRegister?: (builder: unknown) => void;
  onInit?: (app: Record<string, unknown>) => void;
};

vi.mock('@gears-frontx/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gears-frontx/react')>();
  return {
    ...actual,
    createFrontX: () => {
      const plugins: TestPlugin[] = [];
      const builder = {
        use(plugin: TestPlugin) {
          plugins.push(plugin);
          return builder;
        },
        build() {
          builds.push(plugins.map((plugin) => plugin.name));
          plugins.forEach((plugin) => plugin.onRegister?.(builder));
          const app: Record<string, unknown> = {};
          plugins.forEach((plugin) => plugin.onInit?.(app));
          return app;
        },
      };
      return builder;
    },
    effects: () => ({ name: 'effects' }),
    queryCacheShared: () => ({ name: 'queryCacheShared' }),
    mock: () => ({ name: 'mock' }),
    auth: () => ({
      name: 'auth',
      onRegister() {
        if (join.error) throw join.error;
      },
      onInit(app: Record<string, unknown>) {
        app.auth = { login: join.login };
      },
    }),
  };
});

// The other screens' bootstrap, standing in with its one build: if the
// sign-in graph imports it, that build is a second one in this runtime.
vi.mock('./init', async () => {
  initLoaded.value = true;
  const { createFrontX } = await import('@gears-frontx/react');
  return { mfeApp: createFrontX().build() };
});

// The base lifecycle's mount needs a real host; the content is what matters.
vi.mock('./shared/KitThemedLifecycle', () => ({
  KitThemedLifecycle: class KitThemedLifecycle {
    constructor(public readonly app: unknown) {}
  },
}));

vi.mock('./shared/useScreenTranslations', () => ({
  useScreenTranslations: () => useScreenTranslationsMock(),
}));

/** Loads the graph fresh, as a new extension load does, and renders its content. */
async function loadAndRenderSignIn() {
  vi.resetModules();
  const module = await import('./lifecycle-signin');
  const bridgeFixture = createMfeBridgeFixture({
    extDomainId: 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.popup.v1',
    extensionId: SIGNIN_MODAL_EXTENSION_ID,
  });
  const renderContent = Reflect.get(module.default, 'renderContent') as (
    bridge: ChildMfeBridge,
  ) => React.ReactNode;
  mockShadowHost(HTMLDivElement);
  render(<>{renderContent.call(module.default, bridgeFixture.bridge)}</>);
  await screen.findByRole('heading', { level: 1 });
}

describe('lifecycle-signin module graph', () => {
  beforeEach(() => {
    builds.length = 0;
    initLoaded.value = false;
    join.error = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds exactly one app, joined to the session runtime of the page with auth(), and does not load init.ts', async () => {
    await loadAndRenderSignIn();

    expect(initLoaded.value).toBe(false);
    expect(builds).toEqual([['effects', 'queryCacheShared', 'auth']]);
    // The join reached the modal: it renders the form, not the error line.
    expect(screen.getByRole('button', { name: 'submit' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the error line and logs the framework error when the join throws', async () => {
    join.error = new Error(
      '[Gears FrontX] auth() with no provider joins the session of the realm, but no app of the realm has passed one yet.',
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await loadAndRenderSignIn();

    // The build still yields the one app, so the lifecycle has something to
    // mount, and the modal reports the failure instead of rendering nothing.
    expect(builds).toHaveLength(1);
    expect(screen.getByRole('alert').textContent).toBe('unavailable');
    expect(screen.queryByRole('button')).toBeNull();
    // The warning carries the real cause: the framework's own message.
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain(
      'no app of the realm has passed one yet',
    );
    expect(warnSpy.mock.calls[0]?.[1]).toBe(join.error);
  });
});
