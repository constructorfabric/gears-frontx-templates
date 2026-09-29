import { describe, expect, it, vi } from 'vitest';
import { createRouteSignal } from '@gears-frontx/routing';
import { FRONTX_SHARED_PROPERTY_ENTRY_ADDRESSES } from '@gears-frontx/react';
import type { MfeRegistry } from '@gears-frontx/react';
import { screenDomain } from '@gears-frontx/react';
import { createShellRouting } from './shell-routing';
import { fakeNavigation } from './__tests__/fake-navigation';

function registry(extensions: Record<string, unknown[]> = {}) {
  return {
    getExtension: () => undefined,
    getExtensionsForDomain: (d: string) => extensions[d] ?? [],
    getMountedExtensions: () => [],
    executeActionsChain: vi.fn(() => Promise.resolve()),
    updateSharedProperty: vi.fn(),
  } as unknown as MfeRegistry & { updateSharedProperty: ReturnType<typeof vi.fn> };
}

describe('createShellRouting', () => {
  it('observes all four shell domains and leaves their unresolved entries in the URL', () => {
    // `screen` included alongside sidebar/popup/overlay: a prior version of
    // this test only asserted the three optional domains, so a mutation that
    // dropped `screen` from `start()`'s loop (never subscribing its
    // observer) went undetected — `screen`'s own `getStatus()` would stay at
    // its default {0,0} regardless, since nothing here ever drove its
    // observer either way (F4).
    const history = fakeNavigation('/?screen=x&sidebar=a&popup=b&overlay=c');
    const routing = createShellRouting(registry(), { history, signal: createRouteSignal(history) });
    routing.start();
    for (const d of [routing.screen, routing.sidebar, routing.popup, routing.overlay]) {
      expect(d.getStatus()).toEqual({ entries: 1, unresolved: 1 });
    }
    expect(history.writes).toEqual([]);
    expect(history.location.search).toBe('screen=x&sidebar=a&popup=b&overlay=c');
  });

  it("broadcasts the entry-addresses property for the routable extensions it knows", () => {
    const history = fakeNavigation('/');
    const reg = registry({ [screenDomain.id]: [{ id: 'ext.hello', presentation: { route: '/hello-world' } }] });
    createShellRouting(reg, { history, signal: createRouteSignal(history) }).broadcastAddresses();
    expect(reg.updateSharedProperty).toHaveBeenCalledWith(FRONTX_SHARED_PROPERTY_ENTRY_ADDRESSES, { 'ext.hello': { domainKey: 'screen', extension: 'hello-world' } });
  });
});
