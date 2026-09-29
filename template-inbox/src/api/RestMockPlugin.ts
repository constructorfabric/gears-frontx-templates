/**
 * REST mock plugin - answers a request from a mock map instead of the network.
 *
 * The app's own, deliberately: `@gears-frontx/api` publishes the plugin
 * primitives (`RestPluginWithConfig`, the `MOCK_PLUGIN` marker, the request and
 * short-circuit context types) but not a mock plugin built from them - a mock
 * is a decision about a project's data, so the ecosystem package leaves it to
 * whoever owns the project. A seeded app owns this file. It mirrors
 * `template-shell/src/api/plugins/RestMockPlugin.ts` in shape, and differs from
 * it where this app needs more than a success echo (status replies, a 404 for
 * an unmapped route, an abortable delay) or less (no `:param` patterns, since
 * every key here is an exact path).
 *
 * Registering the plugin on a service only declares it. `setMockMode` in
 * `src/api/registry.ts` is the one switch that adds every mock plugin to its
 * protocol or takes it off again; with it off, requests reach the backend at
 * the service's base URL.
 *
 * While the plugin is active it answers every request its protocol sends:
 * - a mapped `METHOD /path` gets its factory's value as a 200 response, or the
 *   status and body of a `mockReply(status, data)` the factory returns;
 * - an unmapped route gets a 404, rather than a request that silently leaks to
 *   a network that the mock mode says is not there.
 * A status of 400 or above rejects the call with a `MockResponseError`, the way
 * an HTTP error rejects a real request.
 */

import {
  MOCK_PLUGIN,
  RestPluginWithConfig,
  type JsonCompatible,
  type JsonValue,
  type RestRequestContext,
  type RestShortCircuitResponse,
} from '@gears-frontx/api';

const MOCK_REPLY = Symbol('frontx.inbox.mockReply');

/** A factory's answer with an explicit status, built with `mockReply`. */
export type MockReply = {
  readonly [MOCK_REPLY]: true;
  readonly status: number;
  readonly data: JsonCompatible;
};

/**
 * Answers with `status` and `data` instead of a plain 200. A tagged envelope
 * rather than any `{ status, data }` object, so a response body that happens
 * to carry those two fields is never mistaken for one.
 */
export const mockReply = (status: number, data: JsonCompatible): MockReply => ({
  [MOCK_REPLY]: true,
  status,
  data,
});

const isMockReply = (value: unknown): value is MockReply =>
  typeof value === 'object' && value !== null && MOCK_REPLY in value;

/** Called with the parsed request body, or `undefined` when the request has none. */
export type RestMockFactory = (body: JsonValue | undefined) => JsonCompatible | MockReply;

/** `'METHOD /path'` -> factory. The path is the full request path, base URL included. */
export type RestMockMap = Readonly<Record<string, RestMockFactory>>;

export type RestMockConfig = {
  mockMap: RestMockMap;
  /** Simulated network latency, in milliseconds. */
  delay?: number;
};

/**
 * The rejection a mock answer with a 4xx or 5xx status turns into.
 *
 * The answer's body is `body`, not `data`, on purpose: `RestProtocol` reads an
 * error carrying both `status` and `data` as a response a plugin recovered
 * with, and would resolve the call with it instead of rejecting.
 */
export class MockResponseError extends Error {
  readonly status: number;
  readonly body: JsonCompatible;

  constructor(method: string, url: string, status: number, body: JsonCompatible) {
    super(`Mock ${method.toUpperCase()} ${url} answered ${status}`);
    this.name = 'MockResponseError';
    this.status = status;
    this.body = body;
  }
}

const isJsonValue = (value: unknown): value is JsonValue => {
  if (value === null) return true;
  if (typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value === 'object') return Object.values(value).every(isJsonValue);
  return false;
};

/** The body a factory sees: JSON as sent, a JSON string parsed, anything else absent. */
const readBody = (body: unknown): JsonValue | undefined => {
  if (body === undefined) return undefined;
  if (typeof body === 'string') {
    try {
      const parsed: unknown = JSON.parse(body);
      return isJsonValue(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  return isJsonValue(body) ? body : undefined;
};

const abortError = (signal: AbortSignal): Error =>
  signal.reason instanceof Error ? signal.reason : new DOMException('The request was aborted.', 'AbortError');

/** Waits `ms`, or rejects as soon as `signal` aborts - a cancelled request must not sit out its latency. */
const wait = (ms: number, signal: AbortSignal | undefined): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError(signal));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      if (signal) reject(abortError(signal));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });

export class RestMockPlugin extends RestPluginWithConfig<RestMockConfig> {
  /** Identifies this as a mock plugin to `setMockMode`, through `isMockPlugin`. */
  static readonly [MOCK_PLUGIN] = true;

  async onRequest(context: RestRequestContext): Promise<RestShortCircuitResponse> {
    const { delay = 0 } = this.config;
    if (delay > 0 || context.signal?.aborted) {
      await wait(delay, context.signal);
    }

    const factory = this.config.mockMap[`${context.method.toUpperCase()} ${context.url}`];
    const answer = factory ? factory(readBody(context.body)) : mockReply(404, { error: 'Not found' });
    const { status, data } = isMockReply(answer) ? answer : { status: 200, data: answer };

    if (status >= 400) {
      throw new MockResponseError(context.method, context.url, status, data);
    }

    return {
      shortCircuit: {
        status,
        headers: { 'x-frontx-short-circuit': 'true' },
        data,
      },
    };
  }

  destroy(): void {
    // Nothing to clean up.
  }
}
