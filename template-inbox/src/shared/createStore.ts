import { useSyncExternalStore } from 'react';

/**
 * A small external store: state that lives outside any component, so a
 * screen can unmount (a route change, "View contact" and Back) and find it
 * where it left it when it mounts again.
 *
 * Components read it through `useStore` with a selector, and re-render only
 * when the slice they selected changes - which is what lets a composer keep
 * its draft here without every keystroke re-rendering the list, the sidebar
 * and the details panel. A selector must return a value already in the
 * state (or a primitive), never a new object, or every change would look
 * like a change to it.
 */
export type Store<State> = {
  get: () => State;
  update: (next: (current: State) => State) => void;
  subscribe: (listener: () => void) => () => void;
  /** Back to the initial state. */
  reset: () => void;
};

const resettables = new Set<{ reset: () => void }>();

/**
 * Registers module-level state that is not a store (a counter, a cache) to
 * be put back together with the stores, so `resetStores` leaves nothing a
 * previous test changed.
 */
export const onResetStores = (reset: () => void): void => {
  resettables.add({ reset });
};

export function createStore<State>(initial: () => State): Store<State> {
  let state = initial();
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const store: Store<State> = {
    get: () => state,
    update: (next) => {
      const updated = next(state);
      if (updated === state) return;
      state = updated;
      notify();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reset: () => {
      state = initial();
      notify();
    },
  };
  resettables.add(store);
  return store;
}

export function useStore<State, Slice>(store: Store<State>, select: (state: State) => Slice): Slice {
  const read = () => select(store.get());
  return useSyncExternalStore(store.subscribe, read, read);
}

/** Puts every store, and every state registered with `onResetStores`, back to its initial state. For tests, between cases. */
export const resetStores = (): void => {
  for (const resettable of resettables) resettable.reset();
};
