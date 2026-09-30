import { InboxScreenLifecycle } from '@inbox-shared/lifecycle/InboxScreenLifecycle';
import { dashboardCatalogues } from './i18n/catalogues';
import { mfeApp } from './init';
import { dashboardRouteTree } from './routes';

/** The dashboard screen: KPIs, charts and the recent activity table. */
export class DashboardLifecycle extends InboxScreenLifecycle {
  constructor() {
    super(mfeApp, { catalogues: dashboardCatalogues, routeTree: dashboardRouteTree });
  }
}

/** Module Federation expects a default export with `mount` and `unmount`. */
export default new DashboardLifecycle();
