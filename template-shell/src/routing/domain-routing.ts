import {
  deriveExtensionToken,
  parseGrammar,
  type BackProjectionDelta,
  type DomainKey,
  type EntryAddress,
  type ExtensionToken,
  type NavigationHistory,
  type RegisteredExtensionsSource,
  type RouteSignal,
  type Transition,
} from '@gears-frontx/routing';
import type { ActionsChain, Extension, MfeRegistry } from '@gears-frontx/mfes';

export interface DomainRouteStatus {
  readonly entries: number;
  readonly unresolved: number;
}

export interface DomainRoutingOptions {
  readonly history: NavigationHistory;
  readonly signal: RouteSignal;
  readonly registry: MfeRegistry;
  readonly domainId: string;
  readonly domainKey: DomainKey;
  readonly mountActionType: string;
  /** Absent for a domain that declares no unmount action (the screen domain). */
  readonly unmountActionType?: string;
  readonly cardinality: 'single' | 'multiple';
  /** For a nested domain: the enclosing occupant's own entry. Writes made while it is absent wait for it. */
  readonly enclosing?: EntryAddress;
}

/**
 * An extension's own declared route: its `route` field, or (for a screen
 * extension) `presentation.route` — the two conventions `mfes` allows
 * (`Extension.route` doc comment: "usable by an extension without
 * `presentation`").
 */
export function declaredRouteOf(extension: Extension): string | undefined {
  if (typeof extension.route === 'string') return extension.route;
  const presentation = (extension as { presentation?: { route?: unknown } }).presentation;
  return typeof presentation?.route === 'string' ? presentation.route : undefined;
}

export function extensionTokenOf(extension: Extension): ExtensionToken | undefined {
  return deriveExtensionToken(declaredRouteOf(extension));
}

export interface DispatchResult {
  /** False when the registry refused the chain synchronously (after #648, the only refusal a caller sees). */
  readonly accepted: boolean;
  /**
   * Settles when the promise `executeActionsChain` returned settles — today it resolves even when
   * the chain failed before reaching any handler (`DefaultMfeRegistry.executeActionsChain`). Absent
   * when the call returned nothing (#648).
   */
  readonly settled?: Promise<void>;
}

/** A thenable, without asserting one — `executeActionsChain`'s return value is `unknown` until checked. */
function isThenable(value: unknown): value is PromiseLike<void> {
  return typeof value === 'object' && value !== null && typeof (value as { then?: unknown }).then === 'function';
}

/** Today `executeActionsChain` returns a promise; after #648 it returns nothing and refuses synchronously. */
export function dispatchChain(registry: MfeRegistry, chain: ActionsChain, label: string): DispatchResult {
  try {
    const returned: unknown = registry.executeActionsChain(chain);
    if (!isThenable(returned)) return { accepted: true };
    const settled = Promise.resolve(returned).catch((error: unknown) => console.error(`[routing] ${label} failed`, error));
    return { accepted: true, settled };
  } catch (error) {
    console.error(`[routing] ${label} refused`, error);
    return { accepted: false };
  }
}

/**
 * One domain's side of the route ownership signal, held by the host-owned
 * implementation of that domain: back-projection after every mount/unmount
 * the domain's own handlers perform (O5, O7), mount/unmount re-dispatched
 * through the actions chain for every transition the observer reports (O6),
 * and the entry address of each occupant. One instance per domain key (O4).
 */
