import { createElement, useSyncExternalStore, type ReactNode } from 'react';
import { ScreenLayoutContext, type ScreenLayout } from '../ui/screenLayout';

export type ScreenLayoutStub = {
  /** Pass as `render`'s `wrapper`: it provides the layout a frame of that width would. */
  wrapper: (props: { children: ReactNode }) => ReactNode;
  /** Changes the layout, as a frame crossing a breakpoint does. */
  setLayout: (layout: ScreenLayout) => void;
};

/**
 * The layout a screen rendered alone reads, for the narrow layouts a test
 * without a frame (always `wide`) never reaches. A screen reads its layout
 * from the frame's measured width; jsdom lays nothing out, so the suite
 * names the layout instead. Wrap the `setLayout` call in `act`.
 */
export function stubScreenLayout(initial: ScreenLayout): ScreenLayoutStub {
  let layout = initial;
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const read = () => layout;

  function ScreenLayoutWrapper({ children }: { children: ReactNode }) {
    const value = useSyncExternalStore(subscribe, read, read);
    return createElement(ScreenLayoutContext.Provider, { value }, children);
  }

  return {
    wrapper: ScreenLayoutWrapper,
    setLayout: (next) => {
      layout = next;
      for (const listener of listeners) listener();
    },
  };
}
