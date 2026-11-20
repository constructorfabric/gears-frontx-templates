import type {
  AuthCallbackInput,
  AuthCheckResult,
  AuthContext,
  AccessConstraint,
  AccessDecision,
  AccessEvaluation,
  AccessQuery,
  AccessReason,
  AccessRecord,
  AuthCapabilitiesResolved,
  AuthIdentity,
  AuthLoginInput,
  AuthPermissions,
  AuthProvider,
  AuthSession,
  AuthTransportErrorEvent,
  AuthTransportRequest,
  AuthStateListener,
  AuthUnsubscribe,
  AuthTransition,
} from '@gears-frontx/auth';
import {
  RestPlugin,
  RestProtocol,
  type ApiPluginErrorContext,
  type RestRequestContext,
  type RestResponseContext,
} from '@gears-frontx/api';
import { eventBus } from '@gears-frontx/state';
import type { FrontXApp, FrontXPlugin } from '../types';

/** Auth event names */
export const AuthEvents = {
  /**
   * The session ended, or may have, so session-bound state is dropped.
   * Emitted when `app.auth.logout()` finishes, whether the provider resolved
   * or rejected (the user meant to leave), and when the provider reports no
   * session on its own: its `subscribe` stream reports `unauthenticated`, or
   * a refresh (`app.auth.refresh()` or the 401 retry) resolves to no
   * session, unless the last known state was already signed out. A report of
   * no session while signed in is never dropped for arriving out of order.
   */
  LoggedOut: 'auth/loggedOut',
  /**
   * A session began, possibly for another account, so session-bound state is
   * dropped. Emitted when `app.auth.login()` resolves without a redirect (a
   * redirect has no session yet), when `app.auth.handleCallback()` resolves,
   * and when the provider reports a session on its own that is not
   * positively the one already known: its `subscribe` stream or a refresh
   * reports `authenticated` after a signed-out or unknown state, or lands on
   * an identity whose `getIdentity().sub` differs from the last known one.
   *
   * The plugin fails closed: an extra clear costs a refetch, a missed one
   * shows one account's data to another. The same `sub` means the same data
   * owner, so new credentials or claims for the same account do not clear. A
   * provider without `getIdentity` signals state transitions only. For a
   * provider with it, an unknown identity counts as a change: a lookup that
   * rejects, resolves without a `sub` or takes longer than 5 seconds
   * (`SESSION_CHECK_TIMEOUT_MS`) during an authenticated session emits this
   * event, and so does a refresh that rejects while signed in. It clears once
   * per unknown identity: while the identity stays unknown, further failed
   * lookups and rejected refreshes emit nothing, until a state transition, a
   * login, callback or logout, or a lookup that finds a known identity (which
   * emits once more). A refresh that resolves while another session check is
   * still running is not checked and counts as an unknown identity. On init the
   * plugin reads `checkAuth()` and `getIdentity()` (same timeout) to set the
   * baseline without emitting, a signed-out result included; provider
   * reports wait for it, and when the read fails the first report emits.
   * After a clear for a session start, a report that arrives before that
   * clear's identity lookup lands emits this event again, since the account
   * may have switched in between; a provider echo of a login that arrives
   * after the call ended therefore clears once more, by design.
   */
  LoggedIn: 'auth/loggedIn',
  /**
   * The provider reported that a signed-in session goes on (a state event or
   * a refresh), and the plugin is checking its identity with `getIdentity()`,
   * which may take up to 5 seconds. Session-bound work started before this
   * point may belong to a session the check is about to replace, so the
   * query cache moves its scope generation: mutation callbacks started
   * earlier stop writing to the cache. Nothing is cleared; if the check finds
   * another identity, `LoggedIn` follows. Not emitted for a provider without
   * `getIdentity`, except at a provider replacement: when an
   * `auth({ provider })` replaces the provider in use, every app hears this
   * event at once, then `LoggedIn` (the new provider has a session) or
   * `LoggedOut` (it has none, or its read failed) once the new provider's
   * baseline read lands.
   */
  SessionCheck: 'auth/sessionCheck',
} as const;

/** One of the `AuthEvents` names. */
type AuthEventName = (typeof AuthEvents)[keyof typeof AuthEvents];

/** Payload for the logged-out event */
export interface AuthLoggedOutPayload {
  // Empty payload
}

/** Payload for the logged-in event */
export interface AuthLoggedInPayload {
  // Empty payload
}

/** Payload for the session-check event */
export interface AuthSessionCheckPayload {
  // Empty payload
}

declare module '@gears-frontx/state' {
  interface EventPayloadMap {
    'auth/loggedOut': AuthLoggedOutPayload;
    'auth/loggedIn': AuthLoggedInPayload;
    'auth/sessionCheck': AuthSessionCheckPayload;
  }
}

export type AuthRuntime = {
  provider: AuthProvider;
  /** Resolved capability flags built by method-presence probe at provider-attach time. */
  capabilities: AuthCapabilitiesResolved;
  getSession: (ctx?: AuthContext) => Promise<AuthSession | null>;
  checkAuth: (ctx?: AuthContext) => Promise<AuthCheckResult>;
  logout: (ctx?: AuthContext) => Promise<AuthTransition>;
  login?: (input: AuthLoginInput, ctx?: AuthContext) => Promise<AuthTransition>;
  handleCallback?: (input: AuthCallbackInput, ctx?: AuthContext) => Promise<AuthTransition>;
  refresh?: (ctx?: AuthContext) => Promise<AuthSession | null>;
  getIdentity?: (ctx?: AuthContext) => Promise<AuthIdentity | null>;
  getPermissions?: (ctx?: AuthContext) => Promise<AuthPermissions>;
  /** Fail-closed: always resolves to 'allow' | 'deny'. Never throws. */
  canAccess: <TRecord extends AccessRecord = AccessRecord>(
    query: AccessQuery<TRecord>,
    ctx?: AuthContext,
  ) => Promise<AccessDecision>;
  /** Fail-closed: always resolves to ReadonlyArray<AccessDecision>. Never throws. Order preserved. */
  canAccessMany: (
    queries: ReadonlyArray<AccessQuery>,
    ctx?: AuthContext,
  ) => Promise<ReadonlyArray<AccessDecision>>;
  /** Fail-closed: always resolves to AccessEvaluation with deny+reason on any error path. Never throws. */
  evaluateAccess: <TRecord extends AccessRecord = AccessRecord>(
    query: AccessQuery<TRecord>,
    ctx?: AuthContext,
  ) => Promise<AccessEvaluation>;
  /** Fail-closed: always resolves to ReadonlyArray<AccessEvaluation>. Never throws. Order preserved. */
  evaluateMany: (
    queries: ReadonlyArray<AccessQuery>,
    ctx?: AuthContext,
  ) => Promise<ReadonlyArray<AccessEvaluation>>;
  subscribe?: (listener: AuthStateListener) => AuthUnsubscribe;
};

/** The result of one refresh: the session it resolved to, or the error it rejected with. */
export type RefreshOutcome = { session: AuthSession | null } | { rejected: unknown };

/** Reports the result of one refresh; see `AuthTransportBinder` `trackRefresh`. */
export type RefreshReport = (outcome: RefreshOutcome) => Promise<void>;

export type AuthTransportBinding = {
  destroy: () => void;
};

export type AuthTransportBinder = (args: {
  /**
   * The provider of the `auth({ provider })` this binding serves, the object
   * itself. A binding serves one provider: `destroy()` runs when another
   * provider replaces it (that provider is destroyed then) or when the app
   * leaves (the provider lives until the last app holding it leaves). From
   * `destroy()` on, the binding attaches no credentials and retries nothing, a
   * request already running included: the default transport does so, a custom
   * binder stops its own pending work in `destroy()`. Each app is bound again
   * for the new provider.
   */
  provider: AuthProvider;
  csrfHeaderName?: string;
  allowedCookieOrigins?: string[];
  allowedBearerOrigins?: string[];
  /**
   * Call when starting a refresh the binder makes on its own (for example on a
   * 401) and pass the outcome to the returned function, so the auth plugin can
   * emit `AuthEvents` when it may have landed on another session. A rejected
   * refresh while signed in counts as an unknown identity. A session that
   * resolves after a newer report is ignored; no session while signed in is
   * never ignored. The returned function never
   * rejects and settles within 10 seconds at worst, since the init baseline
   * and the identity lookup each time out after 5; a result that arrives while
   * another session check runs clears without a lookup and settles at once.
   * Await it before retrying so the retry runs after the clear.
   */
  trackRefresh?: () => RefreshReport;
  addRestPlugin: (plugin: RestPlugin) => void;
  removeRestPlugin: (pluginClass: new (...args: never[]) => RestPlugin) => void;
}) => AuthTransportBinding;

