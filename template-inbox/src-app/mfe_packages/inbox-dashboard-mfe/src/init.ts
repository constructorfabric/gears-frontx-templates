/**
 * The dashboard screen's app, created once when the lifecycle module loads.
 *
 * Services are registered before `build()`: the `mock()` plugin switches the
 * mock plugins of the services already registered. The dashboard reads two:
 * its own overview and the inbox's contacts, whose people the activity table
 * names. `enabledByDefault: true` because this template ships no backend; see
 * `registerInboxApi` for the switch a project with one turns off.
 * `queryCacheShared()` joins the host-owned QueryClient, which a mounted MFE
 * must do; there is no `queryCache()` or `QueryClientProvider` here.
 */
import { apiRegistry, createFrontX, effects, mock, queryCacheShared } from '@gears-frontx/react';
import { registerInboxApi } from '@inbox-shared/api/registry';
import { registerDashboardApi } from './api/registerDashboardApi';

registerInboxApi();
registerDashboardApi();
apiRegistry.initialize();

export const mfeApp = createFrontX().use(effects()).use(queryCacheShared()).use(mock({ enabledByDefault: true })).build();