export class DomainRouting {
  private release: (() => void) | undefined;
  private status: DomainRouteStatus = { entries: 0, unresolved: 0 };
  private readonly statusListeners = new Set<{ readonly callback: () => void }>();
  private opening: ExtensionToken[] | undefined;
  private pendingOpen: ExtensionToken[] | undefined;
  private releasePending: (() => void) | undefined;
  /** The routeOwner this instance itself last dispatched a mount for, per token — kept so a later `resolutionChanged` for the same token (an owner swap under a URL entry that never left the URL) can tell who the *prior* owner was; the transition report itself carries only the new one. */
  private readonly lastOwnerByToken = new Map<ExtensionToken, string>();
  /**
   * Set by `stop()`, cleared by `start()`. Guards `afterMount`/`afterUnmount`
   * against a call that arrives after this instance was told to stop — an
   * in-flight mount (T7's `mountThroughChain`) that settles only after its
   * Widgets Host itself unmounted, say. Without this, such a call would still
   * write to history and, if it fell inside the opening window, open a fresh
   * pending-write subscription that `stop()` already ran and will not run
   * again to release.
   */
  private stopped = false;

  constructor(private readonly options: DomainRoutingOptions) {}

  entryAddressFor(extensionId: string): EntryAddress | undefined {
    const extension = this.tokenOf(extensionId);
    return extension === undefined ? undefined : { domainKey: this.options.domainKey, extension };
  }

  /**
   * Call from the domain's mount handler after its strategy's mount settled
   * and before the handler itself settles: the actions chain selects `next`
   * only on that settlement, so a chained step that depends on this entry
   * (the widget's ping) cannot run before it is in the URL.
   *
   * Idempotent for a repeat mount of the same extension: a 'multiple'-
   * cardinality domain that already carries this token in the URL makes no
   * second write here (the `!own.includes(token)` guard below) — this is
   * what lets a caller merge a redundant mount request (URL restore, an
   * auto-mount pass and a chain asking for the same subject at once) into
   * one in-flight mount and still call this once each settles.
   *
   * Never called for an extension whose `afterUnmount` this instance has
   * already dispatched-through for the same id without an intervening mount:
   * `mfes` itself serializes mount/unmount per subject (a caller's own
   * mount strategy is not idempotent, hence that caller's own in-flight
   * tracking), so this class relies on that ordering rather than defending
   * against it itself.
   */
  afterMount(extensionId: string): void {
    if (this.stopped) return;
    const token = this.tokenOf(extensionId);
    if (token === undefined) return;
    if (this.opening) {
      if (!this.opening.includes(token)) this.opening.push(token);
      return;
    }
    if (this.options.enclosing && !this.enclosingPresent(this.options.enclosing)) {
      this.deferAsOpening([token]);
      return;
    }
    const own = this.ownEntries();
    if (this.options.cardinality === 'multiple') {
      if (!own.includes(token)) this.write({ added: [{ extension: token, params: [] }] }, 'push');
      return;
    }
    const others = own.filter((t) => t !== token);
    if (others.length === own.length) {
      if (others.length === 0) {
        this.write({ added: [{ extension: token, params: [] }] }, 'push');
      } else {
        const [first, ...rest] = others;
        this.write({ replaced: [{ oldExtension: first, entry: { extension: token, params: [] } }], removed: rest }, 'push');
      }
      return;
    }
    // The token is already among `own` — a stray duplicate entry for this
    // single-occupant domain (never produced by this class's own writes;
    // only a malformed or hand-built URL). Self-heal by dropping the rest.
    if (others.length > 0) this.write({ removed: others }, 'replace');
  }

  /** From the domain's own unmount handler only — never for an unmount the enclosing occupant's removal caused (O7). */
  afterUnmount(extensionId: string): void {
    if (this.stopped) return;
    const token = this.tokenOf(extensionId);
    if (token === undefined) return;
    // An unmount arriving for a token this instance is still collecting (or
    // waiting on the enclosing entry to write) must drop that token from the
    // collection — otherwise a widget unmounted mid-window still gets written
    // once the window closes, since neither array is ever consulted against
    // the URL for a token it has not written yet.
    this.opening = this.opening?.filter((t) => t !== token);
    if (this.pendingOpen) {
      const next = this.pendingOpen.filter((t) => t !== token);
      this.pendingOpen = next.length > 0 ? next : undefined;
      if (this.pendingOpen === undefined) {
        this.releasePending?.();
        this.releasePending = undefined;
      }
    }
    if (!this.ownEntries().includes(token)) return;
    this.write({ removed: [token] }, 'replace');
  }