/**
 * Credentials go to the app's own origin and to the origins listed here, and nowhere else.
 * Write each origin the way `URL.origin` gives it: scheme, host and port, with no path or
 * trailing slash, such as `'https://api.example.com'`.
 *
 * The check reads the URL plugins get, the service's `baseURL` joined with the path, but
 * axios skips the `baseURL` for an absolute or `//` path. An absolute path keeps its scheme in
 * the joined URL, and a URL with `http:` or `https:` in its path gets no credentials. A `//`
 * path does not show in the join, so until constructorfabric/gears-frontx#770 is fixed, pass
 * only relative paths to a service with a `baseURL`.
 */
export type Hai3ApiAuthTransportConfig = {
  /** Other origins where a cookie session's requests go with `withCredentials` and the CSRF header. */
  allowedCookieOrigins?: string[];
  /**
   * Other origins where a bearer session's requests carry `Authorization: Bearer <token>`,
   * also on the retry after a refresh. An app whose API is on another origin lists it here.
   */
  allowedBearerOrigins?: string[];
  csrfHeaderName?: string;
};

export type AuthPluginConfig = {
  provider: AuthProvider;
  /**
   * Optional transport binder.
   * If omitted, the default `frontxApiTransport()` binding is used.
   */
  transport?: AuthTransportBinder;
  /**
   * Configuration for the default @gears-frontx/api binding.
   * Ignored when `transport` is provided.
   */
  frontxApi?: Hai3ApiAuthTransportConfig;
};

// ---------------------------------------------------------------------------
// Capability probe
// ---------------------------------------------------------------------------

function buildCapabilities(provider: AuthProvider): AuthCapabilitiesResolved {
  return {
    hasGetIdentity: typeof provider.getIdentity === 'function',
    hasGetPermissions: typeof provider.getPermissions === 'function',
    hasCanAccess: typeof provider.canAccess === 'function',
    hasCanAccessMany: typeof provider.canAccessMany === 'function',
    hasEvaluateAccess: typeof provider.evaluateAccess === 'function',
    hasEvaluateMany: typeof provider.evaluateMany === 'function',
    hasRefresh: typeof provider.refresh === 'function',
    hasSubscribe: typeof provider.subscribe === 'function',
  };
}

// ---------------------------------------------------------------------------
// Fail-closed access wrappers
// ---------------------------------------------------------------------------

function classifyAbortReason(signal: AbortSignal): AccessReason {
  const reason = signal.reason;
  if (reason instanceof Error && reason.name === 'TimeoutError') return 'timeout';
  return 'aborted';
}

function isAccessDecision(value: unknown): value is AccessDecision {
  return value === 'allow' || value === 'deny';
}

function normalizeDecision(value: unknown): AccessDecision {
  return value === 'allow' ? 'allow' : 'deny';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isAccessReason(value: unknown): value is AccessReason {
  return typeof value === 'string';
}

function isAccessJsonValue(value: unknown, seen: WeakSet<object> = new WeakSet()): boolean {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
  ) {
    return true;
  }

  if (typeof value === 'number') {
    // JSON forbids NaN / ±Infinity — fail closed so meta/constraints stay round-trippable.
    return Number.isFinite(value);
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) return false;
    seen.add(value);
    return value.every((entry) => isAccessJsonValue(entry, seen));
  }

  if (isPlainObject(value)) {
    if (seen.has(value)) return false;
    seen.add(value);
    return Object.values(value).every((entry) => isAccessJsonValue(entry, seen));
  }

  return false;
}

function isAccessConstraint(value: unknown): value is AccessConstraint {
  return isPlainObject(value)
    && Object.values(value).every((entry) => isAccessJsonValue(entry));
}

function isAccessConstraints(value: unknown): value is ReadonlyArray<AccessConstraint> {
  return Array.isArray(value) && value.every((entry) => isAccessConstraint(entry));
}

function isAccessMeta(value: unknown): value is NonNullable<AccessEvaluation['meta']> {
  return isPlainObject(value)
    && Object.values(value).every((entry) => isAccessJsonValue(entry));
}

function normalizeEvaluation(value: unknown): AccessEvaluation {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { decision: 'deny', reason: 'provider_error' };
  }

  const maybeEvaluation = value as {
    decision?: unknown;
    constraints?: unknown;
    reason?: unknown;
    meta?: unknown;
  };
  if (!isAccessDecision(maybeEvaluation.decision)) {
    return { decision: 'deny', reason: 'provider_error' };
  }

  if (maybeEvaluation.constraints !== undefined && !isAccessConstraints(maybeEvaluation.constraints)) {
    return { decision: 'deny', reason: 'provider_error' };
  }

  if (maybeEvaluation.reason !== undefined && !isAccessReason(maybeEvaluation.reason)) {
    return { decision: 'deny', reason: 'provider_error' };
  }

  if (maybeEvaluation.meta !== undefined && !isAccessMeta(maybeEvaluation.meta)) {
    return { decision: 'deny', reason: 'provider_error' };
  }

  const normalized: AccessEvaluation = { decision: maybeEvaluation.decision };
  if (maybeEvaluation.constraints !== undefined) {
    normalized.constraints = maybeEvaluation.constraints;
  }
  if (maybeEvaluation.reason !== undefined) {
    normalized.reason = maybeEvaluation.reason;
  }
  if (maybeEvaluation.meta !== undefined) {
    normalized.meta = maybeEvaluation.meta;
  }
  return normalized;
}

async function safeCanAccess(
  provider: AuthProvider,
  caps: AuthCapabilitiesResolved,
  query: AccessQuery,
  ctx?: AuthContext,
): Promise<AccessDecision> {
  if (!query.action || !query.resource) return 'deny';
  if (!caps.hasCanAccess) return 'deny';

  let session: AuthSession | null;
  try {
    session = await provider.getSession(ctx);
  } catch {
    return 'deny';
  }
  if (session === null) return 'deny';

  try {
    return normalizeDecision(await provider.canAccess?.(query, ctx));
  } catch {
    return 'deny';
  }
}

async function safeEvaluateAccess(
  provider: AuthProvider,
  caps: AuthCapabilitiesResolved,
  query: AccessQuery,
  ctx?: AuthContext,
): Promise<AccessEvaluation> {
  if (!query.action || !query.resource) {
    return { decision: 'deny', reason: 'malformed' };
  }
  if (!caps.hasEvaluateAccess) {
    return { decision: 'deny', reason: 'unsupported' };
  }

  let session: AuthSession | null;
  try {
    session = await provider.getSession(ctx);
  } catch {
    return { decision: 'deny', reason: 'unauthenticated' };
  }
  if (session === null) {
    return { decision: 'deny', reason: 'unauthenticated' };
  }

  try {
    return normalizeEvaluation(await provider.evaluateAccess?.(query, ctx));
  } catch {
    const signal = ctx?.signal;
    if (signal?.aborted) {
      return { decision: 'deny', reason: classifyAbortReason(signal) };
    }
    return { decision: 'deny', reason: 'provider_error' };
  }
}

async function safeCanAccessMany(
  provider: AuthProvider,
  caps: AuthCapabilitiesResolved,
  queries: ReadonlyArray<AccessQuery>,
  ctx?: AuthContext,
): Promise<ReadonlyArray<AccessDecision>> {
  if (queries.length === 0) return [];

  // Fail-closed contract parity with safeCanAccess: a single malformed query
  // forces the whole batch through the per-query safe wrapper so the provider's
  // bulk method cannot return 'allow' for an entry without action/resource.
  if (queries.some((query) => !query.action || !query.resource)) {
    const decisions: AccessDecision[] = [];
    for (const query of queries) {
      decisions.push(await safeCanAccess(provider, caps, query, ctx));
    }
    return decisions;
  }

  if (caps.hasCanAccessMany) {
    let session: AuthSession | null;
    try {
      session = await provider.getSession(ctx);
    } catch {
      return queries.map(() => 'deny' as const);
    }
    if (session === null) return queries.map(() => 'deny' as const);

    try {
      const decisions = await provider.canAccessMany?.(queries, ctx);
      if (!Array.isArray(decisions) || decisions.length !== queries.length) {
        return queries.map(() => 'deny' as const);
      }
      return decisions.map((decision) => normalizeDecision(decision));
    } catch {
      return queries.map(() => 'deny' as const);
    }
  }

  const results: AccessDecision[] = [];
  for (const query of queries) {
    results.push(await safeCanAccess(provider, caps, query, ctx));
  }
  return results;
}

