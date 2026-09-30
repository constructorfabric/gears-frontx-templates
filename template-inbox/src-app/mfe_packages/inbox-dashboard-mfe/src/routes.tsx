import { createRootRoute, createRoute, Outlet } from '@gears-frontx/routing-tanstack';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@gears-frontx/ui-kit';
import { useInboxT } from '@inbox-shared/lifecycle/screenContext';
import { useRouteFocus } from '@inbox-shared/lifecycle/useRouteFocus';
import { ScreenHeading } from '@inbox-shared/ui/ScreenHeading';
import sharedStyles from '@inbox-shared/ui/shared.module.css';
import { DashboardScreen } from './screen/DashboardScreen';

/**
 * The screen's own routes, inside the entry the shell addressed for it: `/`
 * alone, the overview. An address with anything after the screen's token
 * (`?screen=dashboard;route=x`) names no page of it and gets the screen's
 * own not-found, as in every inbox screen. Unlike contacts, the overview is
 * the index route's rather than the root's: there is no page to keep mounted
 * behind another, so the not-found replaces the overview instead of sitting
 * under it.
 */
function DashboardRoot() {
  // One page, so the key never changes; the call keeps the screen on the same
  // focus rule as the others should it grow a second route.
  useRouteFocus('');
  return <Outlet />;
}

function DashboardOverview() {
  const t = useInboxT();
  return <DashboardScreen t={t} />;
}

/** An address inside this screen that names no page of it. */
function DashboardNotFound() {
  const t = useInboxT();
  return (
    <div className={sharedStyles.emptyPane} data-testid="dashboard-route-not-found">
      <Empty>
        <EmptyHeader>
          <EmptyTitle>
            <ScreenHeading className={sharedStyles.inlineHeading}>{t('page_not_found_title')}</ScreenHeading>
          </EmptyTitle>
          <EmptyDescription>{t('page_not_found_description')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}

const rootRoute = createRootRoute({ component: DashboardRoot, notFoundComponent: DashboardNotFound });

const overviewRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: DashboardOverview });

export const dashboardRouteTree = rootRoute.addChildren([overviewRoute]);
