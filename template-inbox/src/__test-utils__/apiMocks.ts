import { vi } from 'vitest';
import { createDashboardOverview } from '../api/dashboardMocks';
import { agent, channels, contacts, conversations, messages } from '../api/dataset';
import { mailboxes, mailMessages, mails } from '../api/mailDataset';

/**
 * Stands in for the whole query layer of a screen.
 *
 * Each endpoint descriptor is replaced by a tag, and `useApiQuery` answers
 * from the seeded dataset by that tag. The screens are therefore tested
 * against the content this template actually ships, without standing the API
 * service, its protocols and its mock plugin up around them. One tag map
 * covers every domain: each screen suite mocks only the registry getters its
 * own screen calls, so the rest of this map is simply never read.
 *
 * A suite can make a tag fail or stay loading (`setQueryState`) to reach a
 * screen's error and loading states, and can read the options every
 * `useApiMutation` call was given (`mutationCalls`) to drive a write's
 * callbacks. `resetApiMocks` puts both back; call it after each test.
 */
export const endpointTags = {
  getAgent: { tag: 'agent' },
  getChannels: { tag: 'channels' },
  getConversations: { tag: 'conversations' },
  getMessages: { tag: 'messages' },
  getContacts: { tag: 'contacts' },
  postMessage: { tag: 'postMessage' },
  getMailboxes: { tag: 'mailboxes' },
  getMails: { tag: 'mails' },
  getMailMessages: { tag: 'mailMessages' },
  getDashboard: { tag: 'dashboard' },
} as const;

type EndpointTag = (typeof endpointTags)[keyof typeof endpointTags]['tag'];

const RESPONSES: Partial<Record<EndpointTag, unknown>> = {
  agent: { agent },
  channels: { channels },
  conversations: { conversations },
  messages: { messages },
  contacts: { contacts },
  mailboxes: { mailboxes },
  mails: { mails },
  mailMessages: { mailMessages },
  dashboard: createDashboardOverview(),
};

const isEndpointTag = (value: string): value is EndpointTag => value in RESPONSES;

/**
 * The tag a stand-in descriptor carries. An endpoint this map does not know
 * throws rather than answering `undefined`: a suite wired to the wrong
 * endpoint would otherwise render an empty state and still pass.
 */
const tagOf = (endpoint: unknown): EndpointTag => {
  // `in` narrows an `unknown` object to one carrying the key, so the read
  // below needs no assertion about a shape this module made up itself.
  const tag =
    typeof endpoint === 'object' && endpoint !== null && 'tag' in endpoint && typeof endpoint.tag === 'string'
      ? endpoint.tag
      : String(endpoint);
  if (!isEndpointTag(tag)) {
    throw new Error(`apiMocks: no seeded response for endpoint "${tag}"`);
  }
  return tag;
};

type QueryState = { error: Error } | { isLoading: true };

const queryStates = new Map<EndpointTag, QueryState>();

/** Tags whose `refetch` a screen called, in call order. */
export const refetchCalls: EndpointTag[] = [];

/** Makes every query on `tag` fail with `error`, or stay loading. */
export const setQueryState = (tag: EndpointTag, state: QueryState): void => {
  queryStates.set(tag, state);
};

export const queryResultFor = (endpoint: unknown) => {
  const tag = tagOf(endpoint);
  const state = queryStates.get(tag);
  const refetch = () => {
    refetchCalls.push(tag);
  };
  if (state !== undefined && 'error' in state) {
    return { data: undefined, error: state.error, isLoading: false, refetch };
  }
  if (state !== undefined) {
    return { data: undefined, error: null, isLoading: true, refetch };
  }
  return { data: RESPONSES[tag], error: null, isLoading: false, refetch };
};

type MutationOptions = {
  onSuccess?: (data: never, variables: never) => void;
  onError?: (error: Error, variables: never) => void;
};

/** The `mutate` every `useApiMutation` stand-in hands out; its calls are the writes a screen made. */
export const mutateMock = vi.fn();

/** The options of every `useApiMutation` call, latest last - one per render. */
export const mutationCalls: MutationOptions[] = [];

export const mutationResult = (options: MutationOptions) => {
  mutationCalls.push(options);
  return { mutate: mutateMock, isPending: false, error: null };
};

export const resetApiMocks = (): void => {
  queryStates.clear();
  refetchCalls.length = 0;
  mutationCalls.length = 0;
};
