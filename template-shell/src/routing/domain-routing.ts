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

/** Today `executeActionsChain` returns a promise; after #648 it returns nothing and refuses synchronously. */
export function dispatchChain(registry: MfeRegistry, chain: ActionsChain, what: string): DispatchResult {
  try {
    const returned: unknown = registry.executeActionsChain(chain);
    if (returned && typeof (returned as PromiseLike<void>).then === 'function') {
      const settled = (returned as Promise<void>).catch((error) => console.error(`[routing] ${what} failed`, error));
      return { accepted: true, settled };
    }
    return { accepted: true };
  } catch (error) {
    console.error(`[routing] ${what} refused`, error);
    return { accepted: false };
  }
}

/**
 * One domain's side of the route ownership signal, held by the host-owned
 * implementation of that domain: back-projection after every mount/unmount
 * the domain's own handlers perform, mount/unmount re-dispatched through the
 * actions chain for every transition the observer reports, and the entry
 * address of each occupant. One instance per domain key.
 */
export class DomainRouting {
  private release: (() => void) | undefined;
  private status: DomainRouteStatus = { entries: 0, unresolved: 0 };
  private readonly statusListeners = new Set<() => void>();
  private opening: ExtensionToken[] | undefined;
  private pendingOpen: ExtensionToken[] | undefined;
  private releasePending: (() => void) | undefined;

  constructor(private readonly o: DomainRoutingOptions) {}

  entryAddressFor(extensionId: string): EntryAddress | undefined {
    const extension = this.tokenOf(extensionId);
    return extension === undefined ? undefined : { domainKey: this.o.domainKey, extension };
  }

