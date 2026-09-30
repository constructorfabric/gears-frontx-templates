/**
 * The mail screen's app, created once when the lifecycle module loads.
 *
 * Services are registered before `build()`: the `mock()` plugin switches the
 * mock plugins of the services already registered. The mail screen reads one,
 * its own mail service, answered from the page-wide mail mock state; it
 * registers no inbox service and bundles no inbox seed. `enabledByDefault:
 * true` because this template ships no backend; see `registerInboxApi` for
 * the switch a project with one turns off. `queryCacheShared()` joins the
 * host-owned QueryClient, which a mounted MFE must do; there is no
 * `queryCache()` or `QueryClientProvider` here.
 */
import { apiRegistry, createFrontX, effects, mock, queryCacheShared } from '@gears-frontx/react';
import { registerMailApi } from './api/registerMailApi';

registerMailApi();
apiRegistry.initialize();

export const mfeApp = createFrontX().use(effects()).use(queryCacheShared()).use(mock({ enabledByDefault: true })).build();