async function safeEvaluateMany(
  provider: AuthProvider,
  caps: AuthCapabilitiesResolved,
  queries: ReadonlyArray<AccessQuery>,
  ctx?: AuthContext,
): Promise<ReadonlyArray<AccessEvaluation>> {
  if (queries.length === 0) return [];

  // Same fail-closed parity as safeCanAccessMany: route any malformed query
  // through the per-query safe wrapper so the bulk path cannot leak 'allow'
  // for entries with empty action/resource.
  if (queries.some((query) => !query.action || !query.resource)) {
    const evaluations: AccessEvaluation[] = [];
    for (const query of queries) {
      evaluations.push(await safeEvaluateAccess(provider, caps, query, ctx));
    }
    return evaluations;
  }

  if (caps.hasEvaluateMany) {
    let session: AuthSession | null;
    try {
      session = await provider.getSession(ctx);
    } catch {
      return queries.map(() => ({ decision: 'deny' as const, reason: 'unauthenticated' as const }));
    }
    if (session === null) {
      return queries.map(() => ({ decision: 'deny' as const, reason: 'unauthenticated' as const }));
    }

    try {
      const evaluations = await provider.evaluateMany?.(queries, ctx);
      if (!Array.isArray(evaluations) || evaluations.length !== queries.length) {
        return queries.map(() => ({ decision: 'deny' as const, reason: 'provider_error' as const }));
      }
      return evaluations.map((evaluation) => normalizeEvaluation(evaluation));
    } catch {
      const signal = ctx?.signal;
      if (signal?.aborted) {
        const reason = classifyAbortReason(signal);
        return queries.map(() => ({ decision: 'deny' as const, reason }));
      }
      return queries.map(() => ({ decision: 'deny' as const, reason: 'provider_error' as const }));
    }
  }

  const results: AccessEvaluation[] = [];
  for (const query of queries) {
    results.push(await safeEvaluateAccess(provider, caps, query, ctx));
  }
  return results;
}

// ---------------------------------------------------------------------------
// REST transport helpers
// ---------------------------------------------------------------------------

function isSupportedAuthTransportMethod(
  method: RestRequestContext['method']
): method is AuthTransportRequest['method'] {
  return method === 'GET'
    || method === 'POST'
    || method === 'PUT'
    || method === 'DELETE'
    || method === 'PATCH'
    || method === 'HEAD'
    || method === 'OPTIONS';
}

function toAuthTransportRequest(request: RestRequestContext): AuthTransportRequest | null {
  if (!isSupportedAuthTransportMethod(request.method)) return null;

  let body: string | undefined;
  if (typeof request.body === 'string') {
    body = request.body;
  } else if (request.body !== undefined) {
    try {
      body = JSON.stringify(request.body);
    } catch {
      body = undefined;
    }
  }

  return {
    url: request.url,
    method: request.method,
    headers: request.headers,
    body,
    signal: request.signal,
  };
}

/**
 * Stands in for the app's origin where the runtime has none, as in Node or a sandboxed
 * frame, so a relative URL still counts as the app's own. No real host ends in `.invalid`.
 */
const NO_RUNTIME_ORIGIN = 'http://runtime-origin.invalid';

function getRuntimeOrigin(): string | null {
  const maybeLocation = (globalThis as { location?: { origin?: string } }).location;
  if (!maybeLocation?.origin || maybeLocation.origin === 'null') return null;
  return maybeLocation.origin;
}

/**
 * An `http:` or `https:` scheme inside a URL's path, such as the `https:/` in
 * `/apihttps://evil.example/x`. One slash is enough: the join that builds the URL plugins see
 * collapses every `//` and puts back `://` only for the first scheme in the URL.
 *
 * Only these two count, because they are the only schemes axios sends to another host;
 * `file:`, `blob:` and `data:` never leave the machine. Any other `word:/` segment, such as
 * `/kv/key:/v` or `/files/c:/x`, is an ordinary path and keeps its credentials.
 */
const HTTP_SCHEME_IN_PATH = /https?:\//i;

/**
 * Whether a request to `url` may carry the session's credentials: it goes to the app's own
 * origin, or to an origin listed in `allowedOrigins`.
 *
 * The URL is resolved the way the browser resolves it, not read by its prefix. Browsers read
 * `\` as `/` and drop tabs and newlines, so `/\evil.example/x` goes to `evil.example`, just
 * like `//evil.example/x`.
 *
 * A URL with `http:` or `https:` inside its path gets no credentials. `@gears-frontx/api`
 * shows plugins the service's `baseURL` joined with the path, but axios sends an absolute path
 * as it is, so `get('https://evil.example/x')` on a service with `baseURL: '/api'` reaches
 * this check as `/apihttps://evil.example/x` and goes to `evil.example`. The query is not read,
 * so `?next=https://...` keeps its credentials. A `//` path loses its slashes in the join and
 * cannot be told apart until constructorfabric/gears-frontx#770 is fixed.
 */
function shouldIncludeCredentials(url: string, allowedOrigins: readonly string[] | undefined): boolean {
  const ownOrigin = getRuntimeOrigin() ?? NO_RUNTIME_ORIGIN;
  let resolved: URL;
  try {
    resolved = new URL(url, ownOrigin);
  } catch {
    return false;
  }
  if (HTTP_SCHEME_IN_PATH.test(resolved.pathname)) return false;
  const { origin } = resolved;
  if (origin === ownOrigin) return true;
  // A URL without an origin of its own, such as `data:`, reports the opaque origin 'null'.
  if (origin === 'null') return false;
  return allowedOrigins?.includes(origin) ?? false;
}

/**
 * The event the framework transport passes to `AuthProvider.onTransportError`. `credentialed`
 * checks the request's origin, not the session: it is false when the origin is not the app's
 * own and is in neither `allowedCookieOrigins` nor `allowedBearerOrigins`, the check that keeps
 * such a 401 from starting a refresh. An emitter that does not set it leaves the request
 * counted as credentialed.
 */
export type FrameworkTransportErrorEvent = AuthTransportErrorEvent & { credentialed?: boolean };

type RefreshFlight = {
  refresh: Promise<AuthSession | null>;
  /** Settles once the session tracker has seen the result; never rejects. */
  reported: Promise<void>;
};

/** Refreshes a 401 may start in a row without any 2xx response in between. */
const MAX_REFRESHES_WITHOUT_SUCCESS = 2;
/** How long a 401 stops refreshing once that limit is reached and no 2xx came back. */
const REFRESH_BACKOFF_MS = 30_000;

class AuthRestPlugin extends RestPlugin {
  /** Shared in-flight refresh; deduplicates concurrent 401 refresh calls. Reset as soon as the refresh settles. */
  private flight: RefreshFlight | null = null;
  /** Refreshes started since the last 2xx response, and when the last one started. */
  private refreshesWithoutSuccess = 0;
  private lastRefreshAt = 0;
  /** Set when the binding is destroyed: from then on, a request already running included, no credentials and no retry. */
  private retired = false;

  constructor(
    private readonly config: AuthPluginConfig,
    private readonly trackRefresh?: () => RefreshReport,
  ) {
    super();
  }

  retire(): void {
    this.retired = true;
  }

  async onRequest(ctx: RestRequestContext): Promise<RestRequestContext> {
    if (this.retired) return ctx;
    const session = await this.config.provider.getSession({ signal: ctx.signal });
    if (!session || this.retired) return ctx;

    if (session.kind === 'cookie') {
      if (!shouldIncludeCredentials(ctx.url, this.config.frontxApi?.allowedCookieOrigins)) return ctx;

      const next: RestRequestContext = { ...ctx, withCredentials: true };
      const csrfHeaderName = this.config.frontxApi?.csrfHeaderName;
      if (csrfHeaderName && session.csrfToken) {
        return {
          ...next,
          headers: {
            ...next.headers,
            [csrfHeaderName]: session.csrfToken,
          },
        };
      }
      return next;
    }

    if (session.kind === 'bearer' && session.token) {
      if (!shouldIncludeCredentials(ctx.url, this.config.frontxApi?.allowedBearerOrigins)) return ctx;

      return {
        ...ctx,
        headers: {
          ...ctx.headers,
          Authorization: `Bearer ${session.token}`,
        },
      };
    }

    // Custom sessions: no standard transport mechanism — use a custom transport binder for retry.
    return ctx;
  }

