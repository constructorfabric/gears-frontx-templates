/**
 * useApiQuery - Declarative data fetching hook
 *
 * Accepts an EndpointDescriptor from @gears-frontx/api and returns a Gears FrontX-owned
 * ApiQueryResult. AbortSignal for request cancellation is threaded automatically
 * through the shared QueryClient integration.
 *
 * Cache config cascade: component overrides > descriptor defaults > plugin defaults.
 * Omit overrides to rely on the descriptor's staleTime/gcTime, which in turn
 * fall back to the plugin-level query-cache defaults, so a screen that remounts
 * within staleTime paints from cache without refetching.
 *
 * Pass `enabled: false` to hold a query whose input is not known yet.
 */

import type { EndpointDescriptor } from '@gears-frontx/framework';
import type { ApiQueryResult } from '../types';
import { useFrontXQuery } from '../queryClient';

/**
 * Per-call cache overrides shared by every read hook.
 * Cascade: these > descriptor > plugin defaults.
 */
export interface ApiQueryCacheOverrides {
  /** Override staleTime for this specific call site. */
  staleTime?: number;
  /** Override gcTime for this specific call site. */
  gcTime?: number;
}

/** Per-call overrides for useApiSuspenseQuery. */
export interface ApiSuspenseQueryOverrides extends ApiQueryCacheOverrides {
  /** A suspense query always runs; use useApiQuery to hold one back. */
  enabled?: never;
}

/** Per-call overrides for useApiQuery. */
export interface ApiQueryOverrides extends ApiQueryCacheOverrides {
  /**
   * `false` keeps the query idle: nothing is fetched and `isLoading` stays
   * false until it turns `true`. Defaults to `true`.
   */
  enabled?: boolean;
}

export function useApiQuery<TData = unknown, TError = Error>(
  descriptor: EndpointDescriptor<TData>,
  overrides?: ApiQueryOverrides
): ApiQueryResult<TData, TError> {
  return useFrontXQuery(descriptor, overrides);
}