  /**
   * Runs `fn` with this domain's writes collected instead of made one by
   * one, and flushes what was collected once `fn` settles — whether it
   * resolved or threw, since a step that never finishes (T7's
   * `mountThroughChain`, bounded by its own timeout) must not leave this
   * domain silently stuck "opening" forever. Replaces a `beginOpening`/
   * `endOpening` pair a caller could otherwise unbalance by throwing between
   * them.
   */
  async withOpening<T>(fn: () => T | Promise<T>): Promise<T> {
    this.opening = [];
    try {
      return await fn();
    } finally {
      const collected = this.opening ?? [];
      this.opening = undefined;
      if (!this.stopped && collected.length > 0) this.deferAsOpening(collected);
    }
  }

  /** Once discovery has settled and the domain's root is attached. Idempotent. */
  start(): void {
    this.stopped = false;
    if (this.release) return;
    this.release = this.options.signal.createObserver<string>(this.options.domainKey, this.source(), (t) => this.onTransition(t));
  }

  stop(): void {
    this.stopped = true;
    this.release?.();
    this.release = undefined;
    this.opening = undefined;
    this.pendingOpen = undefined;
    this.releasePending?.();
    this.releasePending = undefined;
    this.status = { entries: 0, unresolved: 0 };
    this.notifyStatusListeners();
  }

  getStatus(): DomainRouteStatus {
    return this.status;
  }

  subscribeStatus(listener: () => void): () => void {
    // A token object, not `listener` itself, is what `statusListeners` keys
    // off — mirrors the routing substrate's own `FanOutDispatcher` reasoning
    // (`packages/routing/src/history/fanout-dispatch.ts`): two subscriptions
    // of the identical callback reference must stay two independent,
    // independently releasable registrations, not one `Set` entry that
    // either side's release deletes out from under the other.
    const token = { callback: listener };
    this.statusListeners.add(token);
    return () => this.statusListeners.delete(token);
  }

  private notifyStatusListeners(): void {
    for (const token of [...this.statusListeners]) {
      try {
        token.callback();
      } catch (error) {
        console.error('[routing] a status listener threw', error);
      }
    }
  }

  private deferAsOpening(tokens: readonly ExtensionToken[]): void {
    this.pendingOpen = [...(this.pendingOpen ?? []), ...tokens.filter((t) => !(this.pendingOpen ?? []).includes(t))];
    this.flushOpening();
    if (this.pendingOpen && !this.releasePending) {
      // Runs inside the fan-out of the navigation that brings the enclosing entry.
      this.releasePending = this.options.history.subscribe(() => this.flushOpening());
    }
  }

  private flushOpening(): void {
    const enclosing = this.options.enclosing;
    if (!this.pendingOpen || (enclosing && !this.enclosingPresent(enclosing))) return;
    const own = this.ownEntries();
    const missing = this.pendingOpen.filter((t) => !own.includes(t));
    this.pendingOpen = undefined;
    this.releasePending?.();
    this.releasePending = undefined;
    if (missing.length > 0) this.write({ added: missing.map((extension) => ({ extension, params: [] })) }, 'replace');
  }

  private enclosingPresent(enclosing: EntryAddress): boolean {
    return this.entries().some((e) => e.domainKey === enclosing.domainKey && e.extension === enclosing.extension);
  }

  private tokenOf(extensionId: string): ExtensionToken | undefined {
    const extension = this.options.registry.getExtension(extensionId);
    return extension ? extensionTokenOf(extension) : undefined;
  }

  private entries() {
    const { path, search, hash } = this.options.history.location;
    return parseGrammar({ shellSubroute: path, search, hash }).entries;
  }

