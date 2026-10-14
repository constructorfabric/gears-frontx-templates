/**
 * A screen that remounts within staleTime paints from cache.
 *
 * Covers:
 *   - all four read hooks fall back to the QueryClient defaults (staleTime,
 *     gcTime) when neither the call site nor the descriptor sets them
 *   - a remount within the default staleTime reuses the cached data and does
 *     not call the descriptor again
 *   - a staleTime from setQueryDefaults (all matching key prefixes, merged as
 *     TanStack merges them) reaches the shared fetch cache too, so the fetch
 *     cache and the query agree; a function staleTime keeps the fetch cache
 *     from serving a response older than the query would accept
 *   - `enabled: false` keeps useApiQuery and useApiInfiniteQuery idle; an
 *     omitted `enabled` leaves the QueryClient default in force; the suspense
 *     variants reject `enabled` carried by a value typed with the non-suspense
 *     options (checked by type-check, not at run time)
 *
 * @packageDocumentation
 */

import { describe, it, expect, expectTypeOf, afterEach, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import type {
  ApiInfiniteQueryOptions,
  ApiQueryOverrides,
  EndpointDescriptor,
} from '@gears-frontx/react';
import {
  buildHostAppWithQueryCache,
  getAttachedQueryClient,
  loadFreshHelpers,
  ownedApps,
  makeQueryWrapper,
  makeSuspenseQueryWrapper,
  makeQueryDescriptor,
} from './queryHooks.helpers';

// Each test loads a fresh module copy: a runtime builds one app.
let eventBus: typeof import('@gears-frontx/framework')['eventBus'];
let resetSharedFetchCache: typeof import('@gears-frontx/framework')['resetSharedFetchCache'];
let resetSharedQueryClient: typeof import('@gears-frontx/framework')['resetSharedQueryClient'];
let useApiQuery: typeof import('@gears-frontx/react')['useApiQuery'];
let FrontXProvider: typeof import('@gears-frontx/react')['FrontXProvider'];
let RestProtocol: typeof import('@gears-frontx/react')['RestProtocol'];
let RestEndpointProtocol: typeof import('@gears-frontx/react')['RestEndpointProtocol'];
let useApiSuspenseQuery: typeof import('@gears-frontx/react')['useApiSuspenseQuery'];
let useApiInfiniteQuery: typeof import('@gears-frontx/react')['useApiInfiniteQuery'];
let useApiSuspenseInfiniteQuery: typeof import('@gears-frontx/react')['useApiSuspenseInfiniteQuery'];

beforeEach(async () => {
  vi.resetModules();
  await loadFreshHelpers();
  ({ eventBus, resetSharedFetchCache, resetSharedQueryClient } = await import('@gears-frontx/framework'));
  ({
    useApiQuery,
    useApiSuspenseQuery,
    useApiInfiniteQuery,
    useApiSuspenseInfiniteQuery,
    FrontXProvider,
    RestProtocol,
    RestEndpointProtocol,
  } = await import('@gears-frontx/react'));
});

afterEach(() => {
  ownedApps.forEach((app) => {
    app.destroy();
  });
  ownedApps.length = 0;
  eventBus.clearAll();
  resetSharedFetchCache();
  resetSharedQueryClient();
  vi.restoreAllMocks();
});

// Distinct from TanStack's own fallbacks (staleTime 0, gcTime 5 min), so an
// assertion can tell "client default applied" from "option dropped".
const DEFAULT_STALE_TIME = 30_000;
const DEFAULT_GC_TIME = 600_000;
// Inside DEFAULT_STALE_TIME, and past the 1 s floor suspense queries apply
// to an unset staleTime.
const ELAPSED_BEFORE_REMOUNT = 5_000;

function buildClientWithDefaults(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 0,
        staleTime: DEFAULT_STALE_TIME,
        gcTime: DEFAULT_GC_TIME,
        refetchOnWindowFocus: false,
      },
    },
  });
}

function advanceClock(ms: number): void {
  const realNow = Date.now.bind(Date);
  vi.spyOn(Date, 'now').mockImplementation(() => realNow() + ms);
}

async function flushEffects(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  });
}

type HookCase = {
  name: string;
  suspense: boolean;
  useHook: (descriptor: EndpointDescriptor<{ id: number }>) => { data: unknown };
};

