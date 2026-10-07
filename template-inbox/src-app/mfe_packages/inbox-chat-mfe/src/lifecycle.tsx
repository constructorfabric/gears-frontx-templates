import { InboxScreenLifecycle } from '@inbox-shared/lifecycle/InboxScreenLifecycle';
import { chatCatalogues } from './i18n/catalogues';
import { mfeApp } from './init';
import { chatRouteTree } from './routes';

/** The chat screen: channels, the conversation list, the thread and the customer details. */
export class ChatLifecycle extends InboxScreenLifecycle {
  constructor() {
    super(mfeApp, { catalogues: chatCatalogues, routeTree: chatRouteTree });
  }
}

/** Module Federation expects a default export with `mount` and `unmount`. */
export default new ChatLifecycle();
