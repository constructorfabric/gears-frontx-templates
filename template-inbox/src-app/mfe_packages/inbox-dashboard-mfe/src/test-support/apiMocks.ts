import { contacts } from '@inbox-shared/api/dataset';
import { createDashboardOverview } from '../api/dashboardMocks';

/**
 * Stands in for the whole query layer of the dashboard screen.
 *
 * Each endpoint descriptor is replaced by a tag, and `useApiQuery` answers
 * from the seeded datasets by that tag. The screen is therefore tested
 * against the content this template actually ships, without standing the API
 * services, their protocols and their mock plugins up around it. The map
 * covers the two endpoints the screen reads: the dashboard overview and the
 * inbox's contacts.
 *
 * A suite can make a tag fail or stay loading (`setQueryState`) to reach the
 * screen's error and loading states, and reads the refetches the screen asked
 * for (`refetchCalls`). `resetApiMocks` puts both back; call it after each
 * test.
 */
export const endpointTags = {
  getDashboard: { tag: 'dashboard' },
  getContacts: { tag: 'contacts' },
} as const;

type EndpointTag = (typeof endpointTags)[keyof typeof endpointTags]['tag'];

const RESPONSES: Record<EndpointTag, unknown> = {
  dashboard: createDashboardOverview(),
  contacts: { contacts },
};

const isQueryTag = (value: string): value is EndpointTag => value in RESPONSES;

/**
 * The tag a stand-in descriptor carries. An endpoint this map does not know
 * throws rather than answering `undefined`: a suite wired to the wrong
 * endpoint would otherwise render an empty state and still pass.
 */
const tagOf = (endpoint: unknown): EndpointTag => {
  // `in` narrows an `unknown` object to one carrying the key, so the read
  // below needs no assertion about a shape this module made up itself.
  const tag =
    typeof endpoint === 'object' && endpoint !== null && 'tag' in endpoint && typeof endpoint.tag === 'string'
      ? endpoint.tag
      : String(endpoint);
  if (!isQueryTag(tag)) {
    throw new Error(`apiMocks: no seeded response for endpoint "${tag}"`);
  }
  return tag;
};

type QueryState = { error: Error } | { isLoading: true };

const queryStates = new Map<EndpointTag, QueryState>();

/** Tags whose `refetch` the screen called, in call order. */
export const refetchCalls: EndpointTag[] = [];

/** Makes every query on `tag` fail with `error`, or stay loading. */
export const setQueryState = (tag: EndpointTag, state: QueryState): void => {
  queryStates.set(tag, state);
};

export const queryResultFor = (endpoint: unknown) => {
  const tag = tagOf(endpoint);
  const state = queryStates.get(tag);
  const refetch = () => {
    refetchCalls.push(tag);
  };
  if (state !== undefined && 'error' in state) {
    return { data: undefined, error: state.error, isLoading: false, refetch };
  }
  if (state !== undefined) {
    return { data: undefined, error: null, isLoading: true, refetch };
  }
  return { data: RESPONSES[tag], error: null, isLoading: false, refetch };
};

export const resetApiMocks = (): void => {
  queryStates.clear();
  refetchCalls.length = 0;
};
