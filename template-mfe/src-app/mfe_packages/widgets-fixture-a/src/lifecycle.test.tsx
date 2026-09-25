import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { resolveNavigationHistory } from '@gears-frontx/routing';
import { FRONTX_SHARED_PROPERTY_ENTRY_ADDRESSES } from '@gears-frontx/frontx-template-shell';

/**
 * `ThemeAwareReactLifecycle` is real, unmocked, production behaviour
 * belonging to `@gears-frontx/react` (Global Constraints — not under test
 * here): its own `mount()` wraps `renderContent()` in `FrontXProvider`,
 * which defers its children until a shared `QueryClient` a real host's
 * `queryCache()` retains becomes reachable — nothing this isolated suite
 * builds. Standing in for it keeps the render path real (a genuine
 * `createRoot().render()` of this module's own `renderContent()` output,
 * routing and all) while removing that dependency, mirroring
 * `lifecycle-widgets-host.test.tsx`'s own `FakeThemeAwareReactLifecycle`.
 */
class FakeThemeAwareReactLifecycle {
  private root: Root | null = null;
  constructor(protected readonly app: unknown) {}
  mount(container: Element | ShadowRoot, bridge: unknown): void {
    this.root = createRoot(container as Element);
    const renderContent = (this as unknown as { renderContent: (b: unknown) => React.ReactNode }).renderContent;
    this.root.render(<>{renderContent.call(this, bridge)}</>);
  }
  unmount(_container: Element | ShadowRoot): void {
    this.root?.unmount();
    this.root = null;
  }
}

vi.mock('@gears-frontx/react', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return { ...real, ThemeAwareReactLifecycle: FakeThemeAwareReactLifecycle };
});

const { default: lifecycle } = await import('./lifecycle');

const ALPHA = 'gts.frontx.mfes.ext.extension.v1~frontx.widgets.fixture_a.widget_alpha.v1';
const PING = 'gts.frontx.mfes.comm.action.v1~frontx.widgets.test.widget_ping.v1~';
const addresses: Record<string, { domainKey: string; extension: string }> = { [ALPHA]: { domainKey: 'screen.widgets-host.widgets', extension: 'widget-alpha' } };

function fakeBridge() {
  const handlers = new Map<string, { handleAction(t: string, p?: unknown): Promise<void> }>();
  return {
    handlers,
    bridge: {
      extensionId: ALPHA, extDomainId: 'd',
      registerActionHandler: (t: string, h: never) => handlers.set(t, h),
      executeActionsChain: vi.fn(), subscribeToProperty: () => () => {},
      getProperty: (id: string) => (id === FRONTX_SHARED_PROPERTY_ENTRY_ADDRESSES ? { id, value: addresses } : undefined),
    } as never,
  };
}

function deepQuery(root: ParentNode, testId: string): Element[] {
  const found: Element[] = [];
  const walk = (node: ParentNode) => node.querySelectorAll('*').forEach((el) => {
    if (el.getAttribute('data-testid') === testId) found.push(el);
    if (el.shadowRoot) walk(el.shadowRoot);
  });
  walk(root);
  return found;
}

/**
 * A detached shadow root (`document.createElement('div').attachShadow(...)`
 * with its host never appended anywhere) leaves the router's initial route
 * match permanently unsettled — connected to the live document is what the
 * engine's own load path needs. Every test host is appended here and
 * removed again in `afterEach`, so containers stay isolated per test.
 */
const mountedHosts: HTMLElement[] = [];

function shadowContainer(): ShadowRoot {
  const host = document.createElement('div');
  document.body.appendChild(host);
  mountedHosts.push(host);
  return host.attachShadow({ mode: 'open' });
}

afterEach(() => {
  for (const host of mountedHosts.splice(0)) host.remove();
});

