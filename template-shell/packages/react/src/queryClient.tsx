import React, {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import {
  QueryClientContext,
  QueryClientProvider,
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
  type MutationFunctionContext,
} from '@tanstack/react-query';
import {
  readQueryCacheScopeGeneration,
  subscribeQueryCacheRuntimeChanged,
  type EndpointDescriptor,
  type FrontXApp,
} from '@gears-frontx/framework';
import type { ApiQueryOverrides, ApiSuspenseQueryOverrides } from './hooks/useApiQuery';
import type {
  ApiInfiniteQueryOptions,
  ApiInfiniteQueryPageContext,
  ApiSuspenseInfiniteQueryOptions,
} from './hooks/useApiInfiniteQuery';
import type { UseApiMutationOptions } from './hooks/useApiMutation';
import {
  createQueryCache,
  type MutationCallbackContext,
  type QueryCache,
  type QueryCacheKey,
} from './hooks/QueryCache';
import { useLatest } from './hooks/useLatest';

const APP_QUERY_CLIENT_SYMBOL = Symbol.for('frontx:query-cache:app-client');
const APP_QUERY_CLIENT_RESOLVER_SYMBOL = Symbol.for('frontx:query-cache:app-client-resolver');
const APP_QUERY_CLIENT_ACTIVATOR_SYMBOL = Symbol.for('frontx:query-cache:app-client-activator');

type QueryClientApp = FrontXApp & {
  [APP_QUERY_CLIENT_SYMBOL]?: QueryClient;
  [APP_QUERY_CLIENT_RESOLVER_SYMBOL]?: () => QueryClient | undefined;
  [APP_QUERY_CLIENT_ACTIVATOR_SYMBOL]?: () => QueryClient | undefined;
};

const FrontXQueryClientContext = createContext<QueryClient | undefined>(undefined);

type RuntimeAwareEndpointDescriptor<TData> = EndpointDescriptor<TData> & {
  fetch(options?: { signal?: AbortSignal; staleTime?: number }): Promise<TData>;
};

type AppResolvedQueryClient = {
  app: FrontXApp;
  queryClient: QueryClient;
};

const useCommitEffect = typeof globalThis.window === 'undefined' ? useEffect : useLayoutEffect;

export function resolveFrontXQueryClient(app: FrontXApp): QueryClient | undefined {
  const clientApp = app as QueryClientApp;
  return clientApp[APP_QUERY_CLIENT_SYMBOL] ?? clientApp[APP_QUERY_CLIENT_RESOLVER_SYMBOL]?.();
}

export function hasFrontXQueryClientActivator(app: FrontXApp): boolean {
  return typeof (app as QueryClientApp)[APP_QUERY_CLIENT_ACTIVATOR_SYMBOL] === 'function';
}

export function activateFrontXQueryClient(app: FrontXApp): QueryClient | undefined {
  const clientApp = app as QueryClientApp;
  return clientApp[APP_QUERY_CLIENT_SYMBOL] ?? clientApp[APP_QUERY_CLIENT_ACTIVATOR_SYMBOL]?.();
}

/**
 * Imperatively invalidates cache entries for `target` on the QueryClient bound to `app`.
 * Use from non-React code (e.g. MFE actions); in components prefer `useQueryCache().invalidate`.
 */
export async function invalidateQueryCacheForApp(
  app: FrontXApp,
  target: EndpointDescriptor<unknown> | QueryCacheKey
): Promise<void> {
  const queryClient = resolveFrontXQueryClient(app) ?? activateFrontXQueryClient(app);
  if (!queryClient) {
    throw new Error(
      '[invalidateQueryCacheForApp] No QueryClient on app. Ensure queryCache() or queryCacheShared() is in the plugin chain.'
    );
  }
  await createQueryCache(queryClient).invalidate(target);
}

/** Resolves the app-bound QueryClient without triggering plugin activation during render. */
export function bootstrapFrontXQueryClient(app: FrontXApp): QueryClient | undefined {
  return resolveFrontXQueryClient(app);
}

export function useBootstrappedFrontXQueryClient(app: FrontXApp): QueryClient | undefined {
  const fromApp = useMemo(() => bootstrapFrontXQueryClient(app), [app]);
  const [eventResolvedClient, setEventResolvedClient] = useState<AppResolvedQueryClient | undefined>(
    undefined
  );
  const queryClient =
    fromApp ?? (eventResolvedClient?.app === app ? eventResolvedClient.queryClient : undefined);

  useCommitEffect(() => {
    if (fromApp || !hasFrontXQueryClientActivator(app)) {
      return;
    }

    const tryResolveQueryClient = () => {
      const nextQueryClient = resolveFrontXQueryClient(app) ?? activateFrontXQueryClient(app);
      if (nextQueryClient) {
        setEventResolvedClient((current) => {
          if (current?.app === app && current.queryClient === nextQueryClient) {
            return current;
          }

          return {
            app,
            queryClient: nextQueryClient,
          };
        });
      }
    };

    // Only activate after commit so abandoned renders cannot leak retainers/listeners.
    tryResolveQueryClient();

    const subscription = subscribeQueryCacheRuntimeChanged(() => {
      tryResolveQueryClient();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [app, fromApp]);

  return queryClient;
}

export function FrontXQueryClientProvider({
  queryClient,
  children,
}: Readonly<{
  queryClient: QueryClient | undefined;
  children: React.ReactNode;
}>) {
  if (!queryClient) {
    return (
      <FrontXQueryClientContext.Provider value={undefined}>
        <QueryClientContext.Provider value={undefined}>{children}</QueryClientContext.Provider>
      </FrontXQueryClientContext.Provider>
    );
  }

  return (
    <FrontXQueryClientContext.Provider value={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </FrontXQueryClientContext.Provider>
  );
}

export function useOptionalFrontXQueryClient(): QueryClient | undefined {
  return useContext(FrontXQueryClientContext);
}

export function useRequiredFrontXQueryClient(): QueryClient {
  const queryClient = useOptionalFrontXQueryClient();
  if (!queryClient) {
    throw new Error(
      '[FrontXProvider] No query cache available. Add queryCache() or queryCacheShared() to your plugin composition.'
    );
  }

  return queryClient;
}

function buildPageContext<TPage>(
  page: TPage,
  pages: readonly TPage[],
  descriptor: EndpointDescriptor<TPage>,
  descriptors: readonly EndpointDescriptor<TPage>[]
): ApiInfiniteQueryPageContext<TPage> {
  return {
    page,
    pages,
    descriptor,
    descriptors,
  };
}

function normalizeFetchStaleTime(staleTime: unknown): number | undefined {
  if (staleTime === 'static') {
    return Number.POSITIVE_INFINITY;
  }

  // A function staleTime is resolved per query by TanStack; 0 keeps the fetch
  // cache from serving a response older than the query would accept.
  if (typeof staleTime === 'function') {
    return 0;
  }

  return typeof staleTime === 'number' ? staleTime : undefined;
}

/**
 * The staleTime the shared fetch cache uses, resolved the way TanStack
 * resolves it for the query: call site, then descriptor, then the
 * QueryClient defaults for the query key (global defaults with every
 * matching setQueryDefaults prefix spread over them).
 */
function resolveFetchStaleTime<TData>(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  descriptor: EndpointDescriptor<TData>,
  overrideStaleTime?: number
): number | undefined {
  const clientDefaults = {
    ...queryClient.getDefaultOptions().queries,
    ...queryClient.getQueryDefaults(queryKey),
  };
  return normalizeFetchStaleTime(
    overrideStaleTime ?? descriptor.staleTime ?? clientDefaults.staleTime
  );
}

/**
 * staleTime/gcTime for a query, with only the keys that are set. An explicit
 * `undefined` would override the QueryClient defaults (TanStack spreads the
 * query options over them), so a screen that remounts would refetch instead of
 * painting from cache.
 */
function cacheTimeOptions(
  staleTime: number | undefined,
  gcTime: number | undefined
): { staleTime?: number; gcTime?: number } {
  return {
    ...(staleTime === undefined ? {} : { staleTime }),
    ...(gcTime === undefined ? {} : { gcTime }),
  };
}

function fetchDescriptor<TData>(
  descriptor: EndpointDescriptor<TData>,
  options?: { signal?: AbortSignal; staleTime?: number }
): Promise<TData> {
  return (descriptor as RuntimeAwareEndpointDescriptor<TData>).fetch(options);
}

export function useFrontXQuery<TData = unknown, TError = Error>(
  descriptor: EndpointDescriptor<TData>,
  overrides?: ApiQueryOverrides
) {
  const queryClient = useRequiredFrontXQueryClient();
  const staleTime = resolveFetchStaleTime(
    queryClient,
    descriptor.key,
    descriptor,
    overrides?.staleTime
  );
  const result = useQuery<TData, TError>({
    queryKey: descriptor.key as unknown[],
    queryFn: ({ signal }) => fetchDescriptor(descriptor, { signal, staleTime }),
    ...cacheTimeOptions(
      overrides?.staleTime ?? descriptor.staleTime,
      overrides?.gcTime ?? descriptor.gcTime
    ),
    ...(overrides?.enabled === undefined ? {} : { enabled: overrides.enabled }),
  });

  return {
    data: result.data,
    error: result.error,
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    isError: result.isError,
    refetch: result.refetch,
  };
}

export function useFrontXSuspenseQuery<TData = unknown, TError = Error>(
  descriptor: EndpointDescriptor<TData>,
  overrides?: ApiSuspenseQueryOverrides
) {
  const queryClient = useRequiredFrontXQueryClient();
  const staleTime = resolveFetchStaleTime(
    queryClient,
    descriptor.key,
    descriptor,
    overrides?.staleTime
  );
  const result = useSuspenseQuery<TData, TError>({
    queryKey: descriptor.key as unknown[],
    queryFn: ({ signal }) => fetchDescriptor(descriptor, { signal, staleTime }),
    ...cacheTimeOptions(
      overrides?.staleTime ?? descriptor.staleTime,
      overrides?.gcTime ?? descriptor.gcTime
    ),
  });

  return {
    data: result.data,
    error: result.error,
    isFetching: result.isFetching,
    refetch: async () => {
      await result.refetch();
    },
  };
}

export function useFrontXInfiniteQuery<TPage = unknown, TError = Error>(
  options: ApiInfiniteQueryOptions<TPage>
) {
  const queryClient = useRequiredFrontXQueryClient();
  const result = useInfiniteQuery<
    TPage,
    TError,
    readonly TPage[],
    readonly unknown[],
    EndpointDescriptor<TPage>
  >({
    queryKey: options.initialPage.key,
    initialPageParam: options.initialPage,
    queryFn: ({ pageParam, signal }) =>
      fetchDescriptor(pageParam, {
        signal,
        staleTime: resolveFetchStaleTime(
          queryClient,
          options.initialPage.key,
          pageParam,
          options.staleTime
        ),
      }),
    getNextPageParam: (
      lastPage,
      allPages,
      lastPageDescriptor,
      allPageDescriptors
    ) =>
      options.getNextPage(
        buildPageContext(
          lastPage,
          allPages,
          lastPageDescriptor,
          allPageDescriptors
        )
      ),
    getPreviousPageParam: options.getPreviousPage
      ? (firstPage, allPages, firstPageDescriptor, allPageDescriptors) =>
          options.getPreviousPage?.(
            buildPageContext(
              firstPage,
              allPages,
              firstPageDescriptor,
              allPageDescriptors
            )
          )
      : undefined,
    select: (data) => data.pages,
    ...cacheTimeOptions(
      options.staleTime ?? options.initialPage.staleTime,
      options.gcTime ?? options.initialPage.gcTime
    ),
    maxPages: options.maxPages,
    ...(options.enabled === undefined ? {} : { enabled: options.enabled }),
  });

  return {
    data: result.data,
    error: result.error,
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    isError: result.isError,
    hasNextPage: result.hasNextPage ?? false,
    hasPreviousPage: result.hasPreviousPage ?? false,
    isFetchingNextPage: result.isFetchingNextPage,
    isFetchingPreviousPage: result.isFetchingPreviousPage,
    fetchNextPage: async () => {
      await result.fetchNextPage();
    },
    fetchPreviousPage: async () => {
      await result.fetchPreviousPage();
    },
    refetch: async () => {
      await result.refetch();
    },
  };
}

export function useFrontXSuspenseInfiniteQuery<TPage = unknown, TError = Error>(
  options: ApiSuspenseInfiniteQueryOptions<TPage>
) {
  const queryClient = useRequiredFrontXQueryClient();
  const result = useSuspenseInfiniteQuery<
    TPage,
    TError,
    readonly TPage[],
    readonly unknown[],
    EndpointDescriptor<TPage>
  >({
    queryKey: options.initialPage.key,
    initialPageParam: options.initialPage,
    queryFn: ({ pageParam, signal }) =>
      fetchDescriptor(pageParam, {
        signal,
        staleTime: resolveFetchStaleTime(
          queryClient,
          options.initialPage.key,
          pageParam,
          options.staleTime
        ),
      }),
    getNextPageParam: (
      lastPage,
      allPages,
      lastPageDescriptor,
      allPageDescriptors
    ) =>
      options.getNextPage(
        buildPageContext(
          lastPage,
          allPages,
          lastPageDescriptor,
          allPageDescriptors
        )
      ),
    getPreviousPageParam: options.getPreviousPage
      ? (firstPage, allPages, firstPageDescriptor, allPageDescriptors) =>
          options.getPreviousPage?.(
            buildPageContext(
              firstPage,
              allPages,
              firstPageDescriptor,
              allPageDescriptors
            )
          )
      : undefined,
    select: (data) => data.pages,
    ...cacheTimeOptions(
      options.staleTime ?? options.initialPage.staleTime,
      options.gcTime ?? options.initialPage.gcTime
    ),
    maxPages: options.maxPages,
  });

  return {
    data: result.data,
    error: result.error,
    isFetching: result.isFetching,
    hasNextPage: result.hasNextPage ?? false,
    hasPreviousPage: result.hasPreviousPage ?? false,
    isFetchingNextPage: result.isFetchingNextPage,
    isFetchingPreviousPage: result.isFetchingPreviousPage,
    fetchNextPage: async () => {
      await result.fetchNextPage();
    },
    fetchPreviousPage: async () => {
      await result.fetchPreviousPage();
    },
    refetch: async () => {
      await result.refetch();
    },
  };
}

/** The cache scope a mutation started under: its QueryClient and that client's scope generation. */
type MutationScope = {
  queryClient: QueryClient;
  generation: number;
};

/**
 * The scope each mutation run started under, keyed by the context object
 * TanStack builds once per run and passes as the last argument to onMutate,
 * onSuccess, onError and onSettled. Recorded before the caller's onMutate
 * runs, so the callbacks find it even when that onMutate throws and TanStack
 * keeps no onMutate result.
 */
const mutationScopes = new WeakMap<MutationFunctionContext, MutationScope>();

/**
 * A queryCache whose writes do nothing once the cache scope (mock mode,
 * tenant, session) has changed since the mutation started, so a response or a
 * snapshot from the old scope never lands in the new scope's cache. Reads
 * still go through.
 */
function scopeBoundQueryCache(queryCache: QueryCache, scope: MutationScope): QueryCache {
  const scopeChanged = () => readQueryCacheScopeGeneration(scope.queryClient) !== scope.generation;
  return {
    get: queryCache.get,
    getState: queryCache.getState,
    set: (key, dataOrUpdater) => {
      if (!scopeChanged()) queryCache.set(key, dataOrUpdater);
    },
    cancel: (key) => (scopeChanged() ? Promise.resolve() : queryCache.cancel(key)),
    invalidate: (key) => (scopeChanged() ? Promise.resolve() : queryCache.invalidate(key)),
    invalidateMany: (filters) => (scopeChanged() ? Promise.resolve() : queryCache.invalidateMany(filters)),
    remove: (key) => {
      if (!scopeChanged()) queryCache.remove(key);
    },
  };
}

// The cache is built from the recorded QueryClient, not the latest render's,
// so the scope check and the writes always target the same client even when
// the provider swaps its QueryClient mid-flight. No scope only for a run that
// skipped onMutate (TanStack resuming a restored paused mutation).
function scopeBoundCallbackCtx(
  callbackCtx: MutationCallbackContext,
  scope: MutationScope | undefined
): MutationCallbackContext {
  return scope
    ? { queryCache: scopeBoundQueryCache(createQueryCache(scope.queryClient), scope) }
    : callbackCtx;
}

export function useFrontXMutation<
  TData = unknown,
  TError = Error,
  TVariables = void,
  TContext = unknown,
>(
  options: UseApiMutationOptions<TData, TError, TVariables, TContext>,
  callbackCtx: MutationCallbackContext
) {
  const queryClient = useRequiredFrontXQueryClient();

  const latestRef = useLatest({ options, callbackCtx, queryClient });
  const fetchAbortControllersRef = React.useRef<Set<AbortController>>(new Set());

  // Effect event: reads abortOnUnmount from the most recent render, not
  // whatever option value was current when the unmount effect was set up.
  const abortFetchesOnUnmount = React.useEffectEvent(() => {
    if (options.abortOnUnmount) {
      for (const controller of fetchAbortControllersRef.current) {
        controller.abort();
      }
      fetchAbortControllersRef.current.clear();
    }
  });

  React.useEffect(() => {
    return () => {
      abortFetchesOnUnmount();
    };
  }, []);

  const mutationFn = React.useCallback((variables: TVariables, context: MutationFunctionContext) => {
    const cancelOnSupersede = latestRef.current.options.cancelOnSupersede;
    if (cancelOnSupersede) {
      for (const controller of fetchAbortControllersRef.current) {
        controller.abort();
      }
      fetchAbortControllersRef.current.clear();
    }

    const controller = new AbortController();
    fetchAbortControllersRef.current.add(controller);

    const librarySignal = (context as MutationFunctionContext & { signal?: AbortSignal }).signal;
    if (cancelOnSupersede && librarySignal) {
      if (librarySignal.aborted) {
        controller.abort();
      } else {
        librarySignal.addEventListener('abort', () => controller.abort(), { once: true });
      }
    }

    return latestRef.current.options.endpoint
      .fetch(variables, { signal: controller.signal })
      .finally(() => {
        fetchAbortControllersRef.current.delete(controller);
      });
    // latestRef's identity never changes (useLatest returns a stable ref
    // object) — listing it satisfies exhaustive-deps without recreating this
    // callback on every render.
  }, [latestRef]);

  // onMutate always runs: it records the scope the mutation starts under,
  // and every callback gets a queryCache bound to that scope.
  const onMutate = React.useCallback(async (
    variables: TVariables,
    mutationFnContext: MutationFunctionContext
  ): Promise<TContext | undefined> => {
    const current = latestRef.current;
    const scope: MutationScope = {
      queryClient: current.queryClient,
      generation: readQueryCacheScopeGeneration(current.queryClient),
    };
    mutationScopes.set(mutationFnContext, scope);
    return current.options.onMutate?.(
      variables,
      scopeBoundCallbackCtx(current.callbackCtx, scope)
    );
    // latestRef's identity never changes - see mutationFn above.
  }, [latestRef]);

  const onSuccess = React.useCallback((
    data: TData,
    variables: TVariables,
    context: TContext | undefined,
    mutationFnContext: MutationFunctionContext
  ) => {
    const current = latestRef.current;
    return current.options.onSuccess?.(
      data,
      variables,
      context,
      scopeBoundCallbackCtx(current.callbackCtx, mutationScopes.get(mutationFnContext))
    );
    // latestRef's identity never changes - see mutationFn above.
  }, [latestRef]);

  const onError = React.useCallback((
    error: TError,
    variables: TVariables,
    context: TContext | undefined,
    mutationFnContext: MutationFunctionContext
  ) => {
    const current = latestRef.current;
    return current.options.onError?.(
      error,
      variables,
      context,
      scopeBoundCallbackCtx(current.callbackCtx, mutationScopes.get(mutationFnContext))
    );
    // latestRef's identity never changes - see mutationFn above.
  }, [latestRef]);

  const onSettled = React.useCallback((
    data: TData | undefined,
    error: TError | null,
    variables: TVariables,
    context: TContext | undefined,
    mutationFnContext: MutationFunctionContext
  ) => {
    const current = latestRef.current;
    return current.options.onSettled?.(
      data,
      error,
      variables,
      context,
      scopeBoundCallbackCtx(current.callbackCtx, mutationScopes.get(mutationFnContext))
    );
    // latestRef's identity never changes - see mutationFn above.
  }, [latestRef]);

  const mutation = useMutation<TData, TError, TVariables, TContext | undefined>({
    mutationFn,
    onMutate,
    onSuccess: options.onSuccess ? onSuccess : undefined,
    onError: options.onError ? onError : undefined,
    onSettled: options.onSettled ? onSettled : undefined,
  });

  return {
    mutate: mutation.mutate as (variables: TVariables) => void,
    mutateAsync: mutation.mutateAsync as (variables: TVariables) => Promise<TData>,
    isPending: mutation.isPending,
    error: mutation.error,
    data: mutation.data,
    reset: mutation.reset,
  };
}
