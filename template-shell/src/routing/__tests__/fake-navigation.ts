import type { HistoryNotification, HistorySubscriber, Location, NavigationHistory } from '@gears-frontx/routing';

/**
 * A minimal `NavigationHistory` test double for `DomainRouting` — no
 * dependency on the real substrate's window/browser adapter. Mirrors the
 * substrate's own `FanOutDispatcher`
 * (`packages/routing/src/history/fanout-dispatch.ts`) on the three
 * properties `DomainRouting`'s opening-window logic (`../domain-routing.ts`)
 * relies on:
 *
 * - each round's `HistoryNotification` (including its `location`) is
 *   captured once, at the moment `push`/`replace`/`set` is called — not
 *   recomputed lazily when a queued round is later drained, which would let
 *   an intervening navigation's `path` leak into an earlier, still-pending
 *   round's notification;
 * - a subscriber released mid-round (from inside another subscriber's own
 *   callback) is skipped rather than invoked, exactly as the real
 *   dispatcher's own liveness check does;
 * - a subscriber that re-enters (navigates from inside its own callback) is
 *   queued as a later, separate round rather than interleaved with the one
 *   in progress — capped at the same round count the substrate itself
 *   bounds a runaway feedback loop to (`REENTRANT_ROUND_LIMIT`, not
 *   re-exported by the package's public surface, so mirrored here as a
 *   literal).
 */
export interface FakeNavigation extends NavigationHistory {
  readonly writes: Array<{ kind: 'push' | 'replace'; path: string }>;
  /** An external navigation (back/forward, a deep link) — never a write this test double itself attributes to `push`/`replace`. */
  set(path: string): void;
  /** Live subscriber count — proves a `stop()`/release actually let go, rather than merely no longer firing by coincidence. */
  subscriberCount(): number;
}

// Mirrors `packages/routing/src/diagnostics.ts`'s `REENTRANT_ROUND_LIMIT`
// (100), which that module does not re-export from the package's public
// surface (`packages/routing/src/index.ts`).
const ROUND_LIMIT = 100;

export function fakeNavigation(initial = '/'): FakeNavigation {
  let path = initial;
  let position = 0;
  const live = new Set<HistorySubscriber>();
  const writes: Array<{ kind: 'push' | 'replace'; path: string }> = [];

  const location = (): Location => {
    const url = new URL(path, 'http://shell.test');
    return { path: url.pathname, search: url.search.replace(/^\?/, ''), hash: url.hash.replace(/^#/, ''), position };
  };

  function runRound(notification: HistoryNotification): void {
    const snapshot = [...live];
    for (const subscriber of snapshot) {
      if (!live.has(subscriber)) continue; // released after the snapshot, before this turn
      subscriber(notification);
    }
  }

  const pending: HistoryNotification[] = [];
  let dispatching = false;
  function dispatch(notification: HistoryNotification): void {
    if (dispatching) {
      pending.push(notification);
      return;
    }
    dispatching = true;
    try {
      runRound(notification);
      let drained = 0;
      while (pending.length > 0) {
        if (drained >= ROUND_LIMIT) {
          pending.length = 0;
          throw new Error(`fakeNavigation: reentrant round limit (${ROUND_LIMIT}) exceeded`);
        }
        drained += 1;
        const next = pending.shift()!;
        runRound(next);
      }
    } finally {
      dispatching = false;
    }
  }

  return {
    get location() {
      return location();
    },
    writes,
    subscribe(subscriber) {
      live.add(subscriber);
      return () => live.delete(subscriber);
    },
    subscriberCount: () => live.size,
    push(p) {
      path = p;
      position += 1;
      writes.push({ kind: 'push', path: p });
      dispatch({ location: location(), kind: 'push' });
    },
    replace(p) {
      path = p;
      writes.push({ kind: 'replace', path: p });
      dispatch({ location: location(), kind: 'replace' });
    },
    go() {
      throw new Error('go is not used by DomainRouting');
    },
    set(p) {
      path = p;
      dispatch({ location: location(), kind: 'history' });
    },
  };
}
