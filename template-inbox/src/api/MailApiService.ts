/**
 * Mail domain - API service.
 *
 * A sibling of `InboxApiService`, built from the exact same primitives
 * (`RestProtocol`, `RestEndpointProtocol`, the app's own `RestMockPlugin`) -
 * see `RestMockPlugin.ts` for why that plugin is the app's own file rather
 * than the ecosystem package's. Nothing new is invented here, only pointed at
 * a different base URL and a different mock map.
 */

import { BaseApiService, RestEndpointProtocol, RestProtocol } from '@gears-frontx/api';
import { mailMockMap } from './mailMocks';
import { RestMockPlugin } from './RestMockPlugin';
import type { GetMailboxesResponse, GetMailMessagesResponse, GetMailsResponse } from './mailTypes';

export class MailApiService extends BaseApiService {
  constructor() {
    const restProtocol = new RestProtocol({ timeout: 30000 });
    const restEndpoints = new RestEndpointProtocol(restProtocol);

    super({ baseURL: '/api/mail' }, restProtocol, restEndpoints);

    // Declares the mock plugin without switching it on: whether mocks answer is
    // decided outside every service, by `setMockMode` in `registry.ts`.
    this.registerPlugin(restProtocol, new RestMockPlugin({ mockMap: mailMockMap, delay: 100 }));
  }

  readonly getMailboxes =
    this.protocol(RestEndpointProtocol).query<GetMailboxesResponse>('/mailboxes');

  readonly getMails = this.protocol(RestEndpointProtocol).query<GetMailsResponse>('/mails');

  readonly getMailMessages =
    this.protocol(RestEndpointProtocol).query<GetMailMessagesResponse>('/messages');
}