  onResponse(ctx: RestResponseContext): RestResponseContext {
    if (ctx.status >= 200 && ctx.status < 300) this.refreshesWithoutSuccess = 0;
    return ctx;
  }

  /**
   * A server that keeps answering 401 to a refreshed session would otherwise
   * refresh on every request it gets: after `MAX_REFRESHES_WITHOUT_SUCCESS`
   * refreshes with no 2xx response, a 401 fails without refreshing until
   * `REFRESH_BACKOFF_MS` pass or a request succeeds.
   */
  private refreshExhausted(): boolean {
    if (this.refreshesWithoutSuccess < MAX_REFRESHES_WITHOUT_SUCCESS) return false;
    if (Date.now() - this.lastRefreshAt < REFRESH_BACKOFF_MS) return true;
    this.refreshesWithoutSuccess = 0;
    return false;
  }

  /**
   * Whether a request to `url` goes to the app's own origin or to one in either origin list.
   * A 401 from any other origin says nothing about this session.
   */
  private reachesCredentialedOrigin(url: string): boolean {
    const { allowedCookieOrigins = [], allowedBearerOrigins = [] } = this.config.frontxApi ?? {};
    return shouldIncludeCredentials(url, [...allowedCookieOrigins, ...allowedBearerOrigins]);
  }

  async onError(ctx: ApiPluginErrorContext): Promise<Error | RestResponseContext> {
    if (this.retired) return ctx.error;
    const credentialed = this.reachesCredentialedOrigin(ctx.request.url);
    // Notify provider of every transport error (informational; called before retry decisions).
    // `credentialed` is false for a request to an origin outside the app's own and both lists,
    // so a hook can tell a 401 that says nothing about this session from one that may.
    const requestForHook = toAuthTransportRequest(ctx.request);
    if (requestForHook) {
      const event: FrameworkTransportErrorEvent = {
        request: requestForHook,
        error: ctx.error,
        status: ctx.response?.status,
        credentialed,
      };
      this.config.provider.onTransportError?.(event);
    }

    if (ctx.response?.status !== 401) return ctx.error;
    if (ctx.retryCount !== 0) return ctx.error;
    if (!this.config.provider.refresh) return ctx.error;
    // A 401 from an origin that gets no credentials under either list says nothing about this
    // session: it neither refreshes the session nor counts toward the refresh limit. The gate
    // takes either list, not the session's kind, since a refresh may change the kind.
    if (!credentialed) return ctx.error;
    const { allowedBearerOrigins = [] } = this.config.frontxApi ?? {};

    // Dedup concurrent 401 refresh calls into a single in-flight promise.
    // NOTE: shared refresh must NOT be bound to any single request's AbortSignal —
    // otherwise aborting the first caller would cancel refresh for all concurrent
    // waiters on the same promise. Cancellation of the refresh call itself is the
    // provider's responsibility (timeout / internal lifecycle).
    //
    // The report runs after the refresh settles, outside the shared promise: an
    // identity lookup inside it that gets a 401 starts a fresh refresh instead
    // of waiting on the one that waits for it.
    if (!this.flight && this.refreshExhausted()) return ctx.error;
    const flight = this.flight ?? this.startRefresh();

    let refreshed: AuthSession | null;
    try {
      refreshed = await flight.refresh;
    } catch {
      await flight.reported;
      return ctx.error;
    }
    await flight.reported;
    // The provider may have been replaced while the refresh or its report ran: its session is no one's now.
    if (!refreshed || this.retired) return ctx.error;

    if (refreshed.kind === 'bearer') {
      if (!refreshed.token) return ctx.error;
      // The retry sets this header itself, before `onRequest` runs again, so it needs the
      // bearer check too: an origin listed only for cookies passed the check above.
      // Without the token, the retry would only repeat the request.
      if (!shouldIncludeCredentials(ctx.request.url, allowedBearerOrigins)) {
        return ctx.error;
      }
      return ctx.retry({
        headers: { Authorization: `Bearer ${refreshed.token}` },
      });
    }

    if (refreshed.kind === 'cookie') {
      // Cookie credentials are sent automatically via withCredentials.
      // No Authorization header override needed after refresh.
      return ctx.retry();
    }

    // Custom sessions: no standard retry mechanism — use a custom transport binder.
    return ctx.error;
  }

  private startRefresh(): RefreshFlight {
    this.refreshesWithoutSuccess += 1;
    this.lastRefreshAt = Date.now();
    const report = this.trackRefresh?.();
    const refresh = this.config.provider.refresh!();
    const flight: RefreshFlight = {
      refresh,
      reported: refresh.then(
        (session) => report?.({ session }),
        (rejected: unknown) => report?.({ rejected }),
      ),
    };
    const reset = () => {
      if (this.flight === flight) this.flight = null;
    };
    void refresh.then(reset, reset);
    this.flight = flight;
    return flight;
  }
}

export function frontxApiTransport(): AuthTransportBinder {
  return (args) => {
    const restPlugin = new AuthRestPlugin(
      {
        provider: args.provider,
        frontxApi: {
          allowedCookieOrigins: args.allowedCookieOrigins,
          allowedBearerOrigins: args.allowedBearerOrigins,
          csrfHeaderName: args.csrfHeaderName,
        },
      },
      args.trackRefresh,
    );
    args.addRestPlugin(restPlugin);
    return {
      destroy: () => {
        restPlugin.retire();
        args.removeRestPlugin(AuthRestPlugin);
      },
    };
  };
}

// ---------------------------------------------------------------------------
// Session tracking
// ---------------------------------------------------------------------------

/** How long a session check (`checkAuth()` at init, `getIdentity()`) may take before it counts as failed. */
const SESSION_CHECK_TIMEOUT_MS = 5_000;

type SessionTracker = {
  /** Takes a report ticket; take it when the work that produces the report starts. */
  ticket: () => number;
  /** Reports the current state: a provider state event, or a resolved refresh (`fromRefresh`). */
  observe: (authenticated: boolean, ticket?: number, fromRefresh?: boolean) => Promise<void>;
  /** Reports a refresh that rejected. */
  refreshFailed: () => void;
  /**
   * Reads the session at init to set the baseline. Emits nothing, unless `announce`: then the
   * baseline emits `LoggedIn` for a session and `LoggedOut` for none or a failed read.
   */
  establish: (announce: boolean) => Promise<void>;
  /** An `app.auth` login, callback or logout starts; provider reports stay silent until it ends. */
  begin: () => void;
  /** It ended: emit for `target` and record it, or with `null` (no session change) replay what the provider reported meanwhile. */
  end: (target: boolean | null) => void;
  stop: () => void;
};

/**
 * Identity the tracker holds for an authenticated session.
 * - `fresh`: the plugin just emitted for this session under report ticket `since`; the lookup started for
 *   that same report sets the baseline silently, while a lookup for any later report counts as a change,
 *   since the session may have moved between the emit and the lookup;
 * - `known`: the account of the last successful lookup;
 * - `unknown`: anything else (no lookup landed yet, or the last one failed); the next lookup counts as a change,
 *   unless `cleared`: the plugin already cleared for this unknown identity, so only a state transition, a
 *   login, callback or logout, or a lookup that finds a known identity clears again. That stops a 401 loop
 *   (401, refresh, clear, refetch, 401) while `getIdentity` keeps failing.
 */
type TrackedIdentity =
  | { kind: 'fresh'; since: number }
  | { kind: 'unknown'; cleared: boolean }
  | { kind: 'known'; sub: string };

