import { InboxScreenLifecycle } from '@inbox-shared/lifecycle/InboxScreenLifecycle';
import { mailCatalogues } from './i18n/catalogues';
import { mfeApp } from './init';
import { mailRouteTree } from './routes';

/** The mail screen: the mailboxes, the mail list and the reading pane. */
export class MailLifecycle extends InboxScreenLifecycle {
  constructor() {
    super(mfeApp, { catalogues: mailCatalogues, routeTree: mailRouteTree });
  }
}

/** Module Federation expects a default export with `mount` and `unmount`. */
export default new MailLifecycle();
