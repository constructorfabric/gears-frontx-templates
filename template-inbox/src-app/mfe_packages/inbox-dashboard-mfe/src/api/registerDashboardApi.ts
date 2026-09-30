/**
 * Registration of the dashboard's own API service, beside the shared
 * registrars in `@inbox-shared/api/registry`.
 *
 * The service and its seed live in this package because no other screen
 * reads them; the one part of the overview another screen shares, the people
 * the activity rows point at, comes from the page-wide mock store
 * (`dashboardMocks.ts`). Called from `init.ts` before `createFrontX().build()`,
 * for the same reason as `registerInboxApi`: the `mock()` plugin switches the
 * mock plugins of the services already registered when the app is built.
 */

import { apiRegistry } from '@gears-frontx/react';
import { DashboardApiService } from './DashboardApiService';

/** Registers the overview service. Idempotent. */
export function registerDashboardApi(): void {
  if (apiRegistry.has(DashboardApiService)) return;
  apiRegistry.register(DashboardApiService);
}

export const getDashboardApi = (): DashboardApiService => apiRegistry.getService(DashboardApiService);
