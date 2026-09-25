import type { HistorySubscriber, Location, NavigationHistory } from '@gears-frontx/routing';

/**
 * A minimal `NavigationHistory` test double for `DomainRouting` — no
 * dependency on the real substrate's window/browser adapter. Round dispatch
 * mirrors the substrate's own `FanOutDispatcher`: a navigation a subscriber
 * makes from inside its own callback is queued and dispatched as a later
 * round, once the round in progress finishes, rather than interleaved with
 * it (see `../domain-routing.ts`'s own opening-window logic, which relies on
 * exactly this ordering).
 */
export interface FakeNavigation extends NavigationHistory {
  readonly writes: Array<{ kind: 'push' | 'replace'; path: string }>;
  /** An external navigation (back/forward, a deep link) — never a write this test double itself attributes to `push`/`replace`. */
  set(path: string): void;
}

export function fakeNavigation(initial = '/'): FakeNavigation {
  let path = initial;
  let position = 0;
  const subscribers = new Set<HistorySubscriber>();
  const writes: Array<{ kind: 'push' | 'replace'; path: string }> = [];
  const location = (): Location => {
    const url = new URL(path, 'http://shell.test');
    return { path: url.pathname, search: url.search.replace(/^\?/, ''), hash: url.hash.replace(/^#/, ''), position };
  };
  const pending: Array<'push' | 'replace' | 'history'> = [];
  let dispatching = false;
  const notify = (kind: 'push' | 'replace' | 'history') => {
    pending.push(kind);
    if (dispatching) return;
    dispatching = true;
    try {
      while (pending.length > 0) {
        const next = pending.shift()!;
        for (const s of [...subscribers]) s({ location: location(), kind: next });
      }
    } finally {
      dispatching = false;
    }
  };
  return {
    get location() {
      return location();
    },
    writes,
    subscribe(s) {
      subscribers.add(s);
      return () => subscribers.delete(s);
    },
    push(p) {
      path = p;
      position += 1;
      writes.push({ kind: 'push', path: p });
      notify('push');
    },
    replace(p) {
      path = p;
      writes.push({ kind: 'replace', path: p });
      notify('replace');
    },
    go() {
      throw new Error('go is not used by DomainRouting');
    },
    set(p) {
      path = p;
      notify('history');
    },
  };
}
