import { vi } from 'vitest';

/**
 * A media-query engine that matches exactly the queries a test names, for
 * the layouts the default stub in `vitest.setup.ts` (nothing matches, the
 * desktop layout) never reaches. Pass the breakpoint constants the screens
 * read (`COMPACT_QUERY`, `SINGLE_PANE_QUERY`) rather than their text.
 * `vitest.setup.ts` restores the default after each test.
 */
export function stubMatchMedia(matching: readonly string[]): void {
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    matches: matching.includes(query),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }));
}