const hookCases: HookCase[] = [
  {
    name: 'useApiQuery',
    suspense: false,
    useHook: (descriptor) => useApiQuery(descriptor),
  },
  {
    name: 'useApiSuspenseQuery',
    suspense: true,
    useHook: (descriptor) => useApiSuspenseQuery(descriptor),
  },
  {
    name: 'useApiInfiniteQuery',
    suspense: false,
    useHook: (descriptor) =>
      useApiInfiniteQuery({ initialPage: descriptor, getNextPage: () => undefined }),
  },
  {
    name: 'useApiSuspenseInfiniteQuery',
    suspense: true,
    useHook: (descriptor) =>
      useApiSuspenseInfiniteQuery({ initialPage: descriptor, getNextPage: () => undefined }),
  },
];

describe.each(hookCases)('$name without staleTime/gcTime overrides', ({ suspense, useHook }) => {
  function makeWrapper(client: QueryClient) {
    return suspense ? makeSuspenseQueryWrapper(client) : makeQueryWrapper(client);
  }

  it('uses the QueryClient default gcTime', async () => {
    const client = buildClientWithDefaults();
    const wrapper = makeWrapper(client);
    const key = ['defaults', suspense];
    const descriptor = makeQueryDescriptor(key, () => Promise.resolve({ id: 1 }));

    const { result } = renderHook(() => useHook(descriptor), { wrapper });
    await waitFor(() => expect(result.current?.data).toBeDefined());

    const query = client.getQueryCache().find({ queryKey: key });
    expect(query?.gcTime).toBe(DEFAULT_GC_TIME);
  });

  it('paints a remount within staleTime from cache without calling the descriptor again', async () => {
    const client = buildClientWithDefaults();
    const wrapper = makeWrapper(client);
    const fetchFn = vi.fn(() => Promise.resolve({ id: 1 }));
    const descriptor = makeQueryDescriptor(['remount', suspense], fetchFn);

    const first = renderHook(() => useHook(descriptor), { wrapper });
    await waitFor(() => expect(first.result.current?.data).toBeDefined());
    first.unmount();
    expect(fetchFn).toHaveBeenCalledTimes(1);

    advanceClock(ELAPSED_BEFORE_REMOUNT);

    const second = renderHook(() => useHook(descriptor), { wrapper });
    // Cached data is there on the very first render of the remount.
    expect(second.result.current?.data).toBeDefined();
    await flushEffects();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe.each(hookCases)('$name with setQueryDefaults staleTime', ({ suspense, useHook }) => {
  function makeWrapper(client: QueryClient) {
    return suspense ? makeSuspenseQueryWrapper(client) : makeQueryWrapper(client);
  }

  // Both prefixes match; TanStack merges them in registration order, so the
  // later one wins over the earlier one and over the global default.
  const PREFIX_STALE_TIME = 1_000;
  const KEY_STALE_TIME = 2_000;

  function buildClientWithKeyDefaults(key: readonly unknown[]): QueryClient {
    const client = buildClientWithDefaults();
    client.setQueryDefaults(key.slice(0, 1), { staleTime: PREFIX_STALE_TIME });
    client.setQueryDefaults(key, { staleTime: KEY_STALE_TIME });
    return client;
  }

  it('reuses the cache within the per-key staleTime and fetches again past it', async () => {
    const key = ['per-key-remount', suspense];
    const client = buildClientWithKeyDefaults(key);
    const wrapper = makeWrapper(client);
    const fetchFn = vi.fn(() => Promise.resolve({ id: 1 }));
    const descriptor = makeQueryDescriptor(key, fetchFn);

    const first = renderHook(() => useHook(descriptor), { wrapper });
    await waitFor(() => expect(first.result.current?.data).toBeDefined());
    first.unmount();

    advanceClock(KEY_STALE_TIME / 2);
    const second = renderHook(() => useHook(descriptor), { wrapper });
    await flushEffects();
    second.unmount();
    expect(fetchFn).toHaveBeenCalledTimes(1);

    vi.restoreAllMocks();
    advanceClock(KEY_STALE_TIME * 2);
    const third = renderHook(() => useHook(descriptor), { wrapper });
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2));
    expect(fetchFn).toHaveBeenLastCalledWith(
      expect.objectContaining({ staleTime: KEY_STALE_TIME })
    );
    third.unmount();
  });
});

describe('setQueryDefaults with a function staleTime', () => {
  it('refetches fresh data past the function window instead of the shared fetch cache copy', async () => {
    const hostApp = await buildHostAppWithQueryCache(DEFAULT_STALE_TIME);
    const client = getAttachedQueryClient(hostApp);
    const rest = new RestProtocol();
    rest.initialize({ baseURL: '/api/test' });
    const responses = ['first', 'second'];
    rest.setRequestDispatcherForTest(() =>
      Promise.resolve({ status: 200, headers: {}, data: responses.shift() })
    );
    const endpoints = new RestEndpointProtocol(rest);
    endpoints.initialize({ baseURL: '/api/test' });
    const descriptor = endpoints.query<string>('/function-stale-time');
    client.setQueryDefaults(descriptor.key as unknown[], { staleTime: () => 5_000 });

    const { result } = renderHook(() => useApiQuery(descriptor), {
      wrapper: ({ children }) => <FrontXProvider app={hostApp}>{children}</FrontXProvider>,
    });
    await waitFor(() => expect(result.current.data).toBe('first'));

    advanceClock(10_000);
    await act(async () => {
      await result.current.refetch();
    });
    await waitFor(() => expect(result.current.data).toBe('second'));
  });
});

describe('enabled option', () => {
  it('useApiQuery stays idle while enabled is false and fetches once it flips to true', async () => {
    const client = buildClientWithDefaults();
    const wrapper = makeQueryWrapper(client);
    const fetchFn = vi.fn(() => Promise.resolve({ id: 1 }));
    const descriptor = makeQueryDescriptor(['enabled', 'query'], fetchFn);

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useApiQuery(descriptor, { enabled }),
      { wrapper, initialProps: { enabled: false } }
    );
    await flushEffects();

    expect(fetchFn).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);

    rerender({ enabled: true });
    await waitFor(() => expect(result.current.data).toEqual({ id: 1 }));
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('useApiInfiniteQuery stays idle while enabled is false and fetches once it flips to true', async () => {
    const client = buildClientWithDefaults();
    const wrapper = makeQueryWrapper(client);
    const fetchFn = vi.fn(() => Promise.resolve({ id: 1 }));
    const descriptor = makeQueryDescriptor(['enabled', 'infinite'], fetchFn);

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useApiInfiniteQuery({ initialPage: descriptor, getNextPage: () => undefined, enabled }),
      { wrapper, initialProps: { enabled: false } }
    );
    await flushEffects();

    expect(fetchFn).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);

    rerender({ enabled: true });
    await waitFor(() => expect(result.current.data).toEqual([{ id: 1 }]));
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  // Omitting `enabled` lets the QueryClient default decide.
  function disableQueriesByDefault(client: QueryClient): void {
    client.setDefaultOptions({
      queries: { ...client.getDefaultOptions().queries, enabled: false },
    });
  }

  it('useApiQuery without enabled keeps enabled: false from the global query default', async () => {
    const client = buildClientWithDefaults();
    disableQueriesByDefault(client);
    const fetchFn = vi.fn(() => Promise.resolve({ id: 1 }));
    const descriptor = makeQueryDescriptor(['client-default-enabled', 'query'], fetchFn);

    const { result } = renderHook(() => useApiQuery(descriptor), {
      wrapper: makeQueryWrapper(client),
    });
    await flushEffects();

    expect(fetchFn).not.toHaveBeenCalled();
    expect(result.current.isFetching).toBe(false);
  });

  it('useApiInfiniteQuery without enabled keeps enabled: false from the global query default', async () => {
    const client = buildClientWithDefaults();
    disableQueriesByDefault(client);
    const fetchFn = vi.fn(() => Promise.resolve({ id: 1 }));
    const descriptor = makeQueryDescriptor(['client-default-enabled', 'infinite'], fetchFn);

    const { result } = renderHook(
      () => useApiInfiniteQuery({ initialPage: descriptor, getNextPage: () => undefined }),
      { wrapper: makeQueryWrapper(client) }
    );
    await flushEffects();

    expect(fetchFn).not.toHaveBeenCalled();
    expect(result.current.isFetching).toBe(false);
  });

  it('suspense variants reject a value typed with the non-suspense options', () => {
    // Compile-time only: type-check (tsconfig.test.json, against the built
    // types) fails if a suspense hook starts accepting `enabled`.
    type Item = { id: number };
    type SuspenseQueryOverrides = Parameters<typeof useApiSuspenseQuery<Item>>[1];
    type SuspenseInfiniteOptions = Parameters<typeof useApiSuspenseInfiniteQuery<Item>>[0];
    const descriptor = makeQueryDescriptor<Item>(['types'], () => Promise.resolve({ id: 1 }));
    const queryOverrides: ApiQueryOverrides = { enabled: true };
    const infiniteOptions: ApiInfiniteQueryOptions<Item> = {
      initialPage: descriptor,
      getNextPage: () => undefined,
    };

    expectTypeOf(queryOverrides).not.toExtend<SuspenseQueryOverrides>();
    expectTypeOf(infiniteOptions).not.toExtend<SuspenseInfiniteOptions>();
  });
});
