import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { onResetStores } from './createStore';

/*
 * A route change asks for the new screen's heading to take focus, so a
 * keyboard or screen-reader user lands at the top of what just opened rather
 * than on the menu item they pressed. The request is a counter rather than
 * a callback because the heading may not exist yet - a screen shows its
 * loading state first - and whichever heading mounts or re-renders next
 * answers it once.
 */
let requested = 0;
let answered = 0;
const listeners = new Set<() => void>();

onResetStores(() => {
  requested = 0;
  answered = 0;
});

export const requestScreenHeadingFocus = (): void => {
  requested += 1;
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const readRequested = () => requested;

/** Whether the element lays out at least one box with a visible width. */
const rendersVisibleBox = (element: Element): boolean =>
  Array.from(element.getClientRects()).some((rect) => rect.width > 0);

export type ScreenHeadingProps = {
  children: ReactNode;
  className?: string;
};

/**
 * The one visible `h1` of a screen, in the place its pane header already puts
 * its title. A screen whose narrow layout hides the list pane renders a
 * second one in the pane that takes its place (the open thread, the mail
 * being read), so a visible `h1` exists in either layout. `tabIndex={-1}`
 * makes it focusable from script without adding it to the tab order.
 */
export function ScreenHeading({ children, className }: ScreenHeadingProps) {
  const ref = useRef<HTMLHeadingElement>(null);
  const request = useSyncExternalStore(subscribe, readRequested, readRequested);

  useEffect(() => {
    // A heading that renders no box - inside a hidden subtree (a screen
    // keeping its list mounted behind a detail page) or a pane a narrow
    // layout sets to `display: none` - leaves the request to the visible one.
    // So does one whose box is squeezed to zero width: it is laid out, but
    // nothing of it shows, and focus on it would land on nothing visible.
    if (request === answered || ref.current === null || !rendersVisibleBox(ref.current)) return;
    answered = request;
    ref.current.focus();
  }, [request]);

  return (
    <h1 ref={ref} className={className} tabIndex={-1}>
      {children}
    </h1>
  );
}
