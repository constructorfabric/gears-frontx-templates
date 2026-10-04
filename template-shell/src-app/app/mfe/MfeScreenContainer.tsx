// @cpt-flow:cpt-frontx-flow-request-lifecycle-query-client-lifecycle:p2

/**
 * MFE Screen Container Component
 *
 * Bootstraps MFE domains and extensions on first mount, then renders the
 * per-domain `<ExtensionDomainSlot>` for the screen domain. `ExtensionDomainSlot`
 * itself starts/stops the screen domain's own URL observer from its own
 * attach/detach (ADR 0036, D10/D11) — this container builds no routing
 * wiring of its own; it only reads that domain's own status (via the
 * shell-scoped `useDomainRouteStatus` hook) to show a fallback when every
 * URL entry for this domain fails to resolve. Mount/unmount actions are
 * dispatched by other components (e.g., the menu) through
 * `registry.executeActionsChain`.
 */

import { useEffect, useState } from 'react';
import {
  useFrontX,
  useMountedExtensions,
  useDomainRouteStatus,
  ExtensionDomainSlot,
  screenDomain,
  FRONTX_SCREEN_DOMAIN,
} from '@gears-frontx/react';
import { bootstrapMFE } from './bootstrap';

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

export function MfeScreenContainer() {
  const app = useFrontX();
  const [bootstrapped, setBootstrapped] = useState(false);
  const mountedScreens = useMountedExtensions(FRONTX_SCREEN_DOMAIN);
  const status = useDomainRouteStatus(bootstrapped ? app.mfeRegistry : undefined, FRONTX_SCREEN_DOMAIN);

  useEffect(() => {
    if (!bootstrapPromise) {
      bootstrapPromise = bootstrapMFE(app);
    }
    let cancelled = false;
    bootstrapPromise
      .then(() => {
        if (!cancelled) setBootstrapped(true);
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
      {bootstrapped && app.mfeRegistry ? (
        <ExtensionDomainSlot
          registry={app.mfeRegistry}
          domainId={screenDomain.id}
          className="h-full"
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