/**
 * Follows the session the provider reports and emits `AuthEvents` when it
 * might have changed. It fails closed: an extra clear costs a refetch, a
 * missed one shows one account's data to another, so it stays silent only
 * when a report is positively the same signed-in state and identity (`sub`)
 * as the last known one. An unknown identity clears once, not on every report
 * while it stays unknown.
 *
 * Reports are ordered by the ticket taken when their work started: one older
 * than the last applied report is dropped, except a report of no session
 * while signed in, and so is an identity lookup whose report was overtaken.
 * A report of a signed-in session that goes on emits `SessionCheck` before
 * its identity lookup. A report waits for the init baseline, except a
 * refresh that lands while a session check runs: that check may itself wait
 * on the refreshed request, so the refresh is not checked and clears. Nothing
 * is emitted after `stop()`, and `stop()` cancels the checks still running.
 */
function createSessionTracker(
  provider: AuthProvider,
  caps: AuthCapabilitiesResolved,
  emitEvent: (event: AuthEventName) => void,
): SessionTracker {
  /** `undefined` until the init baseline or a report lands, or when the init check failed. */
  let authenticated: boolean | undefined;
  let identity: TrackedIdentity = { kind: 'unknown', cleared: false };
  let issued = 0;
  let applied = 0;
  let busy = 0;
  let suppressed: boolean | undefined;
  let stopped = false;
  let baseline: Promise<void> = Promise.resolve();
  /** Cancels each session check still running. */
  const checks = new Set<() => void>();

  const ticket = () => ++issued;

  function emit(event: AuthEventName): void {
    if (!stopped) emitEvent(event);
  }

  /** Runs a provider read; `null` when it rejects, takes longer than the timeout or is cancelled. */
  async function check<T>(read: () => Promise<T> | T): Promise<T | null> {
    let cancel = (): void => undefined;
    const bounded = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => reject(new Error('session check timed out')), SESSION_CHECK_TIMEOUT_MS);
      cancel = () => {
        clearTimeout(timer);
        reject(new Error('session check cancelled'));
      };
    });
    checks.add(cancel);
    try {
      return await Promise.race([Promise.resolve().then(read), bounded]);
    } catch {
      return null;
    } finally {
      cancel();
      checks.delete(cancel);
    }
  }

  /** The current account, or `null` when the lookup fails or has no `sub`. */
  async function lookupSub(): Promise<string | null> {
    const found = await check(() => provider.getIdentity?.());
    return typeof found?.sub === 'string' && found.sub !== '' ? found.sub : null;
  }

  /** The identity is unknown: clear, unless the plugin already cleared for this unknown identity. */
  function clearForUnknownIdentity(): void {
    if (identity.kind === 'unknown' && identity.cleared) return;
    identity = { kind: 'unknown', cleared: true };
    emit(AuthEvents.LoggedIn);
  }

  async function resolveIdentity(current: number): Promise<void> {
    if (!caps.hasGetIdentity) return;
    const sub = await lookupSub();
    if (stopped || current !== applied || authenticated !== true) return;
    const before = identity;
    if (sub === null) {
      // A `fresh` session was cleared for this very report, so its unknown identity counts as cleared.
      if (before.kind === 'fresh' && before.since === current) identity = { kind: 'unknown', cleared: true };
      else clearForUnknownIdentity();
      return;
    }
    identity = { kind: 'known', sub };
    const changed = before.kind === 'unknown'
      || (before.kind === 'fresh' && before.since !== current)
      || (before.kind === 'known' && before.sub !== sub);
    if (changed) emit(AuthEvents.LoggedIn);
  }

  async function observe(next: boolean, current: number = ticket(), fromRefresh = false): Promise<void> {
    const unchecked = fromRefresh && checks.size > 0;
    if (!unchecked) await baseline;
    if (stopped) return;
    // A report older than the last applied one is dropped, except no session while signed in: that one
    // fails closed, since the newer report may have been the stale one.
    if (current < applied && (next || authenticated !== true)) return;
    applied = Math.max(applied, current);
    if (busy > 0) {
      suppressed = next;
      return;
    }
    const previous = authenticated;
    authenticated = next;
    if (!next) {
      // Only signed out followed by signed out is positively the same.
      if (previous !== false) emit(AuthEvents.LoggedOut);
      return;
    }
    if (unchecked) {
      // A state transition always clears; otherwise this is one more unknown identity.
      if (previous !== true) identity = { kind: 'unknown', cleared: false };
      clearForUnknownIdentity();
      return;
    }
    if (previous !== true) {
      identity = { kind: 'fresh', since: current };
      emit(AuthEvents.LoggedIn);
    } else if (caps.hasGetIdentity) {
      // The lookup may take up to the timeout: move the cache scope now so work started before this
      // report cannot write into a cache the lookup may yet decide to clear.
      emit(AuthEvents.SessionCheck);
    }
    await resolveIdentity(current);
  }

  /** A refresh rejected. While signed in the identity is no longer known, so it counts as unknown. */
  function refreshFailed(): void {
    if (stopped || busy > 0 || authenticated !== true) return;
    clearForUnknownIdentity();
  }

  async function establish(announce: boolean): Promise<void> {
    const current = ticket();
    const result = await check(() => provider.checkAuth());
    const sub = result?.authenticated === true ? await lookupSub() : null;
    // Any report, login or logout since init is newer than this baseline.
    if (stopped || applied > current) return;
    applied = current;
    // A failed check leaves the state unknown, so the first report clears.
    authenticated = result === null ? undefined : result?.authenticated === true;
    identity = sub === null ? { kind: 'unknown', cleared: false } : { kind: 'known', sub };
    if (!announce) return;
    // This provider replaced another, so the account may have changed: the baseline clears once.
    if (authenticated === true) {
      if (sub === null) identity = { kind: 'unknown', cleared: true };
      emit(AuthEvents.LoggedIn);
    } else {
      emit(AuthEvents.LoggedOut);
    }
  }

  return {
    ticket,
    observe,
    refreshFailed,
    establish(announce) {
      baseline = establish(announce);
      return baseline;
    },
    begin() {
      busy += 1;
    },
    end(target) {
      busy -= 1;
      if (stopped) return;
      if (target !== null) {
        authenticated = target;
        suppressed = undefined;
        const current = (applied = ticket());
        identity = { kind: 'fresh', since: current };
        emit(target ? AuthEvents.LoggedIn : AuthEvents.LoggedOut);
        if (target) void resolveIdentity(current);
        return;
      }
      if (busy === 0 && suppressed !== undefined) {
        const replay = suppressed;
        suppressed = undefined;
        void observe(replay);
      }
    },
    stop() {
      stopped = true;
      for (const cancel of checks) cancel();
    },
  };
}

// ---------------------------------------------------------------------------
// The realm record: one session runtime per JavaScript realm
// ---------------------------------------------------------------------------

/**
 * The version of the realm record contract below. A copy of the framework
 * that finds a record of another version fails at once instead of reading
 * fields whose meaning it does not know. Bump it on any change to the record
 * shape or to what a field means.
 */
const AUTH_REALM_CONTRACT_VERSION = 1;

/**
 * The slot the realm record lives in. `Symbol.for` returns the same symbol
 * from every package copy, so the shell and every microfrontend of the page
 * (each with its own copy of the framework) meet at one key per realm.
 */
const AUTH_REALM_SYMBOL = Symbol.for('frontx:auth:realm');

const DUPLICATE_PLUGIN_CLEANUP_SYMBOL = Symbol.for('frontx:plugin:duplicate-cleanup');

/** One app's hold on the realm. Every member runs the code of the app's own framework copy. */
type AuthRealmHolder = {
  /** Re-emits an `AuthEvents` name on the app's own eventBus. */
  emit: (event: AuthEventName) => void;
  /** Binds the app's REST transport for `generation` alone, replacing its earlier binding. */
  bind: (generation: AuthGeneration) => void;
  /** Removes the app's REST transport. */
  unbind: () => void;
};

/**
 * One provider's lifetime in the realm: the provider and everything that
 * authorises its credentials (its `frontxApi` config and custom binder), from
 * the app that passed it until another provider replaces it or the last
 * holder leaves. They are retired together, at once.
 */
