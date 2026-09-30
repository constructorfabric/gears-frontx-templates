import { createRootRoute, createRoute, Outlet, useParams } from '@gears-frontx/routing-tanstack';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@gears-frontx/ui-kit';
import { useInboxT } from '@inbox-shared/lifecycle/screenContext';
import { useRouteFocus } from '@inbox-shared/lifecycle/useRouteFocus';
import { ScreenHeading } from '@inbox-shared/ui/ScreenHeading';
import sharedStyles from '@inbox-shared/ui/shared.module.css';
import { ContactsScreen } from './screen/ContactsScreen';

/**
 * The screen's own routes, inside the entry the shell addressed for it:
 *
 * - `/` - the directory;
 * - `/$contactId` - a person's page, `?screen=contacts;route=r-42` in the
 *   page address.
 *
 * Both render one `ContactsScreen`, from a pathless layout route above them,
 * and the two child routes only name the address. That is what keeps the
 * directory mounted behind a person's page: its filter, search, sort order
 * and table page are still there on the way back. An address neither child
 * matches never reaches the layout, so the not-found page stands alone
 * rather than under the directory.
 */
function ContactsLayout() {
  const t = useInboxT();
  const { contactId } = useParams({ strict: false });
  useRouteFocus(contactId ?? '');
  return (
    <>
      <ContactsScreen openContactId={contactId ?? null} t={t} />
      <Outlet />
    </>
  );
}

/** An address inside this screen that names no page of it. */
function ContactsNotFound() {
  const t = useInboxT();
  return (
    <div className={sharedStyles.emptyPane} data-testid="contacts-route-not-found">
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

const rootRoute = createRootRoute({ component: Outlet, notFoundComponent: ContactsNotFound });

const layoutRoute = createRoute({ getParentRoute: () => rootRoute, id: 'contacts', component: ContactsLayout });

const directoryRoute = createRoute({ getParentRoute: () => layoutRoute, path: '/', component: () => null });

const contactRoute = createRoute({ getParentRoute: () => layoutRoute, path: '$contactId', component: () => null });

export const contactsRouteTree = rootRoute.addChildren([layoutRoute.addChildren([directoryRoute, contactRoute])]);
