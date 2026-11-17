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
 *
 * When the bootstrap has settled and the address names no screen, the first
 * item of the menu is opened in the address's place (`defaultScreen.ts`), with
 * the `replace` history intent, so the visit gains no history entry. A deep
 * link always wins over it.
 */

import { useEffect, useRef, useState, type ComponentType } from 'react';
import {
  useFrontX,
  ExtensionDomainSlot,
  screenDomain,
  FRONTX_ACTION_MOUNT_EXT,
  FRONTX_SCREEN_DOMAIN,
} from '@gears-frontx/react';
import { bootstrapOnce } from './bootstrapOnce';
import { registerScreenDomain } from './screenDomain';
import { useLoadFailedText, type LoadFailedProps } from './loadFailedText';
import { screenLoadFailure, useScreenLoadFailure } from './screenLoadFailure';
import { addressScreenEntry, firstScreenId, type RegistryScreenExtension } from './defaultScreen';
import { screenState } from './screenState';
import styles from './MfeScreenContainer.module.css';

/**
 * The error state without a UI kit, for projects created without one. The
 * page's one level-one heading is the header's, so the title is level two.
 */
function PlainLoadFailed({ onRetry }: LoadFailedProps) {
  const text = useLoadFailedText();
  return (
    <div role="alert">
      <h2>{text.title}</h2>
      <p>{text.description}</p>
      <button type="button" onClick={onRetry}>
        {text.retry}
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
  // Whether the address named a screen when the bootstrap settled. Read at the
  // settle, before the flip below renders the slot: once the slot starts the
  // routed domain, the router's page-load step has already cleared every entry
  // from the address, so this is the last moment a deep link can still be seen
  // in it. The default screen defers to what was recorded here.
  const addressNamedScreen = useRef(false);

  useEffect(() => {
    let cancelled = false;
    bootstrapOnce(app, [registerScreenDomain])
      .then(() => {
        if (cancelled) return;
        addressNamedScreen.current = addressScreenEntry() !== undefined;
        setBootstrapped(true);
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

  // The default screen. Runs once the bootstrap has settled and the slot is
  // rendered, so the screen domain is started and the mount writes the address
  // itself. An address that named no screen has opened nothing at this point:
  // mount the menu's first screen, with the `replace` history intent, so the
  // visit gains no history entry and the address reads as if that screen had
  // been opened all along. A deep link recorded at the settle wins over it,
  // and so does a screen that is already mounted or arriving. No screens
  // registered means there is nothing to select and nothing is sent; a failed
  // bootstrap never reaches this effect, since `bootstrapped` stays down.
  useEffect(() => {
    if (!bootstrapped) return;
    if (addressNamedScreen.current) return;
    if (screenState.getSnapshot() !== undefined) return;
    const registry = app.mfeRegistry;
    if (!registry) return;
    const first = firstScreenId(
      registry.getExtensionsForDomain(FRONTX_SCREEN_DOMAIN) as RegistryScreenExtension[],
    );
    if (!first) return;
    registry.executeActionsChain({
      action: {
        type: FRONTX_ACTION_MOUNT_EXT,
        target: FRONTX_SCREEN_DOMAIN,
        payload: { subject: first, history: 'replace' },
      },
    });
  }, [app, bootstrapped]);

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
    <div className={styles.container} data-mfe-screen-container>
      {retryFailed ? <LoadFailed onRetry={retryFailed} /> : null}
      {bootstrapped && app.mfeRegistry ? (
        <ExtensionDomainSlot
          registry={app.mfeRegistry}
          domainId={screenDomain.id}
          className={styles.slot}
        />
      ) : null}
    </div>
  );
}
