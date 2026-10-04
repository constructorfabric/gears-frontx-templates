/**
 * ThemeAwareReactLifecycle and the runtime's lazily built MfeRegistry.
 *
 * A nested runtime's registry must first be read inside `mount()` so the host
 * links it; `mount` reads `app.mfeRegistry` before it does anything else.
 *
 * @vitest-environment jsdom
 */
import type React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from '@testing-library/react';
import type { ChildMfeBridge, FrontXApp } from '@gears-frontx/framework';

let fw: typeof import('@gears-frontx/framework');
let app: FrontXApp | undefined;
let ThemeAwareReactLifecycle: typeof import('../ThemeAwareReactLifecycle')['ThemeAwareReactLifecycle'];
let ProbeLifecycle: ReturnType<typeof defineProbeLifecycle>;

function defineProbeLifecycle() {
  return class extends ThemeAwareReactLifecycle {
    protected renderContent(_bridge: ChildMfeBridge): React.ReactNode {
      return null;
    }
  };
}

beforeEach(async () => {
  // A runtime builds one app, so each case loads its own module copy.
  vi.resetModules();
  fw = await import('@gears-frontx/framework');
  ({ ThemeAwareReactLifecycle } = await import('../ThemeAwareReactLifecycle'));
  ProbeLifecycle = defineProbeLifecycle();
});

afterEach(() => {
  app?.destroy();
  app = undefined;
  vi.restoreAllMocks();
  fw.eventBus.clearAll();
});

const noopBridge = {} as ChildMfeBridge;

/** Replaces `mfeRegistry` with an accessor that logs each read. */
function withLoggedRegistryAccessor(app: FrontXApp, log: string[]): void {
  Object.defineProperty(app, 'mfeRegistry', {
    configurable: true,
    enumerable: true,
    get: () => {
      log.push('registry-read');
      return undefined;
    },
  });
}

describe('ThemeAwareReactLifecycle.mount registry materialization', () => {
  it('reads app.mfeRegistry before it touches the container', async () => {
    app = fw.createFrontX().build();
    const log: string[] = [];
    withLoggedRegistryAccessor(app, log);
    const lifecycle = new ProbeLifecycle(app);

    const container = document.createElement('div');
    const querySelector = container.querySelector.bind(container);
    container.querySelector = ((selector: string) => {
      log.push('container-touched');
      return querySelector(selector);
    }) as typeof container.querySelector;

    await act(async () => {
      lifecycle.mount(container, noopBridge);
    });

    expect(log.slice(0, 2)).toEqual(['registry-read', 'container-touched']);
    await act(async () => {
      await lifecycle.unmount(container);
    });
  });

  it('builds the runtime registry exactly once, inside mount, through the real lazy accessor', async () => {
    const buildSpy = vi.spyOn(fw.mfeRegistryFactory, 'build');
    app = fw.createFrontX().use(fw.microfrontends({ typeSystem: fw.gtsPlugin })).build();
    const lifecycle = new ProbeLifecycle(app);
    expect(buildSpy).not.toHaveBeenCalled();

    const container = document.createElement('div');
    await act(async () => {
      lifecycle.mount(container, noopBridge);
    });

    expect(buildSpy).toHaveBeenCalledTimes(1);
    expect(app.mfeRegistry).toBeDefined();
    expect(buildSpy).toHaveBeenCalledTimes(1);
    await act(async () => {
      await lifecycle.unmount(container);
    });
  });
});
