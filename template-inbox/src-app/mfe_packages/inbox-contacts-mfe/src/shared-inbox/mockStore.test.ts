import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InboxMockState } from '@inbox-shared/api/mockStore';
import type { RestMockMap } from '@inbox-shared/api/RestMockPlugin';
import type { GetConversationsResponse, GetMessagesResponse, PostMessageResponse } from '@inbox-shared/api/types';

type Graph = {
  mockMap: RestMockMap;
  readInboxMockState: () => InboxMockState;
  inboxMockRevision: () => number;
  resetInboxMockState: () => void;
};

/**
 * One module graph of the mock layer, freshly evaluated, the way each screen
 * package gets its own copy of every module it bundles. `vi.resetModules`
 * drops the module cache, so the next dynamic import evaluates the modules
 * again: two calls are two screens in one page.
 */
async function loadGraph(): Promise<Graph> {
  vi.resetModules();
  const store = await import('@inbox-shared/api/mockStore');
  const mocks = await import('@inbox-shared/api/mocks');
  return { mockMap: mocks.inboxMockMap, ...store };
}

describe('the page-wide mock store', () => {
  beforeEach(async () => {
    (await loadGraph()).resetInboxMockState();
  });

  it('is one state for every module graph in the page', async () => {
    const chat = await loadGraph();
    const contacts = await loadGraph();

    expect(chat.mockMap).not.toBe(contacts.mockMap);
    expect(chat.readInboxMockState()).toBe(contacts.readInboxMockState());
  });

  it('shows a reply posted through one graph to a read through the other, and counts the write', async () => {
    const chat = await loadGraph();
    const contacts = await loadGraph();
    const seededMessages = (contacts.mockMap['GET /api/inbox/messages'](undefined) as GetMessagesResponse).messages.length;

    const posted = chat.mockMap['POST /api/inbox/messages']({ conversationId: 'c-9', body: 'On it.', kind: 'reply' }) as PostMessageResponse;

    const { messages } = contacts.mockMap['GET /api/inbox/messages'](undefined) as GetMessagesResponse;
    expect(messages).toHaveLength(seededMessages + 1);
    expect(messages[messages.length - 1]).toEqual(posted.message);
    const { conversations } = contacts.mockMap['GET /api/inbox/conversations'](undefined) as GetConversationsResponse;
    expect(conversations.find((conversation) => conversation.id === 'c-9')?.snippet).toBe('On it.');
    expect(contacts.inboxMockRevision()).toBe(1);
    expect(chat.inboxMockRevision()).toBe(1);
  });

  it('answers with copies, so nothing a screen does to a response reaches the store', async () => {
    const graph = await loadGraph();
    const first = graph.mockMap['GET /api/inbox/conversations'](undefined) as GetConversationsResponse;
    first.conversations[0].subject = 'changed';

    const second = graph.mockMap['GET /api/inbox/conversations'](undefined) as GetConversationsResponse;
    expect(second.conversations[0].subject).not.toBe('changed');
    expect(graph.inboxMockRevision()).toBe(0);
  });

  it('keeps the first seed and says so once when a graph carries another seed version', async () => {
    const graph = await loadGraph();
    const state = graph.readInboxMockState();
    Object.assign(state, { seedVersion: 'other' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const other = await loadGraph();
    expect(other.readInboxMockState()).toBe(state);
    other.readInboxMockState();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('starts every graph over from the seed after a reset', async () => {
    const chat = await loadGraph();
    const contacts = await loadGraph();
    chat.mockMap['POST /api/inbox/messages']({ conversationId: 'c-9', body: 'One', kind: 'reply' });

    contacts.resetInboxMockState();
    expect(chat.inboxMockRevision()).toBe(0);
    expect(chat.readInboxMockState().postedMessageCount).toBe(0);
  });
});
