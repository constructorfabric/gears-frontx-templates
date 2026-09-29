import { vi } from 'vitest';

export type MatchMediaStub = {
  /** Changes which queries match, and fires `change` on every list whose answer changed. */
  setMatching: (matching: readonly string[]) => void;
};

/**
 * A media-query engine that matches exactly the queries a test names, for
 * the layouts the default stub in `vitest.setup.ts` (nothing matches, the
 * desktop layout) never reaches. Pass the query constants the app reads
 * (`COMPACT_QUERY`, `SINGLE_PANE_QUERY`, `DARK_SCHEME_QUERY`) rather than
 * their text. Unlike the default stub its lists deliver `change`, so a test
 * can cross a breakpoint or switch the system scheme after the first render.
 * `vitest.setup.ts` restores the default after each test.
 */
export function stubMatchMedia(initial: readonly string[]): MatchMediaStub {
  let matching = new Set(initial);
  const lists: { query: string; matched: boolean; listeners: Set<(event: MediaQueryListEvent) => void> }[] = [];

  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => {
    const entry = { query, matched: matching.has(query), listeners: new Set<(event: MediaQueryListEvent) => void>() };
    lists.push(entry);
    const list: MediaQueryList = {
      get matches() {
        return matching.has(query);
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === 'function') entry.listeners.add(listener);
      },
      removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === 'function') entry.listeners.delete(listener);
      },
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    };
    return list;
  });

  return {
    setMatching: (next) => {
      matching = new Set(next);
      for (const entry of lists) {
        const matched = matching.has(entry.query);
        if (matched === entry.matched) continue;
        entry.matched = matched;
        const event = new Event('change') as MediaQueryListEvent;
        for (const listener of entry.listeners) listener(event);
      }
    },
  };
}
