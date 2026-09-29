/**
 * Where the app is, held in the URL fragment.
 *
 * Five routes: `#/dashboard`, `#/chat`, `#/mail`, `#/contacts`,
 * `#/contacts/{id}`. The fragment rather than the path because a fragment
 * needs no server rewrite - a seeded project can serve the built
 * `index.html` from any static host and every deep link still resolves,
 * including the one a "View contact" click writes.
 *
 * A router library would earn its weight at the point this app has nested
 * layouts or loaders to express. With five routes and no nesting it would be a
 * dependency to explain rather than a problem solved, so the parse below is the
 * whole thing. Replacing it means replacing this module and the screens that
 * write a location through it: `ContactsScreen` and `InboxScreen` call
 * `navigate` with `CONTACTS_ROUTE` and `contactRoute`, and the rail links to
 * the route constants.
 */

import { useEffect, useState } from 'react';

export type Route =
  | { name: 'dashboard' }
  | { name: 'inbox' }
  | { name: 'mail' }
  | { name: 'contacts' }
  | { name: 'contact'; contactId: string };

export const DASHBOARD_ROUTE = '#/dashboard';
export const INBOX_ROUTE = '#/chat';
export const MAIL_ROUTE = '#/mail';
export const CONTACTS_ROUTE = '#/contacts';
export const contactRoute = (contactId: string): string =>
  `#/contacts/${encodeURIComponent(contactId)}`;

/** The fragment a route is written at - the inverse of `parseRoute`. */
export const hashOf = (route: Route): string => {
  switch (route.name) {
    case 'dashboard':
      return DASHBOARD_ROUTE;
    case 'inbox':
      return INBOX_ROUTE;
    case 'mail':
      return MAIL_ROUTE;
    case 'contacts':
      return CONTACTS_ROUTE;
    case 'contact':
      return contactRoute(route.contactId);
  }
};

/** A percent-decoded id, or `null` for an escape sequence that does not decode. */
const decodeSegment = (segment: string): string | null => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
};

/**
 * Anything unrecognised - an empty fragment on first load, the fragment-less
 * origin, a hand-edited or unknown path - falls back to the dashboard, which
 * is the app's home. `#/inbox`, the address the chat screen had before it
 * moved to `#/chat`, still opens it. A contact link whose id does not decode
 * (a truncated `%E0%A4`) opens the directory instead of the person.
 */
export const parseRoute = (hash: string): Route => {
  const segments = hash.replace(/^#\/?/, '').split('/').filter(Boolean);

  if (segments[0] === 'chat' || segments[0] === 'inbox') {
    return { name: 'inbox' };
  }

  if (segments[0] === 'mail') {
    return { name: 'mail' };
  }

  if (segments[0] === 'contacts') {
    const contactId = segments[1] === undefined ? null : decodeSegment(segments[1]);
    return contactId === null ? { name: 'contacts' } : { name: 'contact', contactId };
  }

  return { name: 'dashboard' };
};

export const navigate = (route: string): void => {
  window.location.hash = route;
};

/**
 * The route the current fragment names, with the address bar corrected to that
 * route's own fragment when the two differ - an unknown path, the legacy
 * `#/inbox`, a contact link that did not decode - so the address a visitor
 * copies is always one that opens what they see. `replaceState` rather than
 * assigning the hash: the correction must not add a history entry, and must
 * not fire another `hashchange`.
 */
const readLocation = (): Route => {
  const route = parseRoute(window.location.hash);
  const canonical = hashOf(route);
  const isBareOrigin = window.location.hash === '' || window.location.hash === '#';
  if (!isBareOrigin && window.location.hash !== canonical) {
    window.history.replaceState(window.history.state, '', canonical);
  }
  return route;
};

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(readLocation);

  useEffect(() => {
    const onHashChange = () => setRoute(readLocation());
    window.addEventListener('hashchange', onHashChange);
    // A fragment can change between the lazy initializer and this listener
    // being attached, and `hashchange` never replays what it missed.
    onHashChange();
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return route;
}
