import React from 'react';
import { describe, expect, it, afterEach, vi, beforeEach } from 'vitest';
import { act, waitFor } from '@testing-library/react';
import { loadOtherRuntime } from '../queryHooks.helpers';
import type { ChildMfeBridge, EndpointDescriptor, FrontXApp } from '@gears-frontx/framework';

// Each test loads a fresh module copy: a runtime builds one app.
let createFrontX: typeof import('@gears-frontx/framework')['createFrontX'];
let queryCache: typeof import('@gears-frontx/framework')['queryCache'];
let queryCacheShared: typeof import('@gears-frontx/framework')['queryCacheShared'];
let resetSharedQueryClient: typeof import('@gears-frontx/framework')['resetSharedQueryClient'];
let TestLifecycle: ReturnType<typeof defineTestLifecycle>;
let OptionalQueryClientLifecycle: ReturnType<typeof defineOptionalQueryClientLifecycle>;
let ApiQueryLateJoinLifecycle: ReturnType<typeof defineApiQueryLateJoinLifecycle>;
let ThemeAwareReactLifecycle: typeof import('@gears-frontx/react')['ThemeAwareReactLifecycle'];
let useApiQuery: typeof import('@gears-frontx/react')['useApiQuery'];
let useQueryCache: typeof import('@gears-frontx/react')['useQueryCache'];
let bootstrapFrontXQueryClient: typeof import('@gears-frontx/react/testing')['bootstrapFrontXQueryClient'];
let resolveFrontXQueryClient: typeof import('@gears-frontx/react/testing')['resolveFrontXQueryClient'];
let useOptionalFrontXQueryClient: typeof import('@gears-frontx/react/testing')['useOptionalFrontXQueryClient'];

beforeEach(async () => {
  vi.resetModules();
  ({ createFrontX, queryCache, queryCacheShared, resetSharedQueryClient } = await import('@gears-frontx/framework'));
  ({ ThemeAwareReactLifecycle, useApiQuery, useQueryCache } = await import('@gears-frontx/react'));
  TestLifecycle = defineTestLifecycle();
  OptionalQueryClientLifecycle = defineOptionalQueryClientLifecycle();
  ApiQueryLateJoinLifecycle = defineApiQueryLateJoinLifecycle();
  ({ bootstrapFrontXQueryClient, resolveFrontXQueryClient, useOptionalFrontXQueryClient } = await import('@gears-frontx/react/testing'));
});

afterEach(() => {
  resetSharedQueryClient();
});

/** The host is another runtime: its own module copy, sharing the test runtime's state. */
async function buildHostApp(): Promise<FrontXApp> {
  const hostRuntime = await loadOtherRuntime();
  return hostRuntime.createFrontX().use(hostRuntime.queryCache()).build();
}

/** Minimal real app: failure-path test only needs an app without shared QueryClient wiring. */
function createMinimalHai3App(): FrontXApp {
  return createFrontX().build();
}

function makeScreenMountBridgeStub(): ChildMfeBridge {
  return {
    extDomainId: 'screen',
    extensionId: 'bridge',
    executeActionsChain: vi.fn().mockReturnValue(undefined),
    subscribeToProperty: vi.fn().mockReturnValue(() => undefined),
    getProperty: vi.fn().mockReturnValue(undefined),
    registerActionHandler: vi.fn(),
  };
}

function QueryCacheProbe({ onRender }: { onRender: (value: unknown) => void }) {
  const queryCache = useQueryCache();
  onRender(queryCache.get(['probe']));
  return null;
}

function OptionalQueryClientProbe({ onRender }: { onRender: (value: unknown) => void }) {
  const queryClient = useOptionalFrontXQueryClient();
  onRender(queryClient?.getQueryData(['probe']));
  return null;
}

