/**
 * The attachment signal of the modal domain's slot.
 *
 * `MfeScreenContainer` renders the popup domain's `ExtensionDomainSlot` inside
 * its dialog layer, and the slot attaches the domain's DOM root to the mounter
 * only once it has rendered - a React commit that happens AFTER the bootstrap
 * that registers the domain has settled. A sender that dispatches `mount_ext`
 * into the popup domain inside that gap fails with "no root attached for
 * domain": the live walk of the sign-in chain (issue 112) lost exactly this
 * race, because its trigger sent the chain as soon as the bootstrap settled.
 *
 * The dialog layer resolves the signal from the slot's `onAttached` - the same
 * handoff the demo-mfe widgets host uses for its own routed domain - and the
 * sign-in triggers await it before they send the chain. A detach re-arms the
 * signal, so a sender never reads "attached" for a root that is gone; a detach
 * that arrives before any attach leaves the pending signal in place, so the
 * waiters already holding it still resolve on the next attach.
 */

let resolveAttached: (() => void) | undefined;
let attached = new Promise<void>((resolve) => {
  resolveAttached = resolve;
});
let isAttached = false;

/**
 * Resolves once the modal domain's slot root is attached, so `mount_ext` into
 * the popup domain has a root to mount into. Stays pending while no slot is
 * attached, and again after a detach until the next attach.
 */
export function modalSlotAttached(): Promise<void> {
  return attached;
}

/** The dialog layer calls this when the slot's `onAttached` reports the root. */
export function markModalSlotAttached(): void {
  isAttached = true;
  resolveAttached?.();
}

/**
 * The dialog layer calls this when the slot's `onDetached` reports the root is
 * gone: the signal re-arms, so the next sender waits for the next attach
 * instead of sending into a root that is no longer there.
 *
 * A detach with no attach since the last detach changes nothing. The signal is
 * already pending and the senders holding it are waiting for the next attach;
 * replacing the promise here would leave them waiting forever, and the sign-in
 * triggers hold it across the bootstrap, so the chain would never be sent.
 */
export function markModalSlotDetached(): void {
  if (!isAttached) return;
  isAttached = false;
  attached = new Promise<void>((resolve) => {
    resolveAttached = resolve;
  });
}
