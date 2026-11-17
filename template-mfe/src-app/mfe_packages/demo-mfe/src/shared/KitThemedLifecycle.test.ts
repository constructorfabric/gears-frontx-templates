import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { FRONTX_SHARED_PROPERTY_THEME } from '@gears-frontx/react';
import type { ChildMfeBridge } from '@gears-frontx/react';
import { KitThemedLifecycle } from './KitThemedLifecycle';

const superMountSpy = vi.fn();

vi.mock('@gears-frontx/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gears-frontx/react')>();
  return {
    ...actual,
    ThemeAwareReactLifecycle: class ThemeAwareReactLifecycle {
      mount(
        container: Element | ShadowRoot,
        bridge: ChildMfeBridge,
        mountContext?: unknown
      ): void {
        superMountSpy(container, bridge, mountContext);
      }

      async unmount(_container: Element | ShadowRoot): Promise<void> {}
    },
  };
});

/** KitThemedLifecycle is abstract; this stands in as its smallest concrete subclass. */
class TestKitThemedLifecycle extends KitThemedLifecycle {
  protected renderContent(): ReactNode {
    return null;
  }
}

type TestApp = ConstructorParameters<typeof TestKitThemedLifecycle>[0];
const testApp = { id: 'kit-lifecycle-test-app' } as unknown as TestApp;

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
      extDomainId: 'demo-domain',
      extensionId: 'kit-lifecycle-instance',
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
    } as unknown as ChildMfeBridge,
    setTheme: (value: unknown) => {
      theme = value;
      for (const listener of themeListeners) {
        listener({ id: FRONTX_SHARED_PROPERTY_THEME, value });
      }
    },
  };
}

describe('KitThemedLifecycle', () => {
  /*
   * Containers this suite mounted, with the instance that mounted them: the
   * subclasses are exported as module singletons, so one instance handles
   * every mount. afterEach unmounts every recorded container, so no theme
   * subscription survives a test.
   */
  const mountedEntries: Array<{
    lifecycle: TestKitThemedLifecycle;
    container: Element | ShadowRoot;
  }> = [];

  beforeEach(() => {
    superMountSpy.mockClear();
  });

  afterEach(async () => {
    for (const { lifecycle, container } of mountedEntries.splice(0)) {
      await lifecycle.unmount(container);
    }
  });

  /*
   * The shadow host carries no data-theme of its own unless the lifecycle puts
   * one there. Left featureless, it matches the kit's rewritten
   * prefers-color-scheme dark block and paints dark on an OS set to dark while
   * the shell is light; the scope below is what ties it to the shell theme.
   */
  it('puts the light kit scope on the shadow host when the bridge starts light', () => {
    const lifecycle = new TestKitThemedLifecycle(testApp);
    const shadowRoot = document.createElement('div').attachShadow({ mode: 'open' });
    const { bridge } = createThemeBridgeFake('light');

    lifecycle.mount(shadowRoot, bridge);
    mountedEntries.push({ lifecycle, container: shadowRoot });

    expect(shadowRoot.host.getAttribute('data-theme')).toBe('light');
    expect(superMountSpy).toHaveBeenCalledWith(shadowRoot, bridge, undefined);
  });

  it('puts the dark kit scope on the shadow host for a dark host theme', () => {
    const lifecycle = new TestKitThemedLifecycle(testApp);
    const shadowRoot = document.createElement('div').attachShadow({ mode: 'open' });
    const { bridge } = createThemeBridgeFake('dark');

    lifecycle.mount(shadowRoot, bridge);
    mountedEntries.push({ lifecycle, container: shadowRoot });

    expect(shadowRoot.host.getAttribute('data-theme')).toBe('dark');
  });

  it('re-stamps the host on theme changes and stops after unmount', async () => {
    const lifecycle = new TestKitThemedLifecycle(testApp);
    const shadowRoot = document.createElement('div').attachShadow({ mode: 'open' });
    const { bridge, setTheme } = createThemeBridgeFake('light');

    lifecycle.mount(shadowRoot, bridge);
    mountedEntries.push({ lifecycle, container: shadowRoot });

    setTheme('dracula');
    expect(shadowRoot.host.getAttribute('data-theme')).toBe('dark');

    await lifecycle.unmount(shadowRoot);

    setTheme('light');
    expect(shadowRoot.host.getAttribute('data-theme')).toBe('dark');
  });

  it('leaves one listener active when the same container mounts twice before unmount', () => {
    const lifecycle = new TestKitThemedLifecycle(testApp);
    const shadowRoot = document.createElement('div').attachShadow({ mode: 'open' });
    const { bridge, setTheme } = createThemeBridgeFake('light');

    lifecycle.mount(shadowRoot, bridge);
    lifecycle.mount(shadowRoot, bridge);
    mountedEntries.push({ lifecycle, container: shadowRoot });

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
  it('updates the latest mounted host only after a second container mounts without an unmount', () => {
    const lifecycle = new TestKitThemedLifecycle(testApp);
    const shadowRootA = document.createElement('div').attachShadow({ mode: 'open' });
    const shadowRootB = document.createElement('div').attachShadow({ mode: 'open' });
    const { bridge, setTheme } = createThemeBridgeFake('light');

    lifecycle.mount(shadowRootA, bridge);
    lifecycle.mount(shadowRootB, bridge);
    mountedEntries.push(
      { lifecycle, container: shadowRootA },
      { lifecycle, container: shadowRootB }
    );

    setTheme('dracula');

    expect(shadowRootB.host.getAttribute('data-theme')).toBe('dark');
    expect(shadowRootA.host.getAttribute('data-theme')).toBe('light');
  });

  it('falls back to the light kit scope while the theme property is missing', () => {
    const lifecycle = new TestKitThemedLifecycle(testApp);
    const shadowRoot = document.createElement('div').attachShadow({ mode: 'open' });
    const { bridge } = createThemeBridgeFake(undefined);

    lifecycle.mount(shadowRoot, bridge);
    mountedEntries.push({ lifecycle, container: shadowRoot });

    expect(shadowRoot.host.getAttribute('data-theme')).toBe('light');
  });

  it('ignores a non-string theme value and keeps the fallback scope', () => {
    const lifecycle = new TestKitThemedLifecycle(testApp);
    const shadowRoot = document.createElement('div').attachShadow({ mode: 'open' });
    const { bridge, setTheme } = createThemeBridgeFake({ mode: 'dark' });

    lifecycle.mount(shadowRoot, bridge);
    mountedEntries.push({ lifecycle, container: shadowRoot });

    expect(shadowRoot.host.getAttribute('data-theme')).toBe('light');

    setTheme({ mode: 'light' });
    expect(shadowRoot.host.getAttribute('data-theme')).toBe('light');

    setTheme('dark');
    expect(shadowRoot.host.getAttribute('data-theme')).toBe('dark');
  });

  it('stamps the kit scope on a plain element container that is not a shadow root', () => {
    const lifecycle = new TestKitThemedLifecycle(testApp);
    const container = document.createElement('div');
    const { bridge } = createThemeBridgeFake('dark');

    lifecycle.mount(container, bridge);
    mountedEntries.push({ lifecycle, container });

    expect(container.getAttribute('data-theme')).toBe('dark');
  });
});
