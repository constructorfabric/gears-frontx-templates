import {
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
import { getExtensionRouteToken, type ActionsChain, type Extension, type MfeRegistry } from '@gears-frontx/mfes';

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
function extensionTokenOf(extension: Extension): ExtensionToken | undefined {
  return getExtensionRouteToken(extension) as ExtensionToken | undefined;
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
  /** How many `withOpening` calls are currently in flight — the one whose own exit brings this back to zero is the one that flushes (N2, M1); it need not be the first one entered, since two windows can overlap without nesting. */
  private openingDepth = 0;
  /**
   * Bumped by `stop()`. A `withOpening` call captures the epoch it entered
   * under; if `stop()` runs while it is still pending, its own `finally`
   * sees a stale epoch and skips both the depth decrement and the flush —
   * `stop()` has already reset `openingDepth`/`opening` itself, so a late
   * decrement would corrupt the count for whatever window opens next, and a
   * late flush would write from a collection that is no longer this call's
   * to flush (M1).
   */
  private openingEpoch = 0;
  private pendingOpen: ExtensionToken[] | undefined;
  private releasePending: (() => void) | undefined;
  /**
   * The last resolved owner seen for each token — updated for every
   * resolved `added` or `resolutionChanged` entry, not only the ones this
   * instance itself dispatched a mount for. Kept so a later
   * `resolutionChanged` for the same token (an owner swap under a URL
   * entry that never left the URL) can tell who the *prior* owner was; the
   * transition report itself carries only the new one. Cleared in
   * `stop()` — otherwise a token rediscovered as `added` after a
   * stop/start cycle would be compared against a stale owner from before
   * the domain stopped rather than against nothing (N3).
   */
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
  /**
   * A mount requested by this observer may finish after the URL has changed
   * (or after this domain restarted). Its later `afterMount` is an
   * acknowledgement, not a new user navigation, and must never project the
   * old token back into history.
   */
  private lifecycleEpoch = 0;
  /**
   * Per-subject observer requests in dispatch order. A stop/start can have an
   * old mount still pending while a new observer requests the same subject.
   * `mfes` serializes a subject's lifecycle, so its callbacks arrive in this
   * order too; retaining both records lets the old callback acknowledge only
   * its own epoch instead of consuming the new observer's marker.
   */
  private readonly observerMounts = new Map<string, Array<{ readonly epoch: number }>>();

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
    const observerMount = this.takeObserverMount(extensionId);
    if (observerMount) {
      if (this.stopped || observerMount.epoch !== this.lifecycleEpoch) return;
      const token = this.tokenOf(extensionId);
      if (token === undefined) return;
      // The transition observer dispatched this mount from the URL. If that
      // entry disappeared before the handler completed, release a stale
      // multiple-domain occupant instead of restoring the old URL. For a
      // still-present entry there is likewise nothing to back-project.
      if (
        !this.ownEntries().includes(token) &&
        this.options.unmountActionType !== undefined &&
        (!this.options.enclosing || this.enclosingPresent(this.options.enclosing))
      ) {
        dispatchChain(
          this.options.registry,
          { action: { type: this.options.unmountActionType, target: this.options.domainId, payload: { subject: extensionId } } },
          `unmount stale ${extensionId}`,
        );
      }
      return;
    }
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
   *
   * Nest-safe (N2) and overlap-safe (M1): a call made while another is
   * already in progress — nested inside its `fn`, or merely overlapping it
   * in time without nesting — shares the same `this.opening` collection
   * rather than starting a fresh one. Only the call whose own settlement
   * brings the depth back to zero flushes it: an early-settling call, nested
   * or not, must not flush (and thereby lose) tokens a still-running call
   * has not finished collecting; that is the last one out, not the first one
   * in, so the flush is decided at exit against the post-decrement depth
   * rather than at entry.
   */
  async withOpening<T>(fn: () => T | Promise<T>): Promise<T> {
    const epoch = this.openingEpoch;
    if (this.openingDepth === 0) this.opening = [];
    this.openingDepth += 1;
    try {
      return await fn();
    } finally {
      if (epoch === this.openingEpoch) {
        this.openingDepth -= 1;
        if (this.openingDepth === 0) {
          const collected = this.opening ?? [];
          this.opening = undefined;
          if (!this.stopped && collected.length > 0) this.deferAsOpening(collected);
        }
      }
    }
  }

  /** Once discovery has settled and the domain's root is attached. Idempotent. */
  start(): void {
    if (this.release) return;
    this.stopped = false;
    this.lifecycleEpoch += 1;
    this.release = this.options.signal.createObserver<string>(this.options.domainKey, this.source(), (t) => this.onTransition(t));
  }

  stop(): void {
    this.stopped = true;
    this.release?.();
    this.release = undefined;
    // Bumping the epoch is what makes a `withOpening` call already in flight
    // recognize, in its own `finally`, that the window it entered no longer
    // exists (M1) — depth and the collection are reset right here rather than
    // left for that call to unwind on its own schedule.
    this.openingEpoch += 1;
    this.openingDepth = 0;
    this.opening = undefined;
    this.pendingOpen = undefined;
    this.releasePending?.();
    this.releasePending = undefined;
    // A token rediscovered after a restart arrives as fresh `added`, not
    // `resolutionChanged` — clearing here is what keeps it compared against
    // nothing rather than the owner this instance saw before it stopped (N3).
    // Defence-in-depth with the `resolutionChanged`-only gate below in
    // `onTransition`: that gate alone would still be safe against a stale
    // map entry surviving a restart (an `added` token is never matched by
    // it), and this clear alone would still be safe against a genuine same-
    // URL owner swap (that arrives as `resolutionChanged`, never `added`).
    // The two halves only have a jointly observable scenario — a token
    // rediscovered as `added` after a stop/start cycle while some other
    // owner of it is still (independently) mounted — which is what
    // `__tests__/domain-routing.test.ts`'s "does not unmount a still-mounted
    // extension when the same token is rediscovered as added ... (N3)" test
    // exercises; neither half has a scenario that isolates it from the other
    // without reaching into private state, so this comment stands in for a
    // test that would only duplicate that one.
    this.lastOwnerByToken.clear();
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
    const resolutionChanged = new Set(transition.diff.resolutionChanged);
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
      // Restricted to an actual `resolutionChanged` (never `added` — a token
      // rediscovered fresh, e.g. after a stop/start cycle, is not a swap,
      // N3) and to a 'multiple'-cardinality domain: all four shell domains
      // (screen, sidebar, popup, overlay) are 'single'-cardinality, and a
      // 'single'-cardinality domain is mounted through either
      // `ExclusiveMountStrategy.mount` or `OptionalMountStrategy.mount` —
      // both already evict the prior occupant before mounting the new one,
      // so `afterMount`'s `replaced` write only updates the URL, it does
      // not itself unmount anything — dispatching an unmount here too
      // would double-unmount it (N1, contradicts the `single && mounting`
      // suppression below).
      if (
        this.options.cardinality === 'multiple' &&
        resolutionChanged.has(token) &&
        priorOwner !== undefined &&
        priorOwner !== owner &&
        unmountType !== undefined &&
        mounted.has(priorOwner)
      ) {
        dispatchChain(
          this.options.registry,
          { action: { type: unmountType, target: this.options.domainId, payload: { subject: priorOwner } } },
          `unmount ${priorOwner}`,
        );
      }
      if (mounted.has(owner) || this.hasObserverMountInEpoch(owner)) continue; // an echo or an in-flight observer mount
      const observerMount = { epoch: this.lifecycleEpoch };
      this.addObserverMount(owner, observerMount);
      const result = dispatchChain(
        this.options.registry,
        { action: { type: this.options.mountActionType, target: this.options.domainId, payload: { subject: owner } } },
        `mount ${owner}`,
      );
      if (!result.accepted) {
        this.removeObserverMount(owner, observerMount);
      } else if (result.settled) {
        void result.settled.finally(() => {
          this.removeObserverMount(owner, observerMount);
        });
      }
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

  private addObserverMount(extensionId: string, observerMount: { readonly epoch: number }): void {
    this.observerMounts.set(extensionId, [...(this.observerMounts.get(extensionId) ?? []), observerMount]);
  }

  private takeObserverMount(extensionId: string): { readonly epoch: number } | undefined {
    const mounts = this.observerMounts.get(extensionId);
    if (!mounts || mounts.length === 0) return undefined;
    const [observerMount, ...remaining] = mounts;
    if (remaining.length === 0) this.observerMounts.delete(extensionId);
    else this.observerMounts.set(extensionId, remaining);
    return observerMount;
  }

  private hasObserverMountInEpoch(extensionId: string): boolean {
    return this.observerMounts.get(extensionId)?.some((observerMount) => observerMount.epoch === this.lifecycleEpoch) ?? false;
  }

  private removeObserverMount(extensionId: string, observerMount: { readonly epoch: number }): void {
    const mounts = this.observerMounts.get(extensionId);
    if (!mounts) return;
    const remaining = mounts.filter((candidate) => candidate !== observerMount);
    if (remaining.length === 0) this.observerMounts.delete(extensionId);
    else this.observerMounts.set(extensionId, remaining);
  }
}
