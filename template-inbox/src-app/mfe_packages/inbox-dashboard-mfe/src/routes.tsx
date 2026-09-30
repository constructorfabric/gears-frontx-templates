import { createRootRoute, createRoute } from '@gears-frontx/routing-tanstack';
import { useInboxT } from '@inbox-shared/lifecycle/screenContext';
import { ScreenNotFound, SinglePageRoot } from '@inbox-shared/ui/ScreenRoutes';
import { DashboardScreen } from './screen/DashboardScreen';

/**
 * The screen's own routes, inside the entry the shell addressed for it: `/`
 * alone, the overview. An address with anything after the screen's token
 * (`?screen=dashboard;route=x`) names no page of it and gets the screen's
 * own not-found, as in every inbox screen. The overview is the index
 * route's component: there is no page to keep mounted behind another, so the
 * not-found replaces the overview instead of sitting under it.
 */
function DashboardOverview() {
  const t = useInboxT();
  return <DashboardScreen t={t} />;
}

const rootRoute = createRootRoute({
  component: SinglePageRoot,
  notFoundComponent: () => <ScreenNotFound testId="dashboard-route-not-found" />,
});

const overviewRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: DashboardOverview });

export const dashboardRouteTree = rootRoute.addChildren([overviewRoute]);
