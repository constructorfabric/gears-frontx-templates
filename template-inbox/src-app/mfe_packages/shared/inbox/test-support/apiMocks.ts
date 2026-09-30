/**
 * Stand-ins for the whole query layer of a screen, built from a package's own
 * endpoint map (each package's `src/test-support/apiMocks.ts`).
 *
 * Each endpoint descriptor is replaced by a tag, and `useApiQuery` answers
 * from the seeded dataset by that tag. The screens are therefore tested
 * against the content this template actually ships, without standing the API
 * service, its protocols and its mock plugin up around them.
 *
 * A suite can make a tag fail or stay loading (`setQueryState`) to reach a
 * screen's error and loading states, reads the refetches a screen asked for
 * (`refetchCalls`), and can read the options every `useApiMutation` call was
 * given to drive a write's callbacks (`latestMutation`, `succeedMutation`).
 * `resetApiMocks` puts all of it back; call it after each test.
 *
 * The mock function comes in as an argument (`vi.fn`) rather than an import:
 * this folder sits outside every package, and an import of `vitest` from
 * here could resolve to another copy than the one running the suite.
 */

/** What this module needs of a mock function: its recorded calls, and a reset. */
export type MockFunction = ((...args: never[]) => unknown) & {
  mock: { calls: unknown[][] };
  mockClear: () => unknown;
};

type QueryState = { error: Error } | { isLoading: true };

type MutationOptions = {
  endpoint: unknown;
  onSuccess?: (data: never, variables: never) => void;
  onError?: (error: Error, variables: never) => void;
  afterSuccess?: (data: never, variables: never) => void;
};

export type ApiMocksOptions<
  TEndpoints extends Record<string, string>,
  TQueryTag extends string,
  TMutationTag extends string,
  TMock extends MockFunction,
> = {
  /** The service's descriptor names, each mapped to the tag its stand-in carries. */
  endpoints: TEndpoints;
  /** The seeded answer of every read, by tag. */
  responses: Record<TQueryTag, unknown>;
  /** The tags of the write endpoints, which answer through `useApiMutation`. */
  mutations: readonly TMutationTag[];
  /** Makes a mock function: `vi.fn`. */
  fn: () => TMock;
};

/**
 * The tag a stand-in descriptor carries. An endpoint the map does not know
 * throws rather than answering `undefined`: a suite wired to the wrong
 * endpoint would otherwise render an empty state and still pass.
 */
const rawTagOf = (endpoint: unknown): string =>
  // `in` narrows an `unknown` object to one carrying the key, so the read
  // below needs no assertion about a shape this module made up itself.
  typeof endpoint === 'object' && endpoint !== null && 'tag' in endpoint && typeof endpoint.tag === 'string'
    ? endpoint.tag
    : String(endpoint);

export function createApiMocks<
  const TEndpoints extends Record<string, string>,
  TQueryTag extends string,
  TMutationTag extends string,
  TMock extends MockFunction,
>({ endpoints, responses, mutations, fn }: ApiMocksOptions<TEndpoints, TQueryTag, TMutationTag, TMock>) {
  const endpointTags = Object.fromEntries(Object.entries(endpoints).map(([name, tag]) => [name, { tag }])) as {
    readonly [K in keyof TEndpoints]: { readonly tag: TEndpoints[K] };
  };

  const isQueryTag = (value: string): value is TQueryTag => Object.prototype.hasOwnProperty.call(responses, value);
  const isMutationTag = (value: string): value is TMutationTag => (mutations as readonly string[]).includes(value);

  const tagOf = (endpoint: unknown): TQueryTag => {
    const tag = rawTagOf(endpoint);
    if (!isQueryTag(tag)) throw new Error(`apiMocks: no seeded response for endpoint "${tag}"`);
    return tag;
  };

  const queryStates = new Map<TQueryTag, QueryState>();

  /** Tags whose `refetch` a screen called, in call order. */
  const refetchCalls: TQueryTag[] = [];

  /** Makes every query on `tag` fail with `error`, or stay loading. */
  const setQueryState = (tag: TQueryTag, state: QueryState): void => {
    queryStates.set(tag, state);
  };

  const queryResultFor = (endpoint: unknown) => {
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
    return { data: responses[tag], error: null, isLoading: false, refetch };
  };

  /**
   * The `mutate` each write endpoint's `useApiMutation` stand-in hands out;
   * its calls are the writes a screen made on that endpoint.
   */
  const mutateMocks = Object.fromEntries(mutations.map((tag) => [tag, fn()])) as Record<TMutationTag, TMock>;

  /** The options of every `useApiMutation` call, latest last - one per hook per render. */
  const mutationCalls: { tag: TMutationTag; options: MutationOptions }[] = [];

  /** The write endpoints a test reports as in flight (`setMutationPending`). */
  const pendingTags = new Set<TMutationTag>();

  const mutationResult = (options: MutationOptions) => {
    const tag = rawTagOf(options.endpoint);
    if (!isMutationTag(tag)) throw new Error(`apiMocks: no write endpoint "${tag}"`);
    mutationCalls.push({ tag, options });
    return { mutate: mutateMocks[tag], isPending: pendingTags.has(tag), error: null };
  };

  /** Reports a write on `tag` as in flight, or settled, from the next render on. */
  const setMutationPending = (tag: TMutationTag, pending: boolean): void => {
    if (pending) pendingTags.add(tag);
    else pendingTags.delete(tag);
  };

  /** The options the latest render gave the mutation on `tag`. */
  const latestMutation = (tag: TMutationTag): MutationOptions => {
    const call = [...mutationCalls].reverse().find((candidate) => candidate.tag === tag);
    if (call === undefined) throw new Error(`apiMocks: no useApiMutation on "${tag}" was rendered`);
    return call.options;
  };

  /** The variables of the latest `mutate` call on `tag`. */
  const latestVariables = (tag: TMutationTag): unknown => {
    const calls = mutateMocks[tag].mock.calls;
    if (calls.length === 0) throw new Error(`apiMocks: nothing was sent on "${tag}"`);
    return calls[calls.length - 1][0];
  };

  /** Settles a write on `tag` the way `useApiMutation` does on success: `afterSuccess`, then `onSuccess`. */
  const succeedMutation = (tag: TMutationTag, data: unknown, variables: unknown): void => {
    const options = latestMutation(tag);
    options.afterSuccess?.(data as never, variables as never);
    options.onSuccess?.(data as never, variables as never);
  };

  const resetApiMocks = (): void => {
    queryStates.clear();
    refetchCalls.length = 0;
    mutationCalls.length = 0;
    pendingTags.clear();
    for (const mutate of Object.values<TMock>(mutateMocks)) mutate.mockClear();
  };

  return {
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
  };
}
