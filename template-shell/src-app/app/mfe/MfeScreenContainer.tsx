// @cpt-flow:cpt-frontx-flow-request-lifecycle-query-client-lifecycle:p2

/**
 * MFE Screen Container Component
 *
 * Bootstraps MFE domains and extensions on first mount, then renders the
 * per-domain `<ExtensionDomainSlot>` for the screen domain. The slot's
 * `onAttached` is discovery settling for the screen domain (D4): the root the
 * mounter needs is now attached, so this is where the four shell observers
 * start (`routing.start()`). `onDetached` is the pair of that: the slot's own
 * root has gone away (this container itself unmounting, not one mounted
 * screen), so the four observers are released (`routing.stop()`) rather than
 * left subscribed to history with nothing left to mount into. Mount/unmount
 * actions are dispatched by other components (e.g., the menu) through
 * `registry.executeActionsChain`.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import {
  useFrontX,
  useMountedExtensions,
  ExtensionDomainSlot,
  screenDomain,
  FRONTX_SCREEN_DOMAIN,
} from '@gears-frontx/react';
import type { DomainRouting } from '@gears-frontx/react';
import { bootstrapMFE } from './bootstrap';
import type { ShellRouting } from './shell-routing';

const NO_STATUS = { entries: 0, unresolved: 0 };
const noSubscribe = () => () => {};

/**
 * The in-flight/settled `bootstrapMFE` call, hoisted to module scope rather
 * than component-instance state (a ref or `useState`). A REAL remount — this
 * component unmounting and a later, distinct instance mounting, as opposed to
 * a re-render, which reuses the same instance — starts with fresh instance
 * state every time, so a guard living there would not see that bootstrap
 * already ran and would re-invoke `bootstrapMFE`, re-registering every domain
 * and extension a second time on the same `mfeRegistry`. Reusing this
 * module-scoped promise means a second mount observes the same bootstrap
 * outcome instead of triggering a second one.
 *
 * Deliberately never cleared on rejection: a `bootstrapMFE` failure can
 * leave some domains/extensions registered and others not (it is not
 * transactional), so retrying from that partial state would not be a safe
 * repeat of the first attempt — there is no isolated "nothing happened yet"
 * state to roll back to. The effect below still logs the rejection every
 * time it re-runs against this same promise, but it never re-invokes
 * `bootstrapMFE`.
 *
 * Also never keyed on `app`: the effect below only checks whether this
 * promise already exists, not which `app` it was created for, so a change
 * of `app` across a re-render (as opposed to a real remount) still
 * resolves against whatever registry the first call bootstrapped.
 */
let bootstrapPromise: ReturnType<typeof bootstrapMFE> | undefined;

/** Screen-domain URL status, kept in sync via `useSyncExternalStore` rather
 * than local state — `DomainRouting` is the source of truth and updates on
 * its own observer's schedule, not React's. */
function useRouteStatus(routing: DomainRouting | undefined) {
  // Memoized on `routing` alone: `useSyncExternalStore` resubscribes
  // whenever the function identity it's passed changes, so an inline
  // arrow recreated on every render would tear down and rebuild the
  // subscription every render for no reason (C4).
  const subscribe = useCallback(
    (callback: () => void) => (routing ? routing.subscribeStatus(callback) : noSubscribe()),
    [routing],
  );
  return useSyncExternalStore(subscribe, () => routing?.getStatus() ?? NO_STATUS);
}

export function MfeScreenContainer() {
  const app = useFrontX();
  const [routing, setRouting] = useState<ShellRouting | undefined>(undefined);
  const mountedScreens = useMountedExtensions(FRONTX_SCREEN_DOMAIN);
  const status = useRouteStatus(routing?.screen);

  useEffect(() => {
    if (!bootstrapPromise) {
      bootstrapPromise = bootstrapMFE(app);
    }
    let cancelled = false;
    bootstrapPromise
      .then((result) => {
        if (!cancelled) setRouting(result);
      })
      .catch((error) => {
        if (!cancelled) console.error('[MFE Bootstrap] Failed to bootstrap MFE:', error);
      });
    return () => {
      cancelled = true;
    };
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
          onDetached={() => routing.stop()}
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
