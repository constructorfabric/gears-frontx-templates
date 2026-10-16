/**
 * The screen the screen domain last failed to mount, while the latest mount
 * failed: a screen whose files do not load (missing or unreachable) or whose
 * lifecycle throws. The screen domain's mount handler (`bootstrap.ts`) reports
 * and clears it; `MfeScreenContainer` reads it and shows an error state with a
 * Retry in place of the screen.
 */
import { useSyncExternalStore } from 'react';

/** The history intent a `mount_ext` action carries; an action without one pushes. */
export type MountHistoryIntent = 'push' | 'replace' | 'none';

export interface ScreenLoadFailure {
  /** The screen extension the failed action named. */
  readonly extensionId: string;
  /**
   * The history intent of the failed action, so Retry repeats the navigation
   * the user made: a menu click pushes, a mount the address drove writes
   * nothing, a replacing navigation replaces.
   */
  readonly history: MountHistoryIntent;
}

type Listener = () => void;

/** The history intent a `mount_ext` payload carries, read the way the router reads it: absent means push. */
export function readHistoryIntent(payload: Record<string, unknown> | undefined): MountHistoryIntent {
  const history = payload?.history;
  return history === 'replace' || history === 'none' ? history : 'push';
}

function createScreenLoadFailureStore() {
  let failure: ScreenLoadFailure | undefined;
  const listeners = new Set<Listener>();
  const set = (next: ScreenLoadFailure | undefined) => {
    failure = next;
    for (const listener of listeners) listener();
  };
  return {
    current: (): ScreenLoadFailure | undefined => failure,
    report: (extensionId: string, history: MountHistoryIntent): void => set({ extensionId, history }),
    clear: (): void => {
      if (failure !== undefined) set(undefined);
    },
    subscribe: (listener: Listener): (() => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** One per page, like the bootstrap it belongs to (`bootstrapOnce.ts`). */
export const screenLoadFailure = createScreenLoadFailureStore();

/** The current screen load failure, re-rendering on every change. */
export function useScreenLoadFailure(): ScreenLoadFailure | undefined {
  return useSyncExternalStore(screenLoadFailure.subscribe, screenLoadFailure.current);
}
