/**
 * useApiSuspenseQuery - Suspense declarative data fetching hook
 *
 * Mirrors useApiQuery but integrates with React Suspense so the initial load is
 * handled by a Suspense boundary.
 */

import type { EndpointDescriptor } from '@gears-frontx/framework';
import type { ApiSuspenseQueryResult } from '../types';
import type { ApiQueryOverrides } from './useApiQuery';
import { useFrontXSuspenseQuery } from '../queryClient';

export function useApiSuspenseQuery<TData = unknown, TError = Error>(
  descriptor: EndpointDescriptor<TData>,
  overrides?: ApiQueryOverrides
): ApiSuspenseQueryResult<TData, TError> {
  return useFrontXSuspenseQuery<TData, TError>(descriptor, overrides);
}
