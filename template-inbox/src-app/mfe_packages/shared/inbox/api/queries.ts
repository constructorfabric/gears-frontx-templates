/**
 * Reading and writing through the API services from a component.
 *
 * `@gears-frontx/api` hands out endpoint *descriptors* - a stable cache key
 * plus a `fetch` - and leaves the caching to whoever consumes them. A server-
 * state library is one answer; for an app whose whole dataset is a handful of
 * reads and three writes, it would be a dependency carrying an invalidation model
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
 * through `getOrFetch`), which the shell retains page-wide and every screen
 * package's GET goes through. This cache does not keep answers in it: every
 * request below asks for `staleTime: 0`, so a settled answer is never served
 * from it, for two behaviours of its own: it aborts a pending request the
 * moment its last consumer detaches, which StrictMode's mount-unmount-mount
 * turns into an AbortError for the remount, and its entries go stale after a
 * fixed time instead of living until a write invalidates them. The map below
 * keeps a result for the page's lifetime, aborts a request only once nobody
 * has come back for it, and forgets an entry when a mutation says so
 * (`invalidates`). A request still pending in the shared cache is joined
 * whatever `staleTime` asks, so when this cache replaces one of its own
 * requests that predates a write, it also evicts the key there
 * (`invalidate`), and the older request's waiters take the newer answer.
 *
 * Each screen package bundles its own copy of this module, so each has its
 * own cache, while the mock backend behind them is one per page
 * (`mockStore.ts`). A write made in one screen would leave another screen's
 * cache answering from before it. `setQueryCacheEpoch` is the seam for that:
 * it names a counter that moves whenever the data behind the cache changed
 * outside it (the mock store's revision), and the cache drops its settled
 * answers the next time it is read under a different value. A write this
 * cache made itself is already accounted for by `invalidates`, so its own
 * success moves the cache past its own revision instead of dropping
 * everything - but only past its own: a write another screen made meanwhile
 * still drops the lot. A request that was running when the epoch moved
 * answers whoever waited for it and is not kept, since it may predate the
 * write; a mount after the move starts a request of its own instead of
 * joining it, here or in the shared fetch cache.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { peekSharedFetchCache } from '@gears-frontx/api';
import type { EndpointDescriptor, MutationDescriptor } from '@gears-frontx/react';

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
  /** The epoch the request started under; a mount under another epoch does not attach to it. */
  startedAt: number;
  /** The answer, once the request succeeded, so a later mount can paint it without waiting a tick. */
  resolved?: { data: unknown };
  /** The request that replaced this one while it ran; a failure here answers with that one's result. */
  supersededBy?: Promise<unknown>;
};

const cache = new Map<string, CacheEntry>();

/**
 * Every request still running, by key, including one `cache` no longer hands
 * out (evicted by an epoch move or by `invalidates`): the one a new request
 * for the key replaces.
 */
const inFlight = new Map<string, CacheEntry>();

let readEpoch: () => number = () => 0;
let cacheEpoch = 0;

/**
 * Names the counter the cache is valid for. Called once per package at
 * start-up (`registerInboxApi` wires the mock store's revision); without a
 * call the epoch never moves and the cache behaves as a plain page-lifetime
 * cache.
 */
export const setQueryCacheEpoch = (read: () => number): void => {
  readEpoch = read;
  cacheEpoch = read();
};

/**
 * Drops every settled answer when the epoch moved since the cache last looked.
 * A request still running keeps its entry: whoever is waiting for it gets the
 * answer it asked for, and the next mount after it settles asks again only if
 * the epoch moves once more.
 */
const syncEpoch = (): void => {
  const current = readEpoch();
  if (current === cacheEpoch) return;
  cacheEpoch = current;
  for (const [cacheKey, entry] of cache) {
    if (entry.settled) cache.delete(cacheKey);
  }
};

/**
 * The epoch a write starts under, with the cache brought onto it first, so
 * `adoptOwnWrite` can later tell this write's revision from anyone else's.
 */
