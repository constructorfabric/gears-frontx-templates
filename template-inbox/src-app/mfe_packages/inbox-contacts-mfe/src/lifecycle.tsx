import { InboxScreenLifecycle } from '@inbox-shared/lifecycle/InboxScreenLifecycle';
import { contactsCatalogues } from './i18n/catalogues';
import { mfeApp } from './init';
import { contactsRouteTree } from './routes';

/** The contacts screen: the directory and each person's page. */
export class ContactsLifecycle extends InboxScreenLifecycle {
  constructor() {
    super(mfeApp, { catalogues: contactsCatalogues, routeTree: contactsRouteTree });
  }
}

/** Module Federation expects a default export with `mount` and `unmount`. */
export default new ContactsLifecycle();