const LATE_JOIN_API_QUERY_DESCRIPTOR: EndpointDescriptor<string> = {
  key: ['mfe-late-join-useApiQuery'],
  staleTime: 0,
  gcTime: 0,
  fetch: () => Promise.resolve('late-join-data'),
};

function ApiQueryLateJoinProbe({
  onRender,
}: {
  onRender: (r: { data: unknown; isLoading: boolean }) => void;
}) {
  const result = useApiQuery(LATE_JOIN_API_QUERY_DESCRIPTOR);
  onRender({ data: result.data, isLoading: result.isLoading });
  return null;
}

function defineTestLifecycle() {
  return class extends ThemeAwareReactLifecycle {
    constructor(
      app: FrontXApp,
      private readonly onRender: (value: unknown) => void
    ) {
      super(app);
    }

    protected renderContent() {
      return React.createElement(QueryCacheProbe, { onRender: this.onRender });
    }
  };
}

function defineOptionalQueryClientLifecycle() {
  return class extends ThemeAwareReactLifecycle {
    constructor(
      app: FrontXApp,
      private readonly onRender: (value: unknown) => void
    ) {
      super(app);
    }

    protected renderContent() {
      return React.createElement(OptionalQueryClientProbe, { onRender: this.onRender });
    }
  };
}

function defineApiQueryLateJoinLifecycle() {
  return class extends ThemeAwareReactLifecycle {
    constructor(
      app: FrontXApp,
      private readonly onRender: (r: { data: unknown; isLoading: boolean }) => void
    ) {
      super(app);
    }

    protected renderContent() {
      return React.createElement(ApiQueryLateJoinProbe, { onRender: this.onRender });
    }
  };
}

