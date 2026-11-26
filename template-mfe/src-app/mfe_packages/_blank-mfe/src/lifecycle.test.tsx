// The add-mfe-package skill (step 7) lists which cases here go with the example screen and which must keep passing.
import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMfeBridgeFixture } from '../../../__test-utils__/createMfeBridgeFixture';
import { FRONTX_SHARED_PROPERTY_LANGUAGE, FRONTX_SHARED_PROPERTY_THEME } from './shellContract';

type BridgeFixture = ReturnType<typeof createMfeBridgeFixture>;
type TestBridge = BridgeFixture['bridge'];
type TestApp = { id: string };

const superMountSpy = vi.fn();
const {
  getServiceMock,
  useApiQueryMock,
  useScreenTranslationsMock,
} = vi.hoisted(() => ({
  getServiceMock: vi.fn(),
  useApiQueryMock: vi.fn(),
  useScreenTranslationsMock: vi.fn(),
}));

vi.mock('@gears-frontx/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gears-frontx/react')>();
  return {
    ...actual,
    apiRegistry: {
      getService: getServiceMock,
    },
    useApiQuery: useApiQueryMock,
  };
});

vi.mock('@gears-frontx/react/mfe', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gears-frontx/react/mfe')>();
  return {
    ...actual,
    ThemeAwareReactLifecycle: class ThemeAwareReactLifecycle {
      constructor(public readonly app: TestApp) {}

      mount(container: Element | ShadowRoot, bridge: TestBridge, mountContext?: unknown): void {
        superMountSpy(container, bridge, mountContext);
      }

      async unmount(_container: Element | ShadowRoot): Promise<void> {}
    },
  };
});

vi.mock('./init', () => ({
  mfeApp: { id: 'blank-mfe-app' },
}));

vi.mock('./api/_BlankApiService', () => ({
  _BlankApiService: class MockBlankApiService {
    static {
      void 0;
    }
  },
}));

vi.mock('./shared/useScreenTranslations', () => ({
  useScreenTranslations: useScreenTranslationsMock,
}));

/*
 * The lifecycle module pays its whole Vite transform on first import (it pulls
 * the real home screen and the kit). Imported here, at file scope, that cost
 * lands in the import phase, outside the per-test budget, which a cold
 * transform cache otherwise blows on whichever test imports the module first.
 * Every test and the afterEach hook below re-import the same module registry
 * entry, so they get this instance without paying for it again.
 */
await import('./lifecycle');

type ThemeListener = (property: { id: string; value: unknown }) => void;

/*
 * A plain bridge fake for the host-scope theme tests. The shared
 * createMfeBridgeFixture keeps delivering to a listener after its unsubscribe
 * runs, which would make "no updates after unmount" unfalsifiable; this one
 * detaches for real. Only the theme property is modelled, which is all these
 * tests read.
 */
function createThemeBridgeFake(initialTheme: unknown) {
  const themeListeners = new Set<ThemeListener>();
  let theme = initialTheme;
  return {
    bridge: {
      extDomainId: 'blank-domain',
      extensionId: 'blank-instance',
      getProperty: (propertyName: string) =>
        propertyName === FRONTX_SHARED_PROPERTY_THEME && theme !== undefined
          ? { id: propertyName, value: theme }
          : undefined,
      subscribeToProperty: (_propertyName: string, listener: ThemeListener) => {
        themeListeners.add(listener);
        return () => {
          themeListeners.delete(listener);
        };
      },
    } as unknown as TestBridge,
    setTheme: (value: unknown) => {
      theme = value;
      for (const listener of themeListeners) {
        listener({ id: FRONTX_SHARED_PROPERTY_THEME, value });
      }
    },
  };
}

