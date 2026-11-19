// @cpt-flow:cpt-frontx-flow-request-lifecycle-query-client-lifecycle:p2

/**
 * MFE Screen Container Component
 *
 * Implements the screen domain: on first mount it starts the MFE bootstrap
 * with the registrations of the domains this shell implements (the screen
 * domain, `screenDomain.ts`, and the popup domain presented as a modal
 * extension domain, `modalDomain.ts`), so the domains and their types are
 * registered before the manifests are walked, then renders the per-domain
 * `<ExtensionDomainSlot>` for the screen domain and the dialog layer that
 * holds the popup domain's slot. A shell that renders no screen container has
 * neither domain. The registry starts and stops each routed domain when its
 * slot attaches and detaches its root - this container builds no routing
 * wiring of its own. Mount/unmount actions are
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

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ComponentType } from 'react';
import { createPortal } from 'react-dom';
import {
  useFrontX,
  ExtensionDomainSlot,
  screenDomain,
  popupDomain,
  FRONTX_ACTION_MOUNT_EXT,
  FRONTX_ACTION_UNMOUNT_EXT,
  FRONTX_SCREEN_DOMAIN,
  type MfeRegistry,
} from '@gears-frontx/react';
import { bootstrapOnce } from './bootstrapOnce';
import { registerScreenDomain } from './screenDomain';
import {
  modalState,
  registerModalDomain,
  type ModalExtensionPresentation,
  type RegistryModalExtension,
} from './modalDomain';
import { markModalSlotAttached, markModalSlotDetached } from './modalSlotAttached';
import { useShellWord } from '@/app/i18n/useShellWord';
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

/**
 * Reads a mounted modal's presentation off the registry. The derived modal
 * type (`modalDomain.ts`) requires `size` and `cancelable`, so an admitted
 * modal carries both; the layer's fallbacks (medium, not closable from the
 * UI) only keep it consistent if the registry cannot answer for the mounted
 * id.
 */
function readModalPresentation(registry: MfeRegistry, extensionId: string): ModalExtensionPresentation | undefined {
  const extensions = registry.getExtensionsForDomain(popupDomain.id) as RegistryModalExtension[];
  return extensions.find((candidate) => candidate.id === extensionId)?.presentation;
}

/**
 * The close button's words, from the shell namespace (`app/i18n/shell`): the
 * button is the shell's own chrome around the modal, not the modal
 * extension's, so it is translated with the rest of the shell's words and
 * carries the plain English word until that dictionary has loaded.
 */
const MODAL_CLOSE_KEY = 'shell:modal.close';
const MODAL_CLOSE_TEXT = 'Close';

/**
 * Whether Tab can actually stop at `element`: a non-negative `tabIndex`, not
 * disabled, not an `<input type="hidden">`, and rendered. Rendered is
 * `checkVisibility()` where the browser has it (which also catches
 * `visibility: hidden`), else a box on the page whose computed visibility is
 * neither `hidden` nor `collapse`: an element under `display: none` has no
 * client rects, and one that is `visibility: hidden` keeps its box.
 */
function isTabStop(element: HTMLElement): boolean {
  if (element.tabIndex < 0) return false;
  if ((element as HTMLElement & { disabled?: boolean }).disabled) return false;
  if (element instanceof HTMLInputElement && element.type === 'hidden') return false;
  if (typeof element.checkVisibility === 'function') {
    return element.checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true });
  }
  const visibility = getComputedStyle(element).visibility;
  if (visibility === 'hidden' || visibility === 'collapse') return false;
  return element.getClientRects().length > 0;
}

/**
 * The elements under `root` that Tab stops at, in document order, including
 * the ones inside open shadow roots: a host with a shadow root is walked
 * through that root. Subtrees under `hidden` or `inert` are skipped. Positive
 * `tabindex` values are taken in document order.
 */
function collectTabbable(root: Element): HTMLElement[] {
  const found: HTMLElement[] = [];
  const visit = (parent: Element | ShadowRoot) => {
    for (const child of Array.from(parent.children)) {
      if (child.hasAttribute('hidden') || child.hasAttribute('inert')) continue;
      if (child instanceof HTMLElement && isTabStop(child)) found.push(child);
      visit(child.shadowRoot ?? child);
    }
  };
  visit(root);
  return found;
}

/** The focused element, read through open shadow roots down to the innermost one. */
function deepActiveElement(): Element | null {
  let active = document.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  return active;
}

/** The node itself, or the shadow host in the document that contains it. */
function hostInDocument(node: Node): Node {
  let current = node;
  for (let root = current.getRootNode(); root instanceof ShadowRoot; root = current.getRootNode()) {
    current = root.host;
  }
  return current;
}

/**
 * The dialog layer of the popup domain: the presentation the shell puts
 * around the domain's slot (`modalDomain.ts`). It always renders the slot, so
 * the routed domain is started and can be mounted into whatever the layer
 * shows; what follows the mount is the layer itself. A mounted modal opens
 * the layer as a dialog (`role="dialog"`, `aria-modal`): presentation size
 * `full` covers the whole viewport, `medium` centres a panel over a backdrop
 * of the app behind it. A cancelable modal also renders a close button and
 * answers Escape, both by sending `unmount_ext` for the mounted extension; a
 * non-cancelable one renders neither. Focus that leaves the layer is brought
 * back into it, and Tab and Shift+Tab wrap between its first and last
 * controls, through the shadow root the modal renders into.
 *
 * The layer renders through a portal into `document.body`, not where the
 * component tree puts it: the tree mounts the container inside the layout's
 * content column, and that column is `inert` while the narrow menu overlays
 * it (`layout/Layout.tsx`), which would keep a modal that opens beside the
 * menu out of the accessibility tree, its panel off focus, and taps going
 * through to the menu. The body is inside the theme scope: the tokens the
 * layer paints with are declared on `:root` and `[data-theme]` (the kit's
 * `theme.css`, and the registry's own sheet at `:root:root`), so they inherit
 * into it, and every rule the layer's CSS module carries travels with the
 * classes. The focus handling is document-level, so it needs no change.
 */
