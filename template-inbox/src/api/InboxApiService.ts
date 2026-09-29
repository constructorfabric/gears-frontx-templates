/**
 * Inbox domain - API service.
 *
 * One service backs both screens. They share a dataset - a contact is a list
 * row, a thread header, a details-panel lead and a table row at the same time -
 * so splitting the surface in two would mean two copies of that dataset kept in
 * step by hand. If the two ever need separate surfaces, keep this one data
 * module and put two thin services over it.
 */

import { BaseApiService, RestEndpointProtocol, RestProtocol } from '@gears-frontx/api';
import { inboxMockMap } from './mocks';
import { RestMockPlugin } from './RestMockPlugin';
import type {
  CreateConversationRequest,
  CreateConversationResponse,
  GetAgentResponse,
  GetChannelsResponse,
  GetContactsResponse,
  GetConversationsResponse,
  GetMessagesResponse,
  PostMessageRequest,
  PostMessageResponse,
} from './types';

export class InboxApiService extends BaseApiService {
  constructor() {
    const restProtocol = new RestProtocol({ timeout: 30000 });
    const restEndpoints = new RestEndpointProtocol(restProtocol);

    super({ baseURL: '/api/inbox' }, restProtocol, restEndpoints);

    // Declares the mock plugin without switching it on: whether mocks answer is
    // decided outside every service, by `setMockMode` in `registry.ts`.
    this.registerPlugin(restProtocol, new RestMockPlugin({ mockMap: inboxMockMap, delay: 100 }));
  }

  readonly getAgent = this.protocol(RestEndpointProtocol).query<GetAgentResponse>('/me');

  readonly getChannels =
    this.protocol(RestEndpointProtocol).query<GetChannelsResponse>('/channels');

  readonly getConversations =
    this.protocol(RestEndpointProtocol).query<GetConversationsResponse>('/conversations');

  readonly getMessages =
    this.protocol(RestEndpointProtocol).query<GetMessagesResponse>('/messages');

  readonly getContacts =
    this.protocol(RestEndpointProtocol).query<GetContactsResponse>('/contacts');

  readonly postMessage = this.protocol(RestEndpointProtocol).mutation<
    PostMessageResponse,
    PostMessageRequest
  >('POST', '/messages');

  readonly createConversation = this.protocol(RestEndpointProtocol).mutation<
    CreateConversationResponse,
    CreateConversationRequest
  >('POST', '/conversations');
}
