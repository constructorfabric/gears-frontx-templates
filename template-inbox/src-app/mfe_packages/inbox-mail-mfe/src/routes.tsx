import { createRootRoute, createRoute, Outlet } from '@gears-frontx/routing-tanstack';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@gears-frontx/ui-kit';
import { useInboxT } from '@inbox-shared/lifecycle/screenContext';
import { useRouteFocus } from '@inbox-shared/lifecycle/useRouteFocus';
import { ScreenHeading } from '@inbox-shared/ui/ScreenHeading';
import sharedStyles from '@inbox-shared/ui/shared.module.css';
import { MailScreen } from './screen/mail/MailScreen';

/**
 * The screen's own routes, inside the entry the shell addressed for it: `/`
 * alone, the mail. The open mailbox and mail live in `mailStore`, not in
 * the address, so coming back from another screen returns to them without
 * the address naming them. An address with anything after the screen's token
 * (`?screen=mail;route=x`) names no page of it and gets the screen's own
 * not-found in place of the mail.
 */
function MailRoot() {
  // One page, so the key never changes; the call keeps the screen on the same
  // focus rule as the others should it grow a second route.
  useRouteFocus('');
  return <Outlet />;
}

function MailPage() {
  const t = useInboxT();
  return <MailScreen t={t} />;
}

/** An address inside this screen that names no page of it. */
function MailNotFound() {
  const t = useInboxT();
  return (
    <div className={sharedStyles.emptyPane} data-testid="mail-route-not-found">
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

const rootRoute = createRootRoute({ component: MailRoot, notFoundComponent: MailNotFound });

const mailRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: MailPage });

export const mailRouteTree = rootRoute.addChildren([mailRoute]);