describe('blank-mfe lifecycle', () => {
  /*
   * Containers this suite mounted on the shared singleton lifecycle. The
   * singleton keeps one theme subscription, so afterEach unmounts every
   * recorded container and no subscription survives a test.
   */
  const mountedContainers: Array<Element | ShadowRoot> = [];

  beforeEach(() => {
    getServiceMock.mockReturnValue({ getStatus: { type: 'status' } });
    useScreenTranslationsMock.mockReturnValue({ t: (key: string) => key, loading: false });
    useApiQueryMock.mockReturnValue({
      data: {
        message: 'Blank MFE query example is active.',
        generatedAt: '2026-03-23T12:00:00.000Z',
        capabilities: ['query-key-factory'],
      },
      isLoading: false,
      isError: false,
      error: null,
    });
  });

  afterEach(async () => {
    const module = await import('./lifecycle');
    const lifecycle = module.default as {
      unmount: (container: Element | ShadowRoot) => Promise<void>;
    };
    for (const container of mountedContainers.splice(0)) {
      await lifecycle.unmount(container);
    }
    vi.clearAllMocks();
  });

  it('binds the shared MFE app to the lifecycle instance', async () => {
    const module = await import('./lifecycle');
    const lifecycle = module.default;

    expect(Reflect.get(lifecycle, 'app')).toEqual({ id: 'blank-mfe-app' } satisfies TestApp);
  });

  it('renders the real home screen with the provided bridge', async () => {
    const module = await import('./lifecycle');
    const lifecycle = module.default;
    const renderContent = Reflect.get(lifecycle, 'renderContent');
    const { bridge } = createMfeBridgeFixture({
      extDomainId: 'blank-domain',
      extensionId: 'blank-instance',
      initialProperties: {
        [FRONTX_SHARED_PROPERTY_THEME]: 'blank-theme',
        [FRONTX_SHARED_PROPERTY_LANGUAGE]: 'en',
      },
    });

    expect(typeof renderContent).toBe('function');
    render(<>{renderContent(bridge) as React.ReactNode}</>);

    expect(await screen.findByText('blank-domain')).toBeTruthy();
    expect(screen.getByText('blank-instance')).toBeTruthy();
    expect(screen.getByText('blank-theme')).toBeTruthy();
    expect(
      screen.getByText((content) => content.includes('Blank MFE query example is active.'))
    ).toBeTruthy();
  });

  // `:root` matches no node in a shadow tree, so the kit's tokens only reach its
  // components once every selector position naming it names the host instead.
  it('re-anchors the ui-kit design tokens onto the shadow host it renders into', async () => {
    const module = await import('./lifecycle');
    const initializeStyles = Reflect.get(module.default, 'initializeStyles') as (
      container: ShadowRoot
    ) => void;
    const shadowRoot = document.createElement('div').attachShadow({ mode: 'open' });

    initializeStyles.call(module.default, shadowRoot);

    const injectedCss = shadowRoot.querySelector('style')?.textContent ?? '';
    expect(injectedCss).toContain(':host {');
    // Not "no `:root` starts a line": a survivor mid-line matches nothing in a
    // shadow tree just as silently, so nothing named `:root` may remain at all.
    expect(injectedCss).not.toContain(':root');
  });

  it('inherits base mount behavior from ThemeAwareReactLifecycle', async () => {
    const module = await import('./lifecycle');
    const lifecycle = module.default as {
      mount: (container: Element, bridge: TestBridge) => void;
    };
    const container = document.createElement('div');
    const { bridge } = createMfeBridgeFixture({
      extDomainId: 'blank-domain',
      extensionId: 'blank-instance',
    });

    lifecycle.mount(container, bridge);
    mountedContainers.push(container);

    expect(superMountSpy).toHaveBeenCalledWith(container, bridge, undefined);
  });

  /*
   * The shadow host carries no data-theme of its own unless the lifecycle puts
   * one there. Left featureless, it matches the kit's rewritten
   * prefers-color-scheme dark block and paints dark on an OS set to dark while
   * the shell is light; the scope below is what ties it to the shell theme.
   */
  it('puts the light kit scope on the shadow host when the bridge starts light', async () => {
    const module = await import('./lifecycle');
    const lifecycle = module.default as {
      mount: (container: Element | ShadowRoot, bridge: TestBridge) => void;
    };
    const shadowRoot = document.createElement('div').attachShadow({ mode: 'open' });
    const { bridge } = createThemeBridgeFake('light');

    lifecycle.mount(shadowRoot, bridge);
    mountedContainers.push(shadowRoot);

    expect(shadowRoot.host.getAttribute('data-theme')).toBe('light');
  });

  it('puts the dark kit scope on the shadow host for a dark host theme', async () => {
    const module = await import('./lifecycle');
    const lifecycle = module.default as {
      mount: (container: Element | ShadowRoot, bridge: TestBridge) => void;
    };
    const shadowRoot = document.createElement('div').attachShadow({ mode: 'open' });
    const { bridge } = createThemeBridgeFake('dark');

    lifecycle.mount(shadowRoot, bridge);
    mountedContainers.push(shadowRoot);

    expect(shadowRoot.host.getAttribute('data-theme')).toBe('dark');
  });

  it('re-stamps the host on theme changes and stops after unmount', async () => {
    const module = await import('./lifecycle');
    const lifecycle = module.default as {
      mount: (container: Element | ShadowRoot, bridge: TestBridge) => void;
      unmount: (container: Element | ShadowRoot) => Promise<void>;
    };
    const shadowRoot = document.createElement('div').attachShadow({ mode: 'open' });
    const { bridge, setTheme } = createThemeBridgeFake('light');

    lifecycle.mount(shadowRoot, bridge);
    mountedContainers.push(shadowRoot);

    setTheme('dracula');
    expect(shadowRoot.host.getAttribute('data-theme')).toBe('dark');

    await lifecycle.unmount(shadowRoot);

    setTheme('light');
    expect(shadowRoot.host.getAttribute('data-theme')).toBe('dark');
  });

  it('leaves one listener active when the same container mounts twice before unmount', async () => {
    const module = await import('./lifecycle');
    const lifecycle = module.default as {
      mount: (container: Element | ShadowRoot, bridge: TestBridge) => void;
    };
    const shadowRoot = document.createElement('div').attachShadow({ mode: 'open' });
    const { bridge, setTheme } = createThemeBridgeFake('light');

    lifecycle.mount(shadowRoot, bridge);
    lifecycle.mount(shadowRoot, bridge);
    mountedContainers.push(shadowRoot);

    const setAttributeSpy = vi.spyOn(shadowRoot.host, 'setAttribute');
    setTheme('dracula');
    expect(setAttributeSpy).toHaveBeenCalledTimes(1);
    expect(shadowRoot.host.getAttribute('data-theme')).toBe('dark');
  });

  /*
   * Mounting B while A is still mounted cancels A's subscription, because the
   * base class serves one container per instance: the theme change then
   * reaches only B's host, and A keeps the scope its own mount left.
   */
  it('updates the latest mounted host only after a second container mounts without an unmount', async () => {
    const module = await import('./lifecycle');
    const lifecycle = module.default as {
      mount: (container: Element | ShadowRoot, bridge: TestBridge) => void;
    };
    const shadowRootA = document.createElement('div').attachShadow({ mode: 'open' });
    const shadowRootB = document.createElement('div').attachShadow({ mode: 'open' });
    const { bridge, setTheme } = createThemeBridgeFake('light');

    lifecycle.mount(shadowRootA, bridge);
    lifecycle.mount(shadowRootB, bridge);
    mountedContainers.push(shadowRootA, shadowRootB);

    setTheme('dracula');

    expect(shadowRootB.host.getAttribute('data-theme')).toBe('dark');
    expect(shadowRootA.host.getAttribute('data-theme')).toBe('light');
  });

  it('falls back to the light kit scope while the theme property is missing', async () => {
    const module = await import('./lifecycle');
    const lifecycle = module.default as {
      mount: (container: Element | ShadowRoot, bridge: TestBridge) => void;
    };
    const shadowRoot = document.createElement('div').attachShadow({ mode: 'open' });
    const { bridge } = createThemeBridgeFake(undefined);

    lifecycle.mount(shadowRoot, bridge);
    mountedContainers.push(shadowRoot);

    expect(shadowRoot.host.getAttribute('data-theme')).toBe('light');
  });

  it('ignores a non-string theme value and keeps the fallback scope', async () => {
    const module = await import('./lifecycle');
    const lifecycle = module.default as {
      mount: (container: Element | ShadowRoot, bridge: TestBridge) => void;
    };
    const shadowRoot = document.createElement('div').attachShadow({ mode: 'open' });
    const { bridge, setTheme } = createThemeBridgeFake({ mode: 'dark' });

    lifecycle.mount(shadowRoot, bridge);
    mountedContainers.push(shadowRoot);

    expect(shadowRoot.host.getAttribute('data-theme')).toBe('light');

    setTheme({ mode: 'light' });
    expect(shadowRoot.host.getAttribute('data-theme')).toBe('light');

    setTheme('dark');
    expect(shadowRoot.host.getAttribute('data-theme')).toBe('dark');
  });

  it('stamps the kit scope on a plain element container that is not a shadow root', async () => {
    const module = await import('./lifecycle');
    const lifecycle = module.default as {
      mount: (container: Element | ShadowRoot, bridge: TestBridge) => void;
    };
    const container = document.createElement('div');
    const { bridge } = createThemeBridgeFake('dark');

    lifecycle.mount(container, bridge);
    mountedContainers.push(container);

    expect(container.getAttribute('data-theme')).toBe('dark');
  });
});
