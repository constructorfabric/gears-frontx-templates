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
 *     cache and the query agree; a function staleTime is not resolved to the
 *     global default
 *   - `enabled: false` keeps useApiQuery and useApiInfiniteQuery idle; an
 *     omitted `enabled` leaves the QueryClient default in force; the suspense
 *     variants reject `enabled`, also through a typed variable
 *
 * @packageDocumentation
 */

import { describe, it, expect, expectTypeOf, afterEach, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import type {
  ApiInfiniteQueryOptions,
  ApiQueryOverrides,
  ApiSuspenseInfiniteQueryOptions,
  ApiSuspenseQueryOverrides,
  EndpointDescriptor,
} from '@gears-frontx/react';
import {
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
let useApiSuspenseQuery: typeof import('@gears-frontx/react')['useApiSuspenseQuery'];
let useApiInfiniteQuery: typeof import('@gears-frontx/react')['useApiInfiniteQuery'];
let useApiSuspenseInfiniteQuery: typeof import('@gears-frontx/react')['useApiSuspenseInfiniteQuery'];

beforeEach(async () => {
  vi.resetModules();
  await loadFreshHelpers();
  ({ eventBus, resetSharedFetchCache, resetSharedQueryClient } = await import('@gears-frontx/framework'));
  ({ useApiQuery, useApiSuspenseQuery, useApiInfiniteQuery, useApiSuspenseInfiniteQuery } =
    await import('@gears-frontx/react'));
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

  it('uses the QueryClient defaults for staleTime and gcTime', async () => {
    const client = buildClientWithDefaults();
    const wrapper = makeWrapper(client);
    const key = ['defaults', suspense];
    const descriptor = makeQueryDescriptor(key, () => Promise.resolve({ id: 1 }));

    const { result } = renderHook(() => useHook(descriptor), { wrapper });
    await waitFor(() => expect(result.current?.data).toBeDefined());

    const query = client.getQueryCache().find({ queryKey: key });
    expect(query?.observers[0]?.options.staleTime).toBe(DEFAULT_STALE_TIME);
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

  it('hands the per-key staleTime to the fetch cache, as TanStack does to the query', async () => {
    const key = ['per-key-defaults', suspense];
    const client = buildClientWithKeyDefaults(key);
    const fetchFn = vi.fn(() => Promise.resolve({ id: 1 }));
    const descriptor = makeQueryDescriptor(key, fetchFn);

    const { result } = renderHook(() => useHook(descriptor), { wrapper: makeWrapper(client) });
    await waitFor(() => expect(result.current?.data).toBeDefined());

    const query = client.getQueryCache().find({ queryKey: key });
    expect(query?.observers[0]?.options.staleTime).toBe(KEY_STALE_TIME);
    expect(fetchFn).toHaveBeenCalledWith(expect.objectContaining({ staleTime: KEY_STALE_TIME }));
  });

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
  it('leaves the fetch cache without a staleTime instead of the global default', async () => {
    const client = buildClientWithDefaults();
    const key = ['per-key-function-stale-time'];
    client.setQueryDefaults(key, { staleTime: () => 5_000 });
    const fetchFn = vi.fn(() => Promise.resolve({ id: 1 }));
    const descriptor = makeQueryDescriptor(key, fetchFn);

    const { result } = renderHook(() => useApiQuery(descriptor), {
      wrapper: makeQueryWrapper(client),
    });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(fetchFn).toHaveBeenCalledWith(expect.objectContaining({ staleTime: undefined }));
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

  type ClientDefaultsCase = {
    name: string;
    applyDefaults: (client: QueryClient, key: readonly unknown[]) => void;
  };

  const clientDefaultsCases: ClientDefaultsCase[] = [
    {
      name: 'the global query default',
      applyDefaults: (client) => {
        client.setDefaultOptions({
          queries: { ...client.getDefaultOptions().queries, enabled: false },
        });
      },
    },
    {
      name: 'setQueryDefaults for the key',
      applyDefaults: (client, key) => {
        client.setQueryDefaults(key, { enabled: false });
      },
    },
  ];

  it.each(clientDefaultsCases)(
    'useApiQuery without enabled keeps enabled: false from $name',
    async ({ applyDefaults }) => {
      const client = buildClientWithDefaults();
      const key = ['client-default-enabled', 'query'];
      applyDefaults(client, key);
      const fetchFn = vi.fn(() => Promise.resolve({ id: 1 }));
      const descriptor = makeQueryDescriptor(key, fetchFn);

      const { result } = renderHook(() => useApiQuery(descriptor), {
        wrapper: makeQueryWrapper(client),
      });
      await flushEffects();

      expect(fetchFn).not.toHaveBeenCalled();
      expect(result.current.isFetching).toBe(false);
    }
  );

  it.each(clientDefaultsCases)(
    'useApiInfiniteQuery without enabled keeps enabled: false from $name',
    async ({ applyDefaults }) => {
      const client = buildClientWithDefaults();
      const key = ['client-default-enabled', 'infinite'];
      applyDefaults(client, key);
      const fetchFn = vi.fn(() => Promise.resolve({ id: 1 }));
      const descriptor = makeQueryDescriptor(key, fetchFn);

      const { result } = renderHook(
        () => useApiInfiniteQuery({ initialPage: descriptor, getNextPage: () => undefined }),
        { wrapper: makeQueryWrapper(client) }
      );
      await flushEffects();

      expect(fetchFn).not.toHaveBeenCalled();
      expect(result.current.isFetching).toBe(false);
    }
  );

  it('suspense variants reject enabled, also through a typed variable', () => {
    // A value typed with the non-suspense options (enabled included) is not
    // assignable to the suspense options; type-check:test fails otherwise.
    expectTypeOf<ApiQueryOverrides>().not.toExtend<ApiSuspenseQueryOverrides>();
    expectTypeOf<ApiInfiniteQueryOptions<{ id: number }>>().not.toExtend<
      ApiSuspenseInfiniteQueryOptions<{ id: number }>
    >();
    expectTypeOf<{ enabled: false }>().not.toExtend<ApiSuspenseQueryOverrides>();
    expectTypeOf<{ staleTime: number; gcTime: number }>().toExtend<ApiSuspenseQueryOverrides>();
    expectTypeOf<NonNullable<Parameters<typeof useApiQuery>[1]>>().toEqualTypeOf<ApiQueryOverrides>();
    expectTypeOf<NonNullable<Parameters<typeof useApiSuspenseQuery>[1]>>().toEqualTypeOf<ApiSuspenseQueryOverrides>();
    expectTypeOf<Parameters<typeof useApiInfiniteQuery>[0]>().toEqualTypeOf<
      ApiInfiniteQueryOptions<unknown>
    >();
    expectTypeOf<Parameters<typeof useApiSuspenseInfiniteQuery>[0]>().toEqualTypeOf<
      ApiSuspenseInfiniteQueryOptions<unknown>
    >();
  });
});
