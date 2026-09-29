import { useEffect, useRef } from 'react';
import { getInboxApi } from '../api/registry';
import { useApiQuery } from '../api/queries';
import { ContactsScreen } from '../screens/contacts/ContactsScreen';
import { DashboardScreen } from '../screens/dashboard/DashboardScreen';
import { InboxScreen } from '../screens/inbox/InboxScreen';
import { MailScreen } from '../screens/mail/MailScreen';
import { IconRail, sectionLabelKey } from './IconRail';
import { t } from '../shared/i18n';
import { requestScreenHeadingFocus } from '../shared/ScreenHeading';
import { hashOf, useRoute } from './routing';
import { useTheme } from './theme';
import styles from '../styles/workspace.module.css';

/**
 * The whole window: the icon rail on the left, and whichever section the URL
 * fragment names filling the rest.
 *
 * The agent identity is read here rather than inside the rail because both the
 * rail's profile menu and the screens' own chrome show the same person; one
 * read, deduplicated by the query cache, keeps them from disagreeing while the
 * request is in flight.
 *
 * A route change also names the document after the section it opened and
 * moves focus to the new screen's heading, which is what a page load would
 * have done for a keyboard or screen-reader user in a multi-page app. The
 * first render moves nothing: on load, focus belongs where the browser puts
 * it.
 */
export function App() {
  const route = useRoute();
  const { theme, toggleTheme } = useTheme();
  const agentQuery = useApiQuery(getInboxApi().getAgent);
  const location = hashOf(route);
  const section = t(sectionLabelKey(route));
  const lastLocation = useRef(location);

  useEffect(() => {
    document.title = t('document_title', { section });
  }, [section]);

  useEffect(() => {
    if (location === lastLocation.current) return;
    lastLocation.current = location;
    requestScreenHeadingFocus();
  }, [location]);

  return (
    <div className={styles.app}>
      <IconRail
        route={route}
        agent={agentQuery.data?.agent}
        theme={theme}
        onToggleTheme={toggleTheme}
        t={t}
      />
      {route.name === 'dashboard' ? (
        <DashboardScreen t={t} />
      ) : route.name === 'inbox' ? (
        <InboxScreen t={t} />
      ) : route.name === 'mail' ? (
        <MailScreen t={t} />
      ) : (
        <ContactsScreen
          openContactId={route.name === 'contact' ? route.contactId : null}
          t={t}
        />
      )}
    </div>
  );
}