type AuthGeneration = {
  provider: AuthProvider;
  /** The runtime built around this provider alone; apps reach it only through the realm's runtime. */
  runtime: AuthRuntime;
  /** The `frontxApi` config of the `auth()` that passed the provider, copied one level deep. */
  transportConfig?: Hai3ApiAuthTransportConfig;
  /** The custom binder of that `auth()`, when it has one. */
  transport?: AuthTransportBinder;
  /**
   * Starts the session tracking: the baseline read and the provider
   * subscription. Its `AuthEvents` go to every holder of `holders`. With
   * `announce`, the baseline itself emits.
   */
  start: (holders: ReadonlySet<AuthRealmHolder>, announce: boolean) => void;
  /** The `trackRefresh` of `AuthTransportBinder`, reporting to this provider's session tracker. */
  trackRefresh: () => RefreshReport;
  /** Stops the session tracking and, with `destroyProvider`, destroys the provider at once. */
  retire: (destroyProvider: boolean) => void;
};

/**
 * What the first app that passes a provider publishes, for every app of the
 * realm. Nothing in it says which app that was: the shell and a
 * microfrontend publish the same record, and every app, the publishing one
 * included, holds it the same way. A later provider replaces `current` in
 * the same record, and every holder is bound again for it.
 */
type AuthRealmRecord = {
  version: number;
  /**
   * The session runtime every app of the realm provides as its `app.auth`. It
   * keeps no provider of its own: every call reads `current` when it starts.
   */
  runtime: AuthRuntime;
  /** The provider in use. */
  current: AuthGeneration;
  /** The apps that hold the runtime; the provider in use lives until the last one releases. */
  holders: Set<AuthRealmHolder>;
  /** The listeners added with `runtime.subscribe`, moved to each new provider. */
  listeners: Set<AuthRealmListener>;
  /** The providers replaced in this realm, all destroyed; one passed again is refused while this record exists. */
  retired: WeakSet<AuthProvider>;
  /** Set while a replacement runs, so one started from its callbacks is refused. */
  replacing?: boolean;
};

/** A listener added with the realm runtime's `subscribe`, and its subscription on the provider in use. */
type AuthRealmListener = { listener: AuthStateListener; unsubscribe: AuthUnsubscribe | null };

type AuthRealmHost = typeof globalThis & { [AUTH_REALM_SYMBOL]?: AuthRealmRecord };

/** The record of this realm, if any; throws on a record of another contract version. */
function readAuthRealm(): AuthRealmRecord | undefined {
  const record = (globalThis as AuthRealmHost)[AUTH_REALM_SYMBOL];
  if (record === undefined) return undefined;
  const version = (record as { version?: unknown } | null)?.version;
  if (version !== AUTH_REALM_CONTRACT_VERSION) {
    throw new Error(
      `[Gears FrontX] auth() found an auth realm record of contract version ${String(version)}, ` +
        `but this copy of @gears-frontx/framework speaks version ${AUTH_REALM_CONTRACT_VERSION}. ` +
        'Every app of the page must use a framework version with the same auth realm contract.'
    );
  }
  return record;
}

const NO_PROVIDER_ERROR =
  '[Gears FrontX] auth() with no provider joins the session of the realm, but no app of the realm ' +
  'has passed one yet. Build the app with auth({ provider }) first.';

const REPLACED_PROVIDER_ERROR =
  '[Gears FrontX] The session provider this call started on was replaced before the call ended, ' +
  'so its result belongs to no current session. Call again: app.auth uses the new provider.';

const RETIRED_PROVIDER_ERROR =
  '[Gears FrontX] auth({ provider }) got a provider that another provider replaced in this realm, ' +
  'so it was destroyed. Pass a new provider object, or auth() to join the provider in use.';

const NESTED_REPLACEMENT_ERROR =
  '[Gears FrontX] auth({ provider }) was built while another provider replacement was still running, ' +
  'from one of its callbacks, so it was refused. Build the app once that replacement has returned.';

/** The members of `AuthRuntime` that call the provider. */
const RUNTIME_CALLS = [
  'getSession',
  'checkAuth',
  'logout',
  'login',
  'handleCallback',
  'refresh',
  'getIdentity',
  'getPermissions',
  'canAccess',
  'canAccessMany',
  'evaluateAccess',
  'evaluateMany',
] as const;

const REPLACED_EVALUATION: AccessEvaluation = { decision: 'deny', reason: 'provider_error' };

/** What an access check that ends after its provider was replaced resolves to: they never reject. */
const REPLACED_ACCESS: Partial<Record<string, (input: unknown) => unknown>> = {
  canAccess: () => 'deny',
  canAccessMany: (queries) => (queries as unknown[]).map(() => 'deny'),
  evaluateAccess: () => REPLACED_EVALUATION,
  evaluateMany: (queries) => (queries as unknown[]).map(() => REPLACED_EVALUATION),
};

/**
 * Runs one step of a replacement or a teardown that must not stop the steps
 * after it (a provider's `unsubscribe` or `destroy()`, an app's listener); a
 * throw is logged.
 */
function guarded(step: string, run: () => unknown): void {
  try {
    const result = run();
    if (result && typeof result === 'object' && 'catch' in result) {
      void (result as Promise<unknown>).catch(() => undefined);
    }
  } catch (error) {
    console.error(`[Gears FrontX] ${step} threw`, error);
  }
}

/**
 * The runtime of the realm: one object every app provides as `app.auth`. Each
 * member reads the provider in use when it is read or called, so an app keeps
 * no reference to a provider and follows a replacement at once. A call that
 * ends after its provider was replaced rejects with `REPLACED_PROVIDER_ERROR`
 * (an access check resolves to deny), since its provider is destroyed and its
 * result belongs to no current session. A member the provider lacks reads as
 * `undefined`, as on a runtime built around that provider alone. A member may
 * be assigned, as a wrap installed after the build; the assigned value then
 * stays for every provider that follows.
 */
function createRealmRuntime(realm: Pick<AuthRealmRecord, 'current' | 'listeners'>): AuthRuntime {
  const runtime = {} as AuthRuntime;
  const assigned = new Map<PropertyKey, unknown>();
  const define = (key: PropertyKey, read: () => unknown) => {
    Object.defineProperty(runtime, key, {
      get: () => (assigned.has(key) ? assigned.get(key) : read()),
      set: (value: unknown) => {
        assigned.set(key, value);
      },
      enumerable: true,
      configurable: true,
    });
  };
  define('provider', () => realm.current.provider);
  define('capabilities', () => realm.current.runtime.capabilities);
  for (const key of RUNTIME_CALLS) {
    const call = (...args: unknown[]): Promise<unknown> => {
      const generation = realm.current;
      const member = generation.runtime[key] as ((...callArgs: unknown[]) => unknown) | undefined;
      if (!member) {
        // Reached only through a wrap assigned for an earlier provider that had this member.
        return Promise.reject(new Error(`[Gears FrontX] The session provider in use has no ${key}().`));
      }
      // A replaced provider's outcome, a value or an error, is never passed on.
      const replaced = () => {
        const access = REPLACED_ACCESS[key];
        if (access) return access(args[0]);
        throw new Error(REPLACED_PROVIDER_ERROR);
      };
      return Promise.resolve(member(...args)).then(
        (value) => (realm.current === generation ? value : replaced()),
        (error: unknown) => {
          if (realm.current === generation) throw error;
          return replaced();
        },
      );
    };
    define(key, () => (realm.current.runtime[key] ? call : undefined));
  }
  const subscribe = (listener: AuthStateListener): AuthUnsubscribe => {
    const entry = { listener, unsubscribe: realm.current.provider.subscribe?.(listener) ?? null };
    realm.listeners.add(entry);
    return () => {
      entry.unsubscribe?.();
      entry.unsubscribe = null;
      realm.listeners.delete(entry);
    };
  };
  define('subscribe', () => (realm.current.provider.subscribe ? subscribe : undefined));
  return runtime;
}

/** A copy of the `frontxApi` config one level deep, so a later edit by the caller reaches no app. */
function copyTransportConfig(
  config: Hai3ApiAuthTransportConfig | undefined,
): Hai3ApiAuthTransportConfig | undefined {
  if (!config) return undefined;
  return Object.fromEntries(
    Object.entries(config).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value]),
  ) as Hai3ApiAuthTransportConfig;
}

