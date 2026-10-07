import { vi } from 'vitest';
import { createApiMocks } from '@inbox-shared/test-support/apiMocks';
import { contacts } from '@inbox-shared/api/dataset';
import { createDashboardOverview } from '../api/dashboardMocks';

/**
 * The query-layer stand-ins of this package's screen suites
 * (`@inbox-shared/test-support/apiMocks`), over the two endpoints the screen reads: the dashboard overview and the inbox's
 * contacts. The dashboard writes nothing.
 */
export const {
  endpointTags,
  queryResultFor,
  setQueryState,
  refetchCalls,
  mutationResult,
  mutateMocks,
  setMutationPending,
  latestMutation,
  latestVariables,
  succeedMutation,
  resetApiMocks,
} = createApiMocks({
  endpoints: {
    getDashboard: 'dashboard',
    getContacts: 'contacts',
  },
  responses: {
    dashboard: createDashboardOverview(),
    contacts: { contacts },
  },
  mutations: [],
  fn: vi.fn,
});