function ModalExtensionLayer({ registry }: { registry: MfeRegistry }) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const mountedId = useSyncExternalStore(modalState.subscribe, modalState.getSnapshot);
  const presentation = mountedId ? readModalPresentation(registry, mountedId) : undefined;
  const open = mountedId !== undefined;
  const size = presentation?.size ?? 'medium';
  const cancelable = presentation?.cancelable ?? false;
  const closeLabel = useShellWord(MODAL_CLOSE_KEY, MODAL_CLOSE_TEXT);

  const unmountMountedModal = useCallback(() => {
    if (!mountedId) return;
    registry.executeActionsChain({
      action: {
        type: FRONTX_ACTION_UNMOUNT_EXT,
        target: popupDomain.id,
        payload: { subject: mountedId },
      },
    });
  }, [registry, mountedId]);

  // Escape closes a cancelable modal, with the same action a close button
  // sends. An Escape a control inside the modal has already handled and
  // prevented does not close it. A non-cancelable modal registers no listener
  // at all: Escape does nothing for it.
  useEffect(() => {
    if (!open || !cancelable) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) unmountMountedModal();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, cancelable, unmountMountedModal]);

  // The modal takes focus when it opens and keeps it: focus that lands
  // outside the layer is brought back to the panel, so keyboard focus cannot
  // reach the app the modal covers. On close, focus returns to where it was.
  useEffect(() => {
    if (!open) return;
    const layer = layerRef.current;
    const panel = panelRef.current;
    if (!layer || !panel) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.focus();
    const keepFocusInside = (event: FocusEvent) => {
      if (event.target instanceof Node && !layer.contains(event.target)) {
        panel.focus();
      }
    };
    // Tab and Shift+Tab wrap inside the layer. Without this, Tab past the last
    // control moves focus to the browser's own UI, which raises no `focusin`
    // in the document and so escapes the check above, and Shift+Tab from the
    // first control lands outside and is sent to the panel, not to the last
    // control. The modal renders inside a shadow root, so the controls are
    // collected through open shadow roots and the focused one is read through
    // them too.
    const wrapTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || event.defaultPrevented) return;
      const tabbable = collectTabbable(layer);
      const first = tabbable[0];
      const last = tabbable[tabbable.length - 1];
      const active = deepActiveElement();
      const inside = active instanceof Node && layer.contains(hostInDocument(active));
      if (!first || !last) {
        event.preventDefault();
        panel.focus();
      } else if (event.shiftKey && (!inside || active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!inside || active === last)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('focusin', keepFocusInside, true);
    document.addEventListener('keydown', wrapTab, true);
    return () => {
      document.removeEventListener('focusin', keepFocusInside, true);
      document.removeEventListener('keydown', wrapTab, true);
      // This passive cleanup runs after the commit that switched the layer to
      // `display: none`, and by then the browser may already have moved focus
      // to the body while fixing up the hidden panel. Focus still returns to
      // where it was in that case.
      const active = document.activeElement;
      if (!active || active === document.body || layer.contains(active)) {
        previous?.focus();
      }
    };
  }, [open]);

  const sizeClassName = size === 'full' ? styles.modalFull : styles.modalMedium;
  const layerClassName = [styles.modalLayer, open ? sizeClassName : styles.modalLayerClosed].join(' ');

  return createPortal(
    <div
      ref={layerRef}
      className={layerClassName}
      data-modal-layer=""
      data-modal-open={open ? 'true' : 'false'}
      role={open ? 'dialog' : undefined}
      aria-modal={open || undefined}
      aria-label={open ? presentation?.label : undefined}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={size === 'full' ? styles.modalPanelFull : styles.modalPanelMedium}
      >
        {open && cancelable ? (
          <button type="button" className={styles.modalClose} onClick={unmountMountedModal}>
            {closeLabel}
          </button>
        ) : null}
        {/* The slot reports its root to `modalSlotAttached`: a `mount_ext` into
            the popup domain sent before this attach fails with "no root
            attached for domain" (the sign-in chain's live walk, issue 112), so
            its senders wait for the signal instead. */}
        <ExtensionDomainSlot
          registry={registry}
          domainId={popupDomain.id}
          className={styles.modalSlot}
          onAttached={markModalSlotAttached}
          onDetached={markModalSlotDetached}
        />
      </div>
    </div>,
    // Outside the layout's content column, which the narrow menu makes inert
    // (the doc comment above); the body is inside the theme scope.
    document.body,
  );
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
    bootstrapOnce(app, [registerScreenDomain, registerModalDomain])
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
    <>
      <div className={styles.container} data-mfe-screen-container>
        {retryFailed ? (
          <div className={styles.errorState}>
            <LoadFailed onRetry={retryFailed} />
          </div>
        ) : null}
        {bootstrapped && app.mfeRegistry ? (
          <ExtensionDomainSlot
            registry={app.mfeRegistry}
            domainId={screenDomain.id}
            className={styles.slot}
          />
        ) : null}
      </div>
      {bootstrapped && app.mfeRegistry ? <ModalExtensionLayer registry={app.mfeRegistry} /> : null}
    </>
  );
}
