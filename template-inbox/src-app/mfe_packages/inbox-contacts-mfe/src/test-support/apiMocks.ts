import { vi } from 'vitest';
import { createApiMocks } from '@inbox-shared/test-support/apiMocks';
import { agent, channels, contacts, conversations, messages } from '@inbox-shared/api/dataset';

/**
 * The query-layer stand-ins of this package's screen suites
 * (`@inbox-shared/test-support/apiMocks`), over the Inbox service, the one this package registers: its seeded reads. The
 * directory writes nothing, so no write endpoint answers.
 */
export const {
  endpointTags,
  queryResultFor,
  setQueryState,
  refetchCalls,
  mutationResult,
  mutateMocks,
  setMutationPending,
  latestMutation,
  latestVariables,
  succeedMutation,
  resetApiMocks,
} = createApiMocks({
  endpoints: {
    getAgent: 'agent',
    getChannels: 'channels',
    getConversations: 'conversations',
    getMessages: 'messages',
    getContacts: 'contacts',
  },
  responses: {
    agent: { agent },
    channels: { channels },
    conversations: { conversations },
    messages: { messages },
    contacts: { contacts },
  },
  mutations: [],
  fn: vi.fn,
});
