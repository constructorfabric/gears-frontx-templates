/**
 * Mail domain - the mock map for `MailApiService`.
 *
 * Same shape as `mocks.ts`: keys are the full `METHOD /path`, every read
 * hands back a whole collection, and selection stays a client-side concern
 * (see `mailSelectors.ts`). Nothing here is written to, so every factory
 * answers with a fresh copy of the seed and there is no state to reset.
 */

import { mailboxes, mailMessages, mails } from './mailDataset';
import type { RestMockMap } from './RestMockPlugin';
import type { GetMailboxesResponse, GetMailMessagesResponse, GetMailsResponse } from './mailTypes';

export const mailMockMap: RestMockMap = {
  'GET /api/mail/mailboxes': (): GetMailboxesResponse => structuredClone({ mailboxes }),
  'GET /api/mail/mails': (): GetMailsResponse => structuredClone({ mails }),
  'GET /api/mail/messages': (): GetMailMessagesResponse => structuredClone({ mailMessages }),
};
