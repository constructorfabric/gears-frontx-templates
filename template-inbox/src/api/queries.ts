/**
 * Reading and writing through the API services from a component.
 *
 * `@gears-frontx/api` hands out endpoint *descriptors* - a stable cache key
 * plus a `fetch` - and leaves the caching to whoever consumes them. A server-
 * state library is one answer; for an app whose whole dataset is a handful of
 * reads and one write, it would be a dependency carrying an invalidation model
 * nothing here has an opinion about. So the two hooks below are the whole
 * answer instead, and a project that grows past them replaces this file with
 * its library of choice: the screens only ever see these two signatures.
 *
 * The request cache is what makes that honest. Several screens read the same
 * endpoints, React's StrictMode mounts every effect twice in development, and
 * a jump between screens remounts the tree - none of which should re-request
 * anything. Keying by the descriptor's own key means the dedupe survives all
 * three without a component knowing about it.
 *
 * The package also ships a shared fetch cache (`retainSharedFetchCache`, read
 * through `getOrFetch`). It is not used here, for two behaviours this app
 * relies on: it aborts a pending request the moment its last consumer
 * detaches, which StrictMode's mount-unmount-mount turns into an AbortError
 * for the remount, and its entries go stale after a fixed time instead of
 * living until a write invalidates them. The map below keeps a result for
 * the page's lifetime, aborts a request only once nobody has come back for it,
 * and forgets an entry when a mutation says so (`invalidates`).
 */

import { useEffect, useRef, useState } from 'react';
import type { EndpointDescriptor, MutationDescriptor } from '@gears-frontx/api';

export type QueryResult<TData> = {
  data: TData | undefined;
  error: Error | null;
  isLoading: boolean;
  /** Forgets the cached answer and asks again. */
  refetch: () => void;
};

const asError = (cause: unknown): Error =>
  cause instanceof Error ? cause : new Error(String(cause));

const cacheKeyOf = (key: readonly unknown[]): string => JSON.stringify(key);

type CacheEntry = {
  promise: Promise<unknown>;
  controller: AbortController;
  consumers: number;
  settled: boolean;
};

const cache = new Map<string, CacheEntry>();

/**
 * The request for a descriptor, started at most once per key until it is
 * invalidated, and the release its consumer calls on unmount.
 *
 * A rejected request is evicted so a later mount can retry rather than
 * replaying the same failure forever. A pending request nobody is waiting for
 * any more is aborted and evicted - but only after the current task, since
 * StrictMode's remount attaches again synchronously and must find it running.
 */
const subscribe = <TData>(
  descriptor: EndpointDescriptor<TData>
): { promise: Promise<TData>; release: () => void } => {
  const cacheKey = cacheKeyOf(descriptor.key);
  let entry = cache.get(cacheKey);

  if (entry === undefined) {
    const controller = new AbortController();
    const created: CacheEntry = {
      controller,
      consumers: 0,
      settled: false,
      promise: descriptor.fetch({ signal: controller.signal }).then(
        (data) => {
          created.settled = true;
          return data;
        },
        (cause: unknown) => {
          created.settled = true;
          if (cache.get(cacheKey) === created) cache.delete(cacheKey);
          throw asError(cause);
        }
      ),
    };
    cache.set(cacheKey, created);
    entry = created;
  }

  const attached = entry;
  attached.consumers += 1;
  let released = false;

  return {
    // The descriptor's own type is the only thing that ever wrote this key.
    promise: attached.promise as Promise<TData>,
    release: () => {
      if (released) return;
      released = true;
      attached.consumers -= 1;
      queueMicrotask(() => {
        if (attached.settled || attached.consumers > 0) return;
        if (cache.get(cacheKey) === attached) cache.delete(cacheKey);
        attached.controller.abort();
      });
    },
  };
};

/**
 * Forgets the cached answer for `key`, so the next consumer that mounts asks
 * again. A request still running for someone else keeps running; only the
 * cache stops handing it out.
 */
export const invalidateQuery = (key: readonly unknown[]): void => {
  cache.delete(cacheKeyOf(key));
};

