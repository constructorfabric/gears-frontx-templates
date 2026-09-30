import { vi } from 'vitest';
import { mailboxes, mailMessages, mails } from '../api/mailDataset';

/**
 * Stands in for the whole query layer of a screen.
 *
 * Each endpoint descriptor is replaced by a tag, and `useApiQuery` answers
 * from the seeded dataset by that tag. The screens are therefore tested
 * against the content this template actually ships, without standing the API
 * service, its protocols and its mock plugin up around them. The map covers
 * the mail service, the one this package registers.
 *
 * A suite can make a tag fail or stay loading (`setQueryState`) to reach a
 * screen's error and loading states, and can read the options every
 * `useApiMutation` call was given (`mutationCalls`) to drive a write's
 * callbacks (`latestMutation`, `succeedMutation`). `resetApiMocks` puts
 * both back; call it after each test.
 */
export const endpointTags = {
  getMailboxes: { tag: 'mailboxes' },
  getMails: { tag: 'mails' },
  getMailMessages: { tag: 'mailMessages' },
  sendMail: { tag: 'sendMail' },
} as const;

type EndpointTag = (typeof endpointTags)[keyof typeof endpointTags]['tag'];

/** The tags of the write endpoints, which answer through `useApiMutation` rather than `useApiQuery`. */
type MutationTag = 'sendMail';

const RESPONSES: Partial<Record<EndpointTag, unknown>> = {
  mailboxes: { mailboxes },
  mails: { mails },
  mailMessages: { mailMessages },
};

const isQueryTag = (value: string): value is EndpointTag => value in RESPONSES;

const isMutationTag = (value: string): value is MutationTag => value === 'sendMail';

/**
 * The tag a stand-in descriptor carries. An endpoint this map does not know
 * throws rather than answering `undefined`: a suite wired to the wrong
 * endpoint would otherwise render an empty state and still pass.
 */
const rawTagOf = (endpoint: unknown): string =>
  // `in` narrows an `unknown` object to one carrying the key, so the read
  // below needs no assertion about a shape this module made up itself.
  typeof endpoint === 'object' && endpoint !== null && 'tag' in endpoint && typeof endpoint.tag === 'string'
    ? endpoint.tag
    : String(endpoint);

const tagOf = (endpoint: unknown): EndpointTag => {
  const tag = rawTagOf(endpoint);
  if (!isQueryTag(tag)) {
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
  endpoint: unknown;
  onSuccess?: (data: never, variables: never) => void;
  onError?: (error: Error, variables: never) => void;
  afterSuccess?: (data: never, variables: never) => void;
};

/**
 * The `mutate` each write endpoint's `useApiMutation` stand-in hands out; its
 * calls are the writes a screen made on that endpoint.
 */
export const mutateMocks: Record<MutationTag, ReturnType<typeof vi.fn>> = {
  sendMail: vi.fn(),
};

/** The options of every `useApiMutation` call, latest last - one per hook per render. */
const mutationCalls: { tag: MutationTag; options: MutationOptions }[] = [];

export const mutationResult = (options: MutationOptions) => {
  const tag = rawTagOf(options.endpoint);
  if (!isMutationTag(tag)) throw new Error(`apiMocks: no write endpoint "${tag}"`);
  mutationCalls.push({ tag, options });
  return { mutate: mutateMocks[tag], isPending: false, error: null };
};

/** The options the latest render gave the mutation on `tag`. */
export const latestMutation = (tag: MutationTag): MutationOptions => {
  const call = [...mutationCalls].reverse().find((candidate) => candidate.tag === tag);
  if (call === undefined) throw new Error(`apiMocks: no useApiMutation on "${tag}" was rendered`);
  return call.options;
};

/** The variables of the latest `mutate` call on `tag`. */
export const latestVariables = (tag: MutationTag): unknown => {
  const calls = mutateMocks[tag].mock.calls;
  if (calls.length === 0) throw new Error(`apiMocks: nothing was sent on "${tag}"`);
  return calls[calls.length - 1][0];
};

/** Settles a write on `tag` the way `useApiMutation` does on success: `afterSuccess`, then `onSuccess`. */
export const succeedMutation = (tag: MutationTag, data: unknown, variables: unknown): void => {
  const options = latestMutation(tag);
  options.afterSuccess?.(data as never, variables as never);
  options.onSuccess?.(data as never, variables as never);
};

export const resetApiMocks = (): void => {
  queryStates.clear();
  refetchCalls.length = 0;
  mutationCalls.length = 0;
  for (const mutate of Object.values(mutateMocks)) mutate.mockClear();
};