describe('MFE shared QueryClient join', () => {
  it('resolves the shared QueryClient at mount when the child app built before the host', async () => {
    const childApp = createFrontX().use(queryCacheShared()).build();
    const hostApp = await buildHostApp();
    const hostClient = resolveFrontXQueryClient(hostApp);
    if (!hostClient) {
      throw new Error('expected host query client');
    }
    hostClient.setQueryData(['probe'], 'shared-query-client');

    let observedValue: unknown;
    const lifecycle = new TestLifecycle(childApp, (value) => {
      observedValue = value;
    });

    const container = document.createElement('div');
    await act(async () => {
      lifecycle.mount(
        container,
        makeScreenMountBridgeStub(),
        {
          domainId: 'screen',
          extensionId: 'ext',
        }
      );
    });

    await waitFor(() => {
      expect(observedValue).toBe('shared-query-client');
    });

    act(() => {
      lifecycle.unmount(container);
      childApp.destroy();
      hostApp.destroy();
    });
  });

  it('keeps the joined QueryClient readable after immediate host app teardown following mount', async () => {
    const hostApp = await buildHostApp();
    const hostClient = resolveFrontXQueryClient(hostApp);
    if (!hostClient) {
      throw new Error('expected host query client');
    }
    hostClient.setQueryData(['probe'], 'shared-query-client');

    const childApp = createFrontX().use(queryCacheShared()).build();

    let observedValue: unknown;
    const lifecycle = new TestLifecycle(childApp, (value) => {
      observedValue = value;
    });

    const container = document.createElement('div');
    await act(async () => {
      lifecycle.mount(
        container,
        makeScreenMountBridgeStub(),
        {
          domainId: 'screen',
          extensionId: 'ext',
        }
      );
    });

    act(() => {
      hostApp.destroy();
    });

    await waitFor(() => {
      expect(observedValue).toBe('shared-query-client');
    });

    act(() => {
      lifecycle.unmount(container);
      childApp.destroy();
    });
  });

  it('reads the app QueryClient through the first React commit', async () => {
    const app = createFrontX().use(queryCache()).build();
    const sharedClient = resolveFrontXQueryClient(app);
    if (!sharedClient) {
      throw new Error('expected app query client');
    }
    sharedClient.setQueryData(['probe'], 'shared-query-client');

    let observedValue: unknown;
    const lifecycle = new TestLifecycle(
      app,
      (value) => {
        observedValue = value;
      }
    );

    const container = document.createElement('div');
    await act(async () => {
      lifecycle.mount(
        container,
        makeScreenMountBridgeStub(),
        {
          domainId: 'screen',
          extensionId: 'ext',
        }
      );
    });

    await waitFor(() => {
      expect(observedValue).toBe('shared-query-client');
    });

    act(() => {
      lifecycle.unmount(container);
      app.destroy();
    });
  });

  it('does not activate queryCacheShared() from render bootstrap', async () => {
    const childApp = createFrontX().use(queryCacheShared()).build();
    const hostApp = await buildHostApp();

    expect(bootstrapFrontXQueryClient(childApp)).toBeUndefined();
    expect(resolveFrontXQueryClient(childApp)).toBeUndefined();

    act(() => {
      hostApp.destroy();
    });

    expect(bootstrapFrontXQueryClient(childApp)).toBeUndefined();

    childApp.destroy();
  });

  it('useApiQuery resolves after the host runtime appears when the MFE mounted first', async () => {
    const childApp = createFrontX().use(queryCacheShared()).build();

    let last: { data: unknown; isLoading: boolean } | undefined;
    const lifecycle = new ApiQueryLateJoinLifecycle(childApp, (r) => {
      last = r;
    });

    const container = document.createElement('div');
    await act(async () => {
      lifecycle.mount(
        container,
        makeScreenMountBridgeStub(),
        {
          domainId: 'screen',
          extensionId: 'ext',
        }
      );
    });

    expect(last).toBeUndefined();

    let hostApp!: FrontXApp;
    await act(async () => {
      hostApp = await buildHostApp();
    });

    await waitFor(() => {
      expect(last?.data).toBe('late-join-data');
      expect(last?.isLoading).toBe(false);
    });

    act(() => {
      lifecycle.unmount(container);
      childApp.destroy();
      hostApp.destroy();
    });
  });

  it('waits for the host runtime when it appears after the mounted MFE renders', async () => {
    const childApp = createFrontX().use(queryCacheShared()).build();

    let observedValue: unknown = 'initial';
    const lifecycle = new OptionalQueryClientLifecycle(childApp, (value) => {
      observedValue = value;
    });

    const container = document.createElement('div');
    await act(async () => {
      lifecycle.mount(
        container,
        makeScreenMountBridgeStub(),
        {
          domainId: 'screen',
          extensionId: 'ext',
        }
      );
    });

    // FrontXProvider defers the subtree until the shared client joins, so the probe
    // does not mount (and does not observe undefined) until the host exists.
    expect(observedValue).toBe('initial');

    let hostApp!: FrontXApp;
    await act(async () => {
      hostApp = await buildHostApp();
      const hostClient = resolveFrontXQueryClient(hostApp);
      if (!hostClient) {
        throw new Error('expected host query client');
      }
      hostClient.setQueryData(['probe'], 'shared-query-client');
    });

    await waitFor(() => {
      expect(observedValue).toBe('shared-query-client');
    });

    act(() => {
      lifecycle.unmount(container);
      childApp.destroy();
      hostApp.destroy();
    });
  });

  it('fails explicitly when a mounted MFE app has no shared QueryClient', async () => {
    const minimalApp = createMinimalHai3App();
    try {
      const lifecycle = new TestLifecycle(minimalApp, () => undefined);
      const container = document.createElement('div');

      expect(() => {
        act(() => {
          lifecycle.mount(
            container,
            makeScreenMountBridgeStub(),
            {
              domainId: 'screen',
              extensionId: 'ext',
            }
          );
        });
      }).toThrow(
        '[FrontXProvider] Mounted MFEs require queryCacheShared() in the child app and queryCache() in the host app before loading the MFE app.'
      );
    } finally {
      minimalApp.destroy();
    }
  });
});
