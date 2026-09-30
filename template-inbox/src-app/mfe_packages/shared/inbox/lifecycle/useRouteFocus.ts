import { useEffect, useRef } from 'react';
import { requestScreenHeadingFocus } from '../ui/ScreenHeading';

/**
 * Moves focus to the screen heading whenever the page the screen shows
 * changes (the directory to a person's page and back), which is what a page
 * load would have done for a keyboard or screen-reader user in a multi-page
 * app. The first page the screen opens on moves nothing: the frame decides
 * that one (`InboxScreenFrame`).
 *
 * Keyed by what the screen renders from (the route params it passes down),
 * not by the router's pathname: the pathname can move a render before the
 * params the screen reads, and a request answered in that render lands on the
 * heading of the page being left, which is hidden a moment later and takes
 * focus with it. Called by a package's root route component.
 *
 * @param pageKey - Identifies the page shown, e.g. the open contact's id or `''` for the directory
 */
export function useRouteFocus(pageKey: string): void {
  const last = useRef(pageKey);

  useEffect(() => {
    if (pageKey === last.current) return;
    last.current = pageKey;
    requestScreenHeadingFocus();
  }, [pageKey]);
}
