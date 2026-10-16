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
 *
 * A screen that fails to load or mount (`screenLoadFailure`, reported by the
 * screen domain's mount handler) and a failed bootstrap (the manifest aggregate
 * unreachable) show the `LoadFailed` error state instead of an empty page. Its
 * Retry mounts the failed screen again with the failed action's own history
 * intent, so a failed menu click still adds its entry and a mount the address
 * drove writes nothing. A failed bootstrap is not safe to repeat in the same
 * page (`bootstrapOnce.ts`), so its Retry reloads the page.
 */

import { useEffect, useState, type ComponentType } from 'react';
import {
  useFrontX,
  useMountedExtensions,
  useDomainRouteStatus,
  ExtensionDomainSlot,
  screenDomain,
  FRONTX_ACTION_MOUNT_EXT,
  FRONTX_SCREEN_DOMAIN,
} from '@gears-frontx/react';
import { bootstrapOnce } from './bootstrapOnce';
import { screenLoadFailure, useScreenLoadFailure } from './screenLoadFailure';

export interface LoadFailedProps {
  onRetry: () => void;
}

/** The words of the error state, shared by every rendering of it. */
export const LOAD_FAILED_TEXT = {
  title: 'This screen could not be loaded',
  description: 'Check the connection and try again.',
  retry: 'Retry',
} as const;

/**
 * The error state without a UI kit, for projects created without one. The
 * page's one level-one heading is the header's, so the title is level two.
 */
function PlainLoadFailed({ onRetry }: LoadFailedProps) {
  return (
    <div role="alert">
      <h2>{LOAD_FAILED_TEXT.title}</h2>
      <p>{LOAD_FAILED_TEXT.description}</p>
      <button type="button" onClick={onRetry}>
        {LOAD_FAILED_TEXT.retry}
      </button>
    </div>
  );
}

export interface MfeScreenContainerProps {
  /** The error state a failed screen or bootstrap shows; `App.tsx` passes the UI Kit one (`ScreenLoadFailed`). */
  LoadFailed?: ComponentType<LoadFailedProps>;
}

export function MfeScreenContainer({ LoadFailed = PlainLoadFailed }: MfeScreenContainerProps = {}) {
  const app = useFrontX();
  const [bootstrapped, setBootstrapped] = useState(false);
  const [bootstrapFailed, setBootstrapFailed] = useState(false);
  const loadFailure = useScreenLoadFailure();
  const mountedScreens = useMountedExtensions(FRONTX_SCREEN_DOMAIN);
  const status = useDomainRouteStatus(bootstrapped ? app.mfeRegistry : undefined, FRONTX_SCREEN_DOMAIN);

  useEffect(() => {
    let cancelled = false;
    bootstrapOnce(app)
      .then(() => {
        if (!cancelled) setBootstrapped(true);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('[MFE Bootstrap] Failed to bootstrap MFE:', error);
        setBootstrapFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [app]);

  // Every URL entry for this domain failed to resolve to a mounted screen —
  // an unknown token in the address bar, not a moment mid-mount (which still
  // has zero entries or a resolved one already mounting).
  const unresolvedOnly = status.entries > 0 && status.unresolved === status.entries && mountedScreens.length === 0;

  const retryScreen = () => {
    if (!loadFailure) return;
    const { extensionId, history } = loadFailure;
    screenLoadFailure.clear();
    app.mfeRegistry?.executeActionsChain({
      action: {
        type: FRONTX_ACTION_MOUNT_EXT,
        target: FRONTX_SCREEN_DOMAIN,
        payload: { subject: extensionId, history },
      },
    });
  };

  return (
    <div className="flex-1 overflow-auto" data-mfe-screen-container>
      {bootstrapFailed ? <LoadFailed onRetry={() => window.location.reload()} /> : null}
      {loadFailure ? <LoadFailed onRetry={retryScreen} /> : null}
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
