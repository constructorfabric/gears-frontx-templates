/**
 * Dashboard domain - API service.
 *
 * A sibling of `InboxApiService`, built from the same primitives. One
 * difference: the dashboard is a single coherent view rather than a set of
 * independently-browsable collections, so it exposes one endpoint
 * (`getDashboard`) that answers with every section's data together, instead
 * of one endpoint per section. A project that grows the dashboard into
 * something with independently loading widgets can split this the same way
 * `InboxApiService`'s own doc comment describes splitting a service in two.
 */

import { BaseApiService, RestEndpointProtocol, RestProtocol } from '@gears-frontx/api';
import { dashboardMockMap } from './dashboardMocks';
import { RestMockPlugin } from '@inbox-shared/api/RestMockPlugin';
import type { GetDashboardResponse } from '@inbox-shared/api/dashboardTypes';

export class DashboardApiService extends BaseApiService {
  constructor() {
    const restProtocol = new RestProtocol({ timeout: 30000 });
    const restEndpoints = new RestEndpointProtocol(restProtocol);

    super({ baseURL: '/api/dashboard' }, restProtocol, restEndpoints);

    // Declares the mock plugin without switching it on: whether mocks answer is
    // decided by the `mock()` plugin in the package's `init.ts`.
    this.registerPlugin(restProtocol, new RestMockPlugin({ mockMap: dashboardMockMap, delay: 100 }));
  }

  readonly getDashboard =
    this.protocol(RestEndpointProtocol).query<GetDashboardResponse>('/overview');
}
