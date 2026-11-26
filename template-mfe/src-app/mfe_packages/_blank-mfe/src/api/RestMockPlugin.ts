/**
 * RestMockPlugin - REST-specific mock plugin
 *
 * Intercepts REST requests and returns mock data via short-circuit.
 * Protocol-specific replacement for generic MockPlugin.
 *
 * This MFE carries its own copy: an MFE imports no shell code.
 */


import {
  RestPluginWithConfig,
  type RestRequestContext,
  type RestShortCircuitResponse,
  type JsonValue,
  type JsonCompatible,
  MOCK_PLUGIN,
} from '@gears-frontx/react';

/** A mock response factory: request body in, response data out. */
type MockResponseFactory<TRequest = JsonValue, TResponse = JsonValue> = (
  requestData?: TRequest,
) => TResponse;

/** Distinct unmatched requests warned about before warnings stop, so the dedupe set stays bounded */
const MAX_WARNED_UNMATCHED = 50;
/** Number of mock map keys listed in the unmatched-request warning */
const MAX_KEYS_SHOWN = 5;

/**
 * REST Mock Configuration
 */
export interface RestMockConfig {
  /**
   * Optional mock response map: 'METHOD /path' -> response factory
   * If not provided, plugin will use mock maps registered on the protocol instance
   */
  mockMap?: Readonly<Record<string, MockResponseFactory<JsonValue, JsonCompatible>>>;
  /** Simulated network delay in ms */
  delay?: number;
}

/**
 * RestMockPlugin Implementation
 *
 * Intercepts REST requests and returns mock data via short-circuit.
 * Supports exact matches and URL patterns with :params.
 *
 * @example
 * ```typescript
 * const mockPlugin = new RestMockPlugin({
 *   mockMap: {
 *     'GET /users': () => [{ id: '1', name: 'John' }],
 *     'GET /users/:id': () => ({ id: '1', name: 'John' }),
 *     'POST /users': (body) => ({ id: '2', ...body }),
 *   },
 *   delay: 100,
 * });
 *
 * // Register globally
 * apiRegistry.plugins.add(RestProtocol, mockPlugin);
 *
 * // Or per-instance
 * restProtocol.plugins.add(mockPlugin);
 * ```
 */
export class RestMockPlugin extends RestPluginWithConfig<RestMockConfig> {
  /** Mock plugin marker - identifies this as a mock plugin for framework management */
  static readonly [MOCK_PLUGIN] = true;
  /** Current mock map (can be updated via setMockMap) */
  private currentMockMap?: Readonly<Record<string, MockResponseFactory<JsonValue, JsonCompatible>>>;
  /** Query-free `METHOD url` pairs already warned about as unmatched, capped at MAX_WARNED_UNMATCHED */
  private readonly warnedUnmatched = new Set<string>();

  constructor(config: RestMockConfig = {}) {
    super(config);
    this.currentMockMap = config.mockMap;
  }

  /**
   * Update mock map dynamically.
   */
  setMockMap(mockMap: Readonly<Record<string, MockResponseFactory<JsonValue, JsonCompatible>>>): void {
    this.currentMockMap = mockMap;
    // A request that warned under the old map may match the new one, so let it warn again.
    this.warnedUnmatched.clear();
  }

  /**
   * Intercept REST request and return mock if available.
   * Returns RestShortCircuitResponse to skip HTTP request.
   */
  async onRequest(
    context: RestRequestContext
  ): Promise<RestRequestContext | RestShortCircuitResponse> {
    const mockFactory = this.findMockFactory(context.method, context.url);

    if (mockFactory) {
      // Simulate network delay
      if (this.config.delay && this.config.delay > 0) {
        await this.simulateDelay();
      }

      // Get mock data from factory
      const mockData = mockFactory(context.body as JsonValue);

      // Return REST short-circuit response (skips HTTP request)
      return {
        shortCircuit: {
          status: 200,
          headers: { 'x-frontx-short-circuit': 'true' },
          data: mockData,
        },
      };
    }

    // No mock found, pass through: a project may mock only part of its
    // endpoints. Warn once per method and URL, since a key that misses the
    // request the service really sends otherwise fails with no signal.
    this.warnUnmatched(context.method, context.url);
    return context;
  }

  /**
   * Find a mock factory for the given method and URL.
   */
  private findMockFactory(
    method: string,
    url: string
  ): MockResponseFactory<unknown, unknown> | undefined {
    const mockKey = `${method.toUpperCase()} ${url}`;

    // Use config mockMap
    const mockMap = this.currentMockMap ?? {};

    // Try exact match first
    const exactMatch = mockMap[mockKey];
    if (exactMatch) {
      return exactMatch as MockResponseFactory<unknown, unknown>;
    }

    // Try pattern matching (:param replacement)
    for (const [key, factory] of Object.entries(mockMap)) {
      const [keyMethod, keyUrl] = key.split(' ', 2);

      if (
        keyMethod.toUpperCase() === method.toUpperCase() &&
        this.matchUrlPattern(keyUrl, url)
      ) {
        return factory as MockResponseFactory<unknown, unknown>;
      }
    }

    return undefined;
  }

  /**
   * Warn, once per method and query-free URL and for at most MAX_WARNED_UNMATCHED
   * distinct requests, that no mock key matches a request.
   */
  private warnUnmatched(method: string, url: string): void {
    if (this.warnedUnmatched.size >= MAX_WARNED_UNMATCHED) return;
    const request = `${method.toUpperCase()} ${url.split(/[?#]/, 1)[0]}`;
    if (this.warnedUnmatched.has(request)) return;
    this.warnedUnmatched.add(request);
    const keys = Object.keys(this.currentMockMap ?? {});
    const shown = keys.slice(0, MAX_KEYS_SHOWN).join(', ');
    const more = keys.length > MAX_KEYS_SHOWN ? ` (and ${keys.length - MAX_KEYS_SHOWN} more)` : '';
    console.warn(
      `[RestMockPlugin] Mock mode is on and no mock matches ${request}; the request passes through to the network. ` +
        `Write mock keys as "<METHOD> <full path including baseURL>". ` +
        `Known keys: ${keys.length > 0 ? shown + more : 'none'}.`
    );
  }

  /**
   * Match URL against pattern with :params.
   */
  private matchUrlPattern(pattern: string, url: string): boolean {
    if (!pattern.includes(':')) {
      return pattern === url;
    }

    // Convert pattern to regex
    const regexPattern = pattern
      .split('/')
      .map((segment) => {
        if (segment.startsWith(':')) {
          return '[^/]+'; // Match any segment
        }
        return segment;
      })
      .join('/');

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(url);
  }

  /**
   * Simulate network delay.
   */
  private simulateDelay(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, this.config.delay ?? 0));
  }

  /**
   * Cleanup plugin resources.
   */
  destroy(): void {
    // Nothing to cleanup
  }
}
