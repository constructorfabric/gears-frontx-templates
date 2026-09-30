import { useEffect, useRef } from 'react';
import { useRouterState } from '@gears-frontx/routing-tanstack';
import { requestScreenHeadingFocus } from '../ui/ScreenHeading';

/**
 * Moves focus to the screen heading whenever the screen's own route changes
 * (the directory to a person's page and back), which is what a page load
 * would have done for a keyboard or screen-reader user in a multi-page app.
 * The first route the screen opens on moves nothing: the frame decides that
 * one (`InboxScreenFrame`). Called by a package's root route component.
 */
export function useRouteFocus(): void {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const last = useRef(pathname);

  useEffect(() => {
    if (pathname === last.current) return;
    last.current = pathname;
    requestScreenHeadingFocus();
  }, [pathname]);
}
