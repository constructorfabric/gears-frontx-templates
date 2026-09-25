// @cpt-flow:cpt-frontx-flow-request-lifecycle-query-client-lifecycle:p2
// @cpt-FEATURE:route-ownership-signal:p1

/**
 * MFE Screen Container Component
 *
 * Bootstraps MFE domains and extensions on first mount, then renders the
 * per-domain `<ExtensionDomainSlot>` for the screen domain. The slot's
 * `onAttached` is discovery settling for the screen domain (D4): the root the
 * mounter needs is now attached, so this is where the four shell observers
 * start (`routing.start()`). Mount/unmount actions are dispatched by other
 * components (e.g., the menu) through `registry.executeActionsChain`.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  useFrontX,
  useMountedExtensions,
  ExtensionDomainSlot,
  screenDomain,
  FRONTX_SCREEN_DOMAIN,
} from '@gears-frontx/react';
import type { DomainRouting } from '@gears-frontx/frontx-template-shell';
import { bootstrapMFE } from './bootstrap';
import type { ShellRouting } from './shell-routing';

const NO_STATUS = { entries: 0, unresolved: 0 };
const noSubscribe = () => () => {};

/** Screen-domain URL status, kept in sync via `useSyncExternalStore` rather
 * than local state — `DomainRouting` is the source of truth and updates on
 * its own observer's schedule, not React's. */
function useRouteStatus(routing: DomainRouting | undefined) {
  return useSyncExternalStore(
    routing ? (callback) => routing.subscribeStatus(callback) : noSubscribe,
    () => routing?.getStatus() ?? NO_STATUS,
  );
}

export function MfeScreenContainer() {
  const app = useFrontX();
  const bootstrappedRef = useRef(false);
  const [routing, setRouting] = useState<ShellRouting | undefined>(undefined);
  const mountedScreens = useMountedExtensions(FRONTX_SCREEN_DOMAIN);
  const status = useRouteStatus(routing?.screen);

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    bootstrapMFE(app).then(setRouting).catch((error) => {
      console.error('[MFE Bootstrap] Failed to bootstrap MFE:', error);
    });
  }, [app]);

  // Every URL entry for this domain failed to resolve to a mounted screen —
  // an unknown token in the address bar, not a moment mid-mount (which still
  // has zero entries or a resolved one already mounting).
  const unresolvedOnly = status.entries > 0 && status.unresolved === status.entries && mountedScreens.length === 0;

  return (
    <div className="flex-1 overflow-auto" data-mfe-screen-container>
      {routing && app.mfeRegistry ? (
        <ExtensionDomainSlot
          registry={app.mfeRegistry}
          domainId={screenDomain.id}
          className="h-full"
          onAttached={() => routing.start()}
        />
      ) : null}
      {unresolvedOnly ? (
        <div data-testid="screen-route-fallback" role="status" className="p-6 text-sm text-muted-foreground">
          No screen matches this address.
        </div>
      ) : null}
    </div>
  );
}
