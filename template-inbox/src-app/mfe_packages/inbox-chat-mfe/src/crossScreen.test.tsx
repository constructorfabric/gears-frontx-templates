import { act } from 'react';
import { render } from '@testing-library/react';
import type { EndpointDescriptor, MutationDescriptor } from '@gears-frontx/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RestMockMap } from '@inbox-shared/api/RestMockPlugin';
import type {
  CreateConversationRequest,
  CreateConversationResponse,
  GetContactsResponse,
  GetConversationsResponse,
  PostMessageRequest,
  PostMessageResponse,
} from '@inbox-shared/api/types';

type Queries = typeof import('@inbox-shared/api/queries');

/**
 * One screen's copy of the query and mock layers, freshly evaluated: each
 * screen package bundles its own copy of every module, so in the browser
 * the chat and the contacts screen each hold a query cache of their own over
 * the one page-wide mock store. `vi.resetModules` drops the module cache, so
 * the next dynamic imports evaluate the modules again. Each graph wires its
 * cache to the store's revision the way `registerInboxApi` does, and reads
 * and writes through descriptors over its own mock map, as its service would.
 */
async function loadScreen() {
  vi.resetModules();
  const queries: Queries = await import('@inbox-shared/api/queries');
  const store = await import('@inbox-shared/api/mockStore');
  const { inboxMockMap } = await import('@inbox-shared/api/mocks');
  queries.setQueryCacheEpoch(store.inboxMockRevision);
  let requests = 0;
  const read = <T,>(path: string): EndpointDescriptor<T> => ({
    key: ['/api/inbox', 'GET', path],
    fetch: async () => {
      requests += 1;
      return inboxMockMap[`GET /api/inbox${path}`](undefined) as T;
    },
  });
  const write = <T, V>(path: string): MutationDescriptor<T, V> => ({
    key: ['/api/inbox', 'POST', path],
    fetch: async (variables) => (inboxMockMap as RestMockMap)[`POST /api/inbox${path}`](variables as never) as T,
  });
  return {
    queries,
    store,
    requests: () => requests,
    getConversations: read<GetConversationsResponse>('/conversations'),
    getContacts: read<GetContactsResponse>('/contacts'),
    postMessage: write<PostMessageResponse, PostMessageRequest>('/messages'),
    createConversation: write<CreateConversationResponse, CreateConversationRequest>('/conversations'),
  };
}

type Screen = Awaited<ReturnType<typeof loadScreen>>;

const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

/** Mounts a reader of `descriptor` through `screen`'s own query layer, as its screen would. */
async function readThrough<T>(screen: Screen, descriptor: EndpointDescriptor<T>): Promise<{ data: T | undefined; unmount: () => void }> {
  let latest: T | undefined;
  function Reader() {
    latest = screen.queries.useApiQuery(descriptor).data;
    return null;
  }
  const view = render(<Reader />);
  await flush();
  return { data: latest, unmount: view.unmount };
}

/** Runs one write through `screen`'s own mutation hook, naming the reads it changes. */
async function writeThrough<T, V>(
  screen: Screen,
  endpoint: MutationDescriptor<T, V>,
  variables: V,
  invalidates: readonly { key: readonly unknown[] }[]
): Promise<T | undefined> {
  let mutate: ((next: V) => void) | undefined;
  let answer: T | undefined;
  function Writer() {
    mutate = screen.queries.useApiMutation<T, V>({ endpoint, invalidates, onSuccess: (data) => (answer = data) }).mutate;
    return null;
  }
  const view = render(<Writer />);
  act(() => mutate?.(variables));
  await flush();
  view.unmount();
  return answer;
}

describe('one mock backend under the chat and the contacts screen', () => {
  beforeEach(async () => {
    (await loadScreen()).store.resetInboxMockState();
  });

  it('shows a reply posted in the chat to the contacts screen, whose cache was filled before the reply', async () => {
    const contacts = await loadScreen();
    const chat = await loadScreen();
    expect(chat.queries).not.toBe(contacts.queries);

    const before = await readThrough(contacts, contacts.getConversations);
    const seeded = before.data?.conversations.find((conversation) => conversation.id === 'c-9');
    expect(seeded?.snippet).not.toBe('On it, checking the logs now.');
    before.unmount();

    await writeThrough(chat, chat.postMessage, { conversationId: 'c-9', body: 'On it, checking the logs now.', kind: 'reply' }, [
      chat.getConversations,
    ]);

    // The contacts screen comes back: its cache predates the reply, and the
    // store's revision tells it so.
    const after = await readThrough(contacts, contacts.getConversations);
    expect(contacts.requests()).toBe(2);
    expect(after.data?.conversations.find((conversation) => conversation.id === 'c-9')).toMatchObject({
      snippet: 'On it, checking the logs now.',
      contactId: seeded?.contactId,
    });
  });

  it("lists a conversation started in the chat on its contact's own record in the contacts screen", async () => {
    const contacts = await loadScreen();
    const chat = await loadScreen();

    const before = await readThrough(contacts, contacts.getContacts);
    const refsBefore = before.data?.contacts.find((contact) => contact.id === 'r-3')?.conversations ?? [];
    before.unmount();

    const created = await writeThrough(chat, chat.createConversation, { channelId: 'general', contactId: 'r-3', assignee: '' }, [
      chat.getConversations,
    ]);
    expect(created?.conversation.contactId).toBe('r-3');

    const after = await readThrough(contacts, contacts.getContacts);
    expect(after.data?.contacts.find((contact) => contact.id === 'r-3')?.conversations).toEqual([
      ...refsBefore,
      { id: created?.conversation.id },
    ]);
    const conversations = await readThrough(contacts, contacts.getConversations);
    expect(conversations.data?.conversations.some((conversation) => conversation.id === created?.conversation.id)).toBe(true);
  });

  it('keeps the rest of the chat cache after its own write, where no other screen wrote', async () => {
    const chat = await loadScreen();
    const people = await readThrough(chat, chat.getContacts);
    people.unmount();
    const requestsBefore = chat.requests();

    await writeThrough(chat, chat.postMessage, { conversationId: 'c-9', body: 'Noted.', kind: 'note' }, [chat.getConversations]);

    await readThrough(chat, chat.getContacts);
    expect(chat.requests()).toBe(requestsBefore);
  });
});