/** The hold of `app` on the realm, with this framework copy's eventBus and REST transport. */
function createHolder(app: FrontXApp): AuthRealmHolder {
  let binding: AuthTransportBinding | null = null;
  const unbind = () => {
    const done = binding;
    binding = null;
    guarded("An app's transport binding destroy()", () => done?.destroy());
  };
  return {
    emit: (event) => eventBus.emit(event, {}),
    unbind,
    bind(generation) {
      unbind();
      // The binding serves this provider alone: its provider, its config and
      // its tracker. The published config is spread whole and first, so a field
      // this copy of the framework does not know yet still reaches the binder,
      // while a stray key can never replace the provider or one of the hooks
      // written after it.
      const transport = generation.transport ?? frontxApiTransport();
      binding = transport({
        ...generation.transportConfig,
        provider: generation.provider,
        trackRefresh: generation.trackRefresh,
        addRestPlugin: (restPlugin) => app.apiRegistry.plugins.add(RestProtocol, restPlugin),
        removeRestPlugin: (pluginClass) => app.apiRegistry.plugins.remove(RestProtocol, pluginClass),
      });
    },
  };
}

/**
 * Takes the hold of `app` on `record`: `app.auth` becomes the realm's runtime
 * and the app's transport is bound for `generation`. A build that throws
 * returns no app anyone could destroy, so a binding that throws gives the
 * hold back before the error goes on.
 */
function holdAuthRealm(app: FrontXApp, record: AuthRealmRecord, generation: AuthGeneration): AuthRealmHolder {
  const holder = createHolder(app);
  record.holders.add(holder);
  app.auth = record.runtime;
  try {
    holder.bind(generation);
  } catch (error) {
    delete app.auth;
    releaseAuthRealm(record, holder);
    throw error;
  }
  return holder;
}

/** Gives one app's hold back; the last release ends the provider in use and frees the slot. */
function releaseAuthRealm(record: AuthRealmRecord, holder: AuthRealmHolder): void {
  holder.unbind();
  if (!record.holders.delete(holder) || record.holders.size > 0) return;
  const host = globalThis as AuthRealmHost;
  if (host[AUTH_REALM_SYMBOL] === record) delete host[AUTH_REALM_SYMBOL];
  record.current.retire(true);
}

/** Whether this is a development build, as bundlers set `process.env.NODE_ENV`. */
function isDevelopment(): boolean {
  try {
    return process.env.NODE_ENV === 'development';
  } catch {
    return false;
  }
}

/** Names a provider and its origin lists for a warning; the session itself is never read. */
function describeGeneration(generation: AuthGeneration): string {
  const name = generation.provider.constructor?.name;
  const config = generation.transportConfig;
  return `${name && name !== 'Object' ? name : 'a provider object'} ` +
    `(bearer origins ${JSON.stringify(config?.allowedBearerOrigins ?? [])}, ` +
    `cookie origins ${JSON.stringify(config?.allowedCookieOrigins ?? [])}` +
    `${generation.transport ? ', a custom transport binder' : ''})`;
}

/**
 * Puts `next` in place of the provider in use; `bound` is the app that passed
 * it, already bound to it. The old provider and everything that authorised its
 * credentials retire at once: its tracking stops, which cancels its running
 * session checks, it is destroyed, and every other holder's transport is bound
 * again for `next` alone, so an old binding attaches nothing and retries
 * nothing. Every bus hears `SessionCheck` at once and `LoggedIn` or
 * `LoggedOut` once the new provider's baseline lands.
 */
function replaceAuthProvider(record: AuthRealmRecord, next: AuthGeneration, bound: AuthRealmHolder): void {
  // The steps that call the new provider and may throw run first: a throw
  // leaves the provider in use, its listeners and its tracking as they were.
  // What the new provider tells a moved listener before the commit waits for
  // it, so a rollback leaves nothing an app has heard.
  let committed = false;
  const held: Array<() => void> = [];
  const moved: Array<[AuthRealmListener, AuthUnsubscribe | null]> = [];
  try {
    for (const entry of record.listeners) {
      const { listener } = entry;
      const relay: AuthStateListener = (event) => {
        if (committed) listener(event);
        else held.push(() => listener(event));
      };
      moved.push([entry, next.provider.subscribe?.(relay) ?? null]);
    }
    next.start(record.holders, true);
  } catch (error) {
    for (const [, unsubscribe] of moved) guarded("The new session provider's unsubscribe", () => unsubscribe?.());
    next.retire(false);
    throw error;
  }
  const previous = record.current;
  record.current = next;
  record.retired.add(previous.provider);
  for (const [entry, unsubscribe] of moved) {
    const earlier = entry.unsubscribe;
    guarded("The replaced session provider's unsubscribe", () => earlier?.());
    entry.unsubscribe = unsubscribe;
  }
  previous.retire(true);
  // A diagnostic: it reads the provider objects, so a throw there must not stop the committed swap.
  guarded('The replacement warning', () => {
    if (!isDevelopment()) return;
    console.warn(
      `[Gears FrontX] auth({ provider }) replaced the session provider in use, ${describeGeneration(previous)}, ` +
        `with ${describeGeneration(next)}. Every app of the page now sends the new provider's credentials ` +
        "under the new provider's transport settings. An app that means to use the provider in use passes auth().",
    );
  });
  for (const holder of record.holders) holder.emit(AuthEvents.SessionCheck);
  for (const holder of record.holders) {
    if (holder === bound || record.current !== next) continue;
    try {
      holder.bind(next);
    } catch (error) {
      // Another app's binder failed: that app goes on without a transport, and this build goes on.
      console.error('[Gears FrontX] An app of the realm could not bind its transport to the new session provider', error);
    }
  }
  committed = true;
  // What a provider that a nested swap retired meanwhile held back is never delivered.
  if (record.current !== next) return;
  // The swap is committed: a listener that throws must not undo the replacing app's hold.
  for (const deliver of held) guarded('An app.auth.subscribe listener', deliver);
}

/** Builds the generation of one provider: its runtime and its session tracking. */
function createGeneration(config: AuthPluginConfig): AuthGeneration {
  const caps = buildCapabilities(config.provider);
  let holders: ReadonlySet<AuthRealmHolder> = new Set();
  const session = createSessionTracker(config.provider, caps, (event) => {
    for (const holder of holders) holder.emit(event);
  });
  let unsubscribe: AuthUnsubscribe | null = null;
  const refresh = config.provider.refresh?.bind(config.provider);
  let retired = false;

  const runtime: AuthRuntime = {
    provider: config.provider,
    capabilities: caps,
    getSession: (ctx?: AuthContext) => config.provider.getSession(ctx),
    checkAuth: (ctx?: AuthContext) => config.provider.checkAuth(ctx),
    logout: async (ctx?: AuthContext) => {
      session.begin();
      try {
        return await config.provider.logout(ctx);
      } finally {
        session.end(false);
      }
    },
    login: config.provider.login
      ? async (input: AuthLoginInput, ctx?: AuthContext) => {
          session.begin();
          let target: boolean | null = null;
          try {
            const transition = await config.provider.login!(input, ctx);
            // A redirect starts the flow without a session yet; handleCallback emits when it completes.
            if (transition.type !== 'redirect') target = true;
            return transition;
          } finally {
            session.end(target);
          }
        }
      : undefined,
    handleCallback: config.provider.handleCallback
      ? async (input: AuthCallbackInput, ctx?: AuthContext) => {
          session.begin();
          let target: boolean | null = null;
          try {
            const transition = await config.provider.handleCallback!(input, ctx);
            target = true;
            return transition;
          } finally {
            session.end(target);
          }
        }
      : undefined,
    refresh: refresh
      ? async (ctx?: AuthContext) => {
          const current = session.ticket();
          let refreshed: AuthSession | null;
          try {
            refreshed = await refresh(ctx);
          } catch (error) {
            session.refreshFailed();
            throw error;
          }
          await session.observe(refreshed !== null, current, true);
          return refreshed;
        }
      : undefined,
    getIdentity: config.provider.getIdentity?.bind(config.provider),
    getPermissions: config.provider.getPermissions?.bind(config.provider),
    canAccess: <TRecord extends AccessRecord = AccessRecord>(
      query: AccessQuery<TRecord>,
      ctx?: AuthContext,
    ) => safeCanAccess(config.provider, caps, query as AccessQuery, ctx),
    canAccessMany: (queries, ctx) =>
      safeCanAccessMany(config.provider, caps, queries, ctx),
    evaluateAccess: <TRecord extends AccessRecord = AccessRecord>(
      query: AccessQuery<TRecord>,
      ctx?: AuthContext,
    ) => safeEvaluateAccess(config.provider, caps, query as AccessQuery, ctx),
    evaluateMany: (queries, ctx) =>
      safeEvaluateMany(config.provider, caps, queries, ctx),
    subscribe: config.provider.subscribe?.bind(config.provider),
  };

  return {
    provider: config.provider,
    runtime,
    transportConfig: copyTransportConfig(config.frontxApi),
    transport: config.transport,
    start(audience, announce) {
      holders = audience;
      // Before subscribing: a provider may report its current state synchronously inside subscribe,
      // and that report must wait for the baseline.
      void session.establish(announce);
      unsubscribe = config.provider.subscribe?.((event) => {
        if (event.state === 'authenticated' || event.state === 'unauthenticated') {
          void session.observe(event.state === 'authenticated');
        }
      }) ?? null;
    },
    trackRefresh() {
      const current = session.ticket();
      return async (outcome) => {
        if ('rejected' in outcome) session.refreshFailed();
        else await session.observe(outcome.session !== null, current, true);
      };
    },
    retire(destroy) {
      if (retired) return;
      retired = true;
      const cancel = unsubscribe;
      unsubscribe = null;
      guarded("The session provider's unsubscribe", () => cancel?.());
      session.stop();
      if (destroy) guarded("The session provider's destroy()", () => config.provider.destroy?.());
    },
  };
}