const beginOwnWrite = (): number => {
  syncEpoch();
  return cacheEpoch;
};

/**
 * Accounts for a write this cache made itself, before its `invalidates` run.
 * Exactly one revision past the epoch the write started under, with the cache
 * still on that epoch, is that write alone: the cache moves past it keeping
 * every other answer. Anything else - another screen wrote too, or a read
 * meanwhile already moved the cache - drops everything settled as for any
 * foreign write.
 */
const adoptOwnWrite = (startedAt: number): void => {
  if (readEpoch() === startedAt + 1 && cacheEpoch === startedAt) {
    cacheEpoch = startedAt + 1;
    return;
  }
  syncEpoch();
};

/**
 * The request for a descriptor, started at most once per key until it is
 * invalidated, and the release its consumer calls on unmount.
 *
 * A rejected request is evicted so a later mount can retry rather than
 * replaying the same failure forever. A pending request nobody is waiting for
 * any more is aborted and evicted - but only after the current task, since
 * StrictMode's remount attaches again synchronously and must find it running.
 * A request still running from before the epoch moved is not joined: it may
 * answer with data from before a write, so the mount starts its own request
 * and the older one answers only whoever already waits for it. The same goes
 * for the shared fetch cache below: the older request is evicted there
 * before the new one starts, so the new one does not attach to it. Eviction
 * aborts the older request, and a request that fails once replaced answers
 * its waiters with the newer request's result instead.
 */
