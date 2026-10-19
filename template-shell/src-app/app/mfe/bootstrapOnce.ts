import type { FrontXApp } from '@gears-frontx/react';
import { bootstrapMFE, type DomainRegistration } from './bootstrap';

/**
 * The in-flight/settled `bootstrapMFE` call, hoisted to module scope rather
 * than component-instance state (a ref or `useState`). A REAL remount - a
 * component unmounting and a later, distinct instance mounting, as opposed to
 * a re-render, which reuses the same instance - starts with fresh instance
 * state every time, so a guard living there would not see that bootstrap
 * already ran and would re-invoke `bootstrapMFE`, re-registering every domain
 * and extension a second time on the same `mfeRegistry`.
 *
 * Deliberately never cleared on rejection: a `bootstrapMFE` failure can
 * leave some domains/extensions registered and others not (it is not
 * transactional), so retrying from that partial state would not be a safe
 * repeat of the first attempt - there is no isolated "nothing happened yet"
 * state to roll back to.
 *
 * Also never keyed on `app`: a change of `app` across a re-render still
 * resolves against whatever registry the first call bootstrapped.
 */
let bootstrapPromise: Promise<void> | undefined;

let resolveSettled!: () => void;
let rejectSettled!: (error: unknown) => void;

/** Settles with the bootstrap, whoever starts it and whenever. */
const settled = new Promise<void>((resolve, reject) => {
  resolveSettled = resolve;
  rejectSettled = reject;
});
// A reader that is never rendered must not turn a failed bootstrap into an
// unhandled rejection; every reader still sees the failure.
settled.catch(() => {});

/**
 * Starts the bootstrap once per page with the domains its caller implements.
 * The screen container is the caller: the screen domain exists because the
 * container is rendered.
 */
export function bootstrapOnce(app: FrontXApp, domains: readonly DomainRegistration[]): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = bootstrapMFE(app, domains);
    bootstrapPromise.then(resolveSettled, rejectSettled);
  }
  return bootstrapPromise;
}

/**
 * The bootstrap's outcome, for a reader that does not start it (the menu). It
 * stays pending while nothing has started the bootstrap, so a shell without a
 * screen container never settles it.
 */
export function bootstrapSettled(): Promise<void> {
  return settled;
}
