/**
 * The screen the shell's own screen domain implementation has mounted.
 * `ScreenDomainImpl` (bootstrap.ts) sets and clears it from the screen
 * domain's container hooks; the menu reads it.
 */
type Listener = () => void;

let current: string | undefined;
const listeners = new Set<Listener>();

export const screenState = {
  getSnapshot(): string | undefined {
    return current;
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  set(id: string | undefined): void {
    current = id;
    for (const listener of [...listeners]) listener();
  },
};