const subscribe = <TData>(
  descriptor: EndpointDescriptor<TData>
): { promise: Promise<TData>; release: () => void } => {
  syncEpoch();
  const cacheKey = cacheKeyOf(descriptor.key);
  let entry = cache.get(cacheKey);

  if (entry === undefined || (!entry.settled && entry.startedAt !== cacheEpoch)) {
    const replaced = inFlight.get(cacheKey);
    if (replaced !== undefined) peekSharedFetchCache()?.invalidate(descriptor.key);
    const controller = new AbortController();
    const startedAt = cacheEpoch;
    const created: CacheEntry = {
      controller,
      consumers: 0,
      settled: false,
      startedAt,
      // `staleTime: 0`: under the shell, `@gears-frontx/api` answers a GET
      // from the page-wide fetch cache the host retains (`frontx:fetch-cache`,
      // 30 s by default), which every screen package shares. A settled
      // answer kept there would survive another screen's write, so none is
      // served; a pending one is still joined, which the eviction above
      // covers for this cache's own requests.
      promise: descriptor.fetch({ signal: controller.signal, staleTime: 0 }).then(
        (data) => {
          created.settled = true;
          if (inFlight.get(cacheKey) === created) inFlight.delete(cacheKey);
          // Answered after the data behind it changed: whoever waited gets
          // what they asked for, but the next reader asks again.
          if (readEpoch() !== startedAt) {
            if (cache.get(cacheKey) === created) cache.delete(cacheKey);
            return data;
          }
          created.resolved = { data };
          return data;
        },
        (cause: unknown) => {
          created.settled = true;
          if (inFlight.get(cacheKey) === created) inFlight.delete(cacheKey);
          if (cache.get(cacheKey) === created) cache.delete(cacheKey);
          if (created.supersededBy !== undefined) return created.supersededBy;
          throw asError(cause);
        }
      ),
    };
    if (replaced !== undefined) replaced.supersededBy = created.promise;
    inFlight.set(cacheKey, created);
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
  inFlight.clear();
  cacheEpoch = readEpoch();
};

type QueryState<TData> = {
  cacheKey: string;
  attempt: number;
  data: TData | undefined;
  error: Error | null;
  isLoading: boolean;
};

/**
 * Where a request starts: from the cached answer when the cache holds one, so
 * a screen that comes back to data it already read paints it on its first
 * render instead of flashing its loading state for a tick; from loading
 * otherwise.
 */
const initialState = <TData>(cacheKey: string, attempt: number): QueryState<TData> => {
  // Read-only, because it runs during render, which React may throw away: a
  // cached answer from before the epoch moved is simply not used here, and
  // `subscribe` in the effect is what evicts it.
  const resolved = readEpoch() === cacheEpoch ? cache.get(cacheKey)?.resolved : undefined;
  return resolved === undefined
    ? { cacheKey, attempt, data: undefined, error: null, isLoading: true }
    : // The descriptor's own type is the only thing that ever wrote this key.
      { cacheKey, attempt, data: resolved.data as TData, error: null, isLoading: false };
};

export function useApiQuery<TData>(descriptor: EndpointDescriptor<TData>): QueryResult<TData> {
  const cacheKey = cacheKeyOf(descriptor.key);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<QueryState<TData>>(() => initialState(cacheKey, attempt));

  // A different request (or a retry) starts over, decided during render:
  // setting it from the effect would paint one frame of the previous
  // request's data under the new key.
  if (state.cacheKey !== cacheKey || state.attempt !== attempt) {
    setState(initialState(cacheKey, attempt));
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
 * nor any state update, runs after the component unmounted. `afterSuccess` is
 * the one exception: it runs on every success, mounted or not, for state that
 * outlives the component (a module-level store), so a write that lands after
 * the user left the screen still settles what the store holds. If it throws,
 * the call settles as failed: `error` and `onError` carry what it threw, and
 * `onSuccess` is not called.
 */
export function useApiMutation<TData, TVariables>(options: {
  endpoint: MutationDescriptor<TData, TVariables>;
  invalidates?: readonly { readonly key: readonly unknown[] }[];
  onSuccess?: (data: TData, variables: TVariables) => void;
  onError?: (error: Error, variables: TVariables) => void;
  afterSuccess?: (data: TData, variables: TVariables) => void;
}): MutationResult<TVariables> {
  const [pendingCount, setPendingCount] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const mounted = useRef(false);
  const latestCall = useRef(0);
  // The options of the latest render, read when a call settles rather than
  // when it starts: a callback that closes over state sees the state of the
  // moment the answer arrives, and `mutate` itself can stay one function for
  // the component's lifetime.
  const latestOptions = useRef(options);

  useEffect(() => {
    latestOptions.current = options;
  });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const mutate = useCallback((variables: TVariables): void => {
    latestCall.current += 1;
    const call = latestCall.current;
    setPendingCount((count) => count + 1);
    setError(null);
    const startedAt = beginOwnWrite();

    latestOptions.current.endpoint.fetch(variables).then(
      (data) => {
        // This write moved the epoch and `invalidates` forgets what it
        // changed, so the rest of the cache stays valid - unless another
        // screen wrote meanwhile, which `adoptOwnWrite` tells apart.
        adoptOwnWrite(startedAt);
        for (const read of latestOptions.current.invalidates ?? []) invalidateQuery(read.key);
        // A throwing afterSuccess must neither leave the call pending nor
        // escape as an unhandled rejection: this handler is the promise's
        // last one. It is reported like a failed call; once the caller has
        // unmounted, there is nobody left to report it to.
        let afterSuccessFailure: Error | null = null;
        try {
          latestOptions.current.afterSuccess?.(data, variables);
        } catch (cause) {
          afterSuccessFailure = asError(cause);
        }
        if (!mounted.current) return;
        setPendingCount((count) => count - 1);
        if (afterSuccessFailure === null) {
          latestOptions.current.onSuccess?.(data, variables);
          return;
        }
        if (call === latestCall.current) setError(afterSuccessFailure);
        latestOptions.current.onError?.(afterSuccessFailure, variables);
      },
      (cause: unknown) => {
        if (!mounted.current) return;
        const failure = asError(cause);
        setPendingCount((count) => count - 1);
        if (call === latestCall.current) setError(failure);
        latestOptions.current.onError?.(failure, variables);
      }
    );
  }, []);

  return { mutate, isPending: pendingCount > 0, error };
}
