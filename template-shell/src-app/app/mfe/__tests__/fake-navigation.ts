import type { HistoryNotification, HistorySubscriber, Location, NavigationHistory } from '@gears-frontx/routing';

/**
 * A minimal `NavigationHistory` test double for `DomainRouting` — no
 * dependency on the real substrate's window/browser adapter. Mirrors the
 * substrate's own `FanOutDispatcher`
 * (`packages/routing/src/history/fanout-dispatch.ts`) on the three
 * properties the framework `DomainRouting` coordinator's opening-window logic
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
 *   literal);
 * - subscribers are keyed by a per-registration token, not by the callback
 *   reference itself (N6) — otherwise two `subscribe` calls with the
 *   identical callback would collapse into one `Set` entry, and releasing
 *   either one would silently unsubscribe both, unlike the real
 *   `FanOutDispatcher.subscribe`;
 * - a subscriber that throws is isolated to its own invocation and reported,
 *   never rethrown and never left to stop delivery to the rest of the
 *   round's snapshot (N6) — mirrors `FanOutDispatcher.runRound`
 *   (`packages/routing/src/history/fanout-dispatch.ts`), which catches per
 *   subscriber and calls `reportRoutingDefect` (`console.error`, prefixed,
 *   never rethrown) rather than letting the round unwind.
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

/** One `subscribe` registration, keyed by its own identity rather than the callback (N6, mirrors `FanOutDispatcher`'s `SubscriberToken`). */
interface SubscriberToken {
  readonly callback: HistorySubscriber;
}

export function fakeNavigation(initial = '/'): FakeNavigation {
  let path = initial;
  let position = 0;
  const live = new Set<SubscriberToken>();
  const writes: Array<{ kind: 'push' | 'replace'; path: string }> = [];

  const location = (): Location => {
    const url = new URL(path, 'http://shell.test');
    return { path: url.pathname, search: url.search.replace(/^\?/, ''), hash: url.hash.replace(/^#/, ''), position };
  };

  function runRound(notification: HistoryNotification): void {
    const snapshot = [...live];
    for (const token of snapshot) {
      if (!live.has(token)) continue; // released after the snapshot, before this turn
      try {
        token.callback(notification);
      } catch (error) {
        // Isolate and report, never rethrow — see the file doc comment (N6).
        console.error('[fakeNavigation] a subscriber threw during a fan-out round', error);
      }
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
      const token: SubscriberToken = { callback: subscriber };
      live.add(token);
      return () => live.delete(token);
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
