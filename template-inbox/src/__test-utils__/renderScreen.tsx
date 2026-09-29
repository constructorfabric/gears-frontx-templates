import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { within } from '@testing-library/dom';

/** Every screen mounted and not yet unmounted, for `cleanupScreens`. */
const mounted = new Set<() => void>();

/**
 * Mounts a screen and hands back queries scoped to its container.
 *
 * Deliberately a local mount rather than `@testing-library/react`'s `render`:
 * that package resolves React and React DOM from its own location, and the
 * screens here render against the copy the kit resolves (see
 * `vitest.config.ts`). Importing the renderer directly keeps every React in
 * the test on one instance. `@testing-library/dom` supplies the queries and
 * pulls in no renderer of its own.
 *
 * A test never has to unmount what it rendered: `vitest.setup.ts` calls
 * `cleanupScreens` after every test, failed or not. `unmount` stays available
 * for a test whose subject is what unmounting does.
 */
export function renderScreen(element: ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(element);
  });

  const unmount = () => {
    if (!mounted.delete(unmount)) return;
    act(() => {
      root.unmount();
    });
    container.remove();
  };
  mounted.add(unmount);

  return {
    container,
    ...within(container),
    rerender: (next: ReactNode) => {
      act(() => {
        root.render(next);
      });
    },
    unmount,
  };
}

/** Unmounts every screen still mounted. Called from `vitest.setup.ts` after each test. */
export function cleanupScreens(): void {
  for (const unmount of [...mounted]) unmount();
}
