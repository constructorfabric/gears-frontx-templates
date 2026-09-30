/**
 * Inbox domain - the mock map for `InboxApiService`.
 *
 * Keys are the full `METHOD /path` the plugin matches on, base URL included.
 * Every read hands back a whole collection: `RestMockPlugin` calls a factory
 * with the request body alone, so a per-id route could not tell which id it
 * was asked for. Screens select from the collection they already hold.
 *
 * The conversations and the transcript are the collections a request can
 * change, so both live in the page-wide mock store (`mockStore.ts`) rather
 * than being served from the seed: a posted reply or note is appended to the
 * transcript and moves its conversation's snippet and last activity, and a
 * created conversation joins the list - each still there after the screen
 * remounts, and visible to every other inbox screen in the page, the way a
 * backend would keep it. Every factory answers with a copy, so nothing a
 * screen does to a response reaches the store, and every accepted write
 * moves the store's revision. The contacts live there too: a created
 * conversation joins its contact's own list of conversations, and other
 * screens' mocks (the dashboard's activity rows) point at them by id, so one
 * list in the page keeps those ids in step with the directory.
 */

import { BRAND, NO_TEAM_INBOX } from './constants';
import { agent, channels } from './dataset';
import { bumpInboxMockRevision, readInboxMockState } from './mockStore';
import { isMockReply, mockReply, type MockReply, type RestMockMap } from './RestMockPlugin';
import type { JsonValue } from '@gears-frontx/react';
import type {
  Conversation,
  CreateConversationRequest,
  CreateConversationResponse,
  GetAgentResponse,
  GetChannelsResponse,
  GetContactsResponse,
  GetConversationsResponse,
  GetMessagesResponse,
  Message,
  PostMessageRequest,
  PostMessageResponse,
} from './types';

const readString = (body: JsonValue | undefined, field: string): string | null => {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const value = body[field];
  return typeof value === 'string' ? value : null;
};

const badRequest = (error: string): MockReply => mockReply(400, { error });

/**
 * The request a well-formed post carries, or the answer a backend would give
 * a post it rejects: a conversation to post into, a non-blank body and a
 * `kind` of reply or note are all required (400), and the conversation must
 * exist (404) - a post into nothing would leave an orphan in the transcript.
 */
const readPostedMessage = (body: JsonValue | undefined): PostMessageRequest | MockReply => {
  const conversationId = readString(body, 'conversationId');
  const text = readString(body, 'body');
  const kind = readString(body, 'kind');
  if (conversationId === null || conversationId === '' || text === null || text.trim() === '') {
    return badRequest('A message needs a conversationId and a non-empty body.');
  }
  if (kind !== 'reply' && kind !== 'note') {
    return badRequest("A message's kind is 'reply' or 'note'.");
  }
  if (!readInboxMockState().conversations.some((conversation) => conversation.id === conversationId)) {
    return mockReply(404, { error: `No conversation ${conversationId}.` });
  }
  return { conversationId, body: text, kind };
};

/**
 * Stores the posted reply or note and answers with it. A real backend assigns
 * the id and the timestamp exactly here, which is why neither is taken from
 * the request, and moves the conversation's snippet and last activity with
 * it, which keeps the seed's own rule: a thread's newest message sits at its
 * conversation's last activity.
 */
const acceptPostedMessage = (request: PostMessageRequest): Message => {
  const state = readInboxMockState();
  state.postedMessageCount += 1;
  const message: Message = {
    id: `m-sent-${state.postedMessageCount}`,
    conversationId: request.conversationId,
    direction: 'outbound',
    kind: 'text',
    body: request.body,
    links: [],
    imageUrl: null,
    sentAt: new Date().toISOString(),
    // No receipt yet: nothing has been delivered, and a note never gets one.
    seen: null,
    internal: request.kind === 'note',
    attachments: [],
  };
  state.messages.push(message);
  state.conversations = state.conversations.map((conversation) =>
    conversation.id === request.conversationId
      ? { ...conversation, snippet: message.body, lastActivityAt: message.sentAt }
      : conversation
  );
  bumpInboxMockRevision(state);
  return message;
};

/**
 * The request a well-formed create carries, or the answer to one a backend
 * would reject: a channel and a contact are required (400), and the contact
 * must exist (404). The channel is not checked: channels the agent creates
 * are client-side in this template, and a conversation may be started in one.
 */
const readCreatedConversation = (body: JsonValue | undefined): CreateConversationRequest | MockReply => {
  const channelId = readString(body, 'channelId');
  const contactId = readString(body, 'contactId');
  if (channelId === null || channelId === '' || contactId === null || contactId === '') {
    return badRequest('A conversation needs a channelId and a contactId.');
  }
  if (!readInboxMockState().contacts.some((contact) => contact.id === contactId)) {
    return mockReply(404, { error: `No contact ${contactId}.` });
  }
  return { channelId, contactId, assignee: readString(body, 'assignee') ?? '' };
};

/**
 * Stores a new, empty conversation with the contact and answers with it. The
 * contact's own record gains a ref to it, as a backend's join would, so the
 * contact's page lists the conversation next to the ones the seed gave them.
 */
const acceptCreatedConversation = (request: CreateConversationRequest): Conversation => {
  const state = readInboxMockState();
  state.createdConversationCount += 1;
  const conversation: Conversation = {
    id: `c-new-${state.createdConversationCount}`,
    channelId: request.channelId,
    subject: state.contacts.find((contact) => contact.id === request.contactId)?.name ?? '',
    contactId: request.contactId,
    snippet: '',
    lastActivityAt: new Date().toISOString(),
    unreadCount: 0,
    priority: 'none',
    status: 'open',
    assignee: request.assignee,
    teamInbox: NO_TEAM_INBOX,
    channel: 'chat',
    brand: BRAND,
    tags: [],
    sharedFiles: [],
    suggestedReplies: [],
    starred: false,
    snoozed: false,
    pinned: false,
  };
  state.conversations.push(conversation);
  state.contacts = state.contacts.map((contact) =>
    contact.id === request.contactId
      ? { ...contact, conversations: [...contact.conversations, { id: conversation.id }] }
      : contact
  );
  bumpInboxMockRevision(state);
  return conversation;
};

export const inboxMockMap: RestMockMap = {
  'GET /api/inbox/me': (): GetAgentResponse => structuredClone({ agent }),
  'GET /api/inbox/channels': (): GetChannelsResponse => structuredClone({ channels }),
  'GET /api/inbox/conversations': (): GetConversationsResponse =>
    structuredClone({ conversations: readInboxMockState().conversations }),
  'GET /api/inbox/messages': (): GetMessagesResponse => structuredClone({ messages: readInboxMockState().messages }),
  'GET /api/inbox/contacts': (): GetContactsResponse => structuredClone({ contacts: readInboxMockState().contacts }),
  'POST /api/inbox/messages': (body) => {
    const request = readPostedMessage(body);
    if (isMockReply(request)) return request;
    const response: PostMessageResponse = { message: structuredClone(acceptPostedMessage(request)) };
    return response;
  },
  'POST /api/inbox/conversations': (body) => {
    const request = readCreatedConversation(body);
    if (isMockReply(request)) return request;
    const response: CreateConversationResponse = {
      conversation: structuredClone(acceptCreatedConversation(request)),
    };
    return response;
  },
};