describe('widget-a last-ping', () => {
  it('writes an early ping with one replace and shows it from the URL (early ping)', async () => {
    resolveNavigationHistory().replace('/?screen=widgets-host&screen.widgets-host.widgets=widget-alpha');
    const pushes = vi.spyOn(window.history, 'pushState');
    const lengthBefore = window.history.length;
    const { bridge, handlers } = fakeBridge();
    const root = shadowContainer();
    // `mount()` and the ping both run OUTSIDE `act()`, back to back, with no
    // `await` between them: the handler is registered synchronously inside
    // `mount()`, so `handleAction` starts — and hits its own
    // `await session.providerMounted` — before React has committed the
    // first render or run any effect at all. This is the actual race the
    // `providerMounted` queue exists to close. Wrapping the two calls
    // together in one `act()` deadlocks instead: `act()` only flushes
    // pending effects after its own async callback settles, but that
    // callback here cannot settle until `providerMounted` resolves, which
    // itself depends on the very effect flush `act()` is withholding.
    // The empty `act()` below is what performs that flush once both calls
    // are already in flight, unblocking the queued ping's own await.
    lifecycle.mount(root, bridge);
    const pingSettled = handlers.get(PING)!.handleAction(PING);
    await act(async () => {});
    await pingSettled;
    expect(window.location.search).toMatch(/screen\.widgets-host\.widgets=widget-alpha;route;last-ping=\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
    expect(pushes).not.toHaveBeenCalled();
    expect(window.history.length).toBe(lengthBefore);
    const shown = deepQuery(root, 'widget-a-last-ping')[0]?.getAttribute('data-last-ping');
    expect(window.location.search).toContain(`last-ping=${shown}`);
    lifecycle.unmount(root);
  });

  it('restores last-ping from the URL without a ping and without history writes', async () => {
    resolveNavigationHistory().replace('/?screen=widgets-host&screen.widgets-host.widgets=widget-alpha;route;last-ping=2026-09-23T10:15:30.000Z');
    const writes = [vi.spyOn(window.history, 'pushState'), vi.spyOn(window.history, 'replaceState')];
    const { bridge } = fakeBridge();
    const root = shadowContainer();
    await act(async () => { lifecycle.mount(root, bridge); });
    expect(deepQuery(root, 'widget-a-last-ping')[0]?.getAttribute('data-last-ping')).toBe('2026-09-23T10:15:30.000Z');
    for (const w of writes) expect(w).not.toHaveBeenCalled();
    lifecycle.unmount(root);
  });

  it('keeps beta rendered when alpha unmounts (unmount alpha keeps beta)', async () => {
    resolveNavigationHistory().replace('/?screen=widgets-host&screen.widgets-host.widgets=widget-alpha&screen.widgets-host.widgets=widget-beta');
    const BETA = 'gts.frontx.mfes.ext.extension.v1~frontx.widgets.fixture_a.widget_beta.v1';
    addresses[BETA] = { domainKey: 'screen.widgets-host.widgets', extension: 'widget-beta' };
    const alpha = fakeBridge();
    const beta = fakeBridge();
    Object.assign(beta.bridge as object, { extensionId: BETA });
    const alphaRoot = shadowContainer();
    const betaRoot = shadowContainer();
    await act(async () => { lifecycle.mount(alphaRoot, alpha.bridge); lifecycle.mount(betaRoot, beta.bridge); });
    await act(async () => { lifecycle.unmount(alphaRoot); });
    expect(deepQuery(alphaRoot, 'widget-a-instance')).toHaveLength(0);
    expect(deepQuery(betaRoot, 'widget-a-instance')).toHaveLength(1);
    lifecycle.unmount(betaRoot);
    delete addresses[BETA];
  });

  it('keeps the newer session when an older container of the same extension unmounts late', async () => {
    resolveNavigationHistory().replace('/?screen=widgets-host&screen.widgets-host.widgets=widget-alpha');
    const { bridge, handlers } = fakeBridge();
    const oldRoot = shadowContainer();
    const newRoot = shadowContainer();
    await act(async () => { lifecycle.mount(oldRoot, bridge); lifecycle.mount(newRoot, bridge); });
    await act(async () => { lifecycle.unmount(oldRoot); });
    // The ping still finds the newer mount's session and writes through its router.
    await act(async () => { await handlers.get(PING)!.handleAction(PING); });
    expect(window.location.search).toMatch(/widget-alpha;route;last-ping=/);
    expect(deepQuery(newRoot, 'widget-a-instance')).toHaveLength(1);
    lifecycle.unmount(newRoot);
  });

  it('reaches its own not-found route for an unknown route inside its entry', async () => {
    resolveNavigationHistory().replace('/?screen=widgets-host&screen.widgets-host.widgets=widget-alpha;route=/nope');
    const { bridge } = fakeBridge();
    const root = shadowContainer();
    await act(async () => { lifecycle.mount(root, bridge); });
    expect(deepQuery(root, 'widget-a-not-found')).toHaveLength(1);
    expect(deepQuery(root, 'widget-a-instance')).toHaveLength(1);
    lifecycle.unmount(root);
  });
});