  private ownEntries(): ExtensionToken[] {
    return this.entries()
      .filter((e) => e.domainKey === this.options.domainKey)
      .map((e) => e.extension);
  }

  private write(delta: BackProjectionDelta, verb: 'push' | 'replace'): void {
    try {
      this.options.signal.backProjectEntries(this.options.domainKey, delta, verb);
    } catch (error) {
      console.error(`[routing] back-projection for ${this.options.domainKey} failed`, error);
    }
  }

  /**
   * This domain's own registrations, resolved fresh on every call.
   * Deliberately has no `onChange`: nothing in `@gears-frontx/routing`
   * notifies a caller when `mfes` registers or unregisters an extension, so
   * a registration change becomes visible only on the next
   * navigation-triggered round (`observe-change.ts`'s own fan-out
   * subscription) — not the instant it happens. A `resolutionChanged` swap
   * under a stable URL entry (`onTransition` below) is therefore only
   * detected once some navigation, even a same-path `history` notification,
   * causes a fresh round.
   */
  private source(): RegisteredExtensionsSource<string> {
    return {
      getRegistrations: () =>
        this.options.registry.getExtensionsForDomain(this.options.domainId).flatMap((extension) => {
          const token = extensionTokenOf(extension);
          return token === undefined ? [] : [{ extension: token, routeOwner: extension.id }];
        }),
    };
  }

  private ownerOf(token: ExtensionToken): string | undefined {
    return this.options.registry.getExtensionsForDomain(this.options.domainId).find((e) => extensionTokenOf(e) === token)?.id;
  }

  private onTransition(transition: Transition<string>): void {
    const mounted = new Set(this.options.registry.getMountedExtensions(this.options.domainId));
    const unmountType = this.options.unmountActionType;
    let mounting = false;
    for (const token of [...transition.diff.added, ...transition.diff.resolutionChanged]) {
      const entry = transition.entries.find((e) => e.extension === token);
      if (!entry || !entry.resolution.resolved) continue;
      mounting = true;
      const owner = entry.resolution.routeOwner;
      const priorOwner = this.lastOwnerByToken.get(token);
      this.lastOwnerByToken.set(token, owner);
      // A `resolutionChanged` swap: the token's URL entry never left, so it
      // never appears in `diff.removed` and the loop below never sees it —
      // the prior owner, if still mounted, must be told to unmount here.
      if (priorOwner !== undefined && priorOwner !== owner && unmountType !== undefined && mounted.has(priorOwner)) {
        dispatchChain(
          this.options.registry,
          { action: { type: unmountType, target: this.options.domainId, payload: { subject: priorOwner } } },
          `unmount ${priorOwner}`,
        );
      }
      if (mounted.has(owner)) continue; // an echo of this domain's own back-projection
      dispatchChain(this.options.registry, { action: { type: this.options.mountActionType, target: this.options.domainId, payload: { subject: owner } } }, `mount ${owner}`);
    }
    // With the enclosing entry gone, this is the enclosing occupant being removed (Back/Forward):
    // DefaultExtensionMounter.detach() unmounts this domain's occupants; a second unmount would race it.
    const enclosing = this.options.enclosing;
    const enclosingGone = enclosing !== undefined && !this.enclosingPresent(enclosing);
    const suppressRemovals = enclosingGone || (this.options.cardinality === 'single' && mounting);
    for (const token of transition.diff.removed) {
      this.lastOwnerByToken.delete(token);
      if (unmountType === undefined || suppressRemovals) continue;
      const owner = this.ownerOf(token);
      if (owner && mounted.has(owner)) {
        dispatchChain(this.options.registry, { action: { type: unmountType, target: this.options.domainId, payload: { subject: owner } } }, `unmount ${owner}`);
      }
    }
    this.status = {
      entries: transition.entries.length,
      unresolved: transition.entries.filter((e) => !e.resolution.resolved).length,
    };
    this.notifyStatusListeners();
  }
}
