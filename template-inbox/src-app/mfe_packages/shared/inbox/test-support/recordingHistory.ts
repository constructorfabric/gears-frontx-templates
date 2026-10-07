import type { Location, NavigationHistory } from '@gears-frontx/routing';

/**
 * A `NavigationHistory` that records every push and answers `location` from
 * the last write, the part of template-shell's `fakeNavigation`
 * (`src-app/app/mfe/__tests__/fake-navigation.ts`) `openScreen` touches: it
 * reads the location and pushes once, and subscribes to nothing.
 */
export function recordingHistory(initial: string): NavigationHistory & { writes: string[] } {
  let path = initial;
  const writes: string[] = [];
  const location = (): Location => {
    const url = new URL(path, 'http://shell.test');
    return { path: url.pathname, search: url.search.replace(/^\?/, ''), hash: url.hash.replace(/^#/, ''), position: writes.length };
  };
  return {
    writes,
    get location() {
      return location();
    },
    subscribe: () => () => undefined,
    push: (next) => {
      writes.push(next);
      path = next;
    },
    replace: (next) => {
      path = next;
    },
    go: () => undefined,
  };
}
