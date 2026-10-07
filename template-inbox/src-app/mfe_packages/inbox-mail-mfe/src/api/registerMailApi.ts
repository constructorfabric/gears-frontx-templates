/**
 * Registration of the mail screen's API service.
 *
 * The service, its seed and its mock state live in this package because no
 * other screen reads mail; the package never imports the inbox's seed.
 * Called from `init.ts` before `createFrontX().build()`, for the same reason
 * as the shared `registerInboxApi`: the `mock()` plugin switches the mock
 * plugins of the services already registered when the app is built.
 */

import { apiRegistry } from '@gears-frontx/react';
import { setQueryCacheEpoch } from '@inbox-shared/api/queries';
import { MailApiService } from './MailApiService';
import { mailMockRevision } from './mailMockStore';

/**
 * Registers the mail service and ties this package's query cache to the mail
 * mock state's revision, so an answer cached before a write the cache did not
 * make itself is read again. Idempotent.
 */
export function registerMailApi(): void {
  if (apiRegistry.has(MailApiService)) return;
  apiRegistry.register(MailApiService);
  setQueryCacheEpoch(mailMockRevision);
}

export const getMailApi = (): MailApiService => apiRegistry.getService(MailApiService);
