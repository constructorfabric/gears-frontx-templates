// @cpt-flow:cpt-frontx-flow-request-lifecycle-query-client-lifecycle:p2

/**
 * MFE Screen Container Component
 *
 * Implements the screen domain: on first mount it starts the MFE bootstrap
 * with the screen domain's registration (`screenDomain.ts`), so the domain and
 * its types are registered before the manifests are walked, then renders the
 * per-domain `<ExtensionDomainSlot>` for the screen domain. A shell that
 * renders no screen container has no screen domain. The registry starts
 * and stops the routed screen domain when the slot attaches and detaches its
 * root — this container builds no routing wiring of its own. Mount/unmount
 * actions are
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
  ExtensionDomainSlot,
  screenDomain,
  FRONTX_ACTION_MOUNT_EXT,
  FRONTX_SCREEN_DOMAIN,
} from '@gears-frontx/react';
import { bootstrapOnce } from './bootstrapOnce';
import { registerScreenDomain } from './screenDomain';
import { LOAD_FAILED_TEXT, type LoadFailedProps } from './loadFailedText';
import { screenLoadFailure, useScreenLoadFailure } from './screenLoadFailure';

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

  useEffect(() => {
    let cancelled = false;
    bootstrapOnce(app, [registerScreenDomain])
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

  // A history step (back, forward) leaves the failed navigation behind, so its
  // error state and Retry go with it, and so does the report of a mount still
  // loading for it; whatever the new address names mounts and reports on its
  // own.
  useEffect(() => {
    // In the capture phase, so the new visit starts before the router's own
    // `popstate` listener (bubble phase) mounts whatever the new address names.
    const leave = () => screenLoadFailure.leave();
    window.addEventListener('popstate', leave, { capture: true });
    return () => window.removeEventListener('popstate', leave, { capture: true });
  }, []);

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

  // One error state at a time: a failed bootstrap wins, since no screen can
  // mount without it.
  let retryFailed: (() => void) | undefined;
  if (bootstrapFailed) retryFailed = () => window.location.reload();
  else if (loadFailure) retryFailed = retryScreen;

  return (
    <div className="flex-1 overflow-auto" data-mfe-screen-container>
      {retryFailed ? <LoadFailed onRetry={retryFailed} /> : null}
      {bootstrapped && app.mfeRegistry ? (
        <ExtensionDomainSlot
          registry={app.mfeRegistry}
          domainId={screenDomain.id}
          className="h-full"
        />
      ) : null}
    </div>
  );
}
