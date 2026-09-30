import { apiRegistry, createFrontX, effects, mock, RestProtocol, toggleMockMode } from '@gears-frontx/react';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { channels as seedChannels, conversations as seedConversations, messages as seedMessages } from '@inbox-shared/api/dataset';
import { MockResponseError } from '@inbox-shared/api/RestMockPlugin';
import type { PostMessageRequest } from '@inbox-shared/api/types';
import { resetInboxMockState } from '@inbox-shared/api/mockStore';
import { getInboxApi, registerInboxApi } from '@inbox-shared/api/registry';

/**
 * The suite that goes through the real service rather than around it.
 *
 * Every screen suite replaces `useApiQuery`, which is the right trade for a
 * screen test and leaves exactly one thing unchecked: whether a request ever
 * reaches the mock map. It does not by default - `registerPlugin` declares a
 * plugin without switching it on - so a package whose `init.ts` forgets the
 * framework's `mock()` plugin renders empty panes and no error at all, the
 * request having quietly gone to the network. Reading the endpoints end to
 * end, with the app built the way `init.ts` builds it, is what makes that
 * impossible to ship again.
 */
describe('InboxApiService', () => {
  beforeAll(() => {
    apiRegistry.reset();
    registerInboxApi();
    apiRegistry.initialize();
    createFrontX().use(effects()).use(mock({ enabledByDefault: true })).build();
  });

  beforeEach(() => {
    resetInboxMockState();
  });

  it('answers from the seeded dataset instead of the network', async () => {
    const { channels } = await getInboxApi().getChannels.fetch();
    expect(channels).toEqual(seedChannels);
  });

  it('serves every conversation the channels are counted from', async () => {
    const { conversations } = await getInboxApi().getConversations.fetch();

    for (const channel of seedChannels) {
      expect(conversations.filter((c) => c.channelId === channel.id)).toHaveLength(channel.itemCount);
    }
  });

  it('keeps a posted reply in the transcript a later read serves', async () => {
    const service = getInboxApi();
    const { message } = await service.postMessage.fetch({ conversationId: 'c-9', body: 'On it.', kind: 'reply' });

    expect(message).toMatchObject({ conversationId: 'c-9', body: 'On it.', internal: false, seen: null });

    const { messages } = await service.getMessages.fetch();
    expect(messages).toHaveLength(seedMessages.length + 1);
    expect(messages[messages.length - 1]).toEqual(message);
  });

  it('numbers posted messages in sequence and marks a note internal', async () => {
    const service = getInboxApi();
    const first = await service.postMessage.fetch({ conversationId: 'c-9', body: 'One', kind: 'reply' });
    const second = await service.postMessage.fetch({ conversationId: 'c-9', body: 'Two', kind: 'note' });

    expect([first.message.id, second.message.id]).toEqual(['m-sent-1', 'm-sent-2']);
    expect(second.message.internal).toBe(true);
  });

  it('starts the transcript and the id sequence over after a reset', async () => {
    const service = getInboxApi();
    await service.postMessage.fetch({ conversationId: 'c-9', body: 'Before', kind: 'reply' });

    resetInboxMockState();

    const { messages } = await service.getMessages.fetch();
    expect(messages).toHaveLength(seedMessages.length);
    const { message } = await service.postMessage.fetch({ conversationId: 'c-9', body: 'After', kind: 'reply' });
    expect(message.id).toBe('m-sent-1');
  });

  it('answers 400 to a post without a conversation or a body, and stores nothing', async () => {
    const service = getInboxApi();

    await expect(service.postMessage.fetch({ conversationId: '', body: 'Hi', kind: 'reply' })).rejects.toMatchObject({
      status: 400,
    });
    await expect(service.postMessage.fetch({ conversationId: 'c-9', body: '  ', kind: 'reply' })).rejects.toBeInstanceOf(
      MockResponseError
    );

    const { messages } = await service.getMessages.fetch();
    expect(messages).toHaveLength(seedMessages.length);
  });

  it("answers 400 to a post whose kind is neither 'reply' nor 'note'", async () => {
    const service = getInboxApi();
    // A request the type rules out, as a client outside TypeScript could send it.
    const request = { conversationId: 'c-9', body: 'Hi', kind: 'broadcast' } as unknown as PostMessageRequest;

    await expect(service.postMessage.fetch(request)).rejects.toMatchObject({ status: 400 });
    const { messages } = await service.getMessages.fetch();
    expect(messages).toHaveLength(seedMessages.length);
  });

  it('answers 404 to a post into a conversation that does not exist, and stores nothing', async () => {
    const service = getInboxApi();

    await expect(
      service.postMessage.fetch({ conversationId: 'c-missing', body: 'Hello?', kind: 'reply' })
    ).rejects.toMatchObject({ status: 404 });
    const { messages } = await service.getMessages.fetch();
    expect(messages).toHaveLength(seedMessages.length);
  });

  it("moves the conversation's snippet and last activity to a posted message", async () => {
    const service = getInboxApi();
    const { message } = await service.postMessage.fetch({ conversationId: 'c-9', body: 'On it.', kind: 'reply' });

    const { conversations } = await service.getConversations.fetch();
    expect(conversations.find((conversation) => conversation.id === 'c-9')).toMatchObject({
      snippet: 'On it.',
      lastActivityAt: message.sentAt,
    });
  });

  it('creates a conversation with a contact, serves it in the list and takes posts into it', async () => {
    const service = getInboxApi();
    const { conversation } = await service.createConversation.fetch({
      channelId: 'general',
      contactId: 'r-3',
      assignee: 'Agent',
    });

    expect(conversation).toMatchObject({ id: 'c-new-1', channelId: 'general', contactId: 'r-3', assignee: 'Agent', snippet: '' });
    const { conversations } = await service.getConversations.fetch();
    expect(conversations).toHaveLength(seedConversations.length + 1);

    const { message } = await service.postMessage.fetch({ conversationId: conversation.id, body: 'Hello', kind: 'reply' });
    expect(message.conversationId).toBe('c-new-1');
  });

  it("adds a created conversation to its contact's own conversations, and to nobody else's", async () => {
    const service = getInboxApi();
    const before = (await service.getContacts.fetch()).contacts;
    const { conversation } = await service.createConversation.fetch({ channelId: 'general', contactId: 'r-3', assignee: '' });

    const { contacts } = await service.getContacts.fetch();
    const refsOf = (list: typeof contacts, id: string) => list.find((contact) => contact.id === id)?.conversations ?? [];
    expect(refsOf(contacts, 'r-3')).toEqual([...refsOf(before, 'r-3'), { id: conversation.id }]);
    const others = contacts.filter((contact) => contact.id !== 'r-3');
    expect(others.some((contact) => contact.conversations.some((ref) => ref.id === conversation.id))).toBe(false);
  });

  it('answers 400 to a create without a channel or a contact, and 404 for an unknown contact', async () => {
    const service = getInboxApi();

    await expect(
      service.createConversation.fetch({ channelId: '', contactId: 'r-3', assignee: '' })
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.createConversation.fetch({ channelId: 'general', contactId: 'r-missing', assignee: '' })
    ).rejects.toMatchObject({ status: 404 });
    const { conversations } = await service.getConversations.fetch();
    expect(conversations).toHaveLength(seedConversations.length);
  });

  it('hands out copies, so a caller mutating a response cannot change the next one', async () => {
    const service = getInboxApi();
    const first = await service.getConversations.fetch();
    first.conversations[0].subject = 'changed';

    const second = await service.getConversations.fetch();
    expect(second.conversations[0].subject).toBe(seedConversations[0].subject);
  });

  it('takes every mock plugin off its protocol when the framework switch turns mocks off, and puts each back once', () => {
    const activeMockPlugins = () =>
      apiRegistry.getAll().flatMap((service) =>
        [...service.getPlugins()].flatMap(([protocol, plugins]) =>
          protocol instanceof RestProtocol
            ? protocol.plugins.getAll().filter((plugin) => [...plugins].some((declared) => declared === plugin))
            : []
        )
      );

    // One per service, all active after registration.
    expect(activeMockPlugins()).toHaveLength(apiRegistry.getAll().length);

    toggleMockMode(false);
    expect(activeMockPlugins()).toHaveLength(0);

    toggleMockMode(true);
    toggleMockMode(true);
    expect(activeMockPlugins()).toHaveLength(apiRegistry.getAll().length);
  });
});
