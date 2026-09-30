import { createRootRoute, createRoute } from '@gears-frontx/routing-tanstack';
import { useInboxT } from '@inbox-shared/lifecycle/screenContext';
import { ScreenNotFound, SinglePageRoot } from '@inbox-shared/ui/ScreenRoutes';
import { MailScreen } from './screen/mail/MailScreen';

/**
 * The screen's own routes, inside the entry the shell addressed for it: `/`
 * alone, the mail. The open mailbox and mail live in `mailStore`, not in
 * the address, so coming back from another screen returns to them without
 * the address naming them. An address with anything after the screen's token
 * (`?screen=mail;route=x`) names no page of it and gets the screen's own
 * not-found in place of the mail.
 */
function MailPage() {
  const t = useInboxT();
  return <MailScreen t={t} />;
}

const rootRoute = createRootRoute({
  component: SinglePageRoot,
  notFoundComponent: () => <ScreenNotFound testId="mail-route-not-found" />,
});

const mailRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: MailPage });

export const mailRouteTree = rootRoute.addChildren([mailRoute]);