  /**
   * Call from the domain's mount handler after its strategy's mount settled
   * and before the handler itself settles: the actions chain selects `next`
   * only on that settlement, so a chained step that depends on this entry
   * (the widget's ping) cannot run before it is in the URL.
   */
  afterMount(extensionId: string): void {
    const token = this.tokenOf(extensionId);
    if (token === undefined) return;
    if (this.opening) {
      if (!this.opening.includes(token)) this.opening.push(token);
      return;
    }
    if (this.o.enclosing && !this.enclosingPresent()) {
      this.deferAsOpening([token]);
      return;
    }
    const own = this.ownEntries();
    if (this.o.cardinality === 'multiple') {
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
    if (others.length > 0) this.write({ removed: others }, 'replace');
  }

  /** From the domain's own unmount handler only — never for an unmount the enclosing occupant's removal caused. */
  afterUnmount(extensionId: string): void {
    const token = this.tokenOf(extensionId);
    if (token === undefined || !this.ownEntries().includes(token)) return;
    this.write({ removed: [token] }, 'replace');
  }

  /** The enclosing occupant is opening: collect this domain's writes instead of making them one by one. */
  beginOpening(): void {
    this.opening = [];
  }

  /** Make the collected writes as one replace — now, or once the enclosing entry is in the URL. */
  endOpening(): void {
    const collected = this.opening ?? [];
    this.opening = undefined;
    if (collected.length > 0) this.deferAsOpening(collected);
  }

  /** Once discovery has settled and the domain's root is attached. Idempotent. */
  start(): void {
    if (this.release) return;
    this.release = this.o.signal.createObserver<string>(this.o.domainKey, this.source(), (t) => this.onTransition(t));
  }

  stop(): void {
    this.release?.();
    this.release = undefined;
    this.opening = undefined;
    this.pendingOpen = undefined;
    this.releasePending?.();
    this.releasePending = undefined;
  }

  getStatus(): DomainRouteStatus {
    return this.status;
  }

  subscribeStatus(listener: () => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private deferAsOpening(tokens: readonly ExtensionToken[]): void {
    this.pendingOpen = [...(this.pendingOpen ?? []), ...tokens.filter((t) => !(this.pendingOpen ?? []).includes(t))];
    this.flushOpening();
    if (this.pendingOpen && !this.releasePending) {
      // Runs inside the fan-out of the navigation that brings the enclosing entry.
      this.releasePending = this.o.history.subscribe(() => this.flushOpening());
    }
  }

  private flushOpening(): void {
    if (!this.pendingOpen || (this.o.enclosing && !this.enclosingPresent())) return;
    const own = this.ownEntries();
    const missing = this.pendingOpen.filter((t) => !own.includes(t));
    this.pendingOpen = undefined;
    this.releasePending?.();
    this.releasePending = undefined;
    if (missing.length > 0) this.write({ added: missing.map((extension) => ({ extension, params: [] })) }, 'replace');
  }

  private enclosingPresent(): boolean {
    const enclosing = this.o.enclosing!;
    return this.entries().some((e) => e.domainKey === enclosing.domainKey && e.extension === enclosing.extension);
  }

  private tokenOf(extensionId: string): ExtensionToken | undefined {
    const extension = this.o.registry.getExtension(extensionId);
    return extension ? extensionTokenOf(extension) : undefined;
  }

  private entries() {
    const { path, search, hash } = this.o.history.location;
    return parseGrammar({ shellSubroute: path, search, hash }).entries;
  }

  private ownEntries(): ExtensionToken[] {
    return this.entries()
      .filter((e) => e.domainKey === this.o.domainKey)
      .map((e) => e.extension);
  }

  private write(delta: BackProjectionDelta, verb: 'push' | 'replace'): void {
    try {
      this.o.signal.backProjectEntries(this.o.domainKey, delta, verb);
    } catch (error) {
      console.error(`[routing] back-projection for ${this.o.domainKey} failed`, error);
    }
  }

  private source(): RegisteredExtensionsSource<string> {
    return {
      getRegistrations: () =>
        this.o.registry.getExtensionsForDomain(this.o.domainId).flatMap((extension) => {
          const token = extensionTokenOf(extension);
          return token === undefined ? [] : [{ extension: token, routeOwner: extension.id }];
        }),
    };
  }

  private ownerOf(token: ExtensionToken): string | undefined {
    return this.o.registry.getExtensionsForDomain(this.o.domainId).find((e) => extensionTokenOf(e) === token)?.id;
  }

  private onTransition(transition: Transition<string>): void {
    const mounted = new Set(this.o.registry.getMountedExtensions(this.o.domainId));
    let mounting = false;
    for (const token of [...transition.diff.added, ...transition.diff.resolutionChanged]) {
      const entry = transition.entries.find((e) => e.extension === token);
      if (!entry || !entry.resolution.resolved) continue;
      mounting = true;
      const owner = entry.resolution.routeOwner;
      if (mounted.has(owner)) continue; // an echo of this domain's own back-projection
      dispatchChain(this.o.registry, { action: { type: this.o.mountActionType, target: this.o.domainId, payload: { subject: owner } } }, `mount ${owner}`);
    }
    const unmountType = this.o.unmountActionType;
    // With the enclosing entry gone, this is the enclosing occupant being removed (Back/Forward):
    // DefaultExtensionMounter.detach() unmounts this domain's occupants; a second unmount would race it.
    const enclosingGone = this.o.enclosing !== undefined && !this.enclosingPresent();
    if (unmountType && !enclosingGone && !(this.o.cardinality === 'single' && mounting)) {
      for (const token of transition.diff.removed) {
        const owner = this.ownerOf(token);
        if (owner && mounted.has(owner)) {
          dispatchChain(this.o.registry, { action: { type: unmountType, target: this.o.domainId, payload: { subject: owner } } }, `unmount ${owner}`);
        }
      }
    }
    this.status = {
      entries: transition.entries.length,
      unresolved: transition.entries.filter((e) => !e.resolution.resolved).length,
    };
    for (const listener of [...this.statusListeners]) listener();
  }
}
