/**
 * Inbox domain - the mock map for `InboxApiService`, and the state behind it.
 *
 * Keys are the full `METHOD /path` the plugin matches on, base URL included.
 * Every read hands back a whole collection: `RestMockPlugin` calls a factory
 * with the request body alone, so a per-id route could not tell which id it
 * was asked for. Screens select from the collection they already hold.
 *
 * The transcript is the one collection a request can change: a posted reply or
 * note is appended to the mock store, and `GET /api/inbox/messages` serves the
 * store, so a sent message is still there after the screen remounts - the way
 * a backend would keep it. Every factory answers with a copy, so nothing a
 * screen does to a response reaches the store. `resetInboxMockState` puts the
 * store back to the seed, which is what tests call between cases.
 */

import { agent, channels, contacts, conversations, messages as seedMessages } from './dataset';
import { mockReply, type RestMockMap } from './RestMockPlugin';
import { calendarText } from './seedClock';
import type { JsonValue } from '@gears-frontx/api';
import type {
  GetAgentResponse,
  GetChannelsResponse,
  GetContactsResponse,
  GetConversationsResponse,
  GetMessagesResponse,
  Message,
  PostMessageRequest,
  PostMessageResponse,
} from './types';

type InboxMockState = {
  messages: Message[];
  /** Server-side id sequence for the messages this session posted. */
  postedMessageCount: number;
};

const createInboxMockState = (): InboxMockState => ({
  messages: structuredClone(seedMessages),
  postedMessageCount: 0,
});

let state = createInboxMockState();

/** Back to the seeded transcript and a fresh id sequence. */
export const resetInboxMockState = (): void => {
  state = createInboxMockState();
};

const readString = (body: JsonValue | undefined, field: string): string | null => {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const value = body[field];
  return typeof value === 'string' ? value : null;
};

/**
 * The request a well-formed post carries, or `null` for one a backend would
 * reject: a conversation to post into and a non-blank body are both required,
 * and `kind` is a reply unless it says note.
 */
const readPostedMessage = (body: JsonValue | undefined): PostMessageRequest | null => {
  const conversationId = readString(body, 'conversationId');
  const text = readString(body, 'body');
  if (conversationId === null || conversationId === '' || text === null || text.trim() === '') {
    return null;
  }
  return { conversationId, body: text, kind: readString(body, 'kind') === 'note' ? 'note' : 'reply' };
};

/**
 * Stores the posted reply or note and answers with it. A real backend assigns
 * the id and the timestamp exactly here, which is why neither is taken from
 * the request.
 */
const acceptPostedMessage = (request: PostMessageRequest): Message => {
  state.postedMessageCount += 1;
  const message: Message = {
    id: `m-sent-${state.postedMessageCount}`,
    conversationId: request.conversationId,
    direction: 'outbound',
    kind: 'text',
    body: request.body,
    links: [],
    imageUrl: null,
    timestamp: calendarText(new Date()),
    // No receipt yet: nothing has been delivered, and a note never gets one.
    seen: null,
    internal: request.kind === 'note',
    attachments: [],
  };
  state.messages.push(message);
  return message;
};

export const inboxMockMap: RestMockMap = {
  'GET /api/inbox/me': (): GetAgentResponse => structuredClone({ agent }),
  'GET /api/inbox/channels': (): GetChannelsResponse => structuredClone({ channels }),
  'GET /api/inbox/conversations': (): GetConversationsResponse => structuredClone({ conversations }),
  'GET /api/inbox/messages': (): GetMessagesResponse => structuredClone({ messages: state.messages }),
  'GET /api/inbox/contacts': (): GetContactsResponse => structuredClone({ contacts }),
  'POST /api/inbox/messages': (body) => {
    const request = readPostedMessage(body);
    if (request === null) {
      return mockReply(400, { error: 'A message needs a conversationId and a non-empty body.' });
    }
    const response: PostMessageResponse = { message: structuredClone(acceptPostedMessage(request)) };
    return response;
  },
};