/** Aborts everything in flight and empties the cache. For tests, between cases. */
export const resetQueryCache = (): void => {
  for (const entry of cache.values()) {
    if (!entry.settled) entry.controller.abort();
  }
  cache.clear();
};

type QueryState<TData> = {
  cacheKey: string;
  attempt: number;
  data: TData | undefined;
  error: Error | null;
  isLoading: boolean;
};

const loadingState = <TData>(cacheKey: string, attempt: number): QueryState<TData> => ({
  cacheKey,
  attempt,
  data: undefined,
  error: null,
  isLoading: true,
});

export function useApiQuery<TData>(descriptor: EndpointDescriptor<TData>): QueryResult<TData> {
  const cacheKey = cacheKeyOf(descriptor.key);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<QueryState<TData>>(() => loadingState(cacheKey, attempt));

  // A different request (or a retry) starts from loading, decided during
  // render: setting it from the effect would paint one frame of the previous
  // request's data under the new key.
  if (state.cacheKey !== cacheKey || state.attempt !== attempt) {
    setState(loadingState(cacheKey, attempt));
  }

  useEffect(() => {
    let current = true;
    const { promise, release } = subscribe(descriptor);
    promise.then(
      (data) => {
        if (current) setState({ cacheKey, attempt, data, error: null, isLoading: false });
      },
      (error: unknown) => {
        if (current) {
          setState({ cacheKey, attempt, data: undefined, error: asError(error), isLoading: false });
        }
      }
    );
    return () => {
      current = false;
      release();
    };
    // The descriptor is rebuilt on every render of the service getter, so the
    // key it carries - not its identity - is what says "this is a different
    // request"; `attempt` is what says "the same request again".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, attempt]);

  const refetch = () => {
    invalidateQuery(descriptor.key);
    setAttempt((previous) => previous + 1);
  };

  const current = state.cacheKey === cacheKey && state.attempt === attempt;
  return {
    data: current ? state.data : undefined,
    error: current ? state.error : null,
    isLoading: current ? state.isLoading : true,
    refetch,
  };
}

export type MutationResult<TVariables> = {
  mutate: (variables: TVariables) => void;
  /** True while any call this hook started is still running. */
  isPending: boolean;
  /** The failure of the most recent call, if it failed. */
  error: Error | null;
};

/**
 * Fire-and-report writes.
 *
 * Nothing is refetched in place: the caller folds the response into its own
 * state through `onSuccess`, which is what a screen wants from a write it
 * initiated. The reads the write changed are named in `invalidates` and
 * forgotten once it succeeds - also after the caller unmounted - so the next
 * screen to mount reads what the server now holds rather than the answer it
 * cached before the write.
 *
 * Each call reports through `onSuccess`/`onError` with the variables it was
 * made with, so a caller can tell overlapping calls apart. Neither callback,
 * nor any state update, runs after the component unmounted.
 */
export function useApiMutation<TData, TVariables>({
  endpoint,
  invalidates = [],
  onSuccess,
  onError,
}: {
  endpoint: MutationDescriptor<TData, TVariables>;
  invalidates?: readonly { readonly key: readonly unknown[] }[];
  onSuccess?: (data: TData, variables: TVariables) => void;
  onError?: (error: Error, variables: TVariables) => void;
}): MutationResult<TVariables> {
  const [pendingCount, setPendingCount] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const mounted = useRef(false);
  const latestCall = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const mutate = (variables: TVariables): void => {
    latestCall.current += 1;
    const call = latestCall.current;
    setPendingCount((count) => count + 1);
    setError(null);

    endpoint.fetch(variables).then(
      (data) => {
        for (const read of invalidates) invalidateQuery(read.key);
        if (!mounted.current) return;
        setPendingCount((count) => count - 1);
        onSuccess?.(data, variables);
      },
      (cause: unknown) => {
        if (!mounted.current) return;
        const failure = asError(cause);
        setPendingCount((count) => count - 1);
        if (call === latestCall.current) setError(failure);
        onError?.(failure, variables);
      }
    );
  };

  return { mutate, isPending: pendingCount > 0, error };
}