type AuthPlugin = FrontXPlugin & { [DUPLICATE_PLUGIN_CLEANUP_SYMBOL]?: () => void };

/**
 * Auth plugin: the session runtime of the realm.
 *
 * `auth({ provider, ... })` passes the realm's session provider: the first
 * one publishes the session runtime, with the provider's transport settings,
 * into a `Symbol.for` slot on `globalThis`; a later one replaces the provider
 * in use. `auth()` with no provider joins the runtime the realm already
 * holds. The plugin does not know or care whether the app is a shell or a
 * microfrontend; after the build every app holds the runtime the same way:
 *
 * - `app.auth` is the one runtime of the realm, so a login, a logout or an
 *   access check from any app goes to the provider in use;
 * - the app's own apiRegistry gets a REST transport that decorates its
 *   requests with the session, bound with the `frontxApi` config and custom
 *   binder of the provider in use;
 * - `AuthEvents` reach the app's own eventBus, whichever app passed the provider;
 * - the app holds the provider in use: it lives until the last app that holds
 *   it is destroyed, not until the app that passed it is.
 *
 * The provider in use passed again by another app is a join, not a
 * replacement. A provider passed while another is in use replaces it for
 * every app of the page, the shell included, with its own `frontxApi` and
 * binder: credentials and the policy that authorises them belong to one
 * provider. A development build logs a warning that names both providers and
 * their origin lists. Every app follows: its bus hears
 * `AuthEvents.SessionCheck` at once and `LoggedIn` (a session) or
 * `LoggedOut` (none, or the read failed) once the new provider's baseline
 * read lands. The old provider retires at once: its session tracking stops,
 * which cancels its running session checks, it is destroyed, and every app's
 * transport is bound again for the new provider, so an old binding attaches
 * no credentials and retries nothing, a request already running included. A
 * call on the old provider that ends after the swap rejects (an access check
 * resolves to deny).
 *
 * Refusals, all before any plugin's `onInit` runs, so a refused build starts
 * no transport, tracker or subscription and the runtime may build again:
 * - a join when no app has passed a provider;
 * - a provider that another provider replaced in this realm (it is destroyed);
 * - a new provider passed from a callback of a replacement still running;
 * - any build, a join included, from a callback of the first provider's publish;
 * - a realm record of another contract version.
 * A failure in `onInit` (a binder that throws, or a new provider that throws
 * on `subscribe`) leaves the realm state as it was (a hook a binder registered
 * before it threw is not undone), but the builder has already counted the app
 * as built, so that framework copy cannot build another app.
 * A second `auth(...)` in the same app is skipped by the builder like any
 * duplicate plugin, unless it carries a provider: that one throws from
 * `use()`, since skipping it would drop a provider without a word.
 *
 * **Scope:** REST transport only. SSE auth needs a custom transport binder via
 * the `transport` option.
 */
export function auth(config?: AuthPluginConfig): FrontXPlugin {
  if (config !== undefined && !config.provider) {
    throw new Error(
      '[Gears FrontX] auth() got a config without a provider. Pass auth({ provider, ... }) to put the ' +
        "realm's session provider in place, or auth() with no arguments to join it."
    );
  }
  return config ? providerAuth(config) : joinAuth();
}

/** A first publish still running: a running replacement holds its own app and at least one more. */
function isFirstPublish(record: AuthRealmRecord): boolean {
  return Boolean(record.replacing) && record.holders.size < 2;
}

function providerAuth(config: AuthPluginConfig): FrontXPlugin {
  const generation = createGeneration(config);
  let record: AuthRealmRecord | null = null;
  let holder: AuthRealmHolder | null = null;

  const plugin: AuthPlugin = {
    name: 'auth',
    // The builder skips a second plugin named `auth` in one app. A skipped
    // join loses nothing; a skipped provider would be dropped silently.
    [DUPLICATE_PLUGIN_CLEANUP_SYMBOL]() {
      throw new Error(
        '[Gears FrontX] auth({ provider }) was added to an app that already has an auth() plugin. ' +
          'One app takes one auth() plugin; to replace the session provider, build an app with auth({ provider }).'
      );
    },
    onRegister() {
      const found = readAuthRealm();
      if (found?.retired.has(config.provider)) throw new Error(RETIRED_PROVIDER_ERROR);
      if (found?.replacing && (found.current.provider !== config.provider || isFirstPublish(found))) {
        throw new Error(NESTED_REPLACEMENT_ERROR);
      }
    },
    onInit(app) {
      const found = readAuthRealm();
      if (found && found.current.provider === config.provider) {
        // The provider in use passed again: nothing to replace, so this app joins it as it is.
        holder = holdAuthRealm(app, found, found.current);
        record = found;
        return;
      }
      if (found) {
        found.replacing = true;
        try {
          // This app binds first, so a binder that throws leaves the provider in use untouched.
          const held = holdAuthRealm(app, found, generation);
          try {
            replaceAuthProvider(found, generation, held);
          } catch (error) {
            delete app.auth;
            releaseAuthRealm(found, held);
            throw error;
          }
          holder = held;
          record = found;
        } finally {
          found.replacing = false;
        }
        return;
      }
      const published: AuthRealmRecord = {
        version: AUTH_REALM_CONTRACT_VERSION,
        runtime: undefined as unknown as AuthRuntime,
        current: generation,
        holders: new Set(),
        listeners: new Set(),
        retired: new WeakSet(),
        replacing: true,
      };
      published.runtime = createRealmRuntime(published);
      // In the slot before the binder and the provider's subscribe run, so a build they start is refused.
      (globalThis as AuthRealmHost)[AUTH_REALM_SYMBOL] = published;
      try {
        const held = holdAuthRealm(app, published, generation);
        try {
          generation.start(published.holders, false);
        } catch (error) {
          // The last release ends this provider and empties the slot.
          delete app.auth;
          releaseAuthRealm(published, held);
          throw error;
        }
        holder = held;
        record = published;
      } finally {
        published.replacing = false;
      }
    },
    onDestroy(app) {
      if (!record || !holder) return;
      delete app.auth;
      releaseAuthRealm(record, holder);
      record = null;
      holder = null;
    },
  };
  return plugin;
}

function joinAuth(): FrontXPlugin {
  let record: AuthRealmRecord | null = null;
  let holder: AuthRealmHolder | null = null;

  return {
    name: 'auth',
    onRegister() {
      const found = readAuthRealm();
      if (!found || isFirstPublish(found)) throw new Error(NO_PROVIDER_ERROR);
    },
    onInit(app) {
      // `build()` runs onRegister and onInit in one synchronous call, so the
      // record onRegister found is still the one in the slot.
      const joined = readAuthRealm();
      if (!joined) throw new Error(NO_PROVIDER_ERROR);
      // The runtime is known only in onInit, so it cannot come through `provides`.
      holder = holdAuthRealm(app, joined, joined.current);
      record = joined;
    },
    onDestroy(app) {
      if (!record || !holder) return;
      delete app.auth;
      releaseAuthRealm(record, holder);
      record = null;
      holder = null;
    },
  };
}

declare module '../types' {
  interface FrontXAppRuntimeExtensions {
    auth?: AuthRuntime;
  }
}
