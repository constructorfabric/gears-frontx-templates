/**
 * useApiQuery - Declarative data fetching hook
 *
 * Accepts an EndpointDescriptor from @gears-frontx/api and returns a Gears FrontX-owned
 * ApiQueryResult. AbortSignal for request cancellation is threaded automatically
 * through the shared QueryClient integration.
 *
 * Cache config cascade: component overrides > descriptor defaults > plugin defaults.
 * Omit overrides to rely on the descriptor's staleTime/gcTime, which in turn
 * fall back to the plugin-level query-cache defaults.
 */

import type { EndpointDescriptor } from '@gears-frontx/framework';
import type { ApiQueryResult } from '../types';
import { useFrontXQuery } from '../queryClient';

/** Per-call cache overrides. Cascade: these > descriptor > plugin defaults. */
export interface ApiQueryOverrides {
  /** Override staleTime for this specific call site. */
  staleTime?: number;
  /** Override gcTime for this specific call site. */
  gcTime?: number;
}

export function useApiQuery<TData = unknown, TError = Error>(
  descriptor: EndpointDescriptor<TData>,
  overrides?: ApiQueryOverrides
): ApiQueryResult<TData, TError> {
  return useFrontXQuery(descriptor, overrides);
}
