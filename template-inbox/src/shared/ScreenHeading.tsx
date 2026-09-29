import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';

/*
 * A route change asks for the new screen's heading to take focus, so a
 * keyboard or screen-reader user lands at the top of what just opened rather
 * than on the rail button they pressed. The request is a counter rather than
 * a callback because the heading may not exist yet - a screen shows its
 * loading state first - and whichever heading mounts or re-renders next
 * answers it once.
 */
let requested = 0;
let answered = 0;
const listeners = new Set<() => void>();

export const requestScreenHeadingFocus = (): void => {
  requested += 1;
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const readRequested = () => requested;

export type ScreenHeadingProps = {
  children: ReactNode;
  className?: string;
};

/**
 * The one `h1` a screen renders, in the place its pane header already puts
 * its title. `tabIndex={-1}` makes it focusable from script without adding it
 * to the tab order.
 */
export function ScreenHeading({ children, className }: ScreenHeadingProps) {
  const ref = useRef<HTMLHeadingElement>(null);
  const request = useSyncExternalStore(subscribe, readRequested, readRequested);

  useEffect(() => {
    if (request === answered) return;
    answered = request;
    ref.current?.focus();
  }, [request]);

  return (
    <h1 ref={ref} className={className} tabIndex={-1}>
      {children}
    </h1>
  );
}
