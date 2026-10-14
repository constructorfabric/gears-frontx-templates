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
   * `app.auth.logout()` finished, whether the provider resolved or rejected:
   * the user meant to leave, so session-bound state is dropped either way.
   */
  LoggedOut: 'auth/loggedOut',
  /**
   * `app.auth.login()` resolved without a redirect, or
   * `app.auth.handleCallback()` resolved: a session began, possibly for
   * another account, so session-bound state is dropped. A login that resolves
   * to a redirect has no session yet and does not emit.
   *
   * Only those two calls emit. A session that starts any other way (a
   * provider `subscribe` state event, `refresh`, another tab logging in)
   * emits nothing and drops nothing: providers must route session starts
   * through `handleCallback`. An in-page account change the provider detects
   * on its own is not covered yet.
   */
  LoggedIn: 'auth/loggedIn',
} as const;

/** Payload for the logged-out event */
export interface AuthLoggedOutPayload {
  // Empty payload
}

/** Payload for the logged-in event */
export interface AuthLoggedInPayload {
  // Empty payload
}

declare module '@gears-frontx/state' {
  interface EventPayloadMap {
    'auth/loggedOut': AuthLoggedOutPayload;
    'auth/loggedIn': AuthLoggedInPayload;
  }
}

/** A throwing subscriber is logged and does not change what the auth call returns. */
function emitAuthEvent(type: (typeof AuthEvents)[keyof typeof AuthEvents]): void {
  try {
    eventBus.emit(type, {});
  } catch (error) {
    console.error(`[Gears FrontX] An ${type} subscriber threw`, error);
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

export type AuthTransportBinding = {
  destroy: () => void;
};

export type AuthTransportBinder = (args: {
  provider: AuthProvider;
  csrfHeaderName?: string;
  allowedCookieOrigins?: string[];
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

class AuthRestPlugin extends RestPlugin {
  /** Shared in-flight refresh promise — deduplicates concurrent 401 refresh calls. */
  private refreshPromise: Promise<AuthSession | null> | null = null;

  constructor(private readonly config: AuthPluginConfig) {
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
    if (!this.refreshPromise) {
      this.refreshPromise = this.config.provider
        .refresh()
        .finally(() => {
          this.refreshPromise = null;
        });
    }

    let refreshed: AuthSession | null;
    try {
      refreshed = await this.refreshPromise;
    } catch {
      return ctx.error;
    }
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
}

export function frontxApiTransport(): AuthTransportBinder {
  return (args) => {
    const restPlugin = new AuthRestPlugin({
      provider: args.provider,
      frontxApi: {
        allowedCookieOrigins: args.allowedCookieOrigins,
        csrfHeaderName: args.csrfHeaderName,
      },
    });
    args.addRestPlugin(restPlugin);
    return {
      destroy: () => {
        args.removeRestPlugin(AuthRestPlugin);
      },
    };
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
            try {
              return await config.provider.logout(ctx);
            } finally {
              emitAuthEvent(AuthEvents.LoggedOut);
            }
          },
          login: config.provider.login
            ? async (input: AuthLoginInput, ctx?: AuthContext) => {
                const transition = await config.provider.login!(input, ctx);
                // A redirect starts the flow without a session yet; handleCallback emits when it completes.
                if (transition.type !== 'redirect') {
                  emitAuthEvent(AuthEvents.LoggedIn);
                }
                return transition;
              }
            : undefined,
          handleCallback: config.provider.handleCallback
            ? async (input: AuthCallbackInput, ctx?: AuthContext) => {
                const transition = await config.provider.handleCallback!(input, ctx);
                emitAuthEvent(AuthEvents.LoggedIn);
                return transition;
              }
            : undefined,
          refresh: config.provider.refresh?.bind(config.provider),
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
      });
    },
    onDestroy(_app) {
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
