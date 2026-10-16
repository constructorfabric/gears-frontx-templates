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
import type { FrontXPlugin } from '../types';

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
   * `getIdentity`.
   */
  SessionCheck: 'auth/sessionCheck',
} as const;

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
  provider: AuthProvider;
  csrfHeaderName?: string;
  allowedCookieOrigins?: string[];
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

export type Hai3ApiAuthTransportConfig = {
  allowedCookieOrigins?: string[];
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

function isRelativeUrl(url: string): boolean {
  return url.startsWith('/') && !url.startsWith('//');
}

function getOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function getRuntimeOrigin(): string | null {
  const maybeLocation = (globalThis as { location?: { origin?: string } }).location;
  if (!maybeLocation?.origin || maybeLocation.origin === 'null') return null;
  return maybeLocation.origin;
}

function shouldIncludeCredentials(url: string, allowedOrigins: readonly string[] | undefined): boolean {
  if (isRelativeUrl(url)) return true;

  const origin = getOrigin(url);
  if (!origin) return false;

  const runtimeOrigin = getRuntimeOrigin();
  if (runtimeOrigin && origin === runtimeOrigin) return true;

  if (!allowedOrigins || allowedOrigins.length === 0) return false;
  return allowedOrigins.includes(origin);
}

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

  constructor(
    private readonly config: AuthPluginConfig,
    private readonly trackRefresh?: () => RefreshReport,
  ) {
    super();
  }

  async onRequest(ctx: RestRequestContext): Promise<RestRequestContext> {
    const session = await this.config.provider.getSession({ signal: ctx.signal });
    if (!session) return ctx;

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

  async onError(ctx: ApiPluginErrorContext): Promise<Error | RestResponseContext> {
    // Notify provider of every transport error (informational; called before retry decisions).
    const requestForHook = toAuthTransportRequest(ctx.request);
    if (requestForHook) {
      this.config.provider.onTransportError?.({
        request: requestForHook,
        error: ctx.error,
        status: ctx.response?.status,
      });
    }

    if (ctx.response?.status !== 401) return ctx.error;
    if (ctx.retryCount !== 0) return ctx.error;
    if (!this.config.provider.refresh) return ctx.error;

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
    if (!refreshed) return ctx.error;

    if (refreshed.kind === 'bearer') {
      if (!refreshed.token) return ctx.error;
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
          csrfHeaderName: args.csrfHeaderName,
        },
      },
      args.trackRefresh,
    );
    args.addRestPlugin(restPlugin);
    return {
      destroy: () => {
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
  /** Reads the session at init to set the baseline; emits nothing. */
  establish: () => Promise<void>;
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
function createSessionTracker(provider: AuthProvider, caps: AuthCapabilitiesResolved): SessionTracker {
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

  function emit(event: (typeof AuthEvents)[keyof typeof AuthEvents]): void {
    if (!stopped) eventBus.emit(event, {});
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

  async function establish(): Promise<void> {
    const current = ticket();
    const result = await check(() => provider.checkAuth());
    const sub = result?.authenticated === true ? await lookupSub() : null;
    // Any report, login or logout since init is newer than this baseline.
    if (stopped || applied > current) return;
    applied = current;
    // A failed check leaves the state unknown, so the first report clears.
    authenticated = result === null ? undefined : result?.authenticated === true;
    identity = sub === null ? { kind: 'unknown', cleared: false } : { kind: 'known', sub };
  }

  return {
    ticket,
    observe,
    refreshFailed,
    establish() {
      baseline = establish();
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

/**
 * Auth plugin.
 *
 * Wires a headless AuthProvider into @gears-frontx/api protocol plugins and exposes `app.auth`.
 *
 * **Scope:** REST transport only. SSE (Server-Sent Events) auth is out-of-scope for the
 * default `frontxApiTransport()` binding. SSE connections requiring auth should use a custom
 * transport binder via the `transport` option.
 */
export function auth(config: AuthPluginConfig): FrontXPlugin {
  const transport = config.transport ?? frontxApiTransport();
  let binding: AuthTransportBinding | null = null;
  const caps = buildCapabilities(config.provider);
  const session = createSessionTracker(config.provider, caps);
  let unsubscribe: AuthUnsubscribe | null = null;
  const refresh = config.provider.refresh?.bind(config.provider);

  return {
    name: 'auth',
    provides: {
      app: {
        auth: {
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
        } satisfies AuthRuntime,
      },
    },
    onInit(app) {
      binding = transport({
        provider: config.provider,
        allowedCookieOrigins: config.frontxApi?.allowedCookieOrigins,
        csrfHeaderName: config.frontxApi?.csrfHeaderName,
        addRestPlugin: (plugin) => app.apiRegistry.plugins.add(RestProtocol, plugin),
        removeRestPlugin: (pluginClass) => app.apiRegistry.plugins.remove(RestProtocol, pluginClass),
        trackRefresh: () => {
          const current = session.ticket();
          return async (outcome) => {
            if ('rejected' in outcome) session.refreshFailed();
            else await session.observe(outcome.session !== null, current, true);
          };
        },
      });
      // Before subscribing: a provider may report its current state synchronously inside subscribe,
      // and that report must wait for the baseline.
      void session.establish();
      unsubscribe = config.provider.subscribe?.((event) => {
        if (event.state === 'authenticated' || event.state === 'unauthenticated') {
          void session.observe(event.state === 'authenticated');
        }
      }) ?? null;
    },
    onDestroy(_app) {
      unsubscribe?.();
      unsubscribe = null;
      session.stop();
      binding?.destroy();
      binding = null;
      const providerDestroyResult = config.provider.destroy?.();
      if (providerDestroyResult && typeof providerDestroyResult === 'object' && 'catch' in providerDestroyResult) {
        void providerDestroyResult.catch(() => undefined);
      }
    },
  };
}

declare module '../types' {
  interface FrontXAppRuntimeExtensions {
    auth?: AuthRuntime;
  }
}
