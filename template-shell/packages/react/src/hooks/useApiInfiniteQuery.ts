/**
 * useApiInfiniteQuery - Declarative paginated data fetching hook
 *
 * Accepts an initial EndpointDescriptor plus descriptor resolvers for adjacent
 * pages. Each page remains a standard service descriptor so MFE code does not
 * need raw TanStack query keys or query functions.
 */

import type { EndpointDescriptor } from '@gears-frontx/framework';
import type { ApiInfiniteQueryResult } from '../types';
import type { ApiQueryCacheOverrides } from './useApiQuery';
import { useFrontXInfiniteQuery } from '../queryClient';

export interface ApiInfiniteQueryPageContext<TPage> {
  page: TPage;
  pages: readonly TPage[];
  descriptor: EndpointDescriptor<TPage>;
  descriptors: readonly EndpointDescriptor<TPage>[];
}

/** Options shared by useApiInfiniteQuery and useApiSuspenseInfiniteQuery. */
export interface ApiInfiniteQueryBaseOptions<TPage> extends ApiQueryCacheOverrides {
  /** Descriptor for the first page in the sequence. */
  initialPage: EndpointDescriptor<TPage>;
  /**
   * Resolve the next page descriptor from the current page payload.
   * Return undefined when there is no next page.
   */
  getNextPage: (
    context: ApiInfiniteQueryPageContext<TPage>
  ) => EndpointDescriptor<TPage> | undefined;
  /**
   * Resolve the previous page descriptor from the current first page payload.
   * Return undefined when backward pagination is not available.
   */
  getPreviousPage?: (
    context: ApiInfiniteQueryPageContext<TPage>
  ) => EndpointDescriptor<TPage> | undefined;
  /** Optional TanStack maxPages passthrough for bounded page windows. */
  maxPages?: number;
}

/** Options for useApiSuspenseInfiniteQuery. */
export interface ApiSuspenseInfiniteQueryOptions<TPage> extends ApiInfiniteQueryBaseOptions<TPage> {
  /** A suspense query always runs; use useApiInfiniteQuery to hold one back. */
  enabled?: never;
}

export interface ApiInfiniteQueryOptions<TPage> extends ApiInfiniteQueryBaseOptions<TPage> {
  /**
   * `false` keeps the query idle: no page is fetched until it turns `true`.
   * Defaults to `true`.
   */
  enabled?: boolean;
}

export function useApiInfiniteQuery<TPage = unknown, TError = Error>(
  options: ApiInfiniteQueryOptions<TPage>
): ApiInfiniteQueryResult<TPage, TError> {
  return useFrontXInfiniteQuery<TPage, TError>(options);
}
