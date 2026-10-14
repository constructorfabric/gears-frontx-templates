/**
 * useApiSuspenseInfiniteQuery - Suspense paginated data fetching hook
 *
 * Mirrors useApiInfiniteQuery but integrates with React Suspense so the initial
 * page load is handled by a Suspense boundary while pagination stays
 * descriptor-driven.
 */

import type { ApiSuspenseInfiniteQueryResult } from '../types';
import type { ApiSuspenseInfiniteQueryOptions } from './useApiInfiniteQuery';
import { useFrontXSuspenseInfiniteQuery } from '../queryClient';

export function useApiSuspenseInfiniteQuery<TPage = unknown, TError = Error>(
  options: ApiSuspenseInfiniteQueryOptions<TPage>
): ApiSuspenseInfiniteQueryResult<TPage, TError> {
  return useFrontXSuspenseInfiniteQuery<TPage, TError>(options);
}
