/**
 * Mail domain - API service.
 *
 * A sibling of the inbox's `InboxApiService`, built from the exact same
 * primitives (`RestProtocol`, `RestEndpointProtocol`, the template's own
 * `RestMockPlugin`), only pointed at a different base URL and a different
 * mock map.
 */

import { BaseApiService, RestEndpointProtocol, RestProtocol } from '@gears-frontx/api';
import { RestMockPlugin } from '@inbox-shared/api/RestMockPlugin';
import { mailMockMap } from './mailMocks';
import type {
  GetMailboxesResponse,
  GetMailMessagesResponse,
  GetMailsResponse,
  SendMailRequest,
  SendMailResponse,
} from './mailTypes';

export class MailApiService extends BaseApiService {
  constructor() {
    const restProtocol = new RestProtocol({ timeout: 30000 });
    const restEndpoints = new RestEndpointProtocol(restProtocol);

    super({ baseURL: '/api/mail' }, restProtocol, restEndpoints);

    // Declares the mock plugin without switching it on: whether mocks answer is
    // decided by the `mock()` plugin in the package's `init.ts`.
    this.registerPlugin(restProtocol, new RestMockPlugin({ mockMap: mailMockMap, delay: 100 }));
  }

  readonly getMailboxes =
    this.protocol(RestEndpointProtocol).query<GetMailboxesResponse>('/mailboxes');

  readonly getMails = this.protocol(RestEndpointProtocol).query<GetMailsResponse>('/mails');

  readonly getMailMessages =
    this.protocol(RestEndpointProtocol).query<GetMailMessagesResponse>('/messages');

  readonly sendMail = this.protocol(RestEndpointProtocol).mutation<SendMailResponse, SendMailRequest>(
    'POST',
    '/mails'
  );
}
